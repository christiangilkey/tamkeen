"""Look at the art without opening the app: contact sheets and assembled creatures.

    .venv/Scripts/python tools/game_art/preview.py ART_DIR SHEET_DIR

Creatures are assembled the same way web/js/game/render.js does it, in the same colours
web/js/game/genome.js gives them.
"""

from __future__ import annotations

import colorsys
import random
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from px import rgb  # noqa: E402

KEY = {"primary": ["#8fd3ff", "#4aa3e8", "#2f6fb8", "#1f4780"], "secondary": ["#fff1c9", "#f5cf7a", "#d49a3f"], "accent": ["#ff7a9c", "#d6456e"]}
TYPES = {"ember": ([8, 28], 48, False), "tide": ([195, 225], 170, False), "grove": ([95, 145], 55, False),
         "spark": ([45, 58], 275, False), "stone": ([20, 40], 190, True), "dusk": ([255, 300], 330, False)}
SIZES = {
    "s": dict(torso=(20, 16), neck=(12, 3), tail=(2, 10), back=(8, 2), arm=(13, 9), legF=(13, 15), legB=(6, 15), leg=(6, 5)),
    "m": dict(torso=(28, 24), neck=(18, 4), tail=(2, 15), back=(11, 3), arm=(19, 13), legF=(19, 23), legB=(8, 23), leg=(6, 8)),
    "l": dict(torso=(40, 36), neck=(27, 6), tail=(3, 23), back=(16, 4), arm=(28, 19), legF=(28, 35), legB=(11, 35), leg=(8, 12)),
}
HEAD = dict(neck=(13, 26), eye=(19, 14), mouth=(22, 21), earB=(8, 6), earF=(19, 5), horn=(14, 3))
PLAN = {"blob": (0, 0, 0, 0), "biped": (1, 1, 0, 0), "quad": (1, 0, 0, 0), "floater": (0, 0, 1, 5)}  # legs, arms, wings, hover
FRAME = 72


def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, max(0, min(100, l)) / 100, max(0, min(100, s)) / 100)
    return (round(r * 255), round(g * 255), round(b * 255))


def colors(kind, rnd):
    """The same formula as describe() in genome.js."""
    hues, accent, dull = TYPES[kind]
    hue = hues[0] + rnd.random() * (hues[1] - hues[0])
    sat = 14 + rnd.random() * 12 if dull else 46 + rnd.random() * 20
    light = (30 if 38 < hue < 75 else 24) + rnd.random() * 6
    belly = hue + (28 if rnd.random() < 0.5 else -28)
    return {
        "primary": [hsl(hue, sat + 14, light + 17), hsl(hue, sat, light), hsl(hue + 12, sat * 0.85, light - 9), hsl(hue + 26, sat * 0.7, light - 16)],
        "secondary": [hsl(belly, sat * 0.55, 66), hsl(belly, sat * 0.6, 50), hsl(belly, sat * 0.6, 35)],
        "accent": [hsl(accent, 100, 66), hsl(accent, 88, 44)],
    }


def load(art, file, cmap=None):
    img = Image.open(art / file).convert("RGBA")
    if cmap:
        px = img.load()
        for y in range(img.height):
            for x in range(img.width):
                r, g, b, a = px[x, y]
                if a and (r, g, b) in cmap:
                    px[x, y] = (*cmap[(r, g, b)], 255)
    return img


def compose(art, look, pose=None):
    pose = pose or {}
    S = SIZES[look["size"]]
    legs, arms, wings, hover = PLAN[look["species"]]
    cmap = {rgb(k): look["colors"][g][i] for g in KEY for i, k in enumerate(KEY[g])}
    part = lambda f: load(art, f, cmap)
    suffix = f"_{look['branch']}" if look.get("branch") else ""
    step = "b" if pose.get("step") else "a"
    torso = part(f"creature/torso/{look['species']}_{look['size']}{suffix}.png")
    if look.get("pattern"):
        tile = load(art, f"creature/pattern/{look['pattern']}.png").load()
        tp = torso.load()
        body = [look["colors"]["primary"][1], look["colors"]["primary"][2]]
        for y in range(torso.height):
            for x in range(torso.width):
                if tp[x, y][3] and tile[x % 16, y % 16][3] and tp[x, y][:3] in body:
                    tp[x, y] = (*look["colors"]["secondary"][1], 255)
    c = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    leg_h = S["leg"][1] - 1 if legs else 0
    tx = round((FRAME - S["torso"][0]) / 2) - 3
    ty = FRAME - leg_h - S["torso"][1] - hover
    at = lambda img, socket, anchor, dx=0, dy=0: c.alpha_composite(img, (tx + socket[0] - anchor[0] + dx, ty + socket[1] - anchor[1] + dy))
    if look.get("tail"):
        at(part(f"creature/tail/{look['tail']}.png"), S["tail"], (15, 8))
    if look.get("back"):
        at(part(f"creature/back/{look['back']}.png"), S["back"], (8, 15))
    if wings:
        w = part(f"creature/wing/{look['species']}_{look['size']}_{step}.png")
        at(w, S["back"], (w.width - 2, w.height - 1))
    other = "a" if step == "b" else "b"
    if legs:
        lb = part(f"creature/leg/{look['species']}_{look['size']}_{other}.png")
        at(lb, S["legB"], (lb.width // 2, 1))
    c.alpha_composite(torso, (tx, ty))
    if legs:
        la = part(f"creature/leg/{look['species']}_{look['size']}_{step}.png")
        at(la, S["legF"], (la.width // 2, 1))
    if arms:
        a = part(f"creature/arm/{look['species']}_{look['size']}.png")
        at(a, S["arm"], (a.width // 2, 1))
    hx, hy = tx + S["neck"][0] - HEAD["neck"][0], ty + S["neck"][1] - HEAD["neck"][1] + pose.get("bob", 0)
    on = lambda img, socket, anchor: c.alpha_composite(img, (hx + socket[0] - anchor[0], hy + socket[1] - anchor[1]))
    ear = part(f"creature/ear/{look['ear']}.png") if look.get("ear") else None
    if ear:
        on(ear, HEAD["earB"], (6, 13))
    c.alpha_composite(part(f"creature/head/{look['species']}{suffix}.png"), (hx, hy))
    on(part(f"creature/eyes/{look['eyes']}_{pose.get('eyes', 'open')}.png"), HEAD["eye"], (8, 4))
    on(part(f"creature/mouth/{pose.get('mouth', 'neutral')}.png"), HEAD["mouth"], (4, 3))
    if ear:
        on(ear, HEAD["earF"], (6, 13))
    if look.get("horn"):
        on(part(f"creature/horn/{look['horn']}.png"), HEAD["horn"], (6, 11))
    return c


def sheet(images, cols, scale, bg=(30, 22, 52), pad=4, cell=None):
    cw = cell[0] if cell else max(i.width for i in images)
    ch = cell[1] if cell else max(i.height for i in images)
    rows = (len(images) + cols - 1) // cols
    out = Image.new("RGBA", (cols * (cw + pad) + pad, rows * (ch + pad) + pad), (*bg, 255))
    for n, img in enumerate(images):
        x = pad + (n % cols) * (cw + pad) + (cw - img.width) // 2
        y = pad + (n // cols) * (ch + pad) + (ch - img.height)
        tile = Image.new("RGBA", img.size, (bg[0] + 14, bg[1] + 14, bg[2] + 18, 255))
        out.alpha_composite(tile, (x, y))
        out.alpha_composite(img, (x, y))
    return out.resize((out.width * scale, out.height * scale), Image.NEAREST)


def folder_sheet(art, sub, cols, scale, **kw):
    files = sorted((art / sub).glob("*.png"))
    return sheet([Image.open(f).convert("RGBA") for f in files], cols, scale, **kw)


def creatures(art, seed=7):
    rnd = random.Random(seed)
    ears = ["round", "point", "long", "floppy", "fin", "leaf", "tuft", None]
    tails = ["nub", "curl", "fluff", "spike", "fish", "leaf", "bolt", None]
    horns = [None, "nub", "pair", "antenna", "crest", "gem"]
    backs = [None, "spikes", "shell", "fin", "sprout", "flame"]
    eyes = ["dot", "round", "oval", "sleepy", "star", "wide"]
    pats = [None, None, "spots", "stripes", "patch", "speckle", "rings"]
    kinds = list(TYPES)
    out = []
    n = 0
    for sp in PLAN:
        for size, br in (("s", None), ("m", None), ("l", "echo"), ("l", "sage"), ("l", "keeper"), ("l", None)):
            look = dict(species=sp, size=size, branch=br, colors=colors(kinds[n % 6], rnd), ear=ears[n % 8], tail=tails[(n * 3) % 8],
                        eyes=eyes[n % 6], pattern=pats[n % 7], horn=None if size == "s" else horns[n % 6], back=backs[n % 6] if size == "l" else None)
            pose = [{}, {"eyes": "happy", "mouth": "smile"}, {"step": 1, "eyes": "blink"}, {"eyes": "sad", "mouth": "sad"}][n % 4]
            out.append(compose(art, look, pose))
            n += 1
    return sheet(out, 6, 4, cell=(FRAME, FRAME), pad=2)


if __name__ == "__main__":
    art, dest = Path(sys.argv[1]), Path(sys.argv[2])
    dest.mkdir(parents=True, exist_ok=True)
    which = sys.argv[3:] or ["creatures"]
    for w in which:
        if w == "creatures":
            creatures(art).save(dest / "creatures.png")
        else:
            sub, cols, scale = w.split(":")
            folder_sheet(art, sub, int(cols), int(scale)).save(dest / (sub.replace("/", "_") + ".png"))
    print("sheets in", dest)
