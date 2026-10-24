"""A word saved with no episode but a source and a language: a word saved from a song's lyrics on
Spotify through the browser extension (extension/src/js/ext/spotify-panel.js; the web app takes it in
with POST /vocab, mobile/src/js/web-extension.js). The computer's server takes the same fields (the
phone/web server's twin is in mobile/src/js/backend.js). The card's sentence is the lyric line; its
source, shown on the Vocab page, is "Spotify – Artist – Title"; no Library item is made."""

from __future__ import annotations

import pytest

from app import db, voices


@pytest.fixture()
def client(fresh_db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setattr(voices.worker, "kick", lambda: None)
    with TestClient(create_app(start_worker=False)) as c:
        db.set_settings({"study_language": "fr", "learning_languages": ["fr"], "welcome_seen": True})
        yield c


def test_a_word_from_a_song_keeps_its_source_and_language(client):
    row = client.post("/api/vocab", json={
        "text": "corazón", "sentence": "Mi corazón es tuyo", "meaning": "heart",
        "source": "Spotify  –  Cantante Uno – Canción", "language": "es",
    }).json()
    assert row["episode_id"] is None
    assert row["episode_title"] == "Spotify – Cantante Uno – Canción"
    assert row["language"] == "es"  # (looked up in Spanish while French is studied)
    assert row["sentence"] == "Mi corazón es tuyo"
    with db.session() as conn:
        assert conn.execute("SELECT COUNT(*) FROM episodes").fetchone()[0] == 0  # no Library item


def test_without_them_a_word_is_as_before(client):
    row = client.post("/api/vocab", json={"text": "maison", "meaning": "house"}).json()
    assert row["episode_title"] == ""
    assert row["language"] == "fr"
    odd = client.post("/api/vocab", json={"text": "chat", "language": "<script>", "source": "x" * 400}).json()
    assert odd["language"] == "fr"
    assert len(odd["episode_title"]) == 300
