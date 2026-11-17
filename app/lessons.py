"""Lesson bundles (web/js/lessons.js): a passage, its audio tracks and its questions, made from a teacher's PDF or
Word file. Everything about a lesson but its text and sound is one record in the synced setting `lesson_state`
({lesson id: record}); the passage and the tracks are episodes in the built-in list "local:lessons" (a book-like
passage, own audio files), so the reader, the player, search and Drive sync work on them unchanged.

This file is the computer's twin of lessons.js cleanState / mergeStates (tests/test_lessons.py checks they agree):
for each lesson, the copy changed last wins; a removed lesson is a short record {id, gone, updated} kept for
GONE_DAYS days so another device doesn't bring it back. The record's own fields are checked again in the page.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

from . import ids

LESSONS_FEED_URL = "local:lessons"
LESSONS_FEED_TITLE = "Lessons"
MAX_LESSONS = 300
MAX_RECORD_BYTES = 400_000
GONE_DAYS = 60
_ID = re.compile(r"^[A-Za-z0-9_-]{6,40}$")


def _num(v: Any) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0.0
    return x if x > 0 and x == x and x != float("inf") else 0.0


def clean_state(raw: Any) -> dict[str, dict[str, Any]]:
    """The setting as kept: records with a good id and a time, none too big, the newest MAX_LESSONS."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = {}
    if not isinstance(raw, dict):
        return {}
    good: list[dict[str, Any]] = []
    for rec in raw.values():
        if not isinstance(rec, dict) or not _ID.match(str(rec.get("id") or "")):
            continue
        if _num(rec.get("gone")):
            gone = _num(rec.get("gone"))
            good.append({"id": str(rec["id"]), "gone": gone, "updated": _num(rec.get("updated")) or gone})
            continue
        try:
            size = len(json.dumps(rec, ensure_ascii=False).encode("utf-8"))
        except (TypeError, ValueError):
            continue
        if size > MAX_RECORD_BYTES:
            continue
        good.append({**rec, "id": str(rec["id"]), "updated": _num(rec.get("updated"))})
    good.sort(key=lambda r: r["updated"], reverse=True)
    return {r["id"]: r for r in good[:MAX_LESSONS]}


def merge_state(mine: Any, theirs: Any, now: float | None = None) -> dict[str, dict[str, Any]]:
    """Two devices' lessons as one: per lesson the copy changed last wins (mine on a tie); old removals forgotten."""
    now = time.time() if now is None else now
    a, b = clean_state(mine), clean_state(theirs)
    out = dict(a)
    for key, rec in b.items():
        if key not in out or rec["updated"] > out[key]["updated"]:
            out[key] = rec
    out = {k: r for k, r in out.items() if not (r.get("gone") and now - r["gone"] > GONE_DAYS * 86400)}
    return clean_state(out)


def ensure_feed(conn: Any) -> int:
    """The built-in list the lessons' passages and audio tracks are in (made the first time)."""
    row = conn.execute("SELECT id, deleted FROM feeds WHERE url = ?", (LESSONS_FEED_URL,)).fetchone()
    if row is not None:
        if row["deleted"]:
            conn.execute("UPDATE feeds SET deleted = 0 WHERE id = ?", (row["id"],))
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO feeds(uid, url, title, description, created_at) VALUES(?,?,?,?,?)",
        (ids.feed_uid(LESSONS_FEED_URL), LESSONS_FEED_URL, LESSONS_FEED_TITLE,
         "Lessons: passages and their audio tracks.", time.time()))
    return int(cur.lastrowid)
