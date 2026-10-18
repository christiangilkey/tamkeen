"""The day's review session as a to-do in the learner's Google Tasks (the Review tab's "Send to
Google Tasks" button, web/js/review/sendtask.js), and the same task handed to Onyx Calendar instead
when Settings says so (an onyx:// link opened with the system, see open_onyx).

Google Tasks needs its own permission, asked for the first time the button is used (sign-in with
`oauth.TASKS_SCOPE` added to what was granted). One task a day: sending again the same day updates
that day's task (setting `review_task` = {"day", "id"}) instead of adding another.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from typing import Any

import httpx

from . import db
from .sync import oauth

API = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks"


class NeedsPermission(RuntimeError):
    """Google Tasks hasn't been allowed yet (or the permission was taken back)."""


class TaskError(RuntimeError):
    pass


def allowed() -> bool:
    return oauth.TASKS_SCOPE in str(db.get_setting("google_scopes") or "").split()


def clean(task: dict[str, Any]) -> dict[str, str]:
    title = " ".join(str(task.get("title") or "").split())[:200] or "Tamkeen review"
    notes = str(task.get("notes") or "")[:2000]
    due = str(task.get("due") or "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", due):
        raise TaskError("The task needs a day.")
    return {"title": title, "notes": notes, "due": due}


def send_review(task: dict[str, Any]) -> dict[str, Any]:
    """Add (or update) today's review task. Returns {"updated": bool}."""
    t = clean(task)
    if not oauth.signed_in():
        raise TaskError("Sign in with Google first (Settings → Sync with Google Drive).")
    if not allowed():
        raise NeedsPermission()
    body = {"title": t["title"], "notes": t["notes"], "due": f"{t['due']}T00:00:00.000Z", "status": "needsAction"}
    kept = db.get_setting("review_task") or {}
    headers = {"Authorization": f"Bearer {oauth.access_token()}"}
    try:
        if isinstance(kept, dict) and kept.get("day") == t["due"] and kept.get("id"):
            r = httpx.patch(f"{API}/{kept['id']}", json=body, headers=headers, timeout=30)
            if r.status_code == 200:
                return {"updated": True}
            # (Deleted in Google Tasks meanwhile: a new one is made below.)
        r = httpx.post(API, json=body, headers=headers, timeout=30)
    except httpx.HTTPError as exc:
        raise TaskError(f"Couldn't reach Google Tasks ({exc.__class__.__name__}). Check your connection.") from exc
    if r.status_code in (401, 403):
        if "insufficient" in r.text.lower() or "scope" in r.text.lower() or r.status_code == 401:
            raise NeedsPermission()
        if "has not been used" in r.text or "disabled" in r.text:
            raise TaskError("Google Tasks isn't switched on for Tamkeen's Google project yet.")
        raise TaskError(f"Google Tasks refused the task ({r.status_code}).")
    if r.status_code >= 300:
        raise TaskError(f"Google Tasks answered with an error ({r.status_code}).")
    db.set_settings({"review_task": {"day": t["due"], "id": r.json().get("id", "")}})
    return {"updated": False}


def open_onyx(url: str) -> None:
    """Hand an onyx:// link to the system, which starts (or brings up) Onyx Calendar with it."""
    if not re.fullmatch(r"onyx://[\w/?&=%.,:;+~()'*!@$-]+", url or "") or len(url) > 4000:
        raise TaskError("That isn't an Onyx link.")
    try:
        if sys.platform.startswith("win"):
            os.startfile(url)  # noqa: S606 (the system's handler for onyx:// links)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", url])
        else:
            subprocess.Popen(["xdg-open", url])
    except OSError as exc:
        raise TaskError("Onyx doesn't seem to be installed on this computer.") from exc
