"""Hats for hatchlings: each hat at about three quarters of its size, so it fits a baby's smaller head.

Pixel art can't be resized smoothly without blurring, so each hat is shrunk by taking out the rows and
columns that repeat their neighbours (flat areas), never its outline or one-pixel details. Hand fixes
for single hats go in FIXES. The small hat is placed on the same 20x14 canvas with its bottom centre where
the big one's is, so it sits on the same socket (render.js uses item/small/<slot>/<id>.png for hatchlings).

    .venv/Scripts/python.exe tools/game_art/small_hats.py              write them, and a comparison sheet
    .venv/Scripts/python.exe tools/game_art/small_hats.py --aseprite   also save .aseprite sources
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "web" / "game-art" / "item" / "hat"
OUT = ROOT / "web" / "game-art" / "item" / "small" / "hat"
ASE = ROOT / "game" / "art-src" / "item" / "hat_small"
SHEET = ROOT / "game" / "art-src-16bit" / "creatures" / "_small_hats.png"
ASEPRITE = "C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
SCALE = 0.75
# Rows/columns (in the cropped hat) that must stay, by hat: details the automatic choice would lose.
KEEP: dict[str, dict[str, set[int]]] = {}
# Pixels to set after shrinking, by hat: {(x, y): (r, g, b, a)} in the small hat's own crop.
FIXES: dict[str, dict[tuple[int, int], tuple[int, int, int, int]]] = {}
# Hats whose shapes don't survive taking lines out, drawn small by hand: (colours of the big hat, rows).
DRAWN = {
    "antlers": ("a=#2f1c40 b=#e0b89c c=#a8707c", [
        ".a........a.",
        "aba.a..a.aba",
        "abbabaababba",
        ".abba..abba.",
        "..aba..aba..",
        "..aca..aca..",
        "..aca..aca..",
        "...a....a...",
    ]),
    "beret": ("a=#24124a b=#9d4edd c=#d9b8ff d=#5a2a9c", [
        "....aaa....",
        "..aabbbaa..",
        ".abcbbbbba.",
        "abcbbbbbdba",
        "abbbbbbbdba",
        "abbbbbbbdda",
        ".adddddddaa",
        "..aaaaaaaa.",
    ]),
    "pirate": ("a=#0d0e20 b=#262846 c=#3f4268 d=#f2f4ff e=#c4c8ea f=#f9c80e", [
        "......aaa......",
        "....aabbbaa....",
        "...abcbbbbbaa..",
        "..abcbbdddbbba.",
        ".abbbbbdbdbbbba",
        ".abbbbebdbebbba",
        "abbbbbbbbbbbbba",
        "abfffffffffffba",
        ".aaaaaaaaaaaaa.",
    ]),
    "wizard": ("a=#24124a b=#d9b8ff c=#9d4edd d=#5a2a9c e=#f9c80e f=#fff3a0 g=#ff9ad5 h=#ff2a8a i=#a3156b", [
        "........aaa....",
        ".......abcca...",
        ".......abccda..",
        "......abcecda..",
        "......abefeda..",
        ".....abccecda..",
        ".....aghhhhia..",
        ".aaaabcccccdaa.",
        "abbbbbbbbbbccca",
        "addddddddddddda",
        ".aaaaaaaaaaaaa.",
    ]),
    "graduation": ("a=#0d0e20 b=#3f4268 c=#f9c80e d=#262846 e=#181930 f=#fff3a0", [
        ".......a.......",
        ".....aabaa.....",
        "...aabbbbbaa...",
        ".aabbbbcbbbbaa.",
        "abbbbbbbbbbbcba",
        ".aabbbbbbbbbaca",
        "...adddddddeaca",
        "...adddddddeafa",
        "...adddddddeaa.",
        "....aaaaaaaa...",
    ]),
}


def drawn(name: str) -> Image.Image:
    spec, grid = DRAWN[name]
    pal = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for k, v in (t.split("=") for t in spec.split())}
    assert len({len(r) for r in grid}) == 1, f"{name}: rows of different widths"
    im = Image.new("RGBA", (len(grid[0]), len(grid)), (0, 0, 0, 0))
    for y, r in enumerate(grid):
        for x, ch in enumerate(r):
            if ch != ".":
                im.putpixel((x, y), pal[ch])
    return im


def columns(im: Image.Image) -> list[tuple]:
    return [tuple(im.getpixel((x, y)) for y in range(im.height)) for x in range(im.width)]


def rows(im: Image.Image) -> list[tuple]:
    return [tuple(im.getpixel((x, y)) for x in range(im.width)) for y in range(im.height)]


def thin(lines: list[tuple], drop: int, keep: set[int], rare: dict) -> list[int]:
    """Indexes of the lines to keep: repeatedly take out the line most like its neighbour (and so the least
    missed), never the first or last line or one in `keep`; ties go to the middle (symmetric hats stay so).
    A pixel that differs from its neighbour costs more the rarer its colour is in the hat (`rare`: colour ->
    weight), so small details (a skull, a star, a gem) are the last thing taken out."""
    idx = list(range(len(lines)))

    def diff(a: tuple, b: tuple) -> float:
        return sum(1 + rare.get(p, 0) for p, q in zip(a, b) if p != q)

    for _ in range(drop):
        best, best_cost = None, None
        for k in range(1, len(idx) - 1):
            i = idx[k]
            if i in keep:
                continue
            here = lines[i]
            cost = min(diff(here, lines[idx[k - 1]]), diff(here, lines[idx[k + 1]]))
            mid = abs(k - (len(idx) - 1) / 2)
            if best_cost is None or (cost, mid) < best_cost:
                best, best_cost = k, (cost, mid)
        if best is None:
            break
        idx.pop(best)
    return idx


def shrink(name: str, im: Image.Image) -> Image.Image:
    box = im.getbbox()
    hat = im.crop(box)
    w, h = hat.size
    keep = KEEP.get(name, {})
    count: dict = {}
    for y in range(h):
        for x in range(w):
            p = hat.getpixel((x, y))
            if p[3]:
                count[p] = count.get(p, 0) + 1
    rare = {p: 6 / n for p, n in count.items()}  # a colour on 2 pixels weighs 3 extra; on 60 pixels, 0.1
    if name in DRAWN:
        small = drawn(name)
    else:
        cols = thin(columns(hat), w - max(3, round(w * SCALE)), keep.get("cols", set()), rare)
        rws = thin(rows(hat), h - max(3, round(h * SCALE)), keep.get("rows", set()), rare)
        small = Image.new("RGBA", (len(cols), len(rws)), (0, 0, 0, 0))
        for nx, x in enumerate(cols):
            for ny, y in enumerate(rws):
                small.putpixel((nx, ny), hat.getpixel((x, y)))
    for (x, y), c in FIXES.get(name, {}).items():
        small.putpixel((x, y), c)
    # On the full 20x14 canvas: the same bottom-centre as the big hat's crop.
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    cx = (box[0] + box[2]) / 2
    out.alpha_composite(small, (round(cx - small.width / 2), box[3] - small.height))
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pairs = []
    for f in sorted(SRC.glob("*.png")):
        im = Image.open(f).convert("RGBA")
        small = shrink(f.stem, im)
        small.save(OUT / f.name)
        pairs.append((f.stem, im, small))
    sc, cols = 6, 6
    cw, ch = 20 * sc * 2 + 30, 14 * sc + 30
    sheet = Image.new("RGBA", (cols * cw, ((len(pairs) + cols - 1) // cols) * ch), (48, 40, 66, 255))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("arial.ttf", 13)
    for i, (name, big, small) in enumerate(pairs):
        x, y = (i % cols) * cw + 8, (i // cols) * ch + 20
        d.text((x, y - 17), name, fill=(255, 210, 120, 255), font=font)
        sheet.alpha_composite(big.resize((20 * sc, 14 * sc), Image.NEAREST), (x, y))
        sheet.alpha_composite(small.resize((20 * sc, 14 * sc), Image.NEAREST), (x + 20 * sc + 10, y))
    sheet.save(SHEET)
    print(f"{len(pairs)} small hats -> {OUT.relative_to(ROOT)}; sheet {SHEET.relative_to(ROOT)}")
    if "--aseprite" in sys.argv:
        ASE.mkdir(parents=True, exist_ok=True)
        lua = [f'do local s = app.open("{(OUT / f"{n}.png").as_posix()}") s:saveAs("{(ASE / f"{n}.aseprite").as_posix()}") s:close() end'
               for n, _, _ in pairs]
        script = ASE / "_save.lua"
        script.write_text("\n".join(lua), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        script.unlink()
        print(f".aseprite sources in {ASE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
