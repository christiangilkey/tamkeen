"""Finding things to study: trending podcasts, and YouTube videos with captions."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from .. import applink, charts, db, events, pages, sync, youtube
from ..version import APP_NAME, __version__

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


# ----- tamkeen://watch links from other apps (see app/applink.py) -----

class LinkIn(BaseModel):
    url: str = ""
    show: bool = True  # with no url: bring the window forward (a plain second launch), or not (--background)


@router.post("/app/open-link")
def open_link(body: LinkIn, x_tamkeen_token: str | None = Header(default=None)) -> dict[str, Any]:
    """A second launch of the app (Onyx Calendar starting it with a tamkeen:// link) handing its link
    to this one. Only with this run's secret, in the X-Tamkeen-Token header."""
    if not applink.token_ok(x_tamkeen_token):
        raise HTTPException(403, "Not allowed.")
    if not body.url:  # a second launch without a link: this one carries on instead
        if body.show:
            applink.show()
        return {"ok": True, "app": APP_NAME}
    link = applink.parse(body.url)
    if link is None:
        applink.show()
        return {"ok": False, "app": APP_NAME, "error": "That isn't a tamkeen://watch?v=… link."}
    applink.push(link)
    return {"ok": True, "app": APP_NAME}


@router.get("/app/info")
def app_info() -> dict[str, Any]:
    """Which app and version answers on this port, and what it offers other apps (Onyx Calendar
    reads it before showing the player from /embed in its News panel; see app/applink.py)."""
    return {"app": APP_NAME, "version": __version__, "embed": 1}


@router.post("/app/pending-links")
def pending_links() -> dict[str, Any]:
    """The links waiting for the page to open (web/js/app.js asks once it has loaded, and on "app_link")."""
    return {"links": applink.take()}


# ----- sites saved to the in-app browser's start page -----

class SiteIn(BaseModel):
    url: str
    title: str = ""
    on: bool = True


@router.get("/browser/sites")
def browser_sites() -> dict[str, Any]:
    """The sites on the start page, in the order they were saved: [{url, title}]."""
    return {"sites": pages.saved_sites(db.get_setting("browser_sites"))}


@router.post("/browser/sites")
def set_browser_site(body: SiteIn) -> dict[str, Any]:
    """Put one site on the start page, or (on = false) take it off."""
    if not pages.site_key(body.url):
        raise HTTPException(400, "That isn't a web address.")
    import time

    sites = pages.set_site(db.get_setting("browser_sites"), body.url, body.title, body.on, time.time())
    db.set_settings({"browser_sites": sites})
    sync.request(30)  # so the user's other devices get it
    return {"sites": pages.saved_sites(sites)}
