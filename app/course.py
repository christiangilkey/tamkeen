"""The basics courses: for each language, its 1000 most common words, 50 to a unit, each with a short
everyday sentence, its translation and audio (made by tools/course/build_course.py, published with the
website in docs/course, like the dictionaries in docs/lexicon).

The computer's page asks for the files through /api/course/... (app/api/course.py), and gets:
  - the repository's own copy when running from source (docs/course), or the folder named by
    APS_COURSE_DIR (a preview built on this computer, tools/course/build/preview);
  - otherwise the published files, downloaded once and kept in the data folder (course/), so a unit
    already opened works without a connection. The phones and the web app fetch the published files
    themselves (web/js/course.js).
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import httpx

from . import paths

BASE_URL = "https://christiangilkey.github.io/tamkeen/course/"
# What may be asked for: the list of courses, a course, and one of its audio files.
NAME = re.compile(r"^(index\.json|[a-z]{2,3}/course\.json|[a-z]{2,3}/audio/\d{4}\.ogg)$")


class CourseError(RuntimeError):
    pass


def _source_dir() -> Path | None:
    override = os.environ.get("APS_COURSE_DIR")
    if override:
        return Path(override)
    if getattr(sys, "frozen", False):
        return None
    path = Path(__file__).resolve().parent.parent / "docs" / "course"
    return path if (path / "index.json").exists() else None


def cache_dir() -> Path:
    path = paths.data_dir() / "course"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get(name: str) -> bytes:
    """A course file by its published name ("index.json", "ar/course.json", "ar/audio/0001.ogg")."""
    if not NAME.match(name):
        raise CourseError("There is no such course file.")
    src = _source_dir()
    if src is not None:
        path = src / name
        if not path.exists():
            raise CourseError("That part of the course hasn't been made yet.")
        return path.read_bytes()
    kept = cache_dir() / name
    # The list and the courses change as units are added: asked afresh, kept for when there is no
    # connection. Audio files never change once made, so a kept one is used as it is.
    if kept.exists() and name.endswith(".ogg"):
        return kept.read_bytes()
    try:
        r = httpx.get(BASE_URL + name, timeout=60, follow_redirects=True)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        if kept.exists():
            return kept.read_bytes()
        raise CourseError(f"Couldn't download the course ({exc.__class__.__name__}). Check your connection and try again.") from exc
    kept.parent.mkdir(parents=True, exist_ok=True)
    kept.write_bytes(r.content)
    return r.content
