"""Fire chick v8: fire only where it belongs (crest and tail, short fat flame tongues); a real folded
wing made of feathers; smaller chest patch."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, paint_flame, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "chick_v10.txt"
cv = Canvas(56, 64)
FLAME = ["2", "1", "y", "c", "W"]
BODY = ["1", "2", "3", "r"]


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def leg(thigh, shin, foot_xy, foot):
    paint_form(cv, shin, ["a", "r", "r"], [0.75, 0.4], R=1.5, outline="4")
    if thigh: paint_form(cv, thigh, BODY, [0.8, 0.45, 0.2], R=3, outline="4", sel="r")
    FEET.append((foot_xy, foot))


FEET = []
FOOT = """
.4r44r4.
4arrrrr4
4W4W4W44
"""

leg(set(), stroke([(35, 47), (36, 52), (36, 55)], [1.7, 1.4, 1.4]),
    (33, 55), FOOT)

# tail: three short, fat flame tongues
tail = union(
    stroke([(17, 37), (12, 31), (10, 25)], [4.4, 3.0, 1.0]),
    stroke([(16, 40), (9, 37), (4, 32)], [4.2, 2.8, 1.0]),
    stroke([(16, 43), (9, 44), (3, 42)], [3.6, 2.4, 0.9]),
)
paint_flame(cv, tail, FLAME, outline="r")

torso = union(
    shape([(36, 28), (40.5, 32), (42, 38), (39.5, 44), (33, 48), (24, 48.5), (17, 46), (13, 42),
           (16.5, 36.5), (23, 32), (30, 28.5)]),
    stroke([(36, 21), (35, 26), (33, 30)], [5.0, 5.5, 6.0]),
)
paint_form(cv, torso, BODY, [0.8, 0.48, 0.22], R=6, outline="4", tilt=0.25, sel="r")
inner = {p for p in torso if cv.get(*p) != "4"}
bib = shape([(38, 20), (41.5, 21), (43, 30), (43, 40), (39, 45), (35, 45), (34.5, 38), (36, 30)]) & inner  # noqa
paint_form(cv, bib, ["c", "y", "o", "o"], [0.8, 0.5, 0.25], R=4, outline=None, tilt=0.3)

leg(stroke([(25, 45), (25, 48)], [3.2, 2.8]), stroke([(25, 49), (25, 55), (24, 57)], [1.8, 1.5, 1.5]),
    (21, 57), FOOT)

# folded wing: one shape, three pointed flight-feather tips toward the tail, feather lines inside
wing = union(
    shape([(26.5, 33), (30.5, 36.5), (29, 41), (24, 44), (19, 44.5), (16.5, 41), (18.5, 36.5), (23, 33.5)]),
    stroke([(20, 38), (14, 37), (10, 35)], [2.6, 1.8, 0.8]),
    stroke([(20, 41), (13.5, 41.5), (9.5, 40.5)], [2.6, 1.8, 0.8]),
    stroke([(21, 43), (15, 45), (11, 45.5)], [2.4, 1.6, 0.8]),
)
paint_form(cv, wing, ["1", "2", "a", "r"], [0.8, 0.5, 0.22], R=3, outline="4", tilt=0.2, sel="r")
win = {p for p in wing if cv.get(*p) != "4"}
line(cv, [(19, 39.5), (15, 39.2), (12, 38.5)], "r", win)
line(cv, [(20, 42.3), (16, 43.2), (13, 43.4)], "r", win)
line(cv, [(26, 37), (23, 40), (20, 41)], "3", win)  # edge of the covert feathers

# crest: one fire shape behind the crown with three tongues curling back
crest = union(
    stroke([(36, 10), (32, 5), (28, 1)], [4.2, 3.0, 1.0]),
    stroke([(32, 12), (25, 9), (19, 9)], [4.4, 3.2, 1.0]),
    stroke([(31, 17), (24, 18), (19, 21)], [4.0, 2.8, 1.0]),
)
paint_flame(cv, crest, FLAME, outline="r")

head = shape([(31, 8.5), (38, 7), (43.5, 9), (46.5, 13.5), (46.5, 18.5), (43, 23), (37, 25), (31.5, 24),
              (28, 20), (28, 13.5)])
paint_form(cv, head, ["c", "y", "o", "3"], [0.82, 0.45, 0.16], R=6, outline="4", tilt=0.2, sel="o")
upper = poly([(42.5, 14), (46.5, 13.5), (52, 18.5), (50.5, 19.5), (42, 19.5)])
paint_form(cv, upper, ["W", "c", "y", "o"], [0.7, 0.4, 0.15], R=2, outline="4")
lower = poly([(42.5, 19.5), (49, 19.5), (44.5, 22)])
paint_form(cv, lower, ["c", "o", "o"], [0.6, 0.3], R=1.5, outline="4")
stamp(cv, 36, 11, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 45, 12, "4\nK\nK")
stamp(cv, 35, 19, "aa")
outline_outer(cv, "4")
for xy, f in FEET:
    stamp(cv, *xy, f)
save(cv, OUT)
