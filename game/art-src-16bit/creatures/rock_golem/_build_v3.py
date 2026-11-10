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

# ---- Rock golem v3 (pick 103): v2's pose and head, with the green crystal as real pointed prism
# shards jutting at angles from a mostly dark rock core ----
import math
OUT = sys.argv[1] if len(sys.argv) > 1 else "rock_golem3.txt"
CORE = ("y", "y", "o", "o")
LX, LY = -0.6, -0.8  # light direction (top left)


def core(pts, R=2):
    return chunk(pts, CORE, R)


def metal(pts):
    """A grey metal band painted over a part (no outline of its own)."""
    for p in poly(pts):
        if cv.get(*p) not in (".", "4"):
            cv.set(*p, "c")


def prism(base, tip, w, shoulder=0.72):
    """An elongated hexagonal crystal: three long facets (lit, mid, dark, chosen by which way each
    faces the light) running from the buried base to a sharp tip, crisp edges between them."""
    (bx, by), (tx, ty) = base, tip
    L = math.hypot(tx - bx, ty - by)
    dx, dy = (tx - bx) / L, (ty - by) / L
    nx, ny = -dy, dx
    sx, sy = bx + dx * L * shoulder, by + dy * L * shoulder
    outline_pts = [(bx + nx * w, by + ny * w), (sx + nx * w, sy + ny * w), (tx, ty),
                   (sx - nx * w, sy - ny * w), (bx - nx * w, by - ny * w)]
    m = poly(outline_pts)
    strips = []
    for k in range(3):
        s0, s1 = -w + k * 2 * w / 3, -w + (k + 1) * 2 * w / 3
        sm = (s0 + s1) / 2
        strips.append(((nx * sm) * LX + (ny * sm) * LY, s0, s1))
    order = sorted(strips)            # least lit first
    colour = {order[2][1]: "1", order[1][1]: "2", order[0][1]: "3"}
    for x, y in m:
        px, py = x + 0.5 - bx, y + 0.5 - by
        along = px * dx + py * dy
        across = px * nx + py * ny
        t = along / L
        scale = 1.0 if t <= shoulder else max(0.0, (1 - t) / (1 - shoulder))
        a = across / scale if scale > 0 else 0
        for _, s0, s1 in strips:
            if s0 - 0.01 <= a <= s1 + 0.01:
                cv.set(x, y, colour[s0])
                break
        else:
            cv.set(x, y, colour[strips[0][1]] if a < 0 else colour[strips[2][1]])
    for x, y in m:   # outline
        if any((x + ex, y + ey) not in m for ex, ey in N4):
            cv.set(x, y, "4")
    # glint on the lit facet near the tip
    lit_s = [s for s in strips if colour[s[1]] == "1"][0]
    gx, gy = bx + dx * L * 0.62 + nx * (lit_s[1] + lit_s[2]) / 2 * 0.8, by + dy * L * 0.62 + ny * (lit_s[1] + lit_s[2]) / 2 * 0.8
    if (int(gx), int(gy)) in m and cv.get(int(gx), int(gy)) == "1":
        cv.set(int(gx), int(gy), "W")
    return m


# ---- far side (right, higher, partly hidden)
core([(33, 44), (40, 44), (41, 52), (34, 52)])
prism((37, 46), (43, 54), 2.2)
core([(33, 52), (41, 51.5), (43, 55), (41, 57), (33, 57)])
metal([(34, 52), (41, 52), (42, 54), (34, 54)])
prism((46, 36), (53, 47), 2.8)
prism((45, 40), (49, 51), 2.1)
core([(42, 27), (48, 28), (49, 42), (44, 44), (42, 36)])
core([(43, 43), (50, 43), (51, 49), (46, 51), (42, 48)])
metal([(44, 43.5), (50, 43.5), (50, 45.5), (44, 45.5)])
prism((43, 22), (48, 9), 3.2)
prism((45, 24), (53, 16), 2.5)
core([(38, 19), (46, 18), (48, 26), (42, 29), (37, 26)])

# ---- torso: dark rock core with a cluster of chest crystals jutting forward and up
core([(17, 24), (41, 22), (44, 38), (37, 47), (21, 47), (16, 37)], R=4)
prism((25, 40), (33, 26), 4.2)
prism((30, 41), (41, 33), 3.2)
prism((22, 42), (21, 33), 2.5)
core([(19, 40), (33, 39.5), (34, 46), (21, 47)], R=3)
prism((34, 44), (44, 42), 2.2)

# ---- head (as v2): set low and to the right, crystal helmet, dark face recess, yellow eyes
hm, hi = solid([(28, 14), (36, 10), (43, 13), (46, 19), (43, 25), (31, 25), (28, 20)], "2")
plane(hi, [(28, 14), (36, 10), (43, 13), (38, 16), (30, 17)], "1")
plane(hi, [(43, 13), (46, 19), (43, 25), (42, 18)], "3")
ridge(hi, [(30, 17), (38, 16), (43, 13)], "W")
plane(hi, [(32, 18.5), (43, 18.5), (44, 22.5), (41.5, 25), (32, 25)], "o")
ridge(hi, [(31, 18), (43, 18)], "4")
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

# ---- near leg (left, lower, bigger)
core([(19, 44), (28, 44), (29, 53), (21, 53)])
prism((22, 46), (16, 53), 2.5)
core([(16, 53), (30, 53), (33, 57), (31, 60), (15, 60)])
metal([(17, 53), (29, 53), (30, 55), (17, 55)])

# ---- near shoulder (left): three big shards pointing up and out, buried in a rock shoulder
prism((14, 24), (8, 4), 4.5)
prism((19, 22), (22, 7), 3.5)
prism((10, 27), (0, 16), 3.2)
core([(5, 22), (16, 18), (26, 21), (27, 29), (18, 33), (6, 31)], R=3)
# near arm: rock arm, forearm shards pointing down and out, fist with a metal band
core([(5, 30), (15, 29), (17, 45), (12, 48), (4, 46)], R=3)
prism((9, 37), (0, 48), 3.2)
prism((13, 41), (9, 53), 2.5)
fist = core([(4, 46), (15, 46), (16, 52), (12, 55), (4, 53)])
metal([(5, 46.5), (14, 46.5), (14, 48.5), (5, 48.5)])
for x, y in ((47, 47), (48, 47), (11, 50), (12, 50)):
    cv.set(x, y, "r")  # rust on the knuckles
outline_outer(cv, "4")
save(cv, OUT)
