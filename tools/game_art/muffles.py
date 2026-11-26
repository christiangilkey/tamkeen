"""The Muffles, the village's folk (prototype "habitat_room"; the owner, 2026-11-25: "The Villagers are called Muffles",
one of them is a Muffle). They are the owner's pick of the villager sketches: "all 3 are good", so each Muffle has one
of the three hooded bodies (purple, teal, rose: a big round hood, a starry night where a face would be, two glowing
eyes, a little cloak, mittens, two short legs in boots), with its job's things on top: a grocer's basket of fruit, a
tailor's measuring tape, a baker's hat, a florist's flower, a barkeep's mug, a herald's sash, a fisher's wide hat. Two
more just live there. Designed pixel by pixel and placed in Aseprite by a script, the agreed method.

    .venv/Scripts/python.exe tools/game_art/muffles.py preview OUT.png   a sheet to look at
    .venv/Scripts/python.exe tools/game_art/muffles.py build [--aseprite] web/game-art/muffle/<job>.png (40 x 40)
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
# each Muffle: its body and its job (yard.js STATIONS `job`, and the two who just live there)
MUFFLES = {
    "grocer": "b", "tailor": "c", "baker": "a", "florist": "c", "barkeep": "a", "herald": "b", "fisher": "b",
    "villager1": "a", "villager2": "c",
}


class C:
    def __init__(self):
        self.im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        self.px = self.im.load()

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < S and 0 <= y < S:
            self.px[x, y] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def ell(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self.put(x, y, c)

    def outline(self):
        src = self.im.copy().load()
        for y in range(S):
            for x in range(S):
                if src[x, y][3] == 0 and any(0 <= x + dx < S and 0 <= y + dy < S and src[x + dx, y + dy][3] == 255
                                             for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    self.px[x, y] = OUTLINE


def body(cv: C, hood) -> None:
    """The hooded body, arms down at its sides (the job's things go on after)."""
    for lx in (16, 22):  # legs and boots
        cv.rect(lx, 30, lx + 2, 34, BOOT[1]); cv.rect(lx, 30, lx, 34, BOOT[2])
        cv.ell(lx + 1.5 + (-0.5 if lx < 20 else 0.5), 35.5, 2.6, 1.6, BOOT[1])
    for y in range(21, 32):  # the cloak, a little bell, scalloped at the hem
        half = 5.5 + 3.8 * (y - 21) / 10
        for x in range(int(20 - half), int(20 + half) + 1):
            if y == 31 and x % 3 == 0:
                continue
            d = (x + 0.5 - (20 - half)) / (2 * half)
            cv.put(x, y, hood[2] if d < 0.22 else hood[0] if d > 0.82 else hood[1])
    cv.rect(20, 24, 20, 30, hood[0])
    cv.put(20, 23, GOLD[1]); cv.put(19, 23, GOLD[0]); cv.put(21, 23, GOLD[0])
    for (mx, my), (sx, sy) in (((12, 27), (15, 23)), ((27, 27), (25, 23))):  # arms and mittens
        n = max(abs(mx - sx), abs(my - sy))
        for i in range(n + 1):
            ax, ay = sx + (mx - sx) * i / n, sy + (my - sy) * i / n
            cv.put(ax, ay, hood[1]); cv.put(ax, ay + 1, hood[0])
        cv.ell(mx + 0.5, my + 0.5, 2.8, 2.6, MITT[1]); cv.put(mx + 1, my + 1, MITT[0])
    cv.ell(20, 13, 10.5, 10, hood[1])  # the hood
    for y in range(3, 24):
        for x in range(9, 31):
            if ((x + 0.5 - 20) / 10.5) ** 2 + ((y + 0.5 - 13) / 10) ** 2 <= 1:
                if (x + 0.5 - 15) ** 2 + (y + 0.5 - 8) ** 2 < 26:
                    cv.put(x, y, hood[3] if (x + 0.5 - 14) ** 2 + (y + 0.5 - 7) ** 2 < 8 else hood[2])
                elif x > 25 and y > 12:
                    cv.put(x, y, hood[0])
    for k, (x, y) in enumerate(((24, 4), (26, 3), (28, 3), (30, 4), (31, 6), (32, 8))):
        cv.ell(x, y, 2 - k * 0.15, 1.8 - k * 0.15, hood[1 if k < 3 else 0])
    cv.ell(33, 10, 2, 2, GOLD[1]); cv.put(32, 9, GOLD[2]); cv.put(34, 11, GOLD[0])
    cv.ell(20, 15, 7, 5.8, FACE)  # the starry face, the eyes, blush, a small smile
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


def job(cv: C, name: str) -> None:
    """The job's things, over the body."""
    if name == "grocer":  # a basket of fruit on the arm
        cv.rect(24, 26, 31, 30, hexc("8a5a2a")); cv.rect(24, 26, 31, 26, hexc("b07a3a"))
        for (x, y, c) in ((25, 25, "e04848"), (27, 24, "f0a030"), (29, 25, "7ac050"), (30, 24, "e04848")):
            cv.ell(x + 0.5, y + 0.5, 1.4, 1.4, hexc(c))
    elif name == "tailor":  # a measuring tape round the neck, pins
        for x in range(13, 28):
            cv.put(x, 22 + (1 if 16 < x < 24 else 0), hexc("f0d060"))
        for y in range(23, 29):
            cv.put(14, y, hexc("f0d060")); cv.put(26, y + 1, hexc("f0d060"))
        cv.put(15, 25, hexc("1a1a1a")); cv.put(25, 26, hexc("1a1a1a"))
        cv.put(23, 26, hexc("ff6060")); cv.put(23, 27, hexc("c0c0c0"))
    elif name == "baker":  # a tall white baker's hat on the hood, an apron
        cv.rect(15, 0, 25, 4, hexc("f4f0e6")); cv.ell(20, 1.5, 6, 2.5, hexc("ffffff")); cv.rect(15, 4, 25, 5, hexc("d8d0c0"))
        cv.rect(17, 24, 23, 31, hexc("f4f0e6")); cv.rect(17, 24, 23, 24, hexc("d8d0c0"))
    elif name == "florist":  # a big flower tucked on the hood, a little bunch held
        cv.ell(12, 7, 2.5, 2.5, hexc("ff7ab0")); cv.put(12, 7, hexc("ffe680"))
        for (x, y, c) in ((26, 23, "ff7ab0"), (28, 24, "8ac0ff"), (27, 21, "ffe680")):
            cv.ell(x + 0.5, y + 0.5, 1.5, 1.5, hexc(c))
        cv.rect(27, 25, 27, 27, hexc("4e8a3a"))
    elif name == "barkeep":  # a frothy mug, a cloth over the shoulder
        cv.rect(26, 23, 30, 28, hexc("8a5a2a")); cv.rect(26, 22, 30, 22, hexc("fff8e8")); cv.put(31, 24, hexc("8a5a2a")); cv.put(31, 26, hexc("8a5a2a"))
        cv.rect(12, 21, 14, 26, hexc("e8e0c8"))
    elif name == "herald":  # a gold sash across, a little horn
        for i in range(12):
            cv.put(14 + i, 22 + i * 0.75, GOLD[1]); cv.put(15 + i, 22 + i * 0.75, GOLD[0])
        cv.rect(26, 24, 30, 25, GOLD[1]); cv.ell(31, 24.5, 1.6, 2, GOLD[2])
    elif name == "fisher":  # a wide straw hat, a rod over the shoulder
        cv.ell(20, 3.5, 13, 2.6, hexc("d8b860")); cv.ell(20, 2, 7, 2.5, hexc("e8cc78")); cv.rect(13, 3, 27, 3, hexc("a8883a"))
        for i in range(14):
            cv.put(28 + i * 0.5, 26 - i, hexc("7a5a3a"))
        cv.put(35, 12, hexc("e0e0e0")); cv.put(35, 13, hexc("e0e0e0"))
    elif name == "villager2":  # a scarf
        cv.rect(14, 21, 26, 22, hexc("e0a040")); cv.rect(23, 23, 24, 27, hexc("e0a040"))


# The Muffles' forgotten script: 12 letters, 7 x 9 each, in a strip (glyphs.png). An unknown word in a Muffle's line is
# shown as a few of these (muffles.js glyphsFor), the same ones every time for the same word.
GLYPHS = [
    ["..xxx..", ".x...x.", "x..x..x", "x.x.x.x", "x..x..x", ".x...x.", "..xxx..", ".......", "...x..."],
    ["x.....x", "x.....x", ".x...x.", "..x.x..", "...x...", "...x...", "..xxx..", ".......", "x.....x"],
    ["xxxxxx.", ".....x.", "....x..", "...x...", "..xxx..", ".x...x.", "xxxxxxx", ".......", "..x.x.."],
    ["...x...", "..x.x..", ".x...x.", "xxxxxxx", "x.....x", "x..x..x", "x.....x", ".......", "...x..."],
    [".xx.xx.", "x..x..x", "x.....x", ".x...x.", "..x.x..", "...x...", "...x...", ".......", "..xxx.."],
    ["x......", "x.xxx..", "xx...x.", "x....x.", "x...x..", "x..x...", "xxxxxxx", ".......", "......x"],
    ["..xxxx.", ".x.....", "x..xx..", "x.x..x.", "x..xx..", ".x.....", "..xxxx.", ".......", ".x...x."],
    ["xxx.xxx", "..x.x..", "..x.x..", "...x...", "..x.x..", "..x.x..", "xxx.xxx", ".......", "...x..."],
    ["...x...", "...x...", "xxxxxxx", "...x...", "..x.x..", ".x...x.", "x.....x", ".......", "x.x.x.x"],
    [".xxxxx.", "x.....x", "x.xxx.x", "x.x...x", "x.xxxxx", "x......", ".xxxxx.", ".......", "...x..."],
    ["x..x..x", "x..x..x", ".x.x.x.", "..xxx..", "...x...", "..x.x..", ".x...x.", ".......", ".x.x.x."],
    ["..x....", ".xxx...", "x.x.x..", "..x..x.", "..x...x", "..x..x.", "..xxx..", ".......", "....x.."],
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
    cv = C()
    body(cv, HOODS[MUFFLES[name]])
    job(cv, name)
    cv.outline()
    return cv.im


def build(aseprite: bool) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    made = {n: muffle(n) for n in MUFFLES}
    made["glyphs"] = glyph_strip()
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
    sc, pad = 5, 16
    names = list(MUFFLES)
    sheet = Image.new("RGBA", (len(names) * (S * sc + pad) + pad, S * sc + pad * 2 + 16), hexc("1e1a2c"))
    dr = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        x = pad + i * (S * sc + pad)
        sheet.alpha_composite(muffle(n).resize((S * sc, S * sc), Image.NEAREST), (x, pad))
        dr.text((x, pad + S * sc + 2), n, fill=(236, 228, 210, 255))
    sheet.save(out)
    print("preview ->", out)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "preview"
    if cmd == "build":
        build("--aseprite" in sys.argv)
    else:
        preview(sys.argv[2] if len(sys.argv) > 2 else "muffles_preview.png")
