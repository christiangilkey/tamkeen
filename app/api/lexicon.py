"""Seen words (by dictionary form) and the dictionaries that find a word's dictionary form."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .. import db, lexicon, sync

router = APIRouter(tags=["lexicon"])


class LexemeIn(BaseModel):
    key: str            # language|lemma (normalized)|class, e.g. "ar|كتب|v"
    lemma: str = ""     # as a dictionary prints it: كَتَب
    pos: str = ""
    root: str = ""


class LexemesIn(BaseModel):
    items: list[LexemeIn]


class KeysIn(BaseModel):
    keys: list[str]


class LangIn(BaseModel):
    lang: str = "ar"


def _lang(key: str) -> str:
    return key.split("|", 1)[0][:8]


# ----- seen words -----

@router.get("/lexemes")
def list_lexemes() -> dict[str, Any]:
    with db.session() as conn:
        keys = [r[0] for r in conn.execute("SELECT key FROM known_lexemes WHERE deleted = 0")]
    return {"keys": keys}


@router.post("/lexemes")
def add_lexemes(body: LexemesIn) -> dict[str, int]:
    """Mark lexemes as seen. Ones already seen are left as they are."""
    now = time.time()
    added = 0
    with db.session() as conn:
        for item in body.items[:5000]:
            key = item.key.strip()
            if key.count("|") < 2 or len(key) > 200:
                continue
            row = conn.execute("SELECT deleted FROM known_lexemes WHERE key = ?", (key,)).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO known_lexemes(key, lang, lemma, pos, root, deleted, created_at, updated_at) "
                    "VALUES(?,?,?,?,?,0,?,?)",
                    (key, _lang(key), item.lemma[:120], item.pos[:40], item.root[:40], now, now))
                added += 1
            elif row["deleted"]:
                conn.execute("UPDATE known_lexemes SET deleted = 0, updated_at = ? WHERE key = ?", (now, key))
                added += 1
    if added:
        sync.request()
    return {"added": added}


@router.post("/lexemes/forget")
def forget_lexemes(body: KeysIn) -> dict[str, int]:
    """Make words count as new again (kept as a tombstone so other devices forget them too)."""
    now = time.time()
    with db.session() as conn:
        n = 0
        for key in body.keys[:5000]:
            n += conn.execute("UPDATE known_lexemes SET deleted = 1, updated_at = ? WHERE key = ? AND deleted = 0",
                              (now, key)).rowcount
    if n:
        sync.request()
    return {"forgotten": n}


@router.get("/lexemes/lookups")
def past_lookups() -> list[dict[str, str]]:
    """Every word looked up so far, with its sentence (the looked-up part inside ⟦ ⟧). Used once,
    when seen words start being kept, to count the words the learner had already tapped."""
    with db.session() as conn:
        rows = conn.execute("SELECT word, sentence FROM definitions ORDER BY created_at").fetchall()
    return [{"word": r["word"], "sentence": r["sentence"]} for r in rows]


# ----- dictionaries -----

@router.get("/lexicon/status")
def lexicon_status(lang: str = "ar") -> dict[str, Any]:
    return lexicon.status(lang)


@router.post("/lexicon/download")
def lexicon_download(body: LangIn) -> dict[str, Any]:
    try:
        return lexicon.download(body.lang)
    except lexicon.LexiconError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/lexicon/remove")
def lexicon_remove(body: LangIn) -> dict[str, Any]:
    return lexicon.remove(body.lang)


@router.get("/lexicon/data/{name}")
def lexicon_data(name: str) -> Response:
    path = lexicon.file_path(name)
    if path is None:
        raise HTTPException(404, "That dictionary hasn't been downloaded.")
    # The file is gzipped JSON (the Japanese one gzipped binary); sent as is, the browser unpacks it.
    media = "application/octet-stream" if path.name.endswith(".bin.gz") else "application/json"
    return Response(path.read_bytes(), media_type=media,
                    headers={"Content-Encoding": "gzip", "Cache-Control": "private, max-age=86400"})
