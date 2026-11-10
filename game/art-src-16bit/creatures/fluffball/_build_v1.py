"""Fluffball (pick 74, cyberpunk fire): a pink fluffy fox-like biped with a peach face, pointed ears,
headphones with glowing cups, a glowing chest badge and a big flame-tufted tail.
Three-quarter view facing right."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, paint_flame, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "fluffball.txt"
cv = Canvas(56, 64)
FUR = ["1", "2", "3", "3"]
FACE = ["c", "y", "o", "o"]


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def fur(mask, R=4, tilt=0.2, ramp=FUR):
    paint_form(cv, mask, ramp, [0.78, 0.45, 0.2], R=R, outline="4", tilt=tilt, sel="3")


FEET = []
FOOT = """
.43334.
4333334
4444444
"""

# far leg (right, higher)
fur(stroke([(35, 48), (36, 52), (36, 55)], [2.8, 2.2, 2.0]), R=2)
FEET.append(((33, 54), FOOT))

# big fluffy tail rising behind: one plume ending in three fat flame-like tufts
tail = union(
    stroke([(24, 45), (16, 43), (11, 37), (10, 30)], [4.5, 6.0, 6.0, 4.5]),
    stroke([(10, 30), (9, 23), (13, 17)], [4.5, 3.2, 1.0]),
    stroke([(8, 31), (3, 27), (2, 21)], [4.0, 2.8, 1.0]),
    stroke([(13, 29), (18, 24), (19, 18)], [3.6, 2.6, 1.0]),
)
fur(tail, R=6)
tin = {p for p in tail if cv.get(*p) != "4"}
line(cv, [(18, 41), (13, 36), (11, 30), (10, 24)], "3", tin)
line(cv, [(14, 35), (8, 30), (5, 25)], "3", tin)

# body: compact upright torso, chest turned toward us with a pale fluffy front
body = shape([(31, 31), (37, 33), (40, 38), (39.5, 45), (36, 50), (28, 51.5), (23, 48.5), (22.5, 41), (25, 35)]) | stroke([(35, 24), (34, 28), (32, 33)], [5.0, 5.5, 6.0])
fur(body, R=6, tilt=0.25)
inb = {p for p in body if cv.get(*p) != "4"}
chest = shape([(36, 25), (40, 27), (41, 34), (40.5, 41), (38, 46), (34, 47), (33, 39), (34, 30)]) & inb
paint_form(cv, chest, ["c", "1", "1", "2"], [0.85, 0.55, 0.3], R=4, outline=None, tilt=0.3)

# near leg (left, lower)
fur(stroke([(27, 47), (26, 52), (25, 56)], [3.6, 2.6, 2.2]), R=2.5)
FEET.append(((22, 55), FOOT))

# chest badge on a strap
stamp(cv, 33, 39, """
44444
4aaW4
4aaa4
44444
""")

# near arm, paw resting by the badge
fur(stroke([(27, 37), (27, 42), (31, 44)], [2.7, 2.3, 2.2]), R=2)

# far ear and far headphone cup, behind the head
fur(stroke([(40, 11), (42, 6), (43, 1)], [3.0, 2.2, 0.8]), R=2)
cup_far = shape([(43, 15), (46.5, 15), (48, 18.5), (46.5, 22), (43.5, 21.5), (42, 18.5)])
paint_form(cv, cup_far, ["2", "3", "3"], [0.7, 0.3], R=2, outline="4")

# cheek fluff and mane behind the face
mane = union(
    stroke([(29, 13), (22, 10), (16, 11)], [4.0, 3.0, 1.0]),
    stroke([(27, 19), (20, 19), (15, 22)], [4.0, 3.0, 1.0]),
    stroke([(28, 25), (22, 28), (19, 32)], [3.6, 2.6, 0.9]),
)
fur(mane, R=3)

# head: peach face, fox muzzle toward us and to the right
head = shape([(28, 12), (33, 9), (39, 9.5), (43.5, 13), (46, 17.5), (49, 21), (47.5, 24.5), (42, 27),
              (36, 29), (30, 27.5), (26.5, 22), (26, 16)])
paint_form(cv, head, FACE, [0.8, 0.42, 0.18], R=6, outline="4", tilt=0.2, sel="o")
# pink fur over the crown, with a tuft on the forehead
cap = (shape([(26, 17), (27, 10), (33, 6.5), (40, 7), (43, 11), (39, 11.5), (35, 13.5), (31, 14), (29, 18)])
       | stroke([(35, 9), (38, 6), (41, 6)], [2.0, 1.6, 0.8]))
fur(cap, R=3)

# near ear: pointed, coral inside
ear = stroke([(32, 10), (31, 5), (29, 0)], [3.4, 2.6, 0.8])
fur(ear, R=2)
stamp(cv, 30, 3, ".r\nrr\nrr\n.r")

# headphone band and the near cup on the cheek
line(cv, [(30, 21), (28, 14), (31, 7), (37, 5), (42, 8), (45, 15)], "4")
cup = shape([(25.5, 17.5), (30.5, 17), (32.5, 21), (31, 25.5), (26.5, 26), (24.5, 22)])
paint_form(cv, cup, ["1", "2", "3", "3"], [0.75, 0.4, 0.15], R=2.5, outline="4")
stamp(cv, 27, 19, """
.rr.
rraW
rrar
.rr.
""")

# face: near eye with a lid, far eye a sliver, nose at the muzzle tip, small mouth, blush
stamp(cv, 36, 14, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 45, 15, "4\nK\nK")
stamp(cv, 48, 20, "KK\nK.")
stamp(cv, 43, 24, "4.4\n.4.")
stamp(cv, 35, 21, "rr")
outline_outer(cv, "4")
for xy, f in FEET:
    stamp(cv, *xy, f)
save(cv, OUT)
