import math, sys
sys.path.insert(0, ".")
from draw import *

cv = Canvas(56, 64)
FLAME_WING = ["a", "a", "2", "1", "y", "c"]
FLAME_TAIL = ["a", "2", "1", "y", "W"]
MANE = ["a", "a", "2", "1", "y", "W"]

tail = taper(21, 51, 11, 46, 4.5, 2, -1.5) | taper(22, 54, 11, 55, 4, 2, 1)
paint_ramp(cv, tail, FLAME_TAIL, outline="r")
wing = taper(22, 40, 8, 23, 8, 3, 2) | taper(21, 43, 6, 35, 7, 2.5, 1) | taper(23, 37, 13, 17, 6, 2, 1)
paint_ramp(cv, wing, FLAME_WING, outline="r")
for x0 in (26, 33):
    paint_ramp(cv, rect(x0, 53, x0 + 2, 59), ["r"], outline="4")
body = ellipse(31, 47, 11, 9.5)
paint_lit(cv, body, 31, 47, 11, 9.5, ["1", "2", "3", "r"])
dist = edge_dist(body)
belly = {p for p in ellipse(35, 50, 6.5, 5.5) if p in body and dist[p] >= 2}
paint_lit(cv, belly, 35, 50, 6.5, 5.5, ["c", "y", "o", "o"], outline=None)
head = ellipse(33, 26, 16, 14.5)
paint_lit(cv, head, 33, 26, 16, 14.5, ["c", "y", "o", "3"], t=(-0.35, 0.62, 0.88))
A, B = (40, 10), (18, 36)
d = (B[0] - A[0], B[1] - A[1]); L = math.hypot(*d); n = (-d[1] / L, d[0] / L)
def upper_left(p):
    t = ((p[0] - A[0]) * d[0] + (p[1] - A[1]) * d[1]) / (L * L)
    s = (p[0] - A[0]) * n[0] + (p[1] - A[1]) * n[1]
    return s > 2.0 * math.sin(t * math.pi * 3.2)
mane = {p for p in head if upper_left(p)}
mane |= taper(27, 15, 22, 3, 5, 1, -1) | taper(34, 13, 34, 1, 5.5, 1) | taper(41, 14, 46, 5, 4.5, 1, 1)
mane |= taper(22, 20, 13, 14, 5, 1) | taper(19, 29, 11, 28, 4.5, 1)
paint_ramp(cv, mane, MANE, outline="r")
# red flame feathers across the chest and shoulder
for x, y in [(24, 41), (25, 40), (26, 41), (28, 40), (29, 39), (30, 40), (25, 44), (26, 43), (27, 44)]:
    if cv.get(x, y) not in (".", "4"):
        cv.set(x, y, "a")
stamp(cv, 39, 21, """
.44.
4W44
4444
4444
4ra4
.44.
""")
stamp(cv, 47, 27, """
.44...
4WW44.
4WWWW4
4cco44
.444..
""")
stamp(cv, 38, 30, "aaa")
stamp(cv, 24, 59, """
4rr4..4rr4..
444444444444
""")
open("chick_v3.txt", "w").write("\n".join(cv.rows()) + "\n")
