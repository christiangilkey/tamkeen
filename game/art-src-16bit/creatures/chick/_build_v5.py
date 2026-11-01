"""Fire chick v12: v10's sleek three-quarter design, fitted to the pick's form: bigger head sitting
lower, almost no neck, compact upright body, short legs, more fire around the head and back."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, paint_flame, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "chick_v12.txt"
cv = Canvas(56, 64)
FLAME = ["2", "1", "y", "c", "W"]
BODY = ["1", "2", "3", "r"]
HC, S, NC = (37.25, 16), 1.15, (36, 19)  # head: old centre, scale, new centre


def T(pts):
    return [(NC[0] + S * (x - HC[0]), NC[1] + S * (y - HC[1])) for x, y in pts]


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


FEET = []
FOOT = """
.4r44r4.
4arrrrr4
4W4W4W44
"""


def leg(thigh, shin, foot_xy):
    paint_form(cv, shin, ["a", "r", "r"], [0.75, 0.4], R=1.5, outline="4")
    if thigh:
        paint_form(cv, thigh, BODY, [0.8, 0.45, 0.2], R=3, outline="4", sel="r")
    FEET.append((foot_xy, FOOT))


leg(set(), stroke([(35, 48), (35, 51), (36, 53)], [1.7, 1.4, 1.4]), (33, 53))

tail = union(
    stroke([(19, 39), (13, 34), (10, 28)], [4.6, 3.2, 1.0]),
    stroke([(18, 42), (11, 40), (6, 36)], [4.4, 3.0, 1.0]),
    stroke([(18, 45), (11, 46), (6, 45)], [3.8, 2.6, 1.0]),
)
paint_flame(cv, tail, FLAME, outline="r")

torso = union(
    shape([(38, 31), (41, 36), (41, 42), (37, 47), (30, 49.5), (23, 48.5), (18, 44), (18, 38), (23, 33), (30, 30.5)]),
    stroke([(35, 27), (34, 31)], [6.0, 6.5]),
)
paint_form(cv, torso, BODY, [0.8, 0.48, 0.22], R=6, outline="4", tilt=0.25, sel="r")
inner = {p for p in torso if cv.get(*p) != "4"}
bib = shape([(37, 24), (41, 25), (43, 32), (43, 41), (39, 47), (35, 47), (34.5, 40), (35.5, 31)]) & inner
paint_form(cv, bib, ["c", "y", "o", "o"], [0.8, 0.5, 0.25], R=4, outline=None, tilt=0.3)

leg(stroke([(25, 47), (25, 50)], [3.2, 2.8]), stroke([(25, 51), (25, 54), (24, 56)], [1.8, 1.5, 1.5]), (21, 56))

wing = union(
    shape([(26, 35), (30, 38.5), (28.5, 43), (24, 46), (19.5, 46.5), (17.5, 43), (19.5, 38.5), (23, 35.5)]),
    stroke([(21, 40), (15, 39), (11, 37)], [2.6, 1.8, 0.8]),
    stroke([(21, 43), (14.5, 43.5), (10.5, 42.5)], [2.6, 1.8, 0.8]),
    stroke([(22, 45), (16, 47), (12, 47.5)], [2.4, 1.6, 0.8]),
)
paint_form(cv, wing, ["1", "2", "a", "r"], [0.8, 0.5, 0.22], R=3, outline="4", tilt=0.2, sel="r")
win = {p for p in wing if cv.get(*p) != "4"}
line(cv, [(20, 41.5), (16, 41.2), (13, 40.5)], "r", win)
line(cv, [(21, 44.3), (17, 45.2), (14, 45.4)], "r", win)
line(cv, [(25.5, 39), (23, 42), (20.5, 43)], "3", win)

# fire around the back of the head: crest plus mane down the nape
crest = union(
    stroke([(36, 11), (33, 5), (29, 1)], [4.2, 3.0, 1.0]),
    stroke([(31, 12), (24, 8), (18, 8)], [4.8, 3.4, 1.0]),
    stroke([(29, 18), (21, 17), (15, 19)], [4.6, 3.2, 1.0]),
    stroke([(29, 24), (22, 27), (18, 31)], [4.2, 3.0, 1.0]),
)
paint_flame(cv, crest, FLAME, outline="r")

head = shape(T([(31, 8.5), (38, 7), (43.5, 9), (46.5, 13.5), (46.5, 18.5), (43, 23), (37, 25), (31.5, 24),
                (28, 20), (28, 13.5)]))
paint_form(cv, head, ["c", "y", "o", "3"], [0.82, 0.45, 0.16], R=7, outline="4", tilt=0.2, sel="o")
upper = poly(T([(42.5, 14), (46.5, 13.5), (52, 18.5), (50.5, 19.5), (42, 19.5)]))
paint_form(cv, upper, ["W", "c", "y", "o"], [0.7, 0.4, 0.15], R=2, outline="4")
lower = poly(T([(42.5, 19.5), (49, 19.5), (44.5, 22)]))
paint_form(cv, lower, ["c", "o", "o"], [0.6, 0.3], R=1.5, outline="4")
stamp(cv, 35, 13, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 45, 14, "4\nK\nK")
stamp(cv, 33, 22, "aa")
outline_outer(cv, "4")
for xy, f in FEET:
    stamp(cv, *xy, f)
save(cv, OUT)
