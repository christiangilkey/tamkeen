"""Build the "1000 most common words" lists: what the app counts as already seen for a learner
who says they have already started (web/js/commonwords.js).

    pip install wordfreq
    python tools/make_wordlists.py                       (every language wordfreq has)
    python tools/make_wordlists.py th=path/to/tnc_freq.txt ceb=path/to/ceb_freq.tsv

Writes web/js/wordlists/<code>.js (one per language the app teaches), most common word first.

The counts come from the wordfreq project (https://github.com/rspeer/wordfreq), which combines
subtitles, Wikipedia, news, books and the web. Its data is licensed CC BY-SA 4.0, so the lists
written here are too: see web/js/wordlists/README.md. wordfreq has neither Thai nor Bisaya:
  - Thai comes from the Thai National Corpus word counts as PyThaiNLP publishes them (tnc_freq.txt,
    https://github.com/PyThaiNLP/pythainlp, CC0: word <tab> count);
  - Bisaya from counting the Cebuano web text of OPUS's NLLB collection (ODC-By 1.0), the same count
    as its word list for the root finder (tools/build_lemmas.py: word <tab> count); English words
    that crept in are left out unless a Bisaya dictionary knows them too (man, may, bag).
What is left out of the raw ranking:
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
    "en": {"a", "i"},
    "it": set("aeèoi"),
    "tl": {"o"},
    "pt": set("aoeéà"),
    "ca": set("aioe"),
    "ceb": {"o"},
    "fa": {"و"},
}
# wordfreq's own name for a language, where it differs from the app's (Tagalog is "fil", Filipino).
WORDFREQ_CODE = {"tl": "fil"}
# Bisaya web text: names and brands that rank high but aren't words to learn.
CEB_NOT_WORDS = {"jesus", "cristo", "juan", "maria", "israel", "china", "google", "facebook", "youtube", "apple", "samsung",
                 "casino", "online", "website", "email", "app", "software", "mobile", "video", "post", "file", "network", "city",
                 "media", "text", "social", "free", "start", "new", "machine", "hehe", "hehehe", "dur"}
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
    "en": re.compile(r"[a-z]+(?:'[a-z]+)*"),
    "it": re.compile(r"[a-zàèéìíîòóùú]+"),
    "tl": re.compile(r"[a-zñ]+(?:-[a-zñ]+)*"),
    "pt": re.compile(r"[a-záàâãéêíóôõúüç]+(?:-[a-záàâãéêíóôõúüç]+)*"),
    "ca": re.compile(r"[a-zàèéíïòóúüç]+(?:(?:·|'|-)[a-zàèéíïòóúüç]+)*'?"),
    "ceb": re.compile(r"[a-zñ]+(?:-[a-zñ]+)*"),
    "th": re.compile(r"[\u0E01-\u0E4E]+"),
    # Persian letters, a word's pieces joined by the half space (ZWNJ: \u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645)
    "fa": re.compile("[\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC]+(?:\u200C[\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC]+)*"),
}
# Persian: pieces of words the counting found apart, as text that put a space where the half space goes
# ("\u06A9\u062A\u0627\u0628 \u0647\u0627", "\u0645\u06CC \u062E\u0648\u0627\u0647\u0645") gives; the app joins them back onto their word (languages.js persianJoins).
FA_PIECES = {"\u0647\u0627", "\u0647\u0627\u06CC", "\u0647\u0627\u06CC\u06CC", "\u0645\u06CC", "\u0646\u0645\u06CC", "\u0627\u06CC", "\u0627\u0645", "\u0627\u0634", "\u0627\u062A", "\u0627\u0646\u062F", "\u0627\u06CC\u062F", "\u0627\u06CC\u0645", "\u062A\u0631\u06CC\u0646"}
# Where a language's counts come from when wordfreq has none: "lang=path" on the command line.
FROM_FILE = {"th", "ceb"}

_AR_MAP = str.maketrans({"آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي", "ـ": None})


def same_word_key(word: str, code: str) -> str:
    """Spellings that are one word written two ways (Arabic alef and hamza forms, Russian ё/е)."""
    w = unicodedata.normalize("NFC", word).lower()
    if code == "ar":
        w = w.translate(_AR_MAP)
    if code == "ru":
        w = w.replace("ё", "е")
    if code == "fa":  # (with and without the half space: می‌خواهم, میخواهم)
        w = w.replace("‌", "")
    return w


def keep(word: str, code: str) -> bool:
    if not SCRIPT[code].fullmatch(word):
        return False
    if code in ("es", "fr", "it", "tl", "pt", "ca", "ceb") and word in ENGLISH - {"a", "y", "on", "est", "me", "in", "i", "it", "to"}:
        return False
    if code == "ceb" and (word in CEB_NOT_WORDS or word in ENGLISH_COMMON and word not in CEB_KNOWN):
        return False
    if code == "th" and (len(word) == 1 and word not in TH_ONE or word[0] in "ะาำิีึืุู็่้๊๋์ั"):
        return False  # a lone letter, or a piece that starts with a vowel sign or tone mark
    if code == "es" and word in {"in", "to"}:
        return False
    if code == "fa" and (word in FA_PIECES or re.search("[يكىة]", word)):
        return False  # a piece of a word, or Arabic spelling (كه for که: the Persian spelling comes too)
    if len(word) == 1 and code in ONE_LETTER:
        return word in ONE_LETTER[code] or (code == "fr" and word in FRENCH_ELIDED)
    if code == "ja":
        if word.endswith("っ") or word in JA_PIECES or word == "ー":
            return False
        if len(word) == 1 and "぀" <= word <= "ヿ":
            return word in JA_PARTICLES
    return True


# Thai one-letter words.
TH_ONE = {"ณ", "ก", "ธ"}
ENGLISH_COMMON: set[str] = set()
CEB_KNOWN: set[str] = set()


def counted(path: str, n: int) -> list[str]:
    """The first `n` words of a "word <tab> count" file, most common first."""
    out = []
    for line in Path(path).read_text(encoding="utf-8-sig").splitlines():
        word = line.split("\t")[0].strip().lower()
        if word:
            out.append(word)
        if len(out) == n:
            break
    return out


def build(code: str, source: str = "") -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for word in (counted(source, 8000) if source else top_n_list(WORDFREQ_CODE.get(code, code), 4000)):
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


SOURCE_NOTE = {"th": "the Thai National Corpus word counts (PyThaiNLP, CC0)",
               "ceb": "Bisaya web text in OPUS NLLB (ODC-By 1.0)"}


def main() -> None:
    version = importlib.metadata.version("wordfreq")
    OUT.mkdir(parents=True, exist_ok=True)
    wanted = [a.partition("=") for a in sys.argv[1:]] or [(c, "", "") for c in SCRIPT if c not in FROM_FILE]
    if any(c == "ceb" for c, _, _ in wanted):
        global ENGLISH_COMMON, CEB_KNOWN
        ENGLISH_COMMON = set(top_n_list("en", 5000))
        import gzip
        lexicon = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
        for name in ("ceb-meanings.json.gz", "ceb-wolff-meanings.json.gz"):
            CEB_KNOWN |= set(json.loads(gzip.decompress((lexicon / name).read_bytes()))["words"])
    for code, _, source in wanted:  # e.g. "python tools/make_wordlists.py en" for one language
        if code in FROM_FILE and not source:
            raise SystemExit(f"{code}: give its counts file, {code}=path")
        words = build(code, source)
        body = ",\n".join("  " + ", ".join(json.dumps(w, ensure_ascii=False) for w in words[i:i + 12])
                          for i in range(0, len(words), 12))
        (OUT / f"{code}.js").write_text(
            f"// The {SIZE} most common words in this language, most common first.\n"
            f"// Made by tools/make_wordlists.py from {SOURCE_NOTE.get(code, f'wordfreq {version} (CC BY-SA 4.0)')}: see README.md here.\n"
            f"export default [\n{body},\n];\n", encoding="utf-8", newline="\n")
        print(f"{code}: {len(words)} words, e.g. {' '.join(words[:12])}", file=sys.stderr)


if __name__ == "__main__":
    main()
