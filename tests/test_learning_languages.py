"""Learning several languages: each podcast, episode and word knows its language, and the lists
show only the language being learned (the top bar's switch, web/js/components/langswitch.js)."""

import pytest
from fastapi.testclient import TestClient

from app import db, paths


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "db_path", lambda: tmp_path / "library.db")
    db.init_db(tmp_path / "library.db")
    with db.session() as conn:
        conn.execute("INSERT INTO feeds (id, url, title, created_at, language) VALUES (1, 'https://a/rss', 'Arabic show', 1, 'ar')")
        conn.execute("INSERT INTO feeds (id, url, title, created_at, language) VALUES (2, 'https://e/rss', 'Spanish show', 1, 'es')")
        conn.execute("INSERT INTO feeds (id, url, title, created_at) VALUES (3, 'local:webpages', 'My webpages', 1)")
        conn.execute("INSERT INTO episodes (feed_id, guid, title, audio_url, created_at) VALUES (1, 'a1', 'Ep A', 'https://a/1.mp3', 1)")
        conn.execute("INSERT INTO episodes (feed_id, guid, title, audio_url, created_at) VALUES (2, 'e1', 'Ep E', 'https://e/1.mp3', 1)")
        conn.execute("INSERT INTO episodes (feed_id, guid, title, audio_url, created_at, language) VALUES (3, 'p1', 'Página', 'https://p', 1, 'es')")
        conn.execute("INSERT INTO vocab (text, norm, created_at, language) VALUES ('هزار', 'هزار', 1, 'ar')")
        conn.execute("INSERT INTO vocab (text, norm, created_at, language) VALUES ('ahorita', 'ahorita', 2, 'es')")
    db.set_settings({"study_language": "ar"})
    from app.main import create_app

    return TestClient(create_app())


def titles(items, key="title"):
    return sorted(i[key] for i in items)


def test_only_the_language_being_learned_is_listed(client):
    assert titles(client.get("/api/feeds").json()) == ["Arabic show", "My webpages"]
    assert titles(client.get("/api/episodes").json()["items"]) == ["Ep A"]
    assert [v["text"] for v in client.get("/api/vocab").json()] == ["هزار"]

    client.patch("/api/settings", json={"study_language": "es"})
    assert titles(client.get("/api/feeds").json()) == ["My webpages", "Spanish show"]
    assert titles(client.get("/api/episodes").json()["items"]) == ["Ep E", "Página"]
    assert [v["text"] for v in client.get("/api/vocab").json()] == ["ahorita"]
    assert client.get("/api/settings").json()["learning_languages"] in ([], ["ar", "es"]), "kept by the page's saveSettings"


def test_a_word_saved_from_an_episode_takes_the_episodes_language(client):
    ep = next(e for e in client.get("/api/episodes").json()["items"] if e["title"] == "Ep A")
    v = client.post("/api/vocab", json={"text": "كلمة", "episode_id": ep["id"]}).json()
    assert v["language"] == "ar"
    typed = client.post("/api/vocab", json={"text": "привет"}).json()
    assert typed["language"] == "ru", "a typed word is in the language its letters say"


def test_an_untranscribed_episode_is_in_its_podcasts_language(client):
    ep = next(e for e in client.get("/api/episodes").json()["items"] if e["title"] == "Ep A")
    assert client.get(f"/api/episodes/{ep['id']}").json()["language"] == "ar"


def test_old_libraries_get_languages_filled_in(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "db_path", lambda: tmp_path / "library.db")
    db.init_db(tmp_path / "library.db")
    with db.session() as conn:
        conn.execute("INSERT INTO sync_guard VALUES (1)")
        conn.execute("INSERT INTO feeds (id, url, title, created_at) VALUES (1, 'https://f/rss', 'Show', 1)")
        conn.execute("INSERT INTO episodes (id, feed_id, guid, title, audio_url, created_at, language) VALUES (1, 1, 'g', 'E', 'u', 1, 'fr')")
        conn.execute("INSERT INTO vocab (text, norm, created_at, episode_id) VALUES ('truc', 'truc', 1, 1)")
        conn.execute("INSERT INTO vocab (text, norm, created_at) VALUES ('ладно', 'ладно', 1)")
        conn.execute("UPDATE feeds SET language = NULL")
        conn.execute("UPDATE vocab SET language = NULL")
        conn.execute("DELETE FROM sync_guard")
        before = conn.execute("SELECT updated_at FROM vocab ORDER BY id").fetchall()
        db.fill_languages(conn)
        assert conn.execute("SELECT language FROM feeds WHERE id = 1").fetchone()[0] == "fr"
        assert [r[0] for r in conn.execute("SELECT language FROM vocab ORDER BY id")] == ["fr", "ru"]
        after = conn.execute("SELECT updated_at FROM vocab ORDER BY id").fetchall()
        assert [tuple(r) for r in before] == [tuple(r) for r in after], "filling in a language is not an edit to sync"


def test_sync_carries_podcast_and_word_languages(client):
    from app.sync import engine

    snap = engine.snapshot("pc")
    assert {f["title"]: f["language"] for f in snap["feeds"]}["Spanish show"] == "es"
    assert {v["text"]: v["language"] for v in snap["vocab"]}["ahorita"] == "es"
