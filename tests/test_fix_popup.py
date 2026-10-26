"""The fix popup's button on the computer (web/js/components/fixit.js): POST /api/system/open-privacy
opens the system's own microphone page, Windows' privacy page or macOS's Privacy & Security pane. The
page's side is tests/js/fixes.test.mjs."""

from __future__ import annotations

import pytest

from app.api import system


def test_the_microphone_page_of_each_system():
    assert system.privacy_page("microphone", "win32") == "ms-settings:privacy-microphone"
    assert system.privacy_page("microphone", "darwin").startswith("x-apple.systempreferences:")
    assert system.privacy_page("microphone", "darwin").endswith("Privacy_Microphone")
    assert system.privacy_page("microphone", "linux") == ""
    assert system.privacy_page("anything else", "win32") == ""


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_opening_it_hands_the_address_to_the_system(client, monkeypatch):
    opened: list[str] = []
    monkeypatch.setattr(system.sys, "platform", "win32")
    monkeypatch.setattr(system.os, "startfile", lambda page: opened.append(page), raising=False)
    r = client.post("/api/system/open-privacy", json={"what": "microphone"})
    assert r.status_code == 200 and r.json() == {"opened": True}
    assert opened == ["ms-settings:privacy-microphone"]

    monkeypatch.setattr(system.sys, "platform", "darwin")
    monkeypatch.setattr(system.subprocess, "Popen", lambda args: opened.append(args))
    assert client.post("/api/system/open-privacy", json={"what": "microphone"}).json() == {"opened": True}
    assert opened[-1] == ["open", system.PRIVACY_PAGES["darwin"]["microphone"]]


def test_nothing_to_open_says_so(client, monkeypatch):
    monkeypatch.setattr(system.sys, "platform", "linux")
    assert client.post("/api/system/open-privacy", json={"what": "microphone"}).json() == {"opened": False}
    monkeypatch.setattr(system.sys, "platform", "win32")

    def refuse(page):
        raise OSError("no handler")

    monkeypatch.setattr(system.os, "startfile", refuse, raising=False)
    assert client.post("/api/system/open-privacy", json={"what": "microphone"}).json() == {"opened": False}
    assert client.post("/api/system/open-privacy", json={"what": "camera"}).json() == {"opened": False}
