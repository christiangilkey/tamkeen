"""Step 1 of the Japanese basics course's word list, the same as tools/course/forms.py makes for other
languages: the 20,000 most common written forms of Japanese with how common each is, from wordfreq
(CC BY-SA 4.0).

    python tools/course/ja/forms_ja.py   ->  tools/course/build/ja-forms.json  [[form, frequency], ...]

forms.py asks wordfreq for each form's frequency one by one, which for Japanese needs MeCab (wordfreq
cuts what it is asked into words first). Here the frequencies are read from wordfreq's own table instead:
its Japanese forms are already single words (cut with MeCab when the list was made), so nothing needs
cutting. Needs the wordfreq package (pip install wordfreq==3.1.1). Step 2 is rank_ja.mjs.
"""

from __future__ import annotations

import json
from pathlib import Path

import wordfreq

TOP = 20000


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "build" / "ja-forms.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    freqs = wordfreq.get_frequency_dict("ja")
    rows = [[w, freqs[w]] for w in wordfreq.top_n_list("ja", TOP)]
    out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} forms -> {out}")


if __name__ == "__main__":
    main()
