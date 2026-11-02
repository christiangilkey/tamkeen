"""Assemble whole arenas from map JSON (dump_maps.mjs writes it from the game's own generator), exactly as the game will:
each tile's layers bottom to top ([terrain, variant 0-15, fill 0-3]; variant 15 = the fill tile), then the props
and the two creatures at their starts, sorted by their feet.

    .venv/Scripts/python game/art-src/terrain/arena.py MAPS.json [--each] [--gif]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import T  # noqa: E402
from preview import PREV, Art, bridge_axis, creature, font, prop_image, render, zoom  # noqa: E402
from props import PROPS  # noqa: E402

BEASTS = {  # who stands at the starts in each sample, for scale
    "meadow": ("fawn", "chick"), "ruins": ("rock_golem", "griffin"), "volcanic": ("dragon_whelp", "pebble"),
    "cave": ("firefly", "moon_wolf"), "shore": ("seal", "axolotl"), "night": ("cat", "winged_fox"),
    "forest": ("forest_deer", "bunny"), "desert": ("cat_ferret", "fluffball"), "snow": ("jellyfish", "treasure_golem"),
}


def draw_map(m: dict, art: Art) -> Image.Image:
    """Ground in the dual grid from each tile's layer stack (as battlemap.js drawCorners does), then props
    and the two creatures sorted by their feet."""
    g = [[st[-1][0] for st in row] for row in m["layers"]]
    stacks = []
    for y, row in enumerate(m["layers"]):
        stacks.append([])
        for x, st in enumerate(row):
            names = [t for t, v, f in st]
            if names[-1] in ("bridge", "bridge_v"):
                names[-1] = bridge_axis(g, x, y)
            stacks[-1].append(names)
    canvas = render(None, m["base"], art=art, stacks=stacks)
    things = []
    for p in m["props"]:
        if p["id"] not in PROPS:
            continue
        im = prop_image(p["id"])
        if p.get("flip"):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        px = int(p["x"] * T + p["w"] * T / 2 - im.width / 2)
        py = (p["y"] + 1) * T - im.height
        things.append((py + im.height, px, py, im))
    for dcl in m.get("decals", []):  # flat on the ground, before props and creatures
        im = decal_image(dcl["id"], dcl.get("v", 0))
        if im is None:
            continue
        if dcl.get("flip"):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        canvas.alpha_composite(im, (int(dcl["x"]), int(dcl["y"])))
    me, foe = BEASTS.get(m["theme"], ("chick", "seal"))
    for cid, key, flip in ((me, "me", False), (foe, "foe", True)):
        st = m["starts"][key]
        im = creature(cid)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        things.append((st["y"], int(st["x"] - im.width / 2), int(st["y"] - im.height), im))
    for _, px, py, im in sorted(things, key=lambda t: t[0]):
        if px + im.width > 0 and py + im.height > 0:
            canvas.alpha_composite(im, (max(0, px), max(0, py)), (max(0, -px), max(0, -py)))
    return canvas


_decals = {}


def decal_image(did, v):
    """Cell v of a decal strip (decals.py), or None if that decal isn't drawn yet."""
    try:
        from decals import DECALS
    except ImportError:
        return None
    if did not in DECALS:
        return None
    if did not in _decals:
        _decals[did] = Image.fromarray(DECALS[did](), "RGBA")
    strip = _decals[did]
    c = strip.height
    v = v % max(1, strip.width // c)
    return strip.crop((v * c, 0, (v + 1) * c, c))


VIEW = (38, 19)  # what the battle camera shows, in tiles


def view_of(m: dict, im: Image.Image) -> Image.Image:
    """A camera-sized window centred between the two creatures (clamped to the map), so both show."""
    vw, vh = VIEW[0] * T, VIEW[1] * T
    if im.width <= vw and im.height <= vh:
        return im
    me, foe = m["starts"]["me"], m["starts"]["foe"]
    cx, cy = (me["x"] + foe["x"]) / 2, (me["y"] + foe["y"]) / 2 - T
    x0 = int(max(0, min(im.width - vw, cx - vw / 2)))
    y0 = int(max(0, min(im.height - vh, cy - vh / 2)))
    return im.crop((x0, y0, x0 + vw, y0 + vh))


def main(args):
    """Draw every map in the JSON: arenas.png (camera-sized views, all themes), arena_full.png (the first map
    whole); --each also saves each map whole at 2x, --gif an animated camera view of each."""
    path = Path(args[0])
    data = json.loads(path.read_text(encoding="utf-8"))
    maps = data["maps"]
    arts = [Art(f) for f in range(4)]
    shots = []
    for i, m in enumerate(maps):
        im = draw_map(m, arts[0])
        name = f"arena_{m['theme']}_{m['seed']}"
        if i == 0:
            im.save(PREV / "arena_full.png")
        if "--each" in args:
            zoom(im, 2).save(PREV / f"{name}.png")
        shots.append((m, view_of(m, im)))
        print("arena", name, im.size)
        if "--gif" in args:
            frames = [zoom(view_of(m, draw_map(m, a)), 2).convert("P", palette=Image.ADAPTIVE, colors=255) for a in arts]
            frames[0].save(PREV / f"{name}.gif", save_all=True, append_images=frames[1:], duration=220, loop=0)
    # the camera views on one sheet, 2 across
    w, h = shots[0][1].size
    k = 2
    cols = 2
    rows = (len(shots) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * (w * k + 16) + 16, rows * (h * k + 40) + 16), (28, 24, 38, 255))
    d = ImageDraw.Draw(sheet)
    for i, (m, im) in enumerate(shots):
        x, y = 16 + (i % cols) * (w * k + 16), 16 + (i // cols) * (h * k + 40)
        d.text((x, y), f"{m['theme']}  (seed {m['seed']})", fill=(240, 220, 160, 255), font=font(18))
        sheet.paste(zoom(im, k), (x, y + 26))
    sheet.save(PREV / "arenas.png")
    print("saved arenas.png")


if __name__ == "__main__":
    main(sys.argv[1:])
