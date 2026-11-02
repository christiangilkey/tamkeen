"""Props for the battle arenas: obstacles that stand on the map (they block movement and shots).

Each is drawn standing on the bottom edge of its image, centred on its footprint (the Map chat's PROPS table says
how many tiles wide that is). Same light as the terrain and the creatures: from the top left. Same dark outer
outline as the creatures. A soft see-through shadow on the ground to the lower right.

Rounded things (foliage clumps, trunks, caps) are shaded as little 3D shapes and then snapped to a 5-8 tone
ramp; rocks are cut into flat facets so they read as chiselled stone; small details (leaf highlights, spines,
cracks, moss, berries) are placed on top by hand-designed stamps.

    .venv/Scripts/python game/art-src/terrain/props.py          writes web/game-art/battle/terrain/prop_*.png
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import blank, hx, mix, ramp, stamp  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / "web" / "game-art" / "battle" / "terrain"

LIGHT = np.array([-0.55, -0.7, 0.45])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
SHADOW = hx("#140a26", 110)
OUTLINE = hx("#120c18")


def rng_for(*parts):
    import zlib
    return np.random.default_rng(zlib.crc32("/".join(str(p) for p in parts).encode()))


class Sprite:
    """An object layer (with its outline) over a ground-shadow layer."""

    def __init__(self, w, h, name):
        self.w, self.h = w, h
        self.obj = blank(w, h)
        self.shadow = blank(w, h)
        self.rng = rng_for("prop", name)
        self.part = np.full((h, w), -1)   # which part each pixel belongs to (for shading between parts)

    def set(self, x, y, c, part=0):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.obj[y, x] = c
            self.part[y, x] = part

    def has(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h and self.obj[y, x, 3] > 0

    def ground_shadow(self, cx, cy, rx, ry):
        for y in range(self.h):
            for x in range(self.w):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self.shadow[y, x] = SHADOW

    def outline(self, col=OUTLINE):
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.obj[y, x, 3]:
                    continue
                if any(self.has(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    add.append((x, y))
        for x, y in add:
            self.obj[y, x] = col

    def image(self):
        out = self.shadow.copy()
        m = self.obj[:, :, 3] > 0
        out[m] = self.obj[m]
        return out


def band(v, pal, lo=-0.45, hi=0.95):
    """Light level -> a tone of the ramp (darkest first)."""
    t = (v - lo) / (hi - lo)
    return pal[max(0, min(len(pal) - 1, int(t * len(pal))))]


def blob(sp: Sprite, cx, cy, rx, ry, pal, rough=0.0, edge=0.0, bias=0.0, part=0, flat_bottom=None, seed=0,
         lo=-0.45, hi=0.95):
    """A shaded ellipsoid. rough wobbles the shading (leafy clusters), edge wobbles the outline."""
    rng = rng_for("blob", cx, cy, rx, seed)
    noise = rng.random((sp.h + 2, sp.w + 2))
    for y in range(int(cy - ry) - 2, int(cy + ry) + 3):
        for x in range(int(cx - rx) - 2, int(cx + rx) + 3):
            if not (0 <= x < sp.w and 0 <= y < sp.h):
                continue
            if flat_bottom is not None and y > flat_bottom:
                continue
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            r2 = dx * dx + dy * dy
            if r2 > 1 + (noise[y, x] - 0.5) * edge:
                continue
            nz = math.sqrt(max(0.0, 1 - min(r2, 1)))
            v = dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2] + (noise[y + 1, x + 1] - 0.5) * rough + bias
            sp.set(x, y, band(v, pal, lo, hi), part)


def facets(sp: Sprite, cx, cy, rx, ry, pal, n=6, part=0, flat_bottom=None, seed=0, bias=0.0):
    """A chiselled rock: an ellipsoid cut into n flat faces, each lit as one plane, with crisp edges."""
    rng = rng_for("facet", cx, cy, seed)
    seeds = []
    for _ in range(n):
        a = rng.random() * 2 * math.pi
        r = math.sqrt(rng.random()) * 0.85
        seeds.append((cx + math.cos(a) * r * rx, cy + math.sin(a) * r * ry))
    seeds.append((cx - rx * 0.3, cy - ry * 0.35))  # always a big lit face up top-left
    lum = []
    for fx, fy in seeds:
        dx, dy = (fx - cx) / rx, (fy - cy) / ry
        nz = math.sqrt(max(0.05, 1 - min(dx * dx + dy * dy, 0.95)))
        nn = np.array([dx * 1.2, dy * 1.2, nz])
        nn = nn / np.linalg.norm(nn)
        lum.append(float(nn @ LIGHT) + (rng.random() - 0.5) * 0.25 + bias)
    owner = {}
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            if not (0 <= x < sp.w and 0 <= y < sp.h):
                continue
            if flat_bottom is not None and y > flat_bottom:
                continue
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if dx * dx + dy * dy > 1:
                continue
            k = min(range(len(seeds)), key=lambda i: (x - seeds[i][0]) ** 2 + (y - seeds[i][1]) ** 2)
            owner[(x, y)] = k
    for (x, y), k in owner.items():
        c = band(lum[k], pal)
        idx = pal.index(c)
        up, lf = owner.get((x, y - 1)), owner.get((x - 1, y))
        dn, rt = owner.get((x, y + 1)), owner.get((x + 1, y))
        if (up is not None and up != k and lum[up] < lum[k]) or (lf is not None and lf != k and lum[lf] < lum[k]):
            c = pal[min(len(pal) - 1, idx + 1)]   # the lit rim of a face catching the light
        elif (dn is not None and dn != k and lum[dn] > lum[k]) or (rt is not None and rt != k and lum[rt] > lum[k]):
            c = pal[max(0, idx - 1)]              # the crease below a brighter face
        sp.set(x, y, c, part)


def cylinder(sp: Sprite, x0, x1, y0, y1, pal, part=0, bias=0.0, rough=0.0, seed=0):
    """A vertical round shape from column x0 to x1 (may vary with y: pass callables)."""
    rng = rng_for("cyl", x0 if not callable(x0) else 0, y0, seed)
    for y in range(y0, y1 + 1):
        a = x0(y) if callable(x0) else x0
        b = x1(y) if callable(x1) else x1
        w = max(1, b - a + 1)
        for x in range(a, b + 1):
            nx = (x + 0.5 - a) / w * 2 - 1
            nz = math.sqrt(max(0.0, 1 - nx * nx))
            v = nx * LIGHT[0] + nz * LIGHT[2] + (rng.random() - 0.5) * rough + bias
            sp.set(x, y, band(v, pal, -0.6, 0.8), part)


def line(sp, pts, cols, width=1, part=0):
    """A polyline; cols is a colour or a function of (t along it 0..1) -> colour."""
    total = []
    for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
        n = int(max(abs(xb - xa), abs(yb - ya))) + 1
        for i in range(n):
            t = i / max(1, n - 1)
            total.append((xa + (xb - xa) * t, ya + (yb - ya) * t))
    for i, (x, y) in enumerate(total):
        t = i / max(1, len(total) - 1)
        c = cols(t) if callable(cols) else cols
        w = width(t) if callable(width) else width
        for k in range(int(round(w))):
            sp.set(int(round(x)), int(round(y)) + k, c, part)


LAST = {}  # the last finished sprite's layers, for the .aseprite sources


def finish(sp: Sprite, outline=OUTLINE):
    sp.outline(outline)
    LAST["layers"] = (sp.shadow.copy(), sp.obj.copy())
    return sp.image()


# ---------- palettes ----------

LEAF = ramp("#0c1e22 #12322a #1a4a30 #246236 #317c3c #469644 #66b04e #92ca62 #c0e07c")
PINE = ramp("#081620 #0c2428 #123430 #1a4838 #245e40 #33764a #4a9058 #6aaa66")
BARK = ramp("#1a1014 #2a1a1a #3e2820 #563828 #6e4a30 #885e3a #a2764a")
PALMLEAF = ramp("#0a2020 #10342a #184c30 #226636 #30823c #48a046 #6cbc54 #9ad468")
PALMBARK = ramp("#2a1c1a #3e2c24 #56402e #6e5638 #886c44 #a08452 #bca068")
ROCK = ramp("#16111e #241c2c #342a3c #463a4e #5a4c60 #706070 #8a7a86 #a8989e #c8b8b4")
MOSS = ramp("#1a3024 #24442a #33602e #4a7c34 #6a9a40")
CACTUS = ramp("#0c221e #143628 #1c4c2e #266434 #337e3c #48964a #68b05a #94ca72")
CRYST = ramp("#120c2a #1c1644 #262468 #2c3c96 #3460c0 #4290e0 #6cc4f4 #b4ecff #ffffff")
OBSID = ramp("#07060c #0e0b18 #161228 #221a3c #302654 #463872 #6a58a0 #a490d8 #e0d4ff")
CAVESTONE = ramp("#141220 #201e30 #2e2a40 #3e3a52 #524c66 #6a6280 #847c98 #a8a0b8")
COLUMN = ramp("#1c1820 #2c2630 #403840 #564c54 #6e6268 #887a7e #a29496 #bcaeac #d6c8c0")
SHROOM_CAP = ramp("#1a1240 #2a1c66 #3c2a8e #5240b4 #6c5ad4 #8e7cec #b4a6fa #dcd2ff")
SHROOM_GLOW = [hx("#5ad8c8"), hx("#9af0e0"), hx("#e0fff8")]
STEM = ramp("#3a3448 #5a5266 #7c7488 #a098aa #c4bcc8 #e2dce4")


# ---------- the props ----------

def tree():
    sp = Sprite(48, 64, "tree")
    sp.ground_shadow(27, 61, 19, 3.5)
    # trunk with flared roots, and two branches up into the crown
    cylinder(sp, lambda y: 21 - (2 if y > 60 else 1 if y > 57 else 0), lambda y: 27 + (2 if y > 60 else 1 if y > 57 else 0),
             36, 62, BARK, part=1, rough=0.25)
    line(sp, [(22, 40), (17, 33), (14, 29)], BARK[3], width=3, part=1)
    line(sp, [(26, 39), (31, 32), (34, 28)], BARK[2], width=3, part=1)
    for y in range(40, 62, 3):  # bark furrows
        sp.set(23, y, BARK[1], 1)
        sp.set(25, y + 1, BARK[2], 1)
    # the crown: clumps of leaves, the back ones first
    clumps = [(24, 10, 10, 8), (14, 14, 9, 8), (34, 13, 9, 8), (8, 24, 7, 7), (40, 23, 7, 7),
              (20, 22, 11, 9), (31, 23, 10, 9), (14, 32, 8, 6), (26, 33, 10, 6), (37, 31, 7, 6)]
    for i, (cx, cy, rx, ry) in enumerate(clumps):
        blob(sp, cx, cy, rx + 0.6, ry + 0.6, [LEAF[1], LEAF[1]], edge=0.3, part=2 + i, seed=i)
    for i, (cx, cy, rx, ry) in enumerate(clumps):
        low = cy > 26
        blob(sp, cx - 0.5, cy - 0.5, rx - 0.6, ry - 0.6, LEAF[1:], rough=0.4, edge=0.4, part=2 + i, seed=i,
             bias=-0.12 if low else 0.0, lo=-0.3, hi=1.35)
    # leaf highlights: little sprigs on the lit side of the upper clumps
    sprig = [".l.", "lml", ".m."]
    rng = sp.rng
    for cx, cy, rx, ry in clumps:
        if cy > 26:
            continue
        for _ in range(2):
            x = int(cx - rx * 0.45 + rng.integers(-2, 3))
            y = int(cy - ry * 0.5 + rng.integers(-2, 2))
            if sp.has(x, y) and sp.has(x + 2, y + 2):
                stamp(sp.obj, x, y, sprig, {"l": LEAF[8], "m": LEAF[7]})
    # the crown's shade on the trunk just below it
    for x in range(14, 34):
        for y in range(36, 44):
            if sp.part[y, x] == 1 and any(0 <= y - k and sp.part[y - k, x] >= 2 for k in range(1, 4)):
                sp.obj[y, x] = BARK[1]
    return finish(sp)


def pine():
    sp = Sprite(32, 64, "pine")
    sp.ground_shadow(18, 61, 13, 3)
    cylinder(sp, 14, 17, 52, 62, BARK, part=1, rough=0.2)
    rng = sp.rng
    tiers = [(2, 13, 5), (7, 21, 8), (13, 30, 10.5), (21, 40, 12.5), (30, 52, 14.5)]  # top, bottom, half width
    cx = 15.5
    for i, (top, bot, hw) in enumerate(tiers):
        # a ragged lower edge: boughs hanging at different lengths
        hang = {x: int(rng.integers(-1, 2)) for x in range(32)}
        for y in range(top, bot + 2):
            t = (y - top) / max(1, bot - top)
            half = 1 + (hw - 1) * min(1.0, t)
            for x in range(int(cx - half) - 1, int(cx + half) + 2):
                dx = (x + 0.5 - cx) / max(1.0, half)
                if abs(dx) > 1:
                    continue
                edge_y = bot + hang[x] - (1 if abs(dx) < 0.25 else 0) + (1 if abs(dx) > 0.75 else 0)
                if y > edge_y:
                    continue
                # lit from the left, each tier's upper part lit, its lower edge in shade
                v = -dx * 0.55 + (0.35 - t * 0.55) + (rng.random() - 0.5) * 0.3
                if y == edge_y:
                    v -= 0.35
                sp.set(x, y, band(v, PINE, -0.75, 0.75), 2 + i)
        # needle sprays: light diagonal strokes on the lit side, dark ones on the shaded side
        for k in range(int(hw * 1.4)):
            y = top + 2 + int(rng.integers(0, max(1, bot - top - 2)))
            t = (y - top) / max(1, bot - top)
            half = 1 + (hw - 1) * t
            x = int(cx + (rng.random() * 2 - 1) * half * 0.85)
            if not (sp.has(x, y) and sp.has(x - 1, y + 1)):
                continue
            if x < cx:
                sp.set(x, y, PINE[7], 2 + i)
                sp.set(x - 1, y + 1, PINE[6], 2 + i)
            else:
                sp.set(x, y, PINE[3], 2 + i)
                sp.set(x + 1, y + 1, PINE[2], 2 + i)
    # each tier casts a dark band onto the one below
    for y in range(1, 64):
        for x in range(32):
            p, q = sp.part[y, x], sp.part[y - 1, x]
            if p >= 2 and q >= 2 and q < p:
                sp.obj[y, x] = PINE[0]
                if y + 1 < 64 and sp.part[y + 1, x] == p:
                    sp.obj[y + 1, x] = PINE[1]
    sp.set(15, 1, PINE[6], 2)
    return finish(sp)


def palm():
    sp = Sprite(48, 64, "palm")
    sp.ground_shadow(26, 61, 15, 3)
    # the trunk: a gentle curve, ringed, lit on its left, thicker at the foot
    n = 44
    for i in range(n):
        t = i / (n - 1)
        x = 19 + 10 * t * t
        y = 62 - 41 * t
        w = 6 if t < 0.25 else 5 if t < 0.7 else 4
        for k in range(w):
            nx = (k + 0.5) / w * 2 - 1
            v = nx * LIGHT[0] + math.sqrt(1 - nx * nx) * LIGHT[2]
            idx = PALMBARK.index(band(v, PALMBARK, -0.6, 0.8))
            if i % 3 == 0:
                idx = 1 if k > 0 else 3            # the ridge of a ring
            elif i % 3 == 1:
                idx = min(6, idx + 1)              # the lit band just above it
            sp.set(int(round(x - w / 2 + k)), int(round(y)), PALMBARK[idx], 1)
    crown = (29, 21)
    for cx, cy in ((26, 24.5), (30.5, 25.5), (28, 27)):  # coconuts
        blob(sp, cx, cy, 2.3, 2.2, BARK, part=1, seed=int(cx))

    def frond(dx, dy, droop, j, back=False):
        """A frond: a long leaf hanging from an arching rib, widest in the middle, its lower edge jagged with
        leaflet tips; the rib side lit, the hanging side darker."""
        steps = 40
        rng = rng_for("frond", j)
        top_c = PALMLEAF[5 if back else 7]
        for i in range(steps + 1):
            t = i / steps
            x = crown[0] + dx * t
            y = crown[1] + dy * t + droop * t * t
            w = 0.8 + 4.2 * math.sin(math.pi * min(1.0, t * 1.05)) ** 0.8
            if i % 2 == 1:
                w -= 1.4 + rng.random()   # the gaps between leaflet tips
            xi = int(round(x))
            for k in range(int(round(max(0, w))) + 1):
                yy = int(round(y)) + k
                if k == 0:
                    c = top_c if t < 0.8 else PALMLEAF[5 if back else 6]
                else:
                    c = PALMLEAF[max(1, (4 if back else 6) - k)]
                sp.set(xi, yy, c, 2 + j)

    # back fronds first (darker), then the front ones over them
    for j, (dx, dy, dr) in enumerate([(-12, -15, 7), (13, -15, 7), (1, -17, 5)]):
        frond(dx, dy, dr, j, back=True)
    for j, (dx, dy, dr) in enumerate([(-22, -5, 13), (21, -6, 13), (-15, 3, 12), (15, 4, 11), (-6, -12, 10), (7, -11, 10)]):
        frond(dx, dy, dr, 3 + j)
    blob(sp, crown[0], crown[1] + 0.5, 2.4, 2.0, PALMLEAF[:5], part=12, seed=3)
    return finish(sp)


def bush():
    sp = Sprite(16, 16, "bush")
    sp.ground_shadow(9, 14.5, 7.5, 2)
    clumps = ((5, 8, 4), (11, 8, 4.2), (8, 6, 4.5), (4.5, 11, 3.6), (8.5, 11, 4.2), (12, 11, 3.4))
    for i, (cx, cy, r) in enumerate(clumps):
        blob(sp, cx, cy, r, r * 0.9, [LEAF[1], LEAF[1]], edge=0.3, part=i, seed=i, flat_bottom=13)
    for i, (cx, cy, r) in enumerate(clumps):
        blob(sp, cx - 0.3, cy - 0.3, r - 0.5, r * 0.9 - 0.5, LEAF[1:], rough=0.35, edge=0.3, part=i, seed=i,
             flat_bottom=13, lo=-0.3, hi=1.35, bias=-0.1 if cy > 9 else 0)
    for x, y in ((6, 5), (9, 3), (4, 8)):
        if sp.has(x, y):
            sp.obj[y, x] = LEAF[8]
    for x, y in ((10, 9), (6, 11), (12, 7)):  # berries
        if sp.has(x, y):
            sp.obj[y, x] = hx("#e8405a")
            if sp.has(x - 1, y - 1):
                sp.obj[y - 1, x - 1] = hx("#ff9aa8")
    return finish(sp)


def boulder():
    sp = Sprite(16, 16, "boulder")
    sp.ground_shadow(9.5, 14.2, 7.5, 2)
    facets(sp, 8, 9, 7.2, 6.4, ROCK, n=8, flat_bottom=14, seed=5)
    facets(sp, 11.5, 11, 3.6, 3.2, ROCK, n=3, flat_bottom=14, seed=6, part=1, bias=-0.15)
    for x, y in ((5, 4), (6, 3), (7, 3), (4, 5)):  # a little moss on top
        if sp.has(x, y):
            sp.obj[y, x] = MOSS[3] if y > 3 else MOSS[4]
    return finish(sp)


def rock_big():
    sp = Sprite(32, 32, "rock_big")
    sp.ground_shadow(18, 29.5, 15, 3)
    facets(sp, 16, 15, 13, 11, ROCK, n=9, flat_bottom=29, seed=2, part=0)
    facets(sp, 8, 22, 7.5, 7, ROCK, n=5, flat_bottom=29, seed=3, part=1)
    facets(sp, 25, 23, 6.5, 6, ROCK, n=5, flat_bottom=29, seed=4, part=2, bias=-0.1)
    for x, y in ((13, 6), (12, 7), (14, 6), (15, 6), (11, 8), (17, 7)):
        if sp.has(x, y):
            sp.obj[y, x] = MOSS[3] if (x + y) % 2 else MOSS[4]
    for (x, y) in ((19, 12), (20, 13), (20, 14), (21, 15)):  # a crack
        if sp.has(x, y):
            sp.obj[y, x] = ROCK[1]
    return finish(sp)


def obsidian():
    sp = Sprite(16, 16, "obsidian")
    sp.ground_shadow(9, 14.3, 7, 2)
    # glassy black shards: each a left face and a right face meeting at a ridge, edges catching violet light
    shards = [(3, 14, 7, 4, 3), (8, 14, 1, 4, 4), (12, 14, 6, 3, 3)]  # foot x, foot y, tip y, half width left, right
    for j, (fx, fy, ty, wl, wr) in enumerate(shards):
        for y in range(ty, fy + 1):
            t = (y - ty) / max(1, fy - ty)
            l = int(round(wl * t))
            r = int(round(wr * t))
            for x in range(fx - l, fx + r + 1):
                if x < fx:
                    c = OBSID[4] if x == fx - l else OBSID[3]
                elif x == fx:
                    c = OBSID[7] if t < 0.5 else OBSID[6]
                else:
                    c = OBSID[1] if x == fx + r else OBSID[2]
                sp.set(x, y, c, j)
        sp.set(fx, ty, OBSID[8], j)
    for x in range(1, 15):  # the rough base they grow from
        if sp.has(x, 14) or sp.has(x, 13):
            sp.set(x, 14, OBSID[1], 9)
    return finish(sp)


def cactus():
    sp = Sprite(16, 32, "cactus")
    sp.ground_shadow(9, 30.3, 6, 1.8)

    def ribbed(x0, x1, y0, y1, part):
        cylinder(sp, x0, x1, y0, y1, CACTUS, part=part)
        for y in range(y0, y1 + 1):
            for x in range(x0 + 1, x1, 2):  # ribs
                c = sp.obj[y, x]
                idx = [tuple(p) for p in CACTUS].index(tuple(c))
                sp.obj[y, x] = CACTUS[max(0, idx - 1)]
    ribbed(6, 10, 5, 30, 0)
    for x in (6, 7, 8, 9, 10):  # round the top
        pass
    sp.obj[5, 6] = 0
    sp.obj[5, 10] = 0
    ribbed(1, 4, 9, 15, 1)       # left arm, rising
    ribbed(2, 5, 16, 18, 1)
    ribbed(12, 15, 7, 13, 2)     # right arm
    ribbed(11, 14, 14, 16, 2)
    sp.obj[9, 1] = 0
    sp.obj[9, 4] = 0
    sp.obj[7, 12] = 0
    sp.obj[7, 15] = 0
    for x, y in ((7, 9), (9, 13), (7, 18), (9, 23), (2, 12), (13, 10), (8, 27)):  # spines
        sp.obj[y, x] = hx("#e8f0c8")
    stamp(sp.obj, 7, 3, [".p.", "pyp"], {"p": hx("#ff7aa8"), "y": hx("#ffe070")})  # a flower on top
    return finish(sp)


def crystal():
    sp = Sprite(16, 32, "crystal")
    sp.ground_shadow(9, 30.3, 7, 1.8)

    def prism(x0, w, y0, y1, part, dim=0):
        ridge = x0 + w // 2
        for y in range(y0, y1 + 1):
            k = y - y0
            a, b = x0, x0 + w - 1
            if k == 0:
                a = b = ridge
            elif k == 1:
                a, b = ridge - 1, ridge + 1
            elif k == 2 and w > 4:
                a, b = ridge - 2, ridge + 2
            for x in range(a, b + 1):
                if x < ridge:
                    c = CRYST[6 - dim] if x == a else CRYST[5 - dim]
                elif x == ridge:
                    c = CRYST[7 - dim]
                else:
                    c = CRYST[3 - dim] if x == b else CRYST[4 - dim]
                sp.set(x, y, c, part)
        sp.set(ridge, y0, CRYST[8], part)
    prism(1, 4, 14, 29, 1, dim=1)
    prism(10, 5, 11, 29, 2, dim=1)
    prism(4, 7, 2, 29, 0)
    for y in (8, 14, 20):  # light running up inside the main pillar
        sp.set(6, y, CRYST[8], 0)
        sp.set(6, y + 1, CRYST[7], 0)
    for x in range(1, 15):  # rocks at its foot
        if sp.has(x, 29):
            sp.set(x, 30, CAVESTONE[3] if x % 3 else CAVESTONE[5], 9)
    return finish(sp, hx("#0c0820"))


def stalagmite():
    sp = Sprite(16, 32, "stalagmite")
    sp.ground_shadow(9, 30.3, 7, 1.8)
    cylinder(sp, lambda y: int(round(7.5 - (y - 3) * 0.24)), lambda y: int(round(7.5 + (y - 3) * 0.2)),
             4, 30, CAVESTONE, part=0, rough=0.15)
    cylinder(sp, lambda y: int(round(12.5 - (y - 18) * 0.25)), lambda y: int(round(12.5 + (y - 18) * 0.15)),
             19, 30, CAVESTONE, part=1, bias=-0.15)
    for y in range(6, 30, 5):  # mineral bands
        for x in range(16):
            if sp.part[y, x] == 0 and sp.has(x, y):
                c = sp.obj[y, x]
                idx = [tuple(p) for p in CAVESTONE].index(tuple(c))
                sp.obj[y, x] = CAVESTONE[max(0, idx - 1)]
    for y in range(8, 26):  # a wet streak down the lit side
        x = int(round(7.5 - (y - 3) * 0.24)) + 1
        if y % 3 != 0:
            sp.set(x, y, CAVESTONE[7], 0)
    sp.set(7, 4, CAVESTONE[6], 0)
    return finish(sp)


def pillar():
    sp = Sprite(16, 32, "pillar")
    sp.ground_shadow(9, 30.3, 7.5, 1.8)
    # the plinth
    cylinder(sp, 1, 14, 27, 30, COLUMN, part=0)
    for x in range(1, 15):
        sp.set(x, 27, COLUMN[7] if x < 10 else COLUMN[5], 0)
        sp.set(x, 30, COLUMN[2], 0)
    cylinder(sp, 2, 13, 25, 26, COLUMN, part=0)
    # the fluted shaft, broken off at a slant
    top = {x: 8 + (abs(x - 5) // 2) + (2 if x > 9 else 0) for x in range(3, 13)}
    for x in range(3, 13):
        for y in range(top[x], 25):
            nx = (x + 0.5 - 3) / 10 * 2 - 1
            v = nx * LIGHT[0] + math.sqrt(max(0, 1 - nx * nx)) * LIGHT[2]
            c = band(v, COLUMN, -0.6, 0.8)
            if (x - 3) % 3 == 2:
                idx = [tuple(p) for p in COLUMN].index(tuple(c))
                c = COLUMN[max(0, idx - 2)]   # a flute
            sp.set(x, y, c, 1)
        sp.set(x, top[x], COLUMN[8] if x < 9 else COLUMN[6], 1)  # the broken top catches the light
    for x, y in ((9, 15), (10, 16), (10, 17), (9, 18)):  # a crack
        sp.set(x, y, COLUMN[1], 1)
    for x, y in ((4, 20), (5, 21), (4, 22), (5, 23), (6, 24), (3, 24), (4, 25), (5, 26)):  # ivy at the foot
        sp.set(x, y, MOSS[3] if (x + y) % 2 else MOSS[4], 1)
    return finish(sp)


def mushroom():
    sp = Sprite(16, 32, "mushroom")
    sp.ground_shadow(9, 30.3, 7, 1.8)
    cylinder(sp, lambda y: 6 - (1 if y > 27 else 0), lambda y: 9 + (1 if y > 27 else 0), 14, 30, STEM, part=0)
    # the cap: a dome, glowing spots on top, dark gills underneath
    for y in range(4, 15):
        for x in range(0, 16):
            dx, dy = (x + 0.5 - 8) / 7.6, (y + 0.5 - 12.5) / 8.5
            if dx * dx + dy * dy > 1 or y > 13:
                continue
            nz = math.sqrt(max(0, 1 - dx * dx - dy * dy))
            v = dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2]
            sp.set(x, y, band(v, SHROOM_CAP), 1)
    for x in range(1, 15):
        if sp.has(x, 13):
            sp.set(x, 14, SHROOM_CAP[1], 1)  # gills
    for x, y, r in ((5, 7, 1), (10, 6, 0), (12, 9, 0), (7, 10, 0), (3, 10, 0)):
        sp.set(x, y, SHROOM_GLOW[2], 1)
        if r:
            for dx, dy in ((1, 0), (0, 1), (1, 1)):
                sp.set(x + dx, y + dy, SHROOM_GLOW[1], 1)
    # a small one at its foot
    for y in range(24, 28):
        for x in range(10, 16):
            dx, dy = (x + 0.5 - 13) / 2.8, (y + 0.5 - 27) / 3
            if dx * dx + dy * dy <= 1 and y < 27:
                sp.set(x, y, SHROOM_CAP[5] if dx < 0 else SHROOM_CAP[3], 2)
    sp.set(13, 27, STEM[4], 2)
    sp.set(13, 28, STEM[3], 2)
    sp.set(12, 25, SHROOM_GLOW[2], 2)
    return finish(sp, hx("#0c0820"))


PROPS = {
    "boulder": boulder, "rock_big": rock_big, "tree": tree, "pine": pine, "palm": palm, "bush": bush,
    "cactus": cactus, "crystal": crystal, "stalagmite": stalagmite, "pillar": pillar, "obsidian": obsidian,
    "mushroom": mushroom,
}


def build():
    """Write every prop's PNG; returns {name: (shadow layer, object layer)} for the .aseprite sources."""
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    layers = {}
    for name, fn in PROPS.items():
        im = Image.fromarray(fn(), "RGBA")
        im.save(OUT / f"prop_{name}.png")
        layers[name] = LAST["layers"]
        print("prop", name, im.size)
    return layers


if __name__ == "__main__":
    build()
