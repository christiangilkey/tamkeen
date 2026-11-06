"""Filesystem locations.

All user data lives in the OS app-data folder (never next to the executable), so
installing a new version never touches the library. Set ``APS_DATA_DIR`` to override
(used by tests and smoke tests).
"""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

from platformdirs import user_data_dir

from .version import APP_ID


@lru_cache(maxsize=1)
def data_dir() -> Path:
    override = os.environ.get("APS_DATA_DIR")
    path = Path(override) if override else Path(user_data_dir(APP_ID, appauthor=False, roaming=True))
    path.mkdir(parents=True, exist_ok=True)
    return path


def _sub(name: str) -> Path:
    path = data_dir() / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def db_path() -> Path:
    return data_dir() / "library.db"


def audio_dir() -> Path:
    return _sub("audio")


def audio_dir_path(name: str) -> Path | None:
    """`name` as a file in the audio folder, or None when it isn't a plain file name ("..", a
    folder, a drive, a Windows stream "a.mp3:x")."""
    name = str(name or "")
    if not name or name in (".", "..") or any(c in name for c in '/\\:\0') or name != name.strip():
        return None
    return audio_dir() / name


def audio_file(stored: str | os.PathLike[str] | None) -> Path | None:
    """A file path kept in the library (episodes.audio_path, sync_audio_path) when it names a file
    that is really in the audio folder, else None. Every file the app plays, sends to a friend or
    uploads to Drive is checked with this first, so a path planted in the library (an imported
    backup, say) can't make it read some other file on the computer."""
    if not stored:
        return None
    try:
        path = Path(stored)
        if path.resolve().parent != audio_dir().resolve() or not path.is_file():
            return None
    except (OSError, ValueError):
        return None
    return path


def clips_dir() -> Path:
    """Short audio clips that came with vocab words shared by friends."""
    return _sub("clips")


def anki_clips_dir() -> Path:
    """Word and sentence clips already cut for an Anki export, kept so the next export is quick."""
    return _sub("anki-clips")


def models_dir() -> Path:
    return _sub("models")


def gpu_libs_dir() -> Path:
    return _sub("gpu-libs")


def logs_dir() -> Path:
    return _sub("logs")


def tmp_dir() -> Path:
    return _sub("tmp")


def resource_dir() -> Path:
    """Read-only bundled resources (web UI, licenses). Works from source and from PyInstaller."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent


def web_dir() -> Path:
    return resource_dir() / "web"


def licenses_dir() -> Path:
    return resource_dir() / "licenses"
