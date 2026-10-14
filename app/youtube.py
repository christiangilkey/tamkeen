"""YouTube videos: watched in YouTube's own embedded player, studied through their captions.

Nothing is downloaded from YouTube except the caption text. A video is an ordinary episode of
the built-in "YouTube" feed whose transcript is its captions, so the word popup, vocab, search
and Drive sync all work unchanged. What marks it out:
    audio_url    the video's address (https://www.youtube.com/watch?v=<id>)
    audio_type   "video/youtube": the player embeds YouTube instead of playing a file
    guid         the 11-character video id
    model        "youtube-captions" (written by a person) or "youtube-auto" (made by YouTube)
    status       "done" from the start (there is nothing to transcribe)

The captions are fetched and parsed by web/js/youtube.js (one implementation for the computer
and the phone). On the computer its requests travel through `request` below, because a page
may not call youtube.com directly; they still leave from the user's own machine.
"""

from __future__ import annotations

import re
import threading
import time
import uuid
from typing import Any
from urllib.parse import urlsplit

import httpx

from . import arabic, db, ids, languages
from .version import APP_NAME

LOCAL_FEED_URL = "local:youtube"
LOCAL_FEED_TITLE = "YouTube"
YT_TYPE = "video/youtube"
ALLOWED_HOSTS = {"www.youtube.com", "youtube.com", "m.youtube.com"}
BROWSER_HOME = "https://www.youtube.com/"
MAX_WORDS = 60000
MAX_BODY_BYTES = 12 * 1024 * 1024


class YouTubeError(RuntimeError):
    pass


def start_address(url: str | None) -> str:
    """Where the YouTube window opens: the address asked for if it is on youtube.com, else YouTube's front page."""
    parts = urlsplit((url or "").strip())
    if parts.scheme == "https" and parts.hostname in ALLOWED_HOSTS:
        return (url or "").strip()
    return BROWSER_HOME


def is_youtube(audio_type: str | None) -> bool:
    return (audio_type or "") == YT_TYPE


def clean_id(video_id: str) -> str:
    video_id = (video_id or "").strip()
    if not re.fullmatch(r"[\w-]{11}", video_id):
        raise YouTubeError("That doesn't look like a YouTube video.")
    return video_id


def watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def request(url: str, method: str = "GET", headers: dict[str, str] | None = None, body: str | None = None) -> dict[str, Any]:
    """One web request to youtube.com on behalf of web/js/youtube.js: {"status", "text"}."""
    parts = urlsplit(url or "")
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        raise YouTubeError("Only requests to youtube.com are allowed here.")
    method = (method or "GET").upper()
    if method not in ("GET", "POST"):
        raise YouTubeError("Unsupported request.")
    sent = {str(k): str(v) for k, v in (headers or {}).items()
            if str(k).lower() in ("content-type", "accept-language", "user-agent", "accept")}
    try:
        with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(30, connect=15)) as client:
            with client.stream(method, url, headers=sent, content=body.encode("utf-8") if body else None) as resp:
                data = b""
                for chunk in resp.iter_bytes(1 << 16):
                    data += chunk
                    if len(data) > MAX_BODY_BYTES:
                        break
                return {"status": resp.status_code, "text": data.decode(resp.charset_encoding or "utf-8", "replace")}
    except httpx.HTTPError as exc:
        raise YouTubeError(f"Couldn't reach YouTube ({exc.__class__.__name__}). Check your connection.") from exc


def ensure_feed(conn: Any) -> int:
    row = conn.execute("SELECT id, deleted FROM feeds WHERE url = ?", (LOCAL_FEED_URL,)).fetchone()
    if row is not None:
        if row["deleted"]:
            conn.execute("UPDATE feeds SET deleted = 0 WHERE id = ?", (row["id"],))
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO feeds(uid, url, title, description, created_at) VALUES(?,?,?,?,?)",
        (ids.feed_uid(LOCAL_FEED_URL), LOCAL_FEED_URL, LOCAL_FEED_TITLE,
         "YouTube videos you added. They play from YouTube; their captions are the transcript.", time.time()))
    return int(cur.lastrowid)


def _num(value: Any) -> float:
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return 0.0


def clean_lines(lines: list[dict[str, Any]]) -> list[tuple[float, float, str, list[tuple[float, float, str]]]]:
    """Caption lines as (start, end, text, [(start, end, word), ...]), in order, limited in size."""
    out: list[tuple[float, float, str, list[tuple[float, float, str]]]] = []
    total = 0
    for line in sorted(lines or [], key=lambda x: _num(x.get("start"))):
        words: list[tuple[float, float, str]] = []
        for w in line.get("words") or []:
            if not isinstance(w, (list, tuple)) or len(w) < 3:
                continue
            text = "".join(str(w[2]).split())
            if text:
                start = _num(w[0])
                words.append((start, max(start, _num(w[1])), text[:120]))
        if not words:
            continue
        if total + len(words) > MAX_WORDS:
            words = words[:MAX_WORDS - total]
            if not words:
                break
        total += len(words)
        text = " ".join(str(line.get("text") or "").split()) or " ".join(w[2] for w in words)
        start = _num(line.get("start")) if line.get("start") is not None else words[0][0]
        out.append((start, max(_num(line.get("end")), words[-1][1]), text[:2000], words))
    return out


def save_video(video_id: str, title: str, lines: list[dict[str, Any]], channel: str | None = None,
               duration: float | None = None, language: str | None = None, auto: bool = False) -> dict[str, Any]:
    """Create (or refresh) the video's episode and store its captions. Returns the episode row."""
    video_id = clean_id(video_id)
    items = clean_lines(lines)
    if not items:
        raise YouTubeError("No captions available for this video.")
    url = watch_url(video_id)
    title = " ".join((title or "").split())[:300] or "YouTube video"
    image = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    if not languages.valid(language):
        language = languages.detect(" ".join(text for _s, _e, text, _w in items[:60]))
    model = "youtube-auto" if auto else "youtube-captions"
    length = _num(duration) or items[-1][1]
    now = time.time()
    with db.session() as conn:
        feed_id = ensure_feed(conn)
        feed_uid = conn.execute("SELECT uid FROM feeds WHERE id = ?", (feed_id,)).fetchone()["uid"]
        uid = ids.episode_uid(feed_uid, video_id)
        row = conn.execute("SELECT id FROM episodes WHERE uid = ?", (uid,)).fetchone()
        if row is None:
            cur = conn.execute(
                "INSERT INTO episodes(feed_id, uid, guid, title, description, published, image, audio_url, audio_type, "
                "language, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (feed_id, uid, video_id, title, (channel or "")[:200], now, image, url, YT_TYPE, language, now))
            ep_id = int(cur.lastrowid)
        else:
            ep_id = int(row["id"])
            conn.execute("UPDATE episodes SET title = ?, description = ?, image = ?, language = ?, deleted = 0 "
                         "WHERE id = ?", (title, (channel or "")[:200], image, language, ep_id))
            for table in ("words", "segments", "segments_fts"):
                conn.execute(f"DELETE FROM {table} WHERE episode_id = ?", (ep_id,))
        widx = 0
        for sidx, (start, end, text, words) in enumerate(items):
            norm = arabic.normalize(text)
            conn.execute("INSERT INTO segments(episode_id, idx, start, end, text, norm) VALUES(?,?,?,?,?,?)",
                         (ep_id, sidx, start, end, text, norm))
            conn.execute("INSERT INTO segments_fts(norm, episode_id, seg_idx) VALUES(?,?,?)", (norm, ep_id, sidx))
            conn.executemany(
                "INSERT INTO words(episode_id, idx, seg_idx, start, end, text) VALUES(?,?,?,?,?,?)",
                [(ep_id, widx + i, sidx, ws, we, wt) for i, (ws, we, wt) in enumerate(words)])
            widx += len(words)
        # A fresh transcribed_at makes sync publish the captions to the user's other devices.
        conn.execute(
            "UPDATE episodes SET status = 'done', progress = 100, error = NULL, model = ?, transcribed_at = ?, "
            "duration = ? WHERE id = ?", (model, now, length, ep_id))
        out = dict(conn.execute("SELECT * FROM episodes WHERE id = ?", (ep_id,)).fetchone())
    out["words"] = widx
    return out


def find_video(video_id: str) -> dict[str, Any] | None:
    """The episode for a video that is already in the library with its captions, else None."""
    video_id = clean_id(video_id)
    with db.session() as conn:
        row = conn.execute(
            "SELECT e.* FROM episodes e JOIN feeds f ON f.id = e.feed_id "
            "WHERE f.url = ? AND e.guid = ? AND e.deleted = 0 AND e.status = 'done'",
            (LOCAL_FEED_URL, video_id)).fetchone()
    return dict(row) if row is not None else None


# ---------------------------------------------------------------- "watch this" from the browser
# Tapping a video in the app's web browser window (see web/js/youtube-browser.js) has to end up
# in the app's own page, which is what reads captions and shows the player. The browser window
# can only reach Python, so Python passes the request on as a live event and waits for the
# page's answer (POST /api/youtube/watch-result).

WATCH_TIMEOUT = 45.0
_watching: dict[str, dict[str, Any]] = {}
_watch_lock = threading.Lock()


def ask_app_to_watch(video_id: str, timeout: float = WATCH_TIMEOUT, at: float | None = None) -> dict[str, Any]:
    """Ask the app's page to add this video and open it. Returns {"ok": True, "title": ...} or
    {"ok": False, "error": ...} (for example "No captions available for this video.").
    `at` is the moment (seconds) to open it at, when the video came from a caption search."""
    from . import events

    try:
        video_id = clean_id(video_id)
    except YouTubeError as exc:
        return {"ok": False, "error": str(exc)}
    token = uuid.uuid4().hex
    slot: dict[str, Any] = {"done": threading.Event(), "result": None}
    with _watch_lock:
        _watching[token] = slot
    try:
        events.publish("youtube_watch", {"token": token, "video_id": video_id, "at": at})
        if not slot["done"].wait(timeout):
            return {"ok": False, "error": f"{APP_NAME} didn't answer. Is its main window still open?"}
        return slot["result"]
    finally:
        with _watch_lock:
            _watching.pop(token, None)


def answer_watch(token: str, ok: bool, title: str = "", error: str = "") -> bool:
    """The app's page reporting how a "watch this" request went. False if nobody is waiting for it."""
    with _watch_lock:
        slot = _watching.get(token)
    if slot is None:
        return False
    slot["result"] = {"ok": True, "title": title} if ok else {"ok": False, "error": error or "Couldn't open this video."}
    slot["done"].set()
    return True


# ---------------------------------------------------------------- followed channels
# The computer's copy of cleanFollows and mergeFollows in web/js/ytfollow.js (which explains the
# records). The two must agree exactly, or two devices would keep rewriting each other's list.

def _text(value: Any, limit: int) -> str:
    return " ".join(str("" if value is None else value).split())[:limit]


def _whole(value: Any) -> int:
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError, OverflowError):
        return 0


def _by_name(record: dict[str, Any]) -> bytes:
    # The same order JavaScript's plain string comparison gives (by UTF-16 units).
    return record["name"].encode("utf-16-be", "surrogatepass")


def clean_follows(raw: Any) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    for r in raw if isinstance(raw, list) else []:
        if not isinstance(r, dict):
            continue
        name = _text(r.get("name"), 200)
        if not name:
            continue
        cid = str(r.get("id") or "")
        image = str(r.get("image") or "")
        rec = {"name": name, "id": cid if re.fullmatch(r"UC[\w-]{20,30}", cid) else "",
               "image": image[:500] if image.startswith("https://") else "", "on": 1 if r.get("on") else 0,
               "watched_at": _whole(r.get("watched_at")), "updated_at": _whole(r.get("updated_at"))}
        had = seen.get(name)
        if had is None or rec["updated_at"] > had["updated_at"]:
            seen[name] = rec
    return sorted(seen.values(), key=_by_name)


def merge_follows(mine: Any, theirs: Any) -> list[dict[str, Any]]:
    """Two devices' lists as one: for each channel, the copy that changed last wins."""
    out = {r["name"]: r for r in clean_follows(mine)}
    for r in clean_follows(theirs):
        had = out.get(r["name"])
        if had is None or r["updated_at"] > had["updated_at"]:
            out[r["name"]] = r
    return sorted(out.values(), key=_by_name)


def is_followed(follows: Any, name: Any) -> bool:
    name = _text(name, 200)
    return any(r["on"] and r["name"] == name for r in clean_follows(follows))


def set_follow(follows: Any, channel: dict[str, Any], on: bool, now: float) -> list[dict[str, Any]]:
    """Follow or unfollow a channel ({name, id?, image?}): the computer's copy of setFollow in ytfollow.js."""
    name = _text(channel.get("name"), 200)
    everything = clean_follows(follows)
    if not name:
        return everything
    had = next((r for r in everything if r["name"] == name), None)
    record = {"name": name, "id": channel.get("id") or (had["id"] if had else ""),
              "image": channel.get("image") or (had["image"] if had else ""), "on": 1 if on else 0,
              "watched_at": _whole(now) if on else (had["watched_at"] if had else 0), "updated_at": _whole(now)}
    return clean_follows([r for r in everything if r["name"] != name] + [record])
