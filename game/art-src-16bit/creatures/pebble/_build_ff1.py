"""FF-style detail kit for the stone creatures (inlined in each build). 64x64, three-quarter view
facing right, light from the top left. Base forms from draw2 shapes, then detail passes: cracks with
lit lower walls, strata, pits, moss clumps and hanging strands, rim light on the shadow side,
crystal prisms, flat-cut planes."""
import math
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

cv = Canvas(64, 64)
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
LX, LY = -0.6, -0.8


def inside(mask):
    return {p for p in mask if cv.get(*p) not in ("4",)}


def form(mask, ramp, cuts, R=6, outline="4", tilt=0.25, sel=None):
    paint_form(cv, mask, list(ramp), list(cuts), R=R, outline=outline, tilt=tilt, sel=sel)
    return inside(mask)


def solid(pts, colour, outline="4"):
    m = poly(pts)
    for x, y in m:
        cv.set(x, y, outline if any((x + dx, y + dy) not in m for dx, dy in N4) else colour)
    return m, inside(m)


def plane(inner, pts, colour):
    for p in poly(pts) & inner:
        cv.set(*p, colour)


def ridge(inner, pts, colour, smooth=False):
    line(cv, pts, colour, inner, smooth=smooth)


def crack(inner, pts, dark, lit=None, glow=None, smooth=False):
    """A crack: a dark groove line; its lower-right wall catches the light (lit pixel below/right);
    with glow, the groove itself glows (light from inside)."""
    before = {p: cv.get(*p) for p in inner}
    line(cv, pts, glow or dark, inner, smooth=smooth)
    groove = {p for p in inner if cv.get(*p) != before[p]}
    if glow:
        for x, y in groove:   # dark lips either side of a glowing groove
            for q in ((x - 1, y), (x, y - 1)):
                if q in inner and q not in groove:
                    cv.set(*q, dark)
    if lit:
        for x, y in groove:
            for q in ((x + 1, y + 1), (x, y + 1)):
                if q in inner and q not in groove and cv.get(*q) != dark:
                    cv.set(*q, lit)
                    break


def pits(inner, pts, dark, lit):
    for x, y in pts:
        if (x, y) in inner:
            cv.set(x, y, dark)
        if (x + 1, y + 1) in inner:
            cv.set(x + 1, y + 1, lit)


def rimlight(inner, colour, shadow, mask=None):
    """Reflected light along the lower-right edge of a form, only over its shadow tones."""
    m = mask or inner
    for x, y in list(inner):
        if cv.get(x, y) in shadow and ((x + 1, y) not in m or (x, y + 1) not in m or
                                        cv.get(x + 1, y) == "4" or cv.get(x, y + 1) == "4"):
            cv.set(x, y, colour)


def clump(cx, cy, r, ramp, edge):
    """A small shaded clump (moss, lichen): light top left, edge colour around it."""
    m = shape([(cx + r * math.cos(a) * (1 + 0.12 * math.sin(3 * a)), cy + r * 0.85 * math.sin(a))
               for a in [i * math.pi / 5 for i in range(10)]])
    paint_form(cv, m, list(ramp), [0.85, 0.5, 0.22][:len(ramp) - 1], R=max(1.5, r * 0.7), outline=edge, tilt=0.2)
    return m


def strand(x, y, n, colours):
    """A hanging strand of moss: colours from root to tip, 1px wide, slight sway."""
    for i in range(n):
        cv.set(x + (1 if i in (n // 2, n // 2 + 1) and n > 4 else 0), y + i, colours[min(i * len(colours) // n, len(colours) - 1)])


def prism(base, tip, w, lit="1", mid="2", dark="3", glint="W", shoulder=0.72, edge="4"):
    """Elongated hexagonal crystal: three long facets (lit/mid/dark by orientation) to a sharp tip."""
    (bx, by), (tx, ty) = base, tip
    L = math.hypot(tx - bx, ty - by)
    dx, dy = (tx - bx) / L, (ty - by) / L
    nx, ny = -dy, dx
    sx, sy = bx + dx * L * shoulder, by + dy * L * shoulder
    m = poly([(bx + nx * w, by + ny * w), (sx + nx * w, sy + ny * w), (tx, ty),
              (sx - nx * w, sy - ny * w), (bx - nx * w, by - ny * w)])
    strips = []
    for k in range(3):
        s0, s1 = -w + k * 2 * w / 3, -w + (k + 1) * 2 * w / 3
        sm = (s0 + s1) / 2
        strips.append((nx * sm * LX + ny * sm * LY, s0, s1))
    order = sorted(strips)
    col = {order[2][1]: lit, order[1][1]: mid, order[0][1]: dark}
    for x, y in m:
        px, py = x + 0.5 - bx, y + 0.5 - by
        t = (px * dx + py * dy) / L
        sc = 1.0 if t <= shoulder else max(0.05, (1 - t) / (1 - shoulder))
        a = (px * nx + py * ny) / sc
        c = col[strips[0][1]] if a < strips[0][2] else (col[strips[1][1]] if a < strips[1][2] else col[strips[2][1]])
        cv.set(x, y, c)
    for x, y in m:
        if any((x + ex, y + ey) not in m for ex, ey in N4):
            cv.set(x, y, edge)
    ls = [s for s in strips if col[s[1]] == lit][0]
    for f in (0.55, 0.62):
        gx = bx + dx * L * f + nx * (ls[1] + ls[2]) / 2 * 0.7
        gy = by + dy * L * f + ny * (ls[1] + ls[2]) / 2 * 0.7
        if cv.get(int(gx), int(gy)) == lit:
            cv.set(int(gx), int(gy), glint)
    return m

# ---- Mossy pebble, FF style (pick 40): a hunched boulder beast. Weathered, cracked stone body;
# heavy head low at the front-right with a stony brow over glowing amber eyes; thick knuckled arms
# planted in front; thick moss cap with clumps, hanging strands and sprouts; small stones set in
# the flank. ----
OUT = sys.argv[1] if len(sys.argv) > 1 else "pebble_ff1.txt"
STONE = ("h", "1", "2", "3", "d")
STONE_CUTS = (0.96, 0.8, 0.56, 0.3)
MOSS = ("a", "r", "m")

# far arm (right, higher, mostly behind the head)
far_arm = shape([(49, 40), (55, 41), (57, 49), (58, 56), (52, 57), (49, 50)])
fa = form(far_arm, ("1", "2", "3", "d", "d"), STONE_CUTS, R=3, tilt=0.4)
far_fist = shape([(49, 53), (56, 52.5), (59, 56), (57, 59), (50, 59)])
ff = form(far_fist, ("1", "2", "3", "d", "d"), STONE_CUTS, R=2, tilt=0.3)
ridge(ff, [(53, 53), (53, 56)], "d")
ridge(ff, [(56, 54), (56, 56)], "d")

# near hind leg (left, low)
hind = shape([(8, 46), (17, 46), (19, 54), (18, 59), (8, 59), (6, 53)])
hi_ = form(hind, STONE, STONE_CUTS, R=3, tilt=0.35)
ridge(hi_, [(10, 54), (10, 57)], "d")
ridge(hi_, [(14, 54), (14, 57)], "d")
rimlight(hi_, "2", ("d",), hind)

# boulder body: hunched, highest at the back, sloping down to the head
body = shape([(6, 40), (8, 27), (15, 16), (27, 10), (39, 11), (48, 17), (54, 25), (55, 37), (49, 47),
              (36, 53), (20, 53), (9, 49)])
bi = form(body, STONE, STONE_CUTS, R=10, tilt=0.35)
# weathering: a main crack with a branch (groove + lit lower wall), strata low down, a few pits
crack(bi, [(17, 26), (20, 31), (18, 36), (21, 42)], "d", "1")
crack(bi, [(20, 31), (25, 33)], "d", "1")
crack(bi, [(42, 31), (44, 37)], "d", "1")
for y0 in (46, 49):
    ridge(bi, [(10, y0), (18, y0 + 1), (27, y0 + 1), (36, y0)], "3")
pits(bi, [(13, 30), (29, 24), (46, 40), (15, 41)], "d", "1")
# small stones set in the flank
for cx, cy, r in ((11.5, 34, 2.6), (27, 40.5, 2.2), (34.5, 35, 1.8)):
    st = shape([(cx + r * math.cos(a), cy + r * 0.8 * math.sin(a)) for a in [i * math.pi / 4 for i in range(8)]])
    form(st & bi, ("c", "y", "o", "o"), (0.8, 0.45, 0.2), R=1.6, outline="d", tilt=0.2)
rimlight(bi, "2", ("d",), body)

# near arm (front, nearer to us): thick stone limb, then a fist with three knuckles planted ahead
arm = shape([(28, 34), (38, 33), (41, 42), (40, 52), (31, 53), (28, 44)])
ai = form(arm, STONE, STONE_CUTS, R=5, tilt=0.3, outline="d")
crack(ai, [(33, 38), (34, 44)], "d", "1")
fist = shape([(27, 51), (41, 50), (45, 54), (43, 60), (27, 60), (25, 56)])
fi = form(fist, ("1", "2", "3", "d", "d"), STONE_CUTS, R=3, tilt=0.3)
for kx in (31, 36, 41):  # knuckles on the front-top of the fist, separated by grooves
    ridge(fi, [(kx - 3, 52), (kx - 3, 55)], "d")
    ridge(fi, [(kx - 1, 52), (kx + 1, 52)], "h")
    cv.set(kx - 2, 53, "1")
ridge(fi, [(28, 58), (42, 58)], "3")
rimlight(fi, "2", ("d", "3"), fist)

# head: a heavy stone wedge low at the front-right; brow ridge overhangs a dark crevice with the eyes
head = shape([(44, 26), (52, 22.5), (59, 25), (62.5, 31), (61, 39), (56, 44), (48, 44), (44, 37)])
hd = form(head, ("1", "2", "3", "d", "d"), STONE_CUTS, R=6, tilt=0.35)
# heavy brow: lit top, bright front edge dipping in the middle (a scowl)
plane(hd, [(45, 27), (52, 23.5), (59, 26), (62.5, 30), (55, 32.5), (47, 30)], "1")
plane(hd, [(46, 27), (52, 24.5), (56, 26), (50, 28)], "h")
ridge(hd, [(46, 30), (55, 32.5), (62, 30.5)], "h")
# dark crevice under the brow with glowing amber eyes (near eye longer, far eye short at the edge)
plane(hd, [(46, 31), (55, 33.5), (62, 31.5), (61.8, 36), (47, 36)], "K")
stamp(cv, 48, 32, """
dg....
gWWgg.
.gggd.
""")
stamp(cv, 58, 33, """
gWg
.gd
""")
# jaw: blunt stone muzzle, a cracked mouth line and two short pale tusks
plane(hd, [(47, 37), (61.5, 36.5), (60, 40), (55, 43), (48, 43)], "2")
ridge(hd, [(47, 37), (61, 36.5)], "1")
crack(hd, [(49, 40), (55, 40.5), (60, 39)], "d", "1")
for tx in (51, 57):  # tusks
    cv.set(tx, 38, "c")
    cv.set(tx, 39, "y")
ridge(hd, [(61, 32), (61, 39)], "3")                       # far side of the head
crack(hd, [(53, 24), (51, 27)], "d", "h")
rimlight(hd, "2", ("d",), head)

# moss cap: thick, from the back over the hump to just above the brow, ragged hanging edge
moss = shape([(6.5, 33), (9, 24), (16, 15), (27, 9), (39, 10), (47, 15), (53, 22), (55, 27), (52, 26),
              (49, 29), (46, 26), (42, 29), (38, 26), (34, 29), (30, 25.5), (26, 28.5), (22, 24.5),
              (18, 28), (14, 25.5), (11, 31), (8, 34)])
mi = form(moss, MOSS, (0.75, 0.4), R=4, tilt=0.35, outline="4")
# clumps: lit bumps without outlines, a dark crevice under each, so the cap reads as thick moss
for cx, cy, r in ((14, 20, 3.4), (22, 14, 3.8), (31, 11.5, 3.6), (40, 13.5, 3.2), (47, 19.5, 2.8),
                  (18, 25.5, 2.6), (27, 20, 3.2), (36, 19.5, 3.0), (44, 24, 2.4), (11, 27, 2.2)):
    c = clump(cx, cy, r, ("a", "a", "r"), None) & mi
    for x, y in c:
        if (x, y + 1) not in c and (x, y + 1) in mi:
            cv.set(x, y + 1, "m")
for x, y in ((13, 18), (21, 12), (30, 10), (39, 12), (46, 18), (26, 18), (35, 18), (17, 24)):
    cv.set(x, y, "a")
# hanging strands over the flank and the brow
for x, y, n in ((9, 33, 4), (12, 31, 7), (16, 28, 3), (22, 25, 6), (25, 29, 3), (31, 26, 7), (33, 29, 3),
                (38, 27, 5), (42, 29, 3), (45, 27, 6), (50, 29, 4), (53, 27, 3)):
    strand(x, y, n, ("r", "r", "m"))
# sprouts on the crown
stamp(cv, 24, 6, """
a.a
rar
.r.
""")
stamp(cv, 34, 6, """
.a..
rra.
.r..
""")
outline_outer(cv, "4")
save(cv, OUT)
