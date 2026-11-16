"""Pack the basics courses' audio again, one file per unit (tools/course/packs.py says why and how).

    python tools/course/pack_audio.py              # every course in docs/course
    python tools/course/pack_audio.py ar ar-lev    # only these
    python tools/course/pack_audio.py --dir tools/course/build/preview ar

Makes no audio: it only puts the clips already made into packs, rewrites each course.json with where each
clip is, and updates docs/course/index.json. build_course.py does the same at the end of every build, so
this is for packing courses built before the packs, or after KEEP_SINGLE_FILES in packs.py changed (False
removes the old one-file-per-word audio).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import packs  # noqa: E402

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("ids", nargs="*", help="the courses (default: every one in the index)")
    ap.add_argument("--dir", default=str(HERE.parent.parent / "docs" / "course"))
    args = ap.parse_args()
    out = Path(args.dir)
    index_path = out / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    ids = args.ids or sorted(index["courses"])
    singles = sum(1 for _ in out.glob("*/audio/*.ogg"))
    for cid in ids:
        folder = out / cid
        course = packs.repack(folder, keep_singles=packs.KEEP_SINGLE_FILES)
        if course is None:
            print(f"{cid}: no audio")
            continue
        packs.index_entry_update(index["courses"][cid], folder, course)
        n = len({w["clip"]["pack"] for w in course["words"] if w.get("clip")})
        print(f"{cid}: {n} packs, {index['courses'][cid]['audio_bytes'] / 1e6:.1f} MB")
    index_path.write_bytes(json.dumps(index, ensure_ascii=False, indent=1).encode("utf-8"))  # (LF, as committed)
    after = sum(1 for _ in out.glob("*/audio/*.ogg"))
    print(f"Single audio files: {singles} before, {after} now ({'kept for older app versions' if packs.KEEP_SINGLE_FILES else 'removed'}).")


if __name__ == "__main__":
    main()
