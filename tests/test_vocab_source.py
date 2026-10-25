"""A word saved with no episode but with where it came from (`source`, shown on the Vocab page as
the card's origin) and the language it was looked up in (`language`). POST /vocab takes both on the
computer's server and on the phone/web server (mobile/src/js/backend.js, its twin); no Library item is
made for such a word."""

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


def test_a_word_with_a_source_keeps_it_and_its_language(client):
    row = client.post("/api/vocab", json={
        "text": "corazón", "sentence": "Mi corazón es tuyo", "meaning": "heart",
        "source": "Un  libro   de clase", "language": "es",
    }).json()
    assert row["episode_id"] is None
    assert row["episode_title"] == "Un libro de clase"
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
