"""Build docs/lexicon/ja-jmdict-meanings.json.gz: Japanese words the Wiktionary meanings file lacks, from JMdict.

JMdict (the Electronic Dictionary Research and Development Group, EDRDG; https://www.edrdg.org/jmdict/j_jmdict.html),
licensed CC BY-SA 4.0 under the EDRDG licence, which allows commercial use with credit. It has about twice the Japanese
words of the English Wiktionary. Only the words docs/lexicon/ja-meanings.json.gz has no entry or form for are kept, kept
small (the owner, 2026-11-17: "make them as small as you can"): the first MAX_SENSES senses, each its first glosses up
to MAX_GLOSS characters, no archaic or obsolete senses; the main kanji spelling and any other JMdict marks as common
(not every rare variant); a kana spelling only where the word is usually written in kana or has no kanji (never a
single kana, and a two-kana one only for a word JMdict marks as common); nothing without letters (〃).

It is the second Japanese meanings file, asked when Wiktionary has nothing (app/lexicon.py MEANINGS, web/js/meanings.js),
like Arabic's CAMeL glosses. Same shape as a meanings file (tools/build_meanings.py): {"words": {key: [[shown, pos,
[gloss, ...], "|reading"]]}, "forms": {}}; the key is the spelling as written (meaningdata.js matchKey: Japanese as is).

    python tools/build_jmdict.py <JMdict_e.gz>        (http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz, about 10 MB)
    node tools/trim_jmdict.mjs                        (then: keeps the words Tamkeen's Japanese splitter can give as one
                                                       word, and the ones JMdict marks as common; about a third)
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "lexicon"
NAME = "ja-jmdict-meanings.json.gz"
MAX_SENSES = 2
MAX_GLOSSES = 2     # glosses of one sense joined into one meaning
MAX_GLOSS = 50      # characters per meaning
OLD = {"archaic", "obsolete term", "rare term"}
KANA = re.compile("^[぀-ヿー]+$")


def pos_of(texts: list[str]) -> str:
    """JMdict's part-of-speech words (as its entities expand) as the meanings files' short ones."""
    t = " ".join(texts).lower()
    for word, short in (("expression", "phrase"), ("verb", "verb"), ("adjective", "adj"), ("adverb", "adv"), ("noun", "noun"),
                        ("interjection", "intj"), ("pronoun", "pron"), ("conjunction", "conj"), ("particle", "particle"),
                        ("counter", "counter"), ("numeric", "num"), ("prefix", "prefix"), ("suffix", "suffix")):
        if word in t:
            return short
    return ""


def build(source: Path) -> None:
    wik = json.loads(gzip.decompress((OUT / "ja-meanings.json.gz").read_bytes()))
    # (a word Wiktionary has only as a name counts as missing: かける is a male given name there, and the verb is only
    # under its kanji, 掛ける, so the word as written in kana found nothing better)
    real = lambda k: any(g[1] != "name" for g in wik["words"].get(k, []))
    # (and a form that leads only to names: かける is listed as a spelling of 翔, the name Kakeru)
    have = {k for k in wik["words"] if real(k)} | {k for k, rows in wik["forms"].items() if any(real(r[0]) for r in rows)}
    names_only = ({k for k, groups in wik["words"].items() if groups and not real(k)}
                  | {k for k in wik["forms"] if k not in have})
    words: dict[str, list] = {}
    commons: list[str] = []  # (for tools/trim_jmdict.mjs, which takes this list out again)
    entries = 0
    with gzip.open(source, "rb") as f:
        for _ev, el in ET.iterparse(f, events=("end",)):
            if el.tag != "entry":
                continue
            entries += 1
            k_eles = el.findall("k_ele")
            kebs = [k.findtext("keb") for i, k in enumerate(k_eles) if i == 0 or k.find("ke_pri") is not None]
            kanji_common = any(k.find("ke_pri") is not None for k in k_eles)
            rebs = [(r.findtext("reb"), r.find("re_pri") is not None) for r in el.findall("r_ele")]
            senses, pos, usually_kana = [], "", False
            last_pos: list[str] = []
            for sn in el.findall("sense"):
                ps = [p.text or "" for p in sn.findall("pos")] or last_pos
                last_pos = ps
                misc = {m.text or "" for m in sn.findall("misc")}
                if any("kana alone" in m for m in misc):
                    usually_kana = True
                if misc & OLD:
                    continue
                gl = [g.text for g in sn.findall("gloss") if g.text][:MAX_GLOSSES]
                if not gl:
                    continue
                text = "; ".join(gl)
                if len(text) > MAX_GLOSS:
                    text = text[:MAX_GLOSS].rsplit(" ", 1)[0].rstrip(";,") + "…"
                if not pos:
                    pos = pos_of(ps)
                senses.append(text)
                if len(senses) >= MAX_SENSES:
                    break
            el.clear()
            if not senses:
                continue
            reading = rebs[0][0] if rebs else ""
            common = kanji_common or any(c for _r, c in rebs)
            keys = [k for k in kebs if k]
            kana_ok = usually_kana or not keys
            for reb, common_reb in rebs:
                if not reb:
                    continue
                if kana_ok:
                    if len(reb) >= 3 or (len(reb) == 2 and (common_reb or kanji_common)):
                        keys.append(reb)
                elif reb in names_only and (common_reb or kanji_common):
                    keys.append(reb)  # (a common word's kana spelling, which Wiktionary has only as a name)
            for k in keys:
                if k in have or k in words or not re.search(r"[\w]", k):
                    continue
                words[k] = [[k, pos, senses, "" if k == reading else f"|{reading}"]]
                if common:
                    commons.append(k)
    data = {"format": 1, "kind": "meanings", "lang": "ja", "source": "JMdict (EDRDG)", "license": "CC-BY-SA-4.0 (EDRDG licence)",
            "words": words, "forms": {}, "common": commons}
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    (OUT / NAME).write_bytes(packed)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["files"]["mean-jaj"] = {"file": NAME, "bytes": len(packed), "sha256": hashlib.sha256(packed).hexdigest(),
                                  "title": "Japanese meanings (JMdict)", "db": "JMdict (EDRDG)",
                                  "license": "CC-BY-SA-4.0", "words": len(words), "forms": 0}
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"  {entries} JMdict entries read; {len(words)} words Wiktionary lacks; {len(packed) / 1e6:.2f} MB", flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(Path(sys.argv[1]))
