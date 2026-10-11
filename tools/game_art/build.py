"""Draw the creature game's pixel art (cute cyberpunk, soft-neon palette).

    .venv/Scripts/python tools/game_art/build.py              (write into web/game-art/)
    .venv/Scripts/python tools/game_art/build.py --out DIR    (write somewhere else, to look first)

Every Phase 1 file is checked against the list in web/js/game/data.js: same name, same size.
"""

from __future__ import annotations

import importlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from px import OUT, ROOT  # noqa: E402

MODULES = ["creature", "world", "phase2", "phase3", "extra"]


def main() -> None:
    out = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else OUT
    sprites = {}
    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else MODULES
    for name in only:
        if (Path(__file__).parent / f"{name}.py").exists():
            sprites.update(importlib.import_module(name).build())
    script = "import('./web/js/game/data.js').then((m) => console.log(JSON.stringify(m.artFiles())))"
    needed = json.loads(subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    problems = []
    for a in needed:
        s = sprites.get(a["file"])
        if s is None:
            problems.append(f"missing: {a['file']}")
        elif (s.w, s.h) != (a["w"], a["h"]):
            problems.append(f"wrong size: {a['file']} is {s.w}x{s.h}, should be {a['w']}x{a['h']}")
    for file, s in sprites.items():
        path = out / file
        path.parent.mkdir(parents=True, exist_ok=True)
        s.image().save(path)
    print(f"{len(sprites)} files written to {out}")
    print("\n".join(problems) if problems else f"all {len(needed)} Phase 1 files present at the right size")


if __name__ == "__main__":
    main()
