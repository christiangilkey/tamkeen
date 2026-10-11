"""The Anki companion: letting an add-on inside Anki tell this app how the user's reviews are going.

How the two find each other, without any fixed port or account:
  - the add-on file the user downloads from Settings is built here, and carries the path of this
    app's data folder;
  - every time the app starts it writes `companion.json` there: the port it is listening on this
    time and a secret token;
  - the add-on reads that file and posts its daily totals to /api/anki/report with the token.
Only numbers arrive (cards reviewed, failed, matured, still due). No card text is ever sent.
"""

from __future__ import annotations

import io
import json
import re
import secrets
import time
import zipfile
from typing import Any

from . import db, paths
from .version import APP_NAME

KEEP_DAYS = 14
ADDON_FILE = "Tamkeen-Anki-Companion.ankiaddon"
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def token() -> str:
    """The secret the add-on must present (made on first use)."""
    value = db.get_setting("anki_token")
    if not value:
        value = secrets.token_urlsafe(24)
        db.set_settings({"anki_token": value})
    return value


def write_info(port: int) -> None:
    """Tell the add-on where this run of the app is listening."""
    info = {"app": APP_NAME, "port": int(port), "token": token(), "written_at": time.time()}
    (paths.data_dir() / "companion.json").write_text(json.dumps(info), encoding="utf-8")


def addon_zip() -> bytes:
    """The add-on as a file Anki can install (a zip with the extension .ankiaddon)."""
    source = paths.web_dir() / "anki-addon"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name in ("__init__.py", "core.py", "manifest.json"):
            z.write(source / name, name)
        z.writestr("tamkeen.json", json.dumps({"data_dir": str(paths.data_dir())}))
        z.writestr("user_files/README.txt", "Your daily totals are kept here between Anki sessions.\n")
    return buf.getvalue()


def _count(value: Any) -> int:
    try:
        return max(0, min(100000, int(value)))
    except (TypeError, ValueError):
        return 0


def record(days: Any) -> dict[str, Any]:
    """Store a report from the add-on. Totals for a day only ever go up, so a late or repeated
    report can't undo anything. Returns the stored days."""
    stored = db.get_setting("anki_days") or {}
    for d in days if isinstance(days, list) else []:
        if not isinstance(d, dict) or not _DAY.match(str(d.get("day", ""))):
            continue
        old = stored.get(d["day"], {})
        due = d.get("due_left")
        stored[d["day"]] = {
            "reviews": max(_count(d.get("reviews")), old.get("reviews", 0)),
            "again": max(_count(d.get("again")), old.get("again", 0)),
            "matured": max(_count(d.get("matured")), old.get("matured", 0)),
            "due_left": _count(due) if due is not None else old.get("due_left"),
        }
    stored = {k: stored[k] for k in sorted(stored)[-KEEP_DAYS:]}
    db.set_settings({"anki_days": stored, "anki_last_report": time.time()})
    return stored


def days() -> dict[str, Any]:
    return {"days": [{"day": k, **v} for k, v in sorted((db.get_setting("anki_days") or {}).items())],
            "last_report": db.get_setting("anki_last_report")}
