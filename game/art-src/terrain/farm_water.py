"""Two ideas for the farm's watering moment, for the owner to choose from (he said: "I really don't like the watering
pale/water animation"). Each is a strip of 48 x 48 frames over one plot (its soil 16 x 16 at 16, 26 in every frame),
with the crop drawn by the game from crops.png; the preview shows them as GIFs with a tomato growing a stage.

  A  "The can": a copper watering can tilts in, a thick bright stream pours onto the plot, drops splash and bounce,
     the soil darkens from where the water lands outwards, the plant perks up with a little hop.
  B  "The splash": a big bright drop falls from above, lands with a crown of spray, rings ripple out over the soil
     (darkening it), drops scatter and sparkle, the plant pops up a stage.

    .venv/Scripts/python game/art-src/terrain/farm_water.py preview OUT_DIR
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import hx  # noqa: E402
from props import Sprite, blob, cylinder, finish, line  # noqa: E402
from village_props import rect  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
COPPER = [hx(c) for c in ("#3a1a0e", "#6a3418", "#9a5226", "#c87638", "#e89a52", "#f8c47e", "#fff0c8")]
WATER = [hx(c) for c in ("#0a3a7a", "#1460b8", "#2a8ae8", "#5ab4ff", "#9ad6ff", "#e0f6ff")]
N = 14  # frames a moment


def can_frame(f):
    """Option A, frame f (0 .. N-1)."""
    sp = Sprite(48, 48, f"water_a_{f}")
    tilt = min(1.0, f / 3)  # it tips in over the first frames, back up over the last two
    if f >= N - 2:
        tilt = 1 - (f - (N - 3)) / 3
    cx, cy = 34 - tilt * 3, 14 + tilt * 2
    # the can's body: a rounded copper pot, lit from the top left, a handle over it
    blob(sp, cx, cy, 7, 5.5, COPPER, part=1, lo=-0.5, hi=1.3)
    rect(sp, int(cx - 6), int(cy - 5), int(cx + 6), int(cy - 5), COPPER[5], 1)
    line(sp, [(cx - 4, cy - 6), (cx, cy - 11), (cx + 5, cy - 6)], COPPER[2], width=1, part=2)
    # the spout reaching down-left to the rose over the plot
    sx, sy = cx - 7 - tilt * 6, cy + 1 + tilt * 6
    line(sp, [(cx - 5, cy + 1), (sx, sy)], COPPER[3], width=2, part=3)
    blob(sp, sx - 1, sy + 1, 2.2, 1.8, COPPER, part=3)
    if 2 <= f < N - 2:  # the stream: a thick bright pour with a highlight, from the rose down to the soil
        for k in range(0, 14):
            t = k / 13
            x = sx - 2 - t * 2 + math.sin((f + k) * 1.3) * 0.6
            y = sy + 2 + t * (34 - sy)
            for w in (-1, 0, 1):
                sp.set(int(x) + w, int(y), WATER[3] if w else WATER[4], 4)
            if k % 3 == f % 3:
                sp.set(int(x), int(y), WATER[5], 4)
        for k in range(4):  # drops bouncing from where it lands
            a = (k / 4) * math.pi + (f * 0.7)
            d = ((f * 2 + k * 3) % 7)
            x, y = 22 + math.cos(a) * d, 32 - abs(math.sin(a)) * (4 - d * 0.4)
            sp.set(int(x), int(y), WATER[4], 5)
    return finish(sp)


def splash_frame(f):
    """Option B, frame f."""
    sp = Sprite(48, 48, f"water_b_{f}")
    if f < 5:  # the big drop falling, a tear with a highlight
        y = 2 + f * 6
        blob(sp, 24, y + 4, 3.2, 4.2, WATER[1:], part=1, lo=-0.5, hi=1.3)
        for k in range(3):
            sp.set(24, y + k - 1, WATER[3], 1)
        sp.set(23, y + 3, WATER[5], 1)
    elif f < 10:  # the crown of spray and the rings: water, so no dark outline (drawn after finish, below)
        pass
    else:  # sparkles as the plant grows
        k = f - 10
        for (x, y) in ((14, 20 - k), (33, 18 - k), (24, 10 - k)):
            for d in (-1, 1):
                sp.set(x + d, y, hx("#fff4b4"), 4)
                sp.set(x, y + d, hx("#fff4b4"), 4)
            sp.set(x, y, WATER[5], 4)
    arr = finish(sp)
    if 5 <= f < 10:
        k = f - 5
        def put(x, y, c):
            if 0 <= x < 48 and 0 <= y < 48:
                arr[y, x] = (*c[:3], 255)
        for i in range(9):  # the crown: drops thrown up and out, then falling
            a = math.pi + (i / 8) * math.pi
            d = 2 + k * 2.4
            x, y = 24 + math.cos(a) * d, 32 + math.sin(a) * d * (1.1 - k * 0.15) + k * k * 0.5
            put(int(x), int(y), WATER[5 if i % 2 else 4])
            put(int(x), int(y) + 1, WATER[3])
        for ring in range(2):  # ripples spreading over the soil
            r = 1.5 + k * 1.5 - ring * 2.5
            if r <= 0:
                continue
            for i in range(28):
                a = (i / 28) * math.pi * 2
                put(int(24 + math.cos(a) * r * 1.3), int(34 + math.sin(a) * r * 0.55), WATER[4] if ring == 0 else WATER[3])
    return arr


def scene(fx, f, option):
    """One preview frame: grass, the plot (darkening as the water lands), a tomato (a stage up once watered), the fx."""
    grass = Image.open(ROOT / "web/game-art/battle/terrain/grass_fill.png").convert("RGBA")
    soil = Image.open(ROOT / "web/game-art/farm/soil.png").convert("RGBA")
    crops = Image.open(ROOT / "web/game-art/farm/crops.png").convert("RGBA")
    out = Image.new("RGBA", (48, 48))
    for y in range(0, 48, 16):
        for x in range(0, 48, 16):
            out.alpha_composite(grass.crop((((x + y) // 16 % 4) * 16, 0, ((x + y) // 16 % 4) * 16 + 16, 16)), (x, y))
    wet_from = 4 if option == "A" else 6
    dry, wet = soil.crop((0, 0, 16, 16)), soil.crop((16, 0, 32, 16))
    out.alpha_composite(dry, (16, 26))
    if f >= wet_from:  # the soil darkening outwards from the middle
        r = min(12, (f - wet_from + 1) * 2.5)
        mask = Image.new("L", (16, 16))
        mpx = mask.load()
        for y in range(16):
            for x in range(16):
                mpx[x, y] = 255 if math.hypot(x - 7.5, y - 7.5) <= r else 0
        wet_part = Image.new("RGBA", (16, 16))
        wet_part.paste(wet, (0, 0), mask)
        out.alpha_composite(wet_part, (16, 26))
    row = 0  # tomato
    stage = 1 if f < 10 else 2
    hop = -2 if option == "A" and f in (10, 11) else (-3 if option == "B" and f == 10 else 0)
    out.alpha_composite(crops.crop((stage * 16, row * 24, stage * 16 + 16, row * 24 + 24)), (16, 26 + 5 - 21 + hop))
    out.alpha_composite(Image.fromarray(fx))
    return out


def preview(out_dir):
    out_dir = Path(out_dir)
    for option, fn in (("A", can_frame), ("B", splash_frame)):
        frames = [scene(fn(f), f, option).resize((240, 240), Image.NEAREST) for f in range(N)]
        frames += [frames[-1]] * 4  # (a moment's rest before it loops)
        path = out_dir / f"farm-water-option-{option}.gif"
        frames[0].save(path, save_all=True, append_images=frames[1:], duration=110, loop=0, disposal=2)
        strip = Image.new("RGBA", (240 * 7, 240))
        for i, fr in enumerate(frames[0:N:2]):
            strip.alpha_composite(fr, (i * 240, 0))
        strip.save(out_dir / f"farm-water-option-{option}-frames.png")
        print("option", option, "->", path)


def build(aseprite=False):
    """The owner's pick ("the splash animation is better"): option B's frames as web/game-art/farm/splash.png (N frames of
    48 x 48, the plot's soil at 16, 26 in each), with its Aseprite source game/art-src/terrain/aseprite/farm_splash.aseprite."""
    import subprocess
    import tempfile
    frames = [splash_frame(f) for f in range(N)]
    strip = np.concatenate(frames, axis=1)
    out = ROOT / "web/game-art/farm/splash.png"
    Image.fromarray(strip).save(out)
    print("splash ->", out, N, "frames")
    if aseprite:
        tmp = Path(tempfile.mkdtemp(prefix="farmsplash_"))
        lua = ["do local spr = Sprite(48, 48, ColorMode.RGB)", "local L = spr.layers[1] L.name = 'splash'"]
        for i, arr in enumerate(frames):
            f = tmp / f"f{i}.png"
            Image.fromarray(arr).save(f)
            if i:
                lua.append("spr:newEmptyFrame()")
            lua.append(f"spr:newCel(L, {i + 1}, Image{{ fromFile = '{f.as_posix()}' }}, Point(0, 0))")
        target = (Path(__file__).resolve().parent / "aseprite" / "farm_splash.aseprite").as_posix()
        lua += ["for i, fr in ipairs(spr.frames) do fr.duration = 0.11 end", f"spr:saveAs('{target}') spr:close() end"]
        (tmp / "b.lua").write_text(chr(10).join(lua), encoding="utf-8")
        subprocess.run(["C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe", "-b", "--script", str(tmp / "b.lua")], check=True)
        print("source ->", target)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "build":
        build("--aseprite" in sys.argv)
    else:
        preview(sys.argv[2] if len(sys.argv) > 2 else ".")
