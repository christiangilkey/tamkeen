"""The basics courses' files for the computer's page (app/course.py, web/js/course.js)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from .. import course

router = APIRouter(tags=["course"])
TYPES = {".json": "application/json", ".ogg": "audio/ogg"}


@router.get("/course/{name:path}")
def course_file(name: str) -> Response:
    try:
        body = course.get(name)
    except course.CourseError as exc:
        raise HTTPException(404, str(exc)) from exc
    kind = next((t for ext, t in TYPES.items() if name.endswith(ext)), "application/octet-stream")
    # (a pack is named by what is in it: it never changes)
    keep = "max-age=31536000, immutable" if name.endswith(".pack") else "max-age=86400"
    return Response(body, media_type=kind, headers={"Cache-Control": "no-cache" if kind == "application/json" else keep})
