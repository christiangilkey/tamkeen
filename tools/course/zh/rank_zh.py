"""Step 2 for Chinese: the ranked list the course's `rank` numbers refer to.

    python tools/course/zh/rank_zh.py   ->  tools/course/build/zh-ranked.json
                                            [[rank, word, frequency, pinyin], ...]

Chinese words don't change form (no plurals, no verb endings), so there is nothing to group: the ranked
list is wordfreq's list (tools/course/zh/forms_zh.py) with everything that isn't written in Chinese
characters left out (numbers, Latin letters), each word with its pinyin from CC-CEDICT
(docs/lexicon/zh-cedict.json.gz; "" when CEDICT doesn't have it as one word, often a sign that wordfreq's
word splitter cut a phrase wrongly). Choosing the course's words from it is done by hand.
"""

from __future__ import annotations

import gzip
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
HAN = re.compile(r"^[㐀-䶿一-鿿豈-﫿]+$")
TONES = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}


def mark(syllable: str) -> str:
    """'hao3' -> 'hǎo'; 'nu:3' -> 'nǚ'; tone 5 (neutral) has no mark."""
    m = re.match(r"^([a-zü:]+?)([1-5])$", syllable.lower())
    if not m:
        return syllable
    s, tone = m.group(1).replace("u:", "ü").replace("v", "ü"), int(m.group(2))
    if tone == 5:
        return s
    # a or e takes the mark; in "ou" the o does; otherwise the last vowel.
    for i, ch in enumerate(s):
        if ch in "ae":
            return s[:i] + TONES[ch][tone - 1] + s[i + 1:]
    if "ou" in s:
        i = s.index("o")
        return s[:i] + TONES["o"][tone - 1] + s[i + 1:]
    for i in range(len(s) - 1, -1, -1):
        if s[i] in TONES:
            return s[:i] + TONES[s[i]][tone - 1] + s[i + 1:]
    return s


def pinyin(numbered: str) -> str:
    return "".join(mark(p) for p in numbered.split())


def main() -> None:
    forms = json.loads((ROOT / "tools" / "course" / "build" / "zh-forms.json").read_text(encoding="utf-8"))
    cedict = json.loads(gzip.open(ROOT / "docs" / "lexicon" / "zh-cedict.json.gz", "rt", encoding="utf-8").read())["words"]
    rows = []
    for word, freq in forms:
        if not HAN.match(word):
            continue
        entry = cedict.get(word)
        rows.append([len(rows) + 1, word, freq, pinyin(entry[0]) if entry else ""])
    out = ROOT / "tools" / "course" / "build" / "zh-ranked.json"
    out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} words -> {out}")


if __name__ == "__main__":
    main()
