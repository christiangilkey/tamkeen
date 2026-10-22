"""Build the Spanish, French, Italian, Portuguese, Catalan and English word tables: each word form and its dictionary form.

The app uses them to treat hablas, hablaste and hablemos as one word, hablar (see
web/js/lexicon/romance.js). They come from two open data sets:

  - lemmatization lists by Michal Měchura (https://github.com/michmech/lemmatization-lists,
    Open Database License 1.0): lines of "dictionary form <tab> word form";
  - wordfreq (https://github.com/rspeer/wordfreq, CC BY-SA 4.0) word counts, used to keep the
    forms people actually meet, and to choose between two dictionary forms for one spelling
    (ligas: liga "league" or ligar "to tie"?) by how common each is.

    pip install wordfreq
    python tools/build_lemmas.py es=path/to/lemmatization-es.txt fr=... it=... pt=... ca=... en=... cmu=path/to/cmudict.dict

Tagalog has no list of forms: its table is just wordfreq's Filipino word list, most common first,
which web/js/lexicon/tagalog.js checks the roots it finds against (`tl=wordfreq`).

Bisaya (Cebuano) is the same, but wordfreq has no Cebuano: its list is counted from the Cebuano web
text in OPUS's NLLB collection (https://opus.nlpl.eu/NLLB, ODC-By 1.0), lines that read as Tagalog
or English left out (`ceb=path/to/ceb_freq.tsv`, word <tab> count, most common first; made by
counting the words of https://object.pouta.csc.fi/OPUS-NLLB/v1/mono/ceb.txt.gz). Its roots are
found by web/js/lexicon/cebuano.js.

German (`de=path/to/lemmatization-de.txt,path/to/kaikki.org-dictionary-German.jsonl.gz`) keeps capital
letters, because they tell a noun from another word (Essen "food" is not essen "to eat"): its keys are
the forms as written, and a capitalised form that is also a verb's form at the start of a sentence (Fange)
gets a lower-case key too. The list is in the spelling from before 1996 (mußte, Fluß, rauh): the English
Wiktionary's German entries (https://kaikki.org, CC BY-SA 4.0) say which spellings the reform replaced,
so each dictionary form is in today's spelling (Fluss, rau; Straße and groß stay) and the old spellings
still find it; every form with ß also gets the Swiss twin with ss (Strasse, gross). The list leaves out
words that never change form (aber, dass, sehr): the common ones Wiktionary has are added as they are.
Its dictionary forms are listed commonest first, so their place in the list is how common they are
(web/js/lexicon/german.js uses that to split compound words it doesn't know).

English also gets US pronunciations (IPA) from the CMU Pronouncing Dictionary
(https://github.com/cmusphinx/cmudict, BSD-style licence, see licenses/cmudict.txt), for the
words people meet most, shown in the word popup.

Writes docs/lexicon/<lang>-lemmas.json.gz and adds it to docs/lexicon/index.json. The tables are
derived databases, so they stay under the Open Database License (docs/lexicon/README.md).
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

from wordfreq import top_n_list, zipf_frequency

OUT = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
FORMAT = 1
KEEP = 250_000  # forms beyond this many of the language's commonest words are left out
TITLES = {"es": "Spanish", "fr": "French", "it": "Italian", "en": "English", "tl": "Tagalog", "pt": "Portuguese",
          "ca": "Catalan", "ceb": "Bisaya (Cebuano)", "de": "German"}
ROOT_LISTS = {"tl": "tl-roots.json.gz", "ceb": "ceb-roots.json.gz"}  # word lists, not tables of forms
IPA_WORDS = 60_000  # English words that get a pronunciation
WORD = re.compile(r"^[\w'’-]+$")
# Common words the lists get wrong or leave out (checked by hand): form -> dictionary form.
EXTRA = {
    "it": {"uomini": "uomo", "begli": "bello", "bei": "bello", "bel": "bello", "bella": "bello", "belle": "bello",
           "po'": "poco"},
    "ca": {"dones": "dona"},
}


def clean(word: str) -> str:
    """As the app cleans a word (romance.js cleanWord): NFC, lower case, one kind of apostrophe."""
    return unicodedata.normalize("NFC", word.strip().replace("’", "'")).lower()


# ---------- CMU Pronouncing Dictionary (ARPAbet) to IPA, US English ----------
ARPA = {"AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "B": "b", "CH": "tʃ", "D": "d", "DH": "ð",
        "EH": "ɛ", "ER": "ɝ", "EY": "eɪ", "F": "f", "G": "ɡ", "HH": "h", "IH": "ɪ", "IY": "i", "JH": "dʒ", "K": "k",
        "L": "l", "M": "m", "N": "n", "NG": "ŋ", "OW": "oʊ", "OY": "ɔɪ", "P": "p", "R": "ɹ", "S": "s", "SH": "ʃ",
        "T": "t", "TH": "θ", "UH": "ʊ", "UW": "u", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ"}
ONSETS = {"pl", "pɹ", "bl", "bɹ", "tɹ", "dɹ", "kl", "kɹ", "ɡl", "ɡɹ", "fl", "fɹ", "θɹ", "ʃɹ", "sp", "st", "sk", "sm",
          "sn", "sl", "sw", "tw", "kw", "dw", "pj", "bj", "kj", "fj", "mj", "hj", "spl", "spɹ", "stɹ", "skɹ", "skw"}


def to_ipa(phones: list[str]) -> str:
    """ARPAbet phones to IPA with stress marks before the stressed syllable (a simple onset rule)."""
    out: list[str] = []  # (symbol) per phone
    marks: list[tuple[int, str]] = []
    for p in phones:
        base, stress = (p[:-1], p[-1]) if p[-1].isdigit() else (p, "")
        sym = ARPA.get(base, "")
        if base == "AH" and stress == "0":
            sym = "ə"
        if base == "ER" and stress == "0":
            sym = "ɚ"
        if stress in ("1", "2"):
            marks.append((len(out), "ˈ" if stress == "1" else "ˌ"))
        out.append(sym)
    for vowel, mark in reversed(marks):
        start = vowel
        # Take in as many consonants before the vowel as can start a syllable together.
        for n in (3, 2, 1):
            cluster = out[vowel - n:vowel] if vowel - n >= 0 else None
            if cluster and all(c and c not in "ɑæʌɔəɛɝɚɪiʊu" and not c.startswith(("a", "e", "o")) for c in cluster)                     and (n == 1 or "".join(cluster) in ONSETS):
                start = vowel - n
                break
        out.insert(start, mark)
    return "".join(out)


def pronunciations(path: Path) -> dict[str, str]:
    common = top_n_list("en", IPA_WORDS, wordlist="large")
    wanted = set(common)
    found: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split("#")[0].split()
        if len(parts) < 2 or "(" in parts[0]:
            continue  # only the first pronunciation of each word
        word = parts[0].lower()
        if word in wanted and word not in found:
            found[word] = to_ipa(parts[1:])
    return found


def tagalog_words() -> dict:
    """wordfreq's Filipino list (its only list for the language), letters only, most common first."""
    words = [w for w in top_n_list("fil", 100_000, wordlist="small") if re.fullmatch(r"[a-zñ'-]+", w) and len(w) > 1]
    return {"format": FORMAT, "kind": "lemmas", "name": "tl", "lang": "tl", "title": "Tagalog",
            "license": "CC-BY-SA-4.0", "lemmas": words, "forms": {}}


def cebuano_words(path: Path) -> dict:
    """The commonest 60,000 words of the Cebuano count, letters only, most common first."""
    words = []
    for line in path.read_text(encoding="utf-8").splitlines():
        w, _, n = line.partition("\t")
        if re.fullmatch(r"[a-zñ'-]+", w) and len(w) > 1 and int(n or 0) >= 5:
            words.append(w)
        if len(words) == 60_000:
            break
    return {"format": FORMAT, "kind": "lemmas", "name": "ceb", "lang": "ceb", "title": "Bisaya (Cebuano)",
            "license": "ODC-BY-1.0", "lemmas": words, "forms": {}}


def convert(lang: str, path: Path) -> dict:
    common = set(top_n_list(lang, KEEP, wordlist="large"))
    readings: dict[str, set[str]] = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        parts = line.split("\t")
        if len(parts) != 2:
            continue
        lemma, form = clean(parts[0]), clean(parts[1])
        if not lemma or not form or " " in lemma or " " in form or not WORD.match(form) or not WORD.match(lemma):
            continue
        readings.setdefault(form, set()).add(lemma)
    lemmas: dict[str, int] = {}
    forms: dict[str, int] = {}

    def lemma_id(lemma: str) -> int:
        return lemmas.setdefault(lemma, len(lemmas))

    all_lemmas = {l for options in readings.values() for l in options}
    zipf = lambda w: zipf_frequency(w, lang, wordlist="large")  # noqa: E731
    for form in sorted(readings):
        options = set(readings[form])
        for lemma in options:
            lemma_id(lemma)
        best = max(sorted(options), key=lambda l: (zipf(l), l == form))
        # A spelling that is itself a dictionary form (casa, caso) keeps its own key unless the other
        # reading is clearly commoner; and a "dictionary form" nobody uses (a slip in the list, like
        # aujourd'huie) never takes over a common word.
        if form in all_lemmas and zipf(form) > zipf(best) + 0.5:
            best = form
        elif zipf(best) < 1 <= zipf(form):
            best = form
        best = EXTRA.get(lang, {}).get(form, best)
        if best != form and (form in common or best in common):
            forms[form] = lemma_id(best)
    for form, lemma in EXTRA.get(lang, {}).items():  # forms the lists don't have at all
        if form not in readings and form != lemma:
            forms[form] = lemma_id(lemma)
    ordered = sorted(lemmas, key=lemmas.get)
    return {"format": FORMAT, "kind": "lemmas", "name": lang, "lang": lang, "title": TITLES[lang],
            "license": "ODbL-1.0", "lemmas": ordered, "forms": forms}


REFORMED = re.compile(r"^Formerly standard spelling of (\S+)")
# (Wiktionary also says "obsolete spelling of passt" for paßt, "alternative spelling of lässt" for läßt:
# taken as the reform's only when it is that ß written ss.)
OLD_SPELLING = re.compile(r"^(?:obsolete|alternative|dated|archaic) spelling of (\S+?)[;,]?(?:\s|$)")


SWISS = re.compile(r"^Switzerland(?: and Liechtenstein)? standard spelling of (\S+)")
SENTENCE = re.compile(r"(?<=[.!?:;])\s+")
WORDS = re.compile(r"[^\W\d_][\w-]*")


def wiktionary_german(path: Path) -> tuple[dict[str, str], set[str], set[str], dict[str, int], dict[str, str]]:
    """From the English Wiktionary's German entries (kaikki.org .jsonl.gz): the spellings the 1996 reform
    replaced, {old: new} (mußte: musste, Fluß: Fluss, rauh: rau, Rußland: Russland); the lower-case words
    with meanings of their own (aber, dass, sehr: words that never change form, which the list of forms
    leaves out); every word it has an entry for, as written; how often each word is written so in the middle
    of a sentence in the entries' German examples, {spelling: count} (Zeit 300, zeit 2: a word's capital
    letter at the start of a sentence is more likely the noun's); and Switzerland's spellings, {Fussball: Fußball}."""
    reformed: dict[str, str] = {}
    plain: set[str] = set()
    entries: set[str] = set()
    written: dict[str, int] = {}
    swiss: dict[str, str] = {}
    with gzip.open(path, "rt", encoding="utf-8") as lines:
        for line in lines:
            e = json.loads(line)
            word = e.get("word") or ""
            if e.get("lang_code") != "de" or not word or e.get("pos") in ("character", "symbol", "punct"):
                continue
            name = e.get("pos") == "name"
            for s in e.get("senses") or []:
                for ex in s.get("examples") or []:
                    for sentence in SENTENCE.split(unicodedata.normalize("NFC", str(ex.get("text") or ""))):
                        for w in WORDS.findall(sentence)[1:]:  # (not the first word: every sentence starts with a capital)
                            written[w] = written.get(w, 0) + 1
                gloss = (s.get("glosses") or [""])[-1]
                swiss_spelling = SWISS.match(gloss)
                if swiss_spelling:
                    swiss[word] = swiss_spelling.group(1)
                m = REFORMED.match(gloss)
                old = OLD_SPELLING.match(gloss)
                if m:
                    reformed[word] = m.group(1)
                elif old and "ß" in word and old.group(1) == word.replace("ß", "ss"):
                    reformed[word] = old.group(1)
                elif name:
                    continue
                elif gloss and not (s.get("form_of") or s.get("alt_of")) and word == word.lower() and WORD.match(word):
                    plain.add(word)
            if WORD.match(word) and not name:
                entries.add(word)
    return reformed, plain, entries, written, swiss


def german(path: Path, wiktionary: Path | None = None) -> dict:
    """German: forms as written (capitals kept), today's spelling beside the list's old one; see the top."""
    common = set(top_n_list("de", KEEP, wordlist="large"))
    zipf = lambda w: zipf_frequency(w, "de", wordlist="large")  # noqa: E731 (case-blind, and ß is ss to it)
    tidy = lambda w: unicodedata.normalize("NFC", w.strip().replace("’", "'"))  # noqa: E731
    reformed, plain, _, written, _ = wiktionary_german(wiktionary) if wiktionary else ({}, set(), set(), {}, {})

    readings: dict[str, set[str]] = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        parts = line.split("\t")
        if len(parts) != 2:
            continue
        lemma, form = tidy(parts[0]), tidy(parts[1])
        if not lemma or not form or not WORD.match(form) or not WORD.match(lemma):
            continue
        lemma = reformed.get(lemma, lemma)  # Fluß -> Fluss: the dictionary form in today's spelling
        readings.setdefault(form, set()).add(lemma)
        readings.setdefault(lemma, set()).add(lemma)
    # Words that never change form (aber, dass), when common: their own dictionary form.
    for word in plain:
        if word in common and word not in readings:
            readings[word] = {word}
    # The old spelling of a word, and of each of its forms, is that word: daß is dass, mußte is müssen,
    # rauh is rau.
    for old, new in reformed.items():
        if old in readings and new not in readings:
            readings[new] = set(readings[old])
        if new in readings:
            readings[old] = set(readings[new])
    # A capitalised form that is also a verb's or adjective's (Fange, of fangen, from the start of a
    # sentence): the lower-case spelling is that word's.
    for form, options in list(readings.items()):
        if form[:1].isupper() and form[1:] == form[1:].lower():
            low = form[:1].lower() + form[1:]
            small = {l for l in options if l[:1].islower()}
            if small and low not in readings:
                readings[low] = small
    # Switzerland writes ss for every ß (Strasse, gross, heissen): each form with ß has that twin too,
    # unless it is a word of its own (Masse "mass" is not Maße "measures").
    for form, options in list(readings.items()):
        if "ß" in form and form.replace("ß", "ss") not in readings:
            readings[form.replace("ß", "ss")] = set(options)

    def pick(form: str, options: set[str]) -> str:
        # A capitalised form is a noun's when it can be (Fange: Fang), a lower-case one the other word's.
        same_case = {l for l in options if l[:1].isupper() == form[:1].isupper()}
        pool = same_case or options
        best = max(sorted(pool), key=lambda l: (zipf(l), l == form))
        if form in pool and zipf(form) > zipf(best) + 0.5:
            best = form
        elif zipf(best) < 1 <= zipf(form) and form in options:
            best = form
        return best

    chosen: dict[str, str] = {}
    for form in sorted(readings):
        best = pick(form, readings[form])
        if form.lower() in common or best.lower() in common or best == form:
            chosen[form] = best
    used = set(chosen.values())

    # Commonest first, so a dictionary form's place says how common it is. wordfreq can't tell Aber "an
    # objection" from aber "but", or Ich "the self" from ich "I": the capitalised one of such a pair comes later.
    def rank(lemma: str) -> float:
        return zipf(lemma) - (1.5 if lemma[:1].isupper() and lemma[:1].lower() + lemma[1:] in used else 0)

    lemmas = sorted(used, key=lambda l: (-rank(l), l))
    ids = {l: i for i, l in enumerate(lemmas)}
    forms = {f: ids[l] for f, l in chosen.items() if f != l}
    # Words written both ways whose capitalised one is the commoner in the middle of a sentence (Zeit, not the
    # preposition zeit; Spaß, not spaß "joke!"): at the start of a sentence, the capitalised one is read first.
    caps_first = sorted(low for low in chosen if low[:1].islower() and upperFirst(low) in chosen
                        and written.get(upperFirst(low), 0) > max(2, 2 * written.get(low, 0)))
    return {"format": FORMAT, "kind": "lemmas", "name": "de", "lang": "de", "title": TITLES["de"],
            "license": "ODbL-1.0", "lemmas": lemmas, "forms": forms, "ranked": True, "caps_first": caps_first}


def upperFirst(w: str) -> str:  # noqa: N802 (as in web/js/lexicon/german.js)
    return w[:1].upper() + w[1:]


def german_spellings(path: Path, wiktionary: Path) -> dict[str, str]:
    """How German words are written today, by the form wordfreq counts them in (lower case, ß as ss):
    {"weiss": "weiß", "strasse": "Straße", "zeit": "Zeit", "aber": "aber", "muss": "muss", "im": "im"}.
    Spellings from before 1996 and Switzerland's ss are left out. Of the ways left (from the word list and
    Wiktionary's entries), the one written most in the middle of a sentence in Wiktionary's German examples
    wins (Zeit over the preposition zeit, aber over das Aber), then one the word list has; abbreviations in
    capitals (IM) never win over a word. For tools/make_wordlists.py."""
    reformed, _, entries, written, swiss = wiktionary_german(wiktionary)
    tidy = lambda w: unicodedata.normalize("NFC", w.strip().replace("’", "'"))  # noqa: E731
    listed: set[str] = set()
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        parts = line.split("\t")
        if len(parts) != 2:
            continue
        lemma, form = tidy(parts[0]), tidy(parts[1])
        if not WORD.match(lemma) or not WORD.match(form):
            continue
        listed.update((lemma, form))
        if form[:1].isupper() and lemma[:1].islower():  # Habe, Muß: a verb's form at the start of a sentence
            listed.add(form[:1].lower() + form[1:])
    standard = lambda w: swiss.get(reformed.get(w, w), reformed.get(w, w))  # noqa: E731
    options: dict[str, set[str]] = {}
    for w in {standard(x) for x in listed | entries}:
        options.setdefault(w.lower().replace("ß", "ss"), set()).add(w)
    caps = lambda s: len(s) > 1 and s == s.upper()  # noqa: E731 (IM, ARD)
    return {key: max(sorted(ways), key=lambda w: (not caps(w), written.get(w, 0), w in listed, w[:1].islower()))
            for key, ways in options.items()}


def main(args: list[str]) -> None:
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    cmu = next((a.partition("=")[2] for a in args if a.startswith("cmu=")), None)
    for arg in args:
        lang, _, src = arg.partition("=")
        if lang == "cmu":
            continue
        if lang not in TITLES or not src:
            raise SystemExit(f"Expected lang=path with lang one of {', '.join(TITLES)}; got {arg!r}")
        if lang == "de":  # de=<lemmatization-de.txt>[,<kaikki.org German .jsonl.gz>]
            src, _, wikt = src.partition(",")
        data = (tagalog_words() if lang == "tl" else cebuano_words(Path(src)) if lang == "ceb"
                else german(Path(src), Path(wikt) if wikt else None) if lang == "de" else convert(lang, Path(src)))
        if lang == "en" and cmu:
            data["ipa"] = pronunciations(Path(cmu))
            data["ipa_source"] = "CMU Pronouncing Dictionary"
        blob = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)
        file = ROOT_LISTS.get(lang, f"{lang}-lemmas.json.gz")
        (OUT / file).write_bytes(blob)
        db = {"tl": "wordfreq (fil)", "ceb": "OPUS NLLB Cebuano text",
              "de": "lemmatization-lists + wordfreq + Wiktionary spellings"}.get(lang, "lemmatization-lists + wordfreq")
        index["files"][lang] = {"file": file, "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
                                "title": f"{TITLES[lang]} word list" if lang in ROOT_LISTS else f"{TITLES[lang]} word forms",
                                "db": db,
                                "license": data["license"], "forms": len(data["forms"]), "lexemes": len(data["lemmas"])}
        print(f"{file}: {len(blob) / 1e6:.2f} MB, {len(data['forms']):,} forms, {len(data['lemmas']):,} dictionary forms")
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
