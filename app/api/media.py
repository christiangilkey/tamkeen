"""Finding things to study: trending podcasts, and YouTube videos with captions."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import charts, events, sync, youtube

router = APIRouter(tags=["media"])


@router.get("/discover/apple")
def apple_charts(url: str) -> Any:
    """Pass one request on to Apple's podcast charts (for web/js/trending.js, the Trending screen)."""
    try:
        return charts.get_json(url)
    except charts.ChartError as exc:
        raise HTTPException(400 if "allowed" in str(exc) else 502, str(exc)) from exc


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


@router.get("/youtube/{video_id}")
def get_youtube(video_id: str) -> dict[str, Any]:
    """The episode of a video already in the library (so opening it again doesn't fetch its captions again)."""
    try:
        ep = youtube.find_video(video_id)
    except youtube.YouTubeError as exc:
        raise HTTPException(400, str(exc)) from exc
    if ep is None:
        raise HTTPException(404, "That video isn't in the library yet.")
    return ep


class WatchResult(BaseModel):
    token: str
    ok: bool
    title: str = ""
    error: str = ""


@router.post("/youtube/watch-result")
def watch_result(body: WatchResult) -> dict[str, bool]:
    """The app's page answering a "watch this video" request that came from the browser window."""
    return {"ok": youtube.answer_watch(body.token, body.ok, body.title, body.error)}
