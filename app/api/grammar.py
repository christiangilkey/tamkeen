"""The grammar courses' files for the computer's page (app/grammar.py, web/js/grammardata.js)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from .. import grammar

router = APIRouter(tags=["grammar"])


@router.get("/grammar/{name:path}")
def grammar_file(name: str) -> Response:
    try:
        body = grammar.get(name)
    except grammar.GrammarError as exc:
        raise HTTPException(404, str(exc)) from exc
    return Response(body, media_type="application/json", headers={"Cache-Control": "no-cache"})
