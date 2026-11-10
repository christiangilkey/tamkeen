"""The hand-designed creatures: their frame animations into the game's art and web/js/game/beasts.js, and checks.

Each creature has a folder game/art-src-16bit/creatures/<id>/ holding its finished drawing (a grid of
colour letters, `art`), a rig.json with what the game needs to know about it, and its animations (anim.json and
a parts grid: tools/game_art/anim.py, guide creatures/ANIM_GUIDE.md):

    {
      "id": "chick", "name": "Phoenix chick", "type": "ember", "set": "original", "plan": "biped",
      "art": "_ff1.txt", "palette": "4=#200808 1=#ffb43c ...",
      "head":       polygon(s)  - the head: pixels the blink stamps belong to; not body for the shirt
      "legs_back":  polygon(s)  - the far legs (or null): not body for the shirt
      "legs_front": polygon(s)  - the near legs (or null): not body for the shirt
      "blink": [{"at": [x, y], "rows": ["..44..", ...]}]  - pixels painted over the head for shut eyes ('.' = leave)
      "sockets": {"hat": [x, y], "face": [x, y], "neck": [x, y], "held": [x, y], "back": [x, y]},
                                  - a socket may have a third number, an angle: [x, y, degrees], clockwise; the
                                    item is turned about its anchor by that much (nearest pixel: rotated()); each
                                    animation frame moves the sockets with the parts they ride (anim.py)
      "shirt": {"box": [x0, y0, x1, y1], "letters": "123"} or null  - which body pixels a shirt covers
                                  (and "not": polygon(s) inside the box it leaves alone, if need be)
      "hover": 0                - pixels a floater stays off the ground
      "wings": true             - only for a creature drawn with wings of its own: it wears nothing on its back
                                  (data.canWear) and it flies (anim.py); leave it out otherwise
    }

A creature also has rig_hatchling.json (same fields, its baby drawing, with anim_hatchling.json): the game shows it
while the creature is a hatchling (game art in creature/beast/<id>/hatchling/).

A polygon is a list of [x, y] corners in pixel units; a pixel belongs to it when its centre is inside.
"head" etc. may also be a list of polygons.

    .venv/Scripts/python tools/game_art/beasts.py preview chick     its check sheet (_rig_preview.png)
    .venv/Scripts/python tools/game_art/beasts.py build             every creature: game art + web/js/game/beasts.js
    .venv/Scripts/python tools/game_art/beasts.py build --aseprite  also <id>.aseprite / <id>_hatchling.aseprite,
                                                                     every frame with a tag per animation
"""

from __future__ import annotations

import colorsys
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import anim  # noqa: E402  (the frame animations; it imports this file back, which is fine: it only uses its functions)

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "game" / "art-src-16bit" / "creatures"
OUT = ROOT / "web" / "game-art" / "creature" / "beast"
JS = ROOT / "web" / "js" / "game" / "beasts.js"
ITEMS = ROOT / "web" / "game-art" / "item"
ASEPRITE = "C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
FRAME = 88  # must match render.js
SLOTS = {"hat": (10, 13), "face": (8, 4), "neck": (8, 1), "held": (6, 11), "back": (14, 19)}  # anchors, as data.js
ORDER = ["ember", "tide", "grove", "spark", "stone", "dusk"]
SETS = ["original", "cyberpunk", "fantasy"]
LAYERS = ["body", "head", "legs_back", "legs_front"]


def hexrgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


RIGS = {"juvenile": "rig.json", "hatchling": "rig_hatchling.json"}  # a creature's two looks: grown and baby


def load(cid: str, form: str = "juvenile") -> tuple[dict, list[str], dict]:
    folder = SRC / cid
    rig = json.loads((folder / RIGS[form]).read_text(encoding="utf-8"))
    rows = [r for r in (folder / rig["art"]).read_text(encoding="utf-8").split() if r]
    pal = {k: hexrgb(v) for k, v in (t.split("=") for t in rig["palette"].split())}
    missing = {ch for r in rows for ch in r if ch != "." and ch not in pal}
    if missing:
        raise SystemExit(f"{cid}: letters with no colour in the palette: {''.join(sorted(missing))}")
    return rig, rows, pal


def polys(v) -> list[list[tuple[float, float]]]:
    if not v:
        return []
    return [v] if isinstance(v[0][0], (int, float)) else v


def inside(poly, x: float, y: float) -> bool:
    n, hit = len(poly), False
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            hit = not hit
    return hit


def cut(rig: dict, rows: list[str]) -> dict[str, dict[tuple[int, int], str]]:
    """Each pixel goes to exactly one layer: near legs, far legs, head, or else the body."""
    layers = {name: {} for name in LAYERS}
    regions = [(n, polys(rig.get(n))) for n in ("legs_front", "legs_back", "head")]
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            to = "body"
            for name, ps in regions:
                if any(inside(p, x + 0.5, y + 0.5) for p in ps):
                    to = name
                    break
            layers[to][(x, y)] = ch
    blink = dict(layers["head"])
    for st in rig.get("blink", []):
        x0, y0 = st["at"]
        for dy, line in enumerate(st["rows"]):
            for dx, ch in enumerate(line):
                if ch != ".":
                    blink[(x0 + dx, y0 + dy)] = ch
    layers["blink"] = blink
    return layers


def rotated(im: Image.Image, anchor, deg: float):
    """Item picture `im` turned `deg` degrees clockwise about its anchor pixel, taking the nearest pixel, so it
    stays crisp. Returns (picture, its anchor). render.js turnPixels does the same, pixel for pixel."""
    if not deg:
        return im, tuple(anchor)
    ax, ay = anchor
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    w, h = im.size
    r = math.ceil(max(math.hypot(x - ax, y - ay) for x in (0, w) for y in (0, h)))
    size = 2 * r + 1
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    src, dst = im.load(), out.load()
    for j in range(size):
        for i in range(size):
            dx, dy = i - r, j - r
            sx, sy = math.floor(ax + 0.5 + dx * c + dy * s), math.floor(ay + 0.5 - dx * s + dy * c)
            if 0 <= sx < w and 0 <= sy < h:
                dst[i, j] = src[sx, sy]
    return out, (r, r)


def shirt_mask(rig: dict, layers) -> set[tuple[int, int]]:
    s = rig.get("shirt")
    if not s:
        return set()
    x0, y0, x1, y1 = s["box"]
    skip = polys(s.get("not"))  # an area inside the box the shirt leaves alone (the firefly's front shell)
    return {p for p, ch in layers["body"].items() if ch in s["letters"] and x0 <= p[0] <= x1 and y0 <= p[1] <= y1
            and not any(inside(q, p[0] + 0.5, p[1] + 0.5) for q in skip)}


def image(px: dict, pal: dict, w: int, h: int) -> Image.Image:
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for (x, y), ch in px.items():
        if 0 <= x < w and 0 <= y < h:
            im.putpixel((x, y), pal[ch] + (255,))
    return im


def bbox(rows: list[str]) -> list[int]:
    xs = [x for r in rows for x, ch in enumerate(r) if ch != "."]
    ys = [y for y, r in enumerate(rows) if any(ch != "." for ch in r)]
    return [min(xs), min(ys), max(xs), max(ys)]


def origin(box: list[int], hover: int) -> tuple[int, int]:
    """Where the art's top-left corner goes in the frame: centred, standing on the bottom edge. (Halves round up, as
    render.js beastOrigin's Math.round does: Python's round() would take 12.5 to 12.)"""
    return math.floor(FRAME / 2 - (box[0] + box[2] + 1) / 2 + 0.5), FRAME - (box[3] + 1) - hover


def body_hue(pal: dict) -> int:
    r, g, b = (c / 255 for c in pal.get("2", pal.get("1", (128, 128, 128))))
    return round(colorsys.rgb_to_hls(r, g, b)[0] * 360)


# ---------- the preview sheet ----------

def shade(lum: float, mid: float) -> float:
    """render.js shirtShade: how much a shirt pixel is lit, the body's brightness there against the torso's middle tone."""
    return max(0.6, min(1.35, lum / (mid or 1)))


def compose_frames(look: dict, folder: Path, name: str = "idle", frame: int = 0, *, shut=False, items=None,
                   shirt: Image.Image | None = None) -> Image.Image:
    """One frame as the game draws a creature (render.js composeCreature):
    `look` is what build() gathers for one look (box, hover, shirt, sockets, anims), `folder` where its frames are.
    Items are drawn at their sockets moved by the frame's offsets (no item shift: the preview's items have none)."""
    a = look["anims"]
    cw, ch, cx, cy = a["cell"]
    an = a[name]
    ox, oy = origin(look["box"], look["hover"])
    sheet = Image.open(folder / f"{name}.png").convert("RGBA")
    lum = lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]  # noqa: E731
    if shirt is not None and look["shirt"]:  # render.js shirtedFrames / torsoTone
        rest, rmask = Image.open(folder / "idle.png").convert("RGBA"), Image.open(folder / "idle_shirt.png").convert("RGBA")
        under = sorted(lum(rest.getpixel((x, y))) for y in range(ch) for x in range(cw) if rmask.getpixel((x, y))[3])
        mid = under[len(under) >> 1] if under else 1
        mask = Image.open(folder / f"{name}_shirt.png").convert("RGBA")
        for y in range(mask.height):
            for x in range(mask.width):
                m = mask.getpixel((x, y))
                if not m[3]:
                    continue
                tp = shirt.getpixel((m[0] % shirt.width, m[1] % shirt.height))
                if not tp[3]:
                    continue
                p = sheet.getpixel((x, y))
                f = shade(lum(p), mid)
                sheet.putpixel((x, y), tuple(min(255, math.floor(v * f + 0.5)) for v in tp[:3]) + (p[3],))  # (as Math.round)
    out = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))

    def put(im, x, y, under=False):
        layer = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
        layer.paste(im, (x, y), im)
        return Image.alpha_composite(layer, out) if under else Image.alpha_composite(out, layer)

    out = put(sheet.crop((frame * cw, 0, frame * cw + cw, ch)), ox - cx, oy - cy)
    if shut:
        out = put(sheet.crop((frame * cw, ch, frame * cw + cw, 2 * ch)), ox - cx, oy - cy)
    for slot in ("back", "hat", "face", "neck", "held"):
        im = (items or {}).get(slot)
        if im is None:
            continue
        sx, sy, *turn = look["sockets"][slot]
        mx, my, *more = an["at"][slot][frame]  # (a third number: the frame turns it further)
        im, (ax, ay) = rotated(im, SLOTS[slot], (turn[0] if turn else 0) + (more[0] if more else 0))
        out = put(im, ox + sx - ax + mx, oy + sy - ay + my, under=slot == "back")  # (capes and packs behind)
    return out


def bbox_of(layers) -> list[int]:
    pts = [p for n in LAYERS for p in layers[n]]
    return [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]


def preview(cid: str, form: str = "juvenile") -> Path:
    """Its check sheet (_rig_preview.png): its parts, then as the game draws it: still, walking, the blink, asleep,
    dressed (cap, round glasses, scarf, book, red cape), dressed and walking, bat wings, a striped shirt, and flying
    if it has wings. The frames are made into a scratch folder (anim.write), not the game's art."""
    rig, rows, pal = load(cid, form)
    layers = cut(rig, rows)
    tmp = Path(tempfile.mkdtemp())
    try:
        anims = anim.write(cid, form, tmp)
        mask = shirt_mask(rig, layers)
        look = {"box": bbox_of(layers), "hover": rig.get("hover", 0), "shirt": bool(mask), "sockets": rig["sockets"], "anims": anims}
        item = lambda f: Image.open(ITEMS / f).convert("RGBA") if (ITEMS / f).exists() else None  # noqa: E731
        s = "small/" if form == "hatchling" else ""  # a baby wears the small versions, as in the game
        dressed = {"hat": item(f"{s}hat/cap.png"), "face": item(f"{s}face/round_glasses.png"), "neck": item(f"{s}neck/scarf.png"),
                   "held": item(f"{s}held/book.png"), "back": item(f"{s}back/cape_red.png")}
        frames = [
            ("still", compose_frames(look, tmp)),
            ("walking", compose_frames(look, tmp, "walk", 1)),
            ("walking", compose_frames(look, tmp, "walk", 4)),
            ("blink", compose_frames(look, tmp, shut=True)),
            ("asleep", compose_frames(look, tmp, "idle", 2, shut=True)),
            ("hat, glasses, scarf, book, cape", compose_frames(look, tmp, items=dressed)),
            ("same, walking", compose_frames(look, tmp, "walk", 4, items=dressed)),
            ("bat wings", compose_frames(look, tmp, items={"back": item(f"{s}back/bat_wings.png")})),
            ("shirt", compose_frames(look, tmp, shirt=item("shirt/striped.png"))),
        ]
        if "fly" in anims:
            frames.append(("flying", compose_frames(look, tmp, "fly", 2, items={k: v for k, v in dressed.items() if k != "back"})))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    # its parts (anim.py's parts grid, in anim.PART_COLOURS), the shirt area yellow
    tint = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    ox, oy = origin(bbox_of(layers), rig.get("hover", 0))
    prow = [r for r in (SRC / cid / anim.NAMES[form][1]).read_text(encoding="utf-8").split() if r]
    for y, row in enumerate(prow):
        for x, ch in enumerate(row):
            if ch != ".":
                c = (255, 220, 40) if (x, y) in mask else anim.PART_COLOURS.get(ch, (255, 255, 255))
                tint.putpixel((ox + x, oy + y), c + (255,))
    frames.insert(0, ("parts (shirt yellow)", tint))
    sc, pad = 3, 10
    font = ImageFont.truetype("arial.ttf", 13)
    sheet = Image.new("RGBA", (pad + len(frames) * (FRAME * sc + pad), FRAME * sc + 40), (48, 40, 66, 255))
    d = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(frames):
        x = pad + i * (FRAME * sc + pad)
        d.rectangle([x, 26, x + FRAME * sc - 1, 26 + FRAME * sc - 1], fill=(60, 52, 80, 255))
        d.line([x, 26 + FRAME * sc - 1, x + FRAME * sc - 1, 26 + FRAME * sc - 1], fill=(120, 110, 140, 255))
        sheet.alpha_composite(im.resize((FRAME * sc, FRAME * sc), Image.NEAREST), (x, 26))
        d.text((x, 6), label, fill=(255, 210, 120, 255), font=font)
    out = SRC / cid / ("_rig_preview.png" if form == "juvenile" else f"_rig_preview_{form}.png")
    sheet.save(out)
    return out


# ---------- the build ----------

def write_form(cid: str, form: str, aseprite: bool, lua: list) -> dict:
    """One look of a creature into the game's art: its frame animations (anim.write); returns what beasts.js says
    about it. With `aseprite`, adds the lines that save its .aseprite file to `lua`."""
    rig, rows, pal = load(cid, form)
    w, h = len(rows[0]), len(rows)
    layers = cut(rig, rows)
    if not (SRC / cid / anim.NAMES[form][0]).exists():
        raise SystemExit(f"{cid} {form}: no {anim.NAMES[form][0]}: every look is animated (creatures/ANIM_GUIDE.md)")
    folder = OUT / cid if form == "juvenile" else OUT / cid / form
    folder.mkdir(parents=True, exist_ok=True)
    for old in ("body", "head", "blink", "legs_back", "legs_front", "shirt"):  # (the cut layers the game used before)
        if (folder / f"{old}.png").exists():
            (folder / f"{old}.png").unlink()
    anims = anim.write(cid, form, folder, lua if aseprite else None)
    print(f"{cid} {form}: " + ", ".join(f"{k} {v['frames']}" for k, v in anims.items() if k != "cell"))
    return {"rig": rig, "pal": pal, "size": [w, h], "box": bbox_of(layers), "hover": rig.get("hover", 0),
            "shirt": bool(shirt_mask(rig, layers)), "sockets": rig["sockets"], "anims": anims}


def look_js(f: dict) -> str:
    so = ", ".join(f"{k}: [{', '.join(str(n) for n in v)}]" for k, v in f["sockets"].items())
    return (f'size: [{f["size"][0]}, {f["size"][1]}], box: [{", ".join(map(str, f["box"]))}], hover: {f["hover"]}, '
            f'shirt: {str(f["shirt"]).lower()},\n    sockets: {{ {so} }},\n    {anim.anim_js(f["anims"])}')


def build(aseprite: bool) -> None:
    ids = sorted(p.parent.name for p in SRC.glob("*/rig.json"))
    entries, lua = [], []
    for cid in ids:
        grown = write_form(cid, "juvenile", aseprite, lua)
        young = write_form(cid, "hatchling", aseprite, lua) if (SRC / cid / RIGS["hatchling"]).exists() else None
        if young is None and (OUT / cid / "hatchling").exists():
            for f in (OUT / cid / "hatchling").glob("*.png"):
                f.unlink()
        rig = grown["rig"]
        entries.append({"id": cid, "name": rig["name"], "type": rig["type"], "set": rig["set"], "plan": rig["plan"],
                        "wings": bool(rig.get("wings")), "hue": body_hue(grown["pal"]), "grown": grown, "young": young})
    entries.sort(key=lambda e: (ORDER.index(e["type"]), SETS.index(e["set"])))
    lines = ["// Made by tools/game_art/beasts.py from game/art-src-16bit/creatures/*/rig.json: don't edit by hand.",
             "// One entry per creature: its name, element and look (original, cyberpunk or fantasy), its body plan",
             "// (which sets its battle stats), `wings: true` when it is drawn with wings of its own (it wears nothing",
             "// on its back: data.canWear), the hue of its body, and for its juvenile look (and `young`, its",
             "// hatchling look, drawn from rig_hatchling.json): its drawing's size and the box its pixels fill, how",
             "// high a floater hovers, whether it can wear a shirt, and where worn things",
             "// sit (in its drawing's pixels; a third number is an angle: the item turned that many degrees clockwise).",
             "// `anims` (tools/game_art/anim.py): the size of a frame and where the drawing's top-left is in it, then",
             "// for idle, walk and (winged) fly: how many frames, each one's time in ms, and per frame how far each",
             "// socket has moved (the frames are <anim>.png: the frames on top, their eyelids below).",
             "export const BEASTS = ["]
    for e in entries:
        young = f"young: {{ {look_js(e['young'])} }}" if e["young"] else "young: null"
        wings = "wings: true, " if e["wings"] else ""
        lines.append(f'  {{ id: "{e["id"]}", name: "{e["name"]}", type: "{e["type"]}", set: "{e["set"]}", plan: "{e["plan"]}", '
                     f'{wings}hue: {e["hue"]},\n    {look_js(e["grown"])},\n    {young} }},')
    lines += ["];", ""]
    JS.write_text("\n".join(lines), encoding="utf-8", newline="\n")  # (LF, as committed)
    print(f"{len(entries)} creatures ({sum(1 for e in entries if e['young'])} with a hatchling look) -> "
          f"{OUT.relative_to(ROOT)} and {JS.relative_to(ROOT)}")
    if lua:
        script = SRC / "_build_aseprite.lua"
        script.write_text("\n".join(lua), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        script.unlink()
        print("an .aseprite file per look saved in each creature's folder (every frame, a tag per animation)")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "preview":
        form = "hatchling" if "--hatchling" in sys.argv else "juvenile"
        for c in [a for a in sys.argv[2:] if not a.startswith("--")]:
            print(preview(c, form))
    elif len(sys.argv) >= 2 and sys.argv[1] == "build":
        build("--aseprite" in sys.argv)
    else:
        print(__doc__)
