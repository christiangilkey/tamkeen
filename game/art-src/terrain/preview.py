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
        from terrain import all_terrains; TERRAINS = all_terrains()
        self.T = TERRAINS
        self.frame = frame
        self.cache = {}

    def tiles(self, tid):
        if tid not in self.cache:
            t = self.T[tid]
            f = self.frame % t.frames
            edges = [Image.fromarray(t.edge(i, f), "RGBA") for i in range(16)]
            n = 4 if t.frames > 1 else 4 * t.groups
            fills = [Image.fromarray(t.fill(v, f), "RGBA") for v in range(n)]
            self.cache[tid] = (edges, fills)
        return self.cache[tid]

    def fill_for(self, tid, cx, cy):
        """A fill tile for a cell: texture group by a slow noise (whole patches), tile in the group by a hash."""
        edges, fills = self.tiles(tid)
        groups = max(1, len(fills) // 4)
        g = min(groups - 1, int(slow_noise(cx, cy, 6.0, len(tid)) * groups * 1.15)) if groups > 1 else 0
        return fills[4 * g + tile_hash(cx, cy, 7) % 4]


def chain(tid):
    from terrain import UNDER
    out = [tid]
    while out[-1] in UNDER:
        out.append(UNDER[out[-1]])
    return out


# the order layers are drawn in inside a cell (the Map chat's drawCorners uses the same), low to high
ORDER = ["cave_floor", "ash", "snow", "sand", "dirt", "grass", "forest_floor", "mud", "ice", "shallows", "deep_water",
         "spring", "coals", "lava", "cobbles", "farmland", "wood_floor", "stone_floor", "carpet", "high", "tall_grass",
         "wheat", "flowers", "shadow", "crystals", "spikes", "fountain", "wall", "fort_wall", "dungeon_wall", "cracked_wall",
         "house_wall", "hall_wall", "fence", "bridge", "bridge_v"]


def bridge_axis(g, x, y):
    """A bridge tile's deck runs east-west ("bridge") unless more of its bridge neighbours are north/south."""
    h, w = len(g), len(g[0])
    isb = lambda xx, yy: 0 <= xx < w and 0 <= yy < h and g[yy][xx] in ("bridge", "bridge_v")
    ew = isb(x - 1, y) + isb(x + 1, y)
    ns = isb(x, y - 1) + isb(x, y + 1)
    return "bridge_v" if ns > ew else "bridge"


def grid_stacks(grid, base):
    """Each tile's layers, bottom to top, from a grid of terrain ids."""
    g = [[c or base for c in row] for row in grid]
    out = []
    for y, row in enumerate(g):
        out.append([])
        for x, t in enumerate(row):
            st = [base] + [l for l in reversed(chain(t)) if l != base]
            if st[-1] in ("bridge", "bridge_v"):
                st[-1] = bridge_axis(g, x, y)
            out[-1].append(st)
    return out


def render(grid, base: str, props=(), art: Art | None = None, beasts=(), stacks=None) -> Image.Image:
    """The dual grid, as the game draws it: cells centred where four tiles meet, each layer present at any of a
    cell's corners drawn with its corner mask (NW 1, NE 2, SW 4, SE 8). grid: rows of terrain ids (None = the
    base ground), or stacks: each tile's layers bottom to top. props: (name, tile_x, tile_y, w_tiles, flip)."""
    art = art or Art(0)
    stacks = stacks or grid_stacks(grid, base)
    h, w = len(stacks), len(stacks[0])
    P = T // 2
    canvas = Image.new("RGBA", (w * T + 2 * P, h * T + 2 * P), (0, 0, 0, 255))

    def stack(xx, yy):
        return set(stacks[min(max(yy, 0), h - 1)][min(max(xx, 0), w - 1)])

    for cy in range(h + 1):
        for cx in range(w + 1):
            corners = [stack(cx - 1, cy - 1), stack(cx, cy - 1), stack(cx - 1, cy), stack(cx, cy)]
            present = set().union(*corners)
            layers = [base] + sorted((l for l in present if l != base), key=ORDER.index)
            for layer in layers:
                mask = sum(bit for bit, c in zip((1, 2, 4, 8), corners) if layer in c)
                if mask == 0:
                    continue
                im = art.fill_for(layer, cx, cy) if mask == 15 else art.tiles(layer)[0][mask]
                canvas.alpha_composite(im, (cx * T - P + P, cy * T - P + P))
    canvas = canvas.crop((P, P, P + w * T, P + h * T))
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
    "coals": "ash", "lava": "ash", "shadow": "grass", "spring": "grass", "bridge": "grass", "bridge_v": "grass",
    "wall": "grass", "fort_wall": "grass", "dungeon_wall": "cave_floor", "house_wall": "grass", "fence": "grass",
    "wood_floor": "grass", "stone_floor": "grass",
    # the village, dungeon and fortress additions (village_ground.py, dungeon_art.py)
    "hall_wall": "grass", "carpet": "stone_floor", "farmland": "grass", "wheat": "grass", "fountain": "cobbles",
    "spikes": "stone_floor", "cracked_wall": "stone_floor",
}

WALLS = ("fort_wall", "dungeon_wall", "house_wall", "hall_wall")
FLOOR_OF = {"fort_wall": "stone_floor", "dungeon_wall": "stone_floor", "house_wall": "wood_floor", "hall_wall": "stone_floor"}


def special_grid(tid, w, h):
    if tid == "deep_water":  # a lake: deep in the middle, a shallow ring
        g = blob_grid(w, h, "shallows")
        for y in range(h):
            for x in range(w):
                if g[y][x] and all(g[yy][xx] for yy in (y - 1, y, y + 1) for xx in (x - 1, x, x + 1)
                                   if 0 <= yy < h and 0 <= xx < w):
                    g[y][x] = "deep_water"
        return g
    if tid in ("bridge", "bridge_v"):  # a river with a bridge over it, and a dock
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
            g[y][x - 1] = "bridge_v"
        g[0][11] = "shallows"
        return g
    if tid == "wall" or tid in WALLS:
        floor = FLOOR_OF.get(tid, "cobbles")
        g = [[None] * w for _ in range(h)]
        for x in range(2, 11):
            g[2][x] = tid
        for y in range(2, 7):
            g[y][2] = tid
        for x in range(2, 6):
            g[6][x] = tid
        g[6][8], g[6][9] = tid, tid
        g[4][12] = tid
        for x in range(4 if tid == "wall" else 3, 9 if tid == "wall" else 11):
            for y in range(3, 6):
                g[y][x] = floor
        return g
    if tid == "fence":  # a run with a corner, a T, a crossing and a lone post
        g = [[None] * w for _ in range(h)]
        for x in range(1, 12):
            g[2][x] = "fence"
        for y in range(2, 8):
            g[y][1] = "fence"
        for y in range(2, 7):
            g[y][6] = "fence"
        for x in range(4, 10):
            g[5][x] = "fence"
        g[7][11] = "fence"
        return g
    return blob_grid(w, h, tid)


def patch(tid: str, frame: int = 0, art=None) -> Image.Image:
    g = special_grid(tid, 14, 9)
    return render(g, SHOW_ON[tid], art=art or Art(frame))


def sheet_view(tid: str, k: int = 4) -> Image.Image:
    from terrain import all_terrains; TERRAINS = all_terrains()
    t = TERRAINS[tid]
    s = Image.fromarray(t.sheet(0), "RGBA")
    f = Image.fromarray(t.fill_strip(), "RGBA")
    out = Image.new("RGBA", (s.width * k + 8 + f.width * k, s.height * k), (40, 36, 52, 255))
    chk = Image.new("RGBA", s.size, (200, 60, 200, 255))  # magenta under the see-through parts
    chk.alpha_composite(s)
    out.paste(zoom(chk, k), (0, 0))
    fchk = Image.new("RGBA", f.size, (200, 60, 200, 255))  # (fills are see-through too for shadow, fence)
    fchk.alpha_composite(f)
    out.paste(zoom(fchk, k), (s.width * k + 8, 0))
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


STRUCTURES = ("fort_wall", "dungeon_wall", "house_wall", "fence", "wood_floor", "stone_floor")


def structures_area(under_walls: bool = False) -> Image.Image:
    """A mock village / dungeon / fortress corner on grass, through the same dual-grid drawing as the game: an
    L-shaped fortress corridor (stone floor) with a tower, a 6x5 house (wood floor, a 1-tile door), a dungeon room
    (stone floor, a doorway, a pillar) and a fence with a corner, a T and a gap. under_walls: the floor also runs
    under the walls (the tile's stack holds both)."""
    W, H = 46, 22
    g = [[None] * W for _ in range(H)]

    def box(x0, y0, x1, y1, t):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                g[y][x] = t

    # fortress: an outer and an inner wall, a corridor 2 wide between them, a tower at the corner, a thick stretch
    box(3, 3, 19, 4, "stone_floor")
    box(3, 3, 4, 20, "stone_floor")
    box(2, 2, 20, 2, "fort_wall")
    box(2, 2, 2, 21, "fort_wall")
    box(5, 5, 20, 5, "fort_wall")
    box(5, 5, 5, 21, "fort_wall")
    box(0, 0, 3, 2, "fort_wall")      # the tower
    box(10, 1, 14, 2, "fort_wall")    # a thicker stretch
    box(12, 6, 13, 7, "fort_wall")    # a buttress into the yard
    # house: 6x5, wood floor, a door in the south wall
    box(24, 1, 29, 5, "house_wall")
    box(25, 2, 28, 4, "wood_floor")
    g[5][26] = "wood_floor"
    # dungeon room: stone floor, a doorway on the west, a pillar
    box(22, 9, 31, 17, "dungeon_wall")
    box(23, 10, 30, 16, "stone_floor")
    g[13][22] = "stone_floor"
    g[12][27] = "dungeon_wall"
    box(26, 19, 31, 19, "dungeon_wall")   # a loose stretch, and a lone block
    g[20][34] = "dungeon_wall"
    # fence: a run with a corner, a T, and a gap
    for x in range(33, 45):
        if x != 38:
            g[3][x] = "fence"
    for y in range(3, 13):
        g[y][44] = "fence"
    for y in range(3, 9):
        g[y][36] = "fence"
    for x in range(36, 42):
        g[12][x] = "fence"
    base = "grass"
    floor_at = {}
    if under_walls:  # which floor lies under each wall tile: the nearest floor's
        for y in range(H):
            for x in range(W):
                if g[y][x] in WALLS:
                    floor_at[(x, y)] = FLOOR_OF[g[y][x]]
    stacks = []
    for y in range(H):
        stacks.append([])
        for x in range(W):
            t = g[y][x] or base
            st = [base]
            if (x, y) in floor_at:
                st.append(floor_at[(x, y)])
            if t != base:
                st.append(t)
            stacks[-1].append(st)
    beasts = [("rock_golem", 4 * T, 12 * T, False), ("griffin", 16 * T, 4 * T + 12, True),
              ("bunny", 27 * T, 4 * T + 8, False), ("moon_wolf", 25 * T, 15 * T, False), ("chick", 40 * T, 8 * T, True)]
    return render(None, base, stacks=stacks, beasts=[b for b in beasts if (BEAST / b[0]).exists()])


def structures_sheets(k=4) -> Image.Image:
    """The six structure terrains' corner sheets (magenta = see-through) and fill strips, x k."""
    shots = [(tid, sheet_view(tid, k)) for tid in STRUCTURES]
    w = max(im.width for _, im in shots)
    out = Image.new("RGBA", (w + 24, sum(im.height + 34 for _, im in shots) + 12), (28, 24, 38, 255))
    d = ImageDraw.Draw(out)
    y = 12
    for tid, im in shots:
        d.text((12, y), tid, fill=(240, 220, 160, 255), font=font(15))
        out.paste(im, (12, y + 22))
        y += im.height + 34
    return out


def main(args):
    PREV.mkdir(exist_ok=True)
    from terrain import all_terrains; TERRAINS = all_terrains()
    if args and args[0] == "structures":
        structures_sheets().save(PREV / "structures_sheets.png")
        zoom(structures_area(), 2).save(PREV / "structures_area.png")
        contact(list(STRUCTURES), cols=3).save(PREV / "structures_patches.png")
        print("saved structures_sheets.png, structures_area.png, structures_patches.png")
        return
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



def slow_noise(x, y, scale=5.0, salt=0):
    """Smooth value noise over tiles, 0..1 (for picking fill textures in patches)."""
    gx, gy = x / scale, y / scale
    x0, y0 = int(np.floor(gx)), int(np.floor(gy))
    tx, ty = gx - x0, gy - y0
    sx, sy = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    v = lambda a, b: (tile_hash(a, b, 99 + salt) % 1000) / 999
    top = v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx
    bot = v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx
    return top * (1 - sy) + bot * sy


def textures_sheet(k=2, w=24, h=10):
    """Each ground with several fill textures, laid as a big field with the textures in patches."""
    from terrain import all_terrains; TERRAINS = all_terrains()
    ids = [t for t in TERRAINS if TERRAINS[t].groups > 1]
    shots = []
    for tid in ids:
        t = TERRAINS[tid]
        fills = [Image.fromarray(t.fill(i), "RGBA") for i in range(4 * t.groups)]
        im = Image.new("RGBA", (w * T, h * T))
        for y in range(h):
            for x in range(w):
                g = min(t.groups - 1, int(slow_noise(x, y) * t.groups))
                im.alpha_composite(fills[4 * g + tile_hash(x, y, 3) % 4], (x * T, y * T))
        shots.append((f"{tid}: {t.groups} textures", zoom(im, k)))
    pw, ph = shots[0][1].size
    out = Image.new("RGBA", (2 * (pw + 12) + 12, ((len(shots) + 1) // 2) * (ph + 34) + 12), (28, 24, 38, 255))
    d = ImageDraw.Draw(out)
    for i, (label, im) in enumerate(shots):
        x, y = 12 + (i % 2) * (pw + 12), 12 + (i // 2) * (ph + 34)
        d.text((x, y), label, fill=(240, 220, 160, 255), font=font(15))
        out.paste(im, (x, y + 22))
    return out


if __name__ == "__main__":
    main(sys.argv[1:])
