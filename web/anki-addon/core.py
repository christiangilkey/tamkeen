"""The Tamkeen companion's own logic, with no Anki imports, so it can be tested outside Anki.

The add-on keeps one small record per day: how many cards were reviewed, how many of those were
failed ("Again"), how many became mature, and how many were still due at the last count. It sends
the last few days to Tamkeen every time, so nothing is lost if Tamkeen was closed while you studied:
the totals simply arrive the next time both are open. No card text ever leaves Anki.
"""

from __future__ import annotations

import datetime
import json
import os
import urllib.request

MATURE_DAYS = 21   # Anki calls a card mature once its interval reaches three weeks
KEEP_DAYS = 8      # how many days of totals to keep and resend


def today(now: datetime.datetime | None = None) -> str:
    return (now or datetime.datetime.now()).strftime("%Y-%m-%d")


def note_answer(days: dict, day: str, ease: int, interval_before: int, interval_after: int) -> dict:
    """Count one answered card. `ease` is the button pressed (1 = Again)."""
    rec = days.setdefault(day, {"reviews": 0, "again": 0, "matured": 0, "due_left": None})
    rec["reviews"] += 1
    if ease == 1:
        rec["again"] += 1
    if interval_before < MATURE_DAYS <= interval_after:
        rec["matured"] += 1
    return rec


def set_due_left(days: dict, day: str, count: int) -> None:
    days.setdefault(day, {"reviews": 0, "again": 0, "matured": 0, "due_left": None})["due_left"] = max(0, int(count))


def prune(days: dict) -> dict:
    """Keep only the newest few days."""
    for key in sorted(days)[:-KEEP_DAYS]:
        del days[key]
    return days


def payload(days: dict) -> dict:
    return {"days": [{"day": day, **days[day]} for day in sorted(days)[-KEEP_DAYS:]]}


def load(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save(path: str, days: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(days, f)
    os.replace(tmp, path)


def endpoint(addon_dir: str) -> tuple[str, str] | None:
    """Where Tamkeen is listening right now, and the token it expects: (url, token), or None when
    Tamkeen isn't running. Tamkeen writes this to a small file in its data folder each time it starts."""
    try:
        with open(os.path.join(addon_dir, "tamkeen.json"), encoding="utf-8") as f:
            data_dir = json.load(f)["data_dir"]
        with open(os.path.join(data_dir, "companion.json"), encoding="utf-8") as f:
            info = json.load(f)
        return f"http://127.0.0.1:{int(info['port'])}/api/anki/report", str(info["token"])
    except (OSError, ValueError, KeyError, TypeError):
        return None


def post(url: str, token: str, body: dict, timeout: float = 3.0) -> bool:
    """Send the totals to Tamkeen on this computer. Returns whether it was received."""
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "X-Tamkeen-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except Exception:  # Tamkeen closed, or started on another port since: try again next time
        return False
