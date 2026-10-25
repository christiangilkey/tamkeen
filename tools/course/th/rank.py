"""The ranked list for the Thai basics course: tools/course/build/th-ranked.json (and a .tsv to read).

    python tools/course/th/rank.py path/to/tnc_freq.txt

Thai isn't in wordfreq. Its counts are the Thai National Corpus word counts as PyThaiNLP publishes them
(pythainlp/corpus/tnc_freq.txt, CC0: word <tab> count), the same source as web/js/wordlists/th.js, with
the same filters (tools/make_wordlists.py): Thai letters only, no lone letters, no pieces that start with
a vowel sign or tone mark. So ranks 1-1000 are th.js; the list goes on to 3000 for the words left out.
Thai has no inflection, so each word is its own dictionary form; each row also carries the word's
reading (Paiboon) and first meanings from docs/lexicon (Wiktionary), to help choose.
"""

from __future__ import annotations

import gzip
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
OUT = HERE.parent / "build"
SIZE = 3000

THAI = re.compile(r"[ก-๎]+")
ONE = {"ณ", "ก", "ธ"}  # one-letter words (make_wordlists.py TH_ONE)
MARKS = "ะาำิีึืุู็่้๊๋์ั"


def keep(word: str) -> bool:
    if not THAI.fullmatch(word):
        return False
    return not (len(word) == 1 and word not in ONE or word[0] in MARKS)


def main() -> None:
    src = Path(sys.argv[1])
    lex = ROOT / "docs" / "lexicon"
    readings = json.load(gzip.open(lex / "th-readings.json.gz", "rt", encoding="utf-8"))["words"]
    meanings = json.load(gzip.open(lex / "th-meanings.json.gz", "rt", encoding="utf-8"))["words"]
    rows, seen = [], set()
    for line in src.read_text(encoding="utf-8-sig").splitlines():
        word, _, count = line.partition("\t")
        word = word.strip().lower()
        if not word or word in seen or not keep(word):
            continue
        seen.add(word)
        r = readings.get(word, "")
        r = r[0] if isinstance(r, list) else r
        m = "; ".join(f"{pos}: {', '.join(senses[:2])}" for _w, pos, senses, *_ in meanings.get(word, [])[:3])
        rows.append({"rank": len(rows) + 1, "word": word, "count": int(count or 0), "reading": r, "meaning": m[:160]})
        if len(rows) == SIZE:
            break
    th_js = re.findall(r'"([^"]+)"', (ROOT / "web" / "js" / "wordlists" / "th.js").read_text(encoding="utf-8"))
    same = sum(1 for a, b in zip(th_js, rows) if a == b["word"])
    OUT.mkdir(exist_ok=True)
    (OUT / "th-ranked.json").write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
    with open(OUT / "th-ranked.tsv", "w", encoding="utf-8") as f:
        for x in rows:
            f.write(f"{x['rank']}\t{x['word']}\t{x['reading']}\t{x['meaning']}\n")
    print(f"{len(rows)} words -> {OUT / 'th-ranked.json'} (the first 1000 match th.js at {same} places)")


if __name__ == "__main__":
    main()
