"""Eggs, element icons, the meadow, effects and interface icons (ASSET_LIST.md 2.7 to 2.10).

Also the scenery helpers the other habitats reuse. Everything here is full colour, in the
palette of the whole game: dark, rough surfaces lit by neon, under an outrun sunset.
"""

import math
import random

from px import *

TYPES = ["ember", "tide", "grove", "spark", "stone", "dusk"]


def lit(s, m):
    """The part of `m` that lies on an already-painted form, not on its outline."""
    return {p for p in m if s.bd.get(p, 3) < 3}


# ---------- eggs ----------
EGG = (E(16, 19.6, 10.4, 12) | E(16, 15, 8.6, 11)) & R(0, 0, 31, 31)
BOLT = [(9, 1), (3, 9), (7, 9), (6, 15), (13, 6), (9, 6), (11, 1)]
FLAME = [(8, 1), (11, 5), (12, 3), (14, 8), (13, 12), (10, 14), (6, 14), (3, 12), (2, 8), (4, 9), (5, 5)]


def egg(kind):
    """A dark shell with its element burning through in neon, and a lit seam around the middle."""
    s = Spr(32, 32, rim=True)
    ramp, glow = TYPE_RAMP[kind], TYPE_GLOW[kind]
    s.blob(EGG, dim(ramp))
    inner = erode(EGG)
    top = {p for p in inner if p[1] < 20}
    if kind == "ember":     # flames licking up the shell
        for ox in (9, 17):
            s.over(shift(PG([(3, 9), (1, 5), (3, 6), (4, 1), (6, 5), (7, 4), (6, 9)]), ox, 8) & top, ramp)
    elif kind == "tide":    # two rolling waves
        for y0 in (10, 15):
            s.over({(x, y0 + round(1.4 * math.sin(x * 0.8)) + k) for x in range(32) for k in (0, 1)} & top, ramp)
    elif kind == "grove":   # leaves
        for cx, cy in ((12, 12), (20, 15), (15, 8)):
            s.over(E(cx, cy, 3.4, 2.2) & top, ramp)
            s.fill(lit(s, LN(cx - 2, cy, cx + 2, cy)) & top, ramp[2])
    elif kind == "spark":   # a lightning bolt
        s.over(shift(PG([(6, 0), (1, 7), (4, 7), (3, 12), (9, 4), (6, 4), (8, 0)]), 11, 6) & top, ramp)
    elif kind == "stone":   # plates, with light in the seams
        seams = set()
        for x0, y0 in ((8, 9), (16, 5), (16, 13), (24, 9), (8, 17), (24, 17)):
            seams |= rim(PG([(x0, y0 - 4), (x0 + 4, y0 - 2), (x0 + 4, y0 + 2), (x0, y0 + 4), (x0 - 4, y0 + 2), (x0 - 4, y0 - 2)]))
        s.over(seams & top, [glow[1], glow[2], glow[3]])
    else:                   # dusk: a crescent moon and stars
        s.over((E(14, 12, 4, 4) - E(16, 11, 3.4, 3.4)) & top, glow)
        for p in ((21, 9), (19, 16), (11, 18)):
            s.led(*p, glow) if p in top else None
    s.fill({p for p in inner if p[1] == 22}, glow[2])        # the seam
    for x in (11, 16, 21):
        s.put((x, 22), glow[0])
    for p in ((8, 26), (22, 27), (15, 29)):                   # stray lit pixels low on the shell
        s.put(p, glow[2]) if p in erode(EGG, 2) else None
    return s


def crack(n):
    s = Spr(32, 32)
    main = [(13, 8), (16, 12), (14, 15), (18, 18), (16, 22), (19, 25)]
    lines = PATH(main[: n + 2] if n < 3 else main)
    if n >= 2:
        lines |= PATH([(16, 12), (20, 11), (22, 14)])
    if n >= 3:
        lines |= PATH([(14, 15), (10, 17), (11, 21)]) | PATH([(18, 18), (22, 19), (23, 22)])
        s.fill(shift(PATH(main), 1, 0), W)                   # light leaking out
        s.fill(shift(PATH(main[1:4]), 2, 0), CYAN[1])
    s.fill(lines, INK)
    return s


def type_icon(kind):
    s = Spr(16, 16)
    ramp, glow = TYPE_RAMP[kind], TYPE_GLOW[kind]
    if kind == "ember":
        s.blob(PG(FLAME), ramp, t=1)
        core = PG([(8, 7), (10, 10), (9, 13), (7, 13), (6, 10)])
        s.fill(core, glow[1])
        s.fill(erode(core) | {(8, 11)}, glow[0])
    elif kind == "tide":
        s.blob(E(8, 9.6, 5.2, 4.8) | PG([(8, 1), (12, 8), (4, 8)]), ramp, t=2, hi={(6, 9), (6, 10), (7, 8)})
    elif kind == "grove":
        s.blob(PG([(2, 13), (3, 6), (8, 2), (13, 2), (13, 7), (10, 12), (4, 14)]), ramp, t=1)
        s.fill(lit(s, LN(4, 12, 11, 4)), ramp[2])
    elif kind == "spark":
        s.blob(PG(BOLT), ramp, t=1, hi={(8, 3), (7, 4), (6, 5)})
    elif kind == "stone":
        s.blob(PG([(8, 1), (14, 4), (14, 11), (8, 14), (2, 11), (2, 4)]), ramp, t=2, hi=set())
        s.fill(lit(s, PG([(8, 3), (12, 5), (8, 7), (4, 5)])), STEEL[0])
        s.led(8, 10, glow)
    else:
        s.blob(E(8, 8, 6.6, 6.6) - E(11.5, 6, 5.2, 5.2), ramp, t=1)
        s.put((12, 4), glow[0])
        s.put((13, 9), glow[1])
    return s


# ---------- scenery: a city at dusk, dark and rough, lit by neon ----------
def sky(colors, w=320, h=144, stars=0, seed=3):
    """Flat bands of colour, each blending into the next through three dithered rows."""
    s = Spr(w, h)
    n = len(colors)
    bh = h / n
    for y in range(h):
        i = min(n - 1, int(y / bh))
        k = math.ceil((i + 1) * bh - y)     # rows left in this band
        for x in range(w):
            c = colors[i]
            if i < n - 1 and k <= 3:
                quarter = x % 4 == (y % 2) * 2
                if (k == 3 and quarter) or (k == 2 and (x + y) % 2 == 0) or (k == 1 and not quarter):
                    c = colors[i + 1]
            s.put((x, y), c)
    rnd = random.Random(seed)
    for _ in range(stars):
        x, y = rnd.randrange(2, w - 2), rnd.randrange(2, int(h * 0.5))
        s.put((x, y), W if rnd.random() < 0.6 else CYAN[0])
        if rnd.random() < 0.2:
            for q in n4((x, y)):
                s.put(q, LILAC[1])
    return s


def skyline(s, base, rnd, col, lights, hmin, hmax, x0=0, x1=320, gap=(0, 4), wmin=7, wmax=16, domes=False, lit_up=0.5, signs=0.0):
    """A row of towers: a lit left edge, a rough shaded side, a few lit floors, aerials, neon signs."""
    x = x0
    while x < x1:
        w, h = rnd.randint(wmin, wmax), rnd.randint(hmin, hmax)
        top = base - h
        s.fill(R(x, top, x + w - 1, base), col[1])
        s.fill(R(x, top, x, base), col[0])
        s.dither(R(x + w - 4, top, x + w - 2, base), col[2])
        s.fill(R(x + w - 1, top, x + w - 1, base), col[2])
        roll = rnd.random()
        if domes and roll < 0.45:
            dome = E(x + w / 2 - 0.5, top, w / 2 - 0.5, w / 2.4) & R(x, top - w, x + w - 1, top)
            s.fill(dome, col[1])
            s.fill({p for p in dome if p[0] < x + w / 3}, col[0])
            s.fill(LN(x + w // 2, top - w // 2 - 3, x + w // 2, top - w // 2), col[0])
        elif roll < 0.35 and w > 9:
            s.fill(R(x + 2, top - 5, x + w - 4, top), col[1])
            s.fill(R(x + 2, top - 5, x + 2, top), col[0])
        elif roll < 0.6:
            ax = x + rnd.randint(2, w - 3)
            tip = top - rnd.randint(4, 8)
            s.fill(LN(ax, tip, ax, top), col[2])
            s.put((ax, tip), PINK[1])
        if rnd.random() < lit_up:
            glow = rnd.choice(lights)
            for wy in range(top + 3, base - 3, 4):
                on = rnd.random() < 0.5           # whole floors light up together, so it reads as clusters
                for wx in range(x + 2, x + w - 2, 3):
                    if on and rnd.random() < 0.7:
                        s.fill(R(wx, wy, wx, wy + 1), glow[1] if rnd.random() < 0.7 else glow[2])
        if rnd.random() < signs and h > 20 and w >= 9:   # a vertical neon sign down the side
            glow = rnd.choice(lights)
            sx = x + rnd.choice((2, w - 4))
            for yy in range(top + 3, top + 3 + min(15, h - 8)):
                if (yy - top) % 4 != 2:
                    s.fill(R(sx, yy, sx + 1, yy), glow[1])
            s.fill(R(sx, top + 3, sx + 1, top + 3), glow[0])
        x += w + rnd.randint(*gap)


def hills(s, y0, waves, top, body, h=144, w=320, rim_rows=1):
    for x in range(w):
        y = round(y0 + sum(a * math.sin(x / p + ph) for a, p, ph in waves))
        s.fill(R(x, y, x, h - 1), body)
        s.fill(R(x, y, x, y + rim_rows - 1), top)


def tree(s, x, ground, height, canopy=TREE, trunk=WOOD, fruit=PINK):
    s.blob(R(x - 2, ground - height + 12, x + 1, ground + 1), trunk, t=1, hi=set())
    cy = ground - height + 9
    m = E(x, cy + 2, 13, 8.5) | E(x - 7, cy + 6, 8, 6.2) | E(x + 7, cy + 5, 8.4, 6.6) | E(x + 1, cy - 4, 8.4, 6.2)
    s.blob(m, canopy, t=3, hi=set())
    for dx, dy, r in ((-5, -3, 3.2), (4, -6, 2.6), (-1, 3, 2.6)):    # clumps of leaves catching the light
        s.dither(lit(s, E(x + dx, cy + dy, r, r * 0.7)), canopy[0])
    for dx, dy in ((-9, 7), (6, 8), (1, -1)):                        # little lights hung in the branches
        s.led(x + dx, cy + dy, fruit)


def bush(s, x, ground, ramp=TREE, flower=None):
    m = (E(x, ground - 5, 10, 6.4) | E(x - 7, ground - 3, 6, 4.4) | E(x + 7, ground - 3, 6.4, 4.8)) & R(0, 0, 400, ground + 1)
    s.blob(m, ramp, t=2, hi=set())
    for dx, dy, r in ((-3, -6, 2.4), (5, -4, 2)):
        s.dither(lit(s, E(x + dx, ground + dy, r, r * 0.7)), ramp[0])
    if flower:
        for dx, dy in ((-6, -3), (3, -7), (8, -2)):
            s.led(x + dx, ground + dy, flower)


def lamp(s, x, ground, height=34, glow=CYAN, side=1):
    """A street lamp: a post, a short arm, and a lit lantern hanging in a haze of its own light."""
    s.blob(R(x, ground - height, x + 1, ground + 1), CHAR, t=1, hi=set(), line=False)
    hx = x + side * 5
    s.fill(R(min(x, hx), ground - height, max(x, hx) + 1, ground - height + 1), CHAR[1])
    s.dither(E(hx + 0.5, ground - height + 5.5, 8, 8) - s.mask(), glow[3])
    s.dither(E(hx + 0.5, ground - height + 5.5, 5, 5) - s.mask(), glow[2])
    s.blob(RR(hx - 2, ground - height + 2, hx + 3, ground - height + 8, 2), [W, glow[0], glow[1], glow[2]], t=1, hi=set())
    s.put((hx, ground - height + 4), W)


def neon_sign(s, x, y, w, h, glow, rnd, pole_to=None):
    """A small billboard: a dark panel with a neon border and a few lit bars of writing."""
    if pole_to:
        s.fill(R(x + w // 2, y + h, x + w // 2 + 1, pole_to), CHAR[1])
    s.fill(R(x, y, x + w - 1, y + h - 1), SCREEN)
    s.fill(rim(R(x, y, x + w - 1, y + h - 1)), glow[1])
    s.fill(R(x, y, x + w - 1, y), glow[0])
    for yy in range(y + 2, y + h - 2, 2):
        run = rnd.randint(w // 3, w - 5)
        s.fill(R(x + 2, yy, x + 2 + run, yy), glow[2] if yy % 4 else glow[1])


def ground(tip, grass, floor, line, seed, flowers=(PINK, CYAN), vanish=(160, 84), top=116, w=320, h=144):
    """Dark turf for the creatures to stand on, and below it a glowing grid running to the horizon."""
    s = Spr(w, h)
    rnd = random.Random(seed)
    s.fill(R(0, top, w - 1, top + 1), grass[0])
    s.fill(R(0, top + 2, w - 1, top + 6), grass[1])
    s.fill(R(0, top + 7, w - 1, top + 11), grass[2])
    s.fill(R(0, top + 12, w - 1, h - 1), floor)
    for x in range(w):                         # rough, dithered joins between the bands
        if (x + 1) % 2:
            s.put((x, top + 2), grass[0])
            s.put((x, top + 12), grass[2])
        else:
            s.put((x, top + 7), grass[1])
        if x % 4 == 1:
            s.put((x, top + 3), grass[0])
            s.put((x, top + 13), grass[2])
    for bx in range(-240, w + 241, 30):        # grid lines converging on a vanishing point
        for y in range(top + 13, h):
            x = round(vanish[0] + (bx - vanish[0]) * (y - vanish[1]) / (h - 1 - vanish[1]))
            s.put((x, y), line[2])
    for i, y in enumerate((top + 14, top + 16, top + 19, top + 23, top + 27)):
        if y < h:
            s.fill(R(0, y, w - 1, y), line[2] if i < 2 else line[1])
    x = rnd.randint(2, 8)
    while x < w - 4:                           # tufts standing above the line, a few of them lit
        tall = rnd.randint(2, 4)
        s.fill(R(x, top - tall, x, top), grass[0])
        s.fill(R(x + 1, top - tall + 1, x + 1, top), grass[1])
        s.fill(R(x - 1, top - 1, x - 1, top), grass[1])
        roll = rnd.random()
        if roll < 0.25:
            s.put((x, top - tall), tip)
        elif roll < 0.4:
            s.led(x, top - tall - 1, rnd.choice(flowers))
        x += rnd.randint(9, 22)
    return s


def meadow():
    """A park on the edge of the city, at the last of the sunset."""
    rnd = random.Random(11)
    far = Spr(320, 144)
    skyline(far, 112, rnd, ["#5a2a86", "#47206f", "#381a5c"], [PINK, LEMON], 24, 60, lit_up=0.3)
    skyline(far, 114, rnd, ["#33185c", "#201043", "#160b30"], [CYAN, PINK, LEMON], 10, 42, wmin=9, wmax=22, gap=(1, 7), lit_up=0.6, signs=0.4)
    hills(far, 110, [(3, 31, 1.0), (2, 13, 0.3)], "#1f6a70", "#0e2c44")
    mid = Spr(320, 144, rim=True)
    for x, hgt in ((24, 46), (76, 38), (252, 42), (300, 50)):
        tree(mid, x, 117, hgt)
    neon_sign(mid, 118, 76, 22, 13, PINK, rnd, pole_to=117)
    lamp(mid, 100, 117, 30, CYAN, -1)
    lamp(mid, 222, 117, 30, PINK, 1)
    for x, f in ((52, PINK), (196, CYAN), (276, LEMON)):
        bush(mid, x, 117, TREE, f)
    return {
        "sky": sky(["#150d3a", "#24114f", "#3d1769", "#621e7d", "#93287f", "#c93a7d", "#ef5f69", "#ff9a5c"], stars=18),
        "far": far,
        "mid": mid,
        "ground": ground(MINT[1], ["#1f8f7a", "#14585c", "#0f3a4c"], "#150c30", PINK, 5),
    }


def sun():
    """A low outrun sun: yellow at the top, hot pink at the bottom, sliced by bars of sky."""
    s = Spr(24, 24)
    disc = E(11.5, 11.5, 10.4, 10.4)
    for p in disc:
        y = p[1]
        s.put(p, LEMON[0] if y < 4 else LEMON[1] if y < 9 else "#ff9a3c" if y < 13 else PEACH[1] if y < 17 else PINK[1])
    for y in (4, 9):                           # dithered joins between the bands
        s.dither({p for p in disc if p[1] == y}, s.px.get((11, y - 1)))
    for y, t in ((13, 1), (16, 1), (18, 2), (21, 2)):
        s.erase(R(0, y, 23, y + t - 1))
    return s


def moon():
    s = Spr(24, 24)
    m = E(11.5, 11.5, 9.6, 9.6) - E(15.5, 8.5, 8.2, 8.2)
    s.blob(m, [W, CYAN[0], "#7fb6d9", "#7fb6d9"], t=2, line=False, hi=E(6, 9, 1.6, 3))
    s.fill(lit(s, E(7, 15, 1.4, 1.2) | E(11, 19, 1.2, 1)), "#7fb6d9")
    s.led(18, 5, [W, LILAC[1]])
    s.put((21, 14), PINK[0])
    return s


def cloud(w, h):
    """A dark cloud, its upper edge still lit by the sunset."""
    s = Spr(w, h)
    m = set()
    n = max(3, w // 11)
    for i in range(n):
        cx = (i + 0.5) * w / n
        r = h * (0.36 + 0.2 * math.sin(i * 2.3 + 1) ** 2)
        m |= E(cx, h - 1 - r * 0.8, w / n * 0.72, r)
    m = (m | R(3, h - 4, w - 4, h - 1)) & R(0, 0, w - 1, h - 1)
    s.blob(m, ["#7a3a9c", "#4a2a78", "#33205e", "#2a184f"], t=2, sel=False, hi=set())
    top = {p for p in rim(m) if (p[0], p[1] - 1) not in m}
    s.fill(top, "#ff7ac0")
    s.dither(shift(top, 0, 1) & m, "#c9509c")
    return s


# ---------- effects ----------
FX = {
    "star": (["...L....", "...L....", "..lLl...", "LLLWLLL.", "..lLl...", "...L....", "...L....", "........"], LEMON),
    "plus": (["........", "...WC...", "...CC...", ".WCCCCc.", ".CCCCcc.", "...Cc...", "...cc...", "........"], CYAN),
    "gem": (["...LL...", "..LWLl..", ".LWLLll.", ".LLLlll.", "..Llll..", "...ll...", "........", "........"], LILAC),
    "heart": ([".LL.LL..", "LWLLLLl.", "LLLLLll.", ".LLLll..", "..Lll...", "...l....", "........", "........"], PINK),
    "zzz": (["....LLLL", "......L.", ".....L..", "LLL.LLLL", "..L.....", ".L......", "LLL.....", "........"], SNOW),
    "note": (["...LLLL.", "...LllL.", "...L..L.", "...L..L.", ".LLL.LLL", "LLLlLLLl", ".Ll..Ll.", "........"], MINT),
}


def particle(i):
    rows, ramp = FX[i]
    return grid(rows, {"L": ramp[1], "l": ramp[2], "W": W, "C": ramp[1], "c": ramp[2]})


def spark(s, cx, cy, size, ramp):
    """A four-pointed twinkle: size 0 is one pixel, size 3 has long arms."""
    cx, cy = round(cx), round(cy)
    for k in range(1, size + 1):
        c = ramp[1] if k < size or size == 1 else ramp[2]
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            s.put((cx + dx, cy + dy), c)
    if size >= 3:
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            s.put((cx + dx, cy + dy), ramp[2])
    s.put((cx, cy), W if size else ramp[1])


def sparkle():
    frames = []
    for size in (1, 2, 3, 1):
        f = Spr(16, 16)
        spark(f, 7, 7, size + 1 if size > 1 else size, LEMON)
        if size == 3:
            spark(f, 12, 3, 0, CYAN)
            spark(f, 3, 12, 0, PINK)
        frames.append(f)
    return strip(frames)


def dust():
    frames = []
    for i in range(4):
        f = Spr(16, 16)
        spread, r = 2 + i * 2, [2.6, 2.4, 1.8, 1.2][i]
        for side in (-1, 1):
            m = E(7.5 + side * spread, 13 - i, r, r)
            if i < 3:
                f.blob(m, [SNOW[1], SNOW[2], LILAC[2], LILAC[3]], t=1, hi=set(), sel=False)
            else:
                f.dither(m, LILAC[2])
        frames.append(f)
    return strip(frames)


def burst(size, n, rays, ramps, ring=True, stars=0):
    frames = []
    c = size / 2 - 0.5
    reach = size * 0.44
    for i in range(n):
        f = Spr(size, size)
        t = (i + 1) / n
        if ring and 0.15 < t < 0.9:
            band = ARC(c, c, reach * t * 0.8, 0, 360, 2 if t < 0.5 else 1)
            (f.fill if t < 0.6 else f.dither)(band, ramps[0][2 if t > 0.4 else 1])
        if i == 0:
            spark(f, c, c, max(3, size // 9), ramps[0])
            f.fill(E(c, c, size / 16, size / 16), W)
        for k in range(rays):
            a = k * 2 * math.pi / rays + 0.3
            r = reach * (t ** 0.7)
            ramp = ramps[k % len(ramps)]
            sz = 3 if t < 0.3 else 2 if t < 0.6 else 1 if t < 0.85 else 0
            spark(f, c + math.cos(a) * r, c + math.sin(a) * r, sz if k % 2 == 0 else max(0, sz - 1), ramp)
        for k in range(stars):          # slower stars drifting up between the rays
            a = (k + 0.5) * 2 * math.pi / stars
            r = reach * 0.55 * t
            if t > 0.2:
                m = STAR(c + math.cos(a) * r, c + math.sin(a) * r - t * 4, 3 if t < 0.75 else 2, 1, 4)
                f.fill(m, ramps[-1][1])
        frames.append(f)
    return strip(frames)


def hatch():
    """Shell pieces flying out and falling, with a flash where the egg was."""
    frames = []
    shards = [(-1.0, -1.6, 0), (1.1, -1.4, 1), (-1.7, -0.5, 2), (1.8, -0.4, 0), (-0.5, -2.1, 1), (0.6, -2.0, 2), (-2.1, -1.1, 1), (2.2, -1.0, 2)]
    shapes = [[(0, 0), (7, 2), (3, 7)], [(0, 3), (5, 0), (8, 5), (3, 8)], [(2, 0), (7, 4), (0, 7)]]
    for i in range(8):
        f = Spr(64, 64, grit=False)
        t = i + 1
        if i < 3:
            spark(f, 31, 34, 9 - i * 3, CYAN)
            f.fill(E(31.5, 34.5, 6 - i * 2, 6 - i * 2), W)
        for vx, vy, kind in shards:
            x, y = 31 + vx * t * 3.1, 34 + vy * t * 3.6 + 0.42 * t * t
            m = {(round(x + px_), round(y + py_)) for (px_, py_) in PG(shapes[(kind + i // 2) % 3])}
            if i < 6:
                f.blob(m, [CYAN[1], NAVY[0], NAVY[1], NAVY[3]], t=1, hi=set())
            else:
                f.dither(m, NAVY[0])
        for k in range(6):
            a = k * math.pi / 3 + 0.5
            spark(f, 31 + math.cos(a) * t * 3.4, 34 + math.sin(a) * t * 3.4, 1 if i < 5 else 0, [CYAN, PINK, MINT][k % 3])
        frames.append(f)
    return strip(frames)


def levelup():
    """A ring spreading along the ground while chevrons and sparks rise."""
    frames = []
    for i in range(8):
        f = Spr(64, 64)
        t = (i + 1) / 8
        rx = 6 + t * 24
        ring = (E(31.5, 54, rx, rx * 0.26) - E(31.5, 54, rx - 2, rx * 0.26 - 1.2)) & R(0, 0, 63, 63)
        (f.fill if t < 0.7 else f.dither)(ring, MINT[1] if t < 0.5 else MINT[2])
        for x in (20, 31, 43):          # pillars of light, thinning as they climb
            top = round(52 - t * 46)
            if t < 0.8:
                f.dither(R(x, top, x + 1, 52), CYAN[2] if x != 31 else CYAN[1], (x + i) % 2)
        for k, (x, delay) in enumerate(((31, 0), (20, 0.18), (43, 0.3))):
            tt = t - delay
            if 0 < tt < 0.8:
                y = round(50 - tt * 52)
                ramp = [LEMON, MINT, PINK][k]
                chev = PATH([(x - 5, y + 5), (x, y), (x + 1, y), (x + 6, y + 5)], 2)
                f.fill(chev, ramp[1])
                f.fill(shift(chev, 0, 2) - chev, ramp[2])
                f.put((x, y), W)
        for k in range(7):
            x = 10 + (k * 37) % 46
            y = 56 - ((t * 60 + k * 9) % 54)
            spark(f, x, y, (k + i) % 2 if t < 0.85 else 0, [LEMON, CYAN, PINK][k % 3])
        frames.append(f)
    return strip(frames)


# ---------- interface icons ----------
def icon(i):
    s = Spr(16, 16)
    if i == "xp":
        s.blob(STAR(7.5, 7.5, 7.4, 2.7, 4), LEMON, t=1, hi=set())
        s.fill(E(7.5, 7.5, 1.6, 1.6), LEMON[0])
        s.put((7, 7), W)
        s.put((13, 2), CYAN[1])
        s.put((2, 13), PINK[1])
    elif i == "coin":
        m = E(7.5, 7.5, 6.8, 6.8)
        s.blob(m, LEMON, t=2, hi=set())
        s.fill(rim(erode(m, 2)), LEMON[2])
        s.fill(R(7, 5, 8, 10) | R(5, 7, 10, 8), LEMON[0])      # a chip-like cross stamped in the middle
        s.fill(R(8, 9, 8, 10) | R(10, 8, 10, 8), LEMON[2])
        s.fill(ARC(7.5, 7.5, 5.4, 200, 250), W)
    elif i == "streak":
        s.blob(PG(FLAME), PINK, t=1)
        core = PG([(8, 7), (10, 10), (9, 13), (7, 13), (6, 10)])
        s.fill(core, LEMON[1])
        s.fill(erode(core) | {(8, 11)}, LEMON[0])
    elif i == "freeze":
        m = PG([(8, 0), (13, 5), (13, 10), (8, 15), (7, 15), (2, 10), (2, 5), (7, 0)])
        s.blob(m, CYAN, t=2, hi=set())
        s.fill(lit(s, PG([(7, 2), (9, 5), (7, 12), (4, 6)])), CYAN[0])
        s.fill(lit(s, LN(5, 5, 6, 3) | {(5, 6)}), W)
    elif i == "hint":
        s.blob(RR(2, 1, 13, 14, 2), NAVY, t=1, hi=set())
        q = {(6, 4), (7, 3), (8, 3), (9, 4), (9, 5), (8, 6), (7, 7), (7, 8), (7, 11), (8, 11), (8, 7), (7, 10), (8, 10)}
        s.fill(q, CYAN[1])
        s.fill({(4, 12), (5, 12), (10, 3), (11, 3)}, PINK[1])
    else:   # goal
        s.blob(E(7.5, 7.5, 7.2, 7.2), PINK, t=1, hi=set())
        s.fill(E(7.5, 7.5, 4.8, 4.8), NAVY[2])
        s.fill(E(7.5, 7.5, 2.4, 2.4), PINK[1])
        s.put((7, 7), W)
    return s


def build():
    out = {}
    for t in TYPES:
        out[f"egg/{t}.png"] = egg(t)
        out[f"icon/type_{t}.png"] = type_icon(t)
    for n in (1, 2, 3):
        out[f"egg/crack_{n}.png"] = crack(n)
    for layer, s in meadow().items():
        out[f"habitat/meadow/{layer}.png"] = s
    out["habitat/sun.png"] = sun()
    out["habitat/moon.png"] = moon()
    out["habitat/cloud_1.png"] = cloud(48, 16)
    out["habitat/cloud_2.png"] = cloud(32, 12)
    for i in FX:
        out[f"fx/{i}.png"] = particle(i)
    out["fx/sparkle.png"] = sparkle()
    out["fx/dust.png"] = dust()
    out["fx/burst_lucky.png"] = burst(48, 6, 8, [CYAN, MINT])
    out["fx/burst_jackpot.png"] = burst(64, 8, 12, [LEMON, PINK, CYAN], stars=5)
    out["fx/hatch.png"] = hatch()
    out["fx/levelup.png"] = levelup()
    for i in ("xp", "coin", "streak", "freeze", "hint", "goal"):
        out[f"icon/{i}.png"] = icon(i)
    return out
