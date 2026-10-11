"""Creature parts (ASSET_LIST.md section 2.1 to 2.6).

Designed to the rules that make a collectable monster read at a glance:
- one body mass, broken by one signature shape (a wisp, a crest, a jaw tuft, back fins);
- two to four colours: body, a paler belly, one accent, and the white of the eye;
- little detail: no texture, no scattered marks, one small quirk per animal;
- round forms with a single sharp thing (a fang, a claw, a pointed tuft);
- big eyes with a white, a dark pupil and a highlight, looking where the creature is going;
- the young show small versions of what the adult grows (a biped's back fins go 1, 2, 3).
All four animals are original; none is modelled on an existing character.

Parts are drawn in the app's key colours, which it swaps for each creature's own:
P = body, S = belly and claws, A = the accent (markings, fins, the lower iris).
The outline is the darkest body colour, a shade lighter where the light falls on it.
"""

from px import *

P = ["#8fd3ff", "#4aa3e8", "#2f6fb8", "#1f4780"]
S = ["#fff1c9", "#f5cf7a", "#d49a3f"]
A = ["#ff7a9c", "#d6456e"]
S4 = [*S, P[3]]
A4 = [A[0], A[0], A[1], P[3]]   # an accent-coloured form: flat, one shade, the body's outline
PLATE = [P[1], P[2], P[3]]      # a darker, harder patch of hide
LINE = "#1b1420"                # the app's fixed outline colour: pupils, eyelids, mouths, noses
SIZES = {"s": (20, 16), "m": (28, 24), "l": (40, 36)}
LEG = {"s": (6, 5), "m": (6, 8), "l": (8, 12)}
ARM = {"s": (5, 6), "m": (6, 9), "l": (8, 12)}
WING = {"s": (10, 8), "m": (14, 12), "l": (20, 16)}
SPECIES = ["blob", "biped", "quad", "floater"]
BRANCHES = ["echo", "sage", "keeper"]


def new(w, h):
    return Spr(w, h, grit=False)


def body_only(s, m):
    return {p for p in m if s.bd.get(p, 3) < 3}


def gem(s, x, y):
    s.led(x, y, A)
    s.put((x, y - 1), W)


# ---------- heads ----------
NECK = E(13, 24, 6, 3.6)
SNOUT = E(22.5, 18.5, 7.8, 6.4)      # the biped's short round snout
MUZZLE = E(21.5, 19.5, 8.4, 6.2)     # the quad's muzzle
FRILL = PG([(5, 8), (0, 4), (2, 12), (0, 19), (5, 22)])
BEARD = PG([(13, 24), (21, 27), (11, 27)])


def head_mask(sp):
    if sp == "blob":        # a droplet with a wisp curling off the top
        return E(16, 16.5, 13.4, 10.8) | PG([(9, 7), (12, 1), (16, 0), (15, 3), (19, 6)])
    if sp == "biped":       # a hatchling lizard: round skull, short snout, one swept-back nub
        return E(15, 13.5, 12, 10.4) | SNOUT | NECK | PG([(7, 6), (3, 2), (10, 4)])
    if sp == "quad":        # a pup: round skull, small muzzle, a tuft of fur at the jaw
        return E(15, 13.5, 12.2, 10.6) | MUZZLE | NECK | PG([(6, 18), (1, 21), (5, 22), (2, 26), (9, 24)])
    # the floater: a round, fluffy face with a crown tuft and a cheek tuft
    return E(15.5, 14.5, 12.4, 11.4) | E(13.5, 25, 4.6, 2.7) | PG([(11, 5), (14, 0), (15, 0), (17, 4)]) | PG([(4, 14), (0, 12), (3, 17), (0, 20), (5, 21)])


def head(sp, br=None):
    s = new(32, 28)
    m = head_mask(sp)
    if br == "echo":        # a frill that fans out behind the head, to catch sound
        m |= FRILL
    if br == "sage":        # a tuft of beard
        m |= BEARD
    s.blob(m, P, hi=E(9, 8, 2.6, 1.4))
    inner = erode(m)
    if sp == "blob":        # a blush on the cheek
        s.fill(body_only(s, R(8, 19, 10, 20)), A[1])
        s.put((8, 19), A[0])
    elif sp == "biped":     # a pale lower jaw, a nostril, two freckles
        s.over({p for p in SNOUT & inner if p[1] >= 21}, S)
        s.put((28, 15), LINE)
        s.fill(body_only(s, {(8, 18), (10, 20)}), A[0])
    elif sp == "quad":      # a pale muzzle, a nose, two whisker marks
        s.over(E(22.5, 21, 6.6, 4.2) & inner, S)
        s.fill({(28, 17), (29, 17), (28, 18), (29, 18)} & m, LINE)
        s.fill(body_only(s, R(8, 17, 10, 17) | R(8, 19, 9, 19)), A[0])
    else:                   # pale chin fluff, and a small mark under the eye
        s.over({p for p in inner if p[1] >= 23}, S)
        s.fill(body_only(s, {(10, 18), (11, 18), (10, 19)}), A[0])
    if br == "echo":        # the frill's ribs
        s.fill(body_only(s, LN(1, 6, 5, 10) | LN(1, 18, 5, 16)), A[1])
    elif br == "sage":      # pale brows, a pale beard, and a third eye
        s.over(R(10, 6, 26, 8) & inner, S)
        s.over(BEARD & inner, S)
        s.led(18, 4, A)
    elif br == "keeper":    # an armoured cheek and a crystal in the forehead
        s.over(RR(2, 13, 7, 22, 2) & inner, PLATE)
        crystal = PG([(18, 1), (20, 4), (18, 7), (16, 4)])
        s.fill(crystal, A[0])
        s.fill(rim(crystal) | {(18, 5), (19, 5)}, A[1])
        s.put((17, 3), W)
    return s


# ---------- torsos ----------
def torso(sp, size, br=None):
    w, h = SIZES[size]
    kx, ky = w / 40, h / 36
    s = new(w, h)
    e = lambda cx, cy, rx, ry: E(cx * kx, cy * ky, rx * kx, ry * ky)
    q = lambda x, y: (round(x * kx), round(y * ky))
    if sp == "blob":
        m = e(19.6, 25.5, 19.5, 24.5) & RR(0, -8, w - 1, h - 1, round(5 * kx))
    elif sp == "biped":
        m = RR(*q(8, 1), *q(33, 35), round(11 * kx)) | e(20, 25, 14.6, 11)
        fins = {"s": [9], "m": [8, 15], "l": [7, 13, 19]}[size]    # back fins: one more with each stage of growth
        for y in fins:
            a, b, c = q(11, y - 3), q(4, y + 1), q(11, y + 4)
            s.blob(PG([a, b, c]), A4, t=1, hi=set())
    elif sp == "quad":
        m = RR(0, round(6 * ky), w - 1, h - 1, round(13 * kx)) | e(29, 15, 10.5, 12)
    else:                   # a small round body trailing off into a wisp
        m = e(20, 17, 15.4, 13.2) | e(19, 26, 9, 8) | e(17.5, 31.5, 4.2, 4.6)
    m &= R(0, 0, w - 1, h - 1)
    s.blob(m, P, hi=set())
    inner = erode(m)
    belly = {"blob": e(25, 26, 9.5, 8.5), "biped": e(25, 23, 8, 10), "quad": e(31, 24, 6.4, 9) | e(22, 31, 12, 4.6),
             "floater": e(26, 18, 7, 7.5)}[sp]
    s.over(belly & inner, S)
    if sp == "floater":     # the tip of the tail takes the accent colour
        s.over({p for p in inner if p[1] >= q(0, 30)[1]}, A4)
    if br == "echo":        # two ripples on the flank
        for r, c in ((5, A[0]), (9, A[1])):
            s.fill(body_only(s, ARC(3, 21, r, -45, 45)), c)
    elif br == "sage":      # a pale ruff at the throat, with a clasp
        s.over(PG([(17, 8), (37, 8), (38, 12), (18, 12)]) & inner, S)
        s.led(31, 10, A)
    elif br == "keeper":    # a plated back, and two crystals in the hide
        s.over(RR(3, 8, 15, 19, 3) & inner, PLATE)
        for x, y in ((9, 26), (15, 30)):
            if (x, y) in erode(m, 2):
                gem(s, x, y)
    return s


# ---------- limbs ----------
def leg(sp, size, frame):
    w, h = LEG[size]
    s = new(w, h)
    up = 1 if frame == "b" else 0       # mid-step: the foot is lifted a pixel
    bottom = h - 1 - up
    if sp == "biped":                   # a thick shin and a broad foot with two claws
        foot = bottom - (3 if size == "l" else 2)
        s.blob(R(1, 0, w - 3, bottom) | RR(1, max(0, foot), w - 1, bottom, 1), P, t=1, hi=set())
        s.put((w - 1, bottom), S[0])
        s.put((w - 3, bottom), S[0])
    else:                               # a round paw with two claws
        s.blob(RR(0 if size == "l" else 1, 0, w - 1 if size == "l" else w - 2, bottom, 2), P, t=1, hi=set())
        s.put((w - 2, bottom), S[0])
        s.put((w - 4, bottom), S[0])
    return s


def arm(size):
    w, h = ARM[size]
    s = new(w, h)
    upper = E(w * 0.36, h * 0.3, w * 0.3, h * 0.34)
    paw = E(w * 0.6, h * 0.7, w * 0.36, h * 0.28)
    s.blob((upper | paw) & R(0, 0, w - 1, h - 1), P, t=1, hi=set())
    s.put((w - 1, h - 3 if h > 6 else h - 2), S[0])
    return s


def wing(size, frame):
    """A bat's wing: a dark arm along the top, a membrane in the accent colour."""
    w, h = WING[size]
    s = new(w, h)
    root = (w - 1, h - 1)
    if frame == "a":
        pts = [root, (w - 3, h - 1 - h // 3), (w // 2, 0), (0, h // 3), (w // 3, h // 2), (1, h - 2), (w // 2, h - 3)]
        ribs = [(0, h // 3), (1, h - 2)]
    else:
        pts = [root, (w - 3, h // 2), (w // 3, h // 3), (0, h // 2 + 1), (w // 3, h - 3), (2, h - 1), (w // 2, h - 2)]
        ribs = [(0, h // 2 + 1), (2, h - 1)]
    m = PG(pts)
    s.blob(m, A4, t=1, hi=set())
    for tip in ribs:
        s.fill(body_only(s, LN(*root, *tip)), A[1])
    arm_bone = PATH([root, pts[1], pts[2]])
    s.fill(arm_bone & m, P[3])
    return s


# ---------- ears, tails, horns, backs ----------
def ear(i):
    s = new(12, 14)
    if i == "round":
        s.blob(E(5.5, 8, 4.7, 5.2) | R(4, 11, 7, 13), P)
        s.over(E(6, 8.5, 2.2, 2.7), S)
    elif i == "point":
        s.blob(PG([(1, 13), (5, 0), (6, 0), (10, 13)]), P, t=1)
        s.over(PG([(4, 12), (6, 5), (8, 12)]), S)
    elif i == "long":
        s.blob(RR(3, 0, 8, 13, 3), P, t=1)
        s.over(R(5, 4, 6, 11), S)
    elif i == "floppy":     # an ear that folds over
        s.blob(E(6.5, 5, 4.7, 4.2) | E(2.8, 8.5, 2.9, 4.3) | R(5, 8, 9, 13), P)
        s.over(E(3, 9, 1.4, 2.4), S)
    elif i == "fin":
        m = PG([(3, 13), (1, 1), (11, 9), (9, 13)])
        s.blob(m, A4, t=1, hi=set())
        s.fill(body_only(s, LN(4, 12, 2, 3) | LN(6, 12, 7, 7)), A[1])
    elif i == "leaf":
        s.blob(PG([(6, 13), (1, 7), (5, 0), (6, 0), (11, 7)]), S4, t=1)
        s.fill(LN(6, 3, 6, 11), S[2])
    else:                   # tuft
        m = PG([(1, 13), (3, 4), (5, 13)]) | PG([(4, 13), (6, 0), (8, 13)]) | PG([(7, 13), (9, 4), (11, 13)])
        s.blob(m, P, t=1, hi={(6, 3), (6, 4), (5, 5)})
    return s


def tail(i):
    s = new(16, 16)
    if i == "nub":
        s.blob(E(11.5, 8, 3.7, 3.5), P, t=1)
    elif i == "curl":
        ring = E(7, 8, 6.4, 6.4) - E(7, 8, 3.2, 3.2)
        cut = PG([(7, 8), (15, 11), (15, 16), (9, 16)])
        s.blob((ring - cut) | R(11, 6, 15, 9) | E(8.5, 9.5, 1.8, 1.8), P, t=1, hi={(4, 4), (5, 3), (6, 3)})
    elif i == "fluff":
        m = E(5, 6, 4.2, 4.2) | E(10, 5.5, 4.4, 4.2) | E(6, 11, 4.4, 4) | E(11, 10, 4.2, 4.2) | R(12, 7, 15, 9)
        s.blob(m, S4)
    elif i == "spike":      # a thick tail that ends in a coloured point
        m = PG([(15, 4), (15, 12), (8, 10), (1, 5), (8, 5)])
        s.blob(m, P, t=1, hi=set())
        s.over({p for p in m if p[0] < 6}, A4)
    elif i == "fish":       # a forked fin on a short stem
        s.blob(PG([(15, 6), (15, 10), (9, 8)]), P, t=1, hi=set())
        s.blob(PG([(10, 8), (1, 1), (4, 8), (1, 15)]), A4, t=1, hi=set())
    elif i == "leaf":
        s.blob(PG([(15, 8), (9, 2), (1, 7), (8, 13)]), S4, t=1)
        s.fill(LN(13, 8, 4, 7), S[2])
    else:                   # bolt: a thin crooked tail with a four-pointed spark at its tip
        s.blob(PATH([(15, 8), (11, 8), (12, 5), (7, 6), (8, 9), (5, 9)], 2), P, t=1, hi=set(), line=False)
        star = STAR(3.5, 8.5, 4.4, 1.7, 4)
        s.blob(star, A4, t=1, hi=set())
        s.put((3, 8), W)
    return s


def horn(i):
    s = new(12, 12)
    if i == "nub":
        s.blob(PG([(3, 11), (5, 5), (6, 5), (8, 11)]), S4, t=1, hi={(5, 7)})
    elif i == "pair":
        s.blob(PG([(0, 11), (1, 3), (2, 3), (4, 11)]), S4, t=1, hi={(2, 6)})
        s.blob(PG([(7, 11), (9, 3), (10, 3), (11, 11)]), S4, t=1, hi={(9, 6)})
    elif i == "antenna":    # a feeler with a round lure on the end
        s.fill(PATH([(6, 11), (6, 8), (7, 6), (7, 5)]), P[3])
        s.blob(E(7, 3, 2.4, 2.4), A4, t=1, hi=set())
        s.put((6, 2), W)
    elif i == "crest":      # a three-pointed crest
        s.blob(PG([(1, 11), (2, 4), (5, 7), (7, 1), (9, 7), (11, 11)]), A4, t=1, hi=set())
    else:                   # gem: a crystal growing from the skull
        s.blob(PG([(3, 11), (4, 8), (8, 8), (9, 11)]), P, t=1, hi=set())
        m = PG([(6, 0), (9, 4), (7, 9), (5, 9), (3, 4)])
        s.fill(m, A[0])
        s.fill({p for p in m if p[0] + p[1] > 11} | rim(m), A[1])
        s.fill({(5, 3), (5, 4)}, W)
    return s


def back(i):
    s = new(16, 16)
    if i == "spikes":       # three spines with coloured tips
        m = PG([(0, 15), (3, 6), (6, 15)]) | PG([(5, 15), (8, 2), (11, 15)]) | PG([(10, 15), (13, 6), (15, 15)])
        s.blob(m, P, t=1, hi=set())
        s.over({p for p in m if p[1] < 9 and p[0] in (2, 3, 4, 12, 13, 14)} | {p for p in m if p[1] < 6}, A4)
    elif i == "shell":
        m = E(8, 15, 7.5, 10) & R(0, 0, 15, 15)
        s.blob(m, S4)
        s.fill(body_only(s, LN(8, 6, 8, 15) | ARC(8, 15, 4, 180, 360)), S[2])
    elif i == "fin":        # a sail
        m = PG([(2, 15), (5, 1), (14, 15)])
        s.blob(m, A4, t=1, hi=set())
        s.fill(body_only(s, LN(5, 14, 5, 4) | LN(9, 14, 7, 6)), A[1])
    elif i == "sprout":     # a seedling: a stem and two unequal leaves
        s.fill(LN(8, 15, 8, 7), S[2])
        s.blob(E(4.5, 6.5, 3.7, 2.7), S4, t=1)
        s.blob(E(11, 4.5, 3, 2.3), S4, t=1)
    else:                   # flame
        m = PG([(4, 15), (3, 8), (6, 10), (8, 2), (11, 8), (13, 6), (12, 15)])
        s.blob(m, A4, t=1, hi=set())
        core = PG([(6, 15), (8, 8), (10, 15)])
        s.fill(core, S[0])
        s.put((8, 13), W)
    return s


# ---------- faces ----------
# Each eye is 6 wide and 8 tall: a dark rim, a white, a dark pupil with a highlight, and the
# accent colour in the lower iris. Both eyes look the way the creature faces (right).
EYE_OPEN = {
    "dot": ["......", "......", "..KK..", ".KWNK.", ".KNNK.", ".KANK.", "..KK..", "......"],
    "round": [".KKKK.", "KWNNNK", "KWNWNK", "KWNNNK", "KWNNNK", "KWAANK", "KWAANK", ".KKKK."],
    "oval": [".KKK..", "KWNNK.", "KWNWK.", "KWNNK.", "KWNNK.", "KWAAK.", "KWAAK.", ".KKK.."],
    "sleepy": ["......", "KKKKKK", "KKKKKK", "KWNNNK", "KWNWNK", "KWAANK", ".KKKK.", "......"],
    "star": [".KKKK.", "KAAWAK", "KAWWWK", "KAAWAK", "KAAAAK", "KAAAAK", "KaAAaK", ".KKKK."],
    "wide": ["KK....", "KWKK..", "KWNNKK", "KWNWNK", "KWNNNK", ".KANNK", "..KKK.", "......"],
}
EYE_SMALL = {"dot"}


def eye_rows(style, expr):
    small, wide = style in EYE_SMALL, style == "wide"
    blank = ["......"] * 8
    if expr == "open":
        return EYE_OPEN[style]
    if expr == "blink":     # shut, relaxed: a line that curves down
        if small:
            return [*blank[:4], "..KK..", *blank[5:]]
        return [*blank[:3], "KK...." if wide else "K....K", "..KKKK" if wide else ".KKKK.", *blank[5:]]
    if expr == "happy":     # shut, smiling: a line that curves up
        if small:
            return [*blank[:3], "..KK..", ".K..K.", *blank[5:]]
        return [*blank[:3], ".KKKK.", "K....K", *blank[5:]]
    if expr == "sleepy":    # asleep: a flat line
        return [*blank[:4], ".KKKK." if small else "KKKKKK", *blank[5:]]
    # sad: the open eye with its outer top corner sliced away by a drooping lid
    if small:
        return ["......", "...K..", "......", "..KK..", ".KWNK.", ".KANK.", "..KK..", "......"]
    rows = [list(r) for r in EYE_OPEN[style]]
    first = next(j for j, r in enumerate(rows) if any(ch != "." for ch in r))
    for j, cut in ((first, 3), (first + 1, 2)):
        for x in range(cut):
            rows[j][x] = "K" if j == first + 1 and rows[j][x] != "." else "."
    return ["".join(r) for r in rows]


EYE_KEY = {"A": A[0], "a": A[1], "W": W, "K": LINE, "N": LINE}


def eyes(style, expr):
    s = new(16, 8)
    rows = eye_rows(style, expr)
    for ox, mirrored in ((1, False), (9, expr == "sad")):
        for j, row in enumerate(rows):
            line = row[::-1] if mirrored else row
            for i, ch in enumerate(line):
                if ch != ".":
                    s.put((ox + i, j), EYE_KEY[ch])
    return s


# A small mouth with one fang showing: the sharp thing on a round face.
MOUTHS = {
    "neutral": ["........", "........", "........", "..KKKKK.", ".....W..", "........"],
    "smile": ["........", "........", ".K....K.", "..KKKK..", "..W.....", "........"],
    "open": ["........", "..KKKK..", ".KWaaWK.", ".KaaaaK.", "..KKKK..", "........"],
    "eat": ["..KKKK..", ".KWaaWK.", ".KaaaaK.", ".KaAAaK.", ".KWaaWK.", "..KKKK.."],
    "sad": ["........", "........", "..KKKK..", ".K....K.", "........", "........"],
    "sleep": ["........", "........", "...KK...", "...KK...", "........", "........"],
}


def mouth(i):
    return grid(MOUTHS[i], {"A": A[0], "a": A[1], "W": W, "K": LINE})


# ---------- patterns: pure magenta, seamless ----------
def pattern(i):
    s = Spr(16, 16)
    wrap = lambda m: {(x % 16, y % 16) for (x, y) in m}
    if i == "spots":
        m = E(3, 3, 2.2, 2.2) | E(11.5, 5.5, 1.6, 1.6) | E(6, 11.5, 2.4, 2.2) | E(14, 13, 1.6, 1.6)
    elif i == "stripes":    # broad bands, a few to a body
        m = {(x, y) for x in range(16) for y in range(16) if (x + y // 2) % 8 < 2}
    elif i == "patch":
        m = E(7, 8, 5.4, 4.8) | E(11, 11.5, 3.2, 3)
    elif i == "speckle":    # a few freckles in pairs
        m = set()
        for x, y in ((3, 3), (11, 7), (6, 13)):
            m |= {(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)}
    else:                   # rings
        m = (E(5, 5, 4.3, 4.3) - E(5, 5, 2.4, 2.4)) | (E(13, 13, 3.4, 3.4) - E(13, 13, 1.6, 1.6))
    return s.fill(wrap(m), "#ff00ff")


def build():
    out = {}
    for sp in SPECIES:
        for size in SIZES:
            out[f"creature/torso/{sp}_{size}.png"] = torso(sp, size)
        out[f"creature/head/{sp}.png"] = head(sp)
        for br in BRANCHES:
            out[f"creature/torso/{sp}_l_{br}.png"] = torso(sp, "l", br)
            out[f"creature/head/{sp}_{br}.png"] = head(sp, br)
    for size in SIZES:
        for f in "ab":
            out[f"creature/leg/biped_{size}_{f}.png"] = leg("biped", size, f)
            out[f"creature/leg/quad_{size}_{f}.png"] = leg("quad", size, f)
            out[f"creature/wing/floater_{size}_{f}.png"] = wing(size, f)
        out[f"creature/arm/biped_{size}.png"] = arm(size)
    for i in ("round", "point", "long", "floppy", "fin", "leaf", "tuft"):
        out[f"creature/ear/{i}.png"] = ear(i)
    for i in ("nub", "curl", "fluff", "spike", "fish", "leaf", "bolt"):
        out[f"creature/tail/{i}.png"] = tail(i)
    for i in ("nub", "pair", "antenna", "crest", "gem"):
        out[f"creature/horn/{i}.png"] = horn(i)
    for i in ("spikes", "shell", "fin", "sprout", "flame"):
        out[f"creature/back/{i}.png"] = back(i)
    for st in EYE_OPEN:
        for ex in ("open", "blink", "happy", "sad", "sleepy"):
            out[f"creature/eyes/{st}_{ex}.png"] = eyes(st, ex)
    for i in MOUTHS:
        out[f"creature/mouth/{i}.png"] = mouth(i)
    for i in ("spots", "stripes", "patch", "speckle", "rings"):
        out[f"creature/pattern/{i}.png"] = pattern(i)
    return out
