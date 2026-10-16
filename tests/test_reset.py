"""Settings → Reset Tamkeen (app/reset.py): the library is set aside whole and comes back whole."""

import pytest

from app import db, paths, reset


@pytest.fixture()
def data(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(paths, "db_path", lambda: tmp_path / "library.db")
    monkeypatch.setattr(reset.events, "publish", lambda *a, **k: None)
    db.init_db(tmp_path / "library.db")
    with db.session() as conn:
        conn.execute("INSERT INTO feeds (url, title, created_at) VALUES ('https://example.com/rss', 'My podcast', 1)")
        conn.execute("INSERT INTO vocab (text, norm, meaning, created_at) VALUES ('هزار', 'هزار', 'joking', 1)")
    db.set_settings({"welcome_seen": True, "onboarded": True, "study_language": "ar", "ui_language": "en",
                     "google_refresh_token": "", "llm_key_claude": "secret", "theme": "dark", "device_id": "pc-1"})
    return tmp_path


def count(table):
    conn = db.connect()
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()


def test_reset_starts_empty_and_signed_out_without_deleting_anything(data):
    assert reset.reset()["ok"]
    assert reset.parked()
    assert count("feeds") == 0 and count("vocab") == 0
    s = db.get_settings()
    assert not s["welcome_seen"] and not s["study_language"] and not s["llm_key_claude"], "first-run again, keys gone"
    copies = list((data / "reset").glob("library-*.db"))
    assert len(copies) == 1, "the library is kept, set aside"
    assert reset.reset()["ok"] is False, "a second reset while set aside is refused"


def test_finishing_the_first_run_screens_brings_everything_back_with_the_new_choices(data):
    reset.reset()
    db.set_settings({"welcome_seen": True, "study_language": "it", "ui_language": "es"})
    assert reset.maybe_restore() is False, "not yet: the first-run questions aren't answered"
    db.set_settings({"onboarded": True})
    assert reset.maybe_restore() is True
    assert not reset.parked()
    assert count("feeds") == 1 and count("vocab") == 1
    s = db.get_settings()
    assert s["llm_key_claude"] == "secret" and s["theme"] == "dark", "the old settings are back"
    assert s["study_language"] == "it" and s["ui_language"] == "es", "what was chosen meanwhile wins"
    assert list((data / "reset").glob("library-*-restored.db")), "the set-aside copy is kept"


def test_signing_in_brings_it_back_and_unfinished_first_run_screens_still_show(data):
    reset.reset()
    db.set_settings({"google_refresh_token": "new-token"})
    assert reset.maybe_restore() is True
    s = db.get_settings()
    assert s["google_refresh_token"] == "new-token"
    assert not s["welcome_seen"] and not s["onboarded"], "the first-run screens not reached yet still come"
    assert count("vocab") == 1


def test_nothing_is_reset_while_something_is_being_transcribed(data):
    with db.session() as conn:
        conn.execute("INSERT INTO episodes (feed_id, guid, title, audio_url, status, created_at) VALUES (1, 'g', 'Ep', 'https://x/a.mp3', 'transcribing', 1)")
    out = reset.reset()
    assert out["ok"] is False and "transcribed" in out["error"]
    assert not reset.parked() and count("feeds") == 1


def test_sync_does_nothing_while_the_library_is_set_aside(data, monkeypatch):
    from app import sync

    reset.reset()
    called = []
    monkeypatch.setattr(sync.engine, "run", lambda *a, **k: called.append(1))
    sync.manager.sync_now()
    assert not called
