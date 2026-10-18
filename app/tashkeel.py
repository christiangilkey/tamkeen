"""Arabic vowel marks (tashkeel): a vowelled copy of Arabic transcripts, pages and reels.

Arabic is written without its short vowels, so a learner reading a transcript has to guess how
each word is said. When "Show vowels" is on, the players show a copy of every Arabic word with
its vowel marks. The copy sits beside the original (`words.vowelled`) and never replaces it:
matching, seen words, search and saved words all keep using the original words.

The marks come from CATT (Character-based Arabic Tashkeel Transformer, Abjad AI, Apache-2.0;
see licenses/catt.txt), its encoder-only model run with onnxruntime (already part of the app,
faster-whisper uses it). The model is a one-time 22 MB download, made only when someone learning
Arabic asks for vowels. Only the computer runs it: the vowelled copy travels to the phone inside
the transcript file (`vowels` in t_<uid>.json.gz).

It learned Standard Arabic (news and books). On news-style Arabic about 4 words in 5 come out
fully right, endings included (WikiNews test set), but it vowels Egyptian, Levantine or Gulf
speech as if it were Standard Arabic, which is often wrong. So each transcript is checked for
dialect giveaway words: a dialect transcript, or a line with such a word in it, is marked as a
guess, and the players leave those words plain unless the learner asks to see guesses too.

Freshness: `episodes.vowels` holds {"rev", "dialect", "guess", "model"}; the copy is current
while its rev equals the episode's transcribed_at. Anything that changes the words (a new
transcription, a corrected word) moves transcribed_at on, so the copy is made again. Making it
moves transcribed_at on as well, so sync sends the vowelled transcript to the other devices.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

from . import arabic, db, downloader, events, paths

log = logging.getLogger(__name__)

MODEL_ID = "catt-eo-int8"
# The encoder-only CATT model as one ONNX file (int8), pinned to one revision of its repository
# and checked against its checksum before it is used.
MODEL_URL = ("https://huggingface.co/TigreGotico/catt-diacritizer/resolve/"
             "8ad763613cce96511c099e9943820be7cc80fbc2/catt_eo.int8.onnx")
MODEL_SHA256 = "59ba20d02a4b507a6b816a9b46b1230ba73d341c6731aa48da5de99388a39fca"
MODEL_BYTES = 21564456

# ---------------------------------------------------------------------------------- the model's alphabet

_AR2BW = {
    "ء": "'", "آ": "|", "أ": ">", "ؤ": "&", "إ": "<", "ئ": "}",
    "ا": "A", "ب": "b", "ة": "p", "ت": "t", "ث": "v", "ج": "j",
    "ح": "H", "خ": "x", "د": "d", "ذ": "*", "ر": "r", "ز": "z",
    "س": "s", "ش": "$", "ص": "S", "ض": "D", "ط": "T", "ظ": "Z",
    "ع": "E", "غ": "g", "ف": "f", "ق": "q", "ك": "k", "ل": "l",
    "م": "m", "ن": "n", "ه": "h", "و": "w", "ى": "Y", "ي": "y",
    "ٱ": "A",  # alef wasla is read as a plain alef
}
_LETTERS = ["<PAD>", "<BOS>", "<EOS>", " ", "$", "&", "'", "*", "<", ">", "A", "D", "E", "H", "S",
            "T", "Y", "Z", "b", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "q", "r", "s", "t",
            "v", "w", "x", "y", "z", "|", "}", "<MASK>"]
_ID = {c: i for i, c in enumerate(_LETTERS)}
_SPACE = _ID[" "]
# The model's answer for each letter -> the marks written after it (shadda first).
_TAGS = ["", "", "", "",                              # padding, start, end, no mark
         "ُّ", "ٌّ", "َّ", "ًّ", "ِّ", "ٍّ",
         "ً", "ٍ", "ٌ", "َ", "ِ", "ْ", "ُ", "ّ"]
_MARK = re.compile("[ً-ْٰ]")    # the vowel marks (and superscript alef)
MAX_LETTERS = 1000                                 # the model reads at most 1024 positions at once

# ---------------------------------------------------------------------------------- dialect

# Words that give a dialect away: common in speech, absent (or rare) in Standard Arabic. Stricter
# than the seen-words list (web/js/lexicon/arabic.js): words that are also ordinary Standard Arabic
# there (دول "countries", قوي "strong", أبي "my father") would hide the vowels of news transcripts.
DIALECT_WORDS = {
    "lev": "هلق شو بدي بدك بدو بدها بدنا بدكن بدكم بدهم هيك كتير منيح منيحه هاد هاي هدول ليش لسا اشي هيدا "
           "هيدي لهيك قديش ايمتى ايمتي وين كيفك كيفكن عم بعرف بحكي منحكي بتعرف هيدول",
    "egy": "مش عايز عاوز عايزه عاوزه ده دي ازاي كده اوي دلوقتي النهارده عشان علشان بتاع بتاعه بتاعت ايه فين "
           "ليه برضه برضو لسه اهو مفيش امبارح بكره ازيك احنا انتو",
    "glf": "شلون شلونك وايد الحين ابغي ابغى يبي تبي شنو وش مب موب هالحين شخبارك توني اكو ماكو شكو هوايه هسه "
           "يمعود",
}
_DIALECT_OF: dict[str, list[str]] = {}
for _name, _words in DIALECT_WORDS.items():
    for _w in _words.split():
        _DIALECT_OF.setdefault(_w, []).append(_name)
DIALECT_SHARE = 0.01   # this share of giveaway words (or more) makes the whole text dialect

_NON_LETTER = re.compile(r"[^ء-ي]+")


def _form(word: str) -> str:
    return _NON_LETTER.sub("", arabic.normalize(word))


def judge_dialect(lines: list[list[str]]) -> tuple[str, list[int]]:
    """Which dialect a text is in ("" = Standard Arabic, or too little to tell) and which of its
    lines have a giveaway word in them. `lines` are the words of each line."""
    hits: dict[str, float] = {}
    total = 0
    guess = []
    for n, words in enumerate(lines):
        found = False
        for word in words:
            form = _form(word)
            if not form:
                continue
            total += 1
            names = _DIALECT_OF.get(form) or _DIALECT_OF.get(form[1:] if form[:1] in "وف" else "")
            if names:
                found = True
                for name in names:
                    hits[name] = hits.get(name, 0.0) + 1 / len(names)
        if found:
            guess.append(n)
    best = max(hits, key=lambda k: hits[k], default="")
    dialect = best if best and hits[best] >= max(1.0, total * DIALECT_SHARE) else ""
    return dialect, guess


# ---------------------------------------------------------------------------------- download

_lock = threading.Lock()
_state: dict[str, Any] = {"state": "idle", "done": 0, "total": MODEL_BYTES, "error": None}
_cancel = threading.Event()


class TashkeelError(RuntimeError):
    pass


def model_path() -> Path:
    return paths.models_dir() / "tashkeel" / f"{MODEL_ID}.onnx"


def installed() -> bool:
    return model_path().exists()


def _set(**kw: Any) -> None:
    with _lock:
        _state.update(kw)
    events.publish("vowels", status())


def status() -> dict[str, Any]:
    with _lock:
        st = dict(_state)
    st.update(installed=installed(), bytes=MODEL_BYTES, model=MODEL_ID, working=_worker_busy.is_set())
    return st


def _download() -> None:
    try:
        last = 0.0

        def prog(done: int, _total: int | None) -> None:
            nonlocal last
            if time.monotonic() - last > 0.25:
                last = time.monotonic()
                _set(done=done)

        downloader.download(MODEL_URL, model_path(), prog, expected_sha256=MODEL_SHA256,
                            expected_size=MODEL_BYTES, cancel=_cancel)
        _set(state="idle", done=MODEL_BYTES, error=None)
        kick()  # vowel what is already in the library
    except downloader.Cancelled:
        _set(state="idle", error=None)
    except Exception as exc:
        log.exception("Vowel model download failed")
        _set(state="error", error=f"Couldn't download the vowel model ({exc}). Check your connection and try again.")


def start_download() -> dict[str, Any]:
    with _lock:
        busy = _state["state"] == "downloading"
        if not busy and not installed():
            _state.update(state="downloading", done=0, error=None)
    if not busy and not installed():
        _cancel.clear()
        threading.Thread(target=_download, name="vowel-model", daemon=True).start()
    return status()


def remove() -> dict[str, Any]:
    global _session
    _cancel.set()
    with _model_lock:
        _session = None
        model_path().unlink(missing_ok=True)
        Path(str(model_path()) + ".part").unlink(missing_ok=True)
    _set(state="idle", done=0, error=None)
    return status()


# ---------------------------------------------------------------------------------- running it

_model_lock = threading.Lock()
_session: Any = None


def _load() -> Any:
    global _session
    if _session is None:
        if not installed():
            raise TashkeelError("The vowel model isn't downloaded.")
        import onnxruntime as ort  # comes with faster-whisper

        opts = ort.SessionOptions()
        # Leave room for transcription, which may be running at the same time.
        opts.intra_op_num_threads = max(1, min(4, (os.cpu_count() or 2) // 2))
        _session = ort.InferenceSession(str(model_path()), sess_options=opts, providers=["CPUExecutionProvider"])
    return _session


def _predict(rows: list[list[int]]) -> list[list[int]]:
    import numpy as np

    width = max(len(r) for r in rows)
    src = np.zeros((len(rows), width), dtype=np.int64)
    for i, r in enumerate(rows):
        src[i, :len(r)] = r
    real = src != 0
    mask = real[:, None, None, :] & real[:, None, :, None]
    with _model_lock:
        out = _load().run(None, {"src": src, "src_mask": mask})[0]
    return out.argmax(-1).tolist()


def _has_marks(word: str) -> bool:
    return bool(re.search("[ً-ْ]", word))


def vowel_lines(lines: list[list[str]], batch: int = 16) -> list[list[str]]:
    """Add vowel marks to lines of words. Each line is read as a whole (the words around a word
    decide its vowels); every character of every word is kept, the marks are only added after
    its letters. A word that already has vowel marks is left exactly as it was."""
    # One letter sequence per line: letters of its words, a space between words. `where` says
    # which (word, character) each letter came from.
    plans: list[tuple[list[int], list[tuple[int, int]]]] = []
    for words in lines:
        ids: list[int] = []
        where: list[tuple[int, int]] = []
        for w, word in enumerate(words):
            for c, ch in enumerate(word):
                bw = _AR2BW.get(ch)
                if bw:
                    ids.append(_ID[bw])
                    where.append((w, c))
                elif _MARK.match(ch) or ch == "ـ":
                    continue  # marks and tatweel are not letters
                elif ids and ids[-1] != _SPACE:
                    ids.append(_SPACE)  # punctuation, digits, Latin letters: a word break
                    where.append((-1, -1))
            if ids and ids[-1] != _SPACE:
                ids.append(_SPACE)
                where.append((-1, -1))
        while ids and ids[-1] == _SPACE:
            ids.pop()
            where.pop()
        plans.append((ids, where))
    # Long lines are read in pieces of up to MAX_LETTERS, cut between words.
    pieces: list[tuple[int, int, int]] = []
    for n, (ids, _where) in enumerate(plans):
        s = 0
        while s < len(ids):
            e = min(len(ids), s + MAX_LETTERS)
            if e < len(ids):
                cut = max((j for j in range(s + 1, e) if ids[j] == _SPACE), default=e)
                e = cut
            pieces.append((n, s, e))
            s = e + 1 if e < len(ids) and ids[e] == _SPACE else e
    tags = [[0] * len(ids) for ids, _ in plans]
    pieces.sort(key=lambda p: p[2] - p[1])  # similar lengths together: less padding
    for b in range(0, len(pieces), batch):
        chunk = pieces[b:b + batch]
        for (n, s, e), row in zip(chunk, _predict([plans[n][0][s:e] for n, s, e in chunk])):
            tags[n][s:e] = row[:e - s]
    out: list[list[str]] = []
    for words, (ids, where), line_tags in zip(lines, plans, tags):
        marks: dict[tuple[int, int], str] = {}
        for (w, c), tag in zip(where, line_tags):
            if w >= 0:
                marks[(w, c)] = _TAGS[tag]
        done = []
        for w, word in enumerate(words):
            if _has_marks(word):
                done.append(word)
                continue
            done.append("".join(ch + marks.get((w, c), "") for c, ch in enumerate(word)))
        out.append(done)
    return out


def vowel_text(text: str) -> str:
    """One piece of text, vowelled (spaces kept as they were)."""
    parts = re.split(r"(\s+)", text)
    words = [p for p in parts if p and not p.isspace()]
    if not words:
        return text
    vowelled = iter(vowel_lines([words])[0])
    return "".join(p if not p or p.isspace() else next(vowelled) for p in parts)


# ---------------------------------------------------------------------------------- episodes

def is_arabic(language: str | None) -> bool:
    return (language or "ar") == "ar"  # missing = Arabic (everything before other languages)


def info(row: Any) -> dict[str, Any] | None:
    """The episode's vowels record, if it is current (made from the words as they are now)."""
    try:
        data = json.loads(row["vowels"]) if row["vowels"] else None
    except (TypeError, ValueError):
        return None
    if not data or row["transcribed_at"] is None or abs(float(data.get("rev") or 0) - row["transcribed_at"]) > 1e-6:
        return None
    return data


def for_episode(episode_id: int) -> dict[str, Any] | None:
    """{words: [vowelled word or None], dialect, guess: [line numbers], model}, or None when the
    episode has no current vowels. A word whose vowelled form is the word itself is None."""
    with db.session() as conn:
        ep = conn.execute("SELECT vowels, transcribed_at FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        data = info(ep) if ep else None
        if not data:
            return None
        rows = conn.execute("SELECT vowelled FROM words WHERE episode_id = ? ORDER BY idx", (episode_id,)).fetchall()
    return {"words": [r["vowelled"] for r in rows], "dialect": data.get("dialect", ""),
            "guess": data.get("guess", []), "model": data.get("model", "")}


def pending(conn: Any) -> list[int]:
    """Arabic episodes with words but no current vowels, newest first."""
    rows = conn.execute(
        "SELECT id, vowels, transcribed_at FROM episodes WHERE status = 'done' AND deleted = 0 "
        "AND transcribed_at IS NOT NULL AND COALESCE(language, 'ar') = 'ar' "
        "AND EXISTS (SELECT 1 FROM words w WHERE w.episode_id = episodes.id) "
        "ORDER BY transcribed_at DESC").fetchall()
    return [r["id"] for r in rows if info(r) is None or info(r).get("dirty")]


def words_changed(conn: Any, episode_id: int, idxs: list[int], rev: float) -> None:
    """Some words were corrected (app/corrections.py, inside its transaction, just before the episode's
    transcribed_at becomes `rev`). They lose their vowels; the rest keep theirs until the copy is
    made again."""
    ep = conn.execute("SELECT vowels, transcribed_at FROM episodes WHERE id = ?", (episode_id,)).fetchone()
    data = info(ep) if ep else None
    if data is None:
        return
    conn.executemany("UPDATE words SET vowelled = NULL WHERE episode_id = ? AND idx = ?", [(episode_id, i) for i in idxs])
    conn.execute("UPDATE episodes SET vowels = ? WHERE id = ?", (json.dumps({**data, "rev": rev, "dirty": True}), episode_id))


def vowel_episode(episode_id: int) -> bool:
    """Make the episode's vowelled copy. False if its words changed meanwhile (it is tried again)."""
    with db.session() as conn:
        ep = conn.execute("SELECT transcribed_at, language FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if ep is None or not is_arabic(ep["language"]):
            return True
        rows = conn.execute("SELECT idx, seg_idx, text FROM words WHERE episode_id = ? ORDER BY idx",
                            (episode_id,)).fetchall()
    rev = ep["transcribed_at"]
    lines: list[list[str]] = []
    idxs: list[list[int]] = []
    last = None
    for r in rows:
        if r["seg_idx"] != last:
            lines.append([])
            idxs.append([])
            last = r["seg_idx"]
        lines[-1].append(r["text"])
        idxs[-1].append(r["idx"])
    dialect, guess_lines = judge_dialect(lines)
    vowelled = vowel_lines(lines)
    seg_of_line = _segs(rows)
    now = time.time()
    with db.session() as conn:
        cur = conn.execute("SELECT transcribed_at FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if cur is None or cur["transcribed_at"] != rev:
            return False
        conn.executemany("UPDATE words SET vowelled = ? WHERE episode_id = ? AND idx = ?",
                         [(v if v != t else None, episode_id, i)
                          for line, vline, iline in zip(lines, vowelled, idxs)
                          for t, v, i in zip(line, vline, iline)])
        record = {"rev": now, "dialect": dialect, "guess": [seg_of_line[n] for n in guess_lines], "model": MODEL_ID}
        # Moving transcribed_at on makes the next sync send the vowelled transcript to the phone.
        conn.execute("UPDATE episodes SET vowels = ?, transcribed_at = ? WHERE id = ?",
                     (json.dumps(record), now, episode_id))
    return True


def _segs(rows: list[Any]) -> list[int]:
    out: list[int] = []
    for r in rows:
        if not out or out[-1] != r["seg_idx"]:
            out.append(r["seg_idx"])
    return out


# ---------------------------------------------------------------------------------- sync

def payload_part(episode_id: int) -> dict[str, Any]:
    """What a transcript file carries about vowels: {"vowels": ...} or nothing."""
    v = for_episode(episode_id)
    return {"vowels": v} if v else {}


def store_from_payload(conn: Any, episode_id: int, payload: dict[str, Any]) -> None:
    """Keep the vowels a downloaded transcript brought (inside store_transcript's transaction).
    Vowels changed on the phone (a corrected word) are marked `dirty`: shown as they are, and made
    again here."""
    v = payload.get("vowels")
    words = (payload.get("words") or {}).get("text") or []
    if not isinstance(v, dict) or not isinstance(v.get("words"), list) or len(v["words"]) != len(words):
        conn.execute("UPDATE episodes SET vowels = NULL WHERE id = ?", (episode_id,))
        return
    conn.executemany("UPDATE words SET vowelled = ? WHERE episode_id = ? AND idx = ?",
                     [(x if isinstance(x, str) and x else None, episode_id, i) for i, x in enumerate(v["words"])])
    record = {"rev": payload["rev"], "dialect": str(v.get("dialect") or ""),
              "guess": [int(g) for g in v.get("guess") or [] if isinstance(g, int)], "model": str(v.get("model") or "")}
    if v.get("dirty"):
        record["dirty"] = True
    conn.execute("UPDATE episodes SET vowels = ? WHERE id = ?", (json.dumps(record), episode_id))


# ---------------------------------------------------------------------------------- the worker

_worker_lock = threading.Lock()
_worker_busy = threading.Event()
_first: list[int] = []      # episodes someone is looking at: done before the rest


def kick(first: int | None = None) -> None:
    """Vowel whatever needs it, in the background (nothing happens without the model)."""
    if not installed():
        return
    with _worker_lock:
        if first is not None and first not in _first:
            _first.insert(0, first)
        if _worker_busy.is_set():
            return
        _worker_busy.set()
    threading.Thread(target=_work, name="vowels", daemon=True).start()


def _work() -> None:
    from . import sync

    made = 0
    tried: set[int] = set()
    try:
        while True:
            with _worker_lock:
                nxt = _first.pop(0) if _first else None
            if nxt is None:
                with db.session() as conn:
                    todo = [i for i in pending(conn) if i not in tried]
                if not todo:
                    break
                nxt = todo[0]
            if nxt in tried:
                continue
            tried.add(nxt)
            try:
                if vowel_episode(nxt):
                    made += 1
                    events.publish("vowels", {"episode_id": nxt})
                else:
                    tried.discard(nxt)  # its words changed while it was read: once more
            except Exception:
                log.exception("Couldn't add vowels to episode %s", nxt)
    finally:
        with _worker_lock:
            _worker_busy.clear()
            again = bool(_first)
        events.publish("vowels", status())  # (Settings: no longer "adding vowels")
        if made:
            sync.request()
        if again:
            kick()
