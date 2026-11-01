"""Axolotl (water, original pick 10): three-quarter view facing right. Broad flat head with a wide
orange smile, big feathery gill fronds fanning back from behind the head (the pick's pink fan),
long low body, paddle tail with a pale fin, four short legs."""
import math
import sys
from draw2 import Canvas, shape, stroke, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "axolotl.txt"
cv = Canvas(56, 64)
BODY = ["1", "2", "3", "3"]


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def frond(pts, rad, n_side=5, flen=3.2):
    """A gill frond: a stem with short filaments sweeping back along both sides."""
    stem = stroke(pts, rad)
    fil = set()
    for i in range(1, n_side + 1):
        t = i / (n_side + 1)
        k = min(int(t * (len(pts) - 1)), len(pts) - 2)
        f = t * (len(pts) - 1) - k
        x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f
        y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f
        dx, dy = pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]
        L = math.hypot(dx, dy) or 1
        ux, uy = dx / L, dy / L
        for side in (1, -1):
            nx, ny = -uy * side, ux * side
            ex, ey = x + (nx * 0.8 + ux * 0.6) * flen, y + (ny * 0.8 + uy * 0.6) * flen
            fil |= stroke([(x, y), (ex, ey)], [1.3, 0.7])
    return stem, stem | fil


FEET = []

# far legs (the axolotl's left legs): right of their near partners and higher
for pts in ([(25, 49), (26, 52), (26.5, 54)], [(43, 47), (44, 50), (44.5, 52)]):
    paint_form(cv, stroke(pts, [2.4, 2.0, 1.8]), ["2", "3", "3"], [0.7, 0.4], R=2, outline="4")
    FEET.append(((int(pts[-1][0]) - 2, int(pts[-1][1]) + 1), "4334\n4444"))

# tail: a pale fin around a pink paddle core, sweeping back and up
fin = shape([(19, 40), (13, 34), (6, 28), (2, 23), (3, 30), (6, 38), (11, 45), (17, 50), (22, 49)])
paint_form(cv, fin, ["c", "y", "o", "o"], [0.75, 0.45, 0.2], R=3, outline="4", sel="o")
core = stroke([(22, 44), (14, 41), (8, 36), (4, 29)], [4.4, 3.4, 2.2, 1.0])
paint_form(cv, core, BODY, [0.8, 0.45, 0.2], R=3, outline="4", sel="3")

# far-side gills peeking over the head (pale tuft, like the pick's white tuft)
for pts, rad in (([(44, 25), (46, 19), (48, 15)], [2.0, 1.6, 1.0]), ([(47, 26), (51, 21), (54, 19)], [1.8, 1.4, 0.9])):
    stem, full = frond(pts, rad, n_side=2, flen=2.2)
    paint_form(cv, full, ["c", "y", "o", "o"], [0.6, 0.3, 0.1], R=1.5, outline="4")
    line(cv, pts, "o", stem)

# body: long and low, chest toward us on the right
body = shape([(20, 39), (28, 36), (36, 36), (41.5, 40), (42, 46.5), (37, 51), (27, 52), (19, 50), (15.5, 45)])
paint_form(cv, body, BODY, [0.82, 0.45, 0.18], R=6, outline="4", tilt=0.3, sel="3")
inner = {p for p in body if cv.get(*p) != "4"}
belly = shape([(33, 45), (40, 42.5), (42.5, 47), (39, 51.5), (31, 52.5), (29.5, 49)]) & inner
paint_form(cv, belly, ["c", "y", "o", "o"], [0.6, 0.3, 0.1], R=3, outline=None, tilt=0.3)

# near legs (the axolotl's right legs): left and lower, in front
for pts in ([(20, 49), (19, 53), (18.5, 55)], [(35, 49), (34.5, 53), (34, 55)]):
    paint_form(cv, stroke(pts, [3.4, 2.8, 2.4]), BODY, [0.75, 0.4, 0.2], R=2, outline="4", sel="3")
    FEET.append(((int(pts[-1][0]) - 2, int(pts[-1][1]) + 1), "41124\n44444"))

# near gills: three big feathery fronds fanning back from behind the head
for pts, rad in (([(33, 28), (28, 19), (24, 11), (22, 5)], [3.6, 3.8, 2.8, 1.4]),
                 ([(31, 31), (24, 26), (16, 22), (10, 20)], [3.6, 3.8, 2.8, 1.4]),
                 ([(31, 35), (24, 36), (17, 38), (12, 41)], [3.2, 3.2, 2.4, 1.2])):
    stem, full = frond(pts, rad, n_side=6, flen=4.0)
    paint_form(cv, full, ["c", "1", "2", "3"], [0.8, 0.5, 0.25], R=2, outline="4", sel="3")
    line(cv, pts, "3", stem)

# head: broad and flat, snout toward us on the right
head = shape([(31, 27), (37, 23.5), (45, 22.5), (51, 25), (54, 30), (53, 35.5), (48, 39.5), (40, 41), (33, 39), (29.5, 34)])
paint_form(cv, head, ["c", "1", "2", "3"], [0.85, 0.5, 0.2], R=7, outline="4", tilt=0.2, sel="3")
# wide orange smile, curving round the snout
line(cv, [(39, 35), (44, 37.2), (49, 36.5), (52.5, 33.5)], "a", smooth=True)
line(cv, [(40, 36), (44, 38.2), (49, 37.5), (52.5, 34.5)], "r", smooth=True)
stamp(cv, 37, 27, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 50, 28, "4\nK\nK")
stamp(cv, 35, 34, "yy")
outline_outer(cv, "4")
for xy, f in FEET:
    stamp(cv, *xy, f)
save(cv, OUT)
