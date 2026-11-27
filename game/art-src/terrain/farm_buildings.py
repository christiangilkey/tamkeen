"""The farm's and garden's buildings and the Star Shrine, drawn the way the village's props are (the owner: "the art for
the buildings don't match the art for the backgrounds/terrain"): the same palettes and lighting (props.py: light from
the top left, a band of tones per surface), a dark one-pixel outline, a see-through ground shadow to the lower right,
the three-quarter view (the top of a thing, then its south face), standing on the bottom edge of the picture at the
village's scale (16 pixels a tile).

    .venv/Scripts/python game/art-src/terrain/farm_buildings.py preview OUT.png   before/after, by day and by night
    .venv/Scripts/python game/art-src/terrain/farm_buildings.py build [--aseprite]

This first set is the sample the owner sees before the rest is redrawn.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import hx, ramp, stamp  # noqa: E402
from props import BARK, COLUMN, LEAF, LIGHT, MOSS, ROCK, Sprite, band, blob, cylinder, facets, finish, line  # noqa: E402
from props_more import GLOW, HAY, IRON, PLANK, _idx, _shift, crown_tree  # noqa: E402
from village_props import (APPLE, BLUE, CABBAGE, CANVAS, GREEN, ORANGE, PAPER, TERRA, WATER, WICKER, YELLOW, front_boards,  # noqa: E402
                           post, rect, top_boards)
from village_props import ball  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
LANTERN_GLOW = ramp("#6a3a10 #a8601a #e09a34 #f8c868 #fff0b8")
BLOSSOM = [hx("#a8761a"), hx("#e8c040"), hx("#fff0a0")]


def planter(sp: Sprite, x0, x1, top, bot, part=10):
    """A wooden planter box seen from above and the south: its rim, dark soil inside, plank sides."""
    for y in range(top + 3, bot + 1):  # the south face: planks
        for x in range(x0, x1 + 1):
            t = (x - x0) / max(1, x1 - x0)
            sp.set(x, y, PLANK[4] if t < 0.15 else PLANK[2] if t > 0.85 else PLANK[3], part)
        if (y - top) % 3 == 0:
            for x in range(x0, x1 + 1):
                _shift(sp, x, y, PLANK, -1)
    for x in range(x0, x1 + 1):  # the rim and the soil inside it
        sp.set(x, top, PLANK[6], part)
        sp.set(x, top + 2, PLANK[5], part)
        if x0 + 1 <= x <= x1 - 1:
            sp.set(x, top + 1, hx("#2e1c12"), part)
    for x in (x0 + 2, x1 - 2):
        for y in range(top + 3, bot + 1):
            sp.set(x, y, PLANK[1], part)


def word_sprout(tier):
    """The Word Sprout: a seed tree in a planter (tier 3: a little tree; golden letter-blossoms)."""
    if tier == 3:
        clumps = [(24, 12, 10, 8), (15, 17, 8, 7), (33, 17, 8, 7), (19, 25, 9, 7), (29, 25, 9, 7), (24, 19, 10, 8)]
        sp = crown_tree("word_sprout_3", 48, 48, clumps, LEAF, (22, 26, 30), [], fruit=BLOSSOM)
        planter(sp, 13, 34, 37, 45)
        return finish(sp)
    raise ValueError(tier)


def skep(sp: Sprite, cx, base, rx, ry, part):
    """A straw bee skep: a dome of coiled straw bands (HAY), lit from the top left, a dark door at its foot."""
    blob(sp, cx, base - ry * 0.45, rx, ry, HAY[:8], rough=0.08, flat_bottom=base, seed=part, lo=-0.4, hi=1.15, part=part)
    top = int(base - ry * 1.45)
    for y in range(top, base + 1):  # the coils: a darker groove every few rows, following the dome
        if (y - top) % 3 == 2:
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if sp.has(x, y) and sp.part[y, x] == part:
                    _shift(sp, x, y, HAY, -2)
    for (dx, dy) in ((0, 0), (1, 0), (0, -1), (1, -1)):
        sp.set(int(cx) + dx, base - 1 + dy, hx("#2a1a0a"), part)


def bee_hive(tier):
    """The Spelling Bee Hive: tier 2, a skep on a little wooden stand, flowers at its feet, a few bees."""
    if tier == 2:
        sp = Sprite(32, 32, "bee_hive_2")
        sp.ground_shadow(18, 29.5, 13, 2.4)
        for x in (7, 24):  # the stand's legs, then its top boards
            rect(sp, x, 22, x + 1, 29, PLANK[3], 1)
            rect(sp, x + 1, 22, x + 1, 29, PLANK[1], 1)
        top_boards(sp, 4, 27, 19, 21, PLANK, 1)
        skep(sp, 16, 19, 10, 11, 2)
        for (x, c) in ((3, "#ff7ab0"), (28, "#ffe680"), (11, "#8ac0ff")):
            line(sp, [(x, 29), (x, 27)], LEAF[4], part=3)
            sp.set(x, 26, hx(c), 3)
            sp.set(x + 1, 26, hx(c), 3)
        for (x, y) in ((25, 9), (6, 12), (21, 5)):  # bees
            stamp(sp.obj, x, y, ["yk", "w."], {"y": YELLOW[5], "k": hx("#1a1008"), "w": hx("#e8f4ff")})
        return finish(sp)
    raise ValueError(tier)


def memory_stone(tier):
    """The Memory Stone: a weathered standing stone (chiselled faces, as the village's rocks), a rune worn into it,
    moss at its foot, a few flowers (tier 2)."""
    if tier == 2:
        sp = Sprite(32, 32, "memory_stone_2")
        sp.ground_shadow(18, 29.4, 10, 2.2)
        facets(sp, 15.5, 21, 7.5, 16, ROCK, n=7, flat_bottom=28, seed=4)
        for (dx, dy) in ((0, 0), (0, 1), (0, 2), (0, 3), (0, 4), (-1, 1), (1, 2), (-1, 3)):  # the rune, worn in
            x, y = 15 + dx, 12 + dy
            if sp.has(x, y):
                _shift(sp, x, y, ROCK, -3)
        for x in range(9, 23):  # moss at its foot
            if sp.has(x, 28) and (x % 3):
                sp.set(x, 28, MOSS[3 if x < 15 else 2], 1)
                if x % 2 and sp.has(x, 27):
                    sp.set(x, 27, MOSS[4 if x < 15 else 3], 1)
        for (x, c) in ((6, "#ff7ab0"), (25, "#8ac0ff"), (27, "#ffe680")):
            line(sp, [(x, 29), (x, 27)], LEAF[4], part=3)
            sp.set(x, 26, hx(c), 3)
        return finish(sp)
    raise ValueError(tier)


def paper_lantern(sp: Sprite, cx, top, w, h, part):
    """A paper lantern, lit from inside: warm in the middle, ribbed, wooden caps."""
    for y in range(top, top + h):
        t = (y - top) / max(1, h - 1)
        half = w / 2 * (0.7 + 0.3 * math.sin(t * math.pi))
        for x in range(int(cx - half), int(cx + half) + 1):
            d = abs(x + 0.5 - cx) / max(0.5, half)
            sp.set(x, y, LANTERN_GLOW[4] if d < 0.35 else LANTERN_GLOW[3] if d < 0.7 else LANTERN_GLOW[2], part)
        if (y - top) % 3 == 1:
            for x in range(int(cx - half), int(cx + half) + 1):
                _shift(sp, x, y, LANTERN_GLOW, -1)
    for x in range(int(cx - w / 3), int(cx + w / 3) + 1):
        sp.set(x, top - 1, PLANK[2], part)
        sp.set(x, top + h, PLANK[2], part)


def page_lantern(tier):
    """The Page Lantern: tier 2, a wooden post with a crossbar and two paper lanterns, a stack of books at its foot."""
    if tier == 2:
        sp = Sprite(32, 32, "page_lantern_2")
        sp.ground_shadow(18, 29.5, 9, 2)
        cylinder(sp, 15, 16, 6, 29, BARK, part=1)
        rect(sp, 7, 5, 24, 6, PLANK[4], 1)
        rect(sp, 7, 6, 24, 6, PLANK[2], 1)
        paper_lantern(sp, 9, 9, 7, 9, 2)
        paper_lantern(sp, 22, 9, 7, 9, 3)
        for i, c in enumerate(("#7a3428", "#34507a", "#4e6a34")):  # books
            rect(sp, 17 + i % 2, 27 - i * 2, 25 + i % 2, 28 - i * 2, hx(c), 4)
            rect(sp, 17 + i % 2, 27 - i * 2, 25 + i % 2, 27 - i * 2, PAPER[4], 4)
        return finish(sp)
    raise ValueError(tier)


def tiles_roof(sp: Sprite, x0, x1, y0, y1, part, pal=TERRA):
    """A small pitched roof of clay tiles seen from above and the south: rows of tiles, the ridge lit, the eaves dark."""
    for y in range(y0, y1 + 1):
        inset = max(0, (y1 - y) // 2 - 1) if y < y0 + 2 else 0
        for x in range(x0 + inset, x1 - inset + 1):
            t = (x - x0) / max(1, x1 - x0)
            c = 5 if t < 0.3 else 4 if t < 0.75 else 3
            if (y - y0) % 2 == 1:
                c -= 1
            if (x + (y - y0) % 2 * 2) % 4 == 0:
                c -= 1
            if y == y1:
                c = 2
            sp.set(x, y, pal[max(0, min(len(pal) - 1, c))], part)


def star(sp: Sprite, cx, cy, part):
    """A little gold star, lit from the top left."""
    rows = ["..y..", ".yYy.", "yYWYy", ".yYy.", "y...y"]
    stamp(sp.obj, cx - 2, cy - 2, rows, {"y": YELLOW[3], "Y": YELLOW[5], "W": YELLOW[7]})
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != ".":
                sp.part[cy - 2 + j, cx - 2 + i] = part


def star_shrine(tier):
    """The Star Shrine (tier 2): a little stone shrine on a step, a clay-tiled roof on two stone posts, the star
    inside on its plinth, moss and flowers at its foot."""
    if tier == 2:
        sp = Sprite(48, 48, "shrine_2")
        sp.ground_shadow(27, 45, 18, 3)
        top_boards(sp, 8, 39, 38, 44, COLUMN, 1, hi=6)  # the stone step
        for x in range(8, 40):
            sp.set(x, 45, COLUMN[3], 1)
            sp.set(x, 46, COLUMN[2], 1)
        for x in (12, 33):  # the two posts
            cylinder(sp, x, x + 3, 16, 38, COLUMN, part=2)
        cylinder(sp, 21, 26, 27, 38, COLUMN, part=3)  # the plinth
        rect(sp, 20, 26, 27, 27, COLUMN[7], 3)
        tiles_roof(sp, 7, 40, 7, 16, 4)
        star(sp, 23, 21, 5)
        for x in range(9, 39):  # moss on the step's front
            if x % 4 and sp.has(x, 45):
                sp.set(x, 44, MOSS[3 if x < 24 else 2], 1)
        for (x, c) in ((5, "#ff7ab0"), (42, "#ffe680"), (44, "#8ac0ff")):
            line(sp, [(x, 46), (x, 44)], LEAF[4], part=6)
            sp.set(x, 43, hx(c), 6)
        return finish(sp)
    raise ValueError(tier)


def seed_stand():
    """The seed stand: a little wooden counter under a green awning, sacks of seed on it, a sign board."""
    sp = Sprite(32, 32, "seedstand")
    sp.ground_shadow(18, 29.5, 14, 2.4)
    for x in (4, 26):
        post(sp, x, 6, 29, PLANK, 1)
    front_boards(sp, 4, 27, 21, 29, PLANK, 1)
    top_boards(sp, 3, 28, 18, 20, PLANK, 1)
    for i, (cx, pal) in enumerate(((9, CANVAS), (16, WICKER), (23, CANVAS))):  # sacks, open at the top
        blob(sp, cx, 15.5, 3.4, 3.6, pal, flat_bottom=18, part=2 + i, seed=i)
        for dx in (-1, 0, 1):
            sp.set(cx + dx, 12, (CABBAGE if i != 1 else YELLOW)[4 - abs(dx)], 2 + i)
    for x in range(2, 30):  # the awning: green and cream stripes, its edge scalloped
        stripe = GREEN if (x // 4) % 2 == 0 else CANVAS
        for y in range(3, 8):
            sp.set(x, y, stripe[5 if y < 5 else 4], 5)
        if x % 4 in (1, 2):
            sp.set(x, 8, stripe[3], 5)
    rect(sp, 11, 24, 20, 27, PAPER[4], 6)  # the sign
    for x in (13, 15, 17):
        sp.set(x, 25, LEAF[5], 6)
        sp.set(x, 26, LEAF[3], 6)
    return finish(sp)


def windmill():
    """The windmill: a round stone tower narrowing to a clay cap, a wooden door, four lattice sails."""
    sp = Sprite(48, 64, "windmill")
    sp.ground_shadow(28, 61, 15, 3)
    cylinder(sp, lambda y: 15 + (61 - y) // 9, lambda y: 32 - (61 - y) // 9, 22, 61, COLUMN, part=1, rough=0.25, seed=2)
    for y in range(24, 61, 5):  # courses of stone
        for x in range(14, 34):
            if sp.has(x, y) and sp.part[y, x] == 1 and (x + y) % 3:
                _shift(sp, x, y, COLUMN, -1)
    blob(sp, 23.5, 21, 9, 5, TERRA, flat_bottom=23, part=2)  # the cap
    rect(sp, 21, 52, 26, 61, PLANK[3], 3)  # the door
    rect(sp, 21, 52, 21, 61, PLANK[5], 3)
    rect(sp, 22, 44, 25, 46, hx("#2a1a10"), 3)  # a window
    cx, cy = 23, 20
    for (dx, dy) in ((1, 1), (-1, 1), (1, -1), (-1, -1)):  # the sails: a cloth panel on a wooden lattice, to one side of each arm
        n = math.hypot(dx, dy)
        ux, uy = dx / n, dy / n
        px, py = -uy, ux  # (turning the same way round, so the sails spin)
        for k10 in range(40, 190):
            k = k10 / 10
            for w10 in range(0, 46):
                w = w10 / 10
                x, y = int(round(cx + ux * k + px * w)), int(round(cy + uy * k + py * w))
                frame = k < 4.6 or k > 18.4 or w > 4.1 or int(k) % 4 == 0
                sp.set(x, y, PLANK[4 if frame else 3] if frame else CANVAS[5 if (ux + uy) < 0 else 4], 4)
        line(sp, [(cx, cy), (int(round(cx + ux * 19)), int(round(cy + uy * 19)))], PLANK[2], part=4)
    ball(sp, cx, cy, 1.6, IRON, 5)
    return finish(sp)


def crop_row():
    """A strip of the field: tilled soil in furrows with three crops at their best (cabbage, wheat, carrot tops)."""
    sp = Sprite(48, 24, "crops")
    soil = ramp("#2a1810 #3e2414 #56341c #6e4626 #885a32")
    for y in range(14, 24):  # the furrows, a ridge lit on top
        for x in range(0, 48):
            sp.set(x, y, soil[3 if y % 3 == 0 else 2 if y % 3 == 1 else 1], 1)
    blob(sp, 8, 15, 6, 5, CABBAGE, rough=0.2, part=2, seed=3)  # a cabbage
    for k in range(6):  # wheat: stalks and gold ears
        x = 20 + k * 2
        line(sp, [(x, 21), (x + (k % 2), 9)], HAY[3], part=3)
        for y in range(7, 11):
            sp.set(x + (k % 2), y, HAY[6 if y < 9 else 5], 3)
    for k in range(3):  # carrot tops, a little orange showing
        x = 36 + k * 4
        for (dx, dy) in ((0, 0), (-1, -2), (1, -2), (0, -3), (-2, -4), (2, -4)):
            sp.set(x + dx, 16 + dy, LEAF[6 if dx <= 0 else 4], 4)
        sp.set(x, 17, ORANGE[4], 4)
        sp.set(x + 1, 17, ORANGE[3], 4)
    sp.ground_shadow(24, 22, 24, 2)
    return finish(sp)


def mailbox():
    """The mailbox: a rounded tin box on a wooden post, its red flag down."""
    sp = Sprite(18, 26, "mailbox")
    sp.ground_shadow(11, 24, 6, 1.6)
    post(sp, 8, 13, 24, PLANK, 1)
    cylinder(sp, 3, 14, 7, 13, BLUE, part=2)
    blob(sp, 8.5, 7, 6, 3, BLUE, flat_bottom=7, part=2)
    rect(sp, 3, 9, 3, 12, hx("#1a1424"), 2)
    rect(sp, 15, 8, 15, 11, APPLE[3], 3)
    rect(sp, 15, 8, 16, 9, APPLE[4], 3)
    return finish(sp)


def cook_pot():
    """The cook's pot: an iron cauldron over a little fire on a ring of stones, steam rising (two frames)."""
    frames = []
    for f in range(2):
        sp = Sprite(24, 24, f"pot_{f}")
        sp.ground_shadow(13, 22, 10, 2)
        for i, x in enumerate(range(3, 22, 3)):  # the stones
            facets(sp, x + 1, 20, 2, 1.6, ROCK, n=4, part=1, seed=i)
        for (x, y, c) in ((9, 19, 3), (12, 18, 5), (15, 19, 4), (11, 20, 2), (14, 20, 3)):
            sp.set(x + f % 2, y, GLOW[c], 2)
        blob(sp, 12, 13, 8, 6, IRON[:7], flat_bottom=17, part=3, lo=-0.6, hi=1.5)
        for x in range(5, 20):  # the rim, and the stew inside
            sp.set(x, 8, IRON[6], 3)
            if 6 < x < 18:
                sp.set(x, 9, ORANGE[3 if (x + f) % 3 else 4], 3)
        for k, x in enumerate((9, 13, 16)):  # steam
            for y in range(1, 7):
                if (y + k + f) % 3 == 0:
                    sp.obj[y, x + (y + f) % 2] = (*CANVAS[6][:3], 150)
        frames.append(finish(sp))
    return np.concatenate(frames, axis=1)


def fountain():
    """A garden fountain (decoration): a round stone basin of water, a little column spouting in the middle."""
    sp = Sprite(32, 32, "fountain")
    sp.ground_shadow(17, 29, 14, 2.4)
    blob(sp, 16, 24, 14, 5, COLUMN, flat_bottom=29, part=1)
    blob(sp, 16, 22.5, 11, 3.4, WATER, part=2, lo=-0.6, hi=1.3)
    cylinder(sp, 14, 17, 10, 22, COLUMN, part=3)
    blob(sp, 15.5, 10, 4, 1.6, COLUMN, part=3)
    for (x, y) in ((15, 4), (16, 3), (13, 6), (18, 6), (12, 8), (19, 8), (15, 6), (16, 7)):
        sp.set(x, y, WATER[7], 4)
    return finish(sp)


def fence_gate():
    """The farm's edge (option A): a run of the fence with a wooden gate standing open over the path."""
    sp = Sprite(64, 32, "fence_gate")
    for x in range(0, 64):  # the path through it
        for y in range(25, 32):
            sp.shadow[y, x] = (*hx("#6e4626")[:3], 255) if (x * 7 + y * 3) % 11 else (*hx("#56341c")[:3], 255)
    for x0 in (0, 44):
        for x in range(x0, x0 + 20, 6):
            post(sp, x, 12, 27, PLANK, 1)
            rect(sp, x, 11, x + 1, 11, PLANK[7], 1)
        for y in (15, 21):
            for x in range(x0, x0 + 20):
                if not (sp.has(x, y) and sp.part[y, x] == 1 and sp.obj[y, x][0] == PLANK[6][0]):
                    sp.set(x, y, PLANK[5], 2)
                    sp.set(x, y + 1, PLANK[3], 2)
    for x in (20, 42):  # the gate posts, taller, capped
        post(sp, x, 6, 28, PLANK, 3)
        rect(sp, x - 1, 5, x + 2, 6, PLANK[7], 3)
    for y in (12, 18, 24):  # the gate leaf, swung open against the right post
        for x in range(36, 42):
            sp.set(x, y, PLANK[5], 4)
            sp.set(x, y + 1, PLANK[3], 4)
    line(sp, [(36, 25), (41, 12)], PLANK[4], part=4)
    return finish(sp)



def path_only():
    """The farm's edge (option B): no fence or gate, just the yard's path running on into the farm, worn at its sides."""
    sp = Sprite(64, 32, "path_only")
    for x in range(0, 64):
        for y in range(24, 32):
            edge = y in (24, 31) and (x * 5 + y) % 3 == 0
            if not edge:
                sp.shadow[y, x] = (*hx("#6e4626")[:3], 255) if (x * 7 + y * 3) % 11 else (*hx("#56341c")[:3], 255)
    for (x, y) in ((10, 27), (30, 29), (47, 26), (55, 29)):  # a few pebbles
        sp.set(x, y, ROCK[6], 1)
        sp.set(x + 1, y, ROCK[4], 1)
    return finish(sp)


SAMPLE = {"word_sprout_3": lambda: word_sprout(3), "ink_well_2": lambda: bee_hive(2), "memory_stone_2": lambda: memory_stone(2),
          "page_lantern_2": lambda: page_lantern(2), "shrine_2": lambda: star_shrine(2), "seedstand": seed_stand,
          "windmill": windmill, "crops": crop_row, "mailbox": mailbox, "pot": lambda: cook_pot()[:, :24],
          "fountain": fountain, "gate": fence_gate, "path": path_only}
BEFORE = {"word_sprout_3": "web/game-art/structure/word_sprout_3.png", "ink_well_2": "web/game-art/farm/bee_hive_2.png",
          "memory_stone_2": "web/game-art/structure/memory_stone_2.png", "page_lantern_2": "web/game-art/structure/page_lantern_2.png",
          "shrine_2": "web/game-art/farm/shrine_2.png", "seedstand": "web/game-art/farm/seedstand.png",
          "windmill": "web/game-art/farm/windmill.png", "crops": ("web/game-art/farm/crops.png", (0, 0, 48, 24)),
          "mailbox": "web/game-art/room/mailbox.png", "pot": ("web/game-art/muffle/pot.png", (0, 0, 24, 24)),
          "fountain": "web/game-art/decor/fountain.png", "gate": "web/game-art/farm/gate.png",
          "path": "web/game-art/farm/gate.png"}


def ground(w, h):
    """The village's grass, tiled (battle/terrain/grass_fill.png), for the preview."""
    fill = Image.open(ROOT / "web/game-art/battle/terrain/grass_fill.png").convert("RGBA")
    out = Image.new("RGBA", (w, h))
    n = fill.width // 16
    for y in range(0, h, 16):
        for x in range(0, w, 16):
            k = (x * 7 + y * 13) // 16 % n
            out.alpha_composite(fill.crop((k * 16, 0, k * 16 + 16, 16)), (x, y))
    return out


def before_pic(n):
    src = BEFORE[n]
    if isinstance(src, tuple):
        return Image.open(ROOT / src[0]).convert("RGBA").crop(src[1])
    return Image.open(ROOT / src).convert("RGBA")


def preview(out: str) -> None:
    """Before (the art now) and after (this style), each on the village's grass by day and by night (the habitat's
    night tint over everything), a village prop (the well) at the start of each row to compare; six to a row."""
    sc = 3
    names = list(SAMPLE)
    cell, H = 72, 72
    groups = [names[i:i + 6] for i in range(0, len(names), 6)]
    W = cell * 7
    rows = []
    for group in groups:
        for label, pics in (("before", [before_pic(n) for n in group]), ("after", [Image.fromarray(SAMPLE[n]()) for n in group])):
            for night in (False, True):
                g = ground(W, H)
                well = Image.open(ROOT / "web/game-art/battle/terrain/prop_well.png").convert("RGBA")
                g.alpha_composite(well, ((cell - well.width) // 2, H - well.height - 4))
                for i, p in enumerate(pics):
                    g.alpha_composite(p, (cell * (i + 1) + (cell - p.width) // 2, H - p.height - 4))
                if night:
                    g.alpha_composite(Image.new("RGBA", (W, H), (20, 12, 48, round(0.55 * 255))))
                rows.append((label, night, g))
    gap = 3
    sheet = Image.new("RGBA", (W * sc, len(rows) * (H + gap) * sc), (24, 22, 32, 255))
    for k, (label, night, r) in enumerate(rows):
        sheet.alpha_composite(r.resize((W * sc, H * sc), Image.NEAREST), (0, k * (H + gap) * sc))
    sheet.save(out)
    print("preview ->", out, sheet.size)


if __name__ == "__main__":
    preview(sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "preview" else "farm_buildings_preview.png")
