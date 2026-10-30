"""The user's own video and audio files: kept in built-in "My videos" and "My audio" feeds and
stored in Google Drive.

An uploaded file is an ordinary episode of its feed, so transcription, the player, search and
vocab all work unchanged. What marks it out:
    audio_url    "drive:v_<episode uid><ext>", the name of the file in the Drive app folder
    audio_type   the file's MIME type (video/mp4, audio/mpeg, ...): this decides video or audio player
    remote_audio 1 once the file itself is in Drive (no separate audio copy is made)
"""

from __future__ import annotations

import mimetypes
import os
import time
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from . import audio, db, ids, paths

LOCAL_FEED_URL = "local:videos"
LOCAL_FEED_TITLE = "My videos"
AUDIO_FEED_URL = "local:audio"
AUDIO_FEED_TITLE = "My audio"
DRIVE_PREFIX = "drive:"
VIDEO_TYPES = {
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
    ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".3gp": "video/3gpp",
}


AUDIO_TYPES = {
    ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".m4b": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".oga": "audio/ogg", ".opus": "audio/ogg", ".flac": "audio/flac", ".wma": "audio/x-ms-wma", ".amr": "audio/amr",
}


class UploadError(RuntimeError):
    pass


def is_local_feed(url: str | None) -> bool:
    return bool(url) and str(url).startswith("local:")


def is_drive_media(audio_url: str | None) -> bool:
    return bool(audio_url) and str(audio_url).startswith(DRIVE_PREFIX)


def drive_name(audio_url: str) -> str:
    return audio_url[len(DRIVE_PREFIX):]


def mime_for(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return VIDEO_TYPES.get(ext) or AUDIO_TYPES.get(ext) or mimetypes.guess_type(filename)[0] or "video/mp4"


def ensure_feed(conn: Any, audio: bool = False) -> int:
    """Id of the "My videos" (or "My audio") feed, creating or reviving it the first time it's needed."""
    url, title, what = ((AUDIO_FEED_URL, AUDIO_FEED_TITLE, "Audio") if audio else (LOCAL_FEED_URL, LOCAL_FEED_TITLE, "Video"))
    row = conn.execute("SELECT id, deleted FROM feeds WHERE url = ?", (url,)).fetchone()
    if row is not None:
        if row["deleted"]:
            conn.execute("UPDATE feeds SET deleted = 0 WHERE id = ?", (row["id"],))
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO feeds(uid, url, title, description, created_at) VALUES(?,?,?,?,?)",
        (ids.feed_uid(url), url, title, f"{what} files you added yourself. They're stored in your Google Drive.", time.time()))
    return int(cur.lastrowid)


async def save_upload(filename: str, chunks: AsyncIterator[bytes], title: str | None = None) -> dict[str, Any]:
    """Store an uploaded video or audio file and create its episode. Returns the episode row."""
    ext = os.path.splitext(filename)[1].lower()
    is_audio = ext in AUDIO_TYPES
    if not is_audio and ext not in VIDEO_TYPES:
        raise UploadError("Choose a video file (MP4, MOV, WebM, MKV, AVI, 3GP) or an audio file "
                          "(MP3, M4A, M4B, WAV, OGG, Opus, FLAC, AAC).")
    tmp = paths.audio_dir() / f"upload-{uuid.uuid4().hex}.tmp{ext}"
    size = 0
    try:
        with open(tmp, "wb") as fh:
            async for chunk in chunks:
                fh.write(chunk)
                size += len(chunk)
        if not size:
            raise UploadError("The file is empty.")
        try:
            duration = audio.probe_duration(tmp)
        except audio.AudioError as exc:
            raise UploadError(f"This file has no readable sound ({exc}).") from exc
        guid = uuid.uuid4().hex
        with db.session() as conn:
            feed_id = ensure_feed(conn, audio=is_audio)
            feed_uid = conn.execute("SELECT uid FROM feeds WHERE id = ?", (feed_id,)).fetchone()["uid"]
            uid = ids.episode_uid(feed_uid, guid)
            name = (title or "").strip() or os.path.splitext(os.path.basename(filename))[0] or ("Audio" if is_audio else "Video")
            now = time.time()
            cur = conn.execute(
                "INSERT INTO episodes(feed_id, uid, guid, title, published, duration, audio_url, audio_type, created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (feed_id, uid, guid, name[:300], now, duration or None, f"{DRIVE_PREFIX}v_{uid}{ext}",
                 mime_for(filename), now))
            ep_id = int(cur.lastrowid)
            dest = paths.audio_dir() / f"{ep_id}{ext}"
            os.replace(tmp, dest)
            conn.execute("UPDATE episodes SET audio_path = ? WHERE id = ?", (str(dest), ep_id))
            row = conn.execute("SELECT * FROM episodes WHERE id = ?", (ep_id,)).fetchone()
        return dict(row)
    finally:
        tmp.unlink(missing_ok=True)


def delete_episode_files(conn: Any, episode_id: int) -> None:
    """Remove an episode's transcript and local media (the row stays as a synced tombstone)."""
    row = conn.execute("SELECT audio_path, sync_audio_path FROM episodes WHERE id = ?", (episode_id,)).fetchone()
    for table in ("words", "segments", "segments_fts"):
        conn.execute(f"DELETE FROM {table} WHERE episode_id = ?", (episode_id,))
    if row is None:
        return
    for p in (row["audio_path"], row["sync_audio_path"]):
        if p and Path(p).resolve().parent == paths.audio_dir().resolve():
            Path(p).unlink(missing_ok=True)
    conn.execute("UPDATE episodes SET audio_path = NULL, sync_audio_path = NULL, status = 'new', progress = 0 "
                 "WHERE id = ?", (episode_id,))
