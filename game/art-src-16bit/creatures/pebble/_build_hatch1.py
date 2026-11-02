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

# ---- Moss boulder HATCHLING (baby of pebble _ff1): ~2/3 the height, big head (about 45% of the
# height) poking forward under a stony brow with bigger glowing amber eyes, a small domed shell with a
# moss cap and one sprout, stubby knuckled fist and stubby legs. Same palette and rendering. ----
OUT = sys.argv[1] if len(sys.argv) > 1 else "pebble_hatch1.txt"
STONE = ("h", "1", "2", "3", "d")
STONE_CUTS = (0.96, 0.8, 0.56, 0.3)
DARK = ("1", "2", "3", "d", "d")
MOSS = ("a", "r", "m")

# far front foot (right, behind the head)
ff = form(shape([(45, 54), (52, 53.5), (54.5, 58), (53, 63.5), (45, 63.5)]), DARK, STONE_CUTS, R=2, tilt=0.3)
ridge(ff, [(49, 57), (49, 60)], "d")
# near hind leg (left)
hl = form(shape([(13, 54), (22, 54), (24, 59), (22.5, 63.5), (13, 63.5), (11, 59)]), STONE, STONE_CUTS, R=2.5, tilt=0.35)
ridge(hl, [(15, 59), (15, 62)], "d")
ridge(hl, [(19, 59), (19, 62)], "d")
rimlight(hl, "2", ("d",))

# shell: a small domed boulder
body = shape([(11, 48), (13, 39), (19, 32), (28, 29), (37, 30), (43, 34), (46, 42), (44, 52), (36, 57),
              (22, 58), (13, 55)])
bi = form(body, STONE, STONE_CUTS, R=8, tilt=0.35)
crack(bi, [(17, 43), (19, 47), (18, 51)], "d", "1")
crack(bi, [(19, 47), (23, 48)], "d", "1")
ridge(bi, [(14, 53), (22, 55), (32, 55)], "3")
pits(bi, [(25, 44), (34, 49)], "d", "1")
st = shape([(29 + 2 * math.cos(a), 46 + 1.6 * math.sin(a)) for a in [i * math.pi / 4 for i in range(8)]])
form(st & bi, ("c", "y", "o", "o"), (0.8, 0.45, 0.2), R=1.4, outline="d", tilt=0.2)
rimlight(bi, "2", ("d",), body)

# near front leg: short arm and a fist with two knuckles
arm = shape([(30, 46), (37, 45.5), (39, 52), (31, 54)])
form(arm, STONE, STONE_CUTS, R=3, tilt=0.3, outline="d")
fist = shape([(28, 53.5), (39, 53), (42, 57), (40.5, 63.5), (28, 63.5), (26.5, 59)])
fi = form(fist, DARK, STONE_CUTS, R=2.5, tilt=0.3)
for kx in (32, 36):
    ridge(fi, [(kx, 54), (kx, 57)], "d")
    ridge(fi, [(kx + 1, 54), (kx + 2, 54)], "h")
cv.set(29, 54, "h")
ridge(fi, [(29, 61), (40, 61)], "3")
rimlight(fi, "2", ("d", "3"), fist)

# head: big for a baby, poking forward; stony brow over a crevice with bigger glowing eyes
head = shape([(35, 36), (43, 32), (51, 33), (56, 38), (57.5, 45), (55, 51), (48, 54.5), (39.5, 54),
              (35, 47)])
hd = form(head, DARK, STONE_CUTS, R=5, tilt=0.35)
plane(hd, [(36, 37), (43, 33), (51, 34), (55.5, 38.5), (48, 40.5), (38, 40)], "1")
plane(hd, [(37, 37), (43, 33.8), (47, 35), (41, 37)], "h")
ridge(hd, [(37, 40), (47, 41), (56, 39.5)], "h")
plane(hd, [(37, 41), (47, 42), (56.5, 40.5), (56.5, 45.5), (38, 45.5)], "K")
stamp(cv, 39, 41, """
dggg..
gWWgg.
.gggd.
""")
stamp(cv, 51, 41, """
.gg
gWg
.gd
""")
plane(hd, [(38, 46.5), (56.5, 46), (55, 50.5), (48, 53.5), (40, 53)], "2")
ridge(hd, [(38, 46), (56, 45.5)], "1")
crack(hd, [(42, 49.5), (48, 50), (53, 48.5)], "d", "1")
ridge(hd, [(57, 41), (56.5, 47)], "3")
rimlight(hd, "2", ("d",), head)
# a tuft of moss on the crown
tuft = clump(44, 33.5, 2.2, ("a", "a", "r"), "m")
strand(41, 35, 3, ("r", "m"))

# moss cap on the shell, ragged edge, a sprout
moss = shape([(11.5, 46), (13, 38), (19, 31.5), (28, 28), (37, 29), (43, 33), (45, 38), (42, 37), (39, 39.5),
              (36, 37), (33, 39.5), (30, 36.5), (26, 39), (22, 36.5), (18, 39.5), (15, 37.5), (13, 42)])
mi = form(moss, MOSS, (0.75, 0.4), R=3, tilt=0.35, outline="4")
for cx, cy, r in ((17, 35, 2.6), (24, 31, 3.0), (32, 30, 2.8), (39, 32.5, 2.4), (21, 36, 2.0), (29, 34.5, 2.2),
                  (36, 35, 2.0)):
    c = clump(cx, cy, r, ("a", "a", "r"), None) & mi
    for x, y in c:
        if (x, y + 1) not in c and (x, y + 1) in mi:
            cv.set(x, y + 1, "m")
for x, y, n in ((13, 41, 3), (17, 39, 4), (24, 38, 3), (31, 39, 4), (37, 38, 3), (41, 38, 3)):
    strand(x, y, n, ("r", "r", "m"))
stamp(cv, 26, 25, """
a.a
rar
.r.
""")
outline_outer(cv, "4")
save(cv, OUT)
