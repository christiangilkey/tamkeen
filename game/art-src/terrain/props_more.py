"""More props, for variety on the big arenas (owner: "different tree types, boulder types ... to break up the
monotony"). Same rules and look as props.py: standing on the bottom edge, light from the top left, dark outline,
see-through ground shadow. Names are <kind>_<name>; the kind says which family the Map treats it as.
"""

from __future__ import annotations

import math

import numpy as np

from pix import hx, ramp, stamp
from props import (BARK, CACTUS, CAVESTONE, COLUMN, CRYST, LEAF, LIGHT, MOSS, OBSID, PALMBARK, PALMLEAF, PINE,
                   ROCK, SHROOM_GLOW, STEM, Sprite, band, blob, cylinder, facets, finish, line, rng_for)

AUTUMN = ramp("#24100e #3e1a12 #602814 #86381a #ac5020 #cc6e2a #e6923a #f4b85a #fcd884")
BIRCH_LEAF = ramp("#10281c #1a4024 #28582a #3a7430 #549038 #74ac44 #98c656 #c0dc72 #e2ee96")
BIRCH_BARK = ramp("#2a2628 #4c4648 #7e787a #b0aaa8 #d8d2cc #f2eee6")
WILLOW = ramp("#0e2420 #163828 #20502c #2e6832 #42823a #5e9c44 #80b652 #a8ce66 #cce482")
DEADWOOD = ramp("#1a1414 #2c2222 #403230 #56443e #6c584e #86705e")
CHAR = ramp("#0a0708 #141011 #1e1819 #2a2224 #382e2e")
GLOW = ramp("#5a1410 #8e2410 #c8420e #f07a18 #ffb83a #ffe88a")
SNOWP = ramp("#5a6ea0 #7e94c0 #a8bedc #cad8ec #e6eef8 #ffffff")
SAND_ROCK = ramp("#3a1a16 #58281c #7a3a24 #9c522e #ba6c3a #d48a4a #e8aa62 #f6ca84")
ICEP = ramp("#1a2e5a #26457e #36609e #5084bc #72a6d4 #98c4e4 #c2e0f2 #e8f6fc #ffffff")
PINK = ramp("#2a0c3a #4a1460 #6e2088 #9a34b0 #c050d0 #dc7ae4 #f0a8f4 #fcd4fc #ffffff")
CAP_TEAL = ramp("#0c1e2e #12324a #184c66 #1e6a80 #288c98 #3cacac #62ccc0 #9ae8d8 #d4fff0")
DATES = [hx("#5a2010"), hx("#8e3a14"), hx("#c0601c"), hx("#e08a2c")]


def done(sp: Sprite):
    """For props made by changing another prop: record the layers (for the .aseprite source) and flatten."""
    import props
    props.LAST["layers"] = (sp.shadow.copy(), sp.obj.copy())
    return sp.image()


# ---------- leafy trees ----------

def crown_tree(name, w, h, clumps, leaf, trunk, branches=(), fruit=None, sprigs=True):
    """A broad-leaved tree: trunk, a few branches, then leaf clumps (a dark mass first, so the gaps between
    clumps read as deep shade, then each clump lit from the top left), sprigs of light, fruit if any."""
    sp = Sprite(w, h, name)
    cx = w / 2
    x0, x1, y0 = trunk
    sp.ground_shadow(cx + 3, h - 3, w * 0.4, 3.5)
    cylinder(sp, lambda y: x0 - (2 if y > h - 4 else 1 if y > h - 7 else 0),
             lambda y: x1 + (2 if y > h - 4 else 1 if y > h - 7 else 0), y0, h - 2, BARK, part=1, rough=0.25)
    for pts, c in branches:
        line(sp, pts, BARK[c], width=2, part=1)
    for y in range(y0 + 3, h - 2, 3):  # bark furrows
        sp.set(int(cx) - 1, y, BARK[1], 1)
    for i, (x, y, rx, ry) in enumerate(clumps):
        blob(sp, x, y, rx + 0.6, ry + 0.6, [leaf[1], leaf[1]], edge=0.3, part=2 + i, seed=i)
    low_line = max(y for x, y, rx, ry in clumps) - 4
    for i, (x, y, rx, ry) in enumerate(clumps):
        blob(sp, x - 0.5, y - 0.5, rx - 0.6, ry - 0.6, leaf[1:], rough=0.4, edge=0.4, part=2 + i, seed=i,
             bias=-0.12 if y > low_line else 0.0, lo=-0.3, hi=1.35)
    rng = sp.rng
    if sprigs:
        for x, y, rx, ry in clumps:
            if y > low_line:
                continue
            for _ in range(2):
                sx = int(x - rx * 0.45 + rng.integers(-2, 3))
                sy = int(y - ry * 0.5 + rng.integers(-2, 2))
                if sp.has(sx, sy) and sp.has(sx + 2, sy + 2):
                    stamp(sp.obj, sx, sy, [".l.", "lml", ".m."], {"l": leaf[8], "m": leaf[7]})
    if fruit:
        for x, y, rx, ry in clumps:
            for _ in range(2):
                fx = int(x + rng.integers(-int(rx * 0.6), int(rx * 0.6) + 1))
                fy = int(y + rng.integers(-int(ry * 0.3), int(ry * 0.7) + 1))
                if sp.has(fx, fy) and sp.has(fx + 1, fy + 1) and sp.part[fy, fx] >= 2:
                    stamp(sp.obj, fx, fy, ["hf", "fd"], {"h": fruit[2], "f": fruit[1], "d": fruit[0]})
    for x in range(w):  # the crown's shade on the trunk just below it
        for y in range(y0, min(h, y0 + 8)):
            if sp.part[y, x] == 1 and any(0 <= y - k and sp.part[y - k, x] >= 2 for k in range(1, 4)):
                sp.obj[y, x] = BARK[1]
    return sp


OAK_CLUMPS = [(24, 10, 10, 8), (14, 14, 9, 8), (34, 13, 9, 8), (8, 24, 7, 7), (40, 23, 7, 7),
              (20, 22, 11, 9), (31, 23, 10, 9), (14, 32, 8, 6), (26, 33, 10, 6), (37, 31, 7, 6)]
OAK_BRANCHES = [([(22, 40), (17, 33), (14, 29)], 3), ([(26, 39), (31, 32), (34, 28)], 2)]


def tree_autumn():
    return finish(crown_tree("tree_autumn", 48, 64, OAK_CLUMPS, AUTUMN, (21, 27, 36), OAK_BRANCHES))


def tree_fruit():
    clumps = [(24, 11, 11, 9), (13, 17, 9, 8), (35, 17, 9, 8), (18, 27, 10, 8), (31, 27, 10, 8), (24, 21, 11, 9)]
    return finish(crown_tree("tree_fruit", 48, 64, clumps, LEAF, (21, 26, 34), OAK_BRANCHES,
                             fruit=[hx("#7a1020"), hx("#d8323a"), hx("#ff9a8a")]))


def tree_birch():
    sp = crown_tree("tree_birch", 32, 64, [(16, 9, 7, 6), (10, 16, 6, 6), (22, 15, 6, 6), (16, 17, 7, 6),
                                          (11, 25, 6, 5), (21, 25, 6, 5), (16, 30, 5, 4)],
                    BIRCH_LEAF, (14, 17, 28), [([(15, 34), (10, 28)], 3), ([(16, 32), (21, 27)], 2)])
    # repaint the trunk as birch: white bark with dark marks
    for y in range(26, 63):
        for x in range(12, 21):
            if sp.part[y, x] != 1 or not sp.has(x, y):
                continue
            left = not (sp.has(x - 1, y) and sp.part[y, x - 1] == 1)
            right = not (sp.has(x + 1, y) and sp.part[y, x + 1] == 1)
            c = BIRCH_BARK[5] if left else BIRCH_BARK[2] if right else BIRCH_BARK[4]
            if (y * 7 + x * 3) % 11 == 0 or (y % 6 == 0 and not right):
                c = BIRCH_BARK[0]
            sp.obj[y, x] = c
    return finish(sp)


def tree_willow():
    sp = Sprite(48, 64, "tree_willow")
    sp.ground_shadow(27, 61, 19, 3.5)
    cylinder(sp, lambda y: 20 - (2 if y > 60 else 0), lambda y: 27 + (2 if y > 60 else 0), 30, 62, BARK, part=1, rough=0.3)
    clumps = [(24, 11, 13, 8), (12, 17, 9, 7), (36, 17, 9, 7), (24, 19, 12, 7)]
    for i, (x, y, rx, ry) in enumerate(clumps):
        blob(sp, x, y, rx + 0.6, ry + 0.6, [WILLOW[1], WILLOW[1]], edge=0.3, part=2 + i, seed=i)
        blob(sp, x - 0.5, y - 0.5, rx - 0.6, ry - 0.6, WILLOW[1:], rough=0.35, edge=0.4, part=2 + i, seed=i,
             lo=-0.3, hi=1.35)
    rng = sp.rng
    # the hanging curtain: strands from the crown's underside, swaying outwards, darker inside
    for x in range(3, 46):
        bottom = max((y for y in range(64) if sp.part[y, x] >= 2), default=None)
        if bottom is None or (x % 2 == 1 and abs(x - 24) < 5):
            continue  # a gap in the middle shows the trunk
        L = int(rng.integers(12, 26)) if abs(x - 24) > 4 else int(rng.integers(4, 9))
        for k in range(L):
            yy = bottom + 1 + k
            xx = x + (k // 9) * (1 if x > 24 else -1)
            if yy >= 60:
                break
            c = WILLOW[6 if (k + x) % 4 == 0 else 4 if x % 2 else 3]
            if k > L - 3:
                c = WILLOW[5]
            sp.set(xx, yy, c, 20)
    return finish(sp)


# ---------- bare trees ----------

def bare_tree(name, w, h, wood, trunk_top, limbs, snow=False, embers=False):
    """A tree with no leaves: a tapering trunk and forked limbs, lit on the left. Snow can sit along the top
    of each limb; embers can glow in the cracks of a burnt one."""
    sp = Sprite(w, h, name)
    cx = w / 2
    sp.ground_shadow(cx + 3, h - 3, w * 0.33, 2.5)
    cylinder(sp, lambda y: int(round(cx - 2 - (y - trunk_top) * 0.05)) - (1 if y > h - 4 else 0),
             lambda y: int(round(cx + 1 + (y - trunk_top) * 0.05)) + (1 if y > h - 4 else 0),
             trunk_top, h - 2, wood, part=1, rough=0.2)
    for pts, wd in limbs:
        line(sp, pts, wood[3], width=wd, part=1)
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]):  # a lit upper edge on each limb
            n = int(max(abs(xb - xa), abs(yb - ya))) + 1
            for i in range(n):
                t = i / max(1, n - 1)
                sp.set(int(round(xa + (xb - xa) * t)), int(round(ya + (yb - ya) * t)), wood[4], 1)
    if snow:
        for y in range(1, h - 3):
            for x in range(w):
                if sp.has(x, y) and not sp.has(x, y - 1) and sp.part[y, x] == 1:
                    sp.set(x, y - 1, SNOWP[5], 3)
                    if not sp.has(x, y - 2) and (x * 3) % 4 == 0:
                        sp.set(x, y - 2, SNOWP[4], 3)
        for x in range(int(cx) - 6, int(cx) + 7):  # snow heaped at the foot
            sp.set(x, h - 2, SNOWP[4] if x % 3 else SNOWP[3], 3)
            if abs(x - cx) < 4:
                sp.set(x, h - 3, SNOWP[5], 3)
    if embers:
        rng = sp.rng
        for _ in range(9):
            y = int(rng.integers(trunk_top + 2, h - 3))
            x = int(cx - 1 + rng.integers(-1, 2))
            if sp.has(x, y):
                sp.set(x, y, GLOW[int(rng.integers(1, 4))], 1)
                if sp.has(x, y + 1):
                    sp.set(x, y + 1, GLOW[0], 1)
        for pts, wd in limbs:
            x, y = pts[-1]
            sp.set(int(x), int(y), GLOW[4], 1)
    return sp


def tree_dead():
    limbs = [([(15, 22), (9, 14), (5, 10)], 2), ([(10, 15), (11, 8)], 1), ([(17, 19), (23, 11), (27, 8)], 2),
             ([(22, 13), (21, 6)], 1), ([(16, 14), (17, 5)], 1)]
    return finish(bare_tree("tree_dead", 32, 48, DEADWOOD, 12, limbs))


def tree_charred():
    limbs = [([(15, 24), (9, 17)], 2), ([(17, 21), (24, 14), (25, 10)], 2), ([(16, 16), (15, 10)], 1)]
    sp = bare_tree("tree_charred", 32, 48, CHAR, 14, limbs, embers=True)
    return finish(sp)


def tree_bare_snowy():
    limbs = [([(23, 30), (14, 20), (7, 15)], 3), ([(14, 20), (13, 11)], 2), ([(25, 27), (34, 18), (41, 14)], 3),
             ([(34, 18), (35, 9)], 2), ([(24, 22), (25, 6)], 2), ([(8, 16), (4, 13)], 1), ([(40, 14), (44, 11)], 1)]
    return finish(bare_tree("tree_bare_snowy", 48, 64, DEADWOOD, 18, limbs, snow=True))


# ---------- conifers and palms ----------

def pine_snowy():
    from props import pine
    pine()
    from props import LAST
    shadow, obj = LAST["layers"]
    sp = Sprite(32, 64, "pine_snowy")
    sp.shadow[:] = shadow
    sp.obj[:] = obj
    # snow along the top of every tier: any foliage pixel with open air (or the outline) above it
    for y in range(1, 64):
        for x in range(32):
            c = tuple(sp.obj[y, x])
            if c[3] == 0 or tuple(PINE[0]) == c or c[:3] in (tuple(BARK[i][:3]) for i in range(len(BARK))):
                continue
            above = tuple(sp.obj[y - 1, x])
            if above[3] == 0 or above[:3] == (0x12, 0x0c, 0x18) or above[:3] == tuple(PINE[0][:3]):
                sp.obj[y, x] = SNOWP[5] if x < 16 else SNOWP[3]
                if y + 1 < 64 and sp.obj[y + 1, x, 3] and (x + y) % 3:
                    sp.obj[y + 1, x] = SNOWP[4] if x < 16 else SNOWP[2]
    return done(sp)


def palm_like(name, w, h, base_x, crown, lean, fronds, back, trunk_w=(6, 5, 4), dates=False, ringed=True):
    sp = Sprite(w, h, name)
    sp.ground_shadow(base_x + 6, h - 3, w * 0.32, 3)
    n = h - crown[1] + 2
    for i in range(n):
        t = i / (n - 1)
        x = base_x + lean * t * t
        y = h - 2 - (h - 2 - crown[1]) * t
        wd = trunk_w[0] if t < 0.25 else trunk_w[1] if t < 0.7 else trunk_w[2]
        for k in range(wd):
            nx = (k + 0.5) / wd * 2 - 1
            v = nx * LIGHT[0] + math.sqrt(1 - nx * nx) * LIGHT[2]
            idx = PALMBARK.index(band(v, PALMBARK, -0.6, 0.8))
            if ringed:
                if i % 3 == 0:
                    idx = 1 if k > 0 else 3
                elif i % 3 == 1:
                    idx = min(6, idx + 1)
            elif (k + i) % 4 == 0 or (k - i) % 4 == 0:  # a date palm's criss-cross of old leaf bases
                idx = max(1, idx - 2)
            sp.set(int(round(x - wd / 2 + k)), int(round(y)), PALMBARK[idx], 1)
    if dates:
        rng = sp.rng
        for dx in (-4, -1, 3):
            for _ in range(7):
                fx = crown[0] + dx + int(rng.integers(-1, 2))
                fy = crown[1] + 3 + int(rng.integers(0, 5))
                sp.set(fx, fy, DATES[int(rng.integers(1, 4))], 1)
                sp.set(fx + 1, fy + 1, DATES[0], 1)
    else:
        for cx_, cy_ in ((crown[0] - 2.5, crown[1] + 3.5), (crown[0] + 1.5, crown[1] + 4), (crown[0] - 0.5, crown[1] + 6)):
            blob(sp, cx_, cy_, 2.1, 2.0, BARK, part=1, seed=int(cx_))

    def frond(dx, dy, droop, j, back=False):
        steps = 40
        rng = rng_for("frond", name, j)
        for i in range(steps + 1):
            t = i / steps
            x = crown[0] + dx * t
            y = crown[1] + dy * t + droop * t * t
            wd = 0.8 + 4.0 * math.sin(math.pi * min(1.0, t * 1.05)) ** 0.8 * (w / 48) ** 0.5
            if i % 2 == 1:
                wd -= 1.4 + rng.random()
            for k in range(int(round(max(0, wd))) + 1):
                c = PALMLEAF[(5 if back else 7) if k == 0 and t < 0.8 else max(1, (4 if back else 6) - k)]
                sp.set(int(round(x)), int(round(y)) + k, c, 2 + j)
    for j, (dx, dy, dr) in enumerate(back):
        frond(dx, dy, dr, j, back=True)
    for j, (dx, dy, dr) in enumerate(fronds):
        frond(dx, dy, dr, 3 + j)
    blob(sp, crown[0], crown[1] + 0.5, 2.0, 1.8, PALMLEAF[:5], part=12, seed=3)
    return finish(sp)


def palm_small():
    return palm_like("palm_small", 32, 48, 14, (19, 17), 6,
                     [(-14, -3, 9), (13, -4, 9), (-10, 3, 8), (10, 3, 7), (-3, -10, 6), (5, -9, 6)],
                     [(-8, -10, 5), (9, -10, 5)], trunk_w=(4, 4, 3))


def palm_date():
    return palm_like("palm_date", 48, 64, 23, (25, 19), 3,
                     [(-21, -9, 11), (20, -10, 11), (-16, 0, 11), (15, 1, 10), (-7, -15, 8), (8, -15, 8), (0, -17, 5)],
                     [(-12, -16, 6), (13, -16, 6), (-20, -2, 9), (20, -3, 9)], trunk_w=(6, 6, 5), dates=True, ringed=False)


def mushroom_giant():
    sp = Sprite(48, 64, "mushroom_giant")
    sp.ground_shadow(27, 61, 17, 3)
    cylinder(sp, lambda y: 19 - (2 if y > 58 else 1 if y > 54 else 0), lambda y: 28 + (2 if y > 58 else 1 if y > 54 else 0),
             28, 62, STEM, part=0, rough=0.15)
    for y in range(34, 60, 6):  # rings on the stem
        for x in range(16, 32):
            if sp.has(x, y) and sp.part[y, x] == 0:
                sp.obj[y, x] = STEM[2]
    for y in range(3, 33):  # the cap: a broad dome, its underside showing gills
        for x in range(48):
            dx, dy = (x + 0.5 - 24) / 23, (y + 0.5 - 27) / 24
            if dx * dx + dy * dy > 1 or y > 30:
                continue
            nz = math.sqrt(max(0, 1 - dx * dx - dy * dy))
            v = dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2]
            sp.set(x, y, band(v, CAP_TEAL), 1)
    for x in range(2, 46):
        if sp.has(x, 30):
            sp.set(x, 31, CAP_TEAL[1], 1)
            if 6 < x < 42:
                sp.set(x, 32, CAP_TEAL[0] if x % 2 else CAP_TEAL[1], 1)
    rng = sp.rng
    for _ in range(9):  # glowing spots
        x, y = int(rng.integers(6, 42)), int(rng.integers(7, 26))
        if sp.has(x, y) and sp.has(x + 1, y + 1) and sp.part[y, x] == 1:
            stamp(sp.obj, x, y, ["gw", "gg"], {"g": SHROOM_GLOW[1], "w": SHROOM_GLOW[2]})
    for bx, by in ((10, 58), (37, 59)):  # little ones at its foot
        for y in range(by - 3, by + 1):
            for x in range(bx - 3, bx + 4):
                if ((x - bx) / 3.2) ** 2 + ((y - by) / 3) ** 2 <= 1 and y < by:
                    sp.set(x, y, CAP_TEAL[6] if x < bx else CAP_TEAL[4], 2)
        sp.set(bx, by, STEM[4], 2)
        sp.set(bx, by + 1, STEM[3], 2)
        sp.set(bx - 1, by - 2, SHROOM_GLOW[2], 2)
    return finish(sp, hx("#0c0820"))


# ---------- rocks ----------

def boulder_mossy():
    sp = Sprite(16, 16, "boulder_mossy")
    sp.ground_shadow(9.5, 14.2, 7.5, 2)
    facets(sp, 8, 9, 7.2, 6.4, ROCK, n=8, flat_bottom=14, seed=7)
    for y in range(16):  # a cap of moss over the top, ragged at its lower edge
        for x in range(16):
            if not sp.has(x, y):
                continue
            edge = 6 + (1 if (x * 7) % 5 < 2 else 0) - (1 if x > 11 else 0)
            if y < edge:
                sp.obj[y, x] = MOSS[4] if (not sp.has(x, y - 1) or not sp.has(x - 1, y)) else MOSS[3] if (x + y) % 3 else MOSS[2]
            elif y == edge and x % 2:
                sp.obj[y, x] = MOSS[1]
    return finish(sp)


def boulder_ice():
    sp = Sprite(16, 16, "boulder_ice")
    sp.ground_shadow(9.5, 14.2, 7, 2)
    facets(sp, 8, 9, 6.8, 6.2, ICEP, n=5, flat_bottom=14, seed=11)
    for x, y in ((5, 6), (6, 7), (7, 9), (10, 5), (11, 6)):  # cracks inside the ice
        if sp.has(x, y):
            sp.obj[y, x] = ICEP[8] if y < 7 else ICEP[3]
    return finish(sp, hx("#10183a"))


def rock_big_flat():
    sp = Sprite(32, 16, "rock_big_flat")
    sp.ground_shadow(18, 13.5, 15, 2.2)
    facets(sp, 16, 10, 14.5, 5.2, ROCK, n=7, flat_bottom=13, seed=21)
    facets(sp, 26, 11, 5, 3.4, ROCK, n=3, flat_bottom=13, seed=22, part=1, bias=-0.1)
    for x in range(5, 22):  # the slab's flat lit top
        y = 6
        if sp.has(x, y) and sp.has(x, y - 1) is False:
            sp.obj[y, x] = ROCK[7]
    return finish(sp)


def rock_big_cracked():
    sp = Sprite(32, 32, "rock_big_cracked")
    sp.ground_shadow(18, 29.5, 15, 3)
    facets(sp, 16, 16, 13, 11, ROCK, n=10, flat_bottom=29, seed=31)
    facets(sp, 25, 23, 6, 5.5, ROCK, n=4, flat_bottom=29, seed=32, part=1, bias=-0.12)
    crack = [(15, 6), (15, 7), (16, 8), (16, 9), (15, 10), (16, 11), (17, 12), (17, 13), (16, 14), (17, 15), (18, 16),
             (18, 17), (17, 18), (18, 19), (19, 20), (19, 21), (18, 22), (19, 23), (19, 24)]
    for x, y in crack:  # a deep split, lit on its left lip
        if sp.has(x, y):
            sp.obj[y, x] = ROCK[0]
            if sp.has(x - 1, y):
                sp.obj[y, x - 1] = ROCK[7]
            if sp.has(x + 1, y):
                sp.obj[y, x + 1] = ROCK[2]
    return finish(sp)


def rock_big_cluster():
    sp = Sprite(32, 16, "rock_big_cluster")
    sp.ground_shadow(17, 13.5, 14, 2.2)
    for i, (x, y, rx, ry) in enumerate(((9, 9, 5.5, 4.8), (20, 8, 6.5, 5.6), (27, 11, 3.8, 3.2), (4, 12, 3, 2.6),
                                        (14, 12, 3.4, 2.8))):
        facets(sp, x, y, rx, ry, ROCK, n=4, flat_bottom=13, seed=40 + i, part=i, bias=-0.06 * (i % 2))
    return finish(sp)


def rock_big_sandstone():
    sp = Sprite(32, 32, "rock_big_sandstone")
    sp.ground_shadow(18, 29.5, 15, 3)
    facets(sp, 16, 16, 13.5, 11.5, SAND_ROCK, n=8, flat_bottom=29, seed=51)
    facets(sp, 7, 23, 6, 6, SAND_ROCK, n=4, flat_bottom=29, seed=52, part=1)
    for y in range(8, 29, 4):  # strata: a darker band with a lit line above it
        for x in range(32):
            if sp.has(x, y) and sp.has(x, y - 1):
                c = tuple(sp.obj[y, x])
                idx = [tuple(p) for p in SAND_ROCK].index(c) if c in [tuple(p) for p in SAND_ROCK] else 4
                sp.obj[y, x] = SAND_ROCK[max(0, idx - 2)]
                if (x + y) % 3:
                    sp.obj[y - 1, x] = SAND_ROCK[min(7, idx + 1)]
    return finish(sp)


def rock_big_ice():
    sp = Sprite(32, 32, "rock_big_ice")
    sp.ground_shadow(18, 29.5, 15, 3)
    facets(sp, 16, 16, 13, 11.5, ICEP, n=8, flat_bottom=29, seed=61)
    facets(sp, 25, 22, 6, 6.5, ICEP, n=4, flat_bottom=29, seed=62, part=1, bias=-0.1)
    for y in range(32):  # snow lying on the top
        for x in range(32):
            if sp.has(x, y) and not sp.has(x, y - 1) and y < 18:
                sp.obj[y, x] = SNOWP[5]
                if sp.has(x, y + 1) and (x % 3):
                    sp.obj[y + 1, x] = SNOWP[4]
    for x, y in ((11, 14), (12, 15), (12, 16), (13, 17), (20, 12), (21, 13)):
        if sp.has(x, y):
            sp.obj[y, x] = ICEP[8]
    return finish(sp, hx("#10183a"))


def crystal_cluster():
    sp = Sprite(16, 16, "crystal_cluster")
    sp.ground_shadow(9, 14.3, 7, 1.8)
    for x0, w, top, dim in ((1, 4, 7, 1), (10, 4, 6, 1), (5, 5, 1, 0)):
        ridge = x0 + w // 2
        for y in range(top, 14):
            k = y - top
            a, b = (ridge, ridge) if k == 0 else (ridge - 1, ridge + 1) if k == 1 else (x0, x0 + w - 1)
            for x in range(a, b + 1):
                c = CRYST[6 - dim] if x < ridge else CRYST[7 - dim] if x == ridge else CRYST[3 - dim]
                sp.set(x, y, c, x0)
        sp.set(ridge, top, CRYST[8], x0)
    for x in range(1, 15):
        if sp.has(x, 13):
            sp.set(x, 14, CAVESTONE[3] if x % 3 else CAVESTONE[5], 9)
    return finish(sp, hx("#0c0820"))


def crystal_pink():
    import props
    saved = props.CRYST
    props.CRYST = PINK
    try:
        props.crystal()
    finally:
        props.CRYST = saved
    shadow, obj = props.LAST["layers"]
    sp = Sprite(16, 32, "crystal_pink")
    sp.shadow[:] = shadow
    sp.obj[:] = obj
    return done(sp)


def obsidian_big():
    sp = Sprite(32, 32, "obsidian_big")
    sp.ground_shadow(18, 29.5, 14, 2.5)
    shards = [(7, 29, 14, 4, 3), (14, 29, 3, 5, 5), (22, 29, 9, 4, 4), (27, 29, 17, 3, 3), (10, 29, 20, 3, 3)]
    for j, (fx, fy, ty, wl, wr) in enumerate(sorted(shards, key=lambda s: s[2])):
        for y in range(ty, fy + 1):
            t = (y - ty) / max(1, fy - ty)
            l, r = int(round(wl * t)), int(round(wr * t))
            for x in range(fx - l, fx + r + 1):
                if x < fx:
                    c = OBSID[4] if x == fx - l else OBSID[3]
                elif x == fx:
                    c = OBSID[7] if t < 0.5 else OBSID[6]
                else:
                    c = OBSID[1] if x == fx + r else OBSID[2]
                sp.set(x, y, c, j)
        sp.set(fx, ty, OBSID[8], j)
    for x in range(2, 30):
        if sp.has(x, 29) or sp.has(x, 28):
            sp.set(x, 29, OBSID[1], 9)
    return finish(sp)


# ---------- small things ----------

def bush_flower():
    from props import bush
    bush()
    from props import LAST
    shadow, obj = LAST["layers"]
    sp = Sprite(16, 16, "bush_flower")
    sp.shadow[:] = shadow
    sp.obj[:] = obj
    for x, y in ((4, 6), (9, 4), (12, 8), (6, 10), (10, 11), (3, 10), (13, 11)):
        if sp.obj[y, x, 3] and tuple(sp.obj[y, x][:3]) != (0x12, 0x0c, 0x18):
            stamp(sp.obj, x - 1, y - 1, [".p.", "pyp", ".p."], {"p": hx("#f6a8c8"), "y": hx("#ffe070")})
    return done(sp)


def bush_dry():
    sp = Sprite(16, 16, "bush_dry")
    sp.ground_shadow(9, 14.5, 7, 1.8)
    twig = [hx("#4a3a24"), hx("#6e5a34"), hx("#94804a"), hx("#bca866")]
    rng = sp.rng
    for _ in range(26):  # a tangle of dry twigs fanning up from the root
        ang = rng.random() * math.pi - math.pi
        L = 3 + rng.random() * 5
        x0, y0 = 8 + rng.integers(-1, 2), 14
        x1, y1 = x0 + math.cos(ang) * L * 1.2, y0 + math.sin(ang) * L
        c = twig[int(rng.integers(1, 4))] if y1 < 10 else twig[int(rng.integers(0, 2))]
        line(sp, [(x0, y0), (x1, y1)], c, part=0)
    return finish(sp, hx("#1e140e"))


def cactus_round():
    sp = Sprite(16, 16, "cactus_round")
    sp.ground_shadow(9, 14.3, 6.5, 1.8)
    blob(sp, 8, 9, 6, 5.5, CACTUS, flat_bottom=14, seed=5)
    for y in range(16):  # ribs
        for x in (4, 7, 10, 13):
            if sp.has(x, y):
                c = tuple(sp.obj[y, x])
                idx = [tuple(p) for p in CACTUS].index(c) if c in [tuple(p) for p in CACTUS] else 3
                sp.obj[y, x] = CACTUS[max(0, idx - 2)]
    for x, y in ((5, 6), (8, 8), (11, 7), (6, 11), (10, 11)):
        sp.obj[y, x] = hx("#e8f0c8")
    stamp(sp.obj, 6, 2, [".pp.", "pyyp", ".pp."], {"p": hx("#ff5a8a"), "y": hx("#ffe070")})
    return finish(sp)


def pillar_fallen():
    sp = Sprite(32, 16, "pillar_fallen")
    sp.ground_shadow(17, 13.5, 15, 2)
    for x in range(3, 29):  # a column lying on its side, lit along its top
        top, bot = 4, 12
        for y in range(top, bot + 1):
            ny = (y + 0.5 - top) / (bot - top + 1) * 2 - 1
            v = ny * LIGHT[1] + math.sqrt(max(0, 1 - ny * ny)) * LIGHT[2]
            c = band(v, COLUMN, -0.6, 0.8)
            if (y - top) % 3 == 2 and 0 < y - top < bot - top:
                idx = [tuple(p) for p in COLUMN].index(tuple(c))
                c = COLUMN[max(0, idx - 2)]  # flutes
            sp.set(x, y, c, 0)
    for y in range(4, 13):  # broken ends: ragged, the cut faces lighter
        for x in (3, 4):
            if (y * 3) % 4 == 0:
                sp.obj[y, x] = 0
        sp.set(28 - (y % 3 == 0), y, COLUMN[7], 0)
    for x, y in ((12, 4), (13, 4), (14, 5), (20, 11), (21, 12), (22, 12)):  # moss
        sp.set(x, y, MOSS[3], 0)
    for x, y in ((17, 6), (17, 7), (18, 8)):
        sp.set(x, y, COLUMN[1], 0)
    return finish(sp)


MORE = {
    "tree_birch": tree_birch, "tree_autumn": tree_autumn, "tree_fruit": tree_fruit, "tree_willow": tree_willow,
    "tree_dead": tree_dead, "tree_charred": tree_charred, "tree_bare_snowy": tree_bare_snowy,
    "mushroom_giant": mushroom_giant, "pine_snowy": pine_snowy, "palm_small": palm_small, "palm_date": palm_date,
    "boulder_mossy": boulder_mossy, "boulder_ice": boulder_ice, "rock_big_flat": rock_big_flat,
    "rock_big_cracked": rock_big_cracked, "rock_big_cluster": rock_big_cluster, "rock_big_sandstone": rock_big_sandstone,
    "rock_big_ice": rock_big_ice, "crystal_cluster": crystal_cluster, "crystal_pink": crystal_pink,
    "obsidian_big": obsidian_big, "bush_flower": bush_flower, "bush_dry": bush_dry, "cactus_round": cactus_round,
    "pillar_fallen": pillar_fallen,
}
