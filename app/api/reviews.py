"""The vocab reviewer's record: every answer given to a word's card.

The reviewer runs in the page (web/js/pages/review.js) and works out each word's schedule itself
by replaying these answers (web/js/review/fsrs.js); the server only keeps them and syncs them.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, sync

router = APIRouter(prefix="/reviews", tags=["reviews"])

RATINGS = (0, 1, 3)  # taken back with Undo, not remembered, remembered


class AnswerIn(BaseModel):
    uid: str         # the word's uid
    t: int           # when, in milliseconds: with the uid it names the answer
    rating: int
    day: int         # the answering device's local day number
    ms: int = 0      # how long the card was looked at


def log(conn: Any) -> dict[str, list[list[int]]]:
    """Every answer by word: {uid: [[t, rating, day, ms], ...]}, each word's oldest first."""
    out: dict[str, list[list[int]]] = {}
    for r in conn.execute("SELECT vocab_uid, t, rating, day, ms FROM reviews ORDER BY vocab_uid, t"):
        out.setdefault(r[0], []).append([r[1], r[2], r[3], r[4]])
    return out


@router.get("")
def list_reviews() -> dict[str, Any]:
    with db.session() as conn:
        return {"reviews": log(conn)}


@router.post("")
def add_review(body: AnswerIn) -> dict[str, bool]:
    """Record one answer. Sending the same answer again with rating 0 takes it back (Undo)."""
    if body.rating not in RATINGS or not body.uid.strip() or body.t <= 0:
        raise HTTPException(400, "That isn't an answer.")
    with db.session() as conn:
        conn.execute(
            "INSERT INTO reviews(vocab_uid, t, rating, day, ms) VALUES(?,?,?,?,?) "
            "ON CONFLICT(vocab_uid, t) DO UPDATE SET rating = excluded.rating",
            (body.uid.strip(), body.t, body.rating, body.day, max(0, body.ms)))
    sync.request(delay=20)  # a review session is many answers in a row: wait for a pause
    return {"ok": True}
