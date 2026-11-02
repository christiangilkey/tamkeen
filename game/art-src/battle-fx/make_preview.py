"""Preview of the exported battle effects (reads web/game-art/battle/fx/*.png, so it shows what the game gets).

    _preview_sheet.png  every frame of every effect, 3x, over changing ground colours
    _preview.gif        everything playing at its real speed on a patchwork of ground, with creatures for scale

Run through build_fx.py:  .venv/Scripts/python game/art-src/battle-fx/build_fx.py preview
"""
from __future__ import annotations

import math
import random
from functools import lru_cache

from PIL import Image, ImageDraw

from build_fx import ELEMENTS, HERE, KINDS, OUT, ROOT, SHARED, STATUS, STATUS_SPEC
from preview import GROUNDS, ground, scale

CREATURES = ROOT / "game" / "art-src-16bit" / "creatures"
PICK = {"ember": "chick", "tide": "axolotl", "grove": "fawn", "spark": "firefly", "stone": "pebble", "dusk": "winged_fox"}
STATUS_OF = {el: st for st, el in STATUS.items()}
TICK = 40  # ms per GIF frame
TICKS = 90


@lru_cache(maxsize=None)
def strip(name):
    im = Image.open(OUT / f"{name}.png").convert("RGBA")
    s = im.height
    return [im.crop((i * s, 0, (i + 1) * s, s)) for i in range(im.width // s)]


def spec(name):
    if name.startswith("status_"):
        return STATUS_SPEC
    if name in SHARED:
        return SHARED[name]
    return KINDS[name.split("_", 1)[1]]


def frame_at(name, t, gap=700):
    """Which frame shows at time t (ms); None while a one-shot effect is between plays."""
    size, n, ms, loops = spec(name)
    cycle = sum(ms) + (0 if loops else gap)
    t %= cycle
    for i, m in enumerate(ms):
        if t < m:
            return i
        t -= m
    return None


def creature(cid, flip=False):
    im = Image.open(CREATURES / cid / "_ff1.png").convert("RGBA")
    box = im.getbbox()
    im = im.crop((0, 0, 64, box[3]))  # feet on the bottom edge
    return im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im


def patchwork(w, h, seed=3):
    """Ground made of 16x16 tiles in patches of different terrain."""
    names = list(GROUNDS)
    rng = random.Random(seed)
    cx = [(rng.uniform(0, w), rng.uniform(0, h), rng.choice(names)) for _ in range(max(6, w * h // 2500))]
    bg = Image.new("RGBA", (w, h))
    for ty in range(0, h, 16):
        for tx in range(0, w, 16):
            nm = min(cx, key=lambda c: (c[0] - tx) ** 2 + (c[1] - ty) ** 2)[2]
            bg.paste(ground(nm, 16, 16, seed=tx * 31 + ty), (tx, ty))
    return bg


def sheet():
    rows = []
    names = [f"{el}_{k}" for el in ELEMENTS for k in KINDS] + list(SHARED) + [f"status_{s}" for s in STATUS]
    gnames = list(GROUNDS)
    for idx, name in enumerate(names):
        frames = strip(name)
        s = frames[0].width
        S = 2 if s == 64 else 3
        g = gnames[idx % len(gnames)]
        row = Image.new("RGBA", (len(frames) * (s * S + 4) + 4, s * S + 18), (24, 24, 30, 255))
        for i, fr in enumerate(frames):
            bg = ground(g, s, s, seed=i + idx)
            bg.alpha_composite(fr)
            row.paste(scale(bg, S), (4 + i * (s * S + 4), 16))
        size, n, ms, loops = spec(name)
        ImageDraw.Draw(row).text((4, 2), f"{name}.png  {n} x {s}x{s}  {'loops' if loops else 'plays once'}  ms {ms}  (on {g})",
                                 fill=(235, 235, 235, 255))
        rows.append(row)
    W = max(r.width for r in rows)
    H = sum(r.height + 6 for r in rows)
    out = Image.new("RGBA", (W, H), (16, 16, 20, 255))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height + 6
    out.save(HERE / "_preview_sheet.png")
    return out.size


def gif():
    S = 2
    W, H = 400, 6 * 74 + 2 * 78 + 8
    bg = patchwork(W, H)
    frames = []
    for tick in range(TICKS):
        t = tick * TICK
        im = bg.copy()

        def put(name, x, y, anchor="c", flip=False):
            i = frame_at(name, t)
            if i is None:
                return None
            fr = strip(name)[i]
            if flip:
                fr = fr.transpose(Image.FLIP_LEFT_RIGHT)
            s = fr.width
            if anchor == "c":
                im.alpha_composite(fr, (int(x - s / 2), int(y - s / 2)))
            return i

        for r, el in enumerate(ELEMENTS):
            y0 = 4 + r * 74
            # the caster, with its status particle drifting around it
            cr = creature(PICK[el])
            im.alpha_composite(cr, (4, y0 + 66 - cr.height))
            a = t / 600 * 2 * math.pi
            put(f"status_{STATUS_OF[el]}", 36 + 26 * math.cos(a), y0 + 30 + 8 * math.sin(a))
            # a shot flies across, shedding its trail
            lane0, lane1 = 64, 168
            speed = 0.09  # px per ms
            travel = (lane1 - lane0) / speed
            tt = t % (travel + 300)
            if tt < travel:
                px = lane0 + tt * speed
                for k in range(1, 6):  # trail bits dropped every 8 px, each playing once
                    dx = px - k * 8
                    if dx < lane0:
                        break
                    age = k * 8 / speed
                    fi = int(age // 80)
                    if fi < 4:
                        im.alpha_composite(strip(f"{el}_trail")[fi], (int(dx) - 4, y0 + 30 - 4))
                i = int(t // 70) % 4
                im.alpha_composite(strip(f"{el}_projectile")[i], (int(px) - 8, y0 + 30 - 8))
            else:
                put(f"{el}_impact", lane1 + 8, y0 + 30)
            # a beam: the 16 px segment repeated
            i = int(t // 60) % 4
            seg = strip(f"{el}_beam")[i]
            for k in range(5):
                im.alpha_composite(seg, (196 + k * 16, y0 + 22))
            # the area burst on the ground
            put(f"{el}_burst", 330, y0 + 42)  # its ground centre (32, 48) on the row's ground line

        # shared row 1: on creatures
        y0 = 4 + 6 * 74
        shared_row = [("guard", "rock_golem"), ("heal", "seal"), ("power", "dragon_whelp"), ("charge", "griffin"), ("faint", "moon_wolf")]
        for j, (name, cid) in enumerate(shared_row):
            x0 = 8 + j * 78
            cr = creature(cid)
            feet = y0 + 70
            fi = frame_at(name, t)
            show = not (name == "faint" and fi is not None and fi >= 2) and not (name == "faint" and fi is None and (t % 1700) > 1300)
            if name in ("heal", "power", "charge"):
                if show:
                    im.alpha_composite(cr, (x0, feet - cr.height))
                if name == "charge":
                    put(name, x0 + 32, feet - 30)
                else:
                    put(name, x0 + 32, feet - 16)  # its feet point (24, 40) on the creature's feet
            elif name == "faint":
                if show:
                    im.alpha_composite(cr, (x0, feet - cr.height))
                put(name, x0 + 32, feet - 16)
            else:
                im.alpha_composite(cr, (x0, feet - cr.height))
                put(name, x0 + 32, feet - 28)
        # shared row 2
        y0 = 4 + 6 * 74 + 78
        cy = y0 + 40
        # delay over a creature's head
        cr = creature("cat")
        im.alpha_composite(cr, (4, y0 + 74 - cr.height))
        put("delay", 36, y0 + 74 - cr.height + 4)
        cr2 = creature("bunny")
        im.alpha_composite(cr2, (78, y0 + 74 - cr2.height))
        put("interrupt", 108, y0 + 40)
        # terrain: a grass square turning into water
        tx, ty = 176, cy - 8
        fi = frame_at("terrain", t)
        changed = fi is not None and fi >= 3
        im.paste(ground("water" if changed else "grass", 16, 16, seed=5), (tx, ty))
        put("terrain", tx + 8, ty + 8)  # the square is the middle 16x16 of the 32 frame
        put("miss", 240, cy)
        # dust puffs under a walking creature
        cr3 = creature("cat_ferret")
        wx = 280 + (t // 8) % 60
        im.alpha_composite(cr3, (int(wx), y0 + 74 - cr3.height))
        for k in range(3):
            age = (t + k * 330) % 1000
            fi = int(age // 75)
            if fi < 4:
                fx = 280 + ((t - age) // 8) % 60 + 20
                im.alpha_composite(strip("dust")[fi], (int(fx), y0 + 74 - 14))
        frames.append(scale(im.convert("RGB"), S))
    # labels on every frame
    font_rows = ["fire", "water", "plant", "electric", "stone", "shadow"]
    for f in frames:
        d = ImageDraw.Draw(f)
        _text = d.text

        def label(xy, txt, fill=None, _d=d, _t=_text):
            x, y = xy
            _d.rectangle((x - 3, y - 1, x + 6 * len(txt) + 2, y + 11), fill=(14, 14, 20))
            _t((x, y), txt, fill=(255, 255, 255))
        d.text = label
        for r, nm in enumerate(font_rows):
            y = (4 + r * 74) * S
            d.text((8, y), nm, fill=(255, 255, 255))
            d.text((130, y), "shot + trail, then hit", fill=(255, 255, 255))
            d.text((392, y), "beam", fill=(255, 255, 255))
            d.text((600, y), "area burst", fill=(255, 255, 255))
        y = (4 + 6 * 74) * S
        for j, nm in enumerate(["guard", "heal", "power-up", "charge (loops)", "faint"]):
            d.text(((8 + j * 78) * S + 4, y), nm, fill=(255, 255, 255))
        y = (4 + 6 * 74 + 78) * S
        for x, nm in ((8, "delay"), (156, "interrupt"), (340, "terrain change"), (460, "failed"), (560, "footstep dust")):
            d.text((x, y), nm, fill=(255, 255, 255))
    pal_frames = [f.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
    pal_frames[0].save(HERE / "_preview.gif", save_all=True, append_images=pal_frames[1:], duration=TICK, loop=0, disposal=1)
    return frames[0].size


def main():
    print("sheet", sheet())
    print("gif", gif())


if __name__ == "__main__":
    main()
