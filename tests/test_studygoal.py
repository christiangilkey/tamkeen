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
