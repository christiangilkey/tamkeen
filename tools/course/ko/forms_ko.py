"""Step 1 for Korean: the most common written forms, from wordfreq (CC BY-SA 4.0), like
tools/course/forms.py. wordfreq looks Korean words up one by one through MeCab, which isn't installed
here, so this reads its frequency table directly (the same numbers, no MeCab needed).

    python tools/course/ko/forms_ko.py   ->  tools/course/build/ko-forms.json  [[form, frequency], ...]
"""

from __future__ import annotations

import json
from pathlib import Path

import wordfreq

TOP = 20000


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "build" / "ko-forms.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    freqs = wordfreq.get_frequency_dict("ko")
    rows = [[w, freqs[w]] for w in wordfreq.top_n_list("ko", TOP)]
    out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} forms -> {out}")


if __name__ == "__main__":
    main()
