"""Things a friend sent from a player, accepted in the chat (see web/js/components/sendmedia.js).

A YouTube video arrives through the ordinary ``POST /youtube`` (its captions come along) and a
web page or podcast through their usual routes. Only a reel needs a door of its own: on this
device a reel is nothing but its address and its words, and normally those words can only be
made by listening to it through Instagram.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import events, languages, reels, sync
from ..transcriber import Segment, Word

router = APIRouter(prefix="/shared", tags=["shared"])

MAX_SEGMENTS = 400   # a reel is at most a few minutes long
MAX_WORDS = 4000


class ReelIn(BaseModel):
    code: str
    creator: str = ""
    title: str = ""
    language: str | None = None
    seconds: float | None = None
    signin: bool = False
    model: str = ""
    segments: list[dict[str, Any]]


def _num(x: Any) -> float:
    try:
        return max(0.0, float(x))
    except (TypeError, ValueError):
        return 0.0


def clean_segments(items: list[dict[str, Any]]) -> list[Segment]:
    """A friend's words for a reel, checked and limited: [{start, end, text, words: [[start, end, word]]}]."""
    out: list[Segment] = []
    total = 0
    for item in (items or [])[:MAX_SEGMENTS]:
        if not isinstance(item, dict):
            continue
        words: list[Word] = []
        for w in item.get("words") or []:
            if not isinstance(w, (list, tuple)) or len(w) < 3:
                continue
            text = "".join(str(w[2]).split())[:120]
            if text and total < MAX_WORDS:
                start = _num(w[0])
                words.append(Word(start, max(start, _num(w[1])), text))
                total += 1
        text = " ".join(str(item.get("text") or "").split())[:2000] or " ".join(w.text for w in words)
        if not text:
            continue
        start = _num(item.get("start")) if item.get("start") is not None else (words[0].start if words else 0.0)
        end = max(_num(item.get("end")), words[-1].end if words else start)
        out.append(Segment(start, end, text, words))
    return out


@router.post("/reel")
def accept_reel(body: ReelIn) -> dict[str, Any]:
    """Keep a reel a friend sent, with the words that came with it."""
    language = body.language if languages.valid(body.language) else languages.study()
    try:
        ep = reels.save_reel(body.code, body.creator, body.title, clean_segments(body.segments), language,
                             (body.model or "shared")[:80], body.seconds, body.signin)
    except reels.ReelError as exc:
        raise HTTPException(400, str(exc)) from exc
    events.publish("feeds", {"refreshed": True})
    sync.request()
    return ep
