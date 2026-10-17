"""The Anki companion's endpoints: receiving reports from the add-on, handing out the add-on, and the
two-way sync between the saved words and one Anki deck (the rules are in anki_sync.py)."""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel

from .. import anki_bridge, companion, events

router = APIRouter(prefix="/anki")


class ReportIn(BaseModel):
    days: list[dict[str, Any]]


@router.post("/report")
def report(body: ReportIn, x_tamkeen_token: str = Header(default="")) -> dict[str, bool]:
    """Called by the add-on inside Anki, never by the app's own pages."""
    if not secrets.compare_digest(x_tamkeen_token, companion.token()):
        raise HTTPException(403, "Wrong companion token. Download the add-on again from Tamkeen's settings.")
    if len(body.days) > 31:
        raise HTTPException(400, "Too many days in one report.")
    companion.record(body.days)
    events.publish("anki", {"received": True})
    return {"ok": True}


@router.get("/days")
def days() -> dict[str, Any]:
    return companion.days()


@router.get("/addon")
def addon() -> Response:
    return Response(companion.addon_zip(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{companion.ADDON_FILE}"'})


# ----- two-way sync with one Anki deck -----
# The first three are called by the add-on inside Anki and need its token; the rest are the app's own pages.

def _addon(token: str) -> None:
    if not secrets.compare_digest(token, companion.token()):
        raise HTTPException(403, "Wrong companion token. Download the add-on again from Tamkeen's settings.")


class SyncIn(BaseModel):
    col: str = ""
    profile: str = ""
    deck: str = ""
    decks: list[dict[str, Any]] | None = None  # [{language, name}]: the Tamkeen decks the add-on read
    round: int = 1
    notes: list[dict[str, Any]] = []
    deleted: dict[str, float] = {}
    elsewhere: list[str] = []
    outside: int = 0
    applied: dict[str, Any] | None = None


@router.get("/sync/config")
def sync_config(x_tamkeen_token: str = Header(default="")) -> dict[str, Any]:
    _addon(x_tamkeen_token)
    return anki_bridge.config()


@router.post("/sync")
def sync_round(body: SyncIn, x_tamkeen_token: str = Header(default="")) -> dict[str, Any]:
    """One round of a sync: the add-on sends the deck's notes and gets back what to change in Anki."""
    _addon(x_tamkeen_token)
    return anki_bridge.run(body.model_dump())


@router.get("/media/{name}")
def sync_media(name: str, x_tamkeen_token: str = Header(default="")) -> Response:
    """The card font or a word's audio clip, for a card the add-on is about to make."""
    _addon(x_tamkeen_token)
    data = anki_bridge.media(name)
    if data is None:
        raise HTTPException(404, "No such file.")
    return Response(data, media_type="application/octet-stream")


class SyncOptions(BaseModel):
    enabled: bool | None = None
    deck: str | None = None
    decks: dict[str, str] | None = None  # language -> deck name
    delete_ok: bool | None = None


class Choice(BaseModel):
    what: str
    choice: str


@router.get("/sync/status")
def sync_status() -> dict[str, Any]:
    return anki_bridge.status()


@router.post("/sync/options")
def sync_options(body: SyncOptions) -> dict[str, Any]:
    try:
        return anki_bridge.set_options(body.enabled, body.deck, body.delete_ok, body.decks)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/sync/resolve")
def sync_resolve(body: Choice) -> dict[str, Any]:
    try:
        return anki_bridge.resolve(body.what, body.choice)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/progress")
def progress() -> dict[str, Any]:
    """Each linked word's Anki schedule as last read (shown on the Vocab page; never written back)."""
    return anki_bridge.progress()


@router.get("/move")
def move_info() -> dict[str, Any]:
    """How many Anki cards sit in another language's deck than their word's."""
    return anki_bridge.move_info()


@router.post("/move")
def move() -> dict[str, Any]:
    """Move them to their language's deck at the add-on's next sync."""
    return anki_bridge.request_move()


@router.get("/linked/{uid}")
def is_linked(uid: str) -> dict[str, bool]:
    return {"linked": anki_bridge.linked(uid)}
