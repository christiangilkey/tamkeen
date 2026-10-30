"""The audiobook catalogue's files for the computer's page (app/audiobooks.py, web/js/audiobooks.js)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from .. import audiobooks

router = APIRouter(tags=["audiobooks"])


@router.get("/audiobooks/{name}")
def catalogue_file(name: str) -> Response:
    try:
        body = audiobooks.get(name)
    except audiobooks.CatalogueError as exc:
        raise HTTPException(404, str(exc)) from exc
    kind = "application/json" if name.endswith(".json") else "application/gzip"
    return Response(body, media_type=kind, headers={"Cache-Control": "no-cache"})
