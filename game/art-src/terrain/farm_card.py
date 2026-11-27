"""The farm question card's little scene (the owner: "Planting a seed should ask for a vocab word, watering a vocab word,
each one should have different animations too"): the tools and effects drawn over the plot, in the village props'
style (props.py palettes, light from the top left, a dark outline).

One strip of 32 x 32 frames, web/game-art/farm/card.png. In every frame the plot's 16 x 16 soil sits at (8, 16), so
the card draws a frame at the plot's top left minus (8, 16). Frames:
  0 1     the trowel up, then down in the soil, flecks of earth flying (planting: digging the hole)
  2 3     the seed dropping in, then in the hole
  4 5     earth patted down: two puffs
  6 7     the watering can level, then tipped over the plot
  8 9 10  the water falling from its spout
  11 12   a little grey cloud drizzling (a wrong answer: still a little water)
  13      a sparkle

    .venv/Scripts/python game/art-src/terrain/farm_card.py [--aseprite]
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import hx  # noqa: E402
from props import Sprite, blob, finish, line  # noqa: E402
from props_more import IRON, PLANK  # noqa: E402
from village_props import BLUE, CANVAS, WATER, YELLOW, post, rect  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "web/game-art/farm/card.png"
ASEPRITE = "C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
ASE = Path(__file__).resolve().parent / "aseprite"
EARTH = [hx("#3e2414"), hx("#56341c"), hx("#6e4626"), hx("#885a32")]
SEED = [hx("#5e3a12"), hx("#a8761a"), hx("#e8c040")]
GREY = [hx("#5a5a6e"), hx("#7e7e92"), hx("#a6a6b8"), hx("#cfcfdc")]


def trowel(down: bool):
    sp = Sprite(32, 32, f"trowel_{down}")
    oy = 6 if down else 0
    for i in range(6):  # the handle, slanting up to the right
        post(sp, 22 + i // 2, 2 + oy + i, 2 + oy + i, PLANK, 1)
    line(sp, [(21, 9 + oy), (18, 15 + oy)], IRON[6], width=2, part=2)  # the blade
    line(sp, [(19, 10 + oy), (17, 15 + oy)], IRON[4], part=2)
    if down:
        for (x, y, c) in ((12, 15, 2), (14, 13, 1), (23, 14, 3), (25, 12, 2), (11, 12, 3)):
            sp.set(x, y, EARTH[c], 3)
    return finish(sp)


def seed(at: int):
    sp = Sprite(32, 32, f"seed_{at}")
    y = 12 if at == 0 else 22
    blob(sp, 16, y, 1.6, 2.2, SEED, part=1)
    if at == 1:
        for x in range(13, 20):  # the hole's dark lip round it
            sp.set(x, 25, EARTH[0], 2)
    return finish(sp)


def puff(big: bool):
    sp = Sprite(32, 32, f"puff_{big}")
    r = 3.2 if big else 2.2
    for (cx, cy) in ((11, 22), (21, 22), (16, 19)):
        blob(sp, cx, cy, r, r * 0.7, EARTH[1:] + [hx("#a27448")], part=1)
    return finish(sp)


def can(tipped: bool):
    sp = Sprite(32, 32, f"can_{tipped}")
    if not tipped:
        blob(sp, 8, 9, 5, 4, BLUE, part=1)
        line(sp, [(12, 8), (17, 5)], BLUE[4], width=2, part=2)  # the spout
        rect(sp, 17, 3, 18, 5, BLUE[6], 2)
        line(sp, [(4, 4), (8, 1), (11, 4)], BLUE[2], part=3)  # the handle
    else:
        blob(sp, 7, 7, 5, 4, BLUE, part=1)
        line(sp, [(11, 8), (15, 12)], BLUE[4], width=2, part=2)
        rect(sp, 15, 12, 17, 13, BLUE[6], 2)
        line(sp, [(3, 5), (5, 1), (9, 2)], BLUE[2], part=3)
    return finish(sp)


def drops(phase: int):
    sp = Sprite(32, 32, f"drops_{phase}")
    for k, x in enumerate((15, 17, 16, 14, 18)):
        y = 14 + ((phase * 3 + k * 4) % 12)
        sp.set(x, y, WATER[6], 1)
        sp.set(x, y + 1, WATER[4], 1)
    if phase == 2:
        for (x, y) in ((11, 27), (21, 27), (13, 29), (19, 29)):  # a splash on the soil
            sp.set(x, y, WATER[7], 2)
    return finish(sp)


def cloud(phase: int):
    sp = Sprite(32, 32, f"cloud_{phase}")
    for (cx, cy, r) in ((12, 5, 3.5), (17, 4, 4), (21, 6, 3)):
        blob(sp, cx, cy, r, r * 0.75, GREY, part=1)
    for k, x in enumerate((12, 16, 20)):
        y = 10 + ((phase * 5 + k * 3) % 10)
        sp.set(x, y, WATER[5], 2)
    return finish(sp)


def sparkle():
    sp = Sprite(32, 32, "sparkle")
    for (cx, cy) in ((10, 12), (22, 9), (17, 4)):
        for d in (-1, 1):
            sp.set(cx + d, cy, YELLOW[6], 1)
            sp.set(cx, cy + d, YELLOW[6], 1)
        sp.set(cx, cy, CANVAS[6], 1)
    return finish(sp)


FRAMES = [lambda: trowel(False), lambda: trowel(True), lambda: seed(0), lambda: seed(1), lambda: puff(False), lambda: puff(True),
          lambda: can(False), lambda: can(True), lambda: drops(0), lambda: drops(1), lambda: drops(2), lambda: cloud(0),
          lambda: cloud(1), sparkle]


def build(aseprite=False):
    frames = []
    for f in FRAMES:
        arr = f()
        arr = arr.copy()
        arr[:, :, 3] = np.where(arr[:, :, 3] > 0, arr[:, :, 3], 0)
        frames.append(arr)
    strip = np.concatenate(frames, axis=1)
    Image.fromarray(strip).save(OUT)
    print("card ->", OUT, strip.shape[1] // 32, "frames")
    if aseprite:
        tmp = Path(tempfile.mkdtemp(prefix="farmcard_"))
        lua = ["do local spr = Sprite(32, 32, ColorMode.RGB)", "local L = spr.layers[1] L.name = 'card'"]
        for i, arr in enumerate(frames):
            f = tmp / f"f{i}.png"
            Image.fromarray(arr).save(f)
            if i:
                lua.append("spr:newEmptyFrame()")
            lua.append(f"spr:newCel(L, {i + 1}, Image{{ fromFile = '{f.as_posix()}' }}, Point(0, 0))")
        ASE.mkdir(exist_ok=True)
        lua.append("for i, fr in ipairs(spr.frames) do fr.duration = 0.15 end")
        lua.append(f"spr:saveAs('{(ASE / 'farm_card.aseprite').as_posix()}') spr:close() end")
        (tmp / "b.lua").write_text("\n".join(lua), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(tmp / "b.lua")], check=True)
        print("source ->", ASE / "farm_card.aseprite")


if __name__ == "__main__":
    build("--aseprite" in sys.argv)
