"""Books: kept in a built-in "My books" feed and read a page at a time with clickable words.

A book is an ordinary episode whose "transcript" is the book's text, like an imported web page
(see pages.py), so the word popup, vocab, search and Drive sync all work unchanged. What marks it out:
    guid         "book:<lang>/<id>" for one from Tamkeen's free shelf (docs/books, tools/build_books.py),
                 "file:<name>:<size>" for one the learner uploaded
    audio_url    where it came from (the shelf's credit line, or the uploaded file's name)
    audio_type   "text/book"
    description  the author
    status       "done" from the start (there is nothing to transcribe)
Each heading or paragraph is one segment (`segments.kind` "h2" or "p"). The text is read and split
into headings and paragraphs in the app's own page (web/js/books.js, bookfiles.js); this stores it.
"""

from __future__ import annotations

import time
from typing import Any

from . import arabic, db, ids, languages

LOCAL_FEED_URL = "local:books"
LOCAL_FEED_TITLE = "My books"
BOOK_TYPE = "text/book"
KINDS = {"h2", "p"}
MAX_WORDS = 500_000


class BookError(RuntimeError):
    pass


def ensure_feed(conn: Any) -> int:
    row = conn.execute("SELECT id, deleted FROM feeds WHERE url = ?", (LOCAL_FEED_URL,)).fetchone()
    if row is not None:
        if row["deleted"]:
            conn.execute("UPDATE feeds SET deleted = 0 WHERE id = ?", (row["id"],))
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO feeds(uid, url, title, description, created_at) VALUES(?,?,?,?,?)",
        (ids.feed_uid(LOCAL_FEED_URL), LOCAL_FEED_URL, LOCAL_FEED_TITLE,
         "Books to read a page at a time with clickable words.", time.time()))
    return int(cur.lastrowid)


def clean_blocks(blocks: list[dict[str, Any]]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    words = 0
    for b in blocks or []:
        text = " ".join(str(b.get("text") or "").split())
        if not text:
            continue
        kind = b.get("kind") if b.get("kind") in KINDS else "p"
        tokens = text.split(" ")
        if words + len(tokens) > MAX_WORDS:
            tokens = tokens[:MAX_WORDS - words]
            text = " ".join(tokens)
        if not tokens:
            break
        words += len(tokens)
        out.append((kind, text))
    return out


def save_book(guid: str, title: str, author: str, lang: str, blocks: list[dict[str, Any]], source: str = "") -> dict[str, Any]:
    """Create (or replace) the book's episode and store its text. Returns the episode row."""
    guid = (guid or "").strip()[:300]
    if not guid.startswith(("book:", "file:")):
        raise BookError("Unknown book.")
    items = clean_blocks(blocks)
    if not items:
        raise BookError("No readable text was found in that book.")
    title = " ".join((title or "").split())[:300] or "Book"
    author = " ".join((author or "").split())[:200]
    language = lang if languages.valid(lang) else languages.detect(" ".join(text for _kind, text in items[:80]))
    now = time.time()
    with db.session() as conn:
        feed_id = ensure_feed(conn)
        feed_uid = conn.execute("SELECT uid FROM feeds WHERE id = ?", (feed_id,)).fetchone()["uid"]
        uid = ids.episode_uid(feed_uid, guid)
        row = conn.execute("SELECT id FROM episodes WHERE uid = ?", (uid,)).fetchone()
        if row is None:
            cur = conn.execute(
                "INSERT INTO episodes(feed_id, uid, guid, title, description, published, audio_url, audio_type, "
                "language, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (feed_id, uid, guid, title, author, now, (source or "")[:500], BOOK_TYPE, language, now))
            ep_id = int(cur.lastrowid)
        else:
            ep_id = int(row["id"])
            conn.execute("UPDATE episodes SET title = ?, description = ?, language = ?, deleted = 0 WHERE id = ?",
                         (title, author, language, ep_id))
            for table in ("words", "segments", "segments_fts"):
                conn.execute(f"DELETE FROM {table} WHERE episode_id = ?", (ep_id,))
        widx = 0
        for sidx, (kind, text) in enumerate(items):
            tokens = text.split(" ")
            norm = arabic.normalize(text)
            conn.execute(
                "INSERT INTO segments(episode_id, idx, start, end, text, norm, kind) VALUES(?,?,?,?,?,?,?)",
                (ep_id, sidx, float(widx), float(widx + len(tokens)), text, norm, kind))
            conn.execute("INSERT INTO segments_fts(norm, episode_id, seg_idx) VALUES(?,?,?)", (norm, ep_id, sidx))
            conn.executemany(
                "INSERT INTO words(episode_id, idx, seg_idx, start, end, text) VALUES(?,?,?,?,?,?)",
                [(ep_id, widx + i, sidx, float(widx + i), float(widx + i + 1), t) for i, t in enumerate(tokens)])
            widx += len(tokens)
        # A fresh transcribed_at makes sync publish the text to the user's other devices.
        conn.execute(
            "UPDATE episodes SET status = 'done', progress = 100, error = NULL, model = 'book', "
            "transcribed_at = ?, duration = NULL WHERE id = ?", (now, ep_id))
        out = dict(conn.execute("SELECT * FROM episodes WHERE id = ?", (ep_id,)).fetchone())
    out["words"] = widx
    return out
