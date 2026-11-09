"""The village's new grounds and its roofs: a fountain basin, tilled farmland, a wheat field, the Town Hall's pale
stone wall, a red carpet runner, and the roofs (four styles, a chimney, a bell tower) that the game draws over each
building and fades out while a creature is inside.

Same machinery and look as terrain.py (dual-grid sheets, fills in groups of 4, 4-frame animation), built by it:

    .venv/Scripts/python game/art-src/terrain/terrain.py build fountain farmland wheat hall_wall carpet \
        roof_thatch roof_red roof_slate roof_shingle roof_chimney roof_bell --aseprite
    .venv/Scripts/python game/art-src/terrain/village_ground.py preview

Roofs: a sheet of 16x16 pieces, 3 columns (left end with the gable's verge, middle, right end) by 5 rows (back eave,
back slope, ridge, front slope, front eave). compose_roof() puts a w x h building's roof together exactly the way
the game does: (w*16 + 6) x (h*16) px, drawn with its top-left at world (x0*16 - 3, y0*16 - 10).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from corners import E as EXT  # noqa: E402
from pix import T, Spots, blank, fbm, hx, mix, put, ramp, stamp  # noqa: E402
from terrain import (GRASS, OUTLINE, SHADOW, SHADOW_SOFT, Floor, Structure, Terrain, chance, each,  # noqa: E402
                     place, ri, rng_for, ripples, water_body, waves)

HERE = Path(__file__).resolve().parent
PREV = HERE / "preview"
ROOT_OUT = HERE.parents[2] / "web" / "game-art" / "battle" / "terrain"

CLEAR = (0, 0, 0, 0)


def h16(*parts) -> int:
    """A small deterministic hash (for per-tile / per-slate variety that must repeat with the pattern)."""
    v = 2166136261
    for p in parts:
        v = ((v ^ (int(p) & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
    v ^= v >> 13
    v = (v * 1274126177) & 0xFFFFFFFF
    return v ^ (v >> 16)


# ====================================================================================================================
# fountain: a square basin of pale dressed stone, clear blue water inside (animated)
# ====================================================================================================================

FOUNT = ramp("#0a2246 #0f3666 #164c86 #1e66a2 #2a82bc #42a0d2 #66bee2 #a4def0 #effcff")
BASIN = ramp("#1c1620 #2c242e #40363e #564a50 #6c5e62 #857676 #a09290 #bcb0aa #d8cec6 #efe8e0")
COIN = [hx("#8c8a46"), hx("#cab85c"), hx("#f2e08a")]   # coins on the bottom, seen through the water


class Fountain(Structure):
    """The village fountain's basin, laid as a block of tiles (about 4x4) in a cobbled square. A low rim of pale
    dressed stone blocks (3 px of rim top) runs round it, dark outline outside, a drop shadow to the lower right.
    Inside the far (north) rim its face shows, 3 px down to the water; the near (south) rim shows its outer face,
    3 px, the last of it hanging over the tile in front. The corners are a little rounded. The water is clear blue,
    darker along the rim, with waves, ripples and glints that move (4 frames); a drop from the spout lands here and
    there and spreads in a ring, and a few coins shine on the bottom. Fill tiles are water only."""
    id = "fountain"
    frames = 4
    pal = FOUNT
    margin = {"N": 1, "E": 1, "S": 0, "W": 1}
    radius = 3.0
    face_in = 2
    hang = 1
    reach = 2
    RIM = 3      # the rim's top, px
    INNER = 3    # the far rim's inside face, down to the water

    def base(self, frame):
        return water_body(self.id, self.pal, frame, 4, [(3, 0.10), (5, 0.05)], salt=self.salt)

    def details(self, img, rng, ok, frame, variant):
        p = self.pal
        sp = Spots(ok)
        if variant == 2:  # a coin someone threw in, glinting now and then
            pos = sp.place(rng, ["ab"], pad=2)
            if pos:
                put(img, pos[0], pos[1], COIN[2] if (frame + pos[0]) % 4 == 1 else COIN[1])
                put(img, pos[0] + 1, pos[1], COIN[0])
        if variant == 3:  # a drop from the spout lands and the ring spreads
            x, y = ri(rng, 4, 11), ri(rng, 4, 11)
            ph = ri(rng, 0, 3)
            if sp.ok[y - 2:y + 3, x - 3:x + 4].all():
                r = (frame + ph) % 4
                if r == 0:
                    stamp(img, x - 1, y - 1, [".w.", "wgw", ".w."], {"w": p[6], "g": p[8]})
                elif r == 1:
                    stamp(img, x - 2, y - 1, [".lll.", "l.g.l", ".lll."], {"l": p[7], "g": p[6]})
                elif r == 2:
                    stamp(img, x - 3, y - 2, ["..lll..", ".l...l.", "l.....l", ".l...l.", "..lll.."],
                          {"l": p[6]})
                else:
                    stamp(img, x - 3, y - 2, ["..m.m..", ".......", "m.....m", ".......", "..m.m.."],
                          {"m": p[5]})
                sp.ok[y - 2:y + 3, x - 3:x + 4] = False
        waves(img, rng, sp.ok, frame, p, 3, 3, 5)
        ripples(img, rng, sp.ok, frame, p, 2, 7, 6, 8)

    def rim_px(self, x, y, sh, frame):
        """The rim's top, the far rim's inside face, and the darker water along the rim (None: the open water)."""
        B, P = BASIN, self.pal
        R, F, fi = self.RIM, self.INNER, self.face_in
        dn, ds, dw, de, d = (int(sh.dN[y, x]), int(sh.dS[y, x]), int(sh.dW[y, x]), int(sh.dE[y, x]),
                             int(sh.d[y, x]))
        sN, sS = dn <= R, fi < ds <= fi + R
        sW, sE = dw <= R, de <= R
        if sN or sS or sW or sE or d <= R:
            horiz, vert = sN or sS, sW or sE
            corner = horiz == vert
            if dn == 1 or dw == 1:
                k = 8                                   # the outer edge facing the light
            elif de == 1:
                k = 5                                   # the outer edge in shade
            elif ds == fi + 1:
                k = 6                                   # the near rim's outer edge, where it drops to its face
            elif (sS and ds == fi + R) or (sE and de == R and not sN):
                k = 9 if not corner else 8              # an inner edge catching the light
            elif sW and dw == R and not sN:
                k = 6                                   # an inner edge turned away from it
            else:
                k = 7
            if not corner:   # the joints between the dressed blocks, and each block's lit leading edge
                j = (x % 8) if horiz else (y % 8)
                if j == 3:
                    k = 5 if k >= 7 else 4
                elif j == 4 and k < 9:
                    k += 1
            return B[k]
        if dn <= R + F:   # the far rim's inside face, down to the water, in shade
            r = dn - R
            k = (4, 3, 2)[r - 1]
            if x % 8 == 3:
                k -= 1
            elif x % 8 == 4 and r < F:
                k += 1
            if r == F and (x * 5 + y) % 9 == 0:
                k = 1                                   # a wet stain at the waterline
            return B[k]
        if dn == R + F + 1:   # the waterline under the face, lapping
            return P[5] if (x * 3 + frame * 2) % 7 == 0 else P[1]
        if dn == R + F + 2:
            return P[2]
        if dw == R + 1:
            return P[2]                                 # shade from the west rim
        if dw == R + 2 and (x + y) % 2 == 0:
            return P[3]
        if de == R + 1:
            return P[3]
        if ds == fi + R + 1:
            return P[3]
        return None

    def face_px(self, x, y, t, west, east, marks):
        """The near rim's outer face: 3 px of dressed stone, a lit corner at the west end, shade at the east."""
        B = BASIN
        k = (6, 5, 3)[min(t, 2)]
        if x % 8 == 3:
            k -= 2
        (wk, wkind), (ek, ekind) = west, east
        if wkind == "out" and wk == 1:
            k = 7 if t < 2 else 4
        if ekind == "out" and ek == 1:
            k = 2
        return B[max(1, k)]

    def edge(self, bits, frame=0):
        if bits == 15:
            return self.fill(0, frame)
        if bits == 0:
            return blank()
        sh = self.shape(bits)
        self.salt = ("edge", bits)
        img = self.base(frame)
        R, F, fi = self.RIM, self.INNER, self.face_in
        water = (sh.dN > R + F + 2) & (sh.dW > R + 2) & (sh.dE > R + 1) & (sh.dS > fi + R + 1) & sh.ins
        self.details(img, rng_for(self.id, "edge", bits), water, frame, 0)
        hang, face, solid = self.solids(sh)
        for y in range(T):
            for x in range(T):
                X, Y = x + EXT, y + EXT
                if face[Y, X]:
                    t = fi - sh.dS[y, x] if sh.ins[y, x] else fi - 1 + hang[Y, X]
                    img[y, x] = self.face_px(x, y, t, self.run(face, solid, X, Y, -1),
                                             self.run(face, solid, X, Y, 1), None)
                elif sh.ins[y, x]:
                    c = self.rim_px(x, y, sh, frame)
                    if c is not None:
                        img[y, x] = c
                else:
                    img[y, x] = 0
        self.surround(img, solid)
        return img


# ====================================================================================================================
# farmland: tilled soil in furrows, seedlings or vegetables in rows
# ====================================================================================================================

TILLED = ramp("#140c0e #22141a #301c1c #402620 #523226 #643e2c #784c34 #8c5e40 #a2744e")
SPROUT = [GRASS[2], GRASS[4], GRASS[5], GRASS[6], GRASS[7]]
CABBAGE = ramp("#16302c #224a3a #31664a #46845a #64a46e #8cc28a #bcdeb0")
LETTUCE = ramp("#1e4220 #2c5e26 #42802c #62a034 #88bc44 #b4d866 #def0a0")
CARROT = [hx("#9a3c12"), hx("#d8661e"), hx("#f69a40")]

# small designed plants (letters: a lightest .. d darkest leaf, s stem / shade, o orange)
SEEDLING = ["a.a", ".b."]
SEEDLING_BIG = ["a.a", "bab", ".s."]
CABBAGE_ST = [".aba.", "abcba", "bcdcb", ".ddd."]
LETTUCE_ST = [".a.a.", "ababa", "bcbcb", ".cdc."]
CARROT_ST = ["a.a", ".b.", ".o."]


class Farmland(Terrain):
    """Tilled field soil, rich dark brown, in furrows running east-west: a ridge every 4 px (its lit north side and
    crest, its south side, the furrow's dark bottom), so the rows line up across tiles, with clods catching the
    light here and there. A square-edged field: a low bank of packed soil round it (lit along the north and west,
    its face in shade along the south and east). Edge tiles are bare tilled soil (a narrow strip round the crops);
    the crops are in the fill tiles: group 0 small green seedlings in rows on every ridge, group 1 rows of leafy
    vegetables (cabbages and lettuces, carrot tops between). Both share the same soil and edges."""
    id = "farmland"
    pal = TILLED
    organic = False
    amp = 0
    radius = 2.0
    margin = {"N": 1, "E": 1, "S": 2, "W": 1}
    groups = 2
    detail_gap = 3
    ROW = (5, 4, 2, 1)   # the soil's tone by y % 4: the ridge's lit north side, its crest, its south side, the furrow

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        img = blank()
        for y in range(T):
            for x in range(T):
                k = self.ROW[y % 4]
                if y % 4 == 0 and h16(x, y, 4) % 10 < 3:
                    k -= 1                      # the crest isn't a ruled line
                img[y, x] = self.pal[k]
        for _ in range(14):   # flecks, a shade off their row
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            img[y, x] = self.pal[self.ROW[y % 4] + (1 if chance(rng, 0.5) else -1)]
        for _ in range(4):    # clods on the ridges catching the light, their shadow in the furrow side
            x, r = ri(rng, 0, T - 2), ri(rng, 0, 3)
            put(img, x, 4 * r, self.pal[7], True)
            put(img, x + 1, 4 * r, self.pal[6], True)
            put(img, x + 1, 4 * r + 1, self.pal[3], True)
        return img

    def plant(self, img, x, y, rows, cmap):
        """A plant with its little shadow to the lower right (on the soil)."""
        stamp(img, x, y, rows, cmap)
        w = max(len(r) for r in rows)
        last = rows[-1]
        for i, ch in enumerate(last):
            if ch not in ". " and (i + 1 >= len(last) or last[i + 1] in ". "):
                if x + i + 1 < T and y + len(rows) - 1 < T:
                    put(img, x + i + 1, y + len(rows) - 1, SHADOW_SOFT)
        if x + w < T and y + len(rows) - 2 >= 0:
            put(img, x + w, y + len(rows) - 2, SHADOW_SOFT)

    def details(self, img, rng, ok, frame, variant):
        if self.salt[0] == "edge":   # edge tiles: bare soil, the odd stone
            sp = Spots(ok)
            if chance(rng, 0.5):
                place(img, sp, rng, ["ab", "bs"], {"a": self.pal[8], "b": self.pal[6], "s": SHADOW})
            return
        cm = {"a": SPROUT[4], "b": SPROUT[2], "s": SPROUT[1]}
        for r in range(4):           # a row of seedlings on every ridge
            for i in range(4):
                x = 1 + 4 * i
                if chance(rng, 0.12):
                    continue
                if r > 0 and chance(rng, 0.4):
                    self.plant(img, x, 4 * r - 1, SEEDLING_BIG, cm)
                else:
                    self.plant(img, x, 4 * r, SEEDLING, cm)

    def group(self, img, rng, frame, g, v):
        """Vegetables: a row of cabbages (or lettuces) on every other ridge, carrot tops between."""
        cab = {"a": CABBAGE[5], "b": CABBAGE[4], "c": CABBAGE[3], "d": CABBAGE[1]}
        let = {"a": LETTUCE[6], "b": LETTUCE[4], "c": LETTUCE[3], "d": LETTUCE[1]}
        car = {"a": SPROUT[3], "b": SPROUT[1], "o": CARROT[1]}
        kinds = [(cab, cab), (let, cab), (cab, let), (cab, cab)][v]
        for r, y in enumerate((0, 8)):
            for x in (1, 9):
                if chance(rng, 0.08):
                    continue
                cm = kinds[r]
                self.plant(img, x, y, CABBAGE_ST if cm is cab else LETTUCE_ST, cm)
                if cm is cab:   # the light on a cabbage's crown
                    put(img, x + 1, y + 1, CABBAGE[6])
        for y in (4, 12):            # carrot tops, orange shoulders peeping out of the soil
            for x in (2, 6, 10, 13):
                if chance(rng, 0.3):
                    continue
                self.plant(img, x, y, CARROT_ST, car)

    def rim(self, img, sh, frame):
        """The low bank of packed soil round the field."""
        p = self.pal
        for x, y in each(sh):
            dn, ds, dw, de = sh.dN[y, x], sh.dS[y, x], sh.dW[y, x], sh.dE[y, x]
            f = 1 if (x * 3 + y * 5) % 7 == 0 else 0
            if ds == 1:
                k = 0                     # the bank's face, in shade
            elif ds == 2:
                k = 3 - f
            elif dn == 1 or dw == 1:
                k = 7 - f
            elif de == 1:
                k = 2
            elif ds == 3 or dn == 2 or dw == 2:
                k = 6 - f
            elif de == 2:
                k = 4
            else:
                continue
            img[y, x] = p[k]

    def outside(self, img, sh, frame):
        for y in range(T):
            for x in range(T):
                if not sh.ins[y, x] and (sh.inside(x, y - 1) or sh.inside(x - 1, y)):
                    put(img, x, y, SHADOW_SOFT)


# ====================================================================================================================
# wheat: a field of ripe wheat, tall, planted in rows
# ====================================================================================================================

WHEAT = ramp("#2a1a0e #432a10 #644216 #86601e #a87e28 #c49c36 #dcb84c #eed06a #faea9e")
GREENW = ramp("#24260f #3a3c14 #56561c #727026 #8e8a30 #aaa53e #c4be54 #dad472 #eeeba6")
POPPY = [hx("#4a0a10"), hx("#9a1418"), hx("#dc2e28"), hx("#ff7458")]


class Wheat(Terrain):
    """Ripe wheat, dense golden stalks in rows (their roots every 4 px), each with a plump ear: a stalk, a 2-px ear
    lit on the left and shaded on the right, a pale tip and the odd whisker. Like tall grass, the ears poke up past
    the field's north edge, and the near edge shows the stalks' dark bases. Square-edged (planted). Groups: 0 golden
    ripe, 1 slightly greener (most of the stalks still green-gold) with a few red poppies."""
    id = "wheat"
    pal = WHEAT
    organic = False
    amp = 0
    radius = 2.0
    margin = {"N": 4, "E": 1, "S": 1, "W": 1}
    groups = 2
    detail_gap = 2

    def stalk(self, img, x, yb, h, pal, rng, wrap=True):
        """One stalk from its root at (x, yb), h px tall; returns the pixels it drew."""
        pts = []

        def px(xx, yy, c):
            put(img, xx, yy, c, wrap)
            pts.append((xx, yy))

        for k in range(h):
            yy = yb - k
            if k < h - 3:
                px(x, yy, pal[3] if k < 2 else pal[4])
            elif k < h - 1:
                px(x, yy, pal[7] if k == h - 2 else pal[6])     # the ear, lit on its left
                px(x + 1, yy, pal[5])                           # and shaded on its right
            else:
                px(x, yy, pal[8])                               # its pale tip
        if chance(rng, 0.35):
            px(x + (1 if chance(rng, 0.5) else -1), yb - h, pal[6])   # a whisker
        put(img, x + 1, yb, pal[1], wrap)                       # the root's shade
        return pts

    def base(self, frame):
        rng = rng_for(self.id, "base", self.salt)
        img = blank()
        img[:, :] = self.pal[3]
        n = fbm(rng)
        for y in range(T):
            for x in range(T):
                if n[y, x] > 0.72:
                    img[y, x] = self.pal[2]
                elif y % 4 == 3 and n[y, x] < 0.4:
                    img[y, x] = self.pal[2]                     # the rows' feet, in shade
        self.stalks = []
        for row in range(4):
            yb = row * 4 + 3
            for _ in range(7):
                x, h = ri(rng, 0, T - 1), ri(rng, 5, 8)
                pts = self.stalk(img, x, yb, h, self.pal, rng)
                self.stalks.append(pts)
        return img

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 1:  # a bright ear catching the sun
            place(img, sp, rng, ["t", "e", "e", "s"], {"t": self.pal[8], "e": self.pal[7], "s": self.pal[4]})
        elif variant == 3:  # a bent ear
            place(img, sp, rng, ["ee.", "..e", "..s"], {"e": self.pal[7], "s": self.pal[4]})

    def group(self, img, rng, frame, g, v):
        """Greener: the stalks lying wholly inside the tile turn green-gold (most of them), and a few poppies."""
        for pts in self.stalks:
            if not all(0 <= x < T and 0 <= y < T for x, y in pts) or chance(rng, 0.2):
                continue
            for x, y in pts:
                c = tuple(int(a) for a in img[y, x])
                for i, w in enumerate(WHEAT):
                    if tuple(w) == c:
                        img[y, x] = GREENW[i]
                        break
        sp = Spots(np.pad(np.ones((T - 4, T - 4), bool), 2))
        for _ in range(1 if v in (0, 2) else 2):   # poppies standing among the wheat
            place(img, sp, rng, ["hr.", "rdr", ".r.", ".s."],
                  {"r": POPPY[2], "h": POPPY[3], "d": POPPY[0], "s": GREENW[2]}, pad=1)

    def rim(self, img, sh, frame):
        p = self.pal
        for x, y in each(sh):
            ds, de, dw = sh.dS[y, x], sh.dE[y, x], sh.dW[y, x]
            if ds == 1:
                img[y, x] = p[0]
            elif ds == 2:
                img[y, x] = p[3] if x % 2 == 0 else p[1]        # the stalks along the near edge
            elif ds == 3:
                img[y, x] = p[4] if x % 2 == 0 else p[2]
            elif ds == 4 and x % 2 == 0:
                img[y, x] = p[4]
            elif de == 1:
                img[y, x] = p[1]
            elif dw == 1 and y % 2 == 0:
                img[y, x] = p[5]

    def outside(self, img, sh, frame):
        rng = rng_for(self.id, "poke", sh.bits)
        p = self.pal
        for x in range(T):   # ears sticking up past the north edge
            for y in range(T):
                if sh.ins[y, x] or not sh.inside(x, y + 1):
                    continue
                if chance(rng, 0.62):
                    h = ri(rng, 2, 4)
                    for k in range(h):
                        c = p[8] if k == h - 1 else p[7] if k == h - 2 else p[4]
                        put(img, x, y - k, c)
                    if h >= 3 and chance(rng, 0.5):
                        put(img, x + 1, y - h + 2, p[5])
        for y in range(T):
            for x in range(T):
                if sh.ins[y, x] or img[y, x, 3] == 255:
                    continue
                if (sh.inside(x - 1, y) or sh.inside(x + 1, y)) and chance(rng, 0.25) and y % 2 == 0:
                    put(img, x, y, p[6])
                    put(img, x, y - 1, p[8])
                elif sh.inside(x, y - 1) or sh.inside(x - 1, y - 1) or sh.inside(x - 1, y):
                    put(img, x, y, SHADOW)


# ====================================================================================================================
# hall_wall: the Town Hall's wall of pale dressed stone
# ====================================================================================================================

HALL = ramp("#2c2420 #42382f #5c5044 #786a5a #948470 #ae9e88 #c6b8a0 #dcd0ba #ece4d2 #f8f4e8")
COPE = ramp("#241e1c #383029 #504538 #685a48 #807058 #98876c #ae9d80 #c4b496")


class HallWall(Structure):
    """The Town Hall, cut away like the house (no roof: we look down into it). Pale dressed stone, cream to warm
    light grey: the top is a darker coping of long dressed slabs; the face, 10 px (8 in its own tile, 2 over the
    tile in front), is the coping's lit nose, a carved band of dentils under it, two courses of ashlar blocks with
    fine mortar joints, and a darker plinth; quoins (long and short corner blocks) at the wall's lit west end."""
    id = "hall_wall"
    pal = HALL
    hang = 2

    def base(self, frame):
        """The coping seen from above: dressed slabs 8 px, fine joints, each slab's lit top and left edge."""
        rng = rng_for(self.id, "base", self.salt)
        C = COPE
        img = blank()
        for y in range(T):
            for x in range(T):
                sx, sy = x % 8, y % 8
                if sx == 7 or sy == 7:
                    c = C[2]
                elif sy == 0 or sx == 0:
                    c = C[6]
                elif sy == 6 or sx == 6:
                    c = C[4]
                else:
                    c = C[5]
                img[y, x] = c
        for _ in range(6):
            x, y = ri(rng, 0, T - 1), ri(rng, 0, T - 1)
            if x % 8 not in (0, 6, 7) and y % 8 not in (0, 6, 7):
                img[y, x] = C[4] if chance(rng, 0.6) else C[6]
        return img

    def details(self, img, rng, ok, frame, variant):
        sp = Spots(ok)
        if variant == 1:
            place(img, sp, rng, ["c..", ".cc"], {"c": COPE[2]})       # a hairline crack
        elif variant == 3:
            place(img, sp, rng, ["l"], {"l": COPE[6]}, pad=2)          # a fleck of mica

    def top_rim(self, x, y, sh, *_):
        """The coping along a run of wall: long slabs, a joint across the run every 8 px, lit along the north and
        west edges, shaded along the east."""
        C = COPE
        dn, ds, dw, de = sh.dN[y, x], sh.dS[y, x], sh.dW[y, x], sh.dE[y, x]
        if dn == 1:
            return C[7]
        if dw == 1:
            return C[6]
        if de == 1:
            return C[1]
        ns = min(dw, de) < min(dn, ds)      # this part of the wall runs north-south
        j = (y % 8) if ns else (x % 8)
        if j == 7:
            return C[2] if de > 2 else C[1]   # the joint between two slabs
        if dn == 2 or dw == 2 or j == 0:
            return C[6]                      # lit edges
        if de == 2:
            return C[3]
        return C[5] if (x * 3 + y * 5) % 11 else C[4]

    def face_px(self, x, y, t, west, east, marks):
        p = self.pal
        (wk, wkind), (ek, ekind) = west, east
        if t == 0:
            c = COPE[7]                              # the coping's lit nose
        elif t == 1:
            c = COPE[4]                              # its front, a shade under
        elif t == 2:
            c = p[8] if x % 4 != 3 else p[2]         # the carved band: dentils, deep gaps between
        elif t == 3:
            c = p[4]                                 # the shadow under the band
        elif t in (4, 5, 7, 8):                      # two courses of ashlar blocks, staggered
            course = 0 if t < 6 else 1
            j = (x + course * 4) % 8
            top = t in (4, 7)
            if j == 0:
                c = p[5]                             # the vertical joint
            else:
                c = (p[9] if top else p[7]) if course == 0 else (p[8] if top else p[6])
                if j == 1 and not top:
                    c = p[8] if course == 0 else p[7]
                if (x * 7 + t * 3) % 23 == 0:
                    c = p[6]                         # a speck in the stone
        elif t == 6:
            c = p[5]                                 # the bed joint between the courses
        else:
            c = p[3] if (x * 5) % 9 else p[2]        # the plinth, in shade
        if wkind == "out" and wk <= 2 and t >= 2:   # quoins at the wall's lit end: long and short blocks
            c = p[9] if wk == 1 else p[7]
            if t in (3, 6) or (t == 5 and wk == 2):
                c = p[5]
            if t >= self.face_h - 1:
                c = p[4]
        elif wkind == "wall" and wk <= 2 and 2 <= t < self.face_h - 1:
            c = self.step(c, -2) if tuple(c) in [tuple(q) for q in p] else c   # in the shade of the cross wall
        if ekind is not None and ek == 1 and t >= 1:
            c = p[2] if t < self.face_h - 1 else p[1]                         # its east corner, in shade
        elif ekind == "out" and ek == 2 and t >= 2:
            c = self.step(c, -1) if tuple(c) in [tuple(q) for q in p] else c
        return c


# ====================================================================================================================
# carpet: a red runner with a gold border
# ====================================================================================================================

CARPET = ramp("#22060e #3a0a16 #560f1e #721626 #8e1e2c #a82a32 #c03c3a #d85a4a")
GOLDT = ramp("#3a2008 #5e3a0e #8a5c16 #b48420 #d8aa30 #f0cc4a #fce47c #fff6c0")


class Carpet(Floor):
    """A red carpet runner: a walkable floor, square-edged, laid on stone or wood floor (the Town Hall from the door
    to the desk, the keep from the door to the throne). Gold trim all along its outline (a dark gold binding, a
    bright gold band with a braid, a dark red line inside it); the red field has a subtle woven diamond pattern,
    period 8 so it runs on across tiles."""
    id = "carpet"
    pal = CARPET
    groups = 1
    detail_gap = 5

    def weave(self, x, y):
        p = self.pal
        a, b = (x + y) % 8, (x - y) % 8
        if a == 0 or b == 0:
            return p[4]                              # the diamond lattice, darker threads
        if a == 4 and b == 4:
            return p[7]                              # a bright knot in each diamond
        if (a == 4 and b in (3, 5)) or (b == 4 and a in (3, 5)):
            return p[6]
        if (x + 2 * y) % 4 == 0:
            return p[5] if a % 2 else p[6]           # the twill of the weave
        return p[5]

    def base(self, frame):
        img = blank()
        for y in range(T):
            for x in range(T):
                img[y, x] = self.weave(x, y)
        return img

    def details(self, img, rng, ok, frame, variant):
        if variant == 1:   # a few threads worn paler
            for _ in range(3):
                x, y = ri(rng, 1, T - 2), ri(rng, 1, T - 2)
                if ok[y, x] and tuple(img[y, x]) == tuple(self.pal[5]):
                    img[y, x] = self.pal[6]
        elif variant == 2:  # a darker patch of nap
            for _ in range(4):
                x, y = ri(rng, 1, T - 2), ri(rng, 1, T - 2)
                if ok[y, x] and tuple(img[y, x]) == tuple(self.pal[5]):
                    img[y, x] = self.pal[4]

    def rim(self, img, sh, frame):
        """The trim, square at every corner (inner ones too): a dark gold binding, a bright gold band with a braid,
        a dark red line, a red a shade under the field."""
        G = GOLDT
        d = square_dist(sh)
        for x, y in each(sh):
            k = d[y, x]
            lit = sh.dN[y, x] <= k or sh.dW[y, x] <= k       # the trim on the north and west sides
            if k == 1:
                img[y, x] = G[2] if lit else G[1]           # the binding
            elif k == 2:
                img[y, x] = (G[6] if lit else G[5]) if (x + y) % 4 else G[4]   # the gold band, braided
            elif k == 3:
                img[y, x] = self.pal[1]
            elif k == 4:
                img[y, x] = self.pal[4]


def square_dist(sh, top=6):
    """How far each pixel of the cell is from the outside of the shape, counting diagonal steps as one (so bands
    drawn by it keep square corners, inside and out). 1 = on the outline, up to `top`."""
    ins = sh.ext.copy()
    n = ins.shape[0]
    d = np.full((n, n), 0, int)
    cur = ins
    for k in range(1, top + 1):
        d[cur] = k
        pad = np.pad(cur, 1, mode="edge")
        nxt = cur.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nxt &= pad[1 + dy:1 + dy + n, 1 + dx:1 + dx + n]
        cur = nxt
    d[cur] = 99
    return d[EXT:EXT + T, EXT:EXT + T]


# ====================================================================================================================
# roofs
# ====================================================================================================================

PLANK = ramp("#1e120e #2e1c14 #46291a #5e3a22 #7a4e2c #966636 #b28048 #cc9e62 #e2bc84")
HAY = ramp("#2e1c10 #4a3016 #6a481c #8c6424 #ac802e #c69c3c #dcb652 #ecd074 #f8e8a2")
CLAY = ramp("#2a0c0e #461612 #662218 #86321e #a44426 #be5a30 #d4743e #e69456 #f4b678")
SLATE = ramp("#10141e #1a2030 #262e42 #323c54 #3e4a64 #4c5a76 #5e6e88 #76869e #98a8bc #bccad8")
SHAKE = ramp("#1c100c #2c1a12 #42271a #5a3622 #72462a #8a5834 #a26c40 #b8824e #cc9c66")
WEATHERED = ramp("#2e2a2a #443e3c #5c5550 #746c64 #8c8278 #a2988c")
LICHEN = [hx("#8a9a3a"), hx("#b4c25a")]

BACK, SLOPE_B, RIDGE, SLOPE_F, FRONT = range(5)
RIDGE_TOP, RIDGE_BOT = 5, 10      # the ridge cap's rows in the ridge piece (above: back slope, below: front)


def clamp(pal, k):
    return pal[max(0, min(len(pal) - 1, k))]


class Roof:
    """A roof style. Each piece pixel is asked of the style with X = its phase along the roof (0..15; the right end
    piece is shifted by 6 so it carries on from the 6-px cut of the last middle piece) and y = its row in the piece.
    Slopes repeat every 16 px both ways, so the pieces tile however many times they repeat."""
    name = ""
    pal = None

    def slope(self, X, y, back):
        raise NotImplementedError

    def ridge(self, X, y):
        return None

    def back_eave(self, X, y):
        if y == 0:
            return OUTLINE
        return None

    def front_eave(self, X, y):
        if y == 15:
            return OUTLINE
        return None

    def verge(self, side, row, i, y, under):
        """The gable's edge board: side 0 left, 2 right; i the column in the piece. None: leave `under`."""
        return None

    def body(self, row, X, y):
        if row == BACK:
            c = self.back_eave(X, y)
            return self.slope(X, y, True) if c is None else c
        if row == SLOPE_B:
            return self.slope(X, y, True)
        if row == SLOPE_F:
            return self.slope(X, y, False)
        if row == FRONT:
            c = self.front_eave(X, y)
            return self.slope(X, y, False) if c is None else c
        c = self.ridge(X, y)
        if c is None:
            c = self.slope(X, y, y < RIDGE_TOP)
        return c

    def sheet(self):
        s = blank(3 * T, 5 * T)
        for row in range(5):
            for col in range(3):
                for y in range(T):
                    for i in range(T):
                        X = i if col < 2 else (i + 6) % T
                        c = self.body(row, X, y)
                        if col != 1:
                            v = self.verge(col, row, i, y, c)
                            if v is not None:
                                c = v
                        s[row * T + y, col * T + i] = c
        # a dark outline wherever a piece's outer edge is ragged (thatch): see-through pixels next to the roof
        out = s.copy()
        for row in range(5):
            for col in range(3):
                for y in range(T):
                    for i in range(T):
                        Y, X = row * T + y, col * T + i
                        if s[Y, X, 3]:
                            continue
                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                            ii, yy = i + dx, y + dy
                            if 0 <= ii < T and 0 <= yy < T:
                                n = s[row * T + yy, col * T + ii]
                                if n[3] and tuple(n) != tuple(OUTLINE):
                                    out[Y, X] = OUTLINE
                                    break
        return out

    def board(self, side, row, i, y, under, pal, lit=(6, 5), dark=(4, 3), apex=None):
        """A plain edge board: outline at the outer column, two board columns (lit on the left end, in shade on the
        right), and on the left the board's shadow on the roof beside it."""
        if row == BACK and y == 0:
            return CLEAR if (side == 0 and i == 0) or (side == 2 and i == 15) else OUTLINE
        if row == FRONT and y == 15:
            return CLEAR if (side == 0 and i == 0) or (side == 2 and i == 15) else OUTLINE
        if row == RIDGE and apex is not None and RIDGE_TOP <= y <= RIDGE_BOT:
            a = apex(side, i, y)
            if a is not None:
                return a
        if side == 0:
            if i == 0:
                return OUTLINE
            if i in (1, 2):
                c = pal[lit[i - 1]]
                if row == FRONT and y == 14:
                    c = pal[min(len(pal) - 1, lit[0] + 1)]   # the board's end grain
                return c
            if i == 3 and under[3]:
                return darker(under, 2)
        else:
            if i == 15:
                return OUTLINE
            if i in (13, 14):
                return pal[dark[i - 13]]
        return None


def darker(c, k):
    """Step a roof colour k tones down whichever roof ramp it's on (or mix toward the shadow colour)."""
    for pal in (CLAY, SLATE, SHAKE, HAY, PLANK, WEATHERED):
        for i, p in enumerate(pal):
            if tuple(p) == tuple(c):
                return pal[max(0, i - k)]
    return mix(c, (20, 10, 38, 255), 0.25 * k)


# ---------- clay (terracotta tiles) ----------

class RedRoof(Roof):
    """Terracotta clay tiles with rounded ends, 4 px wide, in courses 4 px deep, each course set half a tile over
    (a scalloped look): on the front slope a dark line of shadow under each course, a lit body and the rounded lip;
    on the back slope (facing the light) the lips are lit and the whole is paler. A few tiles a shade off. Ridge:
    half-round ridge tiles, 8 px each, lit along the top, a shadow under them on the front slope. Eaves: the tile
    ends' rounded lips over a dark drip line."""
    name = "roof_red"
    pal = CLAY
    BACK_T = ((5, 8, 7, 4), (6, 7, 7, 5), (6, 7, 7, 5), (5, 5, 5, 5))     # rows of a course, columns of a tile
    FRONT_T = ((2, 2, 2, 2), (4, 6, 6, 4), (4, 5, 5, 3), (3, 6, 5, 2))

    def cell(self, X, y):
        course = (y // 4) % 4
        u = X + (course % 2) * 2
        return course, u % 4, (u // 4) % 4

    def slope(self, X, y, back):
        course, cx, tile = self.cell(X, y)
        k = (self.BACK_T if back else self.FRONT_T)[y % 4][cx]
        if cx in (1, 2):
            h = h16(course, tile, 3) % 9
            k += -1 if h == 0 else 1 if h == 1 else 0
        return clamp(CLAY, k)

    def ridge(self, X, y):
        if not RIDGE_TOP <= y <= RIDGE_BOT:
            return None
        r = y - RIDGE_TOP
        j = X % 8
        k = (2, 7, 8, 6, 4, 1)[r]
        if 1 <= r <= 4:
            if j == 7:
                k -= 2            # where two ridge tiles meet
            elif j == 0:
                k += 1 if r < 3 else 0
        return clamp(CLAY, k)

    def back_eave(self, X, y):
        if y == 0:
            return OUTLINE
        if y == 1:
            course, cx, tile = self.cell(X, 0)
            return clamp(CLAY, (5, 8, 8, 4)[cx])
        return None

    def front_eave(self, X, y):
        if y == 15:
            return OUTLINE
        if y == 14:
            course, cx, tile = self.cell(X, 15)
            return OUTLINE if cx in (0, 3) else clamp(CLAY, 4 if cx == 1 else 3)   # the tile ends, dark between
        return None

    def verge(self, side, row, i, y, under):
        def apex(side, i, y):
            r = y - RIDGE_TOP
            if (side == 0 and i == 0) or (side == 2 and i == 15):
                return OUTLINE
            k = (2, 7, 8, 6, 4, 1)[r]
            return clamp(CLAY, k + (1 if side == 0 and i <= 2 else -1 if side == 2 else 0))
        return self.board(side, row, i, y, under, PLANK, lit=(7, 5), dark=(4, 2), apex=apex)


# ---------- slate ----------

SLATE_JOINTS = ({2, 7, 12}, {4, 10, 15}, {0, 5, 11}, {3, 8, 13})
GUTTER = ramp("#1e2028 #383c48 #585e6c #8a909e")


class SlateRoof(Roof):
    """Blue-grey slates laid in courses 4 px deep, each slate 5-6 px wide and set over the joints of the course
    before, each a shade of its own: on the front slope a dark line of shadow under each course, the slate, and its
    thin lit lower edge; the back slope (facing the light) paler, its edges lit. A lead-grey ridge roll, a slim
    gutter on brackets along the front eave, dark-painted edge boards."""
    name = "roof_slate"
    pal = SLATE

    def tone(self, X, y):
        k = (y // 4) % 4
        js = sorted(SLATE_JOINTS[k])
        idx = sum(1 for j in js if j <= X) % len(js)
        h = h16(k, idx, 7) % 6
        return (-1, 0, 0, 1, 0, 0)[h]

    def slope(self, X, y, back):
        k = (y // 4) % 4
        r = y % 4
        t = self.tone(X, y)
        joint = X in SLATE_JOINTS[k]
        if back:
            if joint and r in (1, 2, 3):
                return SLATE[5]
            return clamp(SLATE, (8, 7, 7, 6)[r] + t)
        if joint and r in (1, 2):
            return SLATE[2]
        return clamp(SLATE, (2, 5, 5, 6)[r] + (t if r else 0))

    def ridge(self, X, y):
        if not RIDGE_TOP <= y <= RIDGE_BOT:
            return None
        r = y - RIDGE_TOP
        k = (1, 8, 7, 5, 3, 0)[r]
        if 1 <= r <= 4 and X % 16 == 0:
            k -= 1
        return clamp(SLATE, k)

    def back_eave(self, X, y):
        if y == 0:
            return OUTLINE
        if y == 1:
            return SLATE[9] if X % 5 else SLATE[8]
        return None

    def front_eave(self, X, y):
        if y == 15:
            return OUTLINE
        if y == 14:
            return GUTTER[1] if X % 8 == 0 else GUTTER[2]    # the gutter, its brackets every 8 px
        if y == 13:
            return GUTTER[3] if X % 4 else GUTTER[2]
        return None

    def verge(self, side, row, i, y, under):
        def apex(side, i, y):
            r = y - RIDGE_TOP
            if (side == 0 and i == 0) or (side == 2 and i == 15):
                return OUTLINE
            return clamp(SLATE, (1, 8, 7, 5, 3, 0)[r] + (1 if side == 0 else -1))
        if row == FRONT and y in (13, 14) and ((side == 0 and 1 <= i <= 2) or (side == 2 and 13 <= i <= 14)):
            return GUTTER[2] if side == 0 else GUTTER[1]
        return self.board(side, row, i, y, under, SLATE, lit=(9, 7), dark=(3, 1), apex=apex)


# ---------- wooden shakes ----------

SHAKE_JOINTS = ({1, 5, 8, 12}, {3, 6, 10, 14}, {0, 4, 9, 13}, {2, 7, 11, 15})


class ShingleRoof(Roof):
    """Brown wooden shakes, split by hand: courses 4 px deep, shakes 3-4 px wide set over the joints below, each its
    own shade (one now and then silvered by the weather), a grain line down some; a dark line of shadow under each
    course and the butt's lit edge. A ridge of two boards, nailed. Wooden edge boards."""
    name = "roof_shingle"
    pal = SHAKE

    def which(self, X, y):
        k = (y // 4) % 4
        js = sorted(SHAKE_JOINTS[k])
        return k, sum(1 for j in js if j <= X) % len(js)

    def tone(self, k, idx):
        return (-1, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0)[h16(k, idx, 11) % 11]

    def long(self, k, idx):
        """Some shakes are a pixel longer: their butt hangs over the course below (ragged course lines)."""
        return h16(k, idx, 12) % 3 == 0

    def slope(self, X, y, back):
        k, idx = self.which(X, y)
        r = y % 4
        t = self.tone(k, idx)
        joint = X in SHAKE_JOINTS[k]
        grain = r in (1, 2) and (X * 5 + idx * 3 + k) % 7 == 0
        if back:
            if joint and r in (1, 2, 3):
                return SHAKE[4]
            return clamp(SHAKE, 6 + (1, 0, 0, -1)[r] + t)
        if r == 0:
            ka, ia = self.which(X, y - 1)
            if self.long(ka, ia) and X not in SHAKE_JOINTS[ka]:
                return clamp(SHAKE, 6 + self.tone(ka, ia))   # the butt of a long shake from the course above
            return SHAKE[2]
        if joint:
            return SHAKE[1] if r == 1 else SHAKE[2] if r == 2 else SHAKE[3]
        if r == 3 and not self.long(k, idx):
            return clamp(SHAKE, 6 + t)                       # the butt's lit edge
        k2 = 5 + t - grain
        if (X - 1) % T in SHAKE_JOINTS[k]:
            k2 += 1                                          # each shake's lit left edge
        return clamp(SHAKE, k2)

    def ridge(self, X, y):
        if not RIDGE_TOP <= y <= RIDGE_BOT:
            return None
        r = y - RIDGE_TOP
        k = (1, 8, 7, 5, 4, 1)[r]
        if r == 2 and X % 8 == 3:
            return PLANK[3]              # a nail head
        if r == 3 and X % 16 == 11:
            k = 3                        # where two ridge boards butt together
        return clamp(PLANK, k)

    def back_eave(self, X, y):
        if y == 0:
            return OUTLINE
        if y == 1:
            return SHAKE[8] if X % 4 else SHAKE[7]
        return None

    def front_eave(self, X, y):
        if y == 15:
            return OUTLINE
        if y == 14:
            return PLANK[2] if X % 6 else PLANK[1]      # the fascia board, in shade
        return None

    def verge(self, side, row, i, y, under):
        def apex(side, i, y):
            r = y - RIDGE_TOP
            if (side == 0 and i == 0) or (side == 2 and i == 15):
                return OUTLINE
            return clamp(PLANK, (1, 8, 7, 5, 4, 1)[r] + (0 if side == 0 else -2))
        return self.board(side, row, i, y, under, PLANK, lit=(7, 5), dark=(3, 2), apex=apex)


# ---------- thatch ----------

WAVE = (0, 0, 1, 1, 1, 0, 0, 0, -1, -1, 0, 0, 1, 1, 0, 0)   # how a course's ragged lower edge wanders


class ThatchRoof(Roof):
    """Golden straw thatch: straw streaks running down the slope (each column its own shade, breaking where a
    bundle ends), laid in courses 8 px deep whose lower edges wander a pixel up and down: on the front slope each
    course ends in lit butt ends over a dark line of shadow; the back slope is paler. A block-cut ridge with a
    pointed (scalloped) lower edge and criss-cross hazel spars. The eaves are thick and shaggy: straw ends sticking up
    along the back, and along the front a rounded lip, the deep cut ends of the straw and a ragged bottom the wall
    shows through. The gable ends are rolled straw."""
    name = "roof_thatch"
    pal = HAY

    def streak(self, X, y):
        cls = (0, -1, 0, 1, 0, -1, 1, 0)[h16(X, 5) % 8]
        o = h16(X, 6) % 8
        s = (y + o) % 8
        if s == 0:
            return cls - 1           # a bundle ends
        if s == 1:
            return cls + 1
        return cls

    def slope(self, X, y, back):
        r = (y - WAVE[X % 16]) % 8
        if back:
            k = 6 + self.streak(X, y)
            if r == 0:
                k = 8 if X % 3 else 7                 # the course's butt ends, lit
            elif r == 1:
                k = 7
            elif r == 7:
                k = 5
        else:
            k = 4 + self.streak(X, y)
            if r == 6:
                k = 6 if X % 2 else 5                 # the butt ends of the course
            elif r == 7:
                k = 2                                 # its shadow on the course below
            elif r == 0:
                k = 4 if X % 3 else 3
        return clamp(HAY, k)

    def ridge_edge(self, X):
        """The ridge's pointed lower edge: how far down it reaches in this column."""
        j = X % 8
        return RIDGE_BOT - int(min(abs(j - 3.5), 3.0))

    def ridge(self, X, y):
        if y < RIDGE_TOP - 1 or y > RIDGE_BOT + 1:
            return None
        bot = self.ridge_edge(X)
        if y == RIDGE_TOP - 1:
            return HAY[3]                          # the ridge's back edge, in shade
        if y > bot + 1:
            return None
        if y == bot + 1:
            return HAY[1]                          # its shadow on the front slope
        if y == bot:
            return HAY[4] if (X % 8) in (3, 4) else HAY[3]
        if y == RIDGE_TOP:
            return HAY[8] if X % 4 else HAY[7]     # its lit top
        if (X + y) % 8 == 0 or (X - y) % 8 == 0:
            return HAY[3]                          # the hazel spars, criss-cross
        r = y - RIDGE_TOP
        return HAY[(8, 7, 7, 6, 6, 5)[min(r, 5)] - (1 if (X * 3 + r) % 5 == 0 else 0)]

    def back_eave(self, X, y):
        e = 1 + h16(X, 21) % 3        # straw ends sticking up: where the eave's top is in this column
        if y < e:
            return CLEAR
        if y in (e, e + 1):
            return HAY[8] if (X + y) % 2 else HAY[7]
        return None

    def front_eave(self, X, y):
        b = 13 + (h16(X, 33) % 3)     # the ragged bottom of the straw
        if y > b:
            return CLEAR
        if y == b:
            return HAY[1]
        if y == 7:
            return HAY[3]                            # a shadow line above the lip
        if y == 8:
            return HAY[7] if X % 2 else HAY[6]       # the eave's rounded lip
        if y == 9:
            return HAY[5]
        if y >= 10:
            k = (5, 3, 4, 2)[(X * 3 + y * 5) % 4]    # the cut ends of the straw, a dense stipple, darker down
            return HAY[k - (1 if y >= 12 else 0)]
        return None

    def verge(self, side, row, i, y, under):
        if not under[3]:
            return None                                    # the ragged eaves stay ragged
        if row == RIDGE and self.ridge(i if side == 0 else (i + 6) % T, y) is not None:
            if (side == 0 and i == 0) or (side == 2 and i == 15):
                return OUTLINE
            return darker(under, 1) if side == 2 and i >= 13 else None   # the ridge block runs to the end
        if side == 0:
            if i == 0:
                return OUTLINE
            if i in (1, 2, 3):
                k = (7, 6, 4)[i - 1] + (1 if (y + i * 3) % 6 == 0 else 0)
                return HAY[k]
            if i == 4:
                return darker(under, 1)
        else:
            if i == 15:
                return OUTLINE
            if i in (12, 13, 14):
                k = (5, 3, 2)[i - 12] - (1 if (y + i) % 7 == 0 else 0)
                return HAY[k]
        return None


ROOFS = {r.name: r for r in (ThatchRoof(), RedRoof(), SlateRoof(), ShingleRoof())}


def compose_roof(sheet: np.ndarray, w: int, h: int) -> np.ndarray:
    """A w x h building's roof (w 5-16, h 4-10 tiles) from a roof sheet, exactly as the game builds it:
    (w*16 + 6) x (h*16) px, drawn with its top-left at world (x0*16 - 3, y0*16 - 10). Rows: back eave, a back
    slope rows, the ridge, b front slope rows, the front eave, where a = floor((h-3)*0.4), b = h-3-a. Columns: the
    left piece, middle pieces repeated (the last one cut to fit), the right piece at the right edge."""
    W, H = w * T + 6, h * T
    a = (h - 3) * 2 // 5
    b = h - 3 - a
    rows = [BACK] + [SLOPE_B] * a + [RIDGE] + [SLOPE_F] * b + [FRONT]
    out = blank(W, H)
    for k, r in enumerate(rows):
        y = k * T
        piece = lambda c: sheet[r * T:(r + 1) * T, c * T:(c + 1) * T]
        out[y:y + T, 0:T] = piece(0)
        x = T
        while x < W - T:
            n = min(T, W - T - x)
            out[y:y + T, x:x + n] = piece(1)[:, :n]
            x += T
        out[y:y + T, W - T:W] = piece(2)
    return out


def roof_sprite(name):
    def fn():
        s = ROOFS[name].sheet()
        return s, {"roof": [s]}
    return fn


# ---------- chimney ----------

SMOKE = [hx("#f0eef4", 170), hx("#d6d2de", 140), hx("#b4b0c2", 110)]
FLASH = ramp("#2a2c36 #4a4e5a #6e7480")


def chimney():
    """A stone chimney stack, 16x32: smoke curling up from its dark mouth, the cap's projecting course, rough
    courses of stone lit on the left and shaded on the right, lead flashing where it meets the roof and its shadow
    on the roof to the lower right. Drawn on the back slope; its bottom 8 px overlap the roof."""
    S = BASIN
    obj = blank(16, 32)
    shadow = blank(16, 32)
    smoke = blank(16, 32)
    x0, x1 = 4, 11              # the stack's columns
    for y in range(13, 30):     # the stack's face: courses of rough stone
        course, r = divmod(y - 13, 3)
        for x in range(x0, x1 + 1):
            j = (x + (course % 2) * 2) % 4
            if r == 2 or j == 0:
                k = 3                                   # mortar
            else:
                k = 6 if r == 0 else 5
                if h16(x // 4, course, 1) % 3 == 0:
                    k -= 1                              # a darker stone
            if x == x0:
                k += 1                                  # the lit west edge
            elif x == x1:
                k -= 2                                  # the east side in shade
            elif x == x1 - 1:
                k -= 1
            obj[y, x] = S[max(1, min(9, k))]
    for x in range(x0 - 1, x1 + 2):   # the cap: a projecting course, its top seen from above round the mouth
        obj[9, x] = S[8] if x < x1 else S[6]
        obj[10, x] = S[7] if x < x1 + 1 else S[5]
        obj[11, x] = S[7] if x < x1 + 1 else S[5]
        obj[12, x] = S[5] if x < x1 + 1 else S[3]
    obj[9, x0 - 1] = S[7]
    for x in range(x0 + 1, x1):        # the mouth, sooty dark
        obj[10, x] = OUTLINE
        obj[11, x] = hx("#2a2028") if x in (x0 + 1, x1 - 1) else OUTLINE
    obj[12, x0 - 1] = S[6]
    for x in range(x0 - 1, x1 + 2):    # lead flashing where the stack meets the roof
        obj[28, x] = FLASH[2] if x < x1 else FLASH[1]
        obj[29, x] = FLASH[1] if x < x1 else FLASH[0]
    obj[28, x0 - 1] = FLASH[2]
    # its shadow on the roof, to the lower right (the bottom 8 px are over the roof)
    for y in range(24, 31):
        for x in range(x1 + 2, min(16, x1 + 2 + (y - 22) // 2 + 1)):
            shadow[y, x] = SHADOW
    for x in range(x0, x1 + 3):
        shadow[30, x] = SHADOW
    # smoke: three puffs drifting up and to the right, thinning out
    for cx, cy, r, a in ((8.0, 6.5, 2.2, 0), (10.5, 3.5, 1.8, 1), (12.5, 1.2, 1.3, 2)):
        for y in range(16):
            for x in range(16):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                if dx * dx + dy * dy <= r * r:
                    lit = dx + dy < -0.6
                    sh = dx + dy > 0.9
                    smoke[y, x] = SMOKE[min(2, a + (0 if lit else 2 if sh else 1))]
    # outline round the stone (not the smoke)
    m = obj[:, :, 3] > 0
    ol = blank(16, 32)
    for y in range(32):
        for x in range(16):
            if not m[y, x] and any(0 <= x + dx < 16 and 0 <= y + dy < 32 and m[y + dy, x + dx]
                                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                ol[y, x] = OUTLINE
    obj[ol[:, :, 3] > 0] = OUTLINE
    out = shadow.copy()
    out[obj[:, :, 3] > 0] = obj[obj[:, :, 3] > 0]
    sm = (smoke[:, :, 3] > 0) & (out[:, :, 3] == 0)
    out[sm] = smoke[sm]
    return out, {"shadow": [shadow], "chimney": [obj], "smoke": [smoke]}


# ---------- bell tower ----------

BRONZE = ramp("#2a1606 #4a2a0c #6e4214 #925c1c #b47c28 #d09c3c #e8c060 #f8e2a0")
FLAGC = ramp("#3a0812 #6c1424 #a8222e #d8443e #f07a5c")


def bell_tower():
    """The Town Hall's little bell tower (cupola), 32x48, drawn astride the ridge (its bottom 12 px sit on the
    roof): a square base of pale stone with a round clock face under a cornice, four posts holding a pointed slate
    cap, a bronze bell hanging in the open belfry with the back posts and a dark inside behind it, and on the
    cap's point a gold ball and a red pennant flying east. Its shadow falls on the roof to the lower right."""
    W, H = 32, 48
    obj = blank(W, H)
    shadow = blank(W, H)
    P, S, B = HALL, SLATE, BRONZE

    def px(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            obj[y, x] = c

    # --- the base (rows 33..44): a cornice, a plain stone face with a clock, its foot on the roof
    for x in range(6, 26):
        lit = x < 16
        px(x, 32, P[8] if x < 25 else P[6])                  # the cornice's lit top
        px(x, 33, P[6] if x < 25 else P[4])
        px(x, 34, P[3])                                       # the shadow under the cornice
        for y in range(35, 45):
            k = 7 if x < 24 else 5
            if x == 7:
                k = 8
            if x >= 24:
                k = 4 if x == 24 else 3
            if y == 44:
                k = 3
            if y in (39,) and x % 6 == 0 and 8 < x < 23:
                k -= 1
            px(x, y, P[k])
    px(6, 32, P[9])
    for y in range(33, 45):
        px(6, y, P[8] if y < 44 else P[5])
    # the clock: a round white face with a gold rim, its hands at ten past ten
    cx, cy = 15.5, 39.5
    for y in range(35, 45):
        for x in range(10, 22):
            d = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
            if d <= 2.6:
                px(x, y, hx("#fbf6e6") if (x + y) % 7 else hx("#e8e0c8"))
            elif d <= 3.6:
                px(x, y, GOLDT[5] if x + y < 54 else GOLDT[3])
    for x, y in ((15, 38), (15, 39), (16, 39), (17, 38)):
        px(x, y, OUTLINE)
    px(15, 37, hx("#3a3040"))
    # --- the belfry (rows 22..31): posts at the corners, the dark inside, the bell
    for y in range(22, 32):
        for x in range(8, 24):
            px(x, y, hx("#1a1220") if y > 23 else hx("#2a2030"))   # the inside, in deep shade
        for x in (11, 20):                                         # the back posts, dim
            px(x, y, P[3] if x == 11 else P[2])
    for x in range(8, 24):
        px(x, 22, P[4])                                            # the beam the bell hangs from
        px(x, 23, P[2])
        px(x, 31, P[6] if x < 22 else P[4])                        # the belfry's floor / rail
        px(x, 30, P[4] if x % 3 else P[5])
    for y in range(21, 32):                                         # the front posts
        px(6, y, P[8])
        px(7, y, P[7])
        px(8, y, P[5])
        px(23, y, P[5])
        px(24, y, P[4])
        px(25, y, P[2])
    # the bell: crown, shoulder, waist, flared lip; lit on the left
    bell = {24: (15, 16), 25: (14, 17), 26: (13, 18), 27: (13, 18), 28: (12, 19), 29: (11, 20)}
    for y, (a, b) in bell.items():
        for x in range(a, b + 1):
            t = (x - a) / max(1, b - a)
            k = 7 if t < 0.2 else 6 if t < 0.4 else 5 if t < 0.6 else 4 if t < 0.8 else 3
            if y == 29:
                k = max(2, k - 2) if t > 0.3 else 6     # the lip
            px(x, y, B[k])
    px(15, 24, B[6])
    px(15, 30, B[1])                                     # the clapper
    px(16, 30, B[2])
    # --- the cap: a pointed slate roof, its front face in courses, the west hip lit, the east in shade
    apex_y, base_y = 7, 20
    for y in range(apex_y, base_y + 1):
        f = (y - apex_y) / (base_y - apex_y)
        half = 1 + f * 10.5
        a, b = int(round(15.5 - half)), int(round(15.5 + half)) - 1
        for x in range(a, b + 1):
            rel = (x + 0.5 - 15.5) / half
            if rel < -0.62:
                k = 8                                     # the west face, in the light
            elif rel > 0.62:
                k = 2                                     # the east face, in shade
            else:
                k = 6 if rel < 0 else 5                   # the front face
                if (y - apex_y) % 3 == 0:
                    k -= 2                                # the courses of slates
                elif (x + (y // 3) * 2) % 4 == 0:
                    k -= 1
            px(x, y, S[k])
    for x in range(4, 28):                                # the cap's eave
        px(x, 21, S[8] if x < 16 else S[6])
        px(x, 22, S[1])
    px(15, 6, S[7])
    # --- the finial: a pole, a gold ball, the pennant flying east
    for y in range(1, 7):
        px(15, y, PLANK[3])
    px(15, 0, GOLDT[6])
    px(14, 1, GOLDT[6])
    px(15, 1, GOLDT[5])
    px(16, 1, GOLDT[3])
    px(15, 2, GOLDT[3])
    flag = ["rrrrrrh", "rddrrh.", "rrrrh..", "rrh...."]
    for j, row in enumerate(flag):
        for i, ch in enumerate(row):
            if ch == "r":
                px(16 + i, 2 + j, FLAGC[2] if j < 2 else FLAGC[1])
            elif ch == "d":
                px(16 + i, 2 + j, GOLDT[5])
            elif ch == "h":
                px(16 + i, 2 + j, FLAGC[3])
    # --- outline round it all, then its shadow on the roof below and to the right
    m = obj[:, :, 3] > 0
    for y in range(H):
        for x in range(W):
            if not m[y, x] and any(0 <= x + dx < W and 0 <= y + dy < H and m[y + dy, x + dx]
                                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                obj[y, x] = OUTLINE
    for y in range(36, H):
        for x in range(W):
            if obj[y, x, 3]:
                continue
            if 26 <= x <= 29 and y >= 37 + (x - 26) or y in (46, 47) and 7 <= x <= 29:
                shadow[y, x] = SHADOW
    out = shadow.copy()
    out[obj[:, :, 3] > 0] = obj[obj[:, :, 3] > 0]
    return out, {"shadow": [shadow], "tower": [obj]}


# ====================================================================================================================
# what terrain.py builds from this file
# ====================================================================================================================

TERRAINS = {t.id: t for t in (Fountain(), Farmland(), Wheat(), HallWall(), Carpet())}

SPRITES = {name: roof_sprite(name) for name in ROOFS}
SPRITES["roof_chimney"] = chimney
SPRITES["roof_bell"] = bell_tower


# ====================================================================================================================
# preview
# ====================================================================================================================

ORDER = ["dirt", "grass", "cobbles", "farmland", "wood_floor", "stone_floor", "carpet", "tall_grass", "wheat",
         "fountain", "fort_wall", "house_wall", "hall_wall", "fence"]


class Tiles:
    """Every terrain's edge and fill tiles for one frame (this file's and terrain.py's), made once."""

    def __init__(self, frame=0):
        import terrain
        self.T = dict(terrain.TERRAINS)
        self.T.update(TERRAINS)
        self.frame = frame
        self.cache = {}

    def get(self, tid):
        from PIL import Image
        if tid not in self.cache:
            t = self.T[tid]
            f = self.frame % t.frames
            edges = [Image.fromarray(t.edge(i, f), "RGBA") for i in range(16)]
            n = 4 if t.frames > 1 else 4 * t.groups
            fills = [Image.fromarray(t.fill(v, f), "RGBA") for v in range(n)]
            self.cache[tid] = (edges, fills)
        return self.cache[tid]


def render(stacks, tiles, group_at=None):
    """The dual grid as the game draws it (see preview.render): stacks = each tile's layers, bottom to top.
    group_at(tid, cx, cy) -> fill group (None: the game's slow noise)."""
    from PIL import Image
    from preview import slow_noise, tile_hash
    h, w = len(stacks), len(stacks[0])
    P = T // 2
    canvas = Image.new("RGBA", (w * T + 2 * P, h * T + 2 * P), (0, 0, 0, 255))

    def at(xx, yy):
        return set(stacks[min(max(yy, 0), h - 1)][min(max(xx, 0), w - 1)])

    for cy in range(h + 1):
        for cx in range(w + 1):
            corners = [at(cx - 1, cy - 1), at(cx, cy - 1), at(cx - 1, cy), at(cx, cy)]
            for layer in sorted(set().union(*corners), key=ORDER.index):
                mask = sum(bit for bit, c in zip((1, 2, 4, 8), corners) if layer in c)
                if mask == 0:
                    continue
                edges, fills = tiles.get(layer)
                if mask == 15:
                    groups = max(1, len(fills) // 4)
                    g = group_at(layer, cx, cy) if group_at else None
                    if g is None:
                        g = min(groups - 1, int(slow_noise(cx, cy, 6.0, len(layer)) * groups * 1.15)) if groups > 1 else 0
                    im = fills[4 * min(g, groups - 1) + tile_hash(cx, cy, 7) % 4]
                else:
                    im = edges[mask]
                canvas.alpha_composite(im, (cx * T, cy * T))
    return canvas.crop((P, P, P + w * T, P + h * T))


class Scene:
    """A grid of tile stacks to draw on: base ground everywhere, then boxes of terrain on top."""

    def __init__(self, w, h, base="grass"):
        self.w, self.h = w, h
        self.st = [[[base] for _ in range(w)] for _ in range(h)]

    def box(self, x0, y0, x1, y1, tid, replace=None):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if replace is not None:
                    self.st[y][x] = [l for l in self.st[y][x] if l not in replace]
                if tid not in self.st[y][x]:
                    self.st[y][x].append(tid)

    def building(self, x0, y0, w, h, wall, floor, door=None):
        """Walls round a w x h footprint, floor inside (and under the walls), a door gap in the south wall."""
        self.box(x0, y0, x0 + w - 1, y0 + h - 1, floor)
        for x in range(x0, x0 + w):
            for y in (y0, y0 + h - 1):
                self.st[y][x].append(wall)
        for y in range(y0, y0 + h):
            for x in (x0, x0 + w - 1):
                if wall not in self.st[y][x]:
                    self.st[y][x].append(wall)
        if door is not None:
            for dx in (door if isinstance(door, (list, tuple)) else [door]):
                self.st[y0 + h - 1][x0 + dx].remove(wall)


def put_img(canvas, arr_or_im, x, y):
    from PIL import Image
    im = arr_or_im if isinstance(arr_or_im, Image.Image) else Image.fromarray(arr_or_im, "RGBA")
    canvas.alpha_composite(im, (int(x), int(y))) if x >= 0 and y >= 0 else _paste_clipped(canvas, im, x, y)


def _paste_clipped(canvas, im, x, y):
    x, y = int(x), int(y)
    cx, cy = max(0, -x), max(0, -y)
    canvas.alpha_composite(im.crop((cx, cy, im.width, im.height)), (x + cx, y + cy))


def roof_shadow(roof: np.ndarray, dx=3, dy=3) -> np.ndarray:
    """A soft cast shadow for a composed roof (suggested for the game: draw it before the roof, at the roof's
    position): the roof's silhouette moved dx right and dy down, in the see-through shadow colour."""
    h, w = roof.shape[:2]
    out = blank(w + dx, h + dy)
    m = roof[:, :, 3] > 0
    out[dy:dy + h, dx:dx + w][m] = SHADOW
    return out


def add_roof(canvas, style, x0, y0, w, h, alpha=1.0, chimney_at=None, bell=False, shadow=True):
    """Draw a building's roof the way the game will: composed from the sheet, top-left at (x0*16-3, y0*16-10).
    chimney_at: the chimney's column (in tiles from the roof's left), standing on the back slope with its bottom
    8 px over the roof just above the ridge cap. bell: the bell tower, centred, astride the ridge (its bottom edge
    at the bottom of the ridge piece, so its bottom 12 px are on the roof)."""
    from PIL import Image
    sheet = ROOFS[style].sheet()
    arr = compose_roof(sheet, w, h)
    rx, ry = x0 * T - 3, y0 * T - 10
    roof = Image.fromarray(arr, "RGBA")
    a = (h - 3) * 2 // 5
    ridge_y = (1 + a) * T                      # the ridge piece's top, in the roof image
    layer = Image.new("RGBA", (roof.width + 8, roof.height + 64))
    ox, oy = 0, 64
    if shadow:
        layer.alpha_composite(Image.fromarray(roof_shadow(arr), "RGBA"), (ox, oy))
    layer.alpha_composite(roof, (ox, oy))
    if chimney_at is not None:
        ch = Image.fromarray(chimney()[0], "RGBA")
        layer.alpha_composite(ch, (ox + 3 + chimney_at * T, oy + ridge_y + RIDGE_TOP + 2 - 32))
    if bell:
        b = Image.fromarray(bell_tower()[0], "RGBA")
        layer.alpha_composite(b, (ox + roof.width // 2 - 16, oy + ridge_y + T - 48))
    if alpha < 1:
        px = np.array(layer)
        px[:, :, 3] = (px[:, :, 3] * alpha).astype(np.uint8)
        layer = Image.fromarray(px, "RGBA")
    put_img(canvas, layer, rx - ox, ry - oy)


def labelled(panels, k, cols, title=None):
    """Lay out (label, image) panels zoomed by k in a grid."""
    from PIL import Image, ImageDraw
    from preview import font
    ims = []
    for lab, im in panels:
        z = im.resize((im.width * k, im.height * k), Image.NEAREST)
        need = 9 * len(lab) + 8          # room for the label above it
        if z.width < need:
            pad = Image.new("RGBA", (need, z.height), (28, 24, 38, 255))
            pad.paste(z, (0, 0))
            z = pad
        ims.append((lab, z))
    rows = [ims[i:i + cols] for i in range(0, len(ims), cols)]
    widths = [sum(im.width for _, im in r) + 16 * (len(r) + 1) for r in rows]
    heights = [max(im.height for _, im in r) + 34 for r in rows]
    top = 34 if title else 0
    out = Image.new("RGBA", (max(widths), sum(heights) + 16 + top), (28, 24, 38, 255))
    d = ImageDraw.Draw(out)
    if title:
        d.text((16, 10), title, fill=(255, 240, 200, 255), font=font(18))
    y = top + 8
    for r, hgt in zip(rows, heights):
        x = 16
        for lab, im in r:
            d.text((x, y), lab, fill=(240, 220, 160, 255), font=font(15))
            out.paste(im, (x, y + 24))
            x += im.width + 16
        y += hgt
    return out


def stack_v(*ims):
    from PIL import Image
    out = Image.new("RGBA", (max(i.width for i in ims), sum(i.height for i in ims)), (28, 24, 38, 255))
    y = 0
    for i in ims:
        out.paste(i, (0, y))
        y += i.height
    return out


def preview_panels(frame=0):
    from preview import creature
    tiles = Tiles(frame)
    panels = {}

    # the fountain: a 4x4 basin and a 6x4 one in a cobbled square
    s = Scene(18, 9)
    s.box(1, 1, 16, 7, "cobbles")
    s.box(2, 2, 5, 5, "fountain")
    s.box(9, 2, 14, 5, "fountain")
    im = render(s.st, tiles)
    orn = ROOT_OUT / "ornament_fountain.png"   # the props helper's centrepiece, if it's been built
    if orn.exists():
        from PIL import Image
        strip = Image.open(orn).convert("RGBA")
        fw = strip.width // 4
        fr = strip.crop((fw * (frame % 4), 0, fw * (frame % 4 + 1), strip.height))
        for cx, cy in ((4 * T, 4 * T), (12 * T, 4 * T)):   # its bottom centre on the basin's centre
            im.alpha_composite(fr, (cx - fw // 2, cy - fr.height))
    b = creature("chick")
    im.alpha_composite(b, (7 * T, 7 * T - b.height + 4))
    panels["fountain"] = im

    # farmland: seedlings, vegetables, and a field where the two meet
    s = Scene(22, 9)
    s.box(1, 1, 5, 4, "farmland")
    s.box(8, 1, 13, 4, "farmland")
    s.box(1, 6, 13, 7, "farmland")
    s.box(16, 1, 20, 7, "farmland")
    grp = lambda tid, cx, cy: (1 if 8 <= cx <= 14 and cy <= 5 else 0 if cx <= 6 else
                               (1 if cx >= 7 and cy >= 6 and cx <= 14 else (cy >= 4) * 1)) if tid == "farmland" else None
    panels["farmland"] = render(s.st, tiles, grp)

    # wheat: ripe, greener, and the two meeting
    s = Scene(22, 9)
    s.box(1, 2, 6, 5, "wheat")
    s.box(9, 2, 13, 4, "wheat")
    s.box(16, 1, 20, 7, "wheat")
    s.box(1, 7, 2, 7, "wheat")
    grp = lambda tid, cx, cy: (0 if cx <= 7 else 1 if cx <= 14 else (1 if cy >= 4 else 0)) if tid == "wheat" else None
    im = render(s.st, tiles, grp)
    beast = creature("moon_wolf")
    im.alpha_composite(beast, (8 * T, 8 * T - beast.height + 2))
    panels["wheat"] = im

    # the Town Hall: hall_wall round a stone floor, a carpet runner from the door to the desk; a hall with a
    # 2-wide runner across it; cobbles outside
    s = Scene(24, 11, "grass")
    s.box(0, 0, 23, 10, "cobbles")
    s.building(1, 1, 9, 8, "hall_wall", "stone_floor", door=[4])
    s.box(5, 2, 5, 9, "carpet")
    s.building(12, 1, 11, 7, "hall_wall", "wood_floor", door=[2, 3])
    s.box(13, 3, 21, 4, "carpet")
    s.box(14, 5, 15, 7, "carpet")
    im = render(s.st, tiles)
    b = creature("griffin")
    im.alpha_composite(b, (5 * T + 8 - b.width // 2, 6 * T - b.height + 6))
    panels["hall"] = im
    return panels, tiles


def roof_panels():
    """Each roof style at 5x4, 8x6 and 12x8 over a house on grass."""
    out = []
    for style in ROOFS:
        s = Scene(31, 10)
        spots = [(1, 2, 5, 4), (7, 2, 8, 6), (17, 1, 12, 8)]
        for x0, y0, w, h in spots:
            s.building(x0, y0, w, h, "house_wall", "wood_floor", door=[w // 2])
        im = render(s.st, Tiles(0))
        for i, (x0, y0, w, h) in enumerate(spots):
            add_roof(im, style, x0, y0, w, h, chimney_at=(w - 3 if i else None) if style != "roof_slate" else None)
        out.append((f"{style}: 5x4, 8x6 (chimney), 12x8 (chimney)", im))
    return out


def house_check():
    """A house_wall building on grass: no roof, with the roof, and the roof fading (a creature inside)."""
    from preview import creature
    ims = []
    for mode in ("no roof", "roof", "roof fading (35%)"):
        s = Scene(10, 8)
        s.building(2, 2, 6, 5, "house_wall", "wood_floor", door=[3])
        im = render(s.st, Tiles(0))
        b = creature("moon_wolf")
        im.alpha_composite(b, (4 * T - 6, 5 * T + 6 - b.height))
        if mode != "no roof":
            add_roof(im, "roof_thatch", 2, 2, 6, 5, alpha=1.0 if mode == "roof" else 0.35, chimney_at=1)
        ims.append((mode, im))
    s = Scene(14, 11, "cobbles")
    s.building(2, 2, 10, 7, "hall_wall", "stone_floor", door=[4, 5])
    s.box(4, 3, 7, 8, "carpet", None)
    im = render(s.st, Tiles(0))
    add_roof(im, "roof_slate", 2, 2, 10, 7, bell=True)
    ims.append(("Town Hall: slate + bell tower", im))
    s = Scene(14, 11, "cobbles")
    s.building(2, 2, 10, 7, "hall_wall", "stone_floor", door=[4, 5])
    s.box(4, 3, 7, 8, "carpet", None)
    im2 = render(s.st, Tiles(0))
    add_roof(im2, "roof_red", 2, 2, 10, 7, bell=True)
    ims.append(("Town Hall: red tiles + bell tower", im2))
    return ims


def sheets_panel():
    from PIL import Image
    ims = []
    for name in ROOFS:
        s = Image.fromarray(ROOFS[name].sheet(), "RGBA")
        bg = Image.new("RGBA", s.size, (200, 60, 200, 255))
        bg.alpha_composite(s)
        ims.append((name, bg))
    for name, fn in (("roof_chimney", chimney), ("roof_bell", bell_tower)):
        a = fn()[0]
        im = Image.fromarray(a, "RGBA")
        bg = Image.new("RGBA", im.size, (90, 120, 80, 255))
        bg.alpha_composite(im)
        ims.append((name, bg))
    for tid in ("fountain", "farmland", "wheat", "hall_wall", "carpet"):
        t = TERRAINS[tid]
        sh = Image.fromarray(t.sheet(0), "RGBA")
        f = Image.fromarray(t.fill_strip(), "RGBA")
        im = Image.new("RGBA", (sh.width + 4 + f.width, sh.height), (200, 60, 200, 255))
        im.alpha_composite(sh, (0, 0))
        im.alpha_composite(f, (sh.width + 4, 0))
        ims.append((tid, im))
    return ims


def preview(out=None, scratch=None):
    from PIL import Image
    panels, _ = preview_panels(0)
    frames = []
    for f in range(4):   # the fountain's 4 frames, cropped
        p, _ = preview_panels(f) if f else (panels, None)
        frames.append((f"frame {f}", p["fountain"].crop((1 * T, 1 * T, 16 * T, 7 * T))))
    top = labelled([("fountain (4x4 and 6x4) in cobbles", panels["fountain"]),
                    ("farmland: seedlings (left), vegetables (middle), both meeting (right, bottom)",
                     panels["farmland"])], 3, 2, "village_ground: terrains")
    mid = labelled([("wheat: ripe (left), greener + poppies (middle), both meeting (right)", panels["wheat"]),
                    ("hall_wall rooms: carpet on stone floor (left), on wood floor (right), cobbles outside",
                     panels["hall"])], 3, 2)
    anim = labelled(frames, 2, 4, "fountain animation (frames 0-3)")
    roofs = labelled(roof_panels(), 2, 1, "roofs (composed with compose_roof, drawn at (x0*16-3, y0*16-10))")
    check = labelled(house_check(), 3, 3, "roof over buildings")
    sheets = labelled(sheets_panel(), 4, 6, "sheets (magenta = see-through)")
    full = stack_v(top, mid, anim, check, roofs, sheets)
    PREV.mkdir(exist_ok=True)
    path = out or PREV / "village_ground_preview.png"
    full.save(path)
    print("preview", path, full.size)
    if scratch:
        for name, im in (("top", top), ("mid", mid), ("anim", anim), ("roofs", roofs), ("check", check),
                         ("sheets", sheets)):
            im.save(Path(scratch) / f"vg_{name}.png")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        preview(scratch=sys.argv[2] if len(sys.argv) > 2 else None)
