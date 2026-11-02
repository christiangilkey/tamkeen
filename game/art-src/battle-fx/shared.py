"""Effects every creature uses, whatever its element: guard, heal, power, charge, delay, interrupt,
terrain change, faint, footstep dust and the "failed" puff."""
import math
import random

import numpy as np

from fxkit import XY, Img, bands, clean, cloud, dil, ell, ero, glossy, line, ring, sparkle, stamp, thin_alpha, tone, tongue

GUARD = ["#0c1a30", "#1d4670", "#3a82b2", "#6cc2e2", "#b6ecff", "#ffffff"]
GOLD = ["#3e2806", "#8a5e10", "#d6a22a", "#ffd866", "#fff4c0", "#ffffff"]
HEAL = ["#08281c", "#137448", "#28b874", "#78eeac", "#d0ffe6", "#ffffff"]
POW = ["#36060e", "#86101e", "#dc2a28", "#ff7a2a", "#ffc23c", "#fff3a8", "#ffffff"]
TIME = ["#141a40", "#2c3a8a", "#5a78d0", "#9ab8f4", "#dfe8ff", "#ffffff"]
BREAK = ["#2e0808", "#8e1414", "#f03424", "#ffb028", "#fff09a", "#ffffff"]
SMOKE = ["#2c2838", "#565068", "#86809c", "#b8b4c8", "#e6e4ee"]
DUSTC = ("#5a4c3c", "#86765e", "#a8977a", "#c8b898", "#e4d8bc")
GREY = ("#4e4e5a", "#84848f", "#acacb6", "#d2d2da", "#f2f2f5")


def star(img, x, y, size, cols):
    sparkle(img, x, y, size, cols)


def hexgrid(w, h, a=3.6, ox=0.0, oy=0.0):
    """Distance to the nearest hex-cell border (pointy-top hexes, inradius a)."""
    X, Y = XY(w, h)
    best = np.full(X.shape, 1e9)
    edge = np.zeros(X.shape)
    dx_step = 2 * a
    dy_step = a * math.sqrt(3)
    for j in range(-2, int(h / dy_step) + 3):
        for i in range(-2, int(w / dx_step) + 3):
            cx = i * dx_step + (a if j % 2 else 0) + ox
            cy = j * dy_step + oy
            d2 = (X - cx) ** 2 + (Y - cy) ** 2
            closer = d2 < best
            best = np.where(closer, d2, best)
            ddx, ddy = np.abs(X - cx), np.abs(Y - cy)
            hd = np.maximum(ddx, ddx * 0.5 + ddy * 0.866)
            edge = np.where(closer, hd, edge)
    return a - edge  # 0 on a border, a in a cell's middle


# ---------- guard: a hex-cell barrier bubble ----------

def guard():
    out = []
    W, c, Rr = 48, 24, 21
    grid = hexgrid(W, W, 3.6, 1, 2)
    X, Y = XY(W)
    dist = np.hypot(X - c, Y - c)
    for k in range(6):
        img = Img(W)
        if k == 0:  # a point of light and a ring snapping open
            band = ring(X, Y, c, c, 9, 9, 0.8)
            img.paint(band > 0.3, GUARD[3])
            star(img, c, c, 4, (GUARD[3], GUARD[4], GUARD[5]))
            for a in range(6):
                img.px(c + 13 * math.cos(a * math.pi / 3), c + 13 * math.sin(a * math.pi / 3), GUARD[4])
            out.append(img)
            continue
        r = {1: 17, 2: Rr, 3: Rr, 4: Rr, 5: Rr + 1}[k]
        inside = dist < r
        rim = (dist >= r - 1.6) & (dist < r)
        lattice = inside & (grid < 0.55) & (dist > r * 0.55)  # cells show toward the edge, clear in the middle
        if k == 1:
            lattice &= (np.sin(np.arctan2(Y - c, X - c) * 3) > 0)  # cells still forming
        if k == 3:  # a band of light sweeping across the cells
            sweep = np.abs((X - c) + (Y - c) * 0.6 - 2) < 4
            img.paint(inside & (grid < 0.55) & sweep, GUARD[4])
        if k == 5:  # it breaks up into flying hex shards
            for i in range(10):
                a = i * 2 * math.pi / 10 + 0.3
                x, y = c + (r - 3) * math.cos(a), c + (r - 3) * math.sin(a)
                stamp(img, x, y, [".a.", "aba", "aba", ".a."], {"a": GUARD[2], "b": GUARD[4]})
            for i in range(6):
                a = i * 2 * math.pi / 6
                star(img, c + 9 * math.cos(a + 0.5), c + 9 * math.sin(a + 0.5), 2, (GUARD[3], GUARD[4], GUARD[5]))
            out.append(img)
            continue
        img.paint(lattice, GUARD[3] if k != 4 else GUARD[2])
        if k == 4:  # flickering out: the rim breaks into dashes
            rim &= np.sin(np.arctan2(Y - c, X - c) * 9) > -0.1
        img.paint(rim, GUARD[3])
        img.paint(rim & ((X - c) + (Y - c) < 0), GUARD[4])
        img.paint(dil(rim) & ~rim & (dist >= r), GUARD[1])
        # a shine on the bubble's top left
        shine = (np.abs(dist - (r - 4)) < 0.8) & (np.arctan2(Y - c, X - c) > -2.6) & (np.arctan2(Y - c, X - c) < -1.9)
        img.paint(shine, GUARD[5])
        if k in (1, 2):
            star(img, c - 12, c - 13, 3 if k == 2 else 2, (GUARD[3], GUARD[4], GUARD[5]))
        out.append(img)
    return out


# ---------- heal: a ring of light at the feet, crosses and sparkles rising ----------

def cross(img, x, y, big=True):
    if big:
        stamp(img, x, y, [".ooo.", ".oao.", "ooaoo", "oaaao", "ooaoo", ".oao.", ".ooo."][1:6] if False else
              ["..o..", ".oao.", "oaaao", ".oao.", "..o.."], {"o": HEAL[1], "a": HEAL[4]})
        img.px(x, y, HEAL[5])
    else:
        stamp(img, x, y, [".a.", "aba", ".a."], {"a": HEAL[3], "b": HEAL[5]})


def heal():
    out = []
    W = 48
    gx, gy = 24, 40  # the creature's feet
    rng = random.Random(61)
    X, Y = XY(W)
    for k in range(6):
        img = Img(W)
        rx = {0: 9, 1: 12, 2: 14, 3: 15, 4: 15, 5: 0}[k]
        if rx:
            band = ring(X, Y, gx, gy, rx, rx * 0.36, 0.9)
            m = band > 0.3
            img.paint(m & (Y < gy), HEAL[3] if k < 4 else HEAL[2])
            img.paint(m & (Y >= gy), HEAL[4] if k < 4 else HEAL[3])
            if k <= 2:
                img.paint(dil(m) & ~m & (Y >= gy), HEAL[1])
        if 1 <= k <= 3:  # thin rising streaks of light from the ring
            for i in range(9):
                a = i * 2 * math.pi / 9 + 0.2
                x = gx + rx * math.cos(a)
                y0 = gy + rx * 0.36 * math.sin(a)
                ln = {1: 6, 2: 12, 3: 8}[k] * (0.7 + 0.5 * (i % 3) / 2)
                top = y0 - ln - (k - 1) * 4
                line(img, x, y0 - 1 - (k - 1) * 4, x, top, HEAL[3])
                img.px(x, top, HEAL[5])
        # crosses and sparkles float up, the rising speed easing off
        seeds = [(-12, 0), (-4, -4), (6, -2), (13, 1), (0, 3), (-8, 6), (9, 7)]
        lift = {0: 0, 1: 6, 2: 14, 3: 21, 4: 27, 5: 31}[k]
        for i, (dx, dy) in enumerate(seeds):
            if k == 0 and i > 2:
                continue
            x = gx + dx + math.sin(k + i) * 1.5
            y = gy - 8 + dy - lift - (i % 3) * 2
            if y < 3:
                continue
            if i % 3 == 0 and 1 <= k <= 4:
                cross(img, x, y, True)
            elif k < 5 or i % 2 == 0:
                star(img, x, y, 2 if k < 4 else 1, (HEAL[3], HEAL[4], HEAL[5]))
        for i in range(4 if k < 5 else 2):
            x, y = gx + rng.uniform(-16, 16), rng.uniform(8, gy - 4)
            if not img.has(x, y):
                img.px(x, y, GOLD[3] if i % 2 else HEAL[4])
        out.append(img)
    return out


# ---------- power: a red-gold aura and rising chevrons ----------

def chevron(img, x, y, cols=(POW[1], POW[4], POW[5])):
    stamp(img, x, y, ["...o...", "..oao..", ".oabao.", "oab.bao", "ob...bo", "o.....o"],
          {"o": cols[0], "a": cols[2], "b": cols[1]})


def power():
    out = []
    W = 48
    gx, gy = 24, 40  # the creature's feet
    rng = random.Random(71)
    X, Y = XY(W)
    FIREC = [(0.0, 2), (0.3, 3), (0.5, 4), (0.7, 5)]
    for k in range(6):
        img = Img(W)
        if k <= 1:
            f = ell(X, Y, gx, gy, 9 + 6 * k, (9 + 6 * k) * 0.36)
            bands(f, POW, [(0.0, 3), (0.4, 4), (0.7, 5)], edge=1, img=img)
        hgt = {0: 0, 1: 12, 2: 26, 3: 32, 4: 22, 5: 0}[k]
        if hgt:  # aura tongues up both flanks of the creature
            f = np.zeros_like(X)
            for side in (-1, 1):
                for j, (off, hm) in enumerate(((14, 1.0), (18, 0.75), (9, 0.6))):
                    bx = gx + side * off
                    h = hgt * hm * (0.9 + 0.2 * math.sin(k * 2 + j))
                    wob = math.sin(k * 1.7 + j + side) * 1.5
                    f = np.maximum(f, tongue(X, Y, [(bx, gy), (bx + wob, gy - h * 0.5), (bx - side * 2, gy - h)], 3.0 if j == 0 else 2.2, 0.3, 0.95, 0.25))
            bands(f, POW, FIREC, edge=1, img=img)
        # chevrons rise through the middle
        for i, base in enumerate((0, 9, 18)):
            y = gy - 6 - base - {0: 0, 1: 6, 2: 14, 3: 22, 4: 30, 5: 36}[k]
            if 4 <= y <= gy - 4 and not (k == 0 and i > 0):
                chevron(img, gx, y)
        for i in range({0: 2, 1: 4, 2: 6, 3: 8, 4: 8, 5: 5}[k]):
            x, y = gx + rng.uniform(-18, 18), rng.uniform(4, gy - 2) - k * 2
            if 1 <= y and not img.has(x, y):
                img.px(x, y, POW[5] if i % 2 else POW[4])
                img.px(x, y + 1, POW[3])
        out.append(img)
    return out


# ---------- charge: light streaming in to a pulsing core (loops) ----------

def charge():
    out = []
    W, c = 48, 24
    angs = [i * 2 * math.pi / 9 + (0.35 if i % 2 else 0) for i in range(9)]
    for k in range(4):
        img = Img(W)
        X, Y = XY(W)
        # streaks of light rushing inward; each loops back out when it arrives
        for i, a in enumerate(angs):
            r = 22 - ((k * 5 + i * 7) % 18)
            if r < 6:
                continue
            L = 4 + (i % 3)
            x0, y0 = c + r * math.cos(a), c + r * math.sin(a)
            x1, y1 = c + (r + L) * math.cos(a), c + (r + L) * math.sin(a)
            line(img, x1, y1, x0, y0, GOLD[2])
            img.px(x0, y0, GOLD[5])
        # a ring turning around the core
        for j in range(4):
            a = j * math.pi / 2 + k * math.pi / 8
            star(img, c + 9 * math.cos(a), c + 9 * math.sin(a), 2, (GOLD[2], GOLD[3], GOLD[5]))
        # the core pulses
        r = [3.4, 4.2, 5.0, 4.2][k]
        f = ell(X, Y, c, c, r)
        bands(f, GOLD, [(0.0, 3), (0.3, 4), (0.55, 5)], edge=2, img=img)
        if k == 2:
            star(img, c, c, 4, (GOLD[3], GOLD[4], GOLD[5]))
        out.append(img)
    return out


# ---------- delay: an hourglass with time ripples (loops) ----------

def delay():
    out = []
    W, c = 32, 16
    X, Y = XY(W)
    for k in range(4):
        img = Img(W)
        # ripples of slowed time spreading out
        for rr, col in (((6 + 3 * k) % 10 + 5, TIME[3]), ((6 + 3 * k + 5) % 10 + 5, TIME[2])):
            band = ring(X, Y, c, c, rr, rr * 0.8, 0.7)
            m = (band > 0.35) & (np.sin(np.arctan2(Y - c, X - c) * 6 + k) > -0.3)
            img.paint(m, col)
        # the glass: two bulbs meeting at a neck, in a gold frame
        top_fill = [5, 4, 2, 1][k]  # sand rows left in the top bulb
        hg = Img(W)
        glass_rows = [".ggggggg.", "g.......g", "g.......g", ".g.....g.", "..g...g..", "...g.g...", "....g....",
                      "...g.g...", "..g...g..", ".g.....g.", "g.......g", "g.......g", ".ggggggg."]
        ox, oy = c - 4, c - 6
        stamp(hg, ox, oy, glass_rows, {"g": TIME[4]}, anchor="tl")
        # sand: top bulb drains, bottom bulb fills, a thin stream between
        top_rows = {1: (5, 1, 7), 2: (4, 2, 5), 3: (3, 3, 3), 4: (2, 4, 1), 5: (1, 4, 1)}
        for j in range(top_fill):
            y = oy + 5 - j
            half = [0, 1, 2, 3, 3][min(j, 4)]
            for x in range(c - half, c + half + 1):
                hg.px(x, y, GOLD[3] if j < top_fill - 1 else GOLD[4])
        bot = 5 - top_fill + 1
        for j in range(bot):
            y = oy + 11 - j
            half = [3, 3, 2, 1, 1][min(j, 4)]
            for x in range(c - half, c + half + 1):
                hg.px(x, y, GOLD[2] if j == 0 else GOLD[3])
        for y in range(oy + 6, oy + 11 - bot + 1):
            if (y + k) % 2 == 0:
                hg.px(c, y, GOLD[4])
        # frame caps
        for dy in (-1, 13):
            for x in range(c - 5, c + 6):
                hg.px(x, oy + dy, GOLD[2])
            hg.px(c - 5, oy + dy, GOLD[1])
            hg.px(c + 5, oy + dy, GOLD[1])
        for x in range(c - 4, c + 5):
            hg.px(x, oy - 2, GOLD[3])
            hg.px(x, oy + 14, GOLD[1])
        m = hg.mask()
        img.paint(dil(m) & ~m, TIME[0])
        img.over(hg)
        img.px(c - 3, oy + 1, TIME[5])  # glint on the glass
        out.append(img)
    return out


# ---------- interrupt: a hard break that shatters a wind-up ----------

def interrupt():
    out = []
    W, c = 32, 16
    X, Y = XY(W)
    rng = random.Random(81)
    for k in range(4):
        img = Img(W)
        if k == 0:
            f = ell(X, Y, c, c, 5)
            for a in (0.4, 2.0, 3.5, 5.1):
                f = np.maximum(f, tongue(X, Y, [(c, c), (c + 12 * math.cos(a), c + 12 * math.sin(a))], 2.4, 0.2, 1.0, 0.5, n=14))
            bands(f, BREAK, [(0.0, 3), (0.35, 4), (0.6, 5)], edge=1, img=img)
        elif k == 1:  # a jagged crack bursting open
            f = np.zeros_like(X)
            for i in range(6):
                a = i * math.pi / 3 + 0.25
                L = 14 if i % 2 == 0 else 10
                mid = (c + L * 0.5 * math.cos(a + 0.35), c + L * 0.5 * math.sin(a + 0.35))
                f = np.maximum(f, tongue(X, Y, [(c, c), mid, (c + L * math.cos(a), c + L * math.sin(a))], 3.2, 0.3, 1.0, 0.45, n=16))
            f = np.maximum(f, ell(X, Y, c, c, 5))
            bands(f, BREAK, [(0.0, 2), (0.3, 3), (0.55, 4), (0.75, 5)], edge=0, img=img)
        else:  # shards fly off spinning
            n = 8
            for i in range(n):
                a = i * 2 * math.pi / n + 0.2
                d = 9 if k == 2 else 13
                x, y = c + d * math.cos(a), c + d * math.sin(a)
                rows = [["ab..", ".ab.", "..ab"], ["..ab", ".ab.", "ab.."], ["aab", ".ba"]][(i + k) % 3]
                stamp(img, x, y, rows, {"a": BREAK[2] if k == 2 else BREAK[1], "b": BREAK[4] if k == 2 else BREAK[3]})
            if k == 2:
                band = ring(X, Y, c, c, 6, 6, 0.8)
                img.paint((band > 0.35) & (np.sin(np.arctan2(Y - c, X - c) * 5) > 0), BREAK[4])
        out.append(img)
    return out


# ---------- terrain: a tile square transforming ----------

def terrain():
    """The changing tile is the 16x16 square in the middle (8..23); swap the tile under it on frame 4 (index 3)."""
    out = []
    W, c = 32, 16
    X, Y = XY(W)
    x0, y0, x1, y1 = 8, 8, 23, 23
    for k in range(6):
        img = Img(W)
        sq = (X >= x0) & (X < x1 + 1) & (Y >= y0) & (Y < y1 + 1)
        edge = sq & ~ero(sq)
        if k == 0:  # the corners light up
            for (cx, cy, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
                for i in range(3):
                    img.px(cx + sx * i, cy, GOLD[3])
                    img.px(cx, cy + sy * i, GOLD[3])
                img.px(cx, cy, GOLD[5])
            star(img, c, c, 3, (GOLD[2], GOLD[4], GOLD[5]))
        elif k == 1:  # the outline is traced and a rune circle drawn inside
            img.paint(edge, GOLD[3])
            img.paint(dil(edge) & ~sq, GOLD[1])
            band = ring(X, Y, c, c, 5.5, 5.5, 0.7)
            img.paint(band > 0.4, GOLD[2])
            for (x, y) in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
                img.px(x, y, GOLD[5])
        elif k == 2:  # the square fills with light; motes start rising
            img.paint(sq & (((X.astype(int) + Y.astype(int)) % 2) == 0), GOLD[3])
            img.paint(edge, GOLD[4])
            img.paint(dil(edge) & ~sq, GOLD[1])
            band = ring(X, Y, c, c, 5.5, 5.5, 0.7)
            img.paint(band > 0.4, GOLD[5])
            for i, x in enumerate((10, 14, 18, 22)):
                line(img, x, y0 - 1, x, y0 - 3 - (i % 2) * 2, GOLD[3])
        elif k == 3:  # the flash: the tile changes under it here
            img.paint(sq, GOLD[4])
            img.paint(sq & ~ero(ero(sq)), GOLD[5])
            img.paint(dil(sq) & ~sq, GOLD[2])
        elif k == 4:  # a ring of light pushes outward, sparks rising
            big = (X >= x0 - 3) & (X < x1 + 4) & (Y >= y0 - 3) & (Y < y1 + 4)
            img.paint(big & ~ero(big), GOLD[3])
            for i, (x, y) in enumerate(((10, 5), (16, 3), (22, 6), (13, 9), (20, 10))):
                star(img, x, y, 2 if i % 2 == 0 else 1, (GOLD[2], GOLD[4], GOLD[5]))
        else:
            big = (X >= x0 - 5) & (X < x1 + 6) & (Y >= y0 - 5) & (Y < y1 + 6)
            ed = big & ~ero(big)
            img.paint(ed & (((X.astype(int) + Y.astype(int)) % 3) == 0), GOLD[2])
            for (x, y) in ((11, 2), (19, 1), (24, 4)):
                img.px(x, y, GOLD[4])
        out.append(img)
    return out


# ---------- faint: a dust-up of smoke with dizzy stars ----------

def faint():
    out = []
    W = 48
    gx, gy = 24, 40  # the creature's feet
    cols = ("#7a7490", "#aaa6bc", "#d2d0de", "#eeeef4", "#ffffff")
    for k in range(6):
        img = Img(W)
        if k == 0:
            cloud(img, [(gx - 6, gy - 2, 3.5), (gx + 6, gy - 2, 3.5), (gx, gy - 3, 4)], cols)
        elif k == 1:
            cloud(img, [(gx - 10, gy - 4, 5), (gx + 10, gy - 4, 5), (gx, gy - 7, 7), (gx - 4, gy - 12, 5), (gx + 5, gy - 12, 5)], cols)
        elif k == 2:
            cloud(img, [(gx - 13, gy - 6, 6), (gx + 13, gy - 6, 6), (gx, gy - 10, 9), (gx - 6, gy - 18, 7), (gx + 7, gy - 18, 7), (gx, gy - 24, 6)], cols)
        elif k == 3:  # the cloud breaks into puffs drifting up
            cloud(img, [(gx - 15, gy - 10, 5), (gx + 15, gy - 9, 5), (gx - 6, gy - 22, 6), (gx + 7, gy - 24, 6), (gx, gy - 6, 5)], cols)
        elif k == 4:
            cloud(img, [(gx - 16, gy - 16, 4), (gx + 16, gy - 15, 4), (gx - 6, gy - 30, 4.5), (gx + 8, gy - 31, 4.5)], cols, fade=0.3)
        else:
            cloud(img, [(gx - 17, gy - 21, 3.5), (gx + 17, gy - 20, 3.5), (gx - 6, gy - 33, 3.5), (gx + 8, gy - 34, 3.5)], cols, fade=0.7)
        # dizzy stars circling where the head was
        if 1 <= k <= 4:
            for j in range(3):
                a = j * 2 * math.pi / 3 + k * 0.9
                x, y = gx + 12 * math.cos(a), gy - 30 + 4 * math.sin(a)
                star(img, x, y, 3 if math.sin(a) > -0.2 else 2, (GOLD[2], GOLD[3], GOLD[5]))
        out.append(img)
    return out


# ---------- dust: footstep puffs ----------

def dust():
    out = []
    for k in range(4):
        img = Img(16)
        if k == 0:
            cloud(img, [(6, 11.5, 2.0), (10, 12, 1.7)], DUSTC)
        elif k == 1:
            cloud(img, [(5, 11, 2.6), (11, 11.5, 2.3)], DUSTC)
        elif k == 2:
            cloud(img, [(4.5, 10, 2.7), (11.5, 10.5, 2.4)], DUSTC, fade=0.3)
        else:
            cloud(img, [(4, 9, 2.8), (12, 9.5, 2.4)], DUSTC, fade=0.7)
        out.append(img)
    return out


# ---------- miss: the "failed" puff with a fizzle ----------

def miss():
    out = []
    W, c = 32, 16
    for k in range(4):
        img = Img(W)
        if k == 0:
            cloud(img, [(c, c + 2, 5), (c - 5, c + 4, 3.5), (c + 5, c + 4, 3.5)], GREY)
        elif k == 1:
            cloud(img, [(c, c + 1, 6), (c - 7, c + 4, 4.5), (c + 7, c + 4, 4.5), (c, c - 5, 4)], GREY)
        elif k == 2:
            cloud(img, [(c - 9, c + 3, 4), (c + 9, c + 2, 4), (c, c - 7, 4)], GREY, fade=0.2)
        else:
            cloud(img, [(c - 11, c + 1, 3), (c + 11, c, 3), (c, c - 10, 3)], GREY, fade=0.7)
        # a fizzle curling up out of the puff
        if k in (1, 2):
            pts = [(c + 1, c - 4 - (k - 1) * 3), (c + 3, c - 7 - (k - 1) * 3), (c + 1, c - 9 - (k - 1) * 3),
                   (c - 1, c - 11 - (k - 1) * 3), (c + 1, c - 13 - (k - 1) * 3)]
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                line(img, ax, ay, bx, by, GREY[4] if k == 1 else GREY[3])
            for (x, y) in pts:
                img.px(x + 1, y, GREY[1])
        out.append(img)
    return out
