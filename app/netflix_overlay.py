"""The window a Netflix title plays in on the computer (Windows), laid exactly over the player's stage.

Netflix's video is copy-protected, so it can only play in Netflix's own web player. This module keeps
one frameless window showing that player (netflix.com/watch/<id>) and makes it look like part of the
app's page:
    - it is *owned* by the app's main window (WinForms `Owner`), so it always sits just above it but
      never above other programs, has no taskbar button, and minimises and comes back with it;
    - it never takes the keyboard (pywebview's focus=False, WS_EX_NOACTIVATE): Space, the arrow keys
      and the word popup keep working in the app's page, which drives the player;
    - it is moved and sized to the stage's box, which the page reports (web/js/nfmedia.js) whenever
      the box changes, and again whenever the main window moves or is resized; a part of the box
      outside the main window's page is clipped away (SetWindowRgn);
    - it is hidden while the page says something covers the stage (a box, a menu) or the player
      isn't showing, and while Netflix's page has no video to show (loading, a sign-in page);
    - web/js/netflix-player.js, run inside Netflix's page, hides Netflix's own controls and
      subtitles, switches the subtitles (and, when there is one, the soundtrack) to the language
      being learned, and answers the app's play / pause / seek and "where are you?".
The subtitle files Netflix downloads are noticed here (the window's `response_received`) and handed
to app/netflix.py.

Every call comes from the app's page through JsApi in app/desktop.py.
"""

from __future__ import annotations

import ctypes
import json
import logging
import math
import sys
import threading
from typing import Any

try:
    from ctypes import wintypes
except (ImportError, ValueError):  # not Windows: the video window isn't offered there (supported())
    wintypes = None  # type: ignore[assignment]

from . import languages, netflix, paths
from .version import APP_NAME

log = logging.getLogger(__name__)

RELEASE_PAUSE = 0.8   # seconds after the page let go of the player: paused and hidden (unless taken back)
RELEASE_CLOSE = 30.0  # and this long after that: the window closes (so coming straight back is quick)
COMMANDS = {"play", "pause", "seek", "rate", "continue"}

SW_HIDE = 0
SW_SHOWNOACTIVATE = 4
SWP_NOZORDER = 0x0004
SWP_NOACTIVATE = 0x0010
SWP_NOOWNERZORDER = 0x0200
GWL_EXSTYLE = -20
WS_EX_TOOLWINDOW = 0x00000080
WS_EX_APPWINDOW = 0x00040000
WS_EX_NOACTIVATE = 0x08000000
DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWCP_DONOTROUND = 1


def supported() -> bool:
    """The video window is built on WinForms' window ownership: Windows only, for now."""
    return sys.platform == "win32"


class _Win32:
    """The few Windows calls needed, with their own prototypes (pywebview uses ctypes.windll.user32
    with none, so these are kept apart from its functions)."""

    def __init__(self) -> None:
        u = ctypes.WinDLL("user32", use_last_error=True)
        g = ctypes.WinDLL("gdi32", use_last_error=True)
        self.dwm = ctypes.WinDLL("dwmapi")
        H = wintypes.HWND
        u.ClientToScreen.argtypes = [H, ctypes.POINTER(wintypes.POINT)]
        u.GetClientRect.argtypes = [H, ctypes.POINTER(wintypes.RECT)]
        u.SetWindowPos.argtypes = [H, H, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
        u.ShowWindow.argtypes = [H, ctypes.c_int]
        u.IsIconic.argtypes = [H]
        u.IsWindowVisible.argtypes = [H]
        u.GetWindowLongW.argtypes = [H, ctypes.c_int]
        u.GetWindowLongW.restype = ctypes.c_long
        u.SetWindowLongW.argtypes = [H, ctypes.c_int, ctypes.c_long]
        u.SetWindowLongW.restype = ctypes.c_long
        u.SetWindowRgn.argtypes = [H, wintypes.HRGN, wintypes.BOOL]
        g.CreateRectRgn.argtypes = [ctypes.c_int] * 4
        g.CreateRectRgn.restype = wintypes.HRGN
        g.DeleteObject.argtypes = [wintypes.HGDIOBJ]
        self.dwm.DwmSetWindowAttribute.argtypes = [H, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD]
        self.u, self.g = u, g

    def client_box(self, hwnd: int) -> tuple[int, int, int, int]:
        """The window's page area on the screen: (left, top, width, height) in the screen's pixels."""
        pt = wintypes.POINT(0, 0)
        self.u.ClientToScreen(hwnd, ctypes.byref(pt))
        rc = wintypes.RECT()
        self.u.GetClientRect(hwnd, ctypes.byref(rc))
        return pt.x, pt.y, rc.right - rc.left, rc.bottom - rc.top

    def tool_window(self, hwnd: int) -> None:
        """No taskbar button, no Alt+Tab entry, never activated by a click."""
        ex = self.u.GetWindowLongW(hwnd, GWL_EXSTYLE)
        self.u.SetWindowLongW(hwnd, GWL_EXSTYLE, (ex | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE) & ~WS_EX_APPWINDOW)
        corner = ctypes.c_int(DWMWCP_DONOTROUND)  # Windows 11 would round its corners: it must look like part of the page
        self.dwm.DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ctypes.byref(corner), ctypes.sizeof(corner))

    def place(self, hwnd: int, x: int, y: int, w: int, h: int, clip: tuple[int, int, int, int] | None) -> None:
        self.u.SetWindowPos(hwnd, None, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER)
        if clip is None:
            self.u.SetWindowRgn(hwnd, None, True)
        else:
            rgn = self.g.CreateRectRgn(*clip)
            if rgn and not self.u.SetWindowRgn(hwnd, rgn, True):
                self.g.DeleteObject(rgn)  # (once accepted, the region belongs to the window)

    def show(self, hwnd: int, on: bool) -> None:
        self.u.ShowWindow(hwnd, SW_SHOWNOACTIVATE if on else SW_HIDE)

    def minimized(self, hwnd: int) -> bool:
        return bool(self.u.IsIconic(hwnd))


def screen_box(rect: dict[str, Any], client: tuple[int, int, int, int]) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int] | None] | None:
    """Where the window goes for the stage's box: `rect` is the box in the page's own units (CSS
    pixels: x, y, w, h, and the page's size vw, vh), `client` the page area on the screen. Returns
    ((x, y, w, h) on the screen, the visible part in the window's own pixels or None when all of it
    is), or None when nothing of it can be seen. Pure, so it can be tested."""
    try:
        x, y, w, h = (float(rect[k]) for k in ("x", "y", "w", "h"))
        vw, vh = float(rect.get("vw") or 0), float(rect.get("vh") or 0)
    except (KeyError, TypeError, ValueError):
        return None
    left, top, cw, ch = client
    if vw <= 0 or vh <= 0 or w < 2 or h < 2 or cw <= 0 or ch <= 0:
        return None
    sx, sy = cw / vw, ch / vh  # page units to screen pixels (display scaling and page zoom)
    x0, y0 = left + math.floor(x * sx), top + math.floor(y * sy)
    x1, y1 = left + math.ceil((x + w) * sx), top + math.ceil((y + h) * sy)
    box = (x0, y0, x1 - x0, y1 - y0)
    # The part inside the page area (a box scrolled partly out of view is cut, not squeezed).
    vx0, vy0, vx1, vy1 = max(x0, left), max(y0, top), min(x1, left + cw), min(y1, top + ch)
    if vx1 - vx0 < 2 or vy1 - vy0 < 2:
        return None
    clip = None if (vx0, vy0, vx1, vy1) == (x0, y0, x1, y1) else (vx0 - x0, vy0 - y0, vx1 - x0, vy1 - y0)
    return box, clip


class NetflixOverlay:
    def __init__(self, main_window: Any) -> None:
        self._main = main_window
        self._win: Any = None
        self._id = ""          # the title asked for
        self._playing = ""     # the title Netflix's page says it is playing
        self._lang = ""
        self._lock = threading.RLock()
        self._rect: dict[str, Any] | None = None
        self._wanted = False   # the page wants it shown
        self._ready = False    # Netflix's page has a video to show
        self._shown = False
        self._hwnd = 0
        self._main_hwnd = 0
        self._timers: list[threading.Timer] = []
        self._hooked = False
        self._last: dict[str, Any] = {}
        self._fetched: list[str] = []
        self._api: _Win32 | None = None

    # ----- what the page asks -----

    def open(self, netflix_id: str, lang: str = "", reload: bool = False) -> dict[str, Any]:
        """Show this title (or carry on with it, if it is the one already open; `reload`: afresh)."""
        import webview

        netflix_id = netflix.clean_id(netflix_id)
        with self._lock:
            self._cancel_timers()
            self._lang = lang if languages.valid(lang) else languages.study()
            alive = self._win is not None and self._win in webview.windows
            if alive and netflix_id in (self._id, self._playing) and not reload:
                t = self._last.get("t") if isinstance(self._last.get("t"), (int, float)) else None
                return {"ok": True, "reused": True, "t": t, "paused": self._last.get("paused", True)}
            self._id = self._playing = netflix_id
            self._ready = False
            self._last = {}
            netflix.begin(netflix_id)
            if alive:
                self._apply()
                self._win.load_url(netflix.watch_url(netflix_id))
                return {"ok": True, "reused": False}
        self._hook_main()
        win = webview.create_window(f"Netflix player · {APP_NAME}", netflix.watch_url(netflix_id), frameless=True,
                                    easy_drag=False, focus=False, hidden=True, shadow=False,
                                    background_color="#000000", width=480, height=270, min_size=(40, 30))
        win.events.loaded += self._on_loaded
        win.events.response_received += self._on_response
        win.events.closed += self._on_closed
        with self._lock:
            self._win = win
        self._attach(win)
        return {"ok": True, "reused": False}

    def place(self, rect: Any) -> dict[str, Any]:
        """The stage's box (CSS pixels) and whether the page wants the video shown."""
        if not isinstance(rect, dict):
            return {"ok": False}
        with self._lock:
            self._rect = rect
            self._wanted = bool(rect.get("visible"))
            self._apply()
            return {"ok": True, "shown": self._shown}

    def do(self, command: str, value: Any = None) -> dict[str, Any]:
        """play, pause, seek (seconds), rate, continue (Netflix's "are you still watching?")."""
        if command not in COMMANDS:
            return {"ok": False, "error": "Unknown command."}
        number = float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else 0.0
        win = self._win
        if win is None or not self._page_ready(win):
            return {"ok": False, "error": "Netflix is still loading."}
        script = (f"JSON.stringify(window.__tamkeenNetflixPlayer ? window.__tamkeenNetflixPlayer.cmd("
                  f"{json.dumps(command)}, {json.dumps(number)}) : null)")
        try:
            return {"ok": True, "state": json.loads(win.evaluate_js(script) or "null")}
        except Exception as exc:  # the window closed meanwhile, or Netflix's page threw
            log.debug("Netflix command %s failed: %s", command, exc)
            return {"ok": False, "error": "Netflix didn't answer."}

    def state(self) -> dict[str, Any]:
        """Where Netflix's player is, what it chose, and whether it needs the user (signing in…)."""
        win = self._win
        if win is None:
            return {"ok": False, "gone": True}
        if not self._page_ready(win):
            return {"ok": True, "loading": True, "id": self._id}
        try:
            raw = win.evaluate_js("JSON.stringify(window.__tamkeenNetflixPlayer ? window.__tamkeenNetflixPlayer.state() "
                                  ": {loading: true, page: 'loading'})")
            s = json.loads(raw or "null") or {}
        except Exception as exc:
            log.debug("Couldn't read Netflix's player: %s", exc)
            return {"ok": True, "loading": True, "id": self._id}
        if not isinstance(s, dict):
            s = {}
        playing = s.get("id") if isinstance(s.get("id"), str) and s.get("id", "").isdigit() else ""
        with self._lock:
            if playing and playing != self._playing:  # Netflix went on to another title (the next episode)
                self._playing = playing
                netflix.begin(playing)
            self._last = s
            self._ready = bool(s.get("video")) and s.get("page") == "watch" and not s.get("error")
            self._apply()
        subs = s.get("subs") if isinstance(s.get("subs"), dict) else {}
        if playing and subs.get("status") in ("chosen", "none", "image"):
            netflix.note_choice(playing, str(subs["status"]), str(subs.get("bcp47") or ""), self._lang)
        return {"ok": True, **s, "shown": self._shown}

    def release(self) -> dict[str, Any]:
        """The player page closed. Unless it opens again at once (it is drawn afresh when the
        subtitles arrive), the video pauses and hides, and later its window closes."""
        with self._lock:
            self._cancel_timers()
            self._timers = [threading.Timer(RELEASE_PAUSE, self._pause_and_hide),
                            threading.Timer(RELEASE_PAUSE + RELEASE_CLOSE, self.close)]
            for t in self._timers:
                t.daemon = True
                t.start()
        return {"ok": True}

    def close(self) -> None:
        with self._lock:
            win = self._win
            self._cancel_timers()
        if win is not None:
            try:
                win.destroy()
            except Exception as exc:
                log.debug("Couldn't close the Netflix window: %s", exc)

    # ----- the window -----

    def _cancel_timers(self) -> None:
        for t in self._timers:
            t.cancel()
        self._timers = []

    def _pause_and_hide(self) -> None:
        with self._lock:
            self._wanted = False
            self._apply()
        self.do("pause")

    @staticmethod
    def _page_ready(win: Any) -> bool:
        ready = getattr(win.events, "_pywebviewready", None)
        return bool(ready is not None and ready.is_set())

    def _attach(self, win: Any) -> None:
        """Make the window the main window's own, without a taskbar button (on the UI thread)."""
        from System import Func, Type  # pythonnet: pywebview's WinForms side is already loaded

        form, owner = win.native, self._main.native

        def apply() -> None:
            form.Owner = owner
            hwnd = int(form.Handle.ToInt64())
            self._win32().tool_window(hwnd)
            with self._lock:
                self._hwnd = hwnd
                self._main_hwnd = int(owner.Handle.ToInt64())

        owner.Invoke(Func[Type](apply))

    def _win32(self) -> _Win32:
        if self._api is None:
            self._api = _Win32()
        return self._api

    def _apply(self) -> None:
        """Put the window where the stage is, or hide it. (Called with the lock held.)"""
        if not self._hwnd or not self._main_hwnd:
            return
        api = self._win32()
        if api.minimized(self._main_hwnd):
            return  # Windows hides it with its owner and brings it back with it
        place = screen_box(self._rect, api.client_box(self._main_hwnd)) if self._rect else None
        if not (self._wanted and self._ready and place):
            if self._shown:
                api.show(self._hwnd, False)
                self._shown = False
            return
        (x, y, w, h), clip = place
        api.place(self._hwnd, x, y, w, h, clip)
        if not self._shown:
            api.show(self._hwnd, True)
            self._shown = True

    def _hook_main(self) -> None:
        if self._hooked:
            return
        self._hooked = True
        for name in ("moved", "resized", "restored", "maximized"):
            getattr(self._main.events, name).__iadd__(self._follow)

    def _follow(self, *_args: Any) -> None:
        with self._lock:
            self._apply()

    def _on_loaded(self) -> None:
        win = self._win
        if win is None:
            return
        cfg = {"lang": self._lang, "hosts": sorted(netflix.hosts())}
        try:
            scripts = [(paths.web_dir() / "js" / name).read_text(encoding="utf-8")
                       for name in ("netflix-common.js", "netflix-player.js")]
            win.evaluate_js(f"window.__tamkeenNetflixCfg = {json.dumps(cfg)};\n" + "\n;".join(scripts))
        except Exception as exc:  # e.g. the window closed while loading
            log.debug("Couldn't add the Netflix player script: %s", exc)

    def _on_response(self, response: Any) -> None:
        """Every download of the window: a subtitle file is fetched once more and read."""
        try:
            url = str(getattr(response, "url", "") or "")
            if not netflix.is_subtitle_download(url, getattr(response, "headers", None)):
                return
            if int(getattr(response, "status_code", 200) or 200) >= 400:
                return
            with self._lock:
                if url in self._fetched:
                    return
                self._fetched = (self._fetched + [url])[-40:]
                # The title in the window's address now (Netflix may just have moved on to an episode).
                title = self._current_id() or self._playing or self._id
                lang = self._lang
            if not title:
                return
            body = netflix.download(url)
            if netflix.offer_file(title, body, lang):
                log.info("Netflix subtitle file for %s noticed (%d bytes)", title, len(body))
        except Exception as exc:  # a download that wasn't a subtitle file after all, or the network
            log.debug("Ignoring a Netflix download: %s", exc)

    def _current_id(self) -> str:
        """The title number in the window's address (read without waiting for a page to load)."""
        win = self._win
        try:
            return netflix.watch_id(win.gui.get_current_url(win.uid) or "") if win is not None else ""
        except Exception:
            return ""

    def _on_closed(self) -> None:
        with self._lock:
            self._win = None
            self._hwnd = 0
            self._shown = False
            self._ready = False
            self._id = self._playing = ""
            self._last = {}
            self._cancel_timers()


_overlay: NetflixOverlay | None = None
_overlay_lock = threading.Lock()


def get(main_window: Any) -> NetflixOverlay:
    """The one video window of this run (made on first use)."""
    global _overlay
    with _overlay_lock:
        if _overlay is None:
            _overlay = NetflixOverlay(main_window)
        return _overlay
