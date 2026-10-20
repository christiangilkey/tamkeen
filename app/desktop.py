"""Native window shell: runs the FastAPI server on a free local port inside a pywebview window.

If no native webview is available (e.g. Linux without WebKitGTK), the app opens in the
default browser instead and shuts down once the last browser tab has been closed for a while.
"""

from __future__ import annotations

import json
import re
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

from . import applink, events, jobs, paths
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


def _find_language(find: Any) -> dict[str, Any]:
    """The language a "Find in a video" search is for, as the page script expects it ({lang, values,
    names}, see languageChoices in web/js/filmot.js), keeping only short plain strings: it is written
    into a script that runs inside someone else's website."""
    ok = re.compile(r"^[A-Za-z][A-Za-z ()-]{0,39}$")
    raw = find if isinstance(find, dict) else {}
    words = lambda key: [w for w in (raw.get(key) or [])[:8] if isinstance(w, str) and ok.match(w)]  # noqa: E731
    lang = raw.get("lang")
    return {"lang": lang if isinstance(lang, str) and ok.match(lang) else "", "values": words("values"), "names": words("names")}


class BrowserApi:
    """The only things exposed to pages shown in the Web Browser window: importing the page
    being viewed, keeping the site being viewed on the browser's start page, and handing a
    YouTube video to the app's player. (Websites can reach this object, so it must never offer
    more than that.)"""

    def __init__(self, main_window: Any = None, close_after_watch: bool = False, find: bool = False) -> None:
        self._window: Any = None
        self._main = main_window
        self._close_after_watch = close_after_watch  # the YouTube window: done once its video is showing
        self._find = find  # opened by "Find in a video": hands over the search results it shows

    def find_results(self, candidates: Any = None) -> dict[str, Any]:
        """"Find in a video": the Filmot results page showing in this window lists these videos, top
        first ([{"id", "at"}], read by web/js/filmot-browser.js). The app keeps the first whose
        captions say the word, and this window closes. Only for a window the app opened to find a
        word, and only from filmot.com."""
        from urllib.parse import urlsplit

        from . import youtube

        try:
            host = (urlsplit(self._window.get_current_url() or "").hostname or "").lower()
            if not self._find or host not in ("filmot.com", "www.filmot.com"):
                return {"ok": False, "error": "Only a search opened by “Find in a video” can do that."}
            result = youtube.ask_app_to_find(candidates if isinstance(candidates, list) else [])
        except Exception as exc:  # never let a website's oddities crash the bridge
            log.exception("Handing over Filmot's results failed")
            return {"ok": False, "error": f"Couldn't use these results ({exc.__class__.__name__})."}
        if result.get("ok"):
            if self._main is not None:
                bring_forward(self._main)
            threading.Timer(0.4, self._close).start()  # after this answer has reached the page
        return result

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

    def _browser_window(self, title: str, start: str, close_after_watch: bool = False, find: Any = False,
                        reading: bool = True) -> Any:
        """A web browser window. Every page in it gets the bottom bar with "Import Page"
        (web/js/browser-toolbar.js) and, on youtube.com, tap-a-video-to-watch-it-in-the-app
        (web/js/youtube-browser.js); on filmot.com, the same for its caption search results
        (web/js/filmot-browser.js). `close_after_watch`: the window closes itself once a video
        tapped in it is showing in the app's player. `find`: opened by "Find in a video", so on
        Filmot's results the script takes the top video itself (web/js/filmot-browser.js).
        `reading`: opened to read web pages. A window opened for something else (signing in,
        YouTube, finding a word in a video) has no "Import Page" or save-to-start-page buttons."""
        import webview

        scripts = [(paths.web_dir() / "js" / name).read_text(encoding="utf-8")
                   for name in ("browser-toolbar.js", "youtube-browser.js", "filmot-browser.js")]
        if find:
            scripts.insert(0, f"window.__tamkeenFind = {json.dumps(_find_language(find))};")
        if not reading:
            scripts.insert(0, "window.__tamkeenNoImport = true;")
        api = BrowserApi(self._window, close_after_watch, bool(find))
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

    def open_browser(self, url: str = "", find: Any = False, reading: bool = True) -> dict[str, Any]:
        """Open a web browser window with an "Import Page" button. `find`: opened by "Find in a
        video" on a word (web/js/filmot.js), with the language whose captions it is for.
        `reading` false: opened for something other than reading pages (signing in), so
        without the button. "Find in a video" windows never have it."""
        from . import pages

        try:
            # Nothing typed: the start page (news in the study language and a search box).
            typed = (url or "").strip()
            self._browser_window("Find in a video" if find else "Web Browser",
                                 pages.browser_start(typed) if typed else pages.browser_home(self._server.url),
                                 find=find if find and typed else False,
                                 reading=bool(reading) and not find)
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
                self._youtube = self._browser_window("YouTube", address, close_after_watch=True, reading=False)
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


# --background: started by another app (Onyx Calendar) only to show the player from /embed. The
# window stays hidden, and empty, until something asks for it (a launch from the Start menu, a
# tamkeen:// link); with no window shown and no /embed page open for this long, the app closes.
BACKGROUND_IDLE = 600.0


def _quit_when_unused(window: Any, shown: threading.Event, idle: float = BACKGROUND_IDLE, poll: float = 5.0) -> None:
    last_used = time.monotonic()
    while not shown.wait(poll):
        if events.client_count() > 0:  # an /embed page (the hidden window has no page in it)
            last_used = time.monotonic()
        elif time.monotonic() - last_used > idle:
            log.info("Started in the background and unused for %d minutes: closing.", idle // 60)
            try:
                window.destroy()
            except Exception:
                log.exception("Couldn't close the hidden window")
            return


def run(browser: bool = False, port: int | None = None, headless: bool = False, link: str | None = None,
        background: bool = False) -> None:
    """`link`: a tamkeen://watch link this run was started with (see applink.py); its video opens
    once the page has loaded. `background`: start with the window hidden (see BACKGROUND_IDLE)."""
    setup_logging()
    os.environ["APS_DESKTOP"] = "0" if browser or headless else "1"
    server = Server(port or free_port())
    server.start()
    log.info("Server listening on %s", server.url)
    try:
        applink.write_instance(server.port)  # so a second launch hands its link to this one
    except Exception:  # never let it stop the app from opening
        log.exception("Couldn't write the instance file")
    parsed = applink.parse(link)
    if parsed:
        applink.push(parsed)
    elif link:
        log.warning("Ignoring a link that isn't tamkeen://watch?v=<video id>: %r", link[:200])
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
        background = background and not link
        window = webview.create_window(APP_NAME, None if background else server.url,
                                       html="<!doctype html><title>Tamkeen</title>" if background else "",
                                       js_api=api, width=1280, height=860, min_size=(820, 560),
                                       text_select=True, hidden=background)
        api._window = window
        shown = threading.Event()
        if not background:
            shown.set()

        def show_main() -> None:
            if not shown.is_set():  # started in the background: the app's page goes in now
                shown.set()
                window.load_url(server.url)
            bring_forward(window)

        applink.on_link(show_main)
        if background:
            log.info("Started in the background (window hidden)")
            threading.Thread(target=_quit_when_unused, args=(window, shown), name="background-idle",
                             daemon=True).start()
        try:
            webview.start(private_mode=False, storage_path=str(paths.data_dir() / "webview"))
        except Exception as exc:
            log.warning("Native window failed (%s); falling back to the browser.", exc)
            os.environ["APS_DESKTOP"] = "0"
            _browser_mode(server)
    finally:
        applink.remove_instance()  # first, so a new launch doesn't hand its link to this closing one
        applink.on_link(None)
        server.stop()
