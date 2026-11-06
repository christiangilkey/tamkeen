"""Who may talk to the app's local server, and the safety headers on everything it sends.

The server listens on 127.0.0.1, which every website the user visits could also try to reach. Three
checks keep them out (a pure ASGI middleware, so the live event stream and big uploads pass straight
through):

1. **The Host header must name this server**: 127.0.0.1, localhost or [::1] with this run's port (or
   exactly the address the server was started on). A website that points its own name at 127.0.0.1
   ("DNS rebinding") sends its own name here, so it is refused before anything is answered.
2. **An Origin header must be exactly this server's own**, port included. Browsers send one with
   every cross-site request and with every change (POST, PUT, PATCH, DELETE), so another website or
   another local server on a different port is refused.
3. **Changes need this run's session token**: every /api/ request other than GET/HEAD must carry it,
   in the X-Tamkeen-Session header or the session cookie. Only the app's own page has it: the server
   writes it into the page (a <meta> tag, for web/js/app.js's api()) and sets it as an HttpOnly,
   SameSite=Strict cookie for every other kind of request the page makes. Routes that check a secret
   of their own (a second launch handing over a link, the Anki add-on) are left to that check. The
   same token decides whether /api/settings and /api/status include the AI keys (app/api/system.py).

The token is made fresh by create_app (app/main.py), kept only in memory, and never written to disk.

Every answer also gets X-Content-Type-Options, a Referrer-Policy, frame protection, and the app's
pages a Content-Security-Policy (see APP_CSP).
"""

from __future__ import annotations

import secrets
from typing import Any

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

SESSION_HEADER = "X-Tamkeen-Session"
SESSION_META = "tamkeen-session"  # <meta name="tamkeen-session" content="..."> in the app's pages
COOKIE_PREFIX = "tamkeen_session_"  # + the port: cookies don't tell ports apart, so two servers don't clash
LOOPBACK_NAMES = ("127.0.0.1", "localhost", "[::1]")
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# Routes that check a secret of their own instead of the page's session token.
OWN_SECRET_ROUTES = frozenset({
    "/api/app/open-link",  # a second launch of the app, with instance.json's secret (app/applink.py)
    "/api/anki/report",    # the Anki add-on, with its own token (app/companion.py)
    "/api/anki/sync",
})
# GETs that make this computer fetch something from the network for the caller: only for the app's page.
SESSION_GETS = frozenset({"/api/web/fetch"})

# The app's own page (/ and /embed). Scripts only from the app itself and YouTube's player API, no
# inline scripts or onclick="" attributes (what an injected bit of HTML would need to run), WebAssembly
# for the photo text reader (web/js/ocr.js). Pictures, sound and connections may go anywhere: podcasts,
# feeds' pictures and the AI providers live on many hosts, some over plain http.
APP_CSP = "; ".join((
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://www.youtube.com https://s.ytimg.com",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob: https: http: wss:",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com "
    "https://embed.music.apple.com https://www.instagram.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
))
# Everything else the server sends (the browser's start page, the sign-in answer page, files).
BASE_CSP = "object-src 'none'; base-uri 'self'"
APP_PAGES = frozenset({"/", "/index.html", "/embed"})
# /embed is shown inside Onyx Calendar's window (an Electron app whose page is a file:// address,
# which frame-ancestors can't name), so it may be framed; every other page only by the app itself.
FRAMEABLE = frozenset({"/embed"})


def new_token() -> str:
    return secrets.token_urlsafe(32)


def _split_host(value: str) -> tuple[str, int | None]:
    """("127.0.0.1", 8790) from "127.0.0.1:8790"; ("[::1]", 80) from "[::1]:80"; port None if none."""
    value = value.strip().lower()
    if value.startswith("["):
        end = value.find("]")
        if end < 0:
            return value, None
        name, rest = value[:end + 1], value[end + 1:]
    elif value.count(":") == 1:
        name, rest = value.split(":")[0], ":" + value.split(":")[1]
    else:
        name, rest = value, ""
    if not rest:
        return name, None
    if not rest.startswith(":") or not rest[1:].isdigit() or len(rest) > 6:
        return value, -1  # not a port: never matches
    return name, int(rest[1:])


def allowed_hosts(scope: Scope) -> frozenset[str]:
    """The Host values that name this server: the loopback names with its port, and the address it
    was started on (the test client's "testserver", say)."""
    server = scope.get("server")
    if not server or server[1] is None:
        return frozenset()
    host, port = str(server[0]).lower(), int(server[1])
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    names = {*LOOPBACK_NAMES, host}
    out = {f"{n}:{port}" for n in names}
    if port == 80:
        out |= names  # the default port may be left out
    return frozenset(out)


def host_ok(value: str | None, allowed: frozenset[str]) -> bool:
    if not value:
        return False
    name, port = _split_host(value)
    if port == -1:
        return False
    return (f"{name}:{port}" if port is not None else name) in allowed


def origin_ok(value: str, allowed: frozenset[str]) -> bool:
    """Is this Origin header exactly this server's own address (http, a name that is ours, our port)?"""
    value = value.strip().lower()
    if not value.startswith("http://") or "/" in value[7:]:
        return False  # "null", https://, file://, another scheme, or a path (never in an Origin)
    return host_ok(value[7:], allowed)


def cookie_name(scope: Scope) -> str:
    server = scope.get("server") or ("", 0)
    return f"{COOKIE_PREFIX}{server[1]}"


def _cookie(headers: Headers, name: str) -> str:
    for part in headers.get("cookie", "").split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return ""


def session_ok(scope: Scope, token: str) -> bool:
    """Does this request carry this run's session token (header or cookie)?"""
    if not token:
        return False
    headers = Headers(scope=scope)
    sent = headers.get(SESSION_HEADER) or _cookie(headers, cookie_name(scope))
    return bool(sent) and secrets.compare_digest(sent.encode("utf-8", "replace"), token.encode("utf-8"))


def trusted(request: Any) -> bool:
    """For a route: did this request come from the app's own page? (request: a Starlette Request)"""
    return session_ok(request.scope, getattr(request.app.state, "session_token", ""))


def inject_token(html: str, token: str) -> str:
    """The page with this run's session token in a <meta> tag (read by web/js/app.js's api())."""
    meta = f'<meta name="{SESSION_META}" content="{token}">'
    at = html.lower().find("<head>")
    return html[:at + 6] + "\n  " + meta + html[at + 6:] if at >= 0 else meta + html


def _is_page(path: str) -> bool:
    return path in APP_PAGES or (path.endswith(".html") and not path.startswith("/api/"))


class LocalOnly:
    """The middleware: the three checks above, the session cookie on the app's pages, and the headers."""

    def __init__(self, app: ASGIApp, token: str) -> None:
        self.app = app
        self.token = token

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope.get("path") or "/"
        method: str = scope.get("method", "GET").upper()
        headers = Headers(scope=scope)
        allowed = allowed_hosts(scope)
        send_headers = self._with_headers(scope, send, path, method)
        if not host_ok(headers.get("host"), allowed):
            await JSONResponse({"detail": "Invalid host header."}, status_code=400)(scope, receive, send_headers)
            return
        origin = headers.get("origin")
        if origin is not None and not origin_ok(origin, allowed):
            await JSONResponse({"detail": "Cross-origin requests are not allowed."}, status_code=403)(scope, receive, send_headers)
            return
        if path.startswith("/api/") and path not in OWN_SECRET_ROUTES and (method not in SAFE_METHODS or path in SESSION_GETS):
            if not session_ok(scope, self.token):
                await JSONResponse({"detail": "Only Tamkeen's own window can do that. Reload the page and try again."},
                                   status_code=403)(scope, receive, send_headers)
                return
        await self.app(scope, receive, send_headers)

    def _with_headers(self, scope: Scope, send: Send, path: str, method: str) -> Send:
        page = _is_page(path) and method == "GET"
        csp = APP_CSP if path in APP_PAGES else BASE_CSP
        if path not in FRAMEABLE:
            csp += "; frame-ancestors 'self'"
        # The browser's start page posts its search box to Google: no address of this server goes with it.
        referrer = "no-referrer" if path == "/browser-home.html" else "strict-origin-when-cross-origin"

        async def wrapped(message: Message) -> None:
            if message["type"] == "http.response.start":
                h = MutableHeaders(scope=message)
                h.setdefault("X-Content-Type-Options", "nosniff")
                h.setdefault("Referrer-Policy", referrer)
                h.setdefault("Content-Security-Policy", csp)
                if path not in FRAMEABLE:
                    h.setdefault("X-Frame-Options", "SAMEORIGIN")
                if path.startswith("/api/"):
                    # Other sites can't even embed the answers as a picture or script.
                    h.setdefault("Cross-Origin-Resource-Policy", "same-origin")
                if page and message.get("status", 200) < 400 and "text/html" in h.get("content-type", ""):
                    h.append("Set-Cookie", f"{cookie_name(scope)}={self.token}; Path=/; HttpOnly; SameSite=Strict")
            await send(message)

        return wrapped
