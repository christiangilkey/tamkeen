"""Build the second Bisaya (Cebuano) meanings file for No AI: John U. Wolff's Dictionary of Cebuano Visayan.

Wiktionary (tools/build_meanings.py, docs/lexicon/ceb-meanings.json.gz) is asked first; this file is
the fallback for the many words it lacks. Wolff's dictionary (Cornell University Southeast Asia Program
and the Linguistic Society of the Philippines, 1972; about 25,000 entries) is public domain in the USA
and is on Project Gutenberg as ebook 40074, transcribed by Jeroen Hellingman, Scott Robertson and the
Distributed Proofreaders (https://www.gutenberg.org/ebooks/40074).

    python tools/build_cebuano_glosses.py path/to/pg40074.txt

Each entry gives its word, its part of speech and numbered meanings, each followed by Bisaya example
sentences with their English; only the meanings are taken (up to MAX_GLOSSES a word, the codes in
square brackets left out). Words made from the entry's word that it lists with their own meaning
(abagáhun "broad-shouldered" under abága) become words of their own; ones listed only by their prefix
(ka- "helper") stay with the word, the prefix shown before the meaning. "= X" and "see X" entries
point to X. Wolff spells with Bisaya's three vowels (kaáyu, ímung); the words are shown as Bisaya is
written today (kaáyo, ímong: o in a word's last syllable), keeping his marks for the stressed
syllable (á) and the glottal stop (à). Keys are made by build_meanings.key, which treats o/u and e/i
alike for Bisaya, so either spelling finds the word.

Writes docs/lexicon/ceb-wolff-meanings.json.gz (index name "mean-cebw"), in the format of
build_meanings.py's files.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_meanings import key  # noqa: E402  (the same matching as the Wiktionary file)

OUT = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
MAX_GLOSSES = 8
MAX_GLOSS = 180
POS = {"n": "noun", "v": "verb", "a": "adj", "particle": "particle", "exclamation": "intj", "adv": "adv",
       "short form": "", "linker": "particle", "pron": "pron", "conj": "conj", "prep": "prep"}
ABBREV = {"s.t.": "something", "s.t ": "something ", "s.o.": "someone", "k.o.": "kind of", "s.w.": "somewhere", "s.o.’s": "someone’s",
          "s.o.'s": "someone's"}
LETTER = "a-zA-ZñÑÀ-ɏ̀-ͯ"
HEAD = re.compile(rf"^\*?([{LETTER}][{LETTER}'’-]*?)(?:_\d+)?(?=[\s,(]|$)")
CODES = re.compile(r"\[[^\]]*\]|\((?:→|←)\)|†")
SENSE = re.compile(r"\{\d+[a-z]?\}")
# An example sentence begins with a capital (Bisaya), after the meaning has ended with . ! or ?
SENTENCE_END = re.compile(rf"[.!?](?=\s+[‘“(]?[A-ZÁÉÍÓÚÀÈÌÒÙ])")
POS_AT = re.compile(r"^(?:n|v|a|adv|particle|exclamation|pron|conj|prep|linker|short form)\b\.?\s*")
# Inside an entry: "ka- n helper", "-an a fond of roaming", "abagáhun a broad-shouldered"
SUB = re.compile(rf"(?:^|(?<=[.;!?])\s+)((?:[{LETTER}]*-[{LETTER}-]*)|(?:[{LETTER}][{LETTER}'’-]+))\s+(n|v|a)\s+(?=[\[{{a-z(‘“=])")


# Short Bisaya words left where an entry only points to another ("{3} = kun").
CROSS = {"sa", "kun", "ug", "na", "pa", "ba", "ka", "ni", "si", "og", "dì", "wà"}
# English words that can look like a word and its part of speech inside a meaning ("in a way").
ENGLISH = set("in a an the of to on be as so or and for by at it is if up do go no not one".split())


def modern(word: str) -> str:
    """Wolff's spelling as Bisaya is written today: u in the last syllable is o (kaáyu -> kaáyo,
    ímung -> ímong, sulud -> sulod). One-syllable words stay as they are (ug, ku)."""
    base = unicodedata.normalize("NFD", word)
    vowels = [i for i, c in enumerate(base) if c.lower() in "aeiou"]
    if len(vowels) < 2:
        return unicodedata.normalize("NFC", word)
    last = vowels[-1]
    if base[last].lower() == "u":
        base = base[:last] + ("O" if base[last] == "U" else "o") + base[last + 1:]
    return unicodedata.normalize("NFC", base)


def tidy(text: str) -> str:
    for a, b in ABBREV.items():
        text = text.replace(a, b)
    text = re.sub(r"\s+", " ", text).strip(" ,;:")
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    if len(text) > MAX_GLOSS:
        text = text[: MAX_GLOSS - 1].rstrip() + "…"
    return text


# Abbreviations whose full stop doesn't end a meaning.
KEEP_DOTS = ("esp.", "e.g.", "i.e.", "etc.", "cf.", "lit.", "approx.", "usu.", "pl.", "sg.", "Sp.", "Eng.", "gen.",
             "Engl.", "fig.", "colloq.", "abbr.", "Mr.", "Mrs.", "St.", "no.", "vs.")


def meaning_of(piece: str) -> str:
    """The meaning at the start of a stretch of an entry: up to where its first example (or a phrase
    with the word, after "—") begins."""
    piece = POS_AT.sub("", piece.strip())
    piece = re.sub(r"^\s*(?:\[[^\]]*\]\s*)+", "", piece)
    if piece.startswith(("=", "see ")):
        return ""
    for a, b in ABBREV.items():  # (one that ends a sentence keeps its full stop: "s.t. Kita" -> "something. Kita")
        piece = re.sub(re.escape(a) + r"(?=\s+[A-ZÁÉÍÓÚ‘“])", b + ".", piece).replace(a, b)
    for a in KEEP_DOTS:
        piece = piece.replace(a, a.replace(".", "§"))
    cut = len(piece)
    for rx in (r"[.!?](?=\s)", r"\s—\s?", r"\s=\s", r"[.!?]$"):
        m = re.search(rx, piece)
        if m:
            cut = min(cut, m.start())
    text = piece[:cut].replace("§", ".").strip()
    if text.startswith("—"):
        return ""  # a phrase with the word in it, not a meaning of the word
    return tidy(text)


def entries(path: Path):
    text = path.read_text(encoding="utf-8")
    start = text.index("=== A ===")
    end = text.index("*** END OF THE PROJECT GUTENBERG EBOOK")
    body = text[start:end]
    for para in re.split(r"\n\s*\n", body):
        para = " ".join(para.split())
        if not para or para.startswith("==="):
            continue
        yield para


def parse(para: str):
    """(headword, [(pos, gloss)], [(derived word, pos, gloss)], same-as word or "", [(affix, pos, gloss)])."""
    m = HEAD.match(para)
    if not m:
        return None
    head = m.group(1)
    rest = para[m.end():].strip(" ,")
    rest = CODES.sub(" ", rest)
    same = ""
    eq = re.match(rf"^(?:(?:n|v|a)\s+)?(?:=|see)\s+([{LETTER}][{LETTER}'’-]*)", rest)
    if eq:
        same = eq.group(1)
    glosses: list[tuple[str, str]] = []
    derived: list[tuple[str, str, str]] = []
    affixed: list[tuple[str, str, str]] = []
    # Cut the entry where a derived word or a prefix form starts; each part has its own meanings.
    cuts = [(mm.start(1), mm.group(1), mm.group(2)) for mm in SUB.finditer(rest)]
    parts = []
    last, who, pos0 = 0, "", ""
    for at, word, pos in cuts:
        parts.append((who, pos0, rest[last:at]))
        last, who, pos0 = at + len(word), word, pos
    parts.append((who, pos0, rest[last:]))
    for who, pos, chunk in parts:
        chunk = chunk.strip()
        if not who:
            pos = ""
        current = pos
        pieces = SENSE.split(chunk)
        found = []
        for i, piece in enumerate(pieces):
            p = piece.strip()
            pm = re.match(r"^(n|v|a|adv|particle|exclamation|pron|conj|prep|linker|short form)\b", p)
            if pm:
                current = "" if pm.group(1) == "short form" else pm.group(1)
            g = meaning_of(p)
            if g:
                found.append((current, g))
            # The part of speech changes mid-entry: ". v [A] ..." — the meaning after it, and what follows is a verb.
            for mm in re.finditer(r"[.;!?]\s+(n|v|a)\b\s*(?=[a-z(‘{]|$)", p):
                current = mm.group(1)
                g2 = meaning_of(p[mm.end(1):])
                if g2:
                    found.append((current, g2))
        if not who:
            glosses.extend(found)
        elif who.endswith("-") or who.startswith("-") or "-" in who and not re.search(rf"[{LETTER}]{{3,}}-[{LETTER}]{{3,}}", who):
            glosses.extend((p, f"({who}) {g}") for p, g in found)
            affixed.extend((who, p, g) for p, g in found)
        elif len(who) >= 3 and who.lower() not in ENGLISH:
            derived.extend((who, p, g) for p, g in found)
    return head, glosses, derived, same, affixed


# ---------- the words Wolff lists only by their affix ----------
# Under a root Wolff gives the words made from it by their affix alone: under balay, "paniN- n household"
# is panimalay, "ka-an n group of homes" kabalayan; under palit, "paN- v buy" is pamalit (and mamalit,
# namalit). Each is spelled out by the rules of his introduction (N becomes m, n or ng and swallows the
# root's first consonant, a suffix may drop the root's last vowel: dakup + -an = dakpan, sulud + -an =
# sudlan, -in- goes after the first consonant, r repeats the first syllable), every way the rules allow,
# and only a spelling found in the Bisaya word list (docs/lexicon/ceb-roots.json.gz, 60,000 words of
# real Bisaya text) is kept, shown as it is written there. So no made-up word gets in.
NATIVE_SUFFIXES = {"an", "un", "anan", "unun", "nun", "anun", "ay", "a", "i", "hun", "han", "ug", "in", "unan"}
INFIXES = {"in", "um", "l", "r", "ul", "il"}
VERB_PREFIXES = ["", "mu", "mi", "ni", "gi", "nag", "mag", "naga", "maga", "ga", "i", "gina", "na", "ma", "naka", "maka"]


def plain(word: str) -> str:
    """A word as letters only, the way the rules work on it: no stress or glottal marks, lower case."""
    return "".join(c for c in unicodedata.normalize("NFD", word.lower()) if not unicodedata.combining(c)).replace("’", "'")


def nasal(root: str) -> list[str]:
    """N + the root (Wolff's note 24): palit -> malit, tindug -> nindug, kúhà -> nguha, ábang -> ngabang,
    lútù -> nglutu / nlutu, hisus -> nghisus. Also the root kept whole after the nasal (mbalit), which some
    words have."""
    c = root[:1]
    if root.startswith("ng"):
        return ["ng" + root[2:]]
    if c in "pb":
        return ["m" + root[1:], "m" + root]
    if c in "tds":
        return ["n" + root[1:], "n" + root]
    if c == "k":
        return ["ng" + root[1:], "ng" + root]
    if c in "aeiou":
        return ["ng" + root]
    if c == "l":
        return ["ngl" + root[1:], "nl" + root[1:], "ng" + root]
    return ["ng" + root]


def suffixed(stem: str, suffix: str) -> list[str]:
    """stem + suffix, every way Bisaya joins them: as it is, with h after a vowel (basa -> basahun), the
    root's last vowel dropped (dakup -> dakpan) and the two consonants then swapped (sulud -> sudlan,
    inum -> imnun), the last vowel dropped for a glottal stop (hibalu -> hibal-an)."""
    out = [stem + suffix]
    if suffix not in NATIVE_SUFFIXES:  # a Spanish ending: kumpirma -> kumpirmasiyun, abri -> abridur
        if stem[-1:] in "aeiou":
            out.append(stem[:-1] + suffix)
        return out
    v = "aeiou"
    if stem[-1:] in v:
        out.append(stem + "h" + suffix)
        out.append(stem[:-1] + "-" + suffix)
    if stem[-1:] == "d" and stem[-2:-1] in v and suffix[0] in v:
        out.append(stem[:-1] + "r" + suffix)  # d between vowels is r: hangtud -> kahangturan, bayad -> bayran
    if len(stem) >= 4 and stem[-1] not in v and stem[-2] in v and stem[-3] not in v + "'-":
        last = "r" if stem[-1] == "d" else stem[-1]
        out.append(stem[:-2] + last + suffix)
        # (the consonants swapped only where Bisaya swaps them: inum -> imnun, sulud -> sudlan, tanum -> tamnan)
        if stem[-3] + stem[-1] in ("nm", "ld"):
            out.append(stem[:-3] + stem[-1] + stem[-3] + suffix)
    return out


def infixed(stem: str, infix: str) -> str:
    """-in- after the first consonant (sulat -> sinulat), before a vowel (ilis -> inilis); r repeats the
    first syllable (babuy -> bababuy)."""
    if infix == "r":
        m = re.match(r"^(ng|[^aeiou]?)([aeiou])", stem)
        return (m.group(1) + m.group(2) + stem) if m else stem
    m = re.match(r"^(ng|[^aeiou])", stem)
    return (m.group(1) + infix + stem[len(m.group(1)):]) if m else infix + stem


def affix_forms(root: str, affix: str, pos: str) -> list[str]:
    """Every spelling of root + Wolff's affix label ("paN-", "ka-an", "-in-an", "maN-r-", "ma-in-un")."""
    affix = "".join(c for c in unicodedata.normalize("NFD", affix) if not unicodedata.combining(c))
    affix = re.sub(r"[_\d\s]+$", "", affix)
    root = re.sub(r"[^a-z'-]", "", plain(root)).strip("-")
    parts = affix.split("-")
    # (only small letters and N: a consonant written C, "Culu-", is a pattern of its own, left out)
    if len(parts) < 2 or not root or any(not re.fullmatch(r"[a-zN]*", p) for p in parts):
        return []
    prefix, suffix, middle = parts[0], parts[-1], parts[1:-1]
    if any(m not in INFIXES for m in middle):
        return []
    stems = [root]
    for m in [x for x in middle if x != "r"]:
        stems = [infixed(s, m) for s in stems]
    redup = "r" in middle
    with_prefix = []
    for s in stems:
        if prefix.endswith("N"):
            for n in nasal(s):
                with_prefix.append(prefix[:-1] + (infixed(n, "r") if redup else n))
        else:
            with_prefix.append(prefix + (infixed(s, "r") if redup else s))
    out = []
    for s in with_prefix:
        out.extend(suffixed(s, suffix) if suffix else [s])
    if pos == "v":
        # The verb's own forms: pamalit -> mamalit, namalit, gipamalit; paabut -> mupaabut, gipaabut.
        more = []
        for f in out:
            more += [p + f for p in VERB_PREFIXES if p]
            if f.startswith("pa") and prefix.startswith("pa"):
                more += ["ma" + f[2:], "na" + f[2:], "naga" + f[2:], "ga" + f[2:]]
            if f.startswith("hi") and prefix.startswith("hi"):
                more += ["ma" + f[2:], "na" + f[2:], "maka" + f[2:], "naka" + f[2:]]
        out += more
    return list(dict.fromkeys(out))


# What a verb's form begins with (who does it, when). A spelled-out word that is one of these on a word
# Wolff has (nasakit: na + sakit) is left to the app's root finder, which reaches that word's main meaning.
TENSE = sorted({p for p in VERB_PREFIXES if p} | {"nagka", "magka", "naka", "maka"}, key=len, reverse=True)


def spelled_out(entries_affixed, have: set, heads: set, tagalog: set, wordlist: list[str]) -> dict[str, list]:
    """{key: [shown, pos, [gloss], root]} for each affixed word found in the word list and in no dictionary.
    Not a word Tagalog has too (manuod is Tagalog manood, "watch", not maN- + túod), nor a tense prefix on
    a word Wolff has."""
    shown: dict[str, str] = {}
    for w in wordlist:  # (commonest first: of two spellings with one key, the commoner is shown)
        shown.setdefault(key(w, "ceb"), w)
    out: dict[str, list] = {}
    for head, affix, pos, gloss in entries_affixed:
        for form in affix_forms(head, affix, pos):
            k = key(form, "ceb")
            if k in have or k not in shown or k in tagalog:
                continue
            if any(k.startswith(t) and k[len(t):] in heads for t in TENSE):
                continue
            row = out.setdefault(k, [shown[k], POS.get(pos, ""), [], modern(head)])
            if row[1] == POS.get(pos, "") and gloss not in row[2] and len(row[2]) < MAX_GLOSSES:
                row[2].append(gloss)
    return out


def build(path: Path) -> dict:
    words: dict[str, list] = {}
    forms: dict[str, list] = {}

    def put(word: str, pos_code: str, gloss_list: list[str]) -> None:
        k = key(word, "ceb")
        if not k or not gloss_list:
            return
        pos = POS.get(pos_code, "")
        groups = words.setdefault(k, [])
        for g in groups:
            if g[1] == pos and g[0] == modern(word):
                g[2].extend(x for x in gloss_list if x not in g[2])
                del g[2][MAX_GLOSSES:]
                return
        groups.append([modern(word), pos, gloss_list[:MAX_GLOSSES], ""])

    wordlist = json.loads(gzip.decompress((OUT / "ceb-roots.json.gz").read_bytes()))["lemmas"]
    bisaya = {key(w, "ceb") for w in wordlist}

    def pointer(g: str) -> bool:
        """A "meaning" that is only another Bisaya spelling to look up (= gus-ab, abughù, apan-apan_1, pati-),
        not English: one word with a stress mark, a number or a hyphen at its end, or a hyphenated Bisaya
        word of the word list (broad-shouldered, bye-bye stay)."""
        if g in CROSS or len(g) <= 3 and not g.isascii() or g.startswith(("short form:", "short forms:")):
            return True
        if re.search(r"\s", g):
            return False
        return (not g.isascii() or bool(re.search(r"[-_\d]$", g))
                or "-" in g and key(g, "ceb") in bisaya)

    n = 0
    affixed: list[tuple[str, str, str, str]] = []
    for para in entries(path):
        parsed = parse(para)
        if not parsed:
            continue
        head, glosses, derived, same, by_affix = parsed
        n += 1
        affixed.extend((head, a, p, g) for a, p, g in by_affix if g and not pointer(g))
        by_pos: dict[str, list[str]] = {}
        for pos, g in glosses:
            if pointer(g):
                continue  # a bare cross-reference to another Bisaya word ("kun", "dì"), not a meaning
            if g and g not in by_pos.setdefault(pos, []):
                by_pos[pos].append(g)
        for pos, gl in by_pos.items():
            put(head, pos, gl)
        for word, pos, g in derived:
            if g and not pointer(g):
                put(word, pos, [g])
        if same and not glosses:
            hk, sk = key(head, "ceb"), key(same, "ceb")
            if hk and sk and hk != sk:
                row = forms.setdefault(hk, [])
                if all(r[0] != sk for r in row):
                    row.append([sk, f"same as {modern(same)}"])
    # (and a "meaning" that is one of Wolff's own words, gusab: "gus-ab")
    for k in list(words):
        for g in words[k]:
            g[2] = [x for x in g[2] if " " in x or "-" not in x or not {key(x, "ceb"), key(x.replace("-", ""), "ceb")} & set(words)]
        words[k] = [g for g in words[k] if g[2]]
        if not words[k]:
            del words[k]
    forms = {k: [r for r in v if r[0] in words] for k, v in forms.items()}
    forms = {k: v for k, v in forms.items() if v and k not in words}
    # The affixed words, where neither Wolff's own words nor Wiktionary's Bisaya entries have the word.
    wikt = json.loads(gzip.decompress((OUT / "ceb-meanings.json.gz").read_bytes()))
    own = {k for k, groups in wikt["words"].items()
           if any(g[1] != "name" and (g[3].split("|") + ["", "", ""])[2] not in ("English word", "Tagalog word") for g in groups)}
    tl = json.loads(gzip.decompress((OUT / "tl-meanings.json.gz").read_bytes()))
    tagalog = {key(k, "ceb") for k in [*tl["words"], *tl["forms"]]}
    added = spelled_out(affixed, set(words) | set(forms) | own | set(wikt["forms"]), set(words) | own, tagalog, wordlist)
    for k, row in added.items():
        words[k] = [row]
    print(f"  ceb (Wolff): {n} entries read, {len(words)} words with meanings ({len(added)} spelled out from their affix), "
          f"{len(forms)} pointing to another", flush=True)
    return {"format": 1, "kind": "meanings", "lang": "ceb",
            "source": "John U. Wolff, A Dictionary of Cebuano Visayan (1972), Project Gutenberg ebook 40074",
            "license": "public-domain-us", "words": words, "forms": forms}


def write(data: dict) -> None:
    name = "ceb-wolff-meanings.json.gz"
    packed = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), compresslevel=9, mtime=0)
    (OUT / name).write_bytes(packed)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["files"]["mean-cebw"] = {
        "file": name, "bytes": len(packed), "sha256": hashlib.sha256(packed).hexdigest(),
        "title": "Bisaya meanings (Wolff's dictionary)", "db": "Wolff, A Dictionary of Cebuano Visayan (Project Gutenberg)",
        "license": "public-domain-us", "words": len(data["words"]), "forms": len(data["forms"]),
    }
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  wrote {name}, {len(packed) / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    write(build(Path(sys.argv[1])))
