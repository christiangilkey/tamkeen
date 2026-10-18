"""Arabic word dictionaries: fetched once, when someone learning Arabic agrees to it.

The player shows which words are new to the learner. For Arabic that means knowing each word's
dictionary form, which needs dictionaries (see web/js/lexicon/arabic.js for how they are used
and tools/build_lexicon.py for how they are made from the CAMeL Tools databases). They are a
few megabytes, are not part of the installer, and live in the data folder once downloaded.

The same files serve the Android app, which downloads them from the same address.
"""

from __future__ import annotations

import hashlib
import json
import logging
import sys
import threading
from pathlib import Path
from typing import Any

import httpx

from . import paths

log = logging.getLogger(__name__)

BASE_URL = "https://christiangilkey.github.io/tamkeen/lexicon/"
# The files each language uses, by name (Standard Arabic first: it is the one tried first).
# Spanish, French and Italian have one table of word forms each (tools/build_lemmas.py); Russian
# has one with stress marks too (tools/build_russian.py). Japanese and Chinese have a dictionary that
# also splits their text into words (tools/build_cjk.py; the Japanese one is binary).
LANGUAGES = {"ar": ("msa", "egy", "lev", "glf"), "es": ("es",), "fr": ("fr",), "it": ("it",), "ru": ("ru",), "en": ("en",), "tl": ("tl",),
             "ja": ("ja",), "zh": ("zh",)}
FILES = {"msa": "ar-msa.json.gz", "egy": "ar-egy.json.gz", "lev": "ar-lev.json.gz", "glf": "ar-glf.json.gz",
         "es": "es-lemmas.json.gz", "fr": "fr-lemmas.json.gz", "it": "it-lemmas.json.gz", "ru": "ru-lemmas.json.gz",
         "en": "en-lemmas.json.gz", "tl": "tl-roots.json.gz", "ja": "ja-ipadic.bin.gz", "zh": "zh-cedict.json.gz"}
# Word meanings for "No AI" in Settings (tools/build_meanings.py, from Wiktionary): one file a language,
# downloaded only when that is chosen. `kind="meanings"` below.
# Arabic has a second file, asked when Wiktionary lacks a word: the CAMeL databases' glosses
# (tools/build_arabic_glosses.py).
MEANINGS = {lang: (f"mean-{lang}",) for lang in LANGUAGES} | {"ar": ("mean-ar", "mean-arc")}
FILES.update({f"mean-{lang}": f"{lang}-meanings.json.gz" for lang in LANGUAGES} | {"mean-arc": "ar-camel-meanings.json.gz"})
KINDS = {"words": LANGUAGES, "meanings": MEANINGS}

_lock = threading.Lock()


class LexiconError(RuntimeError):
    pass


def lexicon_dir() -> Path:
    path = paths.data_dir() / "lexicon"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _source_dir() -> Path | None:
    """The repository's own copy of the files, when running from source (so development and
    tests need no network). An installed app has none and downloads them."""
    if getattr(sys, "frozen", False):
        return None
    path = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
    return path if (path / "index.json").exists() else None


def _fetch(name: str) -> bytes:
    src = _source_dir()
    if src is not None and (src / name).exists():
        return (src / name).read_bytes()
    try:
        r = httpx.get(BASE_URL + name, timeout=60, follow_redirects=True)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        raise LexiconError(f"Couldn't download the dictionaries ({exc}). Check your connection and try again.") from exc
    return r.content


def index(refresh: bool = False) -> dict[str, Any]:
    """What can be downloaded: {files: {name: {file, bytes, sha256, title, license, ...}}}."""
    cached = lexicon_dir() / "index.json"
    if cached.exists() and not refresh:
        try:
            return json.loads(cached.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    src = _source_dir()
    if src is not None:
        return json.loads((src / "index.json").read_text(encoding="utf-8"))
    data = json.loads(_fetch("index.json").decode("utf-8"))
    cached.write_text(json.dumps(data), encoding="utf-8")
    return data


def file_path(name: str) -> Path | None:
    """The downloaded dictionary `name` ("msa", "egy", "es", ...), or None if it isn't here."""
    if name not in FILES:
        return None
    path = lexicon_dir() / FILES[name]
    return path if path.exists() else None


def status(lang: str = "ar", kind: str = "words") -> dict[str, Any]:
    names = KINDS.get(kind, LANGUAGES).get(lang, ())
    try:
        files = index().get("files", {})
    except (LexiconError, OSError, json.JSONDecodeError):
        files = {}
    out = {name: {"title": files.get(name, {}).get("title", name), "bytes": files.get(name, {}).get("bytes", 0),
                  "license": files.get(name, {}).get("license", ""), "installed": file_path(name) is not None}
           for name in names}
    return {"lang": lang, "kind": kind, "needed": bool(names), "names": list(names),
            "installed": bool(names) and all(f["installed"] for f in out.values()),
            "bytes": sum(f["bytes"] for f in out.values()), "files": out}


def download(lang: str = "ar", kind: str = "words") -> dict[str, Any]:
    """Fetch every dictionary for a language that isn't here yet. Each file is checked against
    the published checksum before it is kept."""
    with _lock:
        files = index(refresh=True).get("files", {})
        for name in KINDS.get(kind, LANGUAGES).get(lang, ()):
            if file_path(name) is not None:
                continue
            meta = files.get(name)
            if not meta:
                raise LexiconError(f"The {name} dictionary isn't published yet.")
            blob = _fetch(meta["file"])
            if hashlib.sha256(blob).hexdigest() != meta["sha256"]:
                raise LexiconError("A dictionary arrived damaged. Try again.")
            tmp = lexicon_dir() / f"{name}.part"
            tmp.write_bytes(blob)
            tmp.replace(lexicon_dir() / FILES[name])
    return status(lang, kind)


def remove(lang: str = "ar", kind: str = "words") -> dict[str, Any]:
    with _lock:
        for name in KINDS.get(kind, LANGUAGES).get(lang, ()):
            path = file_path(name)
            if path is not None:
                path.unlink(missing_ok=True)
    return status(lang, kind)
