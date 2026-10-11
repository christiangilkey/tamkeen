"""Creature parts (ASSET_LIST.md section 2.1 to 2.6): digital monsters.

Simple animal bodies with strong silhouettes, dark, and lit from inside by neon: glowing eyes,
circuit lines under the skin, holographic fins and wings, edges that break up into pixels.

Parts are drawn in the app's key colours, which it swaps for each creature's own:
P = body (dark on a real creature), S = belly, beak and claws, A = everything that glows.
The outline is the darkest body colour and the top-left edge catches the light, so a dark
creature still reads against a dark scene.
"""

from px import *

P = ["#8fd3ff", "#4aa3e8", "#2f6fb8", "#1f4780"]
S = ["#fff1c9", "#f5cf7a", "#d49a3f"]
A = ["#ff7a9c", "#d6456e"]
S4 = [*S, P[3]]
PLATE = [P[1], P[2], P[3]]      # a darker, harder patch of hide
LINE = "#1b1420"                # the app's fixed outline colour: pupils, eyelids, mouths
SIZES = {"s": (20, 16), "m": (28, 24), "l": (40, 36)}
LEG = {"s": (6, 5), "m": (6, 8), "l": (8, 12)}
ARM = {"s": (5, 6), "m": (6, 9), "l": (8, 12)}
WING = {"s": (10, 8), "m": (14, 12), "l": (20, 16)}
SPECIES = ["blob", "biped", "quad", "floater"]
BRANCHES = ["echo", "sage", "keeper"]


def new(w, h):
    return Spr(w, h, grit=False, rim=True)


def body_only(s, m):
    return {p for p in m if s.bd.get(p, 3) < 3}


def circuit(s, pts):
    """A glowing trace under the skin, with a brighter node at each end."""
    s.fill(body_only(s, PATH(pts)), A[1])
    for end in (pts[0], pts[-1]):
        if s.bd.get(tuple(end), 3) < 3:
            s.put(tuple(end), A[0])


def gem(s, x, y):
    s.led(x, y, A)
    s.put((x, y - 1), W)


# ---------- heads ----------
MUZZLE = PG([(18, 11), (29, 16), (31, 19), (30, 22), (27, 24), (18, 26)])
SNOUT = RR(17, 13, 30, 25, 5)
BEAK = PG([(24, 15), (31, 18), (31, 19), (24, 23)])


def head_mask(sp):
    skull = E(14, 13, 11, 9.6)   # a broad forehead, so ears, horns and hats have somewhere to sit
    if sp == "blob":             # a smooth droplet
        return E(16.5, 16.5, 13.6, 10.8) | skull
    if sp == "biped":            # a reptile: a blunt snout
        return E(14.5, 14.5, 11.6, 11) | skull | SNOUT | E(13, 24, 5, 3.4)
    if sp == "quad":             # a beast: a wedge muzzle and a ruff of fur at the jaw
        return E(14, 15.5, 11.6, 10.8) | skull | MUZZLE | PG([(4, 18), (0, 21), (3, 22), (1, 26), (8, 24)])
    return E(15, 14.5, 12, 11.6) | skull | E(13.5, 25, 4.6, 2.7) | PG([(6, 6), (1, 2), (8, 4)]) | PG([(4, 10), (0, 8), (5, 7)])


def head(sp, br=None):
    s = new(32, 28)
    m = head_mask(sp)
    if br == "echo":             # a frill that fans out behind the head, to catch sound
        m |= PG([(5, 8), (0, 4), (2, 12), (0, 19), (5, 22)])
    if br == "sage":             # a tuft of beard
        m |= PG([(13, 24), (21, 27), (11, 27)])
    s.blob(m, P)
    inner = erode(m)
    if sp == "biped":            # a pale lower jaw and a nostril
        s.over({p for p in SNOUT & inner if p[1] >= 22}, S)
        s.put((28, 16), LINE)
    elif sp == "quad":           # a pale chin and a wet nose
        s.over({p for p in MUZZLE & inner if p[1] >= 22}, S)
        s.fill(R(29, 17, 30, 18) & m, LINE)
        s.put((29, 17), W)
    elif sp == "floater":        # a short hooked beak
        s.blob(BEAK, S4, t=1, hi=set())
    else:                        # the back of the head is coming apart into pixels
        s.fill({(0, 13), (1, 13), (0, 14), (1, 14)}, P[2])
        s.put((2, 10), P[1])
        s.put((0, 18), A[1])
    if br == "sage":             # pale brows, a pale beard, and a third eye
        s.over(R(9, 5, 26, 7) & inner, S)
        s.over(PG([(13, 24), (21, 27), (11, 27)]) & inner, S)
        s.led(17, 6, A)
    elif br == "keeper":         # armoured cheeks and a crystal in the forehead
        s.over(RR(2, 14, 8, 23, 2) & inner, PLATE)
        s.put((5, 16), A[0])
        s.put((5, 21), A[0])
        crystal = PG([(17, 1), (19, 4), (17, 7), (15, 4)])
        s.fill(crystal, A[0])
        s.fill(rim(crystal) | {(17, 5), (18, 5)}, A[1])
        s.put((16, 3), W)
    elif br == "echo":           # ripples across the frill
        for r in (3, 6):
            s.fill(body_only(s, ARC(1, 13, r, -70, 70)), A[1])
        s.put((4, 13), A[0])
    else:
        circuit(s, {"blob": [(5, 19), (9, 19), (9, 23)], "biped": [(4, 15), (8, 15), (8, 19)],
                    "quad": [(5, 11), (9, 11), (9, 8)], "floater": [(5, 18), (9, 18), (9, 22)]}[sp])
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
        m = RR(*q(7, 1), *q(33, 35), round(11 * kx)) | e(20, 25, 14.6, 11)
    elif sp == "quad":
        m = RR(0, round(5 * ky), w - 1, h - 1, round(14 * kx)) | e(28.5, 14, 11, 12)
    else:
        m = e(20, 17, 16.4, 13.6) | e(20, 25, 10.5, 8.5) | e(20, 30.8, 5.4, 5.4)
    m &= R(0, 0, w - 1, h - 1)
    s.blob(m, P)
    inner = erode(m)
    belly = {"blob": (26, 25, 9, 8.5), "biped": (25, 23, 8, 9), "quad": (25, 30, 12, 5.2), "floater": (25, 19, 7, 7.5)}[sp]
    s.over(e(*belly) & inner, S)
    big = size != "s"
    if sp == "blob":                # a nucleus of light floating inside the body
        cx, cy = q(13, 24)
        if big:
            orb = E(cx, cy, 2.6 * kx + 0.6, 2.6 * kx + 0.6) & erode(m, 2)
            s.fill(orb, A[1])
            s.fill(erode(orb), A[0])
            s.put((cx - 1, cy - 1), W)
            circuit(s, [(cx + round(4 * kx), cy), q(20, 24), q(20, 30)])
        else:
            s.led(cx, cy, A)
    elif sp == "biped" and big:     # a segmented belly, like a lizard's
        for y in range(q(0, 17)[1], q(0, 33)[1], 3):
            s.fill({p for p in e(*belly) & inner if p[1] == y and s.px.get(p) != S[2]}, S[2])
        circuit(s, [q(9, 14), q(9, 22), q(13, 22)])
    elif sp == "quad" and big:      # glowing stripes down the back
        for x in (6, 12, 18):
            a, b = q(x, 7), q(x - 3, 15)
            s.fill(body_only(s, PATH([a, b], 2)), A[1])
            s.fill(body_only(s, LN(*a, a[0] - 1, a[1] + 2)), A[0])
    elif sp == "floater":           # the tail trails off into loose pixels
        fade = q(0, 29)[1]
        for p in [p for p in m if p[1] >= fade]:
            if (p[0] + p[1]) % 2 == 0 or p[1] >= h - 2:
                s.erase({p})
            elif p in s.px:
                s.put(p, A[1] if p[1] > fade + 1 else P[2])
        if big:
            circuit(s, [q(9, 13), q(9, 20), q(14, 20)])
    core = q(33, 13) if sp != "floater" else q(31, 10)
    if core in inner:               # the chest core: the creature's own inner light
        s.led(*core, A)
    if br == "echo":                # sound ripples across the flank
        for r, c in ((5, A[0]), (9, A[1]), (13, A[1])):
            s.fill(body_only(s, ARC(3, 21, r, -48, 48)), c)
    elif br == "sage":              # a pale ruff at the throat, and lines of glowing script
        s.over(PG([(17, 8), (37, 8), (38, 12), (18, 12)]) & inner, S)
        s.led(31, 10, A)
        for y, n in ((17, 7), (20, 5), (23, 8)):
            s.fill(body_only(s, R(5, y, 5 + n, y)), A[1])
    elif br == "keeper":            # a plated back, and crystals growing out of the hide
        s.over(RR(3, 8, 15, 19, 3) & inner, PLATE)
        s.fill(body_only(s, R(4, 13, 14, 13) | R(9, 9, 9, 18)), P[3])
        for x, y in ((8, 25), (14, 30), (5, 30)):
            if (x, y) in erode(m, 2):
                gem(s, x, y)
    return s


# ---------- limbs ----------
def leg(sp, size, frame):
    w, h = LEG[size]
    s = new(w, h)
    up = 1 if frame == "b" else 0       # mid-step: the foot is lifted a pixel
    bottom = h - 1 - up
    if sp == "biped":                   # a thick shin and a broad clawed foot
        foot = bottom - (3 if size == "l" else 2)
        s.blob(R(1, 0, w - 3, bottom) | RR(1, max(0, foot), w - 1, bottom, 1), P, t=1, hi=set())
        s.put((w - 1, bottom), S[0])
        s.put((w - 3, bottom), S[0])
    else:                               # a paw with claws and a glowing band at the ankle
        s.blob(RR(0 if size == "l" else 1, 0, w - 1 if size == "l" else w - 2, bottom, 2), P, t=1, hi=set())
        s.put((w - 2, bottom), S[0])
        s.put((w - 4, bottom), S[0])
        if size != "s":
            s.fill(body_only(s, R(0, bottom - 3, w - 1, bottom - 3)), A[1])
    return s


def arm(size):
    w, h = ARM[size]
    s = new(w, h)
    s.blob(RR(1, 0, w - 2, h - 1, 2), P, t=1, hi=set())
    s.put((2, h - 1), S[0])
    s.put((w - 3, h - 1), S[0])
    if size != "s":
        s.fill(body_only(s, R(0, 3, w - 1, 3)), A[1])
    return s


def wing(size, frame):
    """A wing of light: bright ribs, and a see-through web between them."""
    w, h = WING[size]
    s = new(w, h)
    root = (w - 1, h - 1)
    if frame == "a":
        m = PG([root, (w - 3, h - 1 - h // 3), (w // 2, 0), (0, h // 3), (w // 3, h // 2), (1, h - 2), (w // 2, h - 3)])
        ribs = [(w // 2, 0), (0, h // 3), (1, h - 2)]
    else:
        m = PG([root, (w - 3, h // 2), (w // 3, h // 3), (0, h // 2 + 1), (w // 3, h - 3), (2, h - 1), (w // 2, h - 2)])
        ribs = [(w // 3, h // 3), (0, h // 2 + 1), (2, h - 1)]
    s.holo(m, A)
    for tip in ribs:
        s.fill(LN(*root, *tip) & m, A[0])
        s.put(tip, W)
    s.fill(R(w - 2, h - 2, w - 1, h - 1), P[2])
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
    elif i == "long":       # a long ear with a lit tip
        s.blob(RR(3, 0, 8, 13, 3), P, t=1)
        s.over(R(5, 5, 6, 11), S)
        s.fill({(5, 2), (6, 2), (5, 3)}, A[1])
        s.put((5, 2), A[0])
    elif i == "floppy":     # a folded ear with a glowing stripe
        s.blob(E(6.5, 5, 4.7, 4.2) | E(2.8, 8.5, 2.9, 4.3) | R(5, 8, 9, 13), P)
        s.fill(body_only(s, LN(4, 4, 9, 4)), A[1])
        s.put((9, 4), A[0])
    elif i == "fin":        # a fin of light
        s.holo(PG([(3, 11), (1, 1), (11, 9), (9, 11)]), A)
        s.put((1, 1), W)
        s.blob(R(3, 11, 9, 13), P, t=1, hi=set())
    elif i == "leaf":
        s.blob(PG([(6, 13), (1, 7), (5, 0), (6, 0), (11, 7)]), S4, t=1)
        s.fill(LN(6, 3, 6, 11), S[2])
    else:                   # tuft
        m = PG([(1, 13), (3, 4), (5, 13)]) | PG([(4, 13), (6, 0), (8, 13)]) | PG([(7, 13), (9, 4), (11, 13)])
        s.blob(m, P, t=1, hi={(6, 3), (6, 4), (5, 5), (3, 7)})
    return s


def tail(i):
    s = new(16, 16)
    if i == "nub":
        s.blob(E(11.5, 8, 3.7, 3.5), P, t=1)
    elif i == "curl":
        ring = E(7, 8, 6.4, 6.4) - E(7, 8, 3.2, 3.2)
        cut = PG([(7, 8), (15, 11), (15, 16), (9, 16)])
        s.blob((ring - cut) | R(11, 6, 15, 9) | E(8.5, 9.5, 1.8, 1.8), P, t=1, hi={(4, 4), (5, 3), (6, 3)})
        s.put((9, 10), A[0])
    elif i == "fluff":
        m = E(5, 6, 4.2, 4.2) | E(10, 5.5, 4.4, 4.2) | E(6, 11, 4.4, 4) | E(11, 10, 4.2, 4.2) | R(12, 7, 15, 9)
        s.blob(m, S4)
    elif i == "spike":      # a tail that ends in a hot point
        m = PG([(15, 4), (15, 12), (8, 9), (1, 4), (8, 5)])
        s.blob(m, P, t=1, hi=set())
        s.over({p for p in m if p[0] < 6}, A)
        s.put((1, 4), W)
    elif i == "fish":       # a tail fin of light
        s.holo(PG([(10, 8), (1, 1), (4, 8), (1, 15)]), A)
        s.blob(PG([(15, 6), (15, 10), (9, 8)]), P, t=1, hi=set())
    elif i == "leaf":
        s.blob(PG([(15, 8), (9, 2), (1, 7), (8, 13)]), S4, t=1)
        s.fill(LN(13, 8, 4, 7), S[2])
    else:                   # bolt: a jagged streak of pure light, shedding pixels
        m = PG([(15, 7), (15, 9), (10, 10), (11, 13), (2, 9), (7, 8), (5, 4), (12, 7)])
        s.fill(m, A[0])
        s.fill(rim(m), A[1])
        s.fill({(7, 7), (8, 8), (9, 8)}, W)
        s.fill({(1, 12), (0, 6)}, A[1])
        s.fill(R(13, 6, 15, 10), P[2])
        s.fill(R(13, 6, 15, 6), P[0])
    return s


def horn(i):
    s = new(12, 12)
    if i == "nub":
        s.blob(PG([(3, 11), (5, 5), (6, 5), (8, 11)]), S4, t=1, hi={(5, 7)})
    elif i == "pair":
        s.blob(PG([(0, 11), (1, 3), (2, 3), (4, 11)]), S4, t=1, hi={(2, 6)})
        s.blob(PG([(7, 11), (9, 3), (10, 3), (11, 11)]), S4, t=1, hi={(9, 6)})
    elif i == "antenna":    # a feeler with a lure of light, like a deep-sea fish
        s.fill(PATH([(6, 11), (6, 8), (7, 6), (7, 5)]), P[2])
        s.put((6, 11), P[3])
        s.fill(E(7, 3, 2.3, 2.3), A[1])
        s.fill({(7, 3), (6, 3), (7, 2), (6, 2)}, A[0])
        s.put((6, 2), W)
    elif i == "crest":      # a crest of light
        s.holo(PG([(1, 10), (2, 4), (5, 7), (7, 1), (9, 7), (11, 10)]), A)
        s.put((7, 1), W)
        s.blob(R(1, 10, 11, 11), P, t=1, hi=set(), line=False)
    else:                   # gem: a crystal growing from the skull
        s.blob(PG([(3, 11), (4, 8), (8, 8), (9, 11)]), P, t=1, hi=set())
        m = PG([(6, 0), (9, 4), (7, 9), (5, 9), (3, 4)])
        s.fill(m, A[0])
        s.fill({p for p in m if p[0] + p[1] > 11} | rim(m), A[1])
        s.fill({(5, 3), (5, 4), (6, 2)}, W)
    return s


def back(i):
    s = new(16, 16)
    if i == "spikes":       # a row of spines with hot tips
        m = PG([(0, 15), (3, 6), (6, 15)]) | PG([(5, 15), (8, 2), (11, 15)]) | PG([(10, 15), (13, 6), (15, 15)])
        s.blob(m, P, t=1, hi=set())
        s.over({p for p in m if p[1] < 8 and p[0] in (3, 4, 12, 13, 14)} | {p for p in m if p[1] < 5}, A)
        for p in ((3, 6), (8, 2), (13, 6)):
            s.put(p, A[0])
    elif i == "shell":
        m = E(8, 15, 7.5, 10) & R(0, 0, 15, 15)
        s.blob(m, S4)
        s.fill(body_only(s, LN(8, 6, 8, 15) | ARC(8, 15, 4, 180, 360)), S[2])
        s.put((11, 9), A[0])
        s.put((5, 11), A[1])
    elif i == "fin":        # a dorsal fin of light
        s.holo(PG([(2, 13), (5, 1), (14, 13)]), A)
        s.put((5, 1), W)
        s.blob(R(2, 13, 14, 15), P, t=1, hi=set())
    elif i == "sprout":     # a seedling rooted in the back
        s.fill(LN(8, 15, 8, 7), S[2])
        s.blob(E(4.5, 6, 3.7, 2.7), S4, t=1)
        s.blob(E(11.5, 4.5, 3.7, 2.7), S4, t=1)
        s.put((8, 6), A[0])
    else:                   # flame: cold digital fire, breaking into squares as it rises
        m = PG([(4, 15), (3, 8), (6, 10), (8, 2), (11, 8), (13, 6), (12, 15)])
        s.fill(m, A[0])
        s.fill(rim(m), A[1])
        s.fill(PG([(6, 15), (8, 8), (10, 15)]), S[0])
        s.put((8, 12), W)
        s.fill({(8, 0), (12, 3), (2, 5), (3, 5)}, A[1])
    return s


# ---------- faces: eyes that glow, with slit pupils; a mouth with a fang ----------
EYE_OPEN = {
    "dot": ["......", "......", "......", "..KK..", "..WA..", "..AA..", "......", "......"],
    "round": ["......", "......", ".KKKK.", ".AWNA.", ".AANA.", "..AA..", "......", "......"],
    "oval": ["......", ".KKK..", ".AWNK.", ".AANA.", ".AANA.", ".AANA.", "..AA..", "......"],
    "sleepy": ["......", "......", "......", "KKKKKK", ".AWNA.", "..AA..", "......", "......"],
    "star": ["......", "..A...", ".aAa..", "AAWAA.", ".aAa..", "..A...", "......", "......"],
    "wide": ["......", "KKKK..", "AWANKK", "AWANAA", "AAANAA", ".AAAA.", "......", "......"],
}
EYE_SMALL = {"dot", "star"}


def eye_rows(style, expr):
    small, wide = style in EYE_SMALL, style == "wide"
    blank = ["......"] * 8
    if expr == "open":
        return EYE_OPEN[style]
    if expr == "blink":     # shut: just a dim slit of light under the lid
        return [*blank[:3], "..KK.." if small else "KKKKKK" if wide else ".KKKK.", "..aa.." if small else "aaaaaa" if wide else ".aaaa.", *blank[5:]]
    if expr == "happy":
        if small:
            return [*blank[:3], "..AA..", ".A..A.", *blank[5:]]
        return [*blank[:2], ".AAAA." if wide else "..AA..", "AA..AA" if wide else ".A..A.", "A....A", *blank[5:]]
    if expr == "sleepy":
        if small:
            return [*blank[:4], ".a..a.", "..aa..", *blank[6:]]
        return [*blank[:4], "a....a", "aaaaaa" if wide else ".aaaa.", *blank[6:]]
    # sad: the open eye with its outer top corner sliced away by a drooping lid
    if small:
        return ["......", "......", "....K.", "..KK..", "..WA..", "..AA..", "......", "......"]
    rows = [list(r) for r in EYE_OPEN[style]]
    first = next(j for j, r in enumerate(rows) if any(ch != "." for ch in r))
    for j, cut in ((first, 4), (first + 1, 2)):
        for x in range(cut):
            rows[j][x] = "K" if j == first + 1 and rows[j][x] != "." else "."
    return ["".join(r) for r in rows]


def eyes(style, expr):
    s = new(16, 8)
    rows = eye_rows(style, expr)
    key = {"A": A[0], "a": A[1], "W": W, "K": LINE, "N": LINE}
    for ox, mirrored in ((1, False), (9, expr == "sad")):
        for j, row in enumerate(rows):
            line = row[::-1] if mirrored else row
            for i, ch in enumerate(line):
                if ch != ".":
                    s.put((ox + i, j), key[ch])
    return s


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
    elif i == "stripes":
        m = {(x, y) for x in range(16) for y in range(16) if (x + y) % 8 < 2}
    elif i == "patch":
        m = E(7, 8, 5.4, 4.8) | E(11, 11.5, 3.2, 3)
    elif i == "speckle":    # small plus signs rather than loose dots
        m = set()
        for x, y in ((3, 3), (11, 6), (6, 12), (14, 14)):
            m |= {(x, y), (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)}
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
