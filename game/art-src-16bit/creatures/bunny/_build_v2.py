"""Cyber bunny v2 (pick 88): compact upright sitting bunny, three-quarter view facing right.
Fewer, cleaner forms: torso+neck+haunch are one form (haunch shown by a shade line, not an
outline), one near arm, pale belly/muzzle plane, neon ear stripes and a glowing collar."""
import sys
from draw2 import Canvas, shape, stroke, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "bunny2.txt"
cv = Canvas(56, 64)
COAT = ["1", "2", "3", "3"]
FEET = ["1", "2", "3", "3"]
PALE = ["c", "y", "o", "o"]


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


def part(mask, ramp=COAT, R=3, sel="3", cuts=(0.8, 0.48, 0.2), tilt=0.2, outline="4"):
    paint_form(cv, mask, ramp, list(cuts), R=R, outline=outline, tilt=tilt, sel=sel)


def ear(pts, w, stripe):
    m = stroke(pts, [w * 0.7, w, w * 0.9, w * 0.35])
    part(m, R=2.5)
    line(cv, stripe, "a", inner(m))


# behind the body: far foot, far arm, puff tail, far ear
part(shape([(34, 51), (41, 51), (42.5, 53), (41, 55), (34, 54.5)]), ramp=FEET, R=1.5)
part(stroke([(38, 35), (40.5, 39), (41, 41.5)], [2.0, 1.8, 1.9]), R=1.5)
part(shape([(16, 46), (19, 44), (22.5, 46), (22, 50.5), (18.5, 51.5), (15.5, 49.5)]), ramp=PALE, R=3, sel="o")
ear([(36, 18), (38, 11), (40, 6), (43, 2)], 3.0, [(37, 15), (39, 9), (41, 5)])

# one torso: neck, body and haunch together
torso = shape([(28, 30), (35, 30), (39.5, 35), (40, 43), (38, 50), (33, 54), (25, 54.5), (20, 51), (19.5, 45),
               (22.5, 37)]) | stroke([(31.5, 26), (31.5, 31)], [4.8, 5.4])
part(torso, R=7, tilt=0.18, cuts=(0.85, 0.5, 0.22))
ins = inner(torso)
belly = shape([(34, 26), (37, 28.5), (39, 35), (39.5, 43), (37.5, 49), (34, 51.5), (32, 45), (32.5, 35)]) & ins
paint_form(cv, belly, PALE, [0.78, 0.42, 0.2], R=4, outline=None, tilt=0.3)
line(cv, [(21.5, 42), (26, 40.5), (29.5, 44), (29.5, 49), (27.5, 52.5)], "3", ins - belly)  # haunch
line(cv, [(27.5, 31), (31, 32.5), (35, 32.8), (38, 32)], "a", ins)                          # neon collar
stamp(cv, 34, 33, "W")                                                                     # collar light
line(cv, [(23, 46), (25, 46), (26, 48)], "a", ins - belly, smooth=False)                    # circuit line
stamp(cv, 26, 48, "W")

# near foot and near arm (the only inner outlines)
part(shape([(21.5, 53), (31, 53), (35, 55.5), (33.5, 58), (23, 58), (21, 56)]), ramp=FEET, R=1.5)
part(stroke([(27.5, 34.5), (29.5, 38.5), (33.5, 40)], [2.5, 2.1, 1.9]), R=2.5, cuts=(0.75, 0.42, 0.15))

# near ear and head
ear([(30, 18), (28, 11), (26, 5), (25, 0)], 3.6, [(29.5, 15), (27.5, 9), (26.2, 4)])
head = shape([(26, 20), (30, 16), (36, 15.5), (41, 18), (44.5, 22.5), (43.5, 26.5), (38, 29.5), (31, 30),
              (26.5, 27)])
part(head, R=6, cuts=(0.86, 0.5, 0.2))
muzzle = shape([(37.5, 21.5), (44, 22.5), (43.5, 26.5), (39, 28.8), (36, 26)]) & inner(head)
paint_form(cv, muzzle, PALE, [0.6, 0.3, 0.15], R=2, outline=None)
stamp(cv, 43, 23, "oo\no.")
stamp(cv, 41, 26, "o3")
stamp(cv, 31, 19, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 40, 20, "4\nK\nK")
outline_outer(cv, "4")
save(cv, OUT)
