"""Step 1 of a basics course's word list: the most common written forms of a language, with how
common each is, from wordfreq (CC BY-SA 4.0; the same source as web/js/wordlists).

    python tools/course/forms.py ar      ->  tools/course/build/ar-forms.json  [[form, frequency], ...]

Needs the wordfreq package (pip install wordfreq==3.1.1), which the app itself doesn't use, so run it
with any Python that has it. Step 2 is tools/course/rank.mjs.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import wordfreq

TOP = 20000


def main() -> None:
    lang = sys.argv[1] if len(sys.argv) > 1 else "ar"
    out = Path(__file__).resolve().parent / "build" / f"{lang}-forms.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    rows = [[w, wordfreq.word_frequency(w, lang)] for w in wordfreq.top_n_list(lang, TOP)]
    out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} forms -> {out}")


if __name__ == "__main__":
    main()
