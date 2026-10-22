"""Netflix titles in the library (see app/netflix.py). Only the computer adds them: the title plays in
Netflix's own player in a window of the app, and its subtitles arrive from there."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import events, netflix, sync

router = APIRouter(tags=["netflix"])


class TitleIn(BaseModel):
    id: str
    info: dict[str, Any] = {}
    language: str | None = None
    replaces: str | None = None  # the title Netflix moved on from (a series opened by its own number)


@router.post("/netflix")
def add_title(body: TitleIn) -> dict[str, Any]:
    """Add a title (or refresh its name and picture) and return its episode. Subtitles that arrived
    before it was in the library are kept now."""
    try:
        ep = netflix.save_title(body.id, body.info, body.language, body.replaces)
    except netflix.NetflixError as exc:
        raise HTTPException(400, str(exc)) from exc
    saved = netflix.flush(ep["guid"])
    if saved is not None:
        ep = {**ep, **saved}
    events.publish("feeds", {"refreshed": True})
    sync.request(30)
    return ep


@router.get("/netflix/{netflix_id}")
def get_title(netflix_id: str) -> dict[str, Any]:
    try:
        ep = netflix.find_title(netflix_id)
    except netflix.NetflixError as exc:
        raise HTTPException(400, str(exc)) from exc
    if ep is None:
        raise HTTPException(404, "That title isn't in the library yet.")
    return ep
