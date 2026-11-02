"""Preview sheets: each terrain tiled into a sample patch, and whole arenas assembled from the tiles.

Draws the way the game does (battlemap.js drawLayers): each map tile is a stack — the theme's ground (a fill
tile), then any terrain beneath (deep water sits on shallows, a bridge on deep water), then the tile's own
terrain, each layer with the edge tile picked by which neighbours count as the same terrain (that terrain or
something drawn on top of it; a bridge also joins to dry land; the map's border counts as the same). Props go on
last, sorted by their bottom edge.

    .venv/Scripts/python game/art-src/terrain/preview.py [id ...]        patches + sheets
    .venv/Scripts/python game/art-src/terrain/preview.py all             the contact sheet of every terrain
    .venv/Scripts/python game/art-src/terrain/preview.py map FILE.json   an arena from the Map chat's JSON
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import T  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PREV = HERE / "preview"
BEAST = ROOT / "web" / "game-art" / "creature" / "beast"
WET = {"deep_water", "shallows", "lava"}


def tile_hash(x: int, y: int, salt: int = 0) -> int:
    h = (x * 374761393 + y * 668265263 + salt * 2246822519) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return h ^ (h >> 16)


class Art:
    """Every terrain's tiles for one animation frame, made once."""

    def __init__(self, frame: int = 0):
        from terrain import TERRAINS
        self.T = TERRAINS
        self.frame = frame
        self.cache = {}

    def tiles(self, tid):
        if tid not in self.cache:
            t = self.T[tid]
            f = self.frame % t.frames
            edges = [Image.fromarray(t.edge(i, f), "RGBA") for i in range(16)]
            fills = [Image.fromarray(t.fill(v, f), "RGBA") for v in range(4)]
            self.cache[tid] = (edges, fills)
        return self.cache[tid]


def chain(tid):
    from terrain import UNDER
    out = [tid]
    while out[-1] in UNDER:
        out.append(UNDER[out[-1]])
    return out


def render(grid, base: str, props=(), art: Art | None = None, beasts=()) -> Image.Image:
    """grid: rows of terrain ids (None = the base ground). props: (name, tile_x, tile_y, w_tiles, flip)."""
    art = art or Art(0)
    h, w = len(grid), len(grid[0])
    canvas = Image.new("RGBA", (w * T, h * T), (0, 0, 0, 255))
    g = [[c or base for c in row] for row in grid]

    def same(layer, xx, yy):
        if not (0 <= xx < w and 0 <= yy < h):
            return True
        n = g[yy][xx]
        if layer in chain(n):
            return True
        return layer == "bridge" and n not in WET

    for y in range(h):
        for x in range(w):
            canvas.alpha_composite(art.tiles(base)[1][tile_hash(x, y) % 4], (x * T, y * T))
            if g[y][x] == base:
                continue
            for layer in reversed(chain(g[y][x])):
                bits = (1 if same(layer, x, y - 1) else 0) | (2 if same(layer, x + 1, y) else 0) | \
                       (4 if same(layer, x, y + 1) else 0) | (8 if same(layer, x - 1, y) else 0)
                edges, fills = art.tiles(layer)
                im = fills[tile_hash(x, y, 7) % 4] if bits == 15 else edges[bits]
                canvas.alpha_composite(im, (x * T, y * T))
    things = []
    for name, tx, ty, wt, flip in props:
        im = prop_image(name)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        px = int(tx * T + wt * T / 2 - im.width / 2)
        py = (ty + 1) * T - im.height
        things.append((py + im.height, px, py, im))
    for cid, fx, fy, flip in beasts:
        im = creature(cid)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        things.append((fy, int(fx - im.width / 2), int(fy - im.height), im))
    for _, px, py, im in sorted(things, key=lambda t: t[0]):
        canvas.alpha_composite(im, (px, py))
    return canvas


_props = {}


def prop_image(name):
    if name not in _props:
        from props import PROPS
        _props[name] = Image.fromarray(PROPS[name](), "RGBA")
    return _props[name]


def creature(cid: str) -> Image.Image:
    """A creature's still pose with a soft shadow under its feet (the game draws its own)."""
    folder = BEAST / cid
    parts = [Image.open(folder / f"{p}.png").convert("RGBA") for p in ("legs_back", "body", "legs_front", "head")
             if (folder / f"{p}.png").exists()]
    im = Image.new("RGBA", parts[0].size)
    for p in parts:
        im.alpha_composite(p)
    bb = im.getbbox()
    out = Image.new("RGBA", (im.width, im.height + 3))
    d = ImageDraw.Draw(out)
    cx = (bb[0] + bb[2]) / 2
    d.ellipse([cx - 13, bb[3] - 3, cx + 13, bb[3] + 2], fill=(20, 10, 38, 100))
    out.alpha_composite(im)
    return out.crop((0, 0, im.width, bb[3] + 3))


def zoom(im: Image.Image, k: int) -> Image.Image:
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def blob_grid(w: int, h: int, tid: str, seed: int = 1):
    """A patch with a big blob, a thin arm, a lone tile, a hole: every kind of edge."""
    rng = np.random.default_rng(seed)
    g = [[None] * w for _ in range(h)]
    cx, cy = w * 0.42, h * 0.52
    for y in range(h):
        for x in range(w):
            r = ((x - cx) / (w * 0.30)) ** 2 + ((y - cy) / (h * 0.34)) ** 2
            if r + rng.random() * 0.35 < 1.0:
                g[y][x] = tid
    g[int(cy)][int(cx)] = None
    for x in range(int(cx), w - 2):
        g[1][x] = tid
    g[h - 2][w - 2] = tid
    g[h - 2][1] = tid
    return g


# which ground each terrain is shown on, and anything it needs under it
SHOW_ON = {
    "grass": "sand", "dirt": "grass", "sand": "grass", "snow": "dirt", "ash": "dirt", "cave_floor": "dirt",
    "tall_grass": "grass", "flowers": "grass", "forest_floor": "grass", "mud": "grass", "shallows": "grass",
    "deep_water": "grass", "ice": "snow", "high": "grass", "cobbles": "grass", "crystals": "cave_floor",
    "coals": "ash", "lava": "ash", "shadow": "grass", "spring": "grass", "bridge": "grass", "wall": "grass",
}


def special_grid(tid, w, h):
    if tid == "deep_water":  # a lake: deep in the middle, a shallow ring
        g = blob_grid(w, h, "shallows")
        for y in range(h):
            for x in range(w):
                if g[y][x] and all(g[yy][xx] for yy in (y - 1, y, y + 1) for xx in (x - 1, x, x + 1)
                                   if 0 <= yy < h and 0 <= xx < w):
                    g[y][x] = "deep_water"
        return g
    if tid == "bridge":  # a river with a bridge over it, and a dock
        g = [[None] * w for _ in range(h)]
        for y in range(h):
            for x in range(4, 10):
                g[y][x] = "shallows" if x in (4, 9) else "deep_water"
        for x in range(4, 10):
            g[4][x] = "bridge"
        for y in range(h):
            for x in range(11, 13):
                g[y][x] = "deep_water" if 2 <= y else None
        for y in range(1, 4):
            g[y][x - 1] = "bridge"
        g[0][11] = "shallows"
        return g
    if tid == "wall":
        g = [[None] * w for _ in range(h)]
        for x in range(2, 11):
            g[2][x] = "wall"
        for y in range(2, 7):
            g[y][2] = "wall"
        for x in range(2, 6):
            g[6][x] = "wall"
        g[6][8], g[6][9] = "wall", "wall"
        g[4][12] = "wall"
        for x in range(4, 9):
            for y in range(3, 6):
                g[y][x] = "cobbles"
        return g
    return blob_grid(w, h, tid)


def patch(tid: str, frame: int = 0, art=None) -> Image.Image:
    g = special_grid(tid, 14, 9)
    return render(g, SHOW_ON[tid], art=art or Art(frame))


def sheet_view(tid: str, k: int = 4) -> Image.Image:
    from terrain import TERRAINS
    t = TERRAINS[tid]
    s = Image.fromarray(t.sheet(0), "RGBA")
    f = Image.fromarray(t.fill_strip(), "RGBA")
    out = Image.new("RGBA", (s.width * k + 8 + f.width * k, s.height * k), (40, 36, 52, 255))
    chk = Image.new("RGBA", s.size, (200, 60, 200, 255))  # magenta under the see-through parts
    chk.alpha_composite(s)
    out.paste(zoom(chk, k), (0, 0))
    out.paste(zoom(f, k), (s.width * k + 8, 0))
    d = ImageDraw.Draw(out)
    for i in range(1, 4):
        d.line([(i * T * k, 0), (i * T * k, s.height * k)], fill=(255, 255, 255, 60))
        d.line([(0, i * T * k), (s.width * k, i * T * k)], fill=(255, 255, 255, 60))
    return out


def font(size=14):
    for f in ("C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def contact(ids, k=2, cols=3, frame=0) -> Image.Image:
    art = Art(frame)
    tiles = [(tid, zoom(patch(tid, art=art), k)) for tid in ids]
    pw, ph = tiles[0][1].size
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new("RGBA", (cols * (pw + 12) + 12, rows * (ph + 34) + 12), (28, 24, 38, 255))
    d = ImageDraw.Draw(out)
    for i, (tid, im) in enumerate(tiles):
        x, y = 12 + (i % cols) * (pw + 12), 12 + (i // cols) * (ph + 34)
        d.text((x, y), f"{tid}  (on {SHOW_ON[tid]})", fill=(240, 220, 160, 255), font=font(15))
        out.paste(im, (x, y + 22))
    return out


def props_sheet(k=4) -> Image.Image:
    """Every prop on grass, each standing on its footprint, with two creatures for scale."""
    g = [[None] * 30 for _ in range(7)]
    row1 = [("tree", 2), ("pine", 2), ("palm", 2), ("rock_big", 2), ("bush", 1), ("boulder", 1)]
    row2 = [("cactus", 1), ("crystal", 1), ("stalagmite", 1), ("pillar", 1), ("obsidian", 1), ("mushroom", 1)]
    props, x = [], 1
    for name, w in row1:
        props.append((name, x, 3, w, False))
        x += w + 2
    x = 1
    for name, w in row2:
        props.append((name, x, 6, w, False))
        x += w + 2
    im = render(g, "grass", props, beasts=[("dragon_whelp", 25 * T, 4 * T, False), ("moon_wolf", 27 * T, 7 * T - 2, True)])
    return zoom(im, k)


def main(args):
    PREV.mkdir(exist_ok=True)
    from terrain import TERRAINS
    if args and args[0] == "props":
        props_sheet().save(PREV / "props.png")
        print("saved props.png")
        return
    if args and args[0] == "all":
        contact(list(TERRAINS)).save(PREV / "all_terrains.png")
        print("saved all_terrains.png")
        return
    if args and args[0] == "map":
        import arena
        arena.main(args[1:])
        return
    ids = args or list(TERRAINS)
    for tid in ids:
        zoom(patch(tid), 3).save(PREV / f"patch_{tid}.png")
        sheet_view(tid).save(PREV / f"sheet_{tid}.png")
        print("preview", tid)


if __name__ == "__main__":
    main(sys.argv[1:])
