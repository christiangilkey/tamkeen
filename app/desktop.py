"""Native window shell: runs the FastAPI server on a free local port inside a pywebview window.

If no native webview is available (e.g. Linux without WebKitGTK), the app opens in the
default browser instead and shuts down once the last browser tab has been closed for a while.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any

import httpx
import uvicorn

from . import events, jobs, paths
from .main import create_app, setup_logging
from .version import APP_NAME

log = logging.getLogger(__name__)


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class Server:
    def __init__(self, port: int) -> None:
        self.port = port
        config = uvicorn.Config(create_app(), host="127.0.0.1", port=port, log_level="warning",
                                log_config=None, timeout_graceful_shutdown=2)
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self.server.run, name="uvicorn", daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/"

    def start(self, timeout: float = 30) -> None:
        self.thread.start()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.server.started:
                return
            if not self.thread.is_alive():
                raise RuntimeError("The local server failed to start. See the log in the data folder.")
            time.sleep(0.05)
        raise RuntimeError("Timed out starting the local server.")

    def stop(self) -> None:
        jobs.worker.stop()
        self.server.should_exit = True
        self.thread.join(timeout=5)


def bring_forward(window: Any) -> None:
    """Put a window in front of the others (un-minimising it first if need be)."""
    try:
        if str(getattr(window, "state", "")).lower().endswith("minimized"):
            window.restore()
        window.show()  # shows and activates it (don't use on_top here: on Windows it hangs off the UI thread)
    except Exception as exc:  # e.g. the window was closed meanwhile
        log.debug("Couldn't bring a window forward: %s", exc)


class BrowserApi:
    """The only things exposed to pages shown in the Web Browser window: importing the page
    being viewed, keeping the site being viewed on the browser's start page, and handing a
    YouTube video to the app's player. (Websites can reach this object, so it must never offer
    more than that.)"""

    def __init__(self, main_window: Any = None, close_after_watch: bool = False) -> None:
        self._window: Any = None
        self._main = main_window
        self._close_after_watch = close_after_watch  # the YouTube window: done once its video is showing

    def watch_video(self, video_id: str = "", at: Any = None) -> dict[str, Any]:
        """A video was tapped on YouTube: have the app add it (captions) and show it in its
        own player, then bring the app's window forward. See web/js/youtube-browser.js.
        From Filmot's caption search results (web/js/filmot-browser.js) the moment the word is
        said comes with it, as `at` (seconds)."""
        from urllib.parse import urlsplit

        from . import youtube

        try:
            host = (urlsplit(self._window.get_current_url() or "").hostname or "").lower()
            if host not in ("youtube.com", "filmot.com", "www.filmot.com") and not host.endswith(".youtube.com"):
                return {"ok": False, "error": "Videos can only be opened from youtube.com."}
            moment = None
            if isinstance(at, (int, float)) and not isinstance(at, bool) and 0 <= at < 1_000_000:
                moment = float(at)
            result = youtube.ask_app_to_watch(str(video_id), at=moment)
        except Exception as exc:  # never let a website's oddities crash the bridge
            log.exception("Opening a YouTube video from the browser window failed")
            return {"ok": False, "error": f"Couldn't open this video ({exc.__class__.__name__})."}
        if result.get("ok") and self._main is not None:
            bring_forward(self._main)
        if result.get("ok") and self._close_after_watch:
            # A moment's wait, so this answer still reaches the page before its window goes.
            threading.Timer(0.4, self._close).start()
        return result

    def _close(self) -> None:
        try:
            self._window.destroy()
        except Exception as exc:  # e.g. already closed by hand
            log.debug("Couldn't close the browser window: %s", exc)

    def _on_youtube(self) -> bool:
        from urllib.parse import urlsplit

        host = (urlsplit(self._window.get_current_url() or "").hostname or "").lower()
        return host == "youtube.com" or host.endswith(".youtube.com")

    def following(self, name: str = "") -> dict[str, Any]:
        """Is this channel followed? (For the Follow button youtube-browser.js shows on a channel's page.)"""
        from . import db, youtube

        try:
            return {"following": self._on_youtube() and youtube.is_followed(db.get_setting("youtube_follows"), name)}
        except Exception:
            return {"following": False}

    def follow_channel(self, name: str = "", channel_id: str = "", image: str = "", on: bool = True) -> dict[str, Any]:
        """Follow (or stop following) the channel whose page is showing: the same list as the
        player's Follow button (the setting `youtube_follows`)."""
        from . import db, sync, youtube

        try:
            if not self._on_youtube():
                return {"ok": False, "error": "Channels can only be followed from youtube.com."}
            name = " ".join(str(name or "").split())
            if not name:
                return {"ok": False, "error": "Couldn't tell which channel this is."}
            from . import languages

            follows = youtube.set_follow(db.get_setting("youtube_follows"),
                                         {"name": name, "id": channel_id, "image": image, "lang": languages.study()},
                                         bool(on), time.time())
            db.set_settings({"youtube_follows": follows})
        except Exception as exc:  # never let a website's oddities crash the bridge
            log.exception("Following a channel from the browser window failed")
            return {"ok": False, "error": f"Couldn't follow this channel ({exc.__class__.__name__})."}
        events.publish("feeds", {"refreshed": True})  # an open Library redraws its channel bar
        sync.request(30)
        return {"ok": True, "following": youtube.is_followed(follows, name)}

    def _site(self) -> str:
        """The address of the website being shown ("" on the app's own start page). It is read
        from the window, never taken from the page, so a site can only ever save itself."""
        from urllib.parse import urlsplit

        url = self._window.get_current_url() or ""
        host = (urlsplit(url).hostname or "").lower()
        return "" if host in ("127.0.0.1", "localhost", "") else url

    def site_saved(self) -> dict[str, Any]:
        """Is the site being shown on the browser's start page? (For the star in the bar.)"""
        from . import db, pages

        try:
            return {"saved": pages.is_saved(db.get_setting("browser_sites"), self._site())}
        except Exception:
            return {"saved": False}

    def save_site(self, title: str = "") -> dict[str, Any]:
        """The star in the bar was pressed: put this site on the start page, or take it off."""
        from . import db, pages, sync

        try:
            url = self._site()
            if not pages.site_key(url):
                return {"ok": False, "error": "This page can't be saved."}
            sites = db.get_setting("browser_sites")
            on = not pages.is_saved(sites, url)
            db.set_settings({"browser_sites": pages.set_site(sites, url, str(title or ""), on, time.time())})
            sync.request(30)
        except Exception as exc:  # never let a website's oddities crash the bridge
            log.exception("Saving a site to the start page failed")
            return {"ok": False, "error": f"Couldn't save this site ({exc.__class__.__name__})."}
        return {"ok": True, "saved": on}

    def import_page(self) -> dict[str, Any]:
        from . import pages, sync

        try:
            script = ("(function(){" + pages.extractor_source()
                      + "\nreturn JSON.stringify(extractArticle(document, location.href));})()")
            article = json.loads(self._window.evaluate_js(script) or "null")
            if not article:
                return {"ok": False, "error": "This page couldn't be read."}
            ep = pages.save_page(article.get("url") or "", article.get("title") or "", article.get("blocks") or [],
                                 article.get("image"), article.get("site"))
        except pages.PageError as exc:
            return {"ok": False, "error": str(exc)}
        except Exception as exc:  # never let a website's oddities crash the bridge
            log.exception("Importing a page from the browser window failed")
            return {"ok": False, "error": f"Couldn't import this page ({exc.__class__.__name__})."}
        events.publish("feeds", {"refreshed": True})
        sync.request()
        return {"ok": True, "title": ep["title"], "words": ep["words"]}


class JsApi:
    """Exposed to the page as window.pywebview.api (native save dialogs for exports).

    Attributes must stay private (underscore): pywebview walks every public attribute of
    this object to build the JS bridge, and walking the native window object recurses forever.
    """

    def __init__(self, server: Server) -> None:
        self._server = server
        self._window: Any = None
        self._youtube: Any = None  # the browser window opened by "Open YouTube", while it lives
        self._youtube_start = ""   # the address that window was last sent to

    def _browser_window(self, title: str, start: str, close_after_watch: bool = False) -> Any:
        """A web browser window. Every page in it gets the bottom bar with "Import Page"
        (web/js/browser-toolbar.js) and, on youtube.com, tap-a-video-to-watch-it-in-the-app
        (web/js/youtube-browser.js); on filmot.com, the same for its caption search results
        (web/js/filmot-browser.js). `close_after_watch`: the window closes itself once a video
        tapped in it is showing in the app's player."""
        import webview

        scripts = [(paths.web_dir() / "js" / name).read_text(encoding="utf-8")
                   for name in ("browser-toolbar.js", "youtube-browser.js", "filmot-browser.js")]
        api = BrowserApi(self._window, close_after_watch)
        window = webview.create_window(f"{title} · {APP_NAME}", start, js_api=api,
                                       width=1200, height=820, min_size=(640, 480), text_select=True)
        api._window = window

        def add_scripts() -> None:
            for script in scripts:
                try:
                    window.evaluate_js(script)
                except Exception as exc:  # e.g. the window closed while a page was loading
                    log.debug("Couldn't add a browser script: %s", exc)

        window.events.loaded += add_scripts
        return window

    def open_browser(self, url: str = "") -> dict[str, Any]:
        """Open a web browser window with an "Import Page" button."""
        from . import pages

        try:
            # Nothing typed: the start page (news in the study language and a search box).
            typed = (url or "").strip()
            self._browser_window("Web Browser",
                                 pages.browser_start(typed) if typed else pages.browser_home(self._server.url))
        except Exception as exc:
            log.exception("Couldn't open the browser window")
            return {"ok": False, "error": f"Couldn't open the browser window ({exc})."}
        return {"ok": True}

    def open_youtube(self, start: str = "") -> dict[str, Any]:
        """Open YouTube in a browser window (or bring back the one already open). Tapping a
        video there opens it in the app's own player. `start` is the YouTube address to open
        on: what is popular in the study language (worked out by web/js/youtube-home.js)."""
        import webview

        from . import youtube

        try:
            address = youtube.start_address(start)
            if self._youtube is not None and self._youtube in webview.windows:
                if address != self._youtube_start:  # another country (or language) was chosen meanwhile
                    self._youtube.load_url(address)
                bring_forward(self._youtube)
            else:
                self._youtube = self._browser_window("YouTube", address, close_after_watch=True)
            self._youtube_start = address
        except Exception as exc:
            log.exception("Couldn't open the YouTube window")
            return {"ok": False, "error": f"Couldn't open the YouTube window ({exc})."}
        return {"ok": True}

    def save_file(self, url: str, filename: str) -> dict[str, Any]:
        import webview

        result = self._window.create_file_dialog(webview.SAVE_DIALOG, save_filename=filename)
        if not result:
            return {"ok": False, "cancelled": True}
        target = Path(result if isinstance(result, str) else result[0])
        with httpx.stream("GET", self._server.url.rstrip("/") + url, timeout=None) as resp:
            if resp.status_code >= 400:
                return {"ok": False, "error": resp.read().decode("utf-8", "replace")}
            with open(target, "wb") as fh:
                for chunk in resp.iter_bytes(1 << 16):
                    fh.write(chunk)
        return {"ok": True, "path": str(target)}


def _browser_mode(server: Server) -> None:
    webbrowser.open(server.url)
    log.info("Running in browser mode at %s", server.url)
    # Quit once no browser tab has been connected for 60 s (after the first one connected).
    seen_client = False
    try:
        while True:
            time.sleep(2)
            if events.client_count() > 0:
                seen_client = True
            elif seen_client and events.seconds_since_last_client() > 60:
                break
    except KeyboardInterrupt:
        pass


def run(browser: bool = False, port: int | None = None, headless: bool = False) -> None:
    setup_logging()
    os.environ["APS_DESKTOP"] = "0" if browser or headless else "1"
    server = Server(port or free_port())
    server.start()
    log.info("Server listening on %s", server.url)
    try:
        from . import companion

        companion.write_info(server.port)  # so the Anki add-on can find this run of the app
    except Exception:  # never let the companion stop the app from opening
        log.exception("Couldn't write the companion file")
    try:
        if headless:
            print(f"Serving on {server.url} (Ctrl+C to stop)", flush=True)
            try:
                while server.thread.is_alive():
                    time.sleep(0.5)
            except KeyboardInterrupt:
                pass
            return
        if browser:
            _browser_mode(server)
            return
        try:
            import webview
        except Exception as exc:
            log.warning("pywebview unavailable (%s); falling back to the browser.", exc)
            os.environ["APS_DESKTOP"] = "0"
            _browser_mode(server)
            return
        api = JsApi(server)
        window = webview.create_window(APP_NAME, server.url, js_api=api, width=1280, height=860,
                                       min_size=(820, 560), text_select=True)
        api._window = window
        try:
            webview.start(private_mode=False, storage_path=str(paths.data_dir() / "webview"))
        except Exception as exc:
            log.warning("Native window failed (%s); falling back to the browser.", exc)
            os.environ["APS_DESKTOP"] = "0"
            _browser_mode(server)
    finally:
        server.stop()
