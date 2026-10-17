"""The computer's side of the two-way Anki sync.

The rules live in anki_sync.py and know nothing about storage. This file feeds them: it reads
the saved words and last sync's links from the database, takes the deck's notes from the add-on
running inside Anki (web/anki-addon/), applies Tamkeen's share of the plan here, and hands the
add-on its share. It also keeps what Settings shows: when the last sync was, what it changed,
and what is waiting on the learner.

One sync is a few rounds of one request (POST /api/anki/sync): the add-on sends the deck, gets
its changes, makes them, and sends the deck again. A link between a word and its card moves on
only when a round sees both sides agree, so a change that failed in Anki is simply sent again.
"""

from __future__ import annotations

import datetime
import json
import re
import time
from typing import Any

from . import anki_deck, anki_sync, db, events, exporters, languages, paths, sync

CREATE_PER_ROUND = 100   # new cards made per round (each may need two audio clips cut first)
SYNC_MINUTES = 10        # how often the add-on syncs while Anki is open
_CLIP = re.compile(r"^tk-(v[0-9a-f]{1,40})-([ws])\.mp3$")
_PULLED = ("meaning", "notes", "translation", "memo")
_ZERO = {"to_anki": {"added": 0, "changed": 0, "removed": 0}, "to_tamkeen": {"added": 0, "changed": 0, "removed": 0}}


def _state() -> dict[str, Any]:
    state = db.get_setting("anki_sync_state")
    return dict(state) if isinstance(state, dict) else {}


def deck_names() -> dict[str, str]:
    """Each language's Anki deck, by language code ("es" -> "Tamkeen – Spanish"). The first time
    this is asked, the single deck there used to be ("Tamkeen", or the name given it in Settings)
    is kept for the language most saved words are in, so its cards stay where they are."""
    settings = db.get_settings()
    with db.session() as conn:  # every language's words, not only the ones on screen
        counts = {r[0]: r[1] for r in conn.execute(
            "SELECT language, COUNT(*) FROM vocab WHERE deleted = 0 AND language IS NOT NULL GROUP BY language")
            if languages.valid(r[0])}
    stored = settings.get("anki_decks")
    if not isinstance(stored, dict):
        stored = anki_sync.first_decks(str(settings.get("anki_deck") or ""), counts)
        db.set_settings({"anki_decks": stored})
    codes = set(counts) | {c for c in settings.get("learning_languages") or [] if languages.valid(c)} | {languages.study()}
    return anki_sync.deck_map(stored, sorted(codes), languages.LANGUAGES)


def deck_name() -> str:
    """The deck of the language being learned now."""
    return deck_names()[languages.study()]


def _deck_list(decks: dict[str, str]) -> list[dict[str, str]]:
    return [{"language": code, "name": name} for code, name in decks.items()]


def config() -> dict[str, Any]:
    """What the add-on needs to know before it looks at anything."""
    decks = deck_names()
    return {"enabled": bool(db.get_setting("anki_sync")), "decks": _deck_list(decks), "minutes": SYNC_MINUTES,
            "deck": decks[languages.study()]}


def _add(total: dict[str, dict[str, int]], more: dict[str, Any], side: str) -> None:
    for key in ("added", "changed", "removed"):
        try:
            total[side][key] += max(0, int(more.get(key) or 0))
        except (TypeError, ValueError):
            pass


def _progress(raw: Any, today: datetime.date) -> dict[str, Any] | None:
    """A card's schedule as the add-on read it, in the shape that is stored and shown."""
    if not isinstance(raw, dict):
        return None
    try:
        record = anki_sync.progress_record(int(raw["kind"]), int(raw["queue"]),
                                           None if raw.get("due_days") is None else int(raw["due_days"]),
                                           int(raw.get("interval") or 0), int(raw.get("reps") or 0), int(raw.get("lapses") or 0),
                                           None if raw.get("right") is None else int(raw["right"]),
                                           None if raw.get("wrong") is None else int(raw["wrong"]),
                                           str(raw["history"])[-40:] if raw.get("history") else None)
    except (KeyError, TypeError, ValueError):
        return None
    due = record["due_days"]
    record["due"] = None if due is None else (today + datetime.timedelta(days=max(-36500, min(36500, due)))).isoformat()
    record["seen"] = today.isoformat()
    return record


def _note(raw: dict[str, Any], today: datetime.date) -> dict[str, Any] | None:
    try:
        return {"id": int(raw["id"]), "guid": str(raw.get("guid") or ""), "mod": int(raw.get("mod") or 0),
                "tags": [str(t) for t in raw.get("tags") or []],
                "front": None if raw.get("front") is None else str(raw["front"]),
                "back": None if raw.get("back") is None else str(raw["back"]),
                "reps": None if raw.get("reps") is None else int(raw["reps"]),
                "language": raw.get("language") if languages.valid(raw.get("language")) else None,
                "progress": _progress(raw.get("progress"), today)}
    except (KeyError, TypeError, ValueError):
        return None


def run(body: dict[str, Any], now: float | None = None) -> dict[str, Any]:
    """One round of a sync, called by the add-on. Returns what the add-on should change in Anki."""
    now = time.time() if now is None else now
    settings = db.get_settings()
    if not settings["anki_sync"]:
        return {"enabled": False}
    decks = deck_names()
    if not isinstance(body.get("decks"), list):
        return {"enabled": False, "upgrade": True}  # an add-on from before each language had its deck
    sent = {str(d.get("language")): str(d.get("name")) for d in body["decks"] if isinstance(d, dict)}
    if sent != decks or anki_sync.deck_problem(decks):
        # The decks were renamed in Settings meanwhile (or two of them clash: then nothing is synced
        # until Settings has them apart, and the add-on stops after one more look).
        return {"enabled": not anki_sync.deck_problem(decks), "decks": _deck_list(decks), "retry": True}
    state = _state()
    collection, profile = str(body.get("col") or ""), str(body.get("profile") or "")[:80]
    if state.get("col") and state["col"] != collection:
        # A different Anki collection than the one linked (another profile, say). Nothing is read from
        # it or written to it until the learner says this is the one to sync with.
        state["other"] = {"col": collection, "profile": profile}
        db.set_settings({"anki_sync_state": state})
        events.publish("anki", {"synced": False})
        return {"enabled": True, "decks": _deck_list(decks), "paused": "collection"}
    state.update(col=collection, profile=profile, other=None)

    today = datetime.datetime.fromtimestamp(now).date()
    notes = [n for n in (_note(raw, today) for raw in body.get("notes") or [] if isinstance(raw, dict)) if n]
    deleted = {str(k): float(v or 0) for k, v in (body.get("deleted") or {}).items()}
    with db.session() as conn:
        words = db.rows_to_dicts(conn.execute("SELECT * FROM vocab").fetchall())
        links = {r["uid"]: dict(r) for r in conn.execute(
            "SELECT uid, note, tf, tb, af, ab FROM anki_links WHERE note IS NOT NULL")}
        plan = anki_sync.plan(words, notes, links, exporters.anki_fields, now=now, deleted_notes=deleted,
                              elsewhere=[str(u) for u in body.get("elsewhere") or []],
                              delete_ok=bool(settings["anki_delete_ok"]),
                              language=languages.study())
        _apply(conn, plan, "memo" in db._columns(conn, "vocab"))
        rows = {r["uid"]: r for r in conn.execute("SELECT * FROM vocab WHERE deleted = 0")}

    creates = plan["anki"]["create"][:CREATE_PER_ROUND]
    from .api.vocab import _anki_clips  # the same clips "Export for Anki" cuts, from the same cache

    clips = _anki_clips([dict(rows[c["uid"]]) for c in creates if c["uid"] in rows]) if creates else {}
    actions: dict[str, Any] = {"create": [], "update": [], "delete": [d["note"] for d in plan["anki"]["delete"]],
                               "tag": plan["anki"]["tag"], "media": []}
    for c in creates:
        names = anki_deck.clip_names(c["uid"])
        have = [names[part] for part in ("word", "sentence") if clips.get(c["uid"], {}).get(part)]
        deck = decks.get(c["language"]) or anki_sync.default_deck(c["language"], languages.LANGUAGES)
        actions["create"].append({"uid": c["uid"], "guid": c["guid"], "tags": c["tags"], "media": have, "deck": deck,
                                  "fields": {"Front": c["front"], "Back": c["back"],
                                             "TTS Input": "".join(f"[sound:{name}]" for name in have)}})
    for u in plan["anki"]["update"]:
        fields = {name: u[key] for key, name in (("front", "Front"), ("back", "Back")) if key in u}
        actions["update"].append({"note": u["note"], "fields": fields})
    # "Move Anki cards to their language's deck", when the learner asked for it (Vocab page ⋯ menu).
    misplaced = anki_sync.misplaced_cards(words, notes, plan["links"])
    if isinstance(body.get("applied"), dict) and "moved" in body["applied"]:
        state["last_move"] = {"at": now, "moved": int(body["applied"].get("moved") or 0),
                              "skipped": int(body["applied"].get("move_skipped") or 0)}
        state["move"] = False
    if state.get("move"):
        if misplaced:
            actions["move"] = [{"note": m["note"], "deck": decks[m["to"]]} for m in misplaced if m["to"] in decks]
        else:
            state.update(move=False, last_move={"at": now, "moved": 0, "skipped": 0})
    state["misplaced"] = [{"from": m["from"], "to": m["to"]} for m in misplaced]
    reply: dict[str, Any] = {"enabled": True, "decks": _deck_list(decks), "actions": actions,
                             "more": len(plan["anki"]["create"]) > len(creates)}
    if creates:  # the card layout and its font, for an Anki that does not have them yet
        reply["notetype"] = {**anki_deck._layout(), "id": 0, "did": None}
        actions["media"] = [anki_deck.FONT_NAME]

    if int(body.get("round") or 1) <= 1 or not isinstance(state.get("run"), dict):
        state["run"] = json.loads(json.dumps(_ZERO))
    _add(state["run"], plan["counts"]["to_tamkeen"], "to_tamkeen")
    if isinstance(body.get("applied"), dict):
        _add(state["run"], body["applied"], "to_anki")
    state.update(last_sync=now, last=state["run"], held=plan["held"], missing=plan["missing"], moved=plan["moved"],
                 duplicates=plan["duplicates"], skipped=plan["skipped"] + int(body.get("outside") or 0),
                 linked=len(plan["links"]))
    if any(v for side in state["run"].values() for v in side.values()):
        state["last_change"] = {"at": now, **state["run"]}
    db.set_settings({"anki_sync_state": state})
    if any(plan["tamkeen"].values()):
        sync.request()  # pass the changes on to the learner's other devices
    events.publish("anki", {"synced": True})
    return reply


def _apply(conn: Any, plan: dict[str, Any], has_memo: bool) -> None:
    """Tamkeen's share of a plan, and the new links."""
    from . import arabic

    for w in plan["tamkeen"]["add"]:
        if conn.execute("SELECT 1 FROM vocab WHERE uid = ?", (w["uid"],)).fetchone():
            continue
        conn.execute(
            "INSERT INTO vocab(uid, text, norm, sentence, meaning, notes, translation, episode_title, created_at, "
            "language) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (w["uid"], w["text"], arabic.normalize(w["text"]), w["sentence"], w["meaning"], w["notes"],
             w["translation"], "", w["created_at"],
             # the language of the deck the card was made in; failing that, what its letters say
             w["language"] if languages.valid(w.get("language")) else languages.detect(w["text"], languages.study())))
    for change in plan["tamkeen"]["update"]:
        for column, value in change["set"].items():
            if column in _PULLED and (column != "memo" or has_memo):
                conn.execute(f"UPDATE vocab SET {column} = ? WHERE uid = ?", (value, change["uid"]))
    for uid in plan["tamkeen"]["restore"]:
        conn.execute("UPDATE vocab SET deleted = 0 WHERE uid = ?", (uid,))
    for uid in plan["tamkeen"]["remove"]:
        conn.execute("UPDATE vocab SET deleted = 1 WHERE uid = ?", (uid,))  # a tombstone, as when deleted here
    conn.execute("DELETE FROM anki_links")
    for uid in set(plan["links"]) | set(plan["progress"]):
        link = plan["links"].get(uid) or {}
        progress = plan["progress"].get(uid)
        conn.execute("INSERT INTO anki_links(uid, note, tf, tb, af, ab, progress) VALUES(?,?,?,?,?,?,?)",
                     (uid, link.get("note"), link.get("tf", ""), link.get("tb", ""), link.get("af", ""), link.get("ab", ""),
                      json.dumps(progress) if progress else None))


def media(name: str) -> bytes | None:
    """A file a new card needs: the card font, or one of a word's two audio clips."""
    if name == anki_deck.FONT_NAME:
        return (paths.web_dir() / "fonts" / "NotoNaskhArabic.woff2").read_bytes()
    found = _CLIP.match(name)
    if not found:
        return None
    for path in paths.anki_clips_dir().glob(f"{found.group(1)}-{found.group(2)}-*.mp3"):
        return path.read_bytes()
    return None


def progress() -> dict[str, Any]:
    """Each word's Anki schedule as last read, by uid."""
    with db.session() as conn:
        rows = conn.execute("SELECT uid, progress FROM anki_links WHERE progress IS NOT NULL").fetchall()
    out = {}
    for r in rows:
        try:
            out[r["uid"]] = json.loads(r["progress"])
        except json.JSONDecodeError:
            continue
    return out


def _words(uids: list[str]) -> list[dict[str, Any]]:
    if not uids:
        return []
    with db.session() as conn:
        rows = conn.execute(f"SELECT uid, text, meaning FROM vocab WHERE uid IN ({','.join('?' * len(uids))})", uids).fetchall()
    return db.rows_to_dicts(rows)


def status() -> dict[str, Any]:
    """Everything Settings shows about the sync."""
    settings, state = db.get_settings(), _state()
    return {
        "enabled": bool(settings["anki_sync"]), "deck": deck_name(), "decks": _deck_list(deck_names()),
        "deck_problem": anki_sync.deck_problem(deck_names()), "delete_ok": bool(settings["anki_delete_ok"]),
        "last_sync": state.get("last_sync"), "last": state.get("last") or _ZERO, "last_change": state.get("last_change"),
        "linked": state.get("linked") or 0, "profile": state.get("profile") or "", "other": state.get("other"),
        "held": _words(list(state.get("held") or [])), "missing": _words(list(state.get("missing") or [])),
        "moved": len(state.get("moved") or []), "duplicates": state.get("duplicates") or 0, "skipped": state.get("skipped") or 0,
        "last_move": state.get("last_move"), "move_pending": bool(state.get("move")),
    }


def set_options(enabled: bool | None = None, deck: str | None = None, delete_ok: bool | None = None,
                decks: dict[str, str] | None = None) -> dict[str, Any]:
    """Switch the sync on or off, name the decks (``decks``: language -> name; ``deck`` names the
    deck of the language being learned now), and agree to deleting cards."""
    values: dict[str, Any] = {}
    if enabled is not None:
        values["anki_sync"] = bool(enabled)
    names = dict(deck_names())
    if deck is not None and deck.strip():
        names[languages.study()] = deck.strip()[:100]
    for code, name in (decks or {}).items():
        if languages.valid(code) and isinstance(name, str) and name.strip():
            names[code] = name.strip()[:100]
    if names != deck_names():
        problem = anki_sync.deck_problem(names)
        if problem:
            raise ValueError(problem)
        values["anki_decks"] = names
    if delete_ok is not None:
        values["anki_delete_ok"] = bool(delete_ok)
    if values:
        db.set_settings(values)
        events.publish("anki", {"synced": False})
    return status()


def move_info() -> dict[str, Any]:
    """How many cards sit in another language's deck (as the last sync saw), and where they would go."""
    state, decks = _state(), deck_names()
    moves: dict[str, int] = {}
    for m in state.get("misplaced") or []:
        name = decks.get(m["to"], m["to"])
        moves[name] = moves.get(name, 0) + 1
    return {"enabled": bool(db.get_setting("anki_sync")), "synced": bool(state.get("last_sync")),
            "count": sum(moves.values()), "moves": moves, "pending": bool(state.get("move")),
            "last": state.get("last_move"), "phone": False}


def request_move() -> dict[str, Any]:
    """Ask the add-on to move those cards at its next sync (it keeps their review history)."""
    state = _state()
    state["move"] = True
    db.set_settings({"anki_sync_state": state})
    events.publish("anki", {"synced": False})
    return move_info()


def linked(uid: str) -> bool:
    """Whether a word has a card in Anki, as far as the last sync saw."""
    with db.session() as conn:
        return conn.execute("SELECT 1 FROM anki_links WHERE uid = ? AND note IS NOT NULL", (uid,)).fetchone() is not None


def resolve(what: str, choice: str) -> dict[str, Any]:
    """The learner's answer to something the sync would not decide alone.

    ``held``        words deleted in Tamkeen whose cards are still in Anki:
                    "delete" removes the cards (and agrees to that from now on), "restore" brings the words back
    ``missing``     words whose cards have gone from the deck with no record of a deletion:
                    "remove" deletes the words too, "recreate" makes the cards again
    ``collection``  Anki has a different collection open than the one linked:
                    "adopt" syncs with this one from now on
    """
    state = _state()
    held, missing = list(state.get("held") or []), list(state.get("missing") or [])
    with db.session() as conn:
        if what == "held" and choice == "delete":
            db_values = {"anki_delete_ok": True}
        elif what == "held" and choice == "restore":
            conn.executemany("UPDATE vocab SET deleted = 0 WHERE uid = ?", [(u,) for u in held])
            state["held"], db_values = [], {}
        elif what == "missing" and choice in ("remove", "recreate"):
            if choice == "remove":
                conn.executemany("UPDATE vocab SET deleted = 1 WHERE uid = ?", [(u,) for u in missing])
            conn.executemany("DELETE FROM anki_links WHERE uid = ?", [(u,) for u in missing])
            state["missing"], db_values = [], {}
        elif what == "collection" and choice == "adopt" and state.get("other"):
            conn.execute("DELETE FROM anki_links")
            state.update(col=state["other"]["col"], profile=state["other"]["profile"], other=None, held=[], missing=[], moved=[])
            db_values = {}
        else:
            raise ValueError("Unknown choice.")
    db.set_settings({**db_values, "anki_sync_state": state})
    sync.request()
    events.publish("anki", {"synced": False})
    return status()
