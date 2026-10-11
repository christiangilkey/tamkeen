"""Art for what the game has grown into since the first brief (ASSET_LIST.md section 7):
bigger eyes for hatchlings, icons for everything the interface still writes as a symbol or an
emoji, one icon per battle move, and the effects that battles and evolution lack."""

import math
import random

from px import *
from creature import A, LINE, new
from phase2 import item_icon
from world import BOLT, FLAME, lit, spark

GOLD = LEMON


# ---------- hatchling eyes: the same six styles, a size larger (20x10, centred on the eye socket) ----------
BIG_OPEN = {
    "dot": ["........", "........", "...KK...", "..KWNK..", "..KWNK..", "..KNNK..", "..KANK..", "...KK...", "........", "........"],
    "round": ["..KKKK..", ".KWNNNK.", "KWWNNNNK", "KWWNWWNK", "KWWNWWNK", "KWWNNNNK", "KWWNNNNK", "KWWAAANK", ".KWAAAK.", "..KKKK.."],
    "oval": ["..KKKK..", ".KWNNNK.", ".KWNWWK.", ".KWNWWK.", ".KWNNNK.", ".KWNNNK.", ".KWNNNK.", ".KWAAAK.", ".KWAAAK.", "..KKKK.."],
    "sleepy": ["........", "........", "KKKKKKKK", "KKKKKKKK", "KWWNNNNK", "KWWNWWNK", "KWWNNNNK", "KWWAAANK", ".KKKKKK.", "........"],
    "star": ["..KKKK..", ".KAAAAK.", "KAAAWAAK", "KAAAWAAK", "KAWWWWWK", "KAAAWAAK", "KAAAWAAK", "KAAAAAAK", ".KaAAaK.", "..KKKK.."],
    "wide": ["KKK.....", "KWWKK...", "KWWNNKK.", "KWWNWWNK", "KWWNWWNK", "KWWNNNNK", ".KWANNNK", "..KAANK.", "...KKK..", "........"],
}
BIG_SMALL = {"dot"}


def big_eye_rows(style, expr):
    small, wide = style in BIG_SMALL, style == "wide"
    blank = ["........"] * 10
    if expr == "open":
        return BIG_OPEN[style]
    if expr == "blink":
        return [*blank[:4], "........" if small else "K......K", "..KKKK.." if small else ".KKKKKK.", *blank[6:]]
    if expr == "happy":
        if small:
            return [*blank[:4], "...KK...", "..K..K..", *blank[6:]]
        return [*blank[:4], ".KKKKKK.", "K......K", *blank[6:]]
    if expr == "sleepy":
        if small:
            return [*blank[:5], "..KKKK..", *blank[6:]]
        return [*blank[:5], "KKKKKKKK", *blank[6:]]
    if small:   # sad
        return ["........", "....K...", "........", "...KK...", "..KWNK..", "..KNNK..", "..KANK..", "...KK...", "........", "........"]
    rows = [list(r) for r in BIG_OPEN[style]]
    first = next(j for j, r in enumerate(rows) if any(ch != "." for ch in r))
    for j, cut in ((first, 4), (first + 1, 3)):
        for x in range(cut):
            rows[j][x] = "K" if j == first + 1 and rows[j][x] != "." else "."
    return ["".join(r) for r in rows]


def big_eyes(style, expr):
    s = new(20, 10)
    rows = big_eye_rows(style, expr)
    key = {"A": A[0], "a": A[1], "W": W, "K": LINE, "N": LINE}
    for ox, mirrored in ((1, False), (11, expr == "sad")):
        for j, row in enumerate(rows):
            line = row[::-1] if mirrored else row
            for i, ch in enumerate(line):
                if ch != ".":
                    s.put((ox + i, j), key[ch])
    return s


# ---------- small helpers ----------
def stroke(s, m, ramp, glint=None):
    """A flat neon stroke: bright, with its lower part a shade darker."""
    ys = [p[1] for p in m]
    mid = (min(ys) + max(ys)) / 2
    s.fill(m, ramp[1])
    s.fill({p for p in m if p[1] > mid + 1}, ramp[2])
    if glint:
        s.put(glint, W)


def ring(cx, cy, r, t=1.3):
    return E(cx, cy, r, r) - E(cx, cy, r - t, r - t)


def flame(s, ox=0, oy=0, ramp=PEACH, core=LEMON):
    s.blob(shift(PG(FLAME), ox, oy), ramp, t=1)
    c = shift(PG([(8, 7), (10, 10), (9, 13), (7, 13), (6, 10)]), ox, oy)
    s.fill(c, core[1])
    s.fill(erode(c) | {(8 + ox, 11 + oy)}, core[0])


def glyph(s, rows, x, y, c):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == "#":
                s.put((x + i, y + j), c)


# ---------- interface icons (16x16) ----------
def ui_icon(i):
    s = Spr(16, 16)
    if i == "close":
        stroke(s, PATH([(3, 3), (12, 12)], 2) | PATH([(12, 3), (3, 12)], 2), PINK, (3, 3))
    elif i == "star":           # a saved word; a word that is now well known
        s.blob(STAR(7.5, 8, 7.4, 3.2, 5), GOLD, t=1, hi={(6, 5), (7, 5), (6, 6)})
    elif i == "badge":
        s.blob(PG([(3, 1), (7, 1), (8, 8), (5, 8)]), CYAN, t=1, hi=set())
        s.blob(PG([(9, 1), (13, 1), (11, 8), (8, 8)]), PINK, t=1, hi=set())
        s.blob(E(7.5, 10.5, 4.4, 4.4), GOLD, t=1)
        s.put((7, 10), W)
    elif i == "trophy":
        s.fill(ring(3.5, 5, 2.6) | ring(11.5, 5, 2.6), GOLD[2])
        s.blob(PG([(3, 1), (12, 1), (11, 7), (9, 10), (6, 10), (4, 7)]), GOLD, t=1, hi={(5, 3), (5, 4), (6, 3)})
        s.fill(R(7, 10, 8, 12), GOLD[2])
        s.blob(R(4, 13, 11, 15), GOLD, t=1, hi=set())
    elif i == "battle":         # two crossed blades of light
        for a, b, ramp in (((2, 13), (12, 3), CYAN), ((13, 13), (3, 3), PINK)):
            m = PATH([a, b], 2)
            s.fill(m, ramp[1])
            s.fill({p for p in m if p[1] > 9}, ramp[3])
            s.put(b, W)
        s.fill({(7, 8), (8, 8), (7, 7), (8, 7)}, W)
    elif i == "edit":           # a pencil
        s.blob(PG([(4, 9), (10, 3), (13, 6), (7, 12)]), GOLD, t=1, hi=set())
        s.fill(PG([(11, 2), (12, 2), (14, 4), (14, 5)]), PINK[1])
        s.fill({(3, 10), (4, 11), (5, 12), (3, 11), (4, 12), (3, 12)}, SAND[0])
        s.put((2, 13), INK)
    elif i == "evolve":         # two chevrons climbing, and a spark where they are headed
        for y, ramp in ((9, PINK), (5, CYAN)):
            m = PATH([(2, y + 5), (7, y), (8, y), (13, y + 5)], 2)
            s.fill(m, ramp[1])
            s.fill(shift(m, 0, 2) - m, ramp[3])
        spark(s, 7, 2, 1, GOLD)
    elif i == "combo":
        flame(s)
        s.fill({(12, 2), (14, 4), (13, 3), (12, 4), (14, 2)}, CYAN[1])
    elif i == "surge":
        s.dither(ring(7.5, 7.5, 7.6, 1.6), CYAN[1])
        s.blob(PG(BOLT), GOLD, t=1, hi={(8, 3), (7, 4), (6, 5)})
    elif i == "rating":         # stripes of rank under a star
        for y in (7, 11):
            m = PATH([(2, y + 4), (7, y), (8, y), (13, y + 4)], 2)
            s.fill(m, CYAN[1])
            s.fill(shift(m, 0, 1) - m, CYAN[3])
        spark(s, 7, 3, 2, GOLD)
    else:                       # egg
        m = (E(8, 9.4, 5.2, 6) | E(8, 7.4, 4.3, 5.6)) & R(0, 0, 15, 15)
        s.blob(m, LILAC, t=1)
        s.fill({p for p in erode(m) if p[1] == 10}, PINK[1])
        for x in (6, 8, 10):
            s.put((x, 10), W)
    return s


def pip(on):
    s = Spr(8, 8)
    m = E(3.5, 3.5, 3.4, 3.4)
    if on:
        s.blob(m, MINT, t=1, hi={(2, 2)})
    else:
        s.fill(rim(m), STEEL[2])
        s.fill(erode(m), CHAR[2])
    return s


# ---------- tags: how and when the owner studies ----------
def tag_icon(i):
    s = Spr(16, 16)
    if i == "night_owl":
        s.blob(E(7.5, 9, 6.4, 6) | PG([(2, 2), (5, 5), (2, 7)]) | PG([(13, 2), (10, 5), (13, 7)]), NAVY, t=1, hi=set())
        for cx in (5, 10):
            s.fill(E(cx, 8, 2.2, 2.2), GOLD[1])
            s.put((cx, 8), INK)
            s.put((cx - 1, 7), W)
        s.fill({(7, 11), (8, 11), (7, 12)}, PEACH[1])
    elif i == "early_bird":     # the sun just clearing the horizon
        sunm = E(7.5, 11, 5.4, 5.4) & R(0, 0, 15, 10)
        s.blob(sunm, GOLD, t=1, hi={(6, 7), (7, 7)})
        for a in (200, 235, 270, 305, 340):
            x, y = 7.5 + math.cos(math.radians(a)) * 7.5, 11 + math.sin(math.radians(a)) * 7.5
            s.fill(LN(x, y, x + math.cos(math.radians(a)), y + math.sin(math.radians(a))), PEACH[1])
        s.fill(R(1, 11, 14, 12), PINK[1])
        s.fill(R(3, 14, 12, 14), PINK[2])
    elif i == "streak_7":
        flame(s, 0, 0, PINK, GOLD)
        glyph(s, ["###", "..#", ".#.", ".#."], 11, 11, W)
    elif i == "flawless":       # a tick inside an unbroken ring
        s.fill(ring(7.5, 7.5, 7.4, 1.6), GOLD[1])
        s.fill({p for p in ring(7.5, 7.5, 7.4, 1.6) if p[0] + p[1] > 17}, GOLD[2])
        stroke(s, PATH([(4, 8), (7, 11), (12, 4)], 2), MINT, (12, 4))
    else:                       # comeback: an arrow that dips and comes back up
        m = PATH([(2, 3), (2, 9), (6, 12), (10, 9), (10, 5)], 2)
        s.fill(m, CYAN[1])
        s.fill({p for p in m if p[1] > 9}, CYAN[2])
        s.blob(PG([(7, 6), (11, 1), (15, 6)]), PINK, t=1, hi=set())
    return s


# ---------- forms: the three adult forms and the three special ones ----------
def form_icon(i):
    s = Spr(16, 16)
    if i == "echo":
        s.blob(E(3.5, 8, 2.2, 2.2), CYAN, t=1, hi=set())
        for r, c in ((5, CYAN[0]), (8, CYAN[1]), (11, CYAN[2])):
            s.fill(ARC(3, 8, r, -55, 55), c)
    elif i == "sage":           # a scroll, part unrolled
        s.blob(RR(3, 3, 12, 13, 1), SNOW, t=1, hi=set())
        s.blob(R(2, 1, 13, 3) | R(2, 13, 13, 15), LILAC, t=1, hi=set())
        for y, n in ((5, 6), (7, 4), (9, 6), (11, 3)):
            s.fill(R(5, y, 5 + n - 1, y), LILAC[2])
    elif i == "keeper":         # a cluster of crystals
        s.blob(PG([(2, 14), (3, 7), (5, 4), (7, 8), (7, 14)]), PINK, t=1)
        s.blob(PG([(7, 14), (7, 5), (10, 1), (13, 6), (13, 14)]), CYAN, t=1)
        s.fill({(9, 4), (9, 5), (4, 7)}, W)
    elif i == "twin":           # two rings, linked
        s.fill(ring(5.5, 8, 4.6, 1.7), PINK[1])
        s.fill(ring(10.5, 8, 4.6, 1.7), CYAN[1])
        s.fill(ring(5.5, 8, 4.6, 1.7) & {p for p in R(0, 8, 15, 15)}, PINK[1])
        s.put((5, 4), W)
        s.put((10, 4), W)
    elif i == "nocturne":
        s.blob(E(7.5, 7.5, 7.2, 7.2), NAVY, t=1, hi=set())
        s.fill(E(7.5, 7.5, 4.4, 4.4) - E(9.5, 6, 3.8, 3.8), GOLD[1])
        s.put((5, 6), GOLD[0])
        s.put((11, 4), W)
        s.put((12, 10), LILAC[0])
    else:                       # champion
        s.blob(PG([(2, 13), (1, 4), (5, 8), (8, 2), (11, 8), (15, 4), (14, 13)]), GOLD, t=1, hi={(4, 10), (5, 10)})
        for x, c in ((5, PINK), (8, CYAN), (11, PINK)):
            s.led(x, 11, c)
        for p in ((1, 4), (8, 2), (15, 4)):
            s.put(p, W)
    return s


# ---------- habits ----------
def trait_icon(i):
    s = Spr(16, 16)
    if i == "listener":         # a speaker cone and the sound coming off it
        s.blob(PG([(1, 6), (4, 6), (8, 2), (8, 13), (4, 9), (1, 9)]), MINT, t=1, hi=set())
        for r, c in ((3, MINT[0]), (6, MINT[1])):
            s.fill(ARC(8, 7.5, r, -50, 50), c)
    elif i == "reader":         # an open book
        s.blob(PG([(1, 3), (7, 5), (7, 14), (1, 12)]), SNOW, t=1, hi=set())
        s.blob(PG([(8, 5), (14, 3), (14, 12), (8, 14)]), SNOW, t=1, hi=set())
        for y in (7, 9):
            s.fill({(3, y), (4, y), (5, y + 1), (10, y + 1), (11, y), (12, y)}, LILAC[2])
        s.fill(R(7, 5, 8, 14), PINK[2])
    elif i == "collector":      # a chest with something bright in it
        s.blob(R(2, 7, 13, 14), WOOD, t=1, hi=set())
        s.blob(RR(2, 3, 13, 8, 2), WOOD, t=1, hi=set())
        s.fill(R(2, 8, 13, 8), GOLD[2])
        s.fill(R(7, 7, 8, 10), GOLD[1])
        s.put((7, 7), W)
    else:                       # curious: a magnifying glass
        s.fill(PATH([(9, 9), (13, 13)], 2), WOOD[1])
        s.fill(ring(6, 6, 5.2, 1.6), CYAN[1])
        s.fill({p for p in ring(6, 6, 5.2, 1.6) if p[0] + p[1] > 13}, CYAN[2])
        s.fill(E(6, 6, 3.4, 3.4), NAVY[2])
        s.fill({(4, 4), (5, 4), (4, 5)}, W)
    return s


# ---------- weekly rules ----------
def rule_icon(i):
    s = Spr(16, 16)
    frame = ring(7.5, 7.5, 7.5, 1.4)

    def dots(cols):
        for (x, y), c in zip(((7.5, 4.6), (4.6, 9.8), (10.4, 9.8)), cols):
            s.blob(E(x, y, 2.3, 2.3), c, t=1, hi=set())

    if i == "open":
        s.fill(frame, STEEL[1])
        dots([PINK, CYAN, GOLD])
    elif i == "warm":
        s.fill(frame, PEACH[1])
        dots([PEACH, GOLD, STEEL])
    elif i == "cool":
        s.fill(frame, CYAN[1])
        dots([CYAN, MINT, LILAC])
    elif i == "starters":       # a small egg with a shoot
        s.fill(frame, MINT[2])
        s.blob(E(7.5, 10, 3.4, 4) & R(0, 0, 15, 13), LILAC, t=1)
        s.fill(LN(7, 6, 7, 3) | {(8, 3), (9, 2), (6, 4), (5, 3)}, MINT[1])
    elif i == "no_heal":        # the healing cross, struck through
        s.blob(R(6, 3, 9, 12) | R(3, 6, 12, 9), MINT, t=1, hi=set())
        s.fill(frame, PINK[1])
        s.fill(PATH([(3, 3), (12, 12)], 2), PINK[1])
    else:                       # solo
        s.fill(frame, CYAN[1])
        glyph(s, [".##.", "###.", ".##.", ".##.", ".##.", ".##.", "####"], 6, 4, W)
    return s


# ---------- navigation ----------
def nav_icon(i):
    s = Spr(16, 16)
    if i == "shop":             # a carrier bag
        s.fill(ARC(7.5, 5, 3.2, 180, 360), STEEL[0])
        s.blob(PG([(3, 5), (12, 5), (14, 15), (1, 15)]), PINK, t=1, hi=set())
        s.blob(E(7.5, 10.5, 2.4, 2.4), GOLD, t=1, hi=set())
    elif i == "wardrobe":       # a hanger
        s.fill(PATH([(8, 4), (8, 6), (2, 11), (13, 11), (8, 6)]), CYAN[1])
        s.fill(R(2, 11, 13, 12), CYAN[2])
        s.fill(ARC(8, 3, 1.6, 150, 400), STEEL[0])
    elif i == "roster":         # a paw print
        s.blob(E(7.5, 10.5, 4.2, 3.6), MINT, t=1, hi=set())
        for x, y in ((3, 5.5), (7.5, 3.5), (12, 5.5)):
            s.blob(E(x, y, 1.9, 2.2), MINT, t=1, hi=set())
    elif i == "badges":
        s.blob(PG([(2, 2), (13, 2), (13, 8), (8, 14), (7, 14), (2, 8)]), LILAC, t=1, hi=set())
        s.fill(STAR(7.5, 7, 3.6, 1.5, 5), GOLD[1])
        s.put((7, 6), W)
    else:                       # habitat: a tree under a lamp
        s.fill(R(7, 9, 8, 15), WOOD[1])
        s.blob(E(7.5, 6, 5.6, 5), TREE, t=1, hi=set())
        s.led(5, 5, PINK)
        s.led(10, 7, CYAN)
        s.fill(R(2, 15, 13, 15), LEAF[2])
    return s


# ---------- planned: the idle layer and play with friends ----------
def planned_icon(i):
    s = Spr(16, 16)
    if i == "glow":             # what the structures produce
        s.dither(E(7.5, 7.5, 7.4, 7.4), CYAN[2])
        s.blob(E(7.5, 7.5, 4.4, 4.4), [W, CYAN[0], CYAN[1], CYAN[2]], t=1, hi={(6, 6), (7, 6), (6, 7)})
    elif i == "release":        # letting a grown creature go: a gate of light and the way up
        s.fill(ring(7.5, 9, 6.4, 1.6) & R(0, 0, 15, 14), LILAC[1])
        s.fill(R(1, 14, 14, 15), LILAC[2])
        s.blob(PG([(7, 2), (11, 7), (9, 7), (9, 12), (6, 12), (6, 7), (4, 7), (8, 2)]), [W, MINT[0], MINT[1], MINT[3]], t=1, hi=set())
    elif i == "trade":
        s.blob(PG([(2, 3), (10, 3), (10, 1), (14, 5), (10, 8), (10, 6), (2, 6)]), PINK, t=1, hi=set())
        s.blob(PG([(13, 10), (5, 10), (5, 8), (1, 12), (5, 15), (5, 13), (13, 13)]), CYAN, t=1, hi=set())
    elif i == "rival":          # two marks squaring up
        stroke(s, PATH([(1, 3), (5, 8), (1, 12)], 2), PINK)
        stroke(s, PATH([(13, 3), (9, 8), (13, 12)], 2), CYAN)
        spark(s, 7, 8, 1, GOLD)
    elif i == "defence":        # a shield over a team of three
        s.blob(PG([(2, 1), (13, 1), (13, 7), (8, 12), (7, 12), (2, 7)]), STEEL, t=1, hi=set())
        s.fill(lit(s, R(4, 3, 5, 6)), STEEL[0])
        for x in (3, 7, 11):
            s.fill(R(x, 14, x + 1, 15), MINT[1])
    elif i == "raid":           # a horned mask
        s.blob(PG([(1, 1), (5, 5), (10, 5), (14, 1), (13, 9), (8, 14), (7, 14), (2, 9)]), PLUM, t=1, hi=set())
        s.fill({(4, 7), (5, 7), (5, 8), (10, 7), (11, 7), (10, 8)}, PINK[1])
        s.fill({(4, 7), (11, 7)}, PINK[0])
        s.fill(R(6, 11, 9, 11), INK)
    else:                       # clock: what was made while you were away
        s.blob(E(7.5, 7.5, 7.2, 7.2), NAVY, t=1, hi=set())
        s.fill(ring(7.5, 7.5, 6, 1), CYAN[2])
        s.fill(R(7, 3, 7, 8) | R(7, 8, 11, 8), CYAN[0])
        s.put((7, 8), W)
    return s


def plot():
    """An empty building plot: turned earth, marked out at the corners."""
    s = Spr(32, 32)
    m = E(15.5, 27, 14, 4)
    s.blob(m, [PLUM[1], PLUM[2], PLUM[3], INK], t=1, hi=set(), sel=False)
    for x in (4, 26):
        s.fill(R(x, 19, x + 1, 27), CHAR[0])
        s.led(x, 18, CYAN)
    s.dither(R(6, 21, 25, 21), CYAN[2])
    s.fill(R(14, 25, 17, 28) & m, CYAN[2])
    s.fill(R(15, 24, 16, 29) & m | R(13, 26, 18, 27) & m, CYAN[1])
    return s


def slot_empty():
    s = Spr(24, 24)
    m = RR(0, 0, 23, 23, 4)
    s.fill(m, SCREEN)
    s.fill({p for p in rim(m) if (p[0] + p[1]) % 4 < 2}, STEEL[2])
    s.fill(R(11, 8, 12, 15) | R(8, 11, 15, 12), STEEL[2])
    return s


# ---------- one icon per battle move ----------
def rock(s, pts, glow=False):
    s.blob(PG(pts), STEEL, t=1)
    if glow:
        s.put(pts[0], CYAN[1])


def move_icon(i):
    s = Spr(16, 16)
    if i == "tackle":           # an impact
        s.blob(STAR(7.5, 7.5, 7.4, 3.6, 8), SNOW, t=1, hi=set())
        s.fill(E(7.5, 7.5, 2, 2), W)
        s.fill({(1, 1), (14, 1), (1, 14), (14, 14)}, STEEL[1])
    elif i == "guard":          # a dome of light
        dome = E(7.5, 12, 7.2, 9.5) & R(0, 0, 15, 12)
        s.fill(dome - erode(dome, 2), CYAN[1])
        s.dither(erode(dome, 2), CYAN[3])
        s.fill(ARC(7.5, 12, 6, 200, 250), W)
        s.fill(R(0, 13, 15, 13), CYAN[2])
    elif i == "cinder":
        flame(s, 0, 2)
        s.erase({p for p in s.px if p[1] < 5 and p[0] > 10})
        s.fill({(12, 2), (13, 4), (3, 3)}, GOLD[1])
    elif i == "wildfire":
        s.blob(shift(PG(FLAME), -4, 2) & R(0, 0, 15, 15), PINK, t=1)
        s.blob(shift(PG(FLAME), 4, 2) & R(0, 0, 15, 15), PINK, t=1)
        flame(s, 0, 0)
    elif i == "vine":           # a whip of vine, curling
        m = PATH([(1, 13), (5, 9), (10, 10), (13, 6), (11, 3), (8, 4)], 2)
        s.fill(m, MINT[1])
        s.fill(shift(m, 0, 1) - m, LEAF[3])
        s.blob(E(4, 5, 2.4, 1.6), LEAF, t=1, hi=set())
        s.put((8, 4), W)
    elif i == "overgrowth":
        for pts in ([(1, 14), (2, 7), (6, 4), (8, 9), (6, 14)], [(8, 14), (9, 5), (13, 1), (15, 7), (13, 14)], [(4, 15), (6, 10), (10, 9), (12, 13), (9, 15)]):
            s.blob(PG(pts), LEAF if pts[0][0] != 4 else MINT, t=1)
        s.fill({(4, 7), (11, 4)}, W)
    elif i == "pebble":
        rock(s, [(1, 14), (2, 10), (5, 9), (7, 12), (6, 14)])
        rock(s, [(8, 13), (9, 9), (12, 8), (14, 11), (13, 13)])
        rock(s, [(5, 7), (6, 4), (9, 3), (10, 6), (8, 8)], True)
    elif i == "rockslide":
        rock(s, [(1, 15), (2, 9), (7, 7), (10, 11), (9, 15)])
        rock(s, [(8, 8), (9, 3), (13, 2), (15, 6), (13, 9)], True)
        for x, y in ((3, 2), (6, 1), (12, 11)):
            s.fill(LN(x, y, x + 1, y + 3), STEEL[1])
    elif i == "zap":
        s.blob(shift(PG(BOLT), 0, 0), GOLD, t=1, hi={(8, 3), (7, 4)})
        s.fill({(13, 2), (2, 13)}, CYAN[1])
    elif i == "thunderclap":
        for r, c in ((6, CYAN[1]), (8, CYAN[2])):
            s.dither(ARC(7.5, 7.5, r, 150, 210) | ARC(7.5, 7.5, r, -30, 30), c)
        s.blob(PG(BOLT), GOLD, t=1, hi={(8, 3), (7, 4), (6, 5)})
    elif i == "splash":
        s.blob(E(7.5, 10.4, 4.6, 4.2) | PG([(7, 3), (11, 9), (4, 9)]), CYAN, t=1, hi={(6, 9), (6, 10)})
        for p in ((2, 5), (13, 6), (12, 2)):
            s.led(*p, [CYAN[0], CYAN[2]])
    elif i == "riptide":        # a wave curling over
        m = E(8, 9, 7, 6) & R(0, 0, 15, 14)
        s.blob(m, CYAN, t=1, hi=set())
        s.erase(E(10.5, 9.5, 3.4, 3) | R(9, 10, 15, 14))
        s.fill({p for p in s.px if p[1] <= 4}, W)
        s.fill(R(0, 14, 15, 15), CYAN[2])
        s.fill({(1, 14), (5, 14), (9, 14), (13, 14)}, CYAN[0])
    elif i == "shade":          # a patch of dark with one eye in it
        s.blob(E(7.5, 8, 7, 6) | PG([(2, 12), (4, 15), (6, 12)]) | PG([(9, 12), (11, 15), (13, 12)]), [LILAC[2], LILAC[3], INK, INK], t=1, hi=set())
        s.fill(R(5, 7, 10, 8), PINK[1])
        s.fill(R(7, 7, 8, 8), W)
    elif i == "nightfall":
        s.blob(E(7.5, 7.5, 7.4, 7.4), NAVY, t=1, hi=set())
        s.fill(E(6.5, 6.5, 3.6, 3.6) - E(8.2, 5.4, 3.2, 3.2), LILAC[0])
        for x, y in ((11, 5), (9, 10), (12, 9)):
            s.fill(LN(x, y, x - 1, y + 2), PINK[1])
            s.put((x - 1, y + 2), W)
    elif i == "bounce_back":    # down, and back up higher
        m = PATH([(1, 4), (3, 12), (6, 13), (9, 9), (11, 3)], 2)
        s.fill(m, MINT[2])
        s.blob(E(11.5, 3.5, 3, 3), MINT, t=1)
        s.fill(R(2, 14, 8, 14), MINT[3])
    elif i == "focus":          # crosshairs closing on a point
        s.fill(ring(7.5, 7.5, 6.6, 1.4), CYAN[1])
        for m in (R(7, 0, 8, 3), R(7, 12, 8, 15), R(0, 7, 3, 8), R(12, 7, 15, 8)):
            s.fill(m, CYAN[0])
        s.fill(R(7, 7, 8, 8), W)
    elif i == "charge":         # horns down, moving fast
        s.blob(PG([(6, 3), (15, 8), (6, 12), (9, 8)]), PEACH, t=1, hi=set())
        s.fill({(15, 8), (14, 8)}, W)
        for y, x0, n in ((4, 1, 4), (8, 0, 6), (12, 2, 3)):
            s.fill(R(x0, y, x0 + n, y), PEACH[2])
    elif i == "tailwind":
        for y, x1, c in ((3, 10, CYAN[0]), (7, 13, CYAN[1]), (11, 9, CYAN[2])):
            s.fill(R(1, y, x1, y), c)
            s.fill(ARC(x1, y - 1.5, 1.5, -90, 120), c)
        s.fill({(3, 5), (6, 9), (4, 13)}, W)
    elif i == "resonance":      # rings ringing out
        for r, c in ((2, W), (4.5, PINK[0]), (7, PINK[1])):
            s.fill(ring(7.5, 7.5, r, 1.2), c)
        s.dither(ring(7.5, 7.5, 7.6, 0.9), PINK[2])
    elif i == "insight":        # an eye opening
        eye = E(7.5, 7.5, 7.4, 4.6)
        s.blob(eye, LILAC, t=1, hi=set())
        s.fill(E(7.5, 7.5, 3, 3), SNOW[0])
        s.fill(E(7.5, 7.5, 1.6, 1.6), INK)
        s.put((6, 6), W)
        for x in (3, 7, 12):
            s.fill(LN(x, 1, x, 2), LILAC[1])
    elif i == "hoard":          # a heap of bright things
        for cx, cy, c in ((4, 12, GOLD), (11, 12, GOLD), (7.5, 9, GOLD), (7.5, 13, GOLD)):
            s.blob(E(cx, cy, 3.2, 2.2), c, t=1, hi=set())
        s.blob(PG([(7, 1), (10, 4), (7, 8), (5, 4)]), PINK, t=1, hi=set())
        s.put((7, 3), W)
    elif i == "night_strike":   # three claw marks across a moon
        s.fill(E(7.5, 7.5, 6.4, 6.4) - E(10, 6, 5.4, 5.4), LILAC[1])
        for k in range(3):
            m = PATH([(5 + k * 4, 2), (2 + k * 4, 13)], 2)
            s.fill(m, PINK[1])
            s.put((5 + k * 4, 2), W)
    elif i == "dawn_ray":       # a shaft of first light
        beam = PG([(0, 15), (4, 15), (15, 3), (15, 0), (12, 0)])
        s.fill(beam, GOLD[1])
        s.fill(PG([(1, 15), (3, 15), (15, 2), (14, 0)]), GOLD[0])
        s.dither(PG([(4, 15), (8, 15), (15, 7), (15, 3)]), PEACH[1])
        spark(s, 12, 3, 1, [W, W, GOLD[0]])
    elif i == "steady_heart":   # a heart with a steady beat running through it
        m = {(x * 2 + dx, y * 2 + dy + 2) for (x, y) in HEART(0, 0) for dx in (0, 1) for dy in (0, 1)}
        s.blob(shift(m, 1, 0), PINK, t=1, hi=set())
        s.fill(PATH([(1, 8), (5, 8), (6, 5), (8, 11), (10, 8), (14, 8)]), W)
    elif i == "second_wind":    # breath coming back
        for y, x0, x1, c in ((4, 2, 9, MINT[0]), (8, 4, 13, MINT[1]), (12, 1, 8, MINT[2])):
            s.fill(R(x0, y, x1, y), c)
            s.fill(ARC(x1, y - 1.5, 1.5, -90, 120), c)
        s.blob(R(11, 10, 12, 15) | R(9, 12, 14, 13), [W, MINT[0], MINT[1], MINT[3]], t=1, hi=set(), line=False)
    else:                       # perfect_form
        s.fill(ring(7.5, 7.5, 7.5, 1.4), GOLD[2])
        s.blob(STAR(7.5, 7.8, 5.6, 2.4, 5), GOLD, t=1, hi={(7, 5), (6, 6)})
        for p in ((2, 2), (13, 2), (13, 13)):
            s.put(p, W)
    return s


MOVES = ["tackle", "guard", "cinder", "wildfire", "vine", "overgrowth", "pebble", "rockslide", "zap", "thunderclap", "splash", "riptide",
         "shade", "nightfall", "bounce_back", "focus", "charge", "tailwind", "resonance", "insight", "hoard", "night_strike", "dawn_ray",
         "steady_heart", "second_wind", "perfect_form"]


# ---------- effects ----------
def evolve():
    """Light drawn in to a point, then thrown back out: four frames gathering, four bursting."""
    frames = []
    rnd = random.Random(5)
    bits = [(rnd.uniform(0, 6.28), rnd.uniform(0.6, 1.0)) for _ in range(14)]
    for i in range(8):
        f = Spr(64, 64, grit=False)
        c = 31.5
        if i < 4:
            r = 28 - i * 7
            f.fill(ARC(c, c, r, 0, 360, 2), [PINK[1], CYAN[1], PINK[0], W][i])
            f.dither(ARC(c, c, r + 4, 0, 360), CYAN[2])
            for a, k in bits:
                rr = (r + 6) * k
                x, y = c + math.cos(a + i * 0.5) * rr, c + math.sin(a + i * 0.5) * rr
                f.fill(R(round(x), round(y), round(x) + 1, round(y) + 1), [CYAN[1], PINK[1], GOLD[1]][int(a * 10) % 3])
            f.fill(E(c, c, 2 + i * 2.2, 2 + i * 2.2), W)
            f.fill(rim(E(c, c, 2 + i * 2.2, 2 + i * 2.2)), CYAN[0])
        else:
            t = (i - 3) / 4
            core = E(c, c, 9 * (1 - t) + 1, 9 * (1 - t) + 1)
            f.fill(core, W)
            band = ARC(c, c, 8 + t * 20, 0, 360, 2 if t < 0.6 else 1)
            (f.fill if t < 0.6 else f.dither)(band, PINK[1] if t < 0.5 else PINK[2])
            for k in range(12):
                a = k * math.pi / 6 + 0.26
                rr = 10 + t * 20
                spark(f, c + math.cos(a) * rr, c + math.sin(a) * rr, 3 - int(t * 3.2) if k % 2 == 0 else max(0, 2 - int(t * 3.2)), [GOLD, CYAN, PINK][k % 3])
            for a, k in bits:
                rr = (6 + t * 26) * k
                x, y = c + math.cos(a) * rr, c + math.sin(a) * rr - t * 3
                f.put((round(x), round(y)), [CYAN[0], PINK[0], GOLD[0]][int(a * 10) % 3])
        frames.append(f)
    return strip(frames)


def ready():
    """The shimmer around a creature that is ready to evolve."""
    frames = []
    spots = [(5, 8), (25, 5), (8, 24), (26, 22), (15, 2), (2, 16), (29, 13)]
    for i in range(4):
        f = Spr(32, 32)
        for k, (x, y) in enumerate(spots):
            size = [0, 1, 2, 1][(i + k) % 4]
            spark(f, x, y - (i + k) % 4, size, [GOLD, CYAN, PINK][k % 3])
        frames.append(f)
    return strip(frames)


def surge():
    """A crackling charge around a creature whose next move is doubled."""
    frames = []
    rnd = random.Random(9)
    for i in range(6):
        f = Spr(48, 48, grit=False)
        c = 23.5
        f.dither(ARC(c, c, 20, 0, 360), CYAN[2], i % 2)
        for k in range(5):
            a = rnd.uniform(0, 6.28)
            pts = []
            for step in range(5):
                r = 12 + step * 2.6
                wob = rnd.uniform(-0.32, 0.32)
                pts.append((round(c + math.cos(a + wob) * r), round(c + math.sin(a + wob) * r)))
            bolt = PATH(pts)
            f.fill(bolt, GOLD[1] if k % 2 else CYAN[1])
            f.put(pts[-1], W)
            f.put(pts[0], W)
        for k in range(4):
            a = i * 0.9 + k * 1.57
            spark(f, c + math.cos(a) * 21, c + math.sin(a) * 21, 1, GOLD)
        frames.append(f)
    return strip(frames)


def combo_fire():
    frames = []
    shapes = [[(8, 2), (11, 6), (12, 4), (14, 9), (12, 14), (4, 14), (2, 9), (4, 10), (5, 6)],
              [(7, 1), (10, 6), (13, 5), (13, 10), (12, 14), (4, 14), (2, 10), (5, 9), (5, 5)],
              [(9, 2), (11, 7), (13, 6), (14, 11), (12, 14), (4, 14), (2, 8), (5, 10), (6, 5)],
              [(8, 3), (10, 5), (12, 3), (13, 9), (12, 14), (4, 14), (3, 10), (5, 8), (6, 6)]]
    for pts in shapes:
        f = Spr(16, 16)
        m = PG(pts)
        f.blob(m, PEACH, t=1, hi=set())
        core = erode(m, 3) | {(8, 12), (7, 12)}
        f.fill(core, GOLD[1])
        f.fill(erode(core) | {(8, 13)}, GOLD[0])
        f.put((pts[0][0] + 2, pts[0][1] - 1), GOLD[1])
        frames.append(f)
    return strip(frames)


def faint():
    """A beaten creature coming apart into pixels that drift up and go out."""
    frames = []
    rnd = random.Random(13)
    bits = [(rnd.randint(8, 23), rnd.randint(12, 28), rnd.uniform(0.6, 1.6), rnd.choice((1, 1, 2))) for _ in range(22)]
    for i in range(5):
        f = Spr(32, 32)
        for k, (x, y, v, size) in enumerate(bits):
            yy = round(y - i * v * 3.2)
            if yy < 0 or (i == 4 and k % 2):
                continue
            c = [CYAN[1], NAVY[0], LILAC[1], CYAN[2]][k % 4] if i < 3 else [CYAN[2], NAVY[1], LILAC[2]][k % 3]
            f.fill(R(x + (i * (k % 3 - 1)), yy, x + (i * (k % 3 - 1)) + (size if i < 3 else 1) - 1, yy + (size if i < 3 else 1) - 1), c)
        if i == 0:
            f.dither(E(15.5, 22, 9, 8), CYAN[2])
        frames.append(f)
    return strip(frames)


def glance():
    """A hit that only grazes: a short pale scrape."""
    frames = []
    for i in range(4):
        f = Spr(32, 32)
        a0 = 200 + i * 12
        arc = ARC(18, 20, 11, a0, a0 + 46 - i * 8, 2 if i < 2 else 1)
        (f.fill if i < 3 else f.dither)(arc, SNOW[1] if i < 2 else SNOW[2])
        if i < 2:
            f.fill(ARC(18, 20, 11, a0 + 6, a0 + 20), W)
        for k in range(3):
            f.put((9 + k * 5 - i, 9 + (k % 2) * 3 - i), STEEL[0])
        frames.append(f)
    return strip(frames)


def shadow(w, h):
    """The dark patch under a creature: solid in the middle, broken at the edge."""
    s = Spr(w, h)
    cx, cy = (w - 1) / 2, (h - 1) / 2
    s.dither(E(cx, cy, w / 2, h / 2), INK)
    s.fill(E(cx, cy, w / 2 - 2.5, max(0.8, h / 2 - 1.2)), INK)
    return s


def rain():
    """Rain for a wet night: a tile of slanting streaks that repeats without a seam."""
    s = Spr(32, 32)
    for x, y, n, c in ((3, 2, 4, CYAN[2]), (14, 9, 5, LILAC[2]), (25, 4, 3, CYAN[2]), (8, 20, 5, CYAN[2]), (20, 24, 4, LILAC[2]), (29, 16, 4, CYAN[2]), (1, 13, 3, LILAC[2])):
        for k in range(n):
            s.put(((x - k // 2) % 32, (y + k) % 32), c)
        s.put((x % 32, y % 32), CYAN[1])
    return s


def build():
    out = {}
    for st in BIG_OPEN:
        for ex in ("open", "blink", "happy", "sad", "sleepy"):
            out[f"creature/eyes_big/{st}_{ex}.png"] = big_eyes(st, ex)
    for i in ("close", "star", "badge", "trophy", "battle", "edit", "evolve", "combo", "surge", "rating", "egg"):
        out[f"icon/{i}.png"] = ui_icon(i)
    out["ui/pip_on.png"] = pip(True)
    out["ui/pip_off.png"] = pip(False)
    out["ui/slot_empty.png"] = slot_empty()
    for i in ("night_owl", "early_bird", "streak_7", "flawless", "comeback"):
        out[f"icon/tag_{i}.png"] = tag_icon(i)
    for i in ("echo", "sage", "keeper", "twin", "nocturne", "champion"):
        out[f"icon/form_{i}.png"] = form_icon(i)
    for i in ("listener", "reader", "collector", "curious"):
        out[f"icon/trait_{i}.png"] = trait_icon(i)
    for i in ("open", "starters", "no_heal", "warm", "cool", "solo"):
        out[f"icon/rule_{i}.png"] = rule_icon(i)
    for i in ("shop", "wardrobe", "roster", "badges", "habitat"):
        out[f"icon/nav_{i}.png"] = nav_icon(i)
    for i in ("glow", "release", "trade", "rival", "defence", "raid", "clock"):
        out[f"icon/{i}.png"] = planned_icon(i)
    for i in MOVES:
        out[f"icon/move/{i}.png"] = move_icon(i)
    out["structure/plot.png"] = plot()
    out["fx/evolve.png"] = evolve()
    out["fx/ready.png"] = ready()
    out["fx/surge.png"] = surge()
    out["fx/combo_fire.png"] = combo_fire()
    out["fx/question.png"] = grid(["..LLLL..", ".LL..LL.", ".....LL.", "....LL..", "...LL...", "........", "...LL...", "........"], {"L": LILAC[1]})
    out["fx/spark.png"] = grid(["...C....", "...C....", "..cCc...", "CCCWCCC.", "..cCc...", "...C....", "...C....", "........"], {"C": CYAN[1], "c": CYAN[2], "W": W})
    out["battle/faint.png"] = faint()
    out["battle/glance.png"] = glance()
    out["fx/shadow_s.png"] = shadow(16, 4)
    out["fx/shadow_m.png"] = shadow(24, 5)
    out["fx/shadow_l.png"] = shadow(36, 6)
    out["habitat/rain.png"] = rain()
    return out
