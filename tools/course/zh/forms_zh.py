"""Step 1 for Chinese: the most common written words, with how common each is, from wordfreq (CC BY-SA 4.0).

    python tools/course/zh/forms_zh.py   ->  tools/course/build/zh-forms.json  [[word, frequency], ...]

The same as tools/course/forms.py, but reads wordfreq's table directly: looking a Chinese word up one at a
time (word_frequency) needs the jieba word splitter, which isn't installed, and the table's entries are
already whole words.
"""

from __future__ import annotations

import json
from pathlib import Path

import wordfreq

TOP = 20000


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "build" / "zh-forms.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    freq = wordfreq.get_frequency_dict("zh")
    rows = [[w, freq[w]] for w in wordfreq.top_n_list("zh", TOP)]
    out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} forms -> {out}")


if __name__ == "__main__":
    main()
