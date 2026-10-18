"""Build the Russian word table: each word form, its dictionary form, and where its stress falls.

From the OpenRussian.org dictionary data (https://github.com/Badestrand/russian-dictionary,
CC BY-SA 4.0; much of it from Wiktionary): every noun, adjective and verb with all its case,
number, gender, tense and person forms, written with the stressed vowel marked (челове'к), and
each verb's aspect partner (сказать / говорить). The app uses the table to treat all those forms,
and both verbs of an aspect pair, as one word, and to show stress marks (web/js/lexicon/russian.js).

    pip install wordfreq
    python tools/build_russian.py path/to/folder-with-the-csv-files

Writes docs/lexicon/ru-lemmas.json.gz and adds it to docs/lexicon/index.json. The table is made
from CC BY-SA data, so it is CC BY-SA 4.0 too (docs/lexicon/README.md).

Layout (read by web/js/lexicon/russian.js): the usual word table (lemmas, forms: only forms that
differ from their dictionary form), plus `stress` {form: n}: n >= 0 is the index of the stressed
vowel; n < 0 means the е at index -n-1 is really ё. Forms are keyed in matching form: lower case,
no stress marks, ё written е.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import json
import sys
from pathlib import Path

from wordfreq import top_n_list

OUT = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
FORMAT = 1
KEEP = 300_000
VOWELS = set("аеёиоуыэюя")
FORM_COLUMNS = {
    "nouns": ["sg_nom", "sg_gen", "sg_dat", "sg_acc", "sg_inst", "sg_prep", "pl_nom", "pl_gen", "pl_dat", "pl_acc",
              "pl_inst", "pl_prep"],
    "verbs": ["imperative_sg", "imperative_pl", "past_m", "past_f", "past_n", "past_pl", "presfut_sg1", "presfut_sg2",
              "presfut_sg3", "presfut_pl1", "presfut_pl2", "presfut_pl3"],
    "adjectives": ["comparative", "superlative", "short_m", "short_f", "short_n", "short_pl"]
                  + [f"decl_{g}_{c}" for g in ("m", "f", "n", "pl") for c in ("nom", "gen", "dat", "acc", "inst", "prep")],
    "others": [],
}


def match(word: str) -> str:
    """The form words are matched in: lower case, no stress mark, ё as е (the app does the same)."""
    return word.lower().replace("'", "").replace("́", "").replace("ё", "е").strip()


def stress_of(accented: str) -> int | None:
    """Where the stress falls in an accented form (челове'к -> 6; ещё -> -3 meaning "е at 2 is ё").
    None when it isn't marked or the word has one vowel (nothing to show)."""
    word = accented.lower().strip()
    plain = word.replace("'", "")
    if sum(ch in VOWELS for ch in plain) < 2:
        return None
    if "ё" in plain:
        return -(plain.index("ё") + 1)
    if word.count("'") != 1 or not word.index("'"):
        return None
    pos = word.index("'") - 1
    return pos if plain[pos] in VOWELS else None


def variants(cell: str) -> list[str]:
    return [v.strip() for v in (cell or "").replace(";", ",").split(",") if v.strip() and "*" not in v and " " not in v.strip()]


def main(folder: str) -> None:
    common = {match(w) for w in top_n_list("ru", KEEP, wordlist="large")}
    rows = {name: list(csv.DictReader((Path(folder) / f"{name}.csv").open(encoding="utf-8"), delimiter="\t"))
            for name in FORM_COLUMNS}
    # An aspect pair counts as one word, under its imperfective (the one learners meet first:
    # говорить for сказать). Only when the partner is itself in the dictionary as imperfective.
    imperfective = {match(r["bare"]) for r in rows["verbs"] if r.get("aspect") == "imperfective"}
    lemma_of_verb = {}
    for r in rows["verbs"]:
        if r.get("aspect") == "perfective":
            for partner in variants(r.get("partner", "")):
                if match(partner) in imperfective:
                    lemma_of_verb[match(r["bare"])] = match(partner)
                    break

    lemmas: dict[str, int] = {}
    shown: dict[str, str] = {}  # matching form of a lemma -> how it is written (with ё)
    readings: dict[str, set[str]] = {}
    stresses: dict[str, set[int]] = {}

    def add(form_text: str, lemma: str) -> None:
        form = match(form_text)
        if not form or not form.replace("-", "").isalpha():
            return
        readings.setdefault(form, set()).add(lemma)
        s = stress_of(form_text)
        stresses.setdefault(form, set()).add(s if s is not None else 99)

    for name, cols in FORM_COLUMNS.items():
        for r in rows[name]:
            bare = (r.get("bare") or "").strip()
            if not bare or " " in bare:
                continue
            lemma = match(bare)
            if name == "verbs":
                lemma = lemma_of_verb.get(lemma, lemma)
            shown.setdefault(match(bare), bare.lower())
            add(r.get("accented") or bare, lemma)
            for col in cols:
                for v in variants(r.get(col, "")):
                    add(v, lemma)

    forms: dict[str, int] = {}
    stress: dict[str, int] = {}

    def lemma_id(lemma: str) -> int:
        return lemmas.setdefault(lemma, len(lemmas))

    for form in sorted(readings):
        options = sorted(readings[form])
        for lemma in options:
            lemma_id(lemma)
        # A form that is itself a dictionary form keeps its own key; otherwise the first reading
        # (rare: one spelling in two words' tables).
        best = form if form in options else options[0]
        if form not in common and best not in common:
            continue
        if best != form:
            forms[form] = lemma_id(best)
        marks = stresses.get(form, set()) - {99}
        if len(marks) == 1 and 99 not in stresses[form]:  # only when every source agrees (за́мок / замо́к: no mark)
            stress[form] = next(iter(marks))
    ordered = sorted(lemmas, key=lemmas.get)
    data = {"format": FORMAT, "kind": "lemmas", "name": "ru", "lang": "ru", "title": "Russian", "license": "CC-BY-SA-4.0",
            "lemmas": ordered, "shown": {k: v for k, v in shown.items() if k != v and k in lemmas},
            "forms": forms, "stress": stress}
    blob = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)
    file = "ru-lemmas.json.gz"
    (OUT / file).write_bytes(blob)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["files"]["ru"] = {"file": file, "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
                            "title": "Russian word forms and stress", "db": "OpenRussian.org", "license": "CC-BY-SA-4.0",
                            "forms": len(forms), "lexemes": len(ordered), "stressed": len(stress)}
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{file}: {len(blob) / 1e6:.2f} MB, {len(forms):,} forms, {len(ordered):,} dictionary forms, "
          f"{len(stress):,} with stress, {len(lemma_of_verb):,} perfectives joined to their partner")


if __name__ == "__main__":
    main(sys.argv[1])
