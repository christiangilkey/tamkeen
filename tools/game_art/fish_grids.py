"""Fishing art, designed as text grids and drawn in Aseprite through the Aseprite MCP (the pixel-plugin).

Each picture is designed pixel by pixel as a text grid in game/art-src/fish/grids/<name>.txt (the same format as
game/art-src/item/grids: a comment, a palette of "LETTER #rrggbb" lines, "--", then the rows; "." is empty). This
tool does NOT make the art: it only helps whoever draws it.

    python tools/game_art/fish_grids.py preview OUT.png [name ...]   a check sheet, 8x, on water (all grids if none named)
    python tools/game_art/fish_grids.py pixels NAME                  the grid as the pixel list draw_pixels takes (JSON)
    python tools/game_art/fish_grids.py check [name ...]             is each exported PNG the same as its grid, pixel for pixel?

Where the PNGs go: fish (24x16, facing right) and the pond's own pieces in web/game-art/fish/<name>.png; a grid whose
first line says "# icon: ..." is a 16x16 icon and goes in web/game-art/icon/<name>.png. Aseprite sources:
game/art-src/fish/<name>.aseprite.
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GRIDS = ROOT / "game" / "art-src" / "fish" / "grids"
ART = ROOT / "web" / "game-art"


def read(name):
    """A grid file: (comment, {letter: (r, g, b, a)}, rows)."""
    lines = (GRIDS / f"{name}.txt").read_text(encoding="utf-8").splitlines()
    comment = lines[0][1:].strip() if lines and lines[0].startswith("#") else ""
    cut = lines.index("--")
    palette = {}
    for line in lines[:cut]:
        if not line.strip() or line.startswith("#"):
            continue
        letter, colour = line.split()
        c = colour.lstrip("#")
        palette[letter] = tuple(int(c[i:i + 2], 16) for i in range(0, len(c), 2)) + ((255,) if len(c) == 6 else ())
    rows = [r for r in lines[cut + 1:] if r.strip()]
    width = len(rows[0])
    for i, r in enumerate(rows):
        if len(r) != width:
            raise SystemExit(f"{name}: row {i} is {len(r)} wide, not {width}")
        for ch in r:
            if ch != "." and ch not in palette:
                raise SystemExit(f"{name}: row {i} uses '{ch}', which the palette doesn't have")
    return comment, palette, rows


def image(name):
    _, palette, rows = read(name)
    im = Image.new("RGBA", (len(rows[0]), len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                im.putpixel((x, y), palette[ch])
    return im


def target(name):
    comment, _, _ = read(name)
    return ART / ("icon" if comment.startswith("icon:") else "fish") / f"{name}.png"


def names(args):
    return args or sorted(p.stem for p in GRIDS.glob("*.txt"))


def preview(out, which):
    scale = 8
    pics = [(n, image(n)) for n in which]
    cell_w = max(im.width for _, im in pics) * scale + 16
    cell_h = max(im.height for _, im in pics) * scale + 16
    cols = min(6, len(pics))
    rows = -(-len(pics) // cols)
    sheet = Image.new("RGBA", (cols * cell_w, rows * cell_h * 2), (13, 51, 88, 255))
    for i, (_, im) in enumerate(pics):
        big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        x, y = (i % cols) * cell_w + 8, (i // cols) * cell_h * 2 + 8
        sheet.alpha_composite(big, (x, y))
        # ...and at its real size and twice it, on a dark panel, as it shows in the app
        panel = Image.new("RGBA", (cell_w - 16, cell_h - 8), (29, 24, 48, 255))
        panel.alpha_composite(im, (6, 6))
        panel.alpha_composite(im.resize((im.width * 2, im.height * 2), Image.NEAREST), (im.width + 14, 6))
        panel.alpha_composite(im.resize((im.width * 4, im.height * 4), Image.NEAREST), (im.width * 3 + 22, 6))
        sheet.alpha_composite(panel, (x, y + cell_h))
    sheet.save(out)
    print(f"{out}: {', '.join(n for n, _ in pics)}")


def pixels(name):
    _, palette, rows = read(name)
    out = []
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                out.append({"x": x, "y": y, "color": "#%02x%02x%02x" % palette[ch][:3]})
    print(json.dumps(out, separators=(",", ":")))


def check(which):
    bad = 0
    for n in which:
        want = image(n)
        path = target(n)
        if not path.exists():
            print(f"{n}: no picture yet ({path.relative_to(ROOT)})")
            bad += 1
            continue
        got = Image.open(path).convert("RGBA")
        if got.size != want.size:
            print(f"{n}: {got.size} but the grid is {want.size}")
            bad += 1
            continue
        diff = sum(1 for a, b in zip(got.getdata(), want.getdata()) if (a if a[3] else (0, 0, 0, 0)) != (b if b[3] else (0, 0, 0, 0)))
        if diff:
            print(f"{n}: {diff} pixels differ from the grid")
            bad += 1
    print("all the same as their grids" if not bad else f"{bad} to look at")
    return bad


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "preview":
        preview(sys.argv[2], names(sys.argv[3:]))
    elif cmd == "pixels":
        pixels(sys.argv[2])
    elif cmd == "check":
        sys.exit(1 if check(names(sys.argv[2:])) else 0)
    else:
        print(__doc__)
