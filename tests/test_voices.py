"""Card voices: which cards need one, made once each, kept with the card and kept through a sync
(app/voices.py, app/api/vocab.py, app/sync/engine.py; the page's side is tests/js/cardvoice.test.mjs)."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

import numpy as np
import pytest

from app import aikeys, db, voices
from app.sync import engine

ROOT = Path(__file__).resolve().parent.parent
JS = (ROOT / "web" / "js" / "cardvoice.js").read_text(encoding="utf-8")

LINES = [{"start": 0.8, "end": 3.2, "text": "hola amigo", "words": [[0.8, 1.5, "hola"], [1.5, 3.2, "amigo"]]}]


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        db.set_settings({"study_language": "es", "learning_languages": ["es"], "welcome_seen": True})
        yield c


def _js_list(name: str) -> list[str]:
    body = re.search(rf"export const {name} = \[([^\]]*)\]", JS).group(1)
    return re.findall(r'"([^"]+)"', body)


def test_the_computer_and_the_page_agree_on_kinds_and_languages():
    assert tuple(_js_list("NO_AUDIO_KINDS")) == voices.NO_AUDIO_KINDS
    assert _js_list("LOCAL_VOICE_LANGUAGES") == list(voices.VOICES), "web/js/cardvoice.js and app/voices.py list the same languages"
    for name in ("tts_key_azure", "tts_region_azure", "tts_mode", "tts_voices"):
        assert name in aikeys.KEYS, f"{name} follows the learner between devices"
    assert "tts_key_azure" in db.SECRET_SETTINGS, "the Azure key never goes into a backup"


def test_no_voice_offered_has_a_non_commercial_or_unknown_licence():
    for lang, items in voices.VOICES.items():
        assert items, lang
        for v in items:
            assert v["licence"].startswith(("CC0", "CC BY 4.0", "CC BY-SA", "Unlicense", "public domain", "not stated")), (lang, v)
            assert "NC" not in v["licence"], (lang, v)
            assert v["id"].split("_")[0] == lang, "each voice is filed under its own language"
    assert set(voices.NO_VOICE).isdisjoint(voices.VOICES)


def _podcast_episode(language: str = "es") -> int:
    with db.session() as conn:
        conn.execute("INSERT INTO feeds(url, title, created_at, uid) VALUES('https://x/feed', 'P', ?, 'feeduid1')", (time.time(),))
        fid = conn.execute("SELECT id FROM feeds WHERE uid = 'feeduid1'").fetchone()["id"]
        conn.execute("INSERT INTO episodes(feed_id, guid, title, audio_url, audio_type, status, language, uid, created_at) "
                     "VALUES(?, 'g1', 'Ep', 'https://x/a.mp3', 'audio/mpeg', 'done', ?, 'epuid1', ?)", (fid, language, time.time()))
        return conn.execute("SELECT id FROM episodes WHERE uid = 'epuid1'").fetchone()["id"]


def test_which_cards_need_a_voice(client):
    pod = _podcast_episode()
    yt = client.post("/api/youtube", json={"video_id": "lo3KyF50IGE", "title": "Video", "language": "es", "lines": LINES}).json()
    add = lambda **kw: client.post("/api/vocab", json={"meaning": "", **kw}).json()  # noqa: E731
    from_podcast = add(text="hola", sentence="hola amigo", episode_id=pod, start=0.8, end=1.5, sent_start=0.8, sent_end=3.2)
    from_youtube = add(text="amigo", sentence="hola amigo", episode_id=yt["id"], start=1.5, end=3.2, sent_start=0.8, sent_end=3.2)
    typed = add(text="cartera", sentence="Perdí mi cartera.")
    listed = {v["id"]: v for v in client.get("/api/vocab").json()}
    assert listed[from_podcast["id"]]["audio_type"] == "audio/mpeg"
    assert listed[from_youtube["id"]]["audio_type"] == "video/youtube", "the page can tell a YouTube word has no sound file"
    assert listed[typed["id"]]["audio_type"] is None
    assert not voices.needs_voice(from_podcast["id"]), "a podcast's own recording is kept"
    assert voices.needs_voice(from_youtube["id"]), "a YouTube word gets a voice (its sound plays only in YouTube's player)"
    assert voices.needs_voice(typed["id"])
    assert voices.waiting()["langs"] == {"es": 2}


def _fake_voice(monkeypatch, calls: list[str]) -> None:
    monkeypatch.setattr(voices, "voice_installed", lambda vid: vid == "es_ES-davefx-medium")
    monkeypatch.setattr(voices, "runtime_installed", lambda: True)

    def synth(text, voice_id):
        calls.append(text)
        rate = 22050
        t = np.arange(int(rate * (0.2 + 0.03 * len(text)))) / rate
        return (np.sin(2 * np.pi * 220 * t) * 8000).astype(np.int16), rate
    monkeypatch.setattr(voices, "synth", synth)


def test_the_computer_makes_each_cards_voice_once(client, monkeypatch):
    calls: list[str] = []
    _fake_voice(monkeypatch, calls)
    typed = client.post("/api/vocab", json={"text": "cartera", "sentence": "Perdí mi cartera en el metro."}).json()
    alone = client.post("/api/vocab", json={"text": "concientizar"}).json()
    worker = voices.Worker()
    db.set_settings({"tts_mode": "device"})
    assert worker.run_once() == 0, "only with My computer chosen"
    db.set_settings({"tts_mode": "computer"})
    assert worker.run_once() == 2
    assert worker.run_once() == 0, "made once: nothing is made again"
    assert sorted(calls) == sorted(["cartera", "Perdí mi cartera en el metro.", "concientizar"])
    rows = {v["id"]: v for v in client.get("/api/vocab").json()}
    t = json.loads(rows[typed["id"]]["voice"])
    assert 0 < t["start"] < t["end"] < t["sent_start"] < t["sent_end"], t
    assert t["sent_start"] - t["end"] >= voices.GAP - 0.01, "the word and the sentence are kept apart"
    assert rows[typed["id"]]["start"] is None and rows[typed["id"]]["clip"] == 0, "the card's own times are left alone"
    alone_t = json.loads(rows[alone["id"]]["voice"])
    assert alone_t["sent_start"] is None, "a word without a sentence has only the word"
    clip = engine.clip_path(rows[typed["id"]]["uid"])
    assert clip.read_bytes()[:4] == b"OggS"
    # The file plays and goes along to the user's other devices and into the Anki export.
    assert client.get(f"/api/vocab/{typed['id']}/clip").status_code == 200
    shared = client.get(f"/api/vocab/{typed['id']}/share-clip").json()
    assert shared["times"]["sent_start"] == t["sent_start"]
    from app.api.vocab import _anki_clips

    with db.session() as conn:
        row = dict(conn.execute("SELECT * FROM vocab WHERE id = ?", (typed["id"],)).fetchone())
    assert set(_anki_clips([row])[row["uid"]]) == {"word", "sentence"}


def test_making_one_now_and_without_a_voice_downloaded(client, monkeypatch):
    calls: list[str] = []
    word = client.post("/api/vocab", json={"text": "cartera"}).json()
    r = client.post(f"/api/voices/make/{word['id']}")
    assert r.status_code == 409 and "No Spanish voice" in r.json()["detail"]
    _fake_voice(monkeypatch, calls)
    made = client.post(f"/api/voices/make/{word['id']}").json()
    assert json.loads(made["voice"])["start"] > 0
    again = client.post(f"/api/voices/make/{word['id']}").json()
    assert again["voice"] == made["voice"] and calls == ["cartera"], "never made twice"


def test_azure_voice_is_kept_once(client):
    word = client.post("/api/vocab", json={"text": "cartera"}).json()
    ogg = b"OggS" + b"\0" * 100
    r = client.put(f"/api/vocab/{word['id']}/voice?start=0.06&end=0.7", content=ogg)
    assert json.loads(r.json()["voice"]) == {"start": 0.06, "end": 0.7, "sent_start": None, "sent_end": None}
    second = client.put(f"/api/vocab/{word['id']}/voice?start=1&end=2", content=b"OggS" + b"\1" * 100).json()
    assert json.loads(second["voice"])["start"] == 0.06, "a second voice (a second payment) is refused"
    assert engine.clip_path(word["uid"]).read_bytes() == ogg


def test_a_voice_survives_another_device_editing_the_card():
    local = {"voice": '{"start": 0.06, "end": 0.7}', "updated_at": 10.0}
    newer_without = {"uid": "u", "voice": "", "meaning": "wallet", "updated_at": 20.0}
    kept = engine.keep_voice(newer_without, local)
    assert kept["voice"] == local["voice"] and kept["meaning"] == "wallet", "the other edit still wins"
    assert kept["updated_at"] > 20.0, "and the voice goes back to the other device"
    assert engine.keep_voice({"voice": '{"start": 1, "end": 2}', "updated_at": 5}, local)["voice"] == '{"start": 1, "end": 2}'
    assert engine.keep_voice(newer_without, None) is newer_without


def test_card_audio_is_real_ogg_opus(monkeypatch):
    calls: list[str] = []
    _fake_voice(monkeypatch, calls)
    data, times = voices.card_audio("hola", "hola amigo", "es_ES-davefx-medium")
    assert data[:4] == b"OggS" and len(data) > 1000
    assert times["start"] == voices.LEAD and times["sent_end"] > times["sent_start"]
