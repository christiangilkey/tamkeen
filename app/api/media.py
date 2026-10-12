"""Finding things to study: trending podcasts, and YouTube videos with captions."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import events, podcastindex, sync, youtube

router = APIRouter(tags=["media"])


@router.get("/discover/trending")
def trending(lang: str, fresh: bool = False) -> dict[str, Any]:
    """Trending podcasts in the given language(s), from the Podcast Index."""
    try:
        return {"feeds": podcastindex.trending(lang, fresh)}
    except podcastindex.NotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except podcastindex.DirectoryError as exc:
        raise HTTPException(502, str(exc)) from exc


class YouTubeRequest(BaseModel):
    url: str
    method: str = "GET"
    headers: dict[str, str] = {}
    body: str | None = None


@router.post("/youtube/request")
def youtube_request(body: YouTubeRequest) -> dict[str, Any]:
    """Pass one request on to youtube.com (for web/js/youtube.js, which reads a video's captions)."""
    try:
        return youtube.request(body.url, body.method, body.headers, body.body)
    except youtube.YouTubeError as exc:
        raise HTTPException(400, str(exc)) from exc


class YouTubeIn(BaseModel):
    video_id: str
    title: str = ""
    channel: str | None = None
    duration: float | None = None
    language: str | None = None
    auto: bool = False
    lines: list[dict[str, Any]]


@router.post("/youtube")
def add_youtube(body: YouTubeIn) -> dict[str, Any]:
    try:
        ep = youtube.save_video(body.video_id, body.title, body.lines, body.channel, body.duration,
                                body.language, body.auto)
    except youtube.YouTubeError as exc:
        raise HTTPException(400, str(exc)) from exc
    events.publish("feeds", {"refreshed": True})
    sync.request()
    return ep
