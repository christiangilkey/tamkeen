"""The Anki companion's endpoints: receiving reports from the add-on, and handing out the add-on."""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel

from .. import companion, events

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
