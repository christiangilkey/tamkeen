"""The Review tab's "Send to Google Calendar" on the computer (app/googlecalendar.py)."""

import pytest

from app import db, googlecalendar
from app.sync import oauth

TASK = {"title": "Tamkeen review (20 min)", "notes": "42 reviews left today", "due": "2026-10-18", "minutes": 20,
        "id": "tamkeen-review-2026-10-18", "time": "19:30", "time_zone": "Europe/London"}


class FakeResponse:
    def __init__(self, status, data=None, text=""):
        self.status_code, self._data, self.text = status, data or {}, text

    def json(self):
        return self._data


def test_the_event_starts_at_the_chosen_time_and_lasts_the_estimate():
    body = googlecalendar.event_body(TASK)
    assert body["summary"] == "Tamkeen review (20 min)"
    assert body["description"] == "42 reviews left today"
    assert body["start"] == {"dateTime": "2026-10-18T19:30:00", "timeZone": "Europe/London"}
    assert body["end"] == {"dateTime": "2026-10-18T19:50:00", "timeZone": "Europe/London"}
    assert body["extendedProperties"]["private"]["tamkeen"] == "tamkeen-review-2026-10-18"
    # Late in the evening it ends the next day; an odd time zone falls back to UTC.
    late = googlecalendar.event_body({**TASK, "time": "23:45", "minutes": 30, "time_zone": "x; drop"})
    assert late["end"] == {"dateTime": "2026-10-19T00:15:00", "timeZone": "UTC"}
    for bad in ({**TASK, "time": "7pm"}, {**TASK, "time": "24:00"}, {**TASK, "due": ""}):
        with pytest.raises(googlecalendar.CalendarError):
            googlecalendar.event_body(bad)


def test_update_or_new():
    assert googlecalendar.event_action({"day": "2026-10-18", "id": "e1"}, "2026-10-18") == {"method": "PATCH", "id": "e1"}
    assert googlecalendar.event_action({"day": "2026-10-17", "id": "e1"}, "2026-10-18") == {"method": "POST"}
    assert googlecalendar.event_action({}, "2026-10-18") == {"method": "POST"}
    assert googlecalendar.patch_kept(200, {"id": "e1", "status": "confirmed"})
    assert not googlecalendar.patch_kept(200, {"id": "e1", "status": "cancelled"})  # deleted in Google Calendar
    assert not googlecalendar.patch_kept(404, None) and not googlecalendar.patch_kept(410, None)


def test_google_calendar_is_asked_for_before_sending(fresh_db):
    db.set_settings({"google_refresh_token": "r", "google_scopes": f"openid {oauth.TASKS_SCOPE}"})
    with pytest.raises(googlecalendar.NeedsPermission):
        googlecalendar.send_review(TASK)
    db.set_settings({"google_refresh_token": ""})
    with pytest.raises(googlecalendar.CalendarError):
        googlecalendar.send_review(TASK)


def test_one_event_a_day_moved_rather_than_added_again(fresh_db, monkeypatch):
    db.set_settings({"google_refresh_token": "r", "google_scopes": f"openid {oauth.CALENDAR_SCOPE}"})
    monkeypatch.setattr(oauth, "access_token", lambda force_refresh=False: "token")
    calls = []
    answers = {"PATCH": FakeResponse(200, {"id": "e1", "status": "confirmed"})}

    def post(url, json, headers, timeout):
        calls.append(("POST", url, json))
        return FakeResponse(200, {"id": f"e{len(calls)}"})

    def patch(url, json, headers, timeout):
        calls.append(("PATCH", url, json))
        return answers["PATCH"]

    monkeypatch.setattr(googlecalendar.httpx, "post", post)
    monkeypatch.setattr(googlecalendar.httpx, "patch", patch)
    assert googlecalendar.send_review(TASK) == {"updated": False}
    assert calls[0][0] == "POST" and calls[0][1].endswith("/calendars/primary/events")
    assert calls[0][2]["start"]["dateTime"] == "2026-10-18T19:30:00"
    assert db.get_setting("review_event") == {"day": "2026-10-18", "id": "e1"}
    # Again the same day, at another time: that event moves.
    assert googlecalendar.send_review({**TASK, "time": "20:00"}) == {"updated": True}
    assert calls[1][0] == "PATCH" and calls[1][1].endswith("/e1") and calls[1][2]["start"]["dateTime"] == "2026-10-18T20:00:00"
    # Deleted in Google Calendar meanwhile: a new one.
    answers["PATCH"] = FakeResponse(200, {"id": "e1", "status": "cancelled"})
    assert googlecalendar.send_review(TASK) == {"updated": False}
    assert [c[0] for c in calls[2:]] == ["PATCH", "POST"]
    assert db.get_setting("review_event") == {"day": "2026-10-18", "id": "e4"}
    # The next day it is a new event.
    googlecalendar.send_review({**TASK, "due": "2026-10-19"})
    assert calls[-1][0] == "POST"


def test_friendly_refusals(fresh_db, monkeypatch):
    db.set_settings({"google_refresh_token": "r", "google_scopes": oauth.CALENDAR_SCOPE})
    monkeypatch.setattr(oauth, "access_token", lambda force_refresh=False: "token")
    answer = {}
    monkeypatch.setattr(googlecalendar.httpx, "post", lambda url, json, headers, timeout: answer["r"])
    answer["r"] = FakeResponse(403, text="Google Calendar API has not been used in project 123 before or it is disabled.")
    with pytest.raises(googlecalendar.CalendarError, match="isn't switched on"):
        googlecalendar.send_review(TASK)
    answer["r"] = FakeResponse(403, text="Request had insufficient authentication scopes.")
    with pytest.raises(googlecalendar.NeedsPermission):
        googlecalendar.send_review(TASK)

    def offline(*a, **k):
        raise googlecalendar.httpx.ConnectError("no network")

    monkeypatch.setattr(googlecalendar.httpx, "post", offline)
    with pytest.raises(googlecalendar.CalendarError, match="Check your connection"):
        googlecalendar.send_review(TASK)


def test_the_calendar_permission_is_asked_alongside_what_was_allowed(monkeypatch):
    monkeypatch.setattr(oauth, "client_config", lambda: ("id", "secret"))
    url = oauth.begin("http://127.0.0.1:1/api/sync/callback", calendar=True)
    assert "calendar.events" in url and "include_granted_scopes=true" in url and "auth%2Ftasks" not in url
