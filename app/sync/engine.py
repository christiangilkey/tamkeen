"""Sync engine: merge the local library with the copy in the user's Google Drive.

Drive layout (hidden app folder, shared by desktop and Android):
    library.json.gz      feeds, episodes, vocab, vocab folders, definitions, seen words (merged record by record)
    t_<episode>.json.gz  one transcript per episode (written once per transcription)
    a_<episode>.ogg      compressed copy of the exact audio that was transcribed
    v_<episode>.<ext>    the user's own video files ("My videos"; see app/videos.py)
    c_<vocab word>.ogg   audio clips of vocab words received from friends

Merge rule: per record, the newest `updated_at` wins. Deletions are kept as tombstones so
they propagate instead of being resurrected by another device.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .. import aikeys, arabic, audio, controller, db, events, grammar, languages, learning, pages, paths, reels, tashkeel, videos, youtube
from .drive import Drive

log = logging.getLogger(__name__)

LIBRARY = "library.json.gz"
FORMAT_VERSION = 1


def transcript_name(uid: str) -> str:
    return f"t_{uid}.json.gz"


def audio_name(uid: str) -> str:
    return f"a_{uid}.ogg"


def clip_name(uid: str) -> str:
    return f"c_{uid}.ogg"


def clip_path(uid: str) -> Path:
    return paths.clips_dir() / f"{uid}.ogg"


@dataclass
class Result:
    uploaded_transcripts: int = 0
    downloaded_transcripts: int = 0
    uploaded_audio: int = 0
    uploaded_videos: int = 0
    merged: dict[str, int] = field(default_factory=lambda: {"feeds": 0, "episodes": 0, "vocab": 0, "folders": 0,
                                                             "definitions": 0, "lexemes": 0})
    library_uploaded: bool = False
    requested_transcriptions: list[int] = field(default_factory=list)
    new_feeds: list[int] = field(default_factory=list)  # added on another device; need an RSS fetch here
    skipped: bool = False  # a quick check that found nothing new (run's `quick`)

    @property
    def received(self) -> int:
        """Changes that came from the other devices: records merged and transcripts fetched."""
        return self.downloaded_transcripts + sum(self.merged.values())

    @property
    def uploaded(self) -> bool:
        """Did this sync put something new in Drive that the other devices would want now?"""
        return self.library_uploaded or self.uploaded_transcripts > 0 or self.uploaded_videos > 0

    def summary(self) -> dict[str, Any]:
        return {"uploaded_transcripts": self.uploaded_transcripts,
                "downloaded_transcripts": self.downloaded_transcripts,
                "uploaded_audio": self.uploaded_audio, "uploaded_videos": self.uploaded_videos,
                "merged": self.merged,
                "library_uploaded": self.library_uploaded,
                "requested_transcriptions": len(self.requested_transcriptions),
                "received": self.received, "uploaded": self.uploaded, "skipped": self.skipped}


def _gz(obj: Any) -> bytes:
    return gzip.compress(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)


def _ungz(data: bytes) -> Any:
    return json.loads(gzip.decompress(data).decode("utf-8"))


# ---------------------------------------------------------------------------------- snapshot

def _language(record: dict[str, Any]) -> str | None:
    """A record's language (episode, podcast or word), if it names one the app knows (older devices send none)."""
    code = record.get("language")
    return code if languages.valid(code) else None


def game_wins(theirs: dict[str, Any], mine: dict[str, Any]) -> bool:
    """Should another device's saved game replace this one? The newer save wins, except that a
    game nobody has played yet (a fresh install's egg) never replaces one with progress."""
    their_xp, my_xp = theirs.get("xp") or 0, mine.get("xp") or 0
    if (their_xp > 0) != (my_xp > 0):
        return their_xp > 0
    return (theirs.get("updated_at") or 0) > (mine.get("updated_at") or 0)


def snapshot(device_id: str) -> dict[str, Any]:
    with db.session() as conn:
        feeds = [dict(r) for r in conn.execute(
            "SELECT uid, url, title, substr(description, 1, 1000) AS description, image, link, auto_transcribe, "
            "language, deleted, created_at, updated_at FROM feeds ORDER BY uid")]
        episodes = [dict(r) for r in conn.execute(
            "SELECT e.uid, f.uid AS feed_uid, e.guid, e.title, substr(e.description, 1, 1500) AS description, "
            "e.published, e.duration, e.image, e.audio_url, e.audio_type, e.synced_rev AS transcript_rev, e.model, e.language, "
            "e.transcribe_requested_at, e.remote_audio, e.deleted, e.created_at, e.updated_at "
            "FROM episodes e JOIN feeds f ON f.id = e.feed_id WHERE f.deleted = 0 ORDER BY e.uid")]
        vocab = [{**dict(r), "folders": _folder_list(r["folders"])} for r in conn.execute(
            "SELECT uid, episode_uid, text, sentence, start, end, sent_start, sent_end, meaning, notes, translation, memo, "
            "episode_title, folders, clip, language, voice, deleted, created_at, updated_at FROM vocab ORDER BY uid")]
        folders = [dict(r) for r in conn.execute(
            "SELECT uid, name, deleted, created_at, updated_at FROM vocab_folders ORDER BY uid")]
        defs = [{**dict(r), "data": json.loads(r["data"])} for r in conn.execute(
            "SELECT key, word, sentence, data, provider, model, created_at FROM definitions ORDER BY key")]
        lexemes = [dict(r) for r in conn.execute(
            "SELECT key, lang, lemma, pos, root, deleted, created_at, updated_at FROM known_lexemes ORDER BY key")]
        reviews: dict[str, list[list[int]]] = {}
        for r in conn.execute("SELECT vocab_uid, t, rating, day, ms FROM reviews ORDER BY vocab_uid, t"):
            reviews.setdefault(r[0], []).append([r[1], r[2], r[3], r[4]])
    return {"format": FORMAT_VERSION, "device": device_id, "feeds": feeds, "episodes": episodes,
            "vocab": vocab, "folders": folders, "definitions": defs, "lexemes": lexemes, "reviews": reviews,
            "game": db.get_setting("game_state"),
            "channels": youtube.clean_follows(db.get_setting("youtube_follows")),
            "sites": pages.clean_sites(db.get_setting("browser_sites")),
            "grammar": grammar.clean_progress(db.get_setting("grammar_progress")),
            "controller": controller.clean(db.get_setting("controller_map")),
            "ig_collections": reels.synced_collections(),
            "keys": aikeys.from_settings(db.get_settings()),
            "learning": learning.payload(db.get_settings())}


def _folder_list(raw: Any) -> list[str]:
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return []
    return sorted({str(x) for x in value}) if isinstance(value, list) else []


def _content(lib: dict[str, Any]) -> str:
    """Canonical form used to decide whether an upload is needed (ignores who wrote it)."""
    content = {k: lib.get(k) for k in ("feeds", "episodes", "vocab", "folders", "definitions", "game")}
    content["lexemes"] = lib.get("lexemes") or []  # a device from before seen words were kept sends none
    content["reviews"] = lib.get("reviews") or {}  # nor does one from before the reviewer
    content["channels"] = lib.get("channels") or []  # nor one from before channels could be followed
    content["sites"] = lib.get("sites") or []  # nor one from before sites could be saved to the browser's start page
    content["grammar"] = grammar.clean_progress(lib.get("grammar"))  # nor one from before the grammar courses
    content["controller"] = controller.clean(lib.get("controller"))  # nor one from before controllers could be mapped
    content["ig_collections"] = reels.clean_synced_collections(lib.get("ig_collections"))  # nor one from before collections were shared
    content["keys"] = aikeys.clean(lib.get("keys"))  # nor one from before AI keys were shared
    content["learning"] = learning.clean_payload(lib.get("learning"))  # nor one from before the languages being learned were
    return json.dumps(content, ensure_ascii=False, sort_keys=True)


# ---------------------------------------------------------------------------------- merge

def _newer(remote: dict[str, Any], local: Any) -> bool:
    return (remote.get("updated_at") or 0) > ((local["updated_at"] if local is not None else None) or 0)


def keep_voice(remote: dict[str, Any], local: Any) -> dict[str, Any]:
    """A card's voice, once made, is never taken away by a copy without one: a voice made here
    (app/voices.py, or with Azure) must survive the other device editing the card before it heard of
    the voice. The other copy's other changes still win. A millisecond is added to its time so that
    this copy, voice and all, goes back to the other device. (mobile/src/js/sync.js keepVoice is the twin.)"""
    if local is None or not (local["voice"] or "") or remote.get("voice"):
        return remote
    return {**remote, "voice": local["voice"], "updated_at": round((remote.get("updated_at") or 0) + 0.001, 6)}


def merge(remote: dict[str, Any], result: Result) -> list[tuple[int, str, float]]:
    """Apply remote records that are newer than local ones. Returns transcripts to download
    as (local episode id, episode uid, revision)."""
    downloads: list[tuple[int, str, float]] = []
    with db.session() as conn, db.sync_writes(conn):
        # Feeds
        for r in remote.get("feeds", []):
            local = conn.execute("SELECT * FROM feeds WHERE uid = ? OR url = ?", (r["uid"], r["url"])).fetchone()
            if local is None:
                conn.execute(
                    "INSERT INTO feeds(uid, url, title, description, image, link, auto_transcribe, deleted, created_at, "
                    "updated_at, language) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (r["uid"], r["url"], r["title"], r["description"] or "", r["image"], r["link"],
                     r["auto_transcribe"], r["deleted"], r["created_at"], r["updated_at"], _language(r)))
                if not r["deleted"] and not videos.is_local_feed(r["url"]):
                    result.new_feeds.append(int(conn.execute("SELECT last_insert_rowid()").fetchone()[0]))
                result.merged["feeds"] += 1
            elif _newer(r, local):
                conn.execute(
                    "UPDATE feeds SET title=?, description=?, image=?, link=?, auto_transcribe=?, deleted=?, "
                    "language=COALESCE(?, language), updated_at=? WHERE id=?",
                    (r["title"], r["description"] or "", r["image"], r["link"], r["auto_transcribe"], r["deleted"],
                     _language(r), r["updated_at"], local["id"]))
                if r["deleted"] and not local["deleted"]:
                    _purge_feed_episodes(conn, local["id"])
                elif local["deleted"] and not r["deleted"] and not videos.is_local_feed(r["url"]):
                    result.new_feeds.append(local["id"])  # re-subscribed elsewhere
                result.merged["feeds"] += 1

        # Episodes
        feed_ids = {row["uid"]: (row["id"], row["deleted"]) for row in conn.execute("SELECT id, uid, deleted FROM feeds")}
        for r in remote.get("episodes", []):
            feed = feed_ids.get(r["feed_uid"])
            if feed is None or feed[1]:
                continue
            local = conn.execute("SELECT * FROM episodes WHERE uid = ?", (r["uid"],)).fetchone()
            if local is None:
                local = conn.execute("SELECT * FROM episodes WHERE feed_id = ? AND guid = ?",
                                     (feed[0], r["guid"])).fetchone()
            if local is None:
                cur = conn.execute(
                    "INSERT INTO episodes(feed_id, uid, guid, title, description, published, duration, image, audio_url, "
                    "audio_type, language, transcribe_requested_at, remote_audio, deleted, created_at, updated_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (feed[0], r["uid"], r["guid"], r["title"], r["description"] or "", r["published"], r["duration"],
                     r["image"], r["audio_url"], r["audio_type"], _language(r), r["transcribe_requested_at"],
                     r["remote_audio"] or 0, r.get("deleted") or 0, r["created_at"], r["updated_at"]))
                local_id, local_rev = int(cur.lastrowid), None
                result.merged["episodes"] += 1
            else:
                local_id, local_rev = local["id"], local["transcribed_at"]
                if _newer(r, local):
                    conn.execute(
                        "UPDATE episodes SET uid=?, title=?, description=?, published=COALESCE(?, published), "
                        "duration=COALESCE(duration, ?), image=?, audio_url=?, audio_type=?, "
                        "language=COALESCE(?, language), "
                        "transcribe_requested_at=MAX(COALESCE(transcribe_requested_at, 0), COALESCE(?, 0)), "
                        "remote_audio=MAX(remote_audio, ?), deleted=MAX(deleted, ?), updated_at=? WHERE id=?",
                        (r["uid"], r["title"], r["description"] or "", r["published"], r["duration"], r["image"],
                         r["audio_url"], r["audio_type"], _language(r), r["transcribe_requested_at"],
                         r["remote_audio"] or 0, r.get("deleted") or 0, r["updated_at"], local_id))
                    result.merged["episodes"] += 1
                if r.get("deleted") and not local["deleted"]:
                    videos.delete_episode_files(conn, local_id)
            if r.get("deleted"):
                continue
            rev = r.get("transcript_rev")
            if rev and (local_rev is None or rev > local_rev + 1e-3):
                downloads.append((local_id, r["uid"], rev))

        # Vocab
        ep_ids = {row["uid"]: row["id"] for row in conn.execute("SELECT id, uid FROM episodes")}
        for r in remote.get("vocab", []):
            local = conn.execute("SELECT * FROM vocab WHERE uid = ?", (r["uid"],)).fetchone()
            r = keep_voice(r, local)
            # A device with an older version sends no translation, memo or voice: keep the ones already known.
            values = (r["text"], arabic.normalize(r["text"]), r["sentence"], r["start"], r["end"], r["sent_start"],
                      r["sent_end"], r["meaning"], r["notes"], r.get("translation"), r.get("memo"), r["episode_title"], r["deleted"],
                      r["episode_uid"], ep_ids.get(r["episode_uid"]), json.dumps(_folder_list(r.get("folders") or [])),
                      1 if r.get("clip") else 0, _language(r), r.get("voice"), r["updated_at"])
            if local is None:
                conn.execute(
                    "INSERT INTO vocab(text, norm, sentence, start, end, sent_start, sent_end, meaning, notes, "
                    "translation, memo, episode_title, deleted, episode_uid, episode_id, folders, clip, language, voice, updated_at, "
                    "uid, created_at) VALUES(?,?,?,?,?,?,?,?,?,COALESCE(?, ''),COALESCE(?, ''),?,?,?,?,?,?,?,COALESCE(?, ''),?,?,?)",
                    (*values, r["uid"], r["created_at"]))
                result.merged["vocab"] += 1
            elif _newer(r, local):
                conn.execute(
                    "UPDATE vocab SET text=?, norm=?, sentence=?, start=?, end=?, sent_start=?, sent_end=?, meaning=?, "
                    "notes=?, translation=COALESCE(?, translation), memo=COALESCE(?, memo), episode_title=?, deleted=?, episode_uid=?, "
                    "episode_id=?, folders=?, clip=?, language=COALESCE(?, language), voice=COALESCE(?, voice), updated_at=? WHERE id=?",
                    (*values, local["id"]))
                result.merged["vocab"] += 1

        # Vocab folders
        for r in remote.get("folders", []):
            local = conn.execute("SELECT * FROM vocab_folders WHERE uid = ?", (r["uid"],)).fetchone()
            if local is None:
                conn.execute("INSERT INTO vocab_folders(uid, name, deleted, created_at, updated_at) VALUES(?,?,?,?,?)",
                             (r["uid"], r["name"], r["deleted"], r["created_at"], r["updated_at"]))
                result.merged["folders"] += 1
            elif _newer(r, local):
                conn.execute("UPDATE vocab_folders SET name=?, deleted=?, updated_at=? WHERE id=?",
                             (r["name"], r["deleted"], r["updated_at"], local["id"]))
                result.merged["folders"] += 1

        # Definitions (immutable cache entries): union
        for r in remote.get("definitions", []):
            cur = conn.execute(
                "INSERT OR IGNORE INTO definitions(key, word, sentence, data, provider, model, created_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (r["key"], r["word"], r["sentence"], json.dumps(r["data"], ensure_ascii=False), r["provider"],
                 r["model"], r["created_at"]))
            result.merged["definitions"] += cur.rowcount

        # Seen words: the newest change to a lexeme wins (seen, or made new again).
        for r in remote.get("lexemes") or []:
            key = str(r.get("key") or "")
            if key.count("|") < 2:
                continue
            local = conn.execute("SELECT updated_at FROM known_lexemes WHERE key = ?", (key,)).fetchone()
            values = (str(r.get("lemma") or ""), str(r.get("pos") or ""), str(r.get("root") or ""),
                      1 if r.get("deleted") else 0, r.get("updated_at") or 0)
            if local is None:
                conn.execute(
                    "INSERT INTO known_lexemes(lemma, pos, root, deleted, updated_at, key, lang, created_at) "
                    "VALUES(?,?,?,?,?,?,?,?)",
                    (*values, key, key.split("|", 1)[0], r.get("created_at") or r.get("updated_at") or 0))
                result.merged["lexemes"] += 1
            elif _newer(r, local):
                conn.execute("UPDATE known_lexemes SET lemma=?, pos=?, root=?, deleted=?, updated_at=? WHERE key=?",
                             (*values, key))
                result.merged["lexemes"] += 1

        # The reviewer's answers: both devices' lists add up; an answer taken back (0) stays taken back.
        remote_reviews = remote.get("reviews")
        for uid, entries in (remote_reviews.items() if isinstance(remote_reviews, dict) else ()):
            for e in entries if isinstance(entries, list) else ():
                if not (isinstance(e, list) and len(e) >= 3 and all(isinstance(x, int) for x in e[:4])) or e[1] not in (0, 1, 3):
                    continue
                cur = conn.execute(
                    "INSERT INTO reviews(vocab_uid, t, rating, day, ms) VALUES(?,?,?,?,?) "
                    "ON CONFLICT(vocab_uid, t) DO UPDATE SET rating = 0 WHERE excluded.rating = 0 AND reviews.rating != 0",
                    (str(uid), e[0], e[1], e[2], e[3] if len(e) > 3 else 0))
                result.merged["reviews"] = result.merged.get("reviews", 0) + cur.rowcount

        # The creature game: one saved state for the whole account; the most recently saved wins.
        game = remote.get("game")
        if isinstance(game, dict) and (isinstance(game.get("roster"), list) or isinstance(game.get("creature"), dict)):
            row = conn.execute("SELECT value FROM settings WHERE key = 'game_state'").fetchone()
            try:
                mine = json.loads(row["value"]) if row else None
            except json.JSONDecodeError:
                mine = None
            if not isinstance(mine, dict) or game_wins(game, mine):
                conn.execute("INSERT INTO settings(key, value) VALUES('game_state', ?) "
                             "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                             (json.dumps(game, ensure_ascii=False),))
                result.merged["game"] = 1

        # Followed YouTube channels: for each channel, the copy that changed last wins.
        channels = remote.get("channels")
        if isinstance(channels, list) and channels:
            row = conn.execute("SELECT value FROM settings WHERE key = 'youtube_follows'").fetchone()
            try:
                mine = youtube.clean_follows(json.loads(row["value"]) if row else [])
            except json.JSONDecodeError:
                mine = []
            merged = youtube.merge_follows(mine, channels)
            if merged != mine:
                conn.execute("INSERT INTO settings(key, value) VALUES('youtube_follows', ?) "
                             "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                             (json.dumps(merged, ensure_ascii=False),))
                result.merged["channels"] = len(merged)

        # Sites saved to the browser's start page: for each address, the copy that changed last wins.
        sites = remote.get("sites")
        if isinstance(sites, list) and sites:
            row = conn.execute("SELECT value FROM settings WHERE key = 'browser_sites'").fetchone()
            try:
                mine = pages.clean_sites(json.loads(row["value"]) if row else [])
            except json.JSONDecodeError:
                mine = []
            merged = pages.merge_sites(mine, sites)
            if merged != mine:
                conn.execute("INSERT INTO settings(key, value) VALUES('browser_sites', ?) "
                             "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                             (json.dumps(merged, ensure_ascii=False),))
                result.merged["sites"] = len(merged)

        # Grammar lessons finished (app/grammar.py): for each lesson, the finish made last wins.
        lessons = remote.get("grammar")
        if isinstance(lessons, dict) and lessons:
            row = conn.execute("SELECT value FROM settings WHERE key = 'grammar_progress'").fetchone()
            try:
                mine = grammar.clean_progress(json.loads(row["value"]) if row else {})
            except json.JSONDecodeError:
                mine = {}
            merged = grammar.merge_progress(mine, lessons)
            if merged != mine:
                conn.execute("INSERT INTO settings(key, value) VALUES('grammar_progress', ?) "
                             "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                             (json.dumps(merged, ensure_ascii=False),))
                result.merged["grammar"] = len(merged)

    # The game controller's buttons (app/controller.py): the mapping changed last wins.
    pad = remote.get("controller")
    if isinstance(pad, dict) and controller.wins(pad, db.get_setting("controller_map")):
        db.set_settings({"controller_map": controller.clean(pad)})
        result.merged["controller"] = 1

    # Saved Instagram collections: the list found last, and the collection chosen last.
    if isinstance(remote.get("ig_collections"), dict) and reels.take_synced_collections(remote["ig_collections"]):
        result.merged["ig_collections"] = 1
        events.publish("reels_collections", {})  # an open Reels page redraws its list

    # The user's own AI keys: for each key, the copy changed last wins (see app/aikeys.py).
    if isinstance(remote.get("keys"), dict):
        changes = aikeys.take(db.get_settings(), remote["keys"])
        if changes:
            db.set_settings(changes)
            result.merged["keys"] = len(changes) - 1

    # The languages being learned: for each language, the device that ticked or unticked it last wins
    # (app/learning.py). If the one studied here was unticked there, the first one left takes over.
    changes = learning.take(db.get_settings(), remote.get("learning"))
    if changes:
        db.set_settings(changes)
        result.merged["learning"] = 1
    return downloads


def _purge_feed_episodes(conn: Any, feed_id: int) -> None:
    rows = conn.execute("SELECT id, audio_path, sync_audio_path FROM episodes WHERE feed_id = ?", (feed_id,)).fetchall()
    for row in rows:
        conn.execute("DELETE FROM segments_fts WHERE episode_id = ?", (row["id"],))
        for p in (row["audio_path"], row["sync_audio_path"]):
            if p and Path(p).resolve().parent == paths.audio_dir().resolve():
                Path(p).unlink(missing_ok=True)
    conn.execute("DELETE FROM episodes WHERE feed_id = ?", (feed_id,))


# ---------------------------------------------------------------------------------- transcripts

def transcript_payload(episode_id: int) -> dict[str, Any]:
    with db.session() as conn:
        ep = conn.execute("SELECT transcribed_at, model FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        segs = conn.execute("SELECT start, end, text, kind FROM segments WHERE episode_id = ? ORDER BY idx",
                            (episode_id,)).fetchall()
        words = conn.execute("SELECT start, end, text, seg_idx FROM words WHERE episode_id = ? ORDER BY idx",
                             (episode_id,)).fetchall()
    # Imported web pages also record each block's type (heading, paragraph, ...).
    kinds = {"kinds": [s["kind"] for s in segs]} if any(s["kind"] for s in segs) else {}
    return {
        **kinds,
        **tashkeel.payload_part(episode_id),  # Arabic: each word's vowelled copy, made on the computer
        "format": FORMAT_VERSION, "rev": ep["transcribed_at"], "model": ep["model"],
        "segments": [[round(s["start"], 3), round(s["end"], 3), s["text"]] for s in segs],
        "words": {"start": [round(w["start"], 3) for w in words], "end": [round(w["end"], 3) for w in words],
                  "text": [w["text"] for w in words], "seg": [w["seg_idx"] for w in words]},
    }


def store_transcript(episode_id: int, payload: dict[str, Any]) -> None:
    """Write a downloaded transcript, marking the episode done without re-uploading it."""
    w = payload["words"]
    with db.session() as conn, db.sync_writes(conn):
        conn.execute("DELETE FROM words WHERE episode_id = ?", (episode_id,))
        conn.execute("DELETE FROM segments WHERE episode_id = ?", (episode_id,))
        conn.execute("DELETE FROM segments_fts WHERE episode_id = ?", (episode_id,))
        kinds = payload.get("kinds") or []
        for idx, (start, end, text) in enumerate(payload["segments"]):
            norm = arabic.normalize(text)
            conn.execute("INSERT INTO segments(episode_id, idx, start, end, text, norm, kind) VALUES(?,?,?,?,?,?,?)",
                         (episode_id, idx, start, end, text, norm, kinds[idx] if idx < len(kinds) else None))
            conn.execute("INSERT INTO segments_fts(norm, episode_id, seg_idx) VALUES(?,?,?)", (norm, episode_id, idx))
        conn.executemany(
            "INSERT INTO words(episode_id, idx, seg_idx, start, end, text) VALUES(?,?,?,?,?,?)",
            [(episode_id, i, w["seg"][i], w["start"][i], w["end"][i], w["text"][i]) for i in range(len(w["text"]))])
        tashkeel.store_from_payload(conn, episode_id, payload)
        # A local download of this episode may not match the audio the other device transcribed
        # (dynamically inserted ads), so playback switches to the synced copy.
        old = conn.execute("SELECT audio_path FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if old and old["audio_path"] and Path(old["audio_path"]).resolve().parent == paths.audio_dir().resolve():
            Path(old["audio_path"]).unlink(missing_ok=True)
        conn.execute(
            "UPDATE episodes SET status='done', progress=100, error=NULL, model=?, transcribed_at=?, synced_rev=?, "
            "audio_path=NULL WHERE id=? AND status NOT IN ('downloading', 'transcribing')",
            (payload.get("model"), payload["rev"], payload["rev"], episode_id))


# ---------------------------------------------------------------------------------- run

FULL_EVERY = 15 * 60  # seconds: read the whole library at least this often, even when nothing seems new


def fingerprint(meta: dict[str, Any] | None) -> str:
    """What identifies one version of the library file in Drive (web/js/syncpace.js does the same)."""
    if not meta or not meta.get("id"):
        return ""
    return "|".join(str(meta.get(k) or "") for k in ("id", "modifiedTime", "size", "md5Checksum"))


def _digest(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _transcript_waiting() -> bool:
    """A transcript finished here that isn't in Drive yet."""
    with db.session() as conn:
        return conn.execute(
            "SELECT 1 FROM episodes WHERE status = 'done' AND transcribed_at IS NOT NULL "
            "AND (synced_rev IS NULL OR synced_rev < transcribed_at) LIMIT 1").fetchone() is not None


def quick_check(memo: dict[str, Any] | None, files: dict[str, dict[str, Any]], device_id: str) -> bool:
    """Can this sync stop after listing the folder? Only when the library file in Drive is exactly
    the one the last sync ended with, that sync finished everything, the library here is unchanged
    since (same content), no transcript is waiting to go up, and the whole library was read lately."""
    fp = fingerprint(files.get(LIBRARY))
    return bool(memo and memo.get("complete") and fp and memo.get("fp") == fp
                and time.time() - memo.get("full_at", 0) < FULL_EVERY
                and memo.get("hash") == _digest(_content(snapshot(device_id)))
                and not _transcript_waiting())


def run(drive: Drive, device_id: str, sync_audio: bool, can_transcribe: bool,
        memo: dict[str, Any] | None = None, quick: bool = False) -> Result:
    """One sync. `memo` (optional, kept by the caller between syncs) remembers what the last one
    ended with; it is brought up to date at the end of every full sync. With `quick` (a check, not a
    change made here) a sync that finds nothing new, here or in Drive, is one small Drive request:
    the folder's list (quick_check)."""
    result = Result()
    files = {f["name"]: f for f in drive.list()}
    if quick and memo is not None and quick_check(memo, files, device_id):
        result.skipped = True
        return result
    incomplete = False

    # 1. Publish transcripts finished on this device (before the library refers to them).
    with db.session() as conn:
        pending = conn.execute(
            "SELECT id, uid, transcribed_at FROM episodes WHERE status = 'done' AND transcribed_at IS NOT NULL "
            "AND (synced_rev IS NULL OR synced_rev < transcribed_at)").fetchall()
    for ep in pending:
        name = transcript_name(ep["uid"])
        meta = drive.upload(name, _gz(transcript_payload(ep["id"])), "application/gzip",
                            files.get(name, {}).get("id"))
        files[name] = meta
        with db.session() as conn:
            conn.execute("UPDATE episodes SET synced_rev = ? WHERE id = ?", (ep["transcribed_at"], ep["id"]))
        result.uploaded_transcripts += 1

    # 2. Publish the user's own videos (always: Drive is where they're kept), then audio copies.
    upload_videos(drive, files, result)
    upload_clips(drive, files)
    if sync_audio:
        upload_audio_copies(drive, files, result)

    # 3-5. Merge the library, fetch new transcripts, upload the merged library.
    for _attempt in range(3):
        lib_meta = files.get(LIBRARY)
        remote = _ungz(drive.download(lib_meta["id"])) if lib_meta else None
        downloads = merge(remote, result) if remote else []
        for local_id, uid, rev in downloads:
            meta = files.get(transcript_name(uid))
            if meta is None:
                incomplete = True
                continue  # library ahead of the transcript upload; next sync picks it up
            payload = _ungz(drive.download(meta["id"]))
            if abs((payload.get("rev") or 0) - rev) < 1e-3 or (payload.get("rev") or 0) > rev:
                store_transcript(local_id, payload)
                result.downloaded_transcripts += 1
            else:
                incomplete = True

        local = snapshot(device_id)
        local_content = _content(local)
        if remote is not None and _content(remote) == local_content:
            break
        if lib_meta is not None:
            # Someone else may have written the library while we merged: re-check before overwriting.
            current = drive.get(lib_meta["id"])
            if current.get("modifiedTime") != lib_meta.get("modifiedTime"):
                files[LIBRARY] = current
                continue
        files[LIBRARY] = drive.upload(LIBRARY, _gz(local), "application/gzip", lib_meta["id"] if lib_meta else None)
        result.library_uploaded = True
        break
    else:
        incomplete = True  # Drive kept changing under us: the next sync tries again in full

    # 6. Free Drive space used by deleted videos (any device may do this; it's idempotent).
    remove_deleted_media(drive, files)

    # 7. Transcription requests from other devices (e.g. the phone).
    if can_transcribe:
        result.requested_transcriptions = requested_transcriptions()

    if memo is not None:
        lib_meta = files.get(LIBRARY)
        memo.clear()
        memo.update({"fp": fingerprint(lib_meta), "hash": _digest(_content(snapshot(device_id))),
                     "complete": not incomplete, "full_at": time.time(), "library_id": (lib_meta or {}).get("id", "")})
    return result


def upload_audio_copies(drive: Drive, files: dict[str, dict[str, Any]], result: Result) -> None:
    with db.session() as conn:
        rows = conn.execute(
            "SELECT id, uid, audio_path, sync_audio_path FROM episodes "
            "WHERE status = 'done' AND remote_audio = 0 AND deleted = 0 AND audio_url NOT LIKE 'drive:%' "
            "AND (sync_audio_path IS NOT NULL OR audio_path IS NOT NULL)"
        ).fetchall()
    for ep in rows:
        copy = Path(ep["sync_audio_path"]) if ep["sync_audio_path"] else None
        if copy is None or not copy.exists():
            src = Path(ep["audio_path"]) if ep["audio_path"] else None
            if src is None or not src.exists():
                continue
            copy = paths.audio_dir() / f"{ep['id']}.sync.ogg"
            try:
                audio.encode_speech_copy(src, copy)
            except audio.AudioError as exc:
                log.warning("Skipping audio copy for episode %s: %s", ep["id"], exc)
                continue
            with db.session() as conn:
                conn.execute("UPDATE episodes SET sync_audio_path = ? WHERE id = ?", (str(copy), ep["id"]))
        name = audio_name(ep["uid"])
        if name not in files:
            files[name] = drive.upload(name, copy, "audio/ogg")
        with db.session() as conn:
            conn.execute("UPDATE episodes SET remote_audio = 1 WHERE id = ?", (ep["id"],))
        result.uploaded_audio += 1


def upload_videos(drive: Drive, files: dict[str, dict[str, Any]], result: Result) -> None:
    """Upload videos added on this device (before the library says they're available)."""
    with db.session() as conn:
        rows = conn.execute(
            "SELECT id, audio_url, audio_type, audio_path FROM episodes "
            "WHERE audio_url LIKE 'drive:%' AND remote_audio = 0 AND deleted = 0 AND audio_path IS NOT NULL").fetchall()
    for ep in rows:
        src = Path(ep["audio_path"])
        if not src.exists():
            continue
        name = videos.drive_name(ep["audio_url"])
        if name not in files:
            files[name] = drive.upload(name, src, ep["audio_type"] or "video/mp4")
        with db.session() as conn:
            conn.execute("UPDATE episodes SET remote_audio = 1 WHERE id = ?", (ep["id"],))
        result.uploaded_videos += 1


def upload_clips(drive: Drive, files: dict[str, dict[str, Any]]) -> None:
    """Publish audio clips of words received from friends, and cards' voices, so the user's other devices can play them."""
    with db.session() as conn:
        rows = conn.execute("SELECT uid FROM vocab WHERE (clip = 1 OR voice <> '') AND deleted = 0").fetchall()
    for v in rows:
        name = clip_name(v["uid"])
        src = clip_path(v["uid"])
        if name not in files and src.exists():
            files[name] = drive.upload(name, src, "audio/ogg")


def fetch_clip(drive: Drive, uid: str) -> Path | None:
    """Download a word's clip (saved on another of the user's devices)."""
    match = [f for f in drive.list() if f["name"] == clip_name(uid)]
    if not match:
        return None
    dest = clip_path(uid)
    drive.download_to(match[0]["id"], dest)
    return dest


def remove_deleted_media(drive: Drive, files: dict[str, dict[str, Any]]) -> None:
    with db.session() as conn:
        gone = [r["uid"] for r in conn.execute("SELECT uid FROM vocab WHERE (clip = 1 OR voice <> '') AND deleted = 1")]
    for uid in gone:
        clip_path(uid).unlink(missing_ok=True)
        meta = files.pop(clip_name(uid), None)
        if meta is not None:
            try:
                drive.delete(meta["id"])
            except Exception as exc:
                log.info("Couldn't delete %s from Drive: %s", clip_name(uid), exc)
    with db.session() as conn:
        rows = conn.execute("SELECT uid, audio_url FROM episodes WHERE deleted = 1").fetchall()
    for ep in rows:
        names = [transcript_name(ep["uid"]), audio_name(ep["uid"])]
        if videos.is_drive_media(ep["audio_url"]):
            names.append(videos.drive_name(ep["audio_url"]))
        for name in names:
            meta = files.pop(name, None)
            if meta is not None:
                try:
                    drive.delete(meta["id"])
                except Exception as exc:  # already gone, or a transient error: try again next sync
                    log.info("Couldn't delete %s from Drive: %s", name, exc)


def requested_transcriptions() -> list[int]:
    """Episodes another device asked this one to transcribe, not yet done or attempted."""
    from .. import jobs

    with db.session() as conn:
        rows = conn.execute(
            """SELECT e.id FROM episodes e JOIN feeds f ON f.id = e.feed_id
               WHERE f.deleted = 0 AND e.deleted = 0 AND e.transcribe_requested_at IS NOT NULL
                 AND e.status IN ('new', 'failed')
                 AND e.transcribe_requested_at > COALESCE(e.transcribed_at, 0)
                 AND e.transcribe_requested_at > COALESCE(
                       (SELECT MAX(j.created_at) FROM jobs j WHERE j.episode_id = e.id), 0)""").fetchall()
    ids = [r["id"] for r in rows]
    return jobs.enqueue(ids) if ids else []


def fetch_audio_copy(drive: Drive, episode_id: int) -> Path | None:
    """Download the synced audio copy for an episode transcribed on another device."""
    with db.session() as conn:
        ep = conn.execute("SELECT uid, remote_audio FROM episodes WHERE id = ?", (episode_id,)).fetchone()
    if ep is None or not ep["remote_audio"]:
        return None
    match = [f for f in drive.list() if f["name"] == audio_name(ep["uid"])]
    if not match:
        return None
    dest = paths.audio_dir() / f"{episode_id}.sync.ogg"
    drive.download_to(match[0]["id"], dest)
    with db.session() as conn:
        conn.execute("UPDATE episodes SET sync_audio_path = ? WHERE id = ?", (str(dest), episode_id))
    return dest

