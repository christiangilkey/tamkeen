"""Trending podcasts from the Podcast Index (podcastindex.org), a free and open podcast directory.

Every request is signed with the app's own key and secret. They are read from the environment
(PODCASTINDEX_KEY / PODCASTINDEX_SECRET) or from app/podcastindex_key.json, which is git-ignored
and written by the release workflow, the same way as the Google client file.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

import httpx

from . import paths
from .version import APP_NAME, __version__

API = "https://api.podcastindex.org/api/1.0"
KEY_FILE = Path(__file__).with_name("podcastindex_key.json")
CACHE_SECONDS = 3600
SINCE_SECONDS = 30 * 24 * 3600  # "trending" among podcasts with something new in the last month
MAX_FEEDS = 300

_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_lock = threading.Lock()


class NotConfigured(RuntimeError):
    pass


class DirectoryError(RuntimeError):
    pass


def credentials() -> tuple[str, str] | None:
    key = os.environ.get("PODCASTINDEX_KEY", "").strip()
    secret = os.environ.get("PODCASTINDEX_SECRET", "").strip()
    if key and secret:
        return key, secret
    # Beside this file when run from source; inside the bundle's resources in an installed copy.
    for candidate in (KEY_FILE, paths.resource_dir() / "app" / KEY_FILE.name):
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        key, secret = str(data.get("key") or "").strip(), str(data.get("secret") or "").strip()
        if key and secret:
            return key, secret
    return None


def configured() -> bool:
    return credentials() is not None


def auth_headers(key: str, secret: str, now: int) -> dict[str, str]:
    """The Podcast Index sign-in: a SHA-1 of key + secret + the current time, sent with both."""
    digest = hashlib.sha1(f"{key}{secret}{now}".encode("utf-8")).hexdigest()
    return {"User-Agent": f"{APP_NAME}/{__version__}", "X-Auth-Key": key, "X-Auth-Date": str(now),
            "Authorization": digest}


def clean_languages(lang: str) -> str:
    codes = [c for c in re.split(r"[,\s]+", (lang or "").lower()) if re.fullmatch(r"[a-z]{2,3}(-[a-z0-9]{2,8})*", c)]
    if not codes:
        raise DirectoryError("Choose a language to study first (Settings).")
    return ",".join(dict.fromkeys(codes[:40]))


def tidy(feed: dict[str, Any]) -> dict[str, Any] | None:
    """Keep only what the Trending screen shows."""
    url = str(feed.get("url") or "").strip()
    title = " ".join(str(feed.get("title") or "").split())
    if not re.match(r"^https?://", url) or not title:
        return None
    image = str(feed.get("artwork") or feed.get("image") or "").strip()
    cats = feed.get("categories")
    return {
        "id": feed.get("id"), "url": url, "title": title[:300],
        "author": " ".join(str(feed.get("author") or "").split())[:200],
        "description": " ".join(str(feed.get("description") or "").split())[:600],
        "image": image if image.startswith("https://") else None,
        "language": str(feed.get("language") or "").lower(),
        "categories": [str(name) for name in cats.values()] if isinstance(cats, dict) else [],
        "score": feed.get("trendScore") or 0,
        "newest": feed.get("newestItemPublishTime") or None,
    }


def trending(lang: str, fresh: bool = False) -> list[dict[str, Any]]:
    """Trending podcasts in the given language(s) (comma-separated codes), best first."""
    creds = credentials()
    if creds is None:
        raise NotConfigured("Trending podcasts aren't switched on in this copy of the app yet.")
    langs = clean_languages(lang)
    with _lock:
        hit = _cache.get(langs)
        if hit and not fresh and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
    now = int(time.time())
    try:
        resp = httpx.get(f"{API}/podcasts/trending", headers=auth_headers(*creds, now), timeout=httpx.Timeout(30, connect=15),
                         params={"lang": langs, "max": MAX_FEEDS, "since": now - SINCE_SECONDS})
    except httpx.HTTPError as exc:
        raise DirectoryError(f"Couldn't reach the podcast directory ({exc.__class__.__name__}).") from exc
    if resp.status_code in (401, 403):
        raise DirectoryError("The podcast directory refused the app's key.")
    if resp.status_code >= 400:
        raise DirectoryError(f"The podcast directory answered with an error ({resp.status_code}).")
    try:
        raw = resp.json().get("feeds") or []
    except ValueError as exc:
        raise DirectoryError("The podcast directory sent an answer the app couldn't read.") from exc
    feeds = [f for f in (tidy(item) for item in raw if isinstance(item, dict)) if f]
    feeds.sort(key=lambda f: -(f["score"] or 0))
    with _lock:
        _cache[langs] = (time.time(), feeds)
    return feeds
