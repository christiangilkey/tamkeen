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
    # the ridge catches the light near the top of the shard and fades into the facets lower down
    ridge(i, [a, (ax + (bx - ax) * 0.45, ay + (by - ay) * 0.45)], edge)
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

# ---- Treasure golem v2 (pick 154): sturdy cut-amber chunk, pink crystal on top, dark rock fists
# and feet, face on the front-right plane ----
OUT = sys.argv[1] if len(sys.argv) > 1 else "treasure_golem2.txt"

# behind: far fist (right, mostly hidden) and far foot (right, higher, smaller)
chunk([(47, 31), (52, 32), (55, 38), (52, 42), (48, 41)])
chunk([(36, 50), (43, 49.5), (45, 54), (42, 56.5), (36, 56.5)])

# amber body: a squat cut gem with flat planes
body, bi = solid([(8, 31), (15, 18), (41, 15), (50, 23), (51, 44), (40, 54), (18, 54), (9, 46)], "2")
plane(bi, [(8, 31), (15, 18), (41, 15), (50, 23), (44, 26), (21, 29)], "1")       # top plane, lit
plane(bi, [(8, 31), (21, 29), (23, 40), (21, 51), (9, 46)], "2")                  # near flank
plane(bi, [(21, 29), (44, 26), (46, 46), (36, 50), (21, 51), (23, 40)], "2")      # face plane
plane(bi, [(44, 26), (50, 23), (51, 44), (46, 46)], "3")                          # far side
plane(bi, [(9, 46), (21, 51), (36, 50), (46, 46), (51, 44), (40, 54), (18, 54)], "3")  # underside
ridge(bi, [(9, 30), (21, 28), (44, 25)], "W")      # front edge of the top catches the light
ridge(bi, [(44, 25), (49.5, 23)], "1")
ridge(bi, [(21, 29), (23, 40), (21, 51)], "3")     # flank / face edge (face turns slightly away)
ridge(bi, [(22, 30), (24, 40), (22, 50)], "1")     # ... with a lit bevel on the face side
ridge(bi, [(44, 26), (46, 46)], "4")               # face / far side
ridge(bi, [(9, 46), (21, 51), (36, 50), (46, 46)], "4")  # base edge
rim(bi, "1", "3", base="2")
for x, y in ((16, 21), (17, 20), (17, 21), (22, 19)):
    cv.set(x, y, "W")   # sparkle on the cut top
# pink gems set into the amber
stamp(cv, 12, 38, """
.4.
4a4
4r4
.4.
""")
stamp(cv, 47, 30, "a\nr")

# pink crystal cluster growing from the top, leaning back
shard([(27, 18), (29, 8), (33, 2), (37, 8), (37, 18)], (33, 2.5), (33, 18), "a", "r", "W")
shard([(36, 18), (39, 10), (43, 7), (44, 13), (43, 19)], (43, 7.5), (41, 19), "a", "r", "W")
shard([(23, 19), (23, 13), (26, 10), (29, 15), (28, 19)], (26, 10.5), (27, 19), "a", "r", "W")

# face on the front-right plane: near eye bigger on the left, far eye narrow near the right edge
eyes((26, 34), (40, 35), far="""
44
KK
WK
KK
""")
stamp(cv, 31, 41, """
444444
4WWWW4
.4rr4.
..44..
""")
stamp(cv, 25, 40, "aa")
stamp(cv, 42, 40, "a")

# near fist (left, lower, bigger) and near foot (left, lower)
chunk([(1, 36), (10, 35), (12.5, 41), (9.5, 47), (2, 46), (0, 41)])
chunk([(14, 52), (26, 52), (28.5, 57), (25.5, 60), (14, 60), (12, 56.5)])
outline_outer(cv, "4")
save(cv, OUT)
