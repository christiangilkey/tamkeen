"""Build the Spanish, French and Italian word tables: each word form and its dictionary form.

The app uses them to treat hablas, hablaste and hablemos as one word, hablar (see
web/js/lexicon/romance.js). They come from two open data sets:

  - lemmatization lists by Michal Měchura (https://github.com/michmech/lemmatization-lists,
    Open Database License 1.0): lines of "dictionary form <tab> word form";
  - wordfreq (https://github.com/rspeer/wordfreq, CC BY-SA 4.0) word counts, used to keep the
    forms people actually meet, and to choose between two dictionary forms for one spelling
    (ligas: liga "league" or ligar "to tie"?) by how common each is.

    pip install wordfreq
    python tools/build_lemmas.py es=path/to/lemmatization-es.txt fr=... it=...

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
TITLES = {"es": "Spanish", "fr": "French", "it": "Italian"}
WORD = re.compile(r"^[\w'’-]+$")
# Common words the lists get wrong or leave out (checked by hand): form -> dictionary form.
EXTRA = {
    "it": {"uomini": "uomo", "begli": "bello", "bei": "bello", "bel": "bello", "bella": "bello", "belle": "bello",
           "po'": "poco"},
}


def clean(word: str) -> str:
    """As the app cleans a word (romance.js cleanWord): NFC, lower case, one kind of apostrophe."""
    return unicodedata.normalize("NFC", word.strip().replace("’", "'")).lower()


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
    for arg in args:
        lang, _, src = arg.partition("=")
        if lang not in TITLES or not src:
            raise SystemExit(f"Expected lang=path with lang one of {', '.join(TITLES)}; got {arg!r}")
        data = convert(lang, Path(src))
        blob = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)
        file = f"{lang}-lemmas.json.gz"
        (OUT / file).write_bytes(blob)
        index["files"][lang] = {"file": file, "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
                                "title": f"{TITLES[lang]} word forms", "db": "lemmatization-lists + wordfreq",
                                "license": "ODbL-1.0", "forms": len(data["forms"]), "lexemes": len(data["lemmas"])}
        print(f"{file}: {len(blob) / 1e6:.2f} MB, {len(data['forms']):,} forms, {len(data['lemmas']):,} dictionary forms")
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
