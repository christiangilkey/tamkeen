"""Step 2 of the Spanish basics course: group the most common written forms (tools/course/build/es-forms.json,
from forms.py) by dictionary word, with the Spanish table of forms the app uses (docs/lexicon/es-lemmas.json.gz:
hablas -> hablar), and rank the dictionary words by their forms' total frequency.

    python tools/course/es/rank_es.py   ->  tools/course/build/es-ranked.json
                                            [[rank, lemma, frequency, [[form, frequency], ...]], ...]

The table makes mistakes (it can't tell "fue" of ser from "fue" of ir, or "la" the article from "la" the
pronoun): the words are still chosen and checked by hand.
"""

from __future__ import annotations

import gzip
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / "tools" / "course" / "build"

# Forms the table gives the wrong dictionary word (como is not "I eat", para is not "I stop"), set by hand.
FIX = {
    "como": "como", "para": "para", "entre": "entre", "gracias": "gracias", "nos": "nos", "os": "os",
    "usted": "usted", "ustedes": "usted", "vos": "vos", "debe": "deber", "debes": "deber", "sólo": "solo",
    "pasa": "pasar", "queda": "quedar", "quedas": "quedar", "cuesta": "costar", "resulta": "resultar",
    "basta": "bastar", "suele": "soler", "suelen": "soler", "solía": "soler",
    "partido": "partido", "sentido": "sentido", "juego": "juego", "cambio": "cambio", "política": "política",
    "comida": "comida", "encima": "encima", "arriba": "arriba", "abajo": "abajo", "afuera": "afuera",
    "apenas": "apenas", "adelante": "adelante", "acerca": "acerca", "cuarto": "cuarto", "cuartos": "cuarto",
    "privado": "privado", "privada": "privado", "privados": "privado", "privadas": "privado",
    "divertido": "divertido", "divertida": "divertido", "divertidos": "divertido", "divertidas": "divertido",
    "complicado": "complicado", "complicada": "complicado",
    "el": "el", "la": "el", "los": "el", "las": "el", "lo": "lo", "ella": "ella",
    "primero": "primero", "primera": "primero", "primer": "primero", "primeros": "primero", "primeras": "primero",
    "segundo": "segundo", "segunda": "segundo", "segundos": "segundo", "segundas": "segundo",
    "tercero": "tercero", "tercera": "tercero", "tercer": "tercero",
}
for _f in ("creo", "cree", "creen", "crees", "creemos", "creía", "creer", "creí", "creyendo", "creyó", "creído"):
    FIX[_f] = "creer"


def main() -> None:
    forms = json.loads((BUILD / "es-forms.json").read_text(encoding="utf-8"))
    table = json.load(gzip.open(ROOT / "docs" / "lexicon" / "es-lemmas.json.gz", "rt", encoding="utf-8"))
    lemmas, form_of = table["lemmas"], table["forms"]
    total: dict[str, float] = defaultdict(float)
    members: dict[str, list] = defaultdict(list)
    for form, freq in forms:
        i = form_of.get(form)
        lemma = FIX.get(form) or (lemmas[i] if i is not None else form)  # not in the table: its own word
        total[lemma] += freq
        members[lemma].append([form, freq])
    ranked = sorted(total.items(), key=lambda kv: -kv[1])
    rows = [[n, lemma, freq, members[lemma][:8]] for n, (lemma, freq) in enumerate(ranked, 1)]
    out = BUILD / "es-ranked.json"
    out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} dictionary words -> {out}")


if __name__ == "__main__":
    main()
