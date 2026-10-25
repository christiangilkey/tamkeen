"""How the voice should say a Japanese course word when it is said alone, where the spelling doesn't tell it:
particles said differently from how they are spelt (は is said わ), and kanji with several readings (方 is
ほう here, not かた). Writes `say` (kana) into tools/course/ja/words.json for those words; run it after
add_batch.py.

    python tools/course/ja/say.py

The sentence needs no help: the voice reads a word right in context. build_course.py doesn't use `say` yet
(a change to the shared builder: voice `say` for the word part when there is one).
"""

from __future__ import annotations

import json
from pathlib import Path

SAY = {
    # particles
    "は": "わ",
    "を": "お",
    "へ": "え",
}


def main() -> None:
    path = Path(__file__).resolve().parent / "words.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    n = 0
    for w in data["words"]:
        say = SAY.get(w["word"])
        if say:
            w["say"] = say
            n += 1
        else:
            w.pop("say", None)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{n} words have a reading to say")


if __name__ == "__main__":
    main()
