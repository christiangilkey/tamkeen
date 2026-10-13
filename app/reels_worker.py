"""Finding and transcribing a batch of reels: the part that drives a window.

"Get 10 reels" opens the app's own Instagram window (the user signs in there once; the sign-in
stays in the app's browser storage like any other site's). A background thread then:
  1. reads what is popular: Instagram's search for a few comedy words in the language being
     studied (web/js/instagram-worker.js notes the posts the site describes to the page), which
     also refreshes the list of popular creators;
  2. reads the reel lists of the creators to follow (popular ones, the user's own, or both);
  3. tries the best unseen reels one by one: opens the reel's embed page (the version Instagram
     makes for showing a reel elsewhere; a reel that won't show there is skipped, because the
     phone plays it from that page), fetches the video once to a temporary file so Whisper can
     hear it, checks the language, writes the transcript, and deletes the file.
Only the address and the words are kept (see reels.py).

With the choice "From my Instagram saves" there is no batch of ten. The user picks a collection,
the worker lists the posts in it (`start_listing`), the user ticks the ones they want, and exactly
those are listened to and kept (`start_selected`).

Everything here needs a real pywebview window, so it is exercised by a scripted real-window run
rather than by the unit tests.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from typing import Any
from urllib.parse import quote

import httpx

from . import audio, db, events, languages, paths, reels, sync, transcriber
from .pages import BROWSER_UA
from .version import APP_NAME

log = logging.getLogger(__name__)

SIGNIN_MINUTES = 10
PAGE_PAUSE = 2.0             # seconds between pages, so this looks like a person browsing
MAX_VIDEO_BYTES = 120 * 1024 * 1024
TRIES_PER_REEL = 6           # give up after checking this many times the number asked for
HIDE_WINDOW = True           # once signed in, work out of sight

_lock = threading.Lock()
_thread: threading.Thread | None = None
_cancel = threading.Event()
_status: dict[str, Any] = {"state": "idle", "message": "", "kept": 0, "target": 0, "checked": 0, "log": []}
# The posts of the saved collection last looked at, for the picking list (kept in memory only).
_listing: dict[str, Any] = {"collection": "", "posts": [], "at": 0.0}


class Stopped(RuntimeError):
    pass


def available() -> bool:
    """Reels can only be fetched by the installed computer app (it needs its own browser window)."""
    return os.environ.get("APS_DESKTOP") == "1"


def status() -> dict[str, Any]:
    with _lock:
        return {**_status, "log": list(_status["log"]), "running": _thread is not None and _thread.is_alive()}


def _say(state: str | None = None, message: str | None = None, **fields: Any) -> None:
    with _lock:
        if state is not None:
            _status["state"] = state
        if message is not None:
            _status["message"] = message
        _status.update(fields)
    events.publish("reels", status())


def _note(creator: str, title: str, outcome: str, kept: bool) -> None:
    with _lock:
        _status["log"] = [*_status["log"], {"creator": creator, "title": title[:80], "outcome": outcome, "kept": kept}][-40:]


def cancel() -> None:
    _cancel.set()


def start(count: int = 10) -> dict[str, Any]:
    global _thread
    if not available():
        raise reels.ReelError("Getting reels works in the installed computer app (it needs its own Instagram window).")
    with _lock:
        if _thread is not None and _thread.is_alive():
            raise reels.ReelError("Already getting reels.")
        _cancel.clear()
        _status.update(state="starting", message="Opening Instagram…", kept=0, target=int(count), checked=0, log=[])
        _thread = threading.Thread(target=_run, args=(int(count),), name="reels", daemon=True)
        _thread.start()
    return status()


def start_collections() -> dict[str, Any]:
    """Read the names of the user's saved collections (shown in the dropdown on the Reels page)."""
    global _thread
    if not available():
        raise reels.ReelError("Reading your saves works in the installed computer app (it needs its own Instagram window).")
    with _lock:
        if _thread is not None and _thread.is_alive():
            raise reels.ReelError("Busy getting reels. Try again when that has finished.")
        _cancel.clear()
        _status.update(state="starting", message="Opening Instagram…", kept=0, target=0, checked=0, log=[])
        _thread = threading.Thread(target=_run_collections, name="reels-collections", daemon=True)
        _thread.start()
    return status()


def listing() -> dict[str, Any]:
    """The posts of the collection last looked at, each marked `have` if it is already in the library."""
    with db.session() as conn:
        have = {r["guid"] for r in conn.execute(
            "SELECT e.guid FROM episodes e JOIN feeds f ON f.id = e.feed_id WHERE f.url = ? AND e.deleted = 0",
            (reels.LOCAL_FEED_URL,))}
    skipped = reels.load()["skipped"]
    with _lock:
        return {"collection": _listing["collection"], "at": _listing["at"],
                "posts": [{**p, "have": p["code"] in have,
                           "skipped": "" if p["code"] in have or skipped.get(p["code"]) == reels.NOT_OUTSIDE else skipped.get(p["code"], "")}
                          for p in _listing["posts"]]}


def _begin(target: Any, args: tuple[Any, ...], name: str, count: int = 0) -> dict[str, Any]:
    global _thread
    if not available():
        raise reels.ReelError("Reading your saves works in the installed computer app (it needs its own Instagram window).")
    with _lock:
        if _thread is not None and _thread.is_alive():
            raise reels.ReelError("Busy with Instagram already. Try again when that has finished.")
        _cancel.clear()
        _status.update(state="starting", message="Opening Instagram…", kept=0, target=count, checked=0, log=[])
        _thread = threading.Thread(target=target, args=args, name=name, daemon=True)
        _thread.start()
    return status()


def start_listing(collection: str) -> dict[str, Any]:
    """List the posts in one of the user's saved collections (or in everything saved), for picking."""
    reels.update(mode="saved", collection=collection)
    return _begin(_run_listing, (), "reels-listing")


def start_selected(codes: list[str]) -> dict[str, Any]:
    """Listen to exactly the reels the user ticked, and keep them."""
    codes = [c for c in dict.fromkeys(str(c) for c in codes or [])][: reels.LIST_LIMIT]
    if not codes:
        raise reels.ReelError("Tick the reels you want first.")
    return _begin(_run_selected, (codes,), "reels-selected", len(codes))


# ---------------------------------------------------------------- the window

def _js(window: Any, script: str) -> Any:
    try:
        return window.evaluate_js(script)
    except Exception:  # between two pages, or the window was closed
        return None


def _alive(window: Any) -> bool:
    import webview

    return window in webview.windows


def _wait(window: Any, script: str, seconds: float, every: float = 0.5) -> Any:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if _cancel.is_set():
            raise Stopped("Stopped.")
        if not _alive(window):
            raise Stopped("The Instagram window was closed.")
        value = _js(window, script)
        if value:
            return value
        time.sleep(every)
    return None


def _open(window: Any, url: str, hook: str, settle: float = 2.5, scrolls: int = 0) -> None:
    """Go to a page, wait until it has loaded, and let it fetch its lists."""
    marker = uuid.uuid4().hex[:8]
    _js(window, f"window.__tkLeaving = '{marker}'")
    window.load_url(url)
    _wait(window, f"(document.readyState === 'complete' && window.__tkLeaving !== '{marker}') ? 'y' : ''", 45)
    _js(window, hook)
    time.sleep(settle)
    for _ in range(scrolls):
        _js(window, "window.scrollBy(0, 2600)")
        time.sleep(2.5)
    if _cancel.is_set():
        raise Stopped("Stopped.")


def _ask(window: Any, script: str, seconds: float = 30) -> Any:
    """Run JavaScript that answers later (a request it makes), and wait for the answer."""
    box: dict[str, Any] = {}
    got = threading.Event()

    def answer(result: Any) -> None:
        box["r"] = result
        got.set()

    try:
        window.evaluate_js(script, answer)
    except Exception:
        return None
    got.wait(seconds)
    return box.get("r")


# How a page of instagram.com asks the site for something as itself (the site's own web app id).
_GET = ("function(u){return fetch(u,{credentials:'include',headers:{'X-IG-App-ID':'936619743392459',"
        "'X-Requested-With':'XMLHttpRequest'}}).then(function(r){return r.json()})}")


def _signed_in_window(hook: str, purpose: str) -> Any:
    """The app's Instagram window, signed in (asking the user to sign in if need be), then hidden."""
    import webview

    window = webview.create_window(f"Instagram · {APP_NAME}", "https://www.instagram.com/", width=560, height=860,
                                   min_size=(420, 560))
    try:
        _wait(window, "document.readyState === 'complete' ? 'y' : ''", 60)
        _js(window, hook)
        time.sleep(2)
        if not _js(window, "window.__tkReels && window.__tkReels.signedIn()"):
            _say("signin", "Sign in to Instagram in the window that just opened. It only needs doing once.")
            if not _await_sign_in(window, hook):
                raise Stopped(f"Nobody signed in to Instagram, so {purpose}.")
            time.sleep(4)  # let Instagram's "save your login?" step settle
        if HIDE_WINDOW:
            try:
                window.hide()
            except Exception as exc:
                log.debug("Couldn't hide the Instagram window: %s", exc)
    except BaseException:
        try:
            window.destroy()
        except Exception:
            pass
        raise
    return window


def _await_sign_in(window: Any, hook: str) -> bool:
    """Wait for the user to sign in to Instagram in the window. If they sign in to FACEBOOK there
    ("Log in with Facebook") and end up on Facebook's own pages, go back to Instagram and press
    its "Continue as …" button, so that sign-in carries over. Remembered for later runs, when the
    Facebook sign-in is already in the window's storage."""
    state = reels.load()
    via_facebook = bool(state.get("facebook"))
    on_facebook_since = 0.0
    presses = 0
    last_press = 0.0
    signup_since = 0.0
    end = time.monotonic() + SIGNIN_MINUTES * 60
    while time.monotonic() < end:
        if _cancel.is_set():
            raise Stopped("Stopped.")
        if not _alive(window):
            raise Stopped("The Instagram window was closed.")
        now = time.monotonic()
        if _js(window, hook + ";window.__tkReels.signedIn()"):
            return True
        if _js(window, "window.__tkReels && window.__tkReels.facebookReady()"):
            # Give Facebook a few seconds to send the window back to Instagram by itself first.
            on_facebook_since = on_facebook_since or now
            if now - on_facebook_since > 6:
                if not via_facebook:
                    via_facebook = True
                    reels.save({**reels.load(), "facebook": True})
                _say("signin", "Signed in to Facebook. Carrying that over to Instagram…")
                on_facebook_since = 0.0
                window.load_url("https://www.instagram.com/accounts/login/")
                time.sleep(4)
        else:
            on_facebook_since = 0.0
            if via_facebook and presses < 3 and now - last_press > 12:
                pressed = _js(window, "window.__tkReels && window.__tkReels.continueWithFacebook()")
                if pressed:
                    presses += 1
                    last_press = now
                    log.info("Instagram sign-in: pressed its %s button", pressed)
            # Instagram passes through its sign-up address on the way back from Facebook. Only if it
            # STAYS there, asking for a new account's details, is there no Instagram account behind
            # that Facebook one; then nothing more is pressed (the app never creates an account).
            asking = _js(window, "(/\\/accounts\\/(emailsignup|signup)/.test(location.pathname) && "
                                 "document.querySelector('input[name=\"emailOrPhone\"], input[name=\"fullName\"], input[name=\"username\"]')) ? 'y' : ''")
            signup_since = (signup_since or now) if asking else 0.0
            if via_facebook and signup_since and now - signup_since > 8:
                via_facebook = False
                _say("signin", "That Facebook account has no Instagram account linked to it. Sign in with an Instagram "
                               "username and password in the window instead.")
        time.sleep(2)
    return False


def _username(window: Any) -> str:
    """Whose Instagram account the window is signed in to (needed for the address of their Saved page)."""
    name = _ask(window, "(" + _GET + ")('/api/v1/accounts/edit/web_form_data/').then(function(d){"
                        "return (d&&d.form_data&&d.form_data.username)||''}).catch(function(){return ''})", 30)
    try:
        return reels.clean_username(str(name or ""))
    except reels.ReelError:
        raise Stopped("Couldn't tell which Instagram account is signed in. Try again.") from None


_LINKS = ("JSON.stringify([].map.call(document.querySelectorAll('main a[href], a[href*=\"/saved/\"]'),function(a){"
          "var i=a.querySelector('img');return {href:a.getAttribute('href'),text:(a.innerText||'').trim()||(i&&i.alt)||'',"
          "img:i?(i.currentSrc||i.src||''):''}}))")


def _links(window: Any) -> list[dict[str, str]]:
    try:
        return json.loads(_js(window, _LINKS) or "[]")
    except ValueError:
        return []


def _saved_posts(window: Any, hook: str, address: str) -> list[dict[str, Any]]:
    """The posts on one of the user's Saved pages, in the order shown. Each is {code, ...} with
    whatever else the site said about it (maker, caption); the rest is looked up when it is tried."""
    _open(window, "https://www.instagram.com" + address, hook, scrolls=3)
    noted = {p["code"]: p for p in _posts(window)}
    out: list[dict[str, Any]] = []
    for link in _links(window):
        href = str(link.get("href") or "")
        parts = [x for x in href.split("?")[0].split("/") if x]
        if len(parts) >= 2 and parts[-2] in ("p", "reel", "reels") and not any(p["code"] == parts[-1] for p in out):
            out.append({**noted.get(parts[-1], {}), "code": parts[-1], "thumb": str(link.get("img") or "")})
    return out


_DETAILS = ("(function(code){var A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',pk=0n;"
            "for(var i=0;i<code.length;i++)pk=pk*64n+BigInt(A.indexOf(code[i]));"
            "return (" + _GET + ")('/api/v1/media/'+pk+'/info/').then(function(d){var m=d&&d.items&&d.items[0];if(!m)return '';"
            "return JSON.stringify({user:m.user&&m.user.username||'',video:m.media_type===2,"
            "caption:(m.caption&&m.caption.text||'').slice(0,300),seconds:Math.round(m.video_duration||0)})}).catch(function(){return ''})})")


_ADDRESS = ("(function(code){var A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',pk=0n;"
            "for(var i=0;i<code.length;i++)pk=pk*64n+BigInt(A.indexOf(code[i]));"
            "return (" + _GET + ")('/api/v1/media/'+pk+'/info/').then(function(d){var m=d&&d.items&&d.items[0];"
            "var v=m&&m.video_versions&&m.video_versions[0];return (v&&v.url)||''}).catch(function(){return ''})})")


def _video_address(window: Any, code: str) -> str:
    """Where a reel's video is, asked of Instagram's site as the signed-in page (for reels whose
    embed page has none). "" if the site won't say."""
    if not _js(window, "/(^|\\.)instagram\\.com$/.test(location.hostname) ? 'y' : ''"):
        return ""
    address = str(_ask(window, _ADDRESS + "(" + json.dumps(code) + ")", 30) or "")
    return address if address.startswith("https://") else ""


def _details(window: Any, code: str) -> dict[str, Any]:
    """Who made a post and whether it is a video, asked of the site (for saves it didn't describe)."""
    try:
        return json.loads(_ask(window, _DETAILS + "(" + json.dumps(code) + ")", 30) or "{}")
    except ValueError:
        return {}


def _posts(window: Any) -> list[dict[str, Any]]:
    try:
        return json.loads(_js(window, "window.__tkReels ? window.__tkReels.posts() : '[]'") or "[]")
    except ValueError:
        return []


# ---------------------------------------------------------------- one reel

def _fetch_video(url: str) -> Any:
    """The reel's video in a temporary file (deleted by the caller once Whisper has heard it)."""
    dest = paths.tmp_dir() / f"reel-{uuid.uuid4().hex}.mp4"
    size = 0
    with httpx.stream("GET", url, headers={"User-Agent": BROWSER_UA}, timeout=httpx.Timeout(60, connect=15),
                      follow_redirects=True) as resp:
        if resp.status_code >= 400:
            raise reels.ReelError(f"Instagram wouldn't hand over the video ({resp.status_code}).")
        with open(dest, "wb") as fh:
            for chunk in resp.iter_bytes(1 << 16):
                size += len(chunk)
                if size > MAX_VIDEO_BYTES:
                    break
                fh.write(chunk)
    return dest


def _transcribe_mixed(engine: Any, samples: Any, lang: str) -> list[Any]:
    """Write down a reel that may switch between languages (say Arabic and English): the language
    is judged afresh for every stretch of speech instead of being fixed for the whole reel. Only
    faster-whisper can do this; other engines write it all down as `lang`."""
    model = getattr(engine, "model", None)
    if model is None or getattr(engine, "engine", "") != "faster-whisper":
        return list(engine.transcribe(samples, _cancel, lang))
    try:
        found, _info = model.transcribe(
            samples, language=None, multilingual=True, task="transcribe", beam_size=getattr(engine, "beam_size", 5),
            word_timestamps=True, vad_filter=True, vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False)
    except TypeError:  # an older faster-whisper without `multilingual`
        return list(engine.transcribe(samples, _cancel, lang))
    out = []
    for seg in found:
        if _cancel.is_set():
            raise transcriber.TranscriptionCancelled()
        words = [transcriber.Word(float(w.start), float(w.end), w.word.strip(), float(w.probability))
                 for w in (seg.words or []) if w.word.strip()]
        out.append(transcriber.Segment(float(seg.start), float(seg.end), seg.text.strip(), words))
    return out


def _try_reel(window: Any, hook: str, cand: dict[str, Any], lang: str, engine: Any, own_save: bool = False) -> tuple[bool, str]:
    """(kept, what happened) for one candidate."""
    code = cand["code"]
    if not cand.get("user"):  # a saved post the site didn't describe on the Saved page
        cand.update({k: v for k, v in _details(window, code).items() if v not in (None, "")})
        if not cand.get("user"):
            return False, "couldn't be read"
    if cand.get("video") is False:
        return False, "not a video"
    if cand.get("seconds") and float(cand["seconds"]) > reels.MAX_SECONDS:
        return False, "too long"
    creator = cand["user"]
    _open(window, reels.embed_url(code), hook, settle=1.0)
    src = _wait(window, "(function(){var v=document.querySelector('video');var s=v?String(v.currentSrc||v.src||''):'';"
                        "return s.indexOf('http')===0?s:''})()", 10) or ""
    signin = False
    if not src and own_save:
        # Instagram won't play this one on its embed page (a song from its music library, usually).
        # The user picked it, so it is kept all the same: the site still tells a signed-in page
        # where the video is, and the phone will play the reel's ordinary page, signed in.
        src = _video_address(window, code)
        signin = bool(src)
    if not src:
        return False, reels.NOT_OUTSIDE
    path = _fetch_video(src)
    try:
        seconds = audio.probe_duration(path)
        if seconds and seconds > reels.MAX_SECONDS:
            return False, "too long"
        samples = audio.decode(path)
    except audio.AudioError:
        return False, "no sound"
    finally:
        path.unlink(missing_ok=True)
    if not seconds:
        seconds = len(samples) / audio.SAMPLE_RATE
    detected, confidence, share = reels.spoken_language(engine, samples, lang)
    if reels.language_to_use(lang, detected, confidence, own_save, share) != lang:
        lang, share = str(detected), confidence  # a save in another language the app teaches: kept, in that language
    if own_save:
        segments = _transcribe_mixed(engine, samples, lang)  # the user's own pick: never skipped for its language
    elif reels.other_language(lang, detected, confidence, share):
        return False, reels.verdict(lang, detected, confidence, [], seconds, share)
    else:
        segments = list(engine.transcribe(samples, _cancel, lang))
    reason = reels.verdict(lang, detected, confidence, segments, seconds, share, own_save)
    if reason:
        return False, reason
    ep = reels.save_reel(code, creator, cand.get("caption") or "", segments, lang,
                         f"{engine.engine}:{engine.model_size}:{engine.device}", seconds, signin=signin)
    return True, (f"{ep['words']} words" + ("" if lang == languages.study() else f", in {reels.language_name(lang)}")
                  + (" (plays when signed in to Instagram on the phone)" if signin else ""))


# ---------------------------------------------------------------- the batch

def _run_collections() -> None:
    window = None
    try:
        hook = (paths.web_dir() / "js" / "instagram-worker.js").read_text(encoding="utf-8")
        window = _signed_in_window(hook, "your saves couldn't be read")
        _say("finding", "Looking at your saved collections…")
        me = _username(window)
        _open(window, f"https://www.instagram.com/{me}/saved/", hook, scrolls=1)
        found = reels.remember_collections([{"path": link.get("href"), "name": link.get("text")} for link in _links(window)])
        _say("done", f"Found {len(found)} saved collection{'' if len(found) == 1 else 's'}." if found
             else "No collections found in your Instagram saves. You can still choose “Everything I've saved”.")
    except Stopped as exc:
        _say("stopped", str(exc))
    except Exception as exc:
        log.exception("Reading saved collections failed")
        _say("error", f"Reading your saves failed ({exc.__class__.__name__}: {exc}).")
    finally:
        if window is not None:
            try:
                window.destroy()
            except Exception:
                pass


def _attempt(window: Any, hook: str, cand: dict[str, Any], lang: str, engine: Any, own_save: bool) -> bool:
    """Try one reel, note how it went in the progress list, and remember that it was tried."""
    try:
        ok, outcome = _try_reel(window, hook, cand, lang, engine, own_save=own_save)
    except transcriber.TranscriptionCancelled:
        raise Stopped("Stopped.") from None
    except (reels.ReelError, httpx.HTTPError) as exc:
        ok, outcome = False, str(exc) or exc.__class__.__name__
    _note(cand.get("user") or "?", reels.title_for(cand.get("caption") or "", cand.get("user") or "?"), outcome, ok)
    reels.mark_seen([cand["code"]])
    reels.mark_outcome(cand["code"], "" if ok else outcome)
    time.sleep(PAGE_PAUSE)
    return ok


def _close(window: Any) -> None:
    if window is not None:
        try:
            window.destroy()
        except Exception:
            pass


def _run_listing() -> None:
    window = None
    try:
        hook = (paths.web_dir() / "js" / "instagram-worker.js").read_text(encoding="utf-8")
        window = _signed_in_window(hook, "your saves couldn't be read")
        state = reels.load()
        _say("finding", "Reading that collection on Instagram…")
        posts = _saved_posts(window, hook, reels.saved_path(state, _username(window)))[: reels.LIST_LIMIT]
        for i, p in enumerate(posts):  # who made each one, where the page itself didn't say
            if p.get("user"):
                continue
            if _cancel.is_set():
                raise Stopped("Stopped.")
            _say("finding", f"Reading your saved posts ({i + 1} of {len(posts)})…")
            p.update({k: v for k, v in _details(window, p["code"]).items() if v not in (None, "")})
            time.sleep(0.6)
        tidy = reels.tidy_listing(posts)
        with _lock:
            _listing.update(collection=state["collection"], posts=tidy, at=time.time())
        _say("done", f"{len(tidy)} saved post{'' if len(tidy) == 1 else 's'} found. Tick the ones you want." if tidy
             else "Nothing is saved there yet.")
    except Stopped as exc:
        _say("stopped", str(exc))
    except Exception as exc:
        log.exception("Listing a saved collection failed")
        _say("error", f"Reading that collection failed ({exc.__class__.__name__}: {exc}).")
    finally:
        _close(window)


def _run_selected(codes: list[str]) -> None:
    window = None
    kept = 0
    try:
        lang = languages.study()
        engine = transcriber.get()  # fails here, with a clear message, if no model is set up
        hook = (paths.web_dir() / "js" / "instagram-worker.js").read_text(encoding="utf-8")
        window = _signed_in_window(hook, "no reels were fetched")
        with _lock:
            known = {p["code"]: dict(p) for p in _listing["posts"]}
        for i, code in enumerate(codes):
            if _cancel.is_set():
                raise Stopped("Stopped.")
            _say("checking", f"Listening to reel {i + 1} of {len(codes)}…", kept=kept, checked=i + 1)
            cand = known.get(code) or {"code": code}
            if _attempt(window, hook, cand, lang, engine, own_save=True):
                kept += 1
                _say(kept=kept)
        events.publish("feeds", {"refreshed": True})
        sync.request()
        left = len(codes) - kept
        _say("done", f"{kept} of {len(codes)} ready for your phone." + (f" {left} couldn't be used (see below)." if left else ""),
             kept=kept, checked=len(codes))
    except Stopped as exc:
        if kept:
            events.publish("feeds", {"refreshed": True})
            sync.request()
        _say("stopped", str(exc))
    except transcriber.NoModelError as exc:
        _say("error", str(exc))
    except Exception as exc:
        log.exception("Getting the chosen reels failed")
        _say("error", f"Getting those reels failed ({exc.__class__.__name__}: {exc}).")
    finally:
        _close(window)


def _run(count: int) -> None:
    window = None
    try:
        lang = languages.study()
        name = languages.LANGUAGES.get(lang, lang)
        engine = transcriber.get()  # fails here, with a clear message, if no model is set up
        hook = (paths.web_dir() / "js" / "instagram-worker.js").read_text(encoding="utf-8")
        window = _signed_in_window(hook, "no reels were fetched")

        state = reels.load()
        mode = state["mode"]
        posts: list[dict[str, Any]] = []
        if mode == "saved":
            _say("finding", "Reading your saved posts…")
            posts = _saved_posts(window, hook, reels.saved_path(state, _username(window)))
            if not posts:
                raise Stopped("No saved posts were found there. Save some reels on Instagram first, or choose another collection.")
        if mode in ("popular", "mix"):
            words = reels.COMEDY_WORDS.get(lang, [])
            # A fresh list of popular creators needs fewer searches; a stale or empty one, all of them.
            for i, word in enumerate(words[: 2 if reels.popular_is_fresh(state, lang) else 4]):
                _say("finding", f"Looking at what's popular in {name} ({i + 1})…")
                _open(window, "https://www.instagram.com/explore/search/keyword/?q=" + quote(word), hook, scrolls=2)
                found = _posts(window)
                for p in found:
                    p["comedy"] = True
                posts += found
                time.sleep(PAGE_PAUSE)
            if posts:
                reels.remember_popular(lang, posts)
                state = reels.load()
        popular = {c["username"] for c in reels.popular_creators(state, lang)}
        for i, creator in enumerate([] if mode == "saved" else reels.creators_to_visit(state, lang, mode)):
            _say("finding", f"Reading @{creator}'s reels…")
            _open(window, f"https://www.instagram.com/{creator}/reels/", hook, scrolls=1)
            for p in _posts(window):
                if str(p.get("user") or "").lower() == creator:
                    p["video"] = True  # everything in a reels list is a reel
                    p["comedy"] = creator in popular
                    posts.append(p)
            time.sleep(PAGE_PAUSE)

        with db.session() as conn:
            have = {r["guid"] for r in conn.execute(
                "SELECT e.guid FROM episodes e JOIN feeds f ON f.id = e.feed_id WHERE f.url = ? AND e.deleted = 0",
                (reels.LOCAL_FEED_URL,))}
        candidates = reels.pick_candidates(posts, set(state["seen"]) | have, state, lang, mode, limit=count * TRIES_PER_REEL)
        if not candidates:
            raise Stopped("No new reels were found. Add creators, or choose “Popular” or “A mix”." if mode == "mine" and not state["mine"]
                          else "Nothing new there: every video in those saves has already been tried." if mode == "saved"
                          else "No new reels were found this time. Try again later.")
        kept = checked = 0
        for cand in candidates:
            if kept >= count:
                break
            if _cancel.is_set():
                raise Stopped("Stopped.")
            checked += 1
            _say("checking", f"Listening to reel {checked} (kept {kept} of {count})…", kept=kept, checked=checked)
            if _attempt(window, hook, cand, lang, engine, own_save=mode == "saved"):
                kept += 1
        events.publish("feeds", {"refreshed": True})
        sync.request()
        _say("done", f"{kept} reel{'' if kept == 1 else 's'} ready ({checked} checked). They sync to your phone with everything else.",
             kept=kept, checked=checked)
    except Stopped as exc:
        if _status.get("kept"):
            events.publish("feeds", {"refreshed": True})
            sync.request()
        _say("stopped", str(exc))
    except transcriber.NoModelError as exc:
        _say("error", str(exc))
    except Exception as exc:
        log.exception("Getting reels failed")
        _say("error", f"Getting reels failed ({exc.__class__.__name__}: {exc}).")
    finally:
        if window is not None:
            try:
                window.destroy()
            except Exception:
                pass
