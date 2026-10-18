"""The Review tab's "Send to Google Tasks" / "Send to Onyx" on the computer (app/googletasks.py)."""

import pytest

from app import db, googletasks
from app.sync import oauth

TASK = {"title": "Tamkeen review (20 min)", "notes": "42 reviews left today", "due": "2026-10-18", "minutes": 20}


class FakeResponse:
    def __init__(self, status, data=None, text=""):
        self.status_code, self._data, self.text = status, data or {}, text

    def json(self):
        return self._data


def test_google_tasks_is_asked_for_before_sending(fresh_db, monkeypatch):
    db.set_settings({"google_refresh_token": "r", "google_scopes": "https://www.googleapis.com/auth/drive.appdata"})
    with pytest.raises(googletasks.NeedsPermission):
        googletasks.send_review(TASK)
    db.set_settings({"google_refresh_token": ""})
    with pytest.raises(googletasks.TaskError):
        googletasks.send_review(TASK)


def test_one_task_a_day_updated_rather_than_added_again(fresh_db, monkeypatch):
    db.set_settings({"google_refresh_token": "r", "google_scopes": f"openid {oauth.TASKS_SCOPE}"})
    monkeypatch.setattr(oauth, "access_token", lambda force_refresh=False: "token")
    calls = []

    def post(url, json, headers, timeout):
        calls.append(("POST", url, json))
        return FakeResponse(200, {"id": "t1"})

    def patch(url, json, headers, timeout):
        calls.append(("PATCH", url, json))
        return FakeResponse(200, {"id": "t1"})

    monkeypatch.setattr(googletasks.httpx, "post", post)
    monkeypatch.setattr(googletasks.httpx, "patch", patch)
    assert googletasks.send_review(TASK) == {"updated": False}
    assert calls[0][0] == "POST" and calls[0][2]["due"] == "2026-10-18T00:00:00.000Z" and calls[0][2]["title"] == TASK["title"]
    assert googletasks.send_review({**TASK, "title": "Tamkeen review (10 min)"}) == {"updated": True}
    assert calls[1][0] == "PATCH" and calls[1][1].endswith("/t1")
    # The next day it is a new task.
    googletasks.send_review({**TASK, "due": "2026-10-19"})
    assert calls[2][0] == "POST"


def test_only_onyx_links_are_opened(monkeypatch):
    opened = []
    monkeypatch.setattr(googletasks.os, "startfile", lambda url: opened.append(url), raising=False)
    monkeypatch.setattr(googletasks.subprocess, "Popen", lambda args: opened.append(args[-1]))
    googletasks.open_onyx("onyx://task?title=Tamkeen%20review%20(20%20min)&minutes=20&due=2026-10-18&from=tamkeen")
    assert opened and opened[0].startswith("onyx://task?")
    for bad in ("https://example.com", "onyx://task?x=1 & calc.exe", "file:///c:/windows"):
        with pytest.raises(googletasks.TaskError):
            googletasks.open_onyx(bad)
