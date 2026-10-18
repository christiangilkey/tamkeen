"""Build the word-meaning files: what the word popup shows when "No AI" is chosen in Settings.

One file per language taught, docs/lexicon/<lang>-meanings.json.gz, made from the English
Wiktionary as extracted by Wiktextract (https://kaikki.org, Tatu Ylonen; the text is Wiktionary's,
CC BY-SA 4.0 and GFDL). Every word of the language that has a definition is kept, with its part
of speech, its meanings (the English glosses), how it is written in full (Arabic with its vowels,
Russian with its stress), its reading (Japanese kana, Chinese pinyin), its Arabic root, and, for
forms of a word ("hablo", "كتبت"), which word they are a form of. Read by web/js/meanings.js.

    python tools/build_meanings.py ar es fr ...      (any of: ar es fr it ru en tl ja zh)
    python tools/build_meanings.py ar=<a saved kaikki .jsonl.gz>   (from a file instead)

Each language is read straight from kaikki.org (a .jsonl.gz of 15-400 MB) and never stored.
Writes the files and adds them to docs/lexicon/index.json.

The file: {"kind": "meanings", "lang", "source", "license",
           "words": {key: [[shown, pos, [gloss, ...], extra], ...]},
           "forms": {key: [[lemma key, what form it is], ...]}}
`key` is the word as Tamkeen matches it (see KEY below and web/js/meanings.js); `extra` is
"root|reading|dialect" (any part may be empty; trailing empty parts are left off).
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "lexicon"
NAMES = {"ar": "Arabic", "es": "Spanish", "fr": "French", "it": "Italian", "ru": "Russian", "en": "English",
         "tl": "Tagalog", "ja": "Japanese", "zh": "Chinese"}
URL = "https://kaikki.org/dictionary/{0}/kaikki.org-dictionary-{1}.jsonl.gz"
# Arabic as spoken: Wiktionary's dialect words go in the Arabic file too, marked with their dialect.
DIALECTS = {"arz": "Egyptian Arabic", "ajp": "South Levantine Arabic", "apc": "North Levantine Arabic",
            "afb": "Gulf Arabic", "acw": "Hijazi Arabic", "ary": "Moroccan Arabic", "aeb": "Tunisian Arabic"}


def url(name: str) -> str:
    return URL.format(name.replace(" ", "%20"), name.replace(" ", ""))

MAX_SENSES = 8      # meanings kept per word and part of speech
MAX_GLOSS = 180     # characters per meaning
SKIP_POS = {"character", "symbol", "punct", "romanization", "soft-redirect", "hanzi", "kanji", "hanja", "syllable",
            "glyph", "letter", "num"}
SKIP_TAGS = {"obsolete"}
# Chinese entries cover every Chinese language; meanings that belong only to another one are left out.
NOT_MANDARIN = {"Cantonese", "Hokkien", "Teochew", "Hakka", "Wu", "Shanghainese", "Min", "Min-Nan", "Min-Bei", "Min-Dong",
                "Taishanese", "Gan", "Xiang", "Jin", "Puxian-Min", "Hainanese", "Leizhou-Min", "Dungan", "Pinghua", "Zhangzhou",
                "Xiamen", "Quanzhou", "Taiwanese-Hokkien", "Singapore-Hokkien", "Penang-Hokkien", "Philippine-Hokkien"}

AR_MARKS = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭـ]")


def key(word: str, lang: str) -> str:
    """The form a word is matched in. Must agree with matchKey() in web/js/meanings.js."""
    w = unicodedata.normalize("NFC", word.strip())
    if lang == "ar":
        w = AR_MARKS.sub("", w).replace("ٱ", "ا")
        return re.sub("[آأإ]", "ا", w).replace("ى", "ي").replace("ة", "ه")
    if lang == "ru":
        w = unicodedata.normalize("NFC", unicodedata.normalize("NFD", w).replace("́", "").replace("̀", ""))
        return w.lower().replace("ё", "е")
    if lang in ("ja", "zh"):
        return w
    return w.lower()


def clean(text: str) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text if len(text) <= MAX_GLOSS else text[: MAX_GLOSS - 1].rstrip() + "…"


def shown_form(entry: dict, lang: str) -> str:
    """How the word is written in full: Arabic with vowels, Russian with stress (Wiktionary's 'canonical' form)."""
    if lang in ("ar", "ru"):
        for f in entry.get("forms") or []:
            if "canonical" in (f.get("tags") or []) and f.get("form"):
                return f["form"]
    return entry.get("word", "")


def reading(entry: dict, lang: str) -> str:
    if lang == "ja":
        for f in entry.get("forms") or []:
            tags = f.get("tags") or []
            if ("hiragana" in tags or "katakana" in tags) and "historical" not in tags and f.get("form"):
                return f["form"]
        for h in entry.get("head_templates") or []:
            args = h.get("args") or {}
            if h.get("name", "").startswith("ja-") and args.get("1") and re.fullmatch(r"[぀-ヿ ー・]+", args["1"]):
                return args["1"]
    if lang == "zh":
        for s in entry.get("sounds") or []:
            tags = s.get("tags") or []
            if "Mandarin" in tags and "Pinyin" in tags and s.get("zh_pron"):
                return s["zh_pron"]
    if lang == "ar":
        for f in entry.get("forms") or []:
            if "romanization" in (f.get("tags") or []) and f.get("form"):
                return f["form"]
    return ""


def root(entry: dict, lang: str) -> str:
    if lang != "ar":
        return ""
    for t in entry.get("etymology_templates") or []:
        if t.get("name") == "ar-root":
            parts = [v for k, v in sorted((t.get("args") or {}).items(), key=lambda kv: kv[0]) if k.isdigit() and v]
            if parts:
                return " ".join(parts)
    return ""


def senses(entry: dict, lang: str):
    """(glosses, forms-of) of an entry: forms-of are [(lemma, what form)]."""
    glosses, form_of = [], []
    for s in entry.get("senses") or []:
        tags = set(s.get("tags") or [])
        if tags & SKIP_TAGS:
            continue
        if lang == "zh" and tags & NOT_MANDARIN and not tags & {"Mandarin", "Standard-Chinese"}:
            continue
        g = s.get("glosses") or []
        if not g:
            continue
        target = (s.get("form_of") or s.get("alt_of") or [])
        if target and target[0].get("word"):
            form_of.append((target[0]["word"], clean(g[-1])))
            continue
        for level in g:  # a sense's glosses go from general to specific: "to write", then "to draw (figures)"
            gloss = clean(level)
            if gloss and gloss not in glosses:
                glosses.append(gloss)
    return glosses[:MAX_SENSES], form_of


def common_english(words: dict, forms: dict):
    """English Wiktionary has well over half a million words, most of them rare or technical: only
    the ones in Tamkeen's English word table (docs/lexicon/en-lemmas.json.gz: the common words and
    their forms, and the CMU dictionary's words) are kept, and phrases (phrasal verbs, idioms) made of them."""
    table = json.loads(gzip.decompress((OUT / "en-lemmas.json.gz").read_bytes()))
    common = {w.lower() for w in table["lemmas"]} | {w.lower() for w in table["forms"]} | {w.lower() for w in table["ipa"]}

    def keep(k: str) -> bool:
        if k in common:
            return True
        parts = re.split(r"[ -]", k)
        return 1 < len(parts) <= 4 and all(x in common for x in parts if x)

    words = {k: v for k, v in words.items() if keep(k)}
    forms = {k: v for k, v in forms.items() if k in common}
    return words, forms


def read_lines(source: str):
    if re.match(r"https?://", source):
        req = urllib.request.Request(source, headers={"User-Agent": "Tamkeen dictionary builder (github.com/christiangilkey/tamkeen)"})
        raw = urllib.request.urlopen(req, timeout=120)
    else:
        raw = open(source, "rb")
    with gzip.GzipFile(fileobj=raw) as gz:
        for line in io.TextIOWrapper(gz, encoding="utf-8"):
            yield line


def build(lang: str, source: str) -> dict:
    words: dict[str, list] = {}
    forms: dict[str, list] = {}
    sources = [source]
    if lang == "ar" and re.match(r"https?://", source):
        sources += [url(name) for name in DIALECTS.values()]
    for src in sources:
        read(lang, src, words, forms)
    if lang == "en":
        words, forms = common_english(words, forms)
    if lang == "zh":
        simplified_spellings(words, forms)
    # Proper names after ordinary words (the river Went after "went").
    for k, groups in words.items():
        groups.sort(key=lambda g: g[1] == "name")
    # A form whose word has no meanings of its own is no use; nor is one pointing nowhere.
    forms = {k: [r for r in v if r[0] in words] for k, v in forms.items()}
    forms = {k: v for k, v in forms.items() if v}
    print(f"  {lang}: done, {len(words)} words with meanings, {len(forms)} forms of words", flush=True)
    return {"format": 1, "kind": "meanings", "lang": lang, "source": "English Wiktionary via Wiktextract (kaikki.org)",
            "license": "CC-BY-SA-4.0", "words": words, "forms": forms}


def simplified_spellings(words: dict, forms: dict) -> None:
    """Wiktionary's Chinese words are under their traditional spelling; Tamkeen reads simplified
    (學習 -> 学习), so each simplified spelling (by CC-CEDICT's character table, as in
    docs/lexicon/zh-cedict.json.gz) points to its traditional entry."""
    table = json.loads(gzip.decompress((OUT / "zh-cedict.json.gz").read_bytes()))["t2s"]
    for k in list(words):
        simple = "".join(table.get(ch, ch) for ch in k)
        if simple != k and simple not in words:
            row = forms.setdefault(simple, [])
            if all(r[0] != k for r in row):
                row.append([k, ""])


def read(lang: str, source: str, words: dict, forms: dict) -> None:
    n = 0
    for line in read_lines(source):
        n += 1
        if n % 100000 == 0:
            print(f"  {lang}: {n} entries read, {len(words)} words, {len(forms)} forms", flush=True)
        try:
            e = json.loads(line)
        except ValueError:
            continue
        code = e.get("lang_code")
        dialect = DIALECTS.get(code, "") if lang == "ar" else ""
        if code not in (lang, "cmn" if lang == "zh" else lang) and not dialect or not e.get("word"):
            continue
        pos = e.get("pos", "")
        if pos in SKIP_POS:
            continue
        glosses, form_of = senses(e, lang)
        k = key(e["word"], lang)
        if not k:
            continue
        if glosses:
            extra = f"{root(e, lang)}|{reading(e, lang)}|{dialect}".rstrip("|")
            words.setdefault(k, []).append([shown_form(e, lang), pos, glosses, extra])
        for lemma, what in form_of:
            lk = key(lemma, lang)
            if lk and lk != k:
                row = forms.setdefault(k, [])
                if len(row) < 4 and all(r[0] != lk for r in row):
                    row.append([lk, what])
    print(f"  {lang}: read {n} entries from {source.rsplit('/', 1)[-1]}", flush=True)


def write(lang: str, data: dict) -> None:
    name = f"{lang}-meanings.json.gz"
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    (OUT / name).write_bytes(packed)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["files"][f"mean-{lang}"] = {
        "file": name, "bytes": len(packed), "sha256": hashlib.sha256(packed).hexdigest(),
        "title": f"{NAMES[lang]} meanings", "db": "English Wiktionary (Wiktextract, kaikki.org)", "license": "CC-BY-SA-4.0",
        "words": len(data["words"]), "forms": len(data["forms"]),
    }
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  {lang}: wrote {name}, {len(packed) / 1e6:.1f} MB", flush=True)


def main(args: list[str]) -> None:
    for arg in args or list(NAMES):
        lang, _, source = arg.partition("=")
        if lang not in NAMES:
            sys.exit(f"Unknown language {lang!r}: use {' '.join(NAMES)}")
        write(lang, build(lang, source or url(NAMES[lang])))


if __name__ == "__main__":
    main(sys.argv[1:])
