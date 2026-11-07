"""Read a DLI Anki deck (.apkg) into a Tamkeen DLI vocabulary deck: its words, grouped by chapter.

Made for the DLI student feature (2026-11-07): the owner gave five Anki decks of the DLI basic courses
(Arabic, Chinese, Farsi, Korean, Spanish). Each becomes one deck in the private content folder,

    ../dli-content/<language>/<deck id>/deck.json

which the packaging tool (tools/dli/encrypt.mjs) encrypts into the app. The learner's Vocab tab then
gets one folder per chapter (web/js/dlicontent.js). This script holds no deck content itself, only how
each deck marks its chapters; the decks and everything made from them stay outside the repository.

    .venv/Scripts/python -I tools/dli/anki_decks.py ar  path/to/deck.apkg  [--out ../dli-content]

deck.json:
  { "deck": 1, "id": "ar-basic", "language": "ar", "title": ..., "short": "DLI Arabic", "made_from": ...,
    "chapters": [{"id": "c001", "title": "Sound and Script 1", "words": [1, 2, ...]}, ...],
    "words": [{"n": 1, "word": ..., "meaning": ..., "notes": ..., "chapters": ["c001"], "anki": [note ids]}] }
A word is numbered once (n), in the order of its first chapter; a word found in several chapters (or
twice in the deck) is one word listed in each. Running it again gives the same numbers as long as the
deck is the same. The sentences are written separately, chapter by chapter, in sentences/<chapter>.json
(tools/dli/DECKS.md), so this file can be made again without losing them.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sqlite3
import sys
import tempfile
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT.parent / "dli-content"

BLOCK = re.compile(r"<\s*(br|/?div|/?p|/?li|/?tr|/?td)\b[^>]*>", re.I)
TAG = re.compile(r"<[^>]+>")
PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def clean(text: str, block: str = " ") -> str:
    """A field's text without its HTML: line breaks and blocks become `block`, other tags go, entities are
    read, spaces are made single."""
    t = re.sub(r"\[sound:[^\]]*\]", "", text or "")
    t = BLOCK.sub(block, t)
    t = TAG.sub("", t)
    t = html.unescape(t).replace(" ", " ")
    t = unicodedata.normalize("NFC", t)
    t = re.sub(r"(^|(?<=\s))[ً-ْٰ]+", "", t)  # (a stray vowel mark before a word: a typo in the deck)
    if block.strip():
        parts = [re.sub(r"\s+", " ", p).strip() for p in t.split(block.strip())]
        return block.strip().join(p for p in parts if p)
    return re.sub(r"\s+", " ", t).strip()


def open_collection(apkg: Path, tmp: Path) -> sqlite3.Connection:
    with zipfile.ZipFile(apkg) as z:
        names = z.namelist()
        name = "collection.anki21" if "collection.anki21" in names else "collection.anki2"
        if name not in names:
            sys.exit(f"{apkg} has no Anki collection inside (a newer .anki21b deck? export it with 'support older Anki versions').")
        path = tmp / name
        path.write_bytes(z.read(name))
    return sqlite3.connect(path)


def notes(conn: sqlite3.Connection) -> list[dict]:
    models = json.loads(conn.execute("SELECT models FROM col").fetchone()[0])
    decks = {int(k): v["name"] for k, v in json.loads(conn.execute("SELECT decks FROM col").fetchone()[0]).items()}
    first_deck = {}
    for nid, did in conn.execute("SELECT nid, did FROM cards ORDER BY ord, id"):
        first_deck.setdefault(nid, decks.get(did, ""))
    out = []
    for nid, mid, flds, tags in conn.execute("SELECT id, mid, flds, tags FROM notes ORDER BY id"):
        m = models[str(mid)]
        fields = dict(zip([f["name"] for f in m["flds"]], flds.split("\x1f")))
        out.append({"id": nid, "model": m["name"], "f": fields, "tags": tags.split(), "deck": first_deck.get(nid, "")})
    return out


# ---------- each deck: its words and how it marks chapters ----------
# A chapter key is (order, id-part, title); words map to one or more keys.

def arabic(rows: list[dict]):
    """DLIFLC MSA (note type Hafez): tags Chapter<N>Unit<U>[Verbs|Old|New|...], SoundAndScriptLesson<N>,
    SemIiiLesson<N>, GregorianAndAssyrianMonthsUnit2, AllVerbsInTheCourse; Level<NNN> gives the order."""
    words = []
    for r in rows:
        f = r["f"]
        keys = []
        level = min([int(t[5:]) for t in r["tags"] if re.fullmatch(r"Level\d+", t)] or [999])
        for t in r["tags"]:
            t = t.rstrip("`")
            if m := re.fullmatch(r"SoundAndScriptLesson(\d+)", t):
                keys.append(((0, int(m[1])), f"Sound and Script {m[1]}"))
            elif m := re.fullmatch(r"Chapter(\d+)(?:New|Old)?Unit(\d+)(?:Verbs|Old|New|OldCurriculum|Short)?", t):
                keys.append(((1, int(m[1])), f"Chapter {m[1]} (Unit {m[2]})"))
            elif t == "GregorianAndAssyrianMonthsUnit2":
                keys.append(((1, 10.5), "Unit 2: the months"))
            elif m := re.fullmatch(r"SemIiiLesson(\d+)", t):
                keys.append(((2, int(m[1])), f"Semester 3, Lesson {m[1]}"))
            elif t == "AllVerbsInTheCourse":
                keys.append(((3, 0), "All the verbs in the course"))
        if not keys or not clean(f.get("Arabic", "")):
            continue
        notes_ = []
        meaning = clean(f.get("English", ""))
        if plural := clean(f.get("Plurals", "")):
            # (the deck's Plurals column holds a verb's related forms, not plurals)
            notes_.append(f"{'Related' if meaning.lower().startswith('to ') else 'Plural'}: {plural}")
        if extra := clean(f.get("Notes", "")):
            notes_.append(extra[:300])
        words.append({"word": clean(f["Arabic"]), "meaning": meaning, "notes": " · ".join(notes_),
                      "keys": keys, "anki": r["id"], "level": level})
    return words


ZH_TOPICS = {"culture": "Culture", "economics": "Economics", "economy": "Economics", "geography": "Geography",
             "geology": "Geology", "military": "Military", "politics": "Politics", "政治": "Politics", "science": "Science",
             "地理": "Geography", "社会": "Society", "经济": "Economy", "军事": "Military", "安全": "Security",
             "文化": "Culture", "环境": "Environment", "科学": "Science", "anti-terrorism": "Anti-terrorism",
             "disaster": "Disasters", "": "More words"}


def chinese(rows: list[dict]):
    """DLI Mandarin Table: fields Unit and Lesson. Lessons 1-66 make Units 1-11 (six lessons a unit; the
    lesson number decides, as the Unit field is off for a few); Unit 12, the GLOSS lists and the
    handbook lists go by topic; chengyu have their own chapter."""
    words = []
    for r in rows:
        f = r["f"]
        unit, lesson = clean(f.get("Unit", "")), clean(f.get("Lesson", ""))
        if unit.isdigit() and lesson.isdigit() and int(unit) > int(lesson):
            unit, lesson = lesson, unit  # ("63", "11"): the two swapped
        if lesson.isdigit() and 1 <= int(lesson) <= 66:
            n = int(lesson)
            key = ((1, n), f"Unit {(n - 1) // 6 + 1}, Lesson {n}")
        elif unit.isdigit() and int(unit) >= 12:
            topic = ZH_TOPICS.get(lesson, lesson.title())
            key = ((2, topic), f"Unit 12: {topic}")
        elif unit.lower() in ("gloss", "security"):
            topic = ZH_TOPICS.get(lesson or "安全", lesson)
            key = ((3, topic), f"GLOSS: {topic}")
        elif unit == "handbook":
            topic = ZH_TOPICS.get(lesson, lesson)
            key = ((4, topic), f"Handbook: {topic}")
        elif unit in ("chengyu", "成语"):
            key = ((5, 0), "Chengyu (idioms)")
        else:
            key = ((6, 0), "More words")
        simp = clean(f.get("Simplified", ""))
        trad = clean(f.get("Traditional", ""))
        if not simp or simp == "--":
            simp = trad
        if not simp or simp == "--":
            continue
        pinyin = clean(f.get("Pinyin", ""))
        notes_ = [x for x in (pinyin, clean(f.get("PartOfSpeech", "")),
                              f"Traditional: {trad}" if trad and trad not in ("--", simp) else "") if x]
        words.append({"word": simp, "meaning": clean(f.get("English", "")), "notes": " · ".join(notes_),
                      "keys": [key], "anki": r["id"], "same": (simp, re.sub(r"\s+", "", pinyin.lower()))})
    return words


SMALLEST_PART = 20


def spanish(rows: list[dict]):
    """DLI All Spanish Vocab (Basic: Front English, Back Spanish): no chapters in the deck. Its maker added
    the words week by week through the course (February to August 2020), so the folders follow those
    weeks, as Part 1, Part 2... (a week with fewer than SMALLEST_PART words joins the one before it)."""
    kept = [r for r in rows if clean(r["f"].get("Back", ""))]
    week_of = [dt.datetime.fromtimestamp(r["id"] / 1000).isocalendar()[:2] for r in kept]
    sizes: dict[tuple, int] = {}
    for w in week_of:
        sizes[w] = sizes.get(w, 0) + 1
    part_of: dict[tuple, int] = {}
    part = 0
    for w in sizes:  # (in the order the weeks came)
        if part == 0 or sizes[w] >= SMALLEST_PART:
            part += 1
        part_of[w] = part
    words = []
    for r, week in zip(kept, week_of):
        f = r["f"]
        n = part_of[week]
        words.append({"word": clean(f["Back"]), "meaning": clean(f.get("Front", "")), "notes": "",
                      "keys": [((1, n), f"Part {n}")], "anki": r["id"]})
    return words


def farsi(rows: list[dict]):
    """Farsi Vocab: sub-decks Semester N::Unit U::Chapter C (some numbered in Persian digits) and Sound and Script."""
    words = []
    for r in rows:
        f = r["f"]
        path = r["deck"].translate(PERSIAN_DIGITS).split("::")
        last = path[-1]
        unit = next((p for p in path if p.startswith("Unit ")), "")
        if m := re.fullmatch(r"Chapter (\d+)", last):
            key = ((1, int(m[1])), f"Chapter {m[1]} ({unit})" if unit else f"Chapter {m[1]}")
        elif last == "Sound and Script":
            key = ((0, 0), "Sound and Script")
        else:
            continue
        word = clean(f.get("Front", ""))
        if word:
            words.append({"word": word, "meaning": clean(f.get("Back", "")), "notes": "", "keys": [key], "anki": r["id"]})
    return words


HANJA = re.compile(r"[㐀-鿿豈-﫿]+")


def korean(rows: list[dict]):
    """DLI Korean: tags Chapter_N (with Unit_U, Units 1-14) and Unit_U:Lesson_N (Units 15-18). The fields'
    <div>s are the printed table's line breaks; Chinese characters (hanja) go to the notes."""
    words = []
    for r in rows:
        f = r["f"]
        unit = next((int(t[5:]) for t in r["tags"] if re.fullmatch(r"Unit_\d+", t)), 0)
        keys = []
        for t in r["tags"]:
            if m := re.fullmatch(r"Chapter_(\d+)", t):
                keys.append(((1, int(m[1])), f"Chapter {m[1]} (Unit {unit})" if unit else f"Chapter {m[1]}"))
            elif m := re.fullmatch(r"Unit_(\d+):Lesson_(\d+)", t):
                keys.append(((2, int(m[1]), int(m[2])), f"Unit {m[1]}, Lesson {m[2]}"))
        raw = clean(f.get("Korean") or f.get("Sino-Korean") or "")
        hanja = " ".join(HANJA.findall(raw))
        word = re.sub(r"\s+", " ", HANJA.sub(" ", raw)).strip()
        word = re.sub(r"\s*/\s*", " / ", word).strip(" /")
        if not keys or not word:
            continue
        notes_ = [f"Hanja: {hanja}"] if hanja else []
        if r["model"] == "Sino-Korean Vocabulary":
            notes_.append("Sino-Korean")
        words.append({"word": word, "meaning": clean(f.get("English", "")), "notes": " · ".join(notes_),
                      "keys": keys, "anki": r["id"]})
    return words


DECKS = {
    "ar": {"id": "ar-basic", "title": "DLI Arabic Basic Course (MSA, second edition)", "short": "DLI Arabic", "read": arabic},
    "zh": {"id": "zh-basic", "title": "DLI Chinese Mandarin Basic Course", "short": "DLI Chinese", "read": chinese},
    "es": {"id": "es-basic", "title": "DLI Spanish Basic Course vocabulary", "short": "DLI Spanish", "read": spanish},
    "fa": {"id": "fa-basic", "title": "DLI Farsi Basic Course", "short": "DLI Farsi", "read": farsi},
    "ko": {"id": "ko-basic", "title": "DLI Korean Basic Course", "short": "DLI Korean", "read": korean},
}


def build(code: str, apkg: Path) -> dict:
    spec = DECKS[code]
    with tempfile.TemporaryDirectory() as tmp:
        conn = open_collection(apkg, Path(tmp))
        rows = notes(conn)
        conn.close()
    raw = spec["read"](rows)
    # Chapters in course order, numbered c001...
    keys = {}
    for w in raw:
        for order, title in w["keys"]:
            keys.setdefault(order, title)
    ordered = sorted(keys, key=lambda o: tuple((0, x) if isinstance(x, (int, float)) else (1, str(x)) for x in o))
    cid = {o: f"c{i + 1:03d}" for i, o in enumerate(ordered)}
    # One word for the same text in the same chapter list... and the same word met twice (Chinese marks them).
    merged: dict = {}
    for w in raw:
        same = w.get("same") or (w["word"], w["meaning"].lower())
        if same in merged:
            m = merged[same]
            m["keys"] += [k for k in w["keys"] if k not in m["keys"]]
            m["anki"].append(w["anki"])
            if w["meaning"] and w["meaning"].lower() not in m["meaning"].lower():
                m["meaning"] = f"{m['meaning']}; {w['meaning']}" if m["meaning"] else w["meaning"]
            continue
        merged[same] = {**w, "anki": [w["anki"]]}
    order_of = {o: i for i, o in enumerate(ordered)}
    items = list(merged.values())
    for w in items:
        w["keys"] = sorted({k[0]: k for k in w["keys"]}.values(), key=lambda k: order_of[k[0]])
    items.sort(key=lambda w: (order_of[w["keys"][0][0]], w.get("level", 0), w["anki"][0]))
    chapters = {cid[o]: {"id": cid[o], "title": keys[o], "words": []} for o in ordered}
    words = []
    for n, w in enumerate(items, 1):
        chs = [cid[k[0]] for k in w["keys"]]
        for c in chs:
            chapters[c]["words"].append(n)
        words.append({"n": n, "word": w["word"][:200], "meaning": w["meaning"][:500], "notes": w["notes"][:1000],
                      "chapters": chs, "anki": w["anki"]})
    return {"deck": 1, "id": spec["id"], "language": code, "title": spec["title"], "short": spec["short"],
            "made_from": apkg.name, "chapters": list(chapters.values()), "words": words}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("language", choices=sorted(DECKS))
    p.add_argument("apkg", type=Path)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--force", action="store_true", help="write even if words that have sentences would be renumbered")
    a = p.parse_args()
    deck = build(a.language, a.apkg)
    folder = a.out / a.language / deck["id"]
    if ROOT in folder.resolve().parents:
        sys.exit("The deck's words must stay outside the repository (it is public).")
    folder.mkdir(parents=True, exist_ok=True)
    old_file = folder / "deck.json"
    if old_file.exists() and any((folder / "sentences").glob("*.json")) and not a.force:
        # Sentences are written against the words' numbers: they must not move.
        old = {w["n"]: w["word"] for w in json.loads(old_file.read_text(encoding="utf-8"))["words"]}
        moved = [n for n, w in old.items() if n > len(deck["words"]) or deck["words"][n - 1]["word"] != w]
        if moved:
            sys.exit(f"This would renumber {len(moved)} words that sentences are written for (first: {moved[:5]}). "
                     "Nothing written; --force to do it anyway.")
    (folder / "deck.json").write_text(json.dumps(deck, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{deck['title']}: {len(deck['words'])} words in {len(deck['chapters'])} chapters -> {folder / 'deck.json'}")
    for c in deck["chapters"]:
        first = sum(1 for n in c["words"] if deck["words"][n - 1]["chapters"][0] == c["id"])
        print(f"  {c['id']}  {len(c['words']):4d} words ({first:4d} first met here)  {c['title']}")


if __name__ == "__main__":
    main()
