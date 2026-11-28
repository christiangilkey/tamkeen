"""Frequency words audit, step 1: count the written forms of a text, the way forms.py counts wordfreq's (the same
tidying: wordfreq.tokenize, small letters, Arabic without vowel marks), so audit.mjs can group them into dictionary
words with the language's own ranking script and compare them with the course's lists.

    python tools/course/audit_forms.py es ted path/to/es-ted.txt         ->  tools/course/build/audit/es-ted-forms.json
    python tools/course/audit_forms.py ar library                          ->  the Arabic transcripts in this computer's
                                                                               Tamkeen library (read only; never committed)
    python tools/course/audit_forms.py es leipzig | yodas | tatoeba       ->  the downloaded audit sources in build/
                                                                               (leipzig: CHECK ONLY, never shipped)

[[form, count], ...], commonest first. The texts are read as data, from tools/course/build/audit/ (not committed).
Needs wordfreq 3.1.1 (Japanese and Chinese need its MeCab / jieba extras to cut text into words).
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import wordfreq

HERE = Path(__file__).resolve().parent
OUT = HERE / "build" / "audit"


def library_text(lang: str) -> list[str]:
    """The transcripts in this computer's Tamkeen library in `lang` (podcasts, videos): real speech, read only."""
    sys.path.insert(0, str(HERE.parent.parent))
    try:
        from app import paths  # noqa: E402
        db = paths.db_path()
    except ImportError:  # (a Python without the app's packages: the library's usual place on Windows, or APS_DB)
        db = Path(os.environ.get("APS_DB") or Path(os.environ.get("APPDATA", "")) / "ArabicPodcastStudio" / "library.db")
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    rows = con.execute("SELECT s.text FROM segments s JOIN episodes e ON e.id = s.episode_id JOIN feeds f ON f.id = e.feed_id "
                       "WHERE COALESCE(e.language, f.language) = ?", (lang,))
    return [r[0] for r in rows if r[0]]


BUILD = HERE / "build"


def words_of(text: str, lang: str) -> list[str]:
    """A text cut into words, tidied as forms.py's are: wordfreq's own cutting (Japanese with MeCab, Chinese with
    jieba); Thai with PyThaiNLP (wordfreq has no Thai); Korean at its spaces (wordfreq would need a Korean MeCab
    dictionary; the Korean ranking reads each spaced word with the app's own analyzer)."""
    if lang == "th":
        from pythainlp.tokenize import word_tokenize
        return [w for w in word_tokenize(text, engine="newmm") if w.strip()]
    if lang == "ko":
        return [w.lower() for w in re.findall(r"[^\W\d_]+", unicodedata.normalize("NFC", text))]
    if lang == "zh":  # the lists are in simplified characters; texts in traditional ones are counted in simplified
        from wordfreq.chinese import simplify_chinese
        return [simplify_chinese(w) for w in wordfreq.tokenize(text, lang)]
    return wordfreq.tokenize(text, lang)


def simplify(word: str) -> str:
    from wordfreq.chinese import simplify_chinese
    return simplify_chinese(unicodedata.normalize("NFKC", word).strip())


def source_lines(lang: str, name: str) -> list[str]:
    if name == "library":
        return library_text(lang)
    if name == "yodas":  # caption text: "<clip id> <text>" per line
        return [line.split(" ", 1)[1] for f in sorted((BUILD / "yodas" / lang).glob("*.txt"))
                for line in f.read_text(encoding="utf-8", errors="replace").splitlines() if " " in line]
    if name == "tatoeba":  # "<id> <tab> <language> <tab> <sentence>"
        return [line.split("\t")[2] for line in (BUILD / "tatoeba" / lang / "sentences.tsv").read_text(encoding="utf-8").splitlines()
                if line.count("\t") >= 2]
    return Path(sys.argv[3]).read_text(encoding="utf-8", errors="replace").splitlines()


def main() -> None:
    lang, name = sys.argv[1], sys.argv[2]
    counts: Counter[str] = Counter()
    if name == "leipzig":  # its own word counts: "<id> <tab> <word> <tab> <count>" (CHECK ONLY: never shipped)
        for line in (BUILD / "leipzig" / lang / "words.txt").read_text(encoding="utf-8", errors="replace").splitlines():
            parts = line.split("\t")
            if len(parts) < 3 or not parts[2].strip().isdigit():
                continue
            n = int(parts[2])
            pieces = [unicodedata.normalize("NFKC", parts[1]).strip()] if lang == "ja" else [simplify(parts[1])] if lang == "zh" else words_of(parts[1], lang)  # (Thai: its entries are runs of
            # unspaced text, up to 500 letters long, so they are cut into words like everything else)
            for w in pieces:
                if w:
                    counts[w] += n
    else:
        for line in source_lines(lang, name):
            counts.update(words_of(line, lang))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{lang}-{name}-forms.json"
    rows = [[w, n] for w, n in counts.most_common() if any(ch.isalpha() for ch in w)]
    out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"{sum(n for _, n in rows)} running words, {len(rows)} forms -> {out}")


if __name__ == "__main__":
    main()
