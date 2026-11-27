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
    bee_hive_N.png 32 x 32 (48 x 48 at tier 3)  the Spelling Bee Hive, tiers 1-3 (the Ink Well's place, plan slice 2)
    shrine_N.png   48 x 48             the Star Shrine by the cottage, grander with stardust (plan slice 3)
    dishes.png     16 per dish x 16    the Cookbook's dishes (farmuses.js RECIPES order; plan slice 4)
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


STRAW = [hexc("7a5a1e"), hexc("b08a34"), hexc("d8b452"), hexc("f0d684")]
HONEY = [hexc("a8600a"), hexc("e8a020"), hexc("ffd24a")]


def skep(cv: C, cx, base, rx, ry):
    """A straw bee skep: a dome of coiled straw bands, a dark little door at its foot."""
    top = base - ry * 2
    for y in range(int(top), base + 1):
        t = (y - top) / (ry * 2)
        half = rx * (0.35 + 0.65 * min(1, (t * 1.6) ** 0.5))
        for x in range(int(cx - half), int(cx + half) + 1):
            band = int((y - top) / 2.2) % 2
            d = (x + 0.5 - (cx - half)) / max(1, 2 * half)
            k = 3 if d < 0.2 and band == 0 else 2 if d < 0.55 else 1
            if band and k > 1:
                k -= 1
            cv.put(x, y, STRAW[k])
    cv.ell(cx + 0.5, base - 2, 1.8, 2, hexc("2a1a0a"))


def beehive(tier: int) -> Image.Image:
    """The Spelling Bee Hive (the owner's name; it takes the Ink Well's place on the farm): tier 1 a skep on a stump,
    tier 2 a bigger one on a little stand with flowers, tier 3 two skeps under a shingled roof, a honey pot by them."""
    size = 48 if tier == 3 else 32
    cv = C(size, size)
    b = size - 2
    if tier == 1:
        cv.rect(10, b - 5, 21, b, BARK[1]); cv.rect(10, b - 5, 21, b - 5, BARK[2]); cv.rect(21, b - 5, 21, b, BARK[0])
        skep(cv, 16, b - 6, 8, 7)
    elif tier == 2:
        for x in (7, 24):
            cv.rect(x, b - 7, x + 1, b, BARK[1])
        cv.rect(5, b - 9, 26, b - 7, BARK[2]); cv.rect(5, b - 7, 26, b - 7, BARK[0])
        skep(cv, 16, b - 10, 10, 9)
        for (x, c) in ((3, "ff7ab0"), (28, "ffe680"), (12, "8ac0ff")):
            cv.line(x, b, x, b - 3, LEAF[1]); cv.ell(x + 0.5, b - 4, 1.3, 1.3, hexc(c))
    else:
        cv.rect(6, b - 9, 41, b - 7, BARK[2]); cv.rect(6, b - 7, 41, b - 7, BARK[0])
        for x in (8, 39):
            cv.rect(x, b - 7, x + 1, b, BARK[1])
        for x in (6, 41):
            cv.rect(x, b - 30, x + 1, b - 9, BARK[1])
        for i in range(10):  # the little roof
            y = b - 31 - i // 2
            cv.rect(3 + i, y, 44 - i, y, hexc("8a3a2a") if i % 2 else hexc("b04a32"))
        skep(cv, 16, b - 10, 8, 8)
        skep(cv, 31, b - 10, 8, 8)
        cv.ell(24, b - 2, 3.4, 2.6, HONEY[1]); cv.ell(23, b - 3, 1.2, 0.8, HONEY[2]); cv.rect(22, b - 5, 26, b - 5, BARK[1])
    for (x, y) in ([(25, b - 15)], [(26, b - 22), (6, b - 16)], [(12, b - 26), (36, b - 24), (24, b - 18)])[tier - 1]:
        cv.put(x, y, hexc("ffd24a")); cv.put(x + 1, y, hexc("2a1a0a")); cv.put(x, y - 1, hexc("e8f4ff"))  # bees
    cv.outline()
    return cv.im


STONE_S = [hexc("4a4a5e"), hexc("6e6e86"), hexc("9696ae"), hexc("c4c4d8")]
STAR = [hexc("c08a28"), hexc("ffe680"), hexc("fff8c8"), hexc("ffffff")]


def star(cv: C, cx, cy, r):
    """A five-pointed star, lit gold, with a soft glow round it."""
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            inside, j = False, len(pts) - 1
            for i in range(len(pts)):
                xi, yi = pts[i]; xj, yj = pts[j]
                if (yi > y + 0.5) != (yj > y + 0.5) and x + 0.5 < (xj - xi) * (y + 0.5 - yi) / (yj - yi) + xi:
                    inside = not inside
                j = i
            if inside:
                cv.put(x, y, STAR[2] if x + y < cx + cy - 1 else STAR[1])
    cv.put(cx - 1, cy - 1, STAR[3])


def shrine(tier: int) -> Image.Image:
    """The Star Shrine (the owner's plan, slice 3), 48 x 48, grander as stardust grows: 1 a stone pedestal with a star
    floating over it; 2 a pedestal under a stone arch, runes glowing; 3 a little temple of two pillars and a roof, the
    star bigger, flowers at its foot."""
    cv = C(48, 48)
    b = 46
    cv.rect(14, b - 3, 33, b, STONE_S[1]); cv.rect(14, b - 3, 33, b - 3, STONE_S[2]); cv.rect(33, b - 3, 33, b, STONE_S[0])  # the step
    cv.rect(18, b - 13, 29, b - 4, STONE_S[2]); cv.rect(18, b - 13, 18, b - 4, STONE_S[3]); cv.rect(29, b - 13, 29, b - 4, STONE_S[0])  # the pedestal
    cv.rect(16, b - 15, 31, b - 13, STONE_S[3]); cv.rect(16, b - 13, 31, b - 13, STONE_S[1])
    for (x, y) in ((21, b - 9), (24, b - 7), (26, b - 10)):
        cv.put(x, y, hexc("8ad8ff") if tier > 1 else STONE_S[1])  # runes (glowing from tier 2)
    if tier >= 2:
        for x in (8, 37):
            cv.rect(x, b - 30, x + 3, b - 1, STONE_S[2]); cv.rect(x, b - 30, x, b - 1, STONE_S[3]); cv.rect(x + 3, b - 30, x + 3, b - 1, STONE_S[0])
        for i in range(31):  # the arch
            x = 8 + i
            y = b - 31 - round(math.sin(i / 30 * math.pi) * 6)
            cv.rect(x, y, x, y + 2, STONE_S[2]); cv.put(x, y, STONE_S[3])
    if tier >= 3:
        for i in range(12):  # the roof over the arch
            y = b - 39 - i // 2
            cv.rect(5 + i, y, 42 - i, y, hexc("3e4a7a") if i % 2 else hexc("56649a"))
        for (x, c) in ((12, "ff7ab0"), (35, "8ac0ff"), (15, "ffe680"), (32, "ffe680")):
            cv.line(x, b, x, b - 3, LEAF[1]); cv.ell(x + 0.5, b - 4, 1.3, 1.3, hexc(c))
    sy = b - 22 - (2 if tier == 3 else 0)
    star(cv, 24, sy, 4 + tier)
    cv.outline()
    r = 4 + tier  # its glow, after the outline: a light dotted halo
    for y in range(sy - r - 4, sy + r + 5):
        for x in range(24 - r - 4, 24 + r + 5):
            d = math.hypot(x + 0.5 - 24, y + 0.5 - sy)
            if r + 1.5 < d < r + 4 and (x + y) % 2 == 0 and not cv.get(x, y)[3]:
                cv.put(x, y, (255, 246, 190, 150))
    return cv.im


# The Cookbook's dishes (plan slice 4; farmuses.js RECIPES order), 16 x 16 each, side by side in dishes.png.
DISHES = ["picnic", "focus_tea", "stew", "pie_ember", "pie_tide", "pie_grove", "pie_spark", "pie_stone", "pie_dusk",
          "berry_tart", "moon_jelly", "lantern_soup", "feast", "champion", "porridge"]
PIE_FILL = {"ember": "e05a2a", "tide": "3a8ad8", "grove": "4ea83a", "spark": "e8c020", "stone": "9a8a6a", "dusk": "7a4ab0"}
BOWL = [hexc("6a4428"), hexc("9a6a3a"), hexc("c8945a")]
PLATE = [hexc("a8a8b8"), hexc("d8d8e4"), hexc("f4f4fa")]


def bowl(cv: C, fill, top=8):
    """A wooden bowl, its filling showing over the rim."""
    cv.ell(8, top + 1, 6.5, 2.2, fill[1]); cv.ell(7, top + 0.6, 3, 1, fill[2])
    for y in range(top + 2, 14):
        half = 6.5 - (y - top - 2) * 0.55
        for x in range(int(8 - half), int(8 + half) + 1):
            cv.put(x, y, BOWL[2] if x < 6 else BOWL[0] if x > 10 else BOWL[1])
    cv.rect(5, 14, 11, 14, BOWL[0])


def dish(did: str) -> Image.Image:
    cv = C(16, 16)
    if did == "picnic":  # a basket with a checked cloth, bread and an apple peeping out
        cv.rect(2, 8, 13, 14, BARK[2]); cv.rect(2, 8, 13, 8, BARK[1])
        for x in range(2, 14, 2):
            cv.line(x, 9, x, 14, BARK[1])
        cv.line(4, 8, 8, 3, BARK[1]); cv.line(8, 3, 12, 8, BARK[1])
        cv.ell(5, 7.5, 2.4, 1.6, hexc("d8a050")); cv.ell(11, 7, 1.8, 1.8, hexc("d82a2a"))
        for x in range(6, 10):
            cv.put(x, 8, hexc("e04848") if x % 2 else hexc("f4f0e6"))
    elif did == "focus_tea":  # a cup of tea, a leaf, steam
        cv.rect(3, 7, 11, 13, hexc("e8e0d0")); cv.rect(3, 13, 11, 13, hexc("b8b0a0")); cv.rect(4, 7, 10, 8, hexc("7aa84a"))
        cv.ell(12.5, 10, 1.8, 2, hexc("e8e0d0")); cv.put(12, 10, (0, 0, 0, 0))
        cv.rect(2, 14, 12, 14, hexc("c8c0b0"))
        for (x, y) in ((5, 4), (6, 3), (8, 5), (9, 4)):
            cv.put(x, y, (236, 236, 244, 190))
    elif did == "stew":
        bowl(cv, [hexc("8a4a20"), hexc("c0702a"), hexc("e8a050")])
        cv.put(6, 8, hexc("e8782a")); cv.put(9, 9, hexc("6aa84a")); cv.put(11, 8, hexc("f0d060"))
    elif did.startswith("pie_"):  # a pie in its dish, lattice on top, its element's colour through the gaps
        col = hexc(PIE_FILL[did[4:]])
        cv.ell(8, 10, 7, 4, hexc("c88a4a")); cv.ell(8, 9.5, 6, 3, col)
        for x in range(3, 14, 3):
            cv.line(x, 7, x, 12, hexc("e8b070"))
        cv.line(2, 9, 14, 9, hexc("e8b070")); cv.rect(2, 12, 14, 13, hexc("8a5a2a"))
    elif did == "berry_tart":
        cv.ell(8, 10, 6.5, 3.4, hexc("d8a050")); cv.ell(8, 9.5, 5.4, 2.4, hexc("e04870"))
        for (x, y) in ((5, 9), (8, 8), (11, 9), (7, 10), (10, 10)):
            cv.put(x, y, hexc("8a1a3a"))
        cv.rect(2, 12, 14, 13, hexc("b07a3a"))
    elif did == "moon_jelly":  # a wobbly pale blue jelly on a plate, a crescent on top
        cv.ell(8, 13, 7, 1.6, PLATE[1])
        for y in range(4, 13):
            half = 4 + (y - 4) * 0.25
            for x in range(int(8 - half), int(8 + half) + 1):
                cv.put(x, y, hexc("b8d8f8") if x < 7 else hexc("7aa8e0"))
        cv.put(9, 5, hexc("fff6d8")); cv.put(10, 6, hexc("fff6d8")); cv.put(6, 7, (255, 255, 255, 255))
    elif did == "lantern_soup":  # a bowl of pumpkin soup with a little lantern glow over it
        bowl(cv, [hexc("a8500a"), hexc("e8781a"), hexc("f8b048")], top=9)
        cv.rect(7, 2, 9, 6, hexc("f8d050")); cv.rect(7, 1, 9, 1, BARK[0]); cv.rect(7, 7, 9, 7, BARK[0]); cv.put(8, 4, hexc("fff8c8"))
    elif did == "feast":  # a big platter: bread, fruit, vegetables
        cv.ell(8, 11, 7.4, 3.4, PLATE[1]); cv.ell(8, 10.6, 6.4, 2.6, PLATE[2])
        cv.ell(5, 9, 2.4, 1.8, hexc("d8a050")); cv.ell(9, 8.5, 1.8, 1.8, hexc("d82a2a")); cv.ell(12, 9.5, 1.6, 1.6, hexc("6aa84a"))
        cv.put(7, 10, hexc("e8782a")); cv.put(10, 11, hexc("f0d060")); cv.put(3, 4, hexc("ffd24a")); cv.put(13, 3, hexc("ffd24a"))
    elif did == "champion":  # a hero's plate: bread, vegetables, a little flag
        cv.ell(8, 11, 7, 3, PLATE[1]); cv.ell(8, 10.6, 6, 2.2, PLATE[2])
        cv.ell(6, 9.5, 2.6, 1.6, hexc("d8a050")); cv.ell(10.5, 9.6, 2, 1.4, hexc("e8782a")); cv.put(9, 10, hexc("6aa84a"))
        cv.line(11, 2, 11, 8, BARK[1]); cv.rect(12, 2, 14, 4, hexc("e04848"))
    elif did == "porridge":
        bowl(cv, [hexc("c8b088"), hexc("e8d8b0"), hexc("fff4d8")])
        cv.put(7, 8, hexc("f8c040")); cv.put(8, 8, hexc("f8c040")); cv.put(9, 9, hexc("e8a020"))  # honey
    cv.outline()
    return cv.im


def dishes() -> Image.Image:
    out = Image.new("RGBA", (16 * len(DISHES), 16), (0, 0, 0, 0))
    for i, d in enumerate(DISHES):
        out.alpha_composite(dish(d), (i * 16, 0))
    return out


# ---------- slice 5: the old buildings in the cozy look (the owner: "NO neon/cyberpunk anywhere") ----------
# Written over web/game-art/structure/<id>_<tier>.png (32 x 32, 48 x 48 at tier 3), sources in game/art-src/structure/.
STRUCT_OUT = ROOT / "web" / "game-art" / "structure"
STRUCT_SRC = ROOT / "game" / "art-src" / "structure"
CLAYP = [hexc("6a2e1a"), hexc("9a4a2a"), hexc("c26a3e"), hexc("de8a58")]
PAPER = [hexc("b89a68"), hexc("e0c898"), hexc("f4e8c8"), hexc("fffaf0")]
MOSS = [hexc("3d5a2a"), hexc("5a7a3a"), hexc("7a9a4a")]


def pot(cv: C, cx, base, w, h):
    """A clay pot: a rim, slightly narrower at the foot."""
    for y in range(base - h, base + 1):
        t = (y - (base - h)) / max(1, h)
        half = w / 2 - t * 1.5
        for x in range(int(cx - half), int(cx + half) + 1):
            cv.put(x, y, CLAYP[3] if x < cx - half + 2 else CLAYP[1] if x > cx + half - 2 else CLAYP[2])
    cv.rect(int(cx - w / 2 - 1), base - h, int(cx + w / 2 + 1), base - h + 1, CLAYP[3]); cv.rect(int(cx - w / 2 - 1), base - h + 1, int(cx + w / 2 + 1), base - h + 1, CLAYP[1])


def letter_leaf(cv: C, x, y, gold=False):
    """A little paper leaf with a letter's stroke on it (the Word Sprout's leaves are words)."""
    cv.ell(x + 0.5, y + 0.5, 2.2, 1.6, PAPER[2] if not gold else hexc("f8d860"))
    cv.put(x, y, PAPER[0] if not gold else hexc("b8861a")); cv.put(x + 1, y, PAPER[0] if not gold else hexc("b8861a"))


def word_sprout(tier):
    size = 48 if tier == 3 else 32
    cv = C(size, size)
    b = size - 2
    cx = size // 2
    if tier == 1:
        pot(cv, cx, b, 10, 7)
        cv.line(cx, b - 7, cx, b - 15, STEM)
        for (dx, dy) in ((-3, -12), (3, -14), (-2, -17), (2, -10)):
            leaf(cv, cx, b + dy + 2, -1 if dx < 0 else 1, -0.6, 3, 2)
        letter_leaf(cv, cx - 4, b - 13); letter_leaf(cv, cx + 3, b - 16)
    elif tier == 2:
        pot(cv, cx, b, 14, 9)
        cv.line(cx, b - 9, cx, b - 22, BARK[1])
        cv.blob(cx, b - 22, 8, 6, LEAF)
        for (x, y) in ((cx - 5, b - 24), (cx + 3, b - 26), (cx + 5, b - 20), (cx - 2, b - 19)):
            letter_leaf(cv, x, y)
        cv.rect(cx + 7, b - 12, cx + 12, b - 9, PAPER[2]); cv.rect(cx + 9, b - 9, cx + 9, b - 5, BARK[1]); cv.put(cx + 9, b - 11, BARK[0])
    else:  # a little tree in a planter box, golden letter-blossoms
        cv.rect(cx - 12, b - 8, cx + 12, b, BARK[2]); cv.rect(cx - 12, b - 8, cx + 12, b - 8, BARK[3] if len(BARK) > 3 else BARK[2]); cv.rect(cx - 12, b - 1, cx + 12, b, BARK[0])
        for x in range(cx - 10, cx + 11, 5):
            cv.line(x, b - 7, x, b - 1, BARK[1])
        cv.rect(cx - 1, b - 22, cx + 1, b - 8, BARK[1]); cv.rect(cx + 1, b - 22, cx + 1, b - 8, BARK[0])
        cv.blob(cx, b - 30, 15, 11, LEAF)
        for (x, y) in ((cx - 9, b - 32), (cx + 6, b - 35), (cx + 10, b - 27), (cx - 4, b - 25), (cx + 1, b - 37), (cx - 12, b - 26), (cx + 3, b - 29)):
            letter_leaf(cv, x, y, gold=(x + y) % 2 == 0)
    cv.outline()
    return cv.im


SHELL = [hexc("b06a5a"), hexc("e0a08a"), hexc("f4c8b0"), hexc("fff0e4")]


def shell(cv: C, cx, base, r):
    """A big fan shell (a scallop), ribs fanning from its hinge."""
    for y in range(int(base - r), base + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            dx, dy = x + 0.5 - cx, base - y + 0.5
            d = (dx * dx + dy * dy) ** 0.5
            if d > r or dy < 0:
                continue
            ang = math.atan2(dy, dx)
            rib = int(ang / math.pi * 9) % 2
            cv.put(x, y, SHELL[2 + (0 if rib else 1) if d < r * 0.85 else 1] if dx < 0 else SHELL[1 + (0 if rib else 1)])
    cv.rect(int(cx - 2), base - 1, int(cx + 2), base, SHELL[0])


def echo_shell(tier):
    size = 48 if tier == 3 else 32
    cv = C(size, size)
    b = size - 2
    cx = size // 2
    stone = lambda x0, x1, y0: (cv.rect(x0, y0, x1, b, STONE_S[1]), cv.rect(x0, y0, x1, y0, STONE_S[2]), cv.rect(x1, y0, x1, b, STONE_S[0]))
    if tier == 1:
        stone(cx - 9, cx + 9, b - 4)
        shell(cv, cx, b - 5, 9)
    elif tier == 2:
        stone(cx - 10, cx + 10, b - 4)
        shell(cv, cx - 2, b - 5, 10)
        cv.rect(cx + 10, b - 26, cx + 11, b - 4, BARK[1]); cv.rect(cx + 4, b - 26, cx + 11, b - 25, BARK[1])  # a post with a chime
        for i, x in enumerate((cx + 5, cx + 7, cx + 9)):
            cv.line(x, b - 24, x, b - 20 - i, hexc("8a8a9a")); cv.rect(x, b - 19 - i, x, b - 16 - i, hexc("c8c8d8"))
    else:  # a shell basin with water, a little roof hung with chimes
        stone(cx - 16, cx + 16, b - 5)
        shell(cv, cx, b - 6, 13)
        cv.ell(cx, b - 7, 8, 2, hexc("6aa8e0")); cv.ell(cx - 2, b - 7.5, 3, 0.8, hexc("b8e0ff"))
        for x in (cx - 18, cx + 17):
            cv.rect(x, b - 40, x + 1, b - 5, BARK[1])
        for i in range(8):
            y = b - 41 - i // 2
            cv.rect(cx - 21 + i, y, cx + 21 - i, y, hexc("8a3a2a") if i % 2 else hexc("b04a32"))
        for i, x in enumerate(range(cx - 9, cx + 10, 4)):
            cv.line(x, b - 38, x, b - 33 - (i % 3), hexc("8a8a9a")); cv.rect(x, b - 32 - (i % 3), x, b - 28 - (i % 3), hexc("c8c8d8"))
    cv.outline()
    return cv.im


def lantern(cv: C, cx, top, w, h):
    """A paper lantern with wooden caps, warm light inside."""
    for y in range(top, top + h):
        t = (y - top) / max(1, h - 1)
        half = w / 2 * (0.7 + 0.3 * math.sin(t * math.pi))
        for x in range(int(cx - half), int(cx + half) + 1):
            cv.put(x, y, PAPER[3] if abs(x - cx) < half * 0.4 else PAPER[2] if x < cx else PAPER[1])
        if (y - top) % 3 == 1:
            cv.rect(int(cx - half), y, int(cx + half), y, PAPER[0])
    cv.rect(int(cx - w / 3), top - 1, int(cx + w / 3), top - 1, BARK[0]); cv.rect(int(cx - w / 3), top + h, int(cx + w / 3), top + h, BARK[0])


def page_lantern(tier):
    size = 48 if tier == 3 else 32
    cv = C(size, size)
    b = size - 2
    cx = size // 2
    if tier == 1:
        cv.rect(cx, b - 20, cx + 1, b, BARK[1]); cv.rect(cx - 4, b - 20, cx + 1, b - 19, BARK[1])
        lantern(cv, cx - 4, b - 17, 8, 9)
    elif tier == 2:
        cv.rect(cx - 1, b - 26, cx, b, BARK[1]); cv.rect(cx - 9, b - 26, cx + 8, b - 25, BARK[1])
        lantern(cv, cx - 8, b - 23, 8, 9); lantern(cv, cx + 7, b - 23, 8, 9)
        for i, c in enumerate(("8a3a2a", "3a5a8a", "5a7a3a")):  # a stack of books at its foot
            cv.rect(cx - 7 + i, b - 2 - i * 2, cx + 3 + i, b - i * 2, hexc(c)); cv.rect(cx - 7 + i, b - 1 - i * 2, cx + 3 + i, b - 1 - i * 2, PAPER[2])
    else:  # a lamp post holding a big lantern folded from pages, a bench of books
        cv.rect(cx - 1, b - 34, cx + 1, b, IRON_S[1]); cv.rect(cx + 1, b - 34, cx + 1, b, IRON_S[0])
        cv.rect(cx - 4, b - 2, cx + 4, b, IRON_S[1])
        cv.rect(cx - 10, b - 36, cx + 10, b - 35, IRON_S[1])
        lantern(cv, cx - 9, b - 33, 10, 12); lantern(cv, cx + 9, b - 33, 10, 12)
        lantern(cv, cx, b - 46, 12, 9)
        for i, c in enumerate(("8a3a2a", "3a5a8a", "5a7a3a", "a8862e")):
            cv.rect(cx + 6 + i % 2, b - 2 - i * 2, cx + 16 + i % 2, b - i * 2, hexc(c)); cv.rect(cx + 6 + i % 2, b - 1 - i * 2, cx + 16 + i % 2, b - 1 - i * 2, PAPER[2])
    cv.outline()
    # the light, after the outline: a soft warm glow
    for y in range(size):
        for x in range(size):
            if not cv.get(x, y)[3] and (x + y) % 3 == 0:
                for (lx, ly) in ([(cx - 4, b - 13)], [(cx - 8, b - 19), (cx + 7, b - 19)], [(cx - 9, b - 27), (cx + 9, b - 27), (cx, b - 42)])[tier - 1]:
                    if math.hypot(x - lx, y - ly) < 8:
                        cv.put(x, y, (255, 214, 120, 90))
                        break
    return cv.im


IRON_S = [hexc("2e2a36"), hexc("4a4654"), hexc("6a6676")]


def standing_stone(cv: C, cx, base, w, h, rune=True):
    """A mossy standing stone, a rune cut in it, moss at its foot and top."""
    for y in range(base - h, base + 1):
        t = (y - (base - h)) / max(1, h)
        half = w / 2 * (0.6 + 0.4 * min(1, t * 2))
        for x in range(int(cx - half), int(cx + half) + 1):
            cv.put(x, y, STONE_S[3] if x < cx - half + 2 else STONE_S[1] if x > cx + half - 2 else STONE_S[2])
    if rune:
        for (dx, dy) in ((0, 0), (0, 1), (0, 2), (0, 3), (-1, 1), (1, 2), (-1, 3)):
            cv.put(cx + dx, base - h * 0.6 + dy, hexc("c8a040"))
    for x in range(int(cx - w / 2), int(cx + w / 2) + 1, 2):
        cv.put(x, base, MOSS[1]); cv.put(x + 1, base - 1, MOSS[2])
    cv.put(int(cx - 1), base - h, MOSS[2]); cv.put(int(cx), base - h, MOSS[1])


def memory_stone(tier):
    size = 48 if tier == 3 else 32
    cv = C(size, size)
    b = size - 2
    cx = size // 2
    if tier == 1:
        standing_stone(cv, cx, b, 10, 18)
    elif tier == 2:
        standing_stone(cv, cx, b, 13, 25)
        for (x, c) in ((cx - 9, "ff7ab0"), (cx + 8, "8ac0ff"), (cx + 11, "ffe680")):
            cv.line(x, b, x, b - 3, LEAF[1]); cv.ell(x + 0.5, b - 4, 1.3, 1.3, hexc(c))
    else:  # three stones in a ring, the middle one tallest
        standing_stone(cv, cx - 14, b - 2, 10, 20)
        standing_stone(cv, cx + 14, b - 2, 10, 22)
        standing_stone(cv, cx, b, 15, 36)
        for (x, c) in ((cx - 6, "ff7ab0"), (cx + 6, "ffe680"), (cx - 20, "8ac0ff"), (cx + 20, "ff7ab0")):
            cv.line(x, b, x, b - 3, LEAF[1]); cv.ell(x + 0.5, b - 4, 1.3, 1.3, hexc(c))
    cv.outline()
    return cv.im


COZY = {"word_sprout": word_sprout, "echo_shell": echo_shell, "page_lantern": page_lantern, "memory_stone": memory_stone}


# ---------- slice 5: the farm's upgrades and decorations ----------
def windmill() -> Image.Image:
    """The windmill (grinds wheat into flour): a stone tower, a cap, four cloth sails."""
    cv = C(48, 64)
    b = 62
    for y in range(24, b + 1):
        t = (y - 24) / (b - 24)
        half = 7 + 5 * t
        for x in range(int(24 - half), int(24 + half) + 1):
            cv.put(x, y, STONE_S[3] if x < 24 - half + 2 else STONE_S[1] if x > 24 + half - 3 else STONE_S[2])
    cv.rect(21, b - 8, 26, b, BARK[1]); cv.ell(23.5, b - 8, 2.6, 1.6, BARK[1])
    cv.rect(22, 34, 25, 37, hexc("3a2a1a"))
    for i in range(7):
        cv.rect(16 - i // 2 + 1, 22 - i, 32 + i // 2 - 1, 22 - i, hexc("8a3a2a") if i % 2 else hexc("b04a32"))
    hub = (24, 20)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        ex, ey = hub[0] + math.cos(a) * 20, hub[1] + math.sin(a) * 20
        cv.line(hub[0], hub[1], ex, ey, BARK[1])
        for j in range(4, 19):
            px, py = hub[0] + math.cos(a) * j, hub[1] + math.sin(a) * j
            qx, qy = px + math.cos(a + math.pi / 2) * 3, py + math.sin(a + math.pi / 2) * 3
            cv.line(px, py, qx, qy, PAPER[2] if j % 4 else PAPER[1])
    cv.ell(24.5, 20.5, 1.8, 1.8, BARK[0])
    cv.outline()
    return cv.im


def compost() -> Image.Image:
    """The compost bin: a wooden crate of slats, rich dark earth and a few greens on top."""
    cv = C(32, 32)
    b = 30
    cv.rect(5, b - 14, 26, b, BARK[1])
    for y in range(b - 13, b + 1, 4):
        cv.rect(5, y, 26, y + 1, BARK[2])
    for x in (5, 26):
        cv.rect(x, b - 15, x + 1, b, BARK[0])
    cv.ell(16, b - 15, 10, 3, hexc("3a2414")); cv.ell(14, b - 16, 5, 1.4, hexc("5a3a20"))
    for (x, y, c) in ((11, b - 17, LEAF[2]), (18, b - 18, hexc("e8782a")), (21, b - 16, LEAF[1]), (14, b - 18, hexc("f0d060"))):
        cv.put(x, y, c); cv.put(x + 1, y, c)
    cv.outline()
    return cv.im


def sprinkler() -> Image.Image:
    """The sprinkler (earned): a brass head on a short post, a fan of drops."""
    cv = C(16, 24)
    cv.rect(7, 12, 8, 22, IRON_S[1]); cv.rect(5, 10, 10, 12, hexc("c8a040")); cv.put(6, 10, hexc("f0d070"))
    for (x, y) in ((2, 6), (4, 3), (8, 1), (12, 3), (14, 6), (3, 9), (13, 9)):
        cv.put(x, y, hexc("6aa8e0")); cv.put(x, y + 1, hexc("b8e0ff"))
    cv.outline()
    return cv.im


def weathervane() -> Image.Image:
    """A weathervane: a post, the compass arms, a little rooster on top (decoration only)."""
    cv = C(16, 32)
    cv.rect(7, 10, 8, 30, IRON_S[1])
    cv.rect(3, 14, 12, 14, IRON_S[1]); cv.rect(7, 12, 8, 16, IRON_S[1])
    cv.put(2, 14, hexc("c8a040")); cv.put(13, 14, hexc("c8a040"))
    cv.ell(8, 6, 3, 2.4, hexc("c8a040")); cv.ell(10, 4, 1.4, 1.6, hexc("c8a040")); cv.put(11, 3, hexc("e04848")); cv.rect(4, 4, 5, 6, hexc("c8a040"))
    cv.rect(6, 28, 9, 30, STONE_S[1])
    cv.outline()
    return cv.im


def stones() -> Image.Image:
    """Stepping stones for a path (decoration only)."""
    cv = C(32, 16)
    for (x, y, rx) in ((5, 11, 3.6), (14, 7, 4), (23, 10, 3.6), (29, 5, 2.6)):
        cv.blob(x, y, rx, rx * 0.65, STONE_S)
    cv.outline()
    return cv.im


def glass() -> Image.Image:
    """The greenhouse's glass, drawn over each spot of its row: panes in a wooden frame, a shine."""
    cv = C(16, 24)
    for y in range(2, 22):
        for x in range(1, 15):
            cv.put(x, y, (200, 232, 255, 70))
    for x in (0, 7, 15):
        cv.rect(x, 1, x, 22, BARK[1])
    cv.rect(0, 1, 15, 1, BARK[2]); cv.rect(0, 12, 15, 12, BARK[1])
    for i in range(5):
        cv.put(2 + i, 4 + i, (255, 255, 255, 150))
    return cv.im


def upgrade_icons() -> Image.Image:
    """Icons for the farm's upgrades (farm.js UPGRADES order): watering can, greenhouse, scarecrow, compost, windmill,
    barn, sprinkler."""
    out = Image.new("RGBA", (16 * 7, 16), (0, 0, 0, 0))
    can = C(16, 16)
    can.rect(3, 6, 10, 13, hexc("6a8aa8")); can.rect(3, 6, 10, 6, hexc("9ab8d0")); can.line(10, 8, 14, 4, hexc("6a8aa8")); can.rect(13, 3, 15, 4, hexc("4a6a88"))
    can.line(4, 5, 8, 2, hexc("4a6a88")); can.line(8, 2, 10, 5, hexc("4a6a88")); can.outline()
    gh = C(16, 16)
    for y in range(4, 14):
        for x in range(2, 14):
            gh.put(x, y, (200, 232, 255, 160))
    gh.line(1, 6, 8, 1, BARK[1]); gh.line(8, 1, 15, 6, BARK[1]); gh.rect(1, 6, 1, 14, BARK[1]); gh.rect(14, 6, 14, 14, BARK[1]); gh.rect(7, 2, 8, 14, BARK[1])
    gh.rect(1, 14, 14, 14, BARK[0]); gh.put(10, 10, LEAF[2]); gh.put(4, 11, LEAF[2]); gh.outline()
    sc = C(16, 16)
    sc.rect(7, 4, 8, 15, BARK[1]); sc.rect(2, 7, 13, 8, BARK[1]); sc.ell(7.5, 3, 2.6, 2.4, hexc("e8c878")); sc.rect(4, 0, 11, 1, hexc("c89a4a"))
    sc.rect(5, 8, 10, 12, hexc("4a6aa8")); sc.outline()
    cp = C(16, 16)
    cp.rect(2, 6, 13, 14, BARK[1]); cp.rect(2, 8, 13, 8, BARK[2]); cp.rect(2, 11, 13, 11, BARK[2]); cp.ell(7.5, 6, 6, 1.6, hexc("3a2414")); cp.put(5, 5, LEAF[2]); cp.outline()
    wm = windmill().resize((12, 16), Image.NEAREST)
    bn = C(16, 16)
    bn.rect(2, 7, 13, 14, hexc("b04a32")); bn.line(1, 7, 7, 2, hexc("8a3a2a")); bn.line(8, 2, 14, 7, hexc("8a3a2a")); bn.rect(6, 9, 9, 14, hexc("f4e8c8")); bn.line(6, 9, 9, 14, hexc("b04a32")); bn.outline()
    sp = sprinkler().resize((12, 18), Image.NEAREST).crop((0, 2, 12, 18))
    for i, im in enumerate((can.im, gh.im, sc.im, cp.im, wm, bn.im, sp)):
        out.alpha_composite(im, (i * 16 + (16 - im.width) // 2, 16 - im.height))
    return out


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
    return {"crops": crops, "icons": icons, "soil": soil(), "gate": gate(), "seedstand": seedstand(),
            "bee_hive_1": beehive(1), "bee_hive_2": beehive(2), "bee_hive_3": beehive(3),
            "shrine_1": shrine(1), "shrine_2": shrine(2), "shrine_3": shrine(3), "dishes": dishes(),
            "windmill": windmill(), "compost": compost(), "sprinkler": sprinkler(), "weathervane": weathervane(),
            "stones": stones(), "glass": glass(), "upgrades": upgrade_icons()}


def cozy() -> dict:
    """The four old buildings, every tier, in the cozy look: {(out dir, src dir, name): image}."""
    return {f"{bid}_{t}": fn(t) for bid, fn in COZY.items() for t in (1, 2, 3)}


def build(aseprite: bool) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pics = made()
    struct = cozy()
    if not aseprite:
        for n, im in pics.items():
            im.save(OUT / f"{n}.png")
        for n, im in struct.items():
            im.save(STRUCT_OUT / f"{n}.png")
    else:
        SRC.mkdir(parents=True, exist_ok=True)
        STRUCT_SRC.mkdir(parents=True, exist_ok=True)
        lines = []
        jobs = [(n, im, SRC, OUT) for n, im in pics.items()] + [(n, im, STRUCT_SRC, STRUCT_OUT) for n, im in struct.items()]
        for n, im, src_dir, out_dir in jobs:
            w, h = im.size
            lines.append(f"do local s = Sprite({w}, {h}, ColorMode.RGB) local img = s.cels[1].image")
            for y in range(h):
                for x in range(w):
                    r, g, b, a = im.getpixel((x, y))
                    if a:
                        lines.append(f"img:drawPixel({x}, {y}, app.pixelColor.rgba({r}, {g}, {b}, {a}))")
            lines.append(f's:saveAs("{(src_dir / f"{n}.aseprite").as_posix()}") s:saveCopyAs("{(out_dir / f"{n}.png").as_posix()}") s:close() end')
        script = SRC / "_place.lua"
        script.write_text("\n".join(lines), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        script.unlink()
    print(f"{len(pics)} farm pictures and {len(struct)} buildings written" + (" (placed in Aseprite, sources saved)" if aseprite else ""))


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
    for n in ("soil", "gate", "seedstand", "bee_hive_1", "bee_hive_2", "bee_hive_3", "shrine_1", "shrine_2", "shrine_3", "dishes"):
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
