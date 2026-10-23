"""The Vocab page's "Add words" (web/js/components/wordbuilder.js) on the computer: many cards saved at
once (POST /api/vocab/batch) and a card's own recording kept as its voice (PUT /api/vocab/<id>/recording),
which plays, syncs and goes into the Anki export like a voice made by Azure. The page's side is
tests/js/addwords.test.mjs and tests/js/cardaudio.test.mjs."""

from __future__ import annotations

import io
import json
import wave

import numpy as np
import pytest

from app import db, voices
from app.sync import engine


@pytest.fixture()
def client(fresh_db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    kicks: list[int] = []
    monkeypatch.setattr(voices.worker, "kick", lambda: kicks.append(1))
    with TestClient(create_app(start_worker=False)) as c:
        db.set_settings({"study_language": "es", "learning_languages": ["es", "ar"], "welcome_seen": True})
        c.kicks = kicks  # type: ignore[attr-defined]
        yield c


def _wav(seconds: float = 1.5, rate: int = 24000) -> bytes:
    """A WAV file of a tone, as the page writes one where it can't make Ogg Opus (web/js/cardaudio.js)."""
    t = np.arange(int(rate * seconds)) / rate
    pcm = (np.sin(2 * np.pi * 220 * t) * 9000).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def test_many_cards_at_once_in_the_order_typed(client):
    folder = client.post("/api/vocab/folders", json={"name": "Kitchen"}).json()
    r = client.post("/api/vocab/batch", json={"cards": [
        {"text": " mesa ", "meaning": "table", "sentence": "La mesa es grande.", "translation": "The ⟦table⟧ is big.",
         "notes": "f.", "folders": [folder["uid"], "dnot-a-folder"]},
        {"text": "silla", "meaning": "chair"},
        {"text": "   "},
        {"text": "كتاب", "meaning": "book"},
    ]})
    assert r.status_code == 200, r.text
    cards = r.json()["cards"]
    assert [c["text"] for c in cards] == ["mesa", "silla", "كتاب"], "empty rows are left out, the rest kept in order"
    assert cards[0]["folders"] == [folder["uid"]], "only folders that exist"
    assert cards[0]["translation"] == "The ⟦table⟧ is big." and cards[0]["notes"] == "f."
    assert cards[0]["created_at"] > cards[1]["created_at"] > cards[2]["created_at"], "the first typed is the newest"
    assert [c["language"] for c in cards] == ["es", "es", "ar"], "each in the language its letters say"
    assert all(c["uid"] and c["voice"] == "" and c["episode_id"] is None for c in cards)
    listed = [v["text"] for v in client.get("/api/vocab").json()]
    assert listed[:2] == ["mesa", "silla"], "at the top of the list (newest first), in the order typed"
    assert client.kicks == [1], "My computer's voice maker is told once"  # type: ignore[attr-defined]


def test_a_batch_has_limits(client):
    assert client.post("/api/vocab/batch", json={"cards": [{"text": " "}]}).status_code == 400
    too_many = client.post("/api/vocab/batch", json={"cards": [{"text": f"w{i}"} for i in range(101)]})
    assert too_many.status_code == 400 and "100" in too_many.json()["detail"]
    assert client.post("/api/vocab/batch", json={"cards": [{"text": f"w{i}"} for i in range(100)]}).status_code == 200


def test_a_recording_is_kept_once_as_the_cards_voice(client):
    card = client.post("/api/vocab/batch", json={"cards": [{"text": "cartera", "sentence": "Perdí mi cartera."}]}).json()["cards"][0]
    r = client.put(f"/api/vocab/{card['id']}/recording?start=0.05&end=1.0&sent_start=1.7&sent_end=3.2", content=_wav(3.5))
    assert r.status_code == 200, r.text
    assert json.loads(r.json()["voice"]) == {"start": 0.05, "end": 1.0, "sent_start": 1.7, "sent_end": 3.2}
    kept = engine.clip_path(card["uid"]).read_bytes()
    assert kept[:4] == b"OggS" and b"OpusHead" in kept[:80], "a WAV file is made into Ogg Opus"
    assert len(kept) < len(_wav(3.5)) / 4, "and is much smaller"
    second = client.put(f"/api/vocab/{card['id']}/recording?start=0&end=1", content=_wav(1)).json()
    assert json.loads(second["voice"])["start"] == 0.05, "a second one is refused, as for a voice"
    got = client.get(f"/api/vocab/{card['id']}/clip")
    assert got.status_code == 200 and got.headers["content-type"].startswith("audio/ogg")
    # It goes to a friend and into the Anki deck like any card's voice.
    shared = client.get(f"/api/vocab/{card['id']}/share-clip").json()
    assert shared["times"]["sent_start"] == 1.7
    from app.api.vocab import _anki_clips

    with db.session() as conn:
        row = dict(conn.execute("SELECT * FROM vocab WHERE id = ?", (card["id"],)).fetchone())
    assert set(_anki_clips([row])[row["uid"]]) == {"word", "sentence"}


def test_ogg_opus_is_kept_as_it_is_and_nonsense_refused(client):
    a, b, c = client.post("/api/vocab/batch", json={"cards": [{"text": "a"}, {"text": "b"}, {"text": "c"}]}).json()["cards"]
    from app import audio

    ogg = audio.encode_pcm_opus((np.sin(np.arange(24000) / 8) * 9000).astype(np.int16), 24000)
    assert client.put(f"/api/vocab/{a['id']}/recording?start=0.05&end=0.9", content=ogg).status_code == 200
    assert engine.clip_path(a["uid"]).read_bytes() == ogg
    bad = client.put(f"/api/vocab/{b['id']}/recording?start=0&end=1", content=b"this is not sound" * 20)
    assert bad.status_code == 400 and "couldn't be read" in bad.json()["detail"]
    assert client.put(f"/api/vocab/{b['id']}/recording?start=2&end=1", content=_wav()).status_code == 400, "times that don't fit"
    assert client.put(f"/api/vocab/{b['id']}/recording?start=0&end=1&sent_start=1.5", content=_wav()).status_code == 400
    assert client.put(f"/api/vocab/{c['id']}/recording?start=0&end=1", content=b"").status_code == 400
    with db.session() as conn:
        assert conn.execute("SELECT voice FROM vocab WHERE id = ?", (b["id"],)).fetchone()["voice"] == ""


def test_a_wav_recording_from_a_phone_plays_as_wav(client):
    """A phone that can't make Ogg Opus keeps the recording as WAV; it reaches the computer by sync as
    c_<uid>.ogg like every card voice. It is played (and put in the Anki deck) as what it is."""
    card = client.post("/api/vocab/batch", json={"cards": [{"text": "mesa", "sentence": "La mesa."}]}).json()["cards"][0]
    engine.clip_path(card["uid"]).write_bytes(_wav(3))
    with db.session() as conn:
        conn.execute("UPDATE vocab SET voice = ? WHERE id = ?",
                     (json.dumps({"start": 0.05, "end": 1.0, "sent_start": 1.6, "sent_end": 2.9}), card["id"]))
    got = client.get(f"/api/vocab/{card['id']}/clip")
    assert got.status_code == 200 and got.headers["content-type"].startswith("audio/wav")
    from app.api.vocab import _anki_clips

    with db.session() as conn:
        row = dict(conn.execute("SELECT * FROM vocab WHERE id = ?", (card["id"],)).fetchone())
    clips = _anki_clips([row])[row["uid"]]
    assert set(clips) == {"word", "sentence"}
    assert all(c[:3] == b"ID3" or c[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2") for c in clips.values()), "MP3 clips, as for any card"
