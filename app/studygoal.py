"""The long-term goal on the Vocab page: the setting "study_goal", the computer's copy of
web/js/review/goalsetting.js (tests/fixtures/studygoal_cases.json is run against both, so they stay the same).

{"at": <ms, when it was last changed>, "goal": None | {"measure": "learned" | "reviews" | "minutes",
"target": 1..1 000 000, "start": <day number>, "end": <day number, start..start+366>, "made": <ms>}}

The numbers shown with it are worked out in the page from the answer log; here the setting is only kept
tidy and synced between devices, where the one changed last wins (mobile/src/js/sync.js does the same).
"""

from __future__ import annotations

import math
import re
from typing import Any

MEASURES = ("learned", "reviews", "minutes")
MAX_TARGET = 1_000_000
MAX_DAYS = 366
RATE_PERS = ("day", "week", "month")
MAX_RATE = 100_000


def _whole(x: Any) -> int | None:
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x):
        return None
    return math.floor(x)


def clean_goal(raw: Any) -> dict[str, Any] | None:
    """A goal as it may be kept, or None."""
    if not isinstance(raw, dict):
        return None
    measure = raw.get("measure") if raw.get("measure") in MEASURES else None
    target, start, end, made = (_whole(raw.get(k)) for k in ("target", "start", "end", "made"))
    if measure is None or target is None or not 1 <= target <= MAX_TARGET:
        return None
    if start is None or end is None or start <= 0 or end < start or end - start > MAX_DAYS:
        return None
    out: dict[str, Any] = {"measure": measure, "target": target, "start": start, "end": end, "made": made if made and made > 0 else 0}
    # How it was typed (prototype goal_rate): "20 a day"; the target is that worked out over start … end.
    rate = raw.get("rate") if isinstance(raw.get("rate"), dict) else None
    n = _whole(rate.get("n")) if rate else None
    if rate and rate.get("per") in RATE_PERS and n is not None and 1 <= n <= MAX_RATE:
        out["rate"] = {"per": rate["per"], "n": n}
    return out


def clean(raw: Any) -> dict[str, Any]:
    """The setting as stored and synced."""
    if not isinstance(raw, dict):
        return {"at": 0, "goal": None}
    at = _whole(raw.get("at"))
    return {"at": at if at and at > 0 else 0, "goal": clean_goal(raw.get("goal"))}


def wins(theirs: Any, mine: Any) -> bool:
    """Does another device's goal replace this one's? The one changed last wins."""
    return clean(theirs)["at"] > clean(mine)["at"]


# ----- one goal per language: the setting "study_goals" (web/js/review/goalsetting.js has the rules) -----
# {"goals": {<language code>: {"at", "goal"}}, "legacy": <ms>}; two devices' maps merge language by language,
# the entry changed last winning. The single goal from before ("study_goal") is left as it is, for older versions.

_LANG = re.compile(r"^[a-z]{2,3}$")


def clean_all(raw: Any) -> dict[str, Any]:
    """The per-language setting as it may be kept."""
    raw = raw if isinstance(raw, dict) else {}
    given = raw.get("goals") if isinstance(raw.get("goals"), dict) else {}
    goals = {code: clean(given[code]) for code in sorted(given) if isinstance(code, str) and _LANG.match(code)}
    legacy = _whole(raw.get("legacy"))
    return {"goals": goals, "legacy": legacy if legacy and legacy > 0 else 0}


def merge_all(mine: Any, theirs: Any) -> dict[str, Any]:
    """Two devices' maps as one: for each language the entry changed last (on a tie, `mine`); the later legacy."""
    a, b = clean_all(mine), clean_all(theirs)
    goals = dict(a["goals"])
    for code, entry in b["goals"].items():
        if code not in goals or entry["at"] > goals[code]["at"]:
            goals[code] = entry
    return clean_all({"goals": goals, "legacy": max(a["legacy"], b["legacy"])})
