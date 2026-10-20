"""The languages being learned (Settings tiles = the top bar's switch): the computer's rules
(app/learning.py) answer the shared cases exactly like the phone's (web/js/learnlist.js), the
settings API stamps changes, and sync carries the list between devices."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import db, learning, paths

CASES = json.loads((Path(__file__).parent / "fixtures" / "learning_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES["merge"], ids=lambda c: c["why"][:50])
def test_merge_cases(case):
    assert learning.merge(case["mine"], case["theirs"]) == case["out"]


@pytest.mark.parametrize("case", CASES["take"], ids=lambda c: c["why"][:50])
def test_take_cases(case):
    assert learning.take(case["settings"], case["remote"]) == case["out"]


@pytest.mark.parametrize("case", CASES["with"], ids=lambda c: c["why"][:50])
def test_with_cases(case):
    assert learning.with_learning(case["values"], case["settings"], case["now"]) == case["out"]


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "db_path", lambda: tmp_path / "library.db")
    db.init_db(tmp_path / "library.db")
    db.set_settings({"study_language": "ar", "learning_languages": ["ar"]})
    from app.main import create_app

    return TestClient(create_app())


def test_the_settings_api_keeps_the_list_and_notes_when_each_changed(client):
    s = client.patch("/api/settings", json={"learning_languages": ["ar", "es"], "learning_times": {"es": 1}}).json()
    assert s["learning_languages"] == ["ar", "es"]
    assert s["learning_times"]["es"] > 1_600_000_000_000, "stamped by this computer's clock, not the page's"
    s = client.patch("/api/settings", json={"learning_languages": ["es"], "study_language": "es"}).json()
    assert (s["learning_languages"], s["study_language"]) == (["es"], "es")
    assert "ar" in s["learning_times"], "unticking is noted too, so other devices hear of it"
    s = client.patch("/api/settings", json={"learning_languages": []}).json()
    assert s["learning_languages"] == ["es"], "never empty: the language studied now stays"


def test_unticking_keeps_the_languages_library(client):
    with db.session() as conn:
        conn.execute("INSERT INTO vocab (text, norm, created_at, language) VALUES ('هزار', 'هزار', 1, 'ar')")
    client.patch("/api/settings", json={"learning_languages": ["es"], "study_language": "es"})
    assert client.get("/api/vocab").json() == []
    client.patch("/api/settings", json={"learning_languages": ["es", "ar"], "study_language": "ar"})
    assert [v["text"] for v in client.get("/api/vocab").json()] == ["هزار"], "back when ticked again"


def test_sync_carries_the_list_both_ways(client):
    from app.sync import engine

    client.patch("/api/settings", json={"learning_languages": ["ar", "fr"]})
    snap = engine.snapshot("pc")
    assert snap["learning"]["list"] == ["ar", "fr"] and "fr" in snap["learning"]["times"]

    # The phone unticked Arabic (later) and ticked Japanese.
    t = snap["learning"]["times"]["fr"]
    remote = {**snap, "device": "android", "learning": {"list": ["fr", "ja"], "times": {"fr": t, "ar": t + 5, "ja": t + 5}}}
    engine.merge(remote, engine.Result())
    s = db.get_settings()
    assert s["learning_languages"] == ["fr", "ja"]
    assert s["study_language"] == "fr", "Arabic was unticked there: the first one left is studied here now"
    assert engine._content(engine.snapshot("pc")) == engine._content(remote), "agreeing now: nothing to upload"


def test_a_library_file_from_before_this_changes_nothing(client):
    from app.sync import engine

    before = db.get_settings()["learning_languages"]
    old = {k: v for k, v in engine.snapshot("pc").items() if k != "learning"}
    engine.merge(old, engine.Result())
    assert db.get_settings()["learning_languages"] == before
