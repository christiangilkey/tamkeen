"""Things a friend sent from a player or the Library, accepted in the chat (see
web/js/components/sendmedia.js and web/js/sharetext.js).

A YouTube video arrives through the ordinary ``POST /youtube`` (its captions come along), a web
page through ``POST /pages`` and a book (or a recording's words, to read) through ``POST /books``,
each with the text the friend had. Two need doors of their own: a reel (on this device a reel is
nothing but its address and its words, and normally those words can only be made by listening to
it through Instagram) and a podcast episode with the friend's transcript, which may belong to a
podcast this device doesn't follow yet. ``mobile/src/js/backend.js`` has the phone's twins.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, events, feeds, ids, jobs, languages, reels, sync
from ..transcriber import Segment, Word

router = APIRouter(prefix="/shared", tags=["shared"])

MAX_SEGMENTS = 400   # a reel is at most a few minutes long
MAX_WORDS = 4000
PODCAST_SEGMENTS = 20000  # a long podcast episode, never more
PODCAST_WORDS = 300000


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


def clean_segments(items: list[dict[str, Any]], max_segments: int = MAX_SEGMENTS,
                   max_words: int = MAX_WORDS) -> list[Segment]:
    """A friend's words, checked and limited: [{start, end, text, words: [[start, end, word]]}]."""
    out: list[Segment] = []
    total = 0
    for item in (items or [])[:max_segments]:
        if not isinstance(item, dict):
            continue
        words: list[Word] = []
        for w in item.get("words") or []:
            if not isinstance(w, (list, tuple)) or len(w) < 3:
                continue
            text = "".join(str(w[2]).split())[:120]
            if text and total < max_words:
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


class PodcastIn(BaseModel):
    feed_url: str
    guid: str = ""
    audio_url: str = ""
    title: str = ""
    image: str = ""
    duration: float | None = None
    language: str | None = None
    model: str = ""
    segments: list[dict[str, Any]] = []


def _followed_feed(url: str) -> dict[str, Any] | None:
    clean = feeds.normalize_url(url)
    with db.session() as conn:
        row = conn.execute("SELECT * FROM feeds WHERE deleted = 0 AND url NOT LIKE 'local:%' AND (url = ? OR uid = ?)",
                           (clean, ids.feed_uid(clean))).fetchone()
    return dict(row) if row else None


@router.post("/podcast")
def accept_podcast(body: PodcastIn) -> dict[str, Any]:
    """Keep a podcast episode a friend sent: follow its podcast if this device doesn't yet, find the
    episode (or add it, when the feed no longer lists it) and store the friend's transcript, so it
    opens ready. A transcript made here already is kept. Returns {episode, transcribed, kept_own,
    added_feed}."""
    from .episodes import _episode

    url = body.feed_url.strip()
    if not url.lower().startswith(("http://", "https://")):
        raise HTTPException(400, "This doesn't say which podcast the episode is from.")
    language = body.language if languages.valid(body.language) else None
    feed = _followed_feed(url)
    added = False
    if feed is None:
        try:
            feed = feeds.add_feed(url)
        except feeds.FeedError as exc:
            raise HTTPException(400, f"Couldn't add the podcast: {exc}") from exc
        added = True
        if language:  # followed for this episode: it belongs with the episode's language
            with db.session() as conn:
                conn.execute("UPDATE feeds SET language = ? WHERE id = ?", (language, feed["id"]))
    audio_url = body.audio_url.strip()[:1000] if body.audio_url.strip().lower().startswith(("http://", "https://")) else ""
    guid = " ".join(body.guid.split())[:500] or audio_url
    if not guid:
        raise HTTPException(400, "This doesn't say which episode it is.")
    now = time.time()
    with db.session() as conn:
        row = conn.execute(
            "SELECT id, status, deleted FROM episodes WHERE feed_id = ? AND (uid = ? OR (? <> '' AND audio_url = ?)) "
            "ORDER BY deleted, id LIMIT 1", (feed["id"], ids.episode_uid(feed["uid"], guid), audio_url, audio_url)).fetchone()
        if row is None:
            # No longer in the podcast's list (old episodes drop off): kept from what the friend sent.
            if not audio_url:
                raise HTTPException(400, "This episode isn't in the podcast's episode list any more.")
            cur = conn.execute(
                "INSERT INTO episodes(feed_id, uid, guid, title, description, published, duration, image, audio_url, "
                "language, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (feed["id"], ids.episode_uid(feed["uid"], guid), guid, " ".join(body.title.split())[:500] or "Episode", "",
                 now, body.duration, body.image if body.image.startswith("https://") else None, audio_url, language, now))
            ep_id, status = int(cur.lastrowid), "new"
        else:
            ep_id, status = int(row["id"]), row["status"]
            if row["deleted"]:
                conn.execute("UPDATE episodes SET deleted = 0, status = 'new', transcribed_at = NULL WHERE id = ?", (ep_id,))
                status = "new"
    segments = clean_segments(body.segments, PODCAST_SEGMENTS, PODCAST_WORDS)
    kept_own = transcribed = False
    if segments and status == "done":
        kept_own = True
    elif segments:
        jobs.cancel(ep_id)  # queued here meanwhile: the friend's words make that unnecessary
        jobs._store(ep_id, segments, (body.model or "shared")[:80], language or feed.get("language") or languages.study())
        transcribed = True
    events.publish("feeds", {"refreshed": True})
    sync.request()
    return {"episode": _episode(ep_id), "transcribed": transcribed, "kept_own": kept_own, "added_feed": added}
