"""Instagram Reels to study later on the phone.

Nothing of a reel is kept except its address and the words spoken in it. The computer finds
popular reels in the language being studied (see reels_worker.py, which drives a signed-in
Instagram window), listens to each one once with Whisper to check the language and write the
transcript, and stores it as an ordinary episode of the built-in "Reels" feed, so the transcript
syncs to the phone like any other. The phone then plays each reel from Instagram's own embed page
with the words underneath. What marks a reel out:
    audio_url    https://www.instagram.com/reel/<code>/
    audio_type   "video/instagram"
    guid         the reel's short code
    description  the creator's username
    status       "done" from the start (it is only stored once its transcript exists)

This file is the part with no window in it: choosing which reels to try, judging the result of
listening to one, and storing it. It is what the tests cover.
"""

from __future__ import annotations

import math
import re
import time
from typing import Any

from . import arabic, db, ids, languages
from .transcriber import Segment, Word

LOCAL_FEED_URL = "local:reels"
LOCAL_FEED_TITLE = "Reels"
REEL_TYPE = "video/instagram"
SETTING = "reels"
MODES = ("popular", "mine", "mix", "saved")
ALL_SAVED = "all"  # the choice "everything I have saved", as opposed to one collection

# What the worker types into Instagram's search to find what is popular, per language. Comedy
# first (the owner's choice); the last two words of each list are general, used only to fill up.
COMEDY_WORDS = {
    "ar": ["كوميديا", "مضحك", "مقالب", "ضحك"],
    "es": ["comedia", "humor", "chistes", "gracioso"],
    "fr": ["humour", "drôle", "sketch", "blague"],
    "ja": ["お笑い", "コント", "爆笑", "あるある"],
    "zh": ["搞笑", "喜剧", "段子", "脱口秀"],
    "ru": ["юмор", "приколы", "смешно", "комедия"],
}

POPULAR_KEPT = 40            # creators remembered per language
POPULAR_FRESH_SECONDS = 12 * 3600
PER_CREATOR = 2              # at most this many reels of one creator in a batch
MAX_SECONDS = 240            # longer videos are not "reels" for this purpose
MIN_WORDS = 8
MIN_WORDS_PER_SECOND = 0.35  # below this it is music or silence with a few words
MIN_LANGUAGE_CONFIDENCE = 0.5
# ...but not when the language being studied is a close second: short reels, and ones that mix two
# languages, often come out as a near tie (a real 14-second Arabic reel: English 0.53, Arabic 0.41).
CLOSE_SECOND = 0.25
SEEN_KEPT = 3000

# Names for languages a reel may turn out to be in (the ones the app teaches come from languages.py).
_OTHER_LANGUAGES = {"en": "English", "tr": "Turkish", "fa": "Persian", "ur": "Urdu", "hi": "Hindi", "de": "German",
                    "it": "Italian", "pt": "Portuguese", "ko": "Korean", "he": "Hebrew", "id": "Indonesian", "nl": "Dutch"}


def language_name(code: str) -> str:
    return languages.LANGUAGES.get(code) or _OTHER_LANGUAGES.get(code) or f"another language ({code})"


_USERNAME = re.compile(r"^[A-Za-z0-9._]{1,30}$")
_CODE = re.compile(r"^[A-Za-z0-9_-]{5,40}$")


class ReelError(RuntimeError):
    pass


def is_reel(audio_type: str | None) -> bool:
    return (audio_type or "") == REEL_TYPE


def clean_username(name: str) -> str:
    """"@Some.Creator", or a profile address, as a bare lower-case username."""
    name = (name or "").strip()
    m = re.search(r"instagram\.com/([A-Za-z0-9._]+)", name)
    if m:
        name = m.group(1)
    name = name.lstrip("@").strip().lower()
    if not _USERNAME.match(name) or name in ("reel", "reels", "p", "explore", "accounts", "stories"):
        raise ReelError("That doesn't look like an Instagram username.")
    return name


def reel_url(code: str) -> str:
    return f"https://www.instagram.com/reel/{code}/"


def embed_url(code: str) -> str:
    return f"https://www.instagram.com/reel/{code}/embed/"


# ---------------------------------------------------------------- settings

def load() -> dict[str, Any]:
    raw = db.get_setting(SETTING)
    state = raw if isinstance(raw, dict) else {}
    mine = [u for u in state.get("mine") or [] if isinstance(u, str)]
    return {
        "mode": state.get("mode") if state.get("mode") in MODES else "mix",
        "mine": mine,
        "selected": [u for u in state.get("selected") or [] if u in mine],
        "popular": state.get("popular") if isinstance(state.get("popular"), dict) else {},
        "seen": [c for c in state.get("seen") or [] if isinstance(c, str)][-SEEN_KEPT:],
        # The user's own saved collections on Instagram, as last read from their Saved page
        # (name and the page's address; never synced, it stays on this computer), and the one chosen.
        "collections": clean_collections(state.get("collections")),
        "collection": str(state.get("collection") or ALL_SAVED),
        # True once the user has signed in to Instagram through Facebook in the app's window.
        "facebook": bool(state.get("facebook")),
    }


_COLLECTION_PATH = re.compile(r"^/[A-Za-z0-9._]{1,30}/saved/[^/?#]{1,200}/(\d{5,25})/?$")


def clean_collections(items: Any) -> list[dict[str, str]]:
    """Collections as [{id, name, path}], dropping anything that isn't a saved-collection address."""
    out: list[dict[str, str]] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or item.get("href") or "").split("?")[0]
        m = _COLLECTION_PATH.match(path)
        if not m or any(c["id"] == m.group(1) for c in out):
            continue
        name = " ".join(str(item.get("name") or item.get("text") or "").split("\n")[0].split())[:80]
        out.append({"id": m.group(1), "name": name or f"Collection {len(out) + 1}", "path": path if path.endswith("/") else path + "/"})
    return out


def saved_path(state: dict[str, Any], username: str) -> str:
    """The address (on instagram.com) of the chosen collection's page, or of everything saved."""
    for c in state["collections"]:
        if c["id"] == state["collection"]:
            return c["path"]
    return f"/{clean_username(username)}/saved/all-posts/"


def save(state: dict[str, Any]) -> dict[str, Any]:
    db.set_settings({SETTING: state})
    return state


def update(mode: str | None = None, add: str | None = None, remove: str | None = None,
           selected: list[str] | None = None, collection: str | None = None) -> dict[str, Any]:
    """Change the choices on the Reels page. A newly added creator starts selected."""
    state = load()
    if mode is not None:
        if mode not in MODES:
            raise ReelError("Unknown choice.")
        state["mode"] = mode
    if add:
        name = clean_username(add)
        if name not in state["mine"]:
            state["mine"].append(name)
        if name not in state["selected"]:
            state["selected"].append(name)
    if remove:
        state["mine"] = [u for u in state["mine"] if u != remove]
    if selected is not None:
        state["selected"] = [u for u in dict.fromkeys(selected) if u in state["mine"]]
    state["selected"] = [u for u in state["selected"] if u in state["mine"]]
    if collection is not None:
        if collection != ALL_SAVED and not any(c["id"] == collection for c in state["collections"]):
            raise ReelError("That collection isn't in the list. Press “Find my collections” again.")
        state["collection"] = collection
    return save(state)


def remember_collections(items: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Store the collections just read from the user's Saved page; a chosen one that is gone falls back to "all"."""
    state = load()
    state["collections"] = clean_collections(items)
    if not any(c["id"] == state["collection"] for c in state["collections"]):
        state["collection"] = ALL_SAVED
    save(state)
    return state["collections"]


def popular_creators(state: dict[str, Any], lang: str) -> list[dict[str, Any]]:
    entry = state["popular"].get(lang) or {}
    return [c for c in entry.get("creators") or [] if isinstance(c, dict) and c.get("username")]


def popular_is_fresh(state: dict[str, Any], lang: str, now: float | None = None) -> bool:
    entry = state["popular"].get(lang) or {}
    return bool(entry.get("creators")) and (now or time.time()) - float(entry.get("at") or 0) < POPULAR_FRESH_SECONDS


def mark_seen(codes: list[str]) -> None:
    state = load()
    state["seen"] = list(dict.fromkeys([*state["seen"], *codes]))[-SEEN_KEPT:]
    save(state)


# ---------------------------------------------------------------- choosing

def _popularity(post: dict[str, Any]) -> float:
    """One number for "how popular": plays where Instagram gave them, else likes (worth more each)."""
    plays = float(post.get("plays") or 0)
    likes = float(post.get("likes") or 0)
    return max(plays, likes * 12.0)


def rank_creators(posts: list[dict[str, Any]], now: float | None = None) -> list[dict[str, Any]]:
    """Who is popular right now, judged from the posts a search turned up: every creator scores
    the popularity of their posts in it, recent posts counting most. Comedy searches count double."""
    now = now or time.time()
    scores: dict[str, dict[str, Any]] = {}
    for p in posts:
        user = str(p.get("user") or "").lower()
        if not _USERNAME.match(user):
            continue
        age_days = max(0.0, (now - float(p.get("taken") or now)) / 86400)
        fresh = 1.0 if age_days <= 30 else 0.5 if age_days <= 180 else 0.2
        gain = math.log10(1 + _popularity(p)) * fresh * (2.0 if p.get("comedy") else 1.0)
        entry = scores.setdefault(user, {"username": user, "score": 0.0, "posts": 0, "verified": False})
        entry["score"] += gain
        entry["posts"] += 1
        entry["verified"] = entry["verified"] or bool(p.get("verified"))
    ranked = sorted(scores.values(), key=lambda c: (-c["score"], c["username"]))[:POPULAR_KEPT]
    for c in ranked:
        c["score"] = round(c["score"], 2)
    return ranked


def remember_popular(lang: str, posts: list[dict[str, Any]], now: float | None = None) -> list[dict[str, Any]]:
    """Refresh the list of popular creators for a language. Creators from the previous list stay
    for a while with a fading score, so one odd search doesn't wipe the list."""
    now = now or time.time()
    state = load()
    fresh = rank_creators(posts, now)
    names = {c["username"] for c in fresh}
    for old in popular_creators(state, lang):
        if old["username"] not in names and float(old.get("score") or 0) > 1:
            fresh.append({**old, "score": round(float(old["score"]) * 0.6, 2)})
    fresh.sort(key=lambda c: (-c["score"], c["username"]))
    state["popular"][lang] = {"at": now, "creators": fresh[:POPULAR_KEPT]}
    save(state)
    return state["popular"][lang]["creators"]


def creators_to_visit(state: dict[str, Any], lang: str, mode: str | None = None, limit: int = 8) -> list[str]:
    """Whose reel lists to read for this batch."""
    mode = mode or state["mode"]
    mine = state["selected"] or state["mine"]
    popular = [c["username"] for c in popular_creators(state, lang)]
    if mode == "mine":
        return mine[:limit]
    if mode == "popular":
        return popular[:limit]
    half = max(1, limit // 2)  # a mix: your own first, topped up with popular ones
    picked = mine[:half]
    picked += [u for u in popular if u not in picked][:limit - len(picked)]
    return picked


def pick_candidates(posts: list[dict[str, Any]], seen: list[str] | set[str], state: dict[str, Any], lang: str,
                    mode: str | None = None, limit: int = 60) -> list[dict[str, Any]]:
    """The reels to try, best first: unseen videos, the most popular first, taking turns between
    creators so one account can't fill the batch. In "mine" only chosen creators count."""
    mode = mode or state["mode"]
    seen = set(seen)
    if mode == "saved":
        # The user's own saves: every unseen one, in the order Instagram lists them (newest save
        # first). No ranking and no taking turns: they chose these themselves.
        out_saved: list[dict[str, Any]] = []
        for p in posts:
            code = str(p.get("code") or "")
            if _CODE.match(code) and code not in seen and not any(q["code"] == code for q in out_saved):
                out_saved.append({**p, "code": code, "user": str(p.get("user") or "").lower()})
        return out_saved[:limit]
    mine = set(state["selected"] or state["mine"])
    best: dict[str, dict[str, Any]] = {}
    for p in posts:
        code = str(p.get("code") or "")
        user = str(p.get("user") or "").lower()
        if not _CODE.match(code) or not _USERNAME.match(user) or code in seen or not p.get("video", True):
            continue
        if p.get("seconds") and float(p["seconds"]) > MAX_SECONDS:
            continue
        if mode == "mine" and user not in mine:
            continue
        prev = best.get(code)
        merged = {**(prev or {}), **{k: v for k, v in p.items() if v not in (None, "", 0)}, "code": code, "user": user}
        merged["comedy"] = bool(p.get("comedy") or (prev or {}).get("comedy"))
        best[code] = merged

    def worth(p: dict[str, Any]) -> float:
        score = math.log10(1 + _popularity(p))
        if p.get("comedy"):
            score += 0.5
        if mode == "mix" and p["user"] in mine:
            score += 0.3
        return score

    by_user: dict[str, list[dict[str, Any]]] = {}
    for p in sorted(best.values(), key=lambda p: (-worth(p), p["code"])):
        by_user.setdefault(p["user"], []).append(p)
    out: list[dict[str, Any]] = []
    # Round after round: each creator's best remaining reel, the most popular reel first.
    for turn in range(max((len(v) for v in by_user.values()), default=0)):
        layer = [v[turn] for v in by_user.values() if len(v) > turn]
        out.extend(sorted(layer, key=lambda p: (-worth(p), p["code"])))
    return out[:limit]


# ---------------------------------------------------------------- judging what was heard

def spoken_language(engine: Any, samples: Any, study: str = "") -> tuple[str | None, float, float]:
    """Which language Whisper hears in the first half minute, how sure it is, and how likely it
    thinks the language being studied is. (None, 0, 0) when this engine can't say; the caller then
    judges by the letters of the transcript."""
    model = getattr(engine, "model", None)
    if model is None or not hasattr(model, "detect_language"):
        return None, 0.0, 0.0
    try:
        lang, prob, every = model.detect_language(samples[: 30 * 16000], vad_filter=True)
        share = next((float(p) for code, p in every or [] if code == study), 0.0)
        return str(lang), float(prob), float(prob) if lang == study else share
    except Exception:  # an engine or version without it: fall back to the letters
        return None, 0.0, 0.0


def other_language(study: str, detected: str | None, confidence: float, study_share: float) -> bool:
    """True when Whisper is sure the reel is NOT in the language being studied."""
    return bool(detected) and detected != study and confidence >= MIN_LANGUAGE_CONFIDENCE and study_share < CLOSE_SECOND


def language_to_use(study: str, detected: str | None, confidence: float, own_save: bool, study_share: float = 0.0) -> str:
    """The language to write a reel down in. Normally the one being studied. A reel the user saved
    themselves is also taken in any OTHER language the app teaches, when Whisper is sure it hears it
    (a Spanish save while studying Arabic is kept, as Spanish)."""
    if own_save and languages.valid(detected) and other_language(study, detected, confidence, study_share):
        return str(detected)
    return study


def verdict(target: str, detected: str | None, confidence: float, segments: list[Segment], seconds: float,
            target_share: float = 0.0, own_save: bool = False) -> str:
    """"" when the reel is worth keeping, else the reason it is skipped (shown in the progress list).
    A reel the user saved themselves is never skipped for its language or for having little speech
    (they chose it; many mix the language being studied with English): only if nothing is said at all."""
    words = sum(len(s.words) or len(s.text.split()) for s in segments)
    text = " ".join(s.text for s in segments)
    if own_save:
        return "" if words else "nothing is said in it"
    if other_language(target, detected, confidence, target_share):
        return f"spoken in {language_name(detected)}, not {language_name(target)}"
    if words < MIN_WORDS or (seconds and words / seconds < MIN_WORDS_PER_SECOND):
        return "almost no speech (music or silence)"
    if not detected and languages.detect(text, target) != target:
        return f"not in {language_name(target)}"
    return ""


# ---------------------------------------------------------------- storing

def ensure_feed(conn: Any) -> int:
    row = conn.execute("SELECT id, deleted FROM feeds WHERE url = ?", (LOCAL_FEED_URL,)).fetchone()
    if row is not None:
        if row["deleted"]:
            conn.execute("UPDATE feeds SET deleted = 0 WHERE id = ?", (row["id"],))
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO feeds(uid, url, title, description, created_at) VALUES(?,?,?,?,?)",
        (ids.feed_uid(LOCAL_FEED_URL), LOCAL_FEED_URL, LOCAL_FEED_TITLE,
         "Instagram reels found for you. They play from Instagram; the words were written by your computer.", time.time()))
    return int(cur.lastrowid)


def title_for(caption: str, creator: str) -> str:
    """A reel has no title: the first line of what its maker wrote, else "@creator"."""
    first = " ".join((caption or "").strip().split("\n")[0].split())
    first = re.sub(r"(\s*#\S+)+\s*$", "", first).strip()  # trailing hashtags are noise
    return (first[:117] + "…") if len(first) > 118 else first or f"@{creator}"


def save_reel(code: str, creator: str, caption: str, segments: list[Segment], language: str, model: str,
              seconds: float | None = None) -> dict[str, Any]:
    """Store a reel that passed (its address and its words). Returns the episode row."""
    if not _CODE.match(code or ""):
        raise ReelError("That doesn't look like a reel.")
    creator = clean_username(creator)
    spoken = [s for s in segments if s.text.strip()]
    if not spoken:
        raise ReelError("Nothing was said in this reel.")
    now = time.time()
    length = float(seconds or 0) or spoken[-1].end
    with db.session() as conn:
        feed_id = ensure_feed(conn)
        feed_uid = conn.execute("SELECT uid FROM feeds WHERE id = ?", (feed_id,)).fetchone()["uid"]
        uid = ids.episode_uid(feed_uid, code)
        row = conn.execute("SELECT id FROM episodes WHERE uid = ?", (uid,)).fetchone()
        if row is None:
            cur = conn.execute(
                "INSERT INTO episodes(feed_id, uid, guid, title, description, published, audio_url, audio_type, "
                "language, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (feed_id, uid, code, title_for(caption, creator), creator, now, reel_url(code), REEL_TYPE, language, now))
            ep_id = int(cur.lastrowid)
        else:
            ep_id = int(row["id"])
            conn.execute("UPDATE episodes SET title = ?, description = ?, language = ?, deleted = 0 WHERE id = ?",
                         (title_for(caption, creator), creator, language, ep_id))
            for table in ("words", "segments", "segments_fts"):
                conn.execute(f"DELETE FROM {table} WHERE episode_id = ?", (ep_id,))
        widx = 0
        for sidx, seg in enumerate(spoken):
            norm = arabic.normalize(seg.text)
            conn.execute("INSERT INTO segments(episode_id, idx, start, end, text, norm) VALUES(?,?,?,?,?,?)",
                         (ep_id, sidx, seg.start, seg.end, seg.text, norm))
            conn.execute("INSERT INTO segments_fts(norm, episode_id, seg_idx) VALUES(?,?,?)", (norm, ep_id, sidx))
            words = seg.words
            if not words:  # no word timings: spread the words evenly so the player still works
                toks = seg.text.split()
                step = (seg.end - seg.start) / max(1, len(toks))
                words = [Word(seg.start + i * step, seg.start + (i + 1) * step, t) for i, t in enumerate(toks)]
            conn.executemany(
                "INSERT INTO words(episode_id, idx, seg_idx, start, end, text, prob) VALUES(?,?,?,?,?,?,?)",
                [(ep_id, widx + i, sidx, w.start, w.end, w.text, w.prob) for i, w in enumerate(words)])
            widx += len(words)
        # A fresh transcribed_at makes sync publish the words to the phone.
        conn.execute(
            "UPDATE episodes SET status = 'done', progress = 100, error = NULL, model = ?, transcribed_at = ?, "
            "duration = ? WHERE id = ?", (model, now, length, ep_id))
        out = dict(conn.execute("SELECT * FROM episodes WHERE id = ?", (ep_id,)).fetchone())
    out["words"] = widx
    return out
