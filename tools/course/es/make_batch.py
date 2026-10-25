"""Turn a draft of Spanish course words into a batch for add_batch.py, filling in each word's rank.

A draft (tools/course/build/draft-es-NNN.json) holds rows [key, word, pos, meaning, sentence, translation, form?]
where key is the dictionary word as tools/course/build/es-ranked.json has it ("uno" for "un"), or a rank.

    python tools/course/es/make_batch.py tools/course/build/draft-es-101.json
        ->  tools/course/build/batch-es-101.json   (rows [rank, word, pos, meaning, sentence, translation, form?])
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUILD = HERE.parent / "build"


def main() -> None:
    draft = Path(sys.argv[1])
    ranked = json.loads((BUILD / "es-ranked.json").read_text(encoding="utf-8"))
    rank_of = {lemma: n for n, lemma, _f, _m in ranked}
    words = json.loads((HERE / "words.json").read_text(encoding="utf-8"))["words"]
    last = words[-1]["rank"] if words else 0
    rows, bad = [], []
    for key, *rest in json.loads(draft.read_text(encoding="utf-8")):
        rank = key if isinstance(key, int) else rank_of.get(key)
        if rank is None:
            bad.append(f"{key}: not in the ranked list")
            continue
        if rank <= last:
            bad.append(f"{key}: rank {rank} is not after {last}")
        last = rank
        rows.append([rank, *rest])
    if bad:
        sys.exit("\n".join(bad))
    out = BUILD / draft.name.replace("draft-", "batch-")
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(rows)} rows -> {out}")


if __name__ == "__main__":
    main()
