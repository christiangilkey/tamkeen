"""The Anki deck file (.apkg) behind "Export for Anki": the cards, their layout, font and audio.

An .apkg is a zip holding a small SQLite database (``collection.anki2``, Anki's long-standing
exchange format, which every version of Anki imports) and the media files. Media files are
stored under numbers, with a ``media`` index that gives each number its real name.

Importing the same words again never changes cards that are already in Anki: each word keeps
one id (``exporters.anki_guid``) and is dated by when it was saved, so Anki's copy, with whatever
the learner has added to it there, always counts as the newer one.
"""

from __future__ import annotations

import datetime
import hashlib
import html
import io
import json
import re
import sqlite3
import tempfile
import time
import zipfile
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from . import exporters, paths

# Fixed ids, so every export lands in the same card layout and deck instead of adding copies.
MODEL_ID = 1791700000001
DECK_ID = 1791700000002
# Anki replaces a card layout only with a newer one. Raise this when web/anki-card/ changes;
# until then a layout the learner has adjusted in Anki is left alone.
LAYOUT_DATE = 1791700000
FIELDS = ("Front", "Back", "image", "TTS Input")
FONT_NAME = "_tamkeen-naskh.woff2"  # the "_" tells Anki to keep a file no note mentions

_SCHEMA = """
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null,
  ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null,
  models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null,
  usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null,
  flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null,
  mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null,
  ivl integer not null, factor integer not null, reps integer not null, lapses integer not null,
  left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null,
  ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
"""

_CONF = {"activeDecks": [1], "addToCur": True, "collapseTime": 1200, "curDeck": 1, "curModel": str(MODEL_ID),
         "dueCounts": True, "estTimes": True, "newBury": True, "newSpread": 0, "nextPos": 1,
         "sortBackwards": False, "sortType": "noteFld", "timeLim": 0}
_DECK_OPTIONS = {"1": {
    "id": 1, "name": "Default", "mod": 0, "usn": 0, "maxTaken": 60, "autoplay": True, "timer": 0, "replayq": True, "dyn": False,
    "new": {"bury": True, "delays": [1, 10], "initialFactor": 2500, "ints": [1, 4, 7], "order": 1, "perDay": 20, "separate": True},
    "lapse": {"delays": [10], "leechAction": 0, "leechFails": 8, "minInt": 1, "mult": 0},
    "rev": {"bury": True, "ease4": 1.3, "fuzz": 0.05, "ivlFct": 1, "maxIvl": 36500, "minSpace": 1, "perDay": 100},
}}


def clip_names(uid: str) -> dict[str, str]:
    """What a word's two audio files are called inside Anki."""
    return {"word": f"tk-{uid}-w.mp3", "sentence": f"tk-{uid}-s.mp3"}


def _layout() -> dict[str, Any]:
    card = paths.web_dir() / "anki-card"
    return {
        "id": MODEL_ID, "name": exporters.ANKI_NOTETYPE, "type": 0, "mod": LAYOUT_DATE, "usn": -1, "sortf": 0, "did": DECK_ID,
        "tmpls": [{"name": "Card 1", "ord": 0, "qfmt": (card / "front.html").read_text("utf-8"),
                   "afmt": (card / "back.html").read_text("utf-8"), "did": None, "bqfmt": "", "bafmt": ""}],
        "flds": [{"name": name, "ord": n, "sticky": False, "rtl": False, "font": "Arial", "size": 20, "media": []}
                 for n, name in enumerate(FIELDS)],
        "css": (card / "style.css").read_text("utf-8"),
        "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n"
                    "\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
        "latexPost": "\\end{document}", "latexsvg": False, "req": [[0, "any", [0]]], "tags": [], "vers": [],
    }


def _deck(deck_id: int, name: str, now: int) -> dict[str, Any]:
    return {"id": deck_id, "name": name, "mod": now, "usn": -1, "lrnToday": [0, 0], "revToday": [0, 0],
            "newToday": [0, 0], "timeToday": [0, 0], "collapsed": False, "browserCollapsed": False, "desc": "",
            "dyn": 0, "conf": 1, "extendNew": 0, "extendRev": 0}


def _plain(markup: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", markup)).strip()


# ----- learning progress -----
# The app's own review (the battles, web/js/game/rules.js) keeps, for each word, the box it has
# climbed to, the day it is next due, and how often it was answered right and wrong. The deck
# carries that as Anki's schedule, so a word that is well known here does not start from nothing
# there. Anki applies it only when "Import any learning progress" is ticked on its import screen.
# There is no record of each single answer, so the deck's review log stays empty.

BOX_DAYS = (0, 1, 2, 4, 8, 16, 32)  # days until a word in box n comes round again (rules.js INTERVALS)
NEW_CARD = (0, 0)                   # Anki's (type, queue) for a card never studied
REVIEW_CARD = (2, 2)
STARTING_EASE = 2500                # Anki's own starting value, in thousandths


def day_number(now: float) -> int:
    """Today as a count of local calendar days since 1970, the way rules.js `dayNumber` counts."""
    return (datetime.datetime.fromtimestamp(now).date() - datetime.date(1970, 1, 1)).days


def card_schedule(progress: Any, today: int, position: int) -> tuple[int, int, int, int, int, int, int]:
    """Anki's (type, queue, due, interval, ease, reviews, lapses) for a word.

    ``progress`` is the app's record ``[box, day next due, times right, times wrong]``, or
    nothing for a word never reviewed. A word in box 0 is as good as new, and so is anything
    that isn't a proper record. Due days are counted from the day of the export.
    """
    try:
        box, due_day, right, wrong = (int(x) for x in progress)
    except (TypeError, ValueError):
        box = 0
    if box < 1:
        return (*NEW_CARD, position, 0, 0, 0, 0)
    interval = BOX_DAYS[min(box, len(BOX_DAYS) - 1)]
    return (*REVIEW_CARD, max(0, due_day - today), interval, STARTING_EASE, max(0, right) + max(0, wrong), max(0, wrong))


def build(items: Sequence[dict[str, Any]], clips: Mapping[str, Mapping[str, bytes]] | None = None,
          now: float | None = None, review: Mapping[str, Any] | None = None, today: int | None = None) -> bytes:
    """The .apkg for these words. ``clips`` gives a word's audio by its uid:
    ``{"word": mp3 bytes, "sentence": mp3 bytes}``, either or both. ``review`` gives a word's
    learning progress by its uid (the game's ``review`` records); ``today`` is the day number
    they are measured from (worked out from ``now`` unless given)."""
    clips, review = clips or {}, review or {}
    stamp = int(time.time() if now is None else now)
    today = day_number(stamp) if today is None else today
    media: dict[str, bytes] = {FONT_NAME: (paths.web_dir() / "fonts" / "NotoNaskhArabic.woff2").read_bytes()}
    notes, cards = [], []
    for n, v in enumerate(items):
        front, back = exporters.anki_fields(v)
        names = clip_names(v["uid"])
        mine = {names[part]: data for part, data in clips.get(v["uid"], {}).items() if part in names and data}
        media.update(mine)
        sound = "".join(f"[sound:{names[part]}]" for part in ("word", "sentence") if names[part] in mine)
        saved = int(v.get("created_at") or stamp)
        note_id = stamp * 1000 + n
        sort_text = _plain(front)
        checksum = int(hashlib.sha1(sort_text.encode("utf-8")).hexdigest()[:8], 16)
        notes.append((note_id, exporters.anki_guid(v), MODEL_ID, saved, -1, f" {exporters.ANKI_TAG} ",
                      "\x1f".join((front, back, "", sound)), sort_text, checksum, 0, ""))
        cards.append((note_id, note_id, DECK_ID, 0, saved, -1, *card_schedule(review.get(v["uid"]), today, n + 1),
                      0, 0, 0, 0, ""))

    out = io.BytesIO()
    with tempfile.TemporaryDirectory() as tmp:
        db_file = Path(tmp) / "collection.anki2"
        conn = sqlite3.connect(db_file)
        try:
            conn.executescript(_SCHEMA)
            decks = {"1": _deck(1, "Default", stamp), str(DECK_ID): _deck(DECK_ID, exporters.ANKI_DECK, stamp)}
            conn.execute("INSERT INTO col VALUES(1,?,?,?,11,0,0,0,?,?,?,?,'{}')",
                         (stamp, stamp * 1000, stamp * 1000, json.dumps(_CONF), json.dumps({str(MODEL_ID): _layout()}),
                          json.dumps(decks), json.dumps(_DECK_OPTIONS)))
            conn.executemany("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)", notes)
            conn.executemany("INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", cards)
            conn.commit()
        finally:
            conn.close()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(db_file, "collection.anki2")
            index = {}
            for number, (name, data) in enumerate(media.items()):
                z.writestr(zipfile.ZipInfo(str(number)), data)  # audio is already compressed: stored as is
                index[str(number)] = name
            z.writestr("media", json.dumps(index))
    return out.getvalue()
