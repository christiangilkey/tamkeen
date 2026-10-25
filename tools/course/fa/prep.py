"""Turn a draft batch of Persian words into a batch for add_batch.py, checking it on the way.

    python tools/course/fa/prep.py tools/course/build/draft-fa-101.json   ->  tools/course/build/batch-fa-101.json

The draft has the same rows as a batch ([rank, word, pos, meaning, sentence, translation, form?]), but the
half space (zero-width non-joiner, as in می‌روم) may be written "|" so it can be seen: می|روم. This turns
"|" into the half space and Arabic letters into Persian ones (ي ى -> ی, ك -> ک), then checks that the ranks
rise after the last word in words.json, that the meaning starts with the romanisation in brackets, that
the sentence holds the word (or its form) and has one ⟦ ⟧ pair in its translation, and lists words that
begin with می or نمی without a half space, for a look by eye.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ZWNJ = "‌"
LETTERS = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک"})
# Words that begin with می but are not the verb prefix.
NOT_PREFIX = {"میز", "میوه", "میان", "میل", "میلیون", "میدان", "میهمان", "میراث", "میزان", "میانه", "میخ",
              "میش", "میمون", "مین", "میکروب", "میلی", "میز،", "میانگین"}


def fa(text: str) -> str:
    return re.sub(r" +", " ", text.replace("|", ZWNJ).translate(LETTERS)).strip()


def main() -> None:
    src = Path(sys.argv[1])
    out = src.with_name(src.name.replace("draft-", "batch-"))
    rows = json.loads(src.read_text(encoding="utf-8"))
    words = json.loads((HERE / "words.json").read_text(encoding="utf-8"))["words"]
    last = words[-1]["rank"] if words else 0
    seen = {w["word"] for w in words}
    problems, looks = [], []
    done = []
    for row in rows:
        rank, word, pos, meaning, sentence, translation, *form = row
        word, sentence, meaning = fa(word), fa(sentence), fa(meaning)
        form = [fa(f) for f in ([form[0]] if isinstance(form[0], str) else form[0])] if form and form[0] else []
        tag = f"{rank} {word}"
        if rank <= last:
            problems.append(f"{tag}: rank {rank} isn't after {last}")
        last = rank
        if word in seen:
            problems.append(f"{tag}: already in the course")
        seen.add(word)
        if not re.match(r"^\([a-zâ'\- ]+\) \S", meaning):
            problems.append(f"{tag}: meaning should start with its romanisation in brackets: {meaning}")
        if translation.count("⟦") != 1 or translation.count("⟧") != 1:
            problems.append(f"{tag}: one ⟦ ⟧ pair: {translation}")
        if not any(f in sentence for f in [word, *form]):
            problems.append(f"{tag}: the sentence doesn't hold {' / '.join([word, *form])}: {sentence}")
        n = len(sentence.split())
        if n > 12 or n < 2 or not re.search(r"[.!؟]$", sentence):
            problems.append(f"{tag}: {n} words, or no full stop: {sentence}")
        elif n > 8:
            looks.append(f"{tag}: {n} words: {sentence}")
        for tok in re.findall(r"\S+", sentence):
            t = tok.strip(".،!؟:«»")
            if re.match(r"^(?:ن?می)[^‌]", t) and t not in NOT_PREFIX:
                looks.append(f"{tag}: {t} (no half space after می?)")
        if re.search(r"[a-zA-Z0-9]", word + sentence):
            problems.append(f"{tag}: Latin letters or digits in the Persian")
        done.append([rank, word, pos, meaning, sentence, translation] + ([form if len(form) > 1 else form[0]] if form else []))
    for line in looks:
        print("look:", line)
    if problems:
        for line in problems:
            print("PROBLEM:", line)
        raise SystemExit(1)
    out.write_text(json.dumps(done, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(done)} rows -> {out}")


if __name__ == "__main__":
    for _s in (sys.stdout, sys.stderr):
        _s.reconfigure(encoding="utf-8", errors="replace")
    main()
