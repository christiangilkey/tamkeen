"""Card voices made on this computer (app/voices.py): the voice models, and making a card's voice now."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .. import db, languages, voices

router = APIRouter(prefix="/voices", tags=["voices"])


class VoiceIn(BaseModel):
    voice: str


class PickIn(BaseModel):
    lang: str
    voice: str = ""


@router.get("")
def summary() -> dict[str, Any]:
    return {**voices.summary(), "study_language": languages.study()}


@router.post("/download")
def download(body: VoiceIn) -> dict[str, Any]:
    try:
        return voices.start_download(body.voice)
    except voices.VoiceError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/cancel")
def cancel() -> dict[str, bool]:
    voices.cancel_download()
    return {"ok": True}


@router.delete("/{voice_id}")
def delete(voice_id: str) -> dict[str, bool]:
    try:
        voices.delete(voice_id)
    except voices.VoiceError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ok": True}


@router.post("/pick")
def pick(body: PickIn) -> dict[str, Any]:
    """Which downloaded voice says language `lang` on this computer ("" = the first downloaded)."""
    if body.voice and (voices.find_voice(body.voice) or ("", {}))[0] != body.lang:
        raise HTTPException(400, "That voice isn't for this language.")
    try:
        picked = json.loads(db.get_setting("tts_local") or "{}")
    except (TypeError, ValueError):
        picked = {}
    picked = picked if isinstance(picked, dict) else {}
    if body.voice:
        picked[body.lang] = body.voice
    else:
        picked.pop(body.lang, None)
    db.set_settings({"tts_local": json.dumps(picked) if picked else ""})
    return {"ok": True, "voice": voices.voice_for(body.lang)}


@router.post("/make/{vocab_id}")
def make(vocab_id: int) -> dict[str, Any]:
    """Make one card's voice now (the Vocab page and the reviewer, with "My computer" chosen)."""
    try:
        row = voices.make_for(vocab_id)
    except voices.VoiceError as exc:
        raise HTTPException(409, str(exc)) from exc
    row.pop("norm", None)
    return row


@router.get("/sample")
def sample(lang: str, text: str) -> Response:
    """A few words (the page sends the language's own sample sentence) in its downloaded voice ("Sample")."""
    try:
        return Response(voices.sample(lang, text.strip()[:200]), media_type="audio/ogg")
    except voices.VoiceError as exc:
        raise HTTPException(409, str(exc)) from exc
