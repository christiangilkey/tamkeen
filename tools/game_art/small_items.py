"""Worn things for hatchlings: every hat, pair of glasses, scarf or necklace, held thing and cape at about three
quarters of its size, so it fits a baby's smaller body.

Pixel art can't be resized smoothly without blurring, so each item is shrunk by taking out the rows and
columns that repeat their neighbours (flat areas), never its outline or one-pixel details; rare colours (a
skull, a gem, a lens glint) are the last to go. Items whose shapes don't survive that are drawn small by hand
in DRAWN. A small item stays on its slot's canvas, placed so it sits on the same socket: a hat keeps its
bottom centre; anything else shrinks toward its slot's anchor point (data.SLOTS). render.js uses
item/small/<slot>/<id>.png for a creature shown with its hatchling look.

    .venv/Scripts/python.exe tools/game_art/small_items.py              write them, and a comparison sheet per slot
    .venv/Scripts/python.exe tools/game_art/small_items.py --aseprite   also save .aseprite sources
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ITEMS = ROOT / "web" / "game-art" / "item"
# Each slot's canvas size and anchor (as data.SLOTS): the point that sits on the creature's socket.
SLOTS = {"hat": ((20, 14), (10, 13)), "face": ((16, 8), (8, 4)), "neck": ((16, 10), (8, 1)),
         "held": ((12, 12), (6, 11)), "back": ((20, 20), (14, 19))}
ASEPRITE = "C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
SCALE = 0.75
# Rows/columns (in the cropped hat) that must stay, by hat: details the automatic choice would lose.
KEEP: dict[str, dict[str, set[int]]] = {}
# Pixels to set after shrinking, by hat: {(x, y): (r, g, b, a)} in the small hat's own crop.
FIXES: dict[str, dict[tuple[int, int], tuple[int, int, int, int]]] = {}
# Hats whose shapes don't survive taking lines out, drawn small by hand: (colours of the big hat, rows).
DRAWN = {
    # (2026-11-09: new items whose face, spiral or skull didn't survive shrinking, drawn small in their own colours)
    "hat/frog": ("K=#10281c H=#b4e36a G=#63b84a g=#2f7a3a B=#d9e8a2 W=#f2f4ff P=#ff5fa2 p=#a3156b", [
        "..KKK..KKK...",
        ".KWWWKKWWWK..",
        ".KWKWKKWKWK..",
        ".KKKKGGKKKKK.",
        "KHGGGGGGGGGgK",
        "KHGKKKKKKKGgK",
        "KGBBBBBBPPBgK",
        ".KgBBBBBPpBK.",
        "..KKKKKKKKK..",
    ]),
    "hat/toast": ("K=#3a1c0c C=#d08a3a c=#8a4a1c B=#f6d38a b=#e8b060 Y=#fff3a0 y=#f9c80e W=#fffbe6", [
        "..KKKKKKKK..",
        ".KCCCCCCCCK.",
        "KCBBWYYBBbcK",
        "KCBByyyBbbcK",
        ".KCbbbbbbcK.",
        ".KCbKbbKbcK.",
        ".KCbbKKbbcK.",
        ".KCbbbbbbcK.",
        ".KccccccccK.",
        ".KKKKKKKKKK.",
    ]),
    "hat/bookworm": ("K=#24102e C=#8a4ad0 c=#4a2280 Y=#f9c80e P=#f2e8c8 p=#c9b48a G=#8fd14f g=#4a8a2e W=#f2f4ff R=#ff3fa4", [
        "........KKKKK..",
        ".......KYWYYWYK",
        ".K.....KRGKKGRK",
        "KGK..KCKGGGGgK.",
        ".KGKKCPpKGGgK..",
        "..KKCPpPpKgK...",
        "..KCPpPKpPcCK..",
        ".KCPpPKcKpPpCK.",
        "KYPpPKcccKpPpYK",
        "KKKKKKKKKKKKKKK",
    ]),
    "face/spiral_glasses": ("A=#d6a0ff B=#9a3df0 D=#5c2196 K=#1b1420 W=#f4f0ff", [
        ".AAA...AAA.",
        "AKKKB.AKKKB",
        "AKWKBBAKWKB",
        "AKKWD.AKKWD",
        ".DDD...DDD.",
    ]),
    "face/bubble_gum": ("K=#5a1645 P=#ff6eb4 h=#ffb0d8 W=#ffffff p=#e0408f d=#b02a72", [
        ".KKKK.",
        "KPWWPK",
        "KPhPPK",
        "KPPPhK",
        "KpppdK",
        ".KKKK.",
    ]),
    "held/lollipop": ("K=#2a1430 H=#ff9ad5 P=#ff3fa4 p=#b82a78 W=#fff2f8 w=#e2b8d0 S=#f0ece4", [
        ".KKKKK.",
        "KHPWPPK",
        "KPWPWPK",
        "KWPPWwK",
        "KPWWPpK",
        ".KpwpK.",
        "..KSK..",
        "..KSK..",
        "...K...",
    ]),
    "back/snail_shell": ("K=#250f33 D=#4b1d6b V=#7d34b0 L=#b13cff P=#ff3fa4 p=#ff9ad2 W=#fff2fb C=#3ff6ff", [
        "...KKKKKK...",
        "..KpWWpPPK..",
        ".KpWpppPLLK.",
        "KpPPDDDDLVVK",
        "KPpDWpPDVVCK",
        "KPDpPDLVDVCK",
        "KLDPWpDVDVCK",
        "KLLVDDDVDVCK",
        "KVLLLLVVVDK.",
        ".KVVLVVLVDK.",
        "..KDVVDVDK..",
        "...KKKKKK...",
    ]),
    "back/raid_banner": ("K=#120c14 c=#4a3a5e C=#2f2540 D=#1c1526 B=#ded2b6 O=#ffb347 P=#ff3fa4 S=#c4c0d8 M=#77738e", [
        ".........KSK",
        ".KKKKKKKKKMK",
        ".KMMMMMMMMMK",
        ".KKKKKKKKKMK",
        "..KcCCPCCKMK",
        "..KcCPOPCKMK",
        "..KcPOOOPKMK",
        "..KcPBBBPKMK",
        "..KcBKBKBKMK",
        "..KcBBKBBKMK",
        "..KcCBBBCKMK",
        "..KcCDCDCKMK",
        "...KCKCKCKMK",
        "...K.K.K.KMK",
        ".........KKK",
    ]),
    "face/heart_glasses": ("a=#ff9ad5 b=#ff2a8a c=#a3156b", [
        "ab.bb..ab.bb",
        "bbbbcccbbbbc",
        ".bbc....bbc.",
        "..c......c..",
    ]),
    "neck/locket": ("a=#c2701c b=#fff3a0 c=#f9c80e", [
        "a.......a",
        ".a.....a.",
        "..a...a..",
        "...bcc...",
        "...cca...",
        "....a....",
    ]),
    "hat/antlers": ("a=#2f1c40 b=#e0b89c c=#a8707c", [
        ".a........a.",
        "aba.a..a.aba",
        "abbabaababba",
        ".abba..abba.",
        "..aba..aba..",
        "..aca..aca..",
        "..aca..aca..",
        "...a....a...",
    ]),
    "hat/beret": ("a=#24124a b=#9d4edd c=#d9b8ff d=#5a2a9c", [
        "....aaa....",
        "..aabbbaa..",
        ".abcbbbbba.",
        "abcbbbbbdba",
        "abbbbbbbdba",
        "abbbbbbbdda",
        ".adddddddaa",
        "..aaaaaaaa.",
    ]),
    "hat/pirate": ("a=#0d0e20 b=#262846 c=#3f4268 d=#f2f4ff e=#c4c8ea f=#f9c80e", [
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
    "hat/wizard": ("a=#24124a b=#d9b8ff c=#9d4edd d=#5a2a9c e=#f9c80e f=#fff3a0 g=#ff9ad5 h=#ff2a8a i=#a3156b", [
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
    "hat/graduation": ("a=#0d0e20 b=#3f4268 c=#f9c80e d=#262846 e=#181930 f=#fff3a0", [
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


def shrink(name: str, im: Image.Image, slot: str = "hat") -> Image.Image:
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
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    if slot == "hat":  # a hat: the same bottom-centre as the big hat's crop
        cx = (box[0] + box[2]) / 2
        out.alpha_composite(small, (round(cx - small.width / 2), box[3] - small.height))
        return out
    # anything else: the crop's centre moves toward the slot's anchor as the item shrinks
    ax, ay = SLOTS[slot][1]
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    nx = ax + (cx - ax) * small.width / w
    ny = ay + (cy - ay) * small.height / h
    x0 = min(max(round(nx - small.width / 2), 0), im.width - small.width)
    y0 = min(max(round(ny - small.height / 2), 0), im.height - small.height)
    out.alpha_composite(small, (x0, y0))
    return out


def main() -> None:
    lua = []
    for slot, ((cw0, ch0), _) in SLOTS.items():
        src, out = ITEMS / slot, ITEMS / "small" / slot
        ase = ROOT / "game" / "art-src" / "item" / f"{slot}_small"
        out.mkdir(parents=True, exist_ok=True)
        pairs = []
        for f in sorted(src.glob("*.png")):
            im = Image.open(f).convert("RGBA")
            small = shrink(f"{slot}/{f.stem}", im, slot)
            small.save(out / f.name)
            pairs.append((f.stem, im, small))
        sc, cols = 6, 6
        cw, ch = cw0 * sc * 2 + 30, ch0 * sc + 30
        sheet = Image.new("RGBA", (cols * cw, ((len(pairs) + cols - 1) // cols) * ch), (48, 40, 66, 255))
        d = ImageDraw.Draw(sheet)
        font = ImageFont.truetype("arial.ttf", 13)
        for i, (name, big, small) in enumerate(pairs):
            x, y = (i % cols) * cw + 8, (i // cols) * ch + 20
            d.text((x, y - 17), name, fill=(255, 210, 120, 255), font=font)
            sheet.alpha_composite(big.resize((cw0 * sc, ch0 * sc), Image.NEAREST), (x, y))
            sheet.alpha_composite(small.resize((cw0 * sc, ch0 * sc), Image.NEAREST), (x + cw0 * sc + 10, y))
        path = ROOT / "game" / "art-src-16bit" / "creatures" / ("_small_hats.png" if slot == "hat" else f"_small_{slot}.png")
        sheet.save(path)
        print(f"{len(pairs)} small {slot} items -> {out.relative_to(ROOT)}; sheet {path.relative_to(ROOT)}")
        if "--aseprite" in sys.argv:
            ase.mkdir(parents=True, exist_ok=True)
            lua += [f'do local s = app.open("{(out / f"{n}.png").as_posix()}") s:saveAs("{(ase / f"{n}.aseprite").as_posix()}") s:close() end'
                    for n, _, _ in pairs]
    if lua:
        script = ITEMS / "small" / "_save.lua"
        script.write_text("\n".join(lua), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        script.unlink()
        print(".aseprite sources in game/art-src/item/<slot>_small/")


if __name__ == "__main__":
    main()
