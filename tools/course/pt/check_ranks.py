"""Check that each word of the Portuguese course (or of a batch about to be added) has the rank of the same
word in tools/course/build/pt-ranked.json (tools/course/pt/rank.py), and list the ranked words passed over
between them, so the skipped ones can be looked at.

    python tools/course/pt/check_ranks.py                                     # tools/course/pt/words.json
    python tools/course/pt/check_ranks.py tools/course/build/batch-pt-201.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    ranked = {r: w for r, w, _f, _m in json.loads((HERE.parent / "build" / "pt-ranked.json").read_text(encoding="utf-8"))}
    if len(sys.argv) > 1:
        rows = [(r[0], r[1]) for r in json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))]
    else:
        rows = [(w["rank"], w["word"]) for w in json.loads((HERE / "words.json").read_text(encoding="utf-8"))["words"]]
    bad, skipped, last = 0, [], None
    for rank, word in rows:
        if ranked.get(rank, "").lower() != word.lower():
            print(f"rank {rank}: {word}, but the ranked list has {ranked.get(rank)} there")
            bad += 1
        if last is not None:
            skipped += [f"{r}:{ranked[r]}" for r in range(last + 1, rank)]
        last = rank
    print(f"{len(rows)} words, {bad} with the wrong rank; passed over: {' '.join(skipped) or 'none'}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
