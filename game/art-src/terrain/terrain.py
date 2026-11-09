"""Battle terrain tiles for the live battles, placed pixel by pixel from designed palettes and small stamps.

Every area terrain gets:
  <id>.png       4x4 tiles of 16x16 for the "dual grid": tile i is drawn on a cell centred where four map
                 tiles meet, i = which of its corners are this terrain (north-west 1, north-east 2,
                 south-west 4, south-east 8); tile i sits at column i % 4, row i // 4. See-through outside
                 the terrain's shape (the game draws the theme's ground under it). See corners.py.
  <id>_fill.png  4 middle tiles side by side, opaque (variety inside big areas). For an animated terrain:
                 the 4 animation frames of middle tile 0 instead.
Animated terrains also get <id>_anim.png (the 4x4 sheet for each of the 4 frames, side by side, 256x64)
and <id>_fill_anim.png (the 4 middle-tile variants down, their 4 frames across, 64x64).

How each terrain looks is a recipe below: a quiet surface every tile shares (it repeats with no seam), the
distinctive details drawn inside each tile separately (so big areas don't show a grid), and an edge style
(level ground, a dip, a low bump, a cliff, a liquid with banks). The light comes from the top left; we look
down at the same three-quarter angle as the creatures, so raised things show their south face and cast their
shadow to the lower right, and dips show their far (north) bank.

    .venv/Scripts/python game/art-src/terrain/terrain.py build [id ...] [--aseprite]
    .venv/Scripts/python game/art-src/terrain/terrain.py preview [id ...]
"""

from __future__ import annotations

import math
import sys
import zlib
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from corners import E as EXT, blocky, organic  # noqa: E402
from edges import BIG  # noqa: E402
from pix import (T, Spots, blank, fbm, hx, mix, put, quantize, ramp, stamp)  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / "web" / "game-art" / "battle" / "terrain"

SHADOW = hx("#140a26", 118)       # cast shadow, see-through so it darkens whatever ground is under it
SHADOW_SOFT = hx("#140a26", 60)


def rng_for(*parts) -> np.random.Generator:
    return np.random.default_rng(zlib.crc32("/".join(str(p) for p in parts).encode()))


def ri(rng, a: int, b: int) -> int:
    """Random int a..b inclusive."""
    return int(rng.integers(a, b + 1))


def chance(rng, p: float) -> bool:
    return rng.random() < p


# ---------- the shared machinery ----------

class Terrain:
    id = ""
    frames = 1
    margin = {"N": 2, "E": 2, "S": 2, "W": 2}
    amp = 1
    radius = 4.5
    detail_gap = 3   # details keep this far from the edge of the shape

    def base(self, frame: int) -> np.ndarray:
        raise NotImplementedError

    def details(self, img, rng, ok, frame: int, variant: int) -> None:
        pass

    groups = 1   # fill textures: tiles 4g..4g+3 of the fill strip are texture g (0 = the plain one)
    salt = 0     # which tile is being drawn: each gets its own flecks (single flecks never make a seam)

    def fill(self, variant: int, frame: int = 0) -> np.ndarray:
        self.salt = ("fill", variant)
        img = self.base(frame)
        g, v = divmod(variant, 4)
        rng = rng_for(self.id, "fill", variant)
        if g == 0:
            self.details(img, rng, np.ones((T, T), bool), frame, v)
        else:
            self.group(img, rng, frame, g, v)
        return img

    def group(self, img, rng, frame: int, g: int, v: int) -> None:
        """Fill texture g (1, 2, ...): drawn over the shared surface, nothing crossing the tile's border, so a
        patch of one texture meets the others with no seam."""

    organic = True   # smooth outlines (marching squares); False: square, tile-shaped ones (walls, bridges)
    m_org = 1.5      # how far a smooth outline pulls back from the half-way line, in px

    def shape(self, mask: int):
        """The terrain's outline in a drawn cell whose corners that are this terrain are `mask` (NW 1, NE 2,
        SW 4, SE 8); see corners.py."""
        if self.organic:
            return organic(mask, self.m_org, rng_for(self.id, "shape", mask))
        return blocky(mask, self.margin, lambda b: rng_for(self.id, "shape", b), self.amp, self.radius)

    def edge(self, bits: int, frame: int = 0) -> np.ndarray:
        if bits == 15:
            return self.fill(0, frame)
        if bits == 0:
            return blank()
        sh = self.shape(bits)
        self.salt = ("edge", bits)
        img = self.base(frame)
        # edge tiles get the plain variant (0): a long straight edge repeats one tile, so nothing eye-catching
        self.details(img, rng_for(self.id, "edge", bits), sh.d >= self.detail_gap, frame, 0)
        self.rim(img, sh, frame)
        for y in range(T):
            for x in range(T):
                if not sh.ins[y, x]:
                    img[y, x] = 0
        self.outside(img, sh, frame)
        return img

    def rim(self, img, sh: Shape, frame: int) -> None:
        """Shade the terrain's own pixels near its edge."""

    def outside(self, img, sh: Shape, frame: int) -> None:
        """Paint on the see-through part next to the terrain (shadows, bits poking out)."""

    def sheet(self, frame: int = 0) -> np.ndarray:
        s = blank(4 * T, 4 * T)
        for i in range(16):
            s[(i // 4) * T:(i // 4 + 1) * T, (i % 4) * T:(i % 4 + 1) * T] = self.edge(i, frame)
        return s

    def fill_strip(self) -> np.ndarray:
        n = 4 if self.frames > 1 else 4 * self.groups
        s = blank(n * T, T)
        for k in range(n):
            s[:, k * T:(k + 1) * T] = self.fill(0, k) if self.frames > 1 else self.fill(k)
        return s


def each(sh: Shape):
    for y in range(T):
        for x in range(T):
            if sh.ins[y, x]:
                yield x, y


def paint_base(noise_cuts, cols, rng, octaves=((2, 0.55), (4, 0.3), (8, 0.15)), dither=0.18) -> np.ndarray:
    n = fbm(rng, octaves)
    q = quantize(n, noise_cuts, dither=dither)
    img = blank()
    for y in range(T):
        for x in range(T):
            img[y, x] = cols[q[y, x]]
    return img


def speckle_base(rng, main, specks) -> np.ndarray:
    """A plain surface with small flecks of nearby tones (1-2 px clumps). It has no large shapes, so when the
    tile repeats the eye doesn't catch a pattern. specks: (colour, share of the tile, clump size 1 or 2)."""
    img = blank()
    img[:, :] = main
    for col, share, clump in specks:
        for _ in range(int(share * T * T / clump)):
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            put(img, x, y, col, True)
            if clump >= 2:
                if chance(rng, 0.7):
                    put(img, x + 1, y, col, True)
                else:
                    put(img, x, y + 1, col, True)
    return img


def rim_dip(img, sh, pal, deep=1, mid=2, lit=5, side=4) -> None:
    """Ground a touch lower than what's around it: the far (north) and west rims in shade, the near rims lit."""
    for x, y in each(sh):
        if sh.dN[y, x] == 1 or sh.dW[y, x] == 1:
            img[y, x] = pal[deep]
        elif sh.dN[y, x] == 2:
            img[y, x] = pal[mid]
        elif sh.dS[y, x] == 1:
            img[y, x] = pal[lit]
        elif sh.dE[y, x] == 1:
            img[y, x] = pal[side]


def rim_bump(img, sh, pal, top=6, under=1, under2=2, east=2, west=5) -> None:
    """A low bump (grass, snow, moss): the top rim catches light, the south rim is its shaded underside."""
    for x, y in each(sh):
        if sh.dS[y, x] == 1:
            img[y, x] = pal[under]
        elif sh.dS[y, x] == 2:
            img[y, x] = pal[under2]
        elif sh.dN[y, x] == 1:
            img[y, x] = pal[top]
        elif sh.dE[y, x] == 1:
            img[y, x] = pal[east]
        elif sh.dW[y, x] == 1:
            img[y, x] = pal[west]


def drop_shadow(img, sh: Shape, reach: int = 1, soft: bool = True) -> None:
    """Shadow on the ground to the right of and below a raised terrain (the light comes from the top left)."""
    for y in range(T):
        for x in range(T):
            if sh.ins[y, x]:
                continue
            if any(sh.inside(x - k, y) or sh.inside(x, y - k) or sh.inside(x - k, y - k) for k in range(1, reach + 1)):
                put(img, x, y, SHADOW)
            elif soft and any(sh.inside(x - reach - 1, y) or sh.inside(x, y - reach - 1) for _ in (0,)):
                put(img, x, y, SHADOW_SOFT)


def poke_out(img, sh, rng, cols, p=0.45, up=(1, 2), sides=True) -> None:
    """Blades or leaves poking past the edge of a soft terrain: up out of the north rim, a little out of the sides."""
    for x in range(T):
        for y in range(T):
            if sh.ins[y, x] or not sh.inside(x, y + 1):
                continue
            if chance(rng, p):
                h = ri(rng, *up)
                for k in range(h):
                    put(img, x, y - k, cols[min(k + 1, len(cols) - 1)] if k < h - 1 else cols[-1])
    if sides:
        for y in range(T):
            for x in range(T):
                if sh.ins[y, x]:
                    continue
                if (sh.inside(x - 1, y) or sh.inside(x + 1, y)) and chance(rng, p * 0.3):
                    put(img, x, y, cols[1])


# ---------- stamps (small designed pixel groups; letters are filled in per use) ----------

PEBBLE = [".ab", "abc", "ccs"]
PEBBLE2 = [".aab", "abbc", ".ccs"]
STONE_BIG = [".aab.", "aabbc", "abbcc", ".cccs"]
TWIG = ["ab...", ".bb..", "..bba", "....s"]
CRACK1 = ["c..", ".cc", "...c"]
LEAF = ["ab", "bc"]
LEAF2 = [".a", "ab", "c."]
TINY_FLOWER = [".p.", "pyp", ".p."]
FLOWER_3 = [".p.", "pyp", ".ps"]
FLOWER_2 = ["pp", "ps"]
BUD = ["p", "g"]
CLOVER = [".a.a", "abbb", ".bcc", "..c."]
SHELL = [".ab", "abb", "bcs"]

STONE = ramp("#2a2436 #433c4e #605868 #847a86 #aaa0a4 #d0c8c4")
STONE_MAP = {"a": STONE[4], "b": STONE[3], "c": STONE[2], "s": SHADOW}


def place(img, sp: Spots, rng, rows, cmap, tries=40, pad=1):
    p = sp.place(rng, rows, tries, pad)
    if p:
        stamp(img, p[0], p[1], rows, cmap)
    return p


# ---------- grass ----------

GRASS = ramp("#10262a #173a32 #1f5236 #2a6a3c #3a8443 #559d4b #7db756 #b0d36c")


def blades(img, rng, n: int, pal, wrap=True, ok=None, hmin=2, hmax=3, spread=3) -> None:
    """Little tufts of blades: a dark root with a shadow to its right, a lighter stalk, a lit tip."""
    for _ in range(n):
        x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
        if ok is not None:
            if not (hmax <= y < T and 1 <= x < T - spread) or not ok[y, x] or not ok[y - hmax + 1, x]:
                continue
        count = ri(rng, 1, spread)
        for b in range(count):
            bx = x + b - count // 2
            h = ri(rng, hmin, hmax)
            put(img, bx, y, pal[2], wrap)
            put(img, bx + 1, y, pal[1], wrap)
            for k in range(1, h):
                put(img, bx, y - k, pal[4] if k < h - 1 else pal[5], wrap)
            put(img, bx + (1 if chance(rng, 0.3) else 0), y - h, pal[6] if chance(rng, 0.6) else pal[5], wrap)


class Grass(Terrain):
    id = "grass"
    pal = GRASS
    margin = {"N": 3, "E": 2, "S": 2, "W": 2}

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        return speckle_base(rng, self.pal[3], [(self.pal[2], 0.22, 2), (self.pal[4], 0.12, 2), (self.pal[1], 0.03, 1)])

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant != 0:  # a darker clump of thicker grass
            clump = [".dddd.", "dddddd", ".dddd."]
            p = sp.place(rng, clump, pad=0)
            if p:
                stamp(img, p[0], p[1], clump, {"d": self.pal[2]})
                sp.ok[p[1]:p[1] + 3, p[0]:p[0] + 6] = ok[p[1]:p[1] + 3, p[0]:p[0] + 6]
        if variant == 1:
            for _ in range(2):
                place(img, sp, rng, TINY_FLOWER, {"p": hx("#f2eee0"), "y": hx("#f4c84a")})
        elif variant == 2:
            place(img, sp, rng, PEBBLE, STONE_MAP)
        elif variant == 3:
            place(img, sp, rng, CLOVER, {"a": self.pal[6], "b": self.pal[5], "c": self.pal[2]})
            place(img, sp, rng, BUD, {"p": hx("#f4c84a"), "g": self.pal[2]})
        blades(img, rng, 9, self.pal, wrap=False, ok=sp.ok)

    def rim(self, img, sh, frame):
        rim_bump(img, sh, self.pal, top=5, under=1, under2=2, east=2, west=4)

    def outside(self, img, sh, frame):
        poke_out(img, sh, rng_for(self.id, "poke", sh.bits), [self.pal[2], self.pal[4], self.pal[5], self.pal[6]])
        for y in range(T):
            for x in range(T):
                if not sh.ins[y, x] and sh.inside(x, y - 1):
                    put(img, x, y, SHADOW_SOFT)


# ---------- dirt ----------

DIRT = ramp("#24161e #3a2228 #52302c #6c4232 #88583c #a4724a #bf8f5e #d8ae7a")


class Dirt(Terrain):
    id = "dirt"
    pal = DIRT

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        return speckle_base(rng, self.pal[3], [(self.pal[2], 0.2, 2), (self.pal[4], 0.16, 2), (self.pal[5], 0.04, 1),
                                               (self.pal[1], 0.04, 1)])

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant != 0:  # a slightly damper patch
            damp = [".ddd.", "ddddd", ".ddd."]
            p = sp.place(rng, damp, pad=0)
            if p:
                stamp(img, p[0], p[1], damp, {"d": self.pal[2]})
                sp.ok[p[1]:p[1] + 3, p[0]:p[0] + 5] = ok[p[1]:p[1] + 3, p[0]:p[0] + 5]
        for _ in range(2):
            place(img, sp, rng, ["ab", "bs"], {"a": self.pal[6], "b": self.pal[4], "s": SHADOW})
        if variant == 1:
            place(img, sp, rng, CRACK1, {"c": self.pal[1]})
            place(img, sp, rng, PEBBLE, STONE_MAP)
        elif variant == 2:
            place(img, sp, rng, STONE_BIG, STONE_MAP)
        else:
            place(img, sp, rng, TWIG, {"a": self.pal[6], "b": self.pal[5], "s": SHADOW})
            place(img, sp, rng, ["ab", "bs"], {"a": self.pal[6], "b": self.pal[4], "s": SHADOW})

    def rim(self, img, sh, frame):
        rim_dip(img, sh, self.pal, deep=1, mid=2, lit=5, side=4)


# ---------- sand ----------

SAND = ramp("#5a3a3a #7c5444 #a0744e #c0945c #d4ac6a #e4c482 #f2dca2 #fbf0cc")


def ripple(img, rng, sp: Spots, pal_dark, pal_lit, length=(5, 9)):
    """A short curved wind ripple: a shaded line with a lit line above it."""
    n = ri(rng, *length)
    rows = []
    bend = [0] * n
    mid = n // 2
    for i in range(n):
        bend[i] = 1 if abs(i - mid) <= n // 4 else 0
    h = 3
    grid = [["."] * n for _ in range(h)]
    for i in range(n):
        y = 1 + bend[i]
        grid[y][i] = "d"
        if 0 < i < n - 1:
            grid[y - 1][i] = "l"
    rows = ["".join(r) for r in grid]
    place(img, sp, rng, rows, {"d": pal_dark, "l": pal_lit}, pad=1)


class Sand(Terrain):
    id = "sand"
    pal = SAND
    amp = 1

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        return speckle_base(rng, self.pal[4], [(self.pal[3], 0.18, 2), (self.pal[5], 0.12, 2), (self.pal[6], 0.03, 1),
                                               (self.pal[2], 0.025, 1)])

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        for _ in range(1 if variant in (1, 3) else 0):  # a ripple here and there; the dunes texture has more
            ripple(img, rng, sp, self.pal[2], self.pal[6])
        if variant == 1:
            place(img, sp, rng, PEBBLE, STONE_MAP)
        elif variant == 2:
            place(img, sp, rng, SHELL, {"a": hx("#fbe8e0"), "b": hx("#f0b8a8"), "c": hx("#c07a78"), "s": SHADOW})
            ripple(img, rng, sp, self.pal[2], self.pal[6], (4, 6))
        elif variant == 3:
            for _ in range(2):
                place(img, sp, rng, ["ab", "bs"], {"a": self.pal[5], "b": self.pal[1], "s": SHADOW})

    def rim(self, img, sh, frame):
        rim_dip(img, sh, self.pal, deep=2, mid=3, lit=6, side=5)


# ---------- snow ----------

SNOW = ramp("#2a3460 #3c4c80 #5a6ea0 #7e94c0 #a8bedc #cad8ec #e6eef8 #ffffff")
SNOW_SHADOW = hx("#2a3a80", 90)


class Snow(Terrain):
    id = "snow"
    pal = SNOW
    margin = {"N": 2, "E": 2, "S": 2, "W": 2}
    radius = 5.0

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        return speckle_base(rng, self.pal[6], [(self.pal[5], 0.26, 2), (self.pal[4], 0.05, 1), (self.pal[7], 0.05, 1)])

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        drift = [".llll.", "lwwwwl", "wwwwwm", ".mmmm."]
        place(img, sp, rng, ["l", "w"], {"l": self.pal[7], "w": self.pal[5]})
        if variant == 0:
            place(img, sp, rng, ["ll.", "wwm"], {"l": self.pal[7], "w": self.pal[6], "m": self.pal[4]})
        elif variant == 3:
            place(img, sp, rng, drift, {"l": self.pal[7], "w": self.pal[6], "m": self.pal[4]})
        if variant == 1:
            place(img, sp, rng, ["l.", "dl", "ds"], {"l": hx("#c8a868"), "d": hx("#8a6a3e"), "s": SNOW_SHADOW})  # dry stalks
            place(img, sp, rng, [".ab", "abs"], {"a": STONE[4], "b": STONE[2], "s": SNOW_SHADOW})  # a rock's tip
            place(img, sp, rng, ["ww", "mm"], {"w": self.pal[7], "m": self.pal[4]})
        elif variant == 2:
            for _ in range(2):  # little hollows pressed into the snow
                place(img, sp, rng, ["mm", "lw"], {"m": self.pal[3], "l": self.pal[4], "w": self.pal[7]})
        elif variant == 3:
            place(img, sp, rng, PEBBLE, {"a": STONE[3], "b": STONE[2], "c": STONE[1], "s": SNOW_SHADOW})

    def rim(self, img, sh, frame):
        rim_bump(img, sh, self.pal, top=7, under=3, under2=4, east=4, west=6)

    def outside(self, img, sh, frame):
        for y in range(T):
            for x in range(T):
                if sh.ins[y, x]:
                    continue
                if sh.inside(x, y - 1) or sh.inside(x - 1, y):
                    put(img, x, y, SNOW_SHADOW)


# ---------- ash ----------

ASH = ramp("#141018 #1e1820 #2a222a #382e34 #463a3e #584a4a #6e5e5a #8a7a70")
GLOW = ramp("#3a0c10 #5a1410 #8e2410 #c8420e #f07a18 #ffb83a #ffe88a #fffbe0")


class Ash(Terrain):
    id = "ash"
    pal = ASH

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        return speckle_base(rng, self.pal[3], [(self.pal[2], 0.24, 2), (self.pal[4], 0.16, 2), (self.pal[6], 0.03, 1),
                                               (self.pal[1], 0.04, 1)])

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        cinder = {"a": self.pal[5], "b": self.pal[2], "c": self.pal[1], "s": SHADOW}
        for _ in range(2):
            place(img, sp, rng, ["ab"], {"a": self.pal[6], "b": self.pal[5]})
        if variant == 0:
            place(img, sp, rng, PEBBLE, cinder)
        elif variant == 1:  # a crack with a dull ember glow deep inside
            place(img, sp, rng, ["c....", ".cgc.", "...gc"], {"c": self.pal[0], "g": GLOW[1]})
        elif variant == 2:
            place(img, sp, rng, PEBBLE2, cinder)
            place(img, sp, rng, ["w"], {"w": self.pal[7]})
        else:
            for _ in range(3):
                place(img, sp, rng, ["ab"], {"a": self.pal[6], "b": self.pal[5]})

    def rim(self, img, sh, frame):
        rim_dip(img, sh, self.pal, deep=1, mid=2, lit=5, side=4)


# ---------- cave floor ----------

CAVE = ramp("#0f0e1c #18182c #22223c #2e2e4c #3c3c5c #4e4e6e #646482 #807e98")


class CaveFloor(Terrain):
    id = "cave_floor"
    pal = CAVE

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        img = speckle_base(rng, self.pal[3], [(self.pal[2], 0.24, 2), (self.pal[4], 0.16, 2)])
        for _ in range(6):  # grit: a lit fleck with its shadow
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            put(img, x, y, self.pal[5], True)
            put(img, x + 1, y + 1, self.pal[1], True)
        return img

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        rock = {"a": self.pal[6], "b": self.pal[4], "c": self.pal[2], "s": SHADOW}
        if variant == 0:
            place(img, sp, rng, PEBBLE2, rock)
        elif variant == 1:
            place(img, sp, rng, ["l...", "cl..", ".ccl", "...c"], {"c": self.pal[0], "l": self.pal[5]})
        elif variant == 2:
            place(img, sp, rng, ["a.", "bc"], {"a": hx("#9ae8ff"), "b": hx("#3a8ad0"), "c": hx("#22427a")})
            place(img, sp, rng, PEBBLE, rock)
        else:
            place(img, sp, rng, [".dd.", "dhdd", ".dd."], {"d": self.pal[1], "h": self.pal[5]})  # a damp spot

    def rim(self, img, sh, frame):
        rim_dip(img, sh, self.pal, deep=1, mid=2, lit=5, side=4)


# ---------- tall grass ----------

TALL = ramp("#0b1e22 #12302c #1a442e #235a32 #307238 #43893e #62a447 #8ec25a #c0dc78")


class TallGrass(Terrain):
    id = "tall_grass"
    pal = TALL
    margin = {"N": 4, "E": 2, "S": 1, "W": 2}
    radius = 4.0

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        img = blank()
        img[:, :] = self.pal[2]
        n = fbm(rng)
        for y in range(T):
            for x in range(T):
                if n[y, x] > 0.65:
                    img[y, x] = self.pal[1]
        # long blades, drawn root first so later ones overlap: dark root, a body that lightens, a lit tip
        for _ in range(26):
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            h = ri(rng, 4, 7)
            lean = 1 if chance(rng, 0.5) else -1
            for k in range(h):
                xx = x + (lean if k >= h - 2 and chance(rng, 0.6) else 0)
                c = self.pal[3] if k < 2 else self.pal[4] if k < h - 2 else self.pal[6] if k < h - 1 else self.pal[7]
                put(img, xx, y - k, c, True)
            put(img, x + 1, y, self.pal[1], True)
        return img

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 1:
            for _ in range(2):  # seed heads
                place(img, sp, rng, ["s", "s", "g"], {"s": hx("#e8d890"), "g": self.pal[5]})
        elif variant == 2:
            place(img, sp, rng, [".p.", "pyp", ".g."], {"p": hx("#b896f0"), "y": hx("#fff0a0"), "g": self.pal[4]})
        elif variant == 3:
            place(img, sp, rng, ["t..", ".t.", "..t", "..t"], {"t": self.pal[8]})  # a long bent blade catching light

    def rim(self, img, sh, frame):
        for x, y in each(sh):
            if sh.dS[y, x] == 1:
                img[y, x] = self.pal[0]
            elif sh.dS[y, x] == 2:
                img[y, x] = self.pal[1]
            elif sh.dE[y, x] == 1:
                img[y, x] = self.pal[1]

    def outside(self, img, sh, frame):
        rng = rng_for(self.id, "poke", sh.bits)
        # tall blades sticking up out of the north edge, and out of the sides
        for x in range(T):
            for y in range(T):
                if sh.ins[y, x] or not sh.inside(x, y + 1):
                    continue
                if chance(rng, 0.6):
                    h = ri(rng, 2, 4)
                    for k in range(h):
                        put(img, x, y - k, self.pal[7] if k == h - 1 else self.pal[5] if k else self.pal[4])
        for y in range(T):
            for x in range(T):
                if sh.ins[y, x]:
                    continue
                if (sh.inside(x - 1, y) or sh.inside(x + 1, y)) and chance(rng, 0.25) and y % 2 == 0:
                    put(img, x, y, self.pal[5])
                    put(img, x, y - 1, self.pal[7])
                elif sh.inside(x, y - 1) or sh.inside(x - 1, y - 1):
                    put(img, x, y, SHADOW)


# ---------- flowers ----------

LEAFY = ramp("#0e2426 #163a2e #1e5232 #2a6a36 #3a823c #529a44 #74b450")
PETALS = [
    (hx("#e83a5a"), hx("#ff8aa0")),   # red
    (hx("#f4c030"), hx("#fff09a")),   # yellow
    (hx("#ece8f4"), hx("#ffffff")),   # white
    (hx("#7a5ae0"), hx("#b8a4ff")),   # violet
    (hx("#ff7a3a"), hx("#ffc07a")),   # orange
]


def flower(img, sp, rng, kind, centre=hx("#ffe070")):
    dark, light = PETALS[kind]
    style = ri(rng, 0, 2)
    if style == 0:
        rows, cm = [".l.", "dcl", ".d."], {"l": light, "d": dark, "c": centre}
    elif style == 1:
        rows, cm = ["ld", "dd"], {"l": light, "d": dark}
    else:
        rows, cm = [".l.", "lcd", ".d.", ".g."], {"l": light, "d": dark, "c": centre, "g": LEAFY[2]}
    return place(img, sp, rng, rows, cm, pad=0)


class Flowers(Terrain):
    id = "flowers"
    pal = LEAFY
    margin = {"N": 3, "E": 2, "S": 2, "W": 2}
    detail_gap = 2
    mixes = [(0, 1, 2), (3, 2, 1), (4, 1, 0), (2, 3, 0)]

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        img = paint_base([0.3, 0.8], [self.pal[2], self.pal[3], self.pal[4]], rng, dither=0.2)
        # leaves: small lit-topped clumps
        for _ in range(14):
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            put(img, x, y, self.pal[5], True)
            put(img, x + 1, y, self.pal[4], True)
            put(img, x, y + 1, self.pal[2], True)
            put(img, x + 1, y + 1, self.pal[1], True)
        return img

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        kinds = self.mixes[variant % 4]
        for i in range(7):
            flower(img, sp, rng, kinds[i % 3] if i < 5 else kinds[0])

    def rim(self, img, sh, frame):
        rim_bump(img, sh, self.pal, top=5, under=1, under2=2, east=2, west=4)

    def outside(self, img, sh, frame):
        poke_out(img, sh, rng_for(self.id, "poke", sh.bits), [self.pal[2], self.pal[4], self.pal[5]], p=0.4, up=(1, 2))
        for y in range(T):
            for x in range(T):
                if not sh.ins[y, x] and sh.inside(x, y - 1):
                    put(img, x, y, SHADOW)


# ---------- forest floor ----------

LOAM = ramp("#120c12 #1c1418 #281c1c #362620 #463226 #58402c")
LEAVES = [hx("#4a2a1e"), hx("#6a3c22"), hx("#8a5428"), hx("#a8723a")]
MOSS = ramp("#1a3024 #24442a #33602e #4a7c34")


class ForestFloor(Terrain):
    id = "forest_floor"
    pal = LOAM

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        return speckle_base(rng, self.pal[2], [(self.pal[1], 0.2, 2), (self.pal[3], 0.2, 2), (self.pal[4], 0.04, 1)])

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 1:  # a cushion of moss, lit along its top
            moss = ["..llll..", ".lmmmml.", "mmmmmmmd", ".mmmmdd.", "..dddd.."]
            place(img, sp, rng, moss, {"l": MOSS[3], "m": MOSS[2], "d": MOSS[1]})
        elif variant == 2:  # a little toadstool
            place(img, sp, rng, [".rr.", "rwrr", ".ss.", ".sd."],
                  {"r": hx("#c83a3a"), "w": hx("#f4e8e0"), "s": hx("#e4d4c0"), "d": SHADOW})
        elif variant == 3:  # a fern sprig and a twig
            place(img, sp, rng, ["g...g", ".g.g.", "lgggl", ".g.g.", "g...g"], {"g": MOSS[2], "l": MOSS[3]})
            place(img, sp, rng, TWIG, {"a": hx("#8a6a4a"), "b": hx("#5a3e2c"), "s": SHADOW})
        # leaf litter: each leaf lit on its upper left, with a dark fleck of shadow
        shapes = [[".aa", "abc", "cc."], ["aab", ".bc"], [".a.", "abc", ".c."], ["ab", "bc"]]
        for _ in range(7 if variant == 0 else 5):
            c = ri(rng, 0, 2)
            place(img, sp, rng, shapes[ri(rng, 0, 3)],
                  {"a": LEAVES[c + 1], "b": LEAVES[c], "c": mix(LEAVES[c], self.pal[0], 0.4), "s": self.pal[0]}, pad=0)
        if variant == 0:
            place(img, sp, rng, ["ab..", ".bb.", "..bs"], {"a": hx("#8a6a4a"), "b": hx("#5a3e2c"), "s": SHADOW})

    def rim(self, img, sh, frame):
        rim_dip(img, sh, self.pal, deep=0, mid=1, lit=5, side=4)

    def outside(self, img, sh, frame):
        rng = rng_for(self.id, "litter", sh.bits)
        for y in range(T):
            for x in range(T):
                if sh.ins[y, x]:
                    continue
                near = sh.inside(x, y + 1) or sh.inside(x, y - 1) or sh.inside(x + 1, y) or sh.inside(x - 1, y)
                if near and chance(rng, 0.12):
                    put(img, x, y, LEAVES[ri(rng, 1, 3)])


# ---------- mud ----------

MUD = ramp("#140e12 #1e1418 #2a1c1c #382620 #463026 #563c2e #6a4c38")
MUD_GLOSS = [hx("#5a5060"), hx("#7c7484"), hx("#aaa4b4")]


class Mud(Terrain):
    id = "mud"
    pal = MUD

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        return speckle_base(rng, self.pal[3], [(self.pal[2], 0.28, 2), (self.pal[4], 0.12, 2)])

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        pool = {"d": self.pal[1], "g": MUD_GLOSS[0], "h": MUD_GLOSS[1], "w": MUD_GLOSS[2]}
        for _ in range(3):  # wet ridges catching the light
            place(img, sp, rng, ["hh.", ".dd"], {"h": self.pal[5], "d": self.pal[1]}, pad=0)
        if variant == 0:
            place(img, sp, rng, ["dhd"], pool)
        elif variant == 1:
            place(img, sp, rng, [".dd", "dwh", ".dg"], pool)
            place(img, sp, rng, [".o.", "o.o", ".o."], {"o": self.pal[5]})  # a bubble ring
        elif variant == 2:
            for _ in range(2):  # footprints pressed in
                place(img, sp, rng, ["d.d", ".dd", ".d."], {"d": self.pal[1]})
        else:
            place(img, sp, rng, ["..dddd", ".dgghd", "dghwgd", ".ddddd"], pool)
            place(img, sp, rng, [".dddd.", "dghhgd", ".dggd."], pool)

    def rim(self, img, sh, frame):
        rim_dip(img, sh, self.pal, deep=0, mid=1, lit=5, side=4)


# ---------- water ----------

SHALLOW = ramp("#0e2c48 #134060 #18587a #1f7290 #2a8ca2 #44a8b4 #72c6c6 #b4e6de #f0fff8")
BANK = ramp("#160f1c #241a24 #34262c #463430 #5a4436 #70563e")
SWIRL = [(1, 0), (0, 1), (-1, 0), (0, -1)]


def water_body(rng_name, pal, frame, main, specks, salt=0) -> np.ndarray:
    """A calm water surface with faint flecks; the waves are drawn per tile (see waves()) so no pattern repeats."""
    return speckle_base(rng_for(rng_name, "base", salt), pal[main], [(pal[c], share, 2) for c, share in specks])


SWAY = [0, 1, 1, 0]


def waves(img, rng, ok, frame, pal, n, trough, crest, length=(3, 5)):
    """Little wave marks: a dark trough with a lit crest just above it, swaying a pixel back and forth."""
    for _ in range(n):
        L = ri(rng, *length)
        x, y = ri(rng, 0, T - L - 2), ri(rng, 1, T - 1)
        ph = ri(rng, 0, 3)
        if not all(ok[y, x + k] and ok[y - 1, x + k] for k in range(L + 1)):
            continue
        s = SWAY[(frame + ph) % 4]
        for k in range(L):
            put(img, x + s + k, y, pal[trough])
        for k in range(1, L - 1):
            put(img, x + s + k, y - 1, pal[crest])


def ripples(img, rng, ok, frame, pal, n, light, mid, glint):
    """Short light dashes that grow and fade in place, each at its own point in the cycle, and a twinkle."""
    for _ in range(n):
        x, y = ri(rng, 1, T - 6), ri(rng, 1, T - 2)
        ph = ri(rng, 0, 3)
        size = [0, 2, 4, 3][(frame + ph) % 4]
        if not all(ok[y, x + k] for k in range(5)) or not ok[y - 1, x + 2]:
            continue
        if size == 0:
            put(img, x + 2, y, pal[mid])
            continue
        start = x + (4 - size) // 2
        for k in range(size):
            put(img, start + k, y, pal[light] if 0 < k < size - 1 or size == 2 else pal[mid])
        if size == 4:
            put(img, start + 1, y - 1, pal[glint])
    x, y = ri(rng, 2, T - 3), ri(rng, 2, T - 3)
    if ok[y, x] and ok[y - 1, x] and ok[y + 1, x]:
        g = (frame + ri(rng, 0, 3)) % 4
        if g == 0:
            put(img, x, y, pal[glint])
        elif g == 1:
            for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                put(img, x + dx, y + dy, pal[glint] if (dx, dy) == (0, 0) else pal[light])


def banks(img, sh, frame, pal, bank, bank_h=3, foam=True, water_dark=(1, 2), lap=None, shoal=None):
    """A liquid in a dip: the far bank's face in shade along the north edge, thin side banks, a wet lip at
    the near (south) edge."""
    for x, y in each(sh):
        dn, ds, dw, de = sh.dN[y, x], sh.dS[y, x], sh.dW[y, x], sh.dE[y, x]
        if dn <= bank_h:
            img[y, x] = bank[[4, 3, 2, 1, 1][min(dn - 1, 4)]]
            if dn == 1 and dw == 1:
                img[y, x] = bank[3]
        elif dn == bank_h + 1:
            img[y, x] = pal[water_dark[0]]
            if lap is not None and (x * 3 + frame * 2) % 7 == 0:
                img[y, x] = pal[lap]
        elif dn == bank_h + 2:
            img[y, x] = pal[water_dark[1]]
        elif dw == 1:
            img[y, x] = bank[2]
        elif de == 1:
            img[y, x] = bank[4]
        elif ds == 1:
            if foam:
                img[y, x] = pal[-2] if (x + frame * 3) % 6 else pal[-1]
        elif ds == 2 and foam:
            img[y, x] = pal[6]
        elif ds in (3, 4) and shoal is not None and (ds == 3 or (x + y) % 2):
            img[y, x] = pal[shoal]   # the bottom shelves up towards the near shore: paler water
        elif dw == 2:
            img[y, x] = pal[water_dark[1]]


class Shallows(Terrain):
    id = "shallows"
    frames = 4
    pal = SHALLOW
    margin = {"N": 1, "E": 1, "S": 2, "W": 1}
    radius = 4.0

    def base(self, frame):
        return water_body(self.id, self.pal, frame, 4, [(3, 0.12), (5, 0.05)], salt=self.salt)

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 2:  # stones on the bottom, seen through the water
            place(img, sp, rng, PEBBLE2, {"a": self.pal[5], "b": self.pal[4], "c": self.pal[3], "s": self.pal[3]})
            place(img, sp, rng, PEBBLE, {"a": self.pal[5], "b": self.pal[4], "c": self.pal[3], "s": self.pal[3]})
        elif variant == 3:  # a lily pad with its notch, and a bud
            place(img, sp, rng, [".llg.", "lllgg", "lgg.g", ".ggd.", "..dd."],
                  {"g": hx("#3e8a44"), "l": hx("#7cc05a"), "d": hx("#1e5a3a")})
            place(img, sp, rng, ["p", "g"], {"p": hx("#ffb4d0"), "g": hx("#3e8a44")})
        waves(img, rng, sp.ok, frame, self.pal, 4, 3, 5)
        ripples(img, rng, sp.ok, frame, self.pal, 2, 6, 5, 8)

    def rim(self, img, sh, frame):
        banks(img, sh, frame, self.pal, BANK, bank_h=3, lap=6, shoal=5)


DEEP = ramp("#06122a #0a1d40 #0e2b58 #13396e #194982 #205b96 #2c72aa #5294c2 #a2cee6")


class DeepWater(Terrain):
    id = "deep_water"
    frames = 4
    pal = DEEP
    margin = {"N": 1, "E": 1, "S": 1, "W": 1}
    radius = 4.0

    def base(self, frame):
        return water_body(self.id, self.pal, frame, 3, [(2, 0.12), (4, 0.06)], salt=self.salt)

    def details(self, img, rng, ok, frame, variant):
        waves(img, rng, ok, frame, self.pal, 3 + variant % 2, 2, 5, (4, 6))
        ripples(img, rng, ok, frame, self.pal, 1 + variant % 2, 6, 5, 8)

    def rim(self, img, sh, frame):
        # the bottom drops away from the shallows drawn under it: a mid-blue slope, then the deep
        for x, y in each(sh):
            d = sh.d[y, x]
            if d == 1:
                img[y, x] = self.pal[5]
            elif d == 2:
                img[y, x] = self.pal[4]
            if sh.dN[y, x] in (2, 3):
                img[y, x] = self.pal[2]  # the far slope, in shade


# ---------- ice ----------

ICE = ramp("#1a2e5a #26457e #36609e #5084bc #72a6d4 #98c4e4 #c2e0f2 #e8f6fc #ffffff")


class Ice(Terrain):
    id = "ice"
    pal = ICE
    margin = {"N": 1, "E": 1, "S": 2, "W": 1}

    def base(self, frame):
        return speckle_base(rng_for(self.id, "base", self.salt), self.pal[5], [(self.pal[4], 0.16, 2), (self.pal[6], 0.07, 2)])

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 0:
            place(img, sp, rng, ["..w", ".w.", "w.."], {"w": self.pal[7]})
        elif variant == 1:  # a long reflection of the sky
            place(img, sp, rng, ["....wl", "...wl.", "..wl..", ".wl...", "wl...."], {"w": self.pal[8], "l": self.pal[7]})
        elif variant == 2:  # a crack: a dark line with a pale edge
            place(img, sp, rng, ["d....", ".dl..", "..dd.", "...dl", "...d."], {"d": self.pal[2], "l": self.pal[7]})
            place(img, sp, rng, [".w", "w."], {"w": self.pal[7]})
        else:  # bubbles frozen inside
            place(img, sp, rng, [".o.", "o.o", ".o."], {"o": self.pal[7]})
            place(img, sp, rng, ["o"], {"o": self.pal[8]})
            place(img, sp, rng, ["oo", "oo"], {"o": self.pal[6]})

    def rim(self, img, sh, frame):
        for x, y in each(sh):
            dn, ds, dw, de = sh.dN[y, x], sh.dS[y, x], sh.dW[y, x], sh.dE[y, x]
            if dn == 1:
                img[y, x] = SNOW[6]  # frost along the far bank
            elif dn == 2:
                img[y, x] = self.pal[1]
            elif dn == 3:
                img[y, x] = self.pal[3]
            elif dw == 1:
                img[y, x] = self.pal[2]
            elif ds == 1:
                img[y, x] = SNOW[7]
            elif ds == 2:
                img[y, x] = self.pal[6]
            elif de == 1:
                img[y, x] = self.pal[6]


# ---------- high ground ----------

ROCK = ramp("#16111e #241c2c #342a3c #463a4e #5a4c60 #706070 #8a7a86 #a8989e #c8b8b4")


class High(Terrain):
    id = "high"
    pal = ROCK
    margin = {"N": 1, "E": 1, "S": 0, "W": 1}
    face_h = 6
    detail_gap = 2

    def base(self, frame):
        return speckle_base(rng_for(self.id, "base", self.salt), self.pal[5],
                            [(self.pal[4], 0.22, 2), (self.pal[6], 0.12, 2), (self.pal[3], 0.03, 1)])

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        slab = {"a": self.pal[7], "b": self.pal[5], "c": self.pal[3], "s": self.pal[2]}
        crack = {"c": self.pal[2], "l": self.pal[7]}
        if variant == 0:
            place(img, sp, rng, PEBBLE, slab)
            place(img, sp, rng, ["l..", "cc.", "..c"], crack)
        elif variant == 1:  # a flat slab with a lit edge
            place(img, sp, rng, [".aaab.", "abbbbc", "abbbcc", ".cccs."], slab)
        elif variant == 2:  # a tuft growing in a crack
            place(img, sp, rng, ["l.l.", ".gl.", "gggl", "dddd"], {"g": GRASS[4], "l": GRASS[6], "d": self.pal[2]})
            place(img, sp, rng, PEBBLE, slab)
        else:
            place(img, sp, rng, ["l....", "cl...", ".ccl.", "...cc"], crack)
            place(img, sp, rng, STONE_BIG, slab)

    def rim(self, img, sh, frame):
        fh = self.face_h
        rng = rng_for(self.id, "face")
        # the cliff face: rock columns of uneven width, each with its own ledge, lit on the left; the layout
        # repeats every 16 px so a long cliff runs on seamlessly from cell to cell
        cols = {}
        x = 0
        while x < T:
            w = ri(rng, 2, 6)
            ledge = ri(rng, 1, 4) if chance(rng, 0.7) else -9
            drop = ri(rng, 0, 1)
            w = min(w, T - x)
            for k in range(w):
                cols[x + k] = (k, w, ledge, drop)
            x += w
        for x, y in each(sh):
            ds = sh.dS[y, x]
            if ds <= fh:
                t = fh - ds  # 0 at the top of the face
                k, w, ledge, drop = cols.get(x, (1, 3, -9, 0))
                c = [self.pal[5], self.pal[4], self.pal[4], self.pal[3], self.pal[3], self.pal[2], self.pal[2]][min(t, 6)]
                if t == 0 and drop:
                    c = self.pal[4]
                if t == ledge:
                    c = self.pal[2]                                  # a crack across the column
                elif t == ledge + 1:
                    c = self.pal[5] if k < w - 1 else self.pal[3]    # the lit lip below it
                elif k == 0 and t < fh - 1:
                    c = self.pal[6] if t < 3 else self.pal[5]        # the column's lit left edge
                elif k == w - 1:
                    c = self.pal[1]                                  # the dark seam on its right
                if ds == 1:
                    c = self.pal[0]
                img[y, x] = c
            elif ds == fh + 1:
                img[y, x] = self.pal[8] if x % 5 else self.pal[7]
            elif sh.dN[y, x] == 1 or sh.dW[y, x] == 1:
                img[y, x] = self.pal[7]
            elif sh.dE[y, x] == 1:
                img[y, x] = self.pal[3]
            elif sh.dE[y, x] == 2:
                img[y, x] = self.pal[4]

    def outside(self, img, sh, frame):
        drop_shadow(img, sh, 1)


# ---------- cobbles ----------

COBBLE = ramp("#1c1620 #2c242e #40363e #564a50 #6c5e62 #847474 #9e8c88 #b8a69c #d2c2b4")


def cobble_layout(n: int = 6, iters: int = 5):
    """Flagstones that wrap round the tile's edges: points spread evenly (a few rounds of moving each to the
    middle of its patch), then each pixel belongs to its nearest point; pixels about equally near two points are
    the joints. Slabs come out a little wider than tall, as they look from our slanted view."""
    rng = rng_for("cobbles", "flagstones")
    pts = rng.random((n, 2)) * T
    sy = 1.2

    def nearest(x, y):
        ds = []
        for i, (px, py) in enumerate(pts):
            dx = min(abs(x - px), T - abs(x - px))
            dy = min(abs(y - py), T - abs(y - py)) * sy
            ds.append((dx * dx + dy * dy, i))
        ds.sort()
        return ds

    for _ in range(iters):
        acc = [[0.0, 0.0, 0.0, 0.0, 0] for _ in range(n)]
        for y in range(T):
            for x in range(T):
                i = nearest(x + 0.5, y + 0.5)[0][1]
                a = acc[i]
                for k, v in ((0, x + 0.5), (2, y + 0.5)):  # circular mean so slabs can wrap
                    ang = v / T * 2 * math.pi
                    a[k] += math.cos(ang)
                    a[k + 1] += math.sin(ang)
                a[4] += 1
        for i, a in enumerate(acc):
            if a[4]:
                pts[i, 0] = (math.atan2(a[1], a[0]) / (2 * math.pi) * T) % T
                pts[i, 1] = (math.atan2(a[3], a[2]) / (2 * math.pi) * T) % T
    owner = np.full((T, T), -1)
    for y in range(T):
        for x in range(T):
            ds = nearest(x + 0.5, y + 0.5)
            if math.sqrt(ds[1][0]) - math.sqrt(ds[0][0]) > 0.9:
                owner[y, x] = ds[0][1]
    return owner


class Cobbles(Terrain):
    """Old flagstones: big flat slabs with a lit top edge, a shaded lower edge and dark joints. A big plaza
    should look calm, so the slabs are plain; the variety is in the details (a stained slab, a crack, moss)."""
    id = "cobbles"
    pal = COBBLE
    detail_gap = 2

    def __init__(self):
        self.owner = cobble_layout()
        rng = rng_for(self.id, "tones")
        self.tone = {i: ri(rng, 5, 6) for i in range(int(self.owner.max()) + 1)}
        self.grain = rng_for(self.id, "grain").random((T, T))

    def stone_at(self, x, y):
        o = self.owner[y % T, x % T]
        return None if o < 0 else int(o)

    def slab_colour(self, x, y, t):
        s = self.stone_at(x, y)
        up = self.stone_at(x, y - 1) != s
        lf = self.stone_at(x - 1, y) != s
        dn = self.stone_at(x, y + 1) != s
        rt = self.stone_at(x + 1, y) != s
        if dn:
            return self.pal[t - 2]           # the shaded lower edge
        if up:
            return self.pal[t + 2] if not rt else self.pal[t + 1]   # the lit top edge
        if lf:
            return self.pal[t + 1]
        if rt:
            return self.pal[t - 1]
        g = self.grain[y % T, x % T]     # a faint grain in the stone
        return self.pal[t - 1] if g < 0.1 else self.pal[t + 1] if g > 0.95 else self.pal[t]

    def base(self, frame):
        img = blank()
        for y in range(T):
            for x in range(T):
                s = self.stone_at(x, y)
                if s is None:
                    under = self.stone_at(x, y - 1) is not None
                    img[y, x] = self.pal[1] if under else self.pal[2]   # the joint, in shade under a slab
                else:
                    img[y, x] = self.slab_colour(x, y, self.tone[s])
        return img

    def inner_slabs(self):
        """Slabs wholly inside the tile (changing one of these never shows a seam)."""
        out = []
        for pts in self.pieces():
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            if min(xs) > 0 and max(xs) < T - 1 and min(ys) > 0 and max(ys) < T - 1:
                out.append(pts)
        return sorted(out, key=len, reverse=True)

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        inner = self.inner_slabs()
        if variant == 1 and inner:  # a weathered, darker slab
            pts = inner[0]
            for x, y in pts:
                if ok[y, x]:
                    img[y, x] = self.slab_colour(x, y, self.tone[self.stone_at(x, y)] - 1)
        elif variant == 2:  # a crack across a slab, and moss in some joints
            place(img, sp, rng, ["c...", ".cc.", "...c"], {"c": self.pal[2]})
            for y in range(T):
                for x in range(T):
                    if ok[y, x] and self.stone_at(x, y) is None and (x * 7 + y * 3) % 6 == 0:
                        img[y, x] = MOSS[2] if (x + y) % 2 else MOSS[3]
        elif variant == 3 and inner:  # a slab's corner broken off, earth and a tuft of grass in the gap
            pts = sorted(inner[-1] if len(inner) > 1 else inner[0], key=lambda p: (-p[1], -p[0]))[:6]
            for x, y in pts:
                if ok[y, x]:
                    img[y, x] = DIRT[2]
            x, y = pts[0]
            if ok[y, x]:
                img[y, x] = GRASS[4]
                if y > 0:
                    img[y - 1, x] = GRASS[6]

    def pieces(self):
        """Each slab's pixels in this tile, split where a slab wraps round the tile's side."""
        seen = np.zeros((T, T), bool)
        out = []
        for y in range(T):
            for x in range(T):
                s = self.stone_at(x, y)
                if s is None or seen[y, x]:
                    continue
                stack, pts = [(x, y)], []
                seen[y, x] = True
                while stack:
                    cx, cy = stack.pop()
                    pts.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < T and 0 <= ny < T and not seen[ny, nx] and self.stone_at(nx, ny) == s:
                            seen[ny, nx] = True
                            stack.append((nx, ny))
                out.append(pts)
        return out

    def edge(self, bits, frame=0):
        """Paving with a broken edge: a slab mostly outside the shape is gone; the others are cut along the
        shape, their broken edges shaded like the slab's own edges."""
        if bits == 15:
            return self.fill(0, frame)
        sh = self.shape(bits)
        img = self.base(frame)
        self.details(img, rng_for(self.id, "edge", bits), sh.d >= self.detail_gap, frame, 0)
        keep = np.zeros((T, T), bool)
        for pts in self.pieces():
            inside = sum(1 for x, y in pts if sh.ins[y, x])
            if inside >= 0.5 * len(pts):
                for x, y in pts:
                    if sh.ins[y, x]:
                        keep[y, x] = True
        for y in range(T):  # a joint stays where it lies between kept slabs or well inside the shape
            for x in range(T):
                if self.stone_at(x, y) is not None or not sh.ins[y, x]:
                    continue
                nb = [keep[yy, xx] for xx, yy in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                      if 0 <= xx < T and 0 <= yy < T and self.stone_at(xx, yy) is not None]
                if sh.d[y, x] >= 3 or (len(nb) >= 2 and all(nb)):
                    keep[y, x] = True
        for y in range(T):
            for x in range(T):
                if not keep[y, x]:
                    img[y, x] = 0
                    continue
                if self.stone_at(x, y) is None:
                    continue
                t = self.tone[self.stone_at(x, y)]
                if (y + 1 < T and not keep[y + 1, x]) or (x + 1 < T and not keep[y, x + 1]):
                    img[y, x] = self.pal[t - 2]       # a broken edge, in shade
                elif (y > 0 and not keep[y - 1, x]) or (x > 0 and not keep[y, x - 1]):
                    img[y, x] = self.pal[t + 1]       # a broken edge catching the light
        for y in range(T):  # a soft shadow below and right of the paving's edge
            for x in range(T):
                if not keep[y, x] and ((y > 0 and keep[y - 1, x]) or (x > 0 and keep[y, x - 1])):
                    put(img, x, y, SHADOW_SOFT)
        return img


# ---------- crystals (animated) ----------

CRYST = ramp("#120c2a #1c1644 #262468 #2c3c96 #3460c0 #4290e0 #6cc4f4 #b4ecff #ffffff")
CRYST_FLOOR = ramp("#0c0a18 #141228 #1c1a38 #262446 #322e56 #403c6a")
PINK = ramp("#3a1050 #6a1e80 #a03ab0 #d468d8 #f4a8f0")
PINK_CRYST = [PINK[0], PINK[0], PINK[1], PINK[1], PINK[2], PINK[3], PINK[3], PINK[4], hx("#ffffff")]


def shard(img, x, y, h, w, frame, ph, pal, lean=0):
    """A crystal shard standing up from its foot at (x, y): a lit left face, a bright ridge, a dark right face,
    narrowing to a point. A glint climbs the ridge over the 4 frames."""
    ridge = w // 2
    for k in range(h):
        yy = y - k
        dx = (lean * k) // 4
        if k == h - 1:
            left = right = ridge
        elif k == h - 2:
            left, right = max(0, ridge - 1), min(w - 1, ridge + (1 if w > 3 else 0))
        else:
            left, right = 0, w - 1
        for i in range(left, right + 1):
            if i < ridge:
                c = pal[6] if i == 0 else pal[5]
            elif i == ridge:
                c = pal[7]
            else:
                c = pal[3] if i == w - 1 else pal[4]
            if k == h - 1:
                c = pal[8] if (frame + ph) % 4 == 0 else pal[7]
            put(img, x + i + dx, yy, c)
    g = (frame + ph) % 4
    if g < 3:
        k = 1 + max(0, h - 3) * g // 2
        put(img, x + ridge + (lean * k) // 4, y - k, pal[8])


class Crystals(Terrain):
    id = "crystals"
    frames = 4
    pal = CRYST
    detail_gap = 2

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        img = speckle_base(rng, CRYST_FLOOR[2], [(CRYST_FLOOR[1], 0.22, 2), (CRYST_FLOOR[3], 0.18, 2), (CRYST_FLOOR[4], 0.04, 1)])
        for _ in range(4):  # chips of crystal in the floor, glinting in turn
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            put(img, x, y, self.pal[6] if (x + y + frame) % 4 == 0 else self.pal[4], True)
        return img

    def cluster(self, img, sp, rng, frame, sizes, pal):
        """A few shards growing from one spot: the tallest in the middle, shorter ones leaning out."""
        xs, x = [], 0
        for h, w, lean in sizes:
            xs.append(x)
            x += w - (1 if w > 2 else 0)
        wmax = x + 2
        hmax = max(h for h, w, lean in sizes) + 1
        p = sp.place(rng, ["x" * wmax] * hmax, pad=0)
        if not p:
            return
        x0, y0 = p
        foot = y0 + hmax - 1
        for i in range(-1, wmax):  # glow on the ground round the foot
            put(img, x0 + i, foot, pal[2] if 0 <= i < wmax - 1 else pal[1])
        put(img, x0 + wmax - 1, foot - 1, SHADOW)
        order = sorted(range(len(sizes)), key=lambda i: sizes[i][0])  # short ones first, the tall drawn over them
        for i in order:
            h, w, lean = sizes[i]
            shard(img, x0 + xs[i], foot - 1, h, w, frame, ri(rng, 0, 3), pal, lean)

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 0:
            self.cluster(img, sp, rng, frame, [(4, 3, -1), (7, 3, 0), (3, 2, 1)], self.pal)
        elif variant == 1:
            self.cluster(img, sp, rng, frame, [(6, 3, -1), (11, 4, 0), (7, 3, 1)], self.pal)
        elif variant == 2:
            self.cluster(img, sp, rng, frame, [(5, 3, -1), (8, 4, 0)], self.pal)
            self.cluster(img, sp, rng, frame, [(6, 3, 0), (4, 2, 1)], self.pal)
        else:
            self.cluster(img, sp, rng, frame, [(6, 3, -1), (9, 4, 0), (5, 3, 1)], PINK_CRYST)

    def rim(self, img, sh, frame):
        for x, y in each(sh):
            if sh.dN[y, x] == 1 or sh.dW[y, x] == 1:
                img[y, x] = CRYST_FLOOR[0]
            elif sh.dS[y, x] == 1 or sh.dE[y, x] == 1:
                img[y, x] = CRYST_FLOOR[4]


# ---------- hot coals (animated) ----------

CHAR = ramp("#0c0809 #160e0e #201412 #2c1a16 #38221a #46301f")
COAL_TOP = [hx("#5a4e54"), hx("#4a3e44")]


class Coals(Terrain):
    id = "coals"
    frames = 4
    pal = CHAR
    detail_gap = 2

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        img = speckle_base(rng, self.pal[3], [(self.pal[2], 0.24, 2), (self.pal[4], 0.16, 2)])
        for _ in range(6):  # embers glowing in the ash between the coals, each pulsing on its own beat
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            ph = ri(rng, 0, 3)
            put(img, x, y, GLOW[[1, 2, 3, 2][(frame + ph) % 4]], True)
        return img

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        lumps = [
            [".ttk..", "tkkkhk", "khGhkk", ".khkks"],
            [".ttk.", "tkhkk", "kGhkk", ".kks."],
            [".tk.", "tkhk", ".hks"],
            [".tt.", "khGk", "kkks"],
        ]
        n = [3, 4, 4, 5][variant]
        for i in range(n):
            ph = ri(rng, 0, 3)
            hot = [2, 3, 4, 3][(frame + ph) % 4]
            rows = lumps[(i + variant) % 4]
            place(img, sp, rng, rows, {"t": COAL_TOP[i % 2], "k": self.pal[1] if i % 2 else self.pal[0],
                                       "h": GLOW[hot], "G": GLOW[hot + 2], "s": SHADOW}, pad=0)
        x, y = ri(rng, 3, T - 4), ri(rng, 7, T - 2)  # a spark drifting up
        sy = y - ((frame + variant) % 4) * 2
        if ok[y, x] and 0 <= sy < T and ok[sy, x]:
            put(img, x, sy, GLOW[6] if (frame + variant) % 4 < 2 else GLOW[5])

    def rim(self, img, sh, frame):
        rim_dip(img, sh, self.pal, deep=0, mid=1, lit=4, side=3)


# ---------- lava (animated) ----------

CRUST = ramp("#0e0808 #1a0c0c #2a1212 #3a1a16 #4c241c #5e3222")


class Lava(Terrain):
    id = "lava"
    frames = 4
    pal = GLOW
    margin = {"N": 1, "E": 1, "S": 2, "W": 1}
    radius = 4.0

    def base(self, frame):
        return speckle_base(rng_for(self.id, "base", self.salt), self.pal[4], [(self.pal[3], 0.16, 2), (self.pal[5], 0.1, 2)])

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        # bright currents swaying in the flow
        for _ in range(2 + variant % 2):
            L = ri(rng, 4, 6)
            x, y = ri(rng, 0, T - L - 2), ri(rng, 2, T - 2)
            if not all(ok[y, x + k] and ok[y - 1, x + k] for k in range(L + 1)):
                continue
            s = SWAY[(frame + ri(rng, 0, 3)) % 4]
            for k in range(L):
                put(img, x + s + k, y - (1 if 0 < k < L - 1 else 0), self.pal[6] if 0 < k < L - 1 else self.pal[5])
            put(img, x + s + 1, y, self.pal[3])
        # floating crust plates: black inside, glowing red at the rim
        plates = [[".rrr.", "rcccr", ".rcr."], ["rr.", "rcr", ".rr"], [".rrrr", "rcccr", "rccr."]]
        if variant != 0:
            for i in range(1 + variant % 2):
                place(img, sp, rng, plates[(variant + i) % 3], {"c": CRUST[1], "r": self.pal[2]})
        # a bubble that swells and pops
        x, y = ri(rng, 3, T - 4), ri(rng, 3, T - 4)
        if ok[y - 1:y + 2, x - 1:x + 2].all() and sp.ok[y, x]:
            st = (frame + variant) % 4
            if st == 0:
                put(img, x, y, self.pal[6])
            elif st == 1:
                stamp(img, x - 1, y - 1, [".o.", "oho", ".o."], {"o": self.pal[6], "h": self.pal[7]})
            elif st == 2:
                stamp(img, x - 1, y - 1, ["o.o", "...", "o.o"], {"o": self.pal[7]})

    def rim(self, img, sh, frame):
        for x, y in each(sh):
            dn, ds, dw, de = sh.dN[y, x], sh.dS[y, x], sh.dW[y, x], sh.dE[y, x]
            if dn <= 3:  # the far bank: black rock, lit from below by the lava
                img[y, x] = [CRUST[3], CRUST[1], self.pal[1]][dn - 1]
                if dn == 3 and (x + frame) % 4 == 0:
                    img[y, x] = self.pal[3]
            elif dn == 4:
                img[y, x] = self.pal[3]
            elif dw == 1:
                img[y, x] = CRUST[2]
            elif de == 1:
                img[y, x] = CRUST[4]
            elif ds == 1:
                img[y, x] = CRUST[4]  # a crust lip at the near edge
            elif ds == 2:
                img[y, x] = self.pal[6] if (x + frame) % 3 else self.pal[7]  # white-hot line under the lip
            elif dw == 2:
                img[y, x] = self.pal[2]


# ---------- shadow (dark mossy shade) ----------

SHADE = ramp("#0a0c14 #0e1a1e #142628 #1a3232 #22403c #2c4e48 #3a5e54")  # dark moss
SPORE = [hx("#5ad8b8"), hx("#b49cff"), hx("#e8fff8")]


class Shadow(Terrain):
    id = "shadow"
    pal = SHADE
    detail_gap = 2

    # see-through on purpose: the shade darkens whatever ground the game draws under it (grass, cave floor...)
    DARK = hx("#100828", 150)
    DARKER = hx("#0a0420", 180)
    THIN = hx("#100828", 105)
    THINNEST = hx("#100828", 60)

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        img = blank()
        img[:, :] = self.DARK
        for _ in range(40):
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            img[y % T, x % T] = self.DARKER
            img[y % T, (x + 1) % T] = self.DARKER
        for _ in range(8):  # moss bumps, lit faintly from the top left
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            img[y % T, x % T] = self.pal[4]
            img[(y + 1) % T, (x + 1) % T] = self.pal[0]
        return img

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        for _ in range(3):  # cushions of dark moss, their tops catching a little light
            place(img, sp, rng, [".ll.", "lmmd", ".dd."], {"l": self.pal[5], "m": self.pal[3], "d": self.pal[1]}, pad=0)
        if variant == 0:
            place(img, sp, rng, ["s"], {"s": SPORE[0]}, pad=2)
        elif variant == 1:  # a pale glowing mushroom
            place(img, sp, rng, [".gg.", "gwgg", ".ss.", ".sd."], {"g": SPORE[0], "w": SPORE[2], "s": hx("#9a90b8"), "d": self.pal[0]})
        elif variant == 2:  # fern fronds in the dark
            place(img, sp, rng, ["f.f.f", ".fff.", "..f..", "..f.."], {"f": hx("#1c3a3a")})
            place(img, sp, rng, ["s"], {"s": SPORE[1]}, pad=2)
        else:
            for _ in range(2):
                place(img, sp, rng, [".s.", "sws", ".s."], {"s": mix(SPORE[0], SHADE[3], 0.6), "w": SPORE[0]}, pad=1)

    def rim(self, img, sh, frame):
        # the shade thins out at its edge: a checker of see-through pixels, then a lighter ring
        for x, y in each(sh):
            d = sh.d[y, x]
            if img[y, x, 3] == 255 and d > 1:
                continue  # moss and spores stay
            if d == 1:
                img[y, x] = self.THINNEST
            elif d == 2:
                img[y, x] = self.THIN


# ---------- spring (animated) ----------

SPRING = ramp("#0c3448 #12506a #187088 #1e92a2 #34b2b4 #5ccec6 #94e8da #ccfaee #ffffff")
RIM_STONE = ramp("#2a2638 #44405a #625e78 #868298 #aaa8b8 #d2d0dc")


class Spring(Terrain):
    id = "spring"
    frames = 4
    pal = SPRING
    margin = {"N": 1, "E": 1, "S": 1, "W": 1}
    radius = 5.0

    def base(self, frame):
        return water_body(self.id, self.pal, frame, 5, [(4, 0.12), (6, 0.06)], salt=self.salt)

    def details(self, img, rng, ok, frame, variant):
        # bubbles welling up: a ring that grows from the spring's eye, and beads rising
        x, y = ri(rng, 5, T - 6), ri(rng, 5, T - 6)
        if ok[y - 2:y + 3, x - 2:x + 3].all():
            r = frame % 4
            if r == 0:
                put(img, x, y, self.pal[8])
            elif r == 1:
                stamp(img, x - 1, y - 1, [".o.", "o.o", ".o."], {"o": self.pal[7]})
            elif r == 2:
                stamp(img, x - 2, y - 1, [".ooo.", "o...o", ".ooo."], {"o": self.pal[7]})
            else:
                stamp(img, x - 2, y - 2, [".o.o.", "o...o", ".....", "o...o", ".o.o."], {"o": self.pal[6]})
        for _ in range(2 + variant % 2):
            bx, by = ri(rng, 2, T - 3), ri(rng, 4, T - 3)
            ph = ri(rng, 0, 3)
            yy = by - ((frame + ph) % 4)
            if 0 <= yy < T and ok[yy, bx]:
                put(img, bx, yy, self.pal[8] if (frame + ph) % 4 < 3 else self.pal[7])
        ripples(img, rng, ok, frame, self.pal, 1, 7, 6, 8)

    def rim(self, img, sh, frame):
        # a ring of pale stones round the pool: their faces along the far side, their tops along the others
        for x, y in each(sh):
            dn, ds, dw, de = sh.dN[y, x], sh.dS[y, x], sh.dW[y, x], sh.dE[y, x]
            seam = (x * 5 + y * 3) % 6 == 0
            if dn <= 3:
                img[y, x] = [RIM_STONE[4], RIM_STONE[3], RIM_STONE[2]][dn - 1]
                if seam and dn > 1:
                    img[y, x] = RIM_STONE[1]
            elif dn == 4:
                img[y, x] = self.pal[1]
            elif ds <= 2:
                img[y, x] = [RIM_STONE[2], RIM_STONE[5]][ds - 1] if not seam else RIM_STONE[1]
            elif dw <= 2:
                img[y, x] = [RIM_STONE[4], RIM_STONE[2]][dw - 1]
            elif de <= 2:
                img[y, x] = [RIM_STONE[2], RIM_STONE[4]][de - 1]
            elif dn == 5 or dw == 3:
                img[y, x] = self.pal[3]

    def outside(self, img, sh, frame):
        for y in range(T):
            for x in range(T):
                if not sh.ins[y, x] and (sh.inside(x, y - 1) or sh.inside(x - 1, y)):
                    put(img, x, y, SHADOW_SOFT)


# ---------- bridges (two sheets: the deck running east-west, and north-south) ----------

WOOD = ramp("#1a0e12 #2a1818 #3e221c #543022 #6c402a #865234 #a06840 #bc824e #d4a064")
ROPE = [hx("#6a5440"), hx("#a88c66"), hx("#d8c098")]


class Bridge(Terrain):
    """A wooden deck with rope rails along its open sides. Square, tile-shaped outline. The planks lie across
    the way you walk; everything repeats every 4 or 8 px so decks join seamlessly from cell to cell."""
    id = "bridge"
    pal = WOOD
    across = True      # True: you cross east-west (planks run north-south)
    organic = False
    amp = 0
    radius = 1.0

    @property
    def margin(self):
        return {"N": 3, "S": 3, "E": 0, "W": 0} if self.across else {"N": 0, "S": 0, "E": 3, "W": 3}

    def plank_tile(self, variant=0) -> np.ndarray:
        img = blank()
        for y in range(T):
            for x in range(T):
                a = x if self.across else y   # along the crossing
                b = y if self.across else x   # along each plank
                k = a % 4
                c = [self.pal[2], self.pal[6], self.pal[5], self.pal[4]][k]
                if k == 1 and (b + a * 3) % 7 == 3:
                    c = self.pal[5]          # grain
                if k == 2 and (b * 2 + a) % 9 == 0:
                    c = self.pal[3]          # a knot
                img[y, x] = c
        for a in range(1, T, 4):  # nail heads, two per plank end
            for b in (4, 11):
                put(img, a if self.across else b, b if self.across else a, self.pal[1])
        if variant == 1:
            put(img, 6, 7, self.pal[1])
            put(img, 7, 8, self.pal[1])
        elif variant == 2:  # a worn, paler plank
            for b in range(T):
                x, y = (9, b) if self.across else (b, 9)
                img[y, x] = self.pal[7] if b % 3 else self.pal[6]
        elif variant == 3:
            for b in range(3, 9):
                x, y = (13, b) if self.across else (b, 13)
                img[y, x] = self.pal[3]
        return img

    def base(self, frame):
        return self.plank_tile(0)

    def fill(self, variant, frame=0):
        return self.plank_tile(variant % 4)

    def edge(self, mask, frame=0):
        if mask == 15:
            return self.fill(0, frame)
        if mask == 0:
            return blank()
        sh = self.shape(mask)
        img = self.plank_tile(0)
        for y in range(T):
            for x in range(T):
                if not sh.ins[y, x]:
                    img[y, x] = 0
        for x, y in each(sh):
            if self.across:
                if sh.dN[y, x] == 1:
                    img[y, x] = self.pal[7]   # the deck's lit far edge
                elif sh.dS[y, x] == 1:
                    img[y, x] = self.pal[1]   # its shaded near edge (the beam under it)
                elif sh.dS[y, x] == 2:
                    img[y, x] = self.pal[3]
            else:
                if sh.dW[y, x] == 1:
                    img[y, x] = self.pal[7]
                elif sh.dE[y, x] == 1:
                    img[y, x] = self.pal[1]
                elif sh.dE[y, x] == 2:
                    img[y, x] = self.pal[3]
        for y in range(T):  # rope rails along the open sides, with posts, and the deck's shadow on the water
            for x in range(T):
                if sh.ins[y, x]:
                    continue
                if self.across:
                    if sh.inside(x, y + 1):
                        put(img, x, y, ROPE[1] if x % 4 else ROPE[0])
                        if x % 8 == 2:
                            put(img, x, y, self.pal[6])
                            put(img, x, y - 1, self.pal[7])
                            put(img, x + 1, y, self.pal[2])
                    elif sh.inside(x, y - 1):
                        put(img, x, y, ROPE[1] if x % 4 else ROPE[0])
                        if x % 8 == 2:
                            put(img, x, y, self.pal[6])
                            put(img, x + 1, y, self.pal[2])
                    elif sh.inside(x, y - 2):
                        put(img, x, y, SHADOW)
                    elif sh.inside(x, y - 3):
                        put(img, x, y, SHADOW_SOFT)
                else:
                    if sh.inside(x + 1, y) or sh.inside(x - 1, y):
                        put(img, x, y, ROPE[1] if y % 4 else ROPE[0])
                        if y % 8 == 3:
                            put(img, x, y, self.pal[6])
                            put(img, x, y - 1, self.pal[7])
                            put(img, x, y + 1, self.pal[2])
                    elif sh.inside(x - 2, y):
                        put(img, x, y, SHADOW)
        return img


class BridgeV(Bridge):
    id = "bridge_v"
    across = False


# ---------- wall (ruined stone wall) ----------

WALLSTONE = ramp("#16121c #241e2a #342c38 #463c48 #5a4e58 #6e626a #887a7e #a49494 #c4b4ae")


class Wall(Terrain):
    id = "wall"
    pal = WALLSTONE
    margin = {"N": 3, "E": 3, "S": 1, "W": 3}
    face_h = 8
    amp = 1
    radius = 2.5

    def base(self, frame):
        """The wall's top: capstones 5-6 px long in courses, each lit on its top-left, with dark joints."""
        rng = rng_for(self.id, "base", self.salt)
        img = speckle_base(rng, self.pal[5], [(self.pal[4], 0.2, 2), (self.pal[6], 0.08, 1)])
        for y in range(T):
            course = y // 4
            for x in range(T):
                kx = (x + course * 4) % 8
                if y % 4 == 3 or kx == 0:
                    img[y, x] = self.pal[2]          # the joints
                elif y % 4 == 0 or kx == 1:
                    img[y, x] = self.pal[6]          # lit edges
                elif y % 4 == 2 and kx == 7:
                    img[y, x] = self.pal[3]
        return img

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 1:
            place(img, sp, rng, [".m.", "mmm"], {"m": MOSS[2]})
        elif variant == 2:
            place(img, sp, rng, PEBBLE, {"a": self.pal[7], "b": self.pal[5], "c": self.pal[3], "s": self.pal[2]})

    def rim(self, img, sh, frame):
        fh = self.face_h
        rng = rng_for(self.id, "face", sh.bits)
        moss = {(ri(rng, 0, T - 1)) for _ in range(3)}
        for x, y in each(sh):
            ds = sh.dS[y, x]
            if ds <= fh:  # courses of blocks, staggered, each lit on its top and left edges
                t = fh - ds
                course = t // 3
                row = t % 3
                kx = (x + course * 4) % 8
                if row == 2 and t < fh - 1:
                    c = self.pal[1]                     # mortar line under each course
                elif kx == 0:
                    c = self.pal[1]                     # the joint between blocks
                elif row == 0 or kx == 1:
                    c = self.pal[5]                     # the lit top/left of a block
                elif kx == 7:
                    c = self.pal[2]
                else:
                    c = self.pal[3] if course > 0 else self.pal[4]
                if ds == 1:
                    c = self.pal[0]
                if x in moss and t >= fh - 3 and ds > 1:
                    c = MOSS[1] if t % 2 else MOSS[2]
                img[y, x] = c
            elif ds == fh + 1:
                img[y, x] = self.pal[8]
            elif sh.dN[y, x] == 1 or sh.dW[y, x] == 1:
                img[y, x] = self.pal[7]
            elif sh.dE[y, x] == 1:
                img[y, x] = self.pal[2]

    def outside(self, img, sh, frame):
        drop_shadow(img, sh, 2)
        for y in range(T):  # a dark outline round it, like the props: it's something you can't walk through
            for x in range(T):
                if sh.ins[y, x]:
                    continue
                if sh.inside(x, y + 1) or sh.inside(x + 1, y) or sh.inside(x - 1, y) or (sh.inside(x, y - 1) and sh.dS[y - 1, x] == 1):
                    img[y, x] = hx("#120c18")
        rng = rng_for(self.id, "rubble", sh.bits)
        for _ in range(2):  # fallen stones at the foot of the wall
            x, y = ri(rng, 0, T - 3), ri(rng, 0, T - 3)
            if not sh.ins[y:y + 2, x:x + 3].any() and (sh.inside(x, y - 1) or sh.inside(x - 1, y) or sh.inside(x + 3, y)):
                stamp(img, x, y, [".ab", "abs"], {"a": self.pal[6], "b": self.pal[4], "s": SHADOW})


# ---------- built structures (village, dungeon, fortress): walls, a fence, floors ----------
# A cell only knows its four corners, so a wall's south face can only be drawn where the cell can tell the wall ends:
# the wall tile's south half, in the cell whose north corners are the wall and whose south corners aren't. To make a
# one-tile wall read as high, the face carries on past the tile and hangs over the top of the tile to the south (in
# that same cell, as a tall prop overlaps the tile behind it). Margins of 1 put the dark outline on the tile's own
# edge pixel, so nothing of the ground shows between a wall and a floor beside it.

OUTLINE = hx("#120c18")


class Structure(Terrain):
    """A wall: a flat top (the fill tiles), rims round the top, a south face of face_in + hang rows, a dark outline
    and a cast shadow to the lower right. Square, straight-sided outline: it's built."""
    organic = False
    amp = 0
    radius = 1.0
    margin = {"N": 1, "E": 1, "S": 0, "W": 1}
    face_in = 8        # face rows inside the wall's own tile (its south half; needs margin S 0)
    hang = 3           # face rows hanging over the top of the tile to the south
    detail_gap = 2
    reach = 2          # how far the cast shadow reaches

    @property
    def face_h(self):
        return self.face_in + self.hang

    def solids(self, sh):
        """Over the cell and its extension: how many rows below the wall's bottom each pixel is (1..hang, else 0),
        which pixels are face, and which are solid (the wall's top, face and hanging face)."""
        ext = sh.ext
        n = ext.shape[0]
        hang = np.zeros((n, n), int)
        for x in range(n):
            k = -1
            for y in range(n):
                if ext[y, x]:
                    k = 0
                elif k >= 0:
                    k += 1
                    if k > self.hang:
                        k = -1
                    else:
                        hang[y, x] = k
        face = (ext & (sh.dS_ext <= self.face_in)) | (hang > 0)
        return hang, face, ext | (hang > 0)

    @staticmethod
    def run(face, solid, X, Y, dx):
        """Along a row of face, how far to its end (1 = this is the end column) and what is past it: "out" (the wall
        stops), "wall" (it meets the top of a wall running the other way) or None (beyond what the cell knows)."""
        n = face.shape[1]
        k, xx = 0, X
        while 0 <= xx < n and face[Y, xx]:
            xx += dx
            k += 1
        if not 0 <= xx < n:
            return k, None
        return k, ("wall" if solid[Y, xx] else "out")

    def step(self, c, k):
        """The colour k steps lighter (k < 0: darker) on this wall's own ramp."""
        for i, p in enumerate(self.pal):
            if tuple(p) == tuple(c):
                return self.pal[max(0, min(len(self.pal) - 1, i + k))]
        return c

    def top_rim(self, x, y, sh):
        return None

    def face_marks(self, rng):
        return {}

    def face_px(self, x, y, t, west, east, marks):
        raise NotImplementedError

    def edge(self, bits, frame=0):
        if bits == 15:
            return self.fill(0, frame)
        if bits == 0:
            return blank()
        sh = self.shape(bits)
        self.salt = ("edge", bits)
        img = self.base(frame)
        self.details(img, rng_for(self.id, "edge", bits), (sh.d >= self.detail_gap) & (sh.dS > self.face_in + 2), frame, 0)
        hang, face, solid = self.solids(sh)
        for x, y in each(sh):
            if not face[y + EXT, x + EXT]:
                c = self.top_rim(x, y, sh)
                if c is not None:
                    img[y, x] = c
        marks = self.face_marks(rng_for(self.id, "face", bits))
        for y in range(T):
            for x in range(T):
                X, Y = x + EXT, y + EXT
                if face[Y, X]:
                    t = self.face_in - sh.dS[y, x] if sh.ins[y, x] else self.face_in - 1 + hang[Y, X]
                    img[y, x] = self.face_px(x, y, t, self.run(face, solid, X, Y, -1), self.run(face, solid, X, Y, 1), marks)
                elif not sh.ins[y, x]:
                    img[y, x] = 0
        self.surround(img, solid)
        return img

    def surround(self, img, solid):
        """The cast shadow (to the lower right, see-through) and a dark outline round the whole wall."""
        n = solid.shape[0]

        def s(x, y):
            return bool(solid[min(max(y + EXT, 0), n - 1), min(max(x + EXT, 0), n - 1)])

        r = self.reach
        for y in range(T):
            for x in range(T):
                if s(x, y):
                    continue
                if any(s(x - k, y) or s(x, y - k) or s(x - k, y - k) for k in range(1, r + 1)):
                    put(img, x, y, SHADOW)
                elif s(x - r - 1, y) or s(x, y - r - 1) or s(x - r, y - r - 1):
                    put(img, x, y, SHADOW_SOFT)
        for y in range(T):
            for x in range(T):
                if not s(x, y) and (s(x, y + 1) or s(x + 1, y) or s(x - 1, y) or s(x, y - 1)):
                    img[y, x] = OUTLINE


# ---------- fortress wall ----------

FORT = ramp("#211b1e #352d2e #4b413f #645852 #7f7268 #9a8c7f #b4a696 #cec1ae #eae0cc")


class FortWall(Structure):
    """A grand, well-kept castle wall of pale warm stone: a paved wall-walk on top with a crenellated parapet along
    its far (north) side and thin ones along its sides, and a tall face of big ashlar blocks under a crenellated
    front, 11 px high (8 in its own tile, 3 over the tile in front)."""
    id = "fort_wall"
    pal = FORT
    hang = 3
    reach = 3

    def base(self, frame):
        """The wall-walk: big square flagstones, 8 px, every other row offset by half, fine joints, a faint grain."""
        rng = rng_for(self.id, "base", self.salt)
        img = speckle_base(rng, self.pal[6], [(self.pal[5], 0.05, 1), (self.pal[7], 0.03, 1)])
        for y in range(T):
            row = y // 8
            for x in range(T):
                kx = (x + (row % 2) * 4) % 8
                if y % 8 == 7 or kx == 7:
                    img[y, x] = self.pal[4]          # the joints, fine and even
                elif y % 8 == 0 or kx == 0:
                    img[y, x] = self.pal[7]          # each flag's lit top and left edge
                elif y % 8 == 6 or kx == 6:
                    img[y, x] = self.pal[5]
        return img

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 1:  # a flag a touch darker with age
            place(img, sp, rng, ["ddd", "ddd"], {"d": self.pal[5]}, pad=1)
        elif variant == 2:  # a hairline crack
            place(img, sp, rng, ["c..", ".cc", "...c"], {"c": self.pal[4]})
        elif variant == 3:  # a little moss in a joint
            place(img, sp, rng, [".m", "mm"], {"m": MOSS[2]})

    def top_rim(self, x, y, sh):
        p = self.pal
        dn, dw, de = sh.dN[y, x], sh.dW[y, x], sh.dE[y, x]
        merlon = x % 8 < 5
        if dn == 1:
            return p[8] if merlon else OUTLINE      # merlon tops; a crenel is a notch in the outline
        if dn == 2:
            return p[5] if merlon else p[7]         # a merlon's front / the lit sill of a crenel
        if dn == 3:
            return p[3]                             # the parapet's foot, in shade
        notch = y % 8 >= 5
        if dw == 1:
            return p[5] if notch else p[8]          # the side parapets: a lit top with crenel gaps
        if dw == 2:
            return p[4]
        if de == 1:
            return p[3]
        if de == 2:
            return p[5] if notch else p[7]
        return None

    def face_px(self, x, y, t, west, east, marks):
        p = self.pal
        fh = self.face_h
        cren = x % 8 >= 5
        if t == 0:
            c = p[2] if cren else p[8]          # merlon tops; through a crenel, the dark gap
        elif t == 1:
            c = p[7] if cren else p[5]          # the crenel's lit sill / the merlon's face
        elif t == 2:
            c = p[4]
        elif t == 3:
            c = p[2]                            # the shadow under the parapet's string course
        elif t >= fh - 1:
            c = p[1]                            # the plinth's foot
        else:
            course, row = divmod(t - 4, 3)      # ashlar: courses 3 px high, blocks 8 wide, staggered
            kx = (x + (course % 2) * 4 + 2) % 8
            if row == 2 or kx == 0:
                c = p[2]
            elif row == 0 or kx == 1:
                c = p[5] if course == 0 else p[4]
            else:
                c = p[4] if course == 0 else p[3]
        (wk, wkind), (ek, ekind) = west, east
        if wkind == "out" and wk == 1 and t >= 2:
            c = p[6] if t < fh - 1 else p[2]      # the wall's lit west corner
        elif wkind == "wall" and wk <= 2:
            c = self.step(c, -1)                # in the shade of the wall running south beside it
        if ekind == "out" and ek == 1 and t >= 1:
            c = p[1]                            # its east corner, in shade
        elif ekind == "wall" and ek == 1:
            c = p[1]
        return c


# ---------- dungeon wall ----------

DUNGEON = ramp("#08070d #110f18 #1a1722 #24202d #2f2937 #3b3443 #48404f #584d5b #6a5d69")
DRIP = [hx("#232b42"), hx("#33435f"), hx("#7896bc")]   # wet stains running down, and a glint
DMOSS = ramp("#14221c #1d3324 #29482c #3a6034")


def voronoi(name: str, n: int, sy: float = 1.2, gap: float = 0.9, iters: int = 5):
    """Rough stones that wrap round the tile (the same as cobble_layout, with its own seed)."""
    rng = rng_for(name, "stones")
    pts = rng.random((n, 2)) * T

    def nearest(x, y):
        ds = []
        for i, (px, py) in enumerate(pts):
            dx = min(abs(x - px), T - abs(x - px))
            dy = min(abs(y - py), T - abs(y - py)) * sy
            ds.append((dx * dx + dy * dy, i))
        ds.sort()
        return ds

    for _ in range(iters):
        acc = [[0.0, 0.0, 0.0, 0.0, 0] for _ in range(n)]
        for y in range(T):
            for x in range(T):
                i = nearest(x + 0.5, y + 0.5)[0][1]
                a = acc[i]
                for k, v in ((0, x + 0.5), (2, y + 0.5)):
                    ang = v / T * 2 * math.pi
                    a[k] += math.cos(ang)
                    a[k + 1] += math.sin(ang)
                a[4] += 1
        for i, a in enumerate(acc):
            if a[4]:
                pts[i, 0] = (math.atan2(a[1], a[0]) / (2 * math.pi) * T) % T
                pts[i, 1] = (math.atan2(a[3], a[2]) / (2 * math.pi) * T) % T
    owner = np.full((T, T), -1)
    for y in range(T):
        for x in range(T):
            ds = nearest(x + 0.5, y + 0.5)
            if math.sqrt(ds[1][0]) - math.sqrt(ds[0][0]) > gap:
                owner[y, x] = ds[0][1]
    return owner


class DungeonWall(Structure):
    """Dark, rough-hewn blue-black stone, damp: blocks of uneven size with chipped edges, wet stains running down
    the face with a glint, moss at its top and foot. Face 9 px (8 in its own tile, 1 over the tile in front)."""
    id = "dungeon_wall"
    pal = DUNGEON
    hang = 1

    def __init__(self):
        self.owner = voronoi(self.id, 5)
        rng = rng_for(self.id, "tones")
        self.tone = {i: ri(rng, 4, 5) for i in range(int(self.owner.max()) + 1)}
        self.grain = rng_for(self.id, "grain").random((T, T))
        # the face: two courses of blocks of uneven width; each block's bottom joint a row higher or lower, so the
        # courses don't run ruler-straight. It repeats every 16 px, the same in every cell, so faces join up.
        rng = rng_for(self.id, "face_layout")
        fh = self.face_h
        blk = np.full((fh, T), -1)
        bid = 0
        for top, bottom in ((1, 4), (5, fh - 2)):
            s0 = ri(rng, 0, 7)
            starts = [s0]
            x = s0 + ri(rng, 4, 7)
            while x < s0 + T - 3:
                starts.append(x)
                x += ri(rng, 4, 7)
            starts.append(s0 + T)
            for i, sx in enumerate(starts[:-1]):
                low = bottom - (ri(rng, 0, 1) if top == 1 else 0)
                for xx in range(sx, starts[i + 1] - 1):   # a 1 px joint between blocks
                    for t in range(top, low + 1):
                        blk[t, xx % T] = bid
                bid += 1
        self.blk = blk
        self.blk_tone = {i: ri(rng, 4, 5) for i in range(bid)}

    def stone(self, x, y):
        o = self.owner[y % T, x % T]
        return None if o < 0 else int(o)

    def base(self, frame):
        """The wall's top: rough flat stones with dark cracks between them, each lit on its top-left."""
        img = blank()
        p = self.pal
        for y in range(T):
            for x in range(T):
                s = self.stone(x, y)
                if s is None:
                    img[y, x] = p[1]
                    continue
                t = self.tone[s]
                if self.stone(x, y + 1) != s:
                    c = p[t - 2]
                elif self.stone(x, y - 1) != s or self.stone(x - 1, y) != s:
                    c = p[t + 1]
                elif self.stone(x + 1, y) != s:
                    c = p[t - 1]
                else:
                    g = self.grain[y, x]
                    c = p[t - 1] if g < 0.12 else p[t + 1] if g > 0.94 else p[t]
                img[y, x] = c
        return img

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 1:  # moss creeping over the top
            place(img, sp, rng, [".ll.", "lmmm", ".dd."], {"l": DMOSS[3], "m": DMOSS[2], "d": DMOSS[1]})
        elif variant == 2:  # a fallen chip of stone
            place(img, sp, rng, ["ab", "bs"], {"a": self.pal[6], "b": self.pal[4], "s": self.pal[1]})
        elif variant == 3:  # a damp patch with a glint
            place(img, sp, rng, [".dd.", "dwhd", ".dd."], {"d": DRIP[0], "w": DRIP[2], "h": DRIP[1]})

    def top_rim(self, x, y, sh):
        p = self.pal
        chip = (x * 5 + y * 3) % 11 == 0 and 1 < x < T - 2 and 1 < y < T - 2
        if sh.dN[y, x] == 1 or sh.dW[y, x] == 1:
            return p[3] if chip else p[6]
        if sh.dE[y, x] == 1:
            return p[1] if chip else p[2]
        return None

    def face_marks(self, rng):
        cols = list(range(1, T - 1))
        rng.shuffle(cols)
        drips = {cols[0]: ri(rng, 4, 7), cols[1]: ri(rng, 2, 4)}   # wet stains: column -> length
        moss_top = set(cols[2:4])
        moss_foot = set(cols[4:7])
        chips = set(cols[7:9])
        return {"drips": drips, "moss_top": moss_top, "moss_foot": moss_foot, "chips": chips}

    def face_px(self, x, y, t, west, east, marks):
        p = self.pal
        fh = self.face_h
        if t == 0:
            c = p[4] if x in marks["chips"] else p[7]           # the chipped lip of the top
        elif t >= fh - 1:
            c = p[1]                                            # the wet foot of the wall
        else:
            b = self.blk[t, x]
            if b < 0:
                c = p[1]                                        # joints
            else:
                tn = self.blk_tone[b] - (1 if t >= 5 else 0)    # the lower course a touch darker
                up = t == 0 or self.blk[t - 1, x] != b
                lf = self.blk[t, (x - 1) % T] != b
                dn = t + 1 >= fh or self.blk[t + 1, x] != b
                rt = self.blk[t, (x + 1) % T] != b
                if dn:
                    c = p[tn - 2]
                elif up:
                    c = p[tn + 1]
                elif lf:
                    c = p[tn + 1] if t < 5 else p[tn]
                elif rt:
                    c = p[tn - 1]
                else:
                    g = self.grain[t, x]
                    c = p[tn - 1] if g < 0.15 else p[tn]
        if x in marks["drips"] and 1 <= t <= marks["drips"][x]:
            c = DRIP[1] if t == marks["drips"][x] else DRIP[0]   # a dark wet streak ending in a drop
        if x in marks["moss_top"] and t <= 1:
            c = DMOSS[3] if t == 0 else DMOSS[1]
        if x in marks["moss_foot"] and t >= fh - 2:
            c = DMOSS[2] if t == fh - 2 else DMOSS[1]
        (wk, wkind), (ek, ekind) = west, east
        if wkind == "out" and wk == 1 and 0 < t < fh - 1:
            c = self.step(c, 1)
        elif wkind == "wall" and wk <= 2:
            c = self.step(c, -1)
        if ek == 1 and ekind is not None and t > 0:
            c = p[1]
        return c


# ---------- house wall (timber frame) ----------

PLASTER = ramp("#6e5e52 #96846e #baa98c #d8caa8 #ece2c6 #f8f2e2")


class HouseWall(Structure):
    """A village house, cut away (no roof: we look down into it). The top of the wall is the wall-plate, a timber
    beam; the face is timber framing (posts and braces, dark brown) with whitewashed plaster panels between, on a
    low stone plinth. Face 10 px (8 in its own tile, 2 over the tile in front)."""
    id = "house_wall"
    pal = WOOD
    hang = 2

    def base(self, frame):
        """The wall-plate: dark seasoned timber, a faint grain, the odd knot."""
        rng = rng_for(self.id, "base", self.salt)
        img = speckle_base(rng, self.pal[4], [(self.pal[3], 0.03, 2), (self.pal[5], 0.03, 1)])
        for y in range(T):
            for x in range(T):
                if self.grain_ew(x, y):
                    img[y, x] = self.pal[3]
        return img

    @staticmethod
    def grain_ew(x, y):
        return y % 3 == 1 and (x + y * 5) % 7 < 4

    @staticmethod
    def grain_ns(x, y):
        return x % 4 == 1 and (y + x * 5) % 7 < 4

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 1:
            place(img, sp, rng, [".k.", "kok", ".k."], {"k": self.pal[3], "o": self.pal[2]})
        elif variant == 2:  # nail heads
            for _ in range(2):
                place(img, sp, rng, ["n"], {"n": STONE[3]}, pad=2)
        elif variant == 3:  # a split in the beam
            place(img, sp, rng, ["cc..", "..cc"], {"c": self.pal[3]})

    def top_rim(self, x, y, sh):
        p = self.pal
        if sh.dN[y, x] == 1 or sh.dW[y, x] == 1:
            return p[6]
        if sh.dE[y, x] == 1:
            return p[2]
        if sh.dN[y, x] == 2 or sh.dW[y, x] == 2:
            return p[5]
        # the grain runs along the beam: up and down where the wall runs north-south, across elsewhere (the base)
        if min(sh.dW[y, x], sh.dE[y, x]) < min(sh.dN[y, x], sh.dS[y, x]):
            if self.grain_ns(x, y):
                return p[3]
            if self.grain_ew(x, y):
                return p[4]
        return None

    def face_px(self, x, y, t, west, east, marks):
        w, pl = self.pal, PLASTER
        fh = self.face_h
        (wk, wkind), (ek, ekind) = west, east
        if t == 0:
            c = w[7]                                 # the wall-plate's lit edge
        elif t == 1:
            c = w[2]                                 # its underside
        elif t == fh - 2:
            c = w[4]                                 # the sill beam
        elif t >= fh - 1:
            c = STONE[3] if (x * 5) % 7 == 0 else STONE[2]   # the stone plinth
        else:
            k = x % 8
            panel = ((x + 3) // 8) % 2               # panels run between the posts (k 3, 4)
            r = t - 2                                # 0..5 down the panel
            if k in (3, 4):
                c = w[5] if k == 3 else w[3]         # a post
            else:
                c = pl[2] if r == 0 else pl[3] if r == 5 else pl[4]   # plaster, shaded under the beam
                if (x * 3 + t * 5) % 13 == 0 and 0 < r < 5:
                    c = pl[5]
                j = (k - 5) % 8                      # 0..5 across the panel
                if panel == 0 and j in (5 - r, 6 - r):
                    c = w[4] if j == 5 - r else w[2]  # a brace rising to the right
        # the ends of the wall: a corner post
        if wkind == "out" and wk <= 2 and t >= 1:
            c = w[6] if wk == 1 else w[4]
            if t >= fh - 1:
                c = STONE[3] if wk == 1 else STONE[2]
        elif wkind == "wall" and wk <= 2 and 2 <= t < fh - 2:
            c = self.step(c, -1) if c in w else pl[2]
        if ekind is not None and ek <= 2 and t >= 1:
            c = w[3] if ek == 2 else w[1]
            if t >= fh - 1:
                c = STONE[1]
        return c


# ---------- fence (a line: posts at the tiles' centres, rails between neighbours) ----------

class Fence(Terrain):
    """A low wooden fence. Unlike the other terrains it is a line, not an area: a post stands at the centre of every
    fence tile (each cell corner) and two rails run to each fence tile beside it, along the cell's sides, with a post
    half-way. A cell knows every part it draws (the corners and sides it shares), so lines, corners, T-junctions and
    crossings all join up. Everything else is see-through (the ground shows between the rails), fills included."""
    id = "fence"
    pal = WOOD

    def draw(self, mask: int) -> np.ndarray:
        p = self.pal
        c = blank(3 * T, 3 * T)

        def px(x, y, col):
            put(c, x + T, y + T, col)

        corners = {1: (0, 0), 2: (T, 0), 4: (0, T), 8: (T, T)}
        on = [b for b in corners if mask & b]
        hs = [(1, 2), (4, 8)]   # the north and south sides: rails running east-west
        vs = [(1, 4), (2, 8)]   # the west and east sides: rails running north-south
        hrails = [(corners[a], corners[b]) for a, b in hs if mask & a and mask & b]
        vrails = [(corners[a], corners[b]) for a, b in vs if mask & a and mask & b]

        def post(cx, cy, h):
            """A post 2 px wide standing on (cx - 1..cx, cy), h px tall, with a dark outline and a lit cap."""
            for k in range(h + 1):
                y = cy - k
                px(cx - 1, y, p[7] if k < h else p[8])
                px(cx, y, p[5] if k < h else p[7])
                px(cx - 2, y, p[1])
                px(cx + 1, y, p[1])
            px(cx - 1, cy - h - 1, p[1])
            px(cx, cy - h - 1, p[1])
            px(cx - 1, cy, p[4])
            px(cx, cy, p[3])
            px(cx + 2, cy, SHADOW)                # its shadow on the ground
            px(cx + 2, cy + 1, SHADOW_SOFT)
            px(cx + 1, cy + 1, SHADOW_SOFT)

        # shadows on the ground, to the lower right
        for (x0, y0), (x1, _) in hrails:
            for x in range(x0 + 1, x1 + 1):
                px(x, y0 + 1, SHADOW_SOFT)
        for (x0, y0), (_, y1) in vrails:
            for y in range(y0 + 1, y1):
                px(x0 + 2, y, SHADOW_SOFT)
        # rails running north-south: seen from above, the two rails are one line, a little above the ground
        for (x0, y0), (_, y1) in vrails:
            for y in range(y0 - 3, y1 - 2):
                px(x0 - 1, y, p[6])
                px(x0, y, p[3])
                px(x0 + 1, y, p[1])
            post(x0, y0 + 8, 5)
        # rails running east-west: a top rail and a low one, with the ground showing between
        for (x0, y0), (x1, _) in hrails:
            for x in range(x0, x1 + 1):
                px(x, y0 - 6, p[1])
                px(x, y0 - 5, p[6])
                px(x, y0 - 4, p[3])
                px(x, y0 - 2, p[6])
                px(x, y0 - 1, p[3])
            post(x0 + 8, y0, 5)
        for b in on:
            post(*corners[b], 6)
        return c[T:2 * T, T:2 * T].copy()

    def base(self, frame):
        return blank()

    def edge(self, bits, frame=0):
        return blank() if bits == 0 else self.draw(bits)

    def fill(self, variant, frame=0):
        return self.draw(15)


# ---------- floors: level, square-edged, with a thin dark seam where they meet other ground ----------

class Floor(Terrain):
    organic = False
    amp = 0
    radius = 0.5
    margin = {"N": 0, "E": 0, "S": 0, "W": 0}
    detail_gap = 1
    groups = 2
    seam = 1

    def rim(self, img, sh, frame):
        for x, y in each(sh):
            if sh.dN[y, x] == 1 or sh.dS[y, x] == 1 or sh.dW[y, x] == 1 or sh.dE[y, x] == 1:
                img[y, x] = self.pal[self.seam]


FLOORBOARD = ramp("#2a1a12 #452c1a #5e3e22 #704c28 #7e582e #8c6434 #9a703a #aa7e44 #c49a5c")


class WoodFloor(Floor):
    """Warm honey-brown planks running east-west, 3 px wide with a dark gap between the rows, their ends staggered
    and faint, each plank a shade of its own, with long grain. Textures: plain (knots, nails) and aged (a worn plank,
    a darker one, a crack)."""
    id = "wood_floor"
    pal = FLOORBOARD
    seam = 2
    JOINTS = ({5, 13}, {9}, {1, 12}, {6})   # where planks end in each of the tile's 4 rows of planks
    # each plank's shade (by its row and the joint it starts after); the long ones that cross the tile's side stay
    # plain, so a big floor shows no stripes
    TONES = {(0, 5): 1, (0, 13): -1, (1, 9): 0, (2, 1): -1, (2, 12): 1, (3, 6): 0}

    def plank(self, x, y, tone=None):
        p = self.pal
        r, k = divmod(y % T, 4)
        x %= T
        j = self.JOINTS[r]
        if k == 0:
            return p[3]                              # the gap between rows of planks
        if x in j:
            return p[5] if k > 1 else p[4]           # where two planks butt together (faint: planks, not bricks)
        prev = max([a for a in j if a < x], default=max(j))
        b = 6 + (self.TONES.get((r, prev), 0) if tone is None else tone)
        if k == 2 and (x + r * 5) % 11 < 3 or k == 3 and (x + r * 3 + 6) % 13 < 2:
            return p[b - 1]                          # the grain, in long streaks
        if k == 1 and (x + r * 7) % 9 == 0:
            return p[min(b + 1, len(p) - 1)]
        return p[b]

    def runs(self):
        """Planks lying wholly inside the tile, as (row, x0, x1): recolouring one never shows a seam."""
        out = []
        for r, j in enumerate(self.JOINTS):
            for x0 in range(T):
                if x0 in j or not ((x0 - 1) % T in j):
                    continue
                x1 = x0
                while (x1 + 1) % T not in j and x1 + 1 < T:
                    x1 += 1
                if (x1 + 1) % T in j:
                    out.append((r, x0, x1))
        return out

    def base(self, frame):
        img = blank()
        for y in range(T):
            for x in range(T):
                img[y, x] = self.plank(x, y)
        return img

    def recolour(self, img, run, tone, ok=None):
        r, x0, x1 = run
        for y in range(r * 4 + 1, r * 4 + 4):
            for x in range(x0, x1 + 1):
                if ok is None or ok[y, x]:
                    img[y, x] = self.plank(x, y, tone)

    def nails(self, img, run):
        r, x0, x1 = run
        for x in (x0, x1):
            put(img, x, r * 4 + 2, self.pal[1])

    def details(self, img, rng, ok, frame, variant):
        if variant < 2:
            return
        runs = self.runs()
        run = runs[ri(rng, 0, len(runs) - 1)]
        r, x0, x1 = run
        if variant == 2:  # a knot
            x = ri(rng, x0 + 1, max(x0 + 1, x1 - 2))
            if ok[r * 4 + 1:r * 4 + 3, x:x + 2].all():
                stamp(img, x, r * 4 + 1, ["kk", "ok"], {"k": self.pal[4], "o": self.pal[3]})
        else:  # nail heads at a plank's ends
            if ok[r * 4 + 2, x0] and ok[r * 4 + 2, x1]:
                self.nails(img, run)

    def group(self, img, rng, frame, g, v):
        runs = self.runs()
        run = runs[ri(rng, 0, len(runs) - 1)]
        r, x0, x1 = run
        if v == 0:  # a worn, paler plank, scuffed
            self.recolour(img, run, 1)
            for x in range(x0 + 1, x1, 3):
                put(img, x, r * 4 + 2, self.pal[8])
        elif v == 1:  # a darker plank, nailed down
            self.recolour(img, run, -2)
            self.nails(img, run)
        elif v == 2:  # a crack along a plank
            n = min(5, x1 - x0)
            for i in range(n):
                put(img, x0 + 1 + i, r * 4 + 2 + (1 if i >= n // 2 else 0), self.pal[3])
        else:  # a darker plank
            self.recolour(img, run, -1)


SLAB = ramp("#131317 #202026 #303037 #414148 #54545b #68686e #7d7d82 #959598 #b0b0b0")


class StoneFloor(Floor):
    """Dressed square slabs of neutral grey stone, 7 px with dark grout, in a regular grid (one tile = 2 by 2 slabs).
    Textures: plain (a darker or paler slab, a chipped corner), worn (a crack, a stain) and damp (moss in the joints,
    a puddle, a drain grate: kept to this rarer texture so drains don't crowd a big floor)."""
    id = "stone_floor"
    pal = SLAB
    groups = 3

    def __init__(self):
        self.grain = rng_for(self.id, "grain").random((T, T))

    def slab(self, x, y, tone=0):
        p = self.pal
        sx, sy = x % 8, y % 8
        if sx == 7 or sy == 7:
            return p[1]                               # the grout
        t = 5 + tone
        if sy == 0:
            return p[t + 1] if sx < 6 else p[t]       # the lit top edge
        if sx == 0:
            return p[t + 1] if sy < 6 else p[t]       # and left edge
        if sy == 6 or sx == 6:
            return p[t - 1]                           # the shaded lower and right edges
        return p[t]

    def base(self, frame):
        img = blank()
        for y in range(T):
            for x in range(T):
                img[y, x] = self.slab(x, y)
        return img

    def tone_slab(self, img, i, tone, ok):
        sx, sy = (i % 2) * 8, (i // 2) * 8
        for y in range(sy, sy + 7):
            for x in range(sx, sx + 7):
                if ok[y, x]:
                    img[y, x] = self.slab(x, y, tone)

    def crack(self, img, rng, i):
        sx, sy = (i % 2) * 8, (i // 2) * 8
        pts = [(1, 2), (2, 3), (3, 3), (4, 4), (5, 4)] if chance(rng, 0.5) else [(2, 1), (2, 2), (3, 3), (3, 4), (4, 5)]
        for x, y in pts:
            put(img, sx + x, sy + y, self.pal[2])
        x, y = pts[0]
        put(img, sx + x, sy + y - 1, self.pal[6])

    def details(self, img, rng, ok, frame, variant):
        if variant == 0:
            return
        i = ri(rng, 0, 3)
        if variant == 1:
            self.tone_slab(img, i, -1, ok)
        elif variant == 2:
            self.tone_slab(img, i, 1, ok)
        else:  # a chipped corner: the slab's lower right broken off, showing grit
            sx, sy = (i % 2) * 8, (i // 2) * 8
            for x, y in ((6, 5), (5, 6), (6, 6), (4, 6)):
                if ok[sy + y, sx + x]:
                    img[sy + y, sx + x] = self.pal[2]
            if ok[sy + 4, sx + 6]:
                img[sy + 4, sx + 6] = self.pal[3]

    def moss(self, img, salt):
        """Moss in some of the joints (never on the tile's border, so it can't make a seam)."""
        for y in range(1, T - 1):
            for x in range(1, T - 1):
                if (x % 8 == 7 or y % 8 == 7) and (x * 5 + y * 3 + salt) % 7 < 2:
                    img[y, x] = MOSS[2] if (x + y) % 2 else MOSS[1]

    def group(self, img, rng, frame, g, v):
        i = ri(rng, 0, 3)
        ok = np.ones((T, T), bool)
        sx, sy = (i % 2) * 8, (i // 2) * 8
        if g == 1:  # worn
            if v == 0:
                self.crack(img, rng, i)
            elif v == 1:  # a dark stain spreading over a slab
                stamp(img, sx + 1, sy + 1, ["ss...", "ssss.", ".sss.", "..s.."], {"s": self.pal[4]})
            else:  # a darker slab; a chipped corner on another
                self.tone_slab(img, (i + v) % 4, -1, ok)
                if v == 3:
                    self.details(img, rng, ok, frame, 3)
        else:  # damp
            if v != 2:
                self.moss(img, v)
            if v == 1:  # a shallow puddle catching the light
                stamp(img, sx + 1, sy + 1, ["pp...", "pppp.", ".pphp", "..pp."], {"p": self.pal[4], "h": self.pal[7]})
            elif v == 2:  # an iron drain grate set in a slab
                stamp(img, sx + 1, sy + 1, ["rrrrr", "rhbhr", "rbhbr", "rhbhr", "rrrrr"],
                      {"r": self.pal[2], "h": self.pal[0], "b": self.pal[4]})


# ---------- fill textures: extra looks for the big plain grounds ----------
# Each is drawn over the terrain's shared surface, with nothing crossing a tile's border, so a patch of one
# texture meets the plain ground with no seam. The Map picks the group by a slow noise (whole patches of one
# texture) and the tile inside the group by a hash.

DRY = [GRASS[0], GRASS[1], hx("#3e5a2c"), hx("#5a6a32"), hx("#6e7a3a"), hx("#8e8e48"), hx("#aaa45c"), hx("#c4ba72")]
LUSH = [GRASS[0], GRASS[0], GRASS[1], GRASS[2], GRASS[3], GRASS[4], GRASS[5], GRASS[6]]


def grass_group(self, img, rng, frame, g, v):
    ok = np.ones((T, T), bool)
    sp = Spots(ok)
    if g == 1:  # lush: deep clumps and tall dark blades
        for _ in range(2 + v % 2):
            clump = [".dddd.", "dddddd", "dddddd", ".dddd."] if v % 2 else ["..ddd..", ".ddddd.", "ddddddd", ".ddddd."]
            p = sp.place(rng, clump, pad=0)
            if p:
                stamp(img, p[0], p[1], clump, {"d": self.pal[2]})
        sp = Spots(ok)
        blades(img, rng, 14, LUSH, wrap=False, ok=sp.ok, hmin=3, hmax=5)
        place(img, sp, rng, CLOVER, {"a": self.pal[6], "b": self.pal[5], "c": self.pal[2]})
    elif g == 2:  # dry: straw-coloured blades and bare specks
        for _ in range(3):
            place(img, sp, rng, ["dd", ".d"], {"d": DIRT[4]}, pad=0)
        blades(img, rng, 9, DRY, wrap=False, ok=sp.ok, hmin=2, hmax=3)
        if v == 3:
            place(img, sp, rng, PEBBLE, STONE_MAP)
    else:  # flowery: a sprinkle of daisies and buttercups in short grass
        blades(img, rng, 6, self.pal, wrap=False, ok=sp.ok)
        for i in range(5 + v % 3):
            if i % 3 == 0:
                place(img, sp, rng, [".w.", "wyw", ".w."], {"w": hx("#f4f0e4"), "y": hx("#f4c84a")}, pad=0)
            elif i % 3 == 1:
                place(img, sp, rng, ["y"], {"y": hx("#f8d040")}, pad=1)
            else:
                place(img, sp, rng, ["w", "g"], {"w": hx("#f4f0e4"), "g": self.pal[2]}, pad=1)


def sand_group(self, img, rng, frame, g, v):
    sp = Spots(np.ones((T, T), bool))
    if g == 1:  # dunes: long, strong ripples
        for _ in range(4):
            ripple(img, rng, sp, self.pal[2], self.pal[6], (7, 11))
    else:  # grit: darker grains, small stones and broken shell
        for _ in range(16):
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            put(img, x, y, self.pal[2] if chance(rng, 0.6) else self.pal[1])
        for _ in range(2):
            place(img, sp, rng, ["ab", "bs"], {"a": STONE[4], "b": STONE[2], "s": SHADOW})
        if v % 2:
            place(img, sp, rng, ["ab", "b."], {"a": hx("#fbe8e0"), "b": hx("#d8a898")})


def snow_group(self, img, rng, frame, g, v):
    sp = Spots(np.ones((T, T), bool))
    if g == 1:  # wind-swept: long thin streaks
        for _ in range(4):
            L = ri(rng, 5, 9)
            place(img, sp, rng, ["." + "l" * (L - 2) + ".", "m" * L], {"l": self.pal[7], "m": self.pal[4]}, pad=1)
    else:  # drifts: soft lumps with blue shade under them, and sparkles
        for _ in range(2):
            place(img, sp, rng, ["..lll..", ".lwwwl.", "lwwwwwm", ".mmmmm."], {"l": self.pal[7], "w": self.pal[6], "m": self.pal[4]})
        for _ in range(3):
            place(img, sp, rng, ["l"], {"l": self.pal[7]})


def cave_group(self, img, rng, frame, g, v):
    sp = Spots(np.ones((T, T), bool))
    rock = {"a": self.pal[6], "b": self.pal[4], "c": self.pal[2], "s": SHADOW}
    if g == 1:  # rubble
        for i in range(6):
            place(img, sp, rng, [PEBBLE, PEBBLE2, ["ab", "bs"]][i % 3], rock, pad=0)
    else:  # damp: dark wet patches that catch a glint
        for _ in range(2):
            place(img, sp, rng, [".ddd.", "ddhdd", ".ddd."], {"d": self.pal[1], "h": self.pal[5]}, pad=1)
        place(img, sp, rng, [".dd.", "dwhd", ".dd."], {"d": self.pal[0], "w": hx("#6a86b0"), "h": hx("#3a4a72")})


def high_group(self, img, rng, frame, g, v):
    sp = Spots(np.ones((T, T), bool))
    if g == 1:  # mossy
        for _ in range(2 + v % 2):
            place(img, sp, rng, [".ll.", "lmmm", "mmmd", ".dd."], {"l": MOSS[3], "m": MOSS[2], "d": MOSS[1]}, pad=1)
    else:  # cracked slabs
        crack = {"c": self.pal[2], "l": self.pal[7]}
        place(img, sp, rng, ["l.....", "cl....", ".ccl..", "...cc.", ".....c"], crack)
        place(img, sp, rng, ["l..", "cc.", "..c"], crack)
        place(img, sp, rng, [".aab", "abbc", ".ccs"], {"a": self.pal[7], "b": self.pal[5], "c": self.pal[3], "s": self.pal[2]})


def ash_group(self, img, rng, frame, g, v):
    sp = Spots(np.ones((T, T), bool))
    if g == 1:  # cinders, a couple still glowing
        for i in range(7):
            place(img, sp, rng, ["ab", "bc"] if i % 2 else ["ab"], {"a": self.pal[5], "b": self.pal[1], "c": self.pal[0]}, pad=0)
        for _ in range(2):
            place(img, sp, rng, ["g"], {"g": GLOW[2]}, pad=1)
    else:  # crust: a cracked skin with a dull red glow deep in the cracks
        place(img, sp, rng, ["c.....", ".cgc..", "...gcc", "......"], {"c": self.pal[0], "g": GLOW[0]})
        place(img, sp, rng, ["c..", ".gc", "..c"], {"c": self.pal[0], "g": GLOW[1]})
        place(img, sp, rng, ["l", "c"], {"l": self.pal[6], "c": self.pal[1]})


def dirt_group(self, img, rng, frame, g, v):
    sp = Spots(np.ones((T, T), bool))
    for i in range(5):  # stony ground
        place(img, sp, rng, [PEBBLE, ["ab", "bs"], PEBBLE2][i % 3], STONE_MAP, pad=0)


for cls, fn, n in ((Grass, grass_group, 4), (Sand, sand_group, 3), (Snow, snow_group, 3), (CaveFloor, cave_group, 3),
                   (High, high_group, 3), (Ash, ash_group, 3), (Dirt, dirt_group, 2)):
    cls.group = fn
    cls.groups = n


# how far each smooth outline pulls back from the half-way line (more where blades poke up past it)
for cls, m in ((TallGrass, 2.5), (Flowers, 2.0), (Shallows, 1.0), (Ice, 1.0), (Lava, 1.0), (Spring, 1.0),
               (High, 1.0), (Cobbles, 1.0), (Shadow, 1.0), (DeepWater, 1.0)):
    cls.m_org = m
Wall.organic = False

TERRAINS = {t.id: t for t in (
    Grass(), Dirt(), Sand(), Snow(), Ash(), CaveFloor(), TallGrass(), Flowers(), ForestFloor(), Mud(),
    Shallows(), DeepWater(), Ice(), High(), Cobbles(), Crystals(), Coals(), Lava(), Shadow(), Spring(),
    Bridge(), BridgeV(), Wall(),
    FortWall(), DungeonWall(), HouseWall(), Fence(), WoodFloor(), StoneFloor(),
)}
UNDER = {"deep_water": "shallows", "bridge": "deep_water", "bridge_v": "deep_water"}


# ---------- build ----------

def save(arr, path: Path) -> None:
    from PIL import Image
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, "RGBA").save(path)


ASEPRITE = "C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
ASE = HERE / "aseprite"


def build(ids=None, aseprite=False) -> None:
    """Every terrain's sheets (and the props) into web/game-art/battle/terrain/; with aseprite=True also the
    layered .aseprite sources into game/art-src/terrain/aseprite/ (made by Aseprite itself, in batch mode)."""
    import subprocess
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="terrain_"))
    jobs = []  # (target, width, height, {layer: [frame png, ...]})

    def frame_file(arr, name):
        f = tmp / name
        save(arr, f)
        return f

    for tid, t in TERRAINS.items():
        if ids and tid not in ids:
            continue
        sheets = [t.sheet(f) for f in range(t.frames)]
        save(sheets[0], OUT / f"{tid}.png")
        save(t.fill_strip(), OUT / f"{tid}_fill.png")
        fill_frames = []
        if t.frames == 1:
            fill_frames.append(t.fill_strip())   # every texture group
        for f in range(t.frames if t.frames > 1 else 0):
            strip = blank(4 * T, T)
            for v in range(4):
                strip[:, v * T:(v + 1) * T] = t.fill(v, f)
            fill_frames.append(strip)
        if t.frames > 1:
            anim = blank(16 * T, 4 * T)
            for f in range(4):
                anim[:, f * 4 * T:(f + 1) * 4 * T] = sheets[f]
            save(anim, OUT / f"{tid}_anim.png")
            fa = blank(4 * T, 4 * T)
            for v in range(4):
                for f in range(4):
                    fa[v * T:(v + 1) * T, f * T:(f + 1) * T] = t.fill(v, f)
            save(fa, OUT / f"{tid}_fill_anim.png")
        if aseprite:
            jobs.append((ASE / f"{tid}.aseprite", 4 * T, 4 * T,
                         {"tiles": [frame_file(a, f"{tid}_{i}.png") for i, a in enumerate(sheets)]}))
            jobs.append((ASE / f"{tid}_fill.aseprite", fill_frames[0].shape[1], T,
                         {"fill": [frame_file(a, f"{tid}_fill_{i}.png") for i, a in enumerate(fill_frames)]}))
        print("built", tid)
    if not ids or any(i.startswith("prop") for i in ids):
        import props
        for name, (shadow, obj) in props.build().items():
            if aseprite:
                h, w = obj.shape[:2]
                jobs.append((ASE / f"prop_{name}.aseprite", w, h,
                             {"shadow": [frame_file(shadow, f"p_{name}_s.png")], "prop": [frame_file(obj, f"p_{name}_o.png")]}))
    if not ids or any(i.startswith("decal") for i in ids):
        import decals
        for name, fn in decals.DECALS.items():
            strip = fn()
            save(strip, OUT / f"{name}.png")
            if aseprite:
                jobs.append((ASE / f"{name}.aseprite", strip.shape[1], T, {"decal": [frame_file(strip, f"{name}.png")]}))
            print("decal", name, strip.shape[1] // T, "cells")
    if jobs:
        ASE.mkdir(exist_ok=True)
        lua = []
        for target, w, h, layers in jobs:
            lua.append(f"do local spr = Sprite({w}, {h}, ColorMode.RGB)")
            for li, (lname, frames) in enumerate(layers.items()):
                if li == 0:
                    lua.append(f"local L = spr.layers[1] L.name = '{lname}'")
                else:
                    lua.append(f"local L = spr:newLayer() L.name = '{lname}'")
                for fi, fpath in enumerate(frames):
                    if li == 0 and fi > 0:
                        lua.append("spr:newEmptyFrame()")
                    lua.append(f"spr:newCel(L, {fi + 1}, Image{{ fromFile = '{fpath.as_posix()}' }}, Point(0, 0))")
            lua.append("for i, fr in ipairs(spr.frames) do fr.duration = 0.2 end")
            lua.append("spr.gridBounds = Rectangle(0, 0, 16, 16)")
            lua.append(f"spr:saveAs('{target.as_posix()}') spr:close() end")
        script = tmp / "build.lua"
        script.write_text("\n".join(lua), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        print(len(jobs), ".aseprite sources saved in", ASE)
    import shutil
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "build":
        build([a for a in sys.argv[2:] if not a.startswith("--")], aseprite="--aseprite" in sys.argv)
    elif cmd == "preview":
        import preview
        preview.main(sys.argv[2:])
