"""Grove (plant): spinning razor leaves, thorny vines that whip out of the ground, pollen motes."""
import math
import random

import numpy as np

from fxkit import ACC, RAMP, XY, Img, clean, dil, ell, glossy, ring, sparkle, stamp, thin_alpha, tongue, wrap_crop

R = RAMP["grove"]
WOOD = ACC["grove"]


def leaf(img, cx, cy, L, Wd, ang, face=1.0, edge=True):
    """A pointed leaf centred on (cx, cy), tip toward angle ang. face -1..1 turns it (narrow = edge-on,
    negative = the paler underside)."""
    X, Y = XY(img.w, img.h)
    ca, sa = math.cos(ang), math.sin(ang)
    u = (X - cx) * ca + (Y - cy) * sa
    v = -(X - cx) * sa + (Y - cy) * ca
    t = (u + L / 2) / L
    tc = np.clip(t, 0, 1)
    half = Wd / 2 * abs(face) * np.sin(np.pi * tc) ** 0.75 * (1 + 0.25 * (1 - tc))
    m = (t >= 0) & (t <= 1) & (np.abs(v) <= np.maximum(half, 0.45))
    if not m.any():
        return img
    under = face < 0
    lite, mid, dark = (R[4], R[3], R[2]) if under else (R[5], R[4], R[3])
    s = Img(img.w, img.h)
    s.paint(m, mid)
    s.paint(m & (v < -0.15 * half), lite)
    s.paint(m & (v > 0.35 * half), dark)
    if abs(face) > 0.45:  # the midrib
        s.paint(m & (np.abs(v) < 0.5) & (t > 0.08) & (t < 0.85), R[2] if not under else R[3])
        s.paint(m & (v < -0.4 * half) & (v > -0.8 * half) & (t > 0.25) & (t < 0.45), R[6])
    if edge:
        s.paint(dil(m) & ~m, R[0])
    # a short stem
    s.px(cx - ca * (L / 2 + 0.8), cy - sa * (L / 2 + 0.8), WOOD[2])
    return img.over(s)


def vine(X, Y, pts, w0=1.8, w1=0.6):
    return tongue(X, Y, pts, w0, w1, 1.0, 0.8, n=40, power=0.8)


def draw_vine(img, f, thorns=(), leaves=()):
    """Shade a vine field; thorns = [(x, y)], leaves = [(x, y, angle, size)]."""
    glossy(img, f, R, cuts=((0.0, 1), (0.28, 2), (0.5, 3), (0.72, 4)), shine=(0.9, 5), edge=0)
    for (x, y) in thorns:
        if not img.has(x, y):
            img.px(x, y, WOOD[1])
    for (x, y, a, sz) in leaves:
        leaf(img, x, y, sz, sz * 0.55, a)
    return img


def mote(img, x, y, big=False):
    if big:
        sparkle(img, x, y, 2, (R[4], R[5], R[6]))
    else:
        img.px(x, y, R[5])


def projectile():
    out = []
    faces = [1.0, 0.45, -0.75, 0.15]
    for k in range(4):
        img = Img(16)
        X, Y = XY(16)
        # a pale swoosh of wind curling behind the leaf
        sw = ring(X, Y, 8.5, 8, 6.5, 4.5, 0.6)
        arc = (sw > 0.3) & (X < 7.5) & ((Y < 6.5) if k % 2 == 0 else (Y > 9.5))
        img.paint(arc, R[5])
        img.paint(arc & (X < 4.5), R[4])
        leaf(img, 9.5, 8, 11, 6.4, -0.12 + (0.25 if k % 2 else 0), faces[k])
        for (x, y) in [((2 - 3 * k) % 7 + 1, 4 + 2 * (k % 2)), ((5 - 3 * k) % 7 + 1, 12 - (k % 2))]:
            if not img.has(x, y):
                mote(img, x, y)
        out.append(img)
    return out


def curl_pts(cx, cy, a, L, curl, n=12):
    """A tendril leaving (cx, cy) at angle a; it bends more and more toward the tip (a spiral curl)."""
    pts = [(cx, cy)]
    x, y = cx, cy
    for i in range(n):
        t = (i + 1) / n
        a += curl * 2.2 * t * t / n * 1.4
        step = L / n * (1.0 - 0.35 * t)
        x += step * math.cos(a)
        y += step * math.sin(a)
        pts.append((x, y))
    return pts


def thorns_on(pts, every=3, dist=2.2):
    """Thorn pixels sticking out of alternate sides of a tendril."""
    out = []
    for i in range(2, len(pts) - 2, every):
        (x0, y0), (x1, y1) = pts[i - 1], pts[i + 1]
        nx, ny = -(y1 - y0), (x1 - x0)
        nn = math.hypot(nx, ny) or 1
        s = 1 if (i // every) % 2 else -1
        out.append((pts[i][0] + s * dist * nx / nn, pts[i][1] + s * dist * ny / nn))
    return out


def impact():
    out = []
    W, c = 32, 16
    rng = random.Random(4)
    tendrils = [(-2.4, 1.6), (-0.6, -1.7), (1.3, 1.5)]  # angle, curl
    for k in range(6):
        X, Y = XY(W)
        img = Img(W)
        if k == 0:
            sparkle(img, c, c, 4, (R[4], R[5], R[6]))
            for a in (0.6, 2.2, 3.8, 5.4):
                mote(img, c + 5 * math.cos(a), c + 5 * math.sin(a))
        elif k in (1, 2, 3):
            L = {1: 8, 2: 14, 3: 11}[k]
            f = np.zeros_like(X)
            thorns, leaves = [], []
            for a, cu in tendrils:
                pts = curl_pts(c, c, a, L, cu * (0.5 if k == 1 else 1.0))
                f = np.maximum(f, vine(X, Y, pts, 1.7 if k < 3 else 1.3, 0.5))
                thorns += thorns_on(pts, 3, 2.0)
            if k == 1:
                f = np.maximum(f, ell(X, Y, c, c, 4.5) * 0.9)
            draw_vine(img, f, thorns)
            if k == 1:
                img.paint(ell(X, Y, c, c, 3.5) > 0.2, R[6])
                img.paint(ell(X, Y, c, c, 1.8) > 0.2, R[7])
            n = 7
            for i in range(n):
                a = i * 2 * math.pi / n + 0.4 + k * 0.3
                rr = {1: 7, 2: 10, 3: 11.5}[k]
                x, y = c + rr * math.cos(a), c + rr * math.sin(a) + (k - 1)
                leaf(img, x, y, 6 if k > 1 else 5, 3.4, a + (k - 1) * 0.9, [1, 0.6, -0.6, 0.3][(i + k) % 4])
            if k >= 2:
                for i in range(5):
                    a = rng.uniform(0, 2 * math.pi)
                    x, y = c + 14 * math.cos(a), c + 14 * math.sin(a)
                    if not img.has(x, y):
                        mote(img, x, y, i == 0)
        else:  # leaves flutter down, turning
            n = 6 if k == 4 else 4
            for i in range(n):
                a = i * 2 * math.pi / n + 1.0
                rr = 11.5 if k == 4 else 12
                x, y = c + rr * math.cos(a), c + rr * 0.8 * math.sin(a) + (k - 3) * 3
                if 3 <= x < 29 and 3 <= y < 29:
                    leaf(img, x, y, 5, 3, 0.3 + i * 1.1 + k, [0.4, -0.8, 1, -0.3][i % 4])
            for i in range(4):
                a = rng.uniform(0, 2 * math.pi)
                x, y = c + 12 * math.cos(a), c + 10 * math.sin(a)
                if not img.has(x, y):
                    mote(img, x, y)
            if k == 5:
                thin_alpha(img, 0.75, 2, protect=[R[0]])
                clean(img, keep_alone=[R[5]])
        out.append(img)
    return out


def burst():
    out = []
    W = 64
    gx, gy = 32, 48
    rng = random.Random(8)
    n = 7
    spots = []
    for i in range(n):
        a = i * 2 * math.pi / n + 0.25
        spots.append((gx + 21 * math.cos(a), gy + 21 * 0.36 * math.sin(a), a))
    spots.sort(key=lambda s: s[1])  # far vines first, near ones drawn over them
    for k in range(8):
        X, Y = XY(W)
        img = Img(W)
        # a dark ring of torn-up earth, with green glowing cracks early on
        if k <= 6:
            band = ring(X, Y, gx, gy, 22, 22 * 0.36, 1.4)
            hsh = ((X * 5 + Y * 11).astype(int) * 2654435761 % 89) / 89.0
            img.paint((band > 0.3) & (hsh < 0.5), WOOD[1])
            img.paint((band > 0.3) & (hsh < 0.18), WOOD[0])
            if k <= 1:
                img.paint((band > 0.5) & (hsh > 0.85), R[5])
        for idx, (sx, sy, a) in enumerate(spots):
            side = 1 if sx >= gx else -1
            h = {0: 0, 1: 8, 2: 27, 3: 36, 4: 33, 5: 16, 6: 0, 7: 0}[k] * (0.85 + 0.3 * ((idx * 3) % 4) / 3)
            if k == 0:
                leaf(img, sx - 1.5, sy - 2, 4, 2.4, -2.4)
                leaf(img, sx + 1.5, sy - 2, 4, 2.4, -0.7)
                continue
            if h <= 0:
                continue
            f = np.zeros_like(X)
            if k <= 3:  # rising, the tip curling outward
                pts = curl_pts(sx, sy, -math.pi / 2 - side * 0.15, h, side * (2.6 if k == 3 else 1.4))
            elif k == 4:  # lashing in toward the middle
                pts = curl_pts(sx, sy, -math.pi / 2 + side * 0.2, h, -side * 3.0)
            else:  # pulling back into the earth
                pts = curl_pts(sx, sy, -math.pi / 2, h, side * 1.0)
            f = np.maximum(f, vine(X, Y, pts, 2.1 if k >= 2 else 1.7, 0.55))
            thorns = thorns_on(pts, 3, 2.4)
            leaves = []
            if k in (2, 3, 4):
                i = len(pts) // 3
                (x0, y0), (x1, y1) = pts[i - 1], pts[i + 1]
                nx, ny = -(y1 - y0), (x1 - x0)
                nn = math.hypot(nx, ny) or 1
                s_ = -side
                leaves.append((pts[i][0] + s_ * 3.6 * nx / nn, pts[i][1] + s_ * 3.6 * ny / nn, math.atan2(s_ * ny, s_ * nx) - 0.5, 6))
            draw_vine(img, f, thorns, leaves)
        # leaves swirl around once the vines are up
        if 3 <= k <= 7:
            m = {3: 6, 4: 8, 5: 10, 6: 8, 7: 5}[k]
            for i in range(m):
                a = i * 2 * math.pi / m + k * 0.7
                rr = 12 + (k - 3) * 4
                x, y = gx + rr * math.cos(a), gy - 18 + rr * 0.55 * math.sin(a) + (k - 5) * 3 * (k > 5)
                if 4 <= x < 60 and 4 <= y < 60:
                    leaf(img, x, y, 6, 3.4, a + 1.2 + k, [1, 0.5, -0.7, 0.2][(i + k) % 4])
        if k >= 2:
            for i in range(8 if k < 7 else 4):
                x, y = rng.uniform(8, 56), rng.uniform(10, 50)
                if not img.has(x, y):
                    mote(img, x, y, i % 4 == 0)
        if k == 7:
            thin_alpha(img, 0.7, 6, protect=[R[0]])
            clean(img, keep_alone=[R[5]])
        out.append(img)
    return out


def beam():
    """Two thorny vines braided together, a leaf every half turn; tileable, scrolls right 4 px a frame."""
    out = []
    for k in range(4):
        X, Y = XY(48, 16)
        p = (X - 4 * k) * 2 * math.pi / 16
        big = Img(48, 16)
        ya = 8 + 2.4 * np.sin(p)
        yb = 8 - 2.4 * np.sin(p)
        fa = np.clip(1 - np.abs(Y - ya) / 1.35, 0, 1)
        fb = np.clip(1 - np.abs(Y - yb) / 1.35, 0, 1)
        front_a = np.cos(p) > 0
        back = np.where(front_a, fb, fa)
        front = np.where(front_a, fa, fb)
        # a faint green glow streak behind the braid
        glow = (np.abs(Y - 8) < 1.0) & (np.sin(p * 2) > -0.3)
        big.paint(glow, R[5])
        sb = Img(48, 16)
        glossy(sb, back, R, cuts=((0.0, 1), (0.4, 2), (0.75, 3)), shine=None, edge=0)
        big.over(sb)
        sf = Img(48, 16)
        glossy(sf, front, R, cuts=((0.0, 2), (0.35, 3), (0.65, 4)), shine=(0.85, 5), edge=0)
        big.over(sf)
        img = wrap_crop(big, 16)
        # thorns and a leaf, fixed to the vine so they travel with it
        for (x0, y0) in ((2, 3), (10, 13)):
            xx = (x0 + 4 * k) % 16
            if not img.has(xx, y0):
                img.px(xx, y0, WOOD[1])
        tmp = Img(48, 16)
        for off in (0, 16, 32):
            leaf(tmp, (4 + 4 * k) % 16 + off - 2, 3.0, 5, 3.0, -0.6)
            leaf(tmp, (12 + 4 * k) % 16 + off - 2, 13.0, 5, 3.0, 0.6)
        img.over(wrap_crop(tmp, 16))
        out.append(img)
    return out


def trail():
    """A small leaf twirling down and fading."""
    out = []
    for k, (x, y, a, face) in enumerate([(4, 2.5, 0.4, 1), (3.5, 4, 1.6, 0.4), (4.5, 5, 2.8, -0.8), (4, 6.2, 3.8, 0.3)]):
        img = Img(8)
        leaf(img, x, y, 5, 3, a, face, edge=k < 3)
        if k == 3:
            thin_alpha(img, 0.5, 1)
        out.append(img)
    return out


def status():
    """status_leaf: a seed-leaf twirling in place with a pollen glint (loops)."""
    out = []
    for k, (a, face) in enumerate([(-0.6, 1), (-0.3, 0.35), (0.0, -0.8), (-0.3, 0.35)]):
        img = Img(8)
        leaf(img, 4, 4, 6, 3.6, a, face)
        img.px([6, 1, 6, 1][k], [1, 6, 6, 1][k], R[6])
        out.append(img)
    return out
