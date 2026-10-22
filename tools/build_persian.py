"""Build the Persian word table: every Persian word Wiktionary has, and the forms of its verbs and nouns.

The app uses it to treat می‌خواهم, خواستم and بخواهید as one word, خواستن "to want", and کتاب‌هایم as
کتاب "book" (see web/js/lexicon/persian.js, which also takes off the endings a table can't list: the
plural, ezafe and pronoun endings joined onto any noun). It comes from two open data sets:

  - the English Wiktionary as extracted by Wiktextract (https://kaikki.org, Tatu Ylonen; Wiktionary's
    text is CC BY-SA 4.0): Persian headwords, and the conjugation tables of its verbs (present,
    past, subjunctive, perfect, imperative, participles, with their negative and colloquial forms),
    nouns' plurals and possessive forms, adjectives' comparatives;
  - wordfreq (https://github.com/rspeer/wordfreq, CC BY-SA 4.0) word counts, to keep the forms people
    actually meet, and to choose between two dictionary forms for one spelling by how common each is.

    pip install wordfreq
    python tools/build_persian.py [kaikki.org-dictionary-Persian.jsonl.gz]   (default: read from kaikki.org)

Words are kept as the app matches them (persianKey in web/js/lexicon/persian.js, `key` below): Persian
letters (ک ی for ك ي), no short-vowel marks, and no half space (ZWNJ), so می‌خواهم and میخواهم are one;
`shown` keeps the half space where a dictionary form has one. Writes docs/lexicon/fa-lemmas.json.gz and
adds it to docs/lexicon/index.json. CC BY-SA 4.0, like Wiktionary.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import math
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
URL = "https://kaikki.org/dictionary/Persian/kaikki.org-dictionary-Persian.jsonl.gz"
FORMAT = 1

_MARKS = re.compile("[ً-ٰٟـ]")  # short vowels, tanween, shadda, sukun, superscript alef, tatweel
_INVISIBLE = re.compile("[​-‏­⁠﻿]")  # half space (ZWNJ) and its look-alikes
_LETTERS = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ۀ": "ه", "ة": "ه"})
_WORD = re.compile("^[ء-غف-يپچژکگیآأؤئةۀ]+$")
# Forms of a verb that are not words of running text by themselves (a stem appears only inside words).
_SKIP_TAGS = {"romanization", "Cyrillic", "Tajik", "table-tags", "inflection-template", "stem", "error-unrecognized-form",
              "misspelling", "obsolete", "archaic"}
# Common words that are also a common verb's form, where the word is meant far more often (checked by hand on
# the list `--report` prints): مرد "man" and مردم "people" (also "he died", "I died"), نشست "meeting" (also "sat
# down"), سوخت "fuel", شدید "severe" (also "you became"), کشتی "ship", هشت "eight", درود "greeting".
OWN = {"مرد", "مردم", "مردی", "نشست", "سوخت", "شدید", "کشتی", "هشت", "هشتم", "درود", "رستم", "شست", "بینی", "میکده"}
# ...and a spelling two verbs share, where one is meant far more often: کند "does" (کردن), not "dug" (کندن).
PREFER = {"کند": "کردن"}
COMMON_VERBS = 600  # every form of these is kept (see build)
TOP_VERBS = 60      # these verbs' forms win over a dictionary word of the same spelling (see build)
ENDINGS = ("م", "ت", "ش", "ی", "یم", "ید", "ند", "مان", "تان", "شان", "ه", "ن")  # pronoun and person endings


def key(word: str) -> str:
    """The form a Persian word is matched in. Must agree with persianKey() in web/js/lexicon/persian.js."""
    w = unicodedata.normalize("NFC", (word or "").strip()).translate(_LETTERS)
    return _INVISIBLE.sub("", _MARKS.sub("", w))


def pieces(form: str) -> list[str]:
    """A table cell as single words: "کتابهایم، کتابایم (kitāb-hā́yam, kitābā́ym^△)" -> both spellings."""
    form = re.sub(r"\([^)]*\)", " ", form or "").replace("^△", " ")
    out = []
    for part in re.split("[،,/]", form):
        part = part.strip()
        if part and " " not in part and _WORD.match(key(part)):
            out.append(key(part))
    return out


def plainness(tags: set[str]) -> int:
    """How plain a verb form is: 3 for the past, the present with می and the perfect, with a person (کرد,
    می‌کنم, کرده‌ام); 2 for the participles and the infinitive (کرده, کننده), which are often words of their own
    (آینده "future", نویسنده "writer"); 1 for the other written forms (aorist, subjunctive, imperative); 0 for
    spoken and regional ones (برم, میگه)."""
    if tags & {"colloquial", "dialectal", "Tehrani", "Dari", "poetic", "literary", "nonstandard", "rare", "dated"}:
        return 0
    if tags & {"aorist", "subjunctive", "imperative"}:
        return 1
    return 3 if tags & {"first-person", "second-person", "third-person"} else 2


def read_lines(source: str):
    if re.match(r"https?://", source):
        req = urllib.request.Request(source, headers={"User-Agent": "Tamkeen dictionary builder (github.com/christiangilkey/tamkeen)"})
        raw = urllib.request.urlopen(req, timeout=120)
    else:
        raw = open(source, "rb")
    with gzip.GzipFile(fileobj=raw) as gz:
        for line in io.TextIOWrapper(gz, encoding="utf-8"):
            yield line


def build(source: str) -> dict:
    from wordfreq import get_frequency_dict  # pip install wordfreq (only to build the table)

    freq: dict[str, float] = {}
    for w, f in get_frequency_dict("fa").items():  # (wordfreq counts می‌خواهم and میخواهم apart: one word here)
        k = key(w)
        freq[k] = freq.get(k, 0.0) + f

    def zipf(k: str) -> float:
        return 9 + math.log10(freq[k]) if freq.get(k) else 0.0

    lemmas: dict[str, str] = {}               # lemma key -> how it is written (with its half space)
    verb_of: dict[str, dict[str, int]] = {}   # form -> {verb whose table has it: how plain a form it is, 0-2}
    form_of: dict[str, set[str]] = {}         # form -> the nouns and adjectives it is a form of
    stems_of: dict[str, set[str]] = {}        # a present or past stem (خواه, خواست) -> its verbs (خواستن)
    for line in read_lines(source):
        e = json.loads(line)
        word = e.get("word") or ""
        if e.get("lang_code") != "fa" or " " in word.strip():
            continue
        k = key(word)
        if not _WORD.match(k):
            continue
        pos = e.get("pos", "")
        senses = e.get("senses") or []
        target = next((t["word"] for s in senses for t in (s.get("form_of") or []) if t.get("word")), "")
        if target and all(s.get("form_of") for s in senses if s.get("glosses")):
            tk = key(target)
            tags = {t for s in senses for t in s.get("tags") or []}
            if _WORD.match(tk) and tk != k and not tags & _SKIP_TAGS:  # a form with an entry of its own (می‌خواهم: form of خواستن)
                if pos == "verb":
                    row = verb_of.setdefault(k, {})
                    row[tk] = max(row.get(tk, 0), plainness(tags))
                else:
                    form_of.setdefault(k, set()).add(tk)
            continue
        if pos in ("character", "symbol", "punct", "romanization", "suffix", "prefix", "interfix", "letter"):
            continue  # (names stay: ایران is a word, not ایر + ان)
        lemmas.setdefault(k, word.strip() if "‌" in word else k)
        for f in e.get("forms") or []:
            tags = set(f.get("tags") or [])
            if pos == "verb" and {"stem"} <= tags and tags & {"present", "past"}:
                for p in pieces(f.get("form", "")):
                    stems_of.setdefault(p, set()).add(k)
            if tags & _SKIP_TAGS or f.get("form") in ("no-table-tags",):
                continue
            for p in pieces(f.get("form", "")):
                if p == k:
                    continue
                if f.get("source") == "conjugation":
                    plain = plainness(tags)
                    row = verb_of.setdefault(p, {})
                    row[k] = max(row.get(k, 0), plain)
                else:
                    form_of.setdefault(p, set()).add(k)

    common = set(freq)
    ids: dict[str, int] = {}
    order = sorted(lemmas, key=lambda k: (-zipf(k), k))  # commonest first
    for k in order:
        ids[k] = len(ids)
    # Every form of the commonest verbs is kept (a verb has a hundred, and wordfreq has met only some of
    # each); of the others, the forms wordfreq has met.
    verbs_by_use = sorted({v for vs in verb_of.values() for v in vs if v in ids}, key=lambda v: -zipf(v))
    common_verbs = set(verbs_by_use[:COMMON_VERBS])
    top_verbs = set(verbs_by_use[:TOP_VERBS])
    forms: dict[str, int] = {}
    for form in sorted(set(verb_of) | set(form_of)):
        verbs = {v: plain for v, plain in verb_of.get(form, {}).items() if v in ids}
        others = sorted(o for o in form_of.get(form, ()) if o in ids)
        # A spelling that is a dictionary word of its own stays itself (روی "on", not "you go"; رود "river"; روند
        # "process"; آینده "future"; خوبی "goodness"), unless it is the past, the present with می or the perfect,
        # with a person, of one of the commonest verbs: those are far more common than any word they look like
        # (کرد "did", not "Kurd"; بود "was"; برد "took"). Otherwise: the verb whose plainest form it is, the
        # commonest when several; then a noun's or adjective's form.
        if form in PREFER:
            forms[form] = ids[PREFER[form]]
            continue
        if form in ids:
            verbs = {v: p for v, p in verbs.items() if p == 3 and v in top_verbs}
        elif not re.match("^(?:ن|می|ب)", form) and any(form.endswith(e) and form[: -len(e)] in ids for e in ENDINGS):
            # (an old-style present with nothing in front, کارم "I plant", is a noun with an ending: "my work")
            verbs = {v: p for v, p in verbs.items() if p >= 2}
        if verbs and form not in OWN:
            best = max(verbs, key=lambda v: (verbs[v], zipf(v), v))
        elif form in ids:
            continue
        elif others:
            best = max(others, key=lambda v: (zipf(v), v))
        else:
            continue
        if form in common or best in common_verbs:
            forms[form] = ids[best]
            if REPORT and form in ids:
                REPORT.append((zipf(form), form, best))
    shown = {k: w for k, w in lemmas.items() if w != k}
    # Every verb's two stems, so the app can take apart the forms the table leaves out (persian.js): the
    # commonest verb when two share a stem (بر: بردن "carry" before بریدن "cut").
    stems = {s: ids[max((v for v in vs if v in ids), key=lambda v: (zipf(v), v))]
             for s, vs in sorted(stems_of.items()) if len(s) >= 2 and any(v in ids for v in vs)}
    return {"format": FORMAT, "kind": "lemmas", "name": "fa", "lang": "fa", "title": "Persian", "license": "CC-BY-SA-4.0",
            "lemmas": order, "forms": forms, "shown": shown, "stems": stems}


REPORT: list = []  # --report: the dictionary words that are counted as a verb's form, commonest first


def main(args: list[str]) -> None:
    if "--report" in args:
        args = [a for a in args if a != "--report"]
        REPORT.append(None)
    source = args[0] if args else URL
    data = build(source)
    if REPORT:
        for z, form, verb in sorted(r for r in REPORT if r)[::-1][:120]:
            print(f"  {z:.1f} {form} -> {verb}")
    blob = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)
    file = "fa-lemmas.json.gz"
    (OUT / file).write_bytes(blob)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["files"]["fa"] = {"file": file, "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
                            "title": "Persian word forms", "db": "Wiktionary (Wiktextract) + wordfreq",
                            "license": data["license"], "forms": len(data["forms"]), "lexemes": len(data["lemmas"])}
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{file}: {len(blob) / 1e6:.2f} MB, {len(data['forms']):,} forms, {len(data['lemmas']):,} dictionary forms")


if __name__ == "__main__":
    main(sys.argv[1:])
