"""The guild tavern, designed pixel by pixel and placed in Aseprite by a script (the method the owner agreed for the
tavern on 2026-11-17: "Script into Aseprite"). The look is a plain fantasy tavern (the owner's choice): timber and
plaster walls, a stone hearth with a fire, a bar with bottles, barrels, a window at night, and a hanging banner that
the game writes the guild's tag on.

    .venv/Scripts/python.exe tools/game_art/tavern.py preview OUT.png   a sheet to look at (3x, with creatures' spots)
    .venv/Scripts/python.exe tools/game_art/tavern.py build [--aseprite] write web/game-art/tavern/*.png (and sources)

Files (web/game-art/tavern/, sources in game/art-src/tavern/):
    room.png        400 x 200  the room: everything behind the creatures
    fire.png        4 frames of 32 x 26 side by side: the hearth's fire (drawn at FIRE_AT)
    flame.png       4 frames of 5 x 7: a candle flame (drawn at each of FLAMES)
    table_round.png 44 x 30    a round table with a mug: stands in front of creatures sitting at it
    table_long.png  84 x 30    a long table with plates
    stool.png       14 x 14
The positions the game needs (fire, flames, banner text, props, where creatures may stand) are printed by `spots`
and kept by hand in web/js/game/tavern.js (they are the same numbers as below).
"""

from __future__ import annotations

import math
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "game-art" / "tavern"
SRC = ROOT / "game" / "art-src" / "tavern"
ASEPRITE = r"C:\Program Files (x86)\Steam\steamapps\common\Aseprite\Aseprite.exe"

W, H = 400, 200
FIRE_AT = (42, 89)          # top-left of the fire's frame in the room
FLAMES = [(29, 61), (83, 61), (122, 49), (251, 49), (319, 87)]  # top-left of each candle flame
BANNER = (222, 52)          # the middle of the banner's cloth, where the tag goes

def hexc(s: str, a: int = 255):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)

# ---------- the palette ----------
INK = hexc("1b1420")
WOOD = [hexc("2a170f"), hexc("3d2418"), hexc("5a3420"), hexc("74452a"), hexc("8f5a36"), hexc("b07a4a")]  # darkest .. lightest
PLASTER = [hexc("7d5f40"), hexc("9c7b55"), hexc("b8956c"), hexc("c9a87c"), hexc("d8bb90")]
STONE = [hexc("3a363c"), hexc("4c4850"), hexc("6e6a6f"), hexc("8f8a8e"), hexc("aba6a6")]
FIRE = [hexc("d6401d"), hexc("ff7a1f"), hexc("ffc23d"), hexc("ffef9a"), hexc("fffbe0")]
GLASS = {"green": [hexc("1f3d1c"), hexc("3d6e2e"), hexc("6fa84f")], "red": [hexc("4a1416"), hexc("8c2b2b"), hexc("c45050")],
         "blue": [hexc("1c2a4a"), hexc("3f5f9c"), hexc("7aa0d8")], "amber": [hexc("5a3008"), hexc("a8641a"), hexc("e0a040")]}
CLOTH = [hexc("4a1418"), hexc("6a1f22"), hexc("8c2b2b"), hexc("b04040")]
GOLD = [hexc("8a5a18"), hexc("d8a840"), hexc("f4d878")]
IRON = [hexc("26222a"), hexc("3a363c"), hexc("5c5862")]
CREAM = [hexc("b8a888"), hexc("e6d8b4"), hexc("fbf3dc")]
SKY = [hexc("161a3a"), hexc("1e2350"), hexc("2c3270"), hexc("3a428a")]
MOON = [hexc("c8c0a0"), hexc("f4eccc")]
SHADE = (27, 20, 32, 110)   # a soft shadow on the floor


class Canvas:
    def __init__(self, w: int, h: int, seed: int = 1):
        self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.px = self.im.load()
        self.w, self.h = w, h
        self.r = random.Random(seed)

    def put(self, x: int, y: int, c) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            if len(c) == 4 and c[3] < 255:
                base = self.px[x, y]
                a = c[3] / 255
                if base[3] == 0:
                    self.px[x, y] = c
                else:
                    self.px[x, y] = tuple(round(base[i] * (1 - a) + c[i] * a) for i in range(3)) + (255,)
            else:
                self.px[x, y] = c

    def get(self, x: int, y: int):
        return self.px[x, y] if 0 <= x < self.w and 0 <= y < self.h else (0, 0, 0, 0)

    def rect(self, x0, y0, x1, y1, c) -> None:  # inclusive
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def hline(self, x0, x1, y, c) -> None:
        self.rect(x0, y, x1, y, c)

    def vline(self, x, y0, y1, c) -> None:
        self.rect(x, y0, x, y1, c)

    def ellipse(self, cx, cy, rx, ry, c, fill=True) -> None:
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
                if fill and d <= 1:
                    self.put(x, y, c)

    def speckle(self, x0, y0, x1, y1, c, share: float) -> None:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if self.r.random() < share:
                    self.put(x, y, c)


# ---------- the room ----------
def planks_vertical(cv: Canvas, x0, y0, x1, y1, width=10) -> None:
    """Boards standing side by side (the wainscot), with seams, grain and the odd knot."""
    for x in range(x0, x1 + 1):
        board = (x - x0) // width
        edge = (x - x0) % width
        shade = WOOD[3] if board % 3 else WOOD[2]
        for y in range(y0, y1 + 1):
            cv.put(x, y, WOOD[1] if edge == 0 else WOOD[4] if edge == 1 else shade)
    cv.speckle(x0, y0, x1, y1, WOOD[2], 0.07)
    for i in range((x1 - x0) // 14):
        kx, ky = cv.r.randint(x0 + 2, x1 - 2), cv.r.randint(y0 + 3, y1 - 3)
        if (kx - x0) % width > 2:
            cv.put(kx, ky, WOOD[1]); cv.put(kx + 1, ky, WOOD[2])


def beam(cv: Canvas, x0, y0, x1, y1) -> None:
    """A heavy wooden beam: lit top edge, dark underside, grain."""
    cv.rect(x0, y0, x1, y1, WOOD[3])
    cv.hline(x0, x1, y0, WOOD[5])
    cv.hline(x0, x1, y0 + 1, WOOD[4])
    cv.hline(x0, x1, y1, WOOD[0])
    cv.hline(x0, x1, y1 - 1, WOOD[1])
    for _ in range((x1 - x0) * (y1 - y0) // 30):
        x, y = cv.r.randint(x0, x1), cv.r.randint(y0 + 2, y1 - 2)
        cv.hline(x, min(x1, x + cv.r.randint(2, 7)), y, WOOD[2])


def post(cv: Canvas, x0, y0, x1, y1) -> None:
    """An upright timber: lit left side, shadowed right."""
    cv.rect(x0, y0, x1, y1, WOOD[3])
    cv.vline(x0, y0, y1, WOOD[4])
    cv.vline(x0 + 1, y0, y1, WOOD[5] if x1 - x0 > 4 else WOOD[4])
    cv.vline(x1, y0, y1, WOOD[1])
    cv.vline(x1 - 1, y0, y1, WOOD[2])
    for _ in range((y1 - y0) // 5):
        x, y = cv.r.randint(x0 + 2, x1 - 2), cv.r.randint(y0, y1)
        cv.vline(x, y, min(y1, y + cv.r.randint(2, 6)), WOOD[2])


def brace(cv: Canvas, ax, ay, bx, by, t=3) -> None:
    n = max(abs(bx - ax), abs(by - ay))
    for i in range(n + 1):
        x = round(ax + (bx - ax) * i / n)
        y = round(ay + (by - ay) * i / n)
        for k in range(t):
            cv.put(x + k, y, WOOD[1] if k == t - 1 else WOOD[4] if k == 0 else WOOD[3])


def stones(cv: Canvas, x0, y0, x1, y1, row=7, seed=0, mortar=None) -> None:
    """A wall of cut stones in courses: varied blocks, mortar lines, a lit top-left edge on each."""
    r = random.Random(seed)
    mortar = mortar or STONE[0]
    y = y0
    course = 0
    while y <= y1:
        h = min(row, y1 - y + 1)
        x = x0 - (r.randint(0, 8) if course % 2 else 0)
        while x <= x1:
            w = r.randint(9, 16)
            tone = r.choice([STONE[1], STONE[2], STONE[2], STONE[3]])
            for yy in range(y, y + h):
                for xx in range(max(x, x0), min(x + w - 1, x1) + 1):
                    c = tone
                    if yy == y + h - 1 or xx == x + w - 1:
                        c = mortar
                    elif yy == y or xx == x:
                        c = STONE[min(4, STONE.index(tone) + 1)]
                    elif yy == y + h - 2:
                        c = STONE[max(0, STONE.index(tone) - 1)]
                    cv.put(xx, yy, c)
            if r.random() < 0.35:
                cv.put(r.randint(max(x, x0) + 2, max(max(x, x0) + 2, min(x + w - 3, x1))), y + r.randint(2, max(2, h - 3)), STONE[max(0, STONE.index(tone) - 1)])
            x += w
        y += h
        course += 1


def plaster(cv: Canvas, x0, y0, x1, y1) -> None:
    cv.rect(x0, y0, x1, y1, PLASTER[3])
    cv.speckle(x0, y0, x1, y1, PLASTER[2], 0.10)
    cv.speckle(x0, y0, x1, y1, PLASTER[4], 0.04)
    for y in range(y0, min(y1, y0 + 4) + 1):  # the shadow under the ceiling beam
        for x in range(x0, x1 + 1):
            if (x + y) % (2 if y - y0 < 2 else 3) == 0 or y - y0 < 2:
                cv.put(x, y, PLASTER[1] if y - y0 < 2 else PLASTER[2])
    # a few hairline cracks
    for _ in range(max(1, (x1 - x0) // 60)):
        x, y = cv.r.randint(x0 + 4, x1 - 4), cv.r.randint(y0 + 10, y1 - 8)
        for i in range(cv.r.randint(4, 8)):
            cv.put(x, y, PLASTER[1])
            x += cv.r.choice([-1, 0, 1]); y += 1


def floor(cv: Canvas, y0, y1) -> None:
    """Floorboards running across, rows getting deeper toward us, staggered joints, grain and knots."""
    rows = [y0]
    h = 5
    while rows[-1] < y1:
        rows.append(min(y1 + 1, rows[-1] + h))
        h = min(14, h + 1)
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1] - 1
        x = -cv.r.randint(0, 40)
        while x < W:
            ln = cv.r.randint(46, 90)
            tone = cv.r.choice([WOOD[3], WOOD[3], WOOD[2], WOOD[4]])
            for y in range(a, b + 1):
                for xx in range(max(0, x), min(W - 1, x + ln - 1) + 1):
                    c = tone
                    if y == a:
                        c = WOOD[1]                              # the seam between rows
                    elif y == a + 1:
                        c = WOOD[min(5, WOOD.index(tone) + 1)]   # the lit front edge of the board behind
                    elif xx == x:
                        c = WOOD[1]                              # the joint
                    cv.put(xx, y, c)
            for _ in range(ln * (b - a) // 18):
                gx, gy = cv.r.randint(max(0, x + 2), min(W - 1, x + ln - 2)), cv.r.randint(a + 2, max(a + 2, b))
                cv.hline(gx, min(W - 1, gx + cv.r.randint(2, 6)), gy, WOOD[max(1, WOOD.index(tone) - 1)])
            if cv.r.random() < 0.3 and b - a > 5:
                kx, ky = cv.r.randint(max(0, x + 4), min(W - 2, x + ln - 4)), cv.r.randint(a + 3, b - 2)
                cv.put(kx, ky, WOOD[1]); cv.put(kx + 1, ky, WOOD[1]); cv.put(kx, ky - 1, WOOD[2])
            x += ln


def bottle(cv: Canvas, x, base, kind, tall) -> None:
    g = GLASS[kind]
    neck = 2
    body_h = tall - 4
    for y in range(base - body_h + 1, base + 1):
        for xx in range(x, x + 4):
            cv.put(xx, y, g[1] if xx in (x + 1, x + 2) else g[0])
    cv.vline(x + 1, base - body_h + 2, base - 2, g[2])  # the shine
    cv.rect(x + 1, base - tall + 1, x + 2, base - body_h, g[0])
    cv.rect(x + 1, base - tall, x + 2, base - tall, CREAM[0])  # the cork
    cv.hline(x + 1, x + 2, base - body_h + 1, g[0])
    if neck:
        cv.put(x + 1, base - body_h, g[1])


def mug(cv: Canvas, x, base) -> None:
    cv.rect(x, base - 5, x + 4, base, WOOD[3])
    cv.vline(x, base - 5, base, WOOD[4])
    cv.vline(x + 4, base - 5, base, WOOD[1])
    cv.hline(x, x + 4, base - 4, IRON[2]); cv.hline(x, x + 4, base - 1, IRON[1])
    cv.hline(x, x + 4, base - 6, CREAM[2]); cv.hline(x + 1, x + 3, base - 7, CREAM[1])  # the froth
    cv.vline(x + 5, base - 4, base - 2, WOOD[2]); cv.put(x + 6, base - 3, WOOD[2])        # the handle


def candle(cv: Canvas, x, base, tall=6) -> None:
    cv.rect(x, base - tall + 1, x + 2, base, CREAM[1])
    cv.vline(x, base - tall + 1, base, CREAM[2])
    cv.vline(x + 2, base - tall + 1, base, CREAM[0])
    cv.put(x + 1, base - tall, INK)  # the wick (the flame is drawn by the game, flame.png)


def barrel(cv: Canvas, x0, base, w=18, h=24) -> None:
    top = base - h + 1
    for y in range(top, base + 1):
        bulge = round(1.5 * math.sin(math.pi * (y - top) / max(1, h - 1)))
        for x in range(x0 - bulge, x0 + w + bulge):
            rel = (x - (x0 - bulge)) / max(1, w + 2 * bulge - 1)
            c = WOOD[4] if rel < 0.2 else WOOD[3] if rel < 0.65 else WOOD[2] if rel < 0.88 else WOOD[1]
            if (x - x0) % 5 == 0:
                c = WOOD[max(0, WOOD.index(c) - 1)]
            cv.put(x, y, c)
        if y in (top + 4, top + 5, base - 5, base - 4):
            for x in range(x0 - bulge, x0 + w + bulge):
                cv.put(x, y, IRON[2] if y in (top + 4, base - 5) else IRON[0])
    cv.ellipse(x0 + w / 2 - 0.5, top + 1, w / 2, 2.2, WOOD[4])
    cv.ellipse(x0 + w / 2 - 0.5, top + 1.3, w / 2 - 2, 1.4, WOOD[3])
    cv.hline(x0 + 1, x0 + w - 2, base, WOOD[0])


def hearth(cv: Canvas) -> None:
    # the chimney breast of stone, from the ceiling to the floor
    stones(cv, 26, 0, 90, 117, row=7, seed=11)
    cv.vline(26, 0, 117, STONE[0]); cv.vline(90, 0, 117, STONE[0])
    # the mantel shelf, with what stands on it
    cv.rect(22, 68, 94, 73, WOOD[3]); cv.hline(22, 94, 68, WOOD[5]); cv.hline(22, 94, 69, WOOD[4])
    cv.hline(22, 94, 73, WOOD[0]); cv.hline(24, 92, 74, STONE[0])
    for x in (25, 91):
        cv.rect(x, 74, x + 2, 78, WOOD[2]); cv.put(x, 74, WOOD[3])
    candle(cv, 28, 67, 6)
    candle(cv, 82, 67, 6)
    # a pot and a small jar
    cv.ellipse(48, 63, 6, 4.5, IRON[1]); cv.hline(43, 53, 59, IRON[2]); cv.put(45, 61, IRON[2]); cv.hline(46, 49, 60, IRON[2])
    cv.hline(42, 54, 67, IRON[0])
    cv.rect(64, 60, 68, 67, GLASS["amber"][1]); cv.vline(65, 61, 66, GLASS["amber"][2]); cv.hline(64, 68, 59, CREAM[0])
    cv.hline(63, 69, 67, GLASS["amber"][0])
    # the firebox: an arch of lighter stones round a dark opening
    cx, top = 58, 80
    for y in range(top - 3, 118):
        for x in range(34, 83):
            dx = x + 0.5 - cx
            ry = 10
            arch_y = top + ry - math.sqrt(max(0, 1 - (dx / 23) ** 2)) * ry if abs(dx) < 23 else 999
            inner = abs(dx) < 20 and y >= arch_y + 3
            ring = abs(dx) < 23.5 and y >= arch_y and not inner
            if inner:
                depth = (y - top) / (118 - top)
                cv.put(x, y, INK if depth < 0.55 or abs(dx) < 14 else hexc("2a1d1e"))
            elif ring:
                cv.put(x, y, STONE[3] if (x + y) % 7 else STONE[1])
    for x in range(35, 82, 6):  # the arch's joints
        ay = top + 10 - math.sqrt(max(0, 1 - ((x - cx) / 23) ** 2)) * 10
        cv.put(x, int(ay) + 1, STONE[1]); cv.put(x, int(ay) + 2, STONE[1])
    # soot above the opening
    for y in range(64, 80):
        for x in range(46, 71):
            if cv.r.random() < 0.25 * (1 - abs(x - 58) / 13) * (1 - (79 - y) / 16):
                cv.put(x, y, STONE[0])
    # andirons and logs (the fire burns on these)
    for x in (44, 70):
        cv.rect(x, 108, x + 2, 116, IRON[1]); cv.put(x, 107, IRON[2]); cv.put(x + 1, 107, IRON[2])
    for (ax, ay, bx, by) in ((41, 113, 75, 111), (43, 111, 73, 114)):
        n = bx - ax
        for i in range(n + 1):
            x = ax + i
            y = round(ay + (by - ay) * i / n)
            cv.put(x, y - 1, WOOD[4]); cv.put(x, y, WOOD[2]); cv.put(x, y + 1, WOOD[1])
    cv.hline(40, 76, 116, hexc("ff7a1f", 200)); cv.hline(42, 74, 117, hexc("d6401d", 220))  # embers
    # the hearthstone, out onto the floor
    cv.rect(24, 118, 92, 124, STONE[2]); cv.hline(24, 92, 118, STONE[4]); cv.hline(24, 92, 119, STONE[3])
    cv.hline(24, 92, 124, STONE[0]); cv.vline(24, 118, 124, STONE[1]); cv.vline(92, 118, 124, STONE[1])
    for x in (41, 58, 75):
        cv.vline(x, 120, 123, STONE[1])


def window(cv: Canvas) -> None:
    x0, y0, x1, y1 = 136, 32, 180, 80
    for y in range(y0 + 3, y1 - 2):
        share = (y - y0) / (y1 - y0)
        for x in range(x0 + 3, x1 - 2):
            i = min(3, int(share * 4))
            c = SKY[i]
            if (x + y) % 2 and int(share * 4 + 0.5) != i:
                c = SKY[min(3, i + 1)]
            cv.put(x, y, c)
    cv.ellipse(167, 44, 6, 6, MOON[1]); cv.ellipse(164, 42, 5, 5, SKY[0])  # a crescent moon
    cv.put(166, 49, MOON[0]); cv.put(170, 47, MOON[0])
    for (sx, sy) in ((143, 38), (152, 45), (147, 57), (175, 60), (158, 36), (141, 66), (171, 70)):
        cv.put(sx, sy, CREAM[2])
    cv.put(152, 44, CREAM[1]); cv.put(152, 46, CREAM[1])
    # frame, mullions, sill
    for (a, b, c, d) in ((x0, y0, x1, y0 + 2), (x0, y1 - 2, x1, y1), (x0, y0, x0 + 2, y1), (x1 - 2, y0, x1, y1)):
        cv.rect(a, b, c, d, WOOD[3])
    cv.hline(x0, x1, y0, WOOD[5]); cv.vline(x0, y0, y1, WOOD[4]); cv.vline(x1, y0, y1, WOOD[1]); cv.hline(x0, x1, y1, WOOD[1])
    cv.rect(157, y0 + 3, 159, y1 - 3, WOOD[3]); cv.vline(157, y0 + 3, y1 - 3, WOOD[4]); cv.vline(159, y0 + 3, y1 - 3, WOOD[1])
    cv.rect(x0 + 3, 55, x1 - 3, 57, WOOD[3]); cv.hline(x0 + 3, x1 - 3, 55, WOOD[4]); cv.hline(x0 + 3, x1 - 3, 57, WOOD[1])
    cv.rect(x0 - 3, y1 + 1, x1 + 3, y1 + 4, WOOD[4]); cv.hline(x0 - 3, x1 + 3, y1 + 1, WOOD[5]); cv.hline(x0 - 3, x1 + 3, y1 + 4, WOOD[1])
    cv.hline(x0 - 2, x1 + 2, y1 + 5, PLASTER[1])
    # a little potted plant on the sill
    cv.rect(140, y1 - 3, 145, y1, hexc("a85a38")); cv.hline(139, 146, y1 - 4, hexc("c4704a")); cv.vline(140, y1 - 3, y1, hexc("c4704a"))
    for (px, py) in ((141, 73), (142, 72), (143, 71), (144, 72), (145, 73), (142, 74), (144, 74), (143, 70)):
        cv.put(px, py, hexc("4f8a3a"))
    cv.put(143, 71, hexc("6fa84f")); cv.put(142, 72, hexc("6fa84f"))


def banner(cv: Canvas) -> None:
    """A cloth banner on a rod; the game writes the guild's tag across its middle."""
    x0, x1, top, bottom = 206, 238, 34, 74
    cv.rect(x0 - 4, top - 3, x1 + 4, top - 1, WOOD[2]); cv.hline(x0 - 4, x1 + 4, top - 3, WOOD[4]); cv.hline(x0 - 4, x1 + 4, top - 1, WOOD[1])
    for x in (x0 - 6, x1 + 5):
        cv.rect(x, top - 4, x + 1, top, GOLD[1]); cv.put(x, top - 4, GOLD[2])
    cv.vline(222, top - 10, top - 4, IRON[1]); cv.put(222, top - 11, IRON[2])  # the hook it hangs from
    for y in range(top, bottom + 1):
        for x in range(x0, x1 + 1):
            notch = y > bottom - 8 and abs(x - (x0 + x1) / 2) < (y - (bottom - 8)) * 2
            if notch:
                continue
            fold = (x - x0) % 11
            c = CLOTH[2]
            if fold in (0, 1):
                c = CLOTH[3]
            elif fold in (8, 9):
                c = CLOTH[1]
            if x in (x0, x1):
                c = CLOTH[0]
            cv.put(x, y, c)
    for y in range(top + 2, bottom - 7):  # gold trim down both sides
        cv.put(x0 + 2, y, GOLD[1]); cv.put(x1 - 2, y, GOLD[1])
    cv.hline(x0 + 2, x1 - 2, top + 2, GOLD[2]); cv.hline(x0 + 2, x1 - 2, top + 3, GOLD[0])
    for x in range(x0, x1 + 1):  # the trim along the swallowtail
        for y in range(bottom - 9, bottom + 1):
            if cv.get(x, y)[3] and not cv.get(x, y + 1)[3]:
                cv.put(x, y, GOLD[1])
    cv.put(x0 + 3, bottom, GOLD[1]); cv.put(x1 - 3, bottom, GOLD[1])
    for y in range(top + 1, bottom - 6):  # its shadow on the wall
        cv.put(x1 + 1, y, PLASTER[1])


def sconce(cv: Canvas, x, y) -> None:
    """An iron candle holder on the wall; the flame is drawn by the game."""
    cv.rect(x - 1, y + 8, x + 5, y + 9, IRON[1]); cv.hline(x - 1, x + 5, y + 8, IRON[2])
    cv.vline(x + 2, y + 10, y + 14, IRON[1]); cv.rect(x + 1, y + 14, x + 3, y + 15, IRON[0])
    cv.put(x - 1, y + 7, IRON[1]); cv.put(x + 5, y + 7, IRON[1])
    candle(cv, x + 1, y + 7, 6)
    for dy in range(-6, 12):  # warm light on the plaster around it
        for dx in range(-9, 14):
            d = math.hypot(dx - 2, dy - 2)
            if d < 11 and cv.get(x + dx, y + dy)[:3] in [p[:3] for p in PLASTER]:
                if cv.r.random() < 0.55 * (1 - d / 11):
                    cv.put(x + dx, y + dy, PLASTER[4])


def bar(cv: Canvas) -> None:
    x0, x1 = 258, 394
    # shelves on the wall, with bottles and mugs
    for sy in (46, 70):
        cv.rect(x0 + 4, sy, x1 - 4, sy + 2, WOOD[4]); cv.hline(x0 + 4, x1 - 4, sy, WOOD[5]); cv.hline(x0 + 4, x1 - 4, sy + 2, WOOD[2])
        cv.hline(x0 + 4, x1 - 4, sy + 3, PLASTER[1]); cv.hline(x0 + 5, x1 - 5, sy + 4, PLASTER[2])
        for bx in (x0 + 8, x1 - 9):
            cv.rect(bx, sy + 3, bx + 1, sy + 8, IRON[1])
    r = random.Random(5)
    x = x0 + 8
    while x < x1 - 10:
        kind = r.choice(["green", "red", "blue", "amber", "green"])
        if r.random() < 0.18:
            mug(cv, x, 45); x += 9
        else:
            bottle(cv, x, 45, kind, r.randint(9, 13)); x += r.randint(5, 7)
    x = x0 + 9
    while x < x1 - 10:
        if r.random() < 0.3:
            cv.ellipse(x + 3, 66, 4, 3.5, CREAM[1]); cv.ellipse(x + 3, 66, 3, 2.5, CREAM[2]); cv.hline(x, x + 6, 69, CREAM[0]); x += 9  # a jug
        else:
            bottle(cv, x, 69, r.choice(["amber", "red", "green"]), r.randint(8, 12)); x += r.randint(5, 8)
    # the counter: top board and panelled front, standing on the floor
    top, base = 96, 128
    cv.rect(x0 - 4, top, x1, top + 4, WOOD[4]); cv.hline(x0 - 4, x1, top, WOOD[5]); cv.hline(x0 - 4, x1, top + 1, WOOD[5])
    cv.hline(x0 - 4, x1, top + 4, WOOD[1]); cv.vline(x0 - 4, top, top + 4, WOOD[3])
    cv.rect(x0, top + 5, x1, base, WOOD[2])
    for px in range(x0 + 4, x1 - 6, 22):  # raised panels
        cv.rect(px, top + 9, px + 16, base - 5, WOOD[3])
        cv.hline(px, px + 16, top + 9, WOOD[4]); cv.vline(px, top + 9, base - 5, WOOD[4])
        cv.hline(px, px + 16, base - 5, WOOD[1]); cv.vline(px + 16, top + 9, base - 5, WOOD[1])
        cv.speckle(px + 2, top + 11, px + 14, base - 7, WOOD[2], 0.08)
    cv.hline(x0, x1, base - 1, WOOD[1]); cv.hline(x0, x1, base, WOOD[0])
    cv.hline(x0 - 2, x1, base + 1, SHADE)
    # on the counter: mugs, a candle, a cloth
    mug(cv, 286, 95)
    mug(cv, 352, 95)
    candle(cv, 319, 95, 5)
    cv.rect(368, 93, 378, 95, CREAM[1]); cv.hline(368, 378, 93, CREAM[2]); cv.put(372, 95, CREAM[0])


def warm_light(cv: Canvas, cx, cy, radius, strength) -> None:
    """The fire's glow on everything near it (a dithered blend toward warm orange)."""
    glow = (255, 170, 90)
    for y in range(max(0, cy - radius), min(H, cy + radius)):
        for x in range(max(0, cx - radius), min(W, cx + radius)):
            d = math.hypot(x - cx, (y - cy) * 1.25)
            if d >= radius:
                continue
            p = cv.get(x, y)
            if not p[3] or p[:3] == INK[:3]:
                continue
            a = strength * (1 - d / radius) ** 1.4
            if (x * 7 + y * 13) % 5 < 2:
                a *= 0.6
            cv.px[x, y] = tuple(round(p[i] * (1 - a) + glow[i] * a) for i in range(3)) + (255,)


def room() -> Image.Image:
    cv = Canvas(W, H, seed=3)
    # ceiling boards and joists
    cv.rect(0, 0, W - 1, 12, WOOD[1])
    for x in range(0, W, 7):
        cv.vline(x, 0, 12, WOOD[0])
    for x in range(8, W, 46):
        cv.rect(x, 0, x + 8, 12, WOOD[2]); cv.hline(x, x + 8, 12, WOOD[0]); cv.vline(x, 0, 12, WOOD[3])
    beam(cv, 0, 13, W - 1, 21)
    plaster(cv, 0, 22, W - 1, 91)
    planks_vertical(cv, 0, 93, W - 1, 117)
    cv.rect(0, 89, W - 1, 92, WOOD[4]); cv.hline(0, W - 1, 89, WOOD[5]); cv.hline(0, W - 1, 92, WOOD[1])  # the rail
    cv.hline(0, W - 1, 116, WOOD[1]); cv.hline(0, W - 1, 117, WOOD[0])
    for (a, b) in ((0, 5), (108, 114), (192, 198), (252, 257), (394, 399)):
        post(cv, a, 22, b, 117)
    brace(cv, 115, 40, 133, 22)
    brace(cv, 172 + 18, 40, 172, 22)
    brace(cv, 199, 40, 215, 25)
    floor(cv, 118, H - 1)
    hearth(cv)
    window(cv)
    banner(cv)
    sconce(cv, 121, 48)
    sconce(cv, 250, 48)
    bar(cv)
    barrel(cv, 222, 127)
    barrel(cv, 236, 128)
    barrel(cv, 229, 104, w=14, h=18)
    cv.hline(214, 258, 129, SHADE)
    # a rug on the floor in the middle
    for y in range(150, 178):
        for x in range(150, 250):
            e = ((x - 200) / 52) ** 2 + ((y - 164) / 14) ** 2
            if e <= 1:
                ring = e > 0.72
                c = hexc("6a2a2a") if ring else hexc("8c4a2a") if (x // 4 + y // 3) % 2 else hexc("7a3a26")
                if 0.62 < e <= 0.72:
                    c = GOLD[0]
                cv.put(x, y, c)
    warm_light(cv, 58, 104, 92, 0.32)
    warm_light(cv, 319, 92, 40, 0.18)
    # the corners of the room fall off into shade
    for y in range(H):
        for x in range(W):
            d = max(0, (abs(x - W / 2) / (W / 2)) ** 3 * 0.25 + max(0, (y - 170) / 30) * 0.12)
            if d > 0 and (x + y) % 2 == 0:
                p = cv.get(x, y)
                cv.px[x, y] = tuple(round(p[i] * (1 - d)) for i in range(3)) + (255,)
    return cv.im


# ---------- the animated pieces ----------
def fire_frames() -> Image.Image:
    fw, fh, n = 32, 26, 4
    sheet = Image.new("RGBA", (fw * n, fh), (0, 0, 0, 0))
    for f in range(n):
        cv = Canvas(fw, fh, seed=100 + f)
        r = random.Random(40 + f)
        tongues = [(6, 12), (11, 20), (16, 24), (21, 19), (26, 11)]
        for (tx, th) in tongues:
            th = th + r.randint(-3, 3)
            sway = r.choice([-1, 0, 1])
            for y in range(fh - 1, fh - th - 1, -1):
                k = (fh - 1 - y) / th
                half = max(0.6, 4.2 * (1 - k) ** 0.8)
                cx = tx + sway * k * 3
                for x in range(int(cx - half - 1), int(cx + half + 2)):
                    dx = abs(x + 0.5 - cx)
                    if dx > half:
                        continue
                    inner = dx / half
                    c = FIRE[0] if inner > 0.75 or k > 0.85 else FIRE[1] if inner > 0.45 or k > 0.65 else FIRE[2] if k > 0.3 else FIRE[3]
                    old = cv.get(x, y)
                    if not old[3] or FIRE.index(c) > FIRE.index(old) if old[3] and old in FIRE else True:
                        cv.put(x, y, c)
        for x in range(8, 25):  # the hottest part, on the logs
            if r.random() < 0.7:
                cv.put(x, fh - 1, FIRE[4]); cv.put(x, fh - 2, FIRE[3])
        for _ in range(3):  # sparks
            cv.put(r.randint(6, 26), r.randint(0, 8), FIRE[2])
        sheet.alpha_composite(cv.im, (f * fw, 0))
    return sheet


def flame_frames() -> Image.Image:
    shapes = [  # 5 x 7, rows top to bottom: . empty, o outer, m middle, c core
        [".....", "..o..", "..o..", ".omo.", ".omo.", "omcmo", ".mcm."],
        [".....", "...o.", "..oo.", ".omo.", ".omo.", "omcmo", ".mcm."],
        ["..o..", "..o..", ".omo.", ".omo.", ".mcm.", "omcmo", ".mcm."],
        [".....", ".o...", ".oo..", ".omo.", ".omo.", "omcmo", ".mcm."],
    ]
    col = {"o": FIRE[1], "m": FIRE[2], "c": FIRE[4]}
    sheet = Image.new("RGBA", (5 * len(shapes), 7), (0, 0, 0, 0))
    for f, rows in enumerate(shapes):
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch in col:
                    sheet.putpixel((f * 5 + x, y), col[ch])
    return sheet


# ---------- furniture that stands in front of the creatures ----------
def table_round() -> Image.Image:
    cv = Canvas(44, 30, seed=21)
    cv.ellipse(22, 27.5, 13, 2.5, SHADE)
    cv.rect(19, 10, 24, 26, WOOD[2]); cv.vline(19, 10, 26, WOOD[3]); cv.vline(24, 10, 26, WOOD[1])  # the pedestal
    cv.ellipse(21.5, 26, 8, 2.2, WOOD[2]); cv.hline(15, 28, 27, WOOD[0])
    cv.ellipse(21.5, 9.5, 21, 5.5, WOOD[1])        # the edge (thickness)
    cv.ellipse(21.5, 7.5, 21, 5.2, WOOD[4])        # the top
    cv.ellipse(21.5, 7, 18, 4, WOOD[3])
    for y in range(4, 11):
        for x in range(4, 40):
            if cv.get(x, y) == WOOD[3] and (x * 3 + y * 7) % 11 == 0:
                cv.put(x, y, WOOD[2])
    cv.hline(10, 32, 3, WOOD[5])
    mug(cv, 25, 8)
    candle(cv, 14, 8, 4)
    cv.put(15, 3, FIRE[2]); cv.put(15, 2, FIRE[1])
    return cv.im


def table_long() -> Image.Image:
    cv = Canvas(84, 30, seed=22)
    cv.rect(4, 27, 79, 28, SHADE)
    for lx in (6, 74):
        cv.rect(lx, 11, lx + 3, 27, WOOD[2]); cv.vline(lx, 11, 27, WOOD[3]); cv.vline(lx + 3, 11, 27, WOOD[1])
    cv.rect(10, 18, 73, 19, WOOD[1])               # the stretcher between the legs
    cv.rect(0, 3, 83, 8, WOOD[4])                  # the top
    cv.hline(0, 83, 3, WOOD[5])
    for x in range(0, 84, 21):
        cv.vline(x, 3, 8, WOOD[3])
    cv.speckle(1, 4, 82, 7, WOOD[3], 0.12)
    cv.rect(0, 9, 83, 11, WOOD[2]); cv.hline(0, 83, 11, WOOD[0])  # the front edge
    for (px, kind) in ((14, "plate"), (38, "mug"), (58, "plate"), (70, "mug")):
        if kind == "plate":
            cv.ellipse(px + 4, 5.5, 5, 1.8, CREAM[2]); cv.hline(px + 1, px + 7, 7, CREAM[0])
            cv.put(px + 3, 5, hexc("c4704a")); cv.put(px + 5, 5, hexc("a85a38")); cv.put(px + 4, 4, hexc("c4704a"))
        else:
            mug(cv, px, 6)
    return cv.im


def stool() -> Image.Image:
    cv = Canvas(14, 14, seed=23)
    cv.ellipse(7, 12.5, 6, 1.5, SHADE)
    for (a, b) in ((2, 3), (6, 7), (10, 11)):
        cv.rect(a, 5, b, 12, WOOD[2]); cv.vline(a, 5, 12, WOOD[3])
    cv.ellipse(7, 4.5, 6.5, 2.5, WOOD[1])
    cv.ellipse(7, 3.5, 6.5, 2.4, WOOD[4])
    cv.hline(3, 10, 2, WOOD[5])
    return cv.im


PIECES = {
    "room": room, "fire": fire_frames, "flame": flame_frames,
    "table_round": table_round, "table_long": table_long, "stool": stool,
}


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
    print(f"{len(made)} tavern pieces written" + (" (placed in Aseprite, sources saved)" if aseprite else ""))


def preview(out: str) -> None:
    """The room with its fire, flames and furniture in place, 3x, beside each piece."""
    sc = 3
    scene = room()
    fire = fire_frames().crop((0, 0, 32, 26))
    scene.alpha_composite(fire, FIRE_AT)
    flame = flame_frames().crop((0, 0, 5, 7))
    for (x, y) in FLAMES:
        scene.alpha_composite(flame, (x, y))
    for (img, (x, y)) in ((stool(), (96, 160)), (table_round(), (102, 148)), (table_long(), (290, 166)), (stool(), (340, 186))):
        scene.alpha_composite(img, (x, y))
    big = scene.resize((W * sc, H * sc), Image.NEAREST)
    strip = Image.new("RGBA", (W * sc, 120), (30, 26, 40, 255))
    x = 8
    for im in (fire_frames(), flame_frames(), table_round(), table_long(), stool()):
        s = 2 if im.width > 60 else 3
        p = im.resize((im.width * s, im.height * s), Image.NEAREST)
        strip.alpha_composite(p, (x, 8))
        x += p.width + 16
    sheet = Image.new("RGBA", (W * sc, H * sc + 120), (30, 26, 40, 255))
    sheet.alpha_composite(big, (0, 0))
    sheet.alpha_composite(strip, (0, H * sc))
    sheet.save(out)
    print(f"preview -> {out}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "preview"
    if cmd == "build":
        build("--aseprite" in sys.argv)
    elif cmd == "preview":
        preview(sys.argv[2] if len(sys.argv) > 2 else "tavern_preview.png")
    else:
        print(__doc__)
