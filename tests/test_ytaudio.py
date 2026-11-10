"""The desktop app puts web/js/yt-audio-frame.js into every frame of its window (YouTube's embedded player
included), once, so a YouTube video plays its dubbed soundtrack in the language being learned."""
from __future__ import annotations

from typing import Any


class _Event:
    def __init__(self) -> None:
        self.handlers: list[Any] = []

    def __iadd__(self, fn: Any) -> "_Event":
        self.handlers.append(fn)
        return self

    def fire(self) -> None:
        for fn in self.handlers:
            fn()


class _Events:
    def __init__(self) -> None:
        self.loaded = _Event()


class _Window:
    def __init__(self) -> None:
        self.events = _Events()
        self.native = None


def test_the_script_is_added_once_on_the_first_page(monkeypatch):
    from app import desktop

    added: list[str] = []
    monkeypatch.setattr(desktop, "add_frame_script", lambda window, source: added.append(source) or True)
    window = _Window()
    desktop.add_youtube_audio_script(window)
    assert added == [], "nothing until the window has loaded a page"
    window.events.loaded.fire()
    window.events.loaded.fire()  # every later page: already in place
    assert len(added) == 1
    assert "tamkeen_audio" in added[0] and "setAudioTrack" in added[0]


def test_no_native_window_no_script():
    from app import desktop

    assert desktop.add_frame_script(_Window(), "true") is False
