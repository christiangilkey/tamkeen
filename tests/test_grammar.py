"""The grammar courses on the computer (app/grammar.py, app/api/grammar.py) and the learner's progress:
kept tidy, merged the same way as the phone's copy (web/js/grammardata.js, tests/js/grammar.test.mjs has
the same cases), saved through Settings and carried between devices by the sync."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import db, grammar
from app.sync import engine

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)


@pytest.fixture()
def grammar_dir(tmp_path, monkeypatch):
    (tmp_path / "en-ar").mkdir(parents=True)
    (tmp_path / "index.json").write_text(json.dumps({"format": 1, "courses": {"en-ar": {"file": "en-ar/course.json"}}}), encoding="utf-8")
    (tmp_path / "en-ar" / "course.json").write_text(json.dumps({"format": 1, "id": "en-ar", "lessons": []}), encoding="utf-8")
    monkeypatch.setenv("APS_GRAMMAR_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture()
def client(fresh_db, grammar_dir):
    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_the_grammar_files_are_served(client):
    r = client.get("/api/grammar/index.json")
    assert r.status_code == 200 and r.json()["courses"]["en-ar"]["file"] == "en-ar/course.json"
    assert r.headers["content-type"].startswith("application/json") and r.headers["cache-control"] == "no-cache"
    assert client.get("/api/grammar/en-ar/course.json").json()["id"] == "en-ar"


def test_only_grammar_files_can_be_asked_for(client):
    for bad in ("../library.db", "en-ar/../../secret.json", "en-ar/lessons.json", "EN-AR/course.json", "en/course.json"):
        assert client.get(f"/api/grammar/{bad}").status_code == 404, bad
    assert client.get("/api/grammar/en-ja/course.json").status_code == 404, "not made yet"
    with pytest.raises(grammar.GrammarError):
        grammar.get("../../etc/passwd")


def test_the_published_course_is_kept_for_when_there_is_no_connection(tmp_path, monkeypatch):
    import httpx

    from app import paths

    monkeypatch.delenv("APS_GRAMMAR_DIR", raising=False)
    monkeypatch.setattr(grammar, "_source_dir", lambda: None)
    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)

    class Answer:
        content = b'{"id": "en-ar"}'

        def raise_for_status(self):
            return None

    monkeypatch.setattr(httpx, "get", lambda url, **kw: Answer())
    assert grammar.get("en-ar/course.json") == b'{"id": "en-ar"}'

    def offline(url, **kw):
        raise httpx.ConnectError("no connection")

    monkeypatch.setattr(httpx, "get", offline)
    assert grammar.get("en-ar/course.json") == b'{"id": "en-ar"}', "the kept copy"
    with pytest.raises(grammar.GrammarError):
        grammar.get("en-ja/course.json")


# ----- progress (the same cases as tests/js/grammar.test.mjs) -----

def test_progress_is_kept_tidy():
    assert grammar.clean_progress('{"en-ar/nouns-the":{"at":100,"right":9,"of":4},"bad key":{"at":1},"en-ar/x":{"at":0}}') == \
        {"en-ar/nouns-the": {"at": 100, "right": 4, "of": 4}}
    assert grammar.clean_progress("not json") == {}
    assert grammar.clean_progress(None) == {}
    assert grammar.clean_progress({"en-ar/a": {"at": "100.7", "right": 2.9, "of": "3"}}) == {"en-ar/a": {"at": 100, "right": 2, "of": 3}}


def test_two_devices_progress_merges_the_same_way_whichever_does_the_merging():
    a = {"en-ar/one": {"at": 100, "right": 3, "of": 4}, "en-ar/two": {"at": 50, "right": 1, "of": 4}}
    b = {"en-ar/two": {"at": 60, "right": 4, "of": 4}, "en-ar/three": {"at": 10, "right": 2, "of": 3}}
    merged = grammar.merge_progress(a, b)
    assert merged == {"en-ar/one": a["en-ar/one"], "en-ar/three": b["en-ar/three"], "en-ar/two": b["en-ar/two"]}
    assert list(merged) == sorted(merged)
    assert merged == grammar.merge_progress(b, a)


def test_saving_progress_never_drops_a_lesson_another_device_finished(client):
    db.set_settings({"grammar_progress": {"en-ar/one": {"at": 100, "right": 3, "of": 4}}})
    # The page read the setting before the sync brought lesson one, and saves lesson two.
    s = client.patch("/api/settings", json={"grammar_progress": {"en-ar/two": {"at": 200, "right": 4, "of": 4}}}).json()
    assert s["grammar_progress"] == {"en-ar/one": {"at": 100, "right": 3, "of": 4}, "en-ar/two": {"at": 200, "right": 4, "of": 4}}


def test_lessons_done_travel_between_devices(world):
    drive, a, b = world
    with a:
        db.set_settings({"grammar_progress": {"en-ar/nouns-the": {"at": 100, "right": 4, "of": 4}}})
    a.sync(drive)
    b.sync(drive)
    with b:
        assert db.get_setting("grammar_progress") == {"en-ar/nouns-the": {"at": 100, "right": 4, "of": 4}}
        db.set_settings({"grammar_progress": grammar.merge_progress(db.get_setting("grammar_progress"),
                                                                    {"en-ar/gender": {"at": 200, "right": 3, "of": 4}})})
    assert b.sync(drive).library_uploaded
    a.sync(drive)
    with a:
        assert set(db.get_setting("grammar_progress")) == {"en-ar/nouns-the", "en-ar/gender"}
    assert not a.sync(drive).library_uploaded and not b.sync(drive).library_uploaded


def test_a_library_from_before_the_grammar_courses_is_not_a_difference(world):
    drive, a, _ = world
    a.sync(drive)
    lib = engine._ungz(drive.by_name(engine.LIBRARY)["data"])
    assert lib["grammar"] == {}
    old = {k: v for k, v in lib.items() if k != "grammar"}
    assert engine._content(old) == engine._content(lib)
