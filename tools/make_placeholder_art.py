"""Make placeholder art for the creature game.

    .venv/Scripts/python tools/make_placeholder_art.py            (only files that are missing)
    .venv/Scripts/python tools/make_placeholder_art.py --all      (overwrite everything)

The list of files, with their sizes, comes from web/js/game/data.js (the single source of truth),
so this always matches what the game loads. Real pixel art replaces these files one for one:
same name, same size.

REAL ART IS NOW IN PLACE (delivered 2026-10-10 by the art session; its own generators are in
tools/game_art/). Do not run this with --all: it would overwrite the real art with placeholders.
"""

from __future__ import annotations

import colorsys
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "game-art"

P = ["#8fd3ff", "#4aa3e8", "#2f6fb8", "#1f4780"]   # primary key colours: highlight, base, shade, deep
S = ["#fff1c9", "#f5cf7a", "#d49a3f"]              # secondary
A = ["#ff7a9c", "#d6456e"]                         # accent
LINE = "#1b1420"
MAGENTA = "#ff00ff"
TYPE_HUE = {"ember": 14, "tide": 205, "grove": 120, "spark": 50, "stone": 30, "dusk": 275}


def hsl(h: float, s: float, l: float) -> str:
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, l, s)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def new(w: int, h: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def body(d: ImageDraw.ImageDraw, box, base=P[1], shade=P[2], light=P[0]) -> None:
    """A shaded, outlined blob: the basis of most placeholder parts."""
    x0, y0, x1, y1 = box
    d.ellipse(box, fill=shade, outline=LINE)
    d.ellipse((x0 + 1, y0 + 1, x1 - 2, y1 - 2), fill=base)
    w, h = x1 - x0, y1 - y0
    if w > 8 and h > 8:
        d.ellipse((x0 + w * 0.22, y0 + h * 0.16, x0 + w * 0.42, y0 + h * 0.32), fill=light)
    d.ellipse(box, outline=LINE)


def torso(a) -> Image.Image:
    w, h = a["w"], a["h"]
    img, d = new(w, h)
    sp = a.get("species")
    if sp == "blob":
        body(d, (0, 2, w - 1, h + h // 3))
    elif sp == "biped":
        body(d, (w * 0.12, 0, w * 0.88, h - 1))
    elif sp == "quad":
        body(d, (0, h * 0.12, w - 1, h - 1))
    else:
        body(d, (w * 0.08, 0, w * 0.92, h * 0.82))
        d.polygon([(w * 0.35, h * 0.72), (w * 0.65, h * 0.72), (w * 0.5, h - 1)], fill=P[2], outline=LINE)
    d.ellipse((w * 0.5, h * 0.5, w * 0.82, h * 0.88), fill=S[1])          # belly
    d.ellipse((w * 0.56, h * 0.54, w * 0.74, h * 0.7), fill=S[0])
    branch = a.get("branch")
    if branch == "echo":
        for i in range(3):
            d.arc((w * 0.1 + i * 4, h * 0.3, w * 0.5 + i * 4, h * 0.7), 110, 250, fill=A[0])
    elif branch == "sage":
        d.rectangle((w * 0.3, 1, w * 0.8, 3), fill=A[0], outline=A[1])
    elif branch == "keeper":
        for x, y in ((0.25, 0.4), (0.4, 0.7), (0.2, 0.65)):
            d.rectangle((w * x, h * y, w * x + 2, h * y + 2), fill=A[0], outline=A[1])
    return img


def head(a) -> Image.Image:
    img, d = new(a["w"], a["h"])
    sp = a.get("species")
    box = {"blob": (3, 5, 28, 27), "biped": (4, 3, 28, 27), "quad": (2, 5, 30, 26), "floater": (4, 4, 28, 27)}[sp]
    body(d, box)
    d.ellipse((17, 16, 28, 25), fill=S[1])                                 # muzzle
    branch = a.get("branch")
    if branch:
        mark = {"echo": (12, 6, 18, 8), "sage": (10, 5, 20, 7), "keeper": (13, 5, 16, 8)}[branch]
        d.rectangle(mark, fill=A[0], outline=A[1])
    return img


def limb(a) -> Image.Image:
    w, h = a["w"], a["h"]
    img, d = new(w, h)
    kind = a["kind"]
    if kind == "wing":
        flat = a.get("frame") == "b"
        d.polygon([(w - 1, h - 1), (0, h * (0.55 if flat else 0.05)), (w * 0.5, h - 1)], fill=S[1], outline=LINE)
    else:
        short = 1 if a.get("frame") == "b" else 0
        d.rounded_rectangle((0, 0, w - 1, h - 1 - short), 2, fill=P[2] if kind == "leg" else P[1], outline=LINE)
        if kind == "leg":
            d.rectangle((1, h - 3 - short, w - 2, h - 2 - short), fill=P[3])
    return img


def ear(a) -> Image.Image:
    w, h = a["w"], a["h"]
    img, d = new(w, h)
    i = a["id"]
    if i == "round":
        body(d, (1, 3, 10, 13))
    elif i == "point":
        d.polygon([(1, 13), (6, 0), (11, 13)], fill=P[1], outline=LINE)
        d.polygon([(4, 12), (6, 5), (8, 12)], fill=S[1])
    elif i == "long":
        d.rounded_rectangle((3, 0, 8, 13), 3, fill=P[1], outline=LINE)
        d.rectangle((5, 3, 6, 11), fill=S[1])
    elif i == "floppy":
        d.polygon([(2, 13), (0, 4), (6, 1), (11, 6), (9, 13)], fill=P[2], outline=LINE)
    elif i == "fin":
        d.polygon([(2, 13), (1, 2), (11, 8), (9, 13)], fill=A[0], outline=LINE)
    elif i == "leaf":
        d.polygon([(5, 13), (0, 6), (6, 0), (11, 6), (7, 13)], fill=S[2], outline=LINE)
        d.line((6, 2, 6, 12), fill=S[0])
    else:  # tuft
        for x in (2, 5, 8):
            d.polygon([(x, 13), (x + 1, 2 + x % 3), (x + 3, 13)], fill=P[0], outline=LINE)
    return img


def tail(a) -> Image.Image:
    img, d = new(16, 16)
    i = a["id"]
    if i == "nub":
        body(d, (9, 5, 15, 11))
    elif i == "curl":
        d.arc((2, 2, 15, 14), 60, 330, fill=LINE, width=4)
        d.arc((3, 3, 14, 13), 60, 330, fill=P[1], width=2)
    elif i == "fluff":
        body(d, (1, 1, 15, 14), base=S[1], shade=S[2], light=S[0])
    elif i == "spike":
        d.polygon([(15, 6), (1, 2), (15, 11)], fill=P[2], outline=LINE)
    elif i == "fish":
        d.polygon([(15, 8), (1, 1), (5, 8), (1, 15)], fill=A[0], outline=LINE)
    elif i == "leaf":
        d.polygon([(15, 8), (8, 1), (0, 8), (8, 14)], fill=S[2], outline=LINE)
    else:  # bolt
        d.polygon([(15, 7), (8, 3), (10, 7), (1, 5), (7, 12), (6, 9), (15, 10)], fill=A[0], outline=LINE)
    return img


def horn(a) -> Image.Image:
    img, d = new(12, 12)
    i = a["id"]
    if i == "nub":
        d.polygon([(3, 11), (6, 4), (9, 11)], fill=S[0], outline=LINE)
    elif i == "pair":
        d.polygon([(1, 11), (2, 2), (5, 11)], fill=S[0], outline=LINE)
        d.polygon([(7, 11), (10, 2), (11, 11)], fill=S[0], outline=LINE)
    elif i == "antenna":
        d.line((6, 11, 6, 3), fill=LINE, width=1)
        d.ellipse((4, 0, 8, 4), fill=A[0], outline=LINE)
    elif i == "crest":
        d.polygon([(1, 11), (3, 3), (5, 8), (7, 1), (9, 8), (11, 11)], fill=A[0], outline=LINE)
    else:  # gem
        d.polygon([(6, 3), (10, 7), (6, 11), (2, 7)], fill=A[0], outline=LINE)
        d.point((5, 6), fill="#ffffff")
    return img


def back(a) -> Image.Image:
    img, d = new(16, 16)
    i = a["id"]
    if i == "spikes":
        for x in (0, 5, 10):
            d.polygon([(x, 15), (x + 3, 6), (x + 5, 15)], fill=A[0], outline=LINE)
    elif i == "shell":
        d.pieslice((0, 4, 15, 26), 180, 360, fill=S[2], outline=LINE)
        d.line((8, 5, 8, 15), fill=S[0])
    elif i == "fin":
        d.polygon([(2, 15), (4, 2), (13, 15)], fill=A[0], outline=LINE)
    elif i == "sprout":
        d.line((8, 15, 8, 7), fill=LINE, width=2)
        d.ellipse((1, 3, 8, 9), fill=S[2], outline=LINE)
        d.ellipse((8, 1, 15, 7), fill=S[2], outline=LINE)
    else:  # flame
        d.polygon([(3, 15), (2, 9), (6, 11), (8, 1), (11, 9), (13, 7), (12, 15)], fill=A[0], outline=LINE)
        d.polygon([(6, 15), (8, 8), (10, 15)], fill=S[0])
    return img


def eyes(a) -> Image.Image:
    img, d = new(16, 8)
    style, expr = a["id"], a["expr"]
    r = {"dot": 1, "round": 2, "oval": 2, "sleepy": 2, "star": 2, "wide": 3}[style]
    for cx in (4, 11):
        if expr == "blink":
            d.line((cx - 2, 4, cx + 2, 4), fill=LINE)
        elif expr == "happy":
            d.arc((cx - 2, 2, cx + 2, 7), 180, 360, fill=LINE)
        elif expr == "sleepy":
            d.arc((cx - 2, 1, cx + 2, 5), 0, 180, fill=LINE)
        else:
            if style == "dot":
                d.rectangle((cx - 1, 3, cx, 4), fill=LINE)
            else:
                top = 4 - r + (1 if style == "sleepy" or expr == "sad" else 0)
                d.ellipse((cx - r, top, cx + r, 4 + r), fill="#ffffff", outline=LINE)
                d.rectangle((cx, 3, cx + 1, 5), fill=LINE)
                if style == "star":
                    d.point((cx - 1, 3), fill=A[0])
            if expr == "sad":
                d.line((cx - 2, 1, cx + 2, 2), fill=LINE)
    return img


def mouth(a) -> Image.Image:
    img, d = new(8, 6)
    i = a["id"]
    if i == "neutral":
        d.line((2, 3, 5, 3), fill=LINE)
    elif i == "smile":
        d.arc((1, 0, 6, 4), 0, 180, fill=LINE)
    elif i == "open":
        d.ellipse((2, 1, 5, 4), fill=A[1], outline=LINE)
    elif i == "eat":
        d.rectangle((1, 1, 6, 4), fill=A[1], outline=LINE)
    elif i == "sad":
        d.arc((1, 2, 6, 6), 180, 360, fill=LINE)
    else:  # sleep
        d.ellipse((3, 2, 4, 3), fill=LINE)
    return img


def pattern(a) -> Image.Image:
    img, d = new(16, 16)
    i = a["id"]
    if i == "spots":
        for x, y in ((2, 2), (10, 5), (5, 11), (13, 13)):
            d.ellipse((x, y, x + 2, y + 2), fill=MAGENTA)
    elif i == "stripes":
        for x in (1, 7, 13):
            d.line((x, 0, x - 3, 15), fill=MAGENTA, width=2)
    elif i == "patch":
        d.ellipse((2, 3, 11, 12), fill=MAGENTA)
    elif i == "speckle":
        for n in range(14):
            d.point(((n * 7) % 16, (n * 11) % 16), fill=MAGENTA)
    else:  # rings
        d.ellipse((1, 1, 8, 8), outline=MAGENTA)
        d.ellipse((9, 9, 15, 15), outline=MAGENTA)
    return img


def egg(a) -> Image.Image:
    img, d = new(32, 32)
    hue = TYPE_HUE[a["type"]]
    d.ellipse((6, 3, 25, 31), fill=hsl(hue, 0.5, 0.45), outline=LINE)
    d.ellipse((7, 4, 23, 29), fill=hsl(hue, 0.55, 0.72))
    d.ellipse((10, 7, 15, 13), fill=hsl(hue, 0.6, 0.88))
    for x, y in ((17, 12), (11, 20), (19, 22)):
        d.ellipse((x, y, x + 3, y + 3), fill=hsl(hue + 30, 0.6, 0.5))
    d.ellipse((6, 3, 25, 31), outline=LINE)
    return img


def crack(a) -> Image.Image:
    img, d = new(32, 32)
    pts = [(12, 9), (15, 13), (13, 16), (17, 19), (15, 23), (19, 26)]
    d.line(pts[: 2 + a["n"] * 1 + (a["n"] > 1)], fill=LINE, width=1)
    if a["n"] >= 2:
        d.line([(15, 13), (20, 12), (22, 15)], fill=LINE)
    if a["n"] >= 3:
        d.line([(13, 16), (9, 18), (10, 22)], fill=LINE)
        d.line(pts, fill=LINE, width=2)
    return img


def icon(a) -> Image.Image:
    img, d = new(16, 16)
    if "type" in a:
        hue = TYPE_HUE[a["type"]]
        d.ellipse((1, 1, 14, 14), fill=hsl(hue, 0.6, 0.5), outline=LINE)
        d.ellipse((4, 3, 8, 7), fill=hsl(hue, 0.7, 0.8))
        return img
    i = a["id"]
    if i == "xp":
        d.polygon([(8, 1), (10, 6), (15, 6), (11, 9), (13, 15), (8, 11), (3, 15), (5, 9), (1, 6), (6, 6)], fill="#ffd54a", outline=LINE)
    elif i == "coin":
        d.ellipse((1, 1, 14, 14), fill="#f0a500", outline=LINE)
        d.ellipse((4, 4, 11, 11), outline="#ffe08a")
    elif i == "streak":
        d.polygon([(4, 15), (2, 9), (6, 10), (8, 1), (11, 8), (13, 6), (12, 15)], fill="#ff6b3d", outline=LINE)
        d.polygon([(6, 15), (8, 8), (10, 15)], fill="#ffd54a")
    elif i == "freeze":
        d.polygon([(8, 1), (14, 8), (8, 15), (2, 8)], fill="#9be7ff", outline=LINE)
        d.line((8, 3, 8, 13), fill="#ffffff")
    elif i == "hint":
        d.rounded_rectangle((2, 1, 13, 14), 2, fill="#fff1c9", outline=LINE)
        d.line((5, 5, 10, 5), fill=LINE)
        d.line((5, 8, 10, 8), fill=LINE)
    else:  # goal
        d.ellipse((1, 1, 14, 14), fill="#ffffff", outline=LINE)
        d.ellipse((4, 4, 11, 11), fill="#e5484d")
        d.ellipse((7, 7, 8, 8), fill="#ffffff")
    return img


def layer(a) -> Image.Image:
    w, h = a["w"], a["h"]
    img, d = new(w, h)
    name = a["layer"]
    if name == "sky":
        for y in range(h):
            t = y / h
            d.line((0, y, w, y), fill=(int(110 + 90 * t), int(190 + 40 * t), int(255 - 10 * t), 255))
    elif name == "far":
        for i, (cx, r) in enumerate(((40, 60), (150, 80), (270, 70))):
            d.ellipse((cx - r, 80 + i * 4, cx + r, 80 + i * 4 + r * 2), fill="#7fb7c9")
    elif name == "mid":
        for cx in (30, 110, 215, 290):
            d.rectangle((cx - 2, 96, cx + 2, 120), fill="#6b4a3a")
            d.ellipse((cx - 16, 72, cx + 16, 104), fill="#3f9b63", outline="#2c6e49")
            d.ellipse((cx - 9, 76, cx - 1, 84), fill="#6cc58a")
    else:  # ground
        d.rectangle((0, 116, w, h), fill="#5aa857")
        d.rectangle((0, 116, w, 118), fill="#8fd67a")
        d.rectangle((0, 132, w, h), fill="#4a8b4c")
        for x in range(0, w, 13):
            d.line((x, 116, x + 1, 112 + x % 3), fill="#8fd67a")
    return img


def simple(a) -> Image.Image:
    w, h = a["w"], a["h"]
    img, d = new(w, h)
    kind = a["kind"]
    if kind == "sun":
        d.ellipse((2, 2, w - 3, h - 3), fill="#ffe08a", outline="#f0a500")
    elif kind == "moon":
        d.ellipse((2, 2, w - 3, h - 3), fill="#e8ecff", outline="#aab3e6")
        d.ellipse((9, 0, w + 2, h - 8), fill=(0, 0, 0, 0))
    elif kind == "cloud":
        for x in range(0, w - h, max(4, h // 2)):
            d.ellipse((x, 2, x + h, h - 1), fill="#ffffff")
        d.rectangle((h // 2, h // 2, w - h // 2, h - 1), fill="#ffffff")
    else:  # particle
        i = a["id"]
        if i == "star":
            d.polygon([(4, 0), (5, 3), (7, 4), (5, 5), (4, 7), (3, 5), (0, 4), (3, 3)], fill="#ffd54a")
        elif i == "plus":
            d.rectangle((3, 1, 4, 6), fill="#7fe0ea")
            d.rectangle((1, 3, 6, 4), fill="#7fe0ea")
        elif i == "gem":
            d.polygon([(4, 0), (7, 3), (4, 7), (0, 3)], fill="#d59bff", outline="#7a4bd1")
        elif i == "heart":
            d.polygon([(4, 7), (0, 3), (0, 1), (2, 0), (4, 2), (5, 0), (7, 1), (7, 3)], fill="#ff5c7a")
        elif i == "zzz":
            d.line([(1, 1), (6, 1), (1, 6), (6, 6)], fill="#ffffff")
        else:  # note
            d.line((5, 0, 5, 5), fill="#ffffff")
            d.ellipse((2, 4, 5, 7), fill="#ffffff")
            d.line((5, 0, 7, 2), fill="#ffffff")
    return img


def sheet(a) -> Image.Image:
    """An expanding ring of sparks, one frame after another."""
    frames = a["frames"]
    size = a["h"]
    img, d = new(a["w"], size)
    colour = {"burst_lucky": "#7fe0ea", "burst_jackpot": "#ffd54a", "hatch": "#ffffff", "levelup": "#ffd54a",
              "sparkle": "#ffffff", "dust": "#d9c9a8"}[a["id"]]
    for f in range(frames):
        cx = f * size + size / 2
        t = (f + 1) / frames
        r = t * size * 0.46
        rays = 4 if size <= 16 else 10
        for k in range(rays):
            ang = k * 2 * math.pi / rays + f * 0.3
            x, y = cx + math.cos(ang) * r, size / 2 + math.sin(ang) * r
            s = max(1, round((1 - t) * (size / 12)))
            d.rectangle((x - s, y - s, x + s, y + s), fill=colour)
        if a["id"] in ("levelup", "hatch", "burst_jackpot") and t < 0.6:
            d.ellipse((cx - r * 0.6, size / 2 - r * 0.6, cx + r * 0.6, size / 2 + r * 0.6), outline=colour)
    return img


def _hue(name: str) -> int:
    return sum(ord(ch) * (i + 3) for i, ch in enumerate(name)) % 360


def item(a) -> Image.Image:
    """Wearable items: a simple shape per slot, coloured differently per item."""
    w, h = a["w"], a["h"]
    img, d = new(w, h)
    hue = _hue(a["id"])
    fill, dark = hsl(hue, 0.65, 0.55), hsl(hue, 0.6, 0.38)
    slot = a["slot"]
    if slot == "hat":
        d.rounded_rectangle((4, 2, 15, 11), 4, fill=fill, outline=LINE)
        d.rectangle((1, 10, 18, 12), fill=dark, outline=LINE)
    elif slot == "face":
        for x in (1, 9):
            d.ellipse((x, 1, x + 5, 6), fill=fill, outline=LINE)
        d.line((6, 3, 9, 3), fill=LINE)
    elif slot == "neck":
        d.arc((1, -6, 14, 6), 0, 180, fill=dark, width=2)
        d.ellipse((6, 5, 9, 8), fill=fill, outline=LINE)
    else:  # held
        d.line((5, 11, 5, 4), fill=LINE, width=2)
        d.rectangle((6, 1, 11, 6), fill=fill, outline=LINE)
    return img


def decor(a) -> Image.Image:
    """Habitat decorations: a labelled block standing on the bottom edge."""
    s = a["w"]
    img, d = new(s, s)
    hue = _hue(a["id"])
    top = s // 3 if s > 16 else s // 4
    d.rounded_rectangle((1, top, s - 2, s - 1), max(2, s // 8), fill=hsl(hue, 0.5, 0.5), outline=LINE)
    d.rectangle((3, top + 2, s - 4, top + 3), fill=hsl(hue, 0.55, 0.72))
    d.ellipse((s // 2 - 2, 0 if s > 16 else top - 3, s // 2 + 2, top), fill=hsl(hue + 40, 0.6, 0.6), outline=LINE)
    return img


MAKERS = {"item": item, "decor": decor, "torso": torso, "head": head, "leg": limb, "arm": limb, "wing": limb, "ear": ear, "tail": tail, "horn": horn,
          "back": back, "eyes": eyes, "mouth": mouth, "pattern": pattern, "egg": egg, "crack": crack, "icon": icon,
          "layer": layer, "sun": simple, "moon": simple, "cloud": simple, "particle": simple, "sheet": sheet}


def main() -> None:
    overwrite = "--all" in sys.argv
    script = "import('./web/js/game/data.js').then((m) => console.log(JSON.stringify(m.artFiles())))"
    files = json.loads(subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    made = 0
    for a in files:
        path = OUT / a["file"]
        if path.exists() and not overwrite:
            continue
        if a["kind"] not in MAKERS or (a["kind"] == "sheet" and a.get("id") in ("hit", "shot", "shield", "heal", "boost")):
            print("no placeholder for", a["file"], "(it needs real art)")
            continue
        img = MAKERS[a["kind"]](a)
        assert img.size == (a["w"], a["h"]), (a["file"], img.size)
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        made += 1
    print(f"{made} placeholder files written, {len(files) - made} left alone, in {OUT}")


if __name__ == "__main__":
    main()
