"""Ready-made transcripts for a podcast: the DLI students' podcasts (web/js/dlicontent.js) arrive with
every episode transcribed already, so nothing has to be transcribed here.

``POST /api/premade`` follows the podcast the ordinary way (``feeds.add_feed``) when asked and it isn't
followed yet, finds each episode by its guid, else by its audio address, and stores its transcript in the
sync's own format (``sync.engine.store_transcript``, the very code that stores a transcript downloaded
from Drive). An episode that already has a transcript keeps it. Items sent without a transcript only
ask which episodes would take one (``need``), so the page decrypts only those. Each transcript stored
is then uploaded to the learner's Drive with the next sync like any other, so their other devices get it
even before they unpack their own copy. ``mobile/src/js/backend.js`` has the phone's twin, and
``web/js/dli.js checkPayload`` the twin of ``clean_payload`` (tests/test_premade.py runs both).
"""

from __future__ import annotations

import math
import re
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import limits

from .. import db, events, feeds, ids, jobs, languages, sync
from ..sync import engine

router = APIRouter(tags=["premade"])

MAX_SEGMENTS = 20000
MAX_WORDS = 300000
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


class PremadeItem(BaseModel):
    guid: str = Field("", max_length=1000)
    audio_url: str = Field("", max_length=limits.MAX_URL)
    payload: dict[str, Any] | None = None


class PremadeIn(BaseModel):
    feed_url: limits.AnyUrlText
    language: str = Field("", max_length=16)
    title: str = Field("", max_length=300)
    follow: bool = False
    items: list[PremadeItem] = Field(default_factory=list, max_length=5000)


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and 0 <= v < 1e7


def _text(v: Any, most: int) -> bool:
    return isinstance(v, str) and len(v) <= most and not _CONTROL.search(v)


def _round3(v: float) -> float:
    # (as JavaScript's Math.round(v * 1000) / 1000, so the phone and the computer agree to the last digit)
    return math.floor(v * 1000 + 0.5) / 1000


def clean_payload(raw: Any) -> dict[str, Any] | None:
    """A transcript in the sync's own format (engine.transcript_payload), checked and tidied; None when it
    isn't one. An optional part that doesn't fit (block kinds, vowels) is left out."""
    if not isinstance(raw, dict):
        return None
    segments, words, rev = raw.get("segments"), raw.get("words"), raw.get("rev")
    if not isinstance(segments, list) or not segments or len(segments) > MAX_SEGMENTS:
        return None
    if not (isinstance(rev, (int, float)) and not isinstance(rev, bool) and math.isfinite(rev) and rev > 0):
        return None
    segs: list[list[Any]] = []
    for s in segments:
        if not isinstance(s, list) or len(s) != 3 or not _num(s[0]) or not _num(s[1]) or not _text(s[2], 5000):
            return None
        segs.append([_round3(s[0]), _round3(max(s[0], s[1])), s[2]])
    if not isinstance(words, dict) or not isinstance(words.get("text"), list):
        return None
    n = len(words["text"])
    if n > MAX_WORDS or any(not isinstance(words.get(k), list) or len(words[k]) != n for k in ("start", "end", "seg")):
        return None
    w: dict[str, list[Any]] = {"start": [], "end": [], "text": [], "seg": []}
    for a, b, t, g in zip(words["start"], words["end"], words["text"], words["seg"]):
        if not _num(a) or not _num(b) or not _text(t, 200) or not isinstance(g, int) or isinstance(g, bool) \
                or not 0 <= g < len(segs):
            return None
        w["start"].append(_round3(a))
        w["end"].append(_round3(max(a, b)))
        w["text"].append(t)
        w["seg"].append(g)
    fmt = raw.get("format")
    model = raw.get("model")
    out: dict[str, Any] = {
        "format": fmt if isinstance(fmt, int) and not isinstance(fmt, bool) and 1 <= fmt <= 9 else 1,
        "rev": rev, "model": model if _text(model, 80) and model else "ready-made", "segments": segs, "words": w,
    }
    kinds = raw.get("kinds")
    if isinstance(kinds, list) and len(kinds) <= len(segs) and all(k is None or _text(k, 40) for k in kinds):
        out["kinds"] = kinds
    v = raw.get("vowels")
    if isinstance(v, dict) and isinstance(v.get("words"), list) and len(v["words"]) == n \
            and all(x is None or _text(x, 400) for x in v["words"]):
        guess = v.get("guess")
        out["vowels"] = {
            "words": v["words"], "dialect": v.get("dialect") if _text(v.get("dialect"), 40) else "",
            "guess": [g for g in guess if isinstance(g, int) and not isinstance(g, bool) and 0 <= g < n][:n]
            if isinstance(guess, list) else [],
            "model": v.get("model") if _text(v.get("model"), 80) else "",
        }
    return out


def _followed_feed(url: str) -> dict[str, Any] | None:
    clean = feeds.normalize_url(url)
    with db.session() as conn:
        row = conn.execute("SELECT * FROM feeds WHERE deleted = 0 AND url NOT LIKE 'local:%' AND (url = ? OR uid = ?)",
                           (clean, ids.feed_uid(clean))).fetchone()
    return dict(row) if row else None


@router.post("/premade")
def premade(body: PremadeIn) -> dict[str, Any]:
    """Returns {feed_id (None when the podcast isn't followed), added_feed, need: [indexes of items that
    would take a transcript], stored, kept (already had one, or being transcribed now), missing (not in
    the podcast's list)}."""
    url = body.feed_url.strip()
    if not url.lower().startswith(("http://", "https://")):
        raise HTTPException(400, "This doesn't say which podcast it is.")
    if limits.is_local_address(url):
        raise HTTPException(400, "This podcast's address is on a home network, so it can't be followed from here.")
    language = body.language if languages.valid(body.language) else None
    feed = _followed_feed(url)
    added = False
    if feed is None and body.follow:
        try:
            feed = feeds.add_feed(url)
        except feeds.FeedError as exc:
            raise HTTPException(400, f"Couldn't add the podcast: {exc}") from exc
        added = True
        if language:  # (filed under the language it is for, not the one being studied right now)
            with db.session() as conn:
                conn.execute("UPDATE feeds SET language = ? WHERE id = ?", (language, feed["id"]))
    out: dict[str, Any] = {"feed_id": None, "added_feed": added, "need": [], "stored": 0, "kept": 0, "missing": 0}
    if feed is None:
        return out
    out["feed_id"] = feed["id"]
    for i, item in enumerate(body.items):
        guid = " ".join(item.guid.split())[:500]
        audio = item.audio_url.strip() if item.audio_url.strip().lower().startswith(("http://", "https://")) else ""
        if not guid and not audio:
            out["missing"] += 1
            continue
        with db.session() as conn:
            row = conn.execute(
                "SELECT id, status FROM episodes WHERE feed_id = ? AND deleted = 0 "
                "AND (uid = ? OR (? <> '' AND guid = ?) OR (? <> '' AND audio_url = ?)) ORDER BY id LIMIT 1",
                (feed["id"], ids.episode_uid(feed["uid"], guid or audio), guid, guid, audio, audio)).fetchone()
        if row is None:
            out["missing"] += 1
            continue
        if row["status"] in ("done", "downloading", "transcribing"):
            out["kept"] += 1
            continue
        if item.payload is None:
            out["need"].append(i)
            continue
        payload = clean_payload(item.payload)
        if payload is None:
            raise HTTPException(400, "That transcript isn't in the form the app keeps transcripts in.")
        jobs.cancel(row["id"])  # queued here meanwhile: the ready-made one makes that unnecessary
        engine.store_transcript(row["id"], payload)
        # Uploaded with the next sync, like a transcript made here (store_transcript marks it as come from Drive).
        with db.session() as conn, db.sync_writes(conn):
            conn.execute("UPDATE episodes SET synced_rev = NULL WHERE id = ?", (row["id"],))
        out["stored"] += 1
    if added or out["stored"]:
        events.publish("feeds", {"refreshed": True})
        sync.request()
    return out
