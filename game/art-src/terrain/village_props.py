"""The village's market, tavern, smithy and Town Hall props, and the fountain's centrepiece.

Same rules and look as props.py / props_more.py: each prop stands on the bottom edge of its image, centred on its
footprint, light from the top left, a dark outline, a see-through ground shadow to the lower right; three-quarter
view (the top of a thing, then its south face). Built by terrain.py (it imports this file):

    .venv/Scripts/python game/art-src/terrain/terrain.py build prop_stall ornament_fountain ... --aseprite
    .venv/Scripts/python game/art-src/terrain/village_props.py preview     -> preview/village_props_preview.png
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import blank, hx, ramp  # noqa: E402
from props import LIGHT, MOSS, OUTLINE, Sprite, band, blob, finish, line  # noqa: E402
from props_more import (CLOTH, COLUMN, FLAME_CORE, GLOW, GOLD, HAY, IRON, PLANK, ROPE, SACK,  # noqa: E402
                        _cast, _idx, _shift)

# ---------- palettes (darkest first) ----------

CANVAS = ramp("#4a3e4a #6e6270 #968a92 #bcb2b2 #dcd4cc #f2ece2 #fffaf2")
RED = CLOTH
BLUE = ramp("#0c1430 #142250 #1e3474 #2a4c98 #3a68b8 #5488d4 #7eaae8 #b0d0f8")
GREEN = ramp("#0c2018 #12341e #1a4c26 #24662e #328238 #46a044 #68bc54 #98d670")
YELLOW = ramp("#3e2a0c #604414 #86621c #ae8426 #d2a834 #ecc84c #f8e27a #fff4b4")
TEAL = ramp("#0a1e24 #10343c #164c56 #1e6870 #2a868a #3ea6a2 #62c6bc #a0e6d8")
PURPLE = ramp("#1a0c2a #2c1446 #42205e #5a3078 #744494 #925cb0 #b47ccc #d8a8e8")
APPLE = ramp("#3a0a14 #6a1420 #a01e24 #d0342e #f0604a #ffa088")
ORANGE = ramp("#4a1c08 #84340c #c25812 #ea8020 #ffaa3c #ffd47a")
CABBAGE = ramp("#0e2a1a #1a4628 #2c6a34 #48903e #74b450 #a8d870 #d4f0a0")
BREAD = ramp("#3a1c0c #5e3012 #864a1a #ae6624 #cc8634 #e2a64c #f2c672 #fae2a0")
WICKER = ramp("#2e1a0c #4a2c12 #6c461c #8e6228 #b08038 #cca050 #e2c070")
GLASS_G = ramp("#0a2418 #12402a #1c6040 #2c8458 #4cac78 #86d4a4 #d0f6e0")
GLASS_A = ramp("#2e1406 #582a0c #8a4812 #ba6e1c #e09a34 #f8c868 #fff0b8")
JUICE = ramp("#4a1406 #842a0a #c24c12 #ec7a1e #ffa63a #ffd27a")
POTION = ramp("#1e0a2e #3a1252 #5c1c7a #8228a2 #a844c4 #cc76e0 #ecb0f6 #ffe6ff")
DENIM = ramp("#141a30 #1e2a4a #2a3c66 #3a5284 #4e6ca2 #6a8cbe #94b2da")
PAPER = ramp("#5e564c #847a6c #aca08c #d0c6ae #ece4cc #fcf8ea")
MAHOG = ramp("#140a0c #22100e #341812 #482216 #5e2e1c #763c22 #8e4e2c #a8643a #c4804e")
GREENBAIZE = ramp("#0c1e16 #14301e #1e4428 #2a5a32 #3a723c")
TERRA = ramp("#2e120c #4e2012 #74321a #9a4822 #bc6430 #d88446 #eeaa6a")
FLOWER = {"r": ramp("#5a0c1e #9a1a2e #d8344a #ff6a7a #ffb0b8"),
          "y": ramp("#6a4a08 #a87c10 #e0b420 #fcdc4a #fff4a0"),
          "p": ramp("#3a1250 #66208a #9a3ec0 #c870e4 #ecb4fa"),
          "w": ramp("#7a7488 #aaa4b4 #d2ccd8 #eeeaf2 #ffffff"),
          "o": ramp("#6a2008 #a8400c #e86c1a #ffa040 #ffd090"),
          "b": ramp("#14205a #22388e #3a5ec4 #6a90ea #a8c8ff")}
WATER = ramp("#0a2246 #0f3666 #164c86 #1e66a2 #2a82bc #42a0d2 #66bee2 #a4def0 #effcff")  # the basin's water


# ---------- small helpers ----------

def rect(sp, x0, y0, x1, y1, c, part=0):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            sp.set(x, y, c, part)


def tone(pal, i):
    return pal[max(0, min(len(pal) - 1, i))]


def put_rows(sp, x, y, rows, cmap, part=0):
    """stamp, but marks the part too (for _cast)."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in ". ":
                continue
            sp.set(x + i, y + j, cmap[ch], part)


def top_boards(sp, x0, x1, y0, y1, pal, part, hi=6, seam_rows=(), across=False, seam_cols=()):
    """A level wooden top seen from above: lit, its back row a tone darker, its front lip the brightest, the left
    end lit and the right end in shade; seams between the boards one tone down."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            c = hi
            if y == y0:
                c = hi - 1
            if y in seam_rows or x in seam_cols:
                c = hi - 1
            if x == x0:
                c += 1
            elif x == x1:
                c -= 1
            if y == y1:
                c = hi + 2 if x < x1 - 1 else hi + 1
            sp.set(x, y, tone(pal, c), part)


def front_boards(sp, x0, x1, y0, y1, pal, part, base=4, seam=6, off=0):
    """A wooden south face of upright boards: in light shade, each board lit on its left, dark seams between."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            k = (x - x0 + off) % seam
            c = base
            if k == 0 and x > x0:
                c = base - 2
            elif k == 1:
                c = base + 1
            if x == x0:
                c = base + 1
            elif x == x1:
                c = base - 1
            if y == y1:
                c -= 1
            sp.set(x, y, tone(pal, c), part)


def post(sp, x, y0, y1, pal, part, lit=6, dark=3):
    """A 2-px upright: lit on its left column, in shade on its right."""
    for y in range(y0, y1 + 1):
        sp.set(x, y, tone(pal, lit), part)
        sp.set(x + 1, y, tone(pal, dark), part)


def ball(sp, cx, cy, r, pal, part, ry=None, bias=0.0, lo=-0.45, hi=0.95):
    """A small lit sphere (fruit, a pot's belly): blob without wobble."""
    blob(sp, cx, cy, r, ry if ry is not None else r, pal, part=part, bias=bias, lo=lo, hi=hi)


def fruit_heap(sp, x0, x1, ybase, height, pal, part, seed=0, size=2):
    """A heap of round fruit: a mound filled with the dark between them, then fruits packed in offset rows,
    each lit on its top left, a few with a bright speck."""
    rng = np.random.default_rng(seed)
    cx, hw = (x0 + x1 + 1) / 2, (x1 - x0 + 1) / 2
    tops = {}
    for x in range(x0, x1 + 1):
        dx = (x + 0.5 - cx) / hw
        t = int(round(ybase - height * math.sqrt(max(0.0, 1 - dx * dx * 0.85))))
        tops[x] = t
        for y in range(t, ybase + 1):
            sp.set(x, y, pal[1], part)
    row = 0
    for y in range(ybase - 1, min(tops.values()) - 2, -size + 0 if size > 2 else -2):
        off = (row % 2) * (size // 2 + (1 if size == 2 else 0))
        for x in range(x0 + off - 1, x1 + 1, size + (1 if size >= 3 else 0)):
            if x < x0 or x > x1 or y < tops.get(x, 99) - 0:
                continue
            if size == 2:
                cells = [((0, 0), 4), ((1, 0), 3), ((0, 1), 3), ((1, 1), 2)]
            else:
                cells = [((1, 0), 3), ((0, 1), 4), ((1, 1), 4), ((2, 1), 3), ((1, 2), 2), ((0, 2), 3), ((2, 2), 2),
                         ((0, 0), 3), ((2, 0), 2)]
            for (dx, dy), c in cells:
                xx, yy = x + dx, y - (size - 1) + dy
                if x0 <= xx <= x1 and yy >= tops.get(xx, 99) and yy <= ybase:
                    sp.set(xx, yy, pal[c], part)
            if rng.random() < 0.35 and y - (size - 1) >= tops.get(x, 99):
                sp.set(x, y - (size - 1), pal[5], part)
        row += 1


def crate_box(sp, x0, x1, y0, y1, part, pal=PLANK):
    """A small open fruit crate seen from the front: a lit top rim, two boards, dark corner posts."""
    for x in range(x0, x1 + 1):
        sp.set(x, y0, tone(pal, 7 if x < x1 else 6), part)
    for y in range(y0 + 1, y1 + 1):
        for x in range(x0, x1 + 1):
            c = 5
            if y == (y0 + y1 + 1) // 2:
                c = 3                      # the gap between the two boards
            if x == x0:
                c = 6
            elif x == x1:
                c = 3
            if y == y1:
                c -= 1
            sp.set(x, y, tone(pal, c), part)


# ---------- the market stalls ----------

def stall_frame(name, pa, pb, goods):
    """A market stall: a plank counter, two poles at its back corners holding a striped canvas awning (a sloping
    top and a scalloped valance hanging at its front edge), the goods on the counter. pa, pb: the stripes."""
    sp = Sprite(32, 48, name)
    sp.ground_shadow(18.5, 45.6, 15.2, 2.6)
    X0, X1 = 2, 29
    # the poles: from the counter's back corners up to the awning
    for px in (3, 27):
        post(sp, px, 12, 31, PLANK, 1, lit=6, dark=3)
    # the counter: its top, then its front of upright boards with a rail along the top and a plinth
    top_boards(sp, X0, X1, 31, 34, PLANK, 2, hi=6, seam_rows=(32,))
    front_boards(sp, X0, X1, 35, 45, PLANK, 3, base=4, seam=6, off=3)
    for x in range(X0, X1 + 1):
        sp.set(x, 35, tone(PLANK, 3 if x < X1 else 2), 3)          # the lip's shade on the front
        sp.set(x, 36, tone(PLANK, 6 if x > X0 else 7), 3)          # a rail
        sp.set(x, 37, tone(PLANK, 3), 3)
        sp.set(x, 44, tone(PLANK, 5 if x > X0 else 6), 3)          # the plinth
        sp.set(x, 45, tone(PLANK, 2), 3)
    for x, y in ((X0 + 1, 38), (X1 - 1, 38), (X0 + 1, 43), (X1 - 1, 43)):
        sp.set(x, y, IRON[6] if x < 16 else IRON[5], 3)            # nails
    # the back curtain between the poles, in the awning's shade
    for y in range(18, 31):
        for x in range(5, 27):
            p = pa if ((x - 5) // 4) % 2 == 0 else pb
            c = 2 if y > 21 else 1
            if (x - 5) % 4 == 0:
                c -= 1                                             # its folds
            sp.set(x, y, tone(p, c), 0)
    goods(sp)
    # the awning: a rod at the back, the sloping canvas fanning out towards the front, a hem, then the valance
    # hanging from the front edge with a scalloped bottom
    NS = 7                                                         # stripes, 4 px wide at the front edge

    def span(y):                                                   # the canvas's left and right edge on row y
        t = (y - 4) / 9
        return 4 - 2 * t, 27 + 2 * t

    def stripe_at(x, y):
        a, b = span(min(y, 13))
        u = (x + 0.5 - a) / (b - a + 1)
        return int(max(0, min(NS - 1, u * NS)))

    for x in range(3, 29):
        sp.set(x, 3, tone(PLANK, 6 if x < 25 else 5), 6)
    for x, c in ((2, 7), (29, 4)):
        sp.set(x, 3, PLANK[c], 6)
    for y in range(4, 13):
        a, b = span(y)
        for x in range(int(round(a)), int(round(b)) + 1):
            k = stripe_at(x, y)
            p = pa if k % 2 == 0 else pb
            n = len(p)
            c = n - 2 + (1 if k == 0 else 0) - (1 if k >= NS - 2 else 0)
            if y == 4:
                c -= 2                                             # the rod's shade
            elif y == 5:
                c -= 1
            sp.set(x, y, tone(p, c), 7)
    for x in range(2, 30):
        k = stripe_at(x, 13)
        p = pa if k % 2 == 0 else pb
        sp.set(x, 13, tone(p, len(p) - 1 if k < NS - 2 else len(p) - 2), 7)   # the hem, catching the light
    for y in range(14, 20):
        for x in range(2, 30):
            k = stripe_at(x, 13)
            j = x - 2 - k * 4                                      # 0..3 across this scallop
            if y == 19 and j not in (1, 2):
                continue
            p = pa if k % 2 == 0 else pb
            n = len(p)
            c = n - 3 + (1 if k == 0 else 0) - (1 if k >= NS - 2 else 0)
            if y == 14:
                c -= 1                                             # under the hem
            if y >= 18:
                c -= 1
            sp.set(x, y, tone(p, c), 8)
    # the awning's shade on the poles and on the goods just under it
    for y in range(20, 24):
        for x in range(32):
            if sp.part[y, x] in (1, 4, 5) and sp.has(x, y):
                for pal in (PLANK, APPLE, ORANGE, CABBAGE, BREAD, WICKER, GLASS_G, GLASS_A, RED, BLUE, YELLOW,
                            PURPLE, TEAL, GREEN, CANVAS):
                    if _idx(pal, sp.obj[y, x]) is not None:
                        _shift(sp, x, y, pal, -2 if y < 22 else -1)
                        break
    return sp


def stall():
    """Fruit and vegetables: crates of apples, cabbages and oranges, a bundle of carrots, a slate price board."""
    def goods(sp):
        crate_box(sp, 5, 11, 28, 33, 4)
        crate_box(sp, 13, 19, 28, 33, 4)
        crate_box(sp, 21, 26, 28, 33, 4)
        fruit_heap(sp, 5, 11, 27, 4, APPLE, 5, seed=1)
        fruit_heap(sp, 13, 19, 27, 5, CABBAGE, 5, seed=2, size=3)
        fruit_heap(sp, 21, 26, 27, 4, ORANGE, 5, seed=3)
        for y in range(23, 28):  # cabbage leaves: a pale vein on each
            for x in range(13, 20):
                if sp.part[y, x] == 5 and _idx(CABBAGE, sp.obj[y, x]) == 4 and (x + y) % 3 == 0:
                    sp.set(x, y, CABBAGE[6], 5)
        # carrots lying on the counter's front edge, green tops to the left
        for i, (x, y) in enumerate(((22, 33), (24, 34), (26, 33))):
            sp.set(x, y, ORANGE[4], 5)
            sp.set(x + 1, y, ORANGE[3], 5)
            sp.set(x + 2, y, ORANGE[2], 5)
            sp.set(x - 1, y - 1, CABBAGE[4], 5)
            sp.set(x - 1, y, CABBAGE[3], 5)
        sp.set(7, 34, APPLE[4], 5)  # a loose apple
        sp.set(8, 34, APPLE[3], 5)
        sp.set(7, 33, APPLE[5], 5)
        sp.set(8, 33, APPLE[3], 5)
        # a little painted board hung on the counter's front: a red apple on cream
        sign_board(sp, 12, 38, 19, 43, CANVAS, 3)
        put_rows(sp, 14, 39, ["..l.", ".ab.", "abbc", ".cc."],
                 {"l": CABBAGE[4], "a": APPLE[5], "b": APPLE[3], "c": APPLE[2]}, 3)
    sp = stall_frame("stall", RED, CANVAS, goods)
    return finish(sp)


def sign_board(sp, x0, y0, x1, y1, pal, part, face=None):
    """A small painted board: a wooden frame, lit on its top and left, the painted face inside."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if y == y0:
                c = PLANK[7] if x < x1 else PLANK[6]
            elif y == y1:
                c = PLANK[3]
            elif x == x0:
                c = PLANK[6]
            elif x == x1:
                c = PLANK[3]
            else:
                c = tone(pal, (face if face is not None else len(pal) - 2) - (1 if y == y0 + 1 else 0))
            sp.set(x, y, c, part)


def folded(sp, x0, y0, w, pal, part, top=False):
    """A length of cloth folded flat, 2 px thick: a lit fold on its left end, the layers showing on the right;
    the top one in a stack shows its upper face too."""
    n = len(pal)
    if top:
        for x in range(x0 + 1, x0 + w - 1):
            sp.set(x, y0 - 1, tone(pal, n - 1 if x < x0 + w - 3 else n - 2), part)
    for x in range(x0, x0 + w):
        c0, c1 = n - 3, n - 5
        if x == x0:
            c0, c1 = n - 2, n - 3                          # the rounded fold
        elif x == x0 + w - 1:
            c0, c1 = n - 4, n - 6
        sp.set(x, y0, tone(pal, c0), part)
        sp.set(x, y0 + 1, tone(pal, c1), part)
    sp.set(x0 + w - 2, y0 + 1, tone(pal, n - 2), part)       # a loose edge of the layers


def stall_cloth():
    """A draper's: stacks of folded cloth in many colours, a tall bolt standing by the pole, a length of cloth
    draped over the front, a measuring stick and scissors."""
    def goods(sp):
        stacks = (((RED, 0), (CANVAS, 1), (TEAL, 0), (YELLOW, -1), (PURPLE, 0)),
                  ((GREEN, 0), (PURPLE, -1), (BLUE, 0), (RED, 1)))
        for (x0, w), layers in zip(((5, 8), (14, 8)), stacks):
            y = 33
            for k, (pal, off) in enumerate(layers):
                folded(sp, x0 + off, y - 2, w, pal, 4 + k, top=(k == len(layers) - 1))
                y -= 2
        # a tall bolt standing on end by the right pole, its end unrolling a little
        for y in range(19, 34):
            for i, c in enumerate((6, 5, 3)):
                sp.set(23 + i, y, TEAL[c if y > 19 else c + 1], 9)
            if y % 4 == 1 and y > 20:
                sp.set(24, y, TEAL[4], 9)
        for x, c in ((23, 7), (24, 6), (25, 5)):
            sp.set(x, 18, TEAL[c], 9)
        for y in range(24, 34):
            sp.set(26, y, TEAL[4] if y % 3 else TEAL[2], 9)
        # cloth draped over the counter's front: a red length with a gold hem and a dotted pattern
        for y in range(34, 44):
            for x in range(4, 14):
                bottom = 41 + int(round(2 * math.sin((x - 4) / 9 * math.pi)))
                if y > bottom:
                    continue
                fold = math.cos((x - 4) / 9 * 3 * math.pi)
                c = 5 + int(round(fold * 1.2))
                if y == 34:
                    c = 7
                if y == bottom:
                    sp.set(x, y, GOLD[5] if x < 10 else GOLD[4], 3)
                    continue
                if (x + 2 * y) % 6 == 0 and 35 < y < bottom - 1:
                    sp.set(x, y, GOLD[5] if fold > -0.3 else GOLD[3], 3)
                    continue
                sp.set(x, y, tone(RED, c), 3)
        for x in range(4, 14):
            if x % 2 == 0:
                b = 41 + int(round(2 * math.sin((x - 4) / 9 * math.pi)))
                sp.set(x, b + 1, GOLD[3], 3)
        # a measuring stick and a pair of scissors on the counter
        for x in range(16, 23):
            sp.set(x, 34, GOLD[6] if x % 2 else GOLD[4], 4)
        put_rows(sp, 4, 32, ["i.i", ".i.", "o.o"], {"i": IRON[7], "o": IRON[5]}, 4)
    sp = stall_frame("stall_cloth", BLUE, CANVAS, goods)
    return finish(sp)


def loaf(sp, x, y, w, part, pal=BREAD, scored=True):
    """A loaf lying east-west: a rounded top, golden, three slashes across its crust."""
    h = 3 if w <= 5 else 4
    for j in range(h):
        inset = 1 if j == 0 else 0
        for i in range(inset, w - inset):
            c = 6 if j == 0 else 5 if j == 1 else 3 if j == h - 1 else 4
            if i == 0 and j > 0:
                c += 1
            if i == w - 1:
                c -= 1
            sp.set(x + i, y + j, tone(pal, c), part)
    if scored:
        for i in range(2, w - 1, 2):
            sp.set(x + i, y, tone(pal, 7), part)
            sp.set(x + i - 1, y + 1, tone(pal, 3), part)


def basket(sp, x0, x1, y0, y1, part):
    """A woven basket: a lit rim, then a checker of wicker."""
    for x in range(x0, x1 + 1):
        sp.set(x, y0, tone(WICKER, 6 if x < x1 else 5), part)
    for y in range(y0 + 1, y1 + 1):
        for x in range(x0, x1 + 1):
            c = 4 if (x + y) % 2 else 3
            if x == x0:
                c += 1
            elif x == x1:
                c -= 1
            if y == y1:
                c -= 1
            sp.set(x, y, tone(WICKER, c), part)


def stall_bread():
    """A baker's: round and long loaves heaped on the counter, a basket of rolls and a tall one of baguettes."""
    def goods(sp):
        # a tall basket of baguettes at the left, leaning out of it
        for k, (x, top, lean) in enumerate(((6, 21, -1), (8, 20, 0), (10, 22, 1))):
            for y in range(top, 30):
                xx = x + (lean if y < top + 3 else 0)
                sp.set(xx, y, BREAD[6] if y < top + 2 else BREAD[5], 4)
                sp.set(xx + 1, y, BREAD[3], 4)
            for y in range(top + 2, 29, 3):
                sp.set(x + 1, y, BREAD[7], 4)
        basket(sp, 5, 12, 28, 33, 5)
        # a round loaf and two long ones heaped in the middle
        loaf(sp, 13, 29, 7, 6)
        loaf(sp, 15, 26, 6, 6)
        for y in range(27, 33):  # a round cob on the right
            for x in range(21, 28):
                dx, dy = (x + 0.5 - 24.5) / 3.6, (y + 0.5 - 30.5) / 3.6
                if dx * dx + dy * dy > 1 or y > 33:
                    continue
                v = dx * LIGHT[0] + dy * LIGHT[1] + math.sqrt(max(0, 1 - dx * dx - dy * dy)) * LIGHT[2]
                sp.set(x, y, band(v, BREAD[1:8], -0.5, 1.0), 6)
        for x, y in ((23, 28), (24, 29), (25, 30), (26, 29)):   # the cross cut in its top
            sp.set(x, y, BREAD[7] if y < 30 else BREAD[3], 6)
        sp.set(22, 30, BREAD[3], 6)
        sp.set(23, 31, BREAD[7], 6)
        # a little basket of rolls on the front lip
        basket(sp, 14, 19, 32, 34, 7)
        for x in (14, 16, 18):
            sp.set(x, 31, BREAD[6], 7)
            sp.set(x + 1, 31, BREAD[4], 7)
        # a little painted board hung on the counter's front: a loaf on cream
        sign_board(sp, 12, 38, 19, 43, CANVAS, 3)
        put_rows(sp, 13, 39, [".aaaa.", "aLdLdb", "bbbbbc", ".cccc."],
                 {"a": BREAD[6], "L": BREAD[7], "d": BREAD[3], "b": BREAD[4], "c": BREAD[2]}, 3)
    sp = stall_frame("stall_bread", GREEN, YELLOW, goods)
    return finish(sp)


# ---------- the vendors' hand carts ----------

def wheel(sp, wcx, wcy, r, part, spokes=4):
    """A small spoked wheel facing us: an iron tyre, a wooden felloe, spokes, a hub."""
    ring = {}
    for y in range(int(wcy - r) - 1, int(wcy + r) + 2):
        for x in range(int(wcx - r) - 1, int(wcx + r) + 2):
            d = math.hypot((x + 0.5 - wcx) / r, (y + 0.5 - wcy) / r)
            if d <= 1:
                ring[(x, y)] = (d, math.atan2(y + 0.5 - wcy, x + 0.5 - wcx))
    for (x, y), (d, a) in ring.items():
        if d <= 0.62:
            sp.set(x, y, PLANK[1], part)               # the dark under the cart, seen between the spokes
    for k in range(spokes):
        a = k * math.pi / (spokes / 2) + math.pi / 4
        for s in np.linspace(0, r * 0.7, 6):
            x, y = int(math.floor(wcx + math.cos(a) * s)), int(math.floor(wcy + math.sin(a) * s))
            sp.set(x, y, PLANK[6] if math.sin(a) < 0 else PLANK[5], part)
    for (x, y), (d, a) in ring.items():
        lit = math.cos(a) * LIGHT[0] + math.sin(a) * LIGHT[1]
        if d > 0.8:
            sp.set(x, y, IRON[max(2, min(7, 4 + int(round(lit * 3))))], part)
        elif d > 0.62:
            sp.set(x, y, PLANK[max(2, min(7, 5 + int(round(lit * 2))))], part)
    hx_, hy = int(math.floor(wcx)), int(math.floor(wcy))
    sp.set(hx_ - 1, hy - 1, IRON[7], part)
    sp.set(hx_, hy - 1, IRON[5], part)
    sp.set(hx_ - 1, hy, IRON[5], part)
    sp.set(hx_, hy, IRON[3], part)


def cart_body(sp, oy, paint, emblem):
    """A little painted vendor's cart, 2 tiles long: a box on two spoked wheels, a push-handle at the right.
    oy moves it down (room for a parasol above). Returns the y of the box's top rim."""
    top = 13 + oy
    # the push handle, behind the box at the right
    line(sp, [(26, top + 4), (29, top + 1)], PLANK[5], part=0)
    line(sp, [(26, top + 5), (29, top + 2)], PLANK[3], part=0)
    sp.set(30, top, PLANK[7], 0)
    sp.set(30, top + 1, PLANK[5], 0)
    sp.set(29, top, PLANK[6], 0)
    # the box: a lit rim, then painted boards framed in plain wood
    for x in range(3, 27):
        sp.set(x, top, tone(PLANK, 8 if x < 24 else 7), 2)
        sp.set(x, top + 1, tone(PLANK, 5), 2)
    for y in range(top + 2, top + 10):
        for x in range(3, 27):
            if x in (3, 4) or x in (25, 26):
                c = PLANK[6] if x in (3, 25) else PLANK[4]
            elif y == top + 9:
                c = PLANK[3]
            elif y == top + 8:
                c = PLANK[5]
            else:
                k = (x - 5) % 5
                i = 4 if k else 2
                if k == 1:
                    i = 5
                if y == top + 2:
                    i -= 1                                  # the rim's shade
                c = tone(paint, i)
            sp.set(x, y, c, 2)
    for x in range(5, 25):                                   # a painted trim line
        sp.set(x, top + 6, tone(paint, 6 if x % 2 else 5), 2)
    emblem(sp, top)
    for x, y in ((4, top + 2), (25, top + 2), (4, top + 8), (25, top + 8)):
        sp.set(x, y, IRON[6] if x < 15 else IRON[5], 2)
    # the axle shade and the two wheels
    for x in range(5, 25):
        sp.set(x, top + 10, PLANK[1], 2)
    wheel(sp, 8.0, top + 13.0, 4.3, 3)
    wheel(sp, 22.0, top + 13.0, 4.3, 3)
    return top


def bottle(sp, x, y, glass, part, h=7, label=None):
    """A stoppered bottle, 3 px wide: a cork, a neck, a round-shouldered body lit on its left."""
    sp.set(x + 1, y, PLANK[6], part)
    sp.set(x + 1, y + 1, tone(glass, 4), part)
    for j in range(2, h):
        for i in range(3):
            c = 5 if i == 0 else 3 if i == 1 else 2
            if j == 2:
                c += 1
            if j == h - 1:
                c -= 1
            sp.set(x + i, y + j, tone(glass, c), part)
    sp.set(x, y + 3, tone(glass, len(glass) - 1), part)    # a glint
    if label:
        for i in range(3):
            sp.set(x + i, y + h - 3, label[0] if i < 2 else label[1], part)


def vendor_cart():
    """A fruit-and-juice seller's cart: a heap of red apples and a row of juice bottles in a teal-painted box on
    two wheels, a yellow-and-white parasol over it. (40 high: the parasol needs the room.)"""
    sp = Sprite(32, 40, "vendor_cart")
    sp.ground_shadow(18.5, 37.6, 14.5, 2.4)

    def emblem(sp, top):                                   # an apple painted on the front
        sign_board(sp, 12, top + 3, 18, top + 8, CANVAS, 2)
        put_rows(sp, 13, top + 4, ["..l..", ".aab.", ".abc.", "..c.."],
                 {"l": CABBAGE[4], "a": APPLE[5], "b": APPLE[4], "c": APPLE[2]}, 2)

    # the parasol's pole, standing in the box
    post(sp, 15, 13, 22, PLANK, 0, lit=6, dark=4)
    top = cart_body(sp, 8, TEAL, emblem)
    # the goods: apples heaped on the left, juice bottles standing on the right
    fruit_heap(sp, 4, 14, top - 1, 5, APPLE, 1, seed=11)
    for y in range(top - 5, top):
        for x in range(4, 15):
            if sp.part[y, x] == 1 and _idx(APPLE, sp.obj[y, x]) == 4 and (x * 3 + y) % 7 == 0:
                sp.set(x, y - 1 if not sp.has(x, y - 1) else y, CABBAGE[4], 1)   # a leaf on a stalk here and there
    for i, (x, h, g) in enumerate(((16, 7, JUICE), (19, 8, GLASS_G), (22, 7, JUICE))):
        bottle(sp, x, top - h + 1, g, 1, h=h, label=(CANVAS[5], CANVAS[3]))
    # the parasol: a dome of 10 gores, yellow and white, lit on its left, a scalloped hem, a gold knob on top
    ax, ay = 15.5, 2.6                                      # the top of the dome
    rcx, rcy, rrx, rry = 15.5, 10.0, 13.6, 3.0             # its rim
    NG = 10
    best = {}
    for i in range(900):
        th = i / 900 * 2 * math.pi
        rimx, rimy = rcx + rrx * math.cos(th), rcy + rry * math.sin(th)
        g = int(th / (2 * math.pi) * NG) % NG
        for j in range(80):
            s_ = j / 79
            x = ax + (rimx - ax) * s_
            y = ay + (rimy - ay) * s_ - 2.4 * math.sin(math.pi * s_ * 0.9)
            depth = math.sin(th) * s_
            key = (int(math.floor(x)), int(math.floor(y)))
            if depth > best.get(key, (-9,))[0]:
                lit = -math.cos(th) * 0.55 - math.sin(th) * 0.15 + (1 - s_) * 0.35
                best[key] = (depth, g, lit)
    for (x, y), (depth, g, lit) in best.items():
        p = YELLOW if g % 2 == 0 else CANVAS
        c = len(p) - 3 + int(round(lit * 2.6))
        sp.set(x, y, tone(p, c), 4)
    for i in range(400):                                    # the scalloped hem along the front
        th = i / 400 * math.pi
        u = (th / (2 * math.pi) * NG) % 1
        g = int(th / (2 * math.pi) * NG) % NG
        p = YELLOW if g % 2 == 0 else CANVAS
        x, y = int(math.floor(rcx + rrx * math.cos(th))), int(math.floor(rcy + rry * math.sin(th)))
        if 0.12 < u < 0.88:
            sp.set(x, y + 1, tone(p, 2 if math.cos(th) > 0.3 else 3), 4)
        if 0.3 < u < 0.7:
            sp.set(x, y + 2, tone(p, 2), 4)
    put_rows(sp, 14, 1, [".hg.", "gGGd"], {"g": GOLD[5], "h": GOLD[7], "G": GOLD[6], "d": GOLD[3]}, 4)
    _cast(sp, APPLE, 1, skip=(4,))
    return finish(sp)


def vendor_cart_flowers():
    """A flower seller's cart: zinc buckets of tulips and sunflowers and clay pots of lavender and daisies in a
    rose-painted box on two wheels, a few stems lying on the rim."""
    sp = Sprite(32, 32, "vendor_cart_flowers")
    sp.ground_shadow(18.5, 29.6, 14.5, 2.4)
    ROSE = ramp("#2a0c18 #4a1426 #6e2036 #943048 #b84860 #d46a7c #ec96a4 #fcc8cc")

    def emblem(sp, top):                                   # a flower painted on the front
        sign_board(sp, 12, top + 3, 18, top + 8, CANVAS, 2)
        put_rows(sp, 13, top + 4, [".y.y.", "..o..", ".y.y.", "..g.."],
                 {"y": FLOWER["y"][3], "o": FLOWER["o"][2], "g": CABBAGE[3]}, 2)

    top = cart_body(sp, 0, ROSE, emblem)

    def stems(x0, x1, ytop, ybot, seed):
        rng = np.random.default_rng(seed)
        tips = []
        for x in range(x0, x1 + 1):
            t = ytop + int(rng.integers(0, 3))
            for y in range(t, ybot + 1):
                if (x + y) % 2 == 0 or y > t + 1:
                    sp.set(x, y, CABBAGE[3] if x % 2 else CABBAGE[2], 1)
            tips.append((x, t))
        return tips

    def bucket(x0, x1, y0, y1):
        for x in range(x0, x1 + 1):
            sp.set(x, y0, IRON[8] if x < x1 else IRON[6], 2)
        for y in range(y0 + 1, y1 + 1):
            for x in range(x0, x1 + 1):
                c = 6 if x == x0 else 4 if x == x1 else 5
                if y == y0 + 2:
                    c -= 2                                  # a ridge round the bucket
                sp.set(x, y, IRON[c], 2)

    def pot(x0, x1, y0, y1):
        for x in range(x0, x1 + 1):
            sp.set(x, y0, TERRA[6] if x < x1 else TERRA[5], 2)
            sp.set(x, y0 + 1, TERRA[3], 2)
        for y in range(y0 + 2, y1 + 1):
            inset = 1 if y == y1 else 0
            for x in range(x0 + inset, x1 + 1 - inset):
                c = 5 if x == x0 + inset else 2 if x == x1 - inset else 4
                sp.set(x, y, TERRA[c], 2)

    # red tulips in the left bucket
    for x, y in stems(5, 9, 5, 12, 1):
        if x % 2 == 1:
            put_rows(sp, x - 1, y - 2, ["r.r", "rRr", ".r."], {"r": FLOWER["r"][2], "R": FLOWER["r"][3]}, 1)
            sp.set(x - 1, y - 2, FLOWER["r"][4], 1)
    bucket(4, 10, 10, 14)
    # sunflowers, tall, in the middle bucket
    stems(13, 16, 3, 12, 2)
    for fx, fy in ((13, 3), (17, 4)):
        put_rows(sp, fx - 2, fy - 2, [".yyy.", "yybyy", "ybbby", "yybyy", ".yyy."],
                 {"y": FLOWER["y"][3], "b": PLANK[2]}, 1)
        sp.set(fx - 1, fy - 2, FLOWER["y"][4], 1)
        sp.set(fx - 2, fy - 1, FLOWER["y"][4], 1)
        sp.set(fx + 2, fy + 1, FLOWER["y"][2], 1)
        sp.set(fx, fy, PLANK[4], 1)
    sp.set(15, 9, CABBAGE[4], 1)
    sp.set(16, 8, CABBAGE[4], 1)
    sp.set(13, 8, CABBAGE[4], 1)
    bucket(12, 18, 10, 14)
    # lavender and daisies in clay pots on the right
    for x in range(20, 24):
        for y in range(5 + (x % 2), 11):
            sp.set(x, y, FLOWER["p"][3 if (x + y) % 2 else 2] if y < 9 else CABBAGE[3], 1)
        sp.set(x, 4 + (x % 2), FLOWER["p"][4], 1)
    pot(19, 24, 10, 13)
    for k, (x, y) in enumerate(((25, 7), (27, 8), (26, 6), (28, 6))):
        put_rows(sp, x - 1, y - 1, [".w.", "wow", ".w."], {"w": FLOWER["w"][3], "o": FLOWER["y"][3]}, 1)
    for x in range(25, 29):
        sp.set(x, 9, CABBAGE[3], 1)
        sp.set(x, 10, CABBAGE[2], 1)
    pot(24, 28, 11, 13)
    # a few cut stems lying on the rim
    for x in range(5, 11):
        sp.set(x, top, CABBAGE[4] if x < 10 else CABBAGE[3], 2)
    put_rows(sp, 10, top - 1, ["rr", "rR"], {"r": FLOWER["p"][3], "R": FLOWER["p"][4]}, 2)
    _cast(sp, IRON, 1, skip=(1,))
    return finish(sp)


# ---------- out in the fields and streets ----------

def scarecrow():
    """A scarecrow on a post: a sack head with a stitched face under a wide straw hat, a patched blue shirt on a
    cross-bar, straw sticking out of the sleeves, the collar and the hem; a crow perched on one arm."""
    sp = Sprite(16, 32, "scarecrow")
    sp.ground_shadow(9.5, 30.3, 5.5, 1.6)
    post(sp, 7, 18, 30, PLANK, 0, lit=5, dark=3)
    sp.set(7, 30, PLANK[3], 0)
    # straw hanging below the shirt
    for x in range(4, 12):
        for y in range(21, 24 + (x % 2)):
            if (x + y) % 3 != 0 or y == 21:
                sp.set(x, y, HAY[6] if (x + y) % 2 else HAY[4], 1)
    # the shirt: body and sleeves, faded blue, lit on the left; patches and stitches
    for y in range(12, 22):
        for x in range(4, 12):
            c = 4 if x > 5 else 5
            if x >= 10:
                c = 3
            if y == 21:
                c -= 1
            sp.set(x, y, DENIM[c], 2)
    for y in range(12, 16):
        for x in list(range(2, 4)) + list(range(12, 14)):
            c = 5 if y == 12 else 4 if y < 15 else 2
            if x >= 12:
                c -= 1
            sp.set(x, y, DENIM[c], 2)
    for y in range(13, 22):                                 # the button placket
        sp.set(8, y, DENIM[2], 2)
    for y in (14, 17, 20):
        sp.set(8, y, CANVAS[4], 2)
    rect(sp, 5, 17, 6, 19, RED[5], 2)                        # a red patch, stitched
    sp.set(5, 17, RED[6], 2)
    sp.set(6, 19, RED[3], 2)
    rect(sp, 10, 13, 11, 14, YELLOW[4], 2)                   # a yellow one on the shoulder
    sp.set(10, 13, YELLOW[6], 2)
    for x, y in ((4, 16), (7, 18), (9, 13)):
        sp.set(x, y, DENIM[1], 2)
    # straw out of the cuffs and the collar
    for x, y, c in ((1, 12, 6), (1, 14, 5), (2, 16, 4), (14, 12, 4), (14, 14, 3), (13, 16, 3), (1, 13, 4),
                    (14, 13, 3)):
        sp.set(x, y, HAY[c], 3)
    for x, y, c in ((6, 11, 6), (9, 11, 4), (7, 11, 5)):
        sp.set(x, y, HAY[c], 3)
    # the head: a sack, round, tied at the neck with string
    for y in range(5, 12):
        for x in range(4, 12):
            dx, dy = (x + 0.5 - 7.9) / 3.3, (y + 0.5 - 8.3) / 3.4
            if dx * dx + dy * dy > 1:
                continue
            v = dx * LIGHT[0] + dy * LIGHT[1] + math.sqrt(max(0, 1 - dx * dx - dy * dy)) * LIGHT[2]
            sp.set(x, y, band(v, SACK[1:], -0.45, 1.0), 4)
    for x in range(6, 10):
        sp.set(x, 11, ROPE[2] if x % 2 else ROPE[3], 4)
    for x, y in ((6, 8), (9, 8)):                            # button eyes with a glint, a stitched smile
        sp.set(x, y, OUTLINE, 4)
    sp.set(6, 7, SACK[6], 4)
    for x, y in ((6, 9), (7, 10), (8, 10), (9, 9)):
        sp.set(x, y, SACK[1], 4)
    sp.set(5, 9, RED[6], 4)                                  # rosy cheeks
    sp.set(10, 9, RED[4], 4)
    # the straw hat: a wide brim, a crown with a red band
    for x in range(1, 15):
        y = 5 if 3 <= x <= 12 else 6
        sp.set(x, y, HAY[7] if x < 9 else HAY[5], 5)
        sp.set(x, y + 1, HAY[4] if x < 9 else HAY[3], 5)
    sp.set(1, 7, HAY[3], 5)
    sp.set(14, 7, HAY[2], 5)
    for y in range(1, 5):
        for x in range(5, 10):
            if y == 1 and not 6 <= x <= 8:
                continue
            c = 7 if x < 7 else 6 if x < 8 else 4
            if y == 4:
                sp.set(x, y, RED[5] if x < 8 else RED[3], 5)
                continue
            sp.set(x, y, HAY[c], 5)
    for x, y in ((6, 2), (8, 3), (7, 2)):
        sp.set(x, y, HAY[5], 5)                              # woven straw
    for x, y in ((3, 7), (12, 7), (2, 8)):
        sp.set(x, y, HAY[6] if x < 8 else HAY[4], 5)         # straw from under the hat
    # a crow perched on the hat's brim, looking out
    CROW = ramp("#0a0810 #16121e #241e30 #362e46 #4c4262")
    put_rows(sp, 10, 1, ["..hh.", ".whEb", "twww.", "..f.."],
             {"h": CROW[3], "E": CANVAS[6], "b": YELLOW[5], "w": CROW[2], "t": CROW[1], "f": YELLOW[3]}, 6)
    sp.set(11, 2, CROW[4], 6)
    return finish(sp)


def shop_sign(name, board, icon):
    """A hanging shop sign: a post with an arm at its top and a brace, a painted board hung on two rings,
    an icon on it. board: the board's paint ramp; icon(sp): paints the icon in the 8x8 at (6, 9)."""
    sp = Sprite(16, 32, name)
    sp.ground_shadow(8.5, 30.3, 5.0, 1.5)
    post(sp, 2, 3, 30, PLANK, 0, lit=6, dark=3)
    sp.set(2, 2, PLANK[7], 0)                                # a rounded cap
    sp.set(3, 2, PLANK[5], 0)
    for x in range(1, 5):                                    # a stone at its foot
        sp.set(x, 30, COLUMN[5] if x < 3 else COLUMN[3], 0)
    sp.set(1, 29, COLUMN[6], 0)
    sp.set(4, 29, COLUMN[4], 0)
    for x in range(4, 15):                                   # the arm, its end carved round
        sp.set(x, 4, PLANK[6] if x < 14 else PLANK[5], 1)
        sp.set(x, 5, PLANK[3], 1)
    sp.set(14, 3, PLANK[6], 1)
    line(sp, [(4, 10), (8, 6)], PLANK[5], part=1)            # the brace
    sp.set(5, 10, PLANK[3], 1)
    for x in (6, 12):                                        # rings
        sp.set(x, 6, IRON[6], 1)
        sp.set(x, 7, IRON[4], 1)
    # the board: a lit top edge, a painted face framed in wood
    sign_board(sp, 5, 8, 14, 19, board, 2)
    for x in range(6, 14):
        sp.set(x, 18, tone(board, len(board) - 4), 2)       # the frame's shade inside the bottom
    icon(sp)
    return finish(sp)


def sign_tavern():
    """The tavern's sign: a frothy mug of ale on a dark green board."""
    def icon(sp):
        put_rows(sp, 6, 9, [".fF.f...", "fFFFFf..", "fffffd..", "aAAaad..", "aAaaadhh", "aAaaad.h",
                            "aAaaadhh", ".aaad..."],
                 {"f": CANVAS[5], "F": CANVAS[6], "d": CANVAS[3], "a": GLASS_A[4], "A": GLASS_A[5],
                  "h": GLASS_A[3]}, 3)
        sp.set(7, 15, GLASS_A[6], 3)
    return finish_sign("sign_tavern", GREENBAIZE + [hx("#4a8a4a")], icon)


def sign_bakery():
    """The bakery's sign: a golden scored loaf on a cream board."""
    def icon(sp):
        put_rows(sp, 6, 11, ["..aaaaa.", ".aaLdaLd", "aaLdaLdb", "abbbbbbc", ".cccccc."],
                 {"a": BREAD[6], "L": BREAD[7], "d": BREAD[3], "b": BREAD[4], "c": BREAD[2]}, 3)
    return finish_sign("sign_bakery", ramp("#5a4a3a #8a765c #b8a07c #d8c49a #ecdcb6 #f8eed4"), icon)


def sign_potion():
    """The apothecary's sign: a round potion bottle, pink and glowing, on a deep purple board."""
    def icon(sp):
        put_rows(sp, 6, 9, ["...cc...", "...nn...", "..nnnn..", ".pPPppq.", "pPWPpppq", "pPPpppqq",
                            "ppppqqqq", ".pqqqq.."],
                 {"c": PLANK[6], "n": CANVAS[4], "p": POTION[5], "P": POTION[6], "W": POTION[7],
                  "q": POTION[3]}, 3)
    return finish_sign("sign_potion", ramp("#140a20 #20102e #2e1840 #3c2052 #4a2a64 #5a3478"), icon)


def sign_smith():
    """The smithy's sign: an anvil and a hammer on a brick-red board."""
    def icon(sp):
        put_rows(sp, 6, 9, ["......HH", ".....wHh", "....w...", "AAAAAAA.", ".aAAAAd.", "...ad...",
                            "..aaad..", ".aaaadd."],
                 {"H": IRON[7], "h": IRON[5], "w": PLANK[6], "A": IRON[7], "a": IRON[5], "d": IRON[3]}, 3)
    return finish_sign("sign_smith", ramp("#2a0c0c #44141a #5e1e20 #7a2a26 #94382c #ae4a34"), icon)


def finish_sign(name, board, icon):
    return shop_sign(name, board, icon)


def lamp_post():
    """A street lamp: a dark iron post on a stepped foot, a ring halfway up, little scrolls under a four-sided
    lantern whose glass glows warm round a candle flame, a pointed cap and a finial."""
    sp = Sprite(16, 48, "lamp_post")
    sp.ground_shadow(9.5, 46.3, 5.0, 1.4)
    I = IRON
    for y in range(40, 47):                                  # the foot: two steps
        a, b = (5, 10) if y < 44 else (4, 11)
        for x in range(a, b + 1):
            c = 4 if x < 8 else 3
            if x == a:
                c = 5
            if y in (40, 44):
                c = 6 if x < b else 4
            if x == b:
                c = 2
            sp.set(x, y, I[c], 0)
    for y in range(17, 40):                                  # the post
        sp.set(7, y, I[5], 0)
        sp.set(8, y, I[2], 0)
    for y, w in ((29, 1), (30, 1), (38, 1), (39, 1)):        # collars
        sp.set(6, y, I[5], 0)
        sp.set(9, y, I[2], 0)
        sp.set(7, y, I[6] if y in (29, 38) else I[4], 0)
        sp.set(8, y, I[3], 0)
    # scrolls holding the lantern
    put_rows(sp, 4, 15, [".ab..ba.", "a..aa..a", ".b.ab.b."], {"a": I[5], "b": I[3]}, 1)
    # the lantern: a tray, glass panes in a frame, a pointed cap, a finial
    for x in range(4, 12):
        sp.set(x, 14, I[6] if x < 10 else I[4], 2)
    for y in range(7, 14):
        for x in range(4, 12):
            if x in (4, 7, 11) or y == 7:
                c = I[5] if x == 4 else I[3] if x == 11 else I[4]
                if y == 7:
                    c = I[6] if x < 9 else I[4]
            else:
                # the glass: brightest round the flame, a warmer orange towards the frame
                d = math.hypot((x + 0.5 - 8.0) / 2.6, (y + 0.5 - 11.0) / 3.0)
                c = GLOW[5] if d < 0.55 else GLOW[4] if d < 0.95 else GLOW[3]
                if x in (5, 6):
                    c = GLOW[4] if d < 0.95 else GLOW[3]     # the side pane, turned away a little
            sp.set(x, y, c, 2)
    sp.set(9, 10, FLAME_CORE, 2)                              # the flame
    sp.set(9, 11, GLOW[5], 2)
    sp.set(9, 12, CANVAS[5], 2)                              # the candle
    sp.set(9, 13, CANVAS[4], 2)
    sp.set(5, 8, GLOW[5], 2)                                 # glints on the glass
    for y in range(3, 7):                                    # the cap
        half = (y - 2) * 1.6
        for x in range(4, 12):
            if abs(x + 0.5 - 8) > half + 0.3:
                continue
            c = I[6] if x < 8 else I[3]
            if y == 6:
                c = I[5] if x < 9 else I[3]
            sp.set(x, y, c, 3)
    sp.set(3, 6, I[4], 3)
    sp.set(12, 6, I[2], 3)
    sp.set(7, 2, I[6], 3)
    sp.set(8, 2, I[4], 3)
    sp.set(7, 1, I[7], 3)
    return finish(sp)


# ---------- the square, the tavern, the shops ----------

def bench():
    """A bench for the square: two backrest slats and a seat of two planks on dark iron ends, the arms curling
    over at the front; open underneath, so the ground and its shadow show between the legs."""
    sp = Sprite(32, 16, "bench")
    sp.ground_shadow(17.5, 13.6, 14.0, 2.0)
    I = IRON
    for y0 in (1, 4):                                        # the backrest: two slats, each lit along its top
        for x in range(5, 27):
            for k, c in ((0, 6), (1, 4)):
                cc = c + (1 if x == 5 else -1 if x == 26 else 0)
                sp.set(x, y0 + k, PLANK[cc], 0)
    for x in range(6, 26):
        sp.set(x, 3, PLANK[1], 0)                            # the gap between the slats
    for x in (11, 20):                                       # two uprights holding the slats
        for y in range(1, 7):
            sp.set(x, y, PLANK[3], 0)
        sp.set(x, 6, PLANK[2], 0)
    top_boards(sp, 3, 28, 7, 9, PLANK, 1, hi=6, seam_rows=(8,))
    for x in range(3, 29):                                   # the seat's front edge
        sp.set(x, 10, PLANK[4] if x > 3 else PLANK[5], 1)
    for ex, lit in ((3, True), (26, False)):                 # the iron ends: back post, curled arm, two feet
        a, b = (I[6], I[3]) if lit else (I[4], I[2])
        for y in range(1, 7):
            sp.set(ex + 1, y, a, 2)
            sp.set(ex + 2, y, b, 2)
        put_rows(sp, ex, 5, ["abbc", "a..c"] if lit else ["cbba", "c..a"], {"a": a, "b": I[5], "c": b}, 2)
        for y in range(11, 14):                              # the legs, splayed into feet
            sp.set(ex + 1, y, a, 2)
            sp.set(ex + 2, y, b, 2)
        sp.set(ex, 13, a, 2)
        sp.set(ex + 3, 13, b, 2)
    sp.set(4, 1, I[7], 2)
    sp.set(27, 1, I[5], 2)
    sp.set(15, 11, I[3], 2)
    sp.set(15, 12, I[2], 2)
    sp.set(16, 11, I[2], 2)
    sp.set(16, 12, I[1], 2)
    return finish(sp)


def mug(sp, x, y, part, wood=True):
    """A tankard: 3 px wide, a foam head, banded staves, a handle on the right."""
    sp.set(x, y, CANVAS[6], part)
    sp.set(x + 1, y, CANVAS[5], part)
    sp.set(x + 2, y, CANVAS[4], part)
    for j in range(1, 4):
        sp.set(x, y + j, PLANK[6], part)
        sp.set(x + 1, y + j, PLANK[5], part)
        sp.set(x + 2, y + j, PLANK[3], part)
    sp.set(x, y + 2, IRON[6], part)
    sp.set(x + 1, y + 2, IRON[5], part)
    sp.set(x + 2, y + 2, IRON[3], part)
    sp.set(x + 3, y + 1, PLANK[4], part)
    sp.set(x + 3, y + 2, PLANK[3], part)


def stool(sp, cx, part, cy=22.0):
    """A round three-legged stool, a darker wood than the table: a lit round seat, its rim, three legs splaying
    a little."""
    W = PLANK[:-1]
    for y in range(int(cy) - 2, int(cy) + 2):
        for x in range(int(cx - 4), int(cx + 4)):
            dx, dy = (x + 0.5 - cx) / 3.6, (y + 0.5 - cy) / 1.9
            if dx * dx + dy * dy > 1:
                continue
            c = 6 if dy < 0.1 and dx < 0.3 else 5 if dy < 0.4 else 3
            if dx > 0.6:
                c -= 1
            sp.set(x, y, W[c], part)
    yr = int(cy) + 2
    for x in range(int(cx - 3), int(cx + 3)):
        sp.set(x, yr, W[2] if x > cx else W[3], part)
    for lx, c in ((cx - 3, 4), (cx + 2, 2)):
        for y in range(yr + 1, 30):
            sp.set(int(lx) - (1 if y > 27 and lx < cx else 0) + (1 if y > 27 and lx > cx else 0), y, W[c], part)
    for y in range(yr + 1, 28):
        sp.set(int(cx), y, W[1], part)                       # the back leg, in shade


def table():
    """A tavern table: a top of three planks, a skirt and four legs, a round stool tucked at each end; two
    tankards of ale, a plate of bread and cheese, a candle stub."""
    sp = Sprite(32, 32, "table")
    sp.ground_shadow(17.5, 29.6, 15.0, 2.3)
    stool(sp, 5.0, 0)
    stool(sp, 27.0, 0)
    X0, X1 = 6, 25
    for lx in (8, 22):                                       # the back legs, in the shade under the top
        for y in range(20, 27):
            sp.set(lx, y, PLANK[2], 1)
    top_boards(sp, X0, X1, 12, 18, PLANK, 2, hi=6, seam_rows=(14, 16))
    for x in range(X0, X1 + 1):                              # the skirt
        sp.set(x, 19, PLANK[4] if x > X0 else PLANK[5], 2)
        sp.set(x, 20, PLANK[3], 2)
    for x, y in ((10, 13), (17, 15), (21, 13), (13, 17)):    # knots, a scratch
        sp.set(x, y, PLANK[5], 2)
    for lx in (X0, X1 - 1):                                  # the front legs
        for y in range(19, 30):
            sp.set(lx, y, PLANK[6] if lx == X0 else PLANK[5], 3)
            sp.set(lx + 1, y, PLANK[3], 3)
    # on the table: two tankards, a plate of bread and cheese, a candle stub
    mug(sp, 8, 10, 4)
    mug(sp, 20, 12, 4)
    for y in range(13, 17):                                  # the plate
        for x in range(11, 19):
            dx, dy = (x + 0.5 - 15) / 3.8, (y + 0.5 - 15) / 1.7
            if dx * dx + dy * dy > 1:
                continue
            c = 5 if dy < 0 else 4
            if dx * dx + dy * dy > 0.55:
                c = 3 if dy > 0 else 5
            sp.set(x, y, CANVAS[c], 4)
    loaf(sp, 12, 13, 4, 4, scored=False)
    put_rows(sp, 16, 13, [".yy", "YYy"], {"y": YELLOW[5], "Y": YELLOW[6]}, 4)   # a wedge of cheese
    sp.set(17, 14, YELLOW[4], 4)
    put_rows(sp, 23, 13, ["f", "w", "w", "b"], {"f": GLOW[5], "w": CANVAS[5], "b": IRON[4]}, 4)
    sp.set(23, 12, FLAME_CORE, 4)
    _cast(sp, PLANK, 1, skip=(0, 1, 3))
    return finish(sp)


def counter():
    """A bar or shop counter, 3 tiles long: a polished top with a lit lip, a front of three raised panels on a
    plinth; on it two tankards, a green bottle, a little brass scale with its weights, a ledger."""
    sp = Sprite(48, 32, "counter")
    sp.ground_shadow(25.5, 29.6, 22.0, 2.3)
    X0, X1 = 2, 45
    top_boards(sp, X0, X1, 13, 17, PLANK, 0, hi=6, seam_rows=(15,))
    for x in range(X0, X1 + 1):                              # the front: a moulding, panels, a plinth
        sp.set(x, 18, PLANK[3], 1)
        for y in range(19, 30):
            c = 4
            if y == 19:
                c = 5
            if y >= 28:
                c = 5 if y == 28 else 2
            if x == X0:
                c += 1
            elif x == X1:
                c -= 1
            sp.set(x, y, PLANK[c], 1)
    for k in range(3):                                       # the raised panels
        a, b = X0 + 2 + k * 14, X0 + 13 + k * 14
        for y in range(21, 27):
            for x in range(a, b + 1):
                if y == 21 or x == a:
                    c = 6                                    # the bevel facing the light
                elif y == 26 or x == b:
                    c = 2                                    # the bevel in shade
                else:
                    c = 4 if (x - a) % 4 else 3
                sp.set(x, y, PLANK[c], 1)
    # the ledger: a closed book on the left of the top
    put_rows(sp, 20, 13, ["pppppd", "ppppdd", "rrrrrd"], {"p": PAPER[5], "d": PAPER[3], "r": RED[4]}, 2)
    sp.set(20, 12, RED[5], 2)
    for x in range(21, 26):
        sp.set(x, 12, RED[5] if x < 24 else RED[4], 2)
    # tankards
    mug(sp, 5, 11, 2)
    mug(sp, 10, 12, 2)
    # a tall green bottle
    sp.set(16, 4, PLANK[6], 2)
    for y in range(5, 8):
        sp.set(16, y, GLASS_G[4], 2)
    for y in range(8, 16):
        for i, c in enumerate((5, 3, 2)):
            sp.set(15 + i, y, GLASS_G[c if y > 8 else c + 1], 2)
    sp.set(15, 10, GLASS_G[6], 2)
    for i in range(3):
        sp.set(15 + i, 12, CANVAS[5 - i], 2)
        sp.set(15 + i, 13, CANVAS[4 - i], 2)
    # the brass scale: a foot, a pillar, a beam, two pans on chains
    G = GOLD
    put_rows(sp, 33, 13, [".gGGGd.", "gGGGGdd"], {"g": G[5], "G": G[6], "d": G[3]}, 3)
    for y in range(4, 13):
        sp.set(36, y, G[6], 3)
        sp.set(37, y, G[3], 3)
    sp.set(36, 3, G[7], 3)
    for x in range(30, 44):
        sp.set(x, 5, G[6] if x < 37 else G[4], 3)
    for px in (30, 43):
        for y in range(6, 9):
            sp.set(px, y, IRON[5], 3)
        for x in range(px - 2, px + 3):
            sp.set(x, 9, G[6] if x < px else G[4], 3)
        for x in range(px - 1, px + 2):
            sp.set(x, 10, G[3], 3)
    put_rows(sp, 29, 7, [".r", "rR"], {"r": RED[5], "R": RED[6]}, 3)      # something weighed: a few cherries
    put_rows(sp, 42, 8, ["Gd"], {"G": G[6], "d": G[3]}, 3)            # a weight on the other pan
    put_rows(sp, 40, 15, ["gd", "Gd"], {"g": G[5], "G": G[6], "d": G[3]}, 3)   # spare weights on the counter
    sp.set(43, 16, G[5], 3)
    sp.set(44, 16, G[3], 3)
    _cast(sp, PLANK, 1, skip=(1,))
    return finish(sp)


def shelf_frame(name, pal, inner):
    """Shelves against a wall: two sides, a top seen a little from above, three shelves; inner(sp, rows) puts
    things on them (rows: the y each shelf's surface is at)."""
    sp = Sprite(32, 32, name)
    sp.ground_shadow(17.5, 29.7, 14.0, 1.9)
    X0, X1 = 2, 29
    for y in range(3, 30):                                   # the back boards, in shade
        for x in range(X0 + 2, X1 - 1):
            c = 2 if (x - X0) % 6 else 1
            sp.set(x, y, tone(pal, c), 0)
    rows = (11, 20, 28)
    for sy in rows:                                          # the shelves: a lit top, a front edge
        for x in range(X0 + 2, X1 - 1):
            sp.set(x, sy, tone(pal, 5), 1)
            sp.set(x, sy + 1, tone(pal, 3), 1)
        for x in range(X0 + 2, X1 - 1):                      # the shade under each shelf on the back
            if sy + 2 < 30:
                sp.set(x, sy + 2, tone(pal, 0), 0)
    inner(sp, rows)
    for y in range(1, 30):                                   # the sides
        sp.set(X0, y, tone(pal, 6), 2)
        sp.set(X0 + 1, y, tone(pal, 4), 2)
        sp.set(X1 - 1, y, tone(pal, 4), 2)
        sp.set(X1, y, tone(pal, 3), 2)
    for x in range(X0, X1 + 1):                              # the top: seen from a little above, a moulding
        sp.set(x, 1, tone(pal, 7 if x < X1 - 1 else 6), 2)
        sp.set(x, 2, tone(pal, 5), 2)
        sp.set(x, 3, tone(pal, 3), 2)
    for x in range(X0, X1 + 1):
        sp.set(x, 29, tone(pal, 3 if x > X0 else 4), 2)
    return sp


def jar(sp, x, y, w, h, fill, lid, part):
    """A glass jar: a cloth lid tied with string, the contents seen through the glass, a glint."""
    for i in range(w):
        sp.set(x + i, y, tone(lid, 5 if i < w - 1 else 3), part)
        sp.set(x + i, y + 1, ROPE[2], part)
    for j in range(2, h):
        for i in range(w):
            c = 4 if i == 0 else 2 if i == w - 1 else 3
            if j == h - 1:
                c -= 1
            sp.set(x + i, y + j, tone(fill, c), part)
    sp.set(x, y + 2, CANVAS[6], part)


def shelf():
    """Pantry shelves: jars of jam, pickles and honey on top, bottles in the middle, loaves and a crock below."""
    def inner(sp, rows):
        r0, r1, r2 = rows
        jar(sp, 5, r0 - 6, 4, 6, APPLE, CANVAS, 3)
        jar(sp, 10, r0 - 5, 3, 5, CABBAGE, RED, 3)
        jar(sp, 14, r0 - 7, 4, 7, GLASS_A, CANVAS, 3)
        jar(sp, 19, r0 - 5, 3, 5, PURPLE, CANVAS, 3)
        jar(sp, 23, r0 - 6, 3, 6, ORANGE, RED, 3)
        bottle(sp, 5, r1 - 7, GLASS_G, 3, h=7)
        bottle(sp, 9, r1 - 8, JUICE, 3, h=8, label=(CANVAS[5], CANVAS[3]))
        bottle(sp, 13, r1 - 6, POTION, 3, h=6)
        bottle(sp, 17, r1 - 7, GLASS_A, 3, h=7, label=(CANVAS[5], CANVAS[3]))
        bottle(sp, 22, r1 - 8, GLASS_G, 3, h=8)
        sp.set(26, r1 - 1, CANVAS[5], 3)                      # a little cup
        sp.set(25, r1 - 1, CANVAS[6], 3)
        sp.set(25, r1 - 2, CANVAS[4], 3)
        sp.set(26, r1 - 2, CANVAS[3], 3)
        loaf(sp, 5, r2 - 3, 6, 3)
        loaf(sp, 11, r2 - 4, 7, 3)
        for y in range(r2 - 6, r2):                           # a crock
            for i, c in enumerate((5, 4, 4, 3, 2)):
                sp.set(20 + i, y, TERRA[c + (1 if y == r2 - 6 else 0)], 3)
        for i in range(5):
            sp.set(20 + i, r2 - 4, CANVAS[5 - min(i, 2)], 3)
        _cast(sp, PLANK, 1, skip=(0, 1, 2))
    sp = shelf_frame("shelf", PLANK, inner)
    return finish(sp)


def shelf_books():
    """The Town Hall's bookcase: rows of books in many colours (gold bands on their spines, a few leaning),
    a pile of rolled scrolls tied with red ribbon, a candlestick."""
    def books(sp, x0, x1, base, seed, gaps=()):
        rng = np.random.default_rng(seed)
        pals = (RED, BLUE, GREEN, PURPLE, MAHOG, TEAL, YELLOW)
        x = x0
        while x <= x1 - 1:
            if x in gaps:
                x += 1
                continue
            p = pals[int(rng.integers(0, len(pals)))]
            h = int(rng.integers(5, 8))
            w = 2 if rng.random() < 0.75 else 3
            if x + w - 1 > x1:
                break
            for j in range(h):
                y = base - 1 - j
                for i in range(w):
                    c = 5 if i == 0 else 3 if i == w - 1 else 4
                    if j == h - 1:
                        c += 1                                 # the top of the book
                    sp.set(x + i, y, tone(p, c), 3)
            for i in range(w):
                sp.set(x + i, base - 3, GOLD[5] if i == 0 else GOLD[3], 3)   # gold bands
                if h > 6:
                    sp.set(x + i, base - h + 1, GOLD[4] if i == 0 else GOLD[3], 3)
            x += w

    def inner(sp, rows):
        r0, r1, r2 = rows
        books(sp, 4, 26, r0, 1)
        books(sp, 4, 16, r1, 2)
        # a leaning book and a pile of scrolls on the middle shelf
        for j in range(6):
            sp.set(18 + j // 2, r1 - 1 - j, RED[5], 3)
            sp.set(19 + j // 2, r1 - 1 - j, RED[3], 3)
        for x, y in ((21, r1 - 3), (24, r1 - 3), (22, r1 - 6)):
            put_rows(sp, x, y, [".pp", "pdp", "ppq"], {"p": PAPER[4], "d": PAPER[2], "q": PAPER[3]}, 3)
        for x in (22, 25):                                    # their red ribbons
            sp.set(x, r1 - 2, RED[5], 3)
        books(sp, 4, 20, r2, 3)
        # a candlestick on the bottom shelf
        put_rows(sp, 23, r2 - 7, [".f.", ".w.", ".w.", ".w.", ".g.", ".g.", "ggd"],
                 {"f": GLOW[5], "w": CANVAS[5], "g": GOLD[5], "d": GOLD[3]}, 3)
        sp.set(24, r2 - 8, FLAME_CORE, 3)
        _cast(sp, MAHOG, 1, skip=(0, 1, 2))
    sp = shelf_frame("shelf_books", MAHOG, inner)
    return finish(sp)


def separate(sp, pal):
    """A dark line on a part where a part in front of it meets it, so heaped things read as separate."""
    hits = []
    for y in range(sp.h):
        for x in range(sp.w):
            q = sp.part[y, x]
            if q < 0 or not sp.has(x, y):
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < sp.w and 0 <= yy < sp.h and sp.part[yy, xx] > q and sp.has(xx, yy):
                    hits.append((x, y))
                    break
    for x, y in hits:
        if _idx(pal, sp.obj[y, x]) is not None:
            sp.obj[y, x] = pal[0]


def sacks():
    """Three grain sacks leaning together, tied at the neck with string; a little grain spilt at their feet."""
    sp = Sprite(16, 16, "sacks")
    sp.ground_shadow(9.5, 14.3, 7.2, 1.8)
    blob(sp, 10.6, 8.6, 3.4, 5.2, SACK[1:], part=0, flat_bottom=13, seed=1, rough=0.08)   # the tall one at the back
    blob(sp, 4.6, 9.6, 3.2, 4.4, SACK[1:], part=1, flat_bottom=14, seed=2, rough=0.08)    # leaning on it
    blob(sp, 9.4, 11.6, 3.8, 2.9, SACK[1:], part=2, flat_bottom=14, seed=3, rough=0.08)   # slumped in front
    put_rows(sp, 9, 1, ["l.m", ".l.", "rrr"], {"l": SACK[5], "m": SACK[4], "r": ROPE[1]}, 0)
    put_rows(sp, 3, 3, ["lm.", ".m.", "rr."], {"l": SACK[5], "m": SACK[3], "r": ROPE[1]}, 1)
    for x, y in ((11, 6), (12, 9), (4, 8), (5, 11), (8, 12)):    # creases
        _shift(sp, x, y, SACK, -1)
    for x, y in ((9, 11), (10, 12), (11, 11)):                    # a stencilled mark
        sp.set(x, y, SACK[3], 2)
    separate(sp, SACK)
    _cast(sp, SACK, 1)
    for x, y, c in ((13, 14, 6), (14, 13, 5), (12, 14, 4), (2, 14, 5)):   # spilt grain
        sp.set(x, y, HAY[c], 3)
    return finish(sp)


def anvil():
    """A blacksmith's anvil on a stump: a lit face, a horn to the left, a waist and a foot; rings on the stump."""
    sp = Sprite(16, 16, "anvil")
    sp.ground_shadow(9.5, 14.4, 7.0, 1.8)
    I = IRON
    for y in range(8, 11):                                   # the stump's top, rings
        for x in range(3, 13):
            dx, dy = (x + 0.5 - 8) / 5.0, (y + 0.5 - 9.5) / 1.6
            if dx * dx + dy * dy > 1:
                continue
            r = math.hypot(dx, dy * 1.4)
            c = 7 if r < 0.35 else 6 if r < 0.7 else 5
            sp.set(x, y, PLANK[c], 0)
    for y in range(10, 15):                                  # its bark sides
        for x in range(3, 13):
            if y == 10 and not sp.has(x, y - 1):
                continue
            c = 4 if x < 6 else 3 if x < 10 else 2
            if (x * 3 + y) % 5 == 0:
                c -= 1
            sp.set(x, y, PLANK[c], 0)
    sp.set(2, 14, PLANK[3], 0)                               # roots
    sp.set(13, 14, PLANK[2], 0)
    # the anvil
    put_rows(sp, 1, 3, ["..hHHHHHHHHHh.", "hhGGGGGGGGGGgd", ".sggggggggggd.", "....FfffFd....",
                        ".....ffff.....", "....FFfffd....", "...Ffffffdd..."],
             {"h": I[7], "H": I[8], "G": I[6], "g": I[4], "d": I[2], "s": I[3], "F": I[5], "f": I[3]}, 1)
    sp.set(11, 4, I[7], 1)                                   # the hardy hole and a glint
    sp.set(10, 4, I[3], 1)
    return finish(sp)


def desk():
    """The mayor's writing desk: a dark polished top with a green leather inlay, papers, an inkpot and quill, a
    candle in a brass holder, a wax-sealed letter; two drawer pedestals; a high-backed red chair behind it."""
    sp = Sprite(32, 32, "desk")
    sp.ground_shadow(17.5, 29.6, 15.0, 2.3)
    M = MAHOG
    # the chair behind: a tall back, red upholstery buttoned, carved finials
    for y in range(3, 14):
        for x in range(11, 21):
            if x in (11, 20):
                c = M[6] if x == 11 else M[3]
            elif y == 3:
                c = M[7] if x < 18 else M[5]
            else:
                c = RED[5] if x < 14 else RED[4] if x < 18 else RED[3]
                if y == 4:
                    c = RED[3]
            sp.set(x, y, c, 0)
    for x, y in ((13, 6), (16, 6), (14, 9), (17, 9), (13, 12), (16, 12)):
        sp.set(x, y, RED[2], 0)
        sp.set(x, y - 1, RED[6], 0)
    for x, c in ((11, 7), (20, 5)):
        sp.set(x, 2, M[c], 0)
        sp.set(x, 1, M[c + 1], 0)
    for x in range(12, 20):
        sp.set(x, 2, M[6] if x < 17 else M[4], 0)
    sp.set(15, 1, M[7], 0)
    sp.set(16, 1, M[5], 0)
    # the desk top
    X0, X1 = 2, 29
    top_boards(sp, X0, X1, 13, 19, M, 1, hi=5)
    for y in range(14, 19):                                  # the leather inlay
        for x in range(6, 26):
            c = 3 if y > 14 else 2
            if x == 6:
                c = 2
            sp.set(x, y, GREENBAIZE[c] if (x + y) % 9 else GREENBAIZE[4], 1)
    for x in range(6, 26):
        sp.set(x, 18, M[7], 1)                               # the wood's lit lip in front of the inlay
    # the front: two drawer pedestals and the dark knee-hole between
    for y in range(20, 30):
        for x in range(X0, X1 + 1):
            if 11 <= x <= 20:
                c = M[1] if y > 20 else M[3]
                if y == 21:
                    c = M[2]
            else:
                c = M[4]
                if x == X0:
                    c = M[5]
                if x in (10, X1):
                    c = M[3]
                if y in (20, 29):
                    c = M[3] if y == 20 else M[2]
            sp.set(x, y, c, 2)
    for a, b in ((X0 + 1, 9), (22, X1 - 1)):                 # the drawers: panels, brass knobs
        for y0 in (21, 25):
            for x in range(a, b + 1):
                sp.set(x, y0, M[6] if x < b else M[5], 2)
                sp.set(x, y0 + 3, M[2], 2)
            kx = (a + b) // 2
            sp.set(kx, y0 + 1, GOLD[6], 2)
            sp.set(kx, y0 + 2, GOLD[3], 2)
    for x in range(X0, X1 + 1):
        if x < 11 or x > 20:
            sp.set(x, 20, M[3], 2)
    # on the desk: papers, an inkpot with a quill, a candle, a sealed letter
    put_rows(sp, 7, 13, ["pppppp.", "pllllpd", "ppppppd", "plllpd.", "pppppd."],
             {"p": PAPER[5], "l": PAPER[2], "d": PAPER[3]}, 3)
    put_rows(sp, 9, 12, ["qqqqq", ], {"q": PAPER[4]}, 3)
    put_rows(sp, 17, 13, ["..w", ".wW", "wW.", "b..", "Ii.", "ii."],
             {"w": CANVAS[6], "W": CANVAS[4], "b": IRON[1], "I": IRON[4], "i": IRON[2]}, 3)
    put_rows(sp, 25, 10, [".f.", ".F.", ".w.", ".w.", "gGd", ".d."],
             {"f": GLOW[4], "F": FLAME_CORE, "w": CANVAS[5], "g": GOLD[6], "G": GOLD[5], "d": GOLD[3]}, 3)
    put_rows(sp, 20, 16, ["pppp", "pprp", "pppd"], {"p": PAPER[4], "r": RED[5], "d": PAPER[2]}, 3)
    _cast(sp, MAHOG, 1, skip=(0,))
    _cast(sp, GREENBAIZE, 1, skip=(0,))
    return finish(sp)


# ---------- the fountain's centrepiece (an animated sprite, not a prop) ----------

FW, FH = 32, 48          # one frame
STONE = COLUMN           # the same pale warm stone as the pillar, the well and the basin's rim


def fountain_frame(f):
    """One of 4 frames: a stone pedestal standing in the basin's water, a round upper bowl brimming over, a little
    fish on top spouting a jet; water spilling over the bowl's lip in streams (highlights running down them),
    drops falling from the jet, splashes and a ripple ring at the foot. Its bottom centre goes on the basin's
    centre; no ground shadow (it stands in water)."""
    sp = Sprite(FW, FH, "fountain")
    S = STONE
    cx = 16.0
    under = blank(FW, FH)        # ripples on the basin's water, behind the stone
    over = blank(FW, FH)         # falling water, in front of the stone

    def put(img, x, y, c):
        if 0 <= x < FW and 0 <= y < FH:
            img[y, x] = c

    # --- the ripple ring round the foot (its back half goes behind the plinth) ---
    for ring, (rx, ry, ph) in enumerate(((10.5, 2.6, 0), (13.5, 3.3, 2))):
        for k in range(160):
            a = k / 160 * 2 * math.pi
            x, y = int(math.floor(cx + math.cos(a) * rx)), int(math.floor(44.5 + math.sin(a) * ry))
            seg = int((a / (2 * math.pi)) * 12 + f * (0.5 if ring == 0 else -0.5) + ph) % 3
            if seg == 0:
                continue
            put(under, x, y, WATER[7] if seg == 1 and math.sin(a) > -0.2 else WATER[6])

    # --- the plinth: a round drum standing in the water ---
    pcx, ptop, prx, pry, pbot = cx, 37.5, 7.0, 1.8, 44
    for x in range(FW):
        dx = (x + 0.5 - pcx) / prx
        if abs(dx) > 1:
            continue
        ye = ptop + pry * math.sqrt(1 - dx * dx)
        yb = pbot + pry * math.sqrt(1 - dx * dx)
        v = dx * LIGHT[0] + math.sqrt(max(0.0, 1 - dx * dx)) * LIGHT[2]
        base = S.index(band(v, S, -0.6, 0.8))
        for y in range(int(math.floor(ye)), int(round(yb)) + 1):
            c = base
            if y == int(math.floor(ye)):
                c += 1                                       # the lit top edge of the drum
            if y >= int(round(yb)) - 1:
                c = max(1, base - 3)                         # wet and dark at the waterline
            elif y == int(round(yb)) - 2:
                c = base - 1
            sp.set(x, y, S[max(0, min(8, c))], 0)
    for y in range(36, 40):                                  # its top, seen from above
        for x in range(FW):
            dx, dy = (x + 0.5 - pcx) / prx, (y + 0.5 - ptop) / pry
            if dx * dx + dy * dy <= 1:
                sp.set(x, y, S[7] if dx < 0.2 else S[6], 0)
    for x, y in ((10, 41), (11, 42), (21, 40), (20, 42)):    # moss low on it
        if sp.has(x, y):
            sp.set(x, y, MOSS[3] if y < 42 else MOSS[2], 0)

    # --- the shaft: fluted, swelling at its foot and neck ---
    for y in range(24, 37):
        w = 2.6 if 27 <= y <= 34 else 3.4
        for x in range(FW):
            dx = (x + 0.5 - cx) / w
            if abs(dx) > 1:
                continue
            v = dx * LIGHT[0] + math.sqrt(max(0.0, 1 - dx * dx)) * LIGHT[2]
            c = S.index(band(v, S, -0.6, 0.8))
            if 27 <= y <= 34 and x in (15, 17):
                c -= 1                                       # flutes
            if y in (26, 35):
                c += 1                                       # mouldings catching the light
            if y in (27, 36):
                c -= 2
            sp.set(x, y, S[max(0, min(8, c))], 1)

    # --- the upper bowl: its round underside, then the rim and the water in it ---
    bcy, brx, bry = 19.0, 12.6, 3.4
    for y in range(19, 27):
        t = (y - 19) / 7.0
        hw = brx * math.sqrt(max(0.0, 1 - t ** 1.6)) * (1 - 0.15 * t)
        for x in range(FW):
            dx = (x + 0.5 - cx) / max(hw, 0.5)
            if abs(dx) > 1:
                continue
            v = dx * LIGHT[0] + math.sqrt(max(0.0, 1 - dx * dx)) * LIGHT[2] - t * 0.45
            c = S.index(band(v, S, -0.6, 0.8))
            if y == 26:
                c -= 1
            sp.set(x, y, S[max(0, min(8, c))], 2)
    for y in range(14, 25):
        for x in range(FW):
            dx, dy = (x + 0.5 - cx) / brx, (y + 0.5 - bcy) / bry
            r2 = dx * dx + dy * dy
            if r2 > 1:
                continue
            di, dyi = (x + 0.5 - cx) / (brx - 2.0), (y + 0.5 - bcy - 0.2) / (bry - 1.0)
            if di * di + dyi * dyi <= 1:
                c = WATER[4] if dyi > -0.2 else WATER[3]     # the water in the bowl, the far side in shade
                if dyi < -0.55:
                    c = WATER[2]
                sp.set(x, y, c, 3)
            else:
                c = 7 if dy < 0 else 6                       # the rim: its top lit, the near lip a tone down
                if dx < -0.6:
                    c += 1
                elif dx > 0.6:
                    c -= 1
                if dy > 0.75:
                    c = 5 if dx < 0.3 else 4                 # the rim's rounded front edge
                sp.set(x, y, S[max(0, min(8, c))], 3)
    for k in range(10):                                      # ripples spreading in the bowl
        a = k / 10 * 2 * math.pi + f * 0.35
        for rr, cc in ((0.45 + 0.12 * f, WATER[6]), (0.8, WATER[5])):
            x = int(math.floor(cx + math.cos(a) * (brx - 2.0) * rr))
            y = int(math.floor(bcy + 0.2 + math.sin(a) * (bry - 1.0) * rr))
            if (k + f) % 2 == 0 and sp.has(x, y) and sp.part[y, x] == 3 and _idx(WATER, sp.obj[y, x]) is not None:
                sp.set(x, y, cc, 3)

    # --- the fish: a little stone carp leaping out of the bowl's water, mouth open to the sky ---
    # a leaping carp: an egg-shaped body tilted up to the right, a forked tail below, fins, a big eye, the mouth
    # open to the sky (the jet comes out of it)
    th = math.radians(-40)
    ux, uy = math.cos(th), math.sin(th)                      # along the fish, towards its head
    fcx, fcy, fa, fb = 17.0, 10.4, 5.2, 2.5
    fish = {}
    for y in range(0, 18):
        for x in range(6, 26):
            px, py = x + 0.5 - fcx, y + 0.5 - fcy
            u = px * ux + py * uy
            v = -px * uy + py * ux                           # v < 0: its back (up-left, towards the light)
            bb = fb * (1 + 0.18 * u / fa)
            if (u / fa) ** 2 + (v / bb) ** 2 <= 1:
                nu, nv = u / fa ** 2, v / bb ** 2
                n = math.hypot(nu, nv)
                k = min(1.0, n * min(fa, bb))
                nz = math.sqrt(max(0.0, 1 - k * k))
                sx, sy = (nu * ux - nv * uy), (nu * uy + nv * ux)
                ln = math.hypot(sx, sy) or 1.0
                lit = (sx / ln * k) * LIGHT[0] + (sy / ln * k) * LIGHT[1] + nz * LIGHT[2]
                fish[(x, y)] = ("body", lit, u, v)
                continue
            t = -u - fa + 0.8                                # the tail: past the body's rear end
            if 0 <= t <= 4.6:
                half = 0.7 + t * 0.66
                notch = t * 0.8 - 1.5
                if abs(v) <= half and not (t > 2.2 and abs(v) < notch):
                    fish[(x, y)] = ("tail", 0.3 - t * 0.08 - v * 0.12, u, v)
    for (x, y), (kind, lit, u, v) in fish.items():
        c = S.index(band(lit, S, -0.45, 0.95))
        if kind == "tail":
            c = 6 if v < 0 else 4
            if abs(v) < 0.6:
                c = 5
        sp.set(x, y, S[max(1, min(8, c))], 5)
    for (x, y), (kind, lit, u, v) in fish.items():           # scales: a few darker crescents along its flank
        if kind == "body" and -3.0 < u < 2.2 and 0.2 < v < 1.8 and (x + 2 * y) % 4 == 0:
            _shift(sp, x, y, S, -1)

    def at(u, v):
        return (int(math.floor(fcx + u * ux - v * uy)), int(math.floor(fcy + u * uy + v * ux)))

    ex, ey = at(fa * 0.52, -fb * 0.25)                       # the eye, with a glint
    sp.set(ex, ey, S[0], 5)
    sp.set(ex - 1, ey - 1, S[8], 5)
    mx, my = at(fa * 0.98, 0)                                # the open mouth
    sp.set(mx, my, S[1], 5)
    for u, v in ((0.2, -fb - 0.9), (-0.6, -fb - 0.6), (0.9, -fb - 0.5)):   # a fin on its back
        x, y = at(u, v)
        if not sp.has(x, y):
            sp.set(x, y, S[7], 5)
    for u, v in ((0.6, fb + 0.6), (-0.2, fb + 0.9)):        # a fin on its belly
        x, y = at(u, v)
        if not sp.has(x, y):
            sp.set(x, y, S[4], 5)
    MOUTH = (mx, my)
    tail = [(x, y) for (x, y), (kind, *_r) in fish.items() if kind == "tail"]
    ty = max(y for x, y in tail)
    for x in range(min(x for x, y in tail) - 2, max(x for x, y in tail) + 3):   # a splash ring where it leaves the water
        if not sp.has(x, ty + 1) or sp.part[ty + 1, x] == 3:
            sp.set(x, ty + 1, WATER[7] if (x + f) % 2 else WATER[6], 3)

    sp.outline(OUTLINE)
    for y in range(44, FH):                                  # where the plinth meets the water: a dark wet line
        for x in range(FW):
            if tuple(sp.obj[y, x][:3]) == tuple(OUTLINE[:3]) and sp.part[y - 1, x] == 0 and sp.has(x, y - 1):
                sp.obj[y, x] = WATER[1]

    # --- the jet: up from the fish's mouth, falling back as drops into the bowl ---
    jx, jy = MOUTH
    for y in range(1, jy):
        k = (y + f) % 4
        put(over, jx, y, WATER[8] if k == 0 else WATER[7] if k == 2 else WATER[6])
    for side in (-1, 1):
        for i in range(4):
            t = (i + f / 4) / 4
            x = jx + 0.5 + side * (1.0 + (8.0 if side < 0 else 5.0) * t)
            y = 1.0 + 16.0 * t * t - 1.0 * t
            put(over, int(math.floor(x)), int(math.floor(y)), WATER[8] if (i + f) % 2 == 0 else WATER[6])

    # --- water spilling over the bowl's lip: a thin sheet along the front edge, streams falling to the basin ---
    water_px = set()

    def fall(x0, y0, land, drift):
        """A stream from (x0, y0) down to the basin at y=land, drifting outwards; highlights run down it."""
        pts = []
        for y in range(y0, land + 1):
            k = y - y0
            x = x0 + int(round(drift * math.sqrt(k / max(1, land - y0)) * 3))
            pts.append((x, y, k))
        for x, y, k in pts:
            ph = (k - 2 * f) % 8
            c = WATER[8] if ph == 0 else WATER[7] if ph in (1, 4) else WATER[6]
            put(over, x, y, c)
            water_px.add((x, y))
            if k < 6:                                        # wider where it leaves the lip
                put(over, x + (1 if drift >= 0 else -1), y, WATER[5])
                water_px.add((x + (1 if drift >= 0 else -1), y))
        lx, ly = pts[-1][0], land
        for (ox, oy) in ([(-1, -1), (2, -2), (1, 0)] if f % 2 == 0 else [(-2, 0), (0, -2), (2, -1)]):
            put(over, lx + ox, ly + oy, WATER[8] if (ox + f) % 2 else WATER[7])   # splashes

    for x in range(5, 27):                                   # the brimming sheet over the front of the lip
        dx = (x + 0.5 - cx) / brx
        y = int(round(bcy + bry * math.sqrt(max(0.0, 1 - dx * dx)))) + 1
        if (x + f) % 5 != 0:
            put(over, x, y, WATER[6] if (x + f) % 3 else WATER[7])
            water_px.add((x, y))
    fall(3, 20, 41, -1)
    fall(28, 20, 41, 1)
    fall(9, 24, 44, -0.4)
    fall(22, 24, 44, 0.4)
    for x, y in list(water_px):                              # a deep blue edge on each stream, not black
        for ex, ey in ((x - 1, y), (x + 1, y)):
            if (ex, ey) not in water_px and 0 <= ex < FW and over[ey, ex, 3] == 0 and y < 41 and y > 21:
                put(over, ex, ey, WATER[2])
    # sparkles twinkling on the bowl's water
    for x, y in (((9, 18), (22, 19), (13, 20)), ((20, 18), (10, 20), (24, 19)),
                 ((8, 19), (19, 20), (14, 18)), ((23, 18), (11, 19), (18, 20)))[f]:
        if sp.part[y, x] == 3:
            put(over, x, y, WATER[8])

    img = under.copy()
    st = sp.obj
    m = st[:, :, 3] > 0
    img[m] = st[m]
    m = over[:, :, 3] > 0
    img[m] = over[m]
    return img


def ornament_fountain():
    frames = [fountain_frame(f) for f in range(4)]
    strip = blank(FW * 4, FH)
    for f, im in enumerate(frames):
        strip[:, f * FW:(f + 1) * FW] = im
    return strip, {"fountain": frames}


# ---------- registry ----------

PROPS = {
    "stall": stall, "stall_cloth": stall_cloth, "stall_bread": stall_bread,
    "vendor_cart": vendor_cart, "vendor_cart_flowers": vendor_cart_flowers,
    "scarecrow": scarecrow, "sign_tavern": sign_tavern, "sign_bakery": sign_bakery, "sign_potion": sign_potion,
    "sign_smith": sign_smith, "lamp_post": lamp_post, "bench": bench, "table": table, "counter": counter,
    "shelf": shelf, "shelf_books": shelf_books, "sacks": sacks, "anvil": anvil, "desk": desk,
}

SPRITES = {"ornament_fountain": ornament_fountain}


# ---------- quick look while drawing ----------

def look(names, k=6, out=None):
    from PIL import Image
    ims = [Image.fromarray(PROPS[n](), "RGBA") for n in names]
    W = sum(i.width for i in ims) + 6 * (len(ims) + 1)
    H = max(i.height for i in ims) + 12
    c = Image.new("RGBA", (W, H), (84, 120, 70, 255))
    x = 6
    for i in ims:
        c.alpha_composite(i, (x, H - 6 - i.height))
        x += i.width + 6
    c = c.resize((c.width * k, c.height * k), Image.NEAREST)
    c.save(out or Path(__file__).resolve().parent / "preview" / "_look.png")


# ---------- the preview ----------

FOOT = {"stall": 2, "stall_cloth": 2, "stall_bread": 2, "vendor_cart": 2, "vendor_cart_flowers": 2, "scarecrow": 1,
        "sign_tavern": 1, "sign_bakery": 1, "sign_potion": 1, "sign_smith": 1, "lamp_post": 1, "bench": 2,
        "table": 2, "counter": 3, "shelf": 2, "shelf_books": 2, "sacks": 1, "anvil": 1, "desk": 2,
        "well": 2, "cart": 2, "barrel": 1}
REFS = ("well", "cart", "barrel")   # existing props, shown alongside for scale and style


def preview():
    """preview/village_props_preview.png: every prop at 1x on grass, cobbles and wood floor next to the existing
    well, cart and barrel; then the same at 4x where each belongs (the market on cobbles, the farm on grass, the
    tavern / shop / Town Hall on wood floor against a house wall); the fountain's 4 frames in its basin."""
    from PIL import Image, ImageDraw
    import preview as pv
    from props import PROPS as CORE
    for n, fn in PROPS.items():
        pv._props[n] = Image.fromarray(fn(), "RGBA")
    for n in REFS:
        pv._props[n] = Image.fromarray(CORE[n](), "RGBA")
    extra = [t for t in ("fountain", "farmland", "wheat", "hall_wall", "carpet") if t not in pv.ORDER]
    pv.ORDER = pv.ORDER[:pv.ORDER.index("cobbles") + 1] + extra + pv.ORDER[pv.ORDER.index("cobbles") + 1:]
    T = 16
    BG = (28, 24, 38, 255)
    INK = (240, 220, 160, 255)

    def strip(names, ground, gap=1, rows=5, wall=False, beasts=()):
        """A band of ground (rows tiles high) with the props standing on its bottom row of tiles but one."""
        w = sum(FOOT[n] for n in names) + gap * (len(names) + 1) + (3 if beasts else 0)
        stacks = []
        for y in range(rows):
            row = []
            for x in range(w):
                st = ["grass"]
                if ground != "grass":
                    st.append(ground)
                if wall and y == 0:
                    st.append("house_wall")
                row.append(st)
            stacks.append(row)
        props, x = [], gap
        for i, n in enumerate(names):
            props.append((n, x, rows - 2, FOOT[n], False))
            x += FOOT[n] + gap
        bs = [(cid, (x + 1.5) * T, (rows - 1) * T - 2, True) for cid in beasts if (pv.BEAST / cid).exists()]
        return pv.render(None, "grass", props, stacks=stacks, beasts=bs)

    def label(im, text, k=1):
        out = Image.new("RGBA", (im.width * k + 24, im.height * k + 34), BG)
        ImageDraw.Draw(out).text((12, 8), text, fill=INK, font=pv.font(15))
        out.paste(pv.zoom(im, k) if k > 1 else im, (12, 28))
        return out

    allp = list(PROPS) + list(REFS)
    one = [label(strip(allp, g), f"1x: every prop on {g}, then the existing well, cart and barrel")
           for g in ("grass", "cobbles", "wood_floor")]
    market = ["stall", "stall_cloth", "stall_bread", "vendor_cart", "vendor_cart_flowers", "well", "barrel"]
    street = ["sign_tavern", "sign_bakery", "sign_potion", "sign_smith", "lamp_post", "bench", "cart"]
    farm = ["scarecrow", "sacks", "anvil", "cart", "barrel"]
    inside = ["table", "counter", "shelf", "shelf_books", "desk", "sacks", "barrel"]
    four = [label(strip(market, "cobbles", beasts=("bunny",)), "4x: the market on cobbles (with the well and barrel)", 4),
            label(strip(street, "cobbles", beasts=("chick",)), "4x: signs, lamp post, bench on cobbles (with the cart)", 4),
            label(strip(farm, "grass", rows=4, beasts=("fawn",)), "4x: scarecrow, sacks, anvil on grass (with the cart, barrel)", 4),
            label(strip(inside, "wood_floor", wall=True, beasts=("cat",)),
                  "4x: tavern / shop / Town Hall on wood floor, a house wall behind (with the barrel)", 4)]
    # the fountain: in its basin (the village_ground helper's `fountain` terrain) if it loads, each frame
    frames = []
    try:
        from terrain import all_terrains
        all_terrains()["fountain"]
        basin = "fountain"
    except Exception:
        basin = "deep_water"
    strip_, layers = ornament_fountain()
    for f in range(4):
        art = pv.Art(f)
        stacks = [[["grass", "cobbles"] + ([basin] if 1 <= x <= 4 and 1 <= y <= 4 else []) for x in range(6)]
                  for y in range(6)]
        im = pv.render(None, "grass", stacks=stacks, art=art)
        orn = Image.fromarray(layers["fountain"][f], "RGBA")
        im.alpha_composite(orn, (3 * T - FW // 2, 3 * T - FH))
        frames.append(im)
    fw = frames[0].width
    row = Image.new("RGBA", (fw * 4 + 8 * 3, frames[0].height), BG)
    for f, im in enumerate(frames):
        row.paste(im, (f * (fw + 8), 0))
    raw = Image.new("RGBA", (FW * 4 + 8 * 3 + 16, FH + 16), (52, 116, 170, 255))
    for f in range(4):
        raw.alpha_composite(Image.fromarray(layers["fountain"][f], "RGBA"), (8 + f * (FW + 8), 8))
    fountain_rows = [label(row, f"4x: ornament_fountain, frames 0-3, in the {basin} basin (4x4) on cobbles", 4),
                     label(raw, "4x: the 4 frames over plain blue water", 4),
                     label(row, "1x: the same", 1)]
    parts = one + four + fountain_rows
    W = max(p.width for p in parts)
    out = Image.new("RGBA", (W, sum(p.height for p in parts)), BG)
    y = 0
    for p in parts:
        out.paste(p, (0, y))
        y += p.height
    dst = Path(__file__).resolve().parent / "preview" / "village_props_preview.png"
    out.save(dst)
    print("saved", dst, out.size)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "look":
        look(sys.argv[3:], out=sys.argv[2])
    elif len(sys.argv) > 1 and sys.argv[1] == "preview":
        preview()
