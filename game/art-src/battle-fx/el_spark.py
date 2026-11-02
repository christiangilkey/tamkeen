"""Spark (electric): jagged white-cored bolts with yellow glow, cyan side-arcs, popping sparks."""
import math
import random

import numpy as np

from fxkit import ACC, RAMP, XY, Img, bands, clean, dil, ell, line, ring, sparkle, stamp, thin_alpha, wrap_crop

R = RAMP["spark"]
CY = ACC["spark"]  # navy, blue, cyan, ice
YEL = (R[2], R[4], R[6])  # edge, glow, core
BLUE = (CY[0], CY[2], CY[3])


def bolt_path(rng, x0, y0, x1, y1, rough=0.3, depth=None):
    """Lightning: straight runs of 2-5 px that kink hard from side to side around the line from
    (x0, y0) to (x1, y1), ending exactly on it."""
    L = math.hypot(x1 - x0, y1 - y0)
    if L < 1:
        return [(x0, y0), (x1, y1)]
    dx, dy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -dy, dx
    dev = max(1.2, min(4.0, L * rough * 0.6))
    pts = [(x0, y0)]
    t, o, side = 0.0, 0.0, rng.choice((-1, 1))
    while True:
        run = rng.uniform(2.0, 4.5)
        t += run * rng.uniform(0.55, 0.9)
        if t >= L - 1.5:
            break
        o = max(-dev, min(dev, o + side * run * rng.uniform(0.5, 0.9)))
        side = -side if rng.random() < 0.8 else side
        pts.append((x0 + dx * t + nx * o, y0 + dy * t + ny * o))
    pts.append((x1, y1))
    return pts


def bolt(img, pts, cols=YEL, thick=False, edge=None):
    """Draw a bolt: white core, glow around it, dark edge so it reads on bright ground."""
    m = np.zeros((img.h, img.w), bool)
    tmp = Img(img.w, img.h)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        for (x, y) in line(tmp, ax, ay, bx, by, "#ffffff"):
            if 0 <= x < img.w and 0 <= y < img.h:
                m[y, x] = True
    if thick:
        m2 = m.copy()
        m2[:, 1:] |= m[:, :-1]
        m = m2
    if edge is None:
        edge = cols is YEL or thick
    g = dil(m)
    e = dil(g)
    s = Img(img.w, img.h)
    if edge:
        s.paint(e & ~g, cols[0])
    s.paint(g & ~m, cols[1])
    s.paint(m, cols[2])
    return img.over(s)


def branches(rng, pts, count, length, spread=0.9):
    """Short forks off a bolt."""
    out = []
    for _ in range(count):
        i = rng.randrange(2, max(3, len(pts) - 2))
        (ax, ay), (bx, by) = pts[i - 1], pts[i]
        a = math.atan2(by - ay, bx - ax) + rng.choice((-1, 1)) * rng.uniform(0.4, spread)
        L = rng.uniform(length * 0.6, length)
        out.append(bolt_path(rng, bx, by, bx + L * math.cos(a), by + L * math.sin(a), 0.35, 2))
    return out


def orb(img, cx, cy, r):
    X, Y = XY(img.w, img.h)
    f = ell(X, Y, cx, cy, r)
    return bands(f, R, [(0.0, 3), (0.3, 4), (0.55, 5), (0.75, 6)], edge=1, img=img)


def spark_dot(img, x, y, size, cyan=False):
    cols = (CY[1], CY[2], CY[3]) if cyan else (R[3], R[5], R[6])
    sparkle(img, x, y, size, cols)


def projectile():
    out = []
    for k in range(4):
        rng = random.Random(100 + k)
        img = Img(16)
        # a crackling tail
        tail = bolt_path(rng, 8, 8, 1, 8 + rng.uniform(-3, 3), 0.35, 3)
        bolt(img, tail, BLUE)
        for _ in range(3):  # arcs leaping off the ball
            a = rng.uniform(-math.pi, math.pi)
            p = bolt_path(rng, 10 + 3 * math.cos(a), 8 + 3 * math.sin(a), 10 + 6.5 * math.cos(a), 8 + 6.5 * math.sin(a), 0.4, 2)
            bolt(img, p, YEL)
        orb(img, 10.2, 8, 3.6)
        img.px(9, 6, R[6])
        spark_dot(img, [3, 5, 2, 6][k], [3, 13, 12, 2][k], 1, cyan=True)
        out.append(img)
    return out


def impact():
    out = []
    W, c = 32, 16
    for k in range(6):
        rng = random.Random(200 + k)
        X, Y = XY(W)
        img = Img(W)
        if k == 0:
            for a in (0.3, 1.9, 3.4, 5.0):
                bolt(img, bolt_path(rng, c, c, c + 6 * math.cos(a), c + 6 * math.sin(a), 0.4, 2), BLUE)
            orb(img, c, c, 3)
        elif k == 1:  # the strike: white flash, bolts in every direction
            for i in range(8):
                a = i * math.pi / 4 + rng.uniform(-0.25, 0.25)
                L = 12 if i % 2 == 0 else 10
                p = bolt_path(rng, c, c, c + L * math.cos(a), c + L * math.sin(a), 0.32)
                bolt(img, p, YEL if i % 2 == 0 else BLUE)
            f = ell(X, Y, c, c, 5.5)
            bands(f, R, [(0.0, 4), (0.3, 5), (0.5, 6)], edge=1, img=img)
        elif k == 2:  # a ring of static, arcs still jumping out
            rr = ring(X, Y, c, c, 8, 8, 0.8)
            img.paint(dil(rr > 0.35) & ~(rr > 0.35), CY[0])
            img.paint(rr > 0.35, CY[2])
            for i in range(6):
                a = i * math.pi / 3 + 0.5 + rng.uniform(-0.3, 0.3)
                p = bolt_path(rng, c + 7 * math.cos(a), c + 7 * math.sin(a), c + 13 * math.cos(a), c + 13 * math.sin(a), 0.35, 3)
                bolt(img, p, YEL if i % 2 else BLUE)
            orb(img, c, c, 3.4)
        elif k == 3:  # thin crawling arcs and the first sparks
            for i in range(4):
                a = i * math.pi / 2 + 1.0 + rng.uniform(-0.3, 0.3)
                p = bolt_path(rng, c + 4 * math.cos(a), c + 4 * math.sin(a), c + 12 * math.cos(a + 0.6), c + 12 * math.sin(a + 0.6), 0.4, 3)
                bolt(img, p, BLUE)
            for i in range(6):
                a = i * math.pi / 3 + 0.2
                spark_dot(img, c + 13 * math.cos(a), c + 13 * math.sin(a), 2, cyan=i % 2 == 0)
            img.px(c, c, R[5])
        else:  # sparks fly off and wink out
            n = 7 if k == 4 else 4
            for i in range(n):
                a = i * 2 * math.pi / n + 0.4 * k
                rr = 13 if k == 4 else 14
                spark_dot(img, c + rr * math.cos(a), c + rr * math.sin(a) + (k - 4) * 2, 2 if (k == 4 and i % 2) else 1, cyan=i % 3 == 0)
            if k == 4:
                p = bolt_path(rng, c - 5, c + 2, c + 5, c - 1, 0.5, 2)
                bolt(img, p, BLUE)
        out.append(img)
    return out


def burst():
    out = []
    W = 64
    gx, gy = 32, 48
    for k in range(8):
        rng = random.Random(300 + k)
        X, Y = XY(W)
        img = Img(W)
        if k == 0:  # the air charges: a target ring of static and a thin leader from the sky
            rr = ring(X, Y, gx, gy, 12, 4.4, 0.7)
            hsh = (np.sin(X * 2.1) > 0.2)
            img.paint((rr > 0.35) & hsh, CY[2])
            p = bolt_path(rng, gx + 2, 0, gx, gy - 2, 0.12, 4)
            for (x, y) in p[::2]:
                img.px(x, y, CY[2])
            for i in range(5):
                spark_dot(img, gx + rng.uniform(-10, 10), gy + rng.uniform(-3, 3), 1, cyan=True)
        else:
            # the ground flash and its ring of crawling static
            ground = {1: (12, 0.9), 2: (14, 0.6), 3: (10, 0.35), 4: (0, 0), 5: (0, 0), 6: (0, 0), 7: (0, 0)}[k]
            if ground[1]:
                f = ell(X, Y, gx, gy, ground[0] * 0.75, ground[0] * 0.75 * 0.36) * ground[1]
                bands(f, R, [(0.0, 3), (0.25, 4), (0.45, 5), (0.6, 6)], edge=1, img=img)
            if 2 <= k <= 6:  # crackles race out along the ground, then flicker on a ring
                rng2 = random.Random(350)
                spokes = [i * 2 * math.pi / 7 + rng2.uniform(-0.25, 0.25) for i in range(7)]
                if k <= 4:
                    reach = {2: 0.55, 3: 0.85, 4: 1.0}[k]
                    for i, a in enumerate(spokes):
                        r0 = 0 if k == 2 else (k - 2) * 7
                        p = bolt_path(rng, gx + r0 * math.cos(a), gy + r0 * 0.36 * math.sin(a),
                                      gx + 26 * reach * math.cos(a), gy + 26 * reach * 0.36 * math.sin(a), 0.25)
                        bolt(img, p, YEL if i % 2 else BLUE)
                n = {2: 0, 3: 4, 4: 7, 5: 6, 6: 4}[k]
                for i in range(n):
                    a0 = spokes[i % 7] + 0.2
                    a1 = a0 + rng.uniform(0.35, 0.6)
                    p = bolt_path(rng, gx + 26 * math.cos(a0), gy + 26 * 0.36 * math.sin(a0),
                                  gx + 26 * math.cos(a1), gy + 26 * 0.36 * math.sin(a1), 0.3)
                    bolt(img, p, BLUE if (i + k) % 2 else YEL)
            # the bolt from the sky
            if k in (1, 2, 3):
                main = bolt_path(random.Random(300), gx + 3, -2, gx, gy - 1, 0.2, 5)
                if k == 2:
                    main = bolt_path(random.Random(301), gx - 2, -2, gx, gy - 1, 0.2, 5)
                for br in branches(random.Random(310 + k), main, 4 if k < 3 else 2, 12):
                    bolt(img, br, YEL if k < 3 else BLUE)
                bolt(img, main, YEL if k < 3 else BLUE, thick=k == 1)
                if k == 1:  # the flash where it lands
                    f = ell(X, Y, gx, gy - 2, 6, 4)
                    bands(f, R, [(0.0, 5), (0.4, 6)], edge=1, img=img)
            # sparks thrown up
            if k >= 3:
                for i in range({3: 8, 4: 10, 5: 8, 6: 6, 7: 4}[k]):
                    a = rng.uniform(-math.pi, 0)
                    d = (k - 2) * 5 + rng.uniform(0, 6)
                    x, y = gx + d * math.cos(a) * 1.2, gy - 6 + d * math.sin(a) * 0.8 + (k - 3) ** 2 * 0.6
                    if 1 <= x < 63 and 1 <= y < 63:
                        spark_dot(img, x, y, 2 if (i + k) % 3 == 0 and k < 7 else 1, cyan=i % 2 == 0)
        out.append(img)
    return out


def beam():
    """A crackling lightning beam: a new jag every frame, ends level so it tiles."""
    out = []
    for k in range(4):
        rng = random.Random(400 + k)
        big = Img(48, 16)
        main = bolt_path(rng, 0, 8, 16, 8, 0.28, 4)
        side = bolt_path(rng, 0, 8, 16, 8, 0.45, 3)
        for off in (0, 16, 32):
            sp = [(x + off, y) for x, y in side]
            bolt(big, sp, BLUE)
        for off in (0, 16, 32):
            mp = [(x + off, y) for x, y in main]
            bolt(big, mp, YEL, thick=True)
        img = wrap_crop(big, 16)
        for (x, y) in ((rng.randrange(16), rng.choice((2, 13))),):
            if not img.has(x, y):
                img.px(x, y, CY[3])
        out.append(img)
    return out


def trail():
    cm = {"a": R[3], "b": R[5], "c": R[6], "d": CY[2], "e": CY[1], "o": R[1]}
    rows = [
        ["........", "...a....", "...b....", ".abcba..", "...b....", "...a....", "........", "........"],
        ["........", "..d.d...", "...c....", "..d.d...", "........", "........", "........", "........"],
        ["........", "........", "..d.....", "....a...", "........", "........", "........", "........"],
        ["........", "........", "........", "...e....", "........", "........", "........", "........"],
    ]
    out = []
    for r in rows:
        img = Img(8)
        stamp(img, 0, 0, r, cm, anchor="tl")
        out.append(img)
    return out


def status():
    """status_spark: a little zigzag of static that flickers (paralysis)."""
    cm = {"o": R[1], "y": R[4], "w": R[6], "c": CY[2]}
    rows = [
        ["....oo..", "...owyo.", "..owyo..", ".owwwwo.", "..oywo..", ".oywo...", ".oyo....", "..o....."],
        ["........", "....c...", "...c....", "..cccc..", "....c...", "...c....", "........", "........"],
        ["..oo....", ".oywo...", "..oywo..", ".owwwwo.", "...oywo.", "..oywo..", "...oyo..", "....o..."],
        ["........", "........", "....c...", "........", "..c.....", "........", "........", "........"],
    ]
    out = []
    for r in rows:
        img = Img(8)
        stamp(img, 0, 0, r, cm, anchor="tl")
        out.append(img)
    return out
