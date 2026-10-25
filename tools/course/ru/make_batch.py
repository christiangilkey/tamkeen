"""Turn a draft of Russian course words into a batch for tools/course/add_batch.py, checking it on the way.

    python tools/course/ru/make_batch.py tools/course/build/draft-ru-101.txt   ->  tools/course/build/batch-ru-101.json

A draft has one word per line (lines starting with # are notes):
    rank | word | pos | meaning | sentence | translation [| form]
- rank: the word's place in tools/course/build/ru-ranked.json (tools/course/ru/rank.py);
- meaning: short English; the word with its stress is added in brackets, "at home (до́ма)", from the
  OpenRussian data, unless the meaning already ends with it (words of one vowel, and words with ё, which
  shows the stress itself, get none); a perfective verb's bracket says so: "(сказа́ть, pf.)";
- form: only when the helper can't find the word in the sentence by itself. It looks for a word of the
  sentence that is a form of the same dictionary word (говорит for говорить) and writes it as `form`.
It stops on anything wrong: a rank out of order or already used, a word twice, a sentence too long or not
ending like one, a translation without exactly one ⟦ ⟧, a stress it can't tell.
Run it with a Python that has wordfreq (for the grouping in rank.py).
"""

from __future__ import annotations

import gzip
import json
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from rank import BUILD, grouper  # noqa: E402

ROOT = HERE.parent.parent.parent
VOWELS = "аеёиоуыэюя"
ACUTE = "́"
WORD = re.compile(r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*")


def fold(s: str) -> str:
    return unicodedata.normalize("NFC", s).lower()


def plain(s: str) -> str:
    """Matching form: lower case, no stress mark, ё as е."""
    return unicodedata.normalize("NFC", unicodedata.normalize("NFD", s).replace(ACUTE, "")).lower().replace("ё", "е")


def main(draft_path: str) -> None:
    draft = Path(draft_path)
    ranked = json.loads((BUILD / "ru-ranked.json").read_text(encoding="utf-8"))
    table = json.loads(gzip.open(ROOT / "docs" / "lexicon" / "ru-lemmas.json.gz", "rt", encoding="utf-8").read())
    _, owner, _ = grouper(str(BUILD / "openrussian"))
    course = json.loads((HERE / "words.json").read_text(encoding="utf-8"))["words"]
    seen = {f"{fold(w['word'])}|{w['pos']}": w["n"] for w in course}
    used_ranks = {w["rank"] for w in course}
    last = course[-1]["rank"] if course else 0
    out, problems, notes = [], [], []

    def stress_of(word: str, row: dict) -> str | None:
        letters = plain(word)
        if sum(ch in VOWELS for ch in letters) < 2 or "ё" in fold(word):
            return ""
        if plain(row["lemma"]) == letters:
            marked = {a for a in row["stress"] if ACUTE in a}
            if len(marked) == 1:
                return next(iter(marked)).lower() if word.islower() else next(iter(marked))
            if len(marked) > 1:
                return None
        n = table["stress"].get(letters)
        if n is None or n < 0 or n >= len(word):
            return None
        return word[: n + 1] + ACUTE + word[n + 1:]

    for i, line in enumerate(draft.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = [p.strip() for p in line.split(" | ")]
        if len(parts) not in (6, 7):
            problems.append(f"line {i}: {len(parts)} fields: {line}")
            continue
        rank_s, word, pos, meaning, sentence, translation, *given = parts
        rank = int(rank_s)
        row = ranked[rank - 1]
        key = tuple(row["key"])
        where = f"{rank} {word}"
        if rank <= last or rank in used_ranks:
            problems.append(f"{where}: rank {rank} isn't after {last}")
        last = rank
        if plain(word) != plain(row["lemma"]):
            notes.append(f"{where}: the ranked list has {row['lemma']} ({row['pos']}) at {rank}")
        if f"{fold(word)}|{pos}" in seen:
            problems.append(f"{where}: already word {seen[f'{fold(word)}|{pos}']}")
        seen[f"{fold(word)}|{pos}"] = rank
        if pos not in {"noun", "verb", "adj", "adv", "prep", "conj", "pron", "part", "num", "interj"}:
            problems.append(f"{where}: pos {pos}")
        # The word with its stress, in brackets after the meaning ("pf." for a perfective verb), unless the
        # meaning already ends with it (written by hand: за́мок / замо́к).
        last_bracket = re.search(r"\(([^()]*)\)\s*$", meaning)
        if not (last_bracket and plain(re.split(r"[,; ]", last_bracket.group(1).strip())[0]) == plain(word)):
            s = stress_of(word, row)
            perfective = pos == "verb" and row["aspect"] == "perfective" and plain(word) == plain(row["lemma"])
            if s is None:
                problems.append(f"{where}: can't tell the stress ({'/'.join(row['stress'])}); write it in the meaning")
            elif s or perfective:
                meaning = f"{meaning} ({s or word}{', pf.' if perfective else ''})"
        # Every other Russian word in the meaning shows its stress too (у меня́ есть).
        for t in re.findall(r"[А-Яа-яЁё́-]+", unicodedata.normalize("NFC", meaning)):
            if (sum(ch in VOWELS for ch in plain(t)) >= 2 and ACUTE not in t and "ё" not in fold(t)
                    and plain(t) != plain(word)):
                problems.append(f"{where}: {t} in the meaning has no stress mark")
        # The sentence.
        tokens = sentence.split()
        if not 2 <= len(tokens) <= 12:
            problems.append(f"{where}: {len(tokens)} words in the sentence")
        if not re.search(r"[.!?…][\"”»)]?$", sentence):
            problems.append(f"{where}: the sentence doesn't end like one")
        if ACUTE in sentence:
            problems.append(f"{where}: stress marks in the sentence")
        if not re.fullmatch(r"[^⟦⟧]*⟦[^⟦⟧]+⟧[^⟦⟧]*", translation):
            problems.append(f"{where}: the translation needs one ⟦ ⟧: {translation}")
        words_in = WORD.findall(sentence)
        form = ""
        if any(fold(t) == fold(word) for t in words_in):
            form = ""
        else:
            hits = [t for t in words_in if owner(t) == key or plain(t) == plain(word)]
            if given and given[0]:
                form = given[0]
                if fold(form) not in fold(sentence):
                    problems.append(f"{where}: its form {form} isn't in the sentence")
            elif hits:
                form = hits[0]
            else:
                problems.append(f"{where}: no form of the word in “{sentence}” (give its form)")
        out.append([rank, word, pos, meaning, sentence, translation] + ([form] if form else []))

    for n in notes:
        print("note:", n)
    if problems:
        print("\n".join(problems))
        raise SystemExit(f"{len(problems)} problems; nothing written")
    target = BUILD / draft.name.replace("draft-", "batch-").replace(".txt", ".json")
    target.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(out)} words -> {target}")


if __name__ == "__main__":
    main(sys.argv[1])
