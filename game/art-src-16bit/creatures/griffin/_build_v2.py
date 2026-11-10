"""141 thunder griffin: cream lion-cub body sitting up, big feathered wing raised behind, tall ears
with brown insides, a yellow lightning-bolt crest, tufted tail with a spark tip. Three-quarter view."""
import math
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "griffin_v2.txt"
cv = Canvas(56, 64)
FUR = ["1", "2", "3", "3"]
FAR = ["2", "3", "3"]
WING = ["2", "3", "3", "3"]


def feather(pts, rad):
    """A wing feather in the tan ramp; its outer third darkens to brown tips."""
    m = stroke(pts, rad)
    paint_form(cv, m, WING, [0.8, 0.4, 0.2], R=2.5, outline="4", sel="3")
    (bx, by), (tx, ty) = pts[0], pts[-1]
    L = math.hypot(tx - bx, ty - by)
    for p in m:
        if math.hypot(p[0] - bx, p[1] - by) > 0.68 * L and cv.get(*p) != "4":
            cv.set(*p, "a" if cv.get(*p) == "2" else "r")

VOLT = ["c", "y", "o", "o"]


def union(*m):
    s = set()
    for x in m:
        s |= x
    return s


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


# far wing: two feather tips peeking above the back
for pts, rad in (([(33, 31), (38, 20), (44, 14)], [2.8, 2.2, 0.9]), ([(32, 30), (34, 19), (37, 10)], [3.0, 2.4, 1.0])):
    feather(pts, rad)

# near wing: long feathers fanning up and back (back to front so each feather has an edge)
for pts, rad in (
    ([(25, 38), (14, 34), (4, 31)], [3.4, 2.5, 1.0]),
    ([(25, 36), (12, 28), (3, 22)], [3.8, 2.8, 1.1]),
    ([(25, 34), (14, 22), (5, 13)], [4.0, 3.0, 1.2]),
    ([(26, 32), (19, 18), (13, 8)], [3.6, 2.6, 1.1]),
):
    feather(pts, rad)

# tail with an electric tuft (behind the haunch)
paint_form(cv, stroke([(19, 53), (11, 55), (6, 51), (7, 46)], [1.9, 1.7, 1.6, 1.5]), FUR, [0.8, 0.45], R=1.5, outline="4")
tuft = union(stroke([(7, 47), (4, 42), (7, 37)], [2.8, 2.0, 0.8]), stroke([(8, 47), (10, 42), (9, 39)], [2.2, 1.5, 0.7]))
paint_form(cv, tuft, VOLT, [0.75, 0.4, 0.1], R=2, outline="4", sel="o")

# far fore leg (right, higher)
paint_form(cv, stroke([(38, 47), (40, 52), (40, 56)], [2.6, 2.2, 2.0]), FAR, [0.6, 0.3], R=2, outline="4")
stamp(cv, 38, 56, ".4224\n.4444")

# body sitting upright, chest toward us
body = shape([(27, 34), (35, 32), (41, 36), (42, 44), (39.5, 51.5), (33, 56.5), (24, 56), (19.5, 50), (20.5, 41)])
paint_form(cv, body, FUR, [0.8, 0.45, 0.16], R=7, outline="4", tilt=0.25, sel="3")
bi = inner(body)
ruff = shape([(36, 34), (41, 36.5), (42, 43), (39.5, 48), (36, 46), (34, 40)]) & bi
for p in ruff:
    cv.set(*p, "W" if (p[1] < 38 and p[0] < 39) else "1")
for p in [(35, 44), (36, 45), (37, 44), (38, 45), (39, 46), (34, 41), (35, 42)]:  # fluffy zigzag edge
    if p in bi:
        cv.set(*p, "1")
for p in [(36, 46), (38, 47), (35, 43)]:
    if p in bi:
        cv.set(*p, "3")

# hind haunch and paw (near side)
haunch = shape([(18, 46), (25.5, 44), (30, 49.5), (28.5, 56.5), (21, 58), (15.5, 54)])
paint_form(cv, haunch, FUR, [0.8, 0.45, 0.16], R=5, outline="4", tilt=0.2, sel="3")
stamp(cv, 26, 56, ".4114.\n411224\n.4444.")

# near fore leg (left, lower)
paint_form(cv, stroke([(33, 47), (33, 53), (32.5, 58)], [3.0, 2.5, 2.3]), FUR, [0.8, 0.45, 0.2], R=2.5, outline="4", sel="3")
stamp(cv, 29, 58, ".4114.\n411224\n.4444.")

# wing coverts on the shoulder (over the body)
coverts = shape([(24, 31), (30, 32), (31.5, 37), (28, 42), (22, 41.5), (20.5, 36)])
paint_form(cv, coverts, WING, [0.8, 0.4, 0.2], R=3, outline="4", sel="3")
line(cv, [(29, 34), (25.5, 38), (22, 39)], "a", inner(coverts))

# ears: far ear and near ear, brown insides
far_ear = poly([(43.5, 18), (50, 4.5), (51, 22)])
paint_form(cv, far_ear, FUR, [0.75, 0.4, 0.12], R=2, outline="4")
for p in poly([(46.5, 17), (49.5, 9), (50, 19)]):
    cv.set(*p, "r")
near_ear = poly([(33, 23), (24, 6), (40.5, 17)])
paint_form(cv, near_ear, FUR, [0.8, 0.45, 0.15], R=2.5, outline="4", sel="3")
for p in poly([(33, 19.5), (27, 10), (37.5, 17)]):
    cv.set(*p, "a" if p[1] > 13 else "r")

# head
head = shape([(32.5, 22), (36.5, 17.5), (42, 16.5), (47.5, 19), (50.5, 24), (49, 29), (44.5, 32), (38, 32.5), (33.5, 30), (31.5, 26)])
paint_form(cv, head, FUR, [0.8, 0.42, 0.14], R=6, outline="4", tilt=0.2, sel="3")
hi = inner(head)
for p in shape([(44, 26), (50, 25), (49.5, 29), (45, 31.5), (41.5, 30)]) & hi:  # pale muzzle
    cv.set(*p, "1" if p[1] > 26 else cv.get(*p))

# lightning-bolt crest on the forehead
bolt = poly([(43, 2), (48.5, 2), (45.5, 8), (49, 8), (41, 20), (42.5, 12), (39.5, 12)])
paint_form(cv, bolt, VOLT, [0.7, 0.35, 0.1], R=2, outline="4", sel="o")
fur_tuft = stroke([(45, 20.5), (42, 16.5), (38.5, 15.5)], [2.6, 1.8, 0.7]) | stroke([(41, 20), (38, 18.5), (35.5, 19)], [2.0, 1.4, 0.6])
paint_form(cv, fur_tuft, FUR, [0.8, 0.45, 0.15], R=2, outline="4", sel="3")

# face
stamp(cv, 37, 21, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 47, 22, "4\nK\nK")
stamp(cv, 49, 25, "44\n4.")         # nose tip
stamp(cv, 45, 28, "4aa4\n.44.")     # small open mouth
stamp(cv, 36, 27, "aa")             # blush
outline_outer(cv, "4")
save(cv, OUT)
