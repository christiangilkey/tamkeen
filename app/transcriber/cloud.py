"""Cloud transcription: a speech-to-text provider writes the transcript instead of this computer.

For people whose computer can't run the large Whisper model. The user brings their own key (as
for the AI word definitions) and pays the provider by the hour of audio. Both providers run
Whisper behind the same request format; web/js/stt.js is this file's twin for the phone and holds
the list of models and prices that Settings shows.

What is sent is not the whole file. The audio is already decoded here (16 kHz mono), so:
  1. the built-in speech detector (Silero VAD, the one faster-whisper uses) finds the stretches
     with speech in them. Silence and music are not sent: they cost money and are where Whisper
     invents words;
  2. the speech is packed into pieces of a few minutes, cut only where nobody is talking, and each
     piece goes up as a small MP3;
  3. the words come back with times inside the piece, which are moved back to where that speech
     really is in the episode.
"""

from __future__ import annotations

import io
import logging
import re
import threading
import time
import unicodedata
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

import httpx
import numpy as np

from .. import db, events, models_manager
from ..audio import SAMPLE_RATE
from ..languages import INITIAL_PROMPTS, whisper_code
from .base import Segment, TranscriptionCancelled, Word

log = logging.getLogger(__name__)

PROVIDERS: dict[str, dict[str, str]] = {
    "groq": {"label": "Groq", "url": "https://api.groq.com/openai/v1/audio/transcriptions", "default": "whisper-large-v3"},
    "openai": {"label": "OpenAI", "url": "https://api.openai.com/v1/audio/transcriptions", "default": "whisper-1"},
}

PIECE_SECONDS = 300          # speech per upload: a piece is closed at the first pause after this much
LONGEST_PIECE = 600          # ...and never runs past this, pause or not
GAP_SECONDS = 0.3            # quiet put between two stretches of speech inside a piece
MP3_BITRATE = 48_000         # 5 minutes = about 1.8 MB
ATTEMPTS = 4
LONGEST_WAIT = 20 * 60       # how long a "slow down" from the provider is waited out before giving up
USAGE_SETTING = "stt_usage"

_usage_lock = threading.Lock()


class CloudError(RuntimeError):
    """A failure worth showing to the user as it is."""

    def __init__(self, message: str, key_rejected: bool = False) -> None:
        super().__init__(message)
        self.key_rejected = key_rejected


def config(settings: dict[str, Any] | None = None) -> dict[str, str] | None:
    """{provider, key, model} when transcripts are to be written by a cloud provider, else None
    (not chosen, or no key to use it with)."""
    s = settings if settings is not None else db.get_settings()
    if s.get("stt_mode") != "cloud":
        return None
    # Off while a language with its own model is studied (Bisaya): no provider knows it. The choice
    # stays saved, for when another language is studied again (Settings says so: sttsetup.js).
    if models_manager.needs_own_model(s.get("study_language")):
        return None
    provider = s.get("stt_provider") if s.get("stt_provider") in PROVIDERS else "groq"
    # An OpenAI key entered for word definitions works for transcription too.
    key = str(s.get(f"stt_key_{provider}") or (s.get("llm_key_openai") if provider == "openai" else "") or "").strip()
    if not key:
        return None
    return {"provider": provider, "key": key, "model": str(s.get(f"stt_model_{provider}") or PROVIDERS[provider]["default"])}


# --------------------------------------------------------------------------- what goes up

@dataclass
class Piece:
    """One upload: stretches of the episode laid end to end. `parts` are (first sample, last
    sample) in the episode, in order."""
    parts: list[tuple[int, int]]

    @property
    def seconds(self) -> float:
        return sum(b - a for a, b in self.parts) / SAMPLE_RATE

    def audio(self, samples: np.ndarray) -> np.ndarray:
        gap = np.zeros(int(GAP_SECONDS * SAMPLE_RATE), dtype=np.float32)
        out: list[np.ndarray] = []
        for i, (a, b) in enumerate(self.parts):
            if i:
                out.append(gap)
            out.append(samples[a:b])
        return np.concatenate(out) if out else np.zeros(0, dtype=np.float32)

    def to_episode_time(self, t: float) -> float:
        """A time inside the piece's audio, as a time in the episode."""
        at = 0.0
        for i, (a, b) in enumerate(self.parts):
            length = (b - a) / SAMPLE_RATE
            if t <= at + length or i == len(self.parts) - 1:
                return a / SAMPLE_RATE + min(max(t - at, 0.0), length)
            at += length + GAP_SECONDS
            if t < at:  # in the quiet between two stretches: the start of the next one
                return self.parts[i + 1][0] / SAMPLE_RATE
        return 0.0


def speech_spans(samples: np.ndarray) -> list[tuple[int, int]]:
    """Where there is speech, as (first sample, last sample). Everything, if the detector can't run."""
    try:
        from faster_whisper.vad import VadOptions, get_speech_timestamps

        found = get_speech_timestamps(samples, VadOptions(min_silence_duration_ms=500))
        return [(int(s["start"]), int(s["end"])) for s in found if s["end"] > s["start"]]
    except Exception as exc:  # the detector is a convenience: without it the whole audio is sent
        log.warning("Speech detection unavailable (%s); sending all of the audio.", exc)
        return [(0, len(samples))] if len(samples) else []


def plan(spans: list[tuple[int, int]]) -> list[Piece]:
    """Pack stretches of speech into uploads of about PIECE_SECONDS, cutting only between stretches
    (so never mid-word), except for a single stretch longer than LONGEST_PIECE."""
    longest = LONGEST_PIECE * SAMPLE_RATE
    pieces: list[Piece] = []
    current: list[tuple[int, int]] = []
    held = 0
    for a, b in spans:
        while b - a > longest:  # someone talking for ten minutes without a pause
            if current:
                pieces.append(Piece(current))
                current, held = [], 0
            pieces.append(Piece([(a, a + longest)]))
            a += longest
        if current and held + (b - a) > longest:
            pieces.append(Piece(current))
            current, held = [], 0
        current.append((a, b))
        held += b - a
        if held >= PIECE_SECONDS * SAMPLE_RATE:
            pieces.append(Piece(current))
            current, held = [], 0
    if current:
        pieces.append(Piece(current))
    return pieces


def encode_mp3(samples: np.ndarray, bitrate: int = MP3_BITRATE) -> bytes:
    """16 kHz mono float samples as an MP3 file in memory (a format both providers take)."""
    import av

    pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with av.open(buf, "w", format="mp3") as out:
        stream = out.add_stream("libmp3lame", rate=SAMPLE_RATE, layout="mono")
        stream.bit_rate = bitrate
        resampler = av.AudioResampler(format="s16p", layout="mono", rate=SAMPLE_RATE)
        step = SAMPLE_RATE * 10
        for at in range(0, max(len(pcm), 1), step):
            block = pcm[at:at + step]
            if not len(block):
                break
            frame = av.AudioFrame.from_ndarray(block.reshape(1, -1), format="s16", layout="mono")
            frame.sample_rate = SAMPLE_RATE
            for f in resampler.resample(frame):
                f.pts = None
                for packet in stream.encode(f):
                    out.mux(packet)
        for f in resampler.resample(None):
            f.pts = None
            for packet in stream.encode(f):
                out.mux(packet)
        for packet in stream.encode(None):
            out.mux(packet)
    return buf.getvalue()


# --------------------------------------------------------------------------- what comes back

# Whisper names the language it heard in English ("arabic"); the app uses the short codes.
_LANGUAGE_CODES = {"arabic": "ar", "spanish": "es", "french": "fr", "japanese": "ja", "chinese": "zh", "mandarin": "zh",
                   "russian": "ru", "english": "en", "turkish": "tr", "persian": "fa", "urdu": "ur", "hindi": "hi",
                   "german": "de", "italian": "it", "portuguese": "pt", "korean": "ko", "hebrew": "he",
                   "indonesian": "id", "dutch": "nl", "tagalog": "tl", "filipino": "tl", "catalan": "ca",
                   "valencian": "ca", "thai": "th", "cebuano": "ceb", "bisaya": "ceb"}


def language_code(name: Any) -> str | None:
    n = str(name or "").strip().lower()
    if not n:
        return None
    return _LANGUAGE_CODES.get(n) or (n if re.fullmatch(r"[a-z]{2,3}", n) else None)


def _bare(text: Any) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKC", str(text or "")).lower() if ch.isalnum())


# Lines Whisper is known to make up over silence or music (subtitle credits it saw in training).
_INVENTED = {_bare(t) for t in (
    "ترجمة نانسي قنقر", "Sous-titres réalisés par la communauté d'Amara.org",
    "Subtítulos realizados por la comunidad de Amara.org", "Субтитры сделал DimaTorzok",
    "Субтитры создавал DimaTorzok", "字幕由Amara.org社区提供", "Subtitles by the Amara.org community",
    # ...and the sign-offs of videos, which it writes over a silent ending:
    "اشتركوا في القناة", "شكرا للمشاهدة", "شكرا على المشاهدة", "Thanks for watching!", "Thank you for watching.", "Merci d'avoir regardé cette vidéo !", "¡Gracias por ver el vídeo!", "Спасибо за просмотр!", "谢谢观看", "請不吝點贊訂閱轉發打賞支持明鏡與點點欄目")}


def _num(x: Any) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def parse(data: Any, to_time: Callable[[float], float] = lambda t: t) -> list[Segment]:
    """A provider's answer as segments with timed words (the twin of parseTranscription in
    web/js/stt.js). The answer lists the sentences, with punctuation, and separately every word
    with its times but without punctuation: each word is put in its sentence by its time, and takes
    the sentence's spelling of it whenever the two lists agree."""
    d = data if isinstance(data, dict) else {}
    words = [(_num(w.get("start")), max(_num(w.get("start")), _num(w.get("end"))), str(w.get("word") or w.get("text") or "").strip())
             for w in d.get("words") or [] if isinstance(w, dict)]
    words = [w for w in words if w[2]]
    segs = [s for s in d.get("segments") or [] if isinstance(s, dict) and str(s.get("text") or "").strip()]
    if not segs and str(d.get("text") or "").strip():
        segs = [{"start": words[0][0] if words else 0.0, "end": words[-1][1] if words else _num(d.get("duration")), "text": d["text"]}]
    out: list[Segment] = []
    w = 0
    for i, seg in enumerate(segs):
        start = _num(seg.get("start"))
        end = max(start, _num(seg.get("end")))
        mine = []
        last = i == len(segs) - 1
        while w < len(words) and (last or (words[w][0] + words[w][1]) / 2 < end):
            mine.append(words[w])
            w += 1
        if (_num(seg.get("no_speech_prob")) > 0.6 and _num(seg.get("avg_logprob")) < -1) or _bare(seg.get("text")) in _INVENTED:
            continue  # the provider itself doubts this was speech, or it is a known made-up line
        text = " ".join(str(seg["text"]).split())
        tokens = [t for t in text.split(" ") if _bare(t)]
        agree = len(tokens) == len(mine)
        out.append(Segment(to_time(start), to_time(end), text,
                           [Word(to_time(a), to_time(b), tokens[k] if agree else t) for k, (a, b, t) in enumerate(mine)]))
    return out


# --------------------------------------------------------------------------- sending

def _failure(provider: str, resp: httpx.Response) -> CloudError:
    name = PROVIDERS[provider]["label"]
    detail = ""
    try:
        err = resp.json().get("error")
        detail = str(err.get("message") if isinstance(err, dict) else err or "")[:200]
    except Exception:
        detail = resp.text[:200]
    status = resp.status_code
    if status in (401, 403):
        return CloudError(f"{name} rejected the API key. It has most likely expired, so you probably need a new one "
                          "(Settings → Cloud transcription).", key_rejected=True)
    if status == 413:
        return CloudError(f"That audio is too large for {name} to take in one piece.")
    if status == 404 or (status == 400 and "model" in detail.lower()):
        return CloudError(f"{name} doesn't recognise the chosen model. Set it back to the recommended one in Settings."
                          + (f" ({detail})" if detail else ""))
    if status == 402 or re.search(r"billing|quota|credit", detail, re.I):
        return CloudError(f"{name} says the account has no credit. Add some on its Billing page." + (f" ({detail})" if detail else ""))
    return CloudError(f"{name} couldn't transcribe this (error {status})" + (f": {detail}" if detail else "."))


def _pause(seconds: float, cancel: threading.Event | None) -> None:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if cancel is not None and cancel.is_set():
            raise TranscriptionCancelled()
        time.sleep(min(0.5, max(0.0, end - time.monotonic())))


def send(provider: str, key: str, model: str, audio: bytes, language: str | None = None,
         cancel: threading.Event | None = None, filename: str = "audio.mp3", mime: str = "audio/mpeg") -> dict[str, Any]:
    """Send one audio file and return the provider's answer. Waits out "slow down" answers and
    retries a dropped connection; anything else is raised as a CloudError."""
    fields: dict[str, Any] = {"model": model, "response_format": "verbose_json",
                              "timestamp_granularities[]": ["word", "segment"], "temperature": "0"}
    if language:
        fields["language"] = whisper_code(language)
        if INITIAL_PROMPTS.get(language):
            fields["prompt"] = INITIAL_PROMPTS[language]
    name = PROVIDERS[provider]["label"]
    waited = 0.0
    problem = ""
    for attempt in range(ATTEMPTS):
        if cancel is not None and cancel.is_set():
            raise TranscriptionCancelled()
        try:
            resp = httpx.post(PROVIDERS[provider]["url"], headers={"Authorization": f"Bearer {key}"}, data=fields,
                              files={"file": (filename, audio, mime)}, timeout=httpx.Timeout(300, connect=20))
        except httpx.HTTPError as exc:
            problem = f"Couldn't reach {name} ({exc.__class__.__name__}). Check your internet connection."
            _pause(3 * (attempt + 1), cancel)
            continue
        if resp.status_code == 200:
            try:
                return resp.json()
            except ValueError as exc:
                raise CloudError(f"{name} sent back something that isn't a transcript.") from exc
        if resp.status_code == 429:
            # The account's limit (free accounts: so much audio per hour). The answer says how long to wait.
            wait = _num(resp.headers.get("retry-after")) or 20.0
            if waited + wait > LONGEST_WAIT:
                raise CloudError(f"{name} says your account has reached its limit for now (it asks to wait about "
                                 f"{max(1, round(wait / 60))} minutes). Free accounts may only send so much audio per hour "
                                 "and per day. Press Retry later.")
            log.info("%s asked to wait %.0f s (limit reached)", name, wait)
            waited += wait
            _pause(wait + 1, cancel)
            problem = f"{name} kept asking the app to slow down."
            continue
        if resp.status_code >= 500:
            problem = f"{name} is having trouble (error {resp.status_code}). Try again in a little while."
            _pause(4 * (attempt + 1), cancel)
            continue
        raise _failure(provider, resp)
    raise CloudError(problem or f"{name} didn't answer.")


def usage() -> dict[str, Any]:
    """Audio sent today from this computer: {day, seconds, requests, by: {"provider:model": seconds}}."""
    day = time.strftime("%Y-%m-%d")
    saved = db.get_setting(USAGE_SETTING)
    if isinstance(saved, dict) and saved.get("day") == day:
        return {"day": day, "seconds": float(saved.get("seconds") or 0), "requests": int(saved.get("requests") or 0),
                "by": dict(saved.get("by") or {})}
    return {"day": day, "seconds": 0.0, "requests": 0, "by": {}}


def _count(provider: str, model: str, seconds: float) -> None:
    with _usage_lock:
        total = usage()
        total["seconds"] += seconds
        total["requests"] += 1
        total["by"][f"{provider}:{model}"] = float(total["by"].get(f"{provider}:{model}") or 0) + seconds
        db.set_settings({USAGE_SETTING: total})
    events.publish("stt", total)


class CloudTranscriber:
    """The same interface as the engines that run on this computer (see base.Transcriber)."""

    engine = "cloud"

    def __init__(self, provider: str, key: str, model: str) -> None:
        self.provider = provider
        self.key = key
        self.model_size = model  # the provider's name for its model
        self.device = provider   # "where it runs", for the label a transcript carries
        self.language: str | None = None  # what the provider heard, when it was left to tell

    def _run(self, audio: np.ndarray, cancel: threading.Event | None, language: str | None) -> Iterator[Segment]:
        self.language = None
        for piece in plan(speech_spans(audio)):
            if cancel is not None and cancel.is_set():
                raise TranscriptionCancelled()
            pcm = piece.audio(audio)
            data = send(self.provider, self.key, self.model_size, encode_mp3(pcm), language, cancel)
            _count(self.provider, self.model_size, len(pcm) / SAMPLE_RATE)
            if self.language is None:
                self.language = language_code(data.get("language"))
            yield from parse(data, piece.to_episode_time)

    def transcribe(self, audio: np.ndarray, cancel: threading.Event | None = None,
                   language: str = "ar") -> Iterator[Segment]:
        return self._run(audio, cancel, language)

    def transcribe_detecting(self, audio: np.ndarray, cancel: threading.Event | None = None) -> tuple[str | None, list[Segment]]:
        """Write the audio down in whatever language the provider hears: (its code, the segments).
        Used for reels, where the language has to be found out, not assumed."""
        segments = list(self._run(audio, cancel, None))
        return self.language, segments


def test(provider: str, key: str, model: str) -> float:
    """Try a key: send one second of silence. Returns how long the provider took, in seconds."""
    if provider not in PROVIDERS:
        raise CloudError("Unknown provider.")
    if not key.strip():
        raise CloudError("Paste an API key first.")
    started = time.monotonic()
    send(provider, key.strip(), model or PROVIDERS[provider]["default"], encode_mp3(np.zeros(SAMPLE_RATE, dtype=np.float32)), None)
    return time.monotonic() - started
