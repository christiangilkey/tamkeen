"""Build the word-meaning files: what the word popup shows when "No AI" is chosen in Settings.

One file per language taught, docs/lexicon/<lang>-meanings.json.gz, made from the English
Wiktionary as extracted by Wiktextract (https://kaikki.org, Tatu Ylonen; the text is Wiktionary's,
CC BY-SA 4.0 and GFDL). Every word of the language that has a definition is kept, with its part
of speech, its meanings (the English glosses), how it is written in full (Arabic with its vowels,
Russian with its stress), its reading (Japanese kana, Chinese pinyin), its Arabic root, and, for
forms of a word ("hablo", "كتبت"), which word they are a form of. Read by web/js/meanings.js.

    python tools/build_meanings.py ar es fr ...      (any of: ar es fr it ru en tl ja zh pt ca ceb th)
    python tools/build_meanings.py ar=<a saved kaikki .jsonl.gz>   (from a file instead)
    python tools/build_meanings.py --numbers es fr ...   (only add the number words to the files there)
    python tools/build_meanings.py --fill tl ceb         (only fill the gaps of the Tagalog and Bisaya files there)

Each language is read straight from kaikki.org (a .jsonl.gz of 15-400 MB) and never stored.
Writes the files and adds them to docs/lexicon/index.json. Chinese also reads CC-CEDICT (about 4 MB,
from mdbg.net, or a saved copy named by the TAMKEEN_CEDICT environment variable) to put each character's
everyday meaning first; Japanese needs `pip install wordfreq`, to choose between spellings.

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
import os
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "lexicon"
NAMES = {"ar": "Arabic", "es": "Spanish", "fr": "French", "it": "Italian", "ru": "Russian", "en": "English",
         "tl": "Tagalog", "ja": "Japanese", "zh": "Chinese", "pt": "Portuguese", "ca": "Catalan", "ceb": "Cebuano",
         "th": "Thai"}
URL = "https://kaikki.org/dictionary/{0}/kaikki.org-dictionary-{1}.jsonl.gz"
# Arabic as spoken: Wiktionary's dialect words go in the Arabic file too, marked with their dialect.
DIALECTS = {"arz": "Egyptian Arabic", "ajp": "South Levantine Arabic", "apc": "North Levantine Arabic",
            "afb": "Gulf Arabic", "acw": "Hijazi Arabic", "ary": "Moroccan Arabic", "aeb": "Tunisian Arabic"}


def url(name: str) -> str:
    return URL.format(name.replace(" ", "%20"), name.replace(" ", ""))


def numbers_url(name: str) -> str:
    """kaikki.org's file of just a language's number words (a few hundred KB, not the whole language)."""
    return (f"https://kaikki.org/dictionary/{name.replace(' ', '%20')}/pos-num/"
            f"kaikki.org-dictionary-{name.replace(' ', '')}-by-pos-num.jsonl.gz")

MAX_SENSES = 8      # meanings kept per word and part of speech
MAX_GLOSS = 180     # characters per meaning
# Number words (tres, deux, dalawa, million: Wiktionary's "num") are kept; a numeral written in digits
# is left out with everything else that has no letters (see read()).
SKIP_POS = {"character", "symbol", "punct", "romanization", "soft-redirect", "hanzi", "kanji", "hanja", "syllable",
            "glyph", "letter"}
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
    if lang in ("ja", "zh", "th"):
        return w
    if lang == "ceb":
        # Bisaya has three vowels, written five ways: o and u are one sound, e and i another (kaayo,
        # Wolff's kaáyu); stress and glottal-stop marks (á, à) are left off.
        w = "".join(c for c in unicodedata.normalize("NFD", w.lower()) if not unicodedata.combining(c))
        return w.replace("o", "u").replace("e", "i")
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


# Senses learners meet least in today's language: Wiktionary's tags, or the label its gloss starts with
# (是 "(literary) this", 也 "(Classical) particle", 和 "(obsolete on its own in Standard Chinese) ...").
# For Chinese and Japanese they go after the others, so the meaning a word is shown with is the modern
# one (是: to be). "Literary" counts for Chinese only: Japanese written style is not old (まい "will not").
LESSER_TAGS = {"Classical", "archaic", "obsolete", "dated", "rare", "poetic",
               "Classical-Chinese", "Literary-Chinese", "Classical-Japanese", "Old-Japanese"}
LESSER_GLOSS = re.compile(r"^\([^)]*\b(?:obsolete|archaic|Classical|dated|rare|poetic)\b[^)]*\)|"
                          r"^(?:only )?used in\b|^a surname|gongche notation|^Kunqu", re.IGNORECASE)
LITERARY = re.compile(r"^\([^)]*\bliterary\b[^)]*\)", re.IGNORECASE)


def lesser(sense: dict, lang: str) -> bool:
    tags = set(sense.get("tags") or [])
    gloss = str((sense.get("raw_glosses") or sense.get("glosses") or [""])[0])
    if tags & LESSER_TAGS or LESSER_GLOSS.search(gloss):
        return True
    return lang == "zh" and ("literary" in tags or bool(LITERARY.search(gloss)))


def modern_entry(entry: dict, lang: str) -> bool:
    """Has the entry a sense of today's language (see LESSER_TAGS)? Its entries go before the others."""
    return any(not lesser(s, lang) for s in entry.get("senses") or [] if s.get("glosses"))


def senses(entry: dict, lang: str):
    """(glosses, forms-of) of an entry: forms-of are [(lemma, what form)]."""
    glosses, form_of = [], []
    listed = entry.get("senses") or []
    if lang in ("zh", "ja"):
        listed = sorted(listed, key=lambda sense: lesser(sense, lang))  # Classical, obsolete ... senses last
    for s in listed:
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
    return (glosses if lang == "zh" else glosses[:MAX_SENSES]), form_of  # Chinese: cut after ordering (everyday_reading_first)


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
    for notes in (ZH_READINGS, MODERN, SEE, SPELLED):  # what the last language built left (日 is ja and zh)
        notes.clear()
    sources = [source]
    if lang == "ar" and re.match(r"https?://", source):
        sources += [url(name) for name in DIALECTS.values()]
    for src in sources:
        read(lang, src, words, forms)
    if lang == "en":
        words, forms = common_english(words, forms)
    if lang == "zh":
        simplified_spellings(words, forms)
        everyday_reading_first(words)
        everyday_sense_first(words, forms)
    add_other_spellings(lang, words, forms)
    if lang == "ja":
        modern_entries_first(words)
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
    cedict = json.loads(gzip.decompress((OUT / "zh-cedict.json.gz").read_bytes()))
    table = cedict["t2s"]
    usual = cedict_senses(cedict["words"])[1]
    for k in list(words):
        simple = "".join(table.get(ch, ch) for ch in k)
        if simple != k and simple not in words:
            row = forms.setdefault(simple, [])
            if all(r[0] != k for r in row):
                # Before what Wiktionary says it is an old form of (还 is 還 before 塢), and before the
                # other traditional words it may be (当 is 當 before 噹), when it is the usual one.
                row.insert(0 if usual.get(simple, cedict.get("s2tc", {}).get(simple)) == k else len(row), [k, ""])


def see_other_spelling(e: dict, lang: str, forms: dict) -> None:
    """A spelling whose entry only says "see" another (Japanese 分かる: see わかる, まだ: see 未だ) is
    made a form of those words, so it finds their meanings."""
    k = key(e["word"], lang)
    for target in e.get("redirects") or []:
        tk = key(target, lang)
        if k and tk and tk != k:
            row = SEE.setdefault(k, [])
            if all(r[0] != tk for r in row):
                row.append([tk, ""])


SEE: dict[str, list] = {}  # spelling -> [[the spelling it says to see, ""], ...]
COMMON_SPELLING = 4.0       # Zipf frequency: about once in 100,000 words


def add_other_spellings(lang: str, words: dict, forms: dict) -> None:
    """The "see" spellings become forms of the words they point to. A kana spelling's page lists every
    word read that way (なん: 軟, 男, 難, 何): the commonest written spelling first (何), as wordfreq
    counts them, and none too rare to be the word meant (ませ: 釻 "hanging ring", not ます); a single
    kana (お) is too many words to point anywhere. A kanji spelling that points to a kana page of
    several words (生き: see いき, which is also 息 "breath") gets only the entries written that way."""
    rank = lambda w: 0.0
    if lang == "ja":
        import math
        from wordfreq import get_frequency_dict  # pip install wordfreq (as for tools/build_russian.py)
        freq = get_frequency_dict("ja")
        rank = lambda w: math.log10(freq[w] * 1e9) if freq.get(w) else 0.0
    for k, row in SEE.items():
        kanji = bool(re.search(r"[㐀-鿿]", k))
        if lang == "ja" and len(row) > 1:
            row = sorted(row, key=lambda r: -rank(r[0]))
        if lang == "ja" and not kanji:  # a kana page: only common spellings
            if len(k) == 1:
                continue
            row = [r for r in row if rank(r[0]) >= COMMON_SPELLING]
        if lang == "ja" and kanji and k not in words:
            own = [g for t, _ in row for g, spelled in zip(words.get(t, []), SPELLED.get(t, [])) if k in spelled]
            if own:
                words[k] = own
            # None written that way: no link (言い, the stem of 言う, is not いい "good").
            continue
        have = forms.setdefault(k, [])
        for r in row:
            if len(have) < 4 and all(h[0] != r[0] for h in have):
                have.append(r)
    SEE.clear()
    SPELLED.clear()


SPELLED: dict[str, list[set[str]]] = {}  # Japanese word -> for each of its entries, the spellings it lists


TONE_MARKS = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}


def marked_pinyin(numbered: str) -> str:
    """CC-CEDICT's pinyin ("xue2 xi2", "de5") as written with tone marks ("xuéxí", "de")."""
    out = []
    for syl in numbered.lower().replace("u:", "ü").split():
        m = re.fullmatch(r"([a-zü]+)([1-5])", syl)
        if not m:
            out.append(syl)
            continue
        s, tone = m.group(1), int(m.group(2))
        if tone < 5:
            at = next((i for i, c in enumerate(s) if c in "ae"), -1)
            if at < 0:
                at = s.find("ou")
            if at < 0:
                at = max((i for i, c in enumerate(s) if c in "iouü"), default=-1)
            if at >= 0:
                s = s[:at] + TONE_MARKS[s[at]][tone - 1] + s[at + 1:]
        out.append(s)
    return "".join(out)


ZH_READINGS: dict[str, list[set[str]]] = {}  # word -> for each of its entries, the Mandarin readings it adds


def note_readings(e: dict, k: str) -> None:
    """The Mandarin readings a Chinese entry has (Wiktionary repeats the readings of the word's earlier
    entries in each later one: 的's first entry has dì and dí, its second adds de)."""
    said = {str(s.get("zh_pron", "")).split("(")[0].replace(" ", "").lower()
            for s in e.get("sounds") or [] if {"Mandarin", "Pinyin"} <= set(s.get("tags") or [])}
    ZH_READINGS.setdefault(k, []).append(said)


# The commonest single characters whose meaning shown first, after the ordering by CC-CEDICT, is still not
# the one they are used in every day: mostly grammar words that CC-CEDICT itself lists after a noun or
# an old sense (被 "quilt" before the passive "by", 跟 "heel" before "with", 才 "ability" before "only
# then"), and a few with a name or a rare sense first (听 "laughing", 心 an asterism, 马 a zodiac sign).
# Checked by hand on the 300 commonest single characters of web/js/wordlists/zh.js (2026-10-19): each
# names, as a regular expression, the start of the Wiktionary meaning to show first. The build says so
# if one no longer matches anything (Wiktionary reworded it).
EVERYDAY_ZH = {
    "被": r"^Used before a verb to indicate passive voice", "跟": r"^with \(together\)", "才": r"^only after; only then",
    "里": r"^in; inside", "在": r"^to be at; to be in", "不": r"^not; un-", "以": r"^by; with; by means of",
    "由": r"^by; through; via", "因": r"^because; since", "便": r"^then$", "让": r"^to allow; to let", "给": r"^to give",
    "别": r"^had better not; do not", "应": r"^should; ought to", "太": r"^too; so", "约": r"^about; approximately",
    "个": r"^Generic classifier", "次": r"^Classifier for times", "种": r"^kind; sort; type", "哪": r"^which; what",
    "您": r"^you \(usually singular", "叫": r"^to be called", "话": r"^words; talk", "老": r"^old; aged",
    "听": r"^to listen; to hear", "心": r"^heart", "马": r"^horse", "狗": r"^dog", "关": r"^to close; to shut",
    "跑": r"^to run$", "打": r"^to hit; to strike", "点": r"^dot; spot", "称": r"^to call; to name", "干": r"^to do$",
    "经": r"^to go through; to experience", "道": r"^a path or course", "令": r"^to make \(someone", "元": r"^first; initial",
}


def everyday_sense_first(words: dict, forms: dict) -> None:
    """Put the meaning named in EVERYDAY_ZH first: its entry first, and that meaning first in it. A
    character with no entries of its own (only "form of" links) has it done in the entries it points to."""
    for ch, start in EVERYDAY_ZH.items():
        key = ch if ch in words else next((t for t, _ in forms.get(ch, []) if t in words), None)
        groups = words.get(key) or []
        hit = next(((g, i) for g in groups for i, m in enumerate(g[2]) if re.search(start, m)), None)
        if not hit:
            print(f"  zh: EVERYDAY_ZH {ch}: no meaning starts like {start!r} any more", flush=True)
            continue
        group, i = hit
        group[2].insert(0, group[2].pop(i))
        groups.remove(group)
        groups.insert(0, group)


def everyday_reading_first(words: dict) -> None:
    """A Chinese character or word read more than one way has an entry per reading, oldest first (的:
    dí "bright" before de, the possessive; 都: dū "capital" before dōu "all"). The one that brings in
    CC-CEDICT's main reading (docs/lexicon/zh-cedict.json.gz, the reading of everyday text) goes first,
    so its meaning is the one shown."""
    cedict = json.loads(gzip.decompress((OUT / "zh-cedict.json.gz").read_bytes()))
    table, readings = cedict["t2s"], cedict["words"]
    simple = lambda w: "".join(table.get(ch, ch) for ch in w)
    # A simplified character with entries of its own (万 "only used in 万俟", 亿 a music notation) is in
    # everyday text the traditional word it simplifies (萬 "ten thousand", 億): it gets that word's entries
    # too, first when that is its usual traditional form (see cedict_senses), after its own when not (家
    # "home" before 傢).
    usage, usual = cedict_senses(readings)
    for t in [t for t in words if simple(t) != t and simple(t) in words]:
        s = simple(t)
        if len(ZH_READINGS.get(s, [])) != len(words[s]) or len(ZH_READINGS.get(t, [])) != len(words[t]):
            continue
        if len(MODERN.get(s, [])) != len(words[s]) or len(MODERN.get(t, [])) != len(words[t]):
            continue
        if usual.get(s) == t:
            words[s], ZH_READINGS[s], MODERN[s] = words[t] + words[s], ZH_READINGS[t] + ZH_READINGS[s], MODERN[t] + MODERN[s]
        else:
            words[s], ZH_READINGS[s], MODERN[s] = words[s] + words[t], ZH_READINGS[s] + ZH_READINGS[t], MODERN[s] + MODERN[t]
    for k, groups in words.items():
        # Single characters only: Wiktionary lists a character's meanings oldest first, but a word of
        # two or more characters with its usual meaning first, which CC-CEDICT's order (一起: "(in) the
        # same place" before "together") and main reading (告诉: gàosù "to press charges") would undo.
        single = len(k) == 1
        entry = readings.get(simple(k)) if single else None
        main = marked_pinyin(entry[0]) if entry and entry[0] else None
        defs = usage.get(simple(k), []) if single else []
        fit = [[fits(g, defs) for g in group[2]] for group in groups]
        # Within an entry, the meaning CC-CEDICT gives first goes first (就: "then", not "to approach").
        for group, scores in zip(groups, fit):
            best = max(range(len(scores)), key=lambda i: (scores[i], -i), default=0)
            if scores and scores[best] > scores[0]:
                group[2].insert(0, group[2].pop(best))
        notes = ZH_READINGS.get(k, [])
        if len(groups) > 1 and len(notes) == len(groups) and len(MODERN.get(k, [])) == len(groups):
            # The everyday reading's entry first, then the one CC-CEDICT's meanings fit best (后: 後
            # "behind" before "queen"), then entries with a modern sense; otherwise as they were.
            order = sorted(range(len(groups)), key=lambda i: (main is not None and main not in notes[i],
                                                              -max(fit[i], default=0), not MODERN[k][i]))
            groups[:] = [groups[i] for i in order]
        for group in groups:
            del group[2][MAX_SENSES:]  # (Chinese meanings are kept whole until here: see senses())


CEDICT_URL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz"
NOT_A_MEANING = re.compile(r"^(?:old )?variant of|^surname |^\(onom\.\)|^CL:|^see |^used in|^Japanese variant|^abbr\. for|"
                           r"^\((?:literary|archaic|old|classical|dialect|Cantonese|Taiwan)\b", re.IGNORECASE)
STOP = set("to a an the of sb sth one one's sb's oneself bound form literary etc used e g i".split())


CEDICT_READ: dict = {}  # CC-CEDICT is read once per run


def cedict_senses(readings: dict) -> tuple[dict[str, list[str]], dict[str, str]]:
    """From CC-CEDICT (https://cc-cedict.org, CC BY-SA 4.0; read from mdbg.net, or from the file named by
    the TAMKEEN_CEDICT environment variable, and never stored):
      - each word's meanings for its main reading, as CC-CEDICT orders them (everyday use first: 会 "can;
        to know how to", 时 "o'clock; time"), without variant, surname, sound-word and literary lines,
        from the line written with the word's usual traditional form first (后: 後 "back; behind" before
        后 "empress");
      - each simplified character's usual traditional form: the one most of its words are written with,
        counting each word by how common it is (当 is 當 in 当然, 当时, 应当, not 噹 "ding dong"; 里 is 裡
        in 这里, 里面)."""
    if "done" in CEDICT_READ:
        return CEDICT_READ["done"]
    source = os.environ.get("TAMKEEN_CEDICT") or CEDICT_URL
    found: dict[str, list[tuple[str, list[str]]]] = {}
    weight: dict[str, dict[str, float]] = {}
    for line in read_lines(source):
        m = re.match(r"^(\S+) (\S+) \[([^\]]+)\] /(.*)/\s*$", line)
        if not m:
            continue
        trad, simp, pinyin, defs = m.groups()
        entry = readings.get(simp)
        if not entry:
            continue
        if len(simp) > 1 and len(trad) == len(simp) and entry[1]:
            for s_ch, t_ch in zip(simp, trad):
                weight.setdefault(s_ch, {})[t_ch] = weight.get(s_ch, {}).get(t_ch, 0.0) + 10 ** (-entry[1] / 100)
        if entry[0] != pinyin:
            continue
        defs = [d for d in defs.split("/") if d and not NOT_A_MEANING.search(d)]
        if defs:
            found.setdefault(simp, []).append((trad, defs))
    usual = {s: max(ts, key=ts.get) for s, ts in weight.items()}
    # Each meaning as CC-CEDICT words it, split where it lists several ("now; at present; currently").
    meanings = {s: [p.strip() for _, defs in sorted(lines, key=lambda x: x[0] != usual.get(s, s))
                    for d in defs for p in d.split(";") if p.strip()][:8]
                for s, lines in found.items()}
    CEDICT_READ["done"] = (meanings, usual)
    return meanings, usual


def stem(word: str) -> str:
    """A word without its usual English endings, so "completion" and "completed" compare alike."""
    for end in ("ions", "ion", "ings", "ing", "ed", "es", "s", "ly", "ment"):
        if word.endswith(end) and len(word) - len(end) >= 3:
            return word[: -len(end)]
    return word


def words_of(text: str, skip: set[str] | None = None) -> set[str]:
    """Its words (stems), those in round brackets too ("(action completion)"), not pinyin in square ones
    ([han4]), leaving out the words in `skip` (STOP when not given)."""
    skip = STOP if skip is None else skip
    return {stem(w) for w in re.findall(r"[a-z]+", re.sub(r"\[[^\]]*\]", " ", text.lower())) if w not in skip}


LITTLE = STOP | set("in on at that this for as by it its is are was or not no so up out".split())


def phrase(text: str, brackets: bool = False) -> str:
    """A meaning put plainly for comparing: "(literary) to Look at;" -> "look at" (with `brackets`, what
    is in them stays: "to wait (for)" -> "wait for")."""
    text = text.lower().replace("(", " ").replace(")", " ") if brackets else re.sub(r"\([^)]*\)", " ", text.lower())
    text = re.sub(r"\[[^\]]*\]|[\"“”]", " ", text)
    return re.sub(r"^(?:to|a|an|the)\s+", "", re.sub(r"\s+", " ", text).strip(" .,!?'")).strip()


def fits(gloss: str, defs: list[str]) -> float:
    """How well a Wiktionary meaning matches CC-CEDICT's meanings, which come in order of use: the earlier
    the CC-CEDICT meaning it matches the better (8 for the first, 7 the next ...), matching it word for word
    (就: "then") a little better than sharing some of its words, and sharing more words a little better
    again. A meaning that opens with a qualifier, "(with limited objects, often figuratively) ...", is a
    special use and loses ties."""
    parts = {phrase(p, b) for p in re.split(r"[;,]", gloss) for b in (False, True)} - {""}
    have = words_of(gloss, LITTLE)
    special = 0.05 if gloss.startswith("(") else 0.0
    n = len(defs)
    best = 0.0
    for j, d in enumerate(defs):
        if ({phrase(d), phrase(d, True)} - {""}) & parts:
            best = max(best, (n - j) + 0.5)
        shared = have & words_of(d, LITTLE)
        if shared:
            best = max(best, (n - j) + 0.1 * len(shared) + 0.05 * len(shared) / len(have))
    return best - special if best else 0.0


MODERN: dict[str, list[bool]] = {}  # word (zh, ja) -> for each of its entries, has it a sense of today's language


def modern_entries_first(words: dict) -> None:
    """A Japanese word's entries with a sense of today's language before those that only have literary,
    Classical or obsolete ones (see LESSER_TAGS)."""
    for k, groups in words.items():
        flags = MODERN.get(k, [])
        if len(groups) > 1 and len(flags) == len(groups):
            order = sorted(range(len(groups)), key=lambda i: not flags[i])
            groups[:] = [groups[i] for i in order]


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
        if pos == "soft-redirect":
            see_other_spelling(e, lang, forms)
            continue
        # Chinese single characters (的, 是, 我) are Wiktionary "characters": their meanings are the word's.
        if (pos in SKIP_POS and not (lang == "zh" and pos == "character")) or not any(c.isalpha() for c in e["word"]):
            continue
        glosses, form_of = senses(e, lang)
        k = key(e["word"], lang)
        if not k:
            continue
        if glosses:
            extra = f"{root(e, lang)}|{reading(e, lang)}|{dialect}".rstrip("|")
            words.setdefault(k, []).append([shown_form(e, lang), pos, glosses, extra])
            if lang == "zh":
                note_readings(e, k)
            if lang in ("zh", "ja"):
                MODERN.setdefault(k, []).append(modern_entry(e, lang))
            if lang == "ja":
                SPELLED.setdefault(k, []).append({e["word"]} | {f.get("form", "") for f in e.get("forms") or []})
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


# ---------- Tagalog and Bisaya: words Wiktionary has no entry for ----------
# Everyday Filipino writing is full of words the English Wiktionary doesn't list under that spelling:
# prefixes written apart (mag, nag, pinaka), chat spellings (nung, yun, sya, lng), words shared with
# Tagalog (Bisaya mas, medyo, impormasyon) and plain English (school, online). Each word of the language's
# word list (docs/lexicon/tl-roots, ceb-roots) with no meaning gets one from, in this order: the same
# file (the prefix mag-, the full spelling iyon), Wolff's dictionary (Bisaya), the Tagalog entry (Bisaya,
# marked "Tagalog word"), the English entry (marked "English word"). The mark is shown in the word popup,
# and the app takes a borrowed meaning only when the word's own language has none (meaningdata.js).
WORD_LISTS = {"tl": "tl-roots.json.gz", "ceb": "ceb-roots.json.gz"}
# Spellings of a word the files have under another spelling: (word, full spelling, what it is).
SPELLINGS = {
    "tl": [("nung", "noon", "informal spelling of noong"), ("nun", "noon", "informal spelling of noon"),
           ("yun", "iyon", "informal spelling of iyon"), ("yon", "iyon", "informal spelling of iyon"),
           ("yung", "iyong", "informal spelling of iyong"), ("ung", "iyong", "informal spelling of iyong"),
           ("dun", "doon", "informal spelling of doon"), ("nyo", "ninyo", "informal spelling of ninyo"),
           ("nya", "niya", "informal spelling of niya"), ("sya", "siya", "informal spelling of siya"),
           ("ganun", "ganoon", "informal spelling of ganoon"), ("ding", "din", "din after a vowel"),
           ("ring", "din", "rin (din after a vowel), with the linker"), ("anu", "ano", "informal spelling of ano"),
           ("kwarto", "kuwarto", "spelling of kuwarto"), ("sayo", "iyo", "sa iyo, written as one word"),
           ("sakin", "akin", "sa akin, written as one word"), ("parin", "din", "pa rin, written as one word"),
           ("nalang", "lang", "na lang, written as one word"), ("mong", "mo", "mo with the linker -ng"),
           ("pagiging", "maging", "noun of maging: being"), ("pangunahing", "pangunahin", "pangunahin with the linker -ng"),
           ("pamamaraan", "paraan", "form of paraan"), ("makabagong", "makabago", "makabago with the linker -ng"),
           ("umaasa", "asa", "form of asa: hoping"), ("binubuo", "buo", "form of buo: making up, forming")],
    "ceb": [("sya", "siya", "informal spelling of siya"), ("sia", "siya", "informal spelling of siya"),
            ("lng", "lamang", "short for lang, lamang"), ("koy", "ko", "ko + y"), ("kog", "ko", "ko + og"),
            ("akon", "ako", "ako, as said in some places (my, mine)"), ("amon", "namo", "our, as said in some places"),
            ("namon", "namo", "namo, as said in some places"), ("bisag", "bisan", "bisan + g"),
            ("ukon", "o", "or, as said in some places"), ("indi", "dili", "dili, as said in some places"),
            ("nahigugma", "gugma", "form of gugma: fell in love"), ("gihigugma", "gugma", "form of gugma: loved"),
            ("tiggamit", "gamit", "form of gamit: user"), ("pagproseso", "proseso", "form of proseso"),
            ("nailhan", "ila", "form of ila: known, recognised"), ("kabalo", "hibalo", "knowing, as hibalo"),
            ("panguna", "una", "form of una: leading, main"), ("nanguna", "una", "form of una: led"),
            ("pinaagi", "agi", "form of agi: by means of, through"), ("mahitungod", "tungod", "form of tungod: about"),
            ("kasagaran", "sagad", "form of sagad: usually, most"), ("nahimutang", "himutang", "form of himutang: situated"),
            ("sangputanan", "sangpot", "form of sangpot: result"), ("sukaranan", "sukad", "form of sukad: basis, standard"),
            ("gibug-aton", "bug-at", "form of bug-at: weight"), ("hataas", "taas", "form of taas: tall, high"),
            ("girekomenda", "rekomenda", "form of rekomenda: recommended"), ("awtomatikong", "awtomatiko", "awtomatiko + -ng"),
            ("kabalaka", "balaka", "form of balaka: worry"), ("basig", "basin", "basin + g: maybe"),
            ("matag", "kada", "each, every (as kada)")],
}
# Words of the language that are also English words, never given the English meaning (Tagalog nag, tag,
# pang are prefixes; bait, pare, ate are Tagalog words).
NOT_ENGLISH = set("""nag mag tag pang naka pinag ring ding nun dun yon ate bait pare po ho ko ka mo na pa ba at an
    ang sa si ni ng nga din rin may kay hay ay sana para pala lang ma sila tayo kami kayo ako siya ito iyon doon dito
    kita bata ama ina anak pinaka napaka maka ika pagka gi mi mas
    unsay bai kau ai kan kit al yan tang rang tay nak jan dah gid nab nig mah yaw hubs niy rani saas pani gila ging
    tug sant sing aka""".split())
BORROWED = ("English word", "Tagalog word")
SKIP_BORROWED = {"name", "abbrev", "initialism", "symbol", "suffix", "prefix", "affix", "infix"}


def _donor(data: dict, k: str, dialect: str = ""):
    """The meanings of key k in a meanings file, as groups to copy, marked with the language they come
    from (`dialect`). From another language: never a name or an abbreviation, nor a meaning that file
    itself borrowed."""
    for kk in [k] + [r[0] for r in data["forms"].get(k, [])]:
        out = []
        for shown, pos, glosses, extra in data["words"].get(kk) or []:
            parts = (extra.split("|") + ["", "", ""])[:3]
            if dialect:
                if pos in SKIP_BORROWED or parts[2] in BORROWED:
                    continue
                parts[2] = dialect
            out.append([shown, pos, glosses, "|".join(parts).rstrip("|")])
        if out:
            return out[:3]
    return None


def fill_gaps(lang: str, data: dict) -> None:
    """Give the Tagalog or Bisaya words with no meaning one from another source (see above)."""
    def load(name):
        p = OUT / name
        return json.loads(gzip.decompress(p.read_bytes())) if p.exists() else None

    words_list = load(WORD_LISTS[lang])["lemmas"]
    wolff = load("ceb-wolff-meanings.json.gz") if lang == "ceb" else None
    tagalog = load("tl-meanings.json.gz") if lang == "ceb" else None
    english = load("en-meanings.json.gz")

    def found(d, k):
        return d is not None and (k in d["words"] or k in d["forms"])

    spelled = {w: (full, what) for w, full, what in SPELLINGS.get(lang, [])}
    # Bisaya keys are written with three vowels (see key()), so an English word may share its key with
    # another word of the list (English bae with Bisaya bai, "friend"): then it is not borrowed.
    spellings: dict[str, set] = {}
    for w in words_list:
        spellings.setdefault(key(w, lang), set()).add(w.lower())
    counts = {"prefix": 0, "spelling": 0, "Tagalog": 0, "English": 0}
    for w in words_list:
        k = key(w, lang)
        if not k or found(data, k) or found(wolff, k):
            continue
        if f"{k}-" in data["words"]:  # mag -> mag-
            data["forms"][k] = [[f"{k}-", f"the prefix {w}-, written on its own"]]
            counts["prefix"] += 1
        elif w in spelled:
            full, what = spelled[w]
            fk = key(full, lang)
            if fk in data["words"]:
                data["forms"][k] = [[fk, what]]
            else:
                groups = (wolff and _donor(wolff, fk)) or (tagalog and _donor(tagalog, key(full, "tl"), "Tagalog word"))
                if not groups:
                    print(f"  {lang}: no meaning anywhere for {full} ({w})", flush=True)
                    continue
                data["words"][k] = [[w, g[1], g[2], g[3]] for g in groups]
            counts["spelling"] += 1
        # An English spelling in Filipino text is the English word (said, days), not a Tagalog lookalike;
        # a word without a vowel is an abbreviation (pvc, kg).
        elif (english and w.isascii() and w.isalpha() and re.search("[aeiouy]", w) and w.lower() not in NOT_ENGLISH
              and k not in NOT_ENGLISH and len(spellings[k]) == 1
              and (groups := _donor(english, w.lower(), "English word"))):
            data["words"][k] = groups
            counts["English"] += 1
        elif tagalog is not None and (groups := _donor(tagalog, key(w, "tl"), "Tagalog word")):
            data["words"][k] = groups
            counts["Tagalog"] += 1
    print(f"  {lang}: gaps filled: " + ", ".join(f"{n} {v}" for v, n in counts.items()), flush=True)


def fill(lang: str) -> None:
    path = OUT / f"{lang}-meanings.json.gz"
    data = json.loads(gzip.decompress(path.read_bytes()))
    fill_gaps(lang, data)
    write(lang, data)


def add_numbers(lang: str) -> None:
    """Add the number words to a language's file already in docs/lexicon, without reading the whole
    language again (files made before number words were kept had none: tres, deux, dalawa)."""
    path = OUT / f"{lang}-meanings.json.gz"
    data = json.loads(gzip.decompress(path.read_bytes()))
    words: dict[str, list] = {}
    forms: dict[str, list] = {}
    sources = [numbers_url(NAMES[lang])] + ([numbers_url(n) for n in DIALECTS.values()] if lang == "ar" else [])
    for src in sources:
        try:
            read(lang, src, words, forms)
        except OSError as e:  # (a dialect with no number words has no such file)
            print(f"  {lang}: no number words at {src.rsplit('/', 1)[-1]} ({e})", flush=True)
    if lang == "en":
        words, forms = common_english(words, forms)
    if lang == "zh":
        simplified_spellings(words, forms)
    added = 0
    for k, groups in words.items():
        have = data["words"].setdefault(k, [])
        for g in groups:
            if g not in have:
                have.append(g)
                added += 1
        # The number first when the word's other meanings are things and qualities: Bisaya tulo is "three"
        # before "waterdrop", French neuf "nine" before "new"; un stays "a", wala "none".
        if all(g[1] in ("num", "noun", "adj", "name") for g in have):
            have.sort(key=lambda g: g[1] != "num")
        have.sort(key=lambda g: g[1] == "name")
    for k, rows in forms.items():
        row = data["forms"].setdefault(k, [])
        for r in rows:
            if r[0] in data["words"] and len(row) < 4 and all(x[0] != r[0] for x in row):
                row.append(r)
        if not row:
            del data["forms"][k]
    print(f"  {lang}: {added} meanings of number words added", flush=True)
    write(lang, data)


def main(args: list[str]) -> None:
    if args and args[0] == "--fill":
        for lang in args[1:] or list(WORD_LISTS):
            fill(lang)
        return
    if args and args[0] == "--numbers":
        for lang in args[1:] or list(NAMES):
            add_numbers(lang)
        return
    for arg in args or list(NAMES):
        lang, _, source = arg.partition("=")
        if lang not in NAMES:
            sys.exit(f"Unknown language {lang!r}: use {' '.join(NAMES)}")
        data = build(lang, source or url(NAMES[lang]))
        if lang in WORD_LISTS:
            fill_gaps(lang, data)
        write(lang, data)


if __name__ == "__main__":
    main(sys.argv[1:])
