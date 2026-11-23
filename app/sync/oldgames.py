"""Older copies of the creature game, from the older versions Google Drive keeps of library.json.gz.

For "Find an older game" (web/js/game/oldgames-ui.js), which brings one back by combining it with the game as it
is now (web/js/game/merge.js, gamemerge.py). The phones and the web app read Drive themselves and give the same
answers (mobile/src/js/oldgames-drive.js). Only the game is taken from an old version: its words and library are
never read into the app.
"""

from __future__ import annotations

import calendar
import gzip
import json
import re
import time
from typing import Any

from . import oauth
from .drive import DriveError, GoogleDrive

LIBRARY = "library.json.gz"
_REV = re.compile(r"^[\w.~-]{1,200}$")


def _at(stamp: Any) -> float:
    """Drive's RFC 3339 time ("2026-11-20T08:15:00.123Z") as seconds."""
    try:
        return float(calendar.timegm(time.strptime(str(stamp)[:19], "%Y-%m-%dT%H:%M:%S")))
    except (TypeError, ValueError):
        return 0.0


def _library_id(drive: Any) -> str:
    return next((f["id"] for f in drive.list() if f.get("name") == LIBRARY), "")


def versions(drive: Any) -> list[dict[str, Any]]:
    file_id = _library_id(drive)
    if not file_id:
        return []
    return [{"id": str(r.get("id")), "at": _at(r.get("modifiedTime")), "size": int(r.get("size") or 0)}
            for r in drive.revisions(file_id) if r.get("id")]


def version(drive: Any, rev: str) -> dict[str, Any]:
    if not _REV.match(rev or ""):
        raise ValueError("That isn't a version of your game.")
    file_id = _library_id(drive)
    if not file_id:
        raise ValueError("Your game isn't in Google Drive yet.")
    data = json.loads(gzip.decompress(drive.download_revision(file_id, rev)))
    game = data.get("game") if isinstance(data, dict) else None
    return {"id": rev, "game": game if isinstance(game, dict) else None}


def _open() -> GoogleDrive:
    return GoogleDrive(lambda force: oauth.access_token(force))


def list_for_page() -> dict[str, Any]:
    if not oauth.signed_in():
        return {"signed_in": False, "versions": []}
    drive = _open()
    try:
        return {"signed_in": True, "versions": versions(drive)}
    finally:
        drive.close()


def get_for_page(rev: str) -> dict[str, Any]:
    if not oauth.signed_in():
        raise DriveError("Sign in with Google in Settings first: the older copies are in your Google Drive.")
    drive = _open()
    try:
        return version(drive, rev)
    finally:
        drive.close()
