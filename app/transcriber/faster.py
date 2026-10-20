"""faster-whisper (CTranslate2) engine for CPU and NVIDIA CUDA."""

from __future__ import annotations

import logging
import os
import threading
from collections.abc import Iterable, Iterator
from pathlib import Path

import numpy as np

from .base import Segment, TranscriptionCancelled, Word
from ..languages import INITIAL_PROMPTS, whisper_code

log = logging.getLogger(__name__)


class FasterWhisperTranscriber:
    engine = "faster-whisper"

    def __init__(self, model_path: Path, model_size: str, device: str, beam_size: int = 5, prompt: bool = True) -> None:
        from faster_whisper import WhisperModel

        self.model_size = model_size
        self.beam_size = beam_size
        self.prompt = prompt  # False for a model retrained on its language, which needs no steering
        from .. import models_manager

        # A retrained model that can make words up (the Thai one) has them cut: trim_invented below.
        self.trim = bool(models_manager.LANGUAGE_MODELS.get(model_size, {}).get("trim"))
        if device == "cuda":
            try:
                self.model = WhisperModel(str(model_path), device="cuda", compute_type="float16")
                self.device = "cuda"
                return
            except Exception as exc:  # missing/broken CUDA libs, unsupported GPU, out of VRAM
                log.warning("CUDA unavailable (%s); falling back to CPU.", exc)
        threads = max(1, (os.cpu_count() or 4) - 1)
        self.model = WhisperModel(str(model_path), device="cpu", compute_type="int8", cpu_threads=threads)
        self.device = "cpu"

    def transcribe(self, audio: np.ndarray, cancel: threading.Event | None = None,
                   language: str = "ar") -> Iterator[Segment]:
        segments, _info = self.model.transcribe(
            audio,
            language=whisper_code(language),
            initial_prompt=INITIAL_PROMPTS.get(language) if self.prompt else None,
            task="transcribe",
            beam_size=self.beam_size,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            # Prevents the repetition loops Whisper can fall into after music or long pauses.
            # (hallucination_silence_threshold was tried too: it nearly doubles runtime and VAD
            # already removes the silence it targets.)
            condition_on_previous_text=False,
        )

        def converted() -> Iterator[Segment]:
            for seg in segments:  # lazy generator: decoding happens as we iterate
                if cancel is not None and cancel.is_set():
                    raise TranscriptionCancelled()
                words = [Word(float(w.start), float(w.end), w.word.strip(), float(w.probability))
                         for w in (seg.words or []) if w.word.strip()]
                line = Segment(float(seg.start), float(seg.end), seg.text.strip(), words)
                yield trim_invented(line) if self.trim else line

        return regroup(converted())


def _letters(text: str) -> str:
    return "".join(text.split())


# ---------- words a retrained model made up (models_manager.LANGUAGE_MODELS "trim") ----------
PILE_LETTERS = 8      # letters in a pile of invented words, at least
PILE_RATE = 40.0      # letters a second: real speech runs at 10-20, an invented pile at hundreds
PIECE_LONG = 0.04     # seconds: a piece longer than this was really said
MAX_PHRASE = 20       # pieces in a phrase said over and over, at most


def _pile_start(words: list[Word]) -> int:
    """Where the pile of invented words at the end of a line starts (len(words) if there is none)."""
    i = len(words)
    while i > 0 and words[i - 1].end - words[i - 1].start < PIECE_LONG:
        i -= 1
    run = words[i:]
    letters = sum(len(w.text) for w in run)
    if letters < PILE_LETTERS or letters / max(run[-1].end - run[0].start, 0.01) < PILE_RATE:
        return len(words)
    if i > 0 and words[i - 1].text.isascii() and words[i - 1].text.isalpha():
        i -= 1  # a Latin word often leads the pile in
    return i


def _loops(words: list[Word]) -> list[bool]:
    """Which words to keep when a phrase is said over and over: once is kept. A short phrase (three
    letters or fewer, like ใช่) has to come five times in a row before it counts, a longer one three."""
    keep = [True] * len(words)
    texts = [w.text for w in words]
    i = 0
    while i < len(texts):
        for p in range(1, MAX_PHRASE + 1):
            phrase = texts[i:i + p]
            if len(phrase) < p:
                break
            k = 1
            while texts[i + k * p:i + (k + 1) * p] == phrase:
                k += 1
            need = 5 if len("".join(phrase)) <= 3 else 3
            if k >= need and len("".join(phrase)) >= 2:
                for j in range(i + p, i + k * p):
                    keep[j] = False
                # a half phrase left at the end of the loop goes too
                rest = i + k * p
                while rest < len(texts) and rest - (i + k * p) < p and texts[rest] == phrase[rest - (i + k * p)]:
                    keep[rest] = False
                    rest += 1
                i = rest - 1
                break
        i += 1
    return keep


def _text_of(text: str, words: list[Word], keep: list[bool]) -> str:
    """`text` without the letters of the words not kept (its spaces as they were), or the kept words
    joined when the text and the words don't spell the same letters."""
    if _letters(text) != "".join(w.text for w in words):
        return "".join(w.text for w, k in zip(words, keep) if k)
    owner = [j for j, w in enumerate(words) for _ in w.text]
    out, c = [], 0
    for ch in text:
        if ch.isspace():
            if out and out[-1] != " ":
                out.append(" ")
            continue
        if keep[owner[c]]:
            out.append(ch)
        c += 1
    return "".join(out).strip()


def trim_invented(seg: Segment) -> Segment:
    """Drop what the Thai model makes up, keeping the line's text in step with its words.

    After a clip that ends in silence, Typhoon (models_manager.LANGUAGE_MODELS) can finish the real
    sentence and then go on with invented words: they come with next to no length, piled at the end of the
    line, far faster than anyone speaks (a Latin word often leads them in). And now and then it says one
    phrase over and over. The pile is cut, and a phrase said over and over is kept once."""
    words = list(seg.words)
    if not words:
        return seg
    keep = [True] * len(words)
    for j in range(_pile_start(words), len(words)):
        keep[j] = False
    kept = [w for w, k in zip(words, keep) if k]
    loop_keep = _loops(kept)
    if all(keep) and all(loop_keep):
        return seg
    it = iter(loop_keep)
    keep = [k and next(it) for k in keep]
    text = _text_of(seg.text, words, keep)
    kept = [w for w, k in zip(words, keep) if k]
    return Segment(seg.start, kept[-1].end if kept else seg.start, text, kept)


def regroup(segments: Iterable[Segment], limit: int = 30) -> Iterator[Segment]:
    """Put each word back in the line its text belongs to.

    When a line starts without a space (the Bisaya model, retrained on text without timings, often
    does), faster-whisper glues its first word onto the line before ("walking" + "unya" =
    "walkingunya") and from there files every word one line early, though the words' times and the
    lines' text are right. Lines are held until their words and text have the same letters again,
    then the words are shared out by each line's text, a glued word cut where the line ends."""
    held: list[Segment] = []
    text = words = ""
    for seg in segments:
        held.append(seg)
        text += _letters(seg.text)
        words += "".join(w.text for w in seg.words)
        if text == words or len(held) >= limit:
            if text == words and len(held) > 1:
                _share_out(held)
            yield from held
            held, text, words = [], "", ""
    yield from held  # never matched up: as faster-whisper gave them


def _share_out(held: list[Segment]) -> None:
    words = [w for seg in held for w in seg.words]
    new: list[list[Word]] = []
    i, carry = 0, None
    for seg in held:
        need, got = len(_letters(seg.text)), []
        while need > 0 and (carry is not None or i < len(words)):
            if carry is not None:
                w, carry = carry, None
            else:
                w, i = words[i], i + 1
            if len(w.text) <= need:
                got.append(w)
                need -= len(w.text)
            else:  # glued across the line break: the first `need` letters stay on this line
                cut = w.start + (w.end - w.start) * need / len(w.text)
                got.append(Word(w.start, cut, w.text[:need], w.prob))
                carry = Word(cut, w.end, w.text[need:], w.prob)
                need = 0
        new.append(got)
    # Only when every line's words now spell its text exactly.
    if any("".join(w.text for w in got) != _letters(seg.text) for seg, got in zip(held, new)):
        return
    for seg, got in zip(held, new):
        seg.words = got
        if got:
            seg.start, seg.end = got[0].start, got[-1].end
