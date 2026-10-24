"""The basics courses on the computer (app/course.py, app/api/course.py) and a course card's source
(the batch save, app/api/vocab.py). The course content and the page's side: tests/js/course.test.mjs."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import course


@pytest.fixture()
def course_dir(tmp_path, monkeypatch):
    (tmp_path / "ar" / "audio").mkdir(parents=True)
    (tmp_path / "index.json").write_text(json.dumps({"format": 1, "courses": {"ar": {"file": "ar/course.json"}}}), encoding="utf-8")
    (tmp_path / "ar" / "course.json").write_text(json.dumps({"format": 1, "lang": "ar", "words": []}), encoding="utf-8")
    (tmp_path / "ar" / "audio" / "0001.ogg").write_bytes(b"OggS-test")
    monkeypatch.setenv("APS_COURSE_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture()
def client(fresh_db, course_dir):
    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_the_course_files_are_served_with_their_types(client):
    r = client.get("/api/course/index.json")
    assert r.status_code == 200 and r.json()["courses"]["ar"]["file"] == "ar/course.json"
    assert r.headers["content-type"].startswith("application/json") and r.headers["cache-control"] == "no-cache"
    assert client.get("/api/course/ar/course.json").json()["lang"] == "ar"
    a = client.get("/api/course/ar/audio/0001.ogg")
    assert a.status_code == 200 and a.content == b"OggS-test" and a.headers["content-type"] == "audio/ogg"


def test_only_course_files_can_be_asked_for(client):
    for bad in ("../library.db", "ar/../../secret.json", "ar/audio/1.ogg", "ar/audio/0001.mp3", "AR/course.json", "x/course.json/../y"):
        assert client.get(f"/api/course/{bad}").status_code == 404, bad
    assert client.get("/api/course/ar/audio/0002.ogg").status_code == 404, "not made yet"
    with pytest.raises(course.CourseError):
        course.get("../../etc/passwd")


def test_a_published_audio_file_is_kept_and_used_without_asking_again(tmp_path, monkeypatch):
    from app import paths

    monkeypatch.delenv("APS_COURSE_DIR", raising=False)
    monkeypatch.setattr(course, "_source_dir", lambda: None)
    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    asked = []

    class Answer:
        content = b"OggS-published"

        def raise_for_status(self):
            return None

    monkeypatch.setattr(course.httpx, "get", lambda url, **kw: asked.append(url) or Answer())
    assert course.get("ar/audio/0007.ogg") == b"OggS-published"
    assert course.get("ar/audio/0007.ogg") == b"OggS-published"
    assert asked == [course.BASE_URL + "ar/audio/0007.ogg"], "audio never changes once made: asked once"
    course.get("ar/course.json")
    course.get("ar/course.json")
    assert asked.count(course.BASE_URL + "ar/course.json") == 2, "the course itself is asked afresh (units get added)"


def test_without_a_connection_a_kept_course_still_opens(tmp_path, monkeypatch):
    from app import paths

    monkeypatch.setattr(course, "_source_dir", lambda: None)
    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    (tmp_path / "course" / "ar").mkdir(parents=True)
    (tmp_path / "course" / "ar" / "course.json").write_bytes(b'{"kept": true}')

    def offline(url, **kw):
        raise course.httpx.ConnectError("offline")

    monkeypatch.setattr(course.httpx, "get", offline)
    assert course.get("ar/course.json") == b'{"kept": true}'
    with pytest.raises(course.CourseError):
        course.get("es/course.json")


def test_a_course_card_says_where_it_came_from(client):
    r = client.post("/api/vocab/batch", json={"cards": [
        {"text": "فِي", "meaning": "in", "sentence": "أَسْكُنُ فِي بَيْتٍ.", "translation": "I live ⟦in⟧ a house.",
         "source": "Arabic basics · word 1"},
        {"text": "كتاب", "meaning": "book"}]})
    assert r.status_code == 200
    cards = r.json()["cards"]
    assert cards[0]["episode_title"] == "Arabic basics · word 1"
    assert cards[1]["episode_title"] == "", "typed in: no source"
