"""Build the live-battle effects.

Every frame is designed in this folder (el_<element>.py for the six elements, shared.py for the rest, the
drawing kit in fxkit.py). The build places those pixels in Aseprite, saves one layered-free .aseprite source
per effect here (frames, timings and palette included), and exports the strip PNGs from Aseprite into
web/game-art/battle/fx/, then checks each export pixel for pixel against the design.

    .venv/Scripts/python game/art-src/battle-fx/build_fx.py           build everything (needs Aseprite)
    .venv/Scripts/python game/art-src/battle-fx/build_fx.py check     draw and check sizes and edges only
    .venv/Scripts/python game/art-src/battle-fx/build_fx.py preview   preview sheets + animated GIF of the exports

Re-running the build overwrites the .aseprite files: if one is edited by hand in Aseprite, export its strip from
Aseprite instead (File > Export Sprite Sheet, horizontal strip, no padding).
"""
from __future__ import annotations

import importlib
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
ROOT = HERE.parents[2]
OUT = ROOT / "web" / "game-art" / "battle" / "fx"
ASEPRITE = "C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"

ELEMENTS = ["ember", "tide", "grove", "spark", "stone", "dusk"]
# kind: (frame size, frame count, ms per frame, loops?)
KINDS = {
    "projectile": (16, 4, [70] * 4, True),
    "impact": (32, 6, [60, 90, 70, 70, 90, 110], False),
    "burst": (64, 8, [90, 60, 80, 110, 80, 80, 100, 120], False),
    "beam": (16, 4, [60] * 4, True),
    "trail": (8, 4, [80] * 4, False),
}
SHARED = {
    "guard": (48, 6, [50, 60, 90, 120, 80, 90], False),
    "heal": (48, 6, [70, 80, 90, 100, 100, 110], False),
    "power": (48, 6, [60, 70, 80, 100, 90, 100], False),
    "charge": (48, 4, [80] * 4, True),
    "delay": (32, 4, [120] * 4, True),
    "interrupt": (32, 4, [50, 90, 70, 90], False),
    "terrain": (32, 6, [80, 80, 80, 60, 90, 110], False),
    "faint": (48, 6, [70, 80, 110, 100, 100, 120], False),
    "dust": (16, 4, [60, 70, 80, 90], False),
    "miss": (32, 4, [70, 90, 90, 110], False),
}
STATUS = {"burn": "ember", "wet": "tide", "spark": "spark", "leaf": "grove", "rock": "stone", "dark": "dusk"}
STATUS_SPEC = (8, 4, [120] * 4, True)


def effects():
    """[(name, frames, ms per frame, loops)] in a fixed order."""
    out = []
    for el in ELEMENTS:
        mod = importlib.import_module(f"el_{el}")
        for kind, (size, n, ms, loops) in KINDS.items():
            out.append((f"{el}_{kind}", getattr(mod, kind)(), size, n, ms, loops))
    sh = importlib.import_module("shared")
    for name, (size, n, ms, loops) in SHARED.items():
        out.append((name, getattr(sh, name)(), size, n, ms, loops))
    for st, el in STATUS.items():
        size, n, ms, loops = STATUS_SPEC
        out.append((f"status_{st}", importlib.import_module(f"el_{el}").status(), size, n, ms, loops))
    return out


def check(items) -> list[str]:
    problems = []
    for name, frames, size, n, ms, loops in items:
        if len(frames) != n:
            problems.append(f"{name}: {len(frames)} frames, expected {n}")
        for i, fr in enumerate(frames):
            if (fr.w, fr.h) != (size, size):
                problems.append(f"{name} frame {i}: {fr.w}x{fr.h}, expected {size}x{size}")
            if not fr.mask().any() and not name.endswith(("faint", "heal", "power")):
                problems.append(f"{name} frame {i}: empty")
            if not name.endswith("beam"):
                m = fr.mask()
                border = int(m[0].sum() + m[-1].sum() + m[:, 0].sum() + m[:, -1].sum())
                if border > 2:
                    problems.append(f"{name} frame {i}: {border} pixels touch the frame edge")
        if name.endswith("beam"):  # a beam must tile: its right edge must lead into its left edge
            for i, fr in enumerate(frames):
                a = fr.a
                left, right = a[:, 0, 3] > 0, a[:, -1, 3] > 0
                if (left ^ right).sum() > 4:
                    problems.append(f"{name} frame {i}: left and right edges differ ({int((left ^ right).sum())} rows)")
    return problems


ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-/:;<=>?@^_{|}~"


def lua_for(name, frames, size, ms) -> str:
    cols = []
    seen = {}
    rows = []
    for fr in frames:
        s = []
        for y in range(fr.h):
            for x in range(fr.w):
                px = fr.a[y, x]
                if px[3] == 0:
                    s.append(".")
                    continue
                key = (int(px[0]), int(px[1]), int(px[2]))
                if key not in seen:
                    seen[key] = len(cols)
                    cols.append(key)
                s.append(ALPHA[seen[key]])
        rows.append("".join(s))
    if len(cols) > len(ALPHA):
        raise SystemExit(f"{name}: {len(cols)} colours, more than the encoder handles")
    src = (HERE / f"{name}.aseprite").as_posix()
    png = (OUT / f"{name}.png").as_posix()
    n = len(frames)
    pal = ", ".join(f"Color{{r={r},g={g},b={b},a=255}}" for r, g, b in cols)
    data = ", ".join(f'"{r}"' for r in rows)
    durs = ", ".join(str(m / 1000) for m in ms)
    return f"""
do
  local W, N = {size}, {n}
  local pal = {{ {pal} }}
  local data = {{ {data} }}
  local durs = {{ {durs} }}
  local spr = Sprite(W, W, ColorMode.RGB)
  local P = Palette(#pal + 1)
  P:setColor(0, Color{{r=0,g=0,b=0,a=0}})
  for i = 1, #pal do P:setColor(i, pal[i]) end
  spr:setPalette(P)
  local layer = spr.layers[1]
  layer.name = "{name}"
  for f = 2, N do spr:newEmptyFrame() end
  for f = 1, N do
    local cel = layer:cel(f) or spr:newCel(layer, f)
    local img = cel.image
    local s = data[f]
    for i = 1, #s do
      local k = LOOKUP[s:byte(i)]
      if k then img:drawPixel((i - 1) % W, (i - 1) // W, pal[k]) end
    end
    spr.frames[f].duration = durs[f]
  end
  local tag = spr:newTag(1, N)
  tag.name = "{name}"
  spr:saveAs("{src}")
  local strip = Image(W * N, W, ColorMode.RGB)
  for f = 1, N do
    local cel = layer:cel(f)
    if cel then strip:drawImage(cel.image, Point((f - 1) * W + cel.position.x, cel.position.y)) end
  end
  strip:saveAs("{png}")
  spr:close()
end
"""


def build():
    items = effects()
    problems = check(items)
    for p in problems:
        print("CHECK:", p)
    OUT.mkdir(parents=True, exist_ok=True)
    head = "local A = " + '"' + ALPHA + '"' + "\nLOOKUP = {}\nfor i = 1, #A do LOOKUP[A:byte(i)] = i end\n"
    script = head + "".join(lua_for(name, frames, size, ms) for name, frames, size, n, ms, loops in items)
    fd, path = tempfile.mkstemp(suffix=".lua", prefix="battle_fx_")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(script)
    try:
        subprocess.run([ASEPRITE, "-b", "--script", path], check=True)
    finally:
        os.remove(path)
    # check every export against the design, pixel for pixel
    bad = 0
    for name, frames, size, n, ms, loops in items:
        want = np.concatenate([fr.a for fr in frames], axis=1)
        got = np.array(Image.open(OUT / f"{name}.png").convert("RGBA"))
        if got.shape != want.shape:
            print(f"EXPORT {name}: size {got.shape[1]}x{got.shape[0]}, expected {want.shape[1]}x{want.shape[0]}")
            bad += 1
            continue
        mw, mg = want[:, :, 3] > 0, got[:, :, 3] > 0
        diff = int((mw != mg).sum() + (np.any(want[:, :, :3] != got[:, :, :3], axis=2) & mw & mg).sum())
        if diff:
            print(f"EXPORT {name}: {diff} pixels differ from the design")
            bad += 1
    print(f"{len(items)} effects built: .aseprite sources in {HERE.relative_to(ROOT)}, strips in {OUT.relative_to(ROOT)}"
          + ("" if not bad else f"; {bad} exports differ"))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "check":
        items = effects()
        probs = check(items)
        print("\n".join(probs) or f"{len(items)} effects: sizes, frame counts and edges OK")
    elif cmd == "preview":
        import make_preview
        make_preview.main()
    else:
        build()
