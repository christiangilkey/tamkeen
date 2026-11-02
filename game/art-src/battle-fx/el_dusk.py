"""Dusk (shadow): dark cores with glowing violet rims, curling wisps, a swirling pool, magenta-white glints."""
import math
import random

import numpy as np

from fxkit import ACC, RAMP, XY, Img, bands, clean, dil, ell, ring, sparkle, stamp, thin_alpha, tone, tongue, wrap_crop

R = RAMP["dusk"]
MAG = ACC["dusk"]
RIM = [(0.0, 5), (0.14, 4), (0.3, 3), (0.5, 2), (0.72, 1)]  # bright at the edge, dark in the middle


def shadow(f, img=None, edge=0):
    """Dark in the middle, a glowing violet rim, brightest on the side facing the light."""
    img = img or Img(f.shape[1], f.shape[0])
    bands(f, R, [(0.0, 4), (0.22, 2), (0.5, 1)], edge=edge, img=img)
    t = tone(f)
    m = (f > 0) & (f < 0.24) & (t > 0.62)
    img.paint(m, R[5])
    img.paint(m & (t > 0.85), R[6])
    return img


def wisp(X, Y, x, y, L, ang, curl, w=2.2):
    """A curling tendril of shadow leaving (x, y) toward ang."""
    a2 = ang + curl
    p1 = (x + L * 0.4 * math.cos(ang), y + L * 0.4 * math.sin(ang))
    p2 = (x + L * 0.75 * math.cos(ang + curl * 0.6), y + L * 0.75 * math.sin(ang + curl * 0.6))
    p3 = (x + L * math.cos(a2) * 0.9, y + L * math.sin(a2) * 0.9)
    return tongue(X, Y, [(x, y), p1, p2, p3], w, 0.3, 1.0, 0.35)


def glint(img, x, y, size=3):
    if size >= 4:
        sparkle(img, x, y, 4, (MAG[1], MAG[2], R[7]))
    elif size == 3:
        sparkle(img, x, y, 3, (MAG[1], MAG[3], R[7]))
    elif size == 2:
        sparkle(img, x, y, 2, (MAG[2], MAG[3], R[7]))
    else:
        img.px(x, y, MAG[3])


def projectile():
    out = []
    for k in range(4):
        X, Y = XY(16)
        ph = k * math.pi / 2
        f = ell(X, Y, 10.6, 8, 3.8, 3.6)
        f = np.maximum(f, tongue(X, Y, [(9.5, 8), (6, 8 + 1.2 * math.sin(ph)), (3.5, 8 - 1.2 * math.sin(ph)), (0.5, 8 + 1.0 * math.cos(ph))], 2.6, 0.3, 0.8, 0.3))
        f = np.maximum(f, tongue(X, Y, [(8.5, 6.2), (6.5, 4.6), (4.5 + 0.8 * math.cos(ph), 3.6 + 0.7 * math.sin(ph))], 1.2, 0.3, 0.6, 0.3))
        img = shadow(f)
        img.px(11, 7, R[5])  # a violet eye of light in the dark core
        img.px(11, 8, R[6])
        glint(img, [3, 5, 2, 4][k], [2, 13, 13, 2][k], 2 if k % 2 == 0 else 1)
        out.append(img)
    return out


def impact():
    out = []
    W, c = 32, 16
    rng = random.Random(41)
    for k in range(6):
        X, Y = XY(W)
        img = Img(W)
        if k == 0:  # wisps rush inward: the hit is about to land
            f = ell(X, Y, c, c, 3.2)
            for i in range(5):
                a = i * 2 * math.pi / 5 + 0.3
                f = np.maximum(f, wisp(X, Y, c + 11 * math.cos(a), c + 11 * math.sin(a), 8, a + math.pi, 0.6, 1.6) * 0.8)
            shadow(f, img)
        elif k == 1:  # the hit: a ragged dark burst ringed in light
            f = ell(X, Y, c, c, 7.5)
            for i in range(9):
                a = i * 2 * math.pi / 9
                L = 13 if i % 2 else 10
                f = np.maximum(f, tongue(X, Y, [(c, c), (c + L * math.cos(a + 0.25), c + L * math.sin(a + 0.25))], 3.0, 0.3, 1.0, 0.4, n=14))
            shadow(f, img)
            glint(img, c - 6, c - 7, 4)
            glint(img, c + 8, c + 5, 2)
        elif k in (2, 3):  # a ring of shadow spreads; wisps curl off it
            rr = 10 if k == 2 else 11
            f = ring(X, Y, c, c, rr, rr * 0.9, 1.5 if k == 2 else 1.1) * (0.8 if k == 2 else 0.6)
            for i in range(6):
                a = i * math.pi / 3 + 0.4 + k * 0.3
                f = np.maximum(f, wisp(X, Y, c + rr * math.cos(a), c + rr * 0.9 * math.sin(a), 5 if k == 2 else 5, a, 1.4, 1.6) * 0.8)
            f = np.maximum(f, ell(X, Y, c, c, 4 if k == 2 else 2.5) * 0.9)
            shadow(f, img)
            for i in range(3 if k == 2 else 4):
                a = rng.uniform(0, 2 * math.pi)
                d = rng.uniform(4, rr - 2)
                glint(img, c + d * math.cos(a), c + d * math.sin(a), 3 if i == 0 else 2)
        else:  # last wisps curl upward; glints wink out
            if k == 4:
                f = np.zeros_like(X)
                for (x, y, L, a) in ((c - 9, c + 4, 7, -1.9), (c + 8, c + 2, 8, -1.3), (c, c - 2, 6, -1.6)):
                    f = np.maximum(f, wisp(X, Y, x, y, L, a, 1.6, 1.4) * 0.7)
                shadow(f, img)
            for i in range(5 if k == 4 else 3):
                a = i * 2 * math.pi / (5 if k == 4 else 3) + k
                d = 12 if k == 4 else 13
                glint(img, c + d * math.cos(a), c + d * math.sin(a) - (k - 4) * 2, 2 if (k == 4 and i % 2 == 0) else 1)
        out.append(clean(img, keep_alone=R + MAG))
    return out


def burst():
    out = []
    W = 64
    gx, gy = 32, 48
    rng = random.Random(51)
    for k in range(8):
        X, Y = XY(W)
        img = Img(W)
        pool = {0: 8, 1: 16, 2: 22, 3: 25, 4: 23, 5: 17, 6: 9, 7: 0}[k]
        if pool:
            f = ell(X, Y, gx, gy, pool, pool * 0.36)
            sh = shadow(f)
            # spiral arms turning in the pool
            ang = np.arctan2((Y - gy) / 0.36, X - gx)
            rad = np.hypot(X - gx, (Y - gy) / 0.36)
            arm = (np.sin(3 * ang + rad * 0.35 - k * 0.9) > 0.55) & (f > 0.15) & (f < 0.85)
            sh.paint(arm, R[3])
            sh.paint(arm & (np.sin(3 * ang + rad * 0.35 - k * 0.9) > 0.85), R[4])
            img.over(sh)
        f = np.zeros_like(X)
        if 1 <= k <= 5:  # dark flames lick up around the pool's rim, leaning outward
            n = 7
            hgt = {1: 7, 2: 15, 3: 19, 4: 17, 5: 10}[k]
            for i in range(n):
                a = i * 2 * math.pi / n + 0.3
                bx, by = gx + pool * 0.78 * math.cos(a), gy + pool * 0.78 * 0.36 * math.sin(a)
                h = hgt * (0.75 + 0.45 * ((i * 5) % 3) / 2) * (0.8 if math.sin(a) < 0 else 1.0)
                lean = math.cos(a) * h * 0.35
                wob = math.sin(k * 1.3 + i) * 1.5
                f = np.maximum(f, tongue(X, Y, [(bx, by), (bx + lean * 0.3 + wob, by - h * 0.55), (bx + lean, by - h)],
                                         2.6 if k >= 2 else 1.9, 0.3, 0.95, 0.3))
        if k in (3, 4):  # the dark pillar erupting from the middle
            top = 6 if k == 3 else 10
            twist = 0 if k == 3 else 3
            f = np.maximum(f, tongue(X, Y, [(gx, gy - 2), (gx + twist, (gy + top) / 2 + 4), (gx - twist, top + 8), (gx + twist * 1.5, top)],
                                     8 if k == 3 else 6.5, 0.6, 1.0, 0.55))
        if k == 2:
            f = np.maximum(f, tongue(X, Y, [(gx, gy - 2), (gx, gy - 12), (gx + 1, gy - 20)], 5, 0.6, 1.0, 0.5))
        if k in (5, 6):  # wisps break free and drift up
            for i, (dx, dy, L) in enumerate(((-10, 26, 9), (2, 18, 11), (12, 24, 8), (-3, 10, 7))):
                yy = dy - (k - 5) * 6
                if yy > 2:
                    f = np.maximum(f, wisp(X, Y, gx + dx, yy, L, -math.pi / 2 + (0.4 if i % 2 else -0.4), 1.2 * (1 if i % 2 else -1), 1.3) * (0.85 if k == 5 else 0.6))
        if f.max() > 0:
            shadow(f, img)
        # glints scattered through the dark
        cnt = {0: 3, 1: 4, 2: 6, 3: 8, 4: 8, 5: 7, 6: 6, 7: 4}[k]
        for i in range(cnt):
            x, y = gx + rng.uniform(-24, 24), rng.uniform(6, gy + 4)
            x = min(max(x, 5), 58)
            glint(img, x, y, 4 if (i == 0 and 2 <= k <= 4) else (3 if i % 3 == 0 and k < 7 else (2 if k < 7 else 1)))
        out.append(clean(img, keep_alone=R + MAG))
    return out


def beam():
    """A ray of shadow: a dark core between glowing violet rims, swirls running along it; tileable."""
    out = []
    for k in range(4):
        X, Y = XY(48, 16)
        p = (X - 4 * k) * 2 * math.pi / 16
        cy = 8 + 0.5 * np.sin(p + 0.4)
        half = 3.6 + 0.7 * np.sin(2 * p) + 0.4 * np.sin(p + 2)
        f = np.clip(1 - np.abs(Y - cy) / half, 0, 1)
        big = Img(48, 16)
        shadow(f, big)
        # swirls inside the dark
        sw = (np.abs(Y - (cy + 1.8 * np.sin(p * 2 + 1))) < 0.6) & (f > 0.45)
        big.paint(sw, R[3])
        # wisps peeling off the top edge
        for off in (0, 16, 32):
            x0 = (5 + 4 * k) % 16 + off
            g = wisp(X, Y, x0, cy[0, 0] - 2.5, 5, -math.pi * 0.75, 0.9, 1.3) * 0.8
            if g.max() > 0:
                shadow(g, big)
        img = wrap_crop(big, 16)
        for (x0, y0) in ((2, 13), (11, 2)):
            xx = (x0 + 4 * k) % 16
            if not img.has(xx, y0):
                glint(img, xx, y0, 1)
        out.append(img)
    return out


def trail():
    out = []
    for k in range(4):
        X, Y = XY(8)
        img = Img(8)
        if k < 2:
            f = wisp(X, Y, 3.5, 5.5 - k, 4.5 - k, -math.pi / 2, 0.9, 1.4 - 0.3 * k)
            shadow(f, img)
        glint(img, [6, 5, 4, 4][k], [2, 2, 3, 2][k], 2 if k == 2 else 1)
        out.append(img)
    return out


def status():
    """status_dark: a small shadow flame flickering with a magenta glint (loops)."""
    cm = {"o": R[0], "r": R[5], "m": R[4], "d": R[2], "k": R[1], "g": MAG[2], "w": R[7]}
    rows = [
        ["........", "...o....", "..oro...", "..ormo..", ".ormdro.", ".ormkro.", "..orro..", "...oo..."],
        ["........", "....o...", "...oro..", "..omro..", ".ordmro.", ".ormkro.", "..orro..", "...oo..."],
        ["...o....", "..oro...", "..orro..", ".ormdro.", ".ormkmo.", ".ordkro.", "..orro..", "...oo..."],
        ["........", "..o.....", "..oro...", "..ormo..", ".ormdro.", ".ormkro.", "..orro..", "...oo..."],
    ]
    out = []
    for k, r in enumerate(rows):
        img = Img(8)
        stamp(img, 0, 0, r, cm, anchor="tl")
        img.px([6, 7, 6, 5][k], [1, 2, 0, 1][k], MAG[3] if k % 2 else R[7])
        out.append(img)
    return out
