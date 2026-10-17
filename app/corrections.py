"""Misheard words: changing a transcript's words in place when a word lookup found that a word
was misheard or misspelt (the answer's "correction", see web/js/definer.js and correction.js).

Only the words and the line they are in change (and the line in the search index). The
episode's transcribed_at is moved on, so sync sends the changed transcript to the other devices.
"""

from __future__ import annotations

import time
from typing import Any

from . import arabic, db

MAX_WORDS = 8          # words changed at once
MAX_WORD_CHARS = 120


class CorrectionError(RuntimeError):
    pass


def replace_in_text(text: str, old_words: list[str], new_words: list[str]) -> str:
    """A line's text after some of its words changed (same rules as replaceInText in correction.js):
    each word is found in order and only changed ones are replaced; if they can't all be found, the
    line is rebuilt from the new words."""
    spans: list[tuple[int, int]] = []
    at = 0
    for word in old_words:
        pos = text.find(word, at)
        if pos < 0:
            return " ".join(new_words)
        spans.append((pos, pos + len(word)))
        at = pos + len(word)
    out = text
    for k in range(len(spans) - 1, -1, -1):
        if old_words[k] != new_words[k]:
            out = out[:spans[k][0]] + new_words[k] + out[spans[k][1]:]
    return out


def correct_words(episode_id: int, first: int, last: int, expect: list[str], words: list[str]) -> dict[str, Any]:
    """Replace the episode's words first..last (which must still read `expect`) with `words`.
    Returns {"ok": True, "transcribed_at": ...}."""
    count = last - first + 1
    if first < 0 or count < 1 or count > MAX_WORDS or len(expect) != count or len(words) != count:
        raise CorrectionError("That change doesn't fit the transcript.")
    clean = [" ".join(str(w).split()) for w in words]
    if any(not w or len(w) > MAX_WORD_CHARS for w in clean):
        raise CorrectionError("That change doesn't fit the transcript.")
    now = time.time()
    with db.session() as conn:
        rows = conn.execute("SELECT idx, seg_idx, text FROM words WHERE episode_id = ? AND idx BETWEEN ? AND ? ORDER BY idx",
                            (episode_id, first, last)).fetchall()
        if [r["text"] for r in rows] != list(expect):
            raise CorrectionError("The transcript has changed since the word was looked up. Tap it again.")
        new_by_idx = {r["idx"]: clean[k] for k, r in enumerate(rows)}
        for seg in sorted({r["seg_idx"] for r in rows}):
            line_words = conn.execute("SELECT idx, text FROM words WHERE episode_id = ? AND seg_idx = ? ORDER BY idx",
                                      (episode_id, seg)).fetchall()
            old = [w["text"] for w in line_words]
            new = [new_by_idx.get(w["idx"], w["text"]) for w in line_words]
            row = conn.execute("SELECT text FROM segments WHERE episode_id = ? AND idx = ?", (episode_id, seg)).fetchone()
            if row is not None:
                text = replace_in_text(row["text"], old, new)
                norm = arabic.normalize(text)
                conn.execute("UPDATE segments SET text = ?, norm = ? WHERE episode_id = ? AND idx = ?",
                             (text, norm, episode_id, seg))
                conn.execute("DELETE FROM segments_fts WHERE episode_id = ? AND seg_idx = ?", (episode_id, seg))
                conn.execute("INSERT INTO segments_fts(norm, episode_id, seg_idx) VALUES(?,?,?)", (norm, episode_id, seg))
        for idx, text in new_by_idx.items():
            conn.execute("UPDATE words SET text = ? WHERE episode_id = ? AND idx = ?", (text, episode_id, idx))
        # A fresh transcribed_at makes the next sync publish the changed transcript.
        conn.execute("UPDATE episodes SET transcribed_at = ? WHERE id = ?", (now, episode_id))
    return {"ok": True, "transcribed_at": now}
