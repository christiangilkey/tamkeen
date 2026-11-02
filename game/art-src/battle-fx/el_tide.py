"""Tide (water): glossy droplets with a white glint, splash crowns, rings and foam."""
import math
import random

import numpy as np

from fxkit import ACC, RAMP, XY, Img, clean, dil, ell, glossy, ring, stamp, thin_alpha, tongue, wrap_crop

R = RAMP["tide"]
FOAM = ACC["tide"]


def water(f, img=None, edge=0, foam=None):
    img = img or Img(f.shape[1], f.shape[0])
    glossy(img, f, R, cuts=((0.0, 1), (0.24, 2), (0.4, 3), (0.58, 4), (0.8, 5)), shine=(0.9, 6), edge=edge)
    if foam is not None:  # white water streaks inside the shape
        img.paint((f > 0.12) & foam, R[6])
    return img


def drop(X, Y, x, y, r, stretch=1.0, down=True):
    """A falling droplet: round bottom, pointed top (or the reverse when down=False)."""
    s = 1 if down else -1
    f = ell(X, Y, x, y, r, r)
    return np.maximum(f, tongue(X, Y, [(x, y), (x, y - s * r * 1.4 * stretch)], r * 0.95, 0.2, 0.9, 0.4, n=10))


def droplet_px(img, x, y, size=1):
    """Tiny droplets: 1 = a single bright pixel with a dark base, 2 = a 2x3 drop."""
    if size == 1:
        img.px(x, y, R[5])
        img.px(x, y + 1, R[2])
    else:
        stamp(img, x, y, [".a.", "aba", "bcb", ".b."], {"a": R[2], "b": R[3], "c": R[6]})


def ring_px(img, X, Y, cx, cy, rx, ry, cols, gap=None):
    """A thin elliptical ripple: a lighter front half and a darker back half; gap breaks it into dashes."""
    band = ring(X, Y, cx, cy, rx, ry, 0.9)
    m = band > 0.35
    if gap:
        ang = np.arctan2((Y - cy) / ry, (X - cx) / rx)
        m &= (np.sin(ang * gap) > -0.2)
    img.paint(m & (Y < cy), cols[0])
    img.paint(m & (Y >= cy), cols[1])


def projectile():
    out = []
    for k in range(4):
        X, Y = XY(16)
        sq = [0.0, 0.25, 0.0, -0.25][k]
        f = ell(X, Y, 10.6, 8, 3.7 + sq, 3.5 - sq)
        f = np.maximum(f, tongue(X, Y, [(10, 8), (6, 8 + 0.7 * math.sin(k * math.pi / 2)), (2.5, 8 - 0.5 * math.sin(k * math.pi / 2))],
                                 2.9, 0.3, 0.75, 0.45))
        img = water(f)
        # a white glint and a sliver of reflected light on the belly
        img.px(10, 6, R[7])
        img.px(11, 6, R[6])
        img.px(9, 7, R[6])
        for x in (9, 10, 11):
            if img.has(x, 10) and not img.has(x, 11 + 1):
                pass
        img.px(11, 10, R[4])
        # a wake ring peeling back off the orb
        wx = 7 - 2 * k
        for y in range(4, 13):
            if abs(y - 8) >= 3 and 0 <= wx < 16:
                img.px(wx + (1 if abs(y - 8) >= 4 else 0), y, R[5] if y < 8 else R[3])
        # droplets thrown behind
        for (dx, dy) in [((3 - 3 * k) % 10, 3 + k % 2), ((8 - 3 * k) % 10, 12 - k % 2)]:
            if not img.has(dx, dy):
                droplet_px(img, dx, dy, 1)
        out.append(img)
    return out


def impact():
    out = []
    W, c = 32, 16
    rng = random.Random(3)
    for k in range(6):
        X, Y = XY(W)
        img = Img(W)
        if k == 0:  # the orb hits and squashes flat
            f = ell(X, Y, c, c, 5.5, 3.6)
            water(f, img)
            img.px(c - 2, c - 2, R[7])
            img.px(c - 1, c - 2, R[6])
        elif k == 1:  # the burst: a white-cored splash with droplets thrown in a ring
            ring_px(img, X, Y, c, c + 2, 11, 5, (R[5], R[3]))
            f = ell(X, Y, c, c, 7, 5.5)
            for i in range(9):
                a = -math.pi + i * math.pi / 8
                L = 11 if i % 2 else 8
                f = np.maximum(f, tongue(X, Y, [(c, c), (c + L * math.cos(a), c + L * 0.85 * math.sin(a) - 1)], 2.4, 0.4, 0.8, 0.5, n=12))
            img2 = water(f)
            core = ell(X, Y, c, c - 1, 4.5, 3.5) > 0.25
            img2.paint(core, R[6])
            img2.paint(ell(X, Y, c, c - 1, 2.5, 2) > 0.2, R[7])
            img.over(img2)
        elif k in (2, 3):  # arcs of water fly out and droop, then break into beads
            ring_px(img, X, Y, c, c + 3, 12 if k == 2 else 14, (12 if k == 2 else 14) * 0.42, (R[5], R[3]))
            angs = [math.radians(d) for d in (-155, -118, -90, -62, -25)]
            f = np.zeros_like(X)
            if k == 2:
                f = ell(X, Y, c, c + 1, 5.5, 4)
                for a in angs:
                    L = 11
                    path = [(c, c), (c + L * 0.6 * math.cos(a), c + L * 0.6 * math.sin(a) - 1.5), (c + L * math.cos(a), c + L * math.sin(a) + 2.5)]
                    f = np.maximum(f, tongue(X, Y, path, 2.2, 0.6, 0.85, 0.6, n=18))
                water(f, img)
                img.paint(ell(X, Y, c - 1, c, 3.2, 2.2) > 0.2, R[6])
                img.px(c - 2, c - 1, R[7])
            else:
                f = ell(X, Y, c, c + 2, 3, 2) * 0.8
                for a in angs:
                    L = 14
                    for t, r in ((0.55, 1.7), (0.8, 1.4), (1.0, 1.1)):
                        x = c + L * t * math.cos(a)
                        y = c + L * t * math.sin(a) + 6 * t * t - 1
                        f = np.maximum(f, ell(X, Y, x, y, r, r))
                water(f, img)
        elif k == 4:  # drops fall back; the ripple spreads
            ring_px(img, X, Y, c, c + 3, 13.5, 5.6, (R[5], R[3]))
            ring_px(img, X, Y, c, c + 4, 8, 3.3, (R[4], R[2]))
            f = np.zeros_like(X)
            for (dx, dy, r) in [(-10, 0, 1.3), (-5, -5, 1.5), (3, -6, 1.5), (10, -1, 1.3), (0, 1, 1.2)]:
                f = np.maximum(f, drop(X, Y, c + dx, c + dy, r * 0.85, 1.3))
            water(f, img)
        else:
            ring_px(img, X, Y, c, c + 3, 13.5, 5.6, (R[4], R[2]), gap=5)
            for (dx, dy) in [(-10, 2), (-5, -1), (4, -2), (10, 1), (1, 5)]:
                droplet_px(img, c + dx, c + dy, 1)
        out.append(clean(img, keep_alone=R))
    return out


def burst():
    out = []
    W = 64
    gx, gy = 32, 48
    rng = random.Random(9)
    for k in range(8):
        X, Y = XY(W)
        img = Img(W)
        # ripples on the ground
        rings = {0: [(7, R[4], R[2]), (12, R[3], R[1])], 1: [(13, R[5], R[3])], 2: [(18, R[5], R[3]), (10, R[4], R[2])],
                 3: [(24, R[5], R[3]), (15, R[4], R[2])], 4: [(27, R[5], R[3]), (20, R[4], R[2])],
                 5: [(28, R[4], R[2]), (22, R[4], R[2])], 6: [(28, R[4], R[2]), (16, R[4], R[2])], 7: [(29, R[3], R[2])]}[k]
        for rx, a, b in rings:
            ring_px(img, X, Y, gx, gy, rx, rx * 0.38, (a, b), gap=6 if k == 7 else None)
        f = np.zeros_like(X)
        if k == 0:  # bubbles well up
            for (dx, dy, r) in [(-3, -4, 1.6), (2, -7, 1.2), (4, -3, 1.0)]:
                f = np.maximum(f, ell(X, Y, gx + dx, gy + dy, r))
            water(f, img)
        elif k == 1:  # the ground bulges with water
            f = ell(X, Y, gx, gy - 3, 11, 6.5)
            water(f, img)
        elif k in (2, 3):  # the geyser: a tapering column, spray splaying off the top
            top = 14 if k == 2 else 8
            f = np.maximum(f, tongue(X, Y, [(gx, gy - 2), (gx + 1, (gy + top) / 2), (gx, top + 4)], 7.0 if k == 2 else 8.0, 3.2, 1.0, 0.7, power=0.6))
            f = np.maximum(f, ell(X, Y, gx, gy - 2, 11 if k == 2 else 13, 4.5))
            spray = [(-1.9, 7), (-1.3, 9), (-0.4, 10), (0.4, 10), (1.3, 9), (1.9, 7)] if k == 3 else [(-1.0, 7), (-0.3, 9), (0.3, 9), (1.0, 7)]
            for ang, L in spray:  # angle from straight up
                tx, ty = gx + L * math.sin(ang), top + 4 - L * math.cos(ang) + (abs(ang) > 1.5) * 4
                f = np.maximum(f, tongue(X, Y, [(gx, top + 5), (gx + L * 0.5 * math.sin(ang), top + 4 - L * 0.7), (tx, ty)], 2.6, 0.5, 0.85, 0.55, n=14))
            if k == 3:  # wave crests on the ring
                for i in range(10):
                    a = i * 2 * math.pi / 10
                    bx, by = gx + 24 * math.cos(a), gy + 24 * 0.38 * math.sin(a)
                    f = np.maximum(f, tongue(X, Y, [(bx, by), (bx + 1.5 * math.cos(a), by - 4)], 1.8, 0.4, 0.75, 0.5, n=8))
            foam = (np.sin(X * 1.6 + np.sin(Y * 0.5 + k) * 2) > 0.75) & (Y < gy - 4)
            water(f, img, foam=foam)
            for i in range(9):
                fx = gx - 9 + i * 2.2
                img.px(fx, gy - 2 + (i % 2), FOAM[3] if i % 2 else R[6])
            for i in range(8):
                a = -math.pi + (i + 0.5) * math.pi / 8
                d = 12 + rng.uniform(0, 4)
                x, y = gx + d * math.cos(a), top + 2 + d * 0.8 * math.sin(a)
                if 0 <= y < 64 and not img.has(x, y):
                    droplet_px(img, x, y, 2 if i % 3 == 0 else 1)
        elif k == 4:  # the column collapses outward in sheets
            f = np.maximum(f, tongue(X, Y, [(gx, gy - 2), (gx, 28), (gx, 18)], 5.0, 2.0, 0.95, 0.6, power=0.5))
            for s in (-1, 1):
                f = np.maximum(f, tongue(X, Y, [(gx, 16), (gx + s * 10, 12), (gx + s * 16, 26)], 2.6, 0.6, 0.85, 0.5, n=20))
                f = np.maximum(f, tongue(X, Y, [(gx, 20), (gx + s * 6, 18), (gx + s * 11, 30)], 2.0, 0.5, 0.8, 0.5, n=16))
            f = np.maximum(f, ell(X, Y, gx, gy - 2, 12, 4.5))
            for i in range(10):
                a = i * 2 * math.pi / 10 + 0.3
                bx, by = gx + 27 * math.cos(a), gy + 27 * 0.38 * math.sin(a)
                f = np.maximum(f, tongue(X, Y, [(bx, by), (bx + 1.5 * math.cos(a), by - 3)], 1.6, 0.4, 0.7, 0.5, n=8))
            water(f, img, foam=(np.sin(X * 1.6 + np.sin(Y * 0.5) * 2) > 0.8) & (Y < gy - 4) & (np.abs(X - gx) < 5))
        elif k == 5:  # rain of drops, a low mound left
            f = ell(X, Y, gx, gy - 3, 8, 5)
            for (dx, dy, r) in [(-14, -22, 1.8), (-8, -28, 1.6), (9, -26, 1.7), (15, -18, 1.8), (-18, -12, 1.5), (19, -8, 1.4), (2, -32, 1.5)]:
                f = np.maximum(f, drop(X, Y, gx + dx, gy + dy, r, 1.2))
            water(f, img)
        else:  # drops land as tiny splashes
            for (dx, dy) in ([(-16, -6), (-6, -14), (8, -12), (15, -2), (-20, 2), (21, 4), (0, -20)] if k == 6 else [(-12, 1), (10, 3), (-2, -4)]):
                x, y = gx + dx, gy + dy + (6 if k == 6 else 0)
                if k == 6:
                    stamp(img, x, y, ["a...a", ".b.b.", "..c.."], {"a": R[5], "b": R[3], "c": R[2]})
                else:
                    droplet_px(img, x, y, 1)
        out.append(clean(img, keep_alone=R + FOAM))
    return out


def beam():
    """A tileable jet of water, scrolling right 4 px a frame."""
    out = []
    for k in range(4):
        X, Y = XY(48, 16)
        p = (X - 4 * k) * 2 * math.pi / 16
        cy = 8 + 0.6 * np.sin(p)
        half = 3.4 + 0.5 * np.sin(2 * p + 0.5)
        f = np.clip(1 - np.abs(Y - cy) / half, 0, 1)
        big = Img(48, 16)
        m = f > 0
        big.paint(m, R[3])
        big.paint(m & (Y > cy + half * 0.35), R[2])
        big.paint(m & (Y > cy + half * 0.7), R[1])
        big.paint(m & (Y < cy - half * 0.1), R[4])
        big.paint(m & (Y < cy - half * 0.55), R[5])
        # a twisting white streak along the jet
        sx = np.sin(p * 2 + 1.3)
        big.paint(m & (np.abs(Y - (cy - 0.5 + 1.8 * sx)) < 0.55) & (np.cos(p * 2 + 1.3) > 0), R[6])
        big.paint(m & (np.abs(Y - (cy - 1.8 + 0.0 * sx)) < 0.5) & (np.sin(p * 4) > 0.6), R[7])
        big.paint(dil(m) & ~m, R[0])
        img = wrap_crop(big, 16)
        # foam flecks peeling off the edges
        for (x0, y0, col) in ((3, 2, R[5]), (11, 14, R[4]), (8, 1, R[4])):
            xx = (x0 + 4 * k) % 16
            if not img.has(xx, y0):
                img.px(xx, y0, col)
        out.append(img)
    return out


def trail():
    """A droplet that falls and splashes."""
    cm = {"a": R[1], "b": R[3], "c": R[5], "w": R[7], "d": R[2]}
    rows = [
        ["...a....", "..aba...", "..bcb...", "..bbb...", "...b....", "........", "........", "........"],
        ["........", "........", "...a....", "..abw...", "..bcb...", "...b....", "........", "........"],
        ["........", "........", "........", "........", ".c...c..", "..b.b...", "..dbd...", "........"],
        ["........", "........", "........", "........", "........", "c.....c.", ".d...d..", "..ddd..."],
    ]
    out = []
    for r in rows:
        img = Img(8)
        stamp(img, 0, 0, r, cm, anchor="tl")
        out.append(img)
    return out


def status():
    """status_wet: a drop gathers, drips and lands (loops)."""
    cm = {"o": R[0], "a": R[2], "b": R[3], "c": R[5], "w": R[7]}
    rows = [
        ["........", "...o....", "..obo...", "..owbo..", "..obbo..", "...oo...", "........", "........"],
        ["........", "........", "...o....", "..obo...", "..owbo..", "..obbo..", "...oo...", "........"],
        ["........", "........", "........", "........", "...o....", "..owo...", "..obbo..", "...oo..."],
        ["........", "........", "........", "........", "........", "c.....c.", ".a...a..", "..aaa..."],
    ]
    out = []
    for r in rows:
        img = Img(8)
        stamp(img, 0, 0, r, cm, anchor="tl")
        out.append(img)
    return out
