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

# ---- Rock golem v2 (pick 103): sharp green crystal shards on a dark core, turned 3/4 right ----
OUT = sys.argv[1] if len(sys.argv) > 1 else "rock_golem2.txt"
CORE = ("y", "o", "o", "o")


def core(pts, R=2):
    return chunk(pts, CORE, R)


def metal(pts):
    """A grey metal band painted over a part (no outline of its own)."""
    for p in poly(pts):
        if cv.get(*p) not in (".", "4"):
            cv.set(*p, "c")


# far side (right, higher, partly hidden): far leg, far arm, far shoulder
core([(33, 44), (40, 44), (41, 52), (34, 52)])
shard([(32, 42), (38, 39), (42, 43), (40, 49), (34, 50)], (38, 39.5), (37, 49.5), "2", "3", "1")
core([(33, 52), (41, 51.5), (43, 55), (41, 57), (33, 57)])
metal([(34, 52), (41, 52), (42, 54), (34, 54)])
core([(43, 28), (48, 29), (48, 35), (43, 35)])
shard([(42, 33), (48, 31), (51, 38), (49, 45), (43, 43)], (47, 31.5), (47, 44), "2", "3", "1")
core([(43, 44), (50, 44), (51, 49), (46, 51), (42, 48)])
metal([(44, 44.5), (50, 44.5), (50, 46.5), (44, 46.5)])
shard([(37, 19), (42, 12), (47, 17), (49, 25), (40, 27)], (42, 12.5), (44, 26), "2", "3", "1")  # far shoulder

# torso: dark core, chest plate turned toward the right (lit left facet, dark far facet)
core([(18, 24), (40, 23), (43, 38), (36, 46), (22, 46), (17, 37)], R=4)
shard([(23, 27), (36, 24), (42, 31), (39, 41), (28, 42), (23, 35)], (33, 24.5), (34, 41.5), "1", "2", "W")
shard([(36, 25), (42, 31), (39, 41), (37, 41)], (42, 31), (39, 41), "3", "3", "3")             # far side of the plate
ridge(inside(poly([(23, 27), (36, 24), (42, 31), (39, 41), (28, 42), (23, 35)])), [(24, 35), (28, 37), (33, 36)], "3")

# head: set low and to the right; helmet with a lit top, dark recessed face on the front-right
hm, hi = solid([(28, 14), (36, 10), (43, 13), (46, 19), (43, 25), (31, 25), (28, 20)], "2")
plane(hi, [(28, 14), (36, 10), (43, 13), (38, 16), (30, 17)], "1")         # helmet top
plane(hi, [(43, 13), (46, 19), (43, 25), (42, 18)], "3")                   # far side of the helmet
ridge(hi, [(30, 17), (38, 16), (43, 13)], "W")
plane(hi, [(32, 18.5), (43, 18.5), (44, 22.5), (41.5, 25), (32, 25)], "o")  # face recess
ridge(hi, [(31, 18), (43, 18)], "4")                                        # heavy brow
stamp(cv, 33, 19, """
4444
.aaW
.Kaa
""")
stamp(cv, 41, 19, """
44
aW
Ka
""")
ridge(hi, [(36, 23), (40, 23)], "4")

# near leg (left, lower, bigger)
core([(19, 45), (28, 45), (29, 53), (21, 53)])
shard([(17, 42), (26, 40), (30, 44), (29, 50), (19, 51)], (25, 40.5), (25, 50.5), "1", "2", "W")
core([(16, 53), (30, 53), (33, 57), (31, 60), (15, 60)])
metal([(17, 53), (29, 53), (30, 55), (17, 55)])

# near shoulder (left): the biggest crystal, with a spike rising from it; then the near arm
core([(9, 27), (17, 27), (17, 34), (9, 34)])
shard([(2, 32), (13, 29), (18, 37), (16, 46), (6, 47), (1, 40)], (10, 29.5), (11, 46.5), "1", "2", "W")
fist = core([(3, 46), (14, 46), (15, 52), (11, 55), (3, 53)])
metal([(4, 46.5), (13, 46.5), (13, 48.5), (4, 48.5)])
shard([(12, 14), (15, 5), (20, 12)], (15, 5.5), (16, 13), "1", "3", "W")          # spike
shard([(2, 22), (9, 13), (21, 11), (28, 16), (28, 24), (20, 30), (7, 30)], (17, 11.5), (19, 29.5), "1", "2", "W")
plane(inside(poly([(2, 22), (9, 13), (21, 11), (28, 16), (28, 24), (20, 30), (7, 30)])),
      [(3, 23), (7, 29.5), (20, 29.5), (17, 24)], "2")                              # underside of the shoulder
ridge(inside(poly([(2, 22), (9, 13), (21, 11), (28, 16), (28, 24), (20, 30), (7, 30)])), [(3, 22), (17, 23.5), (28, 24)], "3")
for x, y in ((47, 47), (48, 47), (11, 49), (12, 49)):
    cv.set(x, y, "r")  # rust on the knuckles
outline_outer(cv, "4")
save(cv, OUT)
