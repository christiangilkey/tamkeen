"""The farm's art (prototype "farm"; the owner's design, 2026-11-26): every crop as it grows, its harvest icon, tilled
soil (dry and watered), the farm's gate and the seed stand. Cozy fantasy, the village's overhead style, drawn pixel by
pixel and placed in Aseprite by a script (the method the owner agreed for the game's art).

    .venv/Scripts/python.exe tools/game_art/farmart.py preview OUT.png   a sheet to look at
    .venv/Scripts/python.exe tools/game_art/farmart.py build [--aseprite]  web/game-art/farm/*.png (and sources)

Files (web/game-art/farm/, sources in game/art-src/farm/):
    crops.png      80 x (24 per crop)  a row per crop (farm.js CROPS order), five frames of 16 x 24: seed, sprout,
                                       growing, ripe, wilted (the plant's foot at the bottom middle)
    icons.png      16 per crop x 16    each crop's harvest, side by side (CROPS order)
    soil.png       32 x 16             a tilled spot: dry, then watered
    gate.png       32 x 32             the farm's gate in the yard (a wooden gate, a little sign with a sprout)
    seedstand.png  32 x 32             the seed stand by the barn
"""

from __future__ import annotations

import math
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "game-art" / "farm"
SRC = ROOT / "game" / "art-src" / "farm"
ASEPRITE = r"C:\Program Files (x86)\Steam\steamapps\common\Aseprite\Aseprite.exe"
FW, FH = 16, 24  # a crop's frame
BASE = 21        # where the plant meets the ground in its frame


def hexc(s, a=255):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


OUTLINE = hexc("1e2418")
LEAF = [hexc("2f5e2a"), hexc("4f8a3c"), hexc("7ab84e"), hexc("a8d870")]
WILT = [hexc("5a4a24"), hexc("7a6a34"), hexc("9a8a4c"), hexc("b8a86a")]
STEM = hexc("3d6e2e")
BARK = [hexc("4a2e1a"), hexc("6a4428"), hexc("8a5e38")]
SOIL = [hexc("3a2414"), hexc("5a3a20"), hexc("7a5030"), hexc("94683c")]
WET = [hexc("22140c"), hexc("3a2414"), hexc("4e3018"), hexc("62402a")]


class C:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.px = self.im.load()

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c

    def get(self, x, y):
        return self.px[x, y] if 0 <= x < self.w and 0 <= y < self.h else (0, 0, 0, 0)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def ell(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self.put(x, y, c)

    def blob(self, cx, cy, rx, ry, ramp):
        """A round thing lit from the top left: dark rim at the bottom right, a highlight up top."""
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                d = dx * dx + dy * dy
                if d > 1:
                    continue
                k = 2 if dx + dy < -0.5 else 0 if dx + dy > 0.7 else 1
                if d < 0.25 and dx < 0 and dy < 0 and len(ramp) > 3:
                    k = 3
                self.put(x, y, ramp[min(k, len(ramp) - 1)])

    def line(self, x0, y0, x1, y1, c):
        n = max(1, int(max(abs(x1 - x0), abs(y1 - y0))))
        for i in range(n + 1):
            self.put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c)

    def outline(self):
        src = self.im.copy().load()
        for y in range(self.h):
            for x in range(self.w):
                if src[x, y][3] == 0 and any(0 <= x + dx < self.w and 0 <= y + dy < self.h and src[x + dx, y + dy][3] >= 200
                                             for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    self.px[x, y] = OUTLINE

    def recolour(self, src_ramp, dst_ramp):
        m = {s[:3]: d for s, d in zip(src_ramp, dst_ramp)}
        for y in range(self.h):
            for x in range(self.w):
                p = self.px[x, y]
                if p[3] and p[:3] in m:
                    self.px[x, y] = m[p[:3]][:3] + (p[3],)


def ramp(*hexes):
    return [hexc(h) for h in hexes]


# Each crop's look (farm.js CROPS order matters only for the sheet): `fruit` its harvest's colours (dark, mid, light,
# shine), `icon` the harvest's shape.
LOOK = {
    "carrot": ("taper", ramp("a8481a", "e8782a", "f8a04a", "ffd090")),
    "radish": ("round", ramp("8a1a3a", "d0385a", "f07090", "ffd0dc")),
    "lettuce": ("head", ramp("3e7a2a", "6eb43e", "a0dc6a", "d8f4b0")),
    "peas": ("pod", ramp("2e6a22", "5aa83a", "8ed45a", "c8f090")),
    "potato": ("oval", ramp("6a4a28", "a07a48", "c8a06a", "e8cc98")),
    "onion": ("round", ramp("8a5a22", "c88a3a", "e8b868", "f8e0b0")),
    "strawberry": ("berry", ramp("8a1020", "d8303a", "f86868", "ffd8d8")),
    "cabbage": ("head", ramp("4a7a5a", "7ab08a", "a8d8b0", "e0f8e0")),
    "tomato": ("round", ramp("901818", "e03a2a", "f8705a", "ffe0d0")),
    "pepper": ("long", ramp("8a1a10", "e0402a", "f87a4a", "ffd0b0")),
    "beans": ("pod", ramp("2a5a1a", "4a8a2a", "7ab84a", "b8e080")),
    "cucumber": ("long", ramp("1e4a1a", "3a7a2a", "6aac4a", "a8d880")),
    "corn": ("cob", ramp("a8781a", "e8c040", "f8e070", "fff8c0")),
    "sunflower": ("flower", ramp("c07a10", "f0c020", "f8e060", "fff8c0")),
    "blueberry": ("berry", ramp("1e2a6a", "3a52b0", "6a88e0", "c8d8ff")),
    "melon": ("big", ramp("2a5a2a", "4a9a3a", "7ac85a", "c8f0a0")),
    "beet": ("round", ramp("4a0a2a", "8a1a4a", "c0386a", "f0a0c0")),
    "mushroom": ("cap", ramp("8a1a1a", "d0382a", "f07a5a", "fff0e0")),
    "squash": ("big", ramp("a86a10", "e8a820", "f8d050", "fff0b0")),
    "sweet_potato": ("oval", ramp("7a2a2a", "b04a3a", "d8785a", "f8c0a0")),
    "cranberry": ("berry", ramp("5a0a1a", "a01a2a", "d03a4a", "f8a0a8")),
    "pumpkin": ("big", ramp("a8400a", "e8781a", "f8a83a", "ffe0a0")),
    "grapes": ("grapes", ramp("3a1a4a", "6a3a8a", "9a6ac0", "e0c8f8")),
    "apple": ("fruit", ramp("8a1010", "d82a2a", "f86a5a", "ffe0d8")),
    "turnip": ("round", ramp("7a4a8a", "c8a0d0", "f0e8f0", "ffffff")),
    "kale": ("head", ramp("1e4a3a", "3a6a5a", "5a9a7a", "a0d0b8")),
    "leek": ("long", ramp("3a6a2a", "8ab85a", "e8f0d0", "ffffff")),
    "parsnip": ("taper", ramp("a88a4a", "e0c890", "f4e8c0", "fffaf0")),
    "garlic": ("round", ramp("a89a8a", "e0d8c8", "f8f0e8", "ffffff")),
    "snowberry": ("berry", ramp("8a98b0", "d0dcf0", "f0f8ff", "ffffff")),
    "sprouts": ("berry", ramp("2a5a1a", "5a9a3a", "8ac86a", "c8f0a0")),
    "winter_pear": ("fruit", ramp("6a7a1a", "b8c83a", "e0e86a", "fffcc0")),
    "wheat": ("bundle", ramp("a8781a", "d8b048", "f0d880", "fff4c8")),
    "basil": ("leaves", ramp("1e5a1a", "3a8a2a", "6ac04a", "b0f080")),
    "starfruit": ("star", ramp("b08010", "f0c830", "fff070", "ffffff")),
    "moonflower": ("flower", ramp("6a7ab0", "c8d4f8", "f0f4ff", "ffffff")),
    "rainbow_carrot": ("taper", ramp("6a2a8a", "e04a6a", "f8c040", "8ae0f8")),
}
KIND = {}  # crop id -> plant kind (filled from farm.js's table below)
CROPS = [
    ("carrot", "root"), ("radish", "root"), ("lettuce", "leafy"), ("peas", "vine"), ("potato", "root"), ("onion", "bulb"),
    ("strawberry", "bush"), ("cabbage", "leafy"), ("tomato", "bush"), ("pepper", "bush"), ("beans", "vine"),
    ("cucumber", "gourd"), ("corn", "stalk"), ("sunflower", "flower"), ("blueberry", "bush"), ("melon", "gourd"),
    ("beet", "root"), ("mushroom", "mushroom"), ("squash", "gourd"), ("sweet_potato", "root"), ("cranberry", "bush"),
    ("pumpkin", "gourd"), ("grapes", "vine"), ("apple", "tree"), ("turnip", "root"), ("kale", "leafy"), ("leek", "bulb"),
    ("parsnip", "root"), ("garlic", "bulb"), ("snowberry", "bush"), ("sprouts", "stalk"), ("winter_pear", "tree"),
    ("wheat", "grain"), ("basil", "herb"), ("starfruit", "tree"), ("moonflower", "flower"), ("rainbow_carrot", "root"),
]


def leaf(cv: C, x, y, dx, dy, n=3, shade=1):
    """A leaf from (x, y) out along (dx, dy), n pixels, two wide at its middle."""
    for i in range(n):
        px, py = x + dx * i, y + dy * i
        cv.put(px, py, LEAF[shade + (1 if i == n - 2 else 0)])
        if 0 < i < n - 1:
            cv.put(px + (1 if dy else 0), py + (1 if dx else 0), LEAF[shade - 1 if shade else 0])


def sprout(cv: C):
    cv.line(8, BASE, 8, BASE - 3, STEM)
    leaf(cv, 8, BASE - 3, -1, -0.5, 3, 2); leaf(cv, 8, BASE - 3, 1, -0.5, 3, 2)


def seed(cv: C):
    cv.ell(8, BASE + 0.5, 3.4, 1.4, SOIL[3]); cv.ell(8, BASE + 0.8, 3, 1, SOIL[2])
    cv.put(9, BASE - 1, hexc("e8d0a0")); cv.put(10, BASE - 1, hexc("c8a878"))  # (one seed showing: not two eyes)


def tuft(cv: C, tall):
    """Root crops: a fan of leaves from the ground."""
    for k, dx in enumerate((-3, -1.5, 0, 1.5, 3)):
        top = BASE - tall + abs(dx) * 0.8
        cv.line(8 + dx * 0.3, BASE, 8 + dx, top, LEAF[1 + (k % 2)])
        cv.put(8 + dx, top, LEAF[3]); cv.put(8 + dx - (1 if dx < 0 else -1 if dx > 0 else 0), top + 1, LEAF[2])


def growing(cv: C, kind):
    if kind in ("root", "bulb"):
        tuft(cv, 8 if kind == "root" else 10)
    elif kind in ("leafy", "herb"):
        for (dx, dy, r) in ((-3, -2, 2.6), (3, -2, 2.6), (0, -4, 3), (0, -1, 2.6)):
            cv.blob(8 + dx, BASE + dy, r, r * 0.8, LEAF)
    elif kind == "bush":
        cv.line(8, BASE, 8, BASE - 4, STEM)
        cv.blob(8, BASE - 6, 5, 4.4, LEAF)
    elif kind == "vine":
        cv.line(11, BASE, 11, BASE - 16, BARK[1]); cv.put(11, BASE - 17, BARK[2])
        for i, y in enumerate(range(BASE - 2, BASE - 14, -3)):
            leaf(cv, 11, y, -1 if i % 2 else 1, -0.6, 3, 1 + i % 2)
        cv.line(8, BASE, 11, BASE - 6, STEM)
    elif kind == "gourd":
        cv.blob(5, BASE - 2, 3.4, 2.4, LEAF); cv.blob(11, BASE - 3, 3.6, 2.6, LEAF); cv.blob(8, BASE - 5, 3, 2.2, LEAF)
        cv.line(2, BASE, 14, BASE - 1, STEM)
    elif kind in ("stalk", "grain", "flower"):
        xs = (6, 10) if kind != "flower" else (8,)
        for x in xs:
            cv.line(x, BASE, x, BASE - 13, STEM)
            for y in range(BASE - 3, BASE - 12, -3):
                leaf(cv, x, y, -1 if (y // 3) % 2 else 1, -0.5, 3, 2)
    elif kind == "mushroom":
        for (x, h) in ((6, 3), (10, 2)):
            cv.rect(x, BASE - h, x, BASE, hexc("f0e8d8")); cv.ell(x + 0.5, BASE - h - 0.5, 2, 1.2, hexc("c8a890"))
    elif kind == "tree":
        cv.rect(7, BASE - 9, 8, BASE, BARK[1]); cv.rect(8, BASE - 9, 8, BASE, BARK[0])
        cv.blob(8, BASE - 12, 5, 4, LEAF)


def ripe(cv: C, kind, fr):
    if kind == "root":
        tuft(cv, 9)
        cv.blob(8, BASE - 0.5, 3, 1.8, fr)  # the top of the root, showing above the soil
    elif kind == "bulb":
        tuft(cv, 11)
        cv.blob(8, BASE - 1, 3.2, 2.4, fr)
    elif kind == "leafy":
        for (dx, dy, r) in ((-4, -1, 2.6), (4, -1, 2.6)):
            cv.blob(8 + dx, BASE + dy, r, r * 0.7, LEAF)
        cv.blob(8, BASE - 4, 5, 4.4, fr)
        cv.line(8, BASE - 7, 8, BASE - 2, fr[0])
    elif kind == "herb":
        for (dx, dy, r) in ((-3, -3, 3), (3, -3, 3), (0, -6, 3.2), (0, -2, 3)):
            cv.blob(8 + dx, BASE + dy, r, r * 0.8, fr)
    elif kind == "bush":
        cv.line(8, BASE, 8, BASE - 4, STEM)
        cv.blob(8, BASE - 7, 6, 5.4, LEAF)
        for (x, y) in ((5, BASE - 9), (10, BASE - 10), (8, BASE - 6), (11, BASE - 5), (4, BASE - 5)):
            cv.blob(x + 0.5, y + 0.5, 1.4, 1.4, fr)
    elif kind == "vine":
        growing(cv, "vine")
        for (x, y) in ((9, BASE - 5), (13, BASE - 9), (9, BASE - 12), (13, BASE - 14)):
            cv.blob(x + 0.5, y + 0.5, 1.3, 2, fr)
    elif kind == "gourd":
        growing(cv, "gourd")
        cv.blob(8, BASE - 3, 5, 3.6, fr)
        cv.rect(8, BASE - 7, 8, BASE - 6, BARK[1])
    elif kind == "stalk":
        growing(cv, "stalk")
        for x in (6, 10):
            cv.blob(x + 1.5, BASE - 9, 1.6, 3, fr)
    elif kind == "grain":  # a close patch of ripe stalks, heads at different heights
        for x in range(3, 14):
            top = BASE - 11 - (x * 7) % 3
            cv.line(x, BASE, x, top + 3, fr[0] if x % 2 else fr[1])
            cv.put(x, top, fr[3 if x % 3 == 0 else 2]); cv.put(x, top + 1, fr[2]); cv.put(x, top + 2, fr[1])
    elif kind == "flower":
        growing(cv, "flower")
        for a in range(8):
            ang = a * math.pi / 4
            cv.blob(8.5 + math.cos(ang) * 3, BASE - 15.5 + math.sin(ang) * 3, 1.6, 1.6, fr)
        cv.blob(8.5, BASE - 15.5, 1.8, 1.8, ramp("3a2410", "6a4420", "8a5e2a") if fr[1][0] > fr[1][2] else ramp("c0a030", "f0d050", "fff0a0"))
    elif kind == "mushroom":
        for (x, h, r) in ((5, 4, 3), (11, 3, 2.4), (8, 2, 1.8)):
            cv.rect(x, BASE - h, x, BASE, hexc("f0e8d8"))
            cv.blob(x + 0.5, BASE - h - 0.5, r, r * 0.7, fr)
            cv.put(x - 1, BASE - h - 1, fr[3]); cv.put(x + 1, BASE - h, fr[3])
    elif kind == "tree":
        cv.rect(7, BASE - 10, 8, BASE, BARK[1]); cv.rect(8, BASE - 10, 8, BASE, BARK[0])
        cv.blob(8, BASE - 14, 7, 6, LEAF)
        for (x, y) in ((4, BASE - 15), (10, BASE - 17), (7, BASE - 12), (12, BASE - 12), (5, BASE - 10)):
            cv.blob(x + 0.5, y + 0.5, 1.3, 1.3, fr)


def frames(cid: str) -> list[Image.Image]:
    kind = KIND[cid]
    _, fr = LOOK[cid]
    out = []
    for stage in range(5):
        cv = C(FW, FH)
        if stage == 0:
            seed(cv)
        elif stage == 1:
            sprout(cv)
        elif stage == 2:
            growing(cv, kind)
        elif stage == 3:
            ripe(cv, kind, fr)
        else:  # wilted: as it was growing, gone dry and limp; it waits for one answer
            growing(cv, kind)
            cv.recolour(LEAF + [STEM], WILT + [WILT[1]])
            src = cv.im.copy().load()  # (its top droops a pixel)
            for y in range(FH - 1, 0, -1):
                for x in range(FW):
                    if y < BASE - 4 and src[x, y - 1][3] and not src[x, y][3]:
                        cv.px[x, y] = src[x, y - 1]
        cv.outline()
        out.append(cv.im)
    return out


def icon(cid: str) -> Image.Image:
    """The harvest, as it shows in the barn and the seed stand."""
    shape, fr = LOOK[cid]
    cv = C(16, 16)
    tops = lambda x, y: (leaf(cv, x, y, -1, -1, 3, 2), leaf(cv, x, y, 1, -1, 3, 1), cv.line(x, y, x, y - 3, LEAF[2]))
    if shape == "taper":
        for y in range(5, 15):
            half = 3.2 * (15 - y) / 10 + 0.4
            for x in range(int(8 - half), int(8 + half) + 1):
                cv.put(x, y, fr[2] if x < 8 - half / 3 else fr[0] if x > 8 + half / 2 else fr[1])
        for y in (8, 11):
            cv.put(7, y, fr[0]); cv.put(9, y + 1, fr[0])
        tops(8, 5)
    elif shape == "round":
        cv.blob(8, 10, 4.6, 4.2, fr); tops(8, 6); cv.put(8, 15, fr[0])
    elif shape == "oval":
        cv.blob(8, 9, 5.6, 4, fr)
        for (x, y) in ((6, 8), (10, 10), (8, 11)):
            cv.put(x, y, fr[0])
    elif shape == "head":
        cv.blob(8, 9, 6, 5.4, fr)
        cv.line(8, 5, 8, 12, fr[0]); cv.line(4, 9, 8, 12, fr[0]); cv.line(12, 9, 8, 12, fr[0])
    elif shape == "pod":
        for i in range(10):
            x, y = 3 + i, 11 - math.sin(i / 9 * math.pi) * 4
            cv.put(x, y, fr[1]); cv.put(x, y + 1, fr[0]); cv.put(x, y - 1, fr[2])
        for i in (5, 8, 11):
            cv.put(i, 10 - math.sin((i - 3) / 9 * math.pi) * 4 - 0.5, fr[3])
    elif shape == "berry":
        for (x, y) in ((6, 9), (10, 9), (8, 12), (8, 6)):
            cv.blob(x, y, 2.6, 2.6, fr)
        cv.line(8, 2, 8, 4, LEAF[1])
    elif shape == "long":
        for i in range(11):
            x, y = 4 + i * 0.75, 4 + i
            cv.blob(x, y, 2.4, 2.4, fr)
        cv.line(3, 2, 4, 4, LEAF[1])
    elif shape == "cob":
        cv.blob(8, 8, 3.4, 6, fr)
        for y in range(4, 13, 2):
            for x in range(6, 11, 2):
                cv.put(x + (y // 2) % 2, y, fr[3])
        leaf(cv, 5, 14, -1, -1, 4, 1); leaf(cv, 11, 14, 1, -1, 4, 1)
    elif shape == "big":
        cv.blob(8, 9.5, 6.6, 5.4, fr)
        for x in (5, 8, 11):
            cv.line(x, 5, x, 14, fr[0])
        cv.rect(8, 3, 9, 4, BARK[1])
    elif shape == "grapes":
        for (x, y) in ((6, 6), (10, 6), (8, 8), (5, 9), (11, 9), (8, 11), (6, 12), (10, 12), (8, 14)):
            cv.blob(x, y, 2, 2, fr)
        cv.line(8, 2, 8, 4, BARK[1]); leaf(cv, 9, 3, 1, -1, 3, 2)
    elif shape == "cap":
        cv.rect(7, 9, 9, 14, hexc("f0e8d8")); cv.blob(8, 8, 6, 4, fr)
        for (x, y) in ((5, 7), (9, 6), (11, 8)):
            cv.put(x, y, fr[3])
    elif shape == "fruit":
        cv.blob(8, 9.5, 5.2, 5, fr); cv.rect(8, 3, 8, 5, BARK[1]); leaf(cv, 9, 4, 1, -1, 3, 2)
    elif shape == "bundle":
        for x in (5, 7, 9, 11):
            cv.line(x, 8, 8, 15, fr[0]); cv.blob(x, 5, 1.4, 3, fr)
        cv.rect(6, 11, 10, 12, hexc("a84a2a"))
    elif shape == "flower":
        for a in range(8):
            ang = a * math.pi / 4
            cv.blob(8 + math.cos(ang) * 4, 8 + math.sin(ang) * 4, 2.2, 2.2, fr)
        cv.blob(8, 8, 2.6, 2.6, ramp("3a2410", "6a4420", "8a5e2a") if fr[1][0] > fr[1][2] else ramp("c0a030", "f0d050", "fff0a0"))
    elif shape == "leaves":
        for (x, y, r) in ((6, 8, 3.4), (10, 7, 3.4), (8, 11, 3.4)):
            cv.blob(x, y, r, r * 0.7, fr)
        cv.line(8, 9, 8, 15, STEM)
    elif shape == "star":
        pts = []
        for i in range(10):
            ang = -math.pi / 2 + i * math.pi / 5
            r = 6.5 if i % 2 == 0 else 3
            pts.append((8 + math.cos(ang) * r, 8.5 + math.sin(ang) * r))
        for y in range(16):
            for x in range(16):
                inside = False
                j = len(pts) - 1
                for i in range(len(pts)):
                    xi, yi = pts[i]; xj, yj = pts[j]
                    if (yi > y + 0.5) != (yj > y + 0.5) and x + 0.5 < (xj - xi) * (y + 0.5 - yi) / (yj - yi) + xi:
                        inside = not inside
                    j = i
                if inside:
                    cv.put(x, y, fr[2] if x + y < 15 else fr[1])
        cv.put(6, 6, fr[3]); cv.put(8, 8, fr[0])
    cv.outline()
    return cv.im


def soil() -> Image.Image:
    """A tilled spot: dry (left), watered (right): three furrows."""
    out = Image.new("RGBA", (32, 16), (0, 0, 0, 0))
    r = random.Random(5)
    for k, pal in enumerate((SOIL, WET)):
        cv = C(16, 16)
        for y in range(1, 15):
            for x in range(1, 15):
                furrow = (y - 1) % 5
                c = pal[3] if furrow == 0 else pal[1] if furrow == 3 else pal[2]
                if r.random() < 0.12:
                    c = pal[min(3, pal.index(c) + 1)] if r.random() < 0.5 else pal[max(0, pal.index(c) - 1)]
                cv.put(x, y, c)
        for x in range(1, 15):
            cv.put(x, 15, pal[0])
        if k == 1:
            for (x, y) in ((4, 4), (11, 8), (7, 12)):
                cv.put(x, y, hexc("8ab8d8", 200))
        out.alpha_composite(cv.im, (k * 16, 0))
    return out


def gate() -> Image.Image:
    """The farm's gate: two posts, a wooden gate between them, a small hanging sign with a sprout on it."""
    cv = C(32, 32)
    for x in (2, 27):
        cv.rect(x, 6, x + 2, 30, BARK[1]); cv.rect(x, 6, x, 30, BARK[2]); cv.rect(x + 2, 6, x + 2, 30, BARK[0])
        cv.rect(x - 1, 5, x + 3, 6, BARK[2])
    for y in (16, 24):
        cv.rect(5, y, 26, y + 1, BARK[2]); cv.rect(5, y + 2, 26, y + 2, BARK[0])
    for x in (9, 15, 21):
        cv.rect(x, 15, x + 1, 28, BARK[1])
    cv.line(6, 27, 25, 16, BARK[1])
    cv.rect(10, 1, 21, 10, hexc("c89a5a")); cv.rect(10, 1, 21, 1, hexc("e0b878")); cv.rect(10, 10, 21, 10, BARK[0])
    cv.line(12, 0, 12, 1, hexc("6a6a6a")); cv.line(19, 0, 19, 1, hexc("6a6a6a"))
    cv.line(16, 9, 16, 5, LEAF[1]); leaf(cv, 16, 5, -1, -1, 3, 2); leaf(cv, 16, 6, 1, -1, 3, 2)
    cv.outline()
    return cv.im


def seedstand() -> Image.Image:
    """The seed stand: a little wooden table with seed packets on it under a striped awning."""
    cv = C(32, 32)
    for x in (4, 26):
        cv.rect(x, 10, x + 1, 30, BARK[1])
    cv.rect(2, 18, 29, 21, BARK[2]); cv.rect(2, 22, 29, 23, BARK[0])
    for i, x in enumerate(range(2, 30, 4)):
        cv.rect(x, 4, x + 3, 9, hexc("e8d8b0") if i % 2 else hexc("4a8a3a"))
    cv.rect(2, 9, 29, 9, BARK[0])
    for i, x in enumerate((5, 11, 17, 23)):
        col = [hexc("e07a2a"), hexc("d83a4a"), hexc("e8c040"), hexc("6aa84a")][i]
        cv.rect(x, 12, x + 4, 17, hexc("f0e0b8")); cv.rect(x + 1, 13, x + 3, 15, col); cv.rect(x, 12, x + 4, 12, hexc("c8b080"))
    cv.ell(10, 27, 4, 2.6, hexc("b08a58")); cv.ell(10, 26, 3, 1.4, hexc("d8b07a"))  # a sack of seed
    cv.outline()
    return cv.im


def sheet() -> tuple[Image.Image, Image.Image]:
    crops = Image.new("RGBA", (FW * 5, FH * len(CROPS)), (0, 0, 0, 0))
    icons = Image.new("RGBA", (16 * len(CROPS), 16), (0, 0, 0, 0))
    for i, (cid, kind) in enumerate(CROPS):
        KIND[cid] = kind
        for k, im in enumerate(frames(cid)):
            crops.alpha_composite(im, (k * FW, i * FH))
        icons.alpha_composite(icon(cid), (i * 16, 0))
    return crops, icons


def made() -> dict[str, Image.Image]:
    crops, icons = sheet()
    return {"crops": crops, "icons": icons, "soil": soil(), "gate": gate(), "seedstand": seedstand()}


def build(aseprite: bool) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pics = made()
    if not aseprite:
        for n, im in pics.items():
            im.save(OUT / f"{n}.png")
    else:
        SRC.mkdir(parents=True, exist_ok=True)
        lines = []
        for n, im in pics.items():
            w, h = im.size
            lines.append(f"do local s = Sprite({w}, {h}, ColorMode.RGB) local img = s.cels[1].image")
            for y in range(h):
                for x in range(w):
                    r, g, b, a = im.getpixel((x, y))
                    if a:
                        lines.append(f"img:drawPixel({x}, {y}, app.pixelColor.rgba({r}, {g}, {b}, {a}))")
            lines.append(f's:saveAs("{(SRC / f"{n}.aseprite").as_posix()}") s:saveCopyAs("{(OUT / f"{n}.png").as_posix()}") s:close() end')
        script = SRC / "_place.lua"
        script.write_text("\n".join(lines), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        script.unlink()
    print(f"{len(pics)} farm pictures written" + (" (placed in Aseprite, sources saved)" if aseprite else ""))


def preview(out: str) -> None:
    """Every crop's frames and icon on soil, at 4x, in two columns; then the soil, the gate and the seed stand."""
    pics = made()
    sc = 4
    crops, icons = pics["crops"], pics["icons"]
    half = (len(CROPS) + 1) // 2
    cell_w = (FW * 5 + 4 + 16) * sc
    sheet_im = Image.new("RGBA", (cell_w * 2 + 40, (half * FH + 40) * sc), hexc("5a8a3a"))
    for i in range(len(CROPS)):
        col, row = divmod(i, half)
        x0, y0 = col * (cell_w + 40), row * FH * sc
        for k in range(5):
            spot = pics["soil"].crop((0, 0, 16, 16)).resize((16 * sc, 16 * sc), Image.NEAREST)
            sheet_im.alpha_composite(spot, (x0 + k * FW * sc, y0 + 8 * sc))
        sheet_im.alpha_composite(crops.crop((0, i * FH, FW * 5, (i + 1) * FH)).resize((FW * 5 * sc, FH * sc), Image.NEAREST), (x0, y0))
        sheet_im.alpha_composite(icons.crop((i * 16, 0, i * 16 + 16, 16)).resize((16 * sc, 16 * sc), Image.NEAREST), (x0 + (FW * 5 + 4) * sc, y0 + 4 * sc))
    y = half * FH * sc
    x = 0
    for n in ("soil", "gate", "seedstand"):
        im = pics[n]
        sheet_im.alpha_composite(im.resize((im.width * sc, im.height * sc), Image.NEAREST), (x, y + 4))
        x += im.width * sc + 20
    sheet_im.save(out)
    print("preview ->", out)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "preview"
    if cmd == "build":
        build("--aseprite" in sys.argv)
    else:
        preview(sys.argv[2] if len(sys.argv) > 2 else "farm_preview.png")
