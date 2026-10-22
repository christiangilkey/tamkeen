"""Build the Hindi word table: each word form and its dictionary form, and how words are said.

The app uses it to treat लड़का, लड़के and लड़कों as one word (लड़का), करता, किया and करूँगा as करना,
and to draw how each word is said over Hindi text (web/js/lexicon/hindi.js). It is made from:

  - English Wiktionary's Hindi entries as extracted by Wiktextract (https://kaikki.org, Tatu Ylonen;
    Wiktionary's text is CC BY-SA 4.0): every entry that is a word of its own (not only "form of"
    another), the forms in its inflection table (nouns: plural and oblique; adjectives: feminine and
    masculine plural; verbs: participles, future, subjunctive, imperative...), the entries that are
    forms or other spellings of another word, and each spelling's romanization;
  - wordfreq (https://github.com/rspeer/wordfreq, CC BY-SA 4.0) word counts, to put the commonest
    dictionary words first and to choose between two dictionary words for one spelling.

    pip install wordfreq
    python tools/build_hindi.py                       (reads kaikki.org's Hindi file, about 18 MB)
    python tools/build_hindi.py path/to/kaikki.org-dictionary-Hindi.jsonl.gz

Readings: the app works out how a word is said by rule (romanize() in web/js/lexicon/hindi.js, run here
through tools/hindi_romanize.mjs, so Node must be installed). Where Wiktionary's romanization of a spelling,
written in the app's style, says something else, the table keeps Wiktionary's (`readings`).

Writes docs/lexicon/hi-lemmas.json.gz and adds it to docs/lexicon/index.json (as "hi"). Like Wiktionary,
the table is shared under CC BY-SA 4.0 (docs/lexicon/README.md).
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import math
import re
import subprocess
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path

from wordfreq import word_frequency, zipf_frequency

from build_meanings import hindi_style as app_style  # (tools/build_meanings.py: the same style for the popup's readings)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "lexicon"
URL = "https://kaikki.org/dictionary/Hindi/kaikki.org-dictionary-Hindi.jsonl.gz"
# Devanagari letters, signs and digits: U+0900-0963, 0966-096F, 0971-097F (no danda, and no ॰: न॰ is an abbreviation)
DEVANAGARI = re.compile("^[{}-{}{}-{}{}-{}]+$".format(*map(chr, (0x900, 0x963, 0x966, 0x96F, 0x971, 0x97F))))
# Form tags that are not forms of the word (the table's own bookkeeping, the Urdu spelling).
NOT_FORMS = {"romanization", "Urdu", "table-tags", "inflection-template", "class", "canonical"}
# A verb's forms that are said every day (as opposed to its bare stem, or the feminine/plural infinitive):
# a spelling that is one of these belongs to that verb even when it is also a word of its own (दिया "gave",
# not the noun "lamp"; गया "went", not the city).
FULL_VERB_FORM = {"perfective", "habitual", "future", "conjunctive", "progressive", "contrafactual", "presumptive",
                  "perfect", "indicative"}
# ...and those that are often another verb's bare stem as well (लगा: लगना "it stuck", or the "stick it!"
# of लगाना), counted after the forms above.
WISH_FORM = {"imperative", "subjunctive"}
# Parts of speech whose words stay themselves whatever verb they also look like a form of (से "from").
FUNCTION_WORDS = {"postp", "pron", "conj", "particle", "det", "prep", "adv", "intj", "num"}
# Checked by hand: the postposition का's feminine and oblique forms belong to it (Wiktionary gives them
# entries of their own), and लिए / लिये are the "for" of के लिए more often than लेना's "took" ("" = itself).
# Common words of their own that look like a verb's form: सही "right" (not सहना's "endured"), धरती "earth"
# (not धरना's), जोड़ी "pair", सीता the name (not सीना's "sews"); सी is सा "-like" (not the stem of सीना
# "sew"), and सभी "all" is सब with ही (Wiktionary has no page for it).
OVERRIDES = {"की": "का", "के": "का", "लिए": "", "लिये": "", "सही": "", "धरती": "", "जोड़ी": "", "सीता": "", "सी": "सा",
             "सभी": "सब"}


def read_lines(source: str):
    if re.match(r"https?://", source):
        req = urllib.request.Request(source, headers={"User-Agent": "Tamkeen dictionary builder (github.com/christiangilkey/tamkeen)"})
        raw = urllib.request.urlopen(req, timeout=120)
    else:
        raw = open(source, "rb")
    with gzip.GzipFile(fileobj=raw) as gz:
        yield from io.TextIOWrapper(gz, encoding="utf-8")


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s.strip())


def zipf(word: str) -> float:
    return zipf_frequency(word, "hi")


def read(source: str):
    """(entries, forms-of, romanizations): entries[word] = {pos, forms: {form: tags}}, for the words of
    their own; formof[spelling] = {dictionary word: tags}; roman[spelling] = Wiktionary's romanization."""
    entries: dict[str, dict] = {}
    formof: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    roman: dict[str, str] = {}
    n = 0
    for line in read_lines(source):
        e = json.loads(line)
        if e.get("lang_code") != "hi" or e.get("pos") in ("character", "punct", "symbol"):
            continue
        word = nfc(e.get("word", ""))
        if not DEVANAGARI.match(word):
            continue  # phrases (with spaces), affixes (with a hyphen), abbreviations
        n += 1
        for f in e.get("forms") or []:
            tags = set(f.get("tags") or [])
            form = nfc(f.get("form", ""))
            if "romanization" in tags and form and word not in roman:
                roman[word] = form
            elif f.get("roman") and DEVANAGARI.match(form) and form not in roman:
                roman[form] = nfc(f["roman"])
        senses = e.get("senses") or []
        if senses and all(s.get("form_of") or s.get("alt_of") for s in senses):
            for s in senses:
                for t in s.get("form_of") or s.get("alt_of") or []:
                    target = nfc(t.get("word") or "")
                    if DEVANAGARI.match(target) and target != word:
                        formof[word][target].add(frozenset(s.get("tags") or []))
            continue
        entry = entries.setdefault(word, {"pos": set(), "forms": defaultdict(set)})
        entry["pos"].add(e.get("pos", ""))
        for f in e.get("forms") or []:
            tags = set(f.get("tags") or [])
            form = nfc(f.get("form", ""))
            if tags & NOT_FORMS or not DEVANAGARI.match(form) or form == word:
                continue
            if tags and tags <= {"masculine", "feminine"} and e.get("pos") != "adj":
                continue  # a noun's other gender is another word (पिता "father" by माता "mother", लड़की by लड़का)
            entry["forms"][form].add(frozenset(tags))  # (each cell of the table on its own: जाने is "knew" and "may know")
    print(f"  read {n} Hindi entries: {len(entries)} words of their own, {len(formof)} forms of others", flush=True)
    return entries, formof, roman


def kind(tags: set[str], verb: bool, form: str = "") -> str:
    """What a spelling is in a word's table: "stem" (a verb's bare stem: कर), "full" (a verb form said every
    day: किया, करता, करेगा, and the infinitive करना / करने), "wish" (an imperative or subjunctive only: करो,
    करें), or "form" (a noun's or adjective's form, a verb's feminine or plural infinitive: करनी, and the
    spoken "having done" in -के, which is a noun's plural as often: लड़के is "boys" before "having fought")."""
    if not verb:
        return "form"
    if "stem" in tags:
        return "stem"
    if tags & {"agentive", "adjectival"}:
        return "form"
    if "conjunctive" in tags and form.endswith("के") and not form.endswith("करके"):
        return "form"
    if tags & FULL_VERB_FORM or ("infinitive" in tags and not tags & {"feminine", "plural"}):
        return "full"
    if tags & WISH_FORM:
        return "wish"
    return "form"


def choose(spelling: str, owners: dict[str, set[str]], entries: dict) -> str:
    """The dictionary word a spelling belongs to, of the words whose tables (or "form of" entries) give it
    (`owners`: word -> the kinds of form it is there, see kind()).
      - A function word of its own stays itself (से "from", not the stem of सेना "to hatch").
      - A full form of a common verb is that verb's, the commonest such verb first (दिया: देना, not the noun
        "lamp"; लगा: लगना "it stuck", which is only the stem of लगाना).
      - The bare stem of a common verb is that verb's (देख: देखना, मिल: मिलना), unless the spelling is far
        commoner than the verb (भाग "part", जल "water", not भागना "run", जलना "burn").
      - Otherwise the commonest of the words by wordfreq, and a word of its own stays itself unless that
        word is clearly commoner (पानी is "water", not a form of पाना; बड़ी is बड़ा's feminine)."""
    if spelling in OVERRIDES:
        return OVERRIDES[spelling] or spelling
    is_verb = lambda w: "verb" in entries.get(w, {}).get("pos", ())
    others = {w: k for w, k in owners.items() if w != spelling}
    if not others:
        return spelling
    own = spelling in entries
    if own and entries[spelling]["pos"] & FUNCTION_WORDS:
        return spelling
    for wanted in ("full", "wish"):
        # (a verb's bare stem is also its "do it!": that goes by the rule for stems below, so that सर "head"
        # stays itself, not सरना's "slip!")
        verbs = [w for w, k in others.items() if wanted in k and zipf(w) >= 3.0 and (wanted == "full" or "stem" not in k)]
        if verbs:
            return max(sorted(verbs), key=zipf)
    stems = [w for w, k in others.items() if "stem" in k and is_verb(w) and zipf(w) >= 3.5 and zipf(spelling) - zipf(w) < 1.5]
    if stems:
        return max(sorted(stems), key=zipf)
    score = lambda w: zipf(w) - (0.6 if others[w] == {"stem"} else 0.0)
    best = max(sorted(others), key=score)
    if own and zipf(spelling) >= score(best) + 0.5:
        return spelling
    return best


def build(source: str) -> dict:
    entries, formof, roman = read(source)
    is_verb = lambda w: "verb" in entries.get(w, {}).get("pos", ())
    # Which dictionary words each spelling may be a form of, and what kind of form it is in each.
    owners: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for word, entry in entries.items():
        for form, cells in entry["forms"].items():
            for tags in cells:
                if "vocative" in tags:
                    continue  # (vocatives: rare in text, and they clash with other words: करो, लड़को)
                owners[form][word].add(kind(set(tags), is_verb(word), form))
    for spelling, targets in formof.items():
        for t, senses in targets.items():
            # a "form of" a form of a word (गए: form of गया, itself a form of जाना) is that word's
            if t not in entries and len(formof.get(t, {})) == 1:
                t = next(iter(formof[t]))
            if t in entries:
                owners[spelling][t] |= {kind(set(tags), is_verb(t), spelling) for tags in senses}
    forms: dict[str, str] = {}
    for spelling, own in owners.items():
        best = choose(spelling, dict(own), entries)
        if best != spelling:
            forms[spelling] = best
    for spelling, target in OVERRIDES.items():
        if target and target in entries:
            forms[spelling] = target  # (and a spelling no table lists: सभी)
        elif not target and spelling not in entries:  # (spellings Wiktionary has only as forms: लिए)
            entries[spelling] = {"pos": {"postp"}, "forms": {}}
            forms.pop(spelling, None)
    # Dictionary words, commonest first: by the counts of the word and all its forms together.
    total: dict[str, float] = defaultdict(float)
    for w in entries:
        total[w] += word_frequency(w, "hi")
    for f, w in forms.items():
        total[w] += word_frequency(f, "hi")
    lemmas = sorted(entries, key=lambda w: (-total[w], w))
    index = {w: i for i, w in enumerate(lemmas)}
    table_forms = {f: index[w] for f, w in sorted(forms.items()) if w in index}
    # Readings: Wiktionary's where the app's rule says something else.
    spellings = sorted(set(lemmas) | set(table_forms))
    with_roman = [s for s in spellings if s in roman]
    rules = json.loads(subprocess.run(["node", str(ROOT / "tools" / "hindi_romanize.mjs")], input=json.dumps(with_roman),
                                      capture_output=True, text=True, encoding="utf-8", check=True).stdout)
    readings = {}
    for s, rule in zip(with_roman, rules):
        theirs = app_style(roman[s])
        if theirs and theirs != rule and " " not in theirs:
            readings[s] = theirs
    agree = len(with_roman) - len(readings)
    print(f"  {len(lemmas)} dictionary words, {len(table_forms)} forms; the rule reads {agree} of the {len(with_roman)} "
          f"spellings with a Wiktionary romanization the same way ({100 * agree / max(1, len(with_roman)):.1f}%), "
          f"{len(readings)} kept", flush=True)
    return {"format": 1, "kind": "lemmas", "name": "hi", "lang": "hi", "source": "English Wiktionary (Wiktextract, kaikki.org) + wordfreq",
            "license": "CC-BY-SA-4.0", "lemmas": lemmas, "forms": table_forms, "readings": readings}


def write(data: dict) -> None:
    name = "hi-lemmas.json.gz"
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    (OUT / name).write_bytes(packed)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["files"]["hi"] = {
        "file": name, "bytes": len(packed), "sha256": hashlib.sha256(packed).hexdigest(),
        "title": "Hindi word forms", "db": "English Wiktionary (Wiktextract) + wordfreq", "license": "CC-BY-SA-4.0",
        "forms": len(data["forms"]), "lexemes": len(data["lemmas"]),
    }
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  wrote {name}, {len(packed) / 1e6:.2f} MB", flush=True)


if __name__ == "__main__":
    write(build(sys.argv[1] if len(sys.argv) > 1 else URL))
