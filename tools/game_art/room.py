"""The creature's room: Home's habitat window turned into a room (prototype "habitat_room", the owner's design of
2026-11-25), made a cozy cottage on the owner's word ("I want the house to look more like a cozy cottage"): warm low
light from a small hearth, exposed beams under a low sloping ceiling, whitewashed plaster with the stone showing through,
an arched cross-paned window with a sill and plants, a rag rug on wide planks, a rounded plank door with iron hinges,
hanging herbs and a shelf of jars. No neon (the owner: "more fantasy").

Designed pixel by pixel and placed in Aseprite by a script, as the guild tavern was (the method the owner agreed for
the game's art); it shares the tavern's palette and helpers (tavern.py).

    .venv/Scripts/python.exe tools/game_art/room.py preview OUT.png   a sheet to look at (3x)
    .venv/Scripts/python.exe tools/game_art/room.py build [--aseprite] write web/game-art/room/*.png (and sources)

Files (web/game-art/room/, sources in game/art-src/room/):
    room.png       320 x 144  the room. The window's panes and the doorway are see-through: the game draws the habitat
                              theme's sky and far layer behind them, so the view outside is the real one (time of day,
                              weather, the theme chosen).
    door.png       DOOR size  the door, shut (drawn over the doorway; its round top's corners are see-through)
    door_open.png  DOOR size  the door swung open against the wall (the doorway shows outside)
    fire.png       36 x 32 x 4 the hearth's fire, 4 frames side by side (FIRE_BOX of the room), played over the room
    sky_*.png                 the sky seen through the window and the doorway: a plain sun and moon, white clouds
The numbers the game needs (the floor, the window, the door) are below and kept the same in web/js/game/room.js.
"""

from __future__ import annotations

import math
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tavern  # noqa: E402  (its canvas, palette and helpers)
from tavern import CREAM, FIRE, GOLD, INK, IRON, STONE, WOOD, Canvas, hexc  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "game-art" / "room"
SRC = ROOT / "game" / "art-src" / "room"
ASEPRITE = tavern.ASEPRITE

W, H = 320, 144
FLOOR_TOP = 84                 # the floor starts here (the stone footing's foot)
WINDOW = (116, 18, 198, 60)    # outer frame, inclusive (its top is an arch)
DOOR = (262, 20, 299, 83)      # the doorway's opening, inclusive: x0, y0, x1, y1 (its top is a half circle)
HEARTH = (46, 74)              # the middle of the fire (its glow lights the room)
CLEAR = (0, 0, 0, 0)

WASH = [hexc("8f7656"), hexc("b09574"), hexc("cdb290"), hexc("dfc8a4"), hexc("ece0c2")]       # whitewashed plaster
HONEY = [hexc("3a2414"), hexc("5a3a20"), hexc("7a4f2c"), hexc("966538"), hexc("b27e48"), hexc("c99a60")]  # floorboards
GINGHAM = [hexc("6a2420"), hexc("a8403a"), hexc("e6d8b4")]
LEAF = [hexc("1f3d1c"), hexc("3d6e2e"), hexc("6fa84f"), hexc("9ccc6a")]
CLAY = [hexc("5e2a18"), hexc("9a4a2a"), hexc("c26a3e"), hexc("de8a58")]
LEAD = hexc("2a2630")

tavern.W, tavern.H = W, H


def clear(cv: Canvas, x0, y0, x1, y1) -> None:
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            cv.px[x, y] = CLEAR


def in_round_top(x: int, y: int, x0: int, y0: int, x1: int, y1: int) -> bool:
    """Whether (x, y) is inside an opening x0..x1, y0..y1 whose top is a half circle as wide as it."""
    if not (x0 <= x <= x1 and y <= y1):
        return False
    r = (x1 - x0 + 1) / 2
    cx = x0 + r
    dx = x + 0.5 - cx
    return y + 0.5 >= y0 + r - math.sqrt(max(0.0, r * r - dx * dx))


# ---------- walls, ceiling, floor ----------
def wash(cv: Canvas, x0, y0, x1, y1) -> None:
    cv.rect(x0, y0, x1, y1, WASH[3])
    cv.speckle(x0, y0, x1, y1, WASH[2], 0.10)
    cv.speckle(x0, y0, x1, y1, WASH[4], 0.05)
    for y in range(y0, y0 + 4):  # the shadow under the beam
        for x in range(x0, x1 + 1):
            if y - y0 < 2 or (x + y) % 2 == 0:
                cv.put(x, y, WASH[1] if y - y0 < 2 else WASH[2])


def bare_stones(cv: Canvas, cx, cy, rx, ry, seed) -> None:
    """A patch where the plaster has come away and the stones show through, with a broken edge."""
    tmp = Canvas(W, H, seed=seed)
    tavern.stones(tmp, int(cx - rx) - 2, int(cy - ry) - 2, int(cx + rx) + 2, int(cy + ry) + 2, row=5, seed=seed)
    r = random.Random(seed)
    for y in range(int(cy - ry) - 2, int(cy + ry) + 3):
        for x in range(int(cx - rx) - 2, int(cx + rx) + 3):
            d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + r.uniform(-0.18, 0.18)
            if d <= 0.8:
                cv.put(x, y, tmp.get(x, y))
            elif d <= 1.05:
                cv.put(x, y, WASH[1] if y > cy else WASH[4])


def ceiling(cv: Canvas) -> None:
    """Boards overhead, a heavy beam, and the roof sloping down into both corners (a low cottage ceiling)."""
    cv.rect(0, 0, W - 1, 7, WOOD[1])
    for x in range(0, W, 9):
        cv.vline(x, 0, 7, WOOD[0])
    for x in range(4, W, 9):
        cv.put(x, 3, WOOD[2])
    tavern.beam(cv, 0, 8, W - 1, 14)
    # the slopes: boards running down at an angle, edged by a rafter
    for side, wide, tall in ((-1, 34, 30), (1, 18, 16)):
        for y in range(15, 15 + tall):
            n = round(wide * (1 - (y - 15) / tall))
            for i in range(n):
                x = i if side < 0 else W - 1 - i
                cv.put(x, y, WOOD[1] if (i + y) % 6 == 0 else WOOD[2])
            edge = n if side < 0 else W - 1 - n
            for k in range(3):
                cv.put(edge + (k if side < 0 else -k), y, (WOOD[4], WOOD[3], WOOD[1])[k])


def floor(cv: Canvas, y0, y1) -> None:
    """Wide honey-coloured planks running across, rows deeper toward us, staggered joints, grain and knots."""
    rows = [y0]
    h = 6
    while rows[-1] < y1:
        rows.append(min(y1 + 1, rows[-1] + h))
        h = min(16, h + 2)
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1] - 1
        x = -cv.r.randint(0, 60)
        while x < W:
            ln = cv.r.randint(70, 130)
            tone = cv.r.choice([HONEY[3], HONEY[3], HONEY[2], HONEY[4]])
            for y in range(a, b + 1):
                for xx in range(max(0, x), min(W - 1, x + ln - 1) + 1):
                    c = tone
                    if y == a:
                        c = HONEY[1]
                    elif y == a + 1:
                        c = HONEY[min(5, HONEY.index(tone) + 1)]
                    elif xx == x:
                        c = HONEY[1]
                    cv.put(xx, y, c)
            for _ in range(ln * (b - a) // 16):
                gx, gy = cv.r.randint(max(0, x + 2), min(W - 1, x + ln - 2)), cv.r.randint(a + 2, max(a + 2, b))
                cv.hline(gx, min(W - 1, gx + cv.r.randint(3, 9)), gy, HONEY[max(1, HONEY.index(tone) - 1)])
            for px in (x + 3, x + ln - 4):  # the nails at each end
                if 0 <= px < W and b - a > 4:
                    cv.put(px, a + 3, HONEY[0]); cv.put(px, b - 1, HONEY[0])
            if cv.r.random() < 0.35 and b - a > 5:
                kx, ky = cv.r.randint(max(0, x + 6), min(W - 3, x + ln - 6)), cv.r.randint(a + 3, b - 2)
                cv.ellipse(kx, ky, 2, 1.2, HONEY[1]); cv.put(kx, ky, HONEY[0])
            x += ln


def rug(cv: Canvas, cx=160, cy=114, rx=54, ry=13) -> None:
    """A braided rag rug: rings of old cloth, each braid a little lighter and darker in turn."""
    bands = [CREAM[1], GINGHAM[1], hexc("4c6a8a"), hexc("c8a048"), GINGHAM[0], hexc("6e8a58"), CREAM[0], hexc("7a5a8a"), GINGHAM[1]]
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            d = math.sqrt(((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2)
            if d > 1:
                if d < 1.08 and y > cy:
                    cv.put(x, y, (40, 24, 14, 90))  # a soft shadow at the front edge
                continue
            c = bands[min(len(bands) - 1, int(d * len(bands)))]
            braid = ((x // 2) + (y if d > 0.5 else 0)) % 3
            if braid == 0:
                c = tuple(max(0, v - 26) for v in c[:3]) + (255,)
            elif braid == 1 and (x + y) % 2:
                c = tuple(min(255, v + 14) for v in c[:3]) + (255,)
            if d > 0.94:
                c = tuple(round(v * 0.62) for v in c[:3]) + (255,)
            cv.put(x, y, c)


# ---------- the hearth ----------
def flame(cv: Canvas, cx, base, tall, wide) -> None:
    for y in range(base - tall, base + 1):
        t = (base - y) / tall
        half = wide * (1 - t) ** 0.8 * (0.6 + 0.4 * math.sin(t * math.pi))
        for x in range(int(cx - half) - 1, int(cx + half) + 2):
            d = abs(x + 0.5 - cx) / max(0.5, half)
            if d > 1:
                continue
            k = 4 if d < 0.3 and t < 0.6 else 3 if d < 0.55 else 2 if d < 0.8 else 1
            if t > 0.7:
                k = max(0, k - 2)
            cv.put(x, y, FIRE[k])


def hearth(cv: Canvas) -> None:
    """A small stone hearth: the chimney stack up through the ceiling, a mantel, a round-topped firebox with a low fire."""
    tavern.stones(cv, 30, 0, 62, 44, row=6, seed=21)
    cv.vline(30, 0, 44, STONE[0]); cv.vline(62, 0, 44, STONE[0])
    tavern.stones(cv, 18, 44, 74, FLOOR_TOP - 1, row=6, seed=22)
    cv.vline(18, 44, FLOOR_TOP - 1, STONE[0]); cv.vline(74, 44, FLOOR_TOP - 1, STONE[0])
    # the firebox: a dark round-topped opening ringed with lighter stones
    fx0, fy0, fx1 = 32, 56, 60
    for y in range(fy0 - 3, FLOOR_TOP):
        for x in range(fx0 - 3, fx1 + 4):
            if in_round_top(x, y, fx0, fy0, fx1, FLOOR_TOP - 1):
                depth = (y - fy0) / (FLOOR_TOP - fy0)
                cv.put(x, y, INK if depth < 0.5 else hexc("2e1c18"))
            elif in_round_top(x, y, fx0 - 3, fy0 - 3, fx1 + 3, FLOOR_TOP - 1):
                cv.put(x, y, STONE[3] if (x * 3 + y) % 7 else STONE[2])
    cv.rect(44, fy0 - 4, 48, fy0 - 2, STONE[4])  # the keystone
    # the logs and the embers under them
    for (ax, ay, bx, by) in ((36, 81, 56, 79), (38, 79, 55, 82)):
        for i in range(bx - ax + 1):
            x, y = ax + i, round(ay + (by - ay) * i / (bx - ax))
            cv.put(x, y - 1, WOOD[4]); cv.put(x, y, WOOD[2]); cv.put(x, y + 1, WOOD[1])
    cv.hline(35, 57, 83, FIRE[0])
    # the mantel and what stands on it
    tavern.beam(cv, 12, 42, 80, 47)
    tavern.candle(cv, 16, 41, 6)
    tavern.candle(cv, 74, 41, 5)
    cv.ellipse(34, 37, 5, 4, hexc("b06a3a")); cv.hline(30, 38, 33, hexc("d89058")); cv.put(31, 35, hexc("f0b078"))  # a copper kettle
    cv.vline(39, 35, 38, hexc("7a4a28")); cv.put(40, 35, hexc("7a4a28")); cv.hline(32, 36, 32, hexc("7a4a28"))
    for (x, kind, tall) in ((52, "amber", 7), (57, "green", 9)):
        tavern.bottle(cv, x, 41, kind, tall)
    cv.rect(63, 36, 69, 41, CREAM[1]); cv.rect(64, 37, 68, 40, CREAM[2]); cv.put(66, 38, INK); cv.put(66, 39, INK); cv.put(67, 39, INK)  # a little clock
    # the hearthstone, out onto the floor
    cv.rect(12, FLOOR_TOP, 80, FLOOR_TOP + 5, STONE[2]); cv.hline(12, 80, FLOOR_TOP, STONE[4]); cv.hline(12, 80, FLOOR_TOP + 1, STONE[3])
    cv.hline(12, 80, FLOOR_TOP + 5, STONE[0]); cv.vline(12, FLOOR_TOP, FLOOR_TOP + 5, STONE[1]); cv.vline(80, FLOOR_TOP, FLOOR_TOP + 5, STONE[1])
    for x in (29, 46, 63):
        cv.vline(x, FLOOR_TOP + 2, FLOOR_TOP + 4, STONE[1])
    # a poker and a little stack of logs beside it
    cv.vline(77, 62, FLOOR_TOP - 1, IRON[2]); cv.hline(76, 78, 62, IRON[2])
    for (lx, ly) in ((6, 80), (11, 80), (8, 77)):
        cv.ellipse(lx, ly, 3, 2.2, WOOD[3]); cv.put(lx, ly, WOOD[5]); cv.put(lx - 1, ly, WOOD[4])


# The fire's flames, frame by frame (the game plays them over the room: fire.png): (middle, base, height, width) of
# its three tongues, and where a spark is flying up.
FLAMES = [
    ([(41, 79, 9, 4), (46, 80, 14, 5), (51, 79, 8, 3.5)], None),
    ([(41, 79, 11, 3.6), (46, 80, 12, 5.5), (51, 79, 9, 3.4)], (44, 62)),
    ([(40, 79, 8, 4.4), (46, 80, 15, 4.6), (52, 79, 10, 3)], (49, 59)),
    ([(42, 79, 10, 3.6), (46, 80, 13, 5.2), (50, 79, 7, 4)], (47, 64)),
]
FIRE_BOX = (28, 52, 64, 84)  # the part of the room the frames cover: x0, y0, x1, y1 (exclusive)


def fire_glow(cv: Canvas, frame: int = 0) -> None:
    """The flames themselves and their light (drawn after the room is dimmed, so they stay bright)."""
    tongues, spark = FLAMES[frame]
    for (cx, base, tall, wide) in tongues:
        flame(cv, cx, base, tall, wide)
    if spark:
        cv.put(spark[0], spark[1], FIRE[4]); cv.put(spark[0], spark[1] + 1, FIRE[2])
    for x in (17, 75):
        flame(cv, x, 34 if x == 17 else 35, 4, 1.4)


def herbs(cv: Canvas) -> None:
    """Bunches of herbs hung upside down from the beam to dry: lavender, sage, something golden."""
    kinds = [[hexc("4a3a6a"), hexc("7a62a8"), hexc("a890d0")], [LEAF[0], LEAF[1], LEAF[2]], [hexc("6a5420"), hexc("a8862e"), hexc("d4b450")]]
    r = random.Random(4)
    for i, x in enumerate((84, 93, 102)):
        cv.vline(x, 15, 18, CREAM[0])
        cv.hline(x - 1, x + 1, 19, GINGHAM[1])
        ramp = kinds[i]
        for y in range(20, 32):
            half = 1 + (y - 20) * 0.35
            for xx in range(int(x - half), int(x + half) + 1):
                if r.random() < 0.85:
                    cv.put(xx, y, ramp[r.choice([0, 1, 1, 2])])
        cv.vline(x, 20, 23, hexc("5a4a2a"))


# ---------- the window ----------
def window(cv: Canvas) -> None:
    """An arched, cross-paned window: a wooden frame and cross, leaded small panes, the glass left see-through (the
    game draws outside), a deep sill with two pots, and gingham café curtains tied back."""
    x0, y0, x1, y1 = WINDOW
    cx, hw, rise = (x0 + x1 + 1) / 2, (x1 - x0 + 1) / 2, 10

    def top(x, inset=0):
        dx = (x + 0.5 - cx) / (hw - inset)
        return y0 + inset + rise * (1 - math.sqrt(max(0.0, 1 - min(1.0, dx * dx))))

    # the rail and curtains first (the frame goes over their tops)
    cv.rect(x0 - 12, y0 - 2, x1 + 12, y0 - 1, WOOD[4]); cv.hline(x0 - 12, x1 + 12, y0 - 1, WOOD[1])
    for x in (x0 - 13, x1 + 13):
        cv.ellipse(x, y0 - 1.5, 1.6, 1.6, WOOD[5])
    for side in (-1, 1):
        edge = x0 + 1 if side < 0 else x1 - 1
        for y in range(y0, y1 + 3):
            t = (y - y0) / (y1 + 3 - y0)
            width = round(12 - 7 * math.sin(min(1, t * 1.7) * math.pi * 0.5) + max(0, t - 0.62) * 9)
            for i in range(width):
                x = edge - i if side < 0 else edge + i
                c = GINGHAM[2] if ((x // 2) + (y // 2)) % 2 else GINGHAM[1]
                if (x // 2) % 2 and (y // 2) % 2:
                    c = GINGHAM[0]
                if i == width - 1 or (i + y // 5) % 5 == 0:
                    c = tuple(round(v * 0.72) for v in c[:3]) + (255,)
                cv.put(x, y, c)
        tie = y0 + 26
        for i in range(-1, 8):
            x = edge - i if side < 0 else edge + i
            cv.put(x, tie, hexc("c8a048")); cv.put(x, tie + 1, hexc("8a6a28"))
    # the frame: arched top, 3 px of wood; the glass inside left clear
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if y < top(x):
                continue
            inner = x0 + 3 <= x <= x1 - 3 and y <= y1 - 3 and y >= top(x, 3)
            if inner:
                cv.px[x, y] = CLEAR
            else:
                lit = y < top(x) + 1 or x == x0
                cv.put(x, y, WOOD[5] if lit else WOOD[1] if x == x1 or y == y1 else WOOD[3])
    # leaded panes, then the wooden cross
    mid, bar = int(cx) - 1, y0 + 20
    for y in range(y0, y1 - 2):
        for x in (137, 177):
            if y >= top(x, 3):
                cv.put(x, y, LEAD)
    for yy in (31, 50):
        for x in range(x0 + 3, x1 - 2):
            if yy >= top(x, 3):
                cv.put(x, yy, LEAD)
    for y in range(y0, y1 - 2):
        if y >= top(mid, 3) - 1:
            cv.put(mid - 1, y, WOOD[4]); cv.put(mid, y, WOOD[3]); cv.put(mid + 1, y, WOOD[1])
    cv.hline(x0 + 3, x1 - 3, bar - 1, WOOD[4]); cv.hline(x0 + 3, x1 - 3, bar, WOOD[3]); cv.hline(x0 + 3, x1 - 3, bar + 1, WOOD[1])
    for k in range(7):  # a faint glint on the glass
        cv.put(x0 + 8 + k, y0 + 14 - k, (230, 236, 255, 60))
        cv.put(x1 - 26 + k, y0 + 30 - k, (230, 236, 255, 45))
    # the sill, with a shadow under it
    cv.rect(x0 - 5, y1 + 1, x1 + 5, y1 + 4, WOOD[4]); cv.hline(x0 - 5, x1 + 5, y1 + 1, WOOD[5]); cv.hline(x0 - 5, x1 + 5, y1 + 4, WOOD[1])
    cv.hline(x0 - 4, x1 + 4, y1 + 5, WASH[1]); cv.hline(x0 - 3, x1 + 3, y1 + 6, WASH[2])
    pot(cv, 125, y1, 5, leafy=True)
    pot(cv, 189, y1, 4, leafy=False)


def pot(cv: Canvas, cx, base, half, leafy) -> None:
    """A clay pot on the sill: a leafy trailing plant, or one with little red flowers."""
    r = random.Random(cx)
    for y in range(base - 7, base + 1):
        w = half - (1 if y > base - 3 else 0)
        for x in range(cx - w, cx + w + 1):
            cv.put(x, y, CLAY[3] if x == cx - w + 1 else CLAY[0] if x == cx + w else CLAY[1] if y > base - 5 else CLAY[2])
    cv.hline(cx - half - 1, cx + half + 1, base - 7, CLAY[3]); cv.hline(cx - half - 1, cx + half + 1, base - 6, CLAY[1])
    if leafy:
        for _ in range(70):
            a = r.uniform(math.pi * 1.05, math.pi * 1.95)
            d = r.uniform(1, 9)
            cv.put(round(cx + math.cos(a) * d * 1.2), round(base - 8 + math.sin(a) * d), LEAF[r.choice([1, 2, 2, 3])])
        for sx in (cx - half - 1, cx + half + 1):  # trailing strands over the sill
            for k in range(9):
                cv.put(sx + (1 if k % 3 == 0 else 0) * (-1 if sx < cx else 1), base - 6 + k, LEAF[1 if k % 2 else 2])
    else:
        for _ in range(26):
            cv.put(cx + r.randint(-4, 4), base - 8 - r.randint(0, 5), LEAF[r.choice([1, 2])])
        for (fx, fy) in ((cx - 3, base - 13), (cx + 2, base - 14), (cx, base - 11), (cx + 4, base - 10), (cx - 4, base - 9)):
            cv.put(fx, fy, hexc("e04848")); cv.put(fx + 1, fy, hexc("c02c3a")); cv.put(fx, fy - 1, hexc("ff8a8a")); cv.put(fx + 1, fy + 1, hexc("8a1c28"))


# ---------- the shelf, the hooks ----------
def shelf(cv: Canvas, x0=214, y=38) -> None:
    """A shelf of jars: preserves, honey, dried beans, each with a cloth cap tied on."""
    cv.rect(x0, y, x0 + 38, y + 2, WOOD[4]); cv.hline(x0, x0 + 38, y, WOOD[5]); cv.hline(x0, x0 + 38, y + 2, WOOD[1])
    for bx in (x0 + 4, x0 + 33):
        cv.vline(bx, y + 3, y + 7, IRON[1]); cv.put(bx + 1, y + 3, IRON[1]); cv.put(bx + 2, y + 3, IRON[1])
        for k in range(4):
            cv.put(bx + 1 + k // 2, y + 4 + k, IRON[0])
    jars = [(2, 5, 8, [hexc("6a3a10"), hexc("c87a20"), hexc("f0b050")], GINGHAM[1]),
            (9, 6, 10, [hexc("2a4a24"), hexc("4e7e3a"), hexc("8ab868")], CREAM[1]),
            (17, 4, 6, [hexc("5a1420"), hexc("9a2a3a"), hexc("d05a6a")], hexc("4c6a8a")),
            (23, 6, 9, [hexc("8a6a28"), hexc("d8b050"), hexc("f8e098")], GINGHAM[1]),
            (31, 5, 7, [hexc("3a3a5a"), hexc("5a6a9a"), hexc("9aaad8")], CREAM[1])]
    for (dx, w, h, g, cap) in jars:
        jx = x0 + dx
        for yy in range(y - h, y):
            for xx in range(jx, jx + w):
                cv.put(xx, yy, g[0] if xx in (jx, jx + w - 1) else g[1])
        cv.vline(jx + 1, y - h + 2, y - 2, g[2])
        cv.hline(jx - 1, jx + w, y - h - 1, cap); cv.hline(jx, jx + w - 1, y - h - 2, cap)
        cv.hline(jx, jx + w - 1, y - h, CREAM[0])


def hooks(cv: Canvas, x0: int, y0: int) -> None:
    """Pegs on a board, with a knitted scarf and a satchel hanging from them."""
    cv.rect(x0, y0, x0 + 18, y0 + 2, WOOD[4]); cv.hline(x0, x0 + 18, y0, WOOD[5]); cv.hline(x0, x0 + 18, y0 + 2, WOOD[1])
    for hx in (x0 + 3, x0 + 9, x0 + 15):
        cv.put(hx, y0 + 3, WOOD[5]); cv.put(hx, y0 + 4, WOOD[3])
    scarf = [hexc("6a2420"), hexc("a8403a"), hexc("d87a5a")]
    for y in range(y0 + 4, y0 + 17):
        for x in (x0 + 2, x0 + 3, x0 + 4):
            cv.put(x + (1 if y > y0 + 12 else 0), y, scarf[1] if (y // 2) % 2 else scarf[2])
        cv.put(x0 + 1, y, scarf[0])
    for y in range(y0 + 4, y0 + 13):
        for x in range(x0 + 12, x0 + 19):
            cv.put(x, y, hexc("6a3d22") if x in (x0 + 12, x0 + 18) or y == y0 + 12 else hexc("8c5530"))
    cv.hline(x0 + 12, x0 + 18, y0 + 7, hexc("5a321c")); cv.put(x0 + 15, y0 + 8, GOLD[1])


# ---------- the door ----------
def doorway(cv: Canvas) -> None:
    """The doorway: a round-topped opening (left see-through: outside shows) in an arch of cut stones, a stone step."""
    x0, y0, x1, y1 = DOOR
    tmp = Canvas(W, H, seed=31)
    tavern.stones(tmp, x0 - 6, y0 - 6, x1 + 6, y1, row=6, seed=31)
    for y in range(y0 - 6, y1 + 1):
        for x in range(x0 - 6, x1 + 7):
            if in_round_top(x, y, x0, y0, x1, y1):
                cv.px[x, y] = CLEAR
            elif in_round_top(x, y, x0 - 5, y0 - 5, x1 + 5, y1):
                cv.put(x, y, tmp.get(x, y))
            elif in_round_top(x, y, x0 - 6, y0 - 6, x1 + 6, y1):
                cv.put(x, y, STONE[0])
    kx = (x0 + x1) // 2
    cv.rect(kx - 2, y0 - 5, kx + 2, y0 - 1, STONE[4]); cv.hline(kx - 2, kx + 2, y0 - 1, STONE[2])
    cv.rect(x0 - 4, y1 + 1, x1 + 4, y1 + 3, STONE[3]); cv.hline(x0 - 4, x1 + 4, y1 + 1, STONE[4]); cv.hline(x0 - 4, x1 + 4, y1 + 3, STONE[1])


def door(cv: Canvas, x0: int, y0: int, open_: bool) -> None:
    """The door leaf on a canvas of the doorway's size: shut (round-topped planks, two iron strap hinges, a ring
    handle, a little heart cut in it with the warm light behind) or swung open against the wall (edge-on at the
    hinge side, the doorway behind it left see-through)."""
    w, h = DOOR[2] - DOOR[0] + 1, DOOR[3] - DOOR[1] + 1
    if open_:
        r = w / 2
        for y in range(h):
            k = 6 + (y * 2) // h
            for x in range(k):
                if not in_round_top(x, y, 0, 0, w - 1, h - 1):
                    continue
                c = WOOD[4] if x == 0 else WOOD[1] if x == k - 1 else WOOD[3] if x < k - 2 else WOOD[2]
                cv.put(x0 + x, y0 + y, c)
        for hy in (int(r) + 4, h - 16):
            cv.rect(x0 + 1, y0 + hy, x0 + 4, y0 + hy + 2, IRON[1])
        return
    for y in range(h):
        for x in range(w):
            if not in_round_top(x, y, 0, 0, w - 1, h - 1):
                continue
            plank = x // 6
            edge = x % 6
            c = WOOD[1] if edge == 0 else WOOD[4] if edge == 1 else (WOOD[3] if plank % 2 else WOOD[2])
            if not in_round_top(x, y - 1, 0, 0, w - 1, h - 1) or not in_round_top(x - 1, y, 0, 0, w - 1, h - 1):
                c = WOOD[5]
            elif not in_round_top(x + 1, y, 0, 0, w - 1, h - 1) or y == h - 1:
                c = WOOD[0]
            cv.put(x0 + x, y0 + y, c)
    cv.speckle(x0 + 2, y0 + 20, x0 + w - 3, y0 + h - 3, WOOD[1], 0.05)
    # two iron strap hinges reaching across from the hinge side, ending in an arrow; nails along them
    for hy in (26, h - 16):
        cv.rect(x0, y0 + hy, x0 + 25, y0 + hy + 2, IRON[1]); cv.hline(x0, x0 + 25, y0 + hy, IRON[2]); cv.hline(x0, x0 + 25, y0 + hy + 2, IRON[0])
        for k in range(3):
            cv.vline(x0 + 26 + k, y0 + hy - 2 + k, y0 + hy + 4 - k, IRON[1])
        for nx in (x0 + 4, x0 + 12, x0 + 20):
            cv.put(nx, y0 + hy + 1, IRON[2])
    # the ring handle
    rx, ry = x0 + w - 9, y0 + 40
    cv.rect(rx - 2, ry - 3, rx + 2, ry, IRON[1]); cv.put(rx, ry - 2, IRON[2])
    for a in range(16):
        t = a / 16 * math.tau
        cv.put(round(rx + math.sin(t) * 3), round(ry + 3 + math.cos(t) * 3), IRON[2] if a < 8 else IRON[0])
    # a little heart cut in the door, the warm light of home behind it
    heart = [".xx.xx.", "xxxxxxx", "xxxxxxx", ".xxxxx.", "..xxx..", "...x..."]
    hx, hy = x0 + w // 2 - 3, y0 + 10
    for yy, row in enumerate(heart):
        for xx, ch in enumerate(row):
            if ch == "x":
                cv.put(hx + xx, hy + yy, FIRE[2] if yy < 2 else FIRE[1])
    cv.put(hx + 1, hy + 1, FIRE[3])


# ---------- the whole room ----------
def dim(cv: Canvas) -> None:
    """Warm, low light: everything a little darker and warmer, darker still far from the fire and up in the rafters."""
    hx, hy = HEARTH
    for y in range(H):
        for x in range(W):
            p = cv.get(x, y)
            if not p[3]:
                continue
            far = min(1.0, math.hypot(x - hx, (y - hy) * 1.4) / 300)
            k = 0.86 - 0.3 * far - (0.12 if y < 15 else 0) - max(0, (y - 128) / 16) * 0.08
            if (x + y) % 2 and far > 0.6:
                k -= 0.03
            tint = (1.0, 0.9, 0.76)
            cv.px[x, y] = tuple(min(255, round(p[i] * k * tint[i])) for i in range(3)) + (p[3],)


def glow(cv: Canvas, cx, cy, radius, strength, colour=(255, 160, 80)) -> None:
    for y in range(max(0, cy - radius), min(H, cy + radius)):
        for x in range(max(0, cx - radius), min(W, cx + radius)):
            d = math.hypot(x - cx, (y - cy) * 1.2)
            if d >= radius:
                continue
            p = cv.get(x, y)
            if not p[3] or p[:3] == INK[:3]:
                continue
            a = strength * (1 - d / radius) ** 1.6
            if (x * 7 + y * 13) % 5 < 2:
                a *= 0.7
            cv.px[x, y] = tuple(round(p[i] * (1 - a) + colour[i] * a) for i in range(3)) + (p[3],)


def room(frame: int = 0) -> Image.Image:
    cv = Canvas(W, H, seed=11)
    wash(cv, 0, 15, W - 1, 65)
    bare_stones(cv, 207, 24, 6, 4, seed=8)  # one patch where the plaster has come away
    tavern.stones(cv, 0, 66, W - 1, FLOOR_TOP - 1, row=6, seed=5)  # the stone footing
    cv.hline(0, W - 1, 66, STONE[4]); cv.hline(0, W - 1, FLOOR_TOP - 1, STONE[0])
    ceiling(cv)
    tavern.post(cv, 0, 45, 4, FLOOR_TOP - 1)
    tavern.post(cv, W - 5, 31, W - 1, FLOOR_TOP - 1)
    floor(cv, FLOOR_TOP, H - 1)
    rug(cv)
    hearth(cv)
    herbs(cv)
    window(cv)
    shelf(cv)
    hooks(cv, 222, 46)
    doorway(cv)
    # a pool of light from the window, lying on the floor
    for y in range(FLOOR_TOP + 2, FLOOR_TOP + 22):
        spread = (y - FLOOR_TOP) * 0.7
        for x in range(int(WINDOW[0] - spread), int(WINDOW[2] + spread) + 1):
            p = cv.get(x, y)
            if p[3] and (x + y) % 3 == 0:
                cv.px[x, y] = tuple(min(255, round(p[i] * 1.1 + 5)) for i in range(3)) + (255,)
    dim(cv)
    glow(cv, HEARTH[0], HEARTH[1], 120, 0.42)
    glow(cv, HEARTH[0], HEARTH[1] + 6, 40, 0.35, (255, 190, 110))
    fire_glow(cv, frame)
    return cv.im


def fire_strip() -> Image.Image:
    """The hearth's fire, its frames side by side: the room's firebox with the flames of each frame (FLAMES)."""
    x0, y0, x1, y1 = FIRE_BOX
    w, h = x1 - x0, y1 - y0
    strip = Image.new("RGBA", (w * len(FLAMES), h), CLEAR)
    for i in range(len(FLAMES)):
        strip.alpha_composite(room(i).crop(FIRE_BOX), (i * w, 0))
    return strip


# ---------- the sky seen through the window and the doorway (no neon: "normal clouds and sun") ----------
SUNNY = [hexc("f0a030"), hexc("f8c848"), hexc("fde480"), hexc("fff4c0")]
CLOUD = [hexc("a8bcd4"), hexc("cfdcea"), hexc("eef4fa"), hexc("ffffff")]


def sky_sun() -> Image.Image:
    """A plain round sun, warm yellow, lighter in the middle, with a faint ring of light."""
    cv = Canvas(18, 18, seed=31)
    for y in range(18):
        for x in range(18):
            d = math.hypot(x - 8.5, y - 8.5)
            if d < 5.6:
                cv.put(x, y, SUNNY[3] if d < 2.4 and x <= 8 and y <= 8 else SUNNY[2] if d < 4.2 else SUNNY[1])
            elif d < 6.4:
                cv.put(x, y, SUNNY[0])
            elif d < 8.4 and (x + y) % 2 == 0:
                cv.put(x, y, SUNNY[2][:3] + (110,))
    return cv.im


def sky_moon() -> Image.Image:
    """A plain pale crescent moon."""
    cv = Canvas(14, 14, seed=32)
    for y in range(14):
        for x in range(14):
            if math.hypot(x - 6.5, y - 6.5) < 5.6 and math.hypot(x - 9.2, y - 5) >= 4.6:
                cv.put(x, y, hexc("fff6d8") if x < 5 else hexc("e8dcb4"))
    return cv.im


def sky_cloud(w: int, h: int, seed: int) -> Image.Image:
    """A soft white cumulus cloud: round puffs on a flat base, lit from above, a little grey-blue underneath."""
    r = random.Random(seed)
    puffs = []
    n = max(3, w // 9)
    for i in range(n):
        cx = 3 + (i + 0.5) * (w - 6) / n
        rad = h * (0.38 + 0.3 * math.sin(i / max(1, n - 1) * math.pi)) + r.uniform(-0.6, 0.6)
        puffs.append((cx, h - 2 - rad * 0.9, rad))
    cv = Canvas(w, h, seed=seed)
    inside = lambda x, y: y <= h - 2 and any(math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15) < rad for cx, cy, rad in puffs)
    for y in range(h):
        for x in range(w):
            if not inside(x, y):
                continue
            up = not inside(x, y - 1) or not inside(x, y - 2)
            low = y >= h - 3 or not inside(x, y + 2)
            c = CLOUD[3] if up else CLOUD[0] if y >= h - 2 else CLOUD[1] if low else CLOUD[2]
            cv.put(x, y, c)
    return cv.im


def door_piece(open_: bool) -> Image.Image:
    w, h = DOOR[2] - DOOR[0] + 1, DOOR[3] - DOOR[1] + 1
    cv = Canvas(w, h, seed=12)
    door(cv, 0, 0, open_)
    return cv.im


def mailbox_piece(flag_up: bool) -> Image.Image:
    """The mailbox by the cottage's path in the yard (slice 4): a little wooden box with a round top on a post, its red
    flag raised when a friend's gift has come (the game raises it; tap it and the creature fetches the gift)."""
    cv = Canvas(18, 26, seed=13)
    cv.rect(7, 12, 9, 25, WOOD[3]); cv.vline(7, 12, 25, WOOD[4]); cv.vline(9, 12, 25, WOOD[1])  # the post
    cv.rect(5, 24, 11, 25, STONE[2]); cv.hline(5, 11, 24, STONE[3])  # its stone foot
    for y in range(3, 13):  # the box: a round top
        for x in range(2, 15):
            top = 3 + (1 if x in (2, 14) else 0) + (1 if x in (3, 13) else 0)
            if y < top:
                continue
            c = hexc("3e6a8a") if x > 3 else hexc("5a8ab0")
            if y == top or x == 2:
                c = hexc("7aaad0")
            if x == 14 or y == 12:
                c = hexc("2a4a66")
            cv.put(x, y, c)
    cv.rect(3, 6, 4, 10, hexc("2a4a66")); cv.put(3, 7, IRON[2])  # the little door and its latch
    cv.hline(5, 12, 7, hexc("2a4a66"))
    if flag_up:
        cv.vline(15, 1, 8, IRON[1]); cv.rect(16, 1, 17, 3, hexc("e04848")); cv.put(16, 1, hexc("ff8a8a"))
    else:
        cv.hline(15, 17, 8, IRON[1]); cv.rect(16, 9, 17, 10, hexc("a83030"))
    return cv.im


PIECES = {"room": room, "fire": fire_strip, "sky_sun": sky_sun, "sky_moon": sky_moon,
          "sky_cloud_1": lambda: sky_cloud(40, 14, 41), "sky_cloud_2": lambda: sky_cloud(26, 10, 42), "door": lambda: door_piece(False), "door_open": lambda: door_piece(True),
          "mailbox": lambda: mailbox_piece(False), "mailbox_flag": lambda: mailbox_piece(True)}


def lua_for(name: str, im: Image.Image) -> str:
    w, h = im.size
    ase = (SRC / f"{name}.aseprite").as_posix()
    png = (OUT / f"{name}.png").as_posix()
    lines = [f"do local s = Sprite({w}, {h}, ColorMode.RGB) local img = s.cels[1].image"]
    for y in range(h):
        for x in range(w):
            r, g, b, a = im.getpixel((x, y))
            if a:
                lines.append(f"img:drawPixel({x}, {y}, app.pixelColor.rgba({r}, {g}, {b}, {a}))")
    lines.append(f's:saveAs("{ase}") s:saveCopyAs("{png}") s:close() end')
    return "\n".join(lines)


def build(aseprite: bool) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    made = {name: fn() for name, fn in PIECES.items()}
    if aseprite:
        SRC.mkdir(parents=True, exist_ok=True)
        script = SRC / "_place.lua"
        script.write_text("\n".join(lua_for(n, im) for n, im in made.items()), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        script.unlink()
    else:
        for name, im in made.items():
            im.save(OUT / f"{name}.png")
    print(f"{len(made)} room pieces written" + (" (placed in Aseprite, sources saved)" if aseprite else ""))


def preview(out: str, theme: str = "meadow") -> None:
    """The room as the game shows it: the theme's sky and far layer behind, the door shut; and again with it open."""
    sc = 3
    art = ROOT / "web" / "game-art"

    def scene(open_: bool) -> Image.Image:
        im = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        for layer in ("sky", "far", "mid"):
            p = art / "habitat" / theme / f"{layer}.png"
            if p.exists():
                im.alpha_composite(Image.open(p).convert("RGBA"))
        im.alpha_composite(room())
        im.alpha_composite(door_piece(open_), (DOOR[0], DOOR[1]))
        return im
    sheet = Image.new("RGBA", (W * sc, H * sc * 2 + 12), (30, 26, 40, 255))
    sheet.alpha_composite(scene(False).resize((W * sc, H * sc), Image.NEAREST), (0, 0))
    sheet.alpha_composite(scene(True).resize((W * sc, H * sc), Image.NEAREST), (0, H * sc + 12))
    sheet.save(out)
    print(f"preview -> {out}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "preview"
    if cmd == "build":
        build("--aseprite" in sys.argv)
    elif cmd == "preview":
        preview(sys.argv[2] if len(sys.argv) > 2 else "room_preview.png", sys.argv[3] if len(sys.argv) > 3 else "meadow")
    else:
        print(__doc__)
