"""The game controller's buttons (Settings → Controller): the setting "controller_map".

It holds only what the learner changed from the defaults, and when:
{"at": <ms>, "map": {<area>: {<action>: <input> | ""}}}. The areas, actions and inputs are defined in
web/js/padmap.js (the controller is read in the web page); here it is only kept tidy and synced
between devices, where the one changed last wins (mobile/src/js/sync.js does the same).
"""

from __future__ import annotations

import re
from typing import Any

# The screens (padmap.js AREAS). An area a newer version has is kept as well, like an action this
# version doesn't know: it does nothing here, and isn't lost when this device saves the setting.
AREAS = ("video", "popup", "review", "reader", "home", "library", "lesson", "vocab", "friends",
         "settings", "dialog", "typing", "general")
_INPUT = re.compile(r"^(?:b\d{1,2}|a\d{1,2}[+-])$")
_ACTION = re.compile(r"^[A-Za-z0-9]{1,32}$")
_AREA = re.compile(r"^[a-z][A-Za-z0-9]{0,31}$")


def clean(raw: Any) -> dict[str, Any]:
    """The setting as it may be stored: anything that isn't an input left out."""
    if not isinstance(raw, dict):
        return {"at": 0, "map": {}}
    at = raw.get("at")
    at = int(at) if isinstance(at, (int, float)) and not isinstance(at, bool) and at > 0 else 0
    out: dict[str, dict[str, str]] = {}
    given = raw.get("map") if isinstance(raw.get("map"), dict) else {}
    for area, mine in given.items():
        if not isinstance(area, str) or not _AREA.match(area):
            continue
        if not isinstance(mine, dict):
            continue
        for action, value in mine.items():
            if isinstance(action, str) and _ACTION.match(action) and isinstance(value, str) and (value == "" or _INPUT.match(value)):
                out.setdefault(area, {})[action] = value
    return {"at": at, "map": out}


def wins(theirs: Any, mine: Any) -> bool:
    """Does another device's mapping replace this one? The one changed last wins."""
    return clean(theirs)["at"] > clean(mine)["at"]
