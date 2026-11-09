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
alike for Bisaya, so either spelling finds the word. A verb's conjugation code ("[A2S3S; a]") becomes its
main forms in the popup's grammar line (verb_grammar: mokaon, mikaon; kan-on, gikaon; kan-an, gikan-an).

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


# ---------- a verb's main forms, from Wolff's conjugation code ----------
# Each verb meaning in Wolff carries a code for the affixes it takes (his introduction, section 7):
# "[A2S3S; a]" for káun "eat", "[A; c]" for hátag "give", "[B1256; b6]". Before the semicolon the
# active sets: A action verbs (mu-/mi-, mag-/nag-, maka-/naka-), B stative verbs (also ma-/na- and
# magka-), C mutual action verbs (mag-/nag-, magka-, makig-). A number after the letter is a set the verb
# lacks (A1: no mu-, A2: no mag-, A3: no maka-; B1 mu-, B2 mag-, B4 ma-, B5 maka-, B6 magka-, while B3 only
# changes maka-'s meaning; C1 mag-, C2 magka-, C3 makig-), unless S follows it (the set is there, the
# stress shifts) or P (there, with pa- too). N: paN- can be added. After the semicolon the passive sets:
# a the direct passive (-un, gi-), b the local passive (-an, gi-…-an), c the instrumental passive (i-, gi-).
# Their numbers: a1 no local passive, a2 no instrumental one, a3 only the potential ma-/na-; b(1) no
# instrumental passive, b6 only the local one, b3(1), b4(1) and b8 only the potential ma-…-an; c3 only
# ika-/gika-, c6 no local passive. (The other numbers only change what the passive means.)
# The verb's word group gets its main forms as the grammar line (build_meanings.py grammar_info's
# format): who does it (mo-, mi-), what it is done to, and one more passive, each as future · past.
ACTIVE_SETS = {"A": {"1": "mu", "2": "mag", "3": "maka"},
               "B": {"1": "mu", "2": "mag", "4": "ma", "5": "maka", "6": "magka"},
               "C": {"1": "mag", "2": "magka", "3": "makig"}}
# (in the order shown: a stative verb's ma-/na- first, malipay "be happy", nalipay)
ACTIVE_ORDER = {"A": ["mu", "mag", "maka"], "B": ["ma", "mu", "mag", "maka", "magka"], "C": ["mag", "magka", "makig"]}
PAST = {"mu": "mi", "mag": "nag", "maka": "naka", "ma": "na", "magka": "nagka", "makig": "nakig"}
CLASS_WORDS = {"B": "stative", "C": "mutual action"}
VERB_CODE = re.compile(r"^(?:[ABC](?:\d|S|N|P|\(1\))*)+(?:\s*;\s*(?:[abc](?:\d|S|N|P|\(1\))*)+)?$|^(?:[abc](?:\d|S|N|P|\(1\))*)+$")
MAX_FORM_ROWS = 6
# Where a spelling is looked for in the entry's own examples: after a passive prefix, which shows it is the
# verb (gisakyan, nakan-an; bare sakayan is "boat"), or on its own (kan-un).
VERB_SEEN_PREFIXES = ["gi", "na", "ma", "hi", "ka", "gika", "ika", "gina", "paga", "ha"]


def decode(code: str) -> dict | None:
    """Wolff's verb code as {"active": [(class, {"sets": [...], "shift": {...}, "paN": bool})],
    "passive": [(class, {subclass, ...})]}, or None when the brackets hold something else ([so-and-so])."""
    code = code.strip()
    if not code or not VERB_CODE.match(code):
        return None
    active_part, _, passive_part = code.partition(";") if code[0].isupper() else ("", "", code)
    active = []
    for letter, mods in re.findall(r"([ABC])((?:\d(?:S|P|\(1\))*|S|N|P|\(1\))*)", active_part):
        lacks = {d for d, after in re.findall(r"(\d)((?:S|P|\(1\))*)", mods) if not after}
        shift = {ACTIVE_SETS[letter].get(d) for d in re.findall(r"(\d)S", mods)} - {None}
        sets = [s for s in ACTIVE_ORDER[letter] if not any(ACTIVE_SETS[letter].get(d) == s for d in lacks)]
        active.append((letter, {"sets": sets, "shift": shift, "paN": "N" in re.sub(r"\(1\)", "", mods)}))
    passive = []
    for letter, mods in re.findall(r"([abc])((?:\d(?:\(1\))?|\(1\)|S|P|N)*)", passive_part.replace(" ", "")):
        passive.append((letter, set(re.findall(r"\d\(1\)|\(1\)|\d", mods))))
    if not active and not passive:
        return None
    return {"active": active, "passive": passive}


def suffix_candidates(root: str, suffix: str, glottal: bool = False) -> list[str]:
    """Every way root + suffix may be spelled (Wolff's introduction, 5.12-5.15), the plainest first:
    suffixed()'s, and the glottal stop between two vowels moving after the last consonant (káun + -un =
    kan-un), the dropped vowel's consonants swapped (putus + -un = pustun, luhud + -an = ludhan), l, d or r
    before k, g or ng becoming g (haluk + -an = hagkan), a Spanish r becoming h (imbitar + -un = imbitahun).
    `glottal`: the root ends in a glottal stop (kúhà, walà), which stays: kuhaun, and walà + -un = wad-un."""
    if glottal:
        return [root + suffix] + ([root[:-2] + "d-" + suffix] if root[-2:-1] in ("l", "r") else [])
    out = suffixed(root, suffix)
    if root[-1:] in "aeiou" and len(root) > 3:
        # the last vowel dropped for h (dala + -un = dalhun), or for a glottal stop after l, d (dad-un)
        out.append(root[:-1] + "h" + suffix)
        if root[-2] in ("l", "r"):
            out.append(root[:-2] + "d-" + suffix)
    m = re.fullmatch(r"(.*[aeiou])[aeiou](ng|[^aeiou'-])", root)
    if m:
        out.append(m.group(1) + m.group(2) + "-" + suffix)
    m = re.fullmatch(r"(.*[aeiou])(ng|[^aeiou'-])[aeiou](ng|[^aeiou'-])", root)
    if m:
        pre, c1, c2 = m.groups()
        for last in dict.fromkeys([c2, "r" if c2 == "d" else c2]):  # (luhud + -an = ludhan; bayad + -an = bayran)
            out += [pre + c1 + last + suffix, pre + last + c1 + suffix]
        if c1 in ("l", "d", "r") and c2 in ("k", "g", "ng"):
            out.append(pre + "g" + c2 + suffix)
    if root.endswith(("r", "l")) and len(root) > 3:
        out.append(root[:-1] + "h" + suffix)
    return list(dict.fromkeys(out))


def plain_candidates(root: str, suffix: str, glottal: bool = False) -> list[str]:
    """The spellings of root + suffix that change the root least: as it is, with h after a vowel (basahun),
    the glottal stop moved (kan-un), or the last vowel simply dropped (sugud + -an = sugdan). The only ones
    taken from the word list alone: there, a reshaped spelling is as often another word (patrun: English
    "patron", not pátid + -un)."""
    if glottal:
        return [root + suffix]
    out = [root + suffix]
    if root[-1:] in "aeiou":
        out.append(root + "h" + suffix)
    m = re.fullmatch(r"(.*[aeiou])[aeiou](ng|[^aeiou'-])", root)
    if m:
        out.append(m.group(1) + m.group(2) + "-" + suffix)
    m = re.fullmatch(r"(.*[aeiou](?:ng|[^aeiou'-]))[aeiou](ng|[^aeiou'-])", root)
    if m:
        out.append(m.group(1) + m.group(2) + suffix)
    return out


def joined(prefix: str, stem: str) -> str:
    """A prefix and what follows it: a hyphen between a consonant and a vowel (nag-adtu, makig-áway)."""
    return prefix + ("-" if prefix[-1:] not in "aeiou" and stem[:1] in "aeiou" else "") + stem


ACUTE, GRAVE, WEDGE = "\u0301", "\u0300", "\u030c"  # (combining marks, as in NFD)


def penult_stress(head: str) -> bool:
    """Whether Wolff's spelling of a word puts its stress on the last-but-one syllable (his 3.0): the vowel
    with the acute mark is the long, stressed one (bása, káun); with none, a closed last-but-one syllable
    is stressed (tan-aw, bàbà), an open one is not (palit is palít; a wedge marks a stressed last one)."""
    base = unicodedata.normalize("NFD", head.lower())
    vowels = [i for i, c in enumerate(base) if c in "aeiou"]
    if len(vowels) < 2:
        return False
    if ACUTE in base:
        return ACUTE in base[vowels[-2] + 1:vowels[-1]]
    if WEDGE in base:
        return False
    between = base[vowels[-2] + 1:vowels[-1]]
    return len(re.sub(r"[^a-z'-]", "", between)) + between.count(GRAVE) >= 2


def predictable(head: str) -> bool:
    """Whether root + suffix is simply the two joined (palit + -an = palitan) when no example shows it: a root
    ending in a consonant and stressed on its last-but-one syllable (a vowel is dropped mostly when the last
    is stressed: dakup + -an = dakpan, Wolff 5.12), with no glottal stop or h before its last vowel (káun:
    kan-un; luhud: ludhan)."""
    p = plain(head)
    if not p or p[-1] in "aeiou'-" or re.search(r"[aeiou][aeiou][^aeiou]+$|h[aeiou][^aeiou]+$", p):
        return False
    return penult_stress(head)


def verb_grammar(head: str, code: str, seen: set[str], shown: dict[str, tuple[int, str]], english: set[str] = frozenset()) -> list:
    """The grammar line [grammar words, [[label, form], ...]] for the verb `head` with Wolff's `code`, or [].
    `seen`: the keys of the words in the entry's own examples; `shown`: the Bisaya word list, key -> (rank,
    spelling). A suffixed form is given only when the entry's examples or the word list have one of its
    spellings (or it is `predictable`), so no made-up word is shown."""
    info = decode(code)
    root = plain(head).strip("-")
    if not info or not root or not re.fullmatch(r"[a-z'-]+", root):
        return []

    # The forms are written as Bisaya is today, like the headword: the root keeps its o (adto: giadtoan,
    # mokaon), a suffix's u is o (palitun: paliton). Real text mostly does so (giadtoan, lutoon, sugoon).
    mroot = plain(modern(head)).strip("-")
    glottal = unicodedata.normalize("NFD", head.lower()).rstrip("-").endswith(GRAVE)

    def written(c: str) -> str:
        return modern(mroot + c[len(root):] if c.startswith(root) else c)

    absent = 10 ** 9

    def rank(c: str) -> int:
        """How common the spelling is in the word list (alone or after gi-); `absent` when it isn't there."""
        return min([shown[k][0] for k in (key(c, "ceb"), key("gi" + c, "ceb")) if k in shown] or [absent])

    def stem(suffix: str) -> str:
        """root + suffix as Wolff's examples, else the word list, spell it (or "" when neither has it). Of
        several spellings Wolff shows (dad-un, dalhun, dal-un), the commonest in the word list."""
        cands = suffix_candidates(root, suffix, glottal)
        for tier in ([c for c in cands if any(key(p + c, "ceb") in seen for p in VERB_SEEN_PREFIXES)],
                     [c for c in cands if key(c, "ceb") in seen]):
            if tier:
                return written(min(tier, key=lambda c: (rank(c), cands.index(c))))
        # (from the word list alone: a plain spelling of a root of two syllables or more, and not an English
        # word of the list, human: húm + -an)
        many = len(re.findall(r"[aeiou]", root)) >= 2  # (taas is ta-as)
        hits = [(rank(c), c) for c in plain_candidates(root, suffix, glottal)
                if many and rank(c) < absent and key(c, "ceb") not in english]
        if hits:
            return written(min(hits)[1])
        if not predictable(head):
            return ""
        return written(re.sub(r"(?<=[aeiou])d$", "r", root) + suffix)  # (d between vowels is r: búkid -> bukiran)

    rows: list[list[str]] = []

    def add(label: str, future: str, past: str) -> None:
        """A row's future · past (a past another row shows already, gi- for i- and -un alike, is left out)."""
        if not future or any(r[0] == label for r in rows):
            return
        new = [[label, future]] + ([[label, past]] if past and all(r[1] != past for r in rows) else [])
        if len(rows) + len(new) <= MAX_FORM_ROWS:
            rows.extend(new)

    if info["active"]:
        act = info["active"][0][1]
        if act["sets"]:
            first = act["sets"][0]
            # (mu- is written mo- today: mokaon)
            add("actor focus", joined("mo" if first == "mu" else first, mroot), joined(PAST[first], mroot))

    def passive(letter: str, subs: set) -> list[tuple[str, str, str]]:
        """(label, future, past) of the class's main passive, then its other one."""
        un, an = (stem("un") if letter == "a" else ""), stem("an")
        direct = ("ma" + mroot, "na" + mroot) if "3" in subs else (un, "gi" + mroot if un else "")
        local_pot = subs & {"3(1)", "4(1)", "8"}
        local = ("ma" + an, "na" + an) if (local_pot or letter == "a" and "3" in subs) and an else (an, "gi" + an if an else "")
        instr = ("ika" + mroot, "gika" + mroot) if "3" in subs else ("i" + mroot, "gi" + mroot)
        out = []
        if letter == "a":
            out.append(("object focus", *direct))
            if "1" not in subs:
                out.append(("local focus", *local))
            elif "2" not in subs and "3" not in subs:
                out.append(("instrument focus", *instr))
        elif letter == "b":
            out.append(("local focus", *local))
            if "(1)" not in subs and ("6" not in subs or "6(1)" in subs) and not local_pot:
                out.append(("instrument focus", *instr))
        elif letter == "c":
            out.append(("instrument focus", *instr))
            if "6" not in subs:
                out.append(("local focus", *local))
        return out

    found = [passive(letter, subs) for letter, subs in info["passive"]]
    # The first class's main passive, a second class's main one, then the first's other one. A class's main
    # passive is what the action is done to (Wolff: -un for a, -an for b, i- for c): the first one there is
    # "object focus" (hagkan "kiss her", ihatag "give it").
    order = ([(True, *found[0][0])] if found else []) + [(True, *f[0]) for f in found[1:]]         + [(False, *x) for x in (found[0][1:] if found else [])]
    for main, label, future, past in order:
        add("object focus" if main and future and not any(r[0] == "object focus" for r in rows) else label, future, past)
    letters = {a for a, _ in info["active"]}
    words = [CLASS_WORDS[next(iter(letters))]] if len(letters) == 1 and next(iter(letters)) in CLASS_WORDS else []
    return [words, rows] if rows else []


def verb_codes(para: str) -> dict[str, tuple[str, str]]:
    """{word: (its first verb code, its part of the entry)} for the entry's own word ("") and the words made
    from it that have meanings of their own (adtuan v [A13]), cut the way parse() cuts the entry."""
    m = HEAD.match(para)
    if not m:
        return {}
    rest = para[m.end():].strip(" ,")
    blank = CODES.sub(lambda mm: " " * len(mm.group()), rest)  # (the same cuts as parse(), at the same places)
    cuts = [(0, "")] + [(mm.start(1), mm.group(1)) for mm in SUB.finditer(blank)]
    out: dict[str, tuple[str, str]] = {}
    for i, (at, who) in enumerate(cuts):
        end = cuts[i + 1][0] if i + 1 < len(cuts) else len(rest)
        text = rest[at + len(who):end]
        if who and (who.startswith("-") or who.endswith("-") or "-" in who
                    and not re.search(rf"[{LETTER}]{{3,}}-[{LETTER}]{{3,}}", who) or len(who) < 3 or who.lower() in ENGLISH):
            continue  # (words listed only by their affix: their root's forms are not theirs)
        code = next((c for c in re.findall(r"\[([^\]]*)\]", text) if decode(c)), "")
        if code and who not in out:
            out[who] = (code, text)
    return out


INFLECTION = re.compile(r"\b(?:aspect|mood) of |\bfocus form of |^form of ")


def tagalog_lookalikes(tl: dict) -> set[str]:
    """The keys of Tagalog's file that a spelled-out Bisaya word must not be (manuod is Tagalog manood): its words
    and spellings, not the verb forms that only say which aspect or focus they are (nagpadala; nangisda, "complete
    aspect of mangisda"), which Bisaya has too."""
    def only_inflection(texts):
        texts = list(texts)
        return bool(texts) and all(INFLECTION.search(t) for t in texts)
    words = {k for k, groups in tl["words"].items() if not only_inflection(x for g in groups for x in g[2])}
    forms = {k for k, rows in tl["forms"].items() if not only_inflection(str(r[1]) for r in rows)}
    return {key(k, "ceb") for k in words | forms}


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

    # (the English words of the Bisaya word list, which Wiktionary's file marks: no verb's form is one)
    english = {k for k, groups in json.loads(gzip.decompress((OUT / "ceb-meanings.json.gz").read_bytes()))["words"].items()
               if any((str(g[3]).split("|") + ["", "", ""])[2] == "English word" for g in groups)}
    ranks: dict[str, tuple[int, str]] = {}  # (commonest first: of two spellings with one key, the commoner)
    for i, w in enumerate(wordlist):
        ranks.setdefault(key(w, "ceb"), (i, w))
    n = n_verbs = 0
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
        # The verb's main forms, from its first conjugation code (verb_grammar), on its word group.
        for who, (code, text) in verb_codes(para).items():
            word = who or head
            group = next((g for g in words.get(key(word, "ceb"), []) if g[1] == "verb" and g[0] == modern(word)), None)
            if group and len(group) == 4:
                seen = {key(t, "ceb") for t in re.findall(rf"[{LETTER}'’-]+", text)}
                info = verb_grammar(word, code, seen, ranks, english)
                if info:
                    group.append(info)
                    n_verbs += 1
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
    tagalog = tagalog_lookalikes(tl)
    added = spelled_out(affixed, set(words) | set(forms) | own | set(wikt["forms"]), set(words) | own, tagalog, wordlist)
    for k, row in added.items():
        words[k] = [row]
    # The popup shows the first group's grammar line. Where that is a word with no part of speech (adto "there,
    # will go") or an adjective a verb is made from (human "finished": mahuman, nahuman), it gets the verb's
    # forms too; a noun's own meaning (balay "house") comes without them.
    for groups in words.values():
        first = groups[0]
        if len(first) == 4 and first[1] in ("", "adj"):
            verb = next((g for g in groups[1:] if g[1] == "verb" and len(g) > 4 and g[0] == first[0]), None)
            if verb:
                first.append(verb[4])
    print(f"  ceb (Wolff): {n} entries read, {len(words)} words with meanings ({len(added)} spelled out from their affix), "
          f"{len(forms)} pointing to another, {n_verbs} verbs with their forms", flush=True)
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
