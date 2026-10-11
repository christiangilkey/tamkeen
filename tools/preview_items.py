"""Draw every wearable item on every body plan and size, to check that items sit where they should.

    .venv/Scripts/python tools/preview_items.py [slot]        (slot: hat, face, neck, held, back; default all)

Writes game/art-preview/items-on-creatures-<slot>.png. It follows web/js/game/render.js step for
step (same sockets, same order), reading the numbers from web/js/game/data.js, so what it shows is
what the app shows.
"""

from __future__ import annotations

import colorsys
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "web" / "game-art"
FRAME = 88
SEEDS = {"quad": 1, "floater": 4, "blob": 7, "biped": 12}

EXPORT = """
Promise.all([import('./web/js/game/data.js'), import('./web/js/game/genome.js')]).then(([d, g]) => {
  const looks = {};
  for (const [sp, seed] of Object.entries(%s)) for (const [size, growth] of [['s', 0.1], ['m', 0.5], ['l', 0.9]]) {
    const c = g.newGenome(seed); c.growth = growth; if (growth > 0.7) { c.branch = 'echo'; c.branches = ['echo']; }
    looks[sp + '_' + size] = g.describe(c);
  }
  console.log(JSON.stringify({ SIZES: d.SIZES, HEAD: d.HEAD, PART: d.PART, SLOTS: d.SLOTS, SPECIES: d.SPECIES, KEY: d.KEY, ITEMS: d.ITEMS, HANDS: d.HANDS, looks }));
});
"""


def hsl_to_rgb(text: str) -> tuple[int, int, int]:
    h, s, l = (float(x) for x in re.findall(r"[\d.]+", text)[:3])
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, l / 100, s / 100)
    return round(r * 255), round(g * 255), round(b * 255)


def hex_to_rgb(text: str) -> tuple[int, int, int]:
    return tuple(int(text[i:i + 2], 16) for i in (1, 3, 5))


def recolor(img: Image.Image, cmap: dict) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in cmap:
                px[x, y] = (*cmap[(r, g, b)], a)
    return img


def compose(d: dict, look: dict, equipped: dict) -> Image.Image:
    S = d["SIZES"][look["size"]]
    plan = d["SPECIES"][look["species"]]
    cmap = {}
    for group in ("primary", "secondary", "accent"):
        for key, to in zip(d["KEY"][group], look["colors"][group]):
            cmap[hex_to_rgb(key)] = hsl_to_rgb(to)

    def part(file):
        p = ART / file
        return recolor(Image.open(p), cmap) if p.exists() else None

    def item(slot):
        p = ART / "item" / f"{equipped[slot]}.png" if equipped.get(slot) and slot != "shirt" else None
        return Image.open(p).convert("RGBA") if p and p.exists() else None

    suffix = f"_{look['branch']}" if look.get("branch") else ""
    canvas = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    leg_h = S["leg"][1] - 1 if plan["legs"] else 0
    tx = round((FRAME - S["torso"][0]) / 2) - 3
    ty = FRAME - leg_h - S["torso"][1] - plan.get("hover", 0)

    def at(img, socket, anchor, dx=0, dy=0):
        if img:
            canvas.alpha_composite(img, (tx + socket[0] - anchor[0] + dx, ty + socket[1] - anchor[1] + dy))

    def nudge(slot):
        it = next((i for i in d["ITEMS"] if i["id"] == equipped.get(slot)), None) or {}
        a, b = it.get("shift", [0, 0]), it.get("offset", {}).get(look["size"], [0, 0])
        return [a[0] + b[0], a[1] + b[1]]

    P, SL, H = d["PART"], d["SLOTS"], d["HEAD"]
    if "back" in SL:
        at(item("back"), S["back"], SL["back"]["anchor"], *nudge("back"))
    if look["tail"] != "none":
        at(part(f"creature/tail/{look['tail']}.png"), S["tail"], P["tail"]["anchor"])
    if look["back"] != "none":
        at(part(f"creature/back/{look['back']}.png"), S["back"], P["back"]["anchor"])
    if plan["wings"]:
        w = part(f"creature/wing/{look['species']}_{look['size']}_a.png")
        at(w, S["back"], [w.width - 2, w.height - 1])
    if plan["legs"]:
        leg = part(f"creature/leg/{look['species']}_{look['size']}_b.png")
        at(leg, S["legB"], [leg.width // 2, 1])
    torso = part(f"creature/torso/{look['species']}_{look['size']}{suffix}.png")
    if equipped.get("shirt") and (ART / "item" / f"{equipped['shirt']}.png").exists():
        tile = Image.open(ART / "item" / f"{equipped['shirt']}.png").convert("RGBA")
        tp, px = tile.load(), torso.load()
        line = hex_to_rgb(d["KEY"]["outline"])
        for y in range(round(torso.height * 0.18), round(torso.height * 0.8)):
            for x in range(torso.width):
                r, g, b, a = px[x, y]
                t = tp[x % tile.width, y % tile.height]
                if a and (r, g, b) != line and t[3]:
                    px[x, y] = (t[0], t[1], t[2], a)
    canvas.alpha_composite(torso, (tx, ty))
    if plan["legs"]:
        leg = part(f"creature/leg/{look['species']}_{look['size']}_a.png")
        at(leg, S["legF"], [leg.width // 2, 1])
    if plan["arms"]:
        arm = part(f"creature/arm/{look['species']}_{look['size']}.png")
        at(arm, S["arm"], [arm.width // 2, 1])
    hx = tx + S["neck"][0] - H["neck"][0]
    hy = ty + S["neck"][1] - H["neck"][1]

    def on(img, socket, anchor, dx=0, dy=0):
        if img:
            canvas.alpha_composite(img, (hx + socket[0] - anchor[0] + dx, hy + socket[1] - anchor[1] + dy))

    ear = part(f"creature/ear/{look['ear']}.png") if look["ear"] != "none" else None
    on(ear, H["earB"], P["ear"]["anchor"])
    canvas.alpha_composite(part(f"creature/head/{look['species']}{suffix}.png"), (hx, hy))
    on(part(f"creature/eyes/{look['eyes']}_open.png"), H["eye"], P["eyes"]["anchor"])
    on(part("creature/mouth/neutral.png"), H["mouth"], P["mouth"]["anchor"])
    on(ear, H["earF"], P["ear"]["anchor"])
    if look["horn"] != "none":
        on(part(f"creature/horn/{look['horn']}.png"), H["horn"], P["horn"]["anchor"])
    n = nudge("neck")
    at(item("neck"), S["neck"], SL["neck"]["anchor"], n[0], 1 + n[1])
    at(item("held"), d["HANDS"][look["species"]][look["size"]], SL["held"]["anchor"], *nudge("held"))
    on(item("face"), H["face"], SL["face"]["anchor"], *nudge("face"))
    on(item("hat"), H["hat"], SL["hat"]["anchor"], *nudge("hat"))
    return canvas


def main() -> None:
    script = EXPORT % json.dumps(SEEDS)
    d = json.loads(subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    want = sys.argv[1] if len(sys.argv) > 1 else None
    bodies = [f"{sp}_{size}" for sp in SEEDS for size in "sml"]
    for slot in d["SLOTS"]:
        if want and slot != want:
            continue
        items = [i for i in d["ITEMS"] if i["slot"] == slot and (ART / "item" / f"{i['id']}.png").exists()]
        if len(sys.argv) > 2:
            items = [i for i in items if i["id"].split("/")[1] in sys.argv[2:]]
        if not items:
            continue
        scale = 3
        sheet = Image.new("RGBA", (len(bodies) * FRAME, len(items) * FRAME), (143, 183, 224, 255))
        for row, it in enumerate(items):
            for col, body in enumerate(bodies):
                sheet.alpha_composite(compose(d, d["looks"][body], {slot: it["id"]}), (col * FRAME, row * FRAME))
        out = ROOT / "game" / "art-preview" / f"items-on-creatures-{slot}.png"
        sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST).save(out)
        print(out.name, f"{len(items)} items x {len(bodies)} bodies")


if __name__ == "__main__":
    main()
