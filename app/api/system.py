"""Settings, hardware/models, GPU pack, backups, updates, about, and the SSE stream."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel

from .. import aikeys, applink, audio, backup, db, events, gpu_libs, hardware, languages, models_manager, notify, paths, sync, transcriber, updates
from ..version import APP_NAME, GITHUB_REPO, __version__

router = APIRouter(tags=["system"])

ALLOWED_SETTINGS = {"model_size", "delete_audio_after", "stream_from_source", "theme", "font_size",
                    "welcome_seen", "beam_size", *db.DEFAULT_SETTINGS.keys()} - {"stt_usage"}


@router.get("/events")
async def sse() -> StreamingResponse:
    return StreamingResponse(events.stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/status")
def status() -> dict[str, Any]:
    ok, ffmpeg_msg = audio.check_ffmpeg()
    settings = db.get_settings()
    hw = hardware.detect()
    size = settings.get("model_size")
    own = models_manager.for_language(languages.study())  # e.g. the Bisaya model, for a Bisaya learner
    return {
        "version": __version__,
        "app_name": APP_NAME,
        "ffmpeg_ok": ok,
        "ffmpeg_message": ffmpeg_msg,
        "settings": settings,
        "hardware": hw.to_dict(),
        # Ready to transcribe: a model on this computer, or a cloud provider set up to do it instead.
        "model_ready": (bool(size) and models_manager.is_installed(size)) or bool(own)
                       or transcriber.cloud.config(settings) is not None,
        "local_model_ready": (bool(size) and models_manager.is_installed(size)) or bool(own),
        "data_dir": str(paths.data_dir()),
        "desktop": os.environ.get("APS_DESKTOP") == "1",
    }


class NotifyIn(BaseModel):
    title: str = ""
    text: str = ""
    friend: str = ""  # a chat message's sender: clicking the notification opens that chat


@router.post("/notify")
def show_notification(body: NotifyIn) -> dict[str, Any]:
    """The system's notification for a friend's chat message (web/js/chatnotify.js asks while the
    window isn't on screen; app/notify.py shows it)."""
    link = f"tamkeen://chat/{body.friend}" if applink.parse_chat(f"tamkeen://chat/{body.friend}") else ""
    return {"shown": notify.show(body.title, body.text, link)}


@router.get("/settings")
def get_settings() -> dict[str, Any]:
    return db.get_settings()


@router.patch("/settings")
def patch_settings(values: dict[str, Any]) -> dict[str, Any]:
    clean = {k: v for k, v in values.items() if k in ALLOWED_SETTINGS}
    if clean.get("model_size") is not None and clean["model_size"] not in models_manager.SIZES:
        raise HTTPException(400, "Unknown model size.")
    if "study_language" in clean and not languages.valid(clean["study_language"]):
        raise HTTPException(400, "Unknown language.")
    # How tapped words are explained (web/js/definer.js DEFINER_MODES).
    if "definer_mode" in clean and clean["definer_mode"] not in ("ai", "dictionary", "dictionary_first"):
        raise HTTPException(400, "Unknown way of explaining words.")
    if "youtube_follows" in clean:
        from .. import youtube

        clean["youtube_follows"] = youtube.clean_follows(clean["youtube_follows"])
    if "browser_sites" in clean:
        from .. import pages

        clean["browser_sites"] = pages.clean_sites(clean["browser_sites"])
    # A changed AI key notes when, so it wins over older copies on the user's other devices.
    clean = aikeys.stamp(db.get_settings(), clean, time.time())
    result = db.set_settings(clean)
    if aikeys.TIMES in clean:
        sync.request(5)  # the key reaches the user's other devices
    if "youtube_follows" in clean or "browser_sites" in clean:
        sync.request(30)  # followed channels and saved sites reach the user's other devices
    if "game_state" in clean:
        sync.request(90)  # the creature reaches the user's other devices once they stop studying
    if "model_size" in clean or "beam_size" in clean or any(k.startswith("stt_") for k in clean):
        transcriber.unload()
    if "welcome_seen" in clean or "onboarded" in clean:
        from .. import reset

        if reset.maybe_restore():  # after Reset Tamkeen: the first-run screens are done, the library comes back
            result = db.get_settings()
    return result


@router.post("/reset")
def reset_tamkeen() -> dict[str, Any]:
    """Settings → Reset Tamkeen (app/reset.py): first-run again, the library set aside until sign-in."""
    from .. import reset

    return reset.reset()


class SttTestIn(BaseModel):
    provider: str
    key: str = ""
    model: str = ""


@router.post("/stt/test")
def stt_test(body: SttTestIn) -> dict[str, Any]:
    """Try a cloud transcription key by sending one second of silence with it."""
    key = body.key.strip()
    if not key and body.provider == "openai":  # the key entered for word definitions works here too
        key = str(db.get_setting("llm_key_openai") or "")
    try:
        return {"ok": True, "seconds": round(transcriber.cloud.test(body.provider, key, body.model), 2)}
    except transcriber.cloud.CloudError as exc:
        return {"ok": False, "message": str(exc), "key_rejected": exc.key_rejected}


@router.get("/stt/usage")
def stt_usage() -> dict[str, Any]:
    """Audio sent to the cloud provider today from this computer."""
    return transcriber.cloud.usage()


@router.get("/hardware")
def get_hardware() -> dict[str, Any]:
    return hardware.detect().to_dict()


@router.get("/models")
def list_models() -> dict[str, Any]:
    return {"models": models_manager.list_models(), "download": models_manager.status(),
            "selected": db.get_setting("model_size"), "study_language": languages.study()}


@router.post("/models/{size}/download")
def download_model(size: str) -> dict[str, Any]:
    try:
        return models_manager.start_download(size)
    except models_manager.ModelError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/models/cancel")
def cancel_model_download() -> dict[str, bool]:
    models_manager.cancel_download()
    return {"ok": True}


@router.delete("/models/{size}")
def delete_model(size: str) -> dict[str, bool]:
    if size not in models_manager.SIZES and size not in models_manager.LANGUAGE_MODELS:
        raise HTTPException(400, "Unknown model size.")
    models_manager.delete(size)
    return {"ok": True}


@router.get("/gpu")
def gpu_status() -> dict[str, Any]:
    return gpu_libs.status()


@router.post("/gpu/install")
def gpu_install() -> dict[str, Any]:
    try:
        return gpu_libs.start_install()
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/gpu")
def gpu_uninstall() -> dict[str, Any]:
    deferred = gpu_libs.uninstall()
    transcriber.unload()
    return {"ok": True, "restart_required": deferred}


def _open_path(path: Path) -> None:
    if sys.platform == "win32":
        os.startfile(str(path))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


@router.post("/system/open-data-folder")
def open_data_folder() -> dict[str, Any]:
    try:
        _open_path(paths.data_dir())
    except Exception as exc:
        raise HTTPException(500, f"Couldn't open the folder: {exc}") from exc
    return {"ok": True, "path": str(paths.data_dir())}


class ExportIn(BaseModel):
    include_audio: bool = False


@router.post("/backup/export")
def backup_export(body: ExportIn) -> dict[str, Any]:
    out = backup.export(body.include_audio)
    return {"ok": True, "name": out.name, "url": f"/api/backup/download/{out.name}",
            "size": out.stat().st_size}


@router.get("/backup/download/{name}")
def backup_download(name: str) -> FileResponse:
    path = (paths.tmp_dir() / name).resolve()
    if path.parent != paths.tmp_dir().resolve() or not path.exists() or not name.endswith(".zip"):
        raise HTTPException(404, "Backup not found.")
    return FileResponse(path, media_type="application/zip", filename=name)


@router.post("/backup/import")
async def backup_import(request: Request) -> dict[str, Any]:
    """Body is the raw .zip file (sent with fetch(..., {body: file}))."""
    tmp = paths.tmp_dir() / "import-upload.zip"
    with open(tmp, "wb") as fh:
        async for chunk in request.stream():
            fh.write(chunk)
    try:
        return {"ok": True, **backup.import_(tmp)}
    except (ValueError, OSError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(400, f"Import failed: {exc}") from exc
    finally:
        tmp.unlink(missing_ok=True)


@router.get("/updates/check")
def check_updates() -> dict[str, Any]:
    return updates.check()


@router.post("/updates/install")
def install_update() -> dict[str, Any]:
    """Download the newest release and install it; progress arrives as "update" events."""
    return updates.start_install()


@router.get("/updates/status")
def update_status() -> dict[str, Any]:
    return updates.status()


@router.post("/app-badge")
def app_badge(body: dict[str, Any]) -> dict[str, Any]:
    """The number of review cards left today, shown on the taskbar button / Dock icon."""
    from .. import appbadge

    try:
        count = max(0, int(body.get("count") or 0))
    except (TypeError, ValueError):
        count = 0
    return {"ok": appbadge.set_count(count)}


def licenses() -> list[dict[str, str]]:
    """The open-source parts this app is built on: licenses/index.json, the list the phone and web
    app show too (`on`: only some devices, "desktop" or "phone"; none = every one)."""
    try:
        items = json.loads((paths.licenses_dir() / "index.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [{"name": x["name"], "license": x["license"], "file": x["file"]} for x in items
            if "desktop" in x.get("on", ["desktop"]) and (paths.licenses_dir() / x["file"]).exists()]


@router.get("/about")
def about() -> dict[str, Any]:
    return {
        "app_name": APP_NAME,
        "version": __version__,
        "repo": GITHUB_REPO,
        "python": sys.version.split()[0],
        "data_dir": str(paths.data_dir()),
        "licenses": licenses(),
    }


@router.get("/licenses/{name}")
def license_text(name: str) -> PlainTextResponse:
    path = (paths.licenses_dir() / name).resolve()
    if path.parent != paths.licenses_dir().resolve() or not path.exists():
        raise HTTPException(404, "License not found.")
    return PlainTextResponse(path.read_text(encoding="utf-8", errors="replace"))
