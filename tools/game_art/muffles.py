"""The Muffles, the village's folk (prototype "habitat_room"; the owner, 2026-11-25: "The Villagers are called Muffles",
one of them is a Muffle). They are the owner's pick of the villager sketches: "all 3 are good", so each Muffle has one
of the three hooded bodies (purple, teal, rose: a big round hood, a starry night where a face would be, two glowing
eyes, a little cloak, mittens, two short legs in boots), with its job's things on top: a grocer's basket of fruit, a
tailor's measuring tape, a baker's hat, a florist's flower, a barkeep's mug, a herald's sash, a fisher's wide hat. Two
more just live there. Designed pixel by pixel and placed in Aseprite by a script, the agreed method.

    .venv/Scripts/python.exe tools/game_art/muffles.py preview OUT.png   a sheet to look at
    .venv/Scripts/python.exe tools/game_art/muffles.py build [--aseprite] web/game-art/muffle/<job>.png: a strip of
                                                   40 x 40 frames (POSES), and pot.png
"""

from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "game-art" / "muffle"
SRC = ROOT / "game" / "art-src" / "muffle"
ASEPRITE = r"C:\Program Files (x86)\Steam\steamapps\common\Aseprite\Aseprite.exe"
S = 40


def hexc(s, a=255):
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


OUTLINE = (34, 26, 52, 255)
FACE = hexc("0e0c26")
MITT = [hexc("b8c0e0"), hexc("ecf0ff")]
BOOT = [hexc("2a1e2e"), hexc("4a3448"), hexc("6a4c62")]
GOLD = [hexc("c08a28"), hexc("ffe680"), hexc("fff8c8")]
HOODS = {  # the three bodies the owner approved (5a, 5b, 5c)
    "a": [hexc("3e2e6e"), hexc("5e4ea0"), hexc("8a7ad0"), hexc("b4a8ec")],
    "b": [hexc("1e4a52"), hexc("2e7078"), hexc("4ea0a0"), hexc("86d0c4")],
    "c": [hexc("5a2a4a"), hexc("84406c"), hexc("b0648e"), hexc("d898b8")],
}
# each Muffle: its body and its job (yard.js STATIONS `job`, the two who just live there, the market's folk: two eating
# on a bench, a cook at her pot, a musician, two dancers; and the hall's custodian, who keeps the gym register)
MUFFLES = {
    "grocer": "b", "tailor": "c", "baker": "a", "florist": "c", "barkeep": "a", "herald": "b", "fisher": "b",
    "villager1": "a", "villager2": "c",
    "diner1": "a", "diner2": "b", "cook": "c", "musician": "b", "dancer1": "a", "dancer2": "c", "custodian": "a",
}
# Every Muffle's picture is a strip of 40 x 40 frames, the same for all (muffles.js POSE reads it):
#   0 front, standing   1-2 front, walking      3 side (facing right), standing   4-5 side, walking
#   6 back, standing    7-8 back, walking       9-10 sitting, eating    11-12 stirring a pot    13-14 playing a lute
#   15-16 dancing (arms up and hopping; then turned sideways, one arm up)
POSES = [("front", 0, None), ("front", 1, None), ("front", 2, None), ("side", 0, None), ("side", 1, None), ("side", 2, None),
         ("back", 0, None), ("back", 1, None), ("back", 2, None), ("front", 0, "eat0"), ("front", 0, "eat1"),
         ("front", 0, "cook0"), ("front", 0, "cook1"), ("front", 0, "lute0"), ("front", 0, "lute1"),
         ("front", 0, "dance0"), ("side", 0, "dance1")]


class C:
    def __init__(self, oy=0, size=None):
        self.w = self.h = size or S
        self.im = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        self.px = self.im.load()
        self.oy = oy  # (the whole Muffle drawn this much lower: sitting; or higher: a hop, a step)

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y + self.oy))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def ell(self, cx, cy, rx, ry, c, keep=None):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 and (keep is None or keep(x, y)):
                    self.put(x, y, c)

    def line(self, x0, y0, x1, y1, c, c2=None):
        n = max(1, int(max(abs(x1 - x0), abs(y1 - y0))))
        for i in range(n + 1):
            x, y = x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n
            self.put(x, y, c)
            if c2:
                self.put(x, y + 1, c2)

    def outline(self):
        src = self.im.copy().load()
        for y in range(self.h):
            for x in range(self.w):
                if src[x, y][3] == 0 and any(0 <= x + dx < self.w and 0 <= y + dy < self.h and src[x + dx, y + dy][3] == 255
                                             for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    self.px[x, y] = OUTLINE


def legs(cv: C, view, step, sit=False) -> None:
    """Two short legs in boots: a step lifts one (front and back) or swings them apart (side)."""
    if sit:  # sitting on a bench: just the boots, peeping out under the cloak's hem
        for lx in (15, 23):
            cv.ell(lx + 1.5, 32.5, 2.6, 1.6, BOOT[1]); cv.put(lx + 1, 32, BOOT[2])
        return
    if view == "side":
        spots = {0: (18, 21), 1: (16, 23), 2: (21, 18)}[step]  # (the far leg, the near leg)
        for i, lx in enumerate(spots):
            c = BOOT[0] if i == 0 else BOOT[1]
            cv.rect(lx, 30, lx + 2, 34, c); cv.rect(lx + 2, 30, lx + 2, 34, BOOT[2] if i else BOOT[1])
            cv.ell(lx + 2.2, 35.5, 2.8, 1.6, c)
        return
    for k, lx in enumerate((16, 22)):
        up = 1 if (step == 1 and k == 0) or (step == 2 and k == 1) else 0
        cv.rect(lx, 30, lx + 2, 34 - up, BOOT[1]); cv.rect(lx, 30, lx, 34 - up, BOOT[2] if view == "front" else BOOT[0])
        cv.ell(lx + 1.5 + ((-0.5 if lx < 20 else 0.5) if view == "front" else 0), 35.5 - up, 2.6, 1.6, BOOT[1] if view == "front" else BOOT[0])


def cloak(cv: C, hood, view) -> None:
    """The little cloak, a bell scalloped at the hem; its gold clasp shows from the front and the side."""
    cx = 19.5 if view == "side" else 20
    for y in range(21, 32):
        half = (4.8 + 3.2 * (y - 21) / 10) if view == "side" else (5.5 + 3.8 * (y - 21) / 10)
        for x in range(int(cx - half), int(cx + half) + 1):
            if y == 31 and x % 3 == 0:
                continue
            d = (x + 0.5 - (cx - half)) / (2 * half)
            if view == "back":
                c = hood[0] if d > 0.8 else hood[2] if d < 0.15 else hood[1]
            else:
                c = hood[2] if d < 0.22 else hood[0] if d > 0.82 else hood[1]
            cv.put(x, y, c)
    if view == "front":
        cv.rect(20, 24, 20, 30, hood[0])
        cv.put(20, 23, GOLD[1]); cv.put(19, 23, GOLD[0]); cv.put(21, 23, GOLD[0])
    elif view == "side":
        cv.put(23, 23, GOLD[1]); cv.put(22, 23, GOLD[0])
    else:
        cv.rect(20, 25, 20, 30, hood[0])


def arm(cv: C, hood, sx, sy, mx, my) -> None:
    """An arm from the shoulder (sx, sy) to a mitten at (mx, my)."""
    cv.line(sx, sy, mx, my, hood[1], hood[0])
    cv.ell(mx + 0.5, my + 0.5, 2.8, 2.6, MITT[1]); cv.put(mx + 1, my + 1, MITT[0])


TAIL = ((24, 4), (26, 3), (28, 3), (30, 4), (31, 6), (32, 8))


def head(cv: C, hood, view) -> None:
    """The big round hood with its long tail ending in a gold bobble; from the front a starry night where a face would be,
    two glowing eyes, blush and a small smile; from the side one eye; from the back just the hood and its seam."""
    if view == "side":
        cx, rx = 19, 9.6
        inside = lambda x, y: ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - 13) / 10) ** 2 <= 1
        cv.ell(cx, 13, rx, 10, hood[1])
        for y in range(3, 24):
            for x in range(9, 30):
                if inside(x, y):
                    if (x + 0.5 - 15) ** 2 + (y + 0.5 - 8) ** 2 < 22:
                        cv.put(x, y, hood[3] if (x + 0.5 - 14) ** 2 + (y + 0.5 - 7) ** 2 < 7 else hood[2])
                    elif x < 13 and y > 12:
                        cv.put(x, y, hood[0])
        for k, (x, y) in enumerate(TAIL):  # the tail hangs back, behind the head
            cv.ell(38 - x, y, 2 - k * 0.15, 1.8 - k * 0.15, hood[1 if k < 3 else 0])
        cv.ell(6, 10, 2, 2, GOLD[1]); cv.put(7, 9, GOLD[2]); cv.put(5, 11, GOLD[0])
        cv.ell(25, 15, 4.6, 5.6, FACE, keep=lambda x, y: inside(x, y) and x >= 21)
        cv.put(22, 12, hexc("8a86c8")); cv.put(23, 18, hexc("8a86c8"))
        cv.rect(25, 14, 26, 17, GOLD[1]); cv.put(25, 14, GOLD[2]); cv.put(26, 17, GOLD[0])
        cv.put(23, 18, hexc("ff8ab0")); cv.put(24, 18, hexc("ff8ab0"))
        cv.put(26, 19, GOLD[0]); cv.put(27, 18, GOLD[0])
        return
    cv.ell(20, 13, 10.5, 10, hood[1])
    for y in range(3, 24):
        for x in range(9, 31):
            if ((x + 0.5 - 20) / 10.5) ** 2 + ((y + 0.5 - 13) / 10) ** 2 <= 1:
                if (x + 0.5 - 15) ** 2 + (y + 0.5 - 8) ** 2 < 26:
                    cv.put(x, y, hood[3] if (x + 0.5 - 14) ** 2 + (y + 0.5 - 7) ** 2 < 8 else hood[2])
                elif x > 25 and y > 12:
                    cv.put(x, y, hood[0])
    for k, (x, y) in enumerate(TAIL):
        cv.ell(x, y, 2 - k * 0.15, 1.8 - k * 0.15, hood[1 if k < 3 else 0])
    cv.ell(33, 10, 2, 2, GOLD[1]); cv.put(32, 9, GOLD[2]); cv.put(34, 11, GOLD[0])
    if view == "back":  # the seam down the back of the hood, its rim at the neck
        for y in range(6, 22, 2):
            cv.put(20, y, hood[0])
        for x in range(13, 28):
            cv.put(x, 22, hood[0])
        return
    cv.ell(20, 15, 7, 5.8, FACE)
    for (x, y) in ((16, 12), (24, 18), (22, 11), (15, 17)):
        cv.put(x, y, hexc("8a86c8"))
    cv.put(25, 12, hexc("f4f0ff"))
    for ex in (16, 22):
        cv.rect(ex, 14, ex + 2, 17, GOLD[1])
        for (x, y) in ((ex, 14), (ex + 2, 14), (ex, 17), (ex + 2, 17)):
            cv.put(x, y, GOLD[0])
        cv.put(ex + 1, 15, GOLD[2]); cv.put(ex + 1, 14, GOLD[2])
    for (x, y) in ((14, 18), (15, 18), (25, 18), (26, 18)):
        cv.put(x, y, hexc("ff8ab0"))
    cv.put(20, 19, GOLD[0]); cv.put(19, 18, GOLD[0]); cv.put(21, 18, GOLD[0])


def hats(cv: C, name, view) -> None:
    """What sits on the hood, seen from any side."""
    sx = -1 if view == "side" else 0
    if name == "baker":
        cv.rect(15 + sx, 0, 25 + sx, 4, hexc("f4f0e6")); cv.ell(20 + sx, 1.5, 6, 2.5, hexc("ffffff")); cv.rect(15 + sx, 4, 25 + sx, 5, hexc("d8d0c0"))
    elif name == "fisher":
        cv.ell(20 + sx, 3.5, 13, 2.6, hexc("d8b860")); cv.ell(20 + sx, 2, 7, 2.5, hexc("e8cc78")); cv.rect(13 + sx, 3, 27 + sx, 3, hexc("a8883a"))
    elif name == "florist":
        fx = 28 if view == "back" else 12
        cv.ell(fx, 7, 2.5, 2.5, hexc("ff7ab0")); cv.put(fx, 7, hexc("ffe680"))
    elif name == "cook":  # a white kerchief knotted over the hood
        for x in range(12 + sx, 29 + sx):
            cv.put(x, 4 + (0 if 15 < x < 26 else 1), hexc("f4f0e6")); cv.put(x, 5 + (0 if 15 < x < 26 else 1), hexc("d8d0c0"))
        cv.ell(11 if view == "side" else 28, 6, 1.6, 1.4, hexc("f4f0e6"))
    elif name == "musician":  # a green cap with a long red feather
        cv.ell(20 + sx, 3.2, 7, 2.4, hexc("3d7a3a")); cv.rect(13 + sx, 4, 27 + sx, 4, hexc("2a5628"))
        cv.line(24 + sx, 3, 31 + sx, -1, hexc("e04848")); cv.line(24 + sx, 4, 31 + sx, 0, hexc("a83030"))
    elif name == "dancer1":  # ribbons streaming from the hood
        for i, c in enumerate(("ff7ab0", "8ac0ff", "ffe680")):
            cv.line(12, 6 + i, 7 - i, 10 + i * 2, hexc(c))
    elif name == "dancer2":  # a crown of flowers
        for i, x in enumerate(range(12, 29, 3)):
            cv.ell(x + sx + 0.5, 4.5 + (1 if i in (0, 5) else 0), 1.4, 1.4, hexc(("ff7ab0", "ffe680", "8ac0ff")[i % 3]))
    elif name == "custodian":  # a grey cap with a little brass badge, round spectacles
        cv.ell(20 + sx, 3.5, 8, 2.6, hexc("6a6e7a")); cv.rect(12 + sx, 5, 28 + sx, 5, hexc("4a4e5a")); cv.put(20 + sx, 3, GOLD[1])
        glass = hexc("d8dce8")
        if view == "front":
            for ex in (17, 23):
                for (x, y) in ((ex - 2, 15), (ex + 2, 15), (ex, 13), (ex, 17), (ex - 1, 14), (ex + 1, 14), (ex - 1, 16), (ex + 1, 16)):
                    cv.put(x, y, glass)
            cv.put(20, 15, glass)
        elif view == "side":
            for (x, y) in ((24, 13), (27, 13), (24, 18), (27, 18), (23, 15), (28, 15), (23, 16), (28, 16)):
                cv.put(x, y, glass)


def worn(cv: C, name, view) -> None:
    """What is worn or carried on the body (front, and what still shows from the side or the back)."""
    if view == "back":
        if name in ("villager2", "diner2"):
            cv.rect(14, 21, 26, 22, hexc("e0a040" if name == "villager2" else "5a9ae0"))
        return
    side = view == "side"
    if name == "grocer":
        x0 = 20 if side else 24
        cv.rect(x0, 26, x0 + 7, 30, hexc("8a5a2a")); cv.rect(x0, 26, x0 + 7, 26, hexc("b07a3a"))
        for (x, y, c) in ((1, 25, "e04848"), (3, 24, "f0a030"), (5, 25, "7ac050"), (6, 24, "e04848")):
            cv.ell(x0 + x + 0.5, y + 0.5, 1.4, 1.4, hexc(c))
    elif name == "tailor":
        for x in range(16 if side else 13, 24 if side else 28):
            cv.put(x, 22 + (1 if 16 < x < 24 else 0), hexc("f0d060"))
        if not side:
            for y in range(23, 29):
                cv.put(14, y, hexc("f0d060")); cv.put(26, y + 1, hexc("f0d060"))
            cv.put(15, 25, hexc("1a1a1a")); cv.put(25, 26, hexc("1a1a1a"))
            cv.put(23, 26, hexc("ff6060")); cv.put(23, 27, hexc("c0c0c0"))
    elif name in ("baker", "cook"):
        if side:
            cv.rect(21, 24, 23, 31, hexc("f4f0e6"))
        else:
            cv.rect(17, 24, 23, 31, hexc("f4f0e6")); cv.rect(17, 24, 23, 24, hexc("d8d0c0"))
    elif name == "florist" and not side:
        for (x, y, c) in ((26, 23, "ff7ab0"), (28, 24, "8ac0ff"), (27, 21, "ffe680")):
            cv.ell(x + 0.5, y + 0.5, 1.5, 1.5, hexc(c))
        cv.rect(27, 25, 27, 27, hexc("4e8a3a"))
    elif name == "barkeep":
        x0 = 22 if side else 26
        cv.rect(x0, 23, x0 + 4, 28, hexc("8a5a2a")); cv.rect(x0, 22, x0 + 4, 22, hexc("fff8e8"))
        cv.put(x0 + 5, 24, hexc("8a5a2a")); cv.put(x0 + 5, 26, hexc("8a5a2a"))
        if not side:
            cv.rect(12, 21, 14, 26, hexc("e8e0c8"))
    elif name == "herald":
        for i in range(8 if side else 12):
            cv.put((16 if side else 14) + i, 22 + i * 0.75, GOLD[1]); cv.put((17 if side else 15) + i, 22 + i * 0.75, GOLD[0])
        if not side:
            cv.rect(26, 24, 30, 25, GOLD[1]); cv.ell(31, 24.5, 1.6, 2, GOLD[2])
    elif name == "fisher":
        for i in range(14):
            cv.put((22 if side else 28) + i * 0.5, 26 - i, hexc("7a5a3a"))
    elif name in ("villager2", "diner2"):
        c = hexc("e0a040" if name == "villager2" else "5a9ae0")
        cv.rect(15 if side else 14, 21, 24 if side else 26, 22, c)
        if not side:
            cv.rect(23, 23, 24, 27, c)
    elif name == "custodian" and not side:  # a ring of keys at the belt
        cv.ell(24.5, 28.5, 2.2, 2.2, GOLD[0]); cv.ell(24.5, 28.5, 1.2, 1.2, HOODS["a"][1])
        cv.put(25, 31, GOLD[1]); cv.put(23, 31, GOLD[1])


def note(cv: C, x, y) -> None:
    """A little gold music note (only seen: the owner, "not audible to player")."""
    cv.rect(x + 2, y, x + 2, y + 3, GOLD[1]); cv.put(x + 3, y, GOLD[1]); cv.put(x + 4, y + 1, GOLD[1])
    cv.ell(x + 1, y + 4, 1.6, 1.2, GOLD[1])


def frame(name: str, view: str, step: int, act) -> Image.Image:
    """One frame of a Muffle (POSES)."""
    hood = HOODS[MUFFLES[name]]
    sit = act in ("eat0", "eat1")
    cv = C(oy=3 if sit else -2 if act == "dance0" else (-1 if step else 0))
    legs(cv, view, step, sit)
    cloak(cv, hood, view)
    high = []  # arms raised over the hood: drawn after it
    if act is None:
        if view == "side":
            arm(cv, hood, 21, 23, 22 + {0: 0, 1: 3, 2: -3}[step], 28)
        else:
            sw = {0: 0, 1: 1, 2: -1}[step]
            arm(cv, hood, 15, 23, 12, 27 + sw); arm(cv, hood, 25, 23, 27, 27 - sw)
    elif sit:
        arm(cv, hood, 25, 23, 27, 27)
        if act == "eat1":
            arm(cv, hood, 15, 23, 13, 27)
        else:
            high.append((15, 23, 18, 20))
    elif act.startswith("cook"):
        k = 1 if act == "cook1" else 0
        arm(cv, hood, 15, 23, 22 + k, 27 + k); arm(cv, hood, 25, 23, 25 + k, 27 + k)
    elif act.startswith("lute"):
        arm(cv, hood, 25, 23, 27, 21)
    elif act == "dance0":
        high += [(14, 22, 8, 10), (26, 22, 31, 10)]
    elif act == "dance1":
        high.append((22, 22, 29, 8))
    head(cv, hood, view)
    hats(cv, name, view)
    if act is None or view == "side":
        worn(cv, name, view)
    for (sx, sy, mx, my) in high:
        arm(cv, hood, sx, sy, mx, my)
    if sit:  # a bun on its way to the smile, or held while it chews
        bx, by = (18, 19) if act == "eat0" else (12, 25)
        cv.ell(bx + 0.5, by + 0.5, 2.2, 1.8, hexc("c88a4a")); cv.put(bx, by, hexc("e8b070")); cv.put(bx + 1, by, hexc("e8b070"))
    if act and act.startswith("cook"):  # a long wooden spoon, down into the pot
        k = 1 if act == "cook1" else 0
        cv.line(24 + k, 27 + k, 30 - k, 36, hexc("8a5a2a")); cv.ell(30.5 - k, 37, 1.6, 1.2, hexc("6a4a2a"))
    if act and act.startswith("lute"):  # a lute across the body; the strumming hand moves, a note floats up
        k = 1 if act == "lute1" else 0
        cv.line(19, 26, 28, 19, hexc("6a4a2a")); cv.rect(28, 17, 29, 18, hexc("4a3020"))
        cv.ell(16.5, 27.5, 4, 3.4, hexc("a8743a")); cv.ell(16.5, 27.5, 3, 2.4, hexc("c8904a")); cv.ell(17, 27.5, 0.9, 0.9, hexc("3a2414"))
        arm(cv, hood, 15, 23, 15 + k, 26 + k * 2)
        note(cv, 30 + k * 2, 6 - k * 3)
    cv.outline()
    return cv.im


def strip(name: str) -> Image.Image:
    """A Muffle's frames side by side (POSES)."""
    out = Image.new("RGBA", (S * len(POSES), S), (0, 0, 0, 0))
    for i, (view, step, act) in enumerate(POSES):
        out.alpha_composite(frame(name, view, step, act), (i * S, 0))
    return out


def pot() -> Image.Image:
    """The cook's pot over a little fire, two frames side by side (24 x 24 each): the flames lick, the steam curls."""
    out = Image.new("RGBA", (48, 24), (0, 0, 0, 0))
    for k in range(2):
        cv = C(size=24)
        for (ax, ay, bx, by) in ((4, 22, 19, 20), (5, 20, 20, 22)):  # the logs
            cv.line(ax, ay, bx, by, hexc("6a4a2a"))
        for (fx, tall) in ((8, 4 + k), (12, 6 - k), (16, 4 + k)):  # the fire under the pot
            for y in range(tall):
                cv.put(fx, 20 - y, hexc("ffe680") if y < tall / 2 else hexc("f07a30"))
                cv.put(fx + 1, 20 - y, hexc("f0a030"))
        cv.ell(12, 14, 8, 5, hexc("2e2a36")); cv.ell(12, 13, 7, 4, hexc("4a4654"))  # the pot
        cv.ell(12, 10.5, 7, 1.8, hexc("1e1a24")); cv.ell(12, 10.5, 5.6, 1.2, hexc("c87a3a"))  # its rim and the stew
        cv.put(10, 10, hexc("7ac050")); cv.put(14, 10, hexc("e8b070"))
        cv.put(5, 13, hexc("6a6676")); cv.put(6, 12, hexc("6a6676"))
        cv.outline()
        for i in range(3):  # steam
            y = 7 - i * 2 - k
            cv.put(9 + i * 3 + ((i + k) % 2), y, (236, 236, 244, 200 - i * 50))
            cv.put(10 + i * 3 + ((i + k) % 2), y - 1, (236, 236, 244, 160 - i * 40))
        out.alpha_composite(cv.im, (k * 24, 0))
    return out


# The Muffles' forgotten script: 12 letters, 7 x 9 each, in a strip (glyphs.png). An unknown word in a Muffle's line is
# shown as a few of these (muffles.js glyphsFor), the same ones every time for the same word.
GLYPHS = [  # (no real letter of any script: the owner, 2026-11-27, a glyph read as Japanese; 1, 2, 3, 5, 7, 8, 10 and 11 redrawn, same places)
    ["..xxx..", ".x...x.", "x..x..x", "x.x.x.x", "x..x..x", ".x...x.", "..xxx..", ".......", "...x..."],
    [".xxx...", "x...x..", "x.x.x..", "x...xxx", ".xxx..x", "......x", "...xxx.", ".......", "x.....x"],
    ["xxxxxxx", "x.x.x.x", "x.x.x.x", ".......", "..xxx..", ".x...x.", "..xxx..", ".......", "..x.x.."],
    ["..x.x..", ".xx.xx.", "x.....x", ".x...x.", "x.....x", ".xx.xx.", "..x.x..", ".......", "...x..."],
    [".xx.xx.", "x..x..x", "x.....x", ".x...x.", "..x.x..", "...x...", "...x...", ".......", "..xxx.."],
    ["xxx....", "x.x....", "xxxxxxx", "....x.x", "....xxx", "..x....", "..x....", ".......", "......x"],
    ["..xxxx.", ".x.....", "x..xx..", "x.x..x.", "x..xx..", ".x.....", "..xxxx.", ".......", ".x...x."],
    [".x...x.", "xxx.xxx", ".x...x.", "...x...", ".x...x.", "xxx.xxx", ".x...x.", ".......", "...x..."],
    ["..x.x..", "..x.x..", "xx...xx", "...x...", "xx...xx", "..x.x..", "..x.x..", ".......", "x.x.x.x"],
    [".xxxxx.", "x.....x", "x.xxx.x", "x.x...x", "x.xxxxx", "x......", ".xxxxx.", ".......", "...x..."],
    ["xxxxxxx", "x.....x", "x.xxx.x", "x.x.x.x", "x.x...x", "x.xxxxx", "x......", ".......", ".x.x.x."],
    [".x...x.", "x.x.x.x", ".x...x.", "...x...", "..x.x..", ".x...x.", "..xxx..", ".......", "....x.."],
]
GW, GH = 7, 9


def glyph_strip() -> Image.Image:
    """The forgotten script, a strip of letters: glowing gold on nothing (the bubble behind them is black)."""
    im = Image.new("RGBA", (len(GLYPHS) * (GW + 1), GH), (0, 0, 0, 0))
    px = im.load()
    for i, g in enumerate(GLYPHS):
        for y, row in enumerate(g):
            for x, ch in enumerate(row):
                if ch == "x":
                    px[i * (GW + 1) + x, y] = GOLD[1] if y < 7 else GOLD[0]
    return im


def muffle(name: str) -> Image.Image:
    """Its first frame: standing, facing you."""
    return frame(name, "front", 0, None)


def build(aseprite: bool) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    made = {n: strip(n) for n in MUFFLES}
    made["glyphs"] = glyph_strip()
    made["pot"] = pot()
    if not aseprite:
        for n, im in made.items():
            im.save(OUT / f"{n}.png")
    else:
        SRC.mkdir(parents=True, exist_ok=True)
        lines = []
        for n, im in made.items():
            w, hh = im.size
            lines.append(f"do local s = Sprite({w}, {hh}, ColorMode.RGB) local img = s.cels[1].image")
            for y in range(hh):
                for x in range(w):
                    r, g, b, a = im.getpixel((x, y))
                    if a:
                        lines.append(f"img:drawPixel({x}, {y}, app.pixelColor.rgba({r}, {g}, {b}, {a}))")
            lines.append(f's:saveAs("{(SRC / f"{n}.aseprite").as_posix()}") s:saveCopyAs("{(OUT / f"{n}.png").as_posix()}") s:close() end')
        script = SRC / "_place.lua"
        script.write_text("\n".join(lines), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        script.unlink()
    print(f"{len(made)} Muffles written" + (" (placed in Aseprite, sources saved)" if aseprite else ""))


def preview(out: str) -> None:
    """Every Muffle's strip, one under another, at 3x, then the pot."""
    sc, pad = 3, 6
    names = list(MUFFLES)
    sheet = Image.new("RGBA", (S * len(POSES) * sc + pad * 2, len(names) * (S * sc + pad) + pad + 24 * sc + pad), hexc("6a8a4a"))
    dr = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        y = pad + i * (S * sc + pad)
        st = strip(n)
        sheet.alpha_composite(st.resize((st.width * sc, st.height * sc), Image.NEAREST), (pad, y))
        dr.text((pad + 2, y + 2), n, fill=(255, 255, 255, 255))
    p = pot()
    sheet.alpha_composite(p.resize((p.width * sc, p.height * sc), Image.NEAREST), (pad, len(names) * (S * sc + pad) + pad))
    sheet.save(out)
    print("preview ->", out)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "preview"
    if cmd == "build":
        build("--aseprite" in sys.argv)
    else:
        preview(sys.argv[2] if len(sys.argv) > 2 else "muffles_preview.png")
