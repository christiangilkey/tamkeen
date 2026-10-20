"""`tamkeen://watch?v=<id>` links: another app on this computer asking Tamkeen to play a YouTube video.

The link (the same on the phone, see web/js/applink.js):
    tamkeen://watch?v=<11-character YouTube id>[&t=<seconds to start at>][&from=<the app asking>]
Anything else in it is ignored, and a link without a valid video id is refused.

Onyx Calendar starts ArabicPodcastStudio.exe with the link as its only argument (and the installer
registers the `tamkeen` protocol, so a link opened anywhere does the same). Then:
  - Tamkeen not running: it starts as usual, and its page opens the video once it has loaded
    (it collects waiting links from POST /api/app/pending-links, web/js/app.js).
  - Tamkeen already running: the running one wrote `instance.json` in the data folder when it
    started (its port and a secret made fresh for that run). The new process posts the link to
    POST /api/app/open-link with that secret in a header, and exits without opening a window.
    The secret is only ever accepted in the header, never in an address, so a web page can't use
    it; and the server refuses any request that comes from a web page (main.py, same_origin_only).
    If the file is left over from a run that has ended (nothing answers), the new process starts
    normally and the file is written afresh.
"""

from __future__ import annotations

import json
import logging
import os
import re
import secrets
import threading
import time
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx

from . import events, paths
from .version import APP_NAME

log = logging.getLogger(__name__)

SCHEME = "tamkeen"
INSTANCE_FILE = "instance.json"
TOKEN_HEADER = "X-Tamkeen-Token"
HAND_OFF_TIMEOUT = 3.0
MAX_START = 1_000_000  # seconds; the same limit as a caption search's moment
_VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
_SECONDS = re.compile(r"[0-9]+(\.[0-9]+)?")
_FRIEND_ID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")  # not \d: in Python that takes other scripts' digits too

_pending: list[dict[str, Any]] = []
_lock = threading.Lock()
_token = ""  # this run's secret ("" until the server has started)
_on_link: Callable[[], None] | None = None  # brings the window forward (set by desktop.py)


def is_link(arg: str | None) -> bool:
    """Does this command-line argument look like a tamkeen:// link (valid or not)?"""
    return (arg or "").strip().lower().startswith(SCHEME + ":")


def parse(url: str | None) -> dict[str, Any] | None:
    """{"video_id", "at", "source"} for a valid tamkeen://watch link, else None.
    `at`: the second to start at (None when not given); `source`: the `from` part ("" when not given)."""
    try:
        parts = urlsplit((url or "").strip())
    except ValueError:
        return None
    if parts.scheme.lower() != SCHEME or (parts.hostname or "").lower() != "watch" or parts.path not in ("", "/"):
        return None
    query = parse_qs(parts.query)
    video_id = (query.get("v") or [""])[0]
    if not _VIDEO_ID.fullmatch(video_id):
        return None
    t = (query.get("t") or [""])[0].strip()
    at = float(t) if _SECONDS.fullmatch(t) and float(t) < MAX_START else None  # else: from the beginning
    source = re.sub(r"[^A-Za-z0-9_.-]", "", (query.get("from") or [""])[0])[:40]
    return {"video_id": video_id, "at": at, "source": source}


def parse_chat(url: str | None) -> str | None:
    """The friend's id in a tamkeen://chat/<id> link (a chat notification clicked, notify.py), else None.
    The phone reads them the same way (web/js/applink.js parseChatLink)."""
    try:
        parts = urlsplit((url or "").strip())
    except ValueError:
        return None
    if parts.scheme.lower() != SCHEME or (parts.hostname or "").lower() != "chat":
        return None
    friend = parts.path.strip("/")
    return friend.lower() if _FRIEND_ID.fullmatch(friend) else None


def parse_any(url: str | None) -> dict[str, Any] | None:
    """A watch link's {"video_id", ...}, or a chat link's {"chat": friend id}, else None."""
    if (link := parse(url)) is not None:
        return link
    friend = parse_chat(url)
    return {"chat": friend} if friend else None


# ---------------------------------------------------------------- the running app's side

def push(link: dict[str, Any]) -> None:
    """Keep a parsed link for the page to open, and tell an open page about it."""
    with _lock:
        _pending[:] = [*_pending, link][-5:]
    events.publish("app_link", {})
    show()


def show() -> None:
    """Bring the app's window forward (when there is one)."""
    if _on_link is not None:
        try:
            _on_link()
        except Exception:  # never let the window stop a link from being kept
            log.exception("Couldn't bring the window forward for a link")


def take() -> list[dict[str, Any]]:
    """The links waiting to be opened, oldest first (and forget them)."""
    with _lock:
        links = list(_pending)
        _pending.clear()
    return links


def on_link(callback: Callable[[], None] | None) -> None:
    global _on_link
    _on_link = callback


def token_ok(value: str | None) -> bool:
    return bool(_token) and secrets.compare_digest(str(value or ""), _token)


def write_instance(port: int) -> None:
    """Note this run's port and a fresh secret in the data folder, for a second launch to find."""
    global _token
    _token = secrets.token_urlsafe(24)
    info = {"port": int(port), "pid": os.getpid(), "token": _token, "written_at": time.time()}
    path = paths.data_dir() / INSTANCE_FILE
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(info), encoding="utf-8")
    os.replace(tmp, path)


def remove_instance() -> None:
    """Delete instance.json when closing, unless another run has written its own since."""
    path = paths.data_dir() / INSTANCE_FILE
    try:
        if _token and json.loads(path.read_text(encoding="utf-8")).get("token") == _token:
            path.unlink()
    except (OSError, ValueError, AttributeError):
        pass


# ---------------------------------------------------------------- a second launch's side

def read_instance() -> dict[str, Any] | None:
    try:
        info = json.loads((paths.data_dir() / INSTANCE_FILE).read_text(encoding="utf-8"))
        port, token, pid = int(info["port"]), str(info["token"]), int(info.get("pid") or 0)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None
    return {"port": port, "token": token, "pid": pid} if 0 < port < 65536 and token else None


def _allow_foreground(pid: int) -> None:
    """Windows only lets the program the user is using put a window in front. This process was just
    started by that program (Onyx), so it may pass the right on to the running Tamkeen."""
    if os.name != "nt" or pid <= 0:
        return
    try:
        import ctypes

        ctypes.windll.user32.AllowSetForegroundWindow(pid)  # type: ignore[attr-defined]
    except Exception:  # only a nicety
        pass


def hand_off(url: str, timeout: float = HAND_OFF_TIMEOUT, show: bool = True) -> bool:
    """Give the link to the Tamkeen that is already running. True if it took it (this process
    can then exit); False if none is running (start normally). With no link (`url` ""), it only
    brings that Tamkeen's window forward, or with `show` False just checks it is running."""
    info = read_instance()
    if info is None:
        return False
    _allow_foreground(info["pid"])
    try:
        resp = httpx.post(f"http://127.0.0.1:{info['port']}/api/app/open-link", json={"url": url, "show": show},
                          headers={TOKEN_HEADER: info["token"]}, timeout=timeout)
    except httpx.HTTPError as exc:
        log.info("No running %s answered (%s); starting normally.", APP_NAME, exc.__class__.__name__)
        return False
    try:
        # Even a link that isn't a valid video was taken: the running app has come forward.
        return resp.status_code == 200 and resp.json().get("app") == APP_NAME
    except (ValueError, AttributeError):
        return False  # something else is listening on that port now
