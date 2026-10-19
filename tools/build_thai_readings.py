"""Build the Thai reading table: how each Thai word is said, shown in small letters over Thai text.

docs/lexicon/th-readings.json.gz: every Thai word in English Wiktionary that has a Paiboon-style
romanization (with tone marks: เดี๋ยว -> dǐao, สวัสดี -> sà-wàt-dii), as extracted by Wiktextract
(https://kaikki.org, Tatu Ylonen; the text is Wiktionary's, CC BY-SA 4.0). Read by
web/js/lexicon/thai.js. The Royal Thai General System is not used: it writes no tones.

    python tools/build_thai_readings.py                    (reads kaikki.org's Thai file, about 9 MB)
    python tools/build_thai_readings.py <saved .jsonl.gz>  (from a file instead)

A word written one way but said two ways (เพลา: pao or plao) keeps every reading, most likely first
(Wiktionary's order); the app shows the first. A word the table lacks is read from shorter words that
spell it (thai.js), and two lists here keep that from going wrong:
  short   the two-letter words that may be such a piece: only the 1000 commonest (web/js/wordlists/th.js).
          Rarer ones cut words badly: กรอก is not กร + อก.
  nojoin  words from Pali or Sanskrit (Wiktionary's etymology says so) after which a join isn't trusted,
          because the compound adds a syllable: กรรมการ is gam-má-gaan, not gam + gaan. The commonest
          1000 are left out of it (ขณะที่ = ขณะ + ที่ is right).
Joined readings checked against the table's own compounds (each read from the others): 95% the same as
Wiktionary's, most of the rest a spelling of the same sound (dâai / dâi). Writes the file and adds it
to docs/lexicon/index.json.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
URL = "https://kaikki.org/dictionary/Thai/kaikki.org-dictionary-Thai.jsonl.gz"
THAI = re.compile(r"^[฀-๿]+$")  # one word of Thai letters: no spaces, digits or Latin
# A Paiboon reading: Latin letters with tone marks, syllables joined by "-" (and sometimes a space
# between two words of a set phrase).
READING = re.compile(r"^[a-zɛɔəʉŋ̀-ͯà-ɏ]+(?:[- ][a-zɛɔəʉŋ̀-ͯà-ɏ]+)*$")


def _paiboon(entry: dict) -> list[str]:
    out = []
    for s in entry.get("sounds", []):
        if "Paiboon" in s.get("raw_tags", []) and s.get("roman"):
            out.append(s["roman"])
    if not out:  # older entries keep it under forms
        out = [f["form"] for f in entry.get("forms", []) if "romanization" in f.get("tags", []) and f.get("form")]
    readings = []
    for r in out:
        for one in re.split(r"\s*[,/;]\s*|\s+or\s+", r):  # "a, b": two ways of saying it
            one = one.strip().lower()
            if one and READING.match(one) and one not in readings:
                readings.append(one)
    return readings


INDIC = re.compile(r"\b(Pali|Sanskrit)\b")
COMMON = Path(__file__).resolve().parent.parent / "web" / "js" / "wordlists" / "th.js"


def build(lines) -> dict:
    words: dict[str, list[str]] = {}
    indic: set[str] = set()
    for line in lines:
        entry = json.loads(line)
        word = entry.get("word", "")
        if not THAI.match(word):
            continue
        if INDIC.search(entry.get("etymology_text") or ""):
            indic.add(word)
        for r in _paiboon(entry):
            words.setdefault(word, [])
            if r not in words[word]:
                words[word].append(r)
    # One reading: a string; several: a list, most likely first.
    table = {w: (rs[0] if len(rs) == 1 else rs) for w, rs in sorted(words.items()) if rs}
    common = set(re.findall(r'"([^"]+)"', COMMON.read_text(encoding="utf-8")))
    return {"format": 1, "kind": "th", "name": "th", "system": "Paiboon",
            "source": "English Wiktionary via Wiktextract (kaikki.org)", "words": table,
            "short": sorted(w for w in table if len(w) == 2 and w in common),
            "nojoin": sorted(w for w in indic if w in table and w not in common)}


def main(argv: list[str]) -> None:
    if argv:
        raw = Path(argv[0]).read_bytes()
    else:
        with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "tamkeen-build"}), timeout=300) as r:
            raw = r.read()
    with gzip.open(io.BytesIO(raw), "rt", encoding="utf-8") as f:
        data = build(f)
    blob = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9, mtime=0)
    (OUT / "th-readings.json.gz").write_bytes(blob)
    several = sum(isinstance(v, list) for v in data["words"].values())
    print(f"th: {len(data['words'])} words ({several} with more than one reading), {len(blob) / 1e3:.0f} KB gzipped")
    meta = {"file": "th-readings.json.gz", "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
            "title": "Thai reading table", "db": "English Wiktionary (Wiktextract, kaikki.org): Paiboon romanization",
            "license": "CC-BY-SA-4.0", "words": len(data["words"])}
    # Read the index right before writing it: other tools add their own files to it.
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["files"]["th"] = meta
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
