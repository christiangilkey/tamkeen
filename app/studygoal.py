"""The long-term goal on the Vocab page: the setting "study_goal", the computer's copy of
web/js/review/goalsetting.js (tests/fixtures/studygoal_cases.json is run against both, so they stay the same).

{"at": <ms, when it was last changed>, "goal": None | {"measure": "learned" | "reviews" | "minutes",
"target": 1..1 000 000, "start": <day number>, "end": <day number, start..start+366>, "made": <ms>}}

The numbers shown with it are worked out in the page from the answer log; here the setting is only kept
tidy and synced between devices, where the one changed last wins (mobile/src/js/sync.js does the same).
"""

from __future__ import annotations

import math
from typing import Any

MEASURES = ("learned", "reviews", "minutes")
MAX_TARGET = 1_000_000
MAX_DAYS = 366


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
    return {"measure": measure, "target": target, "start": start, "end": end, "made": made if made and made > 0 else 0}


def clean(raw: Any) -> dict[str, Any]:
    """The setting as stored and synced."""
    if not isinstance(raw, dict):
        return {"at": 0, "goal": None}
    at = _whole(raw.get("at"))
    return {"at": at if at and at > 0 else 0, "goal": clean_goal(raw.get("goal"))}


def wins(theirs: Any, mine: Any) -> bool:
    """Does another device's goal replace this one's? The one changed last wins."""
    return clean(theirs)["at"] > clean(mine)["at"]
