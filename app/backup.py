"""Export / import the user's library as a single .zip."""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any

from . import db, jobs, paths
from .version import __version__

MANIFEST = "aps-backup.json"


def export(include_audio: bool) -> Path:
    out = paths.tmp_dir() / f"tamkeen-backup-{time.strftime('%Y%m%d-%H%M%S')}.zip"
    snapshot = paths.tmp_dir() / "library-snapshot.db"
    snapshot.unlink(missing_ok=True)
    src = db.connect()
    dst = sqlite3.connect(snapshot)
    try:
        src.backup(dst)  # consistent copy even while the worker is writing
        # Never put API keys into a file the user may share or upload. VACUUM rewrites the
        # file so the deleted values don't linger in free pages.
        dst.execute(f"DELETE FROM settings WHERE key IN ({','.join('?' * len(db.SECRET_SETTINGS))})",
                    db.SECRET_SETTINGS)
        dst.commit()
        dst.execute("VACUUM")
    finally:
        dst.close()
        src.close()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(MANIFEST, json.dumps({"app_version": __version__, "created": time.time(),
                                          "include_audio": include_audio}))
        zf.write(snapshot, "library.db")
        if include_audio:
            for f in paths.audio_dir().iterdir():
                if f.is_file() and ".tmp" not in f.name and not f.name.endswith(".part"):
                    zf.write(f, f"audio/{f.name}", compress_type=zipfile.ZIP_STORED)
    snapshot.unlink(missing_ok=True)
    return out


# Settings that belong to this device and its sign-ins, never to a backup: the keys, the Google
# account, this device's id. A backup's own are thrown away and this device's kept, so a backup made
# by someone else can't sign this computer in to their Google Drive (and then receive its files).
DEVICE_SETTINGS = (*db.SECRET_SETTINGS, "google_email", "google_scopes", "device_id")
# Columns holding a file on this computer. They may only ever name a file in the audio folder.
PATH_COLUMNS = (("episodes", "audio_path"), ("episodes", "sync_audio_path"))


def _name(stored: str) -> str:
    """The file name at the end of a path written on any computer (Windows or not)."""
    return str(stored).replace("\\", "/").rsplit("/", 1)[-1]


def clean_incoming(path: Path) -> None:
    """Make a backup's database safe before it replaces the library: drop its device settings, every
    trigger and view (the app makes its own again: db.init_db), and any file path outside the audio
    folder (re-pointed there by file name, or forgotten)."""
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA trusted_schema = OFF")
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        for kind, name in conn.execute("SELECT type, name FROM sqlite_master WHERE type IN ('trigger', 'view')").fetchall():
            conn.execute(f'DROP {kind.upper()} IF EXISTS "{name.replace(chr(34), chr(34) * 2)}"')
        if "settings" in tables:
            conn.execute(f"DELETE FROM settings WHERE key IN ({','.join('?' * len(DEVICE_SETTINGS))})", DEVICE_SETTINGS)
        for table, column in PATH_COLUMNS:
            if table not in tables or column not in {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}:
                continue
            for rowid, stored in conn.execute(f"SELECT rowid, {column} FROM {table} WHERE {column} IS NOT NULL").fetchall():
                # (by name only: the backup's own audio files are put there after this)
                local = paths.audio_dir_path(_name(stored)) if isinstance(stored, str) else None
                conn.execute(f"UPDATE {table} SET {column} = ? WHERE rowid = ?", (str(local) if local else None, rowid))
        conn.commit()
    finally:
        conn.close()


def import_(zip_path: Path) -> dict[str, Any]:
    """Replace the current library with the backup's contents."""
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        if MANIFEST not in names or "library.db" not in names:
            raise ValueError("This file isn't a Tamkeen backup.")
        with tempfile.TemporaryDirectory(dir=paths.tmp_dir()) as tmp:
            zf.extract("library.db", tmp)
            incoming = Path(tmp) / "library.db"
            check = sqlite3.connect(incoming)
            try:
                if check.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("The backup's database is damaged.")
            finally:
                check.close()
            try:
                clean_incoming(incoming)
            except sqlite3.DatabaseError as exc:
                raise ValueError(f"The backup's database can't be read ({exc}).") from exc
            keep = {k: v for k, v in db.get_settings().items() if k in DEVICE_SETTINGS and v}
            src = sqlite3.connect(incoming)
            dst = db.connect()
            try:
                src.backup(dst)  # atomically replaces the live database's pages
            finally:
                src.close()
                dst.close()
            if keep:
                db.set_settings(keep)  # this device's API keys and sign-ins survive an import
        audio_dir = paths.audio_dir()
        restored = 0
        for name in names:
            if name.startswith("audio/") and not name.endswith("/"):
                target = audio_dir / os.path.basename(name)
                with zf.open(name) as s, open(target, "wb") as d:
                    shutil.copyfileobj(s, d, 1 << 20)
                restored += 1
    db.init_db()
    # Re-point audio paths at this machine's data folder; forget files that aren't here.
    with db.session() as conn:
        for _table, column in PATH_COLUMNS:
            for row in conn.execute(f"SELECT id, {column} FROM episodes WHERE {column} IS NOT NULL").fetchall():
                local = paths.audio_file(paths.audio_dir_path(_name(row[column])))
                conn.execute(f"UPDATE episodes SET {column} = ? WHERE id = ?", (str(local) if local else None, row["id"]))
    jobs.recover()
    jobs.worker.wake()
    return {"audio_files": restored}
