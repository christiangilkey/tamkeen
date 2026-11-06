"""AI word definitions: a narrow HTTPS relay to the four providers, plus the answer cache.

The provider logic lives in web/js/definer.js so the Android app can share it. Browsers
block most of these APIs from a web page (CORS), so the desktop page sends the finished
request here and this endpoint forwards it, only ever to the provider hosts below.
"""

from __future__ import annotations

import json
import time
from typing import Annotated, Any
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException
from fastapi import Path as PathParam
from pydantic import BaseModel, field_validator

from . import limits
from .. import db, sync

router = APIRouter(tags=["definer"])

ALLOWED_HOSTS = {
    "api.anthropic.com",
    "generativelanguage.googleapis.com",
    "api.openai.com",
    "api.x.ai",
}
ALLOWED_HEADERS = {"x-api-key", "anthropic-version", "anthropic-beta", "content-type", "x-goog-api-key", "authorization"}


class RelayIn(BaseModel):
    url: str
    headers: dict[str, str]
    body: dict[str, Any]
    timeout: float | None = None  # seconds to wait for the answer (90 unless said; Gemini captioning a video takes longer)


@router.post("/llm/relay")
def relay(req: RelayIn) -> dict[str, Any]:
    parts = urlsplit(req.url)
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        raise HTTPException(400, "Only the supported AI providers can be called.")
    headers = {k: v for k, v in req.headers.items() if k.lower() in ALLOWED_HEADERS}
    try:
        resp = httpx.post(req.url, headers=headers, content=json.dumps(req.body, ensure_ascii=False).encode("utf-8"),
                          timeout=httpx.Timeout(min(max(req.timeout or 90, 10), 900), connect=15))
    except httpx.HTTPError as exc:
        return {"status": 0, "text": f"Network error: {exc.__class__.__name__}: {exc}"}
    return {"status": resp.status_code, "text": resp.text}


MAX_DEFINITION_BYTES = 1_000_000  # one word's answer, written as JSON
# The cache's keys: definer.js cacheKey (40 hex characters of a SHA-256); a little room for other kinds.
DefinitionKey = Annotated[str, PathParam(pattern=r"^[A-Za-z0-9_.:-]{1,128}$")]


class DefinitionIn(BaseModel):
    key: limits.Name
    word: limits.Title
    sentence: limits.Text
    data: dict[str, Any]
    provider: limits.Name = ""
    model: limits.Name = ""

    @field_validator("data")
    @classmethod
    def _not_huge(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > MAX_DEFINITION_BYTES:
            raise ValueError("this answer is too big to keep")
        return value


@router.get("/definitions/{key}")
def get_definition(key: DefinitionKey) -> dict[str, Any] | None:
    """Cached answer, or null when this word/sentence hasn't been looked up yet."""
    with db.session() as conn:
        row = conn.execute("SELECT data FROM definitions WHERE key = ?", (key,)).fetchone()
    return json.loads(row["data"]) if row else None


@router.put("/definitions/{key}")
def put_definition(key: DefinitionKey, body: DefinitionIn) -> dict[str, bool]:
    with db.session() as conn:
        conn.execute(
            "INSERT INTO definitions(key, word, sentence, data, provider, model, created_at) VALUES(?,?,?,?,?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET data = excluded.data, provider = excluded.provider, "
            "model = excluded.model, created_at = excluded.created_at",
            (key, body.word, body.sentence, json.dumps(body.data, ensure_ascii=False), body.provider, body.model,
             time.time()),
        )
    sync.request(delay=30)
    return {"ok": True}


@router.delete("/definitions/{key}")
def delete_definition(key: DefinitionKey) -> dict[str, bool]:
    with db.session() as conn:
        conn.execute("DELETE FROM definitions WHERE key = ?", (key,))
    return {"ok": True}
