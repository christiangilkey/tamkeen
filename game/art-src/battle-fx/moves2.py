"""The second set of live-battle effects (2026-11-17, the owner: more variety in moves, "actual sprites" for areas).

Per element, in that element's colours and materials (the same palettes and helpers as el_<element>.py):
    wave    24x24, 4 frames, loop   a crescent wave front facing right: copies of it make cone and ring waves
    orb     32x32, 4 frames, loop   a big ball of energy (the Energy Orb, flying and while it gathers)
    strike  64x64, 6 frames, once   something falling from above onto the ground point (32, 56): the strikes
                                    called down on the rival (meteor, torrent, thorn spear, bolt, boulder, dark spear)
    mark    16x16, 4 frames, loop   a small ground sign, set round the edge of an area before it lands
    slash   48x48, 5 frames, once   a crescent slash sweeping down the right side (slashes and lunges)
Shared:
    burrow  16x16, 4 frames, once   churned earth pushed up by a creature burrowing underground (anchor (8, 12))
"""
from __future__ import annotations

import math
import random

import numpy as np

from fxkit import ACC, RAMP, XY, Img, bands, clean, dil, ell, glossy, line, ring, sparkle, stamp, thin_alpha, tone, tongue
import el_dusk
import el_ember
import el_grove
import el_spark
import el_stone
import el_tide

ELEMENTS = ["ember", "tide", "grove", "spark", "stone", "dusk"]


# ---------- an element's material and its small bits ----------

def material(el, f, img=None):
    """Paint a heat field in the element's own material."""
    img = img or Img(f.shape[1], f.shape[0])
    if el == "ember":
        return el_ember.fire(f, img=img)
    if el == "tide":
        return el_tide.water(f, img=img)
    if el == "grove":
        return glossy(img, f, RAMP["grove"], cuts=((0.0, 2), (0.25, 3), (0.5, 4), (0.75, 5)), shine=(0.9, 6), edge=0)
    if el == "spark":
        return bands(f, RAMP["spark"], [(0.0, 3), (0.3, 4), (0.55, 5), (0.75, 6)], edge=1, img=img)
    if el == "stone":
        return glossy(img, f, RAMP["stone"], cuts=((0.0, 1), (0.3, 2), (0.5, 3), (0.7, 4)), shine=(0.9, 5), edge=0)
    return el_dusk.shadow(f, img=img)


def bit(el, img, x, y, size, rng):
    """One small piece of the element flying off: an ember, a droplet, a pollen mote, a spark, a pebble, a glint."""
    if el == "ember":
        el_ember.ember_dot(img, x, y, 2 if size > 1 else 1)
    elif el == "tide":
        el_tide.droplet_px(img, x, y, 2 if size > 2 else 1)
    elif el == "grove":
        if size > 2:
            el_grove.leaf(img, x, y, 5, 3, rng.uniform(0, math.pi * 2))
        else:
            el_grove.mote(img, x, y, size > 1)
    elif el == "spark":
        el_spark.spark_dot(img, x, y, min(3, size), cyan=rng.random() < 0.4)
    elif el == "stone":
        el_stone.pebble(img, x, y, size > 1)
    else:
        el_dusk.glint(img, x, y, min(3, size))


def arc_pts(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / (n - 1)), cy + r * math.sin(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]


def crescent(X, Y, cx, cy, r, thick, a0, a1):
    """A band along a circle's arc from angle a0 to a1, thickest in the middle, tapering at both ends."""
    d = np.hypot(X - cx, Y - cy)
    ang = np.arctan2(Y - cy, X - cx)
    mid, half = (a0 + a1) / 2, (a1 - a0) / 2
    k = np.clip(1 - np.abs(ang - mid) / half, 0, 1)  # 1 in the middle of the arc, 0 at its ends
    w = thick * (k ** 0.6)
    return np.clip(1 - np.abs(d - r) / np.maximum(w, 1e-3), 0, 1) * (k > 0)


# ---------- wave: a crescent front facing right ----------

def wave(el):
    frames = []
    rng = random.Random(ELEMENTS.index(el) * 31 + 5)
    for i in range(4):
        img = Img(24)
        X, Y = XY(24)
        pulse = (0, 1, 1, 0)[i]
        f = crescent(X, Y, 4.5, 12, 13, 3.0 + 0.6 * pulse, -0.82, 0.82)
        if el == "stone":  # a front of rocks rolling forward
            material(el, f * 0.7, img)
            for k, (px, py) in enumerate(arc_pts(4.5, 12, 12, -0.62, 0.62, 4)):
                el_stone.rock(img, px + 0.5, py + (1 if (k + i) % 2 else 0), 2.6, 0.4 * i + k, seed=k + i * 9)
            el_stone.dust(img, [(7, 6 + 2 * i % 6, 2.2), (6, 18 - i % 3, 2.0)], fade=0.4)
        elif el == "grove":  # a sweep of razor leaves
            material(el, f * 0.55, img)
            for k, (px, py) in enumerate(arc_pts(4.5, 12, 12, -0.6, 0.6, 4)):
                el_grove.leaf(img, px, py, 6, 3, (k - 1.5) * 0.45 + 0.2 * math.sin(i + k), face=1 if (k + i) % 2 else 0.6)
        elif el == "spark":  # a front of crackling lightning
            pts = [(x + rng.uniform(-0.8, 0.8), y) for (x, y) in arc_pts(4.5, 12, 13, -0.7, 0.7, 7)]
            material(el, f * 0.6, img)
            el_spark.bolt(img, pts, thick=pulse > 0)
        else:
            material(el, f, img)
            if el == "tide":  # foam on the leading edge
                d = np.hypot(X - 4.5, Y - 12)
                img.paint((f > 0.05) & (d > 14.6) & (np.abs(Y - 12) < 8), RAMP["tide"][6])
            if el == "ember":  # flames licking back from the front
                for k, (px, py) in enumerate(arc_pts(4.5, 12, 11, -0.6, 0.6, 3)):
                    t = tongue(X, Y, [(px + 2, py), (px - 3, py + (k - 1) * 1.5 - 1), (px - 6 - i % 2, py + (k - 1) * 2)], 1.8, 0.25, 0.9, 0.2)
                    material(el, t * 0.8, img)
            if el == "dusk":  # wisps trailing behind
                for k in (-1, 1):
                    w = el_dusk.wisp(X, Y, 13, 12 + k * 6, 7, math.pi + k * 0.25, k * (0.6 + 0.2 * pulse), 1.6)
                    material(el, w * 0.8, img)
        for k in range(2):  # bits thrown off ahead of it
            bit(el, img, 16 + rng.randint(0, 3), 5 + rng.randint(0, 13), 1 + (k == 0 and i % 2), rng)
        clean(img, keep_alone=[RAMP[el][6], RAMP[el][5], RAMP[el][4]])
        frames.append(img)
    return frames


# ---------- orb: a big ball of energy ----------

def orb(el):
    frames = []
    for i in range(4):
        img = Img(32)
        X, Y = XY(32)
        rng = random.Random(ELEMENTS.index(el) * 17 + i)
        r = 9 + (0, 0.6, 1, 0.6)[i]
        a = i * math.pi / 2
        if el == "ember":  # a fireball with a ring of flame around it
            for k in range(6):
                ang = a * 0.5 + k * math.pi / 3
                t = tongue(X, Y, [(16 + 6 * math.cos(ang), 16 + 6 * math.sin(ang)), (16 + 13 * math.cos(ang + 0.3), 16 + 13 * math.sin(ang + 0.3))], 2.6, 0.2, 0.9, 0.2)
                material(el, t * 0.85, img)
            material(el, ell(X, Y, 16, 16, r), img)
        elif el == "tide":  # a sphere of water with a swirl in it
            el_tide.water(ell(X, Y, 16, 16, r), img=img, edge=0)
            el_tide.ring_px(img, X, Y, 16, 16, r - 3, (r - 3) * 0.45, (RAMP["tide"][6], RAMP["tide"][3]), gap=3)
        elif el == "grove":  # a seed orb with leaves circling it
            glossy(img, ell(X, Y, 16, 16, r - 1), RAMP["grove"], cuts=((0.0, 2), (0.3, 3), (0.5, 4), (0.7, 5)), shine=(0.88, 6), edge=0)
            for k in range(3):
                ang = a * 0.5 + k * 2 * math.pi / 3
                el_grove.leaf(img, 16 + 12 * math.cos(ang), 16 + 12 * math.sin(ang), 6, 3, ang + math.pi / 2)
        elif el == "spark":  # a crackling ball with arcs jumping off it
            el_spark.orb(img, 16, 16, r)
            for k in range(2):
                ang = a + k * math.pi + rng.uniform(-0.3, 0.3)
                pts = el_spark.bolt_path(rng, 16 + (r - 1) * math.cos(ang), 16 + (r - 1) * math.sin(ang),
                                         16 + 14 * math.cos(ang + 0.4), 16 + 14 * math.sin(ang + 0.4), 0.4)
                el_spark.bolt(img, pts, cols=el_spark.BLUE)
        elif el == "stone":  # a boulder held in a ring of dust
            el_stone.dust(img, [(16 + 8 * math.cos(a), 16 + 8 * math.sin(a), 3.0), (16 - 8 * math.cos(a), 16 - 8 * math.sin(a), 2.6)], fade=0.2)
            el_stone.rock(img, 16, 16, r + 1, a * 0.25, seed=3)
            for k in range(3):
                ang = a * 0.5 + k * 2 * math.pi / 3
                el_stone.pebble(img, 16 + 12 * math.cos(ang), 16 + 11 * math.sin(ang), big=k == 0)
        else:  # dusk: a dark sphere with a glowing rim and a glint going round it
            el_dusk.shadow(ell(X, Y, 16, 16, r), img=img, edge=0)
            for k in range(2):
                w = el_dusk.wisp(X, Y, 16 + r * math.cos(a + k * math.pi), 16 + r * math.sin(a + k * math.pi), 6, a + k * math.pi, 0.8, 1.4)
                el_dusk.shadow(w * 0.8, img=img)
            el_dusk.glint(img, 16 + (r + 3) * math.cos(a + 1), 16 + (r + 3) * math.sin(a + 1), 3)
        if el != "spark":
            sparkle(img, 12, 12, 2, (RAMP[el][5], RAMP[el][6], RAMP[el][7]))  # the shine
        clean(img, keep_alone=[RAMP[el][6], RAMP[el][5], RAMP[el][7]])
        frames.append(img)
    return frames


# ---------- strike: something falling from above onto (32, 56) ----------

GROUND = (32, 56)


def strike(el):
    gx, gy = GROUND
    frames = []
    for i in range(6):
        img = Img(64)
        X, Y = XY(64)
        rng = random.Random(ELEMENTS.index(el) * 13 + i)
        if i < 2:  # falling: the thing itself, high then low, with its trail above it
            y = (22, 40)[i]
            x = gx + (6, 2)[i] if el in ("ember", "stone") else gx  # meteors and boulders come in at a slant
            if el == "spark":  # a bolt straight down: thin and forked, then full and thick
                pts = el_spark.bolt_path(rng, gx + rng.uniform(-2, 2), 4, gx, y + 8, 0.3)
                el_spark.bolt(img, pts, thick=i == 1)
                for b in el_spark.branches(rng, pts, 1 + i, 8):
                    el_spark.bolt(img, b, cols=el_spark.BLUE)
            elif el == "tide":  # a torrent pouring down
                f = tongue(X, Y, [(gx, 9), (gx, y + 4)], 2.2 + 2 * i, 0.9, 0.9, 1.0)
                el_tide.water(f, img=img, edge=0)
                for k in range(3):
                    el_tide.droplet_px(img, gx + rng.randint(-8, 8), y - rng.randint(0, 14), 2)
            elif el == "grove":  # a giant thorn spear point first
                f = tongue(X, Y, [(gx, y - 16), (gx, y - 4), (gx, y + 6)], 2.4, 0.08, 1.0, 1.0, power=1.4)
                glossy(img, f, RAMP["grove"], cuts=((0.0, 2), (0.3, 3), (0.5, 4), (0.75, 5)), shine=(0.9, 6), edge=0)
                for k in range(3):  # thorns down its sides
                    img.px(gx + (3 if k % 2 else -3), y - 12 + k * 6, el_grove.WOOD[1])
                    img.px(gx + (4 if k % 2 else -4), y - 13 + k * 6, el_grove.WOOD[2])
                el_grove.leaf(img, gx + 4, y - 14, 6, 3, -0.7)
            elif el == "dusk":  # a dark spear dropping out of a shadow
                f = tongue(X, Y, [(gx, y - 14), (gx, y + 6)], 3.0, 0.05, 1.0, 1.0)
                el_dusk.shadow(f, img=img)
                w = el_dusk.wisp(X, Y, gx, y - 12, 8, -math.pi / 2, 0.8, 2.0)
                el_dusk.shadow(w * 0.8, img=img)
            else:  # ember meteor or stone boulder, with a trail behind it
                L = min(26, y - 6)
                f = tongue(X, Y, [(x, y), (x + 8 * L / 26, y - 16 * L / 26), (x + 12 * L / 26, y - L)], 5.0 if i else 3.6, 0.15, 1.0, 0.2)
                if el == "ember":
                    el_ember.fire(f, img=img)
                    el_ember.fire(ell(X, Y, x, y, 5 + i), img=img)
                else:
                    el_stone.dust(img, [(x + 8 * L / 26, y - 14 * L / 26, 3.5), (x + 11 * L / 26, y - 20 * L / 26, 2.6)], fade=0.3)
                    el_stone.rock(img, x, y, 6 + i * 3, 0.5 * i, seed=7)
            # its shadow on the ground, getting bigger as it falls
            img.paint((ell(X, Y, gx, gy, 5 + 5 * i, 2 + i) > 0) & ~img.mask(), RAMP[el][0])
        else:
            k = i - 2  # 0 = the hit, 1 = the peak, 2 = falling away, 3 = what is left
            spread = (8, 16, 20, 22)[k]
            if k < 3:
                flash = ell(X, Y, gx, gy - 4, (11, 17, 19)[k], (7, 10, 9)[k])
                if el == "ember":
                    el_ember.fire(flash * (1, 0.9, 0.55)[k], img=img)
                    for j in range(5):
                        bx = gx + (j - 2) * 6
                        f = el_ember.flame(X, Y, bx, gy, (16, 26, 14)[k] - abs(j - 2) * 4, 3.4, lean=(j - 2) * 1.2, wob=rng.uniform(-1, 1))
                        el_ember.fire(f, img=img)
                    if k:
                        el_ember.smoke(img, [(gx - 8, gy - 26 - 4 * k, 4), (gx + 7, gy - 30 - 4 * k, 3.5)], fade=0.3 * k)
                elif el == "tide":
                    el_tide.water(flash * (1, 0.8, 0.5)[k], img=img)
                    for j in range(5):
                        bx = gx + (j - 2) * 7
                        f = tongue(X, Y, [(bx, gy - 2), (bx + (j - 2) * 2, gy - (14, 22, 12)[k] + abs(j - 2) * 3)], 2.6, 0.3, 1.0, 0.3)
                        el_tide.water(f, img=img)
                    el_tide.ring_px(img, X, Y, gx, gy, spread + 2, (spread + 2) * 0.35, (RAMP["tide"][5], RAMP["tide"][3]), gap=4)
                elif el == "grove":
                    f = tongue(X, Y, [(gx, gy - 30 + 8 * k), (gx, gy + 2)], 2.6, 0.5, 1.0, 1.0)
                    glossy(img, f, RAMP["grove"], cuts=((0.0, 2), (0.3, 3), (0.5, 4), (0.75, 5)), shine=(0.9, 6), edge=0)
                    for j in (-1, 1):
                        pts = el_grove.curl_pts(gx, gy - 2, math.pi / 2 - j * 1.1 - math.pi, (10, 18, 18)[k], j * 0.9)
                        f = el_grove.vine(X, Y, pts[::3])
                        el_grove.draw_vine(img, f, leaves=[(pts[-1][0], pts[-1][1], -math.pi / 2, 5)] if k else ())
                elif el == "spark":
                    pts = el_spark.bolt_path(rng, gx, 2, gx, gy - 2, 0.3)
                    if k < 2:
                        el_spark.bolt(img, pts, thick=True)
                    bands(flash * (1, 0.7, 0.5)[k], RAMP["spark"], [(0.0, 3), (0.35, 5), (0.7, 6)], edge=1, img=img)
                    for j in range(4):
                        ang = j * math.pi / 2 + 0.4 + k
                        pts = el_spark.bolt_path(rng, gx, gy - 3, gx + spread * math.cos(ang), gy - 3 + spread * 0.4 * math.sin(ang), 0.4)
                        el_spark.bolt(img, pts, cols=el_spark.BLUE)
                elif el == "stone":
                    el_stone.dust(img, [(gx - 10, gy - 6, 6 + 2 * k), (gx + 10, gy - 6, 6 + 2 * k), (gx, gy - 12, 7 + k)], fade=0.35 * k)
                    el_stone.cracks(img, gx, gy, spread, 6, seed=11)
                    if k < 2:
                        el_stone.rock(img, gx, gy - 6 + 2 * k, 7, 0.3, seed=7)
                    for j in range(4):
                        el_stone.spike(img, gx + (j - 1.5) * 11, gy + 2, (8, 12, 6)[k] - abs(j - 1.5) * 2, 6, lean=(j - 1.5) * 1.5, seed=j)
                else:
                    el_dusk.shadow(ell(X, Y, gx, gy, spread + 4, min(6, (spread + 4) * 0.32)), img=img)
                    f = tongue(X, Y, [(gx, gy - (26, 20, 12)[k]), (gx, gy + 1)], 3.6, 0.6, 1.0, 1.0)
                    el_dusk.shadow(f, img=img)
                    for j in (-1, 1):
                        w = el_dusk.wisp(X, Y, gx + j * 4, gy - 4, 14, -math.pi / 2 + j * 0.9, j * 0.8, 2.0)
                        el_dusk.shadow(w * 0.8, img=img)
                    el_dusk.glint(img, gx + 9, gy - 18 + 3 * k, 3)
            for j in range(4 + 2 * (k < 2)):  # bits thrown out
                ang = rng.uniform(math.pi * 1.05, math.pi * 1.95)
                d = spread * rng.uniform(0.7, 1.2)
                bit(el, img, gx + d * math.cos(ang) * 1.3, gy - 6 + d * math.sin(ang) * 0.9, 2 if k < 2 else 1, rng)
            if k == 3:
                material(el, ell(X, Y, gx, gy, 12, 3) * 0.6, img)
            if k >= 2:
                thin_alpha(img, (0.7, 0.45)[k - 2], seed=i)
        clean(img, keep_alone=[RAMP[el][6], RAMP[el][5], RAMP[el][4], RAMP[el][7]])
        frames.append(img)
    return frames


# ---------- mark: a small sign on the ground round an area's edge ----------

def mark(el):
    frames = []
    for i in range(4):
        img = Img(16)
        X, Y = XY(16)
        rng = random.Random(ELEMENTS.index(el) * 7 + i)
        if el == "ember":  # smouldering embers flickering
            el_ember.fire(ell(X, Y, 8, 10, 4.5, 2.2) * 0.7, img=img)
            f = el_ember.flame(X, Y, 8, 11, (5, 7, 6, 4)[i], 2.6, lean=(0, 1, -1, 0)[i])
            el_ember.fire(f, img=img)
        elif el == "tide":  # a ripple welling up
            el_tide.ring_px(img, X, Y, 8, 10, 3 + i, (3 + i) * 0.45, (RAMP["tide"][5], RAMP["tide"][2]))
            el_tide.droplet_px(img, 8, 6 - (i % 2), 1)
        elif el == "grove":  # a sprout pushing up
            f = el_grove.vine(X, Y, [(8, 12), (8, 12 - (3, 5, 6, 5)[i])], 1.2, 0.6)
            el_grove.draw_vine(img, f)
            el_grove.leaf(img, 10, 12 - (3, 5, 6, 5)[i], 5, 3, -0.5)
        elif el == "spark":  # a crackle of static
            pts = el_spark.bolt_path(rng, 3, 10, 13, 9, 0.5)
            el_spark.bolt(img, pts, cols=el_spark.BLUE if i % 2 else el_spark.YEL)
        elif el == "stone":  # the ground cracking, a pebble jumping
            el_stone.cracks(img, 8, 11, 6, 3, seed=i)
            el_stone.pebble(img, 7, 9 - (0, 2, 3, 1)[i], big=i == 2)
        else:  # a curl of shadow
            w = el_dusk.wisp(X, Y, 8, 12, 7, -math.pi / 2, (0.8, 0.4, -0.4, -0.8)[i], 1.6)
            el_dusk.shadow(w, img=img)
            el_dusk.glint(img, 11, 5 + i % 2, 2 if i % 2 else 1)
        clean(img, keep_alone=[RAMP[el][6], RAMP[el][5], RAMP[el][4]])
        frames.append(img)
    return frames


# ---------- slash: a crescent sweeping down the right side ----------

def slash(el):
    frames = []
    for i in range(5):
        img = Img(48)
        X, Y = XY(48)
        rng = random.Random(ELEMENTS.index(el) * 19 + i)
        a0, a1 = [(-1.3, -0.6), (-1.3, 0.7), (-1.2, 1.2), (-0.6, 1.25), (0.3, 1.25)][i]
        thick = (2.6, 5.0, 4.2, 2.8, 1.6)[i]
        f = crescent(X, Y, 18, 24, 18, thick, a0, a1)
        if el == "spark":
            material(el, f * 0.7, img)
            if i in (1, 2):
                pts = [(x + rng.uniform(-1, 1), y) for (x, y) in arc_pts(18, 24, 18, a0 + 0.15, a1 - 0.15, 8)]
                el_spark.bolt(img, pts)
        elif el == "grove":
            material(el, f, img)
            if i in (1, 2, 3):
                for k, (px, py) in enumerate(arc_pts(18, 24, 21, a0 + 0.3, a1 - 0.3, 3)):
                    el_grove.leaf(img, px, py, 5, 3, math.atan2(py - 24, px - 18) + math.pi / 2)
        elif el == "stone":
            material(el, f, img)
            if i in (2, 3):
                el_stone.dust(img, [(30, 36, 2.6), (24, 40, 2.2)], fade=0.4 * (i - 2))
        else:
            material(el, f, img)
        # the bright cutting edge on the outside of the sweep
        d = np.hypot(X - 18, Y - 24)
        if i < 4:
            img.paint((f > 0.05) & (d > 18 + thick * 0.45), RAMP[el][7] if el != "dusk" else RAMP["dusk"][6])
        for k in range(1 + (i in (2, 3))):
            ang = rng.uniform(a0, a1)
            bit(el, img, 18 + 24 * math.cos(ang), 24 + 22 * math.sin(ang), 2, rng)
        if i == 4:
            thin_alpha(img, 0.55, seed=i)
        clean(img, keep_alone=[RAMP[el][6], RAMP[el][5], RAMP[el][4], RAMP[el][7]])
        frames.append(img)
    return frames


# ---------- burrow (shared): earth pushed up along a tunnel ----------

DIRT = ["#2e1e12", "#5a3c22", "#86603a", "#ae8656", "#d0ae7c"]


def burrow():
    frames = []
    for i in range(4):
        img = Img(16)
        X, Y = XY(16)
        rng = random.Random(70 + i)
        h = (2.5, 4.5, 3.5, 1.8)[i]
        f = ell(X, Y, 8, 12, (4.5, 6, 6, 5)[i], h)
        f = f * (Y < 12.5)
        glossy(img, f, DIRT, cuts=((0.0, 1), (0.3, 2), (0.55, 3)), shine=(0.85, 4), edge=0)
        if i in (1, 2):  # clods flung up
            for k in range(2 + (i == 1)):
                x, y = 8 + rng.randint(-6, 6), 12 - h - rng.randint(1, 4) * (2 if i == 1 else 1)
                stamp(img, x, y, ["ab", "bc"], {"a": DIRT[3], "b": DIRT[2], "c": DIRT[1]})
        if i == 3:
            thin_alpha(img, 0.6, seed=4)
        clean(img)
        frames.append(img)
    return frames


# ---------- how each one is built (build_fx.py) ----------
# kind: (frame size, frame count, ms per frame, loops?)
KINDS2 = {
    "wave": (24, 4, [70] * 4, True),
    "orb": (32, 4, [80] * 4, True),
    "strike": (64, 6, [70, 60, 70, 90, 100, 120], False),
    "mark": (16, 4, [120] * 4, True),
    "slash": (48, 5, [40, 50, 60, 70, 90], False),
}
SHARED2 = {"burrow": (16, 4, [70, 80, 90, 110], False)}


def effects2():
    """[(name, frames, size, n, ms, loops)] of the second set, in a fixed order."""
    out = []
    for el in ELEMENTS:
        for kind, (size, n, ms, loops) in KINDS2.items():
            out.append((f"{el}_{kind}", globals()[kind](el), size, n, ms, loops))
    for name, (size, n, ms, loops) in SHARED2.items():
        out.append((name, globals()[name](), size, n, ms, loops))
    return out
