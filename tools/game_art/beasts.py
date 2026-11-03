"""Cut the hand-designed creatures into the layers the game animates, and check them.

Each creature has a folder game/art-src-16bit/creatures/<id>/ holding its finished drawing (a grid of
colour letters, `art`) and a rig.json that says how to cut it:

    {
      "id": "chick", "name": "Phoenix chick", "type": "ember", "set": "original", "plan": "biped",
      "art": "_ff1.txt", "palette": "4=#200808 1=#ffb43c ...",
      "head":       polygon(s)  - pixels inside move with the head (it dips when walking or asleep)
      "legs_back":  polygon(s)  - the far legs, drawn behind the body (or null)
      "legs_front": polygon(s)  - the near legs, drawn in front; they lift a pixel on the walk's second step
      "blink": [{"at": [x, y], "rows": ["..44..", ...]}]  - pixels painted over the head for shut eyes ('.' = leave)
      "sockets": {"hat": [x, y], "face": [x, y], "neck": [x, y], "held": [x, y], "back": [x, y]},
      "shirt": {"box": [x0, y0, x1, y1], "letters": "123"} or null  - which body pixels a shirt covers
      "hover": 0                - pixels a floater stays off the ground
    }

A creature may also have rig_hatchling.json (same fields, its baby drawing): the game shows it while the
creature is a hatchling (game art in creature/beast/<id>/hatchling/).

A polygon is a list of [x, y] corners in pixel units; a pixel belongs to it when its centre is inside.
"head" etc. may also be a list of polygons.

    .venv/Scripts/python tools/game_art/beasts.py preview chick     its preview sheet (_rig_preview.png)
    .venv/Scripts/python tools/game_art/beasts.py build             every creature: game art + web/js/game/beasts.js
    .venv/Scripts/python tools/game_art/beasts.py build --aseprite  also the layered .aseprite sources
"""

from __future__ import annotations

import colorsys
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

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


def shirt_mask(rig: dict, layers) -> set[tuple[int, int]]:
    s = rig.get("shirt")
    if not s:
        return set()
    x0, y0, x1, y1 = s["box"]
    return {p for p, ch in layers["body"].items() if ch in s["letters"] and x0 <= p[0] <= x1 and y0 <= p[1] <= y1}


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
    """Where the art's top-left corner goes in the frame: centred, standing on the bottom edge."""
    return round(FRAME / 2 - (box[0] + box[2] + 1) / 2), FRAME - (box[3] + 1) - hover


def body_hue(pal: dict) -> int:
    r, g, b = (c / 255 for c in pal.get("2", pal.get("1", (128, 128, 128))))
    return round(colorsys.rgb_to_hls(r, g, b)[0] * 360)


# ---------- the preview sheet ----------

def compose(rig, layers, pal, w, h, *, step=0, bob=0, shut=False, items=None, shirt=None) -> Image.Image:
    """One frame as the game draws it (render.js composeBeast)."""
    box = bbox_of(layers)
    ox, oy = origin(box, rig.get("hover", 0))
    f = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    items = items or {}
    so = rig["sockets"]

    def put(im, x, y):
        if im is not None:
            f.alpha_composite(im, (x, y)) if 0 <= x and 0 <= y else f.paste(im, (x, y), im)

    def item(slot, dy=0):
        im = items.get(slot)
        if im is None:
            return
        ax, ay = SLOTS[slot]
        put(im, ox + so[slot][0] - ax, oy + so[slot][1] - ay + dy)

    item("back")
    put(image(layers["legs_back"], pal, w, h), ox, oy)
    body = image(layers["body"], pal, w, h)
    if shirt is not None:
        for (x, y) in shirt_mask(rig, layers):
            body.putpixel((x, y), shirt.getpixel((x % shirt.width, y % shirt.height)))
    put(body, ox, oy)
    put(image(layers["legs_front"], pal, w, h), ox, oy - step)
    put(image(layers["blink" if shut else "head"], pal, w, h), ox, oy + bob)
    item("hat", bob)
    item("face", bob)
    item("neck")
    item("held", step)
    return f


def bbox_of(layers) -> list[int]:
    pts = [p for n in LAYERS for p in layers[n]]
    return [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]


def preview(cid: str, form: str = "juvenile") -> Path:
    rig, rows, pal = load(cid, form)
    w, h = len(rows[0]), len(rows)
    layers = cut(rig, rows)
    item = lambda f: Image.open(ITEMS / f).convert("RGBA") if (ITEMS / f).exists() else None  # noqa: E731
    s = "small/" if form == "hatchling" else ""  # a baby wears the small versions, as in the game
    dressed = {"hat": item(f"{s}hat/cap.png"), "face": item(f"{s}face/round_glasses.png"), "neck": item(f"{s}neck/scarf.png"),
               "held": item(f"{s}held/book.png"), "back": item(f"{s}back/cape_red.png")}
    frames = [
        ("still", compose(rig, layers, pal, w, h)),
        ("walk: head dips", compose(rig, layers, pal, w, h, bob=1)),
        ("walk: front legs lift", compose(rig, layers, pal, w, h, step=1, bob=1)),
        ("blink", compose(rig, layers, pal, w, h, shut=True)),
        ("asleep", compose(rig, layers, pal, w, h, bob=2, shut=True)),
        ("hat, glasses, scarf, book, cape", compose(rig, layers, pal, w, h, items=dressed)),
        ("same, walking", compose(rig, layers, pal, w, h, items=dressed, step=1, bob=1)),
        ("shirt", compose(rig, layers, pal, w, h, shirt=item("shirt/striped.png"))),
    ]
    # the cut itself: head red, far legs blue, near legs green, shirt yellow
    tint = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    ox, oy = origin(bbox_of(layers), rig.get("hover", 0))
    colours = {"head": (255, 60, 60), "legs_back": (70, 120, 255), "legs_front": (60, 220, 90), "body": (200, 200, 200)}
    sm = shirt_mask(rig, layers)
    for name, c in colours.items():
        for (x, y) in layers[name]:
            tint.putpixel((ox + x, oy + y), ((255, 220, 40) if (x, y) in sm else c) + (255,))
    frames.insert(0, ("the cut", tint))
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

def lua_for(cid: str, layers, pal, w, h, form: str = "juvenile") -> list[str]:
    out = [f"do local spr = Sprite({w}, {h}, ColorMode.RGB)", "spr.layers[1].name = 'body'"]
    names = ["body", "legs_back", "legs_front", "head", "blink"]
    for i, name in enumerate(names):
        if i:
            out.append(f"local L = spr:newLayer() L.name = '{name}'" + (" L.isVisible = false" if name == "blink" else ""))
            out.append("local cel = spr:newCel(L, 1) local img = cel.image")
        else:
            out.append("local img = spr.cels[1].image")
        for (x, y), ch in sorted(layers[name].items()):
            r, g, b = pal[ch]
            out.append(f"img:drawPixel({x},{y},Color{{r={r},g={g},b={b},a=255}})")
    # the far legs go under the body in the stack
    out.append("spr.layers[2].stackIndex = 1")
    path = (SRC / cid / (f"{cid}.aseprite" if form == "juvenile" else f"{cid}_{form}.aseprite")).as_posix()
    out.append(f'spr:saveAs("{path}") spr:close() end')
    return out


def write_form(cid: str, form: str, aseprite: bool, lua: list) -> dict:
    """Cut one look of a creature into its game layers; returns what beasts.js says about it."""
    rig, rows, pal = load(cid, form)
    w, h = len(rows[0]), len(rows)
    layers = cut(rig, rows)
    folder = OUT / cid if form == "juvenile" else OUT / cid / form
    folder.mkdir(parents=True, exist_ok=True)
    for name in ("body", "head", "blink", "legs_back", "legs_front"):
        path = folder / f"{name}.png"
        if layers[name] or name in ("body", "head", "blink"):
            image(layers[name], pal, w, h).save(path)
        elif path.exists():
            path.unlink()
    mask = shirt_mask(rig, layers)
    if mask:
        image({p: "x" for p in mask}, {"x": (255, 255, 255)}, w, h).save(folder / "shirt.png")
    elif (folder / "shirt.png").exists():
        (folder / "shirt.png").unlink()
    if aseprite:
        lua += lua_for(cid, layers, pal, w, h, form)
    print(f"{cid} {form}: {', '.join(f'{n} {len(layers[n])}' for n in LAYERS)}")
    return {"rig": rig, "pal": pal, "size": [w, h], "box": bbox_of(layers), "hover": rig.get("hover", 0),
            "legs": [n for n in ("legs_back", "legs_front") if layers[n]], "shirt": bool(mask), "sockets": rig["sockets"]}


def look_js(f: dict) -> str:
    so = ", ".join(f"{k}: [{v[0]}, {v[1]}]" for k, v in f["sockets"].items())
    return (f'size: [{f["size"][0]}, {f["size"][1]}], box: [{", ".join(map(str, f["box"]))}], hover: {f["hover"]}, '
            f'legs: {json.dumps(f["legs"])}, shirt: {str(f["shirt"]).lower()},\n    sockets: {{ {so} }}')


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
                        "hue": body_hue(grown["pal"]), "grown": grown, "young": young})
    entries.sort(key=lambda e: (ORDER.index(e["type"]), SETS.index(e["set"])))
    lines = ["// Made by tools/game_art/beasts.py from game/art-src-16bit/creatures/*/rig.json: don't edit by hand.",
             "// One entry per creature: its name, element and look (original, cyberpunk or fantasy), its body plan",
             "// (which sets its battle stats), the hue of its body, and for its juvenile look (and `young`, its",
             "// hatchling look, drawn from rig_hatchling.json): its drawing's size and the box its pixels fill, how",
             "// high a floater hovers, which leg layers it has, whether it can wear a shirt, and where worn things",
             "// sit (in its drawing's pixels).",
             "export const BEASTS = ["]
    for e in entries:
        young = f"young: {{ {look_js(e['young'])} }}" if e["young"] else "young: null"
        lines.append(f'  {{ id: "{e["id"]}", name: "{e["name"]}", type: "{e["type"]}", set: "{e["set"]}", plan: "{e["plan"]}", '
                     f'hue: {e["hue"]},\n    {look_js(e["grown"])},\n    {young} }},')
    lines += ["];", ""]
    JS.write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(entries)} creatures ({sum(1 for e in entries if e['young'])} with a hatchling look) -> "
          f"{OUT.relative_to(ROOT)} and {JS.relative_to(ROOT)}")
    if lua:
        script = SRC / "_build_aseprite.lua"
        script.write_text("\n".join(lua), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        script.unlink()
        print("layered .aseprite sources saved in each creature's folder")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "preview":
        form = "hatchling" if "--hatchling" in sys.argv else "juvenile"
        for c in [a for a in sys.argv[2:] if not a.startswith("--")]:
            print(preview(c, form))
    elif len(sys.argv) >= 2 and sys.argv[1] == "build":
        build("--aseprite" in sys.argv)
    else:
        print(__doc__)
