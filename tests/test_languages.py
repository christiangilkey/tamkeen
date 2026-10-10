"""Languages: the study-language setting, what each episode was made in, and old installs."""

from __future__ import annotations

import sqlite3

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import db, jobs, languages, pages
from app.sync import engine
from app.transcriber import Segment, Word

from test_sync import world  # noqa: F401  (pytest fixture)


def test_new_install_has_no_language_until_the_user_chooses(fresh_db):
    assert db.get_setting("study_language") == ""
    assert languages.study() == "ar", "Arabic stands in until a choice is made"
    db.set_settings({"study_language": "ja"})
    assert languages.study() == "ja"
    db.set_settings({"study_language": "klingon"})
    assert languages.study() == "ar"


def test_install_from_before_languages_stays_arabic(tmp_path, monkeypatch):
    from app import paths

    path = tmp_path / "library.db"
    monkeypatch.setattr(paths, "db_path", lambda: path)
    db.init_db(path)
    # Rewind to the old layout: no language column, a used library, no language setting.
    conn = sqlite3.connect(path)
    for name in db._TRIGGER_NAMES:
        conn.execute(f"DROP TRIGGER IF EXISTS {name}")
    conn.execute("ALTER TABLE episodes DROP COLUMN language")
    conn.execute("INSERT INTO feeds(uid, url, title, created_at) VALUES('f', 'https://x/feed', 'Feed', 1)")
    conn.execute("INSERT INTO episodes(feed_id, uid, guid, title, audio_url, status, created_at) "
                 "VALUES(1, 'e1', 'g1', 'Done', 'https://x/1.mp3', 'done', 1)")
    conn.execute("INSERT INTO episodes(feed_id, uid, guid, title, audio_url, status, created_at) "
                 "VALUES(1, 'e2', 'g2', 'New', 'https://x/2.mp3', 'new', 1)")
    conn.execute("INSERT INTO settings(key, value) VALUES('welcome_seen', 'true')")
    conn.commit()
    conn.close()

    db._initialized.discard(path)
    db.init_db(path)
    assert db.get_setting("study_language") == "ar"
    with db.session() as c:
        rows = dict(c.execute("SELECT uid, language FROM episodes").fetchall())
    assert rows == {"e1": "ar", "e2": None}, "only what was already transcribed is marked"

    # Upgrading runs once: a later choice is not overwritten.
    db.set_settings({"study_language": "es"})
    db._initialized.discard(path)
    db.init_db(path)
    assert db.get_setting("study_language") == "es"


def test_settings_reject_unknown_languages(fresh_db):
    from app.main import create_app

    client = TestClient(create_app(start_worker=False))
    assert client.patch("/api/settings", json={"study_language": "fr"}).json()["study_language"] == "fr"
    assert client.patch("/api/settings", json={"study_language": "xx"}).status_code == 400
    assert db.get_setting("study_language") == "fr"


@pytest.mark.parametrize("text, hint, expected", [
    ("القهوة مشروب يُحضر من بذور البن", "es", "ar"),
    ("Кофе — это напиток", "ar", "ru"),
    ("コーヒーは飲み物です", "zh", "ja"),
    ("咖啡是一种饮料", "ar", "zh"),
    ("東京", "ja", "ja"),
    ("El café es una bebida", "es", "es"),
    ("Le café est une boisson", "fr", "fr"),
    ("Coffee is a drink", "ar", "ar"),   # a page in an untaught language: the study language
    ("", "ru", "ru"),
])
def test_detect(fresh_db, text, hint, expected):
    assert languages.detect(text, hint) == expected


def test_imported_page_records_its_language(world):
    _, a, _ = world
    with a:
        db.set_settings({"study_language": "fr"})
        fr = pages.save_page("example.com/cafe", "Le café", [{"kind": "p", "text": "Le café est une boisson très populaire."}])
        zh = pages.save_page("example.com/kafei", "咖啡", [{"kind": "p", "text": "咖啡是世界上最受欢迎的饮料之一。"}])
        assert fr["language"] == "fr"
        assert zh["language"] == "zh", "judged by its writing, not by the study language"
        # Re-importing after switching language updates it.
        db.set_settings({"study_language": "es"})
        again = pages.save_page("example.com/cafe", "El café", [{"kind": "p", "text": "El café es una bebida."}])
        assert again["id"] == fr["id"] and again["language"] == "es"


class FakeEngine:
    engine, device, model_size = "fake", "cpu", "test"

    def __init__(self):
        self.heard = []

    def transcribe(self, audio, cancel=None, language="ar"):
        self.heard.append(language)
        yield Segment(0.0, 1.0, "hola mundo", [Word(0.0, 0.5, "hola"), Word(0.5, 1.0, "mundo")])


def test_transcription_listens_for_the_study_language_and_records_it(world, monkeypatch, tmp_path):
    _, a, _ = world
    fake = FakeEngine()
    audio_file = tmp_path / "a.mp3"
    audio_file.write_bytes(b"x")
    with a:
        db.set_settings({"study_language": "es"})
        monkeypatch.setattr(jobs.transcriber, "get", lambda *args: fake)
        monkeypatch.setattr(jobs, "_ensure_audio", lambda ep, cancel: (audio_file, False))
        monkeypatch.setattr(jobs.audio, "probe_duration", lambda p: 1.0)
        monkeypatch.setattr(jobs.audio, "decode", lambda p: np.zeros(16000, dtype=np.float32))
        monkeypatch.setattr(jobs, "_make_sync_copy", lambda *args: None)
        with db.session() as conn:
            conn.execute("INSERT INTO jobs(episode_id, state, created_at) VALUES(2, 'running', 1)")
            job = dict(conn.execute("SELECT * FROM jobs WHERE episode_id = 2").fetchone())
        import threading

        jobs._process(job, threading.Event())
        assert fake.heard == ["es"]
        with db.session() as conn:
            ep = conn.execute("SELECT status, language FROM episodes WHERE id = 2").fetchone()
        assert (ep["status"], ep["language"]) == ("done", "es")


def test_language_travels_with_sync_and_older_devices_cannot_erase_it(world):
    drive, a, b = world
    with a:
        with db.session() as conn:
            conn.execute("UPDATE episodes SET language = 'ru' WHERE id = 1")
            uid = conn.execute("SELECT uid FROM episodes WHERE id = 1").fetchone()["uid"]
    a.sync(drive)
    b.sync(drive)
    with b:
        with db.session() as conn:
            assert conn.execute("SELECT language FROM episodes WHERE uid = ?", (uid,)).fetchone()["language"] == "ru"
        # A record from a device that knows nothing of languages (no such field), but newer.
        snap = engine.snapshot("old-device")
        for ep in snap["episodes"]:
            if ep["uid"] == uid:
                del ep["language"]
                ep["title"] = "Renamed elsewhere"
                ep["updated_at"] += 100
        engine.merge(snap, engine.Result())
        with db.session() as conn:
            row = conn.execute("SELECT title, language FROM episodes WHERE uid = ?", (uid,)).fetchone()
        assert (row["title"], row["language"]) == ("Renamed elsewhere", "ru")
