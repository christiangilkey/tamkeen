"""Assemble whole arenas from the Map chat's sample maps (battlemap-sample.json), exactly as the game will:
each tile's layers bottom to top ([terrain, variant 0-15, fill 0-3]; variant 15 = the fill tile), then the props
and the two creatures at their starts, sorted by their feet.

    .venv/Scripts/python game/art-src/terrain/arena.py SAMPLE.json [--gif]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import T  # noqa: E402
from preview import PREV, Art, creature, font, prop_image, zoom  # noqa: E402

BEASTS = {  # who stands at the starts in each sample, for scale
    "meadow": ("fawn", "chick"), "ruins": ("rock_golem", "griffin"), "volcanic": ("dragon_whelp", "pebble"),
    "cave": ("firefly", "moon_wolf"), "shore": ("seal", "axolotl"), "night": ("cat", "winged_fox"),
    "forest": ("forest_deer", "bunny"), "desert": ("cat_ferret", "fluffball"), "snow": ("jellyfish", "treasure_golem"),
}


def draw_map(m: dict, art: Art) -> Image.Image:
    canvas = Image.new("RGBA", (m["cols"] * T, m["rows"] * T), (0, 0, 0, 255))
    for y, row in enumerate(m["layers"]):
        for x, stack in enumerate(row):
            for terrain, variant, fill in stack:
                edges, fills = art.tiles(terrain)
                canvas.alpha_composite(fills[fill] if variant == 15 else edges[variant], (x * T, y * T))
    things = []
    for p in m["props"]:
        im = prop_image(p["id"])
        if p.get("flip"):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        px = int(p["x"] * T + p["w"] * T / 2 - im.width / 2)
        py = (p["y"] + 1) * T - im.height
        things.append((py + im.height, px, py, im))
    me, foe = BEASTS.get(m["theme"], ("chick", "seal"))
    for cid, key, flip in ((me, "me", False), (foe, "foe", True)):
        st = m["starts"][key]
        im = creature(cid)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        things.append((st["y"], int(st["x"] - im.width / 2), int(st["y"] - im.height), im))
    for _, px, py, im in sorted(things, key=lambda t: t[0]):
        canvas.alpha_composite(im, (px, py))
    return canvas


def main(args):
    path = Path(args[0])
    data = json.loads(path.read_text(encoding="utf-8"))
    maps = data["maps"]
    arts = [Art(f) for f in range(4)]
    shots = []
    for m in maps:
        im = draw_map(m, arts[0])
        name = f"arena_{m['theme']}_{m['seed']}"
        zoom(im, 3).save(PREV / f"{name}.png")
        shots.append((m, im))
        print("arena", name)
        if "--gif" in args:
            frames = [zoom(draw_map(m, a), 2).convert("P", palette=Image.ADAPTIVE, colors=255) for a in arts]
            frames[0].save(PREV / f"{name}.gif", save_all=True, append_images=frames[1:], duration=220, loop=0)
    # all of them on one sheet, 2 across
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
