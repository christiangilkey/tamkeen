"""Ember (fire): fat flame tongues with white-hot cores, embers, dark smoke."""
import math
import random

import numpy as np

from fxkit import ACC, RAMP, XY, Img, bands, clean, dil, ell, ring, thin_alpha, tongue, stamp

R = RAMP["ember"]
SMOKE = ACC["ember"]
FIRE = [(0.0, 2), (0.24, 3), (0.42, 4), (0.58, 5), (0.74, 6), (0.88, 7)]


def fire(f, img=None, edge=1):
    return bands(f, R, FIRE, edge=edge, img=img)


def flame(X, Y, bx, by, height, width, lean=0.0, wob=0.0, h0=1.0, h1=0.25):
    """An upright flame tongue standing at (bx, by)."""
    return tongue(X, Y, [(bx, by), (bx + lean * 0.4 + wob, by - height * 0.55), (bx + lean, by - height)],
                  width, 0.3, h0, h1)


SMK = ["#2a2228", "#463a42", "#685a62", "#8e8086", "#b6aaae"]


def smoke(img, blobs, fade=0.0, glow=False):
    """Puffs of smoke: blobs = [(cx, cy, r)], lit from the top left; glow = fire light on the underside.
    fade 0..1 shrinks the puffs and drops their outline as they thin out."""
    X, Y = XY(img.w, img.h)
    f = np.zeros_like(X)
    lit = np.zeros_like(X)
    dark = np.zeros_like(X)
    for cx, cy, r in blobs:
        r = r * (1 - 0.35 * fade)
        f = np.maximum(f, ell(X, Y, cx, cy, r, r * 0.88))
        for a in (0.4, 2.0, 3.6, 5.0):  # bumps make a cloud, not a ball
            f = np.maximum(f, ell(X, Y, cx + r * 0.75 * math.cos(a), cy + r * 0.6 * math.sin(a), r * 0.5, r * 0.45))
        lit = np.maximum(lit, ell(X, Y, cx - r * 0.35, cy - r * 0.4, r * 0.75, r * 0.6))
        dark = np.maximum(dark, ell(X, Y, cx + r * 0.3, cy + r * 0.45, r * 0.8, r * 0.55))
    s = Img(img.w, img.h)
    m = f > 0
    s.paint(m, SMK[2])
    s.paint(m & (dark > 0.35) & (lit < 0.2), SMK[1])
    s.paint(m & (lit > 0.2), SMK[3])
    s.paint(m & (lit > 0.62), SMK[4])
    if glow:  # the fire's light catches the underside
        s.paint(m & np.roll(~m, -1, axis=0) & (dark > 0.2), R[1])
    if fade < 0.5:
        s.paint(dil(m) & ~m, SMK[1])
    return img.over(s)


def ember_dot(img, x, y, size=2):
    """A flying ember: a hot pixel with a cooler pixel behind it."""
    if size >= 2:
        img.px(x, y + 1, R[3])
        img.px(x, y, R[6])
    else:
        img.px(x, y, R[4])


def projectile():
    out = []
    for k in range(4):
        ph = k * math.pi / 2
        X, Y = XY(16)
        f = ell(X, Y, 10.8, 8.0, 3.7, 3.4)
        f = np.maximum(f, tongue(X, Y, [(10.5, 8), (6, 8 + 0.9 * math.sin(ph)), (1.0 + 0.8 * math.cos(ph), 8 + 1.4 * math.sin(ph + 1.3))],
                                 3.3, 0.35, 0.95, 0.22))
        up, lo = (1.0, 0.6) if k % 2 == 0 else (0.6, 1.0)  # the side licks flicker in turn
        f = np.maximum(f, tongue(X, Y, [(9.4, 6.0), (7.4, 4.9), (9.4 - 5.6 * up, 5.2 - 2.2 * up)], 1.6, 0.3, 0.8, 0.2))
        f = np.maximum(f, tongue(X, Y, [(9.4, 10.0), (7.4, 11.1), (9.4 - 5.4 * lo, 10.8 + 2.0 * lo)], 1.5, 0.3, 0.8, 0.2))
        img = fire(f)
        # leading edge stays crisp and hot
        img.px(14, 8, R[5])
        # embers shed behind
        for (ex, ey) in [((2 + k * 3) % 7, 6 + (k % 2) * 4), ((5 + k * 3) % 8, 2 + (k * 5) % 12)]:
            if not img.has(ex, ey):
                img.px(ex, ey, R[5] if k % 2 else R[4])
        out.append(clean(img, keep_alone=R))
    return out


def impact():
    out = []
    W = 32
    c = 16
    rng = random.Random(11)
    angs = [i * 2 * math.pi / 7 + 0.3 for i in range(7)]
    for k in range(6):
        X, Y = XY(W)
        img = Img(W)
        if k == 0:  # anticipation: a hot pinpoint swelling
            f = ell(X, Y, c, c, 3.6)
            for a in (0.8, 2.4, 3.9, 5.5):
                f = np.maximum(f, tongue(X, Y, [(c, c), (c + 6 * math.cos(a), c + 6 * math.sin(a))], 1.4, 0.2, 0.9, 0.5))
            fire(f, img)
        elif k == 1:  # the hit: big white-hot flash
            f = ell(X, Y, c, c, 8.5)
            for i in range(8):
                a = i * math.pi / 4 + 0.2
                L = 12.5 if i % 2 == 0 else 10
                f = np.maximum(f, tongue(X, Y, [(c, c), (c + L * 0.6 * math.cos(a), c + L * 0.6 * math.sin(a) - 1),
                                                (c + L * math.cos(a), c + L * math.sin(a) - 2)], 3.2, 0.3, 1.0, 0.45))
            fire(f * 1.08, img)
        elif k in (2, 3):  # flames burst outward and curl upward
            r0 = 3 if k == 2 else 6
            r1 = 12.5 if k == 2 else 13.5
            f = ell(X, Y, c, c, 6 if k == 2 else 4.5) * (0.75 if k == 2 else 0.5)
            for i, a in enumerate(angs):
                bx, by = c + r0 * math.cos(a), c + r0 * math.sin(a)
                tx, ty = c + r1 * math.cos(a), c + r1 * math.sin(a) - (3 if k == 2 else 4) + (1.5 if math.sin(a) < -0.5 else 0)
                mx, my = c + (r0 + r1) / 2 * math.cos(a + 0.25), c + (r0 + r1) / 2 * math.sin(a + 0.25) - 1
                f = np.maximum(f, tongue(X, Y, [(bx, by), (mx, my), (tx, ty)], 3.0 if k == 2 else 2.4, 0.3,
                                         0.95 if k == 2 else 0.8, 0.25))
            fire(f, img)
            for i in range(6):
                a = rng.uniform(0, 2 * math.pi)
                rr = (12 if k == 2 else 14) + rng.uniform(0, 2)
                ex, ey = c + rr * math.cos(a), c + rr * math.sin(a)
                if not img.has(ex, ey):
                    ember_dot(img, ex, ey)
        elif k == 4:  # flames shrink into licks; smoke rises from the middle
            f = np.zeros_like(X)
            for i, a in enumerate(angs[::2]):
                bx, by = c + 10 * math.cos(a), c + 9 * math.sin(a) + 2
                f = np.maximum(f, flame(X, Y, bx, by, 6, 2.0, lean=0.8 * math.cos(a), h0=0.75, h1=0.2))
            fire(f, img)
            for (x, y) in ((c - 1, c - 6), (c + 2, c - 9), (c, c - 12)):  # a thin thread of smoke
                img.px(x, y, SMK[3])
                img.px(x + 1, y, SMK[2])
                img.px(x, y + 1, SMK[2])
            for i in range(7):
                a = rng.uniform(0, 2 * math.pi)
                ex, ey = c + 14 * math.cos(a), c + 13 * math.sin(a) - 2
                if not img.has(ex, ey):
                    ember_dot(img, ex, ey, 2 if i % 2 else 1)
        else:  # smoke drifts up and thins; last embers
            for (x, y) in ((c - 2, c - 10), (c + 2, c - 13)):
                img.px(x, y, SMK[3])
                img.px(x + 1, y + 1, SMK[2])
            for i in range(5):
                a = rng.uniform(0, 2 * math.pi)
                ember_dot(img, c + 14 * math.cos(a), c + 12 * math.sin(a) - 4, 1)
        out.append(img)
    return out


def burst():
    out = []
    W = 64
    gx, gy = 32, 48  # ground centre
    rng = random.Random(5)
    for k in range(8):
        X, Y = XY(W)
        img = Img(W)
        # scorched ground under it all
        if k >= 1:  # a ring of cinders where the fire ran, glowing at first, then cooling
            rx = [0, 14, 20, 25, 26, 26, 26, 26][k]
            band = ring(X, Y, gx, gy, rx, rx * 0.36, 1.6)
            inner = ell(X, Y, gx, gy, rx, rx * 0.36)
            hsh = ((X * 7 + Y * 13).astype(int) * 2654435761 % 97) / 97.0
            hot = [0, 4, 4, 4, 3, 2, 2, 1][k]
            img.paint((band > 0.3) & (hsh < 0.55), R[0])
            img.paint((band > 0.3) & (hsh < 0.2), R[1])
            img.paint((inner > 0.15) & (hsh < 0.07), R[1])
            img.paint((band > 0.5) & (hsh > 0.9), R[hot] if hot > 1 else R[1])
            if k == 7:
                thin_alpha(img, 0.55, 3)
        f = np.zeros_like(X)
        if k == 0:  # the ground glows and cracks
            g = ell(X, Y, gx, gy, 9, 3.4)
            f = np.maximum(f, g * 0.85)
            for i in range(5):
                a = -math.pi / 2 + (i - 2) * 0.5
                f = np.maximum(f, flame(X, Y, gx + (i - 2) * 3, gy, 3 + (i % 2) * 2, 1.4, h0=0.8))
            fire(f, img)
        else:
            ring_r = [0, 14, 20, 25, 26, 26, 26, 26][k]
            fh = [0, 6, 9, 11, 8, 5, 3, 0][k]
            n = 14
            if fh:
                for i in range(n):
                    a = i * 2 * math.pi / n + k * 0.2
                    bx, by = gx + ring_r * math.cos(a), gy + ring_r * 0.36 * math.sin(a)
                    hh = fh * (0.75 + 0.35 * ((i * 7) % 3) / 2) * (1.0 if math.sin(a) > -0.3 else 0.85)
                    f = np.maximum(f, flame(X, Y, bx, by, hh, 2.2 if fh > 5 else 1.6, lean=math.sin(i * 1.7 + k) * 1.5,
                                            h0=0.95 if k < 4 else 0.75))
            # the central column
            if k == 1:
                f = np.maximum(f, ell(X, Y, gx, gy, 10, 3.6) * 0.95)
                f = np.maximum(f, flame(X, Y, gx, gy, 12, 4.5, h0=1.0, h1=0.4))
            elif k == 2:
                f = np.maximum(f, flame(X, Y, gx, gy + 1, 40, 9, wob=1, h0=1.05, h1=0.45))
                f = np.maximum(f, ell(X, Y, gx, gy, 12, 4.3))
            elif k == 3:
                f = np.maximum(f, flame(X, Y, gx, gy + 1, 46, 11, wob=-1, h0=1.1, h1=0.5))
                f = np.maximum(f, flame(X, Y, gx - 6, gy - 6, 26, 5, lean=-6, h0=0.9))
                f = np.maximum(f, flame(X, Y, gx + 6, gy - 8, 28, 5, lean=6, h0=0.9))
                f = np.maximum(f, ell(X, Y, gx, gy, 13, 4.6))
            elif k == 4:  # the column breaks into rising tongues
                for dx, top, w in ((-5, 30, 5.5), (0, 38, 7), (5, 31, 5.5)):
                    f = np.maximum(f, flame(X, Y, gx + dx, gy, top, w, lean=dx * 1.4, h0=0.85, h1=0.3))
            elif k == 5:
                for dx, base, top, w in ((-7, 28, 12, 3.5), (1, 24, 15, 4.2), (8, 30, 10, 3)):
                    f = np.maximum(f, flame(X, Y, gx + dx, base, top, w, lean=dx * 0.4, h0=0.75, h1=0.25))
            elif k == 6:
                for dx, base, top, w in ((-5, 20, 7, 2.4), (5, 18, 6, 2.2)):
                    f = np.maximum(f, flame(X, Y, gx + dx, base, top, w, h0=0.6, h1=0.2))
            if k >= 4:
                puffs = {4: [(gx - 4, 12, 4.5), (gx + 4, 10, 4)],
                         5: [(gx - 6, 11, 5), (gx + 4, 8, 5), (gx + 10, 13, 3.6)],
                         6: [(gx - 7, 8, 5), (gx + 5, 6, 5), (gx + 11, 11, 4), (gx - 1, 12, 3.6)],
                         7: [(gx - 8, 5, 4.6), (gx + 6, 4, 4.4), (gx + 12, 8, 3.6)]}[k]
                smoke(img, puffs, fade={4: 0.0, 5: 0.0, 6: 0.3, 7: 0.7}[k], glow=k < 6)
            fire(f, img)
        # embers flung up and out
        if 2 <= k:
            for i in range(10 if k < 6 else 6):
                a = rng.uniform(-math.pi, 0)
                rr = (k - 1) * 4.2 + rng.uniform(0, 6)
                ex, ey = gx + rr * math.cos(a) * 1.3, gy - 14 + rr * math.sin(a) * 0.9 + (k - 4) ** 2 * 0.5
                if 0 <= ex < W and 0 <= ey < W and not img.has(ex, ey):
                    ember_dot(img, ex, ey, 2 if (i + k) % 3 else 1)
        out.append(clean(img, keep_alone=R))
    return out


def beam():
    """A tileable flame stream (16 px repeat), scrolling right 4 px a frame."""
    out = []
    for k in range(4):
        X, Y = XY(48, 16)
        p = (X - 4 * k) * 2 * math.pi / 16
        cy = 8 + 0.7 * np.sin(p + 0.6)
        half = 3.3 + 0.8 * np.sin(p) + 0.5 * np.sin(2 * p + 1.1)
        f = np.clip(1 - np.abs(Y - cy) / half, 0, 1)
        # licks off the top and bottom edges
        for j in range(2):
            x0 = 16 * j + ((4 * k + 3) % 16)
            for xx in (x0, x0 + 16, x0 - 16):
                f = np.maximum(f, tongue(X, Y, [(xx, cy[0, 0] - 2), (xx - 2.5, 3.2), (xx - 5, 1.2)], 1.6, 0.3, 0.7, 0.2))
                f = np.maximum(f, tongue(X, Y, [(xx + 7, 10.5), (xx + 4.5, 12.8), (xx + 2.5, 14.6)], 1.4, 0.3, 0.65, 0.2))
        big = fire(f)
        img = Img(16)
        img.a = big.a[:, 16:32].copy()
        for x0, y0 in ((2, 5), (10, 11)):
            xx = (x0 + 4 * k) % 16
            if not img.has(xx, y0 - 4):
                pass
        out.append(img)
    return out


TRAIL = [
    ["........",
     "....2...",
     "...242..",
     "..24542.",
     "..45654.",
     "..24642.",
     "...222..",
     "........"],
    ["........",
     "........",
     "...2....",
     "...42...",
     "..2552..",
     "..2464..",
     "...22...",
     "........"],
    ["...s....",
     "..s.....",
     "...5....",
     "...3....",
     "........",
     "...2....",
     "........",
     "........"],
    ["..s.....",
     "...s....",
     "........",
     "...2....",
     "........",
     "........",
     "........",
     "........"],
]


def trail():
    out = []
    cmap = {str(i): R[i] for i in range(8)}
    cmap["s"] = SMOKE[2]
    for rows in TRAIL:
        img = Img(8)
        stamp(img, 0, 0, rows, cmap, anchor="tl")
        out.append(img)
    return out


def status():
    """status_burn: a little flame flickering beside the creature (8x8, loops)."""
    rows = [
        ["........", "...2....", "...32...", "..2452..", "..3563..", "..2552..", "...22...", "........"],
        ["........", "....2...", "...23...", "..2542..", "..3653..", "..2552..", "...22...", "........"],
        ["...2....", "...3....", "..243...", "..2552..", "..3564..", "..2552..", "...22...", "........"],
        ["........", "..2.....", "..32....", "..2452..", "..3563..", "..2552..", "...22...", "........"],
    ]
    cmap = {str(i): R[i] for i in range(8)}
    out = []
    for r in rows:
        img = Img(8)
        stamp(img, 0, 0, r, cmap, anchor="tl")
        # dark rim so it reads on bright ground
        m = img.mask()
        from fxkit import dil
        img.paint(dil(m) & ~m, R[1])
        out.append(img)
    return out
