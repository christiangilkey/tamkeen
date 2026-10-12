"""Build Tamkeen's Arabic word dictionaries from the CAMeL Tools morphology databases.

The app works out a word's dictionary form (its lemma) with the table-lookup method of the
CAMeL Tools analyzer (https://github.com/CAMeL-Lab/camel_tools), using that project's
databases. A database as published is 8 to 67 MB of text, most of it features the app never
reads (glosses, tokenizations, phonetics). This script keeps what the lookup needs and writes
one small file per database into docs/lexicon/, which is where the apps download them from
(see app/lexicon.py and web/js/lexicon/).

    python tools/build_lexicon.py msa=path/to/msa/morphology.db egy=... glf=... lev=...

Each output file keeps the licence of the database it was made from (see docs/lexicon/README.md).
The file layout is documented in web/js/lexicon/arabic.js, which reads it.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
FORMAT = 1

SOURCES = {
    "msa": {"title": "Modern Standard Arabic", "db": "calima-msa-r13", "license": "GPL-2.0"},
    "egy": {"title": "Egyptian Arabic", "db": "calima-egy-r13", "license": "GPL-2.0"},
    "glf": {"title": "Gulf Arabic", "db": "calima-glf-01", "license": "CC-BY-4.0"},
    "lev": {"title": "Levantine Arabic", "db": "calima-lev-01", "license": "CC-BY-4.0"},
}

_STRIP_LEX = re.compile("_|-")          # "كَتَب-u_1" -> "كَتَب" (same rule as camel_tools.morphology.utils.strip_lex)
_CLITICS = ("prc3", "prc2", "prc1", "prc0", "enc0", "enc1", "enc2")
_EMPTY = ("", "0", "na", "-")
_NOT_LETTER = re.compile("[^ء-غف-يٱ-ۓ]")


def _spelling(diac: str) -> str:
    """A vowelled form as it is normally written: no vowel marks, and a plain alef for alef wasla.
    Unlike the lookup keys, this keeps hamzas, taa marbuta and alef maqsura, so the app can prefer
    the reading that matches how a word was actually spelled (كتابة and كتابه share a key)."""
    return _NOT_LETTER.sub("", diac).replace("ٱ", "ا")


def _feats(text: str) -> dict[str, str]:
    out = {}
    for tok in text.strip().split(" "):
        if not tok:
            continue
        key, _, value = tok.partition(":")
        out[key] = value
    return out


class _Ids:
    """Hands out small numbers for repeated values."""

    def __init__(self) -> None:
        self.index: dict = {}
        self.items: list = []

    def __call__(self, value) -> int:
        i = self.index.get(value)
        if i is None:
            i = self.index[value] = len(self.items)
            self.items.append(value)
        return i


def convert(path: Path, name: str) -> dict:
    section = ""
    pcat, scat, xcat, affix, lex, raw = _Ids(), _Ids(), _Ids(), _Ids(), _Ids(), _Ids()
    raw("")  # 0 = "spelled exactly like its key"
    prefixes: dict[str, list[int]] = {}
    suffixes: dict[str, list[int]] = {}
    stems: dict[str, dict[tuple[int, int, int], int]] = {}
    ab: dict[int, set[int]] = {}
    bc: dict[int, set[int]] = {}
    ac: dict[int, set[int]] = {}
    pairs: dict[str, list[tuple[str, str]]] = {"AB": [], "BC": [], "AC": []}

    with path.open(encoding="utf-8") as f:
        for text in f:
            line = text.rstrip("\n")
            if line.startswith("###") and line.rstrip().endswith("###"):
                section = line.strip().strip("#").strip()
                continue
            if section in ("PREFIXES", "SUFFIXES"):
                parts = line.split("\t")
                if len(parts) != 3:
                    continue
                form, cat, a = parts[0].strip(), parts[1], _feats(parts[2])
                clitics = "+".join(a[k] for k in _CLITICS if a.get(k, "") not in _EMPTY)
                pos = a.get("pos", "")
                feat = affix((pos if pos not in ("", "-") else "", clitics, _spelling(a.get("diac", ""))))
                if section == "PREFIXES":
                    prefixes.setdefault(form, []).extend((pcat(cat), feat))
                else:
                    suffixes.setdefault(form, []).extend((xcat(cat), feat))
            elif section == "STEMS":
                parts = line.strip().split("\t")
                if len(parts) != 3 or parts[0] == "NOAN":
                    continue
                a = _feats(parts[2])
                lemma = _STRIP_LEX.split(a.get("lex", ""))[0]
                if not lemma:
                    continue
                root = a.get("root", "")
                if not re.search("[ء-ي]", root):
                    root = ""  # NTWS, PUNC and the like: no real root
                entry = lex((lemma, a.get("pos", ""), root))
                try:
                    logprob = float(a.get("pos_lex_logprob", "-99"))
                except ValueError:
                    logprob = -99.0
                # Stored as a whole number: tenths of the (negative) log probability, 990 = never seen.
                cost = min(990, max(0, round(-logprob * 10)))
                seen = stems.setdefault(parts[0], {})
                spelled = _spelling(a.get("diac", ""))
                key = (scat(parts[1]), entry, raw(spelled) if spelled != parts[0] else 0)
                seen[key] = min(seen.get(key, 990), cost)
            elif section.startswith("TABLE "):
                toks = line.split()
                if len(toks) == 2:
                    pairs[section[6:]].append((toks[0], toks[1]))

    # Compatibility tables only matter for categories that some prefix, stem or suffix has.
    for a, b in pairs["AB"]:
        if a in pcat.index and b in scat.index:
            ab.setdefault(pcat.index[a], set()).add(scat.index[b])
    for a, b in pairs["BC"]:
        if a in scat.index and b in xcat.index:
            bc.setdefault(scat.index[a], set()).add(xcat.index[b])
    for a, b in pairs["AC"]:
        if a in pcat.index and b in xcat.index:
            ac.setdefault(pcat.index[a], set()).add(xcat.index[b])

    def table(pairs_by_id: dict[int, set[int]], size: int) -> list[list[int]]:
        return [sorted(pairs_by_id.get(i, ())) for i in range(size)]

    return {
        "format": FORMAT, "name": name, **SOURCES[name],
        "maxPrefix": max(map(len, prefixes)), "maxSuffix": max(map(len, suffixes)),
        "affix": [list(x) for x in affix.items],
        "lex": [list(x) for x in lex.items],
        "raw": raw.items,
        "prefixes": prefixes, "suffixes": suffixes,
        "stems": {form: [n for (cat, entry, spelled), cost in sorted(found.items()) for n in (cat, entry, cost, spelled)]
                  for form, found in stems.items()},
        "ab": table(ab, len(pcat.items)), "bc": table(bc, len(scat.items)), "ac": table(ac, len(pcat.items)),
    }


def main(args: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {"format": FORMAT, "files": {}}
    for arg in args:
        name, _, src = arg.partition("=")
        if name not in SOURCES or not src:
            raise SystemExit(f"Expected name=path with name one of {', '.join(SOURCES)}; got {arg!r}")
        data = convert(Path(src), name)
        blob = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)
        file = f"ar-{name}.json.gz"
        (OUT / file).write_bytes(blob)
        index["files"][name] = {"file": file, "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
                                "title": SOURCES[name]["title"], "db": SOURCES[name]["db"],
                                "license": SOURCES[name]["license"],
                                "stems": len(data["stems"]), "lexemes": len(data["lex"])}
        print(f"{file}: {len(blob) / 1e6:.2f} MB, {len(data['stems']):,} stems, {len(data['lex']):,} lexemes")
    index["format"] = FORMAT
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
