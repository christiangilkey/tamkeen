"""The day's review session as an event in the learner's Google Calendar (the Review tab's "Send to
Google Calendar", web/js/review/calpopup.js): today, at the time chosen in the popup, in the
computer's time zone, as long as Tamkeen's estimate. The phone's and web app's twin is
mobile/src/js/googlecalendar.js (with the same rules in web/js/review/eventtime.js).

Google Calendar needs its own permission, asked for the first time the button is used (sign-in with
`oauth.CALENDAR_SCOPE` added to what was granted). One event a day: sending again the same day moves
or updates that day's event (setting `review_event` = {"day", "id"}) instead of adding another; if it
was deleted in Google Calendar meanwhile, a new one is added.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

import httpx

from . import db
from .sync import oauth

API = "https://www.googleapis.com/calendar/v3/calendars/primary/events"


class NeedsPermission(RuntimeError):
    """Google Calendar hasn't been allowed yet (or the permission was taken back)."""


class CalendarError(RuntimeError):
    pass


def allowed() -> bool:
    return oauth.CALENDAR_SCOPE in str(db.get_setting("google_scopes") or "").split()


def event_body(task: dict[str, Any]) -> dict[str, Any]:
    """The Calendar API's event for today's review: {title, notes, due "YYYY-MM-DD", minutes, id,
    time "HH:MM", time_zone}. Starts on `due` at `time` (wall-clock time in `time_zone`)."""
    due = str(task.get("due") or "")
    time = str(task.get("time") or "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", due):
        raise CalendarError("The task needs a day.")
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", time):
        raise CalendarError("Choose a time.")
    try:
        minutes = min(600, max(1, round(float(task.get("minutes") or 1))))
    except (TypeError, ValueError):
        minutes = 1
    zone = str(task.get("time_zone") or "")
    if not re.fullmatch(r"[A-Za-z0-9_+\-/]{1,64}", zone):
        zone = "UTC"
    start = datetime.strptime(f"{due} {time}", "%Y-%m-%d %H:%M")
    end = start + timedelta(minutes=minutes)
    fmt = "%Y-%m-%dT%H:%M:00"
    return {
        "summary": " ".join(str(task.get("title") or "").split())[:200] or "Tamkeen review",
        "description": str(task.get("notes") or "")[:2000],
        "start": {"dateTime": start.strftime(fmt), "timeZone": zone},
        "end": {"dateTime": end.strftime(fmt), "timeZone": zone},
        "extendedProperties": {"private": {"tamkeen": str(task.get("id") or f"tamkeen-review-{due}")}},
    }


def event_action(kept: Any, day: str) -> dict[str, str]:
    """Update today's event if one was sent today, otherwise add one."""
    if isinstance(kept, dict) and kept.get("day") == day and kept.get("id"):
        return {"method": "PATCH", "id": str(kept["id"])}
    return {"method": "POST"}


def patch_kept(status: int, event: Any) -> bool:
    """Was today's event updated? Not when Google says it is gone (404/410) or it was deleted in
    Google Calendar (still found, but "cancelled"): then a new one is added."""
    return 200 <= status < 300 and not (isinstance(event, dict) and event.get("status") == "cancelled")


def send_review(task: dict[str, Any]) -> dict[str, Any]:
    """Add (or move) today's review event. Returns {"updated": bool}."""
    body = event_body(task)
    due = str(task["due"])
    if not oauth.signed_in():
        raise CalendarError("Sign in with Google first (Settings → Sync with Google Drive).")
    if not allowed():
        raise NeedsPermission()
    headers = {"Authorization": f"Bearer {oauth.access_token()}"}
    action = event_action(db.get_setting("review_event"), due)
    try:
        if action["method"] == "PATCH":
            r = httpx.patch(f"{API}/{action['id']}", json=body, headers=headers, timeout=30)
            try:
                found = r.json() if r.status_code < 300 else None
            except ValueError:
                found = None
            if patch_kept(r.status_code, found):
                return {"updated": True}
            # (Deleted in Google Calendar meanwhile: a new one is added below.)
        r = httpx.post(API, json=body, headers=headers, timeout=30)
    except httpx.HTTPError as exc:
        raise CalendarError(f"Couldn't reach Google Calendar ({exc.__class__.__name__}). Check your connection.") from exc
    if r.status_code in (401, 403):
        text = r.text
        if r.status_code == 403 and re.search(r"has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED", text):
            raise CalendarError("The Google Calendar API isn't switched on for Tamkeen's Google project yet.")
        if r.status_code == 401 or re.search(r"insufficient|scope", text, re.I):
            raise NeedsPermission()
        raise CalendarError(f"Google Calendar refused the event ({r.status_code}).")
    if r.status_code >= 300:
        raise CalendarError(f"Google Calendar answered with an error ({r.status_code}).")
    db.set_settings({"review_event": {"day": due, "id": r.json().get("id", "")}})
    return {"updated": False}
