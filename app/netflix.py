"""Netflix titles: watched in Netflix's own web player, studied through Netflix's own subtitles.

Netflix's videos are copy-protected, so Tamkeen can never play them itself. On the computer they
play in Netflix's web player inside a window of the app laid exactly over the player's stage
(app/netflix_overlay.py), the way Language Reactor works: Tamkeen drives that player from outside
(play, pause, seek) and shows the subtitles as clickable words underneath it.

A title is an ordinary episode of the built-in "Netflix" feed, like a YouTube video:
    audio_url    the title's watch address (https://www.netflix.com/watch/<id>)
    audio_type   "video/netflix": the player drives Netflix's player instead of playing a file
    guid         Netflix's number for the title (for a series: the episode's)
    description  the series' name, for an episode
    model        "netflix-pending" until its subtitles have arrived, then "netflix-subtitles"
    status       "done" from the start (there is nothing to transcribe)

The subtitles come from the owner's own Netflix session, for his own study: when a title starts,
the page script (web/js/netflix-player.js) switches Netflix's subtitles to the language being
learned; Netflix then downloads that subtitle file (TTML) from its video servers; the window
notices the download, and the file is fetched once more here and parsed (`parse_ttml`). The words
are kept like any other transcript (they sync only through the user's own private Drive folder),
and Netflix titles are never offered for sending to a friend.

Nothing here talks to Netflix's own website. For tests, `TAMKEEN_NETFLIX_BASE` points "Netflix" at a
local stand-in and `TAMKEEN_NETFLIX_SUBS` says which host serves its subtitle files.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import urlsplit

from . import db, ids, languages, youtube

log = logging.getLogger(__name__)

LOCAL_FEED_URL = "local:netflix"
LOCAL_FEED_TITLE = "Netflix"
NF_TYPE = "video/netflix"
MODEL_PENDING = "netflix-pending"
MODEL_SUBTITLES = "netflix-subtitles"
NETFLIX_BASE = "https://www.netflix.com"
NETFLIX_HOSTS = {"www.netflix.com", "netflix.com"}
# Netflix's video servers ("Open Connect"), which also serve the subtitle files.
SUBTITLE_HOSTS = r"(^|\.)nflxvideo\.net$"
# The pages that list titles by language. Netflix's help pages name /browse/audio and
# /browse/subtitles; the "Browse by Languages" page with its "Original Language" choice is
# /browse/original-audio. The page script tries them in this order (web/js/netflix-browser.js).
BROWSE_PATHS = ("/browse/original-audio", "/browse/audio", "/browse/subtitles")
MAX_TTML_BYTES = 10 * 1024 * 1024


class NetflixError(RuntimeError):
    pass


# ---------------------------------------------------------------- addresses

def base_url() -> str:
    """Netflix's address, or (tests only) the local stand-in's."""
    test = (os.environ.get("TAMKEEN_NETFLIX_BASE") or "").strip().rstrip("/")
    return test if re.fullmatch(r"https?://(127\.0\.0\.1|localhost)(:\d+)?", test) else NETFLIX_BASE


def hosts() -> set[str]:
    """The website the browser window and the video window treat as Netflix."""
    test = base_url()
    return NETFLIX_HOSTS if test == NETFLIX_BASE else {urlsplit(test).hostname or ""}


def on_netflix(url: str | None) -> bool:
    parts = urlsplit(url or "")
    if base_url() == NETFLIX_BASE and parts.scheme != "https":
        return False
    return (parts.hostname or "").lower() in hosts()


def subtitle_hosts() -> re.Pattern[str]:
    """Which hosts' downloads may be subtitle files (tests point it at their own server)."""
    raw = os.environ.get("TAMKEEN_NETFLIX_SUBS") or SUBTITLE_HOSTS
    try:
        return re.compile(raw)
    except re.error:
        return re.compile(SUBTITLE_HOSTS)


def is_subtitle_download(url: str, headers: dict[str, Any] | None) -> bool:
    """Is this download (seen by the video window) possibly a subtitle file? Netflix serves them as
    text/xml from its video servers; pictures (svg) and video pieces are not."""
    parts = urlsplit(url or "")
    if parts.scheme not in ("https", "http") or not subtitle_hosts().search((parts.hostname or "").lower()):
        return False
    ctype = ""
    for k, v in (headers or {}).items():
        if str(k).lower() == "content-type":
            ctype = str(v).lower()
    return "svg" not in ctype and any(x in ctype for x in ("xml", "ttml", "vtt", "text/plain"))


def is_netflix(audio_type: str | None) -> bool:
    return (audio_type or "") == NF_TYPE


def clean_id(value: Any) -> str:
    text = str(value if value is not None else "").strip()
    if not re.fullmatch(r"\d{3,12}", text):
        raise NetflixError("That doesn't look like a Netflix title.")
    return text


def watch_url(netflix_id: str) -> str:
    return f"{base_url()}/watch/{netflix_id}"


def watch_id(url: str | None) -> str:
    """The title number in a watch address (/watch/81234567?trackId=…), else ""."""
    if not on_netflix(url):
        return ""
    m = re.match(r"^/watch/(\d{3,12})(?:/|$)", urlsplit(url or "").path)
    return m.group(1) if m else ""


def start_address(url: str | None) -> str:
    """Where the Netflix window opens: the address asked for if it is on Netflix, else the
    "Browse by Languages" page."""
    url = (url or "").strip()
    return url if on_netflix(url) else base_url() + BROWSE_PATHS[0]


# ---------------------------------------------------------------- languages

_FOLD = {"fil": "tl", "cmn": "zh", "yue": "zh", "iw": "he", "nb": "no", "nn": "no", "in": "id", "per": "fa", "fas": "fa"}


def base_language(code: str | None) -> str:
    """"ar-LB" -> "ar", "zh-Hans" -> "zh", "fil" (Netflix's Filipino) -> "tl"."""
    b = str(code or "").strip().lower().replace("_", "-").split("-")[0]
    return _FOLD.get(b, b)


# ---------------------------------------------------------------- reading TTML subtitle files

_XML_NS = "{http://www.w3.org/XML/1998/namespace}"
_CLOCK = re.compile(r"^(\d+):(\d{1,2}):(\d{1,2}(?:[.,]\d+)?)$")
_FRAMES = re.compile(r"^(\d+):(\d{1,2}):(\d{1,2}):(\d+)(?:\.(\d+))?$")
_OFFSET = re.compile(r"^(\d+(?:\.\d+)?)(h|ms|m|s|f|t)$")
# Marks that are invisible but split words wrongly (bidi controls Arabic subtitles are full of).
_INVISIBLE = re.compile("[​-‏‪-‮⁠-⁩﻿]")
_SOUND = re.compile(r"\[[^\]]*\]|[♪♫]+")
_DASH = re.compile(r"^\s*[-–—]+\s*")


@dataclass
class _Rates:
    tick: float = 1.0
    frame: float = 30.0
    sub: float = 1.0


def _local(name: str) -> str:
    return name.rsplit("}", 1)[-1]


def _attr(el: ET.Element, name: str) -> str | None:
    for key, value in el.attrib.items():
        if _local(key) == name:
            return value
    return None


def _number(text: str | None, fallback: float) -> float:
    try:
        value = float(str(text).strip())
        return value if value > 0 else fallback
    except (TypeError, ValueError):
        return fallback


def _rates(root: ET.Element) -> _Rates:
    frame = _number(_attr(root, "frameRate"), 30.0)
    mult = (_attr(root, "frameRateMultiplier") or "").split()
    if len(mult) == 2:
        frame *= _number(mult[0], 1.0) / _number(mult[1], 1.0)
    sub = _number(_attr(root, "subFrameRate"), 1.0)
    tick_raw = _attr(root, "tickRate")
    tick = _number(tick_raw, 1.0) if tick_raw else (frame * sub if _attr(root, "frameRate") else 1.0)
    return _Rates(tick=tick, frame=frame, sub=sub)


def ttml_seconds(expr: str | None, rates: _Rates | None = None) -> float | None:
    """A TTML time ("240000000t", "00:00:24.000", "00:00:24:12", "24.5s", "1500ms") in seconds."""
    rates = rates or _Rates()
    s = str(expr or "").strip()
    if not s:
        return None
    m = _CLOCK.match(s)
    if m:
        return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3).replace(",", "."))
    m = _FRAMES.match(s)
    if m:  # hh:mm:ss:frames(.sub-frames)
        return (int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
                + int(m.group(4)) / rates.frame + int(m.group(5) or 0) / (rates.frame * rates.sub))
    m = _OFFSET.match(s)
    if m:
        value, unit = float(m.group(1)), m.group(2)
        return {"h": value * 3600, "m": value * 60, "s": value, "ms": value / 1000,
                "f": value / rates.frame, "t": value / rates.tick}[unit]
    return None


def _cue_text(p: ET.Element) -> str:
    """A cue's words: its text and spans, a line break (<br/>) as a space, without sound labels,
    the dash that opens a speaker's line or invisible marks."""
    parts: list[str] = []

    def walk(el: ET.Element) -> None:
        name = _local(el.tag)
        if name == "br":
            parts.append("\n")
        elif name != "metadata":
            parts.append(el.text or "")
            for child in el:
                walk(child)
                parts.append(child.tail or "")

    walk(p)
    lines = []
    for line in _INVISIBLE.sub("", "".join(parts)).split("\n"):
        line = " ".join(_SOUND.sub(" ", _DASH.sub("", line)).split())
        if line:
            lines.append(line)
    return " ".join(lines)


def parse_ttml(text: str | bytes) -> dict[str, Any]:
    """A TTML / DFXP subtitle file (as Netflix serves them) -> {"lang", "cues": [(start, end, text)]},
    times in seconds, in order. `end` may be None when the file gives none (the next cue's start is
    used later). Raises NetflixError for anything that isn't a readable subtitle file."""
    if isinstance(text, bytes):
        if len(text) > MAX_TTML_BYTES:
            raise NetflixError("That subtitle file is too big.")
        text = text.decode("utf-8", "replace")
    text = (text or "").lstrip("﻿")
    if len(text) > MAX_TTML_BYTES:
        raise NetflixError("That subtitle file is too big.")
    if re.search(r"<!ENTITY", text, re.I):
        raise NetflixError("That subtitle file can't be read.")
    text = re.sub(r"<!DOCTYPE[^>\[]*>", "", text, flags=re.I)
    start = text.find("<")
    try:
        root = ET.fromstring(text[start:] if start >= 0 else text)
    except ET.ParseError as exc:
        raise NetflixError("That subtitle file can't be read.") from exc
    if _local(root.tag) != "tt":
        raise NetflixError("That isn't a subtitle file.")
    rates = _rates(root)
    lang = root.get(_XML_NS + "lang") or ""
    cues: list[tuple[float, float | None, str]] = []

    def walk(el: ET.Element, offset: float) -> None:
        nonlocal lang
        if not lang and el.get(_XML_NS + "lang"):
            lang = el.get(_XML_NS + "lang") or ""
        name = _local(el.tag)
        if name in ("head", "metadata", "styling", "layout"):
            return
        began = ttml_seconds(_attr(el, "begin"), rates)
        here = offset + (began or 0.0)
        if name == "p":
            if began is None:
                return
            end = ttml_seconds(_attr(el, "end"), rates)
            dur = ttml_seconds(_attr(el, "dur"), rates)
            stop = offset + end if end is not None else here + dur if dur is not None else None
            words = _cue_text(el)
            if words:
                cues.append((round(here, 3), round(stop, 3) if stop is not None else None, words))
            return
        for child in el:
            walk(child, here)

    for child in root:
        walk(child, 0.0)
    cues.sort(key=lambda c: c[0])
    return {"lang": lang.strip(), "cues": cues}


def _spread(text: str, start: float, end: float) -> list[list[Any]]:
    """The words of a line, spread over start..end in proportion to their length (the same as
    spread() in web/js/ytcaptions.js: a subtitle only times the whole line)."""
    tokens = [t for t in text.split(" ") if t]
    total = sum(len(t) for t in tokens) or 1
    out, at = [], start
    for t in tokens:
        nxt = at + (end - start) * (len(t) / total)
        out.append([round(at, 3), round(nxt, 3), t])
        at = nxt
    return out


def caption_lines(cues: list[tuple[float, float | None, str]]) -> list[dict[str, Any]]:
    """Cues -> lines as youtube.clean_lines takes them: [{start, end, text, words}]. A cue that is
    still on screen when the next begins ends there, as for YouTube's captions."""
    lines: list[dict[str, Any]] = []
    for i, (start, end, text) in enumerate(cues):
        nxt = cues[i + 1][0] if i + 1 < len(cues) else None
        if end is None:
            end = nxt if nxt is not None and nxt > start else start + 2.0
        elif nxt is not None and start < nxt < end:
            end = nxt
        if end <= start:
            end = start + 0.5
        words = _spread(text, start, end)
        floor = lines[-1]["words"][-1][0] if lines else 0.0
        for w in words:  # times never run backwards
            w[0] = max(w[0], floor)
            w[1] = max(w[1], w[0])
            floor = w[0]
        if words:
            lines.append({"start": words[0][0], "end": round(max(end, words[-1][1]), 3), "text": text, "words": words})
    return lines


def download(url: str) -> bytes:
    """Fetch a subtitle file Netflix's player just downloaded (it needs no sign-in)."""
    if not is_subtitle_download(url, {"content-type": "text/xml"}):
        raise NetflixError("Only Netflix's subtitle files can be fetched here.")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                                             "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36"})
    with urllib.request.urlopen(req, timeout=20) as res:  # noqa: S310 (the host is checked above)
        body = res.read(MAX_TTML_BYTES + 1)
    if len(body) > MAX_TTML_BYTES:
        raise NetflixError("That subtitle file is too big.")
    return body


# ---------------------------------------------------------------- titles in the library

def ensure_feed(conn: Any) -> int:
    row = conn.execute("SELECT id, deleted FROM feeds WHERE url = ?", (LOCAL_FEED_URL,)).fetchone()
    if row is not None:
        if row["deleted"]:
            conn.execute("UPDATE feeds SET deleted = 0 WHERE id = ?", (row["id"],))
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO feeds(uid, url, title, description, created_at) VALUES(?,?,?,?,?)",
        (ids.feed_uid(LOCAL_FEED_URL), LOCAL_FEED_URL, LOCAL_FEED_TITLE,
         "Netflix titles you watched in Tamkeen. They play from Netflix; their subtitles are the transcript.", time.time()))
    return int(cur.lastrowid)


def _text(value: Any, limit: int) -> str:
    return " ".join(str("" if value is None else value).split())[:limit]


def _whole(value: Any) -> int:
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError, OverflowError):
        return 0


def clean_info(info: Any) -> dict[str, Any]:
    """What a page said about a title, kept to plain short values: title, show (a series' name),
    season, episode, episode_title, image (https only), duration (seconds)."""
    raw = info if isinstance(info, dict) else {}
    image = str(raw.get("image") or "")
    return {
        "title": _text(raw.get("title"), 200),
        "show": _text(raw.get("show"), 200),
        "season": _whole(raw.get("season")) or None,
        "episode": _whole(raw.get("episode")) or None,
        "episode_title": _text(raw.get("episode_title"), 200),
        "image": image[:500] if image.startswith("https://") else "",
        "duration": _whole(raw.get("duration")) or None,
    }


def display_title(info: dict[str, Any]) -> str:
    """"Show · S1:E3 · Episode title" for an episode, the film's title for a film."""
    show, title, ep_title = info.get("show") or "", info.get("title") or "", info.get("episode_title") or ""
    if show:
        number = f"S{info['season']}:E{info['episode']}" if info.get("season") and info.get("episode") else ""
        parts = [show, number, ep_title if ep_title and ep_title != show else ""]
        return " · ".join(p for p in parts if p)[:300]
    return (title or ep_title or "Netflix title")[:300]


def find_title(netflix_id: str) -> dict[str, Any] | None:
    """The episode of a title already in the library, else None."""
    netflix_id = clean_id(netflix_id)
    with db.session() as conn:
        row = conn.execute(
            "SELECT e.* FROM episodes e JOIN feeds f ON f.id = e.feed_id "
            "WHERE f.url = ? AND e.guid = ? AND e.deleted = 0", (LOCAL_FEED_URL, netflix_id)).fetchone()
    return dict(row) if row is not None else None


def save_title(netflix_id: str, info: Any = None, language: str | None = None, replaces: str | None = None) -> dict[str, Any]:
    """Create (or refresh) the title's episode. Its subtitles come later (save_subtitles), so a new
    one has no words yet. `replaces`: the title Netflix moved on from (a series opened by its own
    number plays one of its episodes); that one goes if it never got any subtitles."""
    netflix_id = clean_id(netflix_id)
    info = clean_info(info)
    language = language if languages.valid(language) else languages.study()
    now = time.time()
    with db.session() as conn:
        feed_id = ensure_feed(conn)
        feed_uid = conn.execute("SELECT uid FROM feeds WHERE id = ?", (feed_id,)).fetchone()["uid"]
        uid = ids.episode_uid(feed_uid, netflix_id)
        row = conn.execute("SELECT * FROM episodes WHERE uid = ?", (uid,)).fetchone()
        title = display_title(info)
        if row is None:
            cur = conn.execute(
                "INSERT INTO episodes(feed_id, uid, guid, title, description, published, image, audio_url, audio_type, "
                "language, duration, status, progress, model, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (feed_id, uid, netflix_id, title, info["show"], now, info["image"] or None, watch_url(netflix_id),
                 NF_TYPE, language, info["duration"], "done", 100, MODEL_PENDING, now))
            ep_id = int(cur.lastrowid)
        else:
            ep_id = int(row["id"])
            # A better name or picture than the one kept (the first page may only have known the series).
            better = info["title"] or info["show"]
            conn.execute(
                "UPDATE episodes SET title = ?, description = ?, image = COALESCE(?, image), "
                "duration = COALESCE(?, duration), deleted = 0, status = 'done' WHERE id = ?",
                (title if better else row["title"], info["show"] or row["description"] or "", info["image"] or None,
                 info["duration"], ep_id))
        if replaces and replaces != netflix_id and re.fullmatch(r"\d{3,12}", str(replaces)):
            old = conn.execute(
                "SELECT e.id FROM episodes e WHERE e.feed_id = ? AND e.guid = ? AND e.deleted = 0 AND e.model = ? "
                "AND NOT EXISTS (SELECT 1 FROM words w WHERE w.episode_id = e.id)",
                (feed_id, str(replaces), MODEL_PENDING)).fetchone()
            if old is not None:
                conn.execute("UPDATE episodes SET deleted = 1 WHERE id = ?", (old["id"],))
        out = dict(conn.execute("SELECT * FROM episodes WHERE id = ?", (ep_id,)).fetchone())
        out["words"] = conn.execute("SELECT COUNT(*) FROM words WHERE episode_id = ?", (ep_id,)).fetchone()[0]
    return out


def save_subtitles(netflix_id: str, parsed: dict[str, Any], language: str | None = None) -> dict[str, Any] | None:
    """Keep a parsed subtitle file as the title's transcript (like a YouTube video's captions
    written by a person: timed per line). Returns the episode row, or None if the title isn't in
    the library."""
    netflix_id = clean_id(netflix_id)
    items = youtube.clean_lines(caption_lines(parsed.get("cues") or []))
    if not items:
        raise NetflixError("That subtitle file has no words.")
    row = find_title(netflix_id)
    if row is None:
        return None
    language = language if languages.valid(language) else base_language(parsed.get("lang"))
    if not languages.valid(language):
        language = row["language"]
    now = time.time()
    with db.session() as conn:
        widx = youtube.write_lines(conn, row["id"], items)
        conn.execute(
            "UPDATE episodes SET status = 'done', progress = 100, error = NULL, model = ?, transcribed_at = ?, "
            "language = ?, duration = COALESCE(duration, ?) WHERE id = ?",
            (MODEL_SUBTITLES, now, language, items[-1][1], row["id"]))
        out = dict(conn.execute("SELECT * FROM episodes WHERE id = ?", (row["id"],)).fetchone())
    out["words"] = widx
    return out


def _segment_count(episode_id: int) -> int:
    with db.session() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM segments WHERE episode_id = ?", (episode_id,)).fetchone()[0])


# ---------------------------------------------------------------- catching the subtitle files

@dataclass
class Candidate:
    lang: str
    cues: list[tuple[float, float | None, str]]
    digest: str
    at: float


@dataclass
class _Title:
    started: float
    candidates: list[Candidate] = field(default_factory=list)
    saved: str = ""  # the digest of the file kept


class SubtitleCatcher:
    """Which of the subtitle files seen while a title plays is its transcript.

    Several arrive: the one asked for (the language being learned), but also Netflix's "forced"
    subtitles (a few lines translating signs, in the language spoken) and, from earlier pages, other
    languages'. Kept: a file in the language being learned, preferably in exactly the variant the
    page chose ("ar-LB"), with the most lines. Files only count for a while after the title began,
    so one Netflix fetches early for the next episode isn't taken for this one's."""

    WINDOW = 120.0
    KEEP = 8

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._titles: dict[str, _Title] = {}
        self._lock = threading.Lock()

    def begin(self, netflix_id: str) -> None:
        """The title started playing (again): its files count from now."""
        with self._lock:
            had = self._titles.get(netflix_id)
            self._titles[netflix_id] = _Title(self._clock(), saved=had.saved if had else "")

    def offer(self, netflix_id: str, parsed: dict[str, Any], wanted: str, digest: str = "") -> bool:
        """A subtitle file arrived while `netflix_id` was showing. True if it may be the transcript."""
        if base_language(parsed.get("lang")) != base_language(wanted) or not parsed.get("cues"):
            return False
        digest = digest or hashlib.sha1(repr(parsed["cues"]).encode("utf-8")).hexdigest()
        with self._lock:
            title = self._titles.get(netflix_id)
            if title is None:
                title = self._titles[netflix_id] = _Title(self._clock())
            if self._clock() - title.started > self.WINDOW:
                return False
            if any(c.digest == digest for c in title.candidates):
                return False
            title.candidates.append(Candidate(str(parsed.get("lang") or ""), list(parsed["cues"]), digest, self._clock()))
            title.candidates = title.candidates[-self.KEEP:]
            return True

    def best(self, netflix_id: str, chosen: str | None = None) -> Candidate | None:
        """The file to keep: the chosen variant first, then the most lines."""
        chosen = (chosen or "").lower()
        with self._lock:
            title = self._titles.get(netflix_id)
            if title is None or not title.candidates:
                return None
            return max(title.candidates, key=lambda c: (1 if chosen and c.lang.lower() == chosen else 0, len(c.cues), c.at))

    def is_saved(self, netflix_id: str, candidate: Candidate) -> bool:
        with self._lock:
            title = self._titles.get(netflix_id)
            return bool(title and title.saved == candidate.digest)

    def mark_saved(self, netflix_id: str, candidate: Candidate) -> None:
        with self._lock:
            title = self._titles.get(netflix_id)
            if title is not None:
                title.saved = candidate.digest


catcher = SubtitleCatcher()
SETTLE = 2.5  # seconds to wait for the other files Netflix fetches at the same moment
_choices: dict[str, dict[str, str]] = {}  # title -> what the page chose: {"status", "bcp47", "lang"}
_timers: dict[str, threading.Timer] = {}
_waits: dict[str, int] = {}
_state_lock = threading.Lock()


def note_choice(netflix_id: str, status: str, bcp47: str = "", wanted: str = "") -> None:
    """What the page script chose for this title's subtitles ("chosen" a track in the language being
    learned, "none" when it has none, "image" when it has them only as pictures)."""
    with _state_lock:
        had = _choices.get(netflix_id)
        _choices[netflix_id] = {"status": status, "bcp47": bcp47, "lang": wanted}
    if status == "chosen" and (had is None or had.get("status") != "chosen"):
        _schedule(netflix_id)


def begin(netflix_id: str) -> None:
    """A title began playing in the video window."""
    catcher.begin(netflix_id)
    with _state_lock:
        _choices.pop(netflix_id, None)
        _waits.pop(netflix_id, None)


def offer_file(netflix_id: str, body: bytes | str, wanted: str) -> bool:
    """A subtitle file downloaded while this title was showing (its bytes)."""
    try:
        parsed = parse_ttml(body)
    except NetflixError as exc:
        log.debug("Not a subtitle file: %s", exc)
        return False
    raw = body if isinstance(body, bytes) else body.encode("utf-8", "replace")
    if not catcher.offer(netflix_id, parsed, wanted, hashlib.sha1(raw).hexdigest()):
        return False
    _schedule(netflix_id)
    return True


def _schedule(netflix_id: str, delay: float = SETTLE) -> None:
    with _state_lock:
        old = _timers.pop(netflix_id, None)
        if old is not None:
            old.cancel()
        timer = threading.Timer(delay, flush, args=(netflix_id,))
        timer.daemon = True
        _timers[netflix_id] = timer
    timer.start()


def flush(netflix_id: str) -> dict[str, Any] | None:
    """Keep the best subtitle file seen for this title, if the page chose subtitles in the
    language being learned and the title is in the library. Returns the episode when saved."""
    with _state_lock:
        _timers.pop(netflix_id, None)
        choice = dict(_choices.get(netflix_id) or {})
    if not choice:  # the page hasn't said what it chose yet: look again in a moment (for a while)
        with _state_lock:
            tries = _waits[netflix_id] = _waits.get(netflix_id, 0) + 1
        if tries <= 20:
            _schedule(netflix_id, 1.5)
        return None
    if choice.get("status") != "chosen":
        return None  # no subtitles in the language being learned: the forced ones are not a transcript
    best = catcher.best(netflix_id, choice.get("bcp47"))
    if best is None or catcher.is_saved(netflix_id, best):
        return None
    try:
        row = find_title(netflix_id)
    except NetflixError:
        return None
    if row is None:
        return None  # not in the library yet: save_title calls this again once it is
    if row.get("model") == MODEL_SUBTITLES and _segment_count(row["id"]) >= len(best.cues):
        catcher.mark_saved(netflix_id, best)  # watched again: the words kept are already these
        return None
    try:
        ep = save_subtitles(netflix_id, {"lang": best.lang, "cues": best.cues}, choice.get("lang") or None)
    except NetflixError as exc:
        log.info("Couldn't keep Netflix's subtitles for %s: %s", netflix_id, exc)
        return None
    if ep is None:
        return None
    catcher.mark_saved(netflix_id, best)
    from . import events, sync

    events.publish("netflix", {"kind": "subtitles", "episode": ep["id"], "netflix_id": netflix_id, "words": ep["words"]})
    events.publish("feeds", {"refreshed": True})
    sync.request(30)
    log.info("Kept Netflix's %s subtitles for %s (%d lines)", best.lang, netflix_id, len(best.cues))
    return ep


# ---------------------------------------------------------------- "watch this" from the Netflix window

def ask_app_to_watch(netflix_id: str, info: Any = None, timeout: float = youtube.WATCH_TIMEOUT) -> dict[str, Any]:
    """A title was picked in the Netflix window: ask the app's page to add it and show it in its
    player (the same hand-over as a YouTube video; the page answers through /api/youtube/watch-result)."""
    try:
        netflix_id = clean_id(netflix_id)
    except NetflixError as exc:
        return {"ok": False, "error": str(exc)}
    return youtube._ask_app("netflix_watch", {"netflix_id": netflix_id, "info": clean_info(info)}, timeout)
