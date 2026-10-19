"""Whisper model downloads: resumable, checksum-verified, one at a time."""

from __future__ import annotations

import json
import logging
import shutil
import threading
import time
from pathlib import Path
from typing import Any

import httpx

from . import downloader, events, hardware, paths

log = logging.getLogger(__name__)

HF = "https://huggingface.co"

# User-facing sizes. "tiny" exists for smoke tests only.
SIZES = ["small", "medium", "large-v3"]

REPOS: dict[str, dict[str, str]] = {
    "faster-whisper": {
        "tiny": "Systran/faster-whisper-tiny",
        "small": "Systran/faster-whisper-small",
        "medium": "Systran/faster-whisper-medium",
        "large-v3": "Systran/faster-whisper-large-v3",
    },
    "mlx": {
        "tiny": "mlx-community/whisper-tiny-mlx",
        "small": "mlx-community/whisper-small-mlx",
        "medium": "mlx-community/whisper-medium-mlx",
        "large-v3": "mlx-community/whisper-large-v3-mlx",
    },
}

APPROX_MB = {"tiny": 75, "small": 485, "medium": 1530, "large-v3": 3090}
SKIP_FILES = {".gitattributes", "README.md"}

# Whisper models retrained for one language. Once downloaded, one is used instead of the chosen model
# whenever that language is transcribed on this computer. They are published for Hugging Face
# transformers, so the download is turned into faster-whisper's form here (transcriber/convert.py);
# faster-whisper only (no Mac version yet).
LANGUAGE_MODELS: dict[str, dict[str, Any]] = {
    # Whisper large-v3 retrained on Cebuano by BuzzASR (MIT licence): FLEURS character error 5.9%
    # against 15.4% before. Whisper has no Bisaya of its own, so it is still asked for Tagalog. On the
    # Bisaya podcast clips the opening prompt was tuned on (2026-10-19) it wrote twice the Bisaya-only
    # words (10% against 5%) and a third of the Tagalog-only ones (1.1% against 3.8%), and more of the
    # speech; the prompt (languages.INITIAL_PROMPTS) made no difference to it, so it goes without.
    # It writes fewer full stops and capitals than Whisper (its training text had few).
    "bisaya": {"language": "ceb", "repo": "BuzzASR/cebuano", "revision": "e8556a68988e515d9f2bab266e67f4b3dd6cc582",
               "files": {"config.json", "generation_config.json", "tokenizer.json", "preprocessor_config.json",
                         "model.safetensors"},
               "engines": {"faster-whisper"}, "approx_mb": 3090, "prompt": False},
}
APPROX_MB.update({name: m["approx_mb"] for name, m in LANGUAGE_MODELS.items()})

_lock = threading.Lock()
_cancel = threading.Event()
_state: dict[str, Any] = {"state": "idle", "size": None, "done": 0, "total": 0, "error": None}


class ModelError(RuntimeError):
    pass


def current_engine() -> str:
    return hardware.detect().engine


def model_dir(size: str, engine: str | None = None) -> Path:
    return paths.models_dir() / (engine or current_engine()) / size


def is_installed(size: str, engine: str | None = None) -> bool:
    return (model_dir(size, engine) / "manifest.json").exists()


def for_language(code: str | None, engine: str | None = None) -> str | None:
    """The downloaded model made for language `code` (see LANGUAGE_MODELS), if there is one."""
    engine = engine or current_engine()
    for name, m in LANGUAGE_MODELS.items():
        if m["language"] == code and engine in m["engines"] and is_installed(name, engine):
            return name
    return None


def list_models() -> list[dict[str, Any]]:
    engine = current_engine()
    out = []
    names = SIZES + [n for n, m in LANGUAGE_MODELS.items() if engine in m["engines"]]
    for size in names:
        d = model_dir(size, engine)
        installed = is_installed(size, engine)
        disk = sum(f.stat().st_size for f in d.rglob("*") if f.is_file()) if d.exists() else 0
        row = {"size": size, "engine": engine, "installed": installed, "approx_mb": APPROX_MB[size],
               "disk_mb": round(disk / 2**20), "partial": (not installed) and disk > 0}
        if size in LANGUAGE_MODELS:
            row["language"] = LANGUAGE_MODELS[size]["language"]
        out.append(row)
    return out


def status() -> dict[str, Any]:
    with _lock:
        return dict(_state)


def _set(**kw: Any) -> None:
    with _lock:
        _state.update(kw)
        snapshot = dict(_state)
    events.publish("model_download", snapshot)


def _file_list(repo: str, sha: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        if sha is None:
            info = client.get(f"{HF}/api/models/{repo}")
            info.raise_for_status()
            sha = info.json()["sha"]
        tree = client.get(f"{HF}/api/models/{repo}/tree/{sha}")
        tree.raise_for_status()
    files = [f for f in tree.json() if f.get("type") == "file" and f["path"] not in SKIP_FILES]
    return sha, files


def _download(size: str, engine: str) -> None:
    special = LANGUAGE_MODELS.get(size)
    repo = special["repo"] if special else REPOS[engine][size]
    final = model_dir(size, engine)
    # A language model's files arrive in a folder of their own and are converted into `final` afterwards.
    target = final / "download" if special else final
    try:
        _set(state="preparing", size=size, done=0, total=0, error=None)
        sha, files = _file_list(repo, special and special["revision"])
        if special:
            files = [f for f in files if f["path"] in special["files"]]
        total = sum(int(f["size"]) for f in files)
        target.mkdir(parents=True, exist_ok=True)
        _set(state="downloading", total=total)
        base = 0
        last_emit = 0.0
        for f in files:
            name = f["path"]
            size_bytes = int(f["size"])
            dest = target / name
            lfs = f.get("lfs") or {}
            if dest.exists() and dest.stat().st_size == size_bytes:
                base += size_bytes
                continue

            def prog(done: int, _total: int | None, base: int = base) -> None:
                nonlocal last_emit
                now = time.monotonic()
                if now - last_emit > 0.25:
                    last_emit = now
                    _set(done=base + done)

            downloader.download(
                f"{HF}/{repo}/resolve/{sha}/{name}", dest, prog,
                expected_sha256=lfs.get("oid"), expected_size=size_bytes, cancel=_cancel,
            )
            if not lfs and f.get("oid") and downloader.git_blob_sha1(dest) != f["oid"]:
                dest.unlink(missing_ok=True)
                raise downloader.DownloadError(f"Checksum mismatch for {name}. Please try again.")
            base += size_bytes
            _set(done=base)
        if special:
            from .transcriber import convert

            _set(state="converting")
            # Converted next to the download, then swapped in, so a failure leaves no half-made model.
            work = final / "converting"
            convert.convert(target, work)
            for f in work.iterdir():
                f.replace(final / f.name)
            shutil.rmtree(work, ignore_errors=True)
            shutil.rmtree(target, ignore_errors=True)
        (final / "manifest.json").write_text(json.dumps({"repo": repo, "revision": sha, "size": size,
                                                         "engine": engine, "installed_at": time.time()}))
        _set(state="done", done=total)
    except downloader.Cancelled:
        _set(state="idle", error=None)
    except Exception as exc:
        log.exception("Model download failed")
        _set(state="error", error=f"{exc}")


def start_download(size: str) -> dict[str, Any]:
    engine = current_engine()
    if size not in REPOS[engine] and engine not in LANGUAGE_MODELS.get(size, {}).get("engines", ()):
        raise ModelError(f"Unknown model size: {size}")
    with _lock:
        if _state["state"] in ("preparing", "downloading", "converting"):
            raise ModelError(f"Already downloading the {_state['size']} model.")
        _state.update(state="preparing", size=size, done=0, total=0, error=None)
    _cancel.clear()
    threading.Thread(target=_download, args=(size, engine), name=f"model-{size}", daemon=True).start()
    return status()


def download_blocking(size: str) -> None:
    """Used by the smoke test."""
    _cancel.clear()
    _download(size, current_engine())
    if _state["state"] == "error":
        raise ModelError(_state["error"])


def cancel_download() -> None:
    _cancel.set()


def delete(size: str) -> None:
    from . import transcriber

    transcriber.unload()
    shutil.rmtree(model_dir(size), ignore_errors=True)
