"""Seal (water, cyberpunk pick 79): three-quarter view facing right, propped up on its front
flippers. Sleek tapering body curving down to rear flippers, big eye, dark tech stripes on the back."""
import sys
from draw2 import Canvas, shape, stroke, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "seal.txt"
cv = Canvas(56, 64)
BODY = ["1", "2", "3", "3"]


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


# far front flipper (the seal's left): right and higher, behind the chest
far = shape([(45, 41), (49, 45), (52, 51), (51, 53), (46, 52), (44, 47)])
paint_form(cv, far, ["2", "3", "3"], [0.7, 0.35], R=2, outline="4")

# rear flippers fanning at the tail end
rear = union(stroke([(10, 49), (5, 45), (1, 42)], [2.6, 2.2, 1.6]),
             stroke([(10, 50), (5, 53), (2, 56)], [2.6, 2.2, 1.6]))
paint_form(cv, rear, ["2", "3", "3"], [0.7, 0.35], R=2, outline="4", sel="3")

# body: one long tapering tube along a curved spine, neck up to the head
spine = [(41, 22), (42, 32), (37, 42), (27, 47.5), (16, 49.5), (9, 49.5)]
body = stroke(spine, [6.5, 7.5, 7.5, 6.5, 4.5, 2.6])
paint_form(cv, body, BODY, [0.8, 0.45, 0.18], R=6, outline="4", tilt=0.25, sel="3")
inner = {p for p in body if cv.get(*p) != "4"}
belly = shape([(45, 27), (49, 36), (47, 46), (40, 52), (30, 55), (24, 54), (34, 47), (41, 39), (43, 30)]) & inner
paint_form(cv, belly, ["c", "y", "o", "o"], [0.7, 0.4, 0.15], R=3, outline=None, tilt=0.3)
# tech stripes: neat bands across the back, from the back edge part way down the side
from draw2 import catmull
import math
back = inner - belly
path = catmull(spine, closed=False, steps=20)
radii = [6.5, 7.5, 7.5, 6.5, 4.5, 2.6]
for t in (0.2, 0.36, 0.52, 0.67, 0.8):
    i = int(t * (len(path) - 1))
    (x0, y0), (x1, y1) = path[i], path[i + 1]
    L = math.hypot(x1 - x0, y1 - y0) or 1
    nx, ny = (y1 - y0) / L, -(x1 - x0) / L      # normal toward the back (up and left)
    if ny > 0:
        nx, ny = -nx, -ny
    f = t * (len(radii) - 1)
    r = radii[int(f)] + (radii[min(int(f) + 1, len(radii) - 1)] - radii[int(f)]) * (f - int(f))
    a = (x0 + nx * (r - 4.5), y0 + ny * (r - 4.5))
    b = (x0 + nx * (r + 1), y0 + ny * (r + 1))
    band = stroke([a, b], [1.1, 1.1]) & back
    for p in band:
        cv.set(*p, "a")
    for p in band:
        if (p[0] + 1, p[1]) in back and (p[0] + 1, p[1]) not in band:
            cv.set(p[0] + 1, p[1], "3")

# near front flipper (the seal's right): left and lower, planted
near = shape([(37, 40), (41, 44), (40, 50), (38, 55), (31, 56), (31, 53.5), (35, 50), (35, 44)])
paint_form(cv, near, BODY, [0.8, 0.45, 0.2], R=2.5, outline="4", sel="3")
line(cv, [(33, 54), (37, 54)], "3", near, smooth=False)

# head: rounded skull tapering into a short muzzle toward us on the right
head = shape([(33, 13), (39, 9.5), (46, 9.5), (50.5, 13), (53.5, 18), (54, 22.5), (50, 26), (43, 27.5), (36.5, 25.5), (32.5, 20)])
paint_form(cv, head, ["c", "1", "2", "3"], [0.85, 0.5, 0.2], R=6, outline="4", tilt=0.2, sel="3")
muzzle = shape([(48, 19), (52, 18), (54.5, 21), (52.5, 24.5), (48.5, 25), (46.5, 22)])
paint_form(cv, muzzle, ["y", "o", "o"], [0.6, 0.3], R=2, outline=None)
stamp(cv, 52, 19, "KK|.K".replace("|", chr(10)))         # nose
line(cv, [(49, 24), (51, 24.3), (53, 23.2)], "3", smooth=False)  # mouth
stamp(cv, 48, 22, "3.3")             # whisker spots
stamp(cv, 38, 13, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 49, 13, "4\nK\nK")
outline_outer(cv, "4")
save(cv, OUT)
