"""Stone (rock): faceted tumbling rocks, spikes bursting from cracked ground, dust clouds and pebbles."""
import math
import random

import numpy as np

from fxkit import ACC, RAMP, XY, Img, clean, cloud, dil, ell, facet_shard, line, ring, rot, stamp, thin_alpha, wrap_crop, polymask

R = RAMP["stone"]
DUST = ACC["stone"]
ROCK = (R[0], R[2], R[3], R[4], R[5])
DUSTC = ("#5a4c3c", "#86765e", "#a8977a", "#c8b898", "#e4d8bc")


def rock(img, cx, cy, size, ang, seed=0, cols=ROCK):
    """An irregular faceted rock centred on (cx, cy)."""
    rng = random.Random(seed)
    n = 7
    pts = []
    for i in range(n):
        a = i * 2 * math.pi / n + rng.uniform(-0.25, 0.25)
        r = size * rng.uniform(0.75, 1.0)
        pts.append((r * math.cos(a), r * 0.85 * math.sin(a)))
    pts = rot(pts, ang, cx, cy)
    facet_shard(img, pts, cols)
    return img


def pebble(img, x, y, big=False):
    if big:
        stamp(img, x, y, [".ab.", "abcd", ".dd."], {"a": R[4], "b": R[5], "c": R[3], "d": R[1]})
    else:
        img.px(x, y, R[4])
        img.px(x + 1, y, R[2])


def dust(img, blobs, fade=0.0):
    return cloud(img, blobs, DUSTC, fade)


def spike(img, bx, by, h, w, lean=0.0, seed=0, crack=False):
    """A rock spike standing on (bx, by): pointed, with a lit left face and a shaded right face."""
    if h < 2:
        return img
    rng = random.Random(seed)
    tip = (bx + lean, by - h)
    pts = [(bx - w / 2, by), (bx - w * 0.38 + lean * 0.35, by - h * 0.45 + rng.uniform(-1, 1)), tip,
           (bx + w * 0.42 + lean * 0.4, by - h * 0.55 + rng.uniform(-1, 1)), (bx + w / 2, by)]
    m = polymask(img.w, img.h, pts)
    X, Y = XY(img.w, img.h)
    # the ridge from the tip to the base splits the faces
    t = np.clip((by - Y) / h, 0, 1)
    ridge = bx + lean * t + w * 0.08
    s = Img(img.w, img.h)
    s.paint(m, R[2])
    s.paint(m & (X < ridge), R[4])
    s.paint(m & (X < ridge - w * 0.22), R[3])
    s.paint(m & (np.abs(X - ridge) < 0.6) & (t > 0.2), R[5])
    s.paint(m & (X > ridge + w * 0.25), R[1])
    s.paint(dil(m) & ~m, R[0])
    img.over(s)
    if crack:  # a dark crack zigzagging down the face
        x, y = bx + lean * 0.6, by - h * 0.65
        for i in range(4):
            nx, ny = x + rng.choice((-1, 1)), y + 2
            line(img, x, y, nx, ny, R[0])
            x, y = nx, ny
    return img


def cracks(img, gx, gy, length, n, seed, col=None):
    """Dark cracks running out across the ground from (gx, gy)."""
    rng = random.Random(seed)
    for i in range(n):
        a = i * 2 * math.pi / n + rng.uniform(-0.3, 0.3)
        x, y = gx, gy
        steps = int(length / 3)
        for s in range(steps):
            a2 = a + rng.uniform(-0.6, 0.6)
            nx, ny = x + 3 * math.cos(a2), y + 3 * 0.4 * math.sin(a2)
            line(img, x, y, nx, ny, col or R[0])
            x, y = nx, ny
    return img


def projectile():
    out = []
    for k in range(4):
        img = Img(16)
        dust(img, [(3.5 - k * 0.3, 8 + (1 if k % 2 else -1) * 0.5, 2.0 + 0.2 * k)], fade=0.0)
        img.px((1 + k * 2) % 6, 5 + k % 2, DUST[3])
        rock(img, 10.2, 8, 4.4, k * math.pi / 6, seed=7)
        pebble(img, [6, 5, 7, 4][k], [12, 3, 13, 4][k])
        out.append(img)
    return out


def impact():
    out = []
    W, c = 32, 16
    rng = random.Random(21)
    angs = [i * 2 * math.pi / 7 + 0.3 for i in range(7)]
    for k in range(6):
        img = Img(W)
        if k == 0:  # first crack of contact
            stamp(img, c, c, ["...a...", "..aba..", ".abcba.", "abc.cba", ".abcba.", "..aba..", "...a..."],
                  {"a": R[3], "b": R[5], "c": R[6]})
            for a in angs[::2]:
                pebble(img, c + 6 * math.cos(a), c + 6 * math.sin(a))
        elif k == 1:  # the smash: a burst of dust with chunks flung out
            dust(img, [(c, c, 6), (c - 4, c + 2, 4), (c + 4, c + 1, 4.5)])
            for i, a in enumerate(angs):
                rock(img, c + 8 * math.cos(a), c + 8 * math.sin(a), 2.6 if i % 2 else 2.0, a, seed=i)
            stamp(img, c - 1, c - 1, ["..a..", ".aba.", "abcba", ".aba.", "..a.."], {"a": R[5], "b": R[6], "c": "#ffffff"})
        elif k in (2, 3):
            rr = 10 if k == 2 else 12
            puffs = [(c + 7 * math.cos(a), c + 6 * math.sin(a) + 1, 4.2 if k == 2 else 3.8) for a in angs[::2]]
            dust(img, puffs + [(c, c, 4.5 if k == 2 else 3)])
            for i, a in enumerate(angs):
                drop = 0 if k == 2 else 1
                rock(img, c + rr * math.cos(a), c + rr * math.sin(a) + drop, 2.3 if i % 2 else 1.8, a + k, seed=i)
        elif k == 4:  # chunks land, dust settles low
            dust(img, [(c - 7, c + 6, 3.2), (c + 6, c + 7, 3.5), (c, c + 5, 2.8)], fade=0.3)
            for i, a in enumerate(angs[::2]):
                pebble(img, c + 13 * math.cos(a), c + 9 + 2 * math.sin(a), big=i % 2 == 0)
        else:
            dust(img, [(c - 7, c + 8, 2.6), (c + 6, c + 9, 2.8)], fade=0.7)
            for i, a in enumerate(angs[1::2]):
                pebble(img, c + 13 * math.cos(a), c + 11 + 2 * math.sin(a))
        out.append(clean(img, keep_alone=R + DUST))
    return out


def burst():
    out = []
    W = 64
    gx, gy = 32, 48
    rng = random.Random(31)
    ring_sp = []
    for i in range(8):
        a = i * 2 * math.pi / 8 + 0.2
        ring_sp.append((gx + 19 * math.cos(a), gy + 19 * 0.36 * math.sin(a), i))
    outer = []
    for i in range(10):
        a = i * 2 * math.pi / 10 + 0.5
        outer.append((gx + 26 * math.cos(a), gy + 26 * 0.36 * math.sin(a), i + 20))
    for k in range(8):
        img = Img(W)
        X, Y = XY(W)
        if k <= 5:
            cracks(img, gx, gy, {0: 10, 1: 20, 2: 26, 3: 28, 4: 28, 5: 28}[k], 7, 5)
        if k == 0:
            for i in range(5):
                pebble(img, gx + rng.uniform(-10, 10), gy - rng.uniform(2, 6))
        sp_h = {1: 6, 2: 18, 3: 22, 4: 21, 5: 10}.get(k, 0)
        out_h = {2: 5, 3: 12, 4: 11, 5: 5}.get(k, 0)
        mid_h = {1: 8, 2: 26, 3: 30, 4: 28, 5: 12}.get(k, 0)
        spikes = []
        if out_h:
            spikes += [(x, y, out_h * (0.8 + 0.4 * (s % 3) / 2), 6, s) for x, y, s in outer]
        if sp_h:
            spikes += [(x, y, sp_h * (0.85 + 0.3 * (s % 3) / 2), 8, s) for x, y, s in ring_sp]
        if mid_h:
            spikes.append((gx, gy, mid_h, 12, 99))
        for x, y, h, w, s in sorted(spikes, key=lambda q: q[1]):  # far first
            lean = (x - gx) * 0.12
            spike(img, x, y, h, w, lean, seed=s, crack=k >= 4)
            if k in (2, 3) and h > 4:
                dust(img, [(x - 3, y + 1, 2.4), (x + 3, y + 1, 2.2)])
        if k >= 3:  # debris flung up
            for i in range({3: 8, 4: 9, 5: 8, 6: 6, 7: 3}[k]):
                a = rng.uniform(-math.pi, 0)
                d = (k - 2) * 6 + rng.uniform(0, 6)
                x, y = gx + d * math.cos(a) * 1.3, gy - 22 + d * math.sin(a) * 0.6 + (k - 3) ** 2 * 1.4
                if 5 <= x < 59 and 5 <= y < 59:
                    if i % 3 == 0 and k < 6:
                        rock(img, x, y, 1.8, i + k, seed=i)
                    else:
                        pebble(img, x, y)
        if k >= 5:  # dust rolls out as the spikes crumble
            puffs = [(gx + 22 * math.cos(a), gy - 3 + 7 * math.sin(a), 5) for a in np.linspace(0, 2 * math.pi, 7, endpoint=False)]
            puffs += [(gx, gy - 8, 6)] if k == 5 else []
            dust(img, puffs, fade={5: 0.0, 6: 0.3, 7: 0.75}[k])
            if k == 6:
                for i in range(8):
                    a = i * 2 * math.pi / 8
                    pebble(img, gx + 15 * math.cos(a), gy + 6 * math.sin(a), big=i % 3 == 0)
        out.append(clean(img, keep_alone=R + DUST))
    return out


def beam():
    """A rockslide stream: rolling dust with boulders and pebbles riding in it; tileable, scrolls right 4 px a frame."""
    out = []
    for k in range(4):
        big = Img(48, 16)
        blobs = []
        for off in (-16, 0, 16, 32, 48):
            for (x0, y0, r) in ((1, 8.5, 3.3), (6, 7.2, 3.0), (11, 8.8, 3.4)):
                blobs.append((x0 + 4 * k + off, y0, r))
        cloud(big, blobs, DUSTC)
        for off in (-16, 0, 16, 32):
            rock(big, (3 + 4 * k) % 16 + off, 8.5, 2.9, k * 0.8, seed=3)
            rock(big, (10 + 4 * k) % 16 + off, 7.0, 2.0, -k * 0.8, seed=5)
            pebble(big, (14 + 4 * k) % 16 + off, 11)
            pebble(big, (7 + 4 * k) % 16 + off, 4)
        out.append(wrap_crop(big, 16))
    return out


def trail():
    out = []
    for k in range(4):
        img = Img(8)
        if k < 3:
            dust(img, [(4, 4.2, [2.0, 2.3, 2.2][k])], fade=[0, 0.2, 0.6][k])
        pebble(img, [3, 4, 5, 5][k], [2, 4, 6, 7][k] - 1)
        if k == 3:
            img.px(2, 5, DUST[3])
        out.append(img)
    return out


def status():
    """status_rock: a little pebble bobbing beside the creature, shedding grit (loops)."""
    out = []
    for k, dy in enumerate([0, -1, 0, 1]):
        img = Img(8)
        rock(img, 4, 4 + dy, 2.6, k * 0.4, seed=11)
        img.px(1 + (k % 2) * 5, 7 - (k // 2), DUST[3])
        out.append(img)
    return out
