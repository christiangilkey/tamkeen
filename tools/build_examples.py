"""Build the free card helpers: example sentences and pronunciations per language, and the English
keyword list of the free Mnemonic maker. Used when there is no AI key ("Add words" and the review
card's Mnemonic maker; web/js/examples.js, web/js/review/freemnemonic.js).

1. docs/lexicon/<lang>-examples.json.gz, one per language taught, downloaded only when needed:
   - example sentences with their English translation, from
       * Tatoeba (https://tatoeba.org, sentences CC BY 2.0 FR; each keeps its Tatoeba number), short
         ones first, a few for each word of the language so that most words have one;
       * the English Wiktionary's usage examples (Wiktextract, https://kaikki.org, CC BY-SA 4.0),
         each filed under the word whose entry it is in;
   - each word's pronunciation in IPA, from Wiktionary (for the Mnemonic maker to match sounds).
2. docs/lexicon/en-keywords.json.gz: English words a keyword can be, each with its US pronunciation
   (the CMU Pronouncing Dictionary, already in en-lemmas.json.gz), what kind of thing it is (WordNet 3.0's
   lexicographer files: an animal, a tool, a food...; Princeton's WordNet licence) and how common it is
   (FrequencyWords' English subtitle counts by Hermit Dave, CC BY-SA 4.0), for picturable, common keywords.

    python tools/build_examples.py extract <cache dir> es de ...      (Wiktionary: read from kaikki.org, kept small in the cache)
    python tools/build_examples.py build <cache dir> <tatoeba dir> es de ... [--wolff <pg40074.txt>]
    python tools/build_examples.py keywords <WordNet dict dir> <en_50k.txt> [<glove.6B.100d.txt>]
    python tools/build_examples.py ownkeywords <WordNet dict dir> <FrequencyWords dir> <cache dir> es fr de it pt ru ca

<tatoeba dir> holds Tatoeba's per-language exports: <code>_sentences.tsv.bz2 and <code>-eng_links.tsv.bz2 for
each language, and eng_sentences.tsv.bz2 (https://downloads.tatoeba.org/exports/per_language/).

The examples file: {"kind": "examples", "lang", "sentences": [[text, english, source], ...],
                    "words": {key: [sentence number, ...]}, "ipa": {key: ipa}}
`source` is "t<number>" (Tatoeba's sentence number) or "w" (Wiktionary; "w:arz" a dialect's entry);
`words` lists the Wiktionary examples of each word; `key` is meanings' key (tools/build_meanings.py key).
"""

from __future__ import annotations

import bz2
import collections
import gzip
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_meanings import NAMES, DIALECTS, key, read_lines, url  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "lexicon"

# Tatoeba's codes for the languages taught (Arabic also its dialects; Persian is "pes").
TATOEBA = {"ar": ["ara", "arz", "apc", "ajp", "acm", "ary", "afb"], "es": ["spa"], "fr": ["fra"], "it": ["ita"], "ru": ["rus"],
           "tl": ["tgl"], "ja": ["jpn"], "zh": ["cmn"], "pt": ["por"], "ca": ["cat"], "ceb": ["ceb"], "th": ["tha"],
           "de": ["deu"], "fa": ["pes"], "hi": ["hin"], "ko": ["kor"], "la": ["lat"]}
# Characters only Cantonese writes ("did", "of", "not"...): Wiktionary's Chinese entries also give Cantonese examples.
CANTONESE = re.compile("[咗㖞哗嘅唔佢嗰冇啲嘢噉咁喺喎嚟睇攞嗮哋㗎嘞]")
NOT_MANDARIN_TAGS = {"Cantonese", "Classical-Chinese", "Literary-Chinese", "Hokkien", "Hakka"}
DIALECT_OF = {"arz": "arz", "apc": "apc", "ajp": "ajp", "acm": "acm", "ary": "ary", "afb": "afb"}
# The app's Arabic dialect courses (docs/course/ar-<course>/course.json: an everyday sentence for each word, with its
# translation; the app's own content) and the dialect code their sentences are filed under (Tatoeba's, Wiktionary's).
COURSES = {"egy": "arz", "lev": "apc", "glf": "afb", "mor": "ary", "irq": "acm"}
UNSPACED = {"ja", "zh", "th"}
PER_WORD = 3          # Tatoeba sentences kept for each word form (the shortest, easiest first)
MAX_SENTENCES = 40000 # Tatoeba sentences kept per language at most
MAX_EXAMPLES = 3      # Wiktionary examples kept per word
WORDS = re.compile(r"[\w'’-]+", re.UNICODE)


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(text or ""))).strip()


# ---------------------------------------------------------------- 1. Wiktionary, kept small

def first_ipa(entry: dict, lang: str) -> str:
    """The entry's first IPA, slashes and brackets off. Chinese: Mandarin's pinyin instead, as "py:<pinyin>"
    (Wiktionary's Mandarin IPA is written in tone letters and mostly missing; the app reads pinyin itself)."""
    if lang == "zh":
        for s in entry.get("sounds") or []:
            tags = set(s.get("tags") or [])
            if s.get("zh_pron") and {"Mandarin", "Pinyin"} <= tags:
                return "py:" + s["zh_pron"].split("(")[0].split(",")[0].strip()
        return ""
    if lang == "la":
        # Church Latin, as the app's Latin cards are read (an Italian voice): Wiktionary's IPA not marked
        # "Classical-Latin" (its Ecclesiastical one carries no mark).
        for s in entry.get("sounds") or []:
            if s.get("ipa") and "Classical-Latin" not in (s.get("tags") or []):
                return s["ipa"].strip().strip("/[]").split(",")[0].strip()
    for s in entry.get("sounds") or []:
        ipa = s.get("ipa")
        if not ipa:
            continue
        tags = set(s.get("tags") or [])
        if lang == "zh" and not ({"Mandarin", "Standard-Chinese"} & tags or not tags):
            continue
        if lang == "zh" and "Sinological-IPA" in tags:
            continue
        return ipa.strip().strip("/[]").split(",")[0].strip()
    return ""


def extract(cache: Path, lang: str) -> None:
    """kaikki.org's file of the language (a few hundred MB, read as it comes) down to what is needed here:
    {"ipa": {key: ipa}, "examples": [[key, text, english, dialect]]}."""
    sources = [(NAMES[lang], "")] + ([(name, code) for code, name in DIALECTS.items()] if lang == "ar" else [])
    ipa: dict[str, str] = {}
    dialect_ipa: dict[str, dict[str, str]] = {}  # Arabic dialects' own pronunciations, by dialect code
    examples: list[list[str]] = []
    for name, dialect in sources:
        print(f"  {lang}: reading {name}", flush=True)
        n = 0
        for line in read_lines(url(name)):
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            word = e.get("word") or ""
            if not word or e.get("pos") in ("name", "character", "symbol", "punct", "romanization", "syllable"):
                continue
            k = key(word, lang)
            if not k:
                continue
            said = first_ipa(e, lang)
            # Arabic and Persian are written without short vowels: one spelling is several words (قلم qalam
            # "pen", qallama "to trim"). Each word's IPA is kept with its part of speech, "qalam|n;qallama|v",
            # nouns first, so the app can take the verb's for a meaning like "to write".
            if said and dialect:
                dialect_ipa.setdefault(dialect, {}).setdefault(k, said)
            if said and not dialect:
                if lang in ("ar", "fa"):
                    tag = "v" if e.get("pos") == "verb" else "n"
                    have = [x for x in ipa.get(k, "").split(";") if x]
                    if len(have) < 4 and not any(x.split("|")[0] == said for x in have):
                        have.append(f"{said}|{tag}")
                        have.sort(key=lambda x: x.endswith("|v"))
                        ipa[k] = ";".join(have)
                elif k not in ipa:
                    ipa[k] = said
            for sense in e.get("senses") or []:
                if "form-of" in (sense.get("tags") or []):
                    continue
                for ex in sense.get("examples") or []:
                    if ex.get("type") == "quotation" or ex.get("ref"):
                        continue  # quotations from books: old, long, often literary
                    text = clean(ex.get("text"))
                    english = clean(ex.get("english") or ex.get("translation"))
                    if not text or not english or len(text) > 140 or len(english) > 160:
                        continue
                    if lang == "zh" and (CANTONESE.search(text) or NOT_MANDARIN_TAGS & set(ex.get("tags") or [])):
                        continue  # Mandarin only
                    examples.append([k, text, english, dialect])
                    n += 1
        print(f"  {lang}: {name}: {n} examples so far", flush=True)
    cache.mkdir(parents=True, exist_ok=True)
    (cache / f"{lang}-wiktionary.json").write_text(json.dumps({"ipa": ipa, "dialect_ipa": dialect_ipa, "examples": examples}, ensure_ascii=False), encoding="utf-8")
    print(f"  {lang}: {len(ipa)} pronunciations, {len(examples)} examples", flush=True)


# ---------------------------------------------------------------- 2. Tatoeba

def read_tsv(path: Path):
    with bz2.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3:
                yield parts


def english_sentences(tatoeba: Path, wanted: set[str]) -> dict[str, str]:
    out = {}
    for sid, _lang, text in read_tsv(tatoeba / "eng_sentences.tsv.bz2"):
        if sid in wanted:
            out[sid] = text
    return out


def tokens(text: str, lang: str) -> list[str]:
    if lang in UNSPACED:
        return []
    return [key(w.strip("'’-"), lang) for w in WORDS.findall(text) if w.strip("'’-") and not w.isdigit()]


def tatoeba_pairs(tatoeba: Path, lang: str) -> list[tuple[str, str, str]]:
    """Each sentence of the language with its shortest English translation: [(text, english, source)]."""
    pairs: dict[str, tuple[str, str]] = {}
    links: dict[str, list[str]] = collections.defaultdict(list)
    for code in TATOEBA[lang]:
        sent = tatoeba / f"{code}_sentences.tsv.bz2"
        link = tatoeba / f"{code}-eng_links.tsv.bz2"
        if not sent.exists() or not link.exists():
            continue
        for sid, _l, text in read_tsv(sent):
            pairs[sid] = (clean(text), DIALECT_OF.get(code, ""))
        with bz2.open(link, "rt", encoding="utf-8") as f:
            for line in f:
                a, b = (line.rstrip("\n").split("\t") + [""])[:2]
                if a in pairs and b:
                    links[a].append(b)
    english = english_sentences(tatoeba, {b for bs in links.values() for b in bs})
    out = []
    for sid, (text, dialect) in pairs.items():
        options = sorted((clean(english[b]) for b in links.get(sid, []) if b in english), key=len)
        if options:
            out.append((text, options[0], f"t{sid}" + (f":{dialect}" if dialect else "")))
    return out


def good_length(text: str, lang: str) -> bool:
    if lang in UNSPACED:
        return 4 <= len(text) <= 32
    n = len(WORDS.findall(text))
    return 3 <= n <= 14 and len(text) <= 110


def choose(pairs: list[tuple[str, str, str]], lang: str) -> list[tuple[str, str, str]]:
    """A few short sentences for each word form, the easiest first (short, made of common words), at most
    MAX_SENTENCES. Unspaced languages (no word forms to count): the shortest MAX_SENTENCES."""
    pairs = [p for p in pairs if good_length(p[0], lang)]
    if lang in UNSPACED:
        return sorted(pairs, key=lambda p: (abs(len(p[0]) - 12), p[0]))[:MAX_SENTENCES]
    counts = collections.Counter(t for p in pairs for t in set(tokens(p[0], lang)))
    def hardness(p):
        ts = tokens(p[0], lang)
        rare = sum(1 for t in ts if counts[t] < 3)
        return (rare, abs(len(ts) - 7), len(p[0]))
    kept, have = [], collections.Counter()
    for p in sorted(pairs, key=hardness):
        ts = set(tokens(p[0], lang))
        if any(have[t] < PER_WORD for t in ts):
            kept.append(p)
            have.update(ts)
            if len(kept) >= MAX_SENTENCES:
                break
    return kept


def build(cache: Path, tatoeba: Path, lang: str) -> None:
    wik = cache / f"{lang}-wiktionary.json"
    data = json.loads(wik.read_text(encoding="utf-8")) if wik.exists() else {"ipa": {}, "examples": []}
    sentences: list[list[str]] = []
    words: dict[str, list[int]] = {}
    seen = set()
    for k, text, english, dialect in data["examples"]:
        if len(words.get(k, [])) >= MAX_EXAMPLES or text in seen:
            continue
        seen.add(text)
        words.setdefault(k, []).append(len(sentences))
        sentences.append([text, english, "w" + (f":{dialect}" if dialect else "")])
    n_wik = len(sentences)
    if lang == "ar":
        # The dialect courses' own sentences, filed under their word (so a card of that word finds them first).
        for course, code in COURSES.items():
            path = ROOT / "docs" / "course" / f"ar-{course}" / "course.json"
            if not path.exists():
                continue
            for w in json.loads(path.read_text(encoding="utf-8")).get("words", []):
                text = clean(str(w.get("sentence", "")).replace("⟦", "").replace("⟧", ""))
                if not text or text in seen or not w.get("translation"):
                    continue
                seen.add(text)
                words.setdefault(key(w["word"], lang), []).append(len(sentences))
                sentences.append([text, clean(w["translation"]), f"c:{code}"])
    if lang == "ceb" and WOLFF:
        for head, text, english in wolff_examples(WOLFF):
            if text in seen:
                continue
            seen.add(text)
            have = words.setdefault(key(head, lang), [])
            if len(have) < MAX_EXAMPLES + 2:
                have.append(len(sentences))
            sentences.append([text, english, "d"])
    for text, english, src in choose(tatoeba_pairs(tatoeba, lang), lang):
        if text not in seen:
            seen.add(text)
            sentences.append([text, english, src])
    # Pronunciations of dictionary words only (not every form Wiktionary lists: Russian has 400,000).
    ipa = data["ipa"]
    if lang == "zh":
        # Chinese: every word of CC-CEDICT (the app's Chinese dictionary, docs/lexicon/zh-cedict.json.gz) that
        # people use, with its pinyin, where Wiktionary has none (most one-character words).
        table = json.loads(gzip.decompress((OUT / "zh-cedict.json.gz").read_bytes()))
        cedict = table["words"]
        # (and traditional characters' simplified ones, so a word written in traditional characters is found)
        t2s = {t: s for t, s in table.get("t2s", {}).items() if len(t) == 1 and len(s) == 1}
        for word, (pinyin, count) in cedict.items():
            if count and word not in ipa:
                ipa[word] = "py:" + pinyin
    meanings = OUT / f"{lang}-meanings.json.gz"
    if meanings.exists() and lang != "zh":
        heads = json.loads(gzip.decompress(meanings.read_bytes()))["words"]
        ipa = {k: v for k, v in ipa.items() if k in heads}
    pack = {"format": 1, "kind": "examples", "lang": lang,
            "source": "Tatoeba (tatoeba.org) and the English Wiktionary (Wiktextract, kaikki.org)",
            "license": "CC-BY-2.0-FR (Tatoeba sentences), CC-BY-SA-4.0 (Wiktionary)",
            "sentences": sentences, "words": words, "ipa": ipa, **({"t2s": t2s} if lang == "zh" else {}),
            **({"dialect_ipa": data.get("dialect_ipa", {})} if lang == "ar" else {})}
    name = f"{lang}-examples.json.gz"
    write(name, f"ex-{lang}", pack, title=f"{NAMES[lang]} example sentences",
          db="Tatoeba + English Wiktionary (Wiktextract)", license="CC-BY-2.0-FR + CC-BY-SA-4.0",
          extra={"sentences": len(sentences), "wiktionary": n_wik, "pronunciations": len(ipa)})


# ---------------------------------------------------------------- Bisaya: Wolff's example sentences

WOLFF = None  # the Project Gutenberg text of Wolff's Dictionary of Cebuano Visayan (ebook 40074), when given
ENGLISH_WORDS = set("the a an is are was were be i you he she it we they my your his her its our their to of in on at for with "
                    "not do does did don't can't won't will would can could have has had this that there what why how who".split())


def wolff_examples(path: Path):
    """Wolff's example sentences: (head word, Bisaya sentence in today's spelling, its English). Wolff writes each
    as "Bisaya sentence, English sentence." after the meaning it shows; the comma that parts them is the one after
    which the words are English. Public domain (tools/build_cebuano_glosses.py)."""
    from build_cebuano_glosses import entries, modern
    today = {"ku": "ko", "mu": "mo", "tu": "to", "nu": "no", "su": "so", "du": "do"}

    def bisaya(text: str) -> str:
        out = []
        for w in re.findall(r"[\w’'-]+|[^\w\s]+|\s+", text):
            if re.fullmatch(r"[\w’'-]+", w):
                lower = w.lower()
                m = today.get(lower) or modern(lower)
                m = unicodedata.normalize("NFC", "".join(c for c in unicodedata.normalize("NFD", m) if not unicodedata.combining(c)))
                w = m[:1].upper() + m[1:] if w[:1].isupper() else m
            out.append(w)
        return "".join(out)

    english_share = lambda s: (lambda ws: sum(w in ENGLISH_WORDS for w in ws) / max(1, len(ws)))(re.findall(r"[a-z’']+", s.lower()))
    for para in entries(path):
        head = para.split(" ", 1)[0].strip(",")
        if not re.fullmatch(r"[^\W\d_]+", head):
            continue
        # Each pair ends at a full stop, ? or ! (the English one's); within it, split at the comma before English.
        for chunk in re.findall(r"[A-ZÁÉÍÓÚ][^.?!]{6,220}[.?!]", para):
            best = None
            for m in re.finditer(r", (?=[A-Z])", chunk):
                left, right = chunk[:m.start()], chunk[m.end():]
                if english_share(right) >= 0.25 and english_share(left) <= 0.12 and len(left.split()) >= 3:
                    best = (left, right)
            if best:
                # (Wolff's other forms of the word in brackets, "Abagahon (pangabagahon) ni Manoy…", left out)
                text = re.sub(r"\s*\([^)]*\)", "", bisaya(best[0].strip())) + "."
                english = best[1].strip().rstrip("†").strip()
                if 3 <= len(text.split()) <= 16 and not re.search(r"[()]", text) and english.count("(") == english.count(")"):
                    yield modern(head), text, english


def write(name: str, entry: str, data: dict, title: str, db: str, license: str, extra: dict) -> None:
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    (OUT / name).write_bytes(packed)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["files"][entry] = {"file": name, "bytes": len(packed), "sha256": hashlib.sha256(packed).hexdigest(),
                             "title": title, "db": db, "license": license, **extra}
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  wrote {name}: {len(packed) / 1e6:.2f} MB, {extra}", flush=True)


# ---------------------------------------------------------------- 3. English keywords

# WordNet's lexicographer files (lexnames) by number, and the kind of picture each gives.
LEXNAMES = {3: "", 4: "", 5: "animal", 6: "artifact", 7: "", 8: "body", 9: "", 10: "", 11: "", 12: "", 13: "food",
            14: "", 15: "place", 16: "", 17: "object", 18: "person", 19: "nature", 20: "plant", 21: "", 22: "",
            23: "", 24: "", 25: "", 26: "", 27: "substance", 28: ""}
# Words never offered: function words and the like (they make no picture).
STOP = set("""a an the and or but if of to in on at by for from with as is are was were be been am do does did have has had
i me my you your he him his she her it its we us our they them their this that these those there here what which who whom
whose when where why how not no yes so than then too very can could will would shall should may might must just also
oh uh um ah eh hey okay ok yeah yep nope gonna wanna gotta let lets got get""".split())


def wordnet(dict_dir: Path) -> tuple[dict[str, str], dict[str, str], set[str]]:
    """{word: kind of its first noun sense}, {word: "n" / "v" / "a" / "r" (its part of speech with the most senses)}, and the
    words WordNet writes with a capital (names: not offered)."""
    kind: dict[str, str] = {}
    pos: dict[str, tuple[str, int]] = {}
    capital: set[str] = set()
    lex_of: dict[str, int] = {}
    plain: set[str] = set()
    for line in (dict_dir / "data.noun").read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith(" "):
            continue
        parts = line.split(" ")
        lex_of[parts[0]] = int(parts[1])
        for i in range(int(parts[3], 16)):
            w = parts[4 + 2 * i]
            (capital if w[:1].isupper() else plain).add(w.lower())
    for p, file in (("n", "index.noun"), ("v", "index.verb"), ("a", "index.adj"), ("r", "index.adv")):
        for line in (dict_dir / file).read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith(" "):
                continue
            parts = line.strip().split(" ")
            w = parts[0]
            if "_" in w:
                continue
            senses = int(parts[2])
            if p == "n":
                offsets = parts[-senses:]
                kind[w] = LEXNAMES.get(lex_of.get(offsets[0], 0), "")
            if w not in pos or senses > pos[w][1]:
                pos[w] = (p, senses)
    return kind, {w: p for w, (p, _n) in pos.items()}, capital - plain


# How a keyword is tied to a meaning word, best first: the same thing or a kind of it (hound for dog), a part or
# the whole (beak, bill for bird), a form of the same word, the broader word, then looser ties (named in the
# definition, the same topic, a sister word, or near in GloVe's word vectors). [code, weight 0..100]
TIES = {"s": 100, "p": 75, "d": 75, "k": 70, "g": 55, "v": 0}
POINTERS = {"~": ("s", 90), "~i": ("s", 90), "@": ("k", 70), "@i": ("k", 70), "#m": ("p", 70), "#s": ("p", 70), "#p": ("p", 70),
            "%m": ("p", 70), "%s": ("p", 70), "%p": ("p", 70), "+": ("d", 75), "&": ("s", 80), "=": ("g", 55), ";c": ("g", 50),
            "-c": ("g", 50), "$": ("s", 75), "*": ("g", 55), ">": ("g", 55)}
MAX_TIES = 30  # keywords kept per meaning word


def synsets(dict_dir: Path) -> tuple[dict, dict]:
    """WordNet's synsets {(pos, offset): (words, [(pointer, target)], gloss)} and senses {word: [synset, ...]}
    (commonest first, nouns, verbs, adjectives, adverbs)."""
    syn: dict = {}
    for p, file in (("n", "data.noun"), ("v", "data.verb"), ("a", "data.adj"), ("r", "data.adv")):
        for line in (dict_dir / file).read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith(" "):
                continue
            body, _, gloss = line.partition(" | ")
            parts = body.split(" ")
            n = int(parts[3], 16)
            words = [parts[4 + 2 * i].lower().replace("(a)", "").replace("(p)", "").replace("(ip)", "") for i in range(n)]
            at = 4 + 2 * n
            ptrs = []
            for i in range(int(parts[at])):
                sym, off, tp = parts[at + 1 + 4 * i: at + 4 + 4 * i]
                ptrs.append((sym, ("a" if tp == "s" else tp, off)))
            syn[(p, parts[0])] = (words, ptrs, gloss.split(";")[0].split('"')[0])
    senses: dict = {}
    for p, file in (("n", "index.noun"), ("v", "index.verb"), ("a", "index.adj"), ("r", "index.adv")):
        for line in (dict_dir / file).read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith(" "):
                continue
            parts = line.strip().split(" ")
            senses.setdefault(parts[0], []).extend((p, off) for off in parts[-int(parts[2]):])
    return syn, senses


def ties(dict_dir: Path, rank: dict[str, int], keyword_words: list[str], glove: Path | None) -> dict[str, list]:
    """For each common English meaning word, the keywords tied to its meaning: {word: [[keyword number, weight,
    code], ...]}, the strongest first (see TIES). A word that is also a verb has "to <word>" too, from its verb
    senses only (to run: dash, race; run alone is first the noun, a run in baseball)."""
    syn, senses = synsets(dict_dir)
    index = {w: i for i, w in enumerate(keyword_words)}
    meanings = [w for w, r in rank.items() if r <= 25000 and re.fullmatch(r"[a-z]{2,}", w) and w in senses]
    found: dict[str, dict[int, tuple[int, str]]] = {}

    def add(m: str, word: str, weight: int, code: str) -> None:
        weight = int(weight * share)
        k = index.get(word)
        if k is None or word == m or f"to {word}" == m:
            return
        have = found.setdefault(m, {})
        if k not in have or have[k][0] < weight:
            have[k] = (weight, code)

    share = 1.0
    gloss_words = lambda g: {w for w in re.findall(r"[a-z]+", g.lower()) if w not in STOP and len(w) > 2}
    jobs = [(m, senses[m][:3]) for m in meanings]
    jobs += [(f"to {m}", [s for s in senses[m] if s[0] == "v"][:3]) for m in meanings if any(s[0] == "v" for s in senses[m])]
    for m, its in jobs:
        for n, s in enumerate(its):  # its three commonest senses, the first counting most
            share = (1.0, 0.55, 0.4)[n]
            words, ptrs, gloss = syn[s]
            for w in words:
                add(m, w, 100, "s")
            for w in gloss_words(gloss):  # (a thing named in the definition more than a quality)
                add(m, w, 55 if senses.get(w, [("x",)])[0][0] == "n" else 40, "g")
            for sym, target in ptrs:
                if sym not in POINTERS or target not in syn:
                    continue
                code, weight = POINTERS[sym]
                for w in syn[target][0]:
                    add(m, w, weight, code)
                if sym in ("~", "~i"):  # a kind of a kind (hound is a dog, a beagle is a hound)
                    for sym2, t2 in syn[target][1]:
                        if sym2 in ("~", "~i") and t2 in syn:
                            for w in syn[t2][0]:
                                add(m, w, 75, "s")
                if sym in ("@", "@i"):  # sister words (cat for dog: both kinds of carnivore)
                    for sym2, t2 in syn[target][1]:
                        if sym2 in ("~", "~i") and t2 in syn and t2 != s:
                            for w in syn[t2][0]:
                                add(m, w, 50, "g")
    # A keyword whose own definition names the meaning word (hound: "any of several breeds of dog").
    for kw in keyword_words:
        for s in senses.get(kw, [])[:2]:
            for w in gloss_words(syn[s][2]):
                if w in senses:
                    have = found.setdefault(w, {})
                    k = index[kw]
                    if k not in have or have[k][0] < 60:
                        have[k] = (60, "g")
    if glove:
        vector_ties(glove, meanings, keyword_words, found)
        for m in meanings:  # a verb's "to" entry shares the word's vector ties
            if f"to {m}" in found:
                for k, (w, c) in found.get(m, {}).items():
                    if c == "v" and k not in found[f"to {m}"]:
                        found[f"to {m}"][k] = (w, c)
    out = {}
    for m, have in found.items():
        best = sorted(have.items(), key=lambda x: -x[1][0])[:MAX_TIES]
        out[m] = [[k, w, c] for k, (w, c) in best]
    return out


def vector_ties(glove: Path, meanings: list[str], keyword_words: list[str], found: dict) -> None:
    """GloVe (Stanford, Public Domain Dedication and License): each meaning word's nearest keywords by cosine,
    weight 30-60 for a cosine of 0.45-0.75. Only these ties are kept, never the vectors."""
    import numpy as np
    wanted = set(meanings) | set(keyword_words)
    vecs = {}
    with open(glove, encoding="utf-8") as f:
        for line in f:
            w, _, rest = line.partition(" ")
            if w in wanted:
                vecs[w] = np.array(rest.split(), dtype=np.float32)
    kws = [w for w in keyword_words if w in vecs]
    K = np.stack([vecs[w] for w in kws])
    K /= np.linalg.norm(K, axis=1, keepdims=True)
    index = {w: i for i, w in enumerate(keyword_words)}
    ms = [m for m in meanings if m in vecs]
    for start in range(0, len(ms), 2000):
        chunk = ms[start:start + 2000]
        M = np.stack([vecs[m] for m in chunk])
        M /= np.linalg.norm(M, axis=1, keepdims=True)
        sims = M @ K.T
        for row, m in enumerate(chunk):
            top = np.argsort(-sims[row])[:12]
            for j in top:
                cos = float(sims[row, j])
                if cos < 0.45 or kws[j] == m:
                    continue
                weight = int(30 + min(30, (cos - 0.45) * 100))
                have = found.setdefault(m, {})
                k = index[kws[j]]
                if k not in have or have[k][0] < weight:
                    have[k] = (weight, "v")


def keywords(dict_dir: Path, freq_file: Path, glove: Path | None = None) -> None:
    table = json.loads(gzip.decompress((OUT / "en-lemmas.json.gz").read_bytes()))
    ipa = table["ipa"]
    rank: dict[str, int] = {}
    for i, line in enumerate(freq_file.read_text(encoding="utf-8").splitlines()):
        w = line.split(" ")[0]
        rank.setdefault(w, i + 1)
    kind, pos, capital = wordnet(dict_dir)
    # Only dictionary words of English (the word-forms table's lemmas): subtitle counts also count foreign
    # words ("te", "en") and interjections.
    lemmas = set(table["lemmas"])
    out = []
    for w, r in sorted(rank.items(), key=lambda x: x[1]):
        if r > 30000 or w in STOP or not re.fullmatch(r"[a-z]{3,14}", w) or w not in ipa or w not in pos or w not in lemmas:
            continue
        if w in capital and pos[w] == "n":
            continue  # a name (Paris, Kevin), not a thing
        out.append([w, ipa[w], pos[w], kind.get(w, "") if pos[w] == "n" else "", r])
    # Adjectives too common to be keywords still say what a meaning is ("big", "red"): kept, marked.
    # Adjectives, to tell a meaning that is a quality ("big") from a thing (any common one, keyword or not).
    adjectives = sorted(w for w, r in rank.items() if r <= 20000 and pos.get(w) == "a" and re.fullmatch(r"[a-z]+", w))
    related = ties(dict_dir, rank, [w[0] for w in out], glove)
    data = {"format": 1, "kind": "keywords", "lang": "en", "adjectives": adjectives, "related": related,
            "source": "CMU Pronouncing Dictionary; WordNet 3.0 (Princeton University); FrequencyWords (Hermit Dave, OpenSubtitles 2018); GloVe 6B (Stanford NLP)",
            "license": "CMUdict BSD-style; WordNet 3.0 licence; CC-BY-SA-4.0 (FrequencyWords); PDDL-1.0 (GloVe)",
            "fields": ["word", "ipa", "pos", "kind", "rank"], "words": out}
    write("en-keywords.json.gz", "kw-en", data, title="English keywords for mnemonics",
          db="CMUdict + WordNet 3.0 + FrequencyWords + GloVe", license="CMUdict + WordNet + CC-BY-SA-4.0 + PDDL-1.0",
          extra={"words": len(out), "meanings": len(related)})


# ---------------------------------------------------------------- 4. keywords in the learner's own language

OWN_KEYWORDS = ("es", "fr", "de", "it", "pt", "ru", "ca")  # app languages with good Wiktionary pronunciations
POS_CODE = {"noun": "n", "verb": "v", "adj": "a", "adv": "r"}


def english_heads(glosses: list[str], pos: str) -> list[str]:
    """The English words a word's first two meanings come down to: "to run, to jog" -> run, jog; "dog, hound" ->
    dog, hound; "castle (a large building ...)" -> castle."""
    out = []
    for g in glosses[:2]:
        g = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", g)
        for part in re.split(r"[,;]", g)[:3]:
            words = re.findall(r"[a-z]+", part.lower().replace("to ", " ", 1) if pos == "v" else part.lower())
            words = [w for w in words if w not in ("a", "an", "the", "to", "be", "of", "one", "someone", "something")]
            if 1 <= len(words) <= 3:
                head = words[0] if pos in ("v", "a") else words[-1]
                if head not in out:
                    out.append(head)
    return out[:4]


def own_keywords(dict_dir: Path, freq_dir: Path, cache: Path, lang: str) -> None:
    """docs/lexicon/<lang>-keywords.json.gz: keywords in an app language that isn't English, for the free Mnemonic
    maker when the app is shown in it. Words from FrequencyWords' <lang>_50k.txt (rank <= 25,000) that the
    language's meanings file has as a noun, verb, adjective or adverb (not a name), with Wiktionary's IPA (the
    examples cache); each with the English words its first meanings come down to (`heads`: dog, hound), through
    which the English WordNet's kinds (animal, artifact...) and the meaning ties (en-keywords' `related`) are used."""
    kind, _pos, _capital = wordnet(dict_dir)
    rank: dict[str, int] = {}
    for i, line in enumerate((freq_dir / f"{lang}_50k.txt").read_text(encoding="utf-8").splitlines()):
        w = unicodedata.normalize("NFC", line.split(" ")[0])
        rank.setdefault(key(w, lang), i + 1)
    meanings = json.loads(gzip.decompress((OUT / f"{lang}-meanings.json.gz").read_bytes()))["words"]
    ipa = json.loads((cache / f"{lang}-wiktionary.json").read_text(encoding="utf-8"))["ipa"]
    out, seen = [], set()
    for k, r in sorted(rank.items(), key=lambda x: x[1]):
        if r > 25000 or k in seen or k not in ipa or k not in meanings or len(k) < 3 or not re.fullmatch(r"[^\W\d_]+", k):
            continue
        # Its main sense (the first: "que" is first a conjunction, "Ich" a pronoun) is a thing, an action or a
        # quality; an adverb only when it isn't among the commonest words (those are little words: "bien", "so").
        entries = [e for e in meanings[k] if e[1] != "name"]
        entry = entries[0] if entries else None
        if not entry or entry[1] not in POS_CODE or (entry[1] == "adv" and r < 1500):
            continue
        shown = unicodedata.normalize("NFC", unicodedata.normalize("NFD", entry[0]).replace("\u0301", "").replace("\u0300", ""))
        if shown[:1].isupper() and lang != "de":
            continue  # a name
        p = POS_CODE[entry[1]]
        heads = english_heads(entry[2], p)
        if not heads:
            continue
        seen.add(k)
        out.append([shown, ipa[k], p, kind.get(heads[0], "") if p == "n" else "", r, "|".join(heads)])
    data = {"format": 1, "kind": "keywords", "lang": lang,
            "source": f"FrequencyWords ({lang}, OpenSubtitles 2018); English Wiktionary (Wiktextract): pronunciations, meanings; WordNet 3.0 kinds",
            "license": "CC-BY-SA-4.0 (FrequencyWords, Wiktionary); WordNet 3.0 licence",
            "fields": ["word", "ipa", "pos", "kind", "rank", "english"], "words": out}
    write(f"{lang}-keywords.json.gz", f"kw-{lang}", data, title=f"{NAMES[lang]} keywords for mnemonics",
          db="FrequencyWords + Wiktionary + WordNet 3.0", license="CC-BY-SA-4.0 + WordNet", extra={"words": len(out)})


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args[0] == "extract":
        for lang in args[2:]:
            extract(Path(args[1]), lang)
    elif args[0] == "build":
        if "--wolff" in args:
            at = args.index("--wolff")
            WOLFF = Path(args[at + 1])
            del args[at:at + 2]
        for lang in args[3:]:
            build(Path(args[1]), Path(args[2]), lang)
    elif args[0] == "ownkeywords":
        for lang in args[4:]:
            own_keywords(Path(args[1]), Path(args[2]), Path(args[3]), lang)
    elif args[0] == "keywords":
        keywords(Path(args[1]), Path(args[2]), Path(args[3]) if len(args) > 3 else None)
    else:
        sys.exit(__doc__)
