"""Check a batch of Italian course words before adding it: each row's rank is the place of its word in
build/it-ranked.json (the ranked word shown beside it, to compare), ranks rise from the course's last word,
no word is already in the course, and the sentence's length.

    python tools/course/it/check_batch.py tools/course/build/batch-it-101.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ranked = json.loads((HERE.parent / "build" / "it-ranked.json").read_text(encoding="utf-8"))
course = json.loads((HERE / "words.json").read_text(encoding="utf-8"))["words"]
rows = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
have = {(w["word"].lower(), w["pos"]) for w in course}
last = course[-1]["rank"] if course else 0
bad = 0
for r in rows:
    rank, word, pos, meaning, sentence, translation, *form = r
    lemma = ranked[rank - 1]["lemma"]
    note = []
    if lemma.lower() != word.lower():
        note.append(f"ranked word is {lemma}")
    if rank <= last:
        note.append(f"rank not after {last}")
        bad += 1
    if (word.lower(), pos) in have:
        note.append("already in the course")
        bad += 1
    have.add((word.lower(), pos))
    n = len(sentence.split())
    if not 3 <= n <= 9:
        note.append(f"{n} words")
    forms = [word.lower()] + [f.lower() for f in ([form[0]] if form and isinstance(form[0], str) else (form[0] if form else []))]
    if not any(f in sentence.lower() for f in forms):
        note.append("sentence lacks the word")
        bad += 1
    if translation.count("⟦") != 1 or translation.count("⟧") != 1:
        note.append("needs one ⟦ ⟧")
        bad += 1
    last = rank
    if note:
        print(f"{rank:5d} {word}: " + "; ".join(note))
print(f"{len(rows)} rows, {bad} problems")
