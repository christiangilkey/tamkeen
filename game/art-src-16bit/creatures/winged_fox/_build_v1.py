"""Winged fox (pick 44): hovering purple fox, three-quarter view facing right. Big feathered wing
swept up and back, black ears and paws, orange eyes, long tail with a silver tip."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "winged_fox.txt"
cv = Canvas(56, 64)
FUR = ["1", "2", "3", "4"]
DARK = ["2", "3", "3"]
SILVER = ["c", "y", "o", "3"]


def union(*m):
    s = set()
    for x in m:
        s |= x
    return s


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


def core(mask):
    return {(x, y) for x, y in mask if all((x + a, y + b) in mask for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))}


# far wing: two feather tips peeking up behind the near wing
for pts, rad in (([(30, 26), (27, 14), (25, 5)], [3.0, 2.4, 0.8]),
                 ([(31, 27), (31, 16), (32, 8)], [2.8, 2.2, 0.8])):
    paint_form(cv, stroke(pts, rad), ["2", "3", "3", "4"], [0.85, 0.5, 0.2], R=2, outline="4", sel="3")

# tail: long, trailing down and back, silver tip
tail = stroke([(24, 40), (18, 46), (13, 52), (9, 58)], [3.0, 4.4, 4.0, 1.6])
paint_form(cv, tail, FUR, [0.85, 0.5, 0.18], R=4, outline="4", tilt=0.2, sel="3")
tip = stroke([(12, 53), (9, 58)], [4.0, 1.6]) & inner(tail)
paint_form(cv, tip, SILVER, [0.7, 0.4, 0.1], R=3, outline=None)

# far legs (right, higher), dangling
for pts in ([(39, 40), (41.5, 43.5), (44, 44.5)], [(31, 42), (32, 45.5), (33.5, 47)]):
    paint_form(cv, stroke(pts, [2.4, 2.0, 1.8]), ["3", "3", "4"], [0.6, 0.1], R=1.5, outline="4")

# body: sleek, slanted, floating
body = shape([(30, 27.5), (38, 28.5), (42.5, 34), (40.5, 41), (33, 44.5), (25, 43.5), (21, 38), (23, 31.5)])
paint_form(cv, body, FUR, [0.85, 0.5, 0.18], R=6, outline="4", tilt=0.25, sel="3")
chest = poly([(37, 29), (42, 33), (41.5, 39), (39.5, 37.5), (38.5, 41), (36.5, 38), (35.5, 33)]) & inner(body)
paint_form(cv, chest, SILVER, [0.8, 0.45, 0.12], R=3, outline=None, tilt=0.3)

# near legs (left, lower), dangling, black paws
for pts in ([(35, 41), (37, 45.5), (40, 47)], [(26, 41), (26, 46), (28.5, 48.5)]):
    paint_form(cv, stroke(pts, [3.0, 2.5, 2.2]), DARK, [0.8, 0.35], R=1.5, outline="4")

# near wing: one broad shape, pointed feather tips along the trailing edge, feather lines inside
wing = poly([(29.5, 26), (25, 17), (21, 10), (14, 4), (10, 2.5), (11, 7), (5, 8.5), (8, 12), (2, 15.5), (6, 19),
             (1, 23.5), (6, 26), (2.5, 31), (9, 31), (7.5, 36), (14, 35), (15.5, 39.5), (21, 37), (27.5, 36.5)])
paint_form(cv, wing, ["1", "2", "3", "3"], [0.82, 0.48, 0.15], R=4, outline="4", tilt=0.15, sel="3")
wi = inner(wing)
for end in ((11.5, 7), (8.5, 12), (6.5, 19), (6.5, 26), (9.5, 31), (14.5, 35)):
    line(cv, [(25, 30), end], "3", wi, smooth=False)
line(cv, [(28, 25), (24, 17), (20.5, 11.5), (14, 5.5)], "1", wi)  # lit leading edge
arm = shape([(29, 24.5), (31, 30), (28, 35.5), (22, 35.5), (19.5, 30), (22, 24)])
paint_form(cv, arm, FUR, [0.8, 0.45, 0.18], R=3.5, outline="4", tilt=0.2, sel="3")

# ears: black, big
for pts, rad in (([(46, 13), (48, 7), (49, 2.5)], [3.4, 2.2, 0.6]),
                 ([(38, 14), (36, 7), (35, 2)], [3.8, 2.4, 0.6])):
    ear = stroke(pts, rad)
    paint_form(cv, ear, ["3", "3", "4"], [0.55, 0.05], R=2, outline="4")
    innr = stroke([(pts[0][0] + 0.3, pts[0][1] + 0.5), (pts[1][0] + 0.2, pts[1][1] + 1)], [1.5, 0.6]) & core(ear)
    if innr: paint_form(cv, innr, ["2", "2", "3"], [0.6, 0.2], R=1, outline=None)

# head: skull with a long pointed muzzle toward us and to the right; dark mask round the eyes
head = shape([(34, 17.5), (37, 12.5), (43, 11), (48, 13), (50, 17), (49, 22), (45, 26), (39, 27), (35, 24)])
paint_form(cv, head, FUR, [0.85, 0.5, 0.18], R=6, outline="4", tilt=0.2, sel="3")
muzzle = poly([(44.5, 18.5), (48, 18), (53.5, 21.2), (52, 23), (47, 24.5), (44.5, 24.5)])
paint_form(cv, muzzle, FUR, [0.85, 0.5, 0.2], R=2.5, outline="4", sel="3")
stamp(cv, 52, 20, ".4\n4K\n44")  # nose
line(cv, [(47, 24), (51, 23)], "3", None, smooth=False)
# eyes: orange, lid line slanting to the muzzle; far eye a sliver
stamp(cv, 38, 15, "4444.\n.aKa4\n.aWK.\n..rr.")
stamp(cv, 47, 16, "44\naK\nr.")
outline_outer(cv, "4")
save(cv, OUT)
