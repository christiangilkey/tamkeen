"""Arabic vowel marks: the model download, and each episode's vowelled words (see app/tashkeel.py)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from .. import db, tashkeel

router = APIRouter(tags=["vowels"])


class SentenceIn(BaseModel):
    sentence: str
    episode: str = ""          # (the phone looks the sentence up in this episode's transcript instead)
    start: float | None = None
    end: float | None = None


@router.get("/vowels/status")
def vowels_status() -> dict[str, Any]:
    st = tashkeel.status()
    with db.session() as conn:
        st["waiting"] = len(tashkeel.pending(conn)) if st["installed"] else 0
    return st


@router.post("/vowels/download")
def vowels_download() -> dict[str, Any]:
    return tashkeel.start_download()


@router.post("/vowels/remove")
def vowels_remove() -> dict[str, Any]:
    return tashkeel.remove()


@router.get("/episodes/{episode_id}/vowels")
def episode_vowels(episode_id: int) -> dict[str, Any]:
    """The episode's vowelled words, once they have been made (`pending` while they are being made)."""
    v = tashkeel.for_episode(episode_id)
    return {"vowels": v, "pending": v is None and tashkeel.installed()}


@router.post("/vowels/sentence")
def vowel_sentence(body: SentenceIn) -> dict[str, Any]:
    """A saved word's sentence, vowelled (review cards). `guess`: it sounds like dialect."""
    if not tashkeel.installed() or not body.sentence.strip():
        return {"sentence": None, "guess": False}
    text = body.sentence[:2000]
    dialect, lines = tashkeel.judge_dialect([text.split()])
    return {"sentence": tashkeel.vowel_text(text), "guess": bool(dialect or lines)}
