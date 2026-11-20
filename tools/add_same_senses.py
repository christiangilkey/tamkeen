"""Near-synonyms in the meanings files: the "same" list (Add words' "Which meaning?", web/js/senses.js distinctSenses).

A word's meanings can be two English words for one sense (سحر "magic" and "enchantment", بقشيش "tip" and "gratuity"),
and "Which meaning?" then asked which one, as though they were different meanings. Each meanings file gets a list of
the pairs of English words that are one sense: two of a word's meanings whose English words are synonyms of each other
in English Wiktionary, each listing the other (one-way links are left out: "tense" lists "time", "look after" lists
"look for"; a choice too many is better than two real meanings made one). No evidence, no pair: cinnabar and vermilion
stay two choices.

    python tools/add_same_senses.py <English .jsonl.gz from kaikki.org> [lang ...]

Run it after tools/build_meanings.py (which writes the files without the list): it rewrites each
docs/lexicon/<lang>-meanings.json.gz (and the other meanings files: Arabic CAMeL, Bisaya Wolff, JMdict) in place with
"same": ["enchantment|magic", ...] and updates docs/lexicon/index.json. The English file is
https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz (about 530 MB), read once, never stored.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
MAX_GLOSSES = 12  # (a word's first meanings: the ones "Which meaning?" can show)


def heads(gloss: str) -> list[str]:
    """The English words a meaning is made of, as web/js/lexicon/meaningdata.js glossHeads keys them: "to take, catch
    (a ball)" -> ["take", "catch"] (at most three words each)."""
    out = []
    plain = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", str(gloss))
    for part in re.split(r"[;,/]", plain):
        h = re.sub(r"^(?:to|a|an|the)\s+", "", part.strip().lower()).strip(" .!?")
        if h and len(h.split()) <= 3:
            out.append(h)
    return out


def candidates(data: dict) -> set[tuple[str, str]]:
    """Pairs of English words from two different meanings of one word (a, b sorted)."""
    pairs = set()
    for groups in data.get("words", {}).values():
        glosses = [g for grp in groups for g in (grp[2] if isinstance(grp[2], list) else [])][:MAX_GLOSSES]
        hs = [set(heads(g)) for g in glosses]
        for i in range(len(hs)):
            for j in range(i + 1, len(hs)):
                for a in hs[i]:
                    for b in hs[j]:
                        if a != b and a not in hs[j] and b not in hs[i]:
                            pairs.add((min(a, b), max(a, b)))
    return pairs


def synonyms(english: Path, wanted: set[str]) -> dict[str, set[str]]:
    """Each wanted English word's synonyms in English Wiktionary (the entry's and every sense's)."""
    syn: dict[str, set[str]] = {}
    with gzip.open(english, "rt", encoding="utf-8") as f:
        for line in f:
            entry = json.loads(line)
            word = str(entry.get("word") or "").lower()
            if word not in wanted:
                continue
            found = syn.setdefault(word, set())
            for item in [*entry.get("synonyms", []), *(x for s in entry.get("senses", []) for x in s.get("synonyms", []))]:
                if item.get("word"):
                    found.add(str(item["word"]).lower())
    return syn


def main(args: list[str]) -> None:
    if not args:
        sys.exit(__doc__)
    english, langs = Path(args[0]), set(args[1:])
    files = sorted(p for p in OUT.glob("*-meanings.json.gz") if not p.name.startswith("en-")
                   and (not langs or p.name.split("-")[0] in langs))
    datas = {p: json.loads(gzip.decompress(p.read_bytes()).decode("utf-8")) for p in files}
    pairs = {p: candidates(d) for p, d in datas.items()}
    wanted = {w for ps in pairs.values() for pr in ps for w in pr}
    print(f"{sum(len(ps) for ps in pairs.values())} pairs of meanings to look at, {len(wanted)} English words", flush=True)
    syn = synonyms(english, wanted)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    for p, data in datas.items():
        same = sorted(f"{a}|{b}" for a, b in pairs[p] if b in syn.get(a, ()) and a in syn.get(b, ()))
        data["same"] = same
        raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        packed = gzip.compress(raw, compresslevel=9, mtime=0)
        p.write_bytes(packed)
        entry = next((v for v in index["files"].values() if v.get("file") == p.name), None)
        if entry is None:
            sys.exit(f"{p.name} is not in index.json")
        entry["bytes"], entry["sha256"] = len(packed), hashlib.sha256(packed).hexdigest()
        print(f"  {p.name}: {len(same)} pairs, {len(packed) / 1e6:.2f} MB", flush=True)
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main(sys.argv[1:])
