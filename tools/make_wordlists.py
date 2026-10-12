"""Build the "1000 most common words" lists: what the app counts as already seen for a learner
who says they have already started (web/js/commonwords.js).

    pip install wordfreq
    python tools/make_wordlists.py

Writes web/js/wordlists/<code>.js (one per language the app teaches), most common word first.

The counts come from the wordfreq project (https://github.com/rspeer/wordfreq), which combines
subtitles, Wikipedia, news, books and the web. Its data is licensed CC BY-SA 4.0, so the lists
written here are too: see web/js/wordlists/README.md. What is left out of the raw ranking:
numbers and symbols, stray single letters, words in another alphabet (English in an Arabic list),
and spellings that differ only in ways the app treats as the same word (Arabic alef forms, Russian
ё/е). Japanese also drops the pieces of conjugated verbs the counting splits off (なっ, まし).
"""

from __future__ import annotations

import importlib.metadata
import json
import re
import sys
import unicodedata
from pathlib import Path

from wordfreq import top_n_list

SIZE = 1000
OUT = Path(__file__).resolve().parent.parent / "web" / "js" / "wordlists"

# English that turns up in other languages' counts (song titles, brand names, web addresses).
ENGLISH = set("the and of to in you is it for my that this with i by at be we not are was his her "
              "from have they what all your one can will just up out about get like love re ii iii iv "
              "vs ok mr dr st http https www com".split())

# One-letter words that really are words. Any other single letter is an abbreviation or an initial.
ONE_LETTER = {
    "es": set("yaoeu"),
    "fr": set("àay"),
    "ru": set("висяаоку"),
    "ar": {"و"},
}
# French writes these glued to the next word with an apostrophe (l'eau, j'ai, qu'il).
FRENCH_ELIDED = {"l", "d", "c", "j", "n", "s", "t", "m", "qu"}

# Japanese: single kana that stand alone as words (particles and the like).
JA_PARTICLES = set("のにはがをでともかよねやへわぞなだてたばずんお")
JA_PIECES = {"まし", "でし", "ましょ", "でしょ", "だろ", "られ", "なかっ", "じゃ", "ちゃ", "てる", "たら", "なら", "たり"}

SCRIPT = {
    "es": re.compile(r"[a-záéíóúüñ]+"),
    "fr": re.compile(r"[a-zàâæçéèêëîïôœùûüÿ]+(?:['-][a-zàâæçéèêëîïôœùûüÿ]+)*"),
    "ru": re.compile(r"[а-яё]+(?:-[а-яё]+)*"),
    "ar": re.compile(r"[ء-ي]+"),
    "ja": re.compile(r"[぀-ヿ㐀-䶿一-鿿々]+"),
    "zh": re.compile(r"[㐀-䶿一-鿿]+"),
}

_AR_MAP = str.maketrans({"آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي", "ـ": None})


def same_word_key(word: str, code: str) -> str:
    """Spellings that are one word written two ways (Arabic alef and hamza forms, Russian ё/е)."""
    w = unicodedata.normalize("NFC", word).lower()
    if code == "ar":
        w = w.translate(_AR_MAP)
    if code == "ru":
        w = w.replace("ё", "е")
    return w


def keep(word: str, code: str) -> bool:
    if not SCRIPT[code].fullmatch(word):
        return False
    if code in ("es", "fr") and word in ENGLISH - {"a", "y", "on", "est", "me", "in"}:
        return False
    if code == "es" and word in {"in", "to"}:
        return False
    if len(word) == 1 and code in ONE_LETTER:
        return word in ONE_LETTER[code] or (code == "fr" and word in FRENCH_ELIDED)
    if code == "ja":
        if word.endswith("っ") or word in JA_PIECES or word == "ー":
            return False
        if len(word) == 1 and "぀" <= word <= "ヿ":
            return word in JA_PARTICLES
    return True


def build(code: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for word in top_n_list(code, 4000):
        if not keep(word, code):
            continue
        key = same_word_key(word, code)
        if key in seen:
            continue
        seen.add(key)
        out.append(f"{word}'" if code == "fr" and word in FRENCH_ELIDED else word)
        if len(out) == SIZE:
            return out
    raise SystemExit(f"{code}: only {len(out)} words survived the filters")


def main() -> None:
    version = importlib.metadata.version("wordfreq")
    OUT.mkdir(parents=True, exist_ok=True)
    for code in SCRIPT:
        words = build(code)
        body = ",\n".join("  " + ", ".join(json.dumps(w, ensure_ascii=False) for w in words[i:i + 12])
                          for i in range(0, len(words), 12))
        (OUT / f"{code}.js").write_text(
            f"// The {SIZE} most common words in this language, most common first.\n"
            f"// Made by tools/make_wordlists.py from wordfreq {version} (CC BY-SA 4.0): see README.md here.\n"
            f"export default [\n{body},\n];\n", encoding="utf-8", newline="\n")
        print(f"{code}: {len(words)} words, e.g. {' '.join(words[:12])}", file=sys.stderr)


if __name__ == "__main__":
    main()
