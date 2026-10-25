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
    # a kanji alone that can be read more than one way: the reading the course means
    "人": "ひと",
    "一": "いち",
    "日": "ひ",
    "年": "とし",
    "月": "つき",
    "中": "なか",
    "何": "なに",
    "時": "とき",
    "四": "よん",
    "七": "なな",
    "九": "きゅう",
    "十": "じゅう",
    "万": "まん",
    "今": "いま",
    "方": "ほう",
    "前": "まえ",
    "後": "あと",
    "気": "き",
    "分": "ふん",
    "家": "いえ",
    "私": "わたし",
    "行く": "いく",
    "入る": "はいる",
    "上": "うえ",
    "下": "した",
    "外": "そと",
    "子": "こ",
    "間": "あいだ",
    "生": "なま",
    "他": "ほか",
    "先": "さき",
    "用": "よう",
    "数": "かず",
    "歳": "さい",
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
