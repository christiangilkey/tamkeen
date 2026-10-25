"""Turn a written draft of Thai words into a batch for add_batch.py, filling in each word's rank and reading.

    python tools/course/th/draft.py tools/course/build/draft-th-001.txt     -> tools/course/build/batch-th-001.json

A draft has one word per line (lines starting with # are notes):
    word | pos | English meaning | Thai sentence | English translation with ⟦ ⟧ [| reading]
The rank comes from tools/course/build/th-ranked.json (made by rank.py) and the reading (Paiboon, as the app
writes Thai) from docs/lexicon/th-readings.json.gz, unless the line gives one; the meaning becomes
"(reading) English". It stops on anything the course test would reject, and on a rank that doesn't rise
from the words already in words.json.
"""

from __future__ import annotations

import gzip
import json
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
BUILD = HERE.parent / "build"


def length(s: str) -> int:
    """Characters as the course test counts them: every letter, vowel sign and tone mark, but no spaces
    or punctuation."""
    return sum(1 for c in s if not c.isspace() and not unicodedata.category(c).startswith("P"))


def main() -> None:
    src = Path(sys.argv[1])
    ranked = json.loads((BUILD / "th-ranked.json").read_text(encoding="utf-8"))
    rank_of = {r["word"]: r["rank"] for r in ranked}
    readings = json.load(gzip.open(ROOT / "docs" / "lexicon" / "th-readings.json.gz", "rt", encoding="utf-8"))["words"]
    course = json.loads((HERE / "words.json").read_text(encoding="utf-8"))
    have = {(w["word"], w["pos"]) for w in course["words"]}
    last = course["words"][-1]["rank"] if course["words"] else 0
    rows, problems = [], []
    for i, line in enumerate(src.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) not in (5, 6):
            problems.append(f"line {i}: {len(parts)} parts: {line}")
            continue
        word, pos, english, sentence, translation, *reading = parts
        rank = rank_of.get(word)
        r = reading[0] if reading else readings.get(word, "")
        r = r[0] if isinstance(r, list) else r
        n = length(sentence)
        bad = []
        if rank is None:
            bad.append("not in the ranked list")
        elif rank <= last:
            bad.append(f"rank {rank} doesn't rise (last {last})")
        if not r:
            bad.append("no reading: add one as a 6th part")
        if word not in sentence:
            bad.append("the sentence doesn't use the word")
        if not 2 <= n <= 30:
            bad.append(f"{n} characters")
        if not re.fullmatch(r"[^⟦⟧]*⟦[^⟦⟧]+⟧[^⟦⟧]*", translation):
            bad.append("needs one ⟦ ⟧ pair")
        if (word, pos) in have:
            bad.append("already in the course")
        if bad:
            problems.append(f"line {i} {word}: " + "; ".join(bad))
        have.add((word, pos))
        last = rank or last
        rows.append([rank, word, pos, f"({r}) {english}", sentence, translation])
        print(f"{rank:5}  {n:2}  {word}  ({r})  {sentence}")
    if problems:
        raise SystemExit("\n".join(problems))
    out = BUILD / src.name.replace("draft-", "batch-").replace(".txt", ".json")
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(rows)} words -> {out}")


if __name__ == "__main__":
    main()
