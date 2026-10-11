"""Phase 2 art (ASSET_LIST.md section 3): things to wear, more habitats, decorations,
structures, item icons, emotes and interface frames. Full colour: dark, lit by neon."""

import math
import random

from px import *
from world import FLAME, BOLT, bush, ground, hills, lamp, lit, neon_sign, sky, skyline, spark, tree

GOLD = LEMON


# ---------- worn items ----------
def hat(i):
    s = Spr(20, 14)
    if i == "cap":
        s.blob(E(9, 10, 7.4, 7.4) & R(0, 0, 19, 11), PINK, t=2)
        s.blob(R(9, 10, 19, 12), CYAN, t=1, hi=set())
        s.led(9, 3, LEMON)
    elif i == "beanie":
        s.blob(E(10, 9.5, 7.6, 7.6) & R(0, 0, 19, 10), MINT, t=2)
        s.blob(RR(2, 9, 17, 13, 1), LILAC, t=1, hi=set())
        for x in (5, 9, 13):
            s.fill(R(x, 10, x, 12), LILAC[2])
        s.blob(E(10, 1.6, 2.2, 2.2), SNOW, t=1, hi=set())
    elif i == "crown":
        s.blob(PG([(3, 13), (2, 4), (6, 8), (10, 2), (14, 8), (18, 4), (17, 13)]), GOLD, t=1, hi={(5, 10), (6, 10), (5, 11)})
        for x, c in ((6, PINK), (10, CYAN), (14, PINK)):
            s.led(x, 11, c)
        for p in ((2, 4), (10, 2), (18, 4)):
            s.put(p, W)
    elif i == "wizard":
        s.blob(PG([(4, 11), (12, 0), (13, 0), (16, 11)]), LILAC, t=2)
        s.blob(RR(0, 10, 19, 13, 1), LILAC, t=1, hi=set())
        s.fill(R(5, 9, 15, 9), PINK[1])
        s.led(11, 5, LEMON)
        s.put((8, 7), LEMON[1])
    elif i == "flower":
        s.blob(RR(2, 10, 17, 13, 1), LEAF, t=1, hi=set())
        for cx, cy, r in ((5, 8, PINK), (10, 6, LEMON), (15, 8, CYAN)):
            s.blob(E(cx, cy, 2.6, 2.6), r, t=1, hi=set())
            s.put((cx, cy), W)
    elif i == "headphones":
        s.fill(ARC(9.5, 12, 8, 180, 360, 2), CHAR[1])
        s.fill(ARC(9.5, 12, 8, 200, 290), CHAR[0])
        for x0 in (0, 15):
            s.blob(RR(x0, 6, x0 + 4, 13, 1), PINK, t=1, hi=set())
            s.led(x0 + 2, 9, CYAN)
    elif i == "bow":
        s.blob(PG([(10, 9), (2, 3), (1, 13)]), PINK, t=1)
        s.blob(PG([(10, 9), (17, 3), (18, 13)]), PINK, t=1)
        s.blob(R(8, 7, 11, 12), [PINK[0], PINK[0], PINK[1], PINK[3]], t=1, hi=set())
    else:   # straw
        s.blob(E(10, 10, 6.2, 6) & R(0, 0, 19, 10), SAND, t=1)
        s.blob(RR(0, 10, 19, 13, 1), SAND, t=1, hi=set())
        s.fill(R(5, 8, 15, 9), PINK[1])
        s.fill(R(5, 9, 15, 9), PINK[2])
    return s


def face(i):
    s = Spr(16, 8)
    ring = lambda cx: E(cx, 3.5, 3.6, 3.6) - E(cx, 3.5, 2.5, 2.5)
    if i == "round_glasses":
        s.fill(ring(3.5) | ring(11.5) | {(7, 3), (8, 3)}, GOLD[2])
        s.fill({(2, 1), (3, 0), (10, 1), (11, 0)}, GOLD[0])
    elif i == "shades":
        for x0 in (0, 8):
            s.blob(RR(x0, 1, x0 + 7, 6, 2), [CYAN[1], NAVY[2], NAVY[3], INK], t=1, hi={(x0 + 2, 2), (x0 + 3, 2), (x0 + 2, 3)})
        s.fill({(7, 2), (8, 2)}, INK)
    elif i == "monocle":
        s.fill(ring(11.5), GOLD[1])
        s.fill({(10, 1), (11, 0)}, W)
        s.fill({(14, 6), (15, 7)}, GOLD[2])
    elif i == "star_glasses":
        for cx in (3.5, 11.5):
            st = STAR(cx, 3.6, 4, 2, 5)
            s.fill(rim(st), PINK[1])
            s.put((round(cx), 0), PINK[0])
        s.fill({(7, 4), (8, 4)}, PINK[2])
    else:   # mask
        m = RR(0, 1, 15, 6, 2)
        s.blob(m, LILAC, t=1, hi=set())
        s.erase(E(3.5, 3.5, 2.2, 1.6) | E(11.5, 3.5, 2.2, 1.6))
    return s


def neck(i):
    s = Spr(16, 10)
    if i == "gold_chain":
        for k, p in enumerate(sorted(ARC(7.5, 0, 6, 0, 180))):
            s.put(p, GOLD[1] if k % 2 else GOLD[2])
        s.blob(R(6, 6, 9, 9), GOLD, t=1, hi=set())
        s.put((7, 7), W)
    elif i == "scarf":
        s.blob(RR(1, 0, 14, 4, 1), PINK, t=1, hi=set())
        s.blob(R(3, 3, 7, 9), PINK, t=1, hi=set())
        for x in (4, 9, 12):
            s.fill(lit(s, R(x, 1, x, 8)), CYAN[1])
    elif i == "bowtie":
        s.blob(PG([(8, 4), (1, 0), (1, 8)]), CYAN, t=1)
        s.blob(PG([(8, 4), (14, 0), (14, 8)]), CYAN, t=1)
        s.blob(R(6, 2, 9, 6), PINK, t=1, hi=set())
    elif i == "bell":
        s.fill(R(1, 0, 14, 1), PINK[2])
        s.fill(R(1, 0, 14, 0), PINK[1])
        s.blob(E(7.5, 5.5, 3.6, 3.6), GOLD, t=1)
        s.fill({(7, 7), (8, 7)}, GOLD[3])
    elif i == "spiked_collar":
        s.blob(R(1, 2, 14, 5), CHAR, t=1, hi=set())
        for x in (3, 7, 11):
            s.fill({(x, 1), (x + 1, 1), (x, 0)}, STEEL[0])
            s.put((x + 1, 0), STEEL[1])
            s.put((x, 4), PINK[1])
    else:   # medal
        s.fill(PATH([(3, 0), (7, 5)], 2), CYAN[1])
        s.fill(PATH([(11, 0), (8, 5)], 2), PINK[1])
        s.blob(E(7.5, 6.5, 3, 3), GOLD, t=1, hi=set())
        s.put((7, 6), W)
    return s


def held(i):
    s = Spr(12, 12)
    if i == "book":
        s.blob(RR(1, 2, 10, 11, 1), LILAC, t=1, hi=set())
        s.fill(R(3, 10, 9, 10), SNOW[1])
        s.fill(R(2, 3, 2, 10), LILAC[2])
        s.fill(R(5, 5, 8, 5) | R(5, 7, 7, 7), LEMON[1])
    elif i == "lantern":
        s.fill(ARC(5.5, 3, 2.5, 180, 360), STEEL[1])
        s.blob(RR(2, 3, 9, 11, 1), CHAR, t=1, hi=set())
        s.fill(R(4, 5, 7, 9), LEMON[1])
        s.fill(R(5, 6, 6, 8), LEMON[0])
        s.put((5, 6), W)
    elif i == "flag":
        s.blob(PG([(3, 1), (11, 3), (3, 6)]), PINK, t=1)
        s.fill(R(2, 0, 2, 11), STEEL[1])
        s.put((2, 0), STEEL[0])
    elif i == "balloon":
        s.fill(PATH([(6, 8), (5, 10), (6, 11)]), SNOW[2])
        s.blob(E(5.5, 4, 4.2, 4.4), CYAN, t=1)
        s.put((5, 8), CYAN[2])
    elif i == "microphone":
        s.blob(R(5, 5, 6, 11), CHAR, t=1, hi=set(), line=False)
        s.blob(E(5.5, 3, 3, 3), STEEL, t=1)
        s.put((6, 8), PINK[1])
    else:   # quill
        s.blob(PG([(3, 9), (5, 3), (10, 0), (9, 5), (5, 9)]), MINT, t=1)
        s.fill(LN(2, 11, 8, 3), LEAF[3])
        s.put((2, 11), INK)
    return s


def shirt(i):
    s = Spr(16, 16)
    if i == "striped":
        for y in range(16):
            s.fill(R(0, y, 15, y), PINK[1] if (y // 2) % 2 else SNOW[1])
    elif i == "plain":
        s.fill(R(0, 0, 15, 15), CYAN[1])
    elif i == "dotted":
        s.fill(R(0, 0, 15, 15), LILAC[1])
        for x, y in ((2, 2), (10, 2), (6, 10), (14, 10)):
            s.fill(R(x, y, x + 1, y + 1), SNOW[0])
    elif i == "checked":
        for y in range(16):
            for x in range(16):
                s.put((x, y), MINT[1] if (x // 4 + y // 4) % 2 else TEAL[1])
    else:   # star
        s.fill(R(0, 0, 15, 15), NAVY[1])
        for x, y in ((4, 4), (12, 12)):
            s.fill({(x, y), (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)}, LEMON[1])
            s.put((x, y), W)
    return s


# ---------- more habitats ----------
def palm(s, x, ground_y, height, trunk=PLUM, frond=TREE, lean=4):
    for k in range(height):
        px_ = x + round(lean * math.sin(k / height * 1.5))
        s.fill(R(px_ - 1, ground_y - k, px_ + 1, ground_y - k), trunk[1] if k % 4 else trunk[2])
        s.put((px_ - 1, ground_y - k), trunk[0])
        s.put((px_ + 2, ground_y - k), trunk[3])
    tx, ty = x + round(lean * math.sin(1.5)), ground_y - height
    for a, ln in ((200, 15), (235, 13), (270, 10), (305, 13), (340, 15), (170, 11), (10, 11)):
        pts = []
        for k in range(ln):
            t = k / ln
            pts.append((tx + math.cos(math.radians(a)) * k, ty + math.sin(math.radians(a)) * k + t * t * 9))
        s.fill(PATH([(round(a_), round(b_)) for a_, b_ in pts], 2), frond[1])
        s.fill(PATH([(round(a_), round(b_) + 2) for a_, b_ in pts]), frond[3])
        s.fill(PATH([(round(a_), round(b_)) for a_, b_ in pts[: ln // 2]]), frond[0])
    s.led(tx, ty + 2, LEMON)
    s.led(tx + 2, ty + 3, PINK)


def oasis():
    """A desert town at sundown: dark dunes with burning edges, and one pool of neon water."""
    rnd = random.Random(21)
    far = Spr(320, 144)
    skyline(far, 104, rnd, ["#7a2a78", "#5f1f66", "#4a1856"], [LEMON, CYAN], 12, 34, domes=True, gap=(3, 12), lit_up=0.4)
    hills(far, 98, [(8, 44, 1.0), (3, 17, 0.2)], "#ff8a4e", "#4a1a52")
    hills(far, 108, [(5, 30, 2.5), (2, 9, 1.0)], "#e0507a", "#33123f")
    mid = Spr(320, 144, rim=True)
    for x, h_, ln in ((30, 44, 4), (66, 34, -3), (262, 40, -4), (298, 48, 3)):
        palm(mid, x, 118, h_, lean=ln)
    neon_sign(mid, 196, 82, 18, 11, CYAN, rnd, pole_to=117)
    bush(mid, 100, 117, TREE, PINK)
    bush(mid, 226, 117, TREE, LEMON)
    g = ground(LEMON[1], ["#b05a5c", "#6b3552", "#472446"], "#1c0d30", PEACH, 8, flowers=(MINT, CYAN))
    pool = E(262, 123, 30, 4.4) & R(0, 118, 319, 127)
    g.blob(pool, [W, CYAN[1], CYAN[2], CYAN[3]], t=1, hi=set(), sel=False)
    g.fill(lit(g, R(244, 122, 256, 122) | R(266, 124, 276, 124)), CYAN[0])
    return {"sky": sky(["#1f0f45", "#38135c", "#5f1a70", "#8f2676", "#c43a70", "#ee6452", "#ff9a48", "#ffd060"], stars=10), "far": far, "mid": mid, "ground": g}


def pine(s, x, base, height, ramp):
    for k in range(3):
        top = base - height + k * height // 4
        w = 6 + k * 4
        m = PG([(x, top), (x + w, top + height // 2), (x - w, top + height // 2)])
        s.fill(m, ramp[1])
        s.fill({p for p in m if p[0] < x - 1 and (p[0] + 1, p[1] - 1) not in m}, ramp[0])
        s.dither({p for p in m if p[0] > x + 1}, ramp[2])
    s.fill(R(x - 1, base - height // 4, x + 1, base), ramp[2])


def forest():
    """Night woods: black trunks, mushrooms that glow, fireflies."""
    rnd = random.Random(31)
    far = Spr(320, 144)
    x = -4
    while x < 330:
        pine(far, x, 116, rnd.randint(40, 66), ["#1c4a66", "#123450", "#0c2540"])
        x += rnd.randint(13, 24)
    x = 4
    while x < 330:
        pine(far, x, 118, rnd.randint(24, 40), ["#16405a", "#0d2a44", "#081b33"])
        x += rnd.randint(16, 30)
    mid = Spr(320, 144, rim=True)
    for x, wd in ((18, 9), (70, 7), (258, 8), (304, 10)):      # big trunks, with glowing shelf mushrooms
        mid.blob(R(x - wd // 2, 0, x + wd // 2, 118), [PLUM[1], PLUM[2], PLUM[3], INK], t=2, hi=set())
        for y in range(20, 110, 26):
            side = 1 if (y // 26) % 2 else -1
            cap = E(x + side * (wd // 2 + 2), y + (x % 7), 4, 2)
            mid.blob(cap, MINT if side > 0 else PINK, t=1, hi=set())
    for x, c in ((44, MINT), (96, PINK), (232, CYAN), (282, MINT)):   # mushrooms on the forest floor
        mid.blob(R(x, 111, x + 1, 117), SNOW, t=1, hi=set(), line=False)
        mid.dither(E(x + 0.5, 108, 8, 6) - mid.mask(), c[3])
        mid.blob(E(x + 0.5, 109, 5, 3.4) & R(0, 0, 320, 110), c, t=1)
        mid.put((x - 2, 108), W)
    for _ in range(26):                                             # fireflies, in loose groups
        x = rnd.choice((rnd.randint(8, 110), rnd.randint(210, 312)))
        spark(mid, x, rnd.randint(30, 104), rnd.choice((0, 0, 1)), rnd.choice((LEMON, MINT)))
    g = ground(MINT[1], ["#1a8a78", "#105058", "#0a3344"], "#080f24", MINT, 9, flowers=(LEMON, MINT))
    return {"sky": sky(["#060818", "#080c24", "#0a1230", "#0c1a3c", "#0e2448", "#103052", "#123c5a", "#144a60"], stars=46), "far": far, "mid": mid, "ground": g}


def shore():
    """A beach across the bay from the city, the sunset laid out on black water."""
    rnd = random.Random(41)
    far = Spr(320, 144)
    for y in range(96, 144):                                  # the sea, darkening towards the viewer
        far.fill(R(0, y, 319, y), ["#4a2478", "#33206b", "#221a5a", "#16144a"][min(3, (y - 96) // 5)])
    far.fill(R(0, 96, 319, 96), "#ff8a70")
    for y in range(97, 118):                                  # the sun's path, breaking up as it nears
        half = 26 - (y - 97)
        for x in range(160 - half, 160 + half):
            if (x * 7 + y * 13) % (3 + (y - 97) // 4) == 0:
                far.fill(R(x, y, x + 2, y), "#ff9a48" if y < 104 else PINK[1])
    for _ in range(26):
        x, y = rnd.randrange(0, 310), rnd.randrange(99, 118)
        far.fill(R(x, y, x + rnd.randint(3, 8), y), CYAN[2] if rnd.random() < 0.6 else PINK[2])
    skyline(far, 96, rnd, ["#3d1f70", "#2a1458", "#1c0d42"], [LEMON, PINK, CYAN], 8, 30, x0=190, x1=304, gap=(1, 4), lit_up=0.7, signs=0.3)
    far.fill(R(52, 70, 55, 96), "#2a1458")                    # a lighthouse, and its beam
    far.fill(R(52, 70, 52, 96), "#5a2a86")
    far.fill(R(51, 66, 56, 69), LEMON[1])
    beam = PG([(57, 67), (104, 58), (104, 74)])
    far.dither(beam, LEMON[2])
    far.fill(R(57, 67, 66, 68), LEMON[0])
    mid = Spr(320, 144, rim=True)
    palm(mid, 26, 118, 46, lean=5)
    palm(mid, 296, 118, 40, lean=-5)
    for x in (70, 84, 98):                                    # a short pier with lights on its posts
        mid.blob(R(x, 100, x + 2, 118), WOOD, t=1, hi=set())
        mid.led(x + 1, 99, LEMON)
    mid.blob(R(66, 104, 104, 106), WOOD, t=1, hi=set())
    mid.blob(E(246, 114, 12, 7) & R(0, 0, 320, 118), CHAR, t=2)
    mid.blob(E(262, 115, 7, 5) & R(0, 0, 320, 118), CHAR, t=1)
    g = ground(LEMON[0], ["#b8787a", "#704666", "#482c50"], "#100c30", CYAN, 12, flowers=(PINK, CYAN))
    return {"sky": sky(["#100c40", "#1f1460", "#3a1c86", "#62289e", "#9a36a6", "#da4c92", "#ff7a6c", "#ffb868"], stars=14), "far": far, "mid": mid, "ground": g}


# ---------- decorations ----------
def flower(s, x, base, height, ramp):
    s.fill(R(x, base - height, x, base), LEAF[2])
    s.fill({(x + 1, base - 2), (x - 1, base - 4)}, LEAF[1])
    s.blob(E(x, base - height, 2.5, 2.5), ramp, t=1, hi=set())
    s.put((x, base - height), LEMON[0])


def decor16(i):
    s = Spr(16, 16)
    if i in ("flower_red", "flower_blue"):
        ramp = PINK if i == "flower_red" else CYAN
        flower(s, 4, 15, 8, ramp)
        flower(s, 8, 15, 11, ramp)
        flower(s, 12, 15, 7, ramp)
    elif i == "mushroom":
        s.blob(R(6, 9, 9, 15), SNOW, t=1, hi=set())
        s.blob(E(7.5, 7, 6.4, 4.6) & R(0, 0, 15, 9), PINK, t=1)
        for p in ((5, 6), (10, 5), (8, 8)):
            s.led(*p, [LEMON[0], PINK[1]])
    elif i == "rock_small":
        s.blob(PG([(2, 15), (3, 10), (7, 8), (12, 10), (14, 15)]), STEEL, t=1)
        s.put((10, 12), CYAN[1])
    elif i == "grass_tuft":
        for x, h_ in ((3, 6), (5, 10), (8, 12), (10, 8), (12, 5)):
            s.fill(R(x, 15 - h_, x, 15), MINT[1])
            s.fill(R(x + 1, 16 - h_, x + 1, 15), LEAF[2])
            s.put((x, 15 - h_), MINT[0])
    elif i == "lantern_small":
        s.fill(R(7, 3, 8, 4), STEEL[1])
        s.blob(RR(4, 5, 11, 13, 1), CHAR, t=1, hi=set())
        s.fill(R(6, 7, 9, 11), LEMON[1])
        s.fill(R(7, 8, 8, 10), LEMON[0])
        s.put((7, 8), W)
        s.fill(R(3, 14, 12, 15), CHAR[2])
    elif i == "shell":
        m = E(7.5, 12, 6.4, 6) & R(0, 0, 15, 15)
        s.blob(m, PINK, t=1)
        for x in (4, 7, 10):
            s.fill(lit(s, LN(7, 14, x, 7)), PINK[2])
    else:   # signpost
        s.blob(R(7, 6, 8, 15), WOOD, t=1, hi=set())
        s.blob(PG([(1, 2), (12, 2), (14, 5), (12, 8), (1, 8)]), CHAR, t=1, hi=set())
        s.fill(R(3, 4, 6, 4) | R(8, 4, 10, 4), CYAN[1])
        s.fill(R(3, 6, 8, 6), PINK[1])
    return s


def decor32(i):
    s = Spr(32, 32)
    if i == "bush":
        bush(s, 15, 30, TREE, PINK)
        s.blob(E(15, 20, 9, 7), TREE, t=2)
        s.led(12, 19, LEMON)
        s.led(19, 22, PINK)
    elif i == "rock_big":
        s.blob(PG([(2, 31), (4, 18), (11, 10), (20, 9), (27, 16), (30, 31)]), STEEL, t=3)
        s.fill(lit(s, PATH([(13, 14), (15, 19), (12, 24)])), STEEL[2])
        for p in ((15, 19), (22, 24)):
            s.led(*p, CYAN)
    elif i == "nest":
        s.blob(E(15.5, 25, 14, 6.4), WOOD, t=2, hi=set())
        s.fill(E(15.5, 22.5, 10, 2.6), WOOD[3])
        for cx, c in ((11, CYAN), (16, PINK), (21, LEMON)):
            s.blob(E(cx, 20, 3, 3.8) & R(0, 0, 31, 22), c, t=1)
        for x in (5, 12, 20, 26):
            s.fill(lit(s, LN(x, 24, x + 3, 28)), WOOD[0])
    elif i == "bed":
        s.blob(RR(1, 20, 30, 29, 2), CHAR, t=1, hi=set())
        s.blob(RR(2, 15, 29, 23, 3), LILAC, t=2)
        s.blob(RR(3, 12, 12, 19, 3), SNOW, t=1)
        s.fill(lit(s, R(15, 19, 27, 19)), PINK[1])
        s.fill(R(3, 29, 5, 31) | R(26, 29, 28, 31), CHAR[2])
        s.led(27, 26, MINT)
    elif i == "food_bowl":
        s.blob(E(15.5, 22, 9, 3.4), PEACH, t=1, hi=set())
        s.blob(PG([(5, 22), (26, 22), (23, 31), (8, 31)]), CYAN, t=2, hi=set())
        s.blob(E(15.5, 21, 8, 3), PEACH, t=1)
        s.fill(R(12, 26, 19, 27), SNOW[0])
        s.led(15, 20, LEMON)
    elif i == "toy_ball":
        m = E(15.5, 21.5, 9.6, 9.6)
        s.blob(m, PINK, t=2)
        s.over({p for p in m if abs(p[0] - p[1] + 6) < 3}, CYAN)
        s.over({p for p in m if abs(p[0] + p[1] - 37) < 2}, LEMON)
    elif i == "bookshelf":
        s.blob(R(3, 4, 28, 31), WOOD, t=1, hi=set())
        for y0 in (6, 15, 24):
            s.fill(R(5, y0, 26, y0 + 6), WOOD[3])
            x = 5
            for k in range(7):
                ramp = [PINK, CYAN, LEMON, MINT, LILAC][(k + y0) % 5]
                wd = 2 + (k + y0) % 2
                h_ = 5 + (k * 3 + y0) % 2
                s.fill(R(x, y0 + 7 - h_, x + wd - 1, y0 + 6), ramp[1])
                s.fill(R(x + wd - 1, y0 + 7 - h_, x + wd - 1, y0 + 6), ramp[2])
                x += wd + (1 if k % 3 == 2 else 0)
    elif i == "radio":
        s.fill(LN(22, 16, 27, 5), STEEL[1])
        s.led(27, 5, PINK)
        s.blob(RR(3, 15, 28, 31, 3), PEACH, t=2, hi=set())
        s.blob(E(10, 23, 5, 5), CHAR, t=1, hi=set())
        s.fill(E(10, 23, 2, 2), CHAR[0])
        s.fill(R(18, 18, 26, 22), SCREEN)
        s.fill(R(19, 20, 25, 20), CYAN[2])
        s.fill(R(22, 19, 22, 21), LEMON[1])
        s.led(19, 27, MINT)
        s.led(24, 27, PINK)
    elif i == "pond":
        s.blob(E(15.5, 26, 15, 5.4), STEEL, t=1, hi=set())
        s.blob(E(15.5, 25.5, 12.6, 3.8), [W, CYAN[1], CYAN[2], TEAL[2]], t=1, hi=set(), sel=False)
        s.fill(R(8, 25, 13, 25) | R(17, 27, 21, 27), CYAN[0])
        s.blob(E(21, 24, 2.4, 1.4), MINT, t=1, hi=set())
        s.led(21, 23, PINK)
    elif i == "campfire":
        s.blob(R(4, 27, 27, 30), WOOD, t=1, hi=set())
        s.blob(PG([(6, 31), (12, 24), (16, 31)]) | PG([(15, 31), (20, 24), (26, 31)]), WOOD, t=1, hi=set())
        m = shift({(x * 2 + dx, y * 2 + dy) for (x, y) in PG(FLAME) for dx in (0, 1) for dy in (0, 1)}, 0, -2)
        m = {p for p in m if p[1] < 27}
        s.blob(m, PINK, t=2, hi=set())
        core = erode(m, 4)
        s.fill(core, LEMON[1])
        s.fill(erode(core, 2), LEMON[0])
        s.fill(erode(core, 3), W)
    elif i == "tent":
        m = PG([(1, 31), (15, 5), (16, 5), (30, 31)])
        s.blob(m, LILAC, t=3)
        s.fill(PG([(11, 30), (15, 14), (16, 14), (20, 30)]), SCREEN)
        s.fill(lit(s, LN(8, 20, 10, 30) | LN(23, 20, 21, 30)), PINK[1])
        s.fill(LN(15, 1, 15, 5), STEEL[1])
        s.led(15, 1, LEMON)
        s.led(15, 22, [LEMON[0], NAVY[1]])
    else:   # lamp_post
        s.blob(R(14, 9, 16, 31), STEEL, t=1, hi=set())
        s.blob(R(11, 29, 19, 31), STEEL, t=1, hi=set())
        s.dither(E(15, 5.5, 7.5, 7.5), CYAN[2])
        s.blob(RR(11, 1, 19, 9, 2), [W, CYAN[0], CYAN[1], CYAN[3]], t=2)
        s.fill(R(10, 9, 20, 10), STEEL[2])
    return s


def decor48(i):
    s = Spr(48, 48)
    if i == "tree_fruit":
        tree(s, 24, 46, 46, TREE, WOOD, PINK)
        for p in ((14, 14), (32, 12), (24, 22), (18, 6), (30, 20)):
            s.blob(E(p[0], p[1], 2, 2), PEACH, t=1, hi=set())
            s.put((p[0] - 1, p[1] - 1), W)
    elif i == "fountain":
        s.blob(E(23.5, 41, 21, 6), STEEL, t=2, hi=set())
        s.blob(E(23.5, 39, 18, 4), [W, CYAN[1], CYAN[2], TEAL[2]], t=1, hi=set(), sel=False)
        s.blob(R(21, 18, 26, 40), STEEL, t=1, hi=set())
        s.blob(E(23.5, 19, 9, 3), STEEL, t=1, hi=set())
        for side in (-1, 1):
            jet = {(round(23.5 + side * t_ * 12), round(16 - 10 * math.sin(t_ * math.pi) + t_ * 22)) for t_ in [k / 30 for k in range(31)]}
            s.fill(grow(jet) & R(0, 0, 47, 38), CYAN[1])
            s.fill(jet & R(0, 0, 47, 38), CYAN[0])
        s.fill(R(23, 6, 24, 17), CYAN[0])
        s.led(23, 5, [W, CYAN[1]])
        for x in (12, 34):
            s.led(x, 43, PINK)
    elif i == "arch":
        m = (RR(4, 4, 43, 60, 18) - RR(12, 14, 35, 60, 11)) & R(0, 0, 47, 47)
        s.blob(m, STEEL, t=3, hi=set())
        neon = rim(RR(8, 9, 39, 60, 15) & R(0, 0, 47, 47)) & erode(m)
        s.fill(neon, PINK[1])
        s.fill({p for p in neon if p[0] < 24 and p[1] < 24}, PINK[0])
        for x in (3, 36):
            s.blob(R(x, 42, x + 8, 47), CHAR, t=1, hi=set())
        s.led(23, 6, CYAN)
    else:   # statue: a creature on a plinth, cast in metal with one eye still lit
        s.blob(R(8, 38, 39, 47), CHAR, t=2, hi=set())
        s.fill(R(12, 41, 35, 41), LEMON[2])
        s.blob(E(23.5, 30, 10, 9) & R(0, 0, 47, 38), STEEL, t=2)
        s.blob(E(24, 15, 11, 9.6), STEEL, t=2)
        s.blob(PG([(15, 9), (17, 1), (21, 8)]) | PG([(27, 8), (31, 1), (33, 9)]), STEEL, t=1)
        s.blob(PG([(31, 13), (38, 17), (37, 21), (30, 22)]), STEEL, t=1, hi=set())
        s.fill(R(25, 13, 27, 15), CYAN[1])
        s.put((25, 13), W)
        s.fill(R(24, 12, 28, 12), STEEL[3])
    return s


# ---------- structures: six, each in three tiers ----------
def structure(i, tier):
    n = 48 if tier == 3 else 32
    s = Spr(n, n)
    b, c = n - 1, n // 2          # ground line, centre
    k = n / 32
    if i == "word_sprout":       # a plant whose leaves carry glowing letters
        s.blob(PG([(c - 6 * k, b - 7 * k), (c + 6 * k, b - 7 * k), (c + 4 * k, b), (c - 4 * k, b)]), CHAR, t=1, hi=set())
        s.led(c, round(b - 3 * k), MINT)
        top = round(b - (14 + tier * 4) * k)
        s.fill(R(c - 1, top, c, round(b - 7 * k)), LEAF[2])
        for j in range(tier + 1):
            y = round(b - (10 + j * 5) * k)
            side = 1 if j % 2 else -1
            s.blob(E(c + side * 5 * k, y, 4.6 * k, 2.6 * k), LEAF, t=1)
            s.led(round(c + side * 5 * k), y, LEMON)
        s.blob(E(c - 0.5, top - 2 * k, 3.4 * k, 3.4 * k), LEMON, t=1)
        glyph = {(0, 0), (1, 0), (2, 0), (0, 1), (2, 1), (0, 2), (1, 2), (2, 2), (0, 3), (2, 3)}
        for j in range(tier):
            s.fill(shift(glyph, round(c + (-12 + j * 10) * k), round(top - (6 + (j % 2) * 4) * k)), LEMON[0] if j % 2 == 0 else CYAN[1])
    elif i == "echo_shell":      # a big shell that hums
        m = E(c, b - 9 * k, 11 * k, 9 * k) & R(0, 0, n - 1, b)
        s.blob(m, PINK, t=2)
        for r in (3, 6, 9):
            s.fill(lit(s, ARC(c + 3 * k, b - 7 * k, r * k, 150, 330)), PINK[2])
        s.fill(E(c + 6 * k, b - 4 * k, 3 * k, 3 * k) & erode(m), SCREEN)
        s.led(round(c + 6 * k), round(b - 4 * k), CYAN)
        for j in range(tier):
            arc = ARC(c + 8 * k, b - 12 * k, (5 + j * 4) * k, 250, 340) - m
            (s.fill if j < 2 else s.dither)(arc, CYAN[1 + (j > 0)])
        if tier >= 2:
            s.blob(R(round(c - 9 * k), b - 2, round(c + 9 * k), b), CHAR, t=1, hi=set())
    elif i == "page_lantern":    # a paper lantern folded out of pages
        w2 = (5 + tier) * k
        top, bot = round(b - (17 + tier * 2) * k), round(b - 3 * k)
        s.fill(R(c - 1, top - round(4 * k), c, top), STEEL[1])
        s.blob(RR(round(c - w2), top, round(c + w2), bot, 2), SNOW, t=2, hi=set())
        s.fill(lit(s, E(c - 0.5, (top + bot) / 2, w2 * 0.55, (bot - top) * 0.3)), LEMON[0])
        for y in range(top + 3, bot - 1, 3):
            s.fill(lit(s, R(round(c - w2) + 2, y, round(c + w2) - 3, y)), LILAC[1])
        s.blob(R(round(c - w2 - 1), top - 2, round(c + w2 + 1), top), PINK, t=1, hi=set())
        s.blob(R(round(c - w2 - 1), bot, round(c + w2 + 1), bot + 2), PINK, t=1, hi=set())
        s.fill(R(c - 1, bot + 3, c, b), PINK[2])
        if tier >= 2:
            for side in (-1, 1):
                s.blob(R(round(c + side * (w2 + 5 * k)) - 2, round(b - 9 * k), round(c + side * (w2 + 5 * k)) + 2, round(b - 4 * k)), SNOW, t=1, hi=set())
        if tier == 3:
            spark(s, c - 14, 8, 2, LEMON)
            spark(s, c + 15, 12, 1, PINK)
    elif i == "ink_well":        # a small well of ink
        s.blob(RR(round(c - 10 * k), round(b - 10 * k), round(c + 10 * k), b, 3), STEEL, t=2, hi=set())
        s.blob(E(c - 0.5, b - 10 * k, 9 * k, 3 * k), [LILAC[1], NAVY[1], NAVY[2], NAVY[3]], t=1, hi=set(), sel=False)
        s.fill(R(round(c - 4 * k), round(b - 10 * k), round(c - 1 * k), round(b - 10 * k)), LILAC[1])
        s.led(c, round(b - 4 * k), LILAC)
        if tier >= 2:            # a little roof on posts
            for side in (-1, 1):
                s.blob(R(round(c + side * 9 * k) - 1, round(b - 22 * k), round(c + side * 9 * k), round(b - 10 * k)), WOOD, t=1, hi=set(), line=False)
            s.blob(PG([(c - 13 * k, b - 21 * k), (c, b - 29 * k), (c + 12 * k, b - 21 * k)]), PINK, t=1)
        for j in range(tier):    # drops of ink rising
            s.led(round(c + (-5 + j * 5) * k), round(b - (14 + j * 3) * k), [LILAC[0], NAVY[1]])
    elif i == "star_loom":       # a loom weaving starlight
        l, r, top = round(c - 11 * k), round(c + 10 * k), round(b - (18 + tier * 2) * k)
        for x in (l, r):
            s.blob(R(x, top, x + 1, b), WOOD, t=1, hi=set())
        s.blob(R(l - 1, top, r + 2, top + 2), WOOD, t=1, hi=set())
        s.blob(R(l - 1, b - 2, r + 2, b), WOOD, t=1, hi=set())
        for j, x in enumerate(range(l + 3, r, 2)):
            s.fill(R(x, top + 3, x, b - 3), [LEMON[1], CYAN[1], PINK[1]][j % 3] if j % (4 - tier) == 0 else LILAC[2])
        woven = R(l + 3, round(b - (4 + tier * 4) * k), r - 1, b - 3)
        s.fill({p for p in woven if (p[0] + p[1]) % 2 == 0}, LEMON[1])
        s.fill({p for p in woven if (p[0] + p[1]) % 2 == 1}, NAVY[1])
        for j in range(tier):
            spark(s, c + (-8 + j * 8) * k, top - (3 + (j % 2) * 3) * k, 1 + (j == 1), LEMON)
    else:                        # memory_stone: a carved standing stone
        h_ = (16 + tier * 4) * k
        m = PG([(c - 7 * k, b), (c - 6 * k, b - h_ + 4 * k), (c - 2 * k, b - h_), (c + 4 * k, b - h_ + 2 * k), (c + 7 * k, b)])
        s.blob(m, STEEL, t=2)
        deep = erode(m, 2)
        for j in range(tier + 1):
            y = round(b - 5 * k - j * 5 * k)
            run = R(round(c - 3 * k), y, round(c + (1 + j % 2 * 2) * k), y) | R(round(c - 3 * k), y, round(c - 3 * k), y + 2)
            s.fill(run & deep, CYAN[1])
            if (round(c + k), y) in deep:
                s.put((round(c + k), y), CYAN[0])
        s.blob(E(c, b, 10 * k, 2.4 * k) & R(0, 0, n - 1, b), LEAF, t=1, hi=set())
        if tier >= 2:
            for side in (-1, 1):
                s.blob(E(c + side * 12 * k, b - (14 + side * 3) * k, 2 * k, 2.6 * k), STEEL, t=1)
        if tier == 3:
            s.dither(E(c, b - h_ - 5, 6, 3) - m, CYAN[1])
            spark(s, c - 1, b - h_ - 6, 2, CYAN)
    return s


# ---------- item icons ----------
def item_icon(i):
    s = Spr(16, 16)
    if i == "food_berry":
        s.blob(E(5.5, 10, 4, 4), PINK, t=1)
        s.blob(E(10.5, 9, 4, 4), PINK, t=1)
        s.fill(PATH([(6, 5), (8, 2), (11, 4)]), LEAF[2])
        s.blob(E(9, 2.5, 2.4, 1.4), LEAF, t=1, hi=set())
    elif i == "food_fish":
        s.blob(E(7, 8, 5.4, 3.6) | PG([(11, 8), (15, 4), (15, 12)]), CYAN, t=1)
        s.put((4, 7), INK)
        s.fill(lit(s, {(7, 9), (9, 9), (8, 10)}), CYAN[2])
    elif i == "food_leaf":
        s.blob(PG([(2, 13), (3, 6), (8, 2), (13, 2), (13, 7), (10, 12), (4, 14)]), LEAF, t=1)
        s.fill(lit(s, LN(4, 12, 11, 4)), LEAF[2])
    elif i == "food_spark":
        s.blob(E(7.5, 9, 6, 5.4), NAVY, t=1, hi=set())
        s.fill(shift(PG([(4, 0), (1, 4), (3, 4), (2, 8), (6, 3), (4, 3), (5, 0)]), 4, 4), LEMON[1])
        s.put((8, 5), W)
    elif i == "food_crystal":
        s.blob(PG([(5, 14), (3, 6), (6, 2), (8, 7)]) | PG([(8, 14), (8, 5), (11, 1), (13, 7), (12, 14)]), LILAC, t=1)
        s.fill({(10, 4), (10, 5), (5, 5)}, W)
    elif i == "food_cake":
        s.blob(RR(2, 7, 13, 14, 1), PEACH, t=1, hi=set())
        s.blob(RR(2, 5, 13, 9, 2), PINK, t=1)
        s.fill(lit(s, {(4, 9), (4, 10), (8, 9), (11, 9), (11, 10)}), PINK[1])
        s.fill(R(7, 2, 8, 4), SNOW[1])
        s.put((7, 1), LEMON[1])
    elif i == "xp_boost":
        s.blob(PG([(8, 1), (14, 8), (10, 8), (10, 14), (5, 14), (5, 8), (1, 8)]), MINT, t=1, hi={(7, 4), (6, 5), (7, 5)})
        s.fill({(13, 2), (14, 13)}, LEMON[1])
    elif i == "incubator":
        s.blob(RR(2, 11, 13, 15, 1), CHAR, t=1, hi=set())
        s.blob(E(7.5, 7.5, 5.4, 6) & R(0, 0, 15, 11), [W, CYAN[0], CYAN[1], CYAN[3]], t=1)
        s.blob(E(7.5, 8, 2.2, 2.8), PEACH, t=1, hi=set())
        s.led(11, 13, MINT)
    elif i == "gift":
        s.blob(R(2, 6, 13, 14), PINK, t=1, hi=set())
        s.blob(R(1, 4, 14, 7), PINK, t=1, hi=set())
        s.fill(R(7, 4, 8, 14), LEMON[1])
        s.fill(PATH([(7, 3), (5, 1), (4, 3)]) | PATH([(8, 3), (10, 1), (11, 3)]), LEMON[1])
    elif i == "key":
        s.blob(E(4.5, 5, 3.6, 3.6), GOLD, t=1, hi=set())
        s.erase(E(4.5, 5, 1.2, 1.2))
        s.fill(PATH([(7, 7), (13, 13)], 2), GOLD[1])
        s.fill({(12, 11), (13, 10), (10, 13), (11, 14)}, GOLD[2])
        s.put((3, 3), W)
    elif i == "ticket":
        s.blob(RR(1, 4, 14, 12, 1), LEMON, t=1, hi=set())
        s.erase({(1, 8), (14, 8)})
        s.fill({(10, y) for y in (5, 7, 9, 11)}, LEMON[2])
        s.fill(STAR(5.5, 8, 3, 1.2, 5), PINK[1])
    elif i == "potion":
        s.fill(R(6, 1, 9, 2), WOOD[1])
        s.blob(R(6, 3, 9, 6) | E(7.5, 10, 5, 4.6), [W, SNOW[1], LILAC[0], LILAC[3]], t=1, hi=set())
        m = E(7.5, 10.5, 3.6, 3.2)
        s.fill(m, MINT[1])
        s.fill({p for p in m if p[1] == 8}, MINT[0])
        s.put((5, 9), W)
    elif i == "egg_mystery":
        m = (E(8, 9.4, 5.2, 6) | E(8, 7.4, 4.3, 5.6)) & R(0, 0, 15, 15)
        s.blob(m, LILAC, t=1)
        s.fill({(7, 5), (8, 5), (9, 6), (9, 7), (8, 8), (8, 9), (8, 11)}, W)
    elif i == "gem":
        s.blob(PG([(4, 2), (11, 2), (14, 6), (8, 14), (7, 14), (1, 6)]), CYAN, t=1, hi=set())
        s.fill(lit(s, PG([(5, 4), (8, 4), (6, 7), (3, 6)])), CYAN[0])
        s.fill(lit(s, R(2, 6, 13, 6)), CYAN[2])
        s.put((5, 4), W)
    elif i == "stardust":
        spark(s, 6, 7, 3, LEMON)
        spark(s, 12, 3, 1, PINK)
        spark(s, 11, 12, 1, CYAN)
        s.put((3, 13), LEMON[1])
    elif i == "lock":
        s.fill(ARC(7.5, 6, 3.6, 180, 360, 2), STEEL[1])
        s.fill(R(4, 6, 5, 7) | R(11, 6, 12, 7), STEEL[1])
        s.blob(RR(2, 7, 13, 14, 1), LILAC, t=1, hi=set())
        s.fill({(7, 10), (8, 10), (7, 11), (8, 11), (7, 12)}, INK)
    elif i == "check":
        m = PATH([(2, 8), (6, 12), (13, 3)], 2)
        s.blob(grow(m) & R(0, 0, 15, 15), MINT, t=1, hi=set())
    elif i in ("heart_full", "heart_empty"):
        m = {(x * 2 + dx, y * 2 + dy + 2) for (x, y) in HEART(0, 0) for dx in (0, 1) for dy in (0, 1)}
        m = shift(m, 1, 0)
        if i == "heart_full":
            s.blob(m, PINK, t=1, hi={(3, 4), (4, 4), (3, 5)})
        else:
            s.fill(rim(m), PLUM[1])
            s.fill(erode(m), CHAR[2])
    else:   # arrow
        s.blob(PG([(2, 6), (8, 6), (8, 2), (14, 8), (8, 13), (8, 9), (2, 9)]), CYAN, t=1, hi=set())
    return s


# ---------- emotes ----------
def emote(i):
    s = Spr(12, 12)
    bub = RR(0, 0, 11, 9, 3) | {(3, 10), (4, 10), (3, 11)}
    s.blob(bub, SNOW, t=1, hi=set())
    if i == "love":
        s.fill(HEART(2, 2), PINK[1])
        s.put((3, 3), W)
    elif i == "hungry":
        s.fill(E(5.5, 5, 3, 2.6), PEACH[1])
        s.fill(R(4, 1, 5, 2), LEAF[2])
        s.put((4, 4), W)
    elif i == "sleepy":
        s.fill(PATH([(2, 2), (5, 2), (2, 5), (5, 5)]), LILAC[2])
        s.fill(PATH([(7, 5), (9, 5), (7, 7), (9, 7)]), LILAC[1])
    elif i == "music":
        s.fill(R(4, 2, 4, 6) | R(8, 2, 8, 5) | R(4, 2, 8, 2) | R(3, 6, 4, 7) | R(7, 5, 8, 6), TEAL[1])
    elif i == "question":
        s.fill({(4, 2), (5, 1), (6, 1), (7, 2), (7, 3), (6, 4), (5, 5), (5, 7), (6, 5)}, CYAN[3])
        s.put((5, 8), CYAN[3])
    elif i == "exclaim":
        s.fill(R(5, 1, 6, 5), PINK[2])
        s.fill(R(5, 7, 6, 8), PINK[2])
    elif i == "sweat":
        s.fill(PG([(5, 1), (8, 5), (7, 7), (4, 7), (3, 5)]), CYAN[1])
        s.put((5, 4), W)
    else:   # idea
        s.fill(E(5.5, 4, 2.8, 2.8), LEMON[1])
        s.fill(R(5, 7, 6, 8), STEEL[2])
        s.put((5, 3), W)
    return s


# ---------- interface ----------
def frame(fill, edge, glow=None, pressed=False, tail=False):
    s = Spr(24, 24)
    m = RR(0, 0, 23, 23, 4)
    s.fill(m, fill[1])
    s.fill(rim(m), edge)
    inner = rim(erode(m))
    s.fill({p for p in inner if (p[0] < 12 and p[1] < 20) or p[1] < 3}, fill[2] if pressed else fill[0])
    s.fill({p for p in inner if p[1] > 20 or (p[0] > 20 and p[1] > 3)}, fill[0] if pressed else fill[2])
    if glow:
        s.fill({(3, 1), (4, 1), (1, 3), (1, 4), (20, 22), (19, 22), (22, 20), (22, 19)}, glow)
    return s


DIGITS = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"], "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"], "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"], "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["01110", "10000", "11110", "10001", "10001", "10001", "01110"], "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"], "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"], "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "x": ["00000", "10001", "01010", "00100", "01010", "10001", "00000"], ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"], "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"], "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
    "k": ["10000", "10000", "10010", "10100", "11000", "10100", "10010"], "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
}


def digits():
    s = Spr(160, 10)
    for n, ch in enumerate("0123456789+-x.,%!?kM"):
        for j, row in enumerate(DIGITS[ch]):
            for i, bit in enumerate(row):
                if bit == "1":
                    s.put((n * 8 + 1 + i, j + 1), W)
    return s


def ui():
    out = {}
    out["ui/panel.png"] = frame([PLUM[0], PLUM[2], PLUM[3]], PINK[1], CYAN[1])
    out["ui/panel_dark.png"] = frame([NAVY[1], NAVY[3], INK], CYAN[2], PINK[1])
    out["ui/bubble.png"] = frame([W, SNOW[0], SNOW[2]], SNOW[3])
    out["ui/button.png"] = frame([PINK[0], PINK[1], PINK[2]], PINK[3])
    out["ui/button_pressed.png"] = frame([PINK[1], PINK[2], PINK[3]], PINK[3], pressed=True)
    out["ui/button_disabled.png"] = frame([STEEL[1], STEEL[2], STEEL[3]], CHAR[3])
    bar = Spr(48, 8)
    m = RR(0, 0, 47, 7, 2)
    bar.fill(m, SCREEN)
    bar.fill(rim(m), STEEL[2])
    bar.fill({p for p in rim(m) if p[1] == 0 or p[0] == 0}, STEEL[0])
    out["ui/bar_frame.png"] = bar
    fill = Spr(4, 4)
    fill.fill(R(0, 0, 3, 3), MINT[1])
    fill.fill(R(0, 0, 3, 0), MINT[0])
    fill.fill(R(0, 3, 3, 3), MINT[2])
    out["ui/bar_fill.png"] = fill
    for name, ramp, glow in (("common", STEEL, None), ("lucky", CYAN, W), ("jackpot", LEMON, PINK[1])):
        f = Spr(24, 24)
        m = RR(0, 0, 23, 23, 4)
        f.fill(m, SCREEN)
        f.fill(rim(m) | rim(erode(m)), ramp[1])
        f.fill({p for p in rim(m) if p[0] + p[1] < 20}, ramp[0])
        f.fill({p for p in rim(m) if p[0] + p[1] > 30}, ramp[2])
        if glow:
            for p in ((3, 3), (20, 20)) if name == "lucky" else ((3, 3), (20, 3), (3, 20), (20, 20)):
                spark(f, *p, 1, [W, glow, ramp[1]])
        out[f"ui/rarity_{name}.png"] = f
    out["ui/digits.png"] = digits()
    return out


def build():
    out = {}
    for i in ("cap", "beanie", "crown", "wizard", "flower", "headphones", "bow", "straw"):
        out[f"item/hat/{i}.png"] = hat(i)
    for i in ("round_glasses", "shades", "monocle", "star_glasses", "mask"):
        out[f"item/face/{i}.png"] = face(i)
    for i in ("gold_chain", "scarf", "bowtie", "bell", "spiked_collar", "medal"):
        out[f"item/neck/{i}.png"] = neck(i)
    for i in ("book", "lantern", "flag", "balloon", "microphone", "quill"):
        out[f"item/held/{i}.png"] = held(i)
    for i in ("striped", "plain", "dotted", "checked", "star"):
        out[f"item/shirt/{i}.png"] = shirt(i)
    for name, fn in (("oasis", oasis), ("forest", forest), ("shore", shore)):
        for layer, s in fn().items():
            out[f"habitat/{name}/{layer}.png"] = s
    for i in ("flower_red", "flower_blue", "mushroom", "rock_small", "grass_tuft", "lantern_small", "shell", "signpost"):
        out[f"decor/{i}.png"] = decor16(i)
    for i in ("bush", "rock_big", "nest", "bed", "food_bowl", "toy_ball", "bookshelf", "radio", "pond", "campfire", "tent", "lamp_post"):
        out[f"decor/{i}.png"] = decor32(i)
    for i in ("tree_fruit", "fountain", "arch", "statue"):
        out[f"decor/{i}.png"] = decor48(i)
    for i in ("word_sprout", "echo_shell", "page_lantern", "ink_well", "star_loom", "memory_stone"):
        for tier in (1, 2, 3):
            out[f"structure/{i}_{tier}.png"] = structure(i, tier)
    for i in ("food_berry", "food_fish", "food_leaf", "food_spark", "food_crystal", "food_cake", "xp_boost", "incubator", "gift", "key",
              "ticket", "potion", "egg_mystery", "gem", "stardust", "lock", "check", "heart_full", "heart_empty", "arrow"):
        out[f"icon/{i}.png"] = item_icon(i)
    for i in ("love", "hungry", "sleepy", "music", "question", "exclaim", "sweat", "idea"):
        out[f"fx/emote_{i}.png"] = emote(i)
    out.update(ui())
    return out
