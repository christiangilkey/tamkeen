"""Settings → Reset Tamkeen: start again as on first use, without losing anything.

The library database (podcasts, transcripts, vocab, reviews, settings, the Google sign-in and the
AI keys) is set aside whole in <data>/reset/, checked, and the app carries on with an empty one, so
it shows its first-run screens and is signed out. Nothing is deleted: audio, videos and models stay
where they are (only the database knew about them), and the copy set aside comes back by itself as
soon as the user signs in to Google or finishes the first-run screens. What was chosen meanwhile
(the languages, the sign-in, finishing the welcome) is kept on top of it.

If the user is signed in to Google, a sync runs first and must succeed, so Drive has everything too.
While the library is set aside, sync does nothing (an empty library is never compared with Drive).
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from . import db, events, paths

log = logging.getLogger(__name__)

_lock = threading.Lock()
# Chosen again on the first-run screens: always taken from the new run, even when still unset,
# so screens not reached yet are still shown after the library comes back.
ALWAYS_NEW = ("welcome_seen", "onboarded", "study_language", "ui_language")
# Never carried back: the empty run's own bookkeeping.
NOT_CARRIED = ("device_id",)


def _folder() -> Path:
    folder = paths.data_dir() / "reset"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _marker() -> Path:
    return _folder() / "parked.json"


def parked() -> bool:
    """True while a library is set aside (between Reset Tamkeen and signing in / finishing setup)."""
    return _marker().exists()


def _counts(conn: sqlite3.Connection) -> dict[str, int]:
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
    return {t: conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables}


def reset() -> dict[str, Any]:
    """Set the library aside and start empty. Refuses (and changes nothing) if a transcription is
    running, if a library is already set aside, or if the sync that should come first fails."""
    from . import jobs, sync

    with _lock:
        if parked():
            return {"ok": False, "error": "Tamkeen has already been reset. Sign in or finish the first-run screens to bring your library back."}
        conn = db.connect()
        try:
            busy = conn.execute(f"SELECT COUNT(*) FROM episodes WHERE status IN ({','.join('?' * len(jobs.ACTIVE_STATUSES))})",
                                jobs.ACTIVE_STATUSES).fetchone()[0]
        finally:
            conn.close()
        if busy:
            return {"ok": False, "error": "Something is still being transcribed. Wait for it to finish, or stop it, then reset."}
        if db.get_setting("google_refresh_token"):
            result = sync.manager.sync_now()
            if result.get("state") == "error" or result.get("error"):
                return {"ok": False, "error": f"Your library couldn't be saved to Google Drive first, so nothing was reset ({result.get('error')})."}

        stamp = time.strftime("%Y%m%d-%H%M%S")
        copy = _folder() / f"library-{stamp}.db"
        live = db.connect()
        try:
            out = sqlite3.connect(copy)
            try:
                live.backup(out)
                ok = out.execute("PRAGMA integrity_check").fetchone()[0] == "ok" and _counts(out) == _counts(live)
            finally:
                out.close()
            if not ok:
                copy.unlink(missing_ok=True)
                return {"ok": False, "error": "Your library couldn't be set aside safely, so nothing was reset."}
            _marker().write_text(json.dumps({"file": copy.name, "at": time.time()}), encoding="utf-8")
            # An empty library in place of the live one (the same file, so nothing holding it breaks).
            empty_path = _folder() / f"empty-{stamp}.db"
            db.init_db(empty_path)
            empty = sqlite3.connect(empty_path)
            try:
                empty.backup(live)
            finally:
                empty.close()
                empty_path.unlink(missing_ok=True)
        finally:
            live.close()
        log.info("Reset: library set aside as %s", copy.name)

    _sign_out_of_websites()
    events.publish("feeds", {"refreshed": True})
    return {"ok": True}


def maybe_restore() -> bool:
    """Bring the library back once the user has signed in to Google or finished the first-run
    screens. Called after sign-in and after settings change. True if it was brought back."""
    if not parked():
        return False
    s = db.get_settings()
    if not (s.get("google_refresh_token") or (s.get("welcome_seen") and s.get("onboarded"))):
        return False
    return restore()


def restore() -> bool:
    with _lock:
        if not parked():
            return False
        info = json.loads(_marker().read_text(encoding="utf-8"))
        copy = _folder() / info["file"]
        live = db.connect()
        try:
            fresh = {r["key"]: r["value"] for r in live.execute("SELECT key, value FROM settings")}
            src = sqlite3.connect(copy)
            try:
                src.backup(live)
            finally:
                src.close()
            db.init_db()  # in case the set-aside copy is from before a migration
            defaults = {k: json.dumps(v) for k, v in db.DEFAULT_SETTINGS.items()}
            carried = {k: v for k, v in fresh.items()
                       if k not in NOT_CARRIED and (k in ALWAYS_NEW or v != defaults.get(k))}
            for key in ALWAYS_NEW:
                carried.setdefault(key, defaults.get(key, json.dumps("")))
            live.executemany("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                             list(carried.items()))
            live.commit()
        finally:
            live.close()
        # The copy is kept (renamed), never deleted, in case anything about the swap is ever doubted.
        copy.rename(copy.with_name(copy.stem + "-restored.db"))
        _marker().unlink()
        log.info("Reset: library brought back from %s", copy.name)
    events.publish("feeds", {"refreshed": True})
    try:
        from . import sync

        sync.request(2)
    except Exception:
        log.debug("No sync after restoring", exc_info=True)
    return True


def _sign_out_of_websites() -> None:
    """Instagram, YouTube and every other site signed in to inside the app's windows."""
    try:
        import webview

        for window in list(webview.windows):
            try:
                window.clear_cookies()
                break  # one store, shared by all the app's windows
            except Exception:
                log.debug("Couldn't clear a window's cookies", exc_info=True)
    except Exception:
        log.debug("No app windows to sign out of", exc_info=True)
