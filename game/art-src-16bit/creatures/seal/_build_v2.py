"""Seal v2 (water, cyberpunk pick 79): low compact body propped on the front flippers, short thick
neck, head close to the body, big expressive eyes like the pick, muzzle pad with whisker spots,
darker teal spots and stripes, tail flippers behind. Three-quarter view facing right."""
import sys
from draw2 import Canvas, shape, stroke, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "seal2.txt"
cv = Canvas(56, 64)
BODY = ["1", "2", "3", "3"]
NL = chr(10)


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def st(x, y, rows):
    stamp(cv, x, y, NL.join(rows))


# far front flipper (right, higher), tail flippers behind
paint_form(cv, shape([(44, 42), (48, 45), (51, 51), (50, 53), (45, 52), (43, 47)]), ["2", "3", "3"], [0.7, 0.35], R=2, outline="4")
rear = union(stroke([(11, 47), (6, 43), (2, 40)], [3.0, 2.6, 1.8]), stroke([(11, 49), (6, 52), (2, 55)], [3.0, 2.6, 1.8]))
paint_form(cv, rear, ["2", "3", "3"], [0.7, 0.35], R=2, outline="4", sel="3")

# body: low and compact, thick at the shoulders, tapering to the tail
spine = [(39, 33), (35, 40), (26, 45), (17, 47.5), (10, 48)]
body = stroke(spine, [9.5, 9.5, 8.0, 5.5, 3.2])
paint_form(cv, body, BODY, [0.8, 0.45, 0.18], R=7, outline="4", tilt=0.25, sel="3")
inner = {p for p in body if cv.get(*p) != "4"}
belly = shape([(44, 32), (49, 38), (47, 47), (40, 53), (30, 55), (25, 53), (35, 47), (42, 40)]) & inner
paint_form(cv, belly, ["c", "y", "o", "o"], [0.7, 0.4, 0.15], R=3, outline=None, tilt=0.3)
back = inner - belly
# markings: darker teal spots and short stripes on the back
for cx, cy, rx, ry in ((33, 34, 2.2, 1.6), (27, 39, 2.6, 1.8), (21, 42, 2.0, 1.5), (36, 40, 1.6, 1.2), (15, 45, 1.6, 1.2), (30, 44, 1.5, 1.1)):
    spot = shape([(cx - rx, cy), (cx, cy - ry), (cx + rx, cy), (cx, cy + ry)]) & back
    for p in spot:
        cv.set(*p, "a")
    for p in spot:
        q = (p[0], p[1] + 1)
        if q in back and q not in spot:
            cv.set(*q, "r")

# near front flipper (left, lower, planted)
near = shape([(36, 41), (40, 45), (39.5, 50), (38, 55), (31, 56), (31, 53.5), (34.5, 50), (34, 45)])
paint_form(cv, near, BODY, [0.8, 0.45, 0.2], R=2.5, outline="4", sel="3")
line(cv, [(33, 54), (37, 54)], "3", near, smooth=False)

# head: sits right on the shoulders; flat crown, brow, defined muzzle toward us
head = shape([(30, 21), (34, 15), (42, 12.5), (49, 14), (53, 19), (54.5, 25), (52.5, 30), (46, 33), (38, 34), (31.5, 30)])
paint_form(cv, head, ["c", "1", "2", "3"], [0.93, 0.55, 0.22], R=7, outline="4", tilt=0.2, sel="3")
muzzle = shape([(45, 24), (50, 22.5), (54.5, 25), (54, 29.5), (50, 31.5), (45.5, 30), (44, 27)])
paint_form(cv, muzzle, ["y", "y", "o"], [0.75, 0.3], R=2.5, outline=None)
st(51, 23, ["KKK", ".KK"])                        # nose
line(cv, [(47, 30), (49, 30.6), (51, 30.2), (53, 29)], "3", smooth=False)  # mouth
st(46, 26, ["o.o", ".o."])                         # whisker spots
# big eyes: near eye large with a white glint, far eye narrower by the muzzle
st(35, 17, ["44444..",
            "4KKKK4.",
            "KWWKKK4",
            "KWWKKKK",
            "KKKKKKK",
            ".KKKKK4",
            "..aaa.."])
st(46, 17, ["444",
            "KK4",
            "WK4",
            "KK4",
            "KK.",
            ".a."])
outline_outer(cv, "4")
save(cv, OUT)
