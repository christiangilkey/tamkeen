"""Append a batch of written words to a course: tools/course/build/batch-<lang>-<first>.json holds
[[rank, word, pos, meaning, sentence, translation], ...] in order; they get the next numbers.

    python tools/course/add_batch.py ar tools/course/build/batch-ar-101.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    lang, batch = sys.argv[1], Path(sys.argv[2])
    path = HERE / lang / "words.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    words = data["words"]
    for rank, word, pos, meaning, sentence, translation in json.loads(batch.read_text(encoding="utf-8")):
        words.append({"n": len(words) + 1, "rank": rank, "word": word, "pos": pos, "meaning": meaning,
                      "sentence": sentence, "translation": translation})
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(words)} words in {path}")


if __name__ == "__main__":
    main()
