"""Worn things designed pixel by pixel as text grids, placed in Aseprite by a script (the method the owner approved
for bulk work on 2026-10-30): game/art-src/item/grids/<slot>/<id>.txt -> game/art-src/item/<slot>/<id>.aseprite and
web/game-art/item/<slot>/<id>.png (the slot's canvas size, data.SLOTS). Hatchlings' small versions come after, from
tools/game_art/small_items.py.

A grid file: comment lines starting "# ", one line per colour ("K #1b1420"; "." is always see-through), a line "--",
then the rows, one character per pixel:

    # Frog friend: a little frog sitting on the head
    K #1b1420
    G #63c74d
    --
    ....................
    ...

    .venv/Scripts/python.exe tools/game_art/new_items.py check               every grid the right size, known colours
    .venv/Scripts/python.exe tools/game_art/new_items.py preview [slot] OUT   a sheet to look at (shirts also on creatures)
    .venv/Scripts/python.exe tools/game_art/new_items.py build [--aseprite]   write the PNGs (and the .aseprite sources)
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
GRIDS = ROOT / "game" / "art-src" / "item" / "grids"
OUT = ROOT / "web" / "game-art" / "item"
SRC = ROOT / "game" / "art-src" / "item"
ASEPRITE = "C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
# Each slot's canvas and anchor (as data.SLOTS): the anchor sits on the creature's socket.
SLOTS = {"hat": ((20, 14), (10, 13)), "face": ((16, 8), (8, 4)), "neck": ((16, 10), (8, 1)),
         "held": ((12, 12), (6, 11)), "back": ((20, 20), (14, 19)), "shirt": ((16, 16), None)}


def hex_rgba(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16) if len(h) == 8 else 255)


def read(path: Path) -> tuple[dict, list[str], str]:
    """(palette letter -> RGBA, rows, its title) from a grid file."""
    pal, rows, title, body = {}, [], "", False
    for line in path.read_text(encoding="utf-8").splitlines():
        if body:
            if line.strip():
                rows.append(line.rstrip())
            continue
        if line.startswith("# "):
            title = title or line[2:].strip()
        elif line.strip() == "--":
            body = True
        elif line.strip():
            letter, colour = line.split()[:2]
            pal[letter] = hex_rgba(colour)
    return pal, rows, title


def grids(slot: str | None = None):
    for f in sorted(GRIDS.glob("*/*.txt")):
        if slot and f.parent.name != slot:
            continue
        yield f.parent.name, f.stem, f


def image(slot: str, path: Path) -> Image.Image:
    pal, rows, _ = read(path)
    (w, h), _ = SLOTS[slot]
    problems = []
    if len(rows) != h:
        problems.append(f"{len(rows)} rows, wants {h}")
    for y, r in enumerate(rows):
        if len(r) != w:
            problems.append(f"row {y} is {len(r)} wide, wants {w}")
        for ch in r:
            if ch != "." and ch not in pal:
                problems.append(f"row {y}: colour {ch!r} isn't listed")
    if problems:
        raise SystemExit(f"{slot}/{path.stem}: " + "; ".join(problems))
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != ".":
                im.putpixel((x, y), pal[ch])
    return im


_CELLS: dict[str, list[int]] = {}


def cell_of(beast: str) -> list[int]:
    """A creature's animation frame size and where its drawing sits in it ([w, h, x, y], beasts.js anims.cell)."""
    if not _CELLS:
        js = "import('./web/js/game/beasts.js').then((m) => console.log(JSON.stringify(Object.fromEntries(m.BEASTS.map((b) => [b.id, b.anims && b.anims.cell])))))"
        _CELLS.update(json.loads(subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True).stdout))
    return _CELLS[beast]


def on_creature(tile: Image.Image, beast: str) -> Image.Image:
    """A shirt tile on a creature's first idle frame, through its shirt mask (like render.js shirtedFrames: each mask
    pixel names the drawing pixel it came from, red = x, green = y), the body's light and shade kept roughly."""
    folder = ROOT / "web" / "game-art" / "creature" / "beast" / beast
    cw, ch, _, _ = cell_of(beast)
    out = Image.open(folder / "idle.png").convert("RGBA").crop((0, 0, cw, ch))
    mask = Image.open(folder / "idle_shirt.png").convert("RGBA").crop((0, 0, cw, ch))
    body = out.copy()
    px, mp, tp = out.load(), mask.load(), tile.load()
    for y in range(ch):
        for x in range(cw):
            mr, mg, _, ma = mp[x, y]
            if not ma or not tp[mr % tile.width, mg % tile.height][3]:
                continue
            r, g, b, _ = body.getpixel((x, y))
            f = max(0.6, min(1.35, (0.299 * r + 0.587 * g + 0.114 * b) / 140))
            tr, tg, tb, _ = tp[mr % tile.width, mg % tile.height]
            px[x, y] = (min(255, int(tr * f)), min(255, int(tg * f)), min(255, int(tb * f)), 255)
    canvas = Image.new("RGBA", (64, 64))
    canvas.alpha_composite(out, (max(0, (64 - cw) // 2), max(0, 64 - ch)))
    return canvas


def preview(slot: str | None, out_path: str) -> None:
    items = list(grids(slot))
    sc = 6
    font = ImageFont.truetype("arial.ttf", 13)
    cells = []
    for s, name, f in items:
        im = image(s, f)
        (w, h), anchor = SLOTS[s]
        if s == "shirt":
            tiled = Image.new("RGBA", (w * 3, h * 3))
            for j in range(3):
                for i in range(3):
                    tiled.paste(im, (i * w, j * h))
            pics = [tiled.resize((w * 3 * 3, h * 3 * 3), Image.NEAREST)]
            for beast in ("cat", "chick", "forest_deer"):
                pics.append(on_creature(im, beast).resize((64 * 3, 64 * 3), Image.NEAREST))
            cell = Image.new("RGBA", (sum(p.width for p in pics) + 10 * len(pics), max(p.height for p in pics) + 24), (48, 40, 66, 255))
            x = 4
            for p in pics:
                cell.alpha_composite(p, (x, 20))
                x += p.width + 10
        else:
            big = im.resize((w * sc, h * sc), Image.NEAREST)
            cell = Image.new("RGBA", (max(w * sc + 8, 150), h * sc + 28), (48, 40, 66, 255))
            cell.alpha_composite(big, (4, 22))
            d = ImageDraw.Draw(cell)
            ax, ay = anchor
            d.rectangle([4 + ax * sc + sc // 2 - 2, 22 + ay * sc + sc // 2 - 2, 4 + ax * sc + sc // 2 + 1, 22 + ay * sc + sc // 2 + 1], outline=(255, 60, 60, 255))
        ImageDraw.Draw(cell).text((4, 2), f"{s}/{name}", fill=(255, 210, 120, 255), font=font)
        cells.append(cell)
    cols = 2 if slot == "shirt" else 5
    cw = max(c.width for c in cells) + 8
    ch = max(c.height for c in cells) + 8
    sheet = Image.new("RGBA", (cw * min(cols, len(cells)), ch * ((len(cells) + cols - 1) // cols)), (30, 26, 40, 255))
    for i, c in enumerate(cells):
        sheet.alpha_composite(c, ((i % cols) * cw + 4, (i // cols) * ch + 4))
    sheet.save(out_path)
    print(f"{len(cells)} items -> {out_path}")


def lua_for(slot: str, name: str, im: Image.Image) -> str:
    """Aseprite script lines that make the item pixel by pixel and save its source and its PNG."""
    w, h = im.size
    ase = (SRC / slot / f"{name}.aseprite").as_posix()
    png = (OUT / slot / f"{name}.png").as_posix()
    lines = [f"do local s = Sprite({w}, {h}, ColorMode.RGB) local img = s.cels[1].image"]
    for y in range(h):
        for x in range(w):
            r, g, b, a = im.getpixel((x, y))
            if a:
                lines.append(f"img:drawPixel({x}, {y}, app.pixelColor.rgba({r}, {g}, {b}, {a}))")
    lines.append(f's:saveAs("{ase}") s:saveCopyAs("{png}") s:close() end')
    return "\n".join(lines)


def build(aseprite: bool) -> None:
    lua = []
    for slot, name, f in grids():
        im = image(slot, f)
        (OUT / slot).mkdir(parents=True, exist_ok=True)
        if aseprite:
            (SRC / slot).mkdir(parents=True, exist_ok=True)
            lua.append(lua_for(slot, name, im))
        else:
            im.save(OUT / slot / f"{name}.png")
    if lua:
        script = GRIDS / "_place.lua"
        script.write_text("\n".join(lua), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        script.unlink()
    print(f"{sum(1 for _ in grids())} items written" + (" (placed in Aseprite, sources saved)" if aseprite else ""))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "check":
        for s, n, f in grids():
            image(s, f)
        print("all grids fine")
    elif cmd == "preview":
        args = [a for a in sys.argv[2:]]
        slot = args[0] if len(args) > 1 else None
        preview(slot, args[-1])
    elif cmd == "build":
        build("--aseprite" in sys.argv)
