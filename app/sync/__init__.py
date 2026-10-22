"""Background Google Drive sync.

Call :func:`request` after any change worth syncing; the manager runs one sync at a time on its
own thread (a sooner request is never pushed back by a later, longer one), plus a check of Drive
every minute while the app's window is on screen and every five minutes otherwise (the page says
which: :meth:`Manager.presence`). A check that finds nothing new is one small Drive request
(engine.quick_check). The phone and web app do the same (web/js/syncpace.js).
"""

from __future__ import annotations

import hashlib
import logging
import platform
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from .. import db, events, tashkeel
from . import engine, oauth
from .drive import DriveError, GoogleDrive

log = logging.getLogger(__name__)

PERIOD = 300  # seconds between checks while the window is put away (or no page has said)
PERIOD_VISIBLE = 60  # seconds between checks while the window is on screen
RETURN_GAP = 10  # seconds: coming back to the window twice in a row needs one check, not two
DEBOUNCE = 4  # seconds to wait after a change before syncing


def nudge_key(library_id: str) -> str:
    """The key of the realtime channel the learner's own devices nudge each other on (web/js/syncnudge.js):
    from the id of their library file in their own Drive, which nobody else sees. Same as syncpace.js."""
    if not library_id:
        return ""
    return hashlib.sha256(f"tamkeen-nudge:{library_id}".encode("utf-8")).hexdigest()[:32]


class Manager:
    def __init__(self) -> None:
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._due = 0.0
        self._changed = False  # the waiting sync carries a change made here (no quick check)
        self._thread: threading.Thread | None = None
        self._run_lock = threading.Lock()
        self._memo: dict[str, Any] = {}  # what the last sync ended with (engine.run's memo)
        self.period = PERIOD
        self._last_run = time.monotonic()
        self._on_screen = False
        self.state: dict[str, Any] = {"state": "idle", "last_sync": None, "error": None, "last_result": None,
                                      "nudge_key": ""}

    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, name="drive-sync", daemon=True)
            self._thread.start()
        self.request(delay=2)

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()

    def request(self, delay: float = DEBOUNCE, change: bool = True) -> None:
        """Sync in `delay` seconds (or sooner, if a sooner one is already waiting). `change`: a change
        made here (the default); False for a plain check, which may stop after listing Drive."""
        if not oauth.signed_in():
            return
        due = time.monotonic() + delay
        self._due = min(self._due, due) if self._due else due
        self._changed = self._changed or change
        self._wake.set()

    def check(self, delay: float = 0.5) -> None:
        """Look at Drive soon for what the other devices sent (a nudge, or coming back to the window)."""
        self.request(delay, change=False)

    @property
    def pending(self) -> bool:
        return bool(self._due) and self._changed

    def flush(self) -> bool:
        """The window lost focus or is being put away: send a waiting change now. True if there was one."""
        if not self.pending:
            return False
        self.request(delay=0)
        return True

    def presence(self, visible: bool, focused: bool) -> dict[str, Any]:
        """What the app's page says about its window: on screen (`visible`) and in front (`focused`).
        On screen: check Drive every minute; put away: every five. Coming to the front: check now (at
        most once per RETURN_GAP); leaving it: send a waiting change now."""
        self.period = PERIOD_VISIBLE if visible else PERIOD
        on_screen = visible and focused
        action = "none"
        if not on_screen and self.flush():
            action = "flush"
        elif on_screen and not self._on_screen and time.monotonic() - self._last_run >= RETURN_GAP:
            self.check()
            action = "check" if self._due else "none"  # (not signed in: nothing to check)
        self._on_screen = on_screen
        self._wake.set()  # the loop picks up the new period
        return {"period": self.period, "action": action}

    def wait_and_sync(self) -> dict[str, Any]:
        """The refresh button: wait for a sync already running, then a whole one from now."""
        with self._run_lock:
            pass
        return self.sync_now(quick=False)

    def flush_on_exit(self, timeout: float = 20) -> None:
        """The window closed: send a waiting change before the app ends (for at most `timeout` s)."""
        if not self.pending or not oauth.signed_in():
            return
        worker = threading.Thread(target=self.sync_now, name="drive-sync-exit", daemon=True)
        worker.start()
        worker.join(timeout)

    def _publish(self, **kw: Any) -> None:
        self.state.update(kw)
        events.publish("sync", status())

    def _loop(self) -> None:
        while not self._stop.is_set():
            now = time.monotonic()
            next_periodic = self._last_run + self.period
            wait = min(next_periodic - now, (self._due - now) if self._due else self.period)
            if wait > 0:
                self._wake.wait(timeout=wait)
                self._wake.clear()
                continue
            if self._due and time.monotonic() >= self._due or time.monotonic() >= next_periodic:
                quick = not self._changed
                self._due = 0.0
                self._changed = False
                self._last_run = time.monotonic()
                if oauth.signed_in():
                    self.sync_now(quick=quick)

    def sync_now(self, quick: bool = False) -> dict[str, Any]:
        from .. import reset

        if reset.parked():
            return status()  # after Reset Tamkeen the library is set aside: never compare an empty one with Drive
        if not self._run_lock.acquire(blocking=False):
            return status()
        drive = None
        try:
            self._last_run = time.monotonic()
            was = self.state.get("state")
            if quick:  # a check: the pages only hear of it if it finds something (no repaint every minute)
                self.state.update(state="syncing", error=None)
            else:
                self._publish(state="syncing", error=None)
            drive = GoogleDrive(lambda force: oauth.access_token(force))
            settings = db.get_settings()
            result = engine.run(drive, device_id(), bool(settings.get("sync_audio", True)), can_transcribe=True,
                                memo=self._memo, quick=quick)
            if result.skipped:
                if was == "error":
                    self._publish(state="idle", last_sync=time.time())
                else:
                    self.state.update(state="idle", last_sync=time.time())
                log.debug("Quick check: nothing new")
                return status()
            if result.new_feeds:
                # Podcasts added on the phone (or another computer): fetch their episodes here,
                # then sync again so every device gets the episode list.
                from .. import feeds as feeds_mod

                for feed_id in result.new_feeds:
                    feeds_mod.refresh_feed(feed_id)
                self.request(delay=1)
            if result.downloaded_transcripts:
                tashkeel.kick()  # Arabic transcripts from the phone get their vowels here
            summary = result.summary()
            self._publish(state="idle", last_sync=time.time(), last_result=summary,
                          nudge_key=nudge_key(self._memo.get("library_id", "")) or self.state.get("nudge_key", ""))
            if result.downloaded_transcripts or any(result.merged.values()):
                events.publish("feeds", {"refreshed": True, "synced": True})
            log.info("Sync finished: %s", summary)
        except (oauth.AuthError, DriveError) as exc:
            log.warning("Sync failed: %s", exc)
            self._publish(state="error", error=str(exc))
        except Exception as exc:
            log.exception("Sync failed")
            self._publish(state="error", error=f"{exc.__class__.__name__}: {exc}")
        finally:
            if drive is not None:
                drive.close()
            self._run_lock.release()
        return status()


manager = Manager()


def request(delay: float = DEBOUNCE) -> None:
    """Schedule a sync soon (no-op when not signed in)."""
    manager.request(delay)


def device_id() -> str:
    did = db.get_setting("device_id")
    if not did:
        did = f"{platform.node() or 'desktop'}-{uuid.uuid4().hex[:6]}"
        db.set_settings({"device_id": did})
    return str(did)


def status() -> dict[str, Any]:
    s = db.get_settings()
    return {
        "configured": oauth.configured(),
        "signed_in": bool(s.get("google_refresh_token")),
        "email": s.get("google_email") or "",
        "sync_audio": bool(s.get("sync_audio", True)),
        **manager.state,
    }


_media_ids: dict[str, str] = {}  # Drive file name -> id, so seeking doesn't re-list the folder


def _media_id(drive: GoogleDrive, name: str) -> str:
    if name not in _media_ids:
        for f in drive.list():
            _media_ids[f["name"]] = f["id"]
    if name not in _media_ids:
        raise FileNotFoundError(name)
    return _media_ids[name]


class _Stream:
    """A Drive download response that also closes its client when done."""

    def __init__(self, drive: GoogleDrive, resp: Any) -> None:
        self._drive, self._resp = drive, resp
        self.status_code, self.headers = resp.status_code, resp.headers

    def iter_bytes(self, size: int) -> Any:
        return self._resp.iter_bytes(size)

    def close(self) -> None:
        self._resp.close()
        self._drive.close()


def open_media(name: str, range_header: str | None) -> _Stream:
    """Stream (part of) a video stored in Drive, for the player."""
    if not oauth.signed_in():
        raise DriveError("Sign in with Google (Settings) to watch videos stored in Drive.")
    drive = GoogleDrive(lambda force: oauth.access_token(force))
    try:
        try:
            resp = drive.stream(_media_id(drive, name), range_header)
        except DriveError:
            _media_ids.pop(name, None)  # stale id (file replaced): look it up again once
            resp = drive.stream(_media_id(drive, name), range_header)
        return _Stream(drive, resp)
    except Exception:
        drive.close()
        raise


def fetch_media(name: str, dest: Path, progress: Any = None) -> Path:
    """Download a video stored in Drive (to transcribe one added on another device)."""
    if not oauth.signed_in():
        raise DriveError("This video is stored in Google Drive: sign in with Google in Settings to transcribe it.")
    drive = GoogleDrive(lambda force: oauth.access_token(force))
    try:
        drive.download_to(_media_id(drive, name), dest, progress)
    finally:
        drive.close()
    return dest


def vocab_clip(uid: str) -> Path | None:
    """Fetch a vocab word's audio clip from Drive (it was saved on another device)."""
    if not oauth.signed_in():
        return None
    drive = GoogleDrive(lambda force: oauth.access_token(force))
    try:
        return engine.fetch_clip(drive, uid)
    except Exception as exc:
        log.warning("Couldn't fetch the clip for word %s: %s", uid, exc)
        return None
    finally:
        drive.close()


def audio_copy(episode_id: int) -> Path | None:
    """Fetch the synced audio copy for an episode (used by the player)."""
    if not oauth.signed_in():
        return None
    drive = GoogleDrive(lambda force: oauth.access_token(force))
    try:
        return engine.fetch_audio_copy(drive, episode_id)
    except Exception as exc:
        log.warning("Couldn't fetch synced audio for episode %s: %s", episode_id, exc)
        return None
    finally:
        drive.close()
