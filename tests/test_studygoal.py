"""The long-term goal setting (app/studygoal.py) against the cases web/js/review/goalsetting.js is tested with."""

import json
from pathlib import Path

from app import studygoal

CASES = json.loads((Path(__file__).parent / "fixtures" / "studygoal_cases.json").read_text(encoding="utf-8"))


def test_clean_matches_the_page():
    for case in CASES["clean"]:
        assert studygoal.clean(case["in"]) == case["out"], case["in"]


def test_the_newer_goal_wins():
    for case in CASES["wins"]:
        assert studygoal.wins(case["theirs"], case["mine"]) is case["out"], case


def test_goals_per_language_clean_and_merge_like_the_page():
    for case in CASES["clean_all"]:
        assert studygoal.clean_all(case["in"]) == case["out"], case["in"]
    for case in CASES["merge_all"]:
        assert studygoal.merge_all(case["mine"], case["theirs"]) == case["out"], case


# ----- saved and synced: each language's goal travels on its own (app/sync/engine.py) -----

from fastapi.testclient import TestClient  # noqa: E402
import pytest  # noqa: E402

from app import db  # noqa: E402
from app.sync import engine  # noqa: E402

from test_sync import FakeDrive, world  # noqa: E402,F401  (pytest fixture)

AR = {"measure": "learned", "target": 300, "start": 20400, "end": 20429, "made": 1}
ES = {"measure": "reviews", "target": 900, "start": 20401, "end": 20460, "made": 2}


@pytest.fixture()
def client(fresh_db):
    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_a_page_saving_one_language_never_drops_another(client):
    db.set_settings({"study_goals": {"goals": {"ar": {"at": 10, "goal": AR}}}})
    # a page that read the settings before the Arabic goal arrived saves a Spanish one
    s = client.patch("/api/settings", json={"study_goals": {"goals": {"es": {"at": 11, "goal": ES}}}}).json()
    assert s["study_goals"] == {"goals": {"ar": {"at": 10, "goal": AR}, "es": {"at": 11, "goal": ES}}, "legacy": 0}


def test_two_devices_two_languages(world):
    drive, a, b = world
    with a:
        db.set_settings({"study_goals": {"goals": {"ar": {"at": 100, "goal": AR}}}})
    with b:
        db.set_settings({"study_goals": {"goals": {"es": {"at": 200, "goal": ES}}}})
    a.sync(drive)
    b.sync(drive)
    a.sync(drive)
    for dev in (a, b):
        with dev:
            assert db.get_setting("study_goals")["goals"] == {"ar": {"at": 100, "goal": AR}, "es": {"at": 200, "goal": ES}}
    # Arabic's goal removed on b: the removal wins on a; Spanish's stays
    with b:
        db.set_settings({"study_goals": studygoal.merge_all(db.get_setting("study_goals"), {"goals": {"ar": {"at": 300, "goal": None}}})})
    b.sync(drive)
    a.sync(drive)
    with a:
        goals = db.get_setting("study_goals")["goals"]
        assert goals["ar"] == {"at": 300, "goal": None} and goals["es"]["goal"] == ES
    assert not a.sync(drive).library_uploaded and not b.sync(drive).library_uploaded


def test_the_goal_from_before_is_left_for_older_versions(world):
    drive, a, _ = world
    with a:
        db.set_settings({"study_goal": {"at": 5, "goal": AR}})
    a.sync(drive)
    lib = engine._ungz(drive.by_name(engine.LIBRARY)["data"])
    assert lib["goal"] == {"at": 5, "goal": AR}  # (what an older version reads)
    assert lib["goals"] == {"goals": {}, "legacy": 0}
    old = {k: v for k, v in lib.items() if k != "goals"}  # a library from before goals per language
    assert engine._content(old) == engine._content(lib)
