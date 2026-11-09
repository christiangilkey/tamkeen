"""Dungeon set pieces for the battle arenas: a spike trap, a cracked wall that hides a room, treasure, statues,
a cage, coins, chains and torches on the walls, and a swinging axe.

Built by terrain.py (it imports this file, see EXTRA there):

    .venv/Scripts/python game/art-src/terrain/terrain.py build spikes cracked_wall prop_chest prop_statue_gargoyle \
        prop_statue_knight prop_cage decal_coins ornament_chains ornament_torch hazard_axe --aseprite
    .venv/Scripts/python game/art-src/terrain/dungeon_art.py preview      preview/dungeon_art_preview.png

Same light and view as the rest of the terrain: light from the top left, the creatures' three-quarter angle (raised
things show their south face and cast a see-through shadow to the lower right), dark outlines on things that stand.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pix import T, blank, hx, put, ramp, stamp  # noqa: E402
from terrain import OUTLINE, SHADOW, SHADOW_SOFT, DungeonWall, Floor, ri, rng_for  # noqa: E402

HERE = Path(__file__).resolve().parent

# ---------- palettes ----------

PLATE = ramp("#0b0a0f #16131a #211c24 #2c252e #3a3139 #4a3f45 #5e5156 #76676a")   # the trap's dark iron
RUST = ramp("#3a1c14 #5a2c1a #7c4022 #9c5a2c")
STEEL = ramp("#24242e #3a3a48 #545462 #70707e #9294a0 #b8bac4 #dfe1e8 #ffffff")   # bright blades and spikes
DRAUGHT = [hx("#10283a"), hx("#1a4e64"), hx("#2f8ea6"), hx("#6ccfe0")]           # cold air from the hidden room


# ---------- spikes: a spike-trap plate set into the floor ----------
# The plate is a grate of small iron squares, one hole in the middle of each (2 by 2 holes a tile), with a frame where
# it meets the floor. Its 4 frames are not a loop: the game picks one by the battle's clock.

SPIKE_H = (0, 2, 5, 3)   # how far the spikes stand out of their holes in each frame (0 down, 1 tips, 2 up, 3 halfway)


class Spikes(Floor):
    """A square-edged iron plate set into the stone floor: a grid of small square plates, each with a hole in its
    middle, a frame round its edge. Frame 0: spikes down (dark tips deep in the holes); 1: tips poking out;
    2: up (sharp steel with a bright glint, each casting a tiny shadow); 3: halfway (going down)."""
    id = "spikes"
    pal = PLATE
    frames = 4
    groups = 1
    detail_gap = 1

    def base(self, frame):
        p = self.pal
        rng = rng_for(self.id, "base", self.salt)
        img = blank()
        for y in range(T):
            for x in range(T):
                u, v = x % 8, y % 8
                if u == 7 or v == 7:
                    c = p[1]                         # the groove between two squares
                elif u == 0 or v == 0:
                    c = p[5] if (u, v) != (0, 6) and (u, v) != (6, 0) else p[4]   # lit top and left edges
                elif u == 6 or v == 6:
                    c = p[3]                         # shaded lower and right edges
                else:
                    c = p[4]
                    if rng.random() < 0.08:
                        c = p[3]
                img[y, x] = c
        for qy in (0, 8):
            for qx in (0, 8):
                self.hole(img, qx, qy, frame)
        return img

    def hole(self, img, qx, qy, frame):
        """The hole in the middle of one square, and its spike at this frame's height."""
        p = self.pal
        for dx in (2, 3, 4):
            img[qy + 3, qx + dx] = p[2]              # the hole's far rim, in shade
            img[qy + 4, qx + dx] = p[0]
            img[qy + 5, qx + dx] = p[0]
            img[qy + 6, qx + dx] = p[6]              # its near rim catching the light
        img[qy + 4, qx + 5] = p[3]
        img[qy + 5, qx + 5] = p[5]
        h = SPIKE_H[frame]
        if h == 0:                                   # down: a dull tip deep in the dark
            img[qy + 5, qx + 3] = STEEL[1]
            img[qy + 4, qx + 3] = STEEL[0]
            return
        spike(img, qx + 3, qy + 5, h)

    def details(self, img, rng, ok, frame, variant):
        pass

    def group(self, img, rng, frame, g, v):
        pass

    def fill(self, variant, frame=0):
        """Fill tiles: the same spikes in every one (so a patch reads cleanly), a little rust and wear that differ."""
        self.salt = ("fill", variant)
        img = self.base(frame)
        rng = rng_for(self.id, "fill", variant)
        q = [(0, 0), (8, 0), (0, 8), (8, 8)]
        if variant == 1:     # rust bleeding out of a hole
            qx, qy = q[ri(rng, 0, 3)]
            for x, y in ((1, 5), (1, 6), (2, 6), (5, 5), (5, 6)):
                img[qy + y, qx + x] = RUST[1] if (x + y) % 2 else RUST[2]
        elif variant == 2:   # a rivet left proud where two squares meet
            for qx, qy in q[:2]:
                img[qy + 7, qx + 7] = self.pal[7]
        elif variant == 3:   # a scuffed, paler square
            qx, qy = q[ri(rng, 0, 3)]
            for y in (1, 2):
                for x in range(1, 6):
                    if img[qy + y, qx + x][3] and tuple(img[qy + y, qx + x]) == tuple(self.pal[4]):
                        img[qy + y, qx + x] = self.pal[5]
        return img

    def rim(self, img, sh, frame):
        """Where the plate meets the floor: a dark seam on its own edge pixel; inside it the frame is in shade on the
        far (north) and west sides and lit on the near ones, as the plate sits a hair below the floor."""
        p = self.pal
        for y in range(T):
            for x in range(T):
                if not sh.ins[y, x]:
                    continue
                dn, ds, dw, de = sh.dN[y, x], sh.dS[y, x], sh.dW[y, x], sh.dE[y, x]
                if min(dn, ds, dw, de) == 1:
                    img[y, x] = OUTLINE
                elif dn == 2 or dw == 2:
                    img[y, x] = p[2]
                elif ds == 2 or de == 2:
                    img[y, x] = p[6]

    def edge(self, bits, frame=0):
        img = super().edge(bits, frame)
        # spikes in the squares by the edge stand in front of the frame: draw them again over it
        sh = self.shape(bits)
        for qy in (0, 8):
            for qx in (0, 8):
                if sh.ins[qy + 5, qx + 3] and SPIKE_H[frame]:
                    spike(img, qx + 3, qy + 5, SPIKE_H[frame], shadow=False)   # (its shadow is there already)
        return img


def spike(img, cx, by, h, shadow=True):
    """A steel spike standing h px out of its hole (base at row by, column cx): a 3 px shaft lit on its left, tapering
    to a needle point with a glint; a tiny shadow on the plate to its lower right."""
    S = STEEL
    rows = {  # height -> its rows from the base up: (left, middle, right) tones, None = nothing there
        2: [(None, 2, None), (None, 4, None), (None, 6, None)],
        3: [(4, 2, 1), (None, 4, None), (None, 5, None), (None, 6, None)],
        5: [(5, 3, 1), (6, 4, 2), (6, 4, 2), (None, 5, 2), (None, 6, None), (None, 7, None)],
    }[h]
    for k, cols in enumerate(rows):
        for dx, c in zip((-1, 0, 1), cols):
            if c is not None:
                put(img, cx + dx, by - k, S[c])
    if h >= 3 and shadow:   # its shadow, falling to the lower right
        for dx, dy in ((2, 0), (2, 1), (3, 1)) if h >= 5 else ((2, 0), (2, 1)):
            put(img, cx + dx, by + dy, SHADOW)


# ---------- cracked wall: a weak spot in a dungeon wall ----------
# Drawn OVER the dungeon wall: the game puts dungeon_wall under it (battlemap.js TERRAIN: under: "dungeon_wall"), so
# the wall itself (top, face, outline, shadow) comes from dungeon_wall and joins the wall round it with no seam; these
# sheets are see-through except for the crack, the chipped mortar, the cold glow and the rubble at its foot.
# A cell only knows which of its corners are cracked, so each crack tile's marks are designed for the tile on its own
# (16 x 24 px: its top half, its face, and the floor just in front) and every cell draws the quarters of the tiles at
# its cracked corners; where two crack tiles sit side by side the cell between them adds a fissure joining them.
# It assumes the tile south of a crack tile is floor (the crack shows on the face) or another crack tile (no face).

class CrackedWall(DungeonWall):
    """A dungeon wall with a weak spot: a jagged crack down its face and across its top, mortar fallen out of a few
    joints, a cold blue draught glowing in the deepest part of the crack, a little rubble at its foot."""
    id = "cracked_wall"
    groups = 1

    def __init__(self):
        super().__init__()
        self.o_face = self.tile_marks(face=True)
        self.o_top = self.tile_marks(face=False)

    # the marks of one crack tile, in its own coordinates: rows 0-7 its north half (the top), 8-16 its face (8 the lip,
    # 9-12 the upper course of blocks, 13-15 the lower one, 16 the wet foot), 17 the wall's outline, 18-23 the floor in
    # front. Letters: k crack, d m n o l h w the wall's own tones dark to light (1 2 3 4 6 7 8), 1-4 the cold draught
    # (dim to bright), a b c e rubble (lit to dark), s shadow. The crack follows the face's joints where it can.
    TOP = [
        "................",
        "................",
        "...k........k...",
        "...wkk.....kw...",
        "......kw..k.....",
        ".......kkw......",
        ".......kw.......",
        "........kw......",
    ]
    FACE = [
        "......mkkw......",
        ".......mkw.kw...",
        "......mkkw.kw...",
        ".....mkk2kwkw...",
        "..kkkkk343kkk...",
        "..ww.mk32kw.....",
        "....kmmk2kw.....",
        "....kw.kkw......",
        ".......kkk......",
        "................",
        ".....awb..a.....",
        "....abbcs.bc....",
        ".....ccs..s.....",
        "...b............",
        "...s............",
        "................",
    ]
    NOFACE = [   # no face below (another crack tile to the south): the crack runs on over the top
        "........k.......",
        "........kh......",
        ".......k........",
        ".......kh.......",
        "......k.........",
        "................",
        "................",
        "................",
    ]

    def tile_marks(self, face):
        p = self.pal
        cmap = {"k": p[0], "d": p[1], "m": p[2], "n": p[3], "o": p[4], "l": p[6], "h": p[7], "w": p[8],
                "1": DRAUGHT[0], "2": DRAUGHT[1], "3": DRAUGHT[2], "4": DRAUGHT[3],
                "a": p[8], "b": p[6], "c": p[4], "e": p[3], "s": SHADOW}
        o = np.zeros((24, T, 4), np.uint8)
        stamp(o, 0, 0, self.TOP, cmap)
        stamp(o, 0, 8, self.FACE if face else self.NOFACE, cmap)
        return o

    def cell(self, bits):
        """The overlay for a cell whose cracked corners are `bits` (NW 1, NE 2, SW 4, SE 8)."""
        img = blank()
        if bits == 0:
            return img

        def paste(o, ox, oy, x0, x1, y0, y1):
            # tile rows y0..y1, columns x0..x1 of overlay o, to the cell at (ox, oy)
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    c = o[y, x]
                    if c[3]:
                        put(img, ox + x - x0, oy + y - y0, tuple(int(v) for v in c))

        if bits & 1:   # the NW tile's south-east quarter (and the floor below it)
            o = self.o_top if bits & 4 else self.o_face
            paste(o, 0, 0, 8, 15, 8, 23)
        if bits & 2:   # the NE tile's south-west quarter
            o = self.o_top if bits & 8 else self.o_face
            paste(o, 8, 0, 0, 7, 8, 23)
        if bits & 4:   # the SW tile's north-east quarter
            paste(self.o_face, 0, 8, 8, 15, 0, 7)
        if bits & 8:   # the SE tile's north-west quarter
            paste(self.o_face, 8, 8, 0, 7, 0, 7)
        p = self.pal
        if bits & 3 == 3 and not bits & 12:   # two crack tiles side by side: the joint between them opened up too
            for x in range(4, 10):
                put(img, x, 4, DRAUGHT[1] if x == 7 else DRAUGHT[0] if x in (6, 8) else p[0])
            for x in (4, 5, 9):
                put(img, x, 5, p[8])
        return img

    def edge(self, bits, frame=0):
        return self.cell(bits)

    def fill(self, variant, frame=0):
        return self.cell(15)

    def fill_strip(self):
        s = blank(4 * T, T)
        for k in range(4):
            s[:, k * T:(k + 1) * T] = self.fill(k)
        return s


TERRAINS = {t.id: t for t in (Spikes(), CrackedWall())}


# ---------- props ----------
# Standing on the bottom edge of a one-row footprint, centred on it, with their own see-through ground shadow and a
# dark outline (props.finish); props_more.done where something is added after the outline (sparkles, glints).

from props import MOSS, OUTLINE as P_OUTLINE, Sprite, finish, line  # noqa: E402
from props_more import GOLD, IRON, PLANK, STATUE, _shift, done  # noqa: E402

BONE = ramp("#3e3430 #5a4a44 #8a7a6e #b8aa98 #ddd2c0 #f4ecdc")


def grid(sp, x0, y0, rows, cmap, part=0):
    """Paint a designed pixel grid into a sprite ('.' and ' ' are left alone)."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch not in ". ":
                sp.set(x0 + i, y0 + j, cmap[ch], part)


def wood_iron_gold():
    m = {str(i): PLANK[i] for i in range(9)}
    m.update({"q": IRON[2], "r": IRON[3], "t": IRON[4], "u": IRON[5], "v": IRON[6], "w": IRON[7], "k": IRON[0],
              "G": GOLD[2], "H": GOLD[3], "J": GOLD[4], "K": GOLD[5], "L": GOLD[6], "M": GOLD[7]})
    return m


def chest():
    """A wooden treasure chest: a barrel-top lid with iron bands, a gold trim and lock, the lid a hair open with
    treasure glinting in the gap."""
    sp = Sprite(16, 16, "chest")
    sp.ground_shadow(9.5, 14.4, 7.4, 1.9)
    rows = [
        "..wv77777777vw..",   # 3  the lid's top, lit
        ".6vu77777777uv5.",   # 4
        ".6ut66666666ut4.",   # 5
        ".5tr55555555tr3.",   # 6  the lid curving away below
        ".4rq44JKKJ44rq3.",   # 7
        ".KLLKJJMLKJJJKJ.",   # 8  gold trim along the lid's edge, treasure in the gap
        ".3tr22JkkJ22tr2.",   # 9  the lid's shade on the box; the lock
        ".6ut55JkkJ55ut3.",   # 10
        ".6ut555HH555ut3.",   # 11
        ".4rq33333333rq2.",   # 12 a seam between the planks
        ".6wt55555555tw3.",   # 13 rivets on the bands
        ".4rq33333333rq2.",   # 14 the bottom edge
    ]
    grid(sp, 0, 3, rows, wood_iron_gold())
    for x in range(16):   # the bottom row meets the ground
        _shift(sp, x, 14, PLANK, -1)
    finish(sp)
    for x, y, c in ((13, 1, GOLD[7]), (13, 0, GOLD[5]), (12, 1, GOLD[5]), (14, 1, GOLD[5]), (13, 2, GOLD[5])):
        if not sp.obj[y, x, 3] or tuple(sp.obj[y, x][:3]) == tuple(P_OUTLINE[:3]):
            sp.obj[y, x] = c   # a twinkle of light off the gold
    return done(sp)


def plinth(sp, top, bottom, x0=2, x1=13, step=True):
    """A square stone plinth like prop_statue's: a lit top, a moulded edge, a shaded front, a wider foot."""
    S = STATUE
    for y in range(top, bottom + 1):
        foot = step and y >= bottom - 1
        for x in range(x0 - 1 if foot else x0, (x1 + 1 if foot else x1) + 1):
            if y == top:
                c = 6
            elif y <= top + 2:
                c = 7                                  # the top, seen from above
            elif y == top + 3:
                c = 5                                  # its front edge
            elif y == top + 4:
                c = 2                                  # the shade under the moulding
            elif y == bottom - 1 and step:
                c = 6                                  # the foot's lit top
            elif y == bottom:
                c = 4 if step else 3
            else:
                c = 4
            left, right = (x0 - 1, x1 + 1) if foot else (x0, x1)
            c += 1 if x == left else -2 if x == right else -1 if x == right - 1 else 0
            sp.set(x, y, S[max(0, min(8, c))], 0)


# designed pixel by pixel: digits = tones of the stone ramp (0 darkest), '.' empty
GARGOYLE = [
    "6............3",   # 2  the wings' clawed tips, raised high behind it
    "76..........32",   # 3
    "766.7....4.321",   # 4  horns
    "66537....43321",   # 5
    "56526776541221",   # 6  the skull between the horns
    ".547877654321.",   # 7  pointed ears
    "..3278876311..",   # 8  a heavy brow
    "..2450430211..",   # 9  deep-set eyes
    "...26587431...",   # 10 the snout
    "...24100121...",   # 11 a wide grin
    "..6758337232..",   # 12 fangs; hunched shoulders
    ".577665544321.",   # 13
    ".566655444321.",   # 14
    ".675753353432.",   # 15 knees up by its sides, forelegs straight down
    "57647522534321",   # 16
    "56547521533321",   # 17
    "46537411523221",   # 18
    "455364..423211",   # 19
    "454364..422211",   # 20
    ".44364..42211.",   # 21
    "564.64..42.321",   # 22 hind feet on the plinth
    "675786..674432",   # 23 claws
    "...5.4..4.3...",   # 24 hooked over its edge
]


def statue_gargoyle():
    """A stone gargoyle crouched on a plinth, wings folded up behind it, horns, a fanged grin and claws hooked over
    the plinth's edge, its tail curled down the side. The same weathered stone as prop_statue, a little moss."""
    sp = Sprite(16, 32, "statue_gargoyle")
    sp.ground_shadow(9.5, 30.3, 7.2, 1.8)
    S = STATUE
    plinth(sp, 21, 30)
    for j, row in enumerate(GARGOYLE):
        for i, ch in enumerate(row):
            if ch != ".":
                sp.set(1 + i, 2 + j, S[int(ch)], 1)
    line(sp, [(12, 22), (14, 24), (14, 26), (13, 28)], S[3], part=12)   # the tail, down the plinth's side
    sp.set(12, 28, S[4], 12)
    sp.set(14, 25, S[4], 12)
    for x, y in ((2, 22), (3, 23), (13, 29), (1, 29), (2, 30), (2, 4)):   # moss
        if sp.has(x, y):
            sp.set(x, y, MOSS[3] if (x + y) % 2 else MOSS[2], int(sp.part[y, x]))
    for x, y in ((11, 25), (11, 26), (12, 27)):   # a crack in the plinth
        sp.set(x, y, S[1], 0)
    return finish(sp)


KNIGHT = [
    ".6..........3.",   # 3  the little wings on his helm
    ".76........43.",   # 4
    ".776.6776.432.",   # 5
    "..77678876543.",   # 6  the helm's domed top
    "...56777654...",   # 7
    "....500002....",   # 8  the eye slit
    "....671653....",   # 9  breaths
    "....561542....",   # 10
    ".....5642.....",   # 11 the gorget
    "..6787665543..",   # 12 pauldrons
    ".678656545432.",   # 13
    ".5676655477653",   # 14 his sword arm; the kite shield on his left arm
    ".6567654375742",   # 15 a cross carved on the shield
    ".5456654375742",   # 16
    ".6457654277862",   # 17
    ".7546654365742",   # 18 the sword's pommel
    "67536554365732",   # 19 his gauntlet round the grip
    "56435544264732",   # 20
    "78642362154631",   # 21 the crossguard; his belt and its buckle
    ".7446654354631",   # 22 the blade, point down by his side
    ".7446554354631",   # 23
    ".7456544244521",   # 24
    ".744654325432.",   # 25 the shield narrowing to its point
    ".74356432.432.",   # 26 the tabard's hem
    ".74.65153.43..",   # 27 legs
    ".74.75153..3..",   # 28
    ".74.64142.....",   # 29
    ".74.75163.....",   # 30 knee cops
    ".74.64142.....",   # 31
    ".74.54142.....",   # 32
    ".63.54142.....",   # 33
    ".63.53132.....",   # 34
    ".635641542....",   # 35 sabatons on the plinth
    ".53453.431....",   # 36
    ".4............",   # 37 the sword's point resting on it
]


def statue_knight():
    """A stone knight on a plinth, standing guard: a winged helm with an eye slit, a kite shield with a carved cross
    on his left arm, his right hand on the grip of a sword held point-down at his side. Weathered stone like
    prop_statue (which has a different knight: both hands on a sword between his feet), a little moss."""
    sp = Sprite(16, 48, "statue_knight")
    sp.ground_shadow(9.5, 46.3, 7.2, 1.8)
    S = STATUE
    plinth(sp, 35, 46)
    for x in range(5, 11):   # a sunk plaque on the plinth's front, lit along its lower right
        sp.set(x, 41, S[2], 0)
        sp.set(x, 42, S[3], 0)
        sp.set(x, 43, S[5], 0)
    sp.set(10, 42, S[5], 0)
    stamp(sp.obj, 7, 41, ["d.", "dd"], {"d": S[1]})
    for j, row in enumerate(KNIGHT):
        for i, ch in enumerate(row):
            if ch != ".":
                sp.set(1 + i, 3 + j, S[int(ch)], 1)
    for x in range(10, 15):  # his shade on the plinth's top
        if sp.part[37, x] != 1:
            _shift(sp, x, 37, S, -2)
    for x, y in ((2, 36), (13, 37), (2, 44), (3, 45), (13, 46), (12, 45), (6, 37)):   # moss
        if sp.has(x, y):
            sp.set(x, y, MOSS[3] if (x + y) % 2 else MOSS[2], int(sp.part[y, x]))
    for x, y in ((3, 40), (3, 41), (4, 42), (4, 43)):   # a crack in the plinth
        sp.set(x, y, S[1], 0)
    return finish(sp)


def chain_links(sp, pts, part, lit=6, dark=3):
    """A chain along a polyline: links alternating face-on (a lit pixel with a dark one beside it, showing the hole)
    and edge-on (a single mid pixel)."""
    path = []
    for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
        n = int(max(abs(xb - xa), abs(yb - ya)))
        for i in range(n):
            path.append((int(round(xa + (xb - xa) * i / n)), int(round(ya + (yb - ya) * i / n))))
    path.append(pts[-1])
    for i, (x, y) in enumerate(path):
        k = i % 3
        if k == 0:
            sp.set(x, y, IRON[lit], part)
        elif k == 1:
            sp.set(x, y, IRON[dark], part)
        else:
            sp.set(x, y, IRON[lit - 1], part)


def cage():
    """An iron cage on a short stand: a domed top with a ring, bars round a dark inside, iron bands, a padlock on
    its little door, a chain looped round it, and a skull and bones lying inside."""
    sp = Sprite(16, 32, "cage")
    sp.ground_shadow(9.5, 30.3, 6.6, 1.7)
    I = IRON
    cx, rx, ry = 8.0, 6.0, 1.6

    def arc(y0, x, front=True):
        dx = (x + 0.5 - cx) / rx
        if abs(dx) > 1:
            return None
        return y0 + (ry if front else -ry) * math.sqrt(1 - dx * dx)

    top, bot = 9, 23
    # the stand: a round foot and a short post
    for y in range(27, 31):
        for x in range(3, 13):
            dx = (x + 0.5 - cx) / 5.2
            if abs(dx) > 1:
                continue
            c = 6 if y == 27 else 5 if y == 28 else 3 if y == 29 else 2
            c += 1 if dx < -0.5 else -1 if dx > 0.5 else 0
            if y == 27 and abs(dx) > 0.75:
                continue
            sp.set(x, y, I[max(0, c)], 0)
    for y in range(24, 27):
        sp.set(7, y, I[6], 0)
        sp.set(8, y, I[3], 0)
    # inside: the back of the cage in deep shade, its floor, the back bars
    for x in range(16):
        a0, a1 = arc(top, x, False), arc(bot, x)
        if a0 is None:
            continue
        for y in range(int(round(a0)), int(round(a1)) + 1):
            sp.set(x, y, I[0] if y < bot - 2 else I[1], 1)
        if x in (3, 6, 9, 12):
            for y in range(int(round(a0)) + 1, int(round(arc(bot, x, False))) + 1):
                sp.set(x, y, I[1], 1)
    # a skull and a bone lying inside
    grid(sp, 4, 17, [".aab.", "abbbc", "akbkc", "bbbbc", ".b.c."], {"a": BONE[5], "b": BONE[4], "c": BONE[2], "k": BONE[0]}, 2)
    grid(sp, 8, 19, ["....ab", "...bc.", "..bc..", "abc...", "bc...."], {"a": BONE[5], "b": BONE[3], "c": BONE[1]}, 2)
    # the front bars, lit on the left of the cage, in shade on the right
    for x in (4, 7, 10):
        a0, a1 = arc(top, x), arc(bot, x)
        if a0 is None:
            continue
        dx = (x + 0.5 - cx) / rx
        c = 6 if dx < -0.5 else 5 if dx < 0 else 4 if dx < 0.5 else 3
        for y in range(int(round(a0)), int(round(a1)) + 1):
            sp.set(x, y, I[c], 3)
    for x in (2, 13):   # the cage's sides
        a0, a1 = arc(top, x), arc(bot, x)
        for y in range(int(round(a0)) - 1, int(round(a1)) + 1):
            sp.set(x, y, I[5] if x == 2 else I[2], 3)
    # bands round it: the top rim, one round the middle (with the door's hinge), the bottom
    for x in range(2, 14):
        for y0, hi in ((top, 7), (16, 6), (bot, 5)):
            yf = arc(y0, x)
            if yf is None:
                continue
            dx = (x + 0.5 - cx) / rx
            c = hi + (1 if dx < -0.5 else -1 if dx > 0.3 else 0) - (1 if dx > 0.7 else 0)
            sp.set(x, int(round(yf)), I[max(0, min(8, c))], 4)
            if y0 == bot:
                sp.set(x, int(round(yf)) + 1, I[2], 4)
        yb = arc(top, x, False)
        sp.set(x, int(round(yb)), I[5] if x < 8 else I[4], 4)   # the rim's far side
    # the dome: bars curving up to a cap and a ring to hang it by
    for x in range(2, 14):
        dx = (x + 0.5 - cx) / rx
        h = 4.2 * math.sqrt(max(0.0, 1 - dx * dx))
        yt = int(round(top - ry - h + 1))
        sp.set(x, yt, I[7] if dx < 0 else I[5] if dx < 0.5 else I[4], 5)
    for x, y, c in ((7, 6, 7), (8, 6, 5), (5, 7, 6), (10, 7, 4), (7, 5, 7), (8, 5, 5), (6, 7, 5), (9, 7, 4)):
        sp.set(x, y, I[c], 5)
    grid(sp, 6, 1, [".ab.", "a..c", ".bc."], {"a": I[7], "b": I[6], "c": I[4]}, 6)   # the ring
    # a padlock on the door
    grid(sp, 7, 15, [".i.", "ghg", "gkf"], {"i": I[6], "g": GOLD[5], "h": GOLD[6], "f": GOLD[3], "k": GOLD[1]}, 7)
    # a chain hanging from the ring, looped down round the cage's side to the stand
    chain_links(sp, [(10, 3), (12, 6), (14, 10), (14, 16), (13, 20), (14, 24), (12, 27)], 8, lit=6, dark=2)
    return finish(sp)


PROPS = {"chest": chest, "statue_gargoyle": statue_gargoyle, "statue_knight": statue_knight, "cage": cage}


# ---------- decals ----------

def coins_cell(img, rng, i):
    """Cell i of decal_coins: 0 scattered coins, 1 a cut gem with a coin or two, 2 a small pile of coins, 3 a few
    coins and a little stack. Flat, so no outline: lit on the top left, a small shadow to the lower right."""
    G = GOLD
    coin = {"a": G[7], "b": G[5], "c": G[3], "d": G[2], "s": SHADOW}
    flat = [".ab.", "abbc", ".cc."]                   # a coin lying flat
    small = ["ab", "bc"]
    tilted = ["ab", "bc", "cd"]                       # one leaning on its edge
    if i == 0:
        for (x, y), rows in (((2, 3), flat), ((8, 2), small), ((6, 8), flat), ((11, 9), small), ((3, 11), small),
                             ((11, 5), tilted)):
            stamp(img, x, y, rows, coin)
            put(img, x + len(rows[0]), y + len(rows) - 1, SHADOW)
    elif i == 1:
        gem = {"w": hx("#ffffff"), "l": hx("#ff8c9c"), "r": hx("#e0304a"), "m": hx("#a01836"), "d": hx("#5a0c24"),
               "s": SHADOW}
        stamp(img, 5, 4, [".wll.", "lrrrm", ".rmd.", "..d.s"], gem)   # a cut ruby catching the light
        stamp(img, 2, 10, flat, coin)
        put(img, 6, 12, SHADOW)
        stamp(img, 10, 10, small, coin)
        put(img, 12, 11, SHADOW)
    elif i == 2:
        pile = [
            "....ab....",
            "..abbcab..",
            ".abcabbcb.",
            "abbcbbcabc",
            "bccbcccbcd",
            ".dcddcdcd.",
        ]
        stamp(img, 3, 5, pile, coin)
        for x in range(4, 13):
            put(img, x + 1, 11, SHADOW)
        put(img, 13, 10, SHADOW)
        stamp(img, 1, 12, small, coin)
        stamp(img, 12, 2, small, coin)
        put(img, 7, 4, G[7])
    else:
        stack = [".ab.", "abbc", "cddc", "abbc", "cddc", "abbc", ".cc."]    # a little stack of coins
        stamp(img, 4, 5, stack, coin)
        for y in range(7, 12):
            put(img, 8, y, SHADOW)
        stamp(img, 10, 9, flat, coin)
        put(img, 14, 11, SHADOW)
        stamp(img, 9, 3, small, coin)
        gem = {"l": hx("#9ad8ff"), "r": hx("#3a8ee0"), "d": hx("#1c3e8a"), "s": SHADOW}
        stamp(img, 2, 12, [".l.", "lrd", ".ds"], gem)                     # a small sapphire


def coins():
    from decals import cells
    return cells("coins", 4, coins_cell)


DECALS = {"decal_coins": coins}


# ---------- sprites: things on the walls, and the swinging axe ----------
# Wall ornaments are 16x32 cells drawn with their top-left at a wall tile's top-left, over a dungeon_wall tile with
# floor to its south. In the cell: rows 0-7 are the wall's top, rows 8-16 its face (8 its lit lip, 9-12 the upper
# course of blocks, 13-15 the lower, 16 the wet foot that hangs over the floor's tile), 17 the wall's dark outline
# on the floor, 18-31 the floor in front.

GLOW_C = ramp("#5a1410 #8e2410 #c8420e #f07a18 #ffb83a #ffe88a")
FLAME_CORE = hx("#fffbe6")


def cast(img, mask, dx=1, dy=1, col=SHADOW_SOFT):
    """A see-through shadow on the wall or floor, to the lower right of every pixel in mask."""
    h, w = mask.shape
    for y in range(h):
        for x in range(w):
            if mask[y, x] and 0 <= x + dx < w and 0 <= y + dy < h and not mask[y + dy, x + dx] \
                    and img[y + dy, x + dx, 3] == 0:
                img[y + dy, x + dx] = col


def outline(img, col=OUTLINE):
    """A dark outline round the opaque pixels (like the props'), so iron reads against the dark wall."""
    h, w = img.shape[:2]
    solid = img[:, :, 3] == 255
    for y in range(h):
        for x in range(w):
            if img[y, x, 3] == 0 and any(0 <= x + dx < w and 0 <= y + dy < h and solid[y + dy, x + dx]
                                         for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                img[y, x] = col


def chain_v(img, x, y0, y1):
    """A hanging chain, column x, rows y0..y1: face-on links (a ring 3 wide, lit on its left) and edge-on ones."""
    y = y0
    k = 0
    while y <= y1:
        if k % 2 == 0:   # a face-on link: a little ring with the wall showing through
            for dx, dy, c in ((0, 0, 7), (-1, 1, 6), (1, 1, 4), (0, 2, 4)):
                if y + dy <= y1:
                    put(img, x + dx, y + dy, IRON[c])
            y += 3
        else:            # an edge-on link, seen side on
            put(img, x, y, IRON[6])
            if y + 1 <= y1:
                put(img, x, y + 1, IRON[4])
            y += 2
        k += 1


def staple(img, x, y):
    """The iron staple a chain hangs from: a bolted plate with a ring."""
    stamp(img, x - 1, y, ["hmd", "mkd"], {"h": IRON[7], "m": IRON[5], "d": IRON[3], "k": IRON[8]})


def ornament_chains():
    """Chains hung on a dungeon wall's face, 3 cells: two chains ending in open shackles that rest on the floor; one
    chain ending in a hook; a loop of chain sagging between two staples, one end hanging free."""
    cells = []
    for v in range(3):
        img = blank(T, 32)
        if v == 0:
            for x in (4, 11):
                staple(img, x, 9)
                chain_v(img, x, 11, 17)
                stamp(img, x - 2, 18, [".hhm.", "h...d", ".mdd."], {"h": IRON[8], "m": IRON[6], "d": IRON[4]})
        elif v == 1:
            staple(img, 8, 9)
            chain_v(img, 8, 11, 18)
            stamp(img, 7, 19, [".h..", ".m.k", "..md"], {"h": IRON[7], "m": IRON[5], "d": IRON[3], "k": IRON[8]})
        else:
            staple(img, 2, 9)
            staple(img, 13, 9)
            for i, x in enumerate(range(3, 13)):   # the loop: a sag between the two staples
                y = 10 + int(round(4.2 * math.sin(math.pi * (x - 2) / 11)))
                if i % 3 == 0:
                    put(img, x, y - 1, IRON[7])
                    put(img, x, y + 1, IRON[4])
                    put(img, x, y, IRON[1])        # the hole through a face-on link
                else:
                    put(img, x, y, IRON[6] if i % 3 == 1 else IRON[4])
            chain_v(img, 13, 11, 16)               # the loose end hanging from the right staple
        outline(img)
        cast(img, img[:, :, 3] > 0)
        cells.append(img)
    sheet = blank(3 * T, 32)
    for v, c in enumerate(cells):
        sheet[:, v * T:(v + 1) * T] = c
    return sheet, {"chains": [sheet]}


def flame(img, frame, cx=8.0, base=7, top=0):
    """A torch flame for one frame: three tongues swaying and stretching, hottest at the core, a deep red edge."""
    sway = [(0.0, 0.0, 0), (0.6, -0.5, 1), (-0.4, 0.5, 0), (0.3, -0.3, 1)][frame]
    tongues = [(cx + sway[0], top + (frame % 2), 3.2), (cx - 2.0 + sway[1], top + 3 - sway[2], 1.6),
               (cx + 2.0 - sway[1], top + 2 + sway[2], 1.5)]
    h, w = img.shape[:2]
    heat = np.zeros((h, w))
    for y in range(top, base + 1):
        for x in range(w):
            for tx, tip, bw in tongues:
                if y < tip:
                    continue
                t = (y - tip) / max(1, base - tip)
                wd = bw * t ** 0.7 + 0.45
                ax = tx + (cx - tx) * t * 0.6 + math.sin(t * 4 + frame * 1.7 + tx) * 0.5 * (1 - t)
                d = abs(x + 0.5 - ax)
                if d <= wd:
                    heat[y, x] = max(heat[y, x], (1 - d / wd) * (0.35 + 0.8 * t))
    for y in range(h):
        for x in range(w):
            hv = heat[y, x]
            if hv > 0.05:
                img[y, x] = GLOW_C[2] if hv < 0.22 else GLOW_C[3] if hv < 0.45 else GLOW_C[4] if hv < 0.65 else \
                    GLOW_C[5] if hv < 0.82 else FLAME_CORE
    for y in range(h):   # its edge: a deep red rim instead of a dark outline
        for x in range(w):
            if img[y, x, 3] == 0 and y <= base and any(0 <= y + dy < h and 0 <= x + dx < w and heat[y + dy, x + dx] > 0.05
                                                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                img[y, x] = GLOW_C[0] if y < base - 1 else GLOW_C[1]
    return heat


def ornament_torch():
    """A torch in an iron sconce on a dungeon wall's face, 4 frames: the flame flickers (it rises over the wall's top),
    a few sparks, and warm light falls on the stones round it."""
    frames = []
    for f in range(4):
        img = blank(T, 32)
        r = (5.6, 6.3, 5.2, 6.0)[f]   # the warm glow on the stones (see-through, so it tints them); it breathes
        for y in range(32):
            for x in range(T):
                d = math.hypot((x + 0.5 - 8.0) * 0.9, (y + 0.5 - 6.0) * 0.75)
                if d < r:
                    a = int(70 * (1 - d / r) ** 0.8)
                    if a > 8:
                        img[y, x] = (255, 150, 60, a)
        solid = blank(T, 32)
        # the sconce: a plate bolted to the face, an arm out to a cup that holds the torch
        stamp(solid, 6, 11, ["hmmd", "kmmd", "mmmd", "hmmd"], {"h": IRON[7], "m": IRON[4], "d": IRON[2], "k": IRON[6]})
        stamp(solid, 6, 9, ["hmmmd", ".md.."], {"h": IRON[6], "m": IRON[4], "d": IRON[2]})
        # the torch: a wooden handle, its head wrapped in pitch-soaked rags with embers in them
        for y in range(6, 10):
            put(solid, 7, y, PLANK[6])
            put(solid, 8, y, PLANK[4])
        stamp(solid, 6, 5, ["abbc", "bccd"], {"a": PLANK[3], "b": PLANK[2], "c": PLANK[1], "d": PLANK[0]})
        for x, y in ((7, 5), (8, 6)):
            put(solid, x, y, GLOW_C[2 + (f + x) % 2])
        outline(solid)
        sh = blank(T, 32)
        cast(sh, solid[:, :, 3] > 0, 1, 1, SHADOW)
        for layer in (sh, solid):
            m = layer[:, :, 3] > 0
            img[m] = layer[m]
        fl = blank(T, 32)
        flame(fl, f, cx=8.0, base=5, top=0)
        m = fl[:, :, 3] > 0
        img[m] = fl[m]
        for x, y in (((3, 1), (12, 3)), ((12, 0), (4, 4)), ((2, 2), (13, 1)), ((11, 2), (3, 0)))[f]:   # sparks
            if img[y, x, 3] < 255:
                img[y, x] = GLOW_C[4]
        frames.append(img)
    sheet = blank(4 * T, 32)
    for f, im in enumerate(frames):
        sheet[:, f * T:(f + 1) * T] = im
    return sheet, {"torch": frames}


# the pendulum: pivot pixel (48, 4); the crescent's outer edge is a circle of AXE_R round a centre AXE_C px down the
# pole, its inner edge the same circle moved AXE_D px up the pole (so the blade is AXE_D thick in the middle)
AXE_W, AXE_H = 96, 64
PIVOT = (48, 4)
AXE_R, AXE_C, AXE_D = 15.0, 35.5, 9.0
LIGHT2 = np.array([-0.6, -0.8])   # towards the light, on the screen


def axe_frame(k):
    """Frame k of the swinging blade: the pendulum at (k - 4) * 15 degrees from straight down (positive = swung to
    the right), every pixel worked out from the shape at that angle (no rotated bitmap, so it stays crisp)."""
    th = math.radians((k - 4) * 15)
    s, c = math.sin(th), math.cos(th)
    px, py = PIVOT[0] + 0.5, PIVOT[1] + 0.5
    img = blank(AXE_W, AXE_H)
    inner_c = AXE_C - AXE_D
    socket_v = inner_c + AXE_R                    # where the pole meets the blade's inner edge
    pole_end = socket_v + 2
    # which world direction each side of the pole faces, for its light
    side_lit = float(np.dot(np.array([c, -s]), LIGHT2))   # the +u side's facing towards the light
    for y in range(AXE_H):
        for x in range(AXE_W):
            dx, dy = x + 0.5 - px, y + 0.5 - py
            v = dx * s + dy * c                   # along the pole, from the pivot
            u = dx * c - dy * s                   # across it (+ = the pole's right when it hangs straight)
            ra = math.hypot(u, v - AXE_C)
            rb = math.hypot(u, v - inner_c)
            col = None
            if ra <= AXE_R and rb > AXE_R:        # the crescent
                d_edge = AXE_R - ra               # how far in from the cutting edge
                d_back = rb - AXE_R               # how far from the inner (back) edge
                # world-facing of the cutting edge here (its outward normal), for the light
                n = np.array([u, v - AXE_C]) / max(ra, 1e-6)
                nw = np.array([n[0] * c + n[1] * s, -n[0] * s + n[1] * c])
                lit = float(np.dot(nw, LIGHT2))
                if d_edge < 1.0:
                    col = STEEL[7] if lit > -0.35 else STEEL[6]          # the honed edge, bright
                elif d_edge < 2.2:
                    col = STEEL[6] if lit > -0.35 else STEEL[5]
                elif d_edge < 3.0:
                    col = STEEL[2]                                       # the bevel line
                elif d_back < 1.0:
                    col = STEEL[2]                                       # the thick back of the blade
                else:
                    # the flat face: lighter towards the top left of the blade
                    bx, by = px + AXE_C * s, py + AXE_C * c
                    t = (x + 0.5 - bx) * LIGHT2[0] + (y + 0.5 - by) * LIGHT2[1]
                    col = STEEL[5] if t > 4 else STEEL[4] if t > -3 else STEEL[3]
            elif abs(u) <= 3.4 and socket_v - 6 <= v <= socket_v + 1.5:   # the axe head's eye, clamping the blade
                lit = (u > 0) == (side_lit > 0)
                edge = abs(u) > 2.5
                col = IRON[6] if lit and edge else IRON[2] if edge else IRON[5] if lit else IRON[4]
                if abs(v - (socket_v - 5.3)) < 0.6 or abs(v - (socket_v + 1)) < 0.6:
                    col = IRON[3]                                         # its bands
            elif abs(u) <= 1.05 and 0 <= v <= pole_end:                  # the pole
                lit = (u > 0) == (side_lit > 0)
                col = IRON[6] if lit else IRON[3]
            if col is not None:
                img[y, x] = col
    # rivets on the socket, and a glint on the edge
    for du, dv, cc in ((-1.5, -2.5, IRON[7]), (1.5, -2.5, IRON[5])):
        sv = socket_v + dv
        X = px + sv * s + du * c
        Y = py + sv * c - du * s
        put(img, int(math.floor(X)), int(math.floor(Y)), cc)
    gv, gu = AXE_C + AXE_R * 0.72, -AXE_R * 0.69   # a glint where the edge turns towards the light
    put(img, int(math.floor(px + gv * s + gu * c)), int(math.floor(py + gv * c - gu * s)), hx("#ffffff"))
    # the bracket at the pivot: a plate on the ceiling beam, a round cheek over the pole's end, the pivot bolt
    stamp(img, 41, 0, ["hhhhhhhhhhhhhhm", "mmmmmmmmmmmmmmd"], {"h": IRON[6], "m": IRON[4], "d": IRON[2]})
    stamp(img, 45, 2, [".hhmmm.", "hmmmmmd", "hmmmmmd", "hmmmmmd", ".mmmdd.", "..ddd.."],
          {"h": IRON[6], "m": IRON[4], "d": IRON[2]})
    stamp(img, 47, 3, [".h.", "hmd", ".d."], {"h": IRON[8], "m": IRON[6], "d": IRON[3]})
    for bx in (42, 54):
        put(img, bx, 0, IRON[8])
    # a dark outline round it all
    solid = img[:, :, 3] > 0
    for y in range(AXE_H):
        for x in range(AXE_W):
            if solid[y, x]:
                continue
            if any(0 <= x + ddx < AXE_W and 0 <= y + ddy < AXE_H and solid[y + ddy, x + ddx]
                   for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                img[y, x] = OUTLINE
    return img


def hazard_axe():
    """A swinging pendulum blade, 9 frames of 96x64: an iron bracket at the pivot (48, 4), the same in every frame;
    an iron pole; a big steel crescent with a bright honed edge at its end. Frame k = the pendulum at (k - 4) * 15
    degrees (0: 60 degrees to the left, 4: straight down, 8: 60 degrees to the right). No ground shadow: the game
    draws a moving one."""
    frames = [axe_frame(k) for k in range(9)]
    sheet = blank(9 * AXE_W, AXE_H)
    for k, f in enumerate(frames):
        sheet[:, k * AXE_W:(k + 1) * AXE_W] = f
    return sheet, {"axe": frames}


SPRITES = {"ornament_chains": ornament_chains, "ornament_torch": ornament_torch, "hazard_axe": hazard_axe}


# ---------- preview ----------

def _stacks(g, base="stone_floor"):
    """Each tile's layers, bottom to top, the way the game stacks them: spikes on the stone floor, a crack over
    the dungeon wall (battlemap.js `under`)."""
    under = {"spikes": ["stone_floor"], "cracked_wall": ["dungeon_wall"]}
    out = []
    for row in g:
        out.append([])
        for t in row:
            st = [base] + [u for u in under.get(t, []) if u != base]
            if t != base:
                st.append(t)
            out[-1].append(st)
    return out


def preview():
    """preview/dungeon_art_preview.png: a dungeon corridor (stone floor 3 tiles wide between dungeon walls) with
    spike plates in each of their 4 frames, a cracked stretch of wall, chains and torches on the walls, the props,
    coins in a little treasure room behind a cracked wall; then the axe's 9 frames over a corridor."""
    from PIL import Image, ImageDraw
    import preview as pv
    for tid, after in (("spikes", "stone_floor"), ("cracked_wall", "dungeon_wall")):
        if tid not in pv.ORDER:
            pv.ORDER.insert(pv.ORDER.index(after) + 1, tid)
    T16 = T
    W, H = 32, 12
    g = [["stone_floor"] * W for _ in range(H)]
    for x in range(W):
        g[0][x] = g[1][x] = "dungeon_wall"   # the corridor's far wall, 2 thick
        g[5][x] = "dungeon_wall"             # its near wall; a treasure room below it
        g[11][x] = "dungeon_wall"
    for y in range(6, 11):
        g[y][0] = g[y][W - 1] = "dungeon_wall"
        g[y][17] = "dungeon_wall"
    g[1][8] = g[1][9] = "cracked_wall"       # a 2-tile weak spot in the far wall
    g[5][24] = "cracked_wall"                # and one in the treasure room's wall, seen from inside
    patches = [(2, 3), (6, 3), (10, 3), (14, 3)]   # 3x2 spike plates, one per frame
    for x0, y0 in patches:
        for y in range(y0, y0 + 2):
            for x in range(x0, x0 + 3):
                g[y][x] = "spikes"
    stacks = _stacks(g)
    frames = [pv.render(None, "stone_floor", stacks=stacks, art=pv.Art(f)) for f in range(4)]
    im = frames[0].copy()
    for f, (x0, y0) in enumerate(patches):
        box = (x0 * T16, y0 * T16, (x0 + 3) * T16, (y0 + 2) * T16)
        im.paste(frames[f].crop(box), box[:2])
    # decals: coins in the treasure room
    strip = Image.fromarray(coins(), "RGBA")
    for v, x, y in ((2, 20 * 16 + 3, 8 * 16 + 2), (0, 22 * 16, 7 * 16 + 6), (1, 26 * 16 + 4, 9 * 16), (3, 28 * 16, 7 * 16 + 4),
                    (0, 24 * 16 + 6, 9 * 16 + 5), (0, 4 * 16, 8 * 16), (1, 7 * 16, 9 * 16 + 4)):
        im.alpha_composite(strip.crop((v * 16, 0, v * 16 + 16, 16)), (x, y))
    # wall ornaments on the far wall's face (wall tile row 1, floor in front at row 2) and in the room
    chains, _ = ornament_chains()
    ch = Image.fromarray(chains, "RGBA")
    _, tl = ornament_torch()
    torches = [Image.fromarray(a, "RGBA") for a in tl["torch"]]
    for tx, v in ((5, 0), (12, 1), (17, 2), (27, 0)):
        im.alpha_composite(ch.crop((v * 16, 0, v * 16 + 16, 32)), (tx * 16, 1 * 16))
    for i, tx in enumerate((1, 15, 23, 30)):
        im.alpha_composite(torches[i % 4], (tx * 16, 1 * 16))
    for i, tx in enumerate((19, 29)):
        im.alpha_composite(torches[(i + 2) % 4], (tx * 16, 5 * 16))
    im.alpha_composite(ch.crop((16, 0, 32, 32)), (2 * 16, 5 * 16))
    # props and creatures, sorted by their bottom edge
    things = []

    def prop(name, tx, ty):
        p = Image.fromarray(PROPS[name](), "RGBA")
        things.append(((ty + 1) * 16, tx * 16 + 8 - p.width // 2, (ty + 1) * 16 - p.height, p))

    prop("statue_knight", 19, 2)
    prop("statue_gargoyle", 21, 2)
    prop("statue_knight", 26, 2)
    prop("cage", 24, 2)
    prop("statue_gargoyle", 29, 2)
    prop("chest", 23, 7)
    prop("chest", 28, 9)
    prop("cage", 2, 7)
    prop("statue_gargoyle", 10, 6)
    prop("statue_knight", 14, 9)
    prop("chest", 6, 8)
    for cid, fx, fy, flip in (("moon_wolf", 5 * 16 + 8, 10 * 16 + 10, False), ("rock_golem", 21 * 16, 10 * 16 + 4, True),
                              ("chick", 11 * 16, 10 * 16 + 8, True)):
        if (pv.BEAST / cid).exists():
            c = pv.creature(cid)
            if flip:
                c = c.transpose(Image.FLIP_LEFT_RIGHT)
            things.append((fy, int(fx - c.width / 2), int(fy - c.height), c))
    for _, x, y, p in sorted(things, key=lambda t: t[0]):
        im.alpha_composite(p, (x, y))
    k1 = 3
    top = pv.zoom(im, k1)
    # the axe's 9 frames, each over its own stretch of corridor (the pivot under the far wall's face)
    g2 = [["stone_floor"] * 54 for _ in range(6)]
    for x in range(54):
        g2[0][x] = "dungeon_wall"
        g2[5][x] = "dungeon_wall"
    im2 = pv.render(None, "stone_floor", stacks=_stacks(g2))
    sheet, layers = hazard_axe()
    for k, fr in enumerate(layers["axe"]):
        im2.alpha_composite(Image.fromarray(fr, "RGBA"), (k * AXE_W, 4))
    k2 = 2
    bottom = pv.zoom(im2, k2)
    pad, lab = 12, 26
    out = Image.new("RGBA", (max(top.width, bottom.width) + 2 * pad, top.height + bottom.height + 2 * lab + 3 * pad),
                    (28, 24, 38, 255))
    d = ImageDraw.Draw(out)
    fnt = pv.font(15)
    d.text((pad, pad), "dungeon_art: a corridor between dungeon walls (x3). Spike plates, left to right: frame 0 down, "
           "1 tips, 2 up, 3 halfway; cracked_wall (2 tiles) in the far wall and 1 in the treasure room's wall; "
           "chains, torches, chest, statues, cage, coins", fill=(240, 220, 160, 255), font=fnt)
    out.paste(top, (pad, pad + lab))
    y2 = pad + lab + top.height + pad
    d.text((pad, y2), "hazard_axe: frames 0-8 (x2), the pendulum at (k - 4) x 15 degrees; pivot (48, 4) the same "
           "pixel in every frame", fill=(240, 220, 160, 255), font=fnt)
    out.paste(bottom, (pad, y2 + lab))
    path = HERE / "preview" / "dungeon_art_preview.png"
    out.save(path)
    print("saved", path, out.size)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        preview()
