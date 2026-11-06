"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import logging
import logging.handlers
import mimetypes
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import audio, db, events, gpu_libs, guard, jobs, models_manager, paths, sync, tashkeel, voices
from .api import router as api_router
from .api.feeds import refresh_in_background
from .version import APP_NAME, __version__

log = logging.getLogger(__name__)

# The files' types, whatever the computer's own list says (Windows can map .js to text/plain, and the
# server tells browsers not to guess: guard.py's X-Content-Type-Options).
for _type, _ext in (("text/javascript", ".js"), ("text/javascript", ".mjs"), ("text/css", ".css"),
                    ("application/wasm", ".wasm"), ("application/json", ".json"), ("image/svg+xml", ".svg"),
                    ("image/webp", ".webp"), ("font/woff2", ".woff2"), ("font/woff", ".woff"), ("font/ttf", ".ttf")):
    mimetypes.add_type(_type, _ext)


def setup_logging() -> None:
    root = logging.getLogger()
    if any(getattr(h, "_aps", False) for h in root.handlers):
        return
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    fh = logging.handlers.RotatingFileHandler(paths.logs_dir() / "app.log", maxBytes=2_000_000, backupCount=3,
                                              encoding="utf-8")
    fh.setFormatter(fmt)
    fh._aps = True  # type: ignore[attr-defined]
    root.addHandler(fh)
    if sys.stderr is not None:  # windowed PyInstaller builds have no stderr
        sh = logging.StreamHandler()
        sh.setFormatter(fmt)
        sh._aps = True  # type: ignore[attr-defined]
        root.addHandler(sh)


def startup_checks() -> None:
    ok, message = audio.check_ffmpeg()
    if ok:
        log.info("Audio backend: %s", message)
    else:
        log.error("Audio backend unavailable:\n%s", message)
    gpu_libs.apply_pending_removal()
    if gpu_libs.installed():
        log.info("CUDA libraries loaded: %s", gpu_libs.load())
    try:
        models_manager.forget_retired()  # e.g. Typhoon, replaced by Pathumma for Thai
    except Exception:
        log.exception("Could not remove a retired model")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    events.bind_loop(asyncio.get_running_loop())
    db.init_db()
    startup_checks()
    if app.state.start_worker:
        jobs.worker.start()
        refresh_in_background()
        tashkeel.kick()  # Arabic transcripts still without their vowels (only once the vowel model is here)
        voices.worker.start()  # card voices made here, with "My computer" chosen (app/voices.py)
        if sync.oauth.signed_in():
            sync.manager.start()
    log.info("%s %s started; data folder: %s", APP_NAME, __version__, paths.data_dir())
    yield
    jobs.worker.stop()
    voices.worker.stop()
    sync.manager.stop()


def create_app(start_worker: bool = True) -> FastAPI:
    setup_logging()
    # The developer pages (/api/docs) only when running from source, not in the installed app.
    dev = not getattr(sys, "frozen", False)
    app = FastAPI(title=APP_NAME, version=__version__, lifespan=lifespan, docs_url="/api/docs" if dev else None,
                  redoc_url=None, openapi_url="/api/openapi.json" if dev else None)
    app.state.start_worker = start_worker
    # This run's secret: only the app's own page gets it (in the page and a cookie). See app/guard.py.
    app.state.session_token = guard.new_token()
    app.include_router(api_router)
    # Refuses other websites (the Host and Origin checks), changes without the token, and adds the
    # safety headers to every answer.
    app.add_middleware(guard.LocalOnly, token=app.state.session_token)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("Unhandled error on %s", request.url.path)
        return JSONResponse({"detail": f"Unexpected error: {exc}"}, status_code=500)

    web = paths.web_dir()

    def page(name: str) -> HTMLResponse:
        # Never kept on disk by the webview: the page carries this run's token.
        html = guard.inject_token((web / name).read_text(encoding="utf-8"), app.state.session_token)
        return HTMLResponse(html, headers={"Cache-Control": "no-store"})

    @app.get("/", include_in_schema=False)
    def index() -> HTMLResponse:
        return page("index.html")

    @app.get("/index.html", include_in_schema=False)
    def index_file() -> HTMLResponse:
        return page("index.html")

    @app.get("/embed", include_in_schema=False)
    def embed() -> HTMLResponse:
        """Only the player for one video, for another app to show (/embed?v=<id>&t=<s>; the page
        sees the address and leaves out everything else, web/js/app.js). See app/applink.py."""
        return page("index.html")

    @app.get("/browser-home.html", include_in_schema=False)
    def browser_home() -> HTMLResponse:
        """The in-app Web Browser's start page (app/desktop.py): it saves and removes sites."""
        return page("browser-home.html")

    app.mount("/", NoCacheStaticFiles(directory=web), name="web")
    return app


class NoCacheStaticFiles(StaticFiles):
    """Static files that the webview must revalidate, so an app update never runs stale JS."""

    def file_response(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response
