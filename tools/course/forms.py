"""Step 1 of a basics course's word list: the most common written forms of a language, with how
common each is, from wordfreq (CC BY-SA 4.0; the same source as web/js/wordlists).

    python tools/course/forms.py ar          ->  tools/course/build/ar-forms.json  [[form, frequency], ...]
    python tools/course/forms.py ar --blend  ->  the same file, weighted toward spoken language (below), and
                                                 tools/course/build/ar-forms-wordfreq.json, wordfreq alone

--blend (the owner, 2026-11-27, for Frequency words 1001-3000: "70% speech, 30% current"): each form's count
per million words is 0.7 x its count in film and TV subtitles plus 0.3 x wordfreq's. The subtitle counts are
FrequencyWords' (https://github.com/hermitdave/FrequencyWords, OpenSubtitles 2018, CC BY-SA 4.0: licenses/),
read as data from tools/course/build/freqwords/<lang>/<lang>_50k.txt ("form count" per line, downloaded by
hand). Each subtitle form is tidied the way wordfreq tidies its own (wordfreq.tokenize: small letters, Arabic
without vowel marks), so the two agree. The frequencies written are the blend per word (per million / 1e6), the
same scale as wordfreq's, so step 2 (rank.mjs and each language's own ranking) runs unchanged.

Needs the wordfreq package (pip install wordfreq==3.1.1), which the app itself doesn't use, so run it
with any Python that has it. Step 2 is tools/course/rank.mjs.
"""

from __future__ import annotations

import json
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import wordfreq

TOP = 20000
SPEECH = 0.7  # the subtitles' share of the blend; wordfreq has the rest
# FrequencyWords' name for the variety a course teaches, where it isn't the language's code (LANGUAGES.md: Brazilian
# Portuguese; Mandarin in simplified characters).
SOURCE = {"pt": "pt_br", "zh": "zh_cn"}
# Japanese and Chinese: wordfreq can't cut their text into words without MeCab / jieba, which aren't installed. Their
# own forms scripts (ja/forms_ja.py, zh/forms_zh.py) read wordfreq's table, whose entries are whole words, and the
# subtitle counts are cut into words already: so the blend starts from that script's file and takes the subtitle
# words as they are (only tidied: NFKC), never asking wordfreq to cut anything.
OWN_FORMS = {"ja", "zh"}
HERE = Path(__file__).resolve().parent


def subtitle_counts(lang: str) -> dict[str, float]:
    """Each tidied form's share of FrequencyWords' subtitle counts, per million words."""
    src = SOURCE.get(lang, lang)
    path = HERE / "build" / "freqwords" / lang / f"{src}_50k.txt"
    if not path.exists():  # (a smaller collection has only the full list: Hindi, Japanese)
        path = path.with_name(f"{src}_full.txt")
    if not path.exists():
        raise SystemExit(f"No subtitle counts for {lang}: download {src}_50k.txt (FrequencyWords, content/2018/{src}) "
                         f"into {path.parent}.")
    counts: dict[str, float] = defaultdict(float)
    total = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        form, _, n = line.rstrip().rpartition(" ")
        if not form or not n.isdigit():
            continue
        total += int(n)
        if lang in OWN_FORMS:
            tidy = unicodedata.normalize("NFKC", form).strip()
            if any(ch.isalpha() for ch in tidy):
                counts[tidy] += int(n)
            continue
        for token in wordfreq.tokenize(form, lang):  # (a form split in pieces counts for each: c'est)
            counts[token] += int(n)
    return {w: n / total * 1e6 for w, n in counts.items()} if total else {}


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    lang = args[0] if args else "ar"
    blend = "--blend" in sys.argv
    out = HERE / "build" / f"{lang}-forms.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    if lang in OWN_FORMS:  # (run the language's own forms script first: it writes this file)
        own = HERE / "build" / f"{lang}-forms-wordfreq.json"
        if not own.exists():
            raise SystemExit(f"Run tools/course/{lang}/forms_{lang}.py first, then copy build/{lang}-forms.json to {own.name}.")
        rows = json.loads(own.read_text(encoding="utf-8"))
    else:
        rows = [[w, wordfreq.word_frequency(w, lang)] for w in wordfreq.top_n_list(lang, TOP)]
    if not blend:
        out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        print(f"{len(rows)} forms -> {out}")
        return
    if lang not in OWN_FORMS:
        (HERE / "build" / f"{lang}-forms-wordfreq.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    written = {w: f * 1e6 for w, f in rows}
    spoken = subtitle_counts(lang)
    # The subtitles weigh the forms wordfreq's list has (its 20,000 most common); they add none of their own. Subtitle
    # text brings spellings that aren't words: Italian without its accents (citta, verita), the pieces of English
    # contractions (didn), traditional characters in the simplified Chinese list (我們), colloquial Persian spellings,
    # Japanese verb stems cut off (手伝), and the names of film characters. So wordfreq vouches for each spelling, and
    # the subtitles say how much it is spoken.
    score = {}
    for w, wf in written.items():
        score[w] = SPEECH * spoken.get(w, 0.0) + (1 - SPEECH) * wf
    blended = sorted(score, key=lambda w: (-score[w], w))[:TOP]
    out.write_text(json.dumps([[w, round(score[w] / 1e6, 12)] for w in blended], ensure_ascii=False), encoding="utf-8")
    # English in the subtitles (hey, okay, and the English names of film characters: jack, sam): a form at least 3
    # times as common in written English as in this language's own written text (candidates.mjs leaves it out).
    if lang != "en":
        mine = (lambda w: written.get(w, 0.0) / 1e6) if lang in OWN_FORMS else (lambda w: wordfreq.word_frequency(w, lang))
        english = sorted(w for w in blended if wordfreq.word_frequency(w, "en") > 3 * mine(w) and wordfreq.word_frequency(w, "en") > 1e-6
                         and w.isascii())
        (HERE / "build" / f"{lang}-forms-english.json").write_text(json.dumps(english, ensure_ascii=False), encoding="utf-8")
    print(f"{len(blended)} forms, {SPEECH:.0%} subtitles + {1 - SPEECH:.0%} wordfreq -> {out}")


if __name__ == "__main__":
    main()
