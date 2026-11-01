"""Cyber cat (pick 110): black cat crouched low, three-quarter view facing right, glowing green eyes
and green circuit markings, purple accents. Body in dark blue-greys so the form reads."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "cat.txt"
cv = Canvas(56, 64)
FUR = ["1", "2", "3", "4"]


def union(*m):
    s = set()
    for x in m:
        s |= x
    return s


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


# tail: rises from the rump and curls over at the top, glowing tip ring
tail = stroke([(10, 46), (4, 40), (4, 31), (9, 25), (14, 25)], [2.6, 2.6, 2.4, 2.0, 1.4])
paint_form(cv, tail, FUR, [0.8, 0.45, 0.15], R=2.5, outline="4", sel="3")
line(cv, [(4, 36), (6, 36)], "y", inner(tail), smooth=False)
line(cv, [(5, 29), (7, 30)], "y", inner(tail), smooth=False)

# far foreleg (right, higher), stretched forward along the ground
far = stroke([(40, 42), (45, 47), (50, 48.5)], [3.0, 2.4, 2.4])
paint_form(cv, far, ["2", "3", "4", "4"], [0.8, 0.4, 0.1], R=2, outline="4")

# body: long and low, chest raised at the front
body = shape([(37, 32), (42, 35), (44, 41), (40, 47), (30, 49.5), (18, 49.5), (9, 47), (7, 41), (11, 35), (21, 31.5), (30, 31)])
paint_form(cv, body, FUR, [0.88, 0.5, 0.18], R=6, outline="4", tilt=0.25, sel="3")
# near haunch (folded back leg)
haunch = shape([(9, 40), (16, 36.5), (22, 41), (22, 49), (15, 52), (7.5, 49)])
paint_form(cv, haunch, FUR, [0.88, 0.5, 0.18], R=4, outline="4", tilt=0.25, sel="3")
paw_b = stroke([(16, 52.5), (24, 53)], [1.8, 1.8])
paint_form(cv, paw_b, ["2", "3", "3"], [0.6, 0.3], R=1.5, outline="4")
# glowing circuit lines: along the back, down the haunch, on the shoulder
ib = inner(body) | inner(haunch)
line(cv, [(13, 36), (19, 34), (26, 33.5)], "y", ib)
line(cv, [(26, 33.5), (28, 36), (33, 36)], "y", ib, smooth=False)
stamp(cv, 33, 35, "c")
line(cv, [(14, 41), (17, 44), (17, 48)], "o", ib, smooth=False)
stamp(cv, 17, 48, "y")
line(cv, [(36, 40), (38, 44)], "o", ib, smooth=False)
stamp(cv, 38, 44, "y")

# near foreleg (left, lower), stretched forward
near = stroke([(34, 44), (40, 50), (47, 52)], [3.4, 2.6, 2.4])
paint_form(cv, near, FUR, [0.88, 0.5, 0.18], R=2.5, outline="4", sel="3")
stamp(cv, 45, 50, ".444.\n4W1W4\n44444")
stamp(cv, 49, 47, ".44\n4W4\n444")

# ears behind the head; inner ear purple
for pts, rad in (([(46, 22), (48, 16.5), (49.5, 12.5)], [3.2, 2.0, 0.5]),
                 ([(38, 22.5), (37, 16.5), (36, 12)], [3.8, 2.2, 0.5])):
    ear = stroke(pts, rad)
    paint_form(cv, ear, FUR, [0.8, 0.45, 0.15], R=2, outline="4", sel="3")
    innr = stroke([(pts[0][0] + 0.3, pts[0][1] + 0.5), (pts[1][0] + 0.2, pts[1][1] + 1)], [1.6, 0.6]) & inner(ear)
    paint_form(cv, innr, ["a", "r", "r"], [0.6, 0.2], R=1, outline=None)

# head: wide skull, short muzzle at the lower right
head = shape([(34.5, 27), (38, 21.5), (44, 20), (49.5, 22), (52, 27), (51, 32), (47, 35.5), (41, 36), (36, 33.5)])
paint_form(cv, head, FUR, [0.88, 0.5, 0.18], R=6, outline="4", tilt=0.2, sel="3")
muzzle = shape([(45, 29), (49.5, 28.5), (52, 30.5), (50.5, 34), (46, 34.5)])
paint_form(cv, muzzle, ["1", "1", "2", "3"], [0.7, 0.4, 0.15], R=2, outline=None)
stamp(cv, 50, 29, "aa\n.4")  # nose
line(cv, [(47, 33), (49, 33.5), (51, 33)], "4", None, smooth=False)  # mouth
# eyes: glowing green, slit pupils
stamp(cv, 39, 25, "4444.\n4cyK4\n.yyKy\n..yy.")
stamp(cv, 47, 25, "444\nyK4\nyy.")
# whiskers (pale)
stamp(cv, 52, 31, "W.\n.W")
# glowing collar band
line(cv, [(37, 35), (41, 37), (45, 36.5)], "o", inner(body), smooth=True)
outline_outer(cv, "4")
save(cv, OUT)
