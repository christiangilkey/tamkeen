"""Reels: the choices on the Reels page, starting a batch, and how it is going."""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .. import db, languages, reels, reels_worker, transcriber

router = APIRouter(prefix="/reels", tags=["reels"])


def _view() -> dict[str, Any]:
    state = reels.load()
    lang = languages.study()
    return {
        "mode": state["mode"], "mine": state["mine"], "selected": state["selected"],
        "collections": [{"id": c["id"], "name": c["name"]} for c in state["collections"]], "collection": state["collection"],
        "popular": reels.popular_creators(state, lang)[:20],
        "language": lang, "language_name": languages.LANGUAGES.get(lang, lang),
        "random": lang in reels.RANDOM_WORDS,  # whether "Get random reels" is offered for this language
        "available": reels_worker.available(), "model_ready": bool(db.get_setting("model_size")) or transcriber.cloud.config() is not None,
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


@router.post("/random")
def start_random(body: Batch) -> dict[str, Any]:
    """Get a number of reels in the language being studied, found by searching for random everyday words."""
    try:
        return reels_worker.start_random(max(1, min(body.count, 30)))
    except reels.ReelError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/collections")
def find_collections() -> dict[str, Any]:
    """Read the names of the user's saved collections from their Instagram Saved page (needs the window)."""
    try:
        return reels_worker.start_collections()
    except reels.ReelError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/saved")
def saved_listing() -> dict[str, Any]:
    """The posts of the saved collection last looked at, for ticking."""
    return reels_worker.listing()


class ListIn(BaseModel):
    collection: str = reels.ALL_SAVED


@router.post("/saved/list")
def list_saved(body: ListIn) -> dict[str, Any]:
    """Look at one saved collection on Instagram and list what is in it (needs the window)."""
    try:
        return reels_worker.start_listing(body.collection)
    except reels.ReelError as exc:
        raise HTTPException(400, str(exc)) from exc


class SendIn(BaseModel):
    codes: list[str]


@router.post("/saved/send")
def send_saved(body: SendIn) -> dict[str, Any]:
    """Listen to exactly the ticked reels and keep them."""
    try:
        return reels_worker.start_selected(body.codes)
    except reels.ReelError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/thumb")
def thumb(u: str) -> Response:
    """A reel's small picture for the picking list. Instagram's picture servers refuse to show
    pictures inside other pages, so the app fetches the picture itself and hands it on."""
    if not reels.thumb_allowed(u):
        raise HTTPException(400, "Not an Instagram picture.")
    try:
        r = httpx.get(u, timeout=httpx.Timeout(20, connect=10), follow_redirects=False, headers={"User-Agent": "Mozilla/5.0"})
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Couldn't fetch the picture.") from exc
    kind = r.headers.get("content-type", "")
    if r.status_code != 200 or not kind.startswith("image/") or len(r.content) > 3_000_000:
        raise HTTPException(404, "No picture.")
    return Response(r.content, media_type=kind, headers={"Cache-Control": "private, max-age=3600"})


@router.post("/cancel")
def cancel_batch() -> dict[str, Any]:
    reels_worker.cancel()
    return reels_worker.status()
