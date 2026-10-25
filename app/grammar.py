"""The grammar courses (tools/grammar/README.md): short lessons from nothing to everyday conversation,
published with the website in docs/grammar like the basics courses in docs/course (app/course.py).

The computer's page asks for the files through /api/grammar/... (app/api/grammar.py) and gets the
repository's own copy when running from source (docs/grammar), or the folder named by APS_GRAMMAR_DIR;
otherwise the published files, downloaded and kept in the data folder (grammar/) for when there is no
connection. The phones and the web app fetch the published files themselves (web/js/grammardata.js).

Also the learner's progress (setting "grammar_progress": {"<course>/<lesson id>": {at, right, of}}),
which travels between their devices with the sync: for each lesson, the finish made last wins.
web/js/grammardata.js cleanProgress / mergeProgress are the twins of clean_progress / merge_progress.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import httpx

from . import paths

BASE_URL = "https://christiangilkey.github.io/tamkeen/grammar/"
# What may be asked for: the list of courses, and a course ("en-ar/course.json").
NAME = re.compile(r"^(index\.json|[a-z]{2,3}-[a-z]{2,3}/course\.json)$")
KEY = re.compile(r"^[a-z]{2,3}-[a-z]{2,3}/[a-z0-9-]{1,60}$")


class GrammarError(RuntimeError):
    pass


def _source_dir() -> Path | None:
    override = os.environ.get("APS_GRAMMAR_DIR")
    if override:
        return Path(override)
    if getattr(sys, "frozen", False):
        return None
    path = Path(__file__).resolve().parent.parent / "docs" / "grammar"
    return path if (path / "index.json").exists() else None


def cache_dir() -> Path:
    path = paths.data_dir() / "grammar"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get(name: str) -> bytes:
    """A grammar file by its published name ("index.json", "en-ar/course.json")."""
    if not NAME.match(name):
        raise GrammarError("There is no such grammar file.")
    src = _source_dir()
    if src is not None:
        path = src / name
        if not path.exists():
            raise GrammarError("That grammar course hasn't been made yet.")
        return path.read_bytes()
    kept = cache_dir() / name
    # Courses change as lessons are added or corrected: asked afresh, the kept copy used offline.
    try:
        r = httpx.get(BASE_URL + name, timeout=60, follow_redirects=True)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        if kept.exists():
            return kept.read_bytes()
        raise GrammarError(f"Couldn't download the grammar course ({exc.__class__.__name__}). Check your connection and try again.") from exc
    kept.parent.mkdir(parents=True, exist_ok=True)
    kept.write_bytes(r.content)
    return r.content


# ---------------------------------------------------------------- progress


def clean_progress(raw: Any) -> dict[str, dict[str, int]]:
    """The setting as it should be kept: {"<course>/<lesson id>": {at, right, of}}, nothing else."""
    value = raw
    if isinstance(value, str):
        try:
            value = json.loads(value or "{}")
        except json.JSONDecodeError:
            value = {}
    out: dict[str, dict[str, int]] = {}
    if not isinstance(value, dict):
        return out
    for key, rec in value.items():
        if not isinstance(key, str) or not KEY.match(key) or not isinstance(rec, dict):
            continue
        at = _int(rec.get("at"))
        if at <= 0:
            continue
        of = max(0, min(50, _int(rec.get("of"))))
        right = max(0, min(of, _int(rec.get("right"))))
        out[key] = {"at": at, "right": right, "of": of}
    return out


def _int(x: Any) -> int:
    try:
        n = float(x)
    except (TypeError, ValueError):
        return 0
    if n != n or n in (float("inf"), float("-inf")):
        return 0
    return int(n)  # (towards zero, like JavaScript's Math.trunc)


def merge_progress(mine: Any, theirs: Any) -> dict[str, dict[str, int]]:
    """Two devices' progress as one: for each lesson, the finish made last wins (on a tie, the better score)."""
    a, b = clean_progress(mine), clean_progress(theirs)
    out = dict(a)
    for key, rec in b.items():
        m = out.get(key)
        if m is None or (rec["at"], rec["right"], rec["of"]) > (m["at"], m["right"], m["of"]):
            out[key] = rec
    return {k: out[k] for k in sorted(out)}
