"""What has been listened to, watched and read, and how far: shared by the user's devices through the Drive sync.

Each page keeps its own copy in the browser (web/js/progress.js: how far; web/js/watched.js: finished), keyed by the
episode's id on that device. Those copies used to stay on the device, so a podcast finished on the phone was still
"new" on the computer ("Listened to 0"). Now the page sends what changed to its app (POST /api/listening, below; the
phone's twin is mobile/src/js/backend.js), which keeps it here by the episode's uid (the same on every device), and the
sync (app/sync/engine.py "listening") carries it to the other devices, whose pages take it in (web/js/listensync.js).

One record per episode uid: {kind, ts, pos, dur, frac, done, title, sub}
    kind   "audio", "video" or "page"
    ts     when it was last played, watched or read (ms)
    pos    how far, in whole seconds (audio and video); dur its length in whole seconds
    frac   how far through a page or book, 0..1 (the furthest point seen)
    done   when it was finished (ms), 0 if not: once finished it stays finished
    title, sub  its title and where it is from (for "Continue"), at most 200 characters each

Two copies merge item by item: the one used last wins, but "finished" and a page's furthest point are kept from both.
web/js/listening.js cleanState / mergeState are the twins of clean_state / merge_state
(tests/fixtures/listening_cases.json keeps them in step).
"""

from __future__ import annotations

import json
import re
import sqlite3
from typing import Any

KINDS = ("audio", "video", "page")
UID = re.compile(r"[\w-]{1,64}", re.ASCII)
TEXT_MAX = 200
UNFINISHED_KEPT = 1000   # the newest this many not-yet-finished items (finished ones are all kept)
MOST = 20000             # and never more than this many in all (the newest), so the synced file stays small


def _int(x: Any) -> int:
    """A whole, non-negative number (towards zero, like JavaScript's Math.trunc); anything else is 0 (a number written
    as text too: the two languages read those differently)."""
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return 0
    n = float(x)
    if n != n or n in (float("inf"), float("-inf")) or n <= 0:
        return 0
    return int(min(n, 9e15))


def _frac(x: Any) -> float | int:
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return 0
    n = float(x)
    if n != n or n <= 0:
        return 0
    if n >= 1:
        return 1
    return n


def _text(x: Any) -> str:
    return x.strip()[:TEXT_MAX] if isinstance(x, str) else ""


def clean_entry(rec: Any) -> dict[str, Any] | None:
    """One record made safe, or None when it says nothing (never played, never finished)."""
    if not isinstance(rec, dict):
        return None
    out = {"kind": rec.get("kind") if rec.get("kind") in KINDS else "audio",
           "ts": _int(rec.get("ts")), "pos": _int(rec.get("pos")), "dur": _int(rec.get("dur")),
           "frac": _frac(rec.get("frac")), "done": _int(rec.get("done")),
           "title": _text(rec.get("title")), "sub": _text(rec.get("sub"))}
    if not out["ts"] and not out["done"]:
        return None
    return out


def clean_state(state: Any) -> dict[str, dict[str, Any]]:
    """All records made safe, in uid order: finished ones all kept, unfinished ones the newest UNFINISHED_KEPT,
    never more than MOST in all."""
    if not isinstance(state, dict):
        return {}
    good: dict[str, dict[str, Any]] = {}
    for uid, rec in state.items():
        if isinstance(uid, str) and UID.fullmatch(uid):
            entry = clean_entry(rec)
            if entry is not None:
                good[uid] = entry
    newest = sorted(good, key=lambda u: (good[u]["ts"], good[u]["done"], u), reverse=True)
    unfinished = [u for u in newest if not good[u]["done"]][UNFINISHED_KEPT:]
    dropped = set(unfinished) | set(newest[MOST:])
    return {u: good[u] for u in sorted(good) if u not in dropped}


def _rank(e: dict[str, Any]) -> tuple:
    return (e["ts"], e["done"], e["frac"], e["pos"], e["dur"], e["kind"], e["title"], e["sub"])


def merge_entry(a: dict[str, Any] | None, b: dict[str, Any] | None) -> dict[str, Any] | None:
    """Two clean records of one item as one: the one used last (on a tie, the larger by _rank, so every device
    agrees), with "finished" and the furthest point of a page kept from both."""
    if a is None or b is None:
        return a or b
    win = a if _rank(a) >= _rank(b) else b
    return {**win, "done": max(a["done"], b["done"]), "frac": max(a["frac"], b["frac"])}


def merge_state(mine: Any, theirs: Any) -> dict[str, dict[str, Any]]:
    a, b = clean_state(mine), clean_state(theirs)
    out = dict(a)
    for uid, rec in b.items():
        out[uid] = merge_entry(out.get(uid), rec)
    return clean_state(out)


# ---------------------------------------------------------------------------------- kept on this computer

def load(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    """What is kept (table listening, app/db.py)."""
    out: dict[str, Any] = {}
    for r in conn.execute("SELECT uid, data FROM listening"):
        try:
            out[r[0]] = json.loads(r[1])
        except json.JSONDecodeError:
            continue
    return clean_state(out)


def store(conn: sqlite3.Connection, before: dict[str, dict[str, Any]], after: dict[str, dict[str, Any]]) -> int:
    """Write `after` over `before` (both clean): only the rows that changed. Returns how many changed."""
    n = 0
    for uid in before.keys() - after.keys():
        conn.execute("DELETE FROM listening WHERE uid = ?", (uid,))
        n += 1
    for uid, rec in after.items():
        if before.get(uid) != rec:
            conn.execute("INSERT INTO listening(uid, data) VALUES(?, ?) ON CONFLICT(uid) DO UPDATE SET data = excluded.data",
                         (uid, json.dumps(rec, ensure_ascii=False, sort_keys=True)))
            n += 1
    return n


def merge_into(conn: sqlite3.Connection, theirs: Any) -> int:
    """Merge records into what is kept. Returns how many rows changed."""
    before = load(conn)
    return store(conn, before, merge_state(before, theirs))
