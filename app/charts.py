"""Apple's public podcast charts, for the "Trending" screen.

The reading and sorting is done by web/js/trending.js (one implementation for the computer and
the phone). A page may not call itunes.apple.com for the charts directly, so on the computer
its requests travel through `get_json` below; they still leave from the user's own machine.
No account or key is involved. Answers are kept for an hour: the charts change about once a day.
"""

from __future__ import annotations

import threading
import time
from typing import Any
from urllib.parse import urlsplit

import httpx

from .version import APP_NAME, __version__

ALLOWED_HOST = "itunes.apple.com"
CACHE_SECONDS = 3600
MAX_CACHED = 60

_cache: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


class ChartError(RuntimeError):
    pass


def get_json(url: str) -> Any:
    """Fetch one itunes.apple.com address for web/js/trending.js and return its JSON."""
    parts = urlsplit(url or "")
    if parts.scheme != "https" or parts.hostname != ALLOWED_HOST:
        raise ChartError("Only requests to Apple's podcast directory are allowed here.")
    now = time.time()
    with _lock:
        hit = _cache.get(url)
        if hit and now - hit[0] < CACHE_SECONDS:
            return hit[1]
    try:
        resp = httpx.get(url, timeout=httpx.Timeout(30, connect=15), follow_redirects=True,
                         headers={"User-Agent": f"{APP_NAME}/{__version__}", "Accept": "application/json"})
    except httpx.HTTPError as exc:
        raise ChartError(f"Couldn't reach Apple's podcast directory ({exc.__class__.__name__}).") from exc
    if resp.status_code >= 400:
        raise ChartError(f"Apple's podcast directory answered with an error ({resp.status_code}).")
    try:
        data = resp.json()
    except ValueError as exc:
        raise ChartError("Apple's podcast directory sent an answer the app couldn't read.") from exc
    with _lock:
        if len(_cache) >= MAX_CACHED:
            for old in sorted(_cache, key=lambda k: _cache[k][0])[:MAX_CACHED // 2]:
                del _cache[old]
        _cache[url] = (now, data)
    return data
