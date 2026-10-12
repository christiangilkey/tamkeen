"""Reels: the choices on the Reels page, starting a batch, and how it is going."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, languages, reels, reels_worker

router = APIRouter(prefix="/reels", tags=["reels"])


def _view() -> dict[str, Any]:
    state = reels.load()
    lang = languages.study()
    return {
        "mode": state["mode"], "mine": state["mine"], "selected": state["selected"],
        "collections": [{"id": c["id"], "name": c["name"]} for c in state["collections"]], "collection": state["collection"],
        "popular": reels.popular_creators(state, lang)[:20],
        "language": lang, "language_name": languages.LANGUAGES.get(lang, lang),
        "available": reels_worker.available(), "model_ready": bool(db.get_setting("model_size")),
        "status": reels_worker.status(),
    }


@router.get("")
def get_reels() -> dict[str, Any]:
    return _view()


class Choices(BaseModel):
    mode: str | None = None
    add: str | None = None
    remove: str | None = None
    selected: list[str] | None = None
    collection: str | None = None


@router.put("/choices")
def set_choices(body: Choices) -> dict[str, Any]:
    try:
        reels.update(body.mode, body.add, body.remove, body.selected, body.collection)
    except reels.ReelError as exc:
        raise HTTPException(400, str(exc)) from exc
    return _view()


class Batch(BaseModel):
    count: int = 10


@router.post("/batch")
def start_batch(body: Batch) -> dict[str, Any]:
    try:
        return reels_worker.start(max(1, min(body.count, 30)))
    except reels.ReelError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/collections")
def find_collections() -> dict[str, Any]:
    """Read the names of the user's saved collections from their Instagram Saved page (needs the window)."""
    try:
        return reels_worker.start_collections()
    except reels.ReelError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/cancel")
def cancel_batch() -> dict[str, Any]:
    reels_worker.cancel()
    return reels_worker.status()
