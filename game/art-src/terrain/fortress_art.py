"""Fortress art for the battle maps: the armoury (weapon racks, armour stands), the keep's throne, weapons hung on a
wall's south face, the corner towers' pointed roofs and the keep's flag. Same rules and look as props.py and
props_more.py: light from the top left, the dark outline, a see-through shadow to the lower right.

    .venv/Scripts/python game/art-src/terrain/terrain.py build prop_weapon_rack prop_weapon_rack_axes \
        prop_armor_stand prop_armor_stand_gold prop_throne ornament_weapons roof_tower roof_keep_flag --aseprite
    .venv/Scripts/python game/art-src/terrain/fortress_art.py preview
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import T, blank, hx, ramp  # noqa: E402
from props import LIGHT, OUTLINE, SHADOW, Sprite, band, blob, finish, rng_for  # noqa: E402
from props_more import CLOTH, GOLD, IRON, PLANK, _cast, _shift  # noqa: E402

HERE = Path(__file__).resolve().parent

# the fortress wall's own warm stone (terrain.py FORT), for the throne
FORT = ramp("#211b1e #352d2e #4b413f #645852 #7f7268 #9a8c7f #b4a696 #cec1ae #eae0cc")
LEATHER = ramp("#1c1012 #2e1a18 #46281e #603826 #7a4c30")
PLUME_W = ramp("#4e4250 #7a6e7a #a89ca2 #d0c6c4 #ece6de #fffcf4")
BLUE = ramp("#0c0e2a #141c48 #1c2c6a #26428e #3460b0 #4c82cc #78aae0")
LICHEN = [hx("#5e6a3a"), hx("#7e8a46"), hx("#a4ac5a")]
DARK_WOOD = ramp("#140a0c #221210 #2e1a14 #42261a #583420 #6e4428 #865632 #a06c40")


def paint(sp, x0, y0, rows, cmap, part=0):
    """A small designed pixel grid onto the object layer ('.' is left alone)."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch not in ". ":
                sp.set(x0 + i, y0 + j, cmap[ch], part)


def tones(pal, chars):
    return {ch: pal[i] for i, ch in enumerate(chars[:len(pal)])}


# ---------- the weapon racks ----------
# Both racks share one frame: two knob-topped posts with a boarded back and a rail the weapons lean against (behind
# them), and a plank trough in front that they stand in.

RAIL, FOOT = 14, 26       # the rail's top row; the row the weapons stand down to (inside the trough)
STEEL = tones(IRON, "012345678")
RED = tones(CLOTH, "abcdefgh")


def shaft(sp, x, y0, part):
    """An ash shaft down into the trough (1 px: a lit tone, darker where the rail's shade falls)."""
    for y in range(y0, FOOT + 1):
        sp.set(x, y, PLANK[7] if y < 20 else PLANK[6], part)


def spear(sp, x, top, part, head="leaf"):
    """A spear standing butt-down: a steel head, a red tassel under it, the shaft."""
    rows = {"leaf": [".8.", ".8.", "784", "784", "673", ".5.", ".3."],
            "pike": [".8.", ".8.", ".8.", "784", "673", ".5.", ".3."]}[head]
    paint(sp, x - 1, top, rows, STEEL, part)
    shaft(sp, x, top + 7, part)
    paint(sp, x - 1, top + 7, ["gfd", "e.c"], RED, part)            # the tassel


def sword(sp, x, top, part, guard=GOLD, grip=LEATHER, broad=False):
    """A sword standing point-down: pommel, wrapped grip, crossguard, a blade with a bright edge."""
    hi, mid, lo = (guard[6], guard[5], guard[3]) if guard is GOLD else (guard[7], guard[5], guard[3])
    paint(sp, x, top - 1, ["hm", "ml"], {"h": hi, "m": mid, "l": lo}, part)   # the pommel
    for k in range(1, 4):                                                       # the grip, wrapped
        sp.set(x, top + k, grip[4] if k % 2 else grip[3], part)
        sp.set(x + 1, top + k, grip[2] if k % 2 else grip[1], part)
    gw = 3 if broad else 2
    for dx in range(-gw, gw + 2):                                               # the crossguard
        sp.set(x + dx, top + 4, hi if dx < 0 else mid if dx < 2 else lo, part)
    sp.set(x - gw, top + 3, hi, part)                                           # its ends turned up
    sp.set(x + gw + 1, top + 3, lo, part)
    for y in range(top + 5, FOOT + 1):                                          # the blade
        sp.set(x, y, IRON[8] if y < top + 8 else IRON[7], part)
        sp.set(x + 1, y, IRON[6] if broad else IRON[5], part)
        if broad:
            sp.set(x + 2, y, IRON[4], part)


def axe_double(sp, x, top, part):
    """A double-bitted battle axe, head up: two fan-shaped blades either side of the haft, a spike on top."""
    paint(sp, x - 4, top, [
        "....7....",
        "7...6...5",
        "88..5..65",
        "876.5.654",
        "876656654",
        "876.4.654",
        "88..4..65",
        "7...4...5",
    ], STEEL, part)
    shaft(sp, x, top + 8, part)
    sp.set(x, top + 8, IRON[3], part)                                           # the socket's collar


def axe_beard(sp, x, top, part):
    """A bearded axe: one long blade on its right, its beard sweeping down along the haft."""
    paint(sp, x, top, [
        "467788",
        "4.6778",
        "4..678",
        "4..678",
        "4...68",
        "4..568",
        "4.5678",
        "3...7.",
    ], STEEL, part)
    shaft(sp, x, top + 8, part)
    sp.set(x, top - 1, IRON[6], part)


HALBERD = ["..8....", "..8....", "..8....", "..76...", "..67788", "4.66788", "554.678", "..6..78", "..5....", "..3...."]


def halberd(sp, x, top, part, side=1):
    """A halberd: a long spike, an axe blade on one side (side +1 right, -1 left), a hook at the back, a tassel,
    a tall shaft."""
    rows = HALBERD if side > 0 else [r[::-1] for r in HALBERD]
    paint(sp, x - 2 if side > 0 else x - 4, top, rows, STEEL, part)
    shaft(sp, x, top + 10, part)
    paint(sp, x - 1, top + 10, ["gfd", "e.c"], RED, part)


def rack_back(sp):
    """Behind the weapons: two knob-topped posts, a boarded back in shade, the rail they lean on."""
    B = 0
    for y in range(RAIL + 2, FOOT):                                 # the boarded back, in shade
        for x in range(4, 28):
            sp.set(x, y, PLANK[1] if (x - 4) % 6 == 5 else PLANK[2], B)
    for px, (a, b) in ((2, (7, 5)), (28, (5, 3))):                  # the posts
        for y in range(RAIL - 3, FOOT):
            sp.set(px, y, PLANK[a], B)
            sp.set(px + 1, y, PLANK[b], B)
        paint(sp, px, RAIL - 5, ["lm", "md"], {"l": PLANK[8], "m": PLANK[a - 1], "d": PLANK[b - 1]}, B)
    for x in range(2, 30):                                          # the rail
        sp.set(x, RAIL, PLANK[7] if x < 28 else PLANK[6], B)
        sp.set(x, RAIL + 1, PLANK[4] if x < 28 else PLANK[3], B)
    sp.set(2, RAIL, PLANK[8], B)


def rack_front(sp, holes):
    """In front of the weapons' feet: the trough they stand in (holes: where a weapon goes into it)."""
    F = 20
    for y in range(FOOT - 1, 30):
        for x in range(1, 31):
            k = y - (FOOT - 1)
            c = (7, 6, 5, 4, 2)[k]         # the lit top (2 rows), the front's lit edge, the front, the foot
            if k == 3 and x % 10 == 5:
                c = 3                      # a join between the front boards
            if 0 <= k <= 3 and x == 1:
                c = min(8, c + 1)
            if 0 <= k <= 4 and x == 30:
                c = max(1, c - 2)
            sp.set(x, y, PLANK[c], F)
    for x in holes:                                                 # the slots the weapons stand in
        sp.set(x, FOOT - 1, PLANK[1], F)
    for x in (2, 29):                                               # iron corner straps
        sp.set(x, FOOT + 1, IRON[7] if x < 16 else IRON[4], F)
        sp.set(x, FOOT + 2, IRON[5] if x < 16 else IRON[3], F)


def rack_shade(sp):
    """The weapons' shade on the back boards, down and to the right of each."""
    for y in range(RAIL + 2, FOOT):
        for x in range(1, 31):
            if sp.part[y, x] == 0 and sp.part[y - 1, x - 1] > 0 and sp.part[y, x - 1] > 0:
                sp.set(x, y, PLANK[0], 0)


def weapon_rack():
    """Spears (red tassels under their heads) and two swords, one gold-hilted, one broad with a red grip."""
    sp = Sprite(32, 32, "weapon_rack")
    sp.ground_shadow(17.5, 29.6, 14.6, 2.5)
    rack_back(sp)
    spear(sp, 7, 2, 1)
    sword(sp, 11, 7, 2)
    spear(sp, 16, 0, 3, head="pike")
    sword(sp, 20, 6, 4, guard=IRON, grip=CLOTH[:5], broad=True)
    spear(sp, 25, 3, 5)
    rack_front(sp, holes=(7, 11, 12, 16, 20, 21, 22, 25))
    _cast(sp, PLANK, 1, skip=(0,))
    _cast(sp, IRON, 1)
    rack_shade(sp)
    return finish(sp)


def weapon_rack_axes():
    """A double-bitted axe, a tall halberd in the middle, a bearded axe: three heights, three silhouettes."""
    sp = Sprite(32, 32, "weapon_rack_axes")
    sp.ground_shadow(17.5, 29.6, 14.6, 2.5)
    rack_back(sp)
    axe_double(sp, 7, 7, 1)
    halberd(sp, 16, 0, 2, side=-1)
    axe_beard(sp, 22, 4, 3)
    rack_front(sp, holes=(7, 16, 22))
    _cast(sp, PLANK, 1, skip=(0,))
    _cast(sp, IRON, 1)
    rack_shade(sp)
    return finish(sp)


# ---------- the armour stands ----------

def armor(name, M, plume, trim, cape=None, wood=PLANK):
    """A suit of plate on a wooden stand: plumed helm, round pauldrons, a ridged breastplate, arms hanging with
    gauntlets, a skirt of tassets, and the stand's post and cross foot below."""
    sp = Sprite(16, 32, name)
    sp.ground_shadow(9.5, 30.4, 6.6, 1.6)
    n = len(M) - 1
    trim_hem = (GOLD[6], GOLD[4])
    W = wood
    for y in range(22, 29):                                  # the post
        sp.set(7, y, W[6], 0)
        sp.set(8, y, W[3], 0)
    for x in range(3, 13):                                   # the cross foot: a plank across, a foot to the front
        sp.set(x, 28, W[7] if x < 11 else W[6], 0)
        sp.set(x, 29, W[4] if x < 11 else W[3], 0)
    sp.set(3, 29, W[5], 0)
    for x in range(6, 10):
        sp.set(x, 30, W[3] if x < 9 else W[2], 0)
    sp.set(6, 30, W[5], 0)
    if cape:                                                 # a cape behind, hanging below the arms, gold-hemmed
        for y in range(12, 28):
            for x in range(1, 15):
                bottom = 26 - int(abs(x + 0.5 - 8) * 0.35) + (1 if x % 3 == 1 else 0)
                if y > bottom:
                    continue
                fold = math.cos((x - 1) / 13 * 3 * math.pi + 0.3)
                v = (7.5 - x) * 0.05 + fold * 0.3 - (y - 12) * 0.02
                c = band(v, cape[1:], -0.55, 0.6)
                if y == bottom:
                    c = trim_hem[0] if x < 8 else trim_hem[1]
                sp.set(x, y, c, 1)
    for k, (y, a, b) in enumerate(((19, 4, 11), (20, 4, 11), (21, 3, 12), (22, 3, 12), (23, 3, 12))):  # tassets
        for x in range(a, b + 1):
            if y >= 21 and x in (7, 8):
                continue                                     # the split between the two tassets
            nx = (x + 0.5 - 7.5) / 5
            v = nx * LIGHT[0] + math.sqrt(max(0, 1 - nx * nx)) * LIGHT[2]
            c = M.index(band(v, M, -0.6, 0.9))
            if y in (20, 22):
                c -= 2                                       # the lame's lower edge
            if y == 23:
                c -= 1
            sp.set(x, y, M[max(0, min(n, c))], 3)
    for side, ax in ((-1, 1), (1, 12)):                      # the arms
        for y in range(15, 22):
            for i in range(3):
                x = ax + i
                nx = (i + 0.5) / 3 * 2 - 1
                v = nx * LIGHT[0] + math.sqrt(max(0, 1 - nx * nx)) * LIGHT[2] - (0.25 if side > 0 else 0)
                c = M.index(band(v, M, -0.6, 0.9))
                if y == 17:
                    c += 1                                   # the elbow's couter, catching the light
                if y >= 20:
                    c -= 1                                   # gauntlets
                sp.set(x, y, M[max(0, min(n, c))], 2)
    for y in range(12, 20):                                  # the breastplate
        half = 4.0 if y < 17 else 3.5 if y < 19 else 3.0
        for x in range(16):
            dx = x + 0.5 - 7.5
            if abs(dx) > half:
                continue
            nx = dx / half
            v = nx * LIGHT[0] + math.sqrt(max(0, 1 - nx * nx)) * LIGHT[2] + (0.15 if y < 15 else 0) - (y - 12) * 0.03
            c = M.index(band(v, M, -0.6, 0.9))
            if x == 7 and 13 <= y <= 17:
                c += 2                                       # the ridge down its middle
            if y == 17:
                c -= 2                                       # the plackart's edge
            sp.set(x, y, M[max(0, min(n, c))], 4)
    for cx in (3.2, 11.8):                                   # pauldrons
        blob(sp, cx, 13.4, 2.9, 2.3, M[1:], part=5, seed=int(cx), lo=-0.5, hi=1.1)
        for x in range(16):
            if sp.part[15, x] == 5:
                _shift(sp, x, 15, M, -2)                     # the lower lame
    for x in range(5, 11):                                   # the gorget
        sp.set(x, 12, M[2] if x > 7 else M[3], 6)
    blob(sp, 7.5, 8.3, 3.3, 3.7, M[1:], part=7, seed=3, lo=-0.5, hi=1.1)   # the helm
    for x in range(5, 11):
        if sp.has(x, 8):
            sp.set(x, 8, M[0] if x > 5 else M[1], 7)         # the eye slit
    for x in (6, 9):
        sp.set(x, 10, M[1], 7)                               # breathing holes
    for y in range(5, 8):
        _shift(sp, 7, y, M, 1)                               # the helm's crest, catching the light
    # the plume: a tuft rising from the helm's crown, sweeping back to the right
    P = plume
    pts = [(7, 4), (7, 3), (8, 2), (9, 1), (10, 1), (11, 2), (12, 3), (13, 5)]
    for i, (x, y) in enumerate(pts):
        sp.set(x, y, P[-1] if i < 3 else P[-2] if i < 5 else P[-3], 8)
    for x, y in ((8, 3), (9, 2), (10, 2), (11, 3), (12, 4), (8, 4), (9, 3), (10, 3), (11, 4), (12, 5), (13, 6)):
        sp.set(x, y, P[-3] if y < 4 else P[-4], 8)
    for x, y in ((9, 4), (10, 4), (11, 5), (12, 6), (13, 7)):
        sp.set(x, y, P[-5], 8)
    for x, y in ((6, 4), (6, 3)):
        sp.set(x, y, P[-2], 8)
    for x, y in ((3, 13), (12, 13), (5, 18), (10, 18)):      # rivets
        if sp.has(x, y):
            sp.set(x, y, trim, int(sp.part[y, x]))
    _cast(sp, M, 1, skip=(0, 1))
    return finish(sp)


def armor_stand():
    """Steel plate, a red plume, gold rivets, on a plain wooden stand."""
    return armor("armor_stand", IRON, CLOTH, GOLD[5])


def armor_stand_gold():
    """Gilded ceremonial plate for the keep: a white plume, a red cape with a gold hem, a dark polished stand."""
    return armor("armor_stand_gold", GOLD, PLUME_W, IRON[8], cape=CLOTH, wood=DARK_WOOD)


# ---------- the throne ----------

def throne():
    """A tall throne of the fortress's pale stone, trimmed in gold: a pointed back with a red velvet panel and a gold
    crown on it, a crown finial and two gold-capped pinnacles, broad armrests with gold scroll ends, a plump red
    cushion, all on a two-step stone dais. Centred on column 14.5, so its shadow shows on the lower right."""
    sp = Sprite(32, 48, "throne")
    sp.ground_shadow(17.5, 45.6, 14.0, 2.6)
    S, G, R = FORT, GOLD, CLOTH
    C = 14.5                                                     # the throne's middle

    # the dais: two steps, block joints on their fronts, a gold trim along the upper one
    for y in range(38, 47):
        upper = y < 42
        left, right = (3, 26) if upper else (1, 28)
        for x in range(left, right + 1):
            if y in (38, 42):
                c = 7
            elif y in (39, 43):
                c = 6
            elif y == 46:
                c = 2
            else:
                c = 4 if y in (40, 44) else 3
                if (x - left) % 7 == 6:
                    c = 2
            if x == left:
                c += 1
            elif x == right:
                c -= 2
            sp.set(x, y, S[max(0, min(8, c))], 0)
    for x in range(4, 26):
        sp.set(x, 40, G[5] if x < C else G[4], 0)
    # the back: a pointed top, its edge lit
    bx0, bx1 = 7, 22
    for y in range(4, 31):
        for x in range(bx0, bx1 + 1):
            peak = 4 + abs(x + 0.5 - (C + 0.5)) * 0.55
            if y < peak:
                continue
            c = 7 if x == bx0 else 3 if x == bx1 else (8 if x < C else 6) if y < peak + 1 else 5
            sp.set(x, y, S[c], 1)
    for y in range(9, 29):                                       # the velvet panel, framed in gold
        for x in range(10, 20):
            peak = 9 + abs(x + 0.5 - (C + 0.5)) * 0.5
            if y < peak:
                continue
            if x == 10 or y < peak + 1:
                c = G[5] if x < C else G[4]
            elif x == 19:
                c = G[3]
            else:
                fold = (x - 11) % 4
                c = R[5] if fold == 0 else R[4] if fold in (1, 3) else R[3]
                if y > 24:
                    c = R[3] if fold == 0 else R[2]              # in the cushion's shade
            sp.set(x, y, c, 2)
    paint(sp, 12, 13, ["l.m.n", "lmmmn", "lrmrn", "ooooo"],
          {"l": G[7], "m": G[6], "n": G[4], "r": R[6], "o": G[3]}, 3)   # a gold crown on the velvet
    for x, y in ((12, 19), (14, 19), (17, 19), (13, 23), (16, 23)):    # buttons in the tufting
        sp.set(x, y, G[5], 2)
    for px in (bx0, bx1 - 1):                                    # pinnacles at the back's corners
        for y in range(5, 12):
            sp.set(px, y, S[7] if px == bx0 else S[5], 1)
            sp.set(px + 1, y, S[5] if px == bx0 else S[3], 1)
        paint(sp, px, 3, ["lm", "mn"], {"l": G[7], "m": G[5], "n": G[3]}, 4)
    paint(sp, 13, 0, [".l.m", "lmmn", "mrmn", "omno"], {"l": G[7], "m": G[5], "n": G[3], "r": R[6], "o": G[4]}, 4)
    # the seat: the cushion on top, the stone front with a gold band
    for y in range(28, 38):
        for x in range(8, 22):
            if y <= 31:
                if x in (8, 21) and y in (28, 31):
                    continue                                     # the cushion's rounded corners
                v = (C - x) * 0.035 + (0.25 if y == 28 else 0.12 if y == 29 else -0.1 if y == 31 else 0)
                sp.set(x, y, band(v, R, -0.35, 0.4), 5)
            elif y == 33:
                sp.set(x, y, G[5] if x < C else G[4], 5)
            else:
                c = 6 if y == 32 else 4 if y < 37 else 2
                sp.set(x, y, S[c + (1 if x == 8 else 0)], 5)
    for x, (a, b) in ((8, (6, 4)), (21, (4, 3))):                # the cushion's tassels
        sp.set(x, 31, G[a], 5)
        sp.set(x, 32, G[b], 5)
    # the armrests, gold scroll ends on their fronts, a gold band round them
    for ax0, ax1, lit in ((3, 7, True), (22, 26, False)):
        for y in range(23, 38):
            for x in range(ax0, ax1 + 1):
                if y <= 25:
                    c = 7 if y == 23 else 6                       # the arm's top
                else:
                    c = 5 if lit else 3
                    if (y - 26) % 6 == 5:
                        c = 3 if lit else 2
                if x == ax0 and lit:
                    c = min(8, c + 1)
                if x == ax1:
                    c -= 2
                sp.set(x, y, S[max(0, c)], 6)
        for x in range(ax0 + 1, ax1 + 1):
            sp.set(x, 30, G[5] if lit else G[4], 6)
            sp.set(x, 31, G[4] if lit else G[3], 6)
        paint(sp, ax0 if lit else ax1 - 2, 22, [".lm", "lmn", "mon"] if lit else ["lm.", "lmn", "mon"],
              {"l": G[7], "m": G[5], "n": G[3], "o": G[4]}, 7)
    _cast(sp, S, 2, skip=(0,))
    _cast(sp, R, 1)
    return finish(sp)


# ---------- weapons hung on a wall ----------
# A 16x32 cell drawn with its top-left at a wall tile's top-left, over a wall with floor to its south: rows 0-15 are
# the wall tile, 16-31 the floor tile in front. fort_wall's south face takes rows 8-18 of the cell (8-11 its
# crenellated parapet, 12-17 two courses of ashlar, 18 the plinth; its outline is row 19); hall_wall's takes rows
# 8-17. So each trophy is drawn in rows 8-18 (its outline in 7 and 19), centred on column 7.5, and casts a
# see-through shadow on the stone down and to its right (never below row 18, the face's foot).

FACE_TOP, FACE_BOT = 8, 18


def wall_trophy(name, draw):
    sp = Sprite(16, 32, name)
    draw(sp)
    sp.outline(OUTLINE)
    for y in range(1, FACE_BOT + 1):                  # its shadow on the wall, down and to the right
        for x in range(1, 16):
            if not sp.obj[y, x, 3] and sp.obj[y - 1, x - 1, 3]:
                sp.shadow[y, x] = SHADOW
    return sp


def diag_sword(sp, tip, d, n, part, guard=GOLD):
    """A sword lying at 45 degrees: tip, a 2 px blade (bright ridge, darker edge), crossguard, grip, pommel."""
    (tx, ty), (dx, dy) = tip, d
    for k in range(n):
        x, y = tx + dx * k, ty + dy * k
        sp.set(x, y, IRON[8] if k < 3 else IRON[7], part)
        if k:
            sp.set(x - dx, y, IRON[5] if dx > 0 else IRON[4], part)
    gx, gy = tx + dx * n, ty + dy * n
    for k in (-2, -1, 0, 1, 2):                       # the crossguard, across the blade
        x, y = gx + dx * k, gy - dy * k
        sp.set(x, y, guard[6] if x < gx else guard[5] if k == 0 else guard[3], part)
    sp.set(gx + dx, gy + dy, LEATHER[4], part)        # the grip
    sp.set(gx + dx * 2, gy + dy * 2, guard[6] if dx > 0 else guard[5], part)   # the pommel


def round_shield(sp, cx, cy, r, field, rim, part):
    for y in range(32):
        for x in range(16):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)
            if d > r:
                continue
            lit = (-dx * 0.6 - dy * 0.8) / r
            if d > r - 1.1:
                c = rim[6] if lit > 0.35 else rim[5] if lit > -0.1 else rim[4] if lit > -0.6 else rim[3]
            else:
                c = field[6] if lit > 0.3 else field[5] if lit > -0.25 else field[4]
            sp.set(x, y, c, part)


def trophy_swords(sp):
    """Two swords crossed over a round red shield with a gold rim."""
    round_shield(sp, 7.5, 13.0, 4.6, CLOTH, GOLD, 1)
    diag_sword(sp, (2, 8), (1, 1), 8, 2)
    diag_sword(sp, (13, 8), (-1, 1), 8, 3)
    for y in range(32):                               # the swords' shade on the shield, a step darker
        for x in range(1, 16):
            if sp.part[y, x] == 1 and sp.part[y - 1, x - 1] >= 2:
                _shift(sp, x, y, CLOTH, -2)
                _shift(sp, x, y, GOLD, -2)


AXE_L = ["88..", "876.", "8765", "8765", "865.", "76.."]     # an axe head, its blade facing left (lit)
AXE_R = ["..78", ".678", "5678", "4578", ".567", "..67"]     # and facing right (the shaded side)


def trophy_axes(sp):
    """Two battle axes crossed, their crescent blades facing out, an iron boss where the hafts cross."""
    for (x0, x1), part in (((2, 10), 1), ((13, 5), 2)):
        for k in range(11):
            y = FACE_BOT - k
            x = int(round(x0 + (x1 - x0) * k / 10))
            sp.set(x, y, PLANK[7] if part == 1 else PLANK[5], part)
        sp.set(x0, FACE_BOT, IRON[5] if part == 1 else IRON[3], part)   # iron caps on the butts
    paint(sp, 11, FACE_TOP, AXE_R, STEEL, 3)
    paint(sp, 1, FACE_TOP, AXE_L, STEEL, 3)
    for x, y in ((10, 9), (10, 10), (5, 9), (5, 10)):
        sp.set(x, y, IRON[4] if x > 8 else IRON[6], 3)                # the sockets
    paint(sp, 6, 11, [".64.", "6853", ".32."], STEEL, 4)            # the boss holding them where they cross


KITE = {8: 3.2, 9: 4.1, 10: 4.3, 11: 4.3, 12: 4.1, 13: 3.7, 14: 3.2, 15: 2.6, 16: 1.9, 17: 1.2, 18: 0.6}


def kite_shield(sp, part):
    inside = lambda x, y: y in KITE and abs(x + 0.5 - 7.5) <= KITE[y]
    for y in KITE:
        for x in range(16):
            if not inside(x, y):
                continue
            edge = not all(inside(x + a, y + b) for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge:
                lit = (x < 7) + (y < 11)
                c = GOLD[6] if lit == 2 else GOLD[5] if lit == 1 and x < 7 else GOLD[4] if lit else GOLD[3]
            else:
                c = BLUE[5] if x < 6 else BLUE[4] if x < 8 else BLUE[3]
                if y > 14:
                    c = BLUE[4] if x < 7 else BLUE[2]
            sp.set(x, y, c, part)
    paint(sp, 5, 10, ["q.p.o", "qppon", "onnnm"],
          {"q": GOLD[7], "p": GOLD[6], "o": GOLD[5], "n": GOLD[4], "m": GOLD[3]}, part)   # the crown


def trophy_spear(sp):
    """A spear hung behind a blue kite shield bearing the fortress's gold crown."""
    for k in range(7):                                  # the shaft, butt at the lower left
        x, y = 4 + k, FACE_BOT - k
        sp.set(x, y, PLANK[7], 1)
        sp.set(x + 1, y, PLANK[5], 1)
    sp.set(4, FACE_BOT, IRON[5], 1)
    sp.set(5, FACE_BOT, IRON[3], 1)
    paint(sp, 11, FACE_TOP, ["...8", "..87", ".876", "865."], STEEL, 2)   # the head, leaf-shaped
    paint(sp, 12, FACE_TOP + 4, ["fd", "ec"], RED, 2)  # its tassel
    kite_shield(sp, 3)


TROPHIES = (("swords", trophy_swords), ("axes", trophy_axes), ("spear", trophy_spear))


def ornament_weapons():
    """Three variants side by side (48x32): crossed swords over a round shield, crossed battle axes, a spear behind
    a kite shield with the fortress's crown on it."""
    shadow, obj = blank(48, 32), blank(48, 32)
    for i, (n, draw) in enumerate(TROPHIES):
        sp = wall_trophy("ornament_weapons_" + n, draw)
        shadow[:, i * 16:(i + 1) * 16] = sp.shadow
        obj[:, i * 16:(i + 1) * 16] = sp.obj
    out = shadow.copy()
    m = obj[:, :, 3] > 0
    out[m] = obj[m]
    return out, {"shadow": [shadow], "weapons": [obj]}


# ---------- the corner towers' roof ----------
# One picture, 150x176, for a 9x9-tile tower: drawn with its bottom edge 10 px above the bottom of the tower's last
# row and its left edge 3 px left of the tower, so rows 32-175 cover the footprint (lifted 10 px, as the roof sits
# on top of the walls) with 3 px eaves at the sides, and rows 0-31 hold the spire rising above. A square pyramid:
# seen from the creatures' angle (a height of h px shows h px higher up), its peak lands at (75, PEAK_Y), so all four
# slopes show: a thin north one, the west and east ones, and the big south one.

ROOF_W, ROOF_H, ROOF_TOP = 150, 176, 32
PEAK_Y = 44
SL = ramp("#10141e #1a2030 #262e42 #323c54 #3e4a64 #4c5a76 #5e6e88 #76869e #98a8bc #bccad8")   # village roof_slate's
LEAD = ramp("#181a22 #2a2e3a #424856 #5e6574 #7e8694 #a2aab6 #c8ced8")


def h32(*parts):
    import zlib
    return zlib.crc32("/".join(str(p) for p in parts).encode())


def roof_geometry():
    """Which slope each pixel of the roof shows (0 north, 1 east, 2 south, 3 west, -1 none) and its plan point."""
    W, H = ROOF_W, ROOF_H
    cx, cy = (W - 1) / 2, ROOF_TOP + (H - ROOF_TOP - 1) / 2       # the footprint's centre on the picture
    a, b = cx, (H - ROOF_TOP - 1) / 2                              # half width, half depth (to pixel centres)
    Z = cy - PEAK_Y
    face = np.full((H, W), -1)
    U = np.zeros((H, W))
    V = np.zeros((H, W))
    for vi in range(int(-b * 4) - 2, int(b * 4) + 3):              # plan points, the nearer ones drawn later
        v = vi / 4
        for ui in range(int(-a * 4) - 2, int(a * 4) + 3):
            u = ui / 4
            if abs(u) > a + 0.01 or abs(v) > b + 0.01:
                continue
            h = Z * (1 - max(abs(u) / a, abs(v) / b))
            x, y = int(round(cx + u)), int(round(cy + v - h))
            if not (0 <= x < W and 0 <= y < H):
                continue
            if abs(v) / b >= abs(u) / a:
                f = 0 if v < 0 else 2
            else:
                f = 3 if u < 0 else 1
            face[y, x], U[y, x], V[y, x] = f, u, v
    return face, U, V, (cx, cy, a, b, Z)


def slates(face, U, V, geo):
    """The slates on every slope: courses 4 px deep laid parallel to each slope's eave, the slates 6 px long and
    staggered course to course, each a shade of its own; a dark line under each course's lower edge."""
    W, H = ROOF_W, ROOF_H
    cx, cy, a, b, Z = geo
    obj = blank(W, H)
    base = {0: 7, 3: 6, 2: 5, 1: 3}                                # lit from the top left: north, west lighter
    for y in range(H):
        for x in range(W):
            f = face[y, x]
            if f < 0:
                continue
            u, v = U[y, x], V[y, x]
            if f in (0, 2):                                        # courses parallel to the north / south eave
                s = (b - v) * (1 + Z / b) if f == 2 else (y - ROOF_TOP) * 1.0
                along = u
            else:                                                  # courses parallel to the side eaves
                s, along = a - abs(u), v
            course = int(s // 4)
            r = s % 4                                              # 0..4 up from the course's lower edge
            stagger = (course % 2) * 3
            slate = int((along + 200 + stagger) // 6)
            jitter = (-1, 0, 0, 1, 0, 0, -1, 1, 0, 2)[h32(f, course, slate) % 10]
            k = base[f] + jitter
            if r < 1:
                k = base[f] - 3                                    # the shadow under each course's lower edge
            elif r >= 3:
                k += 1                                             # each slate's upper part, lit
            if (along + 200 + stagger) % 6 < 1 and r >= 1:
                k = base[f] - 2                                    # the gaps between slates
            obj[y, x] = SL[max(0, min(9, k))]
    rng = rng_for("roof_tower", "lichen")                          # lichen: a few clumps, low on the slopes
    for _ in range(26):
        x, y = int(rng.integers(8, W - 8)), int(rng.integers(ROOF_TOP + 60, H - 8))
        if face[y, x] in (1, 2, 3):
            lit = face[y, x] == 3
            for dx, dy, c in ((0, 0, 2), (1, 0, 1), (0, 1, 1), (1, 1, 0), (2, 1, 0)):
                if rng.random() < 0.75 and face[y + dy, x + dx] >= 0:
                    obj[y + dy, x + dx] = LICHEN[min(2, c + lit)] if c else LICHEN[0]
    return obj


def hips(obj, face, geo):
    """A rounded ridge cap down each hip, lit on its upper left side, a joint between cap tiles every 6 px."""
    W, H = ROOF_W, ROOF_H
    cx = geo[0]
    for (ex, ey) in ((0, ROOF_TOP), (W - 1, ROOF_TOP), (0, H - 1), (W - 1, H - 1)):
        dx, dy = cx - ex, PEAK_Y - ey
        L = math.hypot(dx, dy)
        nx, ny = -dy / L, dx / L
        if nx * -0.6 + ny * -0.8 < 0:
            nx, ny = -nx, -ny                                      # the normal pointing to the lit side
        for y in range(H):
            for x in range(W):
                px, py = x - ex, y - ey
                t = (px * dx + py * dy) / (L * L)
                if not (0 <= t <= 1) or face[y, x] < 0:
                    continue
                d = px * nx + py * ny
                if abs(d) > 1.7:
                    continue
                c = 7 if d > 0.6 else 9 if d > -0.6 else 3
                if int(t * L) % 6 == 0:
                    c -= 2
                obj[y, x] = SL[max(0, min(9, c))]


def eaves(obj):
    """A lit board along the north and west eaves, a dark one along the east, and along the bottom the fascia and
    the dark underside of the eave; the outline round it all."""
    W, H = ROOF_W, ROOF_H
    for x in range(W):
        obj[ROOF_TOP, x] = OUTLINE
        obj[ROOF_TOP + 1, x] = SL[9] if x % 7 else SL[8]
        obj[H - 4, x] = SL[2]
        obj[H - 3, x] = SL[4] if x % 9 else SL[2]
        obj[H - 2, x] = SL[0]
        obj[H - 1, x] = OUTLINE
    for y in range(ROOF_TOP, H):
        obj[y, 0] = OUTLINE
        obj[y, W - 1] = OUTLINE
        if ROOF_TOP < y < H - 3:
            obj[y, 1] = SL[8]
            obj[y, W - 2] = SL[1]


def dormer(sp, dc, yb):
    """A little stone dormer on the south slope: a gable with slate cheeks running back into the roof, an arched
    window glowing warm, a lit sill. dc: its centre column, yb: the bottom row of its front wall."""
    wall_top, apex = yb - 6, yb - 15
    half = 8
    L, R, A = (dc - half - 1, wall_top), (dc + half + 1, wall_top), (dc, apex)
    back = 8                                                       # how far its cheeks run back into the roof
    for y in range(apex - back, yb + 1):
        for x in range(dc - half - 1, dc + half + 2):
            off = abs(x - dc)
            rake = apex + off * (wall_top - apex) / (half + 1)     # the raking edge's row at this column
            if y < rake - back + off * 0.25:
                continue                                           # above the valley: the main roof
            if y < rake:                                           # the dormer's own roof, its two cheeks
                if x == dc:
                    c = SL[9]                                      # the ridge
                elif x < dc:
                    c = SL[7] if (x - dc) % 3 else SL[5]
                else:
                    c = SL[3] if (x - dc) % 3 else SL[2]
                sp.set(x, y, c, 1)
            elif y < rake + 1:                                     # the barge boards along the rake
                sp.set(x, y, FORT[7] if x <= dc else FORT[4], 2)
            elif off <= half:                                      # the gable and front wall, dressed stone
                course = (yb - y) // 3
                j = (x + (course % 2) * 3) % 6
                c = FORT[3] if (yb - y) % 3 == 2 or j == 0 else FORT[5] if x < dc - 3 else FORT[4]
                if off == half:
                    c = FORT[6] if x < dc else FORT[2]
                if y == yb:
                    c = FORT[2]
                sp.set(x, y, c, 2)
    win = [".ooo.", "odddo", "oddde", "dgdgd", "gqgqg", "gpgpg", "pqpqp", "sssss"]   # an arched window, lit within
    paint(sp, dc - 2, yb - 8, win, {"o": OUTLINE, "d": SL[0], "e": SL[1], "g": GOLD[4], "q": GOLD[6],
                                    "p": GOLD[5], "s": FORT[7]}, 3)


def roof_tower():
    W, H = ROOF_W, ROOF_H
    face, U, V, geo = roof_geometry()
    cx = geo[0]
    obj = slates(face, U, V, geo)
    hips(obj, face, geo)
    eaves(obj)
    # what stands on it: the dormer, the spire on the peak, a pole and a small red pennant
    sp = Sprite(W, H, "roof_tower_spire")
    dormer(sp, int(round(cx)), H - 18)
    px = int(round(cx))
    top = PEAK_Y - 24
    for y in range(top, PEAK_Y + 3):                               # a slender lead spire
        t = (y - top) / (PEAK_Y + 2 - top)
        half = 0.6 + t * 3.8
        for x in range(px - 6, px + 7):
            dx = x + 0.5 - (cx + 0.5)
            if abs(dx) > half:
                continue
            nx = dx / half
            c = 6 if nx < -0.55 else 5 if nx < -0.1 else 3 if nx < 0.45 else 1
            if (y - PEAK_Y) % 6 == 0:
                c -= 2                                             # the seams of the lead
            sp.set(x, y, LEAD[max(0, c)], 1)
    for x in range(px - 2, px + 3):                                # a gold ring round it
        sp.set(x, PEAK_Y - 9, GOLD[6] if x < px else GOLD[4] if x == px else GOLD[3], 1)
    for y in range(5, top):                                        # the pole
        sp.set(px, y, IRON[6], 2)
    paint(sp, px - 1, 1, [".l.", "lmn", ".n."], {"l": GOLD[7], "m": GOLD[5], "n": GOLD[3]}, 3)   # a gold ball
    for i in range(17):                                            # the pennant, flying east, a gentle wave
        x = px + 1 + i
        wave = int(round(math.sin(i / 16 * math.pi * 1.6) * 1.3))
        hgt = max(1, int(round(6 * (1 - i / 18))))
        for k in range(hgt):
            y = 5 + wave + k + (6 - hgt) // 2
            c = CLOTH[6] if k == 0 else CLOTH[5] if k < hgt - 1 else CLOTH[3]
            if i % 6 == 5:
                c = CLOTH[4] if k == 0 else CLOTH[3]               # a fold
            sp.set(x, y, c, 4)
    sp.outline(OUTLINE)
    spire = sp.obj
    out = obj.copy()                                               # their shade on the slates, down to the right
    for y in range(H - 2):
        for x in range(W - 2):
            yy, xx = y + 2, x + 2
            if spire[y, x, 3] and not spire[yy, xx, 3] and face[yy, xx] >= 0 and yy < H - 4:
                out[yy, xx, :3] = (obj[yy, xx, :3] * 0.62).astype(np.uint8)
    m = spire[:, :, 3] > 0
    img = out.copy()
    img[m] = spire[m]
    return img, {"roof": [out], "spire": [spire]}


def roof_keep_flag():
    """A flagpole standing on the keep's roof ridge (its bottom 8 px sit on the roof): a red banner with a gold crown
    flying east, a gold finial, an iron collar where it is fixed to the ridge."""
    sp = Sprite(16, 32, "roof_keep_flag")
    for y in range(3, 30):                                         # the pole
        sp.set(3, y, PLANK[7] if y < 24 else PLANK[6], 1)
        sp.set(4, y, PLANK[4], 1)
    paint(sp, 3, 0, ["lm", "mn", "on"], {"l": GOLD[7], "m": GOLD[5], "n": GOLD[3], "o": GOLD[4]}, 2)
    paint(sp, 2, 27, ["5664", "4553", "3442"], STEEL, 2)          # the collar fixing it to the ridge
    for i in range(10):                                            # the banner: a wave, a swallow-tail
        x = 5 + i
        wave = int(round(math.sin(i / 9 * math.pi * 1.3) * 1.0))
        top, bot = 4 + wave, 13 + wave
        for y in range(top, bot + 1):
            k = y - top
            if i >= 8 and 3 + (i - 7) <= k <= 9 - 3 - (i - 7):
                continue                                           # the swallow-tail's notch
            c = CLOTH[6] if k == 0 else CLOTH[5] if k < 3 else CLOTH[4] if k < 7 else CLOTH[3]
            if i in (3, 6):
                c = CLOTH[max(1, CLOTH.index(c) - 1)]              # the folds
            if k == 9:
                c = CLOTH[2]
            sp.set(x, y, c, 3)
    paint(sp, 7, 7, ["q.p.o", "qppon", "onnnm"], {"q": GOLD[7], "p": GOLD[6], "o": GOLD[5], "n": GOLD[4], "m": GOLD[3]}, 4)
    sp.outline(OUTLINE)
    for y in range(26, 32):                                        # its shadow on the roof, down to the right
        for x in range(5, 12):
            if not sp.obj[y, x, 3] and abs((y - 26) - (x - 5) * 0.8) <= 1:
                sp.shadow[y, x] = SHADOW
    return sp.image(), {"shadow": [sp.shadow.copy()], "flag": [sp.obj.copy()]}


PROPS = {
    "weapon_rack": weapon_rack, "weapon_rack_axes": weapon_rack_axes,
    "armor_stand": armor_stand, "armor_stand_gold": armor_stand_gold, "throne": throne,
}
SPRITES = {"ornament_weapons": ornament_weapons, "roof_tower": roof_tower, "roof_keep_flag": roof_keep_flag}


# ---------- preview ----------

def _scene(grid, base, things=(), ornaments=(), roofs=(), extra_order=()):
    """Draw a little map the way the game does: the ground through the dual grid, then the wall ornaments, then
    props and creatures sorted by their bottom edge, then roofs. grid: rows of terrain ids (None = base) or lists
    (a tile's layers, bottom to top). things: (image, x, bottom y) in world px. ornaments: (variant, tile x, tile y).
    roofs: (image, x, y) in world px."""
    import preview as pv
    from PIL import Image
    for t in extra_order:
        if t not in pv.ORDER:
            pv.ORDER.insert(pv.ORDER.index("fort_wall"), t)
    stacks = []
    for row in grid:
        stacks.append([])
        for c in row:
            layers = c if isinstance(c, list) else ([c] if c else [])
            stacks[-1].append([base] + [l for l in layers if l != base])
    canvas = pv.render(None, base, stacks=stacks)
    strip = Image.fromarray(ornament_weapons()[0], "RGBA")
    for v, tx, ty in ornaments:
        canvas.alpha_composite(strip.crop((v * 16, 0, v * 16 + 16, 32)), (tx * T, ty * T))
    for im, x, bottom in sorted(things, key=lambda t: t[2]):
        canvas.alpha_composite(im, (int(x), int(bottom - im.height)))
    for im, x, y in roofs:
        canvas.alpha_composite(im, (int(x), int(y)))
    return canvas


def _prop(name):
    from PIL import Image
    import props
    fn = PROPS.get(name) or props.PROPS[name]
    return Image.fromarray(fn(), "RGBA")


def _at(name, tx, ty, w=1, flip=False):
    """A prop standing on its footprint: tiles tx..tx+w-1 of row ty, centred."""
    from PIL import Image
    im = _prop(name)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im, tx * T + w * T / 2 - im.width / 2, (ty + 1) * T


def _beast(cid, x, y, flip=False):
    import preview as pv
    from PIL import Image
    if not (pv.BEAST / cid).exists():
        return None
    im = pv.creature(cid)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im, x - im.width / 2, y


def _box(g, x0, y0, x1, y1, t):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = t


def armoury_scene():
    """An armoury: a fort_wall room on stone floor, the wall weapons on its north wall, racks and armour stands."""
    W, H = 16, 10
    g = [[None] * W for _ in range(H)]
    _box(g, 0, 0, W - 1, H - 1, "fort_wall")
    _box(g, 1, 2, W - 2, H - 2, "stone_floor")
    g[H - 1][7] = g[H - 1][8] = "stone_floor"                     # the doorway
    orn = [(0, 2, 1), (1, 3, 1), (2, 4, 1), (0, 9, 1), (2, 10, 1), (1, 13, 1)]
    things = [_at("weapon_rack", 5, 2, 2), _at("weapon_rack_axes", 7, 2, 2), _at("armor_stand", 11, 2),
              _at("armor_stand", 12, 2), _at("weapon_rack", 2, 5, 2), _at("barrel", 1, 3), _at("crate", 14, 2),
              _at("armor_stand", 13, 6), _at("weapon_rack_axes", 10, 6, 2), _at("brazier", 1, 7), _at("crate", 14, 7)]
    b = _beast("rock_golem", 7.5 * T, 6.6 * T)
    if b:
        things.append(b)
    return _scene(g, "grass", things, orn)


def throne_scene():
    """The keep's throne room: the throne at the end of a red carpet, gilded armour and banners either side."""
    W, H = 12, 10
    g = [[None] * W for _ in range(H)]
    _box(g, 0, 0, W - 1, H - 1, "fort_wall")
    _box(g, 1, 2, W - 2, H - 2, "stone_floor")
    g[H - 1][5] = g[H - 1][6] = "stone_floor"
    import terrain
    carpet = "carpet" in terrain.all_terrains()
    if carpet:
        for y in range(3, H):
            for x in (5, 6):
                g[y][x] = ["stone_floor", "carpet"]
    things = [_at("throne", 5, 3, 2), _at("armor_stand_gold", 3, 3), _at("armor_stand_gold", 8, 3, flip=True),
              _at("banner", 2, 2), _at("banner", 9, 2), _at("brazier", 3, 6), _at("brazier", 8, 6),
              _at("statue", 1, 7), _at("statue", 10, 7)]
    orn = [(2, 4, 1), (2, 7, 1), (0, 1, 1), (0, 10, 1)]
    return _scene(g, "grass", things, orn, extra_order=("carpet",) if carpet else ())


def hall_scene():
    """The wall weapons on the Town Hall's pale stone wall (hall_wall), if that terrain exists."""
    import terrain
    if "hall_wall" not in terrain.all_terrains():
        return None
    W, H = 9, 5
    g = [[None] * W for _ in range(H)]
    _box(g, 0, 0, W - 1, 1, "hall_wall")
    _box(g, 0, 2, W - 1, H - 1, "wood_floor")
    orn = [(0, 1, 1), (1, 3, 1), (2, 5, 1), (0, 7, 1)]
    return _scene(g, "grass", (), orn, extra_order=("hall_wall",))


def tower_scene():
    """A 9x9 corner tower (walls 2 thick round a 5x5 stone room) on grass with its roof, and the same tower bare."""
    from PIL import Image
    W, H = 22, 14
    g = [[None] * W for _ in range(H)]
    towers = ((1, 3), (12, 3))
    for x0, y0 in towers:
        _box(g, x0, y0, x0 + 8, y0 + 8, "fort_wall")
        _box(g, x0 + 2, y0 + 2, x0 + 6, y0 + 6, "stone_floor")
    roof = Image.fromarray(roof_tower()[0], "RGBA")
    x0, y0 = towers[0]
    things = []
    for c, x, y in (("griffin", 11.0 * T, 13.2 * T), ("bunny", 6 * T, 13.4 * T)):
        b = _beast(c, x, y)
        if b:
            things.append(b)
    things.append(_at("pine", 20, 2, 2))
    return _scene(g, "grass", things, roofs=[(roof, x0 * T - 3, (y0 + 9) * T - 10 - roof.height)])


def sheet_roof(sheet, w, h):
    """A sheet roof put together the way the game does (livebattle-ui.js roofImage): rows back eave, back slope x
    back, ridge, front slope x front, front eave; each row its left end, middles repeated, right end."""
    from PIL import Image
    back = max(0, int((h - 3) * 0.4))
    front = max(0, h - 3 - back)
    W = w * T + 6
    out = Image.new("RGBA", (W, h * T))
    for k, row in enumerate([0] + [1] * back + [2] + [3] * front + [4]):
        y, sy = k * T, row * T
        out.alpha_composite(sheet.crop((0, sy, T, sy + T)), (0, y))
        x = T
        while x < W - T:
            cw = min(T, W - T - x)
            out.alpha_composite(sheet.crop((T, sy, T + cw, sy + T)), (x, y))
            x += T
        out.alpha_composite(sheet.crop((2 * T, sy, 3 * T, sy + T)), (W - T, y))
    return out, (1 + back) * T


def keep_scene():
    """The keep under a slate sheet roof (village_ground's roof_slate), roof_keep_flag standing on its ridge."""
    from PIL import Image
    try:
        import village_ground
        sheet = Image.fromarray(village_ground.SPRITES["roof_slate"]()[0], "RGBA")
    except Exception:          # the village art isn't there: nothing to stand the flag on
        return None
    W, H = 12, 10
    g = [[None] * W for _ in range(H)]
    x0, y0, w, h = 2, 2, 8, 6
    _box(g, x0, y0, x0 + w - 1, y0 + h - 1, "fort_wall")
    _box(g, x0 + 1, y0 + 1, x0 + w - 2, y0 + h - 2, "stone_floor")
    roof, ridge = sheet_roof(sheet, w, h)
    top = y0 * T - 10
    flag = Image.fromarray(roof_keep_flag()[0], "RGBA")
    roof.alpha_composite(flag, (int(3 + w * T / 2 - flag.width / 2), ridge + 8 - flag.height + 10 - 10))
    return _scene(g, "grass", (_at("banner", 1, 8), _at("banner", 10, 8)), roofs=[(roof, x0 * T - 3, top)])


def items_sheet(k=4):
    """Every item at 4x on stone floor, for a close look."""
    from PIL import Image
    import preview as pv
    W, H = 30, 4
    g = [["stone_floor"] * W for _ in range(H)]
    ims = [_prop(n) for n in PROPS] + [Image.fromarray(SPRITES[n]()[0], "RGBA") for n in ("ornament_weapons", "roof_keep_flag")]
    canvas = pv.render(g, "stone_floor")
    x = 8
    for im in ims:
        canvas.alpha_composite(im, (x, canvas.height - 6 - im.height))
        x += im.width + 10
    return pv.zoom(canvas.crop((0, 0, x, canvas.height)), k)


def preview():
    from PIL import Image, ImageDraw
    import preview as pv
    k = 3
    shots = [("armoury: weapon racks, armour stands, wall weapons on fort_wall", armoury_scene()),
             ("throne room", throne_scene())]
    hall = hall_scene()
    if hall is not None:
        shots.append(("wall weapons on hall_wall (the Town Hall's pale stone)", hall))
    keep = keep_scene()
    if keep is not None:
        shots.append(("roof_keep_flag on a keep's slate roof (village_ground roof_slate)", keep))
    shots.append(("corner tower: roof_tower, and the bare tower", tower_scene()))
    shots = [(t, pv.zoom(im, k)) for t, im in shots]
    items = items_sheet(4)
    rows = [[shots[0], shots[1]], shots[2:-1], [shots[-1]], [("every item, 4x", items)]]
    rows = [r for r in rows if r]
    pad = 16
    width = max(sum(im.width for _, im in r) + pad * (len(r) + 1) for r in rows)
    height = sum(max(im.height for _, im in r) + 34 for r in rows) + pad
    out = Image.new("RGBA", (width, height), (28, 24, 38, 255))
    d = ImageDraw.Draw(out)
    y = pad
    for r in rows:
        x = pad
        for title, im in r:
            d.text((x, y), title, fill=(240, 220, 160, 255), font=pv.font(15))
            out.paste(im, (x, y + 22))
            x += im.width + pad
        y += max(im.height for _, im in r) + 34
    path = HERE / "preview" / "fortress_art_preview.png"
    out.save(path)
    print(path, out.size)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        preview()
    else:
        print(__doc__)
