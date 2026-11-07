"""Ready-made transcripts for a podcast (app/api/premade.py): the DLI students' podcasts arrive with every
episode transcribed, stored with the sync's own code, and nothing the learner has is overwritten."""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

import pytest

from app.api.premade import clean_payload

ROOT = Path(__file__).resolve().parent.parent
FEED_URL = "https://feeds.example.com/dli.xml"

PAYLOAD = {
    "format": 1, "rev": 1794033795.87, "model": "faster-whisper:large-v3:cuda",
    "segments": [[0.24, 3.14, "مرحبا بكم"], [3.2, 5.0, "في الدرس"]],
    "words": {"start": [0.24, 1.1, 3.2, 3.9], "end": [1.0, 3.14, 3.8, 5.0], "text": ["مرحبا", "بكم", "في", "الدرس"],
              "seg": [0, 0, 1, 1]},
    "vowels": {"words": ["مَرْحَبًا", "بِكُمْ", "فِي", "الدَّرْسِ"], "dialect": "msa", "guess": [1], "model": "catt"},
}


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def _feed(language: str = "ar") -> dict:
    """A followed podcast with two episodes, not transcribed (no network: written straight in)."""
    from app import db, ids

    fuid = ids.feed_uid(FEED_URL)
    with db.session() as conn:
        feed_id = conn.execute("INSERT INTO feeds(url, uid, title, created_at, language) VALUES(?,?,?,?,?)",
                               (FEED_URL, fuid, "DLI pod", time.time(), language)).lastrowid
        eps = []
        for n in (1, 2):
            eps.append(conn.execute(
                "INSERT INTO episodes(feed_id, uid, guid, title, published, audio_url, created_at) VALUES(?,?,?,?,?,?,?)",
                (feed_id, ids.episode_uid(fuid, f"g-{n}"), f"g-{n}", f"Unit {n}", time.time(),
                 f"https://cdn.example.com/{n}.mp3", time.time())).lastrowid)
    return {"feed_id": feed_id, "episodes": eps}


def _items(payload: bool = True) -> list[dict]:
    return [{"guid": "g-1", "audio_url": "https://cdn.example.com/1.mp3", **({"payload": PAYLOAD} if payload else {})},
            {"guid": "other-guid", "audio_url": "https://cdn.example.com/2.mp3", **({"payload": PAYLOAD} if payload else {})},
            {"guid": "g-9", "audio_url": "https://cdn.example.com/9.mp3"}]


def test_transcripts_are_stored_with_the_syncs_own_code(client):
    from app import db
    from app.sync import engine

    known = _feed()
    ask = client.post("/api/premade", json={"feed_url": FEED_URL, "items": _items(payload=False)})
    assert ask.status_code == 200, ask.text
    out = ask.json()
    assert out["feed_id"] == known["feed_id"] and out["need"] == [0, 1], "found by guid, then by audio address"
    assert out["missing"] == 1 and out["stored"] == 0
    r = client.post("/api/premade", json={"feed_url": FEED_URL, "items": _items()}).json()
    assert r["stored"] == 2 and r["missing"] == 1
    for ep in known["episodes"]:
        got = engine.transcript_payload(ep)
        assert got["segments"] == PAYLOAD["segments"] and got["words"] == PAYLOAD["words"]
        assert got["rev"] == PAYLOAD["rev"] and got["model"] == PAYLOAD["model"]
        assert got["vowels"]["words"] == PAYLOAD["vowels"]["words"], "the vowels came too"
        t = client.get(f"/api/episodes/{ep}/transcript").json()
        assert t["words"]["text"] == ["مرحبا", "بكم", "في", "الدرس"]
    with db.session() as conn:
        rows = conn.execute("SELECT status, synced_rev, transcribed_at FROM episodes WHERE feed_id = ?", (known["feed_id"],)).fetchall()
    assert all(r["status"] == "done" and r["synced_rev"] is None and r["transcribed_at"] == PAYLOAD["rev"] for r in rows), \
        "done, and uploaded to Drive with the next sync like any transcript"
    # Again: nothing changes, nothing is overwritten.
    again = client.post("/api/premade", json={"feed_url": FEED_URL, "items": _items()}).json()
    assert again["stored"] == 0 and again["kept"] == 2 and again["need"] == []


def test_a_transcript_the_learner_has_is_kept(client):
    from app import db

    known = _feed()
    mine = {**PAYLOAD, "segments": [[0.0, 1.0, "mine"]],
            "words": {"start": [0.0], "end": [1.0], "text": ["mine"], "seg": [0]}, "vowels": None}
    client.post("/api/premade", json={"feed_url": FEED_URL, "items": [{"guid": "g-1", "payload": mine}]})
    with db.session() as conn:  # the other one is being transcribed here right now
        conn.execute("UPDATE episodes SET status = 'transcribing' WHERE id = ?", (known["episodes"][1],))
    r = client.post("/api/premade", json={"feed_url": FEED_URL, "items": _items()}).json()
    assert r["stored"] == 0 and r["kept"] == 2
    t = client.get(f"/api/episodes/{known['episodes'][0]}/transcript").json()
    assert t["words"]["text"] == ["mine"]


def test_not_followed_unless_asked_then_followed_the_ordinary_way_in_its_language(client, monkeypatch):
    from app import db, feeds, ids

    r = client.post("/api/premade", json={"feed_url": FEED_URL, "items": _items(payload=False)}).json()
    assert r["feed_id"] is None and r["need"] == [], "not followed, and not asked to"
    calls = []

    def fake_add(url):  # what feeds.add_feed does, without reading the feed from the internet
        calls.append(url)
        with db.session() as conn:
            fid = conn.execute("INSERT INTO feeds(url, uid, title, created_at, language) VALUES(?,?,?,?,?)",
                               (url, ids.feed_uid(url), "DLI pod", time.time(), "es")).lastrowid
            conn.execute("INSERT INTO episodes(feed_id, uid, guid, title, audio_url, created_at) VALUES(?,?,?,?,?,?)",
                         (fid, ids.episode_uid(ids.feed_uid(url), "g-1"), "g-1", "Unit 1", "https://cdn.example.com/1.mp3", time.time()))
            return dict(conn.execute("SELECT * FROM feeds WHERE id = ?", (fid,)).fetchone())

    monkeypatch.setattr(feeds, "add_feed", fake_add)
    r = client.post("/api/premade", json={"feed_url": FEED_URL, "language": "ar", "follow": True, "items": _items()}).json()
    assert calls == [FEED_URL] and r["added_feed"] is True and r["stored"] == 1
    with db.session() as conn:
        assert conn.execute("SELECT language FROM feeds WHERE url = ?", (FEED_URL,)).fetchone()["language"] == "ar", \
            "filed under the DLI language, not the one being studied"
    again = client.post("/api/premade", json={"feed_url": FEED_URL, "follow": True, "items": _items()}).json()
    assert calls == [FEED_URL] and again["added_feed"] is False, "followed already: not again"


def test_bad_requests_are_refused(client):
    _feed()
    assert client.post("/api/premade", json={"feed_url": "javascript:alert(1)"}).status_code == 400
    assert client.post("/api/premade", json={"feed_url": "http://127.0.0.1/feed.xml"}).status_code == 400
    bad = {**PAYLOAD, "words": {**PAYLOAD["words"], "seg": [0, 0, 1, 7]}}
    r = client.post("/api/premade", json={"feed_url": FEED_URL, "items": [{"guid": "g-1", "payload": bad}]})
    assert r.status_code == 400


CASES = [
    PAYLOAD,
    {**PAYLOAD, "rev": 0},
    {**PAYLOAD, "segments": []},
    {**PAYLOAD, "segments": [[0.1234567, 0.05, "end before start"], [1, 2, "b"]]},
    {**PAYLOAD, "words": {**PAYLOAD["words"], "text": ["a", "b", "c"]}},
    {**PAYLOAD, "words": {**PAYLOAD["words"], "seg": [0, 0, 1, 2]}},
    {**PAYLOAD, "segments": [[0, 1, "a\u0000b"], [1, 2, "c"]]},
    {**PAYLOAD, "vowels": {"words": ["x"]}},
    {**PAYLOAD, "vowels": {**PAYLOAD["vowels"], "guess": [0, 9, "x", True]}},
    {**PAYLOAD, "model": 5, "format": 99, "kinds": ["p", None]},
    {**PAYLOAD, "kinds": ["p", None, "too many"]},
    {**PAYLOAD, "words": {**PAYLOAD["words"], "seg": [0, 0, 1, True]}},
    "nope",
    [],
]


def test_the_phone_and_the_computer_check_transcripts_alike():
    """web/js/dli.js checkPayload (the phone's backend.js) and clean_payload here keep and refuse the same."""
    script = ("import('./web/js/dli.js').then((m) => { const cases = JSON.parse(process.argv[1]);"
              " console.log(JSON.stringify(cases.map((c) => m.checkPayload(c)))); })")
    out = subprocess.run(["node", "-e", script, json.dumps(CASES)], cwd=ROOT, capture_output=True, text=True, check=True,
                         encoding="utf-8").stdout
    assert json.loads(out) == [clean_payload(c) for c in CASES]


def test_the_dli_settings_are_kept_checked_and_follow_the_learner(client):
    """Settings -> Languages -> DLI students (web/js/components/dlicard.js): kept on the computer, synced like the AI
    keys (aikeys.KEYS), the key left out of backups, and only the seven DLI languages accepted."""
    from app import aikeys, db

    key = "A" * 43 + "="
    s = client.patch("/api/settings", json={"dli_student": "on", "dli_language": "ar", "dli_key": key, "dli_added": "ar:arabic101"}).json()
    assert (s["dli_student"], s["dli_language"], s["dli_key"], s["dli_added"]) == ("on", "ar", key, "ar:arabic101")
    for name in ("dli_student", "dli_language", "dli_key", "dli_added"):
        assert name in aikeys.KEYS and name in s[aikeys.TIMES]
    assert "dli_key" in db.SECRET_SETTINGS
    assert client.patch("/api/settings", json={"dli_language": "de"}).status_code == 400
    assert client.patch("/api/settings", json={"dli_student": "yes"}).status_code == 400
