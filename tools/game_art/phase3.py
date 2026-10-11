"""Phase 3 art (ASSET_LIST.md section 4): battles, raid bosses, leagues and badges."""

import math
import random

from px import *
from phase2 import hat, held, item_icon, face
from world import BOLT, TYPES, burst, icon, lit, spark

BRONZE = PEACH


# ---------- battle ----------
def pad(ramp, glow):
    s = Spr(64, 16)
    m = E(31.5, 7.5, 31.4, 7.4)
    s.blob(m, CHAR, t=2, hi=set())
    top = E(31.5, 6, 28, 4.6)
    s.fill(top, ramp[2])
    s.fill(rim(top), glow[1])
    s.fill({p for p in rim(top) if p[1] < 6 and p[0] < 32}, glow[0])
    s.fill(E(31.5, 6, 14, 2.2) - E(31.5, 6, 11, 1.4), ramp[1])
    for x in range(8, 56, 8):       # hazard marks around the rim
        s.fill(lit(s, R(x, 12, x + 2, 13)), LEMON[1])
    return s


def shot(kind):
    ramp, glow = TYPE_RAMP[kind], TYPE_GLOW[kind]
    frames = []
    for i in range(3):
        f = Spr(16, 16)
        tail = 5 + i * 2
        for k in range(tail):       # a tail that thins out behind the head
            y_off = [0, 1, -1][(k + i) % 3] if k > 2 else 0
            c = ramp[1] if k < 3 else ramp[2]
            (f.fill if k < 4 else f.dither)(R(9 - k, 7 + y_off, 9 - k, 8 + y_off), c)
        f.blob(E(11, 7.5, 3.4, 3.4), [W, ramp[0], ramp[1], ramp[3]], t=1, hi=set())
        f.fill({(11, 7), (12, 7), (11, 8)}, W)
        f.put((14 if i % 2 else 15, 4 + i * 3), glow[1])
        frames.append(f)
    return strip(frames)


def shield():
    frames = []
    for i in range(6):
        f = Spr(48, 48)
        t = (i + 1) / 6
        r = 10 + t * 11
        dome = (E(23.5, 24, r, r) - E(23.5, 24, r - 2, r - 2))
        (f.fill if i < 4 else f.dither)(dome, CYAN[1] if i < 3 else CYAN[2])
        f.fill({p for p in dome if p[0] < 20 and p[1] < 20}, CYAN[0]) if i < 4 else None
        if i < 5:
            for a in range(0, 360, 60):     # facets, like a honeycomb seen edge-on
                x, y = 23.5 + math.cos(math.radians(a)) * r * 0.55, 24 + math.sin(math.radians(a)) * r * 0.55
                f.fill(rim(PG([(x, y - 3), (x + 3, y - 1), (x + 3, y + 2), (x, y + 3), (x - 3, y + 2), (x - 3, y - 1)])), CYAN[2])
        spark(f, 13, 12, 2 if i in (1, 2) else 0, [W, W, CYAN[1]])
        frames.append(f)
    return strip(frames)


def rising(shape, ramps):
    """Shapes floating up and fading: `shape(sprite, x, y, ramp)` draws one."""
    frames = []
    for i in range(6):
        f = Spr(48, 48)
        t = (i + 1) / 6
        ring = E(23.5, 42, 6 + t * 12, 2 + t * 2) - E(23.5, 42, 4 + t * 12, 1 + t * 2)
        (f.fill if i < 4 else f.dither)(ring & R(0, 0, 47, 47), ramps[0][2])
        for k, (x, delay) in enumerate(((23, 0), (11, 0.15), (35, 0.25), (17, 0.4), (30, 0.5))):
            tt = t - delay
            if 0 < tt <= 0.75:
                shape(f, x, round(38 - tt * 40), ramps[k % len(ramps)])
        for k in range(5):
            spark(f, 6 + (k * 23) % 37, 44 - ((t * 44 + k * 11) % 40), 1 if (k + i) % 3 == 0 else 0, ramps[k % len(ramps)])
        frames.append(f)
    return strip(frames)


def plus(f, x, y, ramp):
    m = R(x - 1, y - 4, x + 1, y + 4) | R(x - 4, y - 1, x + 4, y + 1)
    f.blob(m, ramp, t=1, hi=set())
    f.put((x - 1, y - 3), W)


def chevron(f, x, y, ramp):
    m = PATH([(x - 5, y + 5), (x, y), (x + 5, y + 5)], 2)
    f.fill(m, ramp[1])
    f.fill(shift(m, 0, 2) - m, ramp[2])
    f.put((x, y), W)


def battle_icon(i):
    s = Spr(16, 16)
    if i == "move_attack":      # three claw marks
        for k in range(3):
            m = PATH([(3 + k * 4, 2), (6 + k * 4, 13)], 2)
            s.fill(m, PINK[1])
            s.fill({p for p in m if p[1] > 9}, PINK[2])
            s.put((3 + k * 4, 2), W)
    elif i in ("move_guard", "stat_def"):
        ramp = CYAN if i == "move_guard" else STEEL
        s.blob(PG([(2, 2), (13, 2), (13, 8), (8, 14), (7, 14), (2, 8)]), ramp, t=1, hi=set())
        s.fill(lit(s, R(4, 4, 6, 7)), ramp[0])
        s.fill(lit(s, R(7, 4, 8, 11)), W if i == "move_guard" else LEMON[1])
    elif i == "move_boost":
        for y in (2, 7):
            m = PATH([(2, y + 5), (7, y), (8, y), (13, y + 5)], 2)
            s.blob(grow(m) & R(0, 0, 15, 15), LEMON, t=1, hi=set())
    elif i == "move_heal":
        s.blob(R(5, 1, 10, 14) | R(1, 5, 14, 10), MINT, t=1, hi=set())
        s.fill(R(6, 3, 7, 6), W)
    elif i == "stat_hp":
        return item_icon("heart_full")
    elif i == "stat_atk":       # a blade
        s.blob(PG([(13, 1), (14, 2), (7, 10), (5, 8)]), SNOW, t=1, hi=set())
        s.fill(PATH([(3, 7), (8, 12)], 2), LEMON[2])
        s.fill(PATH([(2, 12), (4, 10)], 2), WOOD[1])
        s.put((13, 1), W)
    else:                       # stat_spd: a winged dash
        s.blob(PG([(5, 3), (14, 8), (5, 12), (8, 8)]), CYAN, t=1, hi=set())
        for y, x0 in ((5, 1), (8, 0), (11, 2)):
            s.fill(R(x0, y, x0 + 3, y), CYAN[2])
    return s


def league(name):
    ramp = {"bronze": BRONZE, "silver": STEEL, "gold": LEMON, "diamond": CYAN}[name]
    stars = ["bronze", "silver", "gold", "diamond"].index(name) + 1
    s = Spr(24, 24)
    m = PG([(3, 2), (20, 2), (21, 12), (12, 22), (11, 22), (2, 12)])
    s.blob(m, ramp, t=2, hi=set())
    s.fill(lit(s, rim(erode(m, 2))), ramp[2])
    s.fill(lit(s, PG([(5, 4), (10, 4), (6, 11), (5, 11)])), ramp[0])
    for k in range(stars):
        x = 12 - (stars - 1) * 2 + k * 4 - (1 if stars % 2 == 0 else 0)
        s.fill({(x, 9 + (k % 2) * 3 if stars > 2 else 10)}, W)
        for q in n4((x, 9 + (k % 2) * 3 if stars > 2 else 10)):
            s.put(q, ramp[0]) if q in erode(m) else None
    if name == "diamond":
        spark(s, 19, 4, 1, [W, W, CYAN[0]])
    return s


# ---------- raid bosses: 96x96, facing left ----------
def boss_eyes(s, spots, state, ramp, size=3):
    for x, y in spots:
        if state == "hurt":
            for k in range(size + 1):
                s.fill({(x - size + k * 2 - (0 if x < 40 else size), y - size + k), (x - size + k * 2 - (0 if x < 40 else size), y + size - k)}, ramp[0])
        elif state == "down":
            s.fill(PATH([(x - size, y - size), (x + size, y + size)], 2) | PATH([(x + size, y - size), (x - size, y + size)], 2), ramp[1])
        else:
            m = E(x, y, size + 0.4, size + 1.2)
            s.fill(m, ramp[1])
            s.fill(erode(m), ramp[0])
            s.fill(R(x - 2, y - 2, x - 1, y - 1), W)


def squash(s, k=0.62):
    out = Spr(s.w, s.h)
    for (x, y), c in s.px.items():
        ny = s.h - 1 - round((s.h - 1 - y) * k)
        nx = round(48 + (x - 48) * 1.12)
        for dx in (0, 1):
            out.put((nx + dx, ny), c)
    return out


def boss(i, state, bob=0):
    s = Spr(96, 96)
    rnd = random.Random(hash(i) % 1000 if False else {"mumbler": 3, "blank_page": 5, "static": 7, "forgetting": 9}[i])
    dx = 4 if state == "hurt" else 0
    if i == "mumbler":          # a fog of garbled speech: too many mouths, letters that mean nothing
        fog = set()
        for cx, cy, rx, ry in ((48, 46, 30, 24), (30, 56, 20, 16), (66, 58, 22, 17), (44, 30, 20, 14), (62, 36, 18, 14), (48, 70, 30, 13)):
            fog |= E(cx + dx, cy + bob, rx, ry)
        s.blob(fog, [LILAC[0], LILAC[1], LILAC[2], PLUM[2]], t=4, hi=E(36 + dx, 30 + bob, 9, 5))
        wisps = {p for p in fog if p[1] > 74 + bob and (p[0] // 3 + p[1] // 2) % 2 == 0}
        s.erase(wisps)
        for mx, my, mw in ((34, 60, 9), (58, 66, 7), (62, 44, 6)):
            mouth = E(mx + dx, my + bob, mw, mw * 0.55)
            s.fill(mouth, SCREEN)
            s.fill(rim(mouth), PLUM[2])
            s.fill({p for p in mouth if p[1] > my + bob + 1} - rim(mouth), PINK[2])
            s.fill(R(mx + dx - 3, my + bob - round(mw * 0.55) + 1, mx + dx - 2, my + bob - round(mw * 0.55) + 2), W)
        boss_eyes(s, [(30 + dx, 42 + bob), (46 + dx, 40 + bob)], state, [LEMON[0], LEMON[2]], 4)
        for k in range(9):      # scrambled letters drifting off to the left
            x, y = 4 + (k * 17) % 22 - (0 if state != "hurt" else 2), 14 + k * 8 + bob * (k % 2)
            glyph = {(a, b) for a in range(3) for b in range(4) if rnd.random() < 0.6}
            s.fill(shift(glyph, x, y), [CYAN[1], PINK[1], LEMON[1]][k % 3])
    elif i == "blank_page":     # a sheet of paper with nothing on it, and it knows
        page = PG([(24 + dx, 14 + bob), (70 + dx, 10 + bob), (76 + dx, 84), (22 + dx, 88)])
        s.blob(page, SNOW, t=4, hi=set())
        fold = PG([(24 + dx, 14 + bob), (38 + dx, 13 + bob), (25 + dx, 28 + bob)])
        s.blob(fold, [SNOW[1], SNOW[2], SNOW[2], SNOW[3]], t=1, hi=set())
        for y in range(34, 80, 8):
            s.fill(lit(s, R(30 + dx, y + bob, 68 + dx, y + bob)), LILAC[0])
        s.fill(lit(s, R(32 + dx, 20 + bob, 32 + dx, 82)), PINK[0])
        boss_eyes(s, [(38 + dx, 46 + bob), (56 + dx, 45 + bob)], state, [NAVY[1], NAVY[3]], 4)
        mouth = PATH([(40 + dx, 62 + bob), (46 + dx, 59 + bob), (52 + dx, 62 + bob)] if state != "idle" else [(41 + dx, 60 + bob), (53 + dx, 60 + bob)], 2)
        s.fill(mouth, NAVY[3])
        for side, ax in ((-1, 22), (1, 76)):
            s.blob(E(ax + dx + side * 5, 56 + bob * 2, 6, 3.4), SNOW, t=1, hi=set())
    elif i == "static":         # an old television showing nothing but noise
        s.fill(PATH([(40 + dx, 22 + bob), (30 + dx, 6 + bob)], 2) | PATH([(54 + dx, 22 + bob), (66 + dx, 4 + bob)], 2), STEEL[1])
        s.led(30 + dx, 5 + bob, PINK)
        s.led(66 + dx, 3 + bob, CYAN)
        s.blob(RR(14 + dx, 20 + bob, 80 + dx, 80, 8), CHAR, t=4, hi=set())
        scr = RR(20 + dx, 26 + bob, 64 + dx, 72, 6)
        s.fill(scr, SCREEN)
        for p in sorted(scr):   # noise in 3x2 blocks, so it reads as static and not as grit
            if p[0] % 3 == 0 and p[1] % 2 == 0:
                roll = rnd.random()
                c = SNOW[1] if roll < 0.22 else STEEL[1] if roll < 0.5 else NAVY[1] if roll < 0.7 else None
                if c:
                    s.fill(R(p[0], p[1], p[0] + 2, p[1] + 1) & scr, c)
        s.fill(rim(scr), CHAR[3])
        boss_eyes(s, [(32 + dx, 44 + bob), (50 + dx, 44 + bob)], state, [PINK[0], PINK[1]], 4)
        s.fill(PATH([(34 + dx, 60 + bob), (38 + dx, 57 + bob), (42 + dx, 61 + bob), (46 + dx, 57 + bob), (50 + dx, 60 + bob)], 2), PINK[1])
        for y in (32, 42, 52):
            s.blob(E(72 + dx, y + bob, 3, 3), STEEL, t=1, hi=set())
        s.led(72 + dx, 66 + bob, LEMON)
        for x in (24, 66):
            s.blob(R(x + dx, 80, x + 8 + dx, 88), CHAR, t=1, hi=set())
    else:                       # forgetting: a shape that is coming apart at the edges
        body = E(46 + dx, 50 + bob, 28, 32) | E(46 + dx, 70, 32, 18)
        s.blob(body, [LILAC[1], NAVY[0], NAVY[1], NAVY[3]], t=4, hi=E(34 + dx, 30 + bob, 8, 6))
        for p in list(s.px):    # the right side dissolves into a checkerboard, then into nothing
            fade = (p[0] - 50 - dx) / 28
            if fade > 0.75 or (fade > 0.35 and (p[0] + p[1]) % 2 == 0) or (fade > 0.55 and p[1] % 2 == 0):
                s.erase({p})
        for k in range(12):
            x, y = 70 + (k * 13) % 24, 18 + k * 6
            s.fill(R(x, y, x + 1 + k % 2, y + 1 + k % 2), NAVY[0] if k % 3 else LILAC[1])
        boss_eyes(s, [(30 + dx, 44 + bob), (46 + dx, 44 + bob)], state, [CYAN[0], CYAN[2]], 4)
        s.fill(E(38 + dx, 62 + bob, 5, 3 if state == "idle" else 5), SCREEN)
    if state == "hurt":         # a flash: every highlight burns white
        for p, b in list(s.bd.items()):
            if b == 0:
                s.px[p] = W
    if state == "down":
        s = squash(s)
    return s


# ---------- badges ----------
def badge(i):
    s = Spr(24, 24)
    ring = {"first_hatch": MINT, "first_word": CYAN, "streak_7": PEACH, "streak_30": PINK, "streak_100": CYAN, "goal_10": PINK,
            "words_100": LILAC, "words_1000": LEMON, "listener": CYAN, "reader": LILAC, "collector": PINK, "adult_echo": CYAN,
            "adult_sage": LILAC, "adult_keeper": LEMON, "raid_win": LEMON, "friend_battle": PINK}[i]
    m = E(11.5, 11.5, 11.4, 11.4)
    s.blob(m, ring, t=1, hi=set())
    s.fill(erode(m, 3), SCREEN)
    s.fill(rim(erode(m, 2)), ring[3])
    s.fill(ARC(11.5, 11.5, 10, 195, 255), W)
    put = lambda spr, x, y: s.blit(spr, x, y)
    if i == "first_hatch":
        put(item_icon("egg_mystery"), 4, 4)
    elif i == "first_word":
        s.blob(RR(5, 6, 18, 14, 3) | {(8, 15), (9, 15), (8, 16)}, SNOW, t=1, hi=set())
        s.fill(R(8, 9, 15, 9) | R(8, 11, 12, 11), CYAN[3])
    elif i.startswith("streak"):
        put(icon("streak"), 4, 3)
        n = {"streak_7": 1, "streak_30": 2, "streak_100": 3}[i]
        for k in range(n):
            s.put((12 - n + k * 2 + 1, 20), W)
    elif i == "goal_10":
        put(icon("goal"), 4, 4)
    elif i in ("words_100", "words_1000"):
        put(held("book"), 6, 5)
        if i == "words_1000":
            spark(s, 6, 6, 1, LEMON)
            spark(s, 18, 8, 1, LEMON)
    elif i == "listener":
        put(hat("headphones"), 2, 5)
    elif i == "reader":
        put(face("round_glasses"), 4, 8)
    elif i == "collector":
        put(item_icon("gem"), 4, 4)
    elif i == "adult_echo":
        for r, c in ((3, CYAN[0]), (6, CYAN[1]), (9, CYAN[2])):
            s.fill(ARC(7, 12, r, -50, 50) & erode(m, 3), c)
    elif i == "adult_sage":
        s.blob(RR(7, 6, 16, 17, 1), SNOW, t=1, hi=set())
        s.blob(R(6, 5, 17, 7) | R(6, 16, 17, 18), LILAC, t=1, hi=set())
        s.fill(R(9, 9, 14, 9) | R(9, 11, 13, 11) | R(9, 13, 14, 13), LILAC[2])
    elif i == "adult_keeper":
        put(hat("crown"), 2, 5)
    elif i == "raid_win":
        s.blob(shift(PG(BOLT), 4, 4), LEMON, t=1, hi=set())
        spark(s, 6, 7, 1, PINK)
    else:
        s.fill(HEART(4, 7), PINK[1])
        s.fill(HEART(12, 10), CYAN[1])
        s.put((5, 8), W)
        s.put((13, 11), W)
    return s


def build():
    out = {"battle/pad_player.png": pad(TEAL, MINT), "battle/pad_rival.png": pad(PLUM, PINK)}
    for t in TYPES:
        out[f"battle/hit_{t}.png"] = burst(32, 5, 6, [TYPE_RAMP[t], TYPE_GLOW[t]])
        out[f"battle/shot_{t}.png"] = shot(t)
    out["battle/shield.png"] = shield()
    out["battle/heal.png"] = rising(plus, [MINT, CYAN])
    out["battle/boost.png"] = rising(chevron, [LEMON, PINK])
    for i in ("move_attack", "move_guard", "move_boost", "move_heal", "stat_hp", "stat_atk", "stat_def", "stat_spd"):
        out[f"icon/{i}.png"] = battle_icon(i)
    for name in ("bronze", "silver", "gold", "diamond"):
        out[f"icon/league_{name}.png"] = league(name)
    for i in ("mumbler", "blank_page", "static", "forgetting"):
        out[f"boss/{i}_idle.png"] = strip([boss(i, "idle", 0), boss(i, "idle", 2)])
        out[f"boss/{i}_hurt.png"] = boss(i, "hurt")
        out[f"boss/{i}_down.png"] = boss(i, "down")
    for i in ("first_hatch", "first_word", "streak_7", "streak_30", "streak_100", "goal_10", "words_100", "words_1000", "listener",
              "reader", "collector", "adult_echo", "adult_sage", "adult_keeper", "raid_win", "friend_battle"):
        out[f"badge/{i}.png"] = badge(i)
    return out
