"""Vocabulary list endpoints."""

from __future__ import annotations

import base64
import json
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from .. import anki_deck, arabic, audio, db, exporters, ids, languages, paths, sync
from ..sync import engine
from . import reviews

router = APIRouter(prefix="/vocab", tags=["vocab"])


class VocabIn(BaseModel):
    text: str
    sentence: str = ""
    episode_id: int | None = None
    start: float | None = None
    end: float | None = None
    sent_start: float | None = None
    sent_end: float | None = None
    meaning: str = ""
    notes: str = ""
    translation: str = ""  # the sentence in the learner's language, ⟦ ⟧ around the word's part
    # A word with no episode: where it came from, as the Vocab page shows it, and the language it was
    # looked up in (else the language its letters say).
    source: str = ""
    language: str = ""


class BatchCard(BaseModel):
    """One card typed in "Add words" (web/js/components/wordbuilder.js)."""

    text: str
    meaning: str = ""
    sentence: str = ""
    translation: str = ""  # may carry ⟦ ⟧ round the word's part, as a looked-up word's does
    notes: str = ""
    folders: list[str] = []
    source: str = ""  # where it came from, shown on the card ("Arabic basics · word 12": the basics course)


class BatchIn(BaseModel):
    cards: list[BatchCard]


MAX_BATCH = 100  # the most cards "Add words" adds at a time (web/js/addwords.js MAX_ROWS)


class VocabPatch(BaseModel):
    meaning: str | None = None
    notes: str | None = None
    memo: str | None = None  # the learner's own notes (a mnemonic, say)
    text: str | None = None
    folders: list[str] | None = None
    # The card's sentence; with `sentence_if`, only while the sentence is still exactly that (a basics
    # course word gets its course's ⟦ ⟧ marks, but never over a sentence the learner changed).
    sentence: str | None = None
    sentence_if: str | None = None


class FolderIn(BaseModel):
    name: str


class BulkFolders(BaseModel):
    ids: list[int]
    add: list[str] = []
    remove: list[str] = []


def _out(row: Any) -> dict[str, Any]:
    item = dict(row)
    try:
        item["folders"] = json.loads(item.get("folders") or "[]")
    except json.JSONDecodeError:
        item["folders"] = []
    return item


def _items(q: str | None = None, folder: str | None = None) -> list[dict[str, Any]]:
    """The saved words in the language being learned (the others wait for theirs to be chosen), each
    with its episode's `audio_type` (web/js/cardvoice.js decides from it whether the word's own audio
    can be played, or a voice says it)."""
    study = languages.study()
    with db.session() as conn:
        rows = conn.execute("SELECT v.*, CASE WHEN v.episode_id IS NULL THEN NULL WHEN e.id IS NULL OR e.deleted = 1 "
                            "THEN 'missing' ELSE COALESCE(e.audio_type, '') END AS audio_type "
                            "FROM vocab v LEFT JOIN episodes e ON e.id = v.episode_id "
                            "WHERE v.deleted = 0 AND COALESCE(v.language, ?) = ? ORDER BY v.created_at DESC",
                            (study, study)).fetchall()
    items = [_out(r) for r in rows]
    if folder == "none":
        items = [v for v in items if not v["folders"]]
    elif folder:
        items = [v for v in items if folder in v["folders"]]
    if q:
        nq = arabic.normalize(q)
        lq = q.lower()
        items = [v for v in items if nq in v["norm"] or nq in arabic.normalize(v["sentence"])
                 or lq in v["meaning"].lower() or lq in v["notes"].lower() or lq in (v.get("memo") or "").lower()]
    return items


@router.get("")
def list_vocab(q: str | None = None, folder: str | None = None) -> list[dict[str, Any]]:
    return _items(q, folder)


# ----- folders -----

@router.get("/folders")
def list_folders() -> list[dict[str, Any]]:
    with db.session() as conn:
        rows = conn.execute("SELECT uid, name, created_at, updated_at FROM vocab_folders WHERE deleted = 0 "
                            "ORDER BY name COLLATE NOCASE").fetchall()
    return db.rows_to_dicts(rows)


@router.post("/folders")
def add_folder(body: FolderIn) -> dict[str, Any]:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Give the folder a name.")
    uid = "d" + ids.new_uid()[1:]
    with db.session() as conn:
        conn.execute("INSERT INTO vocab_folders(uid, name, created_at) VALUES(?,?,?)", (uid, name[:80], time.time()))
        row = conn.execute("SELECT uid, name, created_at, updated_at FROM vocab_folders WHERE uid = ?", (uid,)).fetchone()
    sync.request()
    return dict(row)


@router.patch("/folders/{uid}")
def rename_folder(uid: str, body: FolderIn) -> dict[str, Any]:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Give the folder a name.")
    with db.session() as conn:
        conn.execute("UPDATE vocab_folders SET name = ? WHERE uid = ?", (name[:80], uid))
        row = conn.execute("SELECT uid, name, created_at, updated_at FROM vocab_folders WHERE uid = ?", (uid,)).fetchone()
    if row is None:
        raise HTTPException(404, "Folder not found.")
    sync.request()
    return dict(row)


@router.delete("/folders/{uid}")
def delete_folder(uid: str) -> dict[str, bool]:
    """Deletes the folder only; its words stay in the list (and in any other folders)."""
    with db.session() as conn:
        conn.execute("UPDATE vocab_folders SET deleted = 1 WHERE uid = ?", (uid,))
        rows = conn.execute("SELECT id, folders FROM vocab WHERE deleted = 0 AND folders LIKE ?",
                            (f'%"{uid}"%',)).fetchall()
        for r in rows:
            kept = [f for f in _out(r)["folders"] if f != uid]
            conn.execute("UPDATE vocab SET folders = ? WHERE id = ?", (json.dumps(sorted(kept)), r["id"]))
    sync.request()
    return {"ok": True}


@router.post("/bulk-folders")
def bulk_folders(body: BulkFolders) -> dict[str, int]:
    changed = 0
    with db.session() as conn:
        for vid in body.ids:
            row = conn.execute("SELECT folders FROM vocab WHERE id = ?", (vid,)).fetchone()
            if row is None:
                continue
            before = set(_out(row)["folders"])
            after = (before | set(body.add)) - set(body.remove)
            if after != before:
                conn.execute("UPDATE vocab SET folders = ? WHERE id = ?", (json.dumps(sorted(after)), vid))
                changed += 1
    if changed:
        sync.request()
    return {"changed": changed}


@router.post("")
def add_vocab(body: VocabIn) -> dict[str, Any]:
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Nothing to save.")
    title = ""
    episode_uid = None
    language = None
    with db.session() as conn:
        if body.episode_id is not None:
            ep = conn.execute("SELECT e.title, e.uid, COALESCE(e.language, f.language) AS language FROM episodes e "
                              "JOIN feeds f ON f.id = e.feed_id WHERE e.id = ?", (body.episode_id,)).fetchone()
            if ep:
                title, episode_uid, language = ep["title"], ep["uid"], ep["language"]
        if episode_uid is None:
            title = " ".join(body.source.split())[:300]
            if languages.valid(body.language):
                language = body.language
        if not languages.valid(language):
            language = languages.detect(text, languages.study())  # a word typed in, or from an unknown source
        cur = conn.execute(
            "INSERT INTO vocab(uid, episode_id, episode_uid, text, norm, sentence, start, end, sent_start, sent_end, "
            "meaning, notes, translation, episode_title, created_at, language) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (ids.new_uid(), body.episode_id, episode_uid, text, arabic.normalize(text), body.sentence.strip(),
             body.start, body.end, body.sent_start, body.sent_end, body.meaning, body.notes,
             body.translation.strip(), title, time.time(), language),
        )
        row = conn.execute("SELECT * FROM vocab WHERE id = ?", (cur.lastrowid,)).fetchone()
    sync.request()
    from .. import voices

    voices.worker.kick()  # with "My computer" chosen, a word without audio gets its voice made
    return _out(row)


@router.post("/batch")
def add_batch(body: BatchIn) -> dict[str, Any]:
    """Several cards typed in at once (the Vocab page's "Add words"), with their folders. They come
    back in the order given; the first is the newest, so the list (newest first) shows them in that
    order at its top. A card's language is what its letters say, as for one word typed in."""
    cards = [c for c in body.cards if c.text.strip()]
    if not cards:
        raise HTTPException(400, "Nothing to save.")
    if len(cards) > MAX_BATCH:
        raise HTTPException(400, f"At most {MAX_BATCH} cards can be added at a time.")
    study = languages.study()
    now = time.time()
    made: list[int] = []
    with db.session() as conn:
        known = {r["uid"] for r in conn.execute("SELECT uid FROM vocab_folders WHERE deleted = 0").fetchall()}
        for n, c in enumerate(cards):
            text = c.text.strip()[:200]
            folders = sorted({f for f in c.folders if f in known})
            cur = conn.execute(
                "INSERT INTO vocab(uid, text, norm, sentence, meaning, notes, translation, episode_title, created_at, "
                "language, folders) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (ids.new_uid(), text, arabic.normalize(text), c.sentence.strip()[:1000], c.meaning.strip()[:500],
                 c.notes.strip()[:2000], c.translation.strip()[:1000], c.source.strip()[:200], now - n * 0.001,
                 languages.detect(text, study), json.dumps(folders)),
            )
            made.append(int(cur.lastrowid))
        rows = [conn.execute("SELECT * FROM vocab WHERE id = ?", (i,)).fetchone() for i in made]
    sync.request()
    from .. import voices

    voices.worker.kick()  # with "My computer" chosen, the new cards get their voices made
    return {"cards": [_out(r) for r in rows]}


# ----- audio clips for shared words -----
# A word sent to a friend carries a short clip of its sentence, so their "Word" and "Sentence"
# buttons work without having the episode. A received word keeps that clip as clips/<uid>.ogg
# and its start/end/sent_start/sent_end are then times inside the clip.

CLIP_LEAD, CLIP_TAIL, MAX_CLIP_BYTES = 0.3, 0.45, 2 * 1024 * 1024


def _vocab_row(vocab_id: int) -> Any:
    with db.session() as conn:
        row = conn.execute("SELECT * FROM vocab WHERE id = ? AND deleted = 0", (vocab_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Not found.")
    return row


def voice_times(row: Any) -> dict[str, Any] | None:
    """A card's voice (web/js/cardvoice.js, app/voices.py): where its word and sentence are in its
    file, or None when it has none."""
    try:
        t = json.loads(row["voice"] or "null")
    except (TypeError, ValueError, KeyError, IndexError):
        return None
    if not isinstance(t, dict) or not isinstance(t.get("start"), (int, float)) or not isinstance(t.get("end"), (int, float)):
        return None
    return {k: (float(t[k]) if isinstance(t.get(k), (int, float)) else None) for k in ("start", "end", "sent_start", "sent_end")}


def _own_clip(row: Any) -> Path | None:
    """The clip stored with a word that was shared with this user, or its voice (fetched from Drive
    if needed)."""
    if not row["clip"] and voice_times(row) is None:
        return None
    path = engine.clip_path(row["uid"])
    if not path.exists():
        path = sync.vocab_clip(row["uid"]) or path
    return path if path.exists() else None


def _episode_audio(episode_id: int | None, fetch: bool = True) -> Path | None:
    """The episode's audio file. `fetch=False` only looks on this computer (no download from Drive)."""
    if episode_id is None:
        return None
    with db.session() as conn:
        ep = conn.execute("SELECT audio_path, sync_audio_path, remote_audio, audio_type FROM episodes WHERE id = ?",
                          (episode_id,)).fetchone()
    if ep is None or (ep["audio_type"] or "") in ("text/html", "video/youtube", "video/netflix"):
        return None
    for stored in (ep["audio_path"], ep["sync_audio_path"]):
        if stored and Path(stored).exists():
            return Path(stored)
    if ep["remote_audio"] and fetch:
        return sync.audio_copy(episode_id)
    return None


@router.get("/{vocab_id}/share-clip")
def share_clip(vocab_id: int) -> dict[str, Any]:
    """The audio to send along with a word: {"audio": base64 Ogg/Opus, "times": {...}} with the
    word's and sentence's positions inside it. 404 when the word has no audio to send."""
    row = _vocab_row(vocab_id)
    own = _own_clip(row) if row["clip"] else None
    if own is not None:  # passing on a word a friend shared: reuse its clip as is
        times = {k: row[k] for k in ("start", "end", "sent_start", "sent_end")}
        return {"audio": base64.b64encode(own.read_bytes()).decode("ascii"), "times": times}
    src = _episode_audio(row["episode_id"]) if row["start"] is not None and row["sent_start"] is not None \
        and row["sent_end"] is not None else None
    if src is None:
        voiced = _own_clip(row)  # no recording to cut: the card's voice goes, if it has one
        if voiced is not None:
            return {"audio": base64.b64encode(voiced.read_bytes()).decode("ascii"), "times": voice_times(row)}
        raise HTTPException(404, "This word has no audio.")
    tmp = paths.tmp_dir() / f"clip-{uuid.uuid4().hex}.ogg"
    try:
        began = audio.cut_clip(src, row["sent_start"] - CLIP_LEAD, row["sent_end"] + CLIP_TAIL, tmp)
        data = tmp.read_bytes()
    except audio.AudioError as exc:
        raise HTTPException(404, str(exc)) from exc
    finally:
        tmp.unlink(missing_ok=True)
    word_end = row["end"] if row["end"] is not None else row["start"] + 1
    times = {"start": round(max(0.0, row["start"] - began), 3), "end": round(max(0.0, word_end - began), 3),
             "sent_start": round(max(0.0, row["sent_start"] - began), 3), "sent_end": round(max(0.0, row["sent_end"] - began), 3)}
    return {"audio": base64.b64encode(data).decode("ascii"), "times": times}


@router.put("/{vocab_id}/clip")
async def save_clip(vocab_id: int, request: Request, start: float = 0, end: float = 0,
                    sent_start: float | None = None, sent_end: float | None = None) -> dict[str, Any]:
    """Store the clip that came with a shared word (raw request body = the audio file). A word
    passed on without a sentence has no sentence times."""
    row = _vocab_row(vocab_id)
    data = await request.body()
    if not data or len(data) > MAX_CLIP_BYTES:
        raise HTTPException(400, "That audio clip is empty or too large.")
    dest = engine.clip_path(row["uid"])
    dest.write_bytes(data)
    with db.session() as conn:
        conn.execute("UPDATE vocab SET clip = 1, start = ?, end = ?, sent_start = ?, sent_end = ? WHERE id = ?",
                     (start, end, sent_start, sent_end, vocab_id))
        out = conn.execute("SELECT * FROM vocab WHERE id = ?", (vocab_id,)).fetchone()
    sync.request()
    return _out(out)


def _media_type(path: Path) -> str:
    """What a card's own file is played as: an Ogg Opus file (a friend's clip, a card voice), or a WAV
    file (a recording made on a phone that can't make Ogg Opus, web/js/cardaudio.js), whatever its name."""
    with path.open("rb") as f:
        head = f.read(12)
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "audio/wav"
    return "audio/ogg"


@router.get("/{vocab_id}/clip")
def get_clip(vocab_id: int) -> Response:
    path = _own_clip(_vocab_row(vocab_id))
    if path is None:
        raise HTTPException(404, "This word's audio isn't available.")
    return FileResponse(path, media_type=_media_type(path))


@router.put("/{vocab_id}/voice")
async def save_voice(vocab_id: int, request: Request, start: float, end: float,
                     sent_start: float | None = None, sent_end: float | None = None) -> dict[str, Any]:
    """Keep a card's voice made with Azure on this computer's page (web/js/cardvoice.js; raw request
    body = the Ogg Opus file). Made once: a card that already has a voice, or a friend's clip, keeps it."""
    row = _vocab_row(vocab_id)
    if row["clip"] or voice_times(row) is not None:
        return _out(row)
    data = await request.body()
    if not data or len(data) > MAX_CLIP_BYTES:
        raise HTTPException(400, "That audio is empty or too large.")
    dest = engine.clip_path(row["uid"])
    dest.write_bytes(data)
    times = {"start": start, "end": end, "sent_start": sent_start, "sent_end": sent_end}
    with db.session() as conn:
        conn.execute("UPDATE vocab SET voice = ? WHERE id = ? AND voice = ''", (json.dumps(times), vocab_id))
        out = conn.execute("SELECT * FROM vocab WHERE id = ?", (vocab_id,)).fetchone()
    sync.request(20)
    return _out(out)


MAX_RECORDING_BYTES = 8 * 1024 * 1024  # what the page may send (a WAV file is big); what is kept is small
MAX_RECORDING_SECONDS = 60.0
RECORDING_RATE = 24000  # web/js/cardaudio.js RATE


def _is_ogg_opus(data: bytes) -> bool:
    return data[:4] == b"OggS" and b"OpusHead" in data[:80]


@router.put("/{vocab_id}/recording")
async def save_recording(vocab_id: int, request: Request, start: float, end: float,
                         sent_start: float | None = None, sent_end: float | None = None) -> dict[str, Any]:
    """The learner's own recording (or sound file) for a card typed in with "Add words": its word and,
    if recorded, its sentence in one file (web/js/cardaudio.js; raw request body). It is kept as the
    card's voice (the same file, times and road as one made by Azure: save_voice). Ogg Opus is kept as
    it is; anything else (a WAV file, from a page that can't make Ogg Opus) is made into Ogg Opus here.
    Once only, like a voice."""
    row = _vocab_row(vocab_id)
    if row["clip"] or voice_times(row) is not None:
        return _out(row)
    if not (0 <= start < end) or (sent_start is not None and (sent_end is None or not 0 <= sent_start < sent_end)):
        raise HTTPException(400, "Those times don't fit the recording.")
    data = await request.body()
    if not data or len(data) > MAX_RECORDING_BYTES:
        raise HTTPException(400, "That recording is empty or too large.")
    if not _is_ogg_opus(data):
        import numpy as np

        tmp = paths.tmp_dir() / f"rec-{uuid.uuid4().hex}.audio"
        try:
            tmp.write_bytes(data)
            pcm = audio.decode(tmp, RECORDING_RATE)
        except audio.AudioError as exc:
            raise HTTPException(400, "That recording couldn't be read as sound.") from exc
        finally:
            tmp.unlink(missing_ok=True)
        if len(pcm) > MAX_RECORDING_SECONDS * RECORDING_RATE:
            raise HTTPException(400, "That recording is too long.")
        try:
            data = audio.encode_pcm_opus((np.clip(pcm, -1.0, 1.0) * 32767).astype(np.int16), RECORDING_RATE)
        except audio.AudioError as exc:
            raise HTTPException(400, str(exc)) from exc
    if len(data) > MAX_CLIP_BYTES:
        raise HTTPException(400, "That recording is too large.")
    engine.clip_path(row["uid"]).write_bytes(data)
    times = {"start": start, "end": end, "sent_start": sent_start, "sent_end": sent_end}
    with db.session() as conn:
        conn.execute("UPDATE vocab SET voice = ? WHERE id = ? AND voice = '' AND clip = 0", (json.dumps(times), vocab_id))
        out = conn.execute("SELECT * FROM vocab WHERE id = ?", (vocab_id,)).fetchone()
    sync.request(20)
    return _out(out)


@router.patch("/{vocab_id}")
def update_vocab(vocab_id: int, body: VocabPatch) -> dict[str, Any]:
    with db.session() as conn:
        if body.meaning is not None:
            conn.execute("UPDATE vocab SET meaning = ? WHERE id = ?", (body.meaning, vocab_id))
        if body.notes is not None:
            conn.execute("UPDATE vocab SET notes = ? WHERE id = ?", (body.notes, vocab_id))
        if body.memo is not None:
            conn.execute("UPDATE vocab SET memo = ? WHERE id = ?", (body.memo, vocab_id))
        if body.text is not None and body.text.strip():
            conn.execute("UPDATE vocab SET text = ?, norm = ? WHERE id = ?",
                         (body.text.strip(), arabic.normalize(body.text), vocab_id))
        if body.folders is not None:
            conn.execute("UPDATE vocab SET folders = ? WHERE id = ?", (json.dumps(sorted(set(body.folders))), vocab_id))
        if body.sentence is not None:
            if body.sentence_if is None:
                conn.execute("UPDATE vocab SET sentence = ? WHERE id = ?", (body.sentence[:2000], vocab_id))
            else:
                conn.execute("UPDATE vocab SET sentence = ? WHERE id = ? AND sentence = ?",
                             (body.sentence[:2000], vocab_id, body.sentence_if))
        row = conn.execute("SELECT * FROM vocab WHERE id = ?", (vocab_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Not found.")
    sync.request(delay=10)  # typing in notes: wait for a pause
    return _out(row)


@router.delete("/{vocab_id}")
def delete_vocab(vocab_id: int) -> dict[str, bool]:
    with db.session() as conn:
        # Soft delete: the tombstone syncs the deletion to other devices.
        conn.execute("UPDATE vocab SET deleted = 1 WHERE id = ?", (vocab_id,))
    sync.request()
    return {"ok": True}


# ----- audio clips for an Anki export -----
# Each word takes two MP3 clips into Anki: the word alone and its whole sentence. Only audio that
# is already on this computer is used; a word without it is exported as text.

WORD_LEAD, WORD_TAIL = 0.05, 0.12  # a little air around a single word so its edges aren't clipped


def _anki_clip(src: Path, uid: str, part: str, start: float, end: float) -> bytes | None:
    """One clip as MP3, cut once and then reused (the name carries the times it was cut at)."""
    path = paths.anki_clips_dir() / f"{uid}-{part}-{round(start * 100)}-{round(end * 100)}.mp3"
    if not path.exists():
        for stale in paths.anki_clips_dir().glob(f"{uid}-{part}-*.mp3"):
            stale.unlink(missing_ok=True)
        try:
            audio.cut_clip(src, start, end, path, bitrate=48_000, kind="mp3")
        except audio.AudioError:
            return None
    return path.read_bytes()


def _anki_clips(items: list[dict[str, Any]]) -> dict[str, dict[str, bytes]]:
    """The audio for these words, by uid: {"word": mp3, "sentence": mp3} (whichever exist)."""
    out: dict[str, dict[str, bytes]] = {}
    sources: dict[int, Path | None] = {}
    for v in items:
        t: dict[str, Any] = {k: v[k] for k in ("start", "end", "sent_start", "sent_end")}
        src = None
        if v["clip"]:  # a word a friend shared: its own clip, with times inside that clip
            own = engine.clip_path(v["uid"])
            src = own if own.exists() else None
        elif v["start"] is not None or v["sent_start"] is not None:
            if v["episode_id"] not in sources:
                sources[v["episode_id"]] = _episode_audio(v["episode_id"], fetch=False)
            src = sources[v["episode_id"]]
        if src is None and voice_times(v) is not None:  # no recording here: the card's voice, if made
            own = engine.clip_path(v["uid"])
            src, t = (own, voice_times(v)) if own.exists() else (None, t)
        if src is None or (t["start"] is None and t["sent_start"] is None):
            continue
        clips: dict[str, bytes] = {}
        if t["start"] is not None:
            word_end = t["end"] if t["end"] is not None else t["start"] + 1
            data = _anki_clip(src, v["uid"], "w", t["start"] - WORD_LEAD, word_end + WORD_TAIL)
            if data:
                clips["word"] = data
        if t["sent_start"] is not None and t["sent_end"] is not None:
            data = _anki_clip(src, v["uid"], "s", t["sent_start"] - CLIP_LEAD, t["sent_end"] + CLIP_TAIL)
            if data:
                clips["sentence"] = data
        if clips:
            out[v["uid"]] = clips
    return out


@router.get("/export/{fmt}")
def export_vocab(fmt: str, folder: str | None = None, ids: str | None = None) -> Response:
    """Export everything, one folder, or exactly the words shown on screen (``ids``)."""
    items = _items(None, folder)
    if ids:
        order = {int(x): n for n, x in enumerate(ids.split(",")) if x.strip().isdigit()}
        items = sorted((v for v in items if v["id"] in order), key=lambda v: order[v["id"]])
    if fmt == "csv":
        return Response(exporters.vocab_to_csv(items), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="tamkeen-vocab.csv"'})
    if fmt == "anki":
        return Response(exporters.vocab_to_anki(items), media_type="text/plain; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="tamkeen-vocab-anki.txt"'})
    if fmt == "apkg":  # the deck file: the same cards with their layout, audio and learning progress
        game = db.get_setting("game_state")
        review = game.get("review") if isinstance(game, dict) else None
        with db.session() as conn:
            answers = reviews.log(conn)  # the reviewer's record: it decides the schedule of the words it covers
        from .. import anki_bridge  # each word goes to its language's deck, the same one the sync uses

        deck = anki_deck.build(items, _anki_clips(items), review=review if isinstance(review, dict) else None,
                               reviews=answers, decks=anki_bridge.deck_names(), language=languages.study())
        return Response(deck, media_type="application/octet-stream",
                        headers={"Content-Disposition": 'attachment; filename="tamkeen-vocab.apkg"'})
    raise HTTPException(400, "Format must be csv, anki or apkg.")
