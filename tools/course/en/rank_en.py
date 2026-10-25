"""Step 2 of the English basics course's word list: the forms counted by forms.py, grouped by dictionary
word (went, goes and going all count for "go") with the English table the app uses (docs/lexicon
en-lemmas.json.gz), ranked by how common each dictionary word is in all its forms together.

    python tools/course/en/rank_en.py   ->  tools/course/build/en-ranked.json
        [{rank, lemma, freq, forms: [[form, freq], ...]}, ...]  (the top 2000)

Some forms are kept apart as learner's dictionaries do (could is not "can", better is not "good"), and
contractions count for the word they start with (don't for "do", it's for "it"). Numbers written in
digits and stray letters ("s" and "t" from "it's" and "don't") are left out.
"""

from __future__ import annotations

import gzip
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
BUILD = HERE.parent / "build"

# Forms that are words of their own for a learner (the table files them under another word).
OWN = {"could", "might", "better", "best", "worse", "worst", "less", "least", "more", "most", "further",
       "left", "data", "media", "news", "people", "according", "born", "building", "meeting", "evening",
       "feeling", "interesting", "interested", "amazing", "tired", "boring", "bored", "surprised", "worried",
       "married", "scared", "clothes", "politics", "including", "as", "well", "later"}
# British spellings counted with the American ones (the course is American English).
US = {"centre": "center", "colour": "color", "favourite": "favorite", "honour": "honor", "defence": "defense",
      "labour": "labor", "behaviour": "behavior", "organisation": "organization", "programme": "program",
      "realise": "realize", "neighbour": "neighbor", "theatre": "theater", "towards": "toward", "grey": "gray",
      "organise": "organize", "recognise": "recognize", "apologise": "apologize", "jewellery": "jewelry",
      "metre": "meter", "litre": "liter", "cheque": "check", "mum": "mom", "humour": "humor", "flavour": "flavor"}
# Contractions whose first part isn't the word itself.
NT = {"ca": "can", "wo": "will", "sha": "shall", "ai": "be"}
KEEP_LETTERS = {"a", "i"}


def main() -> None:
    table = json.loads(gzip.open(ROOT / "docs" / "lexicon" / "en-lemmas.json.gz", "rt", encoding="utf-8").read())
    lemmas, forms_of = table["lemmas"], table["forms"]

    def lemma(form: str) -> str:
        return US.get(table_lemma(form), table_lemma(form))

    def table_lemma(form: str) -> str:
        if form in OWN:
            return form
        if form in forms_of and not lemmas[forms_of[form]].isdigit():  # the table has "1" for "first"
            return lemmas[forms_of[form]]
        return form

    def head(form: str) -> str | None:
        """The dictionary word a form counts for, or None to leave it out."""
        if re.fullmatch(r"[\d.,:/%-]+", form):
            return None
        if len(form) == 1 and form not in KEEP_LETTERS:
            return None
        m = re.fullmatch(r"([a-z]+)n['’]t", form)
        if m:
            return lemma(NT.get(m.group(1), m.group(1)))
        m = re.fullmatch(r"([a-z]+)['’](s|m|re|ve|ll|d)", form)
        if m and m.group(1) not in ("o",):
            return lemma(m.group(1))
        return lemma(form)

    rows = json.loads((BUILD / "en-forms.json").read_text(encoding="utf-8"))
    by: dict[str, dict] = {}
    for form, freq in rows:
        h = head(form)
        if not h:
            continue
        e = by.setdefault(h, {"lemma": h, "freq": 0.0, "forms": []})
        e["freq"] += freq
        e["forms"].append([form, freq])
    ranked = sorted(by.values(), key=lambda e: -e["freq"])[:2000]
    out = [{"rank": i + 1, "lemma": e["lemma"], "freq": float(f"{e['freq']:.4g}"),
            "forms": [[f, float(f"{n:.3g}")] for f, n in e["forms"][:6]]} for i, e in enumerate(ranked)]
    (BUILD / "en-ranked.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(by)} dictionary words from {len(rows)} forms; top {len(out)} -> build/en-ranked.json")


if __name__ == "__main__":
    main()
