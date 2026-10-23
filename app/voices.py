"""Card voices made on this computer (Settings → Card voices → "My computer"; web/js/cardvoice.js).

A card typed in by hand or saved from a web page has no recording. With "My computer" chosen, this
computer says its word and sentence with a voice model downloaded here, on the CPU and offline, and
keeps the sound with the card exactly as the clip of a word a friend shared (clips/<uid>.ogg, the
card's `clip` and the times of the word and the sentence in it). The sync takes it to the user's other
devices (c_<uid>.ogg in Google Drive), which show "Waiting for your computer" until then. Each card's
voice is made once; a card with a recording of its own is never touched.

The engine is Piper (MIT licence; github.com/rhasspy/piper, release 2023.11.14-2), run as its own
program (piper.exe and its files, downloaded once into the models folder, ~21 MB) with one voice model
per language (huggingface.co/rhasspy/piper-voices). Piper turns text into sounds with eSpeak NG
(GPL-3.0), which comes inside Piper's download and runs as part of that separate program; Tamkeen only
starts it, so Tamkeen's own code stays MIT. The voices were chosen for licences that allow any use
(each voice's MODEL_CARD names its recordings' licence); voices whose recordings are licensed for
non-commercial use only (Piper's Hindi, Korean, Japanese and Thai ones, and the "ryan" family) are left
out, and so are ones whose licence is unknown where another exists. See HANDOFF.md "Card voices".
"""

from __future__ import annotations

import json
import logging
import os
import platform as _platform
import shutil
import subprocess
import sys
import tarfile
import threading
import time
import zipfile
from pathlib import Path
from typing import Any

import httpx
import numpy as np

from . import db, downloader, events, languages, paths

log = logging.getLogger(__name__)

HF = "https://huggingface.co"
VOICES_REPO = "rhasspy/piper-voices"
VOICES_REVISION = "5041a7a49ae5b3a0f30e6837769eb03fdbb231bd"  # piper-voices as checked on 2026-10-22

PIPER_RELEASE = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/"
# Piper's own program for each kind of computer: file, size, SHA-256 (measured 2026-10-22).
RUNTIMES: dict[str, tuple[str, int, str]] = {
    "windows-x64": ("piper_windows_amd64.zip", 22477236, "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea"),
    "mac-arm64": ("piper_macos_aarch64.tar.gz", 19146957, "6b1eb03b3735946cb35216e063e7eebcc33a6bbf5dd96ec0217959bf1cdcb0cc"),
    "mac-x64": ("piper_macos_x64.tar.gz", 19146927, "ced85c0a3df13945b1e623b878a48fdc2854d5c485b4b67f62857cf551deaf8b"),
    "linux-x64": ("piper_linux_x86_64.tar.gz", 26460462, "a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992"),
    "linux-arm64": ("piper_linux_aarch64.tar.gz", 26004717, "fea0fd2d87c54dbc7078d0f878289f404bd4d6eea6e7444a77835d1537ab88eb"),
}

# The voices offered per language, the usual one first. `licence` is the licence of the voice's
# recordings as its MODEL_CARD gives it; `note` says anything the learner should know. Most "medium"
# Piper voices were trained on top of Piper's English "lessac" voice, whose recordings are licensed
# for research; Piper publishes them under their own recordings' licence. Where a voice trained from
# scratch exists in good quality it is offered too ("from scratch").
VOICES: dict[str, list[dict[str, Any]]] = {
    "ar": [{"id": "ar_JO-kareem-medium", "name": "Kareem (Jordan)", "mb": 63, "licence": "not stated by its maker",
            "note": "Piper's only Arabic voice. Piper adds the vowel marks itself before speaking."}],
    "es": [{"id": "es_ES-davefx-medium", "name": "Davefx (Spain)", "mb": 63, "licence": "CC0"},
           {"id": "es_MX-ald-medium", "name": "Ald (Mexico)", "mb": 63, "licence": "Unlicense"}],
    "fr": [{"id": "fr_FR-siwis-medium", "name": "Siwis (France)", "mb": 63, "licence": "CC BY 4.0"},
           {"id": "fr_FR-mls-medium", "name": "MLS (France)", "mb": 77, "licence": "CC BY 4.0"}],
    "it": [{"id": "it_IT-serena-medium", "name": "Serena (Italy)", "mb": 64, "licence": "CC BY 4.0"}],
    "pt": [{"id": "pt_BR-faber-medium", "name": "Faber (Brazil)", "mb": 63, "licence": "CC0"}],
    "ca": [{"id": "ca_ES-upc_ona-medium", "name": "Ona (Catalonia)", "mb": 63, "licence": "CC BY-SA 3.0 ES"}],
    "ru": [{"id": "ru_RU-denis-medium", "name": "Denis (Russia)", "mb": 63, "licence": "CC0"}],
    "de": [{"id": "de_DE-thorsten-medium", "name": "Thorsten (Germany)", "mb": 63, "licence": "CC0"},
           {"id": "de_DE-mls-medium", "name": "MLS (Germany)", "mb": 77, "licence": "CC BY 4.0"}],
    "fa": [{"id": "fa_IR-amir-medium", "name": "Amir (Iran)", "mb": 64, "licence": "CC0"}],
    "en": [{"id": "en_US-ljspeech-medium", "name": "LJ (US)", "mb": 64, "licence": "public domain"},
           {"id": "en_GB-cori-medium", "name": "Cori (UK)", "mb": 64, "licence": "public domain"}],
}
# No voice here, and why (shown in Settings): only non-commercial Piper voices, or none at all.
NO_VOICE = {"hi": "noncommercial", "ko": "noncommercial", "ja": "noncommercial", "th": "noncommercial",
            "zh": "unclear", "tl": "none", "ceb": "none"}

# The silence round each part of a card's voice (seconds): the gap keeps the word and the sentence apart.
LEAD, GAP, TAIL = 0.06, 0.9, 0.35


class VoiceError(RuntimeError):
    pass


# ---------------------------------------------------------------- where things are

def runtime_kind() -> str | None:
    machine = _platform.machine().lower()
    arm = machine in ("arm64", "aarch64")
    if sys.platform == "win32":
        return None if arm else "windows-x64"
    if sys.platform == "darwin":
        return "mac-arm64" if arm else "mac-x64"
    if sys.platform.startswith("linux"):
        return "linux-arm64" if arm else "linux-x64"
    return None


def voices_dir() -> Path:
    path = paths.models_dir() / "voices"
    path.mkdir(parents=True, exist_ok=True)
    return path


def runtime_dir() -> Path:
    return voices_dir() / "piper"


def piper_exe() -> Path:
    return runtime_dir() / ("piper.exe" if sys.platform == "win32" else "piper")


def runtime_installed() -> bool:
    return (runtime_dir() / "installed.json").exists() and piper_exe().exists()


def voice_dir(voice_id: str) -> Path:
    return voices_dir() / voice_id


def voice_installed(voice_id: str) -> bool:
    return (voice_dir(voice_id) / "installed.json").exists()


def find_voice(voice_id: str) -> tuple[str, dict[str, Any]] | None:
    for lang, items in VOICES.items():
        for v in items:
            if v["id"] == voice_id:
                return lang, v
    return None


def _picked() -> dict[str, str]:
    try:
        raw = json.loads(db.get_setting("tts_local") or "{}")
        return raw if isinstance(raw, dict) else {}
    except (TypeError, ValueError):
        return {}


def voice_for(lang: str | None) -> str | None:
    """The downloaded voice used for language `lang`: the one picked here, else the first downloaded."""
    items = VOICES.get(lang or "", [])
    picked = _picked().get(lang or "")
    ready = [v["id"] for v in items if voice_installed(v["id"])]
    if picked in ready:
        return picked
    return ready[0] if ready else None


# ---------------------------------------------------------------- downloads (one at a time, like models_manager)

_lock = threading.Lock()
_cancel = threading.Event()
_state: dict[str, Any] = {"state": "idle", "voice": None, "done": 0, "total": 0, "error": None}


def status() -> dict[str, Any]:
    with _lock:
        return dict(_state)


def _set(**kw: Any) -> None:
    with _lock:
        _state.update(kw)
        snapshot = dict(_state)
    events.publish("voice_download", snapshot)


def _voice_files(voice_id: str) -> list[dict[str, Any]]:
    """The voice's files in the pinned piper-voices revision, with their sizes and checksums."""
    lang_code = voice_id.split("-")[0]           # ar_JO
    family = lang_code.split("_")[0]             # ar
    _, speaker, quality = voice_id.split("-", 2) if voice_id.count("-") == 2 else (None, None, None)
    if not speaker:
        raise VoiceError(f"Unknown voice: {voice_id}")
    folder = f"{family}/{lang_code}/{speaker}/{quality}"
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        r = client.get(f"{HF}/api/models/{VOICES_REPO}/tree/{VOICES_REVISION}/{folder}")
        r.raise_for_status()
    wanted = {f"{voice_id}.onnx", f"{voice_id}.onnx.json", "MODEL_CARD"}
    files = [f for f in r.json() if f.get("type") == "file" and f["path"].rsplit("/", 1)[-1] in wanted]
    if len([f for f in files if f["path"].endswith((".onnx", ".onnx.json"))]) != 2:
        raise VoiceError("This voice's files couldn't be found.")
    return files


def _install_runtime(kind: str, base: int, total: int, prog: Any) -> None:
    name, size, sha = RUNTIMES[kind]
    archive = voices_dir() / name
    downloader.download(PIPER_RELEASE + name, archive, lambda d, _t: prog(base + d), expected_sha256=sha,
                        expected_size=size, cancel=_cancel)
    work = voices_dir() / "piper-unpacking"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    if name.endswith(".zip"):
        with zipfile.ZipFile(archive) as z:
            z.extractall(work)
    else:
        with tarfile.open(archive) as t:
            t.extractall(work, filter="data")
    shutil.rmtree(runtime_dir(), ignore_errors=True)
    (work / "piper").replace(runtime_dir())
    shutil.rmtree(work, ignore_errors=True)
    archive.unlink(missing_ok=True)
    if sys.platform != "win32":
        piper_exe().chmod(0o755)
    (runtime_dir() / "installed.json").write_text(json.dumps({"file": name, "installed_at": time.time()}))


def _download(voice_id: str) -> None:
    try:
        _set(state="preparing", voice=voice_id, done=0, total=0, error=None)
        kind = runtime_kind()
        if kind is None:
            raise VoiceError("Voices on this computer need Windows (64-bit Intel or AMD), a Mac or Linux.")
        files = _voice_files(voice_id)
        need_runtime = not runtime_installed()
        total = sum(int(f["size"]) for f in files) + (RUNTIMES[kind][1] if need_runtime else 0)
        _set(state="downloading", total=total)
        last = [0.0]

        def prog(done: int) -> None:
            now = time.monotonic()
            if now - last[0] > 0.25:
                last[0] = now
                _set(done=done)

        base = 0
        if need_runtime:
            _install_runtime(kind, 0, total, prog)
            base = RUNTIMES[kind][1]
        target = voice_dir(voice_id)
        target.mkdir(parents=True, exist_ok=True)
        for f in files:
            dest = target / f["path"].rsplit("/", 1)[-1]
            size = int(f["size"])
            lfs = f.get("lfs") or {}
            if not (dest.exists() and dest.stat().st_size == size):
                downloader.download(f"{HF}/{VOICES_REPO}/resolve/{VOICES_REVISION}/{f['path']}", dest,
                                    lambda d, _t, b=base: prog(b + d), expected_sha256=lfs.get("oid"),
                                    expected_size=size, cancel=_cancel)
                if not lfs and f.get("oid") and downloader.git_blob_sha1(dest) != f["oid"]:
                    dest.unlink(missing_ok=True)
                    raise VoiceError(f"Checksum mismatch for {dest.name}. Please try again.")
            base += size
            _set(done=base)
        (target / "installed.json").write_text(json.dumps({"voice": voice_id, "revision": VOICES_REVISION,
                                                           "installed_at": time.time()}))
        _set(state="done", done=total)
        worker.kick()
    except downloader.Cancelled:
        _set(state="idle", error=None)
    except Exception as exc:
        log.exception("Voice download failed")
        _set(state="error", error=f"{exc}")


def start_download(voice_id: str) -> dict[str, Any]:
    if find_voice(voice_id) is None:
        raise VoiceError(f"Unknown voice: {voice_id}")
    with _lock:
        if _state["state"] in ("preparing", "downloading"):
            raise VoiceError("A voice is already downloading.")
        _state.update(state="preparing", voice=voice_id, done=0, total=0, error=None)
    _cancel.clear()
    threading.Thread(target=_download, args=(voice_id,), name=f"voice-{voice_id}", daemon=True).start()
    return status()


def download_blocking(voice_id: str) -> None:
    """For tests and the smoke check."""
    _cancel.clear()
    _download(voice_id)
    if _state["state"] == "error":
        raise VoiceError(_state["error"])


def cancel_download() -> None:
    _cancel.set()


def delete(voice_id: str) -> None:
    if find_voice(voice_id) is None:
        raise VoiceError(f"Unknown voice: {voice_id}")
    shutil.rmtree(voice_dir(voice_id), ignore_errors=True)


# ---------------------------------------------------------------- speaking

def _config(voice_id: str) -> dict[str, Any]:
    return json.loads((voice_dir(voice_id) / f"{voice_id}.onnx.json").read_text(encoding="utf-8"))


def synth(text: str, voice_id: str) -> tuple[np.ndarray, int]:
    """`text` said by the voice: (16-bit samples, sample rate). Piper runs as its own program."""
    if not runtime_installed() or not voice_installed(voice_id):
        raise VoiceError("This voice isn't downloaded on this computer.")
    rate = int(_config(voice_id).get("audio", {}).get("sample_rate") or 22050)
    model = voice_dir(voice_id) / f"{voice_id}.onnx"
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0  # no console window flashing up
    line = " ".join(str(text).split())
    try:
        out = subprocess.run([str(piper_exe()), "--model", str(model), "--output_raw", "--quiet"],
                             input=(line + "\n").encode("utf-8"), capture_output=True, timeout=120,
                             cwd=str(runtime_dir()), creationflags=flags)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise VoiceError(f"The voice program couldn't run ({exc.__class__.__name__}).") from exc
    if out.returncode != 0 or len(out.stdout) < 200:
        tail = (out.stderr or b"").decode("utf-8", "replace").strip().splitlines()[-1:] or [""]
        raise VoiceError(f"The voice program failed: {tail[0][:200]}")
    pcm = np.frombuffer(out.stdout[: len(out.stdout) // 2 * 2], dtype="<i2")
    return pcm, rate


def _trim(pcm: np.ndarray, rate: int, floor: int = 300) -> np.ndarray:
    """The speech without the silence the voice leaves before and after it."""
    loud = np.flatnonzero(np.abs(pcm.astype(np.int32)) > floor)
    if not len(loud):
        return pcm
    pad = int(0.03 * rate)
    return pcm[max(0, loud[0] - pad): loud[-1] + pad]


def card_audio(word: str, sentence: str, voice_id: str) -> tuple[bytes, dict[str, float | None]]:
    """A card's voice: the word, a pause, then the sentence, as Ogg Opus, and where each is in it."""
    from . import audio

    w, rate = synth(word, voice_id)
    w = _trim(w, rate)
    parts = [np.zeros(int(LEAD * rate), np.int16), w]
    times: dict[str, float | None] = {"start": round(LEAD, 3), "end": round(LEAD + len(w) / rate, 3),
                                      "sent_start": None, "sent_end": None}
    if sentence:
        s, _ = synth(sentence, voice_id)
        s = _trim(s, rate)
        parts += [np.zeros(int(GAP * rate), np.int16), s]
        begin = LEAD + (len(w) + int(GAP * rate)) / rate
        times.update(sent_start=round(begin, 3), sent_end=round(begin + len(s) / rate, 3))
    parts.append(np.zeros(int(TAIL * rate), np.int16))
    return audio.encode_pcm_opus(np.concatenate(parts), rate), times


# ---------------------------------------------------------------- cards

def _clean(s: Any) -> str:
    return " ".join(str(s or "").replace("⟦", "").replace("⟧", "").split())


def voice_text(row: Any) -> tuple[str, str]:
    """What is said for a card: the word, and the part of its sentence a card shows (web/js/cardtext.js
    keeps it to about 110 characters; here the whole sentence is kept when short, else the clause
    with the word, so the twin rule stays simple)."""
    word = _clean(row["text"])
    sentence = _clean(row["sentence"])
    if len(sentence) > 160:
        sentence = _around(sentence, word)
    return word, ("" if sentence == word else sentence)


def _around(sentence: str, word: str, limit: int = 140) -> str:
    at = sentence.find(word) if word else -1
    if at < 0:
        at = 0
    start = max(0, at - limit // 2)
    end = min(len(sentence), start + limit)
    piece = sentence[start:end]
    if start > 0 and " " in piece:
        piece = piece.split(" ", 1)[1]
    if end < len(sentence) and " " in piece:
        piece = piece.rsplit(" ", 1)[0]
    return piece.strip()


# Kinds of episode whose sound the Vocab page and the review card can't load (web/js/cardvoice.js
# NO_AUDIO_KINDS, the twin: tests check the two agree). A word saved from one of them needs a voice.
NO_AUDIO_KINDS = ("video/youtube", "video/netflix", "video/instagram", "text/html", "text/book", "missing")

_KINDS_SQL = ", ".join(f"'{k}'" for k in NO_AUDIO_KINDS)
# A card needs a voice when it has no friend's clip, no voice yet, a word, and no moment in an episode
# with a real sound file (a deleted episode counts as none).
NEEDS_VOICE = (f"v.deleted = 0 AND v.clip = 0 AND v.voice = '' AND TRIM(v.text) <> '' AND (v.episode_id IS NULL "
               f"OR v.start IS NULL OR e.id IS NULL OR e.deleted = 1 OR COALESCE(e.audio_type, '') IN ({_KINDS_SQL}))")
_FROM = "FROM vocab v LEFT JOIN episodes e ON e.id = v.episode_id"


def needs_voice(vocab_id: int) -> bool:
    with db.session() as conn:
        return conn.execute(f"SELECT 1 {_FROM} WHERE v.id = ? AND {NEEDS_VOICE}", (vocab_id,)).fetchone() is not None


def waiting() -> dict[str, Any]:
    """Cards still without a voice, by language, and how many of them this computer can say now."""
    with db.session() as conn:
        rows = conn.execute(f"SELECT v.language AS language, COUNT(*) AS n {_FROM} WHERE {NEEDS_VOICE} "
                            "GROUP BY v.language").fetchall()
    langs = {(r["language"] or ""): r["n"] for r in rows}
    ready = sum(n for lang, n in langs.items() if voice_for(lang))
    return {"langs": langs, "ready": ready, "total": sum(langs.values())}


def make_for(vocab_id: int) -> dict[str, Any]:
    """Give one card its voice now (if it still needs one). Returns the card as stored."""
    from . import sync
    from .sync import engine

    with db.session() as conn:
        row = conn.execute("SELECT * FROM vocab WHERE id = ? AND deleted = 0", (vocab_id,)).fetchone()
    if row is None:
        raise VoiceError("Not found.")
    if not needs_voice(vocab_id):
        return dict(row)  # it has audio of its own, or its voice already: made once, never again
    lang = row["language"] or languages.study()
    voice = voice_for(lang)
    if voice is None:
        name = languages.LANGUAGES.get(lang, lang)
        raise VoiceError(f"No {name} voice is downloaded on this computer (Settings → Card voices).")
    word, sentence = voice_text(row)
    if not word:
        raise VoiceError("This card has no word to say.")
    data, times = card_audio(word, sentence, voice)
    dest = engine.clip_path(row["uid"])
    tmp = dest.with_name(dest.name + ".part")
    tmp.write_bytes(data)
    os.replace(tmp, dest)
    with db.session() as conn:
        # Only if nothing gave it a voice meanwhile (another device's, a friend's clip).
        conn.execute("UPDATE vocab SET voice = ? WHERE id = ? AND clip = 0 AND voice = ''", (json.dumps(times), vocab_id))
        out = conn.execute("SELECT * FROM vocab WHERE id = ?", (vocab_id,)).fetchone()
    events.publish("voices", {"made": row["uid"]})
    sync.request(20)
    return dict(out)


def mode() -> str:
    m = db.get_setting("tts_mode")
    return m if m in ("device", "azure", "computer") else "device"


class Worker:
    """With "My computer" chosen, makes the voice of every card that needs one and whose language has a
    downloaded voice, one at a time, in the background (cards added on the phone included, once they
    have synced here). Woken when something may have changed; also looks every minute."""

    def __init__(self) -> None:
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.failed: dict[int, float] = {}  # card id -> when it last failed (tried again after an hour)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="card-voices", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()

    def kick(self) -> None:
        self._wake.set()

    def next_card(self) -> int | None:
        with db.session() as conn:
            rows = conn.execute(f"SELECT v.id AS id, v.language AS language {_FROM} WHERE {NEEDS_VOICE} "
                                "ORDER BY v.created_at DESC").fetchall()
        now = time.time()
        for r in rows:
            if now - self.failed.get(r["id"], 0) < 3600:
                continue
            if voice_for(r["language"] or languages.study()):
                return int(r["id"])
        return None

    def run_once(self) -> int:
        """Make every voice that can be made now. Returns how many were made."""
        made = 0
        while not self._stop.is_set() and mode() == "computer":
            vid = self.next_card()
            if vid is None:
                break
            try:
                make_for(vid)
                made += 1
            except Exception as exc:
                log.warning("Couldn't make the voice of card %s: %s", vid, exc)
                self.failed[vid] = time.time()
        return made

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                if mode() == "computer" and runtime_installed():
                    self.run_once()
            except Exception:
                log.exception("Card voices worker")
            self._wake.wait(60)
            self._wake.clear()


worker = Worker()


def summary() -> dict[str, Any]:
    """Everything Settings → Card voices shows on the computer."""
    kind = runtime_kind()
    out_langs: dict[str, Any] = {}
    for lang, items in VOICES.items():
        out_langs[lang] = {"voice": voice_for(lang),
                           "voices": [{**v, "installed": voice_installed(v["id"])} for v in items]}
    runtime_mb = round(RUNTIMES[kind][1] / 1e6) if kind else None
    return {"mode": mode(), "supported": kind is not None, "runtime": {"installed": runtime_installed(), "mb": runtime_mb},
            "languages": out_langs, "none": NO_VOICE, "download": status(), "waiting": waiting()}


def sample(lang: str, text: str) -> bytes:
    """A few words in the language's voice (the "Play a sample" button)."""
    from . import audio

    voice = voice_for(lang)
    if voice is None or not text:
        raise VoiceError("Download this language's voice first.")
    pcm, rate = synth(text[:200], voice)
    return audio.encode_pcm_opus(np.concatenate([_trim(pcm, rate), np.zeros(int(0.2 * rate), np.int16)]), rate)

