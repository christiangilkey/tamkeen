"""Build Latin's word table, docs/lexicon/la-lemmas.json.gz: every Latin word form Wiktionary lists and the
dictionary form it belongs to (puellārum -> puella, amāvisset -> amō, fuit -> sum), so the word popup and the
seen-words list (web/js/lexicon/latin.js) know one word in all its forms.

    python tools/build_latin.py count <cache dir>                    (step 1: how common each Latin word is)
    python tools/build_latin.py table <kaikki Latin .jsonl.gz> <counts.tsv> [<lemma counts.tsv to write>]

1. Counting. wordfreq has no Latin, so the words are counted in the public-domain Latin books of Project
   Gutenberg (GUTENBERG below: Caesar, Cicero, Virgil, Ovid, Horace, Catullus, Augustine, the Vulgate's books,
   and the Latin readers and stories written for learners around 1900-1930). Each book is fetched once into
   the cache directory (outside the repository). Gutenberg's header and licence are cut off, and lines that
   are English (the editors' notes) are left out. Written as <cache dir>/la_counts.tsv: key <tab> count.
2. The table. From the English Wiktionary's Latin entries, as extracted by Wiktextract (kaikki.org; the text
   is Wiktionary's, CC BY-SA 4.0): each entry with a meaning of its own is a dictionary form, written with its
   macrons (amō, rēx); its inflection table's forms, and every entry that is only "a form of" another word,
   point to it. A participle counts as its verb (amātus, amātae -> amō), as a dictionary lists it. A spelling
   that can be a form of more than one word (est: sum "is" or edō "eats"; legī: lēx or legō; canēs: canis or
   canō) goes to the commonest of them: each dictionary form is as common as the counts of its forms that
   belong to no other word. Senses Wiktionary marks rare, archaic or obsolete count for little.

Words are matched without macrons and other marks (ā = a, Dóminus = dominus), with j as i and v as u (iam =
jam, uir = vir), æ œ as ae oe and in small letters: latin_key, which must agree with latinKey in
web/js/lexicon/latin.js. The table: {format: 1, kind: "lemmas", lang: "la", lemmas: [commonest first, with
macrons], forms: {key: index}, ranked: true}. Written with its entry in docs/lexicon/index.json. The lemma
counts (dictionary form <tab> count) are for tools/make_wordlists.py (la=...).
"""

from __future__ import annotations

import collections
import gzip
import hashlib
import io
import json
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "lexicon"
UA = "Tamkeen Latin word counter (github.com/christiangilkey/tamkeen)"

# Project Gutenberg's Latin books (its catalogue, Language "la"): Latin prose and verse of every age, and the
# readers written in Latin for learners. Left out: Greek with a Latin crib (Homer, Hesiod, Herodotus,
# Pausanias), botany and medicine lists, and books mostly in English or French.
GUTENBERG = [
    218, 18837,            # Caesar, De Bello Gallico
    226, 24967,            # Cicero, orations; In Catilinam I
    227, 229, 231,         # Virgil: Aeneid, Eclogues, Georgics
    237, 8738, 9646, 23294, 22119, 30345,  # Propertius, Ovid's Fasti, Horace, Catullus, Persius, Octavia
    21827, 51812, 25861,   # Quintilian X, Vitruvius, stories from Aulus Gellius
    27219,                 # Silius Italicus
    826, 828, 4317,        # the Vulgate: Esther, Daniel, Jonah
    33849, 23143, 45527, 74616, 74617,  # Augustine's Confessions, Hilary, Saint Patrick
    23306, 28233,          # Descartes' Meditations, Newton's Principia
    29645,                 # The Gate to Caesar
    31894,                 # Two Latin Plays for High-School Students
    56744, 57232, 57615,   # Appleton: Puer Romanus, Pons Tironum, Fabulae
    48681, 64146, 68935,   # Pericla Navarchi Magonis, Mons Spes, Insula Thesauraria (Treasure Island)
    50732, 73030,          # Rebilius Cruso, Robinson Crusoeus
    70713,                 # Colloquia tyronum
]

MARKS = re.compile(r"[̀-ͯ]")


def latin_key(word: str) -> str:
    """The form a Latin word is matched in: no macrons, breves, accents or diaeresis, j as i, v as u, æ œ as
    ae oe, small letters. Must agree with latinKey() in web/js/lexicon/latin.js."""
    w = unicodedata.normalize("NFD", (word or "").strip())
    w = MARKS.sub("", w).lower().replace("æ", "ae").replace("œ", "oe")
    return unicodedata.normalize("NFC", w).replace("j", "i").replace("v", "u")


WORD = re.compile(r"[A-Za-zÀ-ɏ̀-ͯÆæŒœ]+")
ENGLISH = {"the", "and", "of", "which", "that", "with", "this", "from", "was", "were", "are", "his", "their", "they",
           "have", "has", "by", "for", "be", "not", "but", "on", "or", "an", "at", "who", "would", "when", "there",
           "been", "into", "these", "those", "than", "its", "will", "should", "page", "chapter", "notes"}


def body(text: str) -> str:
    """A Gutenberg book without Gutenberg's header and licence."""
    start = re.search(r"\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\n", text)
    end = re.search(r"\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG", text)
    return text[start.end() if start else 0: end.start() if end else len(text)]


def latin_lines(text: str):
    """The lines of a book that are Latin: a line with three English little words or more (a note, the
    editor's preface) is left out, and so is one with fewer than three words of letters."""
    for line in text.splitlines():
        words = WORD.findall(line)
        if len(words) < 3:
            continue
        if sum(w.lower() in ENGLISH for w in words) >= max(2, len(words) // 6):
            continue
        yield words


def fetch(n: int, cache: Path) -> str:
    path = cache / f"pg{n}.txt"
    if path.exists():
        return path.read_text(encoding="utf-8")
    url = f"https://www.gutenberg.org/cache/epub/{n}/pg{n}.txt"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    text = urllib.request.urlopen(req, timeout=120).read().decode("utf-8", errors="replace")
    path.write_text(text, encoding="utf-8")
    time.sleep(2)  # (one book at a time, as Gutenberg asks of programs)
    return text


def count(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    counts: collections.Counter = collections.Counter()
    for n in GUTENBERG:
        try:
            text = body(fetch(n, cache))
        except Exception as e:  # noqa: BLE001 (a book that can't be fetched is left out, and said so)
            print(f"  pg{n}: not fetched ({e})", flush=True)
            continue
        before = sum(counts.values())
        for words in latin_lines(text):
            counts.update(latin_key(w) for w in words if len(w) > 1 or w.lower() in ("a", "e", "o"))
        print(f"  pg{n}: {sum(counts.values()) - before:,} Latin words", flush=True)
    out = cache / "la_counts.tsv"
    out.write_text("".join(f"{k}\t{c}\n" for k, c in counts.most_common()), encoding="utf-8")
    print(f"{out}: {len(counts):,} different words, {sum(counts.values()):,} in all")


# ---------- the table ----------

SKIP_FORM_TAGS = {"canonical", "table-tags", "inflection-template", "class", "romanization", "alternative", "clitic",
                  "abbreviation", "error-unrecognized-form", "obsolete", "archaic"}
LESSER = {"rare", "archaic", "obsolete", "Old-Latin", "dated", "nonstandard", "hapax", "uncommon", "error", "reconstruction"}
# Marks a dictionary form may carry: macron, breve, diaeresis (amō, poëta). A vowel with both a macron and a breve
# (egō̆: long or short) is written plain; a spelling with any other mark is not used.
KEPT_MARKS = {"̄", "̆", "̈"}
LETTER_NAME = re.compile(r"^The name of the (?:Latin(?: script)? )?letter")
GENDERS = {"masculine", "feminine", "neuter"}
FIXED = {"adv", "conj", "prep", "postp", "particle", "intj"}  # words with one form
ONE_WORD = re.compile(r"^[A-Za-zÀ-ɏ̀-ͯÆæŒœ]+$")

# Common forms whose commonest reading the counts can't see, as no other form of the word is common enough
# (checked by hand): key -> dictionary form.
OVERRIDES = {
    "a": "ab", "e": "ex", "de": "dē", "prae": "prae", "prius": "prius", "primus": "prīmus", "minime": "minimē",
    "loco": "locus", "loci": "locus", "loca": "locus", "locis": "locus", "locum": "locus", "eadem": "īdem",
    "multis": "multus", "nulla": "nūllus", "nullo": "nūllus", "medio": "medius", "media": "medius", "arte": "ars",
    "luce": "lūx", "pedibus": "pēs", "pedum": "pēs", "pedes": "pēs", "tertia": "tertius", "aeris": "āēr",
    "istis": "iste", "isti": "iste", "ista": "iste", "istud": "iste", "istum": "iste", "istam": "iste",
    "lege": "lēx", "uestrum": "vester", "uoces": "vōx", "sedes": "sēdēs", "mensis": "mēnsis", "auri": "aurum",
    "dona": "dōnum", "malis": "malus", "diligenter": "dīligenter", "artus": "artus", "accidit": "accidō",
    "incidit": "incidō", "ductor": "ductor", "fiet": "fīō", "fient": "fīō", "fiebat": "fīō", "nullam": "nūllus",
    "nulli": "nūllus", "dextra": "dextra", "noua": "novus", "solo": "sōlus", "recte": "rēctē", "partim": "partim",
    "fato": "fātum", "fatum": "fātum", "fata": "fātum", "fati": "fātum", "fatis": "fātum",
    "est": "sum", "es": "sum", "esse": "sum", "este": "sum", "estis": "sum",  # (edō "eat" has these forms too)
    "suis": "suus", "sui": "suus",   # (sūs "pig": suis is also its genitive)
    "uis": "volō",                   # (also vīs "force")
    "eo": "is",                      # ("by him": also eō "I go" and the adverb "thither")
    "ea": "is", "eam": "is", "eum": "is", "eos": "is", "eas": "is", "ei": "is", "eis": "is", "eorum": "is", "earum": "is",
    "id": "is", "ii": "is", "iis": "is",
    "quae": "quī", "quod": "quī", "qui": "quī", "quem": "quī", "quam": "quam", "quo": "quī", "qua": "quī",
    "cum": "cum", "ut": "ut", "si": "sī", "me": "ego", "mei": "meus", "te": "tū", "tibi": "tū", "tui": "tuus",
    "se": "suī", "sese": "suī", "sibi": "suī", "quis": "quis",
    "nostri": "noster", "nostrum": "noster", "uos": "vōs", "uobis": "vōs",  # (Wiktionary has nōs as the plural of ego)
    "tamen": "tamen", "enim": "enim", "autem": "autem", "nam": "nam", "iam": "iam", "nunc": "nunc", "tum": "tum",
    "inter": "inter", "ante": "ante", "post": "post", "contra": "contrā", "per": "per", "sub": "sub", "super": "super",
    "re": "rēs", "rem": "rēs", "rebus": "rēs",
    "dei": "deus", "deo": "deus", "deum": "deus", "dis": "deus", "di": "deus",
    "bella": "bellum", "bello": "bellum", "belli": "bellum", "bellis": "bellum",
    "amor": "amor", "amore": "amor", "amorem": "amor",
    "legi": "lēx", "legem": "lēx", "leges": "lēx", "legibus": "lēx", "legis": "lēx",
    "regi": "rēx", "regem": "rēx", "reges": "rēx", "regis": "rēx",
    "canes": "canis", "canis": "canis", "duas": "duo", "causa": "causa", "nocte": "nox", "quoque": "quoque",
    "solis": "sōl", "uera": "vērus", "multa": "multus", "hic": "hic", "hac": "hic", "magis": "magis", "ibi": "ibi",
    "cor": "cor", "cura": "cūra", "aures": "auris", "auras": "aura", "auro": "aurum", "anima": "anima", "turba": "turba",
    "facta": "faciō", "uersus": "versus", "sublatus": "tollō", "sublata": "tollō", "sublatum": "tollō", "sublati": "tollō",
    "malo": "malus", "mala": "malus", "male": "male", "bene": "bene", "uiri": "vir", "uiris": "vir",
    "uires": "vīs", "uiribus": "vīs", "ui": "vīs", "uim": "vīs",
    "populi": "populus", "populo": "populus", "populum": "populus", "liberi": "līberī", "libri": "liber",
    "libro": "liber", "librum": "liber", "libros": "liber", "libris": "liber", "liberos": "līberī", "liberis": "līberī",
    "ire": "eō", "it": "eō", "eunt": "eō", "ibat": "eō", "iit": "eō", "ibit": "eō", "ite": "eō", "imus": "eō",
    "fieri": "fīō", "fit": "fīō", "fiunt": "fīō", "fiat": "fīō", "fieret": "fīō",
    "potest": "possum", "posse": "possum", "possunt": "possum", "potuit": "possum",
    "uolo": "volō", "uult": "volō", "uelle": "volō", "uellem": "volō", "uelit": "volō",
    "nolo": "nōlō", "nolle": "nōlō", "noli": "nōlō", "nolite": "nōlō",
    "uia": "via", "uiam": "via", "uita": "vīta", "uitam": "vīta", "uitae": "vīta",
    "tempus": "tempus", "tempora": "tempus", "temporis": "tempus",
    "solus": "sōlus", "sola": "sōlus", "solum": "sōlus", "sole": "sōl", "solem": "sōl",
    "hora": "hōra", "horae": "hōra", "horam": "hōra",
    "ora": "ōs", "oris": "ōs", "ore": "ōs", "os": "ōs",
}


def own_glosses(entry: dict) -> list[dict]:
    """The senses of an entry that are a meaning of its own (not "a form of" or "another spelling of")."""
    return [s for s in entry.get("senses") or [] if s.get("glosses") and not s.get("form_of") and not s.get("alt_of")
            and "form-of" not in (s.get("tags") or [])]


def tidy(word: str) -> str:
    """A spelling with only the marks a Latin dictionary writes (KEPT_MARKS), or "" if it has others."""
    w = unicodedata.normalize("NFD", word).replace("̄̆", "").replace("̆̄", "")
    if any(unicodedata.combining(c) and c not in KEPT_MARKS for c in w):
        return ""
    return unicodedata.normalize("NFC", w)


def spelled(entry: dict) -> str:
    """The entry's word with its macrons (Wiktionary's "canonical" form), else as written."""
    for f in entry.get("forms") or []:
        if "canonical" in (f.get("tags") or []) and ONE_WORD.match(f.get("form", "")) and tidy(f["form"]):
            return tidy(f["form"])
    return unicodedata.normalize("NFC", entry.get("word", ""))


def read_entries(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if e.get("lang_code") == "la" and e.get("word") and e.get("pos") not in ("character", "symbol", "punct", "suffix",
                                                                                     "prefix", "infix", "interfix"):
                yield e


def table(kaikki: Path, counts_path: Path, lemma_counts: Path | None) -> None:
    counts: dict[str, int] = {}
    for line in counts_path.read_text(encoding="utf-8").splitlines():
        k, _, c = line.partition("	")
        counts[k] = int(c)
    lemmas: dict[str, float] = {}           # dictionary form (with macrons) -> 1, or 0.1 if all its senses are rare
    kind: dict[str, str] = {}               # dictionary form -> "name", "fixed" (a word with one form) or ""
    senses_of: dict[str, int] = collections.defaultdict(int)  # dictionary form -> how many ordinary meanings it has
    form_of: dict[str, set[str]] = collections.defaultdict(set)  # spelling -> the words it is a form of
    weak_of: dict[str, set[str]] = collections.defaultdict(set)  # the same, in Old Latin or rare use only (duās: dō)
    alt_of: dict[str, set[str]] = collections.defaultdict(set)   # spelling -> the words it is another spelling of
    participle_of: dict[str, str] = {}      # participle or gerundive -> its verb
    candidates: dict[str, set[str]] = collections.defaultdict(set)  # key -> spellings it may be
    headword: dict[str, set[str]] = collections.defaultdict(set)    # key -> spellings that are an entry's own word
    for e in read_entries(kaikki):
        word = spelled(e)
        k = latin_key(word)
        if not k or not ONE_WORD.match(word) or not tidy(e["word"]) or (len(word) > 1 and word.isupper()):
            continue  # (AC, Aug.: abbreviations; aͣ: a scribe's mark)
        for s in e.get("senses") or []:
            tags = set(s.get("tags") or [])
            if tags & {"abbreviation", "initialism", "acronym"} and "apocopic" not in tags:
                continue  # (ob as short for obryzum; but ā is ab)
            for t in s.get("form_of") or s.get("alt_of") or []:
                target = tidy(t.get("word", ""))
                if not target or not ONE_WORD.match(target):
                    continue
                if {"participle", "gerundive"} & tags and e.get("pos") in ("adj", "verb"):
                    participle_of[word] = target
                (weak_of if tags & LESSER else alt_of if s.get("alt_of") else form_of)[word].add(target)
        candidates[k].add(word)
        headword[k].add(word)
        own = own_glosses(e)
        if own:
            lesser = lambda s: set(s.get("tags") or []) & LESSER or LETTER_NAME.match(s["glosses"][0])  # noqa: E731
            lemmas[word] = max(lemmas.get(word, 0), 0.1 if all(lesser(s) for s in own) else 1.0)
            senses_of[word] += sum(not lesser(s) for s in own)
            pos = e.get("pos")
            was = kind.get(word)
            now = "name" if pos == "name" else "fixed" if pos in FIXED else ""
            if any(not lesser(s) for s in own):  # (dē the preposition, not dē the letter's name)
                kind[word] = now if was is None else ("" if "" in (was, now) else was if was == now else "fixed")
        for f in e.get("forms") or []:
            tags = set(f.get("tags") or [])
            form = unicodedata.normalize("NFC", f.get("form", ""))
            if not ONE_WORD.match(form) or tags & SKIP_FORM_TAGS or (tags and tags <= GENDERS and e.get("pos") != "adj"):
                continue
            if "participle" in tags or "gerundive" in tags:
                continue  # (its own entry has its forms, and says whose participle it is)
            fk = latin_key(form)
            if fk:
                candidates[fk].add(word)

    def resolve(word: str, depth: int = 0) -> dict[str, bool]:
        """The dictionary forms a spelling ends up at (a participle at its verb): {form: only by rare use}."""
        if depth > 4:
            return {}
        if word in participle_of:
            return resolve(participle_of[word], depth + 1)
        if word in lemmas:
            return {word: False}
        out: dict[str, bool] = {}
        for targets, weak in ((form_of[word], False), (alt_of[word], False), (weak_of[word], True)):
            for t in targets:
                for lem, w in resolve(t, depth + 1).items():
                    out[lem] = out.get(lem, True) and (w or weak)
        return out

    # key -> {dictionary form: only by rare use}
    options: dict[str, dict[str, bool]] = {}
    for k, spellings in candidates.items():
        found: dict[str, bool] = {}
        for w in spellings:
            for lem, weak in resolve(w).items():
                found[lem] = found.get(lem, True) and weak
        if found:
            options[k] = found
    # How common each dictionary form is: the counts of its keys that can be no other word, and of the key that is
    # its own spelling, which counts double, and treble for a word with one form (ita "so" is not the command of
    # itō "go often", quoque "also" not a form of quisque, amor "love" not "I am loved"); a key that is another
    # spelling of it counts a little (ā is ab). Rare senses count a tenth and names a third (terra before Terra).
    score: dict[str, float] = collections.defaultdict(float)
    nforms: dict[str, int] = collections.defaultdict(int)
    for k, found in options.items():
        strong = [lem for lem, weak in found.items() if not weak]
        for lem in found:
            nforms[lem] += 1
        if len(strong) == 1:
            score[strong[0]] += counts.get(k, 0)
        if len(found) > 1:
            for w in headword.get(k, ()):
                if w in lemmas:
                    score[w] += counts.get(k, 0) * (2 if kind.get(w) == "fixed" else 1)
                elif w not in participle_of:
                    for lem in alt_of[w]:
                        if lem in lemmas:
                            score[lem] += counts.get(k, 0) * 0.3
    factor = lambda lem: lemmas.get(lem, 1.0) * (0.3 if kind.get(lem) == "name" else 1.0)  # noqa: E731
    weight = lambda lem: (score[lem] * factor(lem) + 0.001 * nforms[lem] * factor(lem),  # noqa: E731
                          senses_of[lem], not lem[:1].isupper(), nforms[lem])
    def pick_weight(k: str, lem: str) -> tuple:
        w = weight(lem)
        return (w[0] * (0.05 if options[k][lem] else 1),) + w[1:]

    if REVIEW:
        rows = sorted((k for k in options if len(options[k]) > 1), key=lambda k: -counts.get(k, 0))[:REVIEW]
        for k in rows:
            ranked = sorted(options[k], key=lambda lem: pick_weight(k, lem), reverse=True)
            print(f"{counts.get(k, 0)}	{k}	{OVERRIDES.get(k, '')}	" + " | ".join(f"{lem}:{pick_weight(k, lem)[0]:.0f}" for lem in ranked[:4]))
    chosen: dict[str, str] = {}
    for k, found in options.items():
        pick = OVERRIDES.get(k)
        if pick and pick in found or pick and pick in lemmas:
            chosen[k] = pick
            continue
        chosen[k] = max(sorted(found), key=lambda lem: pick_weight(k, lem))
    for k, pick in OVERRIDES.items():
        if k not in chosen and pick in lemmas:
            chosen[k] = pick
    # The counts again, now that every key has one word: each dictionary form's share of the text.
    total: dict[str, int] = collections.defaultdict(int)
    for k, lem in chosen.items():
        total[lem] += counts.get(k, 0)
    used = set(chosen.values())
    ordered = sorted(used, key=lambda lem: (-total[lem], -weight(lem)[0], lem))
    ids = {lem: i for i, lem in enumerate(ordered)}
    forms = {k: ids[lem] for k, lem in chosen.items() if k != lem}
    data = {"format": 1, "kind": "lemmas", "name": "la", "lang": "la", "title": "Latin",
            "license": "CC-BY-SA-4.0", "lemmas": ordered, "forms": forms, "ranked": True}
    blob = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), compresslevel=9, mtime=0)
    file = "la-lemmas.json.gz"
    (OUT / file).write_bytes(blob)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["files"]["la"] = {"file": file, "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
                            "title": "Latin word forms", "db": "Wiktionary (kaikki.org) + Project Gutenberg's Latin books",
                            "license": "CC-BY-SA-4.0", "forms": len(forms), "lexemes": len(ordered)}
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    seen = sum(c for k, c in counts.items() if k in chosen)
    print(f"{file}: {len(blob) / 1e6:.2f} MB, {len(forms):,} forms, {len(ordered):,} dictionary forms; "
          f"{seen / max(1, sum(counts.values())):.1%} of the counted words are in it")
    if lemma_counts:
        lemma_counts.write_text("".join(f"{lem}\t{total[lem]}\n" for lem in ordered if total[lem]), encoding="utf-8")


REVIEW = 0  # (set by --review N: print the N commonest spellings that can be more than one word, to check by hand)


def main(args: list[str]) -> None:
    global REVIEW
    if args and args[0] == "--review":
        REVIEW, args = int(args[1]), args[2:]
    if len(args) >= 2 and args[0] == "count":
        count(Path(args[1]))
    elif len(args) >= 3 and args[0] == "table":
        table(Path(args[1]), Path(args[2]), Path(args[3]) if len(args) > 3 else None)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    main(sys.argv[1:])
