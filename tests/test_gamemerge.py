"""Two copies of the creature game meeting (app/sync/gamemerge.py, the desktop's copy of web/js/game/merge.js).

Up to v0.68.0 the copy saved last replaced the other, so a copy that was behind wiped out the garden and the gym
leaders beaten as soon as it earned anything. The cases in tests/fixtures/game_merge.json are run through both.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from app import db
from app.api import system
from app.sync import gamemerge
from test_sync import world  # noqa: F401  (pytest fixture)

CASES = [case for name in ("game_merge.json", "game_merge_gifts.json")  # (the second: gifts from the creator)
         for case in json.loads((Path(__file__).parent / "fixtures" / name).read_text(encoding="utf-8"))["cases"]]


def at(state, path):
    if path == "roster#seed":
        return [c["seed"] for c in state["roster"]]
    v = state
    for k in path.split("."):
        if v is None:
            return None
        v = v[int(k)] if isinstance(v, list) else v.get(k)
    return v


@pytest.mark.parametrize("case", CASES, ids=[c["name"][:60] for c in CASES])
def test_the_same_answers_as_the_page(case):
    mine, theirs = copy.deepcopy(case["mine"]), copy.deepcopy(case["theirs"])
    keep, state = gamemerge.resolve(mine, theirs)
    assert keep == case["keep"]
    for path, want in case["expect"].items():
        assert at(state, path) == want, path
    assert mine == case["mine"] and theirs == case["theirs"], "the inputs are left as they were"
    if keep == "merged":
        assert gamemerge.resolve(copy.deepcopy(case["theirs"]), copy.deepcopy(case["mine"]))[0] == "merged"


def stale_world(drive, a, b):
    """Computer A plays on for a week; computer B, still holding last week's copy, earns a little and syncs last."""
    week_ago = {"v": 2, "xp": 1000, "coins": 50, "updated_at": 1000.0, "active": 0, "roster": [{"seed": 7, "growth": 0.1}],
                "gyms": {"beaten": 1, "wins": {"pip": 1}},
                "idle": {"glow": 90, "plots": [{"open": True, "id": "word_sprout", "tier": 1, "stored": 0}], "released": []}}
    with a:
        db.set_settings({"game_state": week_ago})
    a.sync(drive)
    b.sync(drive)
    with a:
        played = copy.deepcopy(week_ago)
        played.update(xp=4000, updated_at=2000.0, gyms={"beaten": 5, "wins": {"pip": 1, "marin": 1, "tor": 1, "volta": 1, "sola": 1}},
                      clock={"A": 30}, tally={"xp": {"_": [1000, 0], "A": [3000, 0]}, "coins": {"_": [50, 0]}, "gems": {}})
        played["idle"]["plots"][0]["tier"] = 3
        db.set_settings({"game_state": played})
    a.sync(drive)
    with b:
        behind = db.get_setting("game_state")
        assert behind["gyms"]["beaten"] == 1, "B never heard of the week's play"
        behind.update(xp=1030, updated_at=5000.0, clock={"B": 1}, tally={"xp": {"_": [1000, 0], "B": [30, 0]}, "coins": {"_": [50, 0]}, "gems": {}})
        db.set_settings({"game_state": behind})
    b.sync(drive)
    a.sync(drive)


def test_a_copy_that_was_behind_no_longer_wipes_out_the_gyms_and_the_garden(world):
    drive, a, b = world
    stale_world(drive, a, b)
    for device in (a, b):
        with device:
            game = db.get_setting("game_state")
            assert game["gyms"]["beaten"] == 5, "the gym leaders beaten stay beaten"
            assert game["idle"]["plots"][0]["tier"] == 3, "the garden's building stays built"
            assert game["xp"] == 4030, "and B's 30 XP are added, counted once"


def test_the_page_saving_an_older_copy_cannot_undo_a_sync(world):
    _, a, _ = world
    with a:
        db.set_settings({"game_state": {"xp": 900, "roster": [{"seed": 7}], "gyms": {"beaten": 6}, "clock": {"A": 9, "B": 4}, "updated_at": 50}})
        # The page still holds the copy from before a sync brought B's play, and saves it (one more save of its own).
        page = {"xp": 400, "roster": [{"seed": 7}], "gyms": {"beaten": 2}, "clock": {"A": 10, "B": 1}, "updated_at": 60}
        kept = system._patch_settings({"game_state": page})["game_state"]
        assert kept["gyms"]["beaten"] == 6 and kept["clock"]["A"] == 10, "combined, not replaced"
        # A copy that has seen everything the kept one has replaces it, as before.
        newer = {**kept, "gyms": {"beaten": 7, "wins": {}}, "clock": {**kept["clock"], "A": 11}}
        assert system._patch_settings({"game_state": newer})["game_state"]["gyms"]["beaten"] == 7
        # Settings that aren't a saved game are kept as sent.
        assert system._patch_settings({"game_state": {"level": 3}})["game_state"] == {"level": 3}
