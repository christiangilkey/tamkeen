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
          "ca": "Catalan", "ceb": "Bisaya (Cebuano)"}
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
        data = tagalog_words() if lang == "tl" else cebuano_words(Path(src)) if lang == "ceb" else convert(lang, Path(src))
        if lang == "en" and cmu:
            data["ipa"] = pronunciations(Path(cmu))
            data["ipa_source"] = "CMU Pronouncing Dictionary"
        blob = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)
        file = ROOT_LISTS.get(lang, f"{lang}-lemmas.json.gz")
        (OUT / file).write_bytes(blob)
        db = {"tl": "wordfreq (fil)", "ceb": "OPUS NLLB Cebuano text"}.get(lang, "lemmatization-lists + wordfreq")
        index["files"][lang] = {"file": file, "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
                                "title": f"{TITLES[lang]} word list" if lang in ROOT_LISTS else f"{TITLES[lang]} word forms",
                                "db": db,
                                "license": data["license"], "forms": len(data["forms"]), "lexemes": len(data["lemmas"])}
        print(f"{file}: {len(blob) / 1e6:.2f} MB, {len(data['forms']):,} forms, {len(data['lemmas']):,} dictionary forms")
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
