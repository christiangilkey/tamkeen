"""Transcriber factory. The rest of the app only uses :func:`get` and the base types."""

from __future__ import annotations

import logging
import threading

from .. import db, gpu_libs, hardware, models_manager
from . import cloud
from .base import Segment, Transcriber, TranscriptionCancelled, Word

log = logging.getLogger(__name__)

__all__ = ["Segment", "Word", "Transcriber", "TranscriptionCancelled", "get", "unload", "NoModelError"]

_lock = threading.Lock()
_current: Transcriber | None = None
_key: tuple[str, str, str] | None = None


class NoModelError(RuntimeError):
    pass


def get(model_size: str | None = None, language: str | None = None) -> Transcriber:
    """Return a loaded transcriber for the configured model, (re)loading if settings changed. For a
    `language` with a model of its own on this computer (models_manager.LANGUAGE_MODELS), that one."""
    global _current, _key
    remote = None if model_size else cloud.config()
    if remote is not None and language and models_manager.for_language(language, hardware.detect().engine):
        # A model made for this language (Bisaya) writes it far better than any cloud provider, which
        # doesn't know the language: it wins even when cloud transcription is on.
        remote = None
    if remote is not None:
        # A cloud provider writes the transcripts (Settings → Cloud transcription): no model on this computer is needed.
        key = ("cloud", remote["provider"], remote["model"] + "\n" + remote["key"])
        with _lock:
            if _current is None or _key != key:
                log.info("Transcribing with %s (%s)", remote["provider"], remote["model"])
                _current = cloud.CloudTranscriber(remote["provider"], remote["key"], remote["model"])
                _key = key
            return _current
    hw = hardware.detect()
    engine = hw.engine
    size = model_size or models_manager.for_language(language, engine) or db.get_setting("model_size")
    if not size:
        raise NoModelError("No transcription model selected yet. Open Settings → Model to download one, "
                           "or turn on cloud transcription there.")
    if not models_manager.is_installed(size, engine):
        raise NoModelError(f"The {size} model isn't downloaded yet. Open Settings → Model to download it.")
    device = hw.device
    key = (engine, size, device)
    with _lock:
        if _current is not None and _key == key:
            return _current
        _current = None
        path = models_manager.model_dir(size, engine)
        log.info("Loading %s model %s on %s", engine, size, device)
        if engine == "mlx":
            from .mlx import MlxTranscriber

            _current = MlxTranscriber(path, size)
        else:
            if device == "cuda":
                gpu_libs.load()
            from .faster import FasterWhisperTranscriber

            prompt = models_manager.LANGUAGE_MODELS.get(size, {}).get("prompt", True)
            _current = FasterWhisperTranscriber(path, size, device, beam_size=int(db.get_setting("beam_size") or 5),
                                                prompt=prompt)
        _key = key
        return _current


def unload() -> None:
    global _current, _key
    with _lock:
        _current = None
        _key = None
