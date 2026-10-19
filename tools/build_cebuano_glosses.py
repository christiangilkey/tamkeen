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
    """(headword, [(pos, gloss)], [(derived word, pos, gloss)], same-as word or "")."""
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
        elif len(who) >= 3 and who.lower() not in ENGLISH:
            derived.extend((who, p, g) for p, g in found)
    return head, glosses, derived, same


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

    n = 0
    for para in entries(path):
        parsed = parse(para)
        if not parsed:
            continue
        head, glosses, derived, same = parsed
        n += 1
        by_pos: dict[str, list[str]] = {}
        for pos, g in glosses:
            if g in CROSS or len(g) <= 3 and not g.isascii():
                continue  # a bare cross-reference to another Bisaya word ("kun", "dì"), not a meaning
            if g and g not in by_pos.setdefault(pos, []):
                by_pos[pos].append(g)
        for pos, gl in by_pos.items():
            put(head, pos, gl)
        for word, pos, g in derived:
            if g:
                put(word, pos, [g])
        if same and not glosses:
            hk, sk = key(head, "ceb"), key(same, "ceb")
            if hk and sk and hk != sk:
                row = forms.setdefault(hk, [])
                if all(r[0] != sk for r in row):
                    row.append([sk, f"same as {modern(same)}"])
    forms = {k: [r for r in v if r[0] in words] for k, v in forms.items()}
    forms = {k: v for k, v in forms.items() if v and k not in words}
    print(f"  ceb (Wolff): {n} entries read, {len(words)} words with meanings, {len(forms)} pointing to another", flush=True)
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
