"""Build the second Arabic meanings file for No AI: English glosses from the CAMeL Tools databases.

Wiktionary (tools/build_meanings.py, docs/lexicon/ar-meanings.json.gz) is asked first; this file is
the fallback for the many words it lacks. It comes from the same morphology databases as the Arabic
word tables (tools/build_lexicon.py, by the CAMeL Lab at New York University Abu Dhabi), which give
every dictionary word (lemma) an English gloss: Standard Arabic from the SAMA/Buckwalter lexicon
(calima-msa-r13), and Egyptian (calima-egy-r13), Gulf (calima-glf-01) and Levantine (calima-lev-01)
where theirs are filled in. Keyed like the word tables' lemmas, so the app's own analysis of a word
(web/js/lexicon/arabic.js) leads straight to its gloss; each spelling of a stem also points to its
lemma (broken plurals: كتب -> كتاب).

    python tools/build_arabic_glosses.py msa=<path>/morphology.db egy=... glf=... lev=...

(The databases: https://github.com/CAMeL-Lab/camel-tools-data/releases, the morphology_db_calima-*
files. MSA and Egyptian are GPL v2, Gulf and Levantine CC BY 4.0, and so is what is taken from them.)
Writes docs/lexicon/ar-camel-meanings.json.gz (index name "mean-arc"), in the format of
build_meanings.py's files.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_meanings import key  # noqa: E402  (the same matching as the Wiktionary file)

OUT = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
DIALECT = {"msa": "", "egy": "Egyptian Arabic", "glf": "Gulf Arabic", "lev": "Levantine Arabic"}
LICENSE = {"msa": "GPL-2.0", "egy": "GPL-2.0", "glf": "CC-BY-4.0", "lev": "CC-BY-4.0"}
MAX_GLOSSES = 8
_STRIP_LEX = re.compile(r"[_-].*$")  # "كَتَب-u_1" -> "كَتَب"


def feats(text: str) -> dict[str, str]:
    out = {}
    for tok in text.strip().split(" "):
        k, _, v = tok.partition(":")
        if k:
            out[k] = v
    return out


def glosses(raw: str) -> list[str]:
    out = []
    for g in raw.split(";"):
        g = re.sub(r"\[CALIMA\]|\bTBA\b", "", g.replace("_", " ")).strip(" ,")  # ("TBA": not glossed yet)
        g = re.sub(r"\s+", " ", g)
        if g and g not in out:
            out.append(g)
    return out


def read(name: str, path: Path, words: dict, forms: dict, counts: dict) -> None:
    in_stems = False
    n = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("###"):
            in_stems = line.strip() == "###STEMS###"
            continue
        if not in_stems or not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        f = feats(parts[2])
        lemma = _STRIP_LEX.sub("", f.get("lex", ""))
        g = glosses(f.get("gloss", ""))
        if not lemma:
            continue
        k = key(lemma, "ar")
        stem = key(parts[0], "ar")
        if g:
            n += 1
            pos = f.get("pos", "")
            # CAMeL's fine tags (adv_interrog, pron_dem, part_neg, ...) as plain parts of speech, like Wiktionary's.
            pos = "name" if pos == "noun_prop" else {"part": "particle", "digit": "number", "punc": ""}.get(pos.split("_")[0], pos.split("_")[0])
            root = f.get("root", "")
            root = "" if "#" in root or not root else root.replace(".", " ")
            extra = f"{root}||{DIALECT[name]}".rstrip("|")
            groups = words.setdefault(k, [])
            same = next((grp for grp in groups if grp[0] == lemma and grp[1] == pos and grp[3] == extra), None)
            if same:
                same[2] = (same[2] + [x for x in g if x not in same[2]])[:MAX_GLOSSES]
            else:
                groups.append([lemma, pos, g[:MAX_GLOSSES], extra])
        if stem and stem != k:
            row = forms.setdefault(stem, [])
            if len(row) < 4 and all(r[0] != k for r in row):
                row.append([k, ""])
    counts[name] = n


def main(args: list[str]) -> None:
    words: dict[str, list] = {}
    forms: dict[str, list] = {}
    counts: dict[str, int] = {}
    used = []
    for arg in args:
        name, _, path = arg.partition("=")
        if name not in DIALECT:
            sys.exit(f"Unknown database {name!r}: use msa egy glf lev")
        read(name, Path(path), words, forms, counts)
        used.append(name)
    forms = {k: [r for r in v if r[0] in words] for k, v in forms.items() if k not in words}
    forms = {k: v for k, v in forms.items() if v}
    for groups in words.values():  # Standard Arabic first, then the dialects; names last
        groups.sort(key=lambda g: (g[1] == "name", bool(g[3].split("|")[2:3] and g[3].split("|")[2])))
    data = {"format": 1, "kind": "meanings", "lang": "ar", "source": "CAMeL Tools morphology databases (CAMeL Lab, NYU Abu Dhabi)",
            "license": " / ".join(sorted({LICENSE[n] for n in used})), "words": words, "forms": forms}
    packed = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), compresslevel=9, mtime=0)
    name = "ar-camel-meanings.json.gz"
    (OUT / name).write_bytes(packed)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["files"]["mean-arc"] = {
        "file": name, "bytes": len(packed), "sha256": hashlib.sha256(packed).hexdigest(),
        "title": "Arabic meanings (CAMeL glosses)", "db": ", ".join(f"calima-{n}" for n in used),
        "license": data["license"], "words": len(words), "forms": len(forms),
    }
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"glossed stems per database: {counts}; {len(words)} words, {len(forms)} spellings of stems; {len(packed) / 1e6:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1:])
