"""Faceted-stone kit (inlined in each stone build): bodies are angular polygons cut into flat planes
(lit top, mid front, dark far side), with crisp 1px highlights where planes meet. Light: top left.
Three-quarter view facing right."""
import sys
from draw2 import Canvas, poly, paint_form, outline_outer, stamp, save, line

cv = Canvas(56, 64)
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def inside(mask):
    return {p for p in mask if cv.get(*p) != "4"}


def solid(pts, colour="2"):
    """Angular silhouette: outline on its edge, flat colour inside. Returns (mask, inner)."""
    m = poly(pts)
    for x, y in m:
        cv.set(x, y, "4" if any((x + dx, y + dy) not in m for dx, dy in N4) else colour)
    return m, inside(m)


def plane(inner, pts, colour):
    """A flat plane: fill polygon inside the form."""
    for p in poly(pts) & inner:
        cv.set(*p, colour)


def ridge(inner, pts, colour):
    """A crisp 1px edge where two planes meet."""
    line(cv, pts, colour, inner, smooth=False)


def rim(inner, lit, dark, base=None):
    """Bright rim where the form's edge faces up/left, dark rim where it faces down/right."""
    for x, y in inner:
        if base and cv.get(x, y) != base:
            continue
        if (x - 1, y) not in inner and (x, y - 1) not in inner:
            cv.set(x, y, lit)
        elif (x + 1, y) not in inner and (x, y + 1) not in inner:
            cv.set(x, y, dark)


def shard(pts, a, b, lit="1", dark="3", edge="W"):
    """A crystal shard cut along the ridge a->b: lit facet on the left of the ridge, dark facet on
    the right, a bright ridge line, outline."""
    m, i = solid(pts, lit)
    (ax, ay), (bx, by) = a, b
    for x, y in i:
        if (bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0:  # right of the ridge (screen coords)
            cv.set(x, y, dark)
    ridge(i, [a, b], edge)
    return m, i


def chunk(pts, ramp=("c", "y", "o", "o"), R=2):
    """A small rough rock (fists, feet): lightly shaded angular lump."""
    m = poly(pts)
    paint_form(cv, m, list(ramp), [0.8, 0.45, 0.2], R=R, outline="4", tilt=0.2, sel=ramp[2])
    return m


def eyes(near_xy, far_xy, near=None, far=None):
    stamp(cv, *near_xy, near or """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
    stamp(cv, *far_xy, far or """
44
KK
WK
KK
""")

# ---- Mossy pebble v2 (pick 40): angular boulder, moss cap, face on the front-right plane ----
OUT = sys.argv[1] if len(sys.argv) > 1 else "pebble2.txt"

# behind the body: far hand (right, mostly hidden) and far foot (right, higher, smaller)
chunk([(46, 37), (52, 38), (54, 43), (51, 46), (47, 45)], ("2", "3", "3", "3"))
chunk([(37, 50), (43, 49.5), (45, 54), (42, 56.5), (37, 56.5)], ("2", "3", "3", "3"))

# boulder: straight-edged silhouette, cut into planes
body, bi = solid([(9, 34), (14, 24), (26, 18), (40, 19), (48, 25), (51, 36), (48, 48), (38, 55), (21, 55), (11, 49)], "2")
plane(bi, [(9, 34), (14, 24), (26, 18), (40, 19), (48, 25), (44, 29), (26, 30)], "1")       # top plane
plane(bi, [(9, 34), (26, 30), (25, 41), (28, 50), (21, 55), (11, 49)], "2")                  # near flank
plane(bi, [(10, 35), (25, 31), (24, 37), (12, 41)], "1")                                       # light catching the flank top
plane(bi, [(26, 30), (44, 29), (46.5, 31), (47, 46), (44, 48.5), (28, 50), (25, 41)], "y")   # face plane
plane(bi, [(26.5, 30.5), (44, 29.5), (43, 33), (27, 35)], "c")                               # face top, lit
plane(bi, [(44, 29), (48, 25), (51, 36), (48, 48), (44, 48.5), (47, 46), (46.5, 31)], "3")   # far side sliver
plane(bi, [(28, 50), (44, 48.5), (48, 48), (38, 55), (21, 55)], "3")                         # underside
plane(bi, [(28, 50), (44, 48.5), (47, 46), (46, 47.5), (29, 51.5)], "o")                     # face bottom bevel
ridge(bi, [(26, 30), (25, 41), (28, 50)], "c")      # flank / face edge catches the light
ridge(bi, [(46.5, 31), (47, 46)], "4")               # face / far side
ridge(bi, [(11, 49), (21, 55)], "3")
ridge(bi, [(12, 41), (17, 44), (21, 49)], "3")       # a chip in the flank
rim(bi, "1", "3", base="2")

# moss cap: angular, draped over the top plane, ragged front edge
moss = poly([(8.5, 33), (12, 25), (21, 18.5), (33, 15.5), (44, 17.5), (50.5, 25), (50, 30.5), (47.5, 29),
             (45, 31.5), (42, 29), (38, 31.5), (34, 29), (30, 31.5), (27, 28.5), (23, 32), (19, 29),
             (15, 33), (12, 31)])
paint_form(cv, moss, ["a", "a", "r", "r"], [0.92, 0.5, 0.25], R=3, outline="4", tilt=0.35, sel="r")
mi = inside(moss)
for pts in (([15, 27], [18, 25]), ([23, 26], [26, 24]), ([32, 25], [35, 23]), ([40, 25], [43, 23]),
            ([28, 21], [30, 20]), ([37, 20], [39, 19]), ([20, 22], [22, 21]), ([45, 26], [47, 25])):
    ridge(mi, pts, "r")
for x, y in ((17, 24), (25, 22), (33, 20), (21, 20), (29, 18), (39, 18)):
    cv.set(x, y, "c")

# near hand (left, lower, bigger) and near foot (left, lower)
h = chunk([(3, 40), (10, 38.5), (13, 45), (9, 50), (3, 48.5), (1.5, 44)], ("1", "2", "3", "3"))
f = chunk([(16, 52), (27, 52.5), (30, 57), (27, 60), (16, 60), (13.5, 56.5)], ("1", "2", "3", "3"))

# face: near eye larger on the left, far eye narrow near the right edge, small smile
eyes((29, 34), (42, 35), far="""
44
KK
WK
oK
""", near="""
44444
.KKK4
.KWKK
.oKKo
""")
stamp(cv, 35, 42, """
4..4
.44.
""")
stamp(cv, 28, 40, "oo")
outline_outer(cv, "4")
save(cv, OUT)
