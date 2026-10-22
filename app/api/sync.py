"""Google Drive sync endpoints: sign-in, status, manual sync."""

from __future__ import annotations

import html
import webbrowser
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .. import db, sync
from ..sync import oauth

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/status")
def status() -> dict[str, Any]:
    return sync.status()


@router.post("/login")
def login(request: Request, tasks: bool = False) -> dict[str, Any]:
    # Google requires the system browser for sign-in (embedded webviews are blocked); it
    # redirects back to this local server. `tasks`: also ask for Google Tasks (googletasks.py).
    port = request.url.port
    redirect = f"http://127.0.0.1:{port}/api/sync/callback"
    try:
        url = oauth.begin(redirect, tasks=tasks)
    except oauth.AuthError as exc:
        raise HTTPException(400, str(exc)) from exc
    webbrowser.open(url)
    return {"ok": True, "url": url}


def _page(title: str, message: str, ok: bool) -> HTMLResponse:
    color = "#0f766e" if ok else "#b42318"
    return HTMLResponse(f"""<!doctype html><meta charset="utf-8"><title>{html.escape(title)}</title>
<body style="font:16px system-ui;display:grid;place-items:center;height:90vh;background:#f7f6f2">
<div style="max-width:440px;text-align:center"><h2 style="color:{color}">{html.escape(title)}</h2>
<p>{html.escape(message)}</p><p style="color:#6b6860">You can close this tab and return to Tamkeen.</p></div>""")


@router.get("/callback", include_in_schema=False)
def callback(state: str = "", code: str = "", error: str = "") -> HTMLResponse:
    if error:
        return _page("Sign-in cancelled", "Google sign-in was cancelled or denied.", False)
    try:
        email = oauth.complete(state, code)
        from .. import reset

        reset.maybe_restore()  # after Reset Tamkeen, signing in brings the library back (before any sync)
    except oauth.AuthError as exc:
        return _page("Sign-in failed", str(exc), False)
    except Exception as exc:  # network etc.
        return _page("Sign-in failed", f"{exc.__class__.__name__}: {exc}", False)
    sync.manager.start()
    sync.manager.request(delay=0.5)
    sync.manager._publish(state="idle")
    return _page("Signed in", f"Syncing as {email}.", True)


@router.post("/logout")
def logout() -> dict[str, Any]:
    oauth.sign_out()
    sync.manager._publish(state="idle", error=None)
    return sync.status()


@router.post("/id-token")
def google_id_token() -> dict[str, str]:
    """For the online features (friends, sharing): proves to Supabase who is signed in."""
    try:
        return {"token": oauth.id_token()}
    except oauth.AuthError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/now")
def sync_now(wait: bool = False) -> dict[str, Any]:
    """Sync now. `wait`: the refresh button, which waits for it and says how it went."""
    if not oauth.signed_in():
        raise HTTPException(400, "Sign in with Google first.")
    if wait:
        return sync.manager.wait_and_sync()
    sync.manager.request(delay=0)
    return sync.status()


@router.post("/check")
def sync_check() -> dict[str, Any]:
    """Another of the learner's devices nudged this one (web/js/syncnudge.js): look at Drive now."""
    sync.manager.check()
    return {"ok": True}


@router.post("/flush")
def sync_flush() -> dict[str, Any]:
    """The reviewer closed: send its answers now if they are still waiting."""
    return {"ok": True, "sent": sync.manager.flush()}


class Presence(BaseModel):
    visible: bool
    focused: bool = True


@router.post("/presence")
def presence(body: Presence) -> dict[str, Any]:
    """The app's page: is its window on screen, and in front? (Sets how often Drive is checked.)"""
    return sync.manager.presence(body.visible, body.focused)


class SyncSettings(BaseModel):
    sync_audio: bool


@router.patch("/settings")
def update_settings(body: SyncSettings) -> dict[str, Any]:
    db.set_settings({"sync_audio": body.sync_audio})
    return sync.status()
