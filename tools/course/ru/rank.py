"""Step 2 of the Russian basics course: group wordfreq's most common Russian forms by dictionary word.

    python tools/course/forms.py ru                                  ->  tools/course/build/ru-forms.json
    python tools/course/ru/rank.py path/to/openrussian-csv-folder    ->  tools/course/build/ru-ranked.json (+ .tsv)

Forms are grouped with the OpenRussian.org dictionary (https://github.com/Badestrand/russian-dictionary,
CC BY-SA 4.0), the same data as the app's Russian table (tools/build_russian.py), with three differences
that suit a course:
- the two verbs of an aspect pair are two words (сказать and говорить both need learning);
- an adverb the dictionary lists as a word of its own stays one (до́ма "at home" is not a form of дом,
  у́тром "in the morning" not a form of у́тро, бы́стро not a form of бы́стрый);
- всё "everything" (written with ё) is not все "all".
A few hyphenated words (что-то, по-русски), which wordfreq splits in two, get a tenth of wordfreq's estimate
for them (its estimate from the two halves is far too high: что-то would come before год).
Run it with a Python that has wordfreq 3.1.1.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from wordfreq import word_frequency

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))  # tools/, for build_russian's helpers
from build_russian import EXTRA, FORM_COLUMNS, match, variants  # noqa: E402

BUILD = HERE.parent / "build"
POS = {"nouns": "noun", "verbs": "verb", "adjectives": "adj", "others": "other"}
# Forms that belong to a declinable word even though others.csv lists them on their own.
FOLD = {"все": "весь", "тем": "тот", "том": "тот", "той": "тот", "им": "он", "ей": "она", "нам": "мы", "вам": "вы",
        "мне": "я", "тебе": "ты", "себе": "себя", "нас": "мы", "вас": "вы", "их": "они", "его": "он", "ее": "она",
        "во": "в", "со": "с", "об": "о", "обо": "о", "ко": "к", "подо": "под", "передо": "перед"}
# Words the dictionary lists as forms of another that a learner meets as words of their own.
OWN = {"старший", "младший"}
# The app's extra forms, but not its choices for aspect pairs (на́чал is начать's, not начинать's).
EXTRA = {k: v for k, v in EXTRA.items() if k != "начинать"}
HYPHENATED = ["что-то", "кто-то", "где-то", "как-то", "какой-то", "когда-то", "куда-то", "почему-то", "что-нибудь",
              "кто-нибудь", "где-нибудь", "какой-нибудь", "когда-нибудь", "по-русски", "по-английски", "по-моему",
              "по-другому", "по-прежнему", "кое-что", "из-за", "из-под", "во-первых", "во-вторых", "чуть-чуть"]


def accent(accented: str) -> str:
    """челове'к -> челове́к (a combining acute after the stressed vowel); words of one vowel unmarked."""
    word = accented.strip()
    plain = word.replace("'", "")
    if sum(ch in "аеёиоуыэюяАЕЁИОУЫЭЮЯ" for ch in plain) < 2 or "ё" in plain.lower():
        return plain
    return word.replace("'", "́")


def grouper(folder: str):
    """The dictionary's words and a function giving the word a written form belongs to: (lemma, pos) or None."""
    entries: dict[tuple[str, str], dict] = {}
    readings: dict[str, set[tuple[str, str]]] = {}
    own_others: set[str] = set()

    def add(form_text: str, key: tuple[str, str]) -> None:
        form = match(form_text)
        if form and form.replace("-", "").isalpha():
            readings.setdefault(form, set()).add(key)

    for name, cols in FORM_COLUMNS.items():
        for r in csv.DictReader((Path(folder) / f"{name}.csv").open(encoding="utf-8"), delimiter="\t"):
            bare = (r.get("bare") or "").strip()
            if not bare or " " in bare:
                continue
            key = (match(bare), POS[name])
            e = entries.setdefault(key, {"shown": bare.lower(), "accented": set(), "en": r.get("translations_en") or "",
                                         "aspect": r.get("aspect") or "", "partner": r.get("partner") or ""})
            e["accented"].add(accent(r.get("accented") or bare))
            if name == "others":
                own_others.add(key[0])
            add(r.get("accented") or bare, key)
            for col in cols:
                for v in variants(r.get(col, "")):
                    add(v, key)
    extra_of: dict[str, tuple[str, str]] = {}
    for lemma, forms_text in EXTRA.items():
        same = sorted((k for k in entries if k[0] == match(lemma)), key=lambda k: k[1] != "other")
        key = same[0] if same else (match(lemma), "other")
        entries.setdefault(key, {"shown": lemma, "accented": {lemma}, "en": "", "aspect": "", "partner": ""})
        for v in forms_text.split():
            add(v, key)
            extra_of.setdefault(match(v), key)

    def wf(word: str) -> float:
        return word_frequency(word, "ru")

    # How common a word is when a spelling belongs to two: its own dictionary form plus its forms no other word has.
    usage: dict[tuple[str, str], float] = {}
    for form, owners in readings.items():
        if len(owners) == 1:
            k = next(iter(owners))
            usage[k] = usage.get(k, 0.0) + wf(form)

    def freq(k: tuple[str, str]) -> float:
        return usage.get(k, 0.0) + wf(entries[k]["shown"])

    def owner(raw: str) -> tuple[str, str] | None:
        if raw == "всё":
            return ("все", "other")
        form = match(raw)
        if form in FOLD:
            target = FOLD[form]
            cands = [k for k in readings.get(form, ()) if k[0] == target] or [k for k in entries if k[0] == target]
            if cands:
                return max(cands, key=freq)
        if form in extra_of:
            return extra_of[form]
        if form in OWN:
            return next(k for k in readings[form] if k[0] == form)
        if form in own_others:  # an adverb or other word of its own (до́ма, у́тром, бы́стро, э́то)
            return (form, "other")
        opts = readings.get(form)
        if not opts:
            return None
        return max(opts, key=lambda k: (freq(k) * (2 if k[0] == form else 1), k[0] == form))

    return entries, owner, wf


def main(folder: str) -> None:
    entries, owner, wf = grouper(folder)
    groups: dict[tuple[str, str], dict] = {}
    for raw, f in json.loads((BUILD / "ru-forms.json").read_text(encoding="utf-8")):
        if not any(ch.isalpha() for ch in raw):
            continue
        k = owner(raw)
        if k is None:
            k = (match(raw), "?")
            entries.setdefault(k, {"shown": raw, "accented": {raw}, "en": "", "aspect": "", "partner": ""})
        g = groups.setdefault(k, {"freq": 0.0, "forms": {}})
        g["freq"] += f
        g["forms"][raw] = g["forms"].get(raw, 0.0) + f
    for word in HYPHENATED:
        k = (word, "other")
        entries.setdefault(k, {"shown": word, "accented": {word}, "en": "", "aspect": "", "partner": ""})
        groups.setdefault(k, {"freq": wf(word) / 10, "forms": {word: wf(word) / 10}})

    # всё's entry is others.csv's все ("everybody"); shown with its ё.
    if ("все", "other") in groups:
        entries[("все", "other")]["shown"] = "всё"
    rows = []
    for k, g in sorted(groups.items(), key=lambda kv: -kv[1]["freq"]):
        e = entries[k]
        forms = sorted(g["forms"].items(), key=lambda kv: -kv[1])
        rows.append({"rank": len(rows) + 1, "lemma": e["shown"], "pos": k[1], "key": list(k), "freq": round(g["freq"] * 1e6, 2),
                     "stress": sorted(e["accented"]), "aspect": e["aspect"], "partner": e["partner"],
                     "en": e["en"][:120], "forms": [f for f, _ in forms[:8]]})
    (BUILD / "ru-ranked.json").write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
    with (BUILD / "ru-ranked.tsv").open("w", encoding="utf-8") as out:
        for r in rows:
            out.write("\t".join([str(r["rank"]), r["lemma"], r["pos"], f'{r["freq"]:.1f}', "/".join(r["stress"]),
                                 r["aspect"][:4] + (":" + r["partner"] if r["partner"] else ""), r["en"][:60],
                                 " ".join(r["forms"][:6])]) + "\n")
    print(f"{len(rows)} words -> {BUILD / 'ru-ranked.json'}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(BUILD / "openrussian"))
