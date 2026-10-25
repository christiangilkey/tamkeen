"""Step 2 of the Italian basics course's word list: the written forms counted by forms.py, grouped by
dictionary word (sono, era and stato all count for essere) with the Italian word table the app uses
(docs/lexicon/it-lemmas.json.gz), ranked by how common each dictionary word is in all its forms together.

    python tools/course/it/rank.py   ->  tools/course/build/it-ranked.json  and  it-ranked.txt
        [{rank, lemma, freq, forms: [[form, freq], ...]}, ...]  (the top 2000)

The table has no entries for the small words (di, che, in) and reads some forms as another word (più as
molto, ancora as ancorare, grazie as grazia): FIX puts those right. The articles and the prepositions joined
with them (del, alla, nei) count for their plain word, since a learner meets them as one word plus "the".
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
BUILD = HERE.parent / "build"

# A form -> the dictionary word it counts for, where the table has none or a wrong one.
FIX: dict[str, str] = {}
for base, forms in {
    "di": "d del dello della dei degli delle dell",
    "a": "ad al allo alla ai agli alle all",
    "da": "dal dallo dalla dai dagli dalle dall",
    "in": "nel nello nella nei negli nelle nell",
    "su": "sul sullo sulla sui sugli sulle sull",
    "con": "col coi",
    "e": "ed",
    "il": "i l la le",  # the article; lo and gli are pronouns as often as articles, so they stay apart
    "un": "uno una",
    "ci": "c",
    "mi": "m",
    "ti": "t",
    "si": "s",
    "vi": "v",
    "perché": "perchè perche",
    "po'": "po",
    "più": "più",
    "ancora": "ancora",
    "meno": "meno",
    "grazie": "grazie",
    "durante": "durante",
    "nulla": "nulla",
    "serie": "serie",
    "morte": "morte",
    "fine": "fine",
    "prima": "prima",
    "vedere": "visto vista visti viste",
    "legge": "legge leggi",
    "mattina": "mattina",
    "sera": "sera",
    "parte": "parte",
    "insieme": "insieme",
    "presto": "presto",
    "piano": "piano",
    "subito": "subito",
    "mentre": "mentre",
    "contro": "contro",
    "verso": "verso",
    "dopo": "dopo",
    "sopra": "sopra",
    "sotto": "sotto",
    "dentro": "dentro",
    "fuori": "fuori",
    "tardi": "tardi",
    "volentieri": "volentieri",
    "pure": "pure",
    "appena": "appena",
    "certo": "certo certa certi certe",
    "pronto": "pronto pronta pronti pronte",
    "caro": "caro cara cari care",
    "parente": "parente parenti",
    "parete": "parete pareti",
    "pari": "pari",
    "paio": "paio",
    "presso": "presso",
    "attraverso": "attraverso",
    "trattare": "tratta tratte",
    "popolo": "popolo popoli",
    "data": "data date",
    "risposta": "risposta risposte",
    "porta": "porta porte",
    "migliore": "migliore migliori",
    "peggiore": "peggiore peggiori",
    "maggiore": "maggiore maggiori",
    "minore": "minore minori",
    "massimo": "massimo massima massimi massime",
    "minimo": "minimo minima minimi minime",
    "dovere": "dovuto dovuta dovuti dovute",
    "lo": "lo",
    "gli": "gli",
    "buono": "buon",
    "bene": "bene ben",
}.items():
    for f in forms.split():
        FIX[f] = base


def main() -> None:
    table = json.loads(gzip.open(ROOT / "docs" / "lexicon" / "it-lemmas.json.gz", "rt", encoding="utf-8").read())
    lemmas, form_of = table["lemmas"], table["forms"]
    forms = json.loads((BUILD / "it-forms.json").read_text(encoding="utf-8"))
    by: dict[str, dict] = {}
    for form, freq in forms:
        if any(ch.isdigit() for ch in form):
            continue
        if form in FIX:
            lemma = FIX[form]
        elif form in form_of:
            v = form_of[form]
            lemma = lemmas[v] if isinstance(v, int) else lemmas[v[0]]
        else:
            lemma = form
        e = by.setdefault(lemma, {"lemma": lemma, "freq": 0.0, "forms": []})
        e["freq"] += freq
        e["forms"].append([form, freq])
    ranked = sorted(by.values(), key=lambda e: -e["freq"])[:2000]
    out = [{"rank": i + 1, "lemma": e["lemma"], "freq": float(f"{e['freq']:.4g}"),
            "forms": [[f, float(f"{n:.3g}")] for f, n in e["forms"][:8]]} for i, e in enumerate(ranked)]
    (BUILD / "it-ranked.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = [f"{e['rank']}\t{e['lemma']}\t" + " ".join(f for f, _ in e["forms"]) for e in out]
    (BUILD / "it-ranked.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(by)} dictionary words from {len(forms)} forms; top {len(out)} -> {BUILD / 'it-ranked.json'}")


if __name__ == "__main__":
    main()
