"""More trees for the battle arenas (owner: "trees need more variety, more shapes, dead trees, some knocked over,
some taller, some stumps"). Same rules and look as props.py / props_more.py: each prop stands on the bottom edge of
its image, centred on a one-row footprint, light from the top left, dark outline, a see-through ground shadow to
the lower right. Built by terrain.py (EXTRA) like the other recipe files:

    .venv/Scripts/python game/art-src/terrain/terrain.py build prop_tree_tall ... --aseprite
    .venv/Scripts/python game/art-src/terrain/trees_art.py preview     writes preview/trees_art_preview.png

Standing trees (kind "tree"): tree_tall, tree_poplar, tree_round, tree_twisted, tree_dead_tall, tree_dead_broken.
Conifers (kind "pine"): pine_tall, pine_dead. Fallen trees (kind "log"): log_fallen, log_mossy.
Stumps (kind "stump"): stump, stump_big, stump_axe, stump_mossy.

Round wood (trunks, limbs, logs, roots) is drawn with `tube`: a capsule along a polyline whose radius changes along
it, every pixel lit by the surface's own slope, so a trunk is lit on its left and a log lying down along its top.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import hx, ramp, stamp  # noqa: E402
from props import (BARK, LEAF, LIGHT, MOSS, OUTLINE, PINE, ROCK, STEM, Sprite, band, blob,  # noqa: E402
                   cylinder, finish, line, rng_for)
from props_more import DEADWOOD, IRON, PLANK, _idx, _shift, done  # noqa: E402

# ---------- palettes (darkest first) ----------

DEAD = DEADWOOD + ramp("#a08a76 #bca896")             # weathered grey-brown wood, two paler tones for its lit side
HEART = ramp("#3a2418 #5a3a22 #7c5430 #a07444 #c0945a #dab478 #ecd29c")   # cut or splintered wood
ROT = ramp("#22140e #3a2416 #563620 #704a2a #8a6036 #a47a48")             # old, rotting wood inside a stump
SOIL = ramp("#140c0a #241812 #36241a #4a3222 #60422c #785636 #906c44")    # earth on a torn-up root plate
OLIVE = ramp("#121e1c #1a2e28 #26422e #345834 #476e3c #5e8648 #7a9e58 #9ab66e #c0d090")  # silvery, gnarled tree
POPLAR = ramp("#0c2018 #123222 #1a482a #235e30 #2e7634 #408e3a #58a644 #7ebe54 #aed46e")
ROUNDL = ramp("#0a1c22 #0e2e2c #144232 #1b5838 #26703e #348848 #4aa252 #6ebc5e #9ed476")  # emerald, glossy
NEEDLE_DEAD = ramp("#2a1a12 #44281a #5e3a22 #7a4e2c #946638 #ac7e48 #c49a60")   # dry, brown needles
MOSSY = MOSS + [hx("#8cb850"), hx("#b0d468")]
SHROOM = ramp("#3a1008 #6e1e0e #a83a18 #d8602a #f09048 #fcc47a")
SPOT = hx("#fff4e0")
TURF = ramp("#1a3a1c #24542a #337034 #4a8c3c #68a848")   # grass still growing on the root plate


# ---------- drawing helpers ----------

def tube(sp: Sprite, pts, radii, pal, part=1, rough=0.12, seed=0, lo=-0.6, hi=0.8, bias=0.0, flat=None,
         grain=0, twist=0.0, cut=None):
    """A round limb along a polyline, its radius going from radii[i] to radii[i+1] along each piece (round caps at
    the ends). Each pixel is lit by the tube's own surface there. flat: nothing below this row (a trunk standing on
    the ground). grain: bark furrows every `grain` px across, broken along the length; twist slants them (a spiral).
    cut(x, y) -> True skips a pixel (a jagged broken end)."""
    pts = [(float(x), float(y)) for x, y in pts]
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(pts)
    segs, total = [], 0.0
    for i in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        ln = math.hypot(bx - ax, by - ay) or 1e-6
        segs.append((ax, ay, bx, by, ln, total, radii[i], radii[i + 1]))
        total += ln
    rmax = max(radii)
    rng = rng_for("tube", sp.w, sp.h, seed, int(pts[0][0] * 7), int(pts[0][1] * 3))
    noise = rng.random((sp.h, sp.w))
    breaks = rng.random(4096)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    for y in range(max(0, int(min(ys) - rmax) - 1), min(sp.h, int(max(ys) + rmax) + 2)):
        if flat is not None and y > flat:
            continue
        for x in range(max(0, int(min(xs) - rmax) - 1), min(sp.w, int(max(xs) + rmax) + 2)):
            if cut is not None and cut(x, y):
                continue
            px, py = x + 0.5, y + 0.5
            best = None
            for ax, ay, bx, by, ln, l0, ra, rb in segs:
                u = max(0.0, min(1.0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (ln * ln)))
                qx, qy = ax + (bx - ax) * u, ay + (by - ay) * u
                r = ra + (rb - ra) * u
                d = math.hypot(px - qx, py - qy)
                if best is None or d - r < best[0]:
                    best = (d - r, qx, qy, r, l0 + ln * u, (bx - ax) / ln, (by - ay) / ln)
            score, qx, qy, r, along, dx, dy = best
            if score > 0:
                continue
            ox, oy = (px - qx) / r, (py - qy) / r
            nz = math.sqrt(max(0.0, 1 - ox * ox - oy * oy))
            v = ox * LIGHT[0] + oy * LIGHT[1] + nz * LIGHT[2] + bias + (noise[y, x] - 0.5) * rough
            i = pal.index(band(v, pal, lo, hi))
            if grain and r > 1.6:
                across = (px - qx) * (-dy) + (py - qy) * dx + r + along * twist   # px across the tube
                k = int(math.floor(across / grain))
                if across - k * grain < 1.0 and breaks[(k * 37 + int(along / 4) * 11) % 4096] > 0.3:
                    i = max(0, i - (2 if i >= 4 else 1))
            sp.set(x, y, pal[i], part)


def foliage(sp: Sprite, clumps, leaf, part0=2, low_line=None, sprigs=2, rough=0.4, edge=0.4, bias=None,
            sprig_if=None):
    """Leaf clumps the way crown_tree draws them: a dark mass first (so the gaps between clumps read as deep shade),
    then each clump lit from the top left, the low ones a little darker, sprigs of light on the upper ones.
    bias: optional fn(x, y) -> extra light for a clump (a crown that is lit as one big shape).
    sprig_if: optional fn(x, y) -> whether a clump gets sprigs (default: the clumps above low_line)."""
    for i, (x, y, rx, ry) in enumerate(clumps):
        blob(sp, x, y, rx + 0.6, ry + 0.6, [leaf[1], leaf[1]], edge=0.3, part=part0 + i, seed=i)
    if low_line is None:
        low_line = max(y for x, y, rx, ry in clumps) - 4
    for i, (x, y, rx, ry) in enumerate(clumps):
        b = bias(x, y) if bias else (-0.12 if y > low_line else 0.0)
        blob(sp, x - 0.5, y - 0.5, rx - 0.6, ry - 0.6, leaf[1:], rough=rough, edge=edge, part=part0 + i, seed=i,
             bias=b, lo=-0.3, hi=1.35)
    rng = sp.rng
    for x, y, rx, ry in clumps:
        if not bool(sprig_if(x, y) if sprig_if else y <= low_line):
            continue
        for _ in range(sprigs):
            sx = int(x - rx * 0.45 + rng.integers(-2, 3))
            sy = int(y - ry * 0.5 + rng.integers(-2, 2))
            if sp.has(sx, sy) and sp.has(sx + 2, sy + 2) and sp.part[sy, sx] >= part0:
                stamp(sp.obj, sx, sy, [".l.", "lml", ".m."], {"l": leaf[8], "m": leaf[7]})


def crown_shade(sp: Sprite, wood=(1,), pal=BARK, depth=4):
    """The crown's shade on the wood just below it."""
    for y in range(1, sp.h):
        for x in range(sp.w):
            if sp.part[y, x] in wood and any(0 <= y - k and sp.part[y - k, x] >= 2 for k in range(1, depth)):
                _shift(sp, x, y, pal, -2)


def twig(sp, pts, col, part=1):
    line(sp, pts, col, part=part)


def disk(sp, cx, cy, rx, ry, part, face=HEART, rim=BARK, rings=3, pith=True, rot=False):
    """The flat top of a cut trunk seen from above: a bark rim, pale wood inside with growth rings, lit evenly
    (paler on the left), the pith a dark dot."""
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            r = math.hypot(dx, dy)
            if r > 1:
                continue
            # the bark ring (a pixel wide across, less up and down, as the top is foreshortened)
            edge = min(1 - 1.0 / rx, 1 - 0.7 / ry)
            if r > edge:  # its far side in shade, its near lip catching the light
                c = rim[2] if dy < 0 else rim[5] if dx < -0.2 else rim[4] if dx < 0.5 else rim[3]
            else:
                rr = r / edge
                k = 5 if dx > -0.4 else 6           # pale cut wood, palest on the left
                if dx > 0.55:
                    k = 4
                if rot:
                    k -= 2
                if rings and rr > 0.25 and (rr * rings) % 1 < 0.22 + 0.1 / rings:
                    k = 3 if dx < 0.55 else 2       # a growth ring
                if pith and rr < 0.2:
                    k = 2
                c = face[max(0, min(len(face) - 1, k))]
            sp.set(x, y, c, part)


def stump_body(sp, cx, top, bot, rx, ry, part=0, pal=BARK, furrow=3):
    """A short upright cylinder: from the middle of its top ellipse down to a bottom edge curved like the top."""
    for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
        dx = (x + 0.5 - cx) / rx
        if abs(dx) > 1:
            continue
        arc = ry * math.sqrt(max(0.0, 1 - dx * dx))
        v = dx * LIGHT[0] + math.sqrt(max(0.0, 1 - dx * dx)) * LIGHT[2]
        i = pal.index(band(v, pal, -0.6, 0.8))
        for y in range(int(top), int(round(bot + arc - ry)) + 1):
            c = i
            if furrow and (x - int(cx - rx)) % furrow == 1 and (y * 5 + x * 3) % 7 < 5:
                c = max(0, i - 1)
            sp.set(x, y, pal[c], part)


def rows(sp, design, x0, y0, cmap, part):
    """Paint a designed pixel grid (a stamp) and give its pixels a part."""
    for j, row in enumerate(design):
        for i, ch in enumerate(row):
            if ch in ". ":
                continue
            sp.set(x0 + i, y0 + j, cmap[ch], part)


# ---------- standing trees ----------

def tree_tall():
    """A tall old oak: a long trunk forking into two great limbs high up, a spreading crown on top."""
    sp = Sprite(48, 80, "tree_tall")
    sp.ground_shadow(27, 77, 19, 3.5)
    tube(sp, [(23.5, 79), (23.2, 66), (23.8, 54), (24, 48)], [4.3, 3.7, 3.5, 3.3], BARK, part=1, flat=78, grain=3,
         rough=0.2)
    for pts, r in (([(21, 74), (17, 77), (14, 78.5)], [2.2, 1.5, 1.0]), ([(26, 74), (30, 77), (34, 78.5)], [2.2, 1.5, 1.0]),
                   ([(23, 76), (22, 78.5)], [2.4, 1.8])):
        tube(sp, pts, r, BARK, part=1, flat=78)
    # the fork: two great limbs, and a thinner one between them, up into the crown
    tube(sp, [(23, 50), (19, 42), (15, 34), (12, 27)], [3.0, 2.6, 2.1, 1.6], BARK, part=1, grain=3, seed=1)
    tube(sp, [(25, 50), (29, 42), (33, 34), (37, 26)], [3.0, 2.6, 2.1, 1.6], BARK, part=1, grain=3, seed=2)
    tube(sp, [(24, 45), (25, 36), (24, 26)], [1.7, 1.4, 1.1], BARK, part=1, seed=3)
    tube(sp, [(15, 36), (9, 33), (6, 29)], [1.3, 1.0, 0.8], BARK, part=1, seed=4)    # a side bough
    # a knot hole on the trunk
    rows(sp, [".dd.", "d00b", "d00b", ".bb."], 21, 60, {"d": BARK[1], "0": BARK[0], "b": BARK[4]}, 1)
    clumps = [(24, 9, 9, 7), (13, 13, 8, 7), (35, 12, 8, 7), (6.6, 23, 4.8, 5.4), (41.4, 22, 4.8, 5.4),
              (18, 21, 9, 8), (31, 20, 9, 8), (10, 31, 7, 5), (24, 30, 7.5, 5), (38, 30, 6.5, 5)]
    foliage(sp, clumps, LEAF)
    crown_shade(sp)
    return finish(sp)


def tree_poplar():
    """A slim, tall column of a tree (a Lombardy poplar): small leaf clumps stacked up a narrow flame shape."""
    sp = Sprite(32, 80, "tree_poplar")
    sp.ground_shadow(19, 77, 9.5, 3)
    tube(sp, [(16, 79), (16, 62)], [2.5, 2.0], BARK, part=1, flat=78, grain=3)
    tube(sp, [(14.8, 74), (11.5, 78.5)], [1.5, 0.9], BARK, part=1, flat=78)
    tube(sp, [(17.2, 74), (20.5, 78.5)], [1.5, 0.9], BARK, part=1, flat=78)
    cx, top, bot = 16.0, 2.0, 68.0
    clumps = []
    rng = rng_for("poplar")
    for j, y in enumerate(np.arange(top + 4, bot - 3, 3.3)):
        t = (y - top) / (bot - top)
        hw = 10.4 * t ** 0.6 * math.sqrt(max(0.0, 1 - t ** 4))
        r = max(2.4, min(3.8, hw * 0.5))
        if hw < 3.6:
            clumps.append((cx + rng.uniform(-0.4, 0.4), y, r, r))
            continue
        off = hw - r
        for s in (-1, 1):
            tuft = 1.4 if rng.random() < 0.35 else 0.0      # a tuft standing out of the column now and then
            clumps.append((cx + s * (off + tuft) + rng.uniform(-0.4, 0.4), y + (1.4 if (s > 0) == (j % 2 == 0) else 0),
                           r, r * 0.92))
        clumps.append((cx + rng.uniform(-1.0, 1.0), y + 1.7, r, r * 0.92))
    foliage(sp, clumps, POPLAR, low_line=bot - 8, sprigs=1, rough=0.35,
            bias=lambda x, y: -0.5 * (x - cx) / 7 + (-0.22 if y > bot - 8 else 0.06 if y < 22 else 0.0),
            sprig_if=lambda x, y: x < cx - 1 and y < bot - 12 and int(y) % 3 == 0)
    sp.set(16, 1, POPLAR[6], 2)
    crown_shade(sp)
    return finish(sp)


def tree_round():
    """A low, very round tree: a ball of small leaf puffs, lit as one sphere, on a short thick trunk."""
    sp = Sprite(48, 64, "tree_round")
    sp.ground_shadow(27, 61, 19, 3.5)
    tube(sp, [(24, 63), (24, 50), (24.5, 42)], [3.9, 3.3, 3.0], BARK, part=1, flat=62, grain=3)
    tube(sp, [(21.5, 59), (17, 62.5)], [1.8, 1.0], BARK, part=1, flat=62)
    tube(sp, [(26.5, 59), (31, 62.5)], [1.8, 1.0], BARK, part=1, flat=62)
    CX, CY, RX, RY = 24.0, 26.5, 21.5, 20.0
    puffs = []
    for j, y in enumerate(np.arange(CY - RY + 4.2, CY + RY - 3.0, 4.4)):
        for x in np.arange(CX - RX + 4 + (2.6 if j % 2 else 0), CX + RX - 3, 5.2):
            if ((x - CX) / (RX - 4.0)) ** 2 + ((y - CY) / (RY - 4.0)) ** 2 <= 1.05:
                puffs.append((float(x), float(y), 4.6, 4.2))

    def lit(x, y):
        gx, gy = (x - CX) / RX, (y - CY) / RY
        gz = math.sqrt(max(0.0, 1 - gx * gx - gy * gy))
        return (gx * LIGHT[0] + gy * LIGHT[1] + gz * LIGHT[2] - 0.45) * 1.15

    blob(sp, CX, CY, RX - 3, RY - 3, [ROUNDL[1], ROUNDL[1]], part=2, seed=99)
    foliage(sp, puffs, ROUNDL, low_line=CY + RY - 6, sprigs=1, rough=0.3, edge=0.35, bias=lit,
            sprig_if=lambda x, y: lit(x, y) > 0.0 and int(x + y) % 2 == 0)
    crown_shade(sp, depth=5)
    return finish(sp)


def tree_twisted():
    """A gnarled old tree (an olive): its trunk leaning and twisting up to the right, one bough reaching left,
    the silvery crown lopsided over the lean."""
    sp = Sprite(48, 64, "tree_twisted")
    sp.ground_shadow(27, 61, 18, 3.5)
    trunk = [(19.5, 63), (18, 56), (19.5, 49), (24, 42), (29, 35), (31, 27), (31, 21)]
    tube(sp, [(17, 60), (11, 62.5)], [2.2, 1.1], BARK, part=1, flat=62, seed=5)       # roots
    tube(sp, [(22, 60), (27, 62.5)], [2.0, 1.0], BARK, part=1, flat=62, seed=6)
    tube(sp, [(21, 47), (15, 42), (10, 37), (7, 33)], [2.2, 1.7, 1.3, 0.9], BARK, part=1, grain=3, twist=0.4, seed=7)
    tube(sp, trunk, [4.6, 3.9, 3.4, 3.2, 2.9, 2.4, 2.0], BARK, part=1, flat=62, grain=3, twist=0.5, rough=0.25)
    tube(sp, [(28, 36), (35, 31), (39, 26)], [1.8, 1.4, 1.0], BARK, part=1, grain=0, seed=8)
    # burls and a hollow where the trunk twists
    rows(sp, [".dd", "d0b", ".bb"], 18, 52, {"d": BARK[1], "0": BARK[0], "b": BARK[5]}, 1)
    rows(sp, ["ll", "lm"], 24, 41, {"l": BARK[6], "m": BARK[5]}, 1)
    clumps = [(31, 11, 10, 6), (21, 14, 7, 5), (40, 15, 6.5, 5), (27, 19, 9, 5.5), (37, 22, 7.5, 5),
              (8, 30, 6, 4), (14, 29, 4.5, 3.5)]
    foliage(sp, clumps, OLIVE, low_line=24, sprigs=2, rough=0.45)
    crown_shade(sp)
    return finish(sp)


def dead_limbs(sp, limbs, pal=DEAD, seed=0):
    """Bare limbs (tube, then 1 px twigs forking off near the end)."""
    rng = rng_for("limbs", sp.w, sp.h, seed)
    for k, (pts, radii) in enumerate(limbs):
        tube(sp, pts, radii, pal, part=1, seed=seed + k, grain=3 if radii[0] > 2 else 0)
    for k, (pts, radii) in enumerate(limbs):
        (ax, ay), (bx, by) = pts[-2], pts[-1]
        ang = math.atan2(by - ay, bx - ax)
        # the tip runs on as a twig, bending a little; one side twig springs off a little way back
        a = ang + rng.uniform(-0.25, 0.25)
        L = 2.5 + rng.random() * 2.0
        tx, ty = bx + math.cos(a) * L, by + math.sin(a) * L
        twig(sp, [(bx, by), (tx, ty)], pal[5] if math.cos(a) < 0.3 else pal[4])
        s = 1 if k % 2 else -1
        a2 = ang + s * (0.75 + rng.random() * 0.35)
        L2 = 2.0 + rng.random() * 2.0
        sx, sy = ax + (bx - ax) * 0.7, ay + (by - ay) * 0.7
        twig(sp, [(sx, sy), (sx + math.cos(a2) * L2, sy + math.sin(a2) * L2)], pal[5] if math.cos(a2) < 0.3 else pal[4])


def tree_dead_tall():
    """A big dead tree: a thick grey-brown trunk with a hollow in it, bare branches reaching far out and up."""
    sp = Sprite(48, 80, "tree_dead_tall")
    sp.ground_shadow(27, 77, 17, 3)
    for pts, r in (([(21, 74), (16, 77.5), (13, 78.5)], [2.4, 1.5, 1.0]), ([(26, 74), (31, 77.5), (35, 78.5)], [2.4, 1.5, 1.0])):
        tube(sp, pts, r, DEAD, part=1, flat=78)
    limbs = [
        ([(22, 47), (15, 40), (9, 34), (3.5, 31)], [2.7, 2.0, 1.4, 0.9]),
        ([(25, 42), (32, 35), (38, 28), (44, 24)], [2.7, 2.0, 1.4, 0.9]),
        ([(23, 34), (18, 25), (14, 16), (12, 10)], [2.1, 1.6, 1.1, 0.8]),
        ([(24.5, 31), (29, 22), (31, 13), (31, 7)], [2.1, 1.5, 1.0, 0.7]),
        ([(23.5, 28), (23, 17), (22.5, 5)], [2.0, 1.3, 0.8]),
        ([(12, 37), (10, 29), (9, 24)], [1.1, 0.9, 0.7]),
        ([(36, 30), (40, 21), (41, 16)], [1.1, 0.9, 0.7]),
        ([(16, 23), (9, 19), (5, 18)], [1.0, 0.8, 0.6]),
        ([(30, 19), (36, 14), (40, 12)], [1.0, 0.8, 0.6]),
    ]
    dead_limbs(sp, limbs)
    tube(sp, [(23.5, 79), (23, 64), (23.8, 48), (23.5, 36), (23.5, 28)], [5.0, 4.3, 3.7, 3.0, 2.3], DEAD, part=1,
         flat=78, grain=3, rough=0.22)
    # the broken stub of a lost limb
    tube(sp, [(26, 57), (30, 54.5)], [1.5, 1.3], DEAD, part=1)
    sp.set(30, 54, DEAD[7], 1)
    sp.set(31, 55, DEAD[6], 1)
    # the hollow: a dark mouth, its lower lip lit, its far rim curling over in shade
    hollow = ["..aaa..", ".a000c.", "a00000c", "a00001c", "a00011c", ".a0012c", "..ccc.."]
    rows(sp, hollow, 19, 59, {"a": DEAD[6], "0": DEAD[0], "1": DEAD[1], "2": DEAD[2], "c": DEAD[3]}, 1)
    for x, y in ((20, 58), (21, 57), (22, 57), (23, 57), (24, 58)):
        _shift(sp, x, y, DEAD, 1)
    # a bracket fungus on the shaded side
    rows(sp, ["lmmd", ".ddd"], 26, 66, {"l": SHROOM[5], "m": SHROOM[4], "d": SHROOM[2]}, 1)
    return finish(sp)


def tree_dead_broken():
    """A dead trunk snapped off halfway: a jagged, splintered top showing pale wood, one bare branch left."""
    sp = Sprite(32, 48, "tree_dead_broken")
    sp.ground_shadow(18, 45, 10, 2.5)
    top = {11: 19, 12: 13, 13: 15, 14: 18, 15: 21, 16: 17, 17: 20, 18: 23, 19: 19, 20: 22}  # the broken edge

    def broken(x, y):
        return y < top.get(x, 99)
    tube(sp, [(26, 20), (23, 26), (19, 31)], [0.8, 1.1, 1.6], DEAD, part=1, seed=3)   # the bare branch, behind
    twig(sp, [(25, 21), (27, 16), (27, 13)], DEAD[5])
    twig(sp, [(23.5, 25), (27, 25), (29, 23)], DEAD[4])
    tube(sp, [(15.5, 47), (15.5, 30), (15.5, 10)], [4.6, 4.1, 3.9], DEAD, part=1, flat=46, grain=3, cut=broken,
         rough=0.2)
    for pts, r in (([(13, 43), (9, 46.5)], [2.0, 1.0]), ([(18, 43), (22, 46.5)], [2.0, 1.0])):
        tube(sp, pts, r, DEAD, part=1, flat=46)
    for x, y0 in top.items():  # the splintered top: pale heartwood, its left faces lit
        if not sp.has(x, y0):
            continue
        sp.set(x, y0, HEART[6] if x < 15 else HEART[5] if x < 18 else HEART[4], 1)
        if sp.has(x, y0 + 1) and top.get(x - 1, 99) > y0 + 1:
            sp.set(x, y0 + 1, HEART[4] if x < 16 else HEART[3], 1)
        if top.get(x + 1, 99) > y0 + 1 and sp.has(x, y0 + 2):
            sp.set(x, y0 + 2, HEART[3] if x < 16 else HEART[2], 1)
    for x, y in ((13, 22), (16, 23), (14, 24), (18, 25)):  # the rotten core
        _shift(sp, x, y, DEAD, -2)
    # a bracket fungus and moss at the foot
    rows(sp, ["lmd", "dd."], 9, 33, {"l": SHROOM[5], "m": SHROOM[4], "d": SHROOM[2]}, 1)
    rows(sp, [".lm", "lmd"], 9, 36, {"l": SHROOM[4], "m": SHROOM[3], "d": SHROOM[1]}, 1)
    for x, y in ((11, 44), (12, 45), (12, 43), (13, 42), (13, 45), (14, 44), (19, 45), (20, 44), (17, 45)):
        if sp.has(x, y):
            sp.set(x, y, MOSSY[4] if (x + y) % 2 else MOSSY[3], 1)
    return finish(sp)


# ---------- conifers ----------

def conifer(name, w, h, tiers, cx, trunk, shadow, pal=PINE):
    """props.pine, with the tiers given: (top, bottom, half width) for each, top first."""
    sp = Sprite(w, h, name)
    sp.ground_shadow(*shadow)
    x0, x1, y0 = trunk
    cylinder(sp, x0, x1, y0, h - 2, BARK, part=1, rough=0.2)
    rng = sp.rng
    for i, (top, bot, hw) in enumerate(tiers):
        hang = {x: int(rng.integers(-1, 2)) for x in range(w)}
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
                v = -dx * 0.55 + (0.35 - t * 0.55) + (rng.random() - 0.5) * 0.3
                if y == edge_y:
                    v -= 0.35
                sp.set(x, y, band(v, pal, -0.75, 0.75), 2 + i)
        for k in range(int(hw * 1.4)):
            y = top + 2 + int(rng.integers(0, max(1, bot - top - 2)))
            t = (y - top) / max(1, bot - top)
            half = 1 + (hw - 1) * t
            x = int(cx + (rng.random() * 2 - 1) * half * 0.85)
            if not (sp.has(x, y) and sp.has(x - 1, y + 1)):
                continue
            if x < cx:
                sp.set(x, y, pal[7], 2 + i)
                sp.set(x - 1, y + 1, pal[6], 2 + i)
            else:
                sp.set(x, y, pal[3], 2 + i)
                sp.set(x + 1, y + 1, pal[2], 2 + i)
    for y in range(1, h):
        for x in range(w):
            p, q = sp.part[y, x], sp.part[y - 1, x]
            if p >= 2 and q >= 2 and q < p:
                sp.obj[y, x] = pal[0]
                if y + 1 < h and sp.part[y + 1, x] == p:
                    sp.obj[y + 1, x] = pal[1]
    sp.set(int(cx), tiers[0][0] - 1, pal[6], 2)
    return sp


def pine_tall():
    """A taller, narrower pine: seven tiers on a longer trunk."""
    tiers = [(2, 10, 3.5), (6, 17, 5), (11, 24, 6.5), (17, 32, 8), (24, 41, 9.5), (31, 50, 10.5), (39, 61, 12)]
    sp = conifer("pine_tall", 32, 80, tiers, 15.5, (14, 17, 60), (18, 77, 11, 3))
    for y in range(64, 78, 3):  # bark furrows
        sp.set(15, y, BARK[1], 1)
        sp.set(16, y + 1, BARK[2], 1)
    crown_shade(sp, pal=BARK)
    return finish(sp)


def pine_dead():
    """A dead pine: a grey trunk tapering to a bare spike, whorls of drooping dead branches (longest low down),
    a few rusty clumps of needles still hanging on."""
    sp = Sprite(32, 64, "pine_dead")
    sp.ground_shadow(18, 61, 10, 2.5)
    rng = sp.rng
    cx = 15.5
    branches = []
    for j, y in enumerate(range(10, 52, 5)):
        t = (y - 6) / 46
        for s in (-1, 1):
            yy = y + (2 if s > 0 else 0) + int(rng.integers(-1, 2))
            L = 3.0 + t * 10.0 + rng.uniform(-1.5, 1.5)
            if rng.random() < 0.25 and 0.2 < t < 0.9:
                L = min(L, 2.5 + rng.random() * 1.5)    # snapped off short
            droop = 0.32 + t * 0.12 + rng.uniform(-0.1, 0.18)
            branches.append((yy, s, L, droop, t))
    needles = {1, 4, 6, 9, 11, 14, 16}
    for k, (yy, s, L, droop, t) in enumerate(branches):  # each a straight bough angled down, its tip turned up
        ex, ey = cx + s * L, yy + L * droop
        lit_c, dark_c = (DEAD[6], DEAD[4]) if s < 0 else (DEAD[4], DEAD[2])
        line(sp, [(cx, yy), (ex, ey)], lit_c, part=1)
        if t > 0.5 and L > 6:
            line(sp, [(cx, yy + 1), (ex - s * 1, ey + 1 - droop)], dark_c, part=1)
        if L > 4:
            sp.set(int(round(ex + s)), int(round(ey - 1)), lit_c, 1)
        if L > 7 and k % 2:  # a side twig forking off, angled up
            fx, fy = cx + s * L * 0.55, yy + L * 0.55 * droop
            line(sp, [(fx, fy), (fx + s * 2.5, fy - 2)], lit_c, part=1)
        if k in needles and L > 5:  # a few last needles, dry and brown, in a ragged spray along the bough
            for i in range(int(L * 0.4), int(L) + 1):
                x = int(round(cx + s * i))
                y = int(round(yy + i * droop))
                for dy, p in ((-1, 0.45), (0, 1.0), (1, 0.85), (2, 0.35)):
                    if rng.random() < p:
                        tone = (4 if dy <= 0 else 3) - (1 if s > 0 else 0) - (1 if rng.random() < 0.3 else 0)
                        sp.set(x, y + dy, NEEDLE_DEAD[max(1, tone)], 3)
    tube(sp, [(15.5, 63), (15.5, 40), (15.5, 14), (15.5, 3)], [2.9, 2.3, 1.3, 0.6], DEAD, part=1, flat=62, grain=3)
    for pts, r in (([(13.5, 60), (11, 62.5)], [1.4, 0.8]), ([(17.5, 60), (20, 62.5)], [1.4, 0.8])):
        tube(sp, pts, r, DEAD, part=1, flat=62)
    sp.set(15, 2, DEAD[6], 1)
    # a woodpecker hole, and lichen on the trunk
    rows(sp, [".d.", "d0b", ".b."], 14, 43, {"d": DEAD[1], "0": DEAD[0], "b": DEAD[5]}, 1)
    for x, y in ((14, 52), (14, 53), (15, 53), (13, 55), (17, 30), (16, 31)):
        sp.set(x, y, hx("#8a9a78") if (x + y) % 2 else hx("#6e8062"), 1)
    return finish(sp)


# ---------- fallen trees ----------

def log_fallen():
    """A tree knocked over, its trunk lying east-west: at the west end its root plate torn out of the ground,
    standing up (earth, stones, roots and a tuft of turf); at the east end its snapped crown, broken branches."""
    sp = Sprite(48, 32, "log_fallen")
    sp.ground_shadow(26, 29.3, 21, 2.6)
    rng = sp.rng
    # broken branches at the far (east) end, behind the trunk
    tube(sp, [(34, 22), (37, 15), (39, 10), (40, 7)], [1.8, 1.4, 1.0, 0.8], BARK, part=1, seed=21)
    twig(sp, [(39.5, 9), (42, 5)], BARK[5])
    twig(sp, [(37.5, 14), (35, 10)], BARK[5])
    tube(sp, [(39, 21), (43, 17), (45, 15)], [1.6, 1.2, 0.9], BARK, part=1, seed=22)
    twig(sp, [(44, 16), (46, 12)], BARK[5])
    # the trunk, lying down: lit along its top
    tube(sp, [(11, 22.5), (28, 23.0), (42, 23.5)], [5.4, 4.9, 4.3], BARK, part=2, grain=3, rough=0.15, flat=28,
         cut=lambda x, y: x > 43 or (x == 43 and y in (19, 21, 22, 25, 26)) or (x == 42 and y in (19, 26)))
    for y in range(19, 28):  # its snapped end: pale splinters
        for x in (42, 43):
            if sp.has(x, y) and (not sp.has(x + 1, y)):
                sp.set(x, y, HEART[5] if y < 23 else HEART[3], 2)
    sp.set(44, 23, HEART[4], 2)
    sp.set(44, 24, HEART[2], 2)
    # a broken branch lying in front
    tube(sp, [(30, 26.5), (36, 28), (41, 28.5)], [1.4, 1.1, 0.8], BARK, part=3, flat=28, seed=23)
    twig(sp, [(36, 27.5), (38, 25)], BARK[5], part=3)
    # the root plate: a disc of earth torn up on its edge, roots spreading from the trunk's foot across it and
    # snapped off around its rim, a cap of turf still growing on top
    pcx, pcy, prx, pry = 8.2, 15.8, 6.6, 12.2
    ends = []
    for k in range(11):
        a = -math.pi * 0.92 + k * (math.pi * 1.84 / 10) + rng.uniform(-0.1, 0.1)
        if math.sin(a) > 0.8:
            continue
        ends.append((max(1.0, pcx + math.cos(a) * (prx + 1.0 + rng.uniform(0, 1.0))),
                     pcy + math.sin(a) * (pry + 1.5 + rng.uniform(0, 2.0))))
    for ex, ey in ends:  # root tips sticking out past the earth (behind it)
        twig(sp, [(pcx + (ex - pcx) * 0.6, pcy + (ey - pcy) * 0.6), (ex, ey)], BARK[4] if ex < pcx + 2 else BARK[3], part=4)
    blob(sp, pcx, pcy, prx, pry, SOIL, rough=0.45, edge=0.3, part=5, seed=31, flat_bottom=28)
    for ex, ey in ends:  # the big roots across the face, thick at the middle
        mx, my = pcx + (ex - pcx) * 0.45 + 0.8, pcy + (ey - pcy) * 0.5
        tube(sp, [(pcx + 1.2, pcy + 0.5), (mx, my), (pcx + (ex - pcx) * 0.82, pcy + (ey - pcy) * 0.82)],
             [1.5, 1.0, 0.75], BARK, part=6, seed=int(ex * 13 + ey), rough=0.2)
    blob(sp, pcx + 1.2, pcy + 0.6, 2.7, 3.2, BARK, part=6, seed=32)   # the foot of the trunk, where they meet
    sp.set(int(pcx), int(pcy) - 1, BARK[6], 6)
    for x, y in ((4, 7), (12, 22), (5, 21)):                          # stones caught in the earth
        rows(sp, ["lm", "md"], x, y, {"l": ROCK[7], "m": ROCK[5], "d": ROCK[3]}, 5)
    for x in range(2, 16):  # the turf cap on its top edge, a few grass blades sticking up
        ys = [y for y in range(32) if sp.has(x, y) and sp.part[y, x] == 5]
        if not ys or ys[0] > 9:
            continue
        y = ys[0]
        sp.set(x, y, TURF[4] if x < 9 else TURF[3], 5)
        sp.set(x, y + 1, TURF[3] if x < 9 else TURF[2], 5)
        if x % 2 == 0 and sp.has(x, y + 2):
            sp.set(x, y + 2, TURF[1], 5)
        if x in (4, 7, 11):
            sp.set(x, y - 1, TURF[4] if x < 9 else TURF[3], 5)
            sp.set(x + (1 if x > 8 else -1), y - 2, TURF[4] if x < 9 else TURF[2], 5)
    return finish(sp)


def log_mossy():
    """An old fallen log, half sunk in the ground: moss over its top, its end rotted soft, mushrooms on it."""
    sp = Sprite(48, 16, "log_mossy")
    sp.ground_shadow(26, 13.5, 21, 2.2)
    tube(sp, [(6, 8.3), (43, 8.6)], [4.6, 4.3], BARK, part=1, grain=3, rough=0.15, flat=13, seed=41,
         cut=lambda x, y: x > 44 or (x == 44 and y in (4, 5, 11)) or (x == 43 and y == 4))
    for y in range(3, 14):  # the near end: soft, rotten wood with rings, the hollow core dark
        for x in range(2, 8):
            dx, dy = (x + 0.5 - 4.8) / 2.4, (y + 0.5 - 8.6) / 4.7
            r = math.hypot(dx, dy)
            if r > 1 or y > 13:
                continue
            c = ROT[5] if r > 0.82 and dx < 0 else ROT[4] if r > 0.82 else ROT[3] if (r * 3) % 1 < 0.35 else ROT[4]
            if r < 0.45:
                c = ROT[0] if r < 0.32 else ROT[1]
            sp.set(x, y, c, 2)
    rng = sp.rng
    # moss over the top in cushions: thick in places and hanging down the side, thin or gone between them
    lump = np.convolve(rng.random(60), np.ones(5) / 5, mode="same")
    lump = (lump - lump.min()) / (lump.max() - lump.min())
    for x in range(3, 45):
        ys = [y for y in range(16) if sp.has(x, y)]
        if not ys:
            continue
        y0 = ys[0]
        depth = int(round(lump[x] * 6.5)) + int(rng.integers(0, 2))
        if x > 41:
            depth = min(depth, 2)
        if depth >= 5 and x % 3 == 0 and not sp.has(x, y0 - 1):   # a tuft standing proud of the cushion
            sp.set(x, y0 - 1, MOSSY[6] if x < 30 else MOSSY[5], 3)
        for k in range(depth):
            yy = y0 + k
            if not sp.has(x, yy):
                break
            c = MOSSY[6] if k == 0 and x < 26 else MOSSY[5] if k == 0 else MOSSY[4] if k < 2 else MOSSY[3]
            if k == depth - 1 and depth > 2:
                c = MOSSY[1]
            elif k >= 2 and (x * 7 + k * 3) % 5 == 0:
                c = MOSSY[2]
            sp.set(x, yy, c, 3)
    # mushrooms: a pair on top, one on the side, a tiny one by the end
    rows(sp, [".hm.", "hmmd", ".sd."], 13, 1, {"h": SHROOM[5], "m": SHROOM[4], "d": SHROOM[2], "s": STEM[4]}, 4)
    rows(sp, ["hm.", "mmd", ".s."], 17, 2, {"h": SHROOM[5], "m": SHROOM[3], "d": SHROOM[1], "s": STEM[3]}, 4)
    rows(sp, [".hm.", "hmmd", ".s.."], 31, 1, {"h": SHROOM[5], "m": SHROOM[4], "d": SHROOM[2], "s": STEM[4]}, 4)
    rows(sp, ["hd", "s."], 36, 9, {"h": SHROOM[4], "d": SHROOM[2], "s": STEM[3]}, 4)
    sp.set(14, 2, SPOT, 4)
    sp.set(32, 2, SPOT, 4)
    return finish(sp)


# ---------- stumps ----------

def stump():
    """A cut stump: growth rings on its pale top, bark round it, roots gripping the ground."""
    sp = Sprite(16, 16, "stump")
    sp.ground_shadow(9.5, 14.3, 7.2, 1.8)
    tube(sp, [(5, 12), (1.8, 14)], [1.4, 0.8], BARK, part=0, flat=14)
    tube(sp, [(11, 12), (14.2, 14)], [1.4, 0.8], BARK, part=0, flat=14)
    stump_body(sp, 8.0, 6, 13.5, 5.2, 2.4)
    disk(sp, 8.0, 6.0, 5.2, 2.6, 1, rings=2)
    for x, y in ((9, 6), (10, 7)):  # a check (crack) from the pith
        sp.set(x, y, HEART[1], 1)
    tube(sp, [(7.5, 13), (6.5, 14.5)], [1.3, 0.8], BARK, part=2, flat=14)
    return finish(sp)


def stump_big():
    """A wide old stump: roots spreading out over the ground, rings on its top, moss on its back edge and a
    cluster of little mushrooms at its foot."""
    sp = Sprite(32, 24, "stump_big")
    sp.ground_shadow(18, 21.4, 14.5, 2.3)
    for pts, r in (([(9, 16), (4.5, 19.5), (1.8, 21)], [2.4, 1.5, 0.8]), ([(23, 16), (27.5, 19.5), (30.2, 21)], [2.4, 1.5, 0.8]),
                   ([(11, 9), (7, 13), (5, 17)], [2.0, 1.6, 1.0])):
        tube(sp, pts, r, BARK, part=0, flat=21, grain=0)
    stump_body(sp, 16.0, 8, 19.5, 9.4, 3.8, furrow=3)
    disk(sp, 16.0, 8.0, 9.4, 3.9, 1, rings=4)
    for x, y in ((17, 8), (18, 9), (20, 9), (21, 10), (22, 10)):  # a crack across the top
        sp.set(x, y, HEART[1], 1)
    for x, y in ((8, 6), (9, 5), (10, 5), (11, 4), (12, 4), (9, 6), (10, 6), (13, 4), (21, 4), (22, 4), (23, 5)):
        sp.set(x, y, MOSSY[4] if y < 5 or x < 9 else MOSSY[3], 1)
    for pts, r in (([(13, 18), (11, 21.5)], [2.0, 1.2]), ([(19.5, 18.5), (21.5, 21.5)], [2.0, 1.2])):
        tube(sp, pts, r, BARK, part=2, flat=21)
    rows(sp, ["..hm.", ".hmmd", "hmd..", "ms.s.", ".s..."], 23, 13,
         {"h": SHROOM[5], "m": SHROOM[4], "d": SHROOM[2], "s": STEM[4]}, 3)
    sp.set(25, 14, SPOT, 3)
    return finish(sp)


def stump_axe():
    """A chopping stump for the village: an axe bitten into its top, chips of wood scattered round it."""
    sp = Sprite(16, 16, "stump_axe")
    sp.ground_shadow(9.5, 14.3, 7, 1.8)
    stump_body(sp, 7.5, 9, 14, 5.6, 2.4)
    disk(sp, 7.5, 9.0, 5.6, 2.5, 1, rings=2)
    # the axe: its head bitten into the top (the blade's edge out of sight in the wood), the haft rising up and
    # back to the right; a bright bevel along the head, a darker poll
    head = ["hhhhhp",
            "lmmmmd",
            "mmmmdd",
            "cccccc"]
    rows(sp, head, 2, 5, {"h": IRON[8], "l": IRON[7], "m": IRON[5], "d": IRON[3], "p": IRON[6], "c": HEART[1]}, 2)
    line(sp, [(8, 5), (10, 3), (12, 1)], PLANK[7], part=2)
    line(sp, [(8, 6), (11, 3), (13, 1)], PLANK[4], part=2)
    sp.set(13, 1, PLANK[6], 2)
    sp.set(8, 7, PLANK[3], 2)
    sp.outline(OUTLINE)
    for x, y, c in ((0, 14, 5), (1, 15, 3), (15, 13, 6), (14, 15, 4), (15, 15, 2), (0, 11, 4)):  # wood chips
        if not sp.obj[y, x, 3]:
            sp.obj[y, x] = HEART[c]
    return done(sp)


def stump_mossy():
    """A broken old stump gone soft and mossy, a little sprout growing from it."""
    sp = Sprite(16, 16, "stump_mossy")
    sp.ground_shadow(9.5, 14.3, 7, 1.8)
    top = {3: 6, 4: 4, 5: 3, 6: 5, 7: 6, 8: 7, 9: 6, 10: 8, 11: 9, 12: 8}
    tube(sp, [(4.5, 12.5), (1.8, 14)], [1.3, 0.8], BARK, part=0, flat=14)
    tube(sp, [(8, 14), (8, 3)], [4.8, 4.6], BARK, part=0, flat=14, grain=3, cut=lambda x, y: y < top.get(x, 99),
         seed=51)
    for x, y0 in top.items():  # the broken top: soft rotten wood
        if sp.has(x, y0):
            sp.set(x, y0, ROT[5] if x < 7 else ROT[4], 0)
            if sp.has(x, y0 + 1) and x > 5:
                sp.set(x, y0 + 1, ROT[2], 0)
    for x in range(3, 13):  # moss draped over the top and down the left
        ys = [y for y in range(16) if sp.has(x, y)]
        if not ys:
            continue
        y0 = ys[0] + (1 if x > 6 else 0)
        depth = {3: 6, 4: 7, 5: 5, 6: 4, 7: 2, 8: 2, 9: 3, 10: 1, 11: 2, 12: 1}[x]
        for k in range(depth):
            if sp.has(x, y0 + k):
                c = MOSSY[5] if k == 0 and x < 7 else MOSSY[4] if k < 2 else MOSSY[3] if k < depth - 1 else MOSSY[1]
                sp.set(x, y0 + k, c, 0)
    tube(sp, [(11, 13), (13.8, 14.5)], [1.2, 0.8], BARK, part=1, flat=14)
    # the sprout: a thin stem, two bright leaves
    rows(sp, ["ll.mm", ".lsm.", "..s..", "..s..", "..s.."], 7, 1, {"l": LEAF[8], "m": LEAF[6], "s": LEAF[5]}, 2)
    return finish(sp)


PROPS = {
    "tree_tall": tree_tall, "tree_poplar": tree_poplar, "tree_round": tree_round, "tree_twisted": tree_twisted,
    "tree_dead_tall": tree_dead_tall, "tree_dead_broken": tree_dead_broken,
    "pine_tall": pine_tall, "pine_dead": pine_dead,
    "log_fallen": log_fallen, "log_mossy": log_mossy,
    "stump": stump, "stump_big": stump_big, "stump_axe": stump_axe, "stump_mossy": stump_mossy,
}

# (footprint tiles, kind) for the README table and the Map
INFO = {
    "tree_tall": (2, "tree"), "tree_poplar": (1, "tree"), "tree_round": (2, "tree"), "tree_twisted": (2, "tree"),
    "tree_dead_tall": (2, "tree"), "tree_dead_broken": (1, "tree"), "pine_tall": (2, "pine"), "pine_dead": (2, "pine"),
    "log_fallen": (3, "log"), "log_mossy": (3, "log"),
    "stump": (1, "stump"), "stump_big": (2, "stump"), "stump_axe": (1, "stump"), "stump_mossy": (1, "stump"),
}


# ---------- preview ----------

def preview():
    """A woodland clearing on grass with every new tree next to the old ones (tree, tree_birch, pine, tree_dead)
    and two creatures for scale, sorted by bottom edge as the game does: at 1x and 2x, then each prop at 4x."""
    from PIL import Image, ImageDraw
    import preview as pv
    from props import PROPS as OLD
    for name, fn in PROPS.items():
        pv._props[name] = Image.fromarray(fn(), "RGBA")
    for name in ("tree", "tree_birch", "pine", "tree_dead", "bush", "boulder_mossy"):
        pv._props[name] = Image.fromarray(OLD[name](), "RGBA")
    W, H = 34, 17
    g = [[None] * W for _ in range(H)]
    rng = np.random.default_rng(4)
    for y in range(H):  # patches of forest floor and tall grass, a dirt path
        for x in range(W):
            n = pv.slow_noise(x, y, 4.0, 3)
            if n > 0.68:
                g[y][x] = "forest_floor"
            elif n < 0.22:
                g[y][x] = "tall_grass"
    for x in range(W):
        y = 11 + int(round(math.sin(x / 4.0) * 1.2))
        g[y][x] = "dirt"
        if x % 5 != 2:
            g[y + 1][x] = "dirt"
    props = [  # (name, tile x, tile y = the footprint's row, width in tiles, mirrored)
        ("tree_tall", 1, 5, 2, False), ("tree", 4, 4, 2, False), ("tree_poplar", 7, 5, 1, False),
        ("tree_round", 9, 4, 2, False), ("pine_tall", 12, 5, 2, False), ("pine", 14, 4, 2, False),
        ("tree_twisted", 17, 5, 2, False), ("tree_birch", 20, 4, 1, False), ("tree_dead_tall", 22, 5, 2, False),
        ("tree_dead", 25, 4, 1, False), ("pine_dead", 27, 5, 2, False), ("tree_dead_broken", 30, 5, 1, False),
        ("tree_poplar", 32, 4, 1, True),
        ("log_fallen", 1, 8, 3, False), ("stump", 5, 8, 1, False), ("stump_big", 7, 9, 2, False),
        ("log_mossy", 10, 8, 3, False), ("stump_axe", 14, 9, 1, False), ("stump_mossy", 16, 8, 1, False),
        ("bush", 18, 8, 1, False), ("log_fallen", 20, 9, 3, True), ("stump_mossy", 24, 9, 1, True),
        ("tree_round", 26, 9, 2, True), ("stump", 29, 8, 1, True), ("boulder_mossy", 31, 9, 1, False),
        ("tree_twisted", 2, 15, 2, True), ("tree_tall", 6, 16, 2, True), ("log_mossy", 9, 14, 3, True),
        ("pine_dead", 13, 16, 2, True), ("tree_dead_broken", 16, 15, 1, True), ("pine_tall", 18, 16, 2, True),
        ("tree_dead_tall", 22, 16, 2, True), ("stump_big", 25, 14, 2, True), ("tree", 28, 16, 2, True),
        ("stump_axe", 31, 15, 1, False),
    ]
    beasts = [("dragon_whelp", 13 * 16, 12 * 16 + 4, False), ("moon_wolf", 25 * 16, 12 * 16 + 6, True)]
    try:
        scene = pv.render(g, "grass", props, beasts=beasts)
    except Exception:  # (if a creature's art is missing, show the trees alone)
        scene = pv.render(g, "grass", props)
    one = scene
    two = pv.zoom(scene, 2)
    # each new prop at 3x on plain grass, standing on its footprint, with its name, size, footprint and kind
    k = 3
    cells = []
    for n in PROPS:
        im = pv._props[n]
        wt = INFO[n][0]
        gw, gh = max(wt + 2, im.width // 16 + 2, 4), (im.height + 15) // 16 + 2
        gg = [[None] * gw for _ in range(gh)]
        cells.append((n, pv.zoom(pv.render(gg, "grass", [(n, (gw - wt) // 2, gh - 2, wt, False)]), k)))
    pad, lab = 12, 40
    font = pv.font(15)
    rows_ = [cells[:4], cells[4:8], cells[8:]]
    line_w = max(sum(c.width + pad for _, c in r) + pad for r in rows_)
    line_h = [max(c.height for _, c in r) + lab for r in rows_]
    Wt = max(two.width + 2 * pad, line_w)
    Ht = pad + 22 + one.height + pad + 22 + two.height + pad + sum(h + pad for h in line_h) + pad
    out = Image.new("RGBA", (Wt, Ht), (28, 24, 38, 255))
    d = ImageDraw.Draw(out)
    y = pad
    d.text((pad, y), "trees_art: a woodland at 1x, the new trees among tree, tree_birch, pine and tree_dead",
           fill=(240, 220, 160, 255), font=font)
    y += 22
    out.paste(one, (pad, y))
    y += one.height + pad
    d.text((pad, y), "the same at 2x", fill=(240, 220, 160, 255), font=font)
    y += 22
    out.paste(two, (pad, y))
    y += two.height + pad
    for r, hh in zip(rows_, line_h):
        x = pad
        for n, c in r:
            fp, kind = INFO[n]
            im = pv._props[n]
            d.text((x, y), n, fill=(240, 220, 160, 255), font=font)
            d.text((x, y + 18), f"{im.width}x{im.height}  footprint {fp}  {kind}", fill=(190, 180, 200, 255), font=font)
            out.paste(c, (x, y + lab + (hh - lab - c.height)))
            x += c.width + pad
        y += hh + pad
    path = pv.PREV / "trees_art_preview.png"
    out.save(path)
    print("wrote", path, out.size)
    return out


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        preview()
