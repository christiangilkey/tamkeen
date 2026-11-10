"""95 cat-ferret v2: compact like the pick - big head, long low ferret body, short legs. Purple fur
where the pick has it (ears, forehead fringe, mane down the nape and along the back), purple cable
tail ending in a connector plug with a pink light; yellow face and belly. Three-quarter view."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "cat_ferret_v2.txt"
cv = Canvas(56, 64)
FUR = ["1", "2", "3", "3"]
PUR = ["c", "y", "o", "o"]


def union(*m):
    s = set()
    for x in m:
        s |= x
    return s


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


# cable tail: coil rising behind, connector plug at the end
cable = stroke([(16, 46), (9, 47), (4, 42), (4.5, 35), (9.5, 31.5), (14, 33), (13, 37)],
               [2.6, 2.3, 2.1, 2.1, 2.0, 2.0, 1.9])
paint_form(cv, cable, PUR, [0.75, 0.4, 0.1], R=2, outline="4", sel="o")
ci = inner(cable)
for p in [(4, 38), (6, 32), (12, 32), (8, 46), (13, 46)]:
    if p in ci:
        cv.set(*p, "a")

# far legs (short)
for pts in ([(23, 49), (23.5, 54)], [(38, 48), (39, 54)]):
    paint_form(cv, stroke(pts, [2.6, 2.3]), ["2", "3", "3"], [0.6, 0.3], R=2, outline="4")
stamp(cv, 21, 54, "4334\n.44.")
stamp(cv, 37, 54, "4334\n.44.")

# long low body
body = shape([(18, 40), (28, 38), (37, 38.5), (42, 42), (41.5, 48), (36, 51), (24, 51.5), (16.5, 50.5), (13, 46.5), (14.5, 42)])
paint_form(cv, body, FUR, [0.8, 0.42, 0.14], R=7, outline="4", tilt=0.15, sel="3")
bi = inner(body)
back = shape([(12, 41), (20, 36.5), (30, 35.5), (39, 37), (40.5, 41), (31, 41.5), (21, 43), (13, 46)]) & bi
paint_form(cv, back, PUR, [0.72, 0.4, 0.12], R=3, outline=None) if back else None
for p in shape([(27, 47), (39, 45.5), (37.5, 50), (26, 50.5)]) & bi:  # pale belly
    cv.set(*p, "1")
# fur tufts sticking up along the back
for x in (17, 23, 29, 35):
    t = stroke([(x + 1, 39), (x - 2, 35)], [2.0, 0.7])
    paint_form(cv, t, PUR, [0.7, 0.35], R=1.5, outline="4", sel="o")

# near legs: a rounded haunch with a paw, a short fore leg
haunch = shape([(14, 44.5), (21, 44), (23, 49), (21.5, 54.5), (16.5, 55), (14, 50.5)])
paint_form(cv, haunch, FUR, [0.8, 0.45, 0.18], R=4, outline="4", tilt=0.2, sel="3")
line(cv, [(16, 46.5), (19, 46), (21, 48)], "c", inner(haunch))  # purple fur on the hip
paint_form(cv, stroke([(33, 47), (32.5, 55)], [3.0, 2.6]), FUR, [0.8, 0.45, 0.2], R=2.5, outline="4", sel="3")
stamp(cv, 14, 55, ".41114.\n4112224\n.44444.")
stamp(cv, 30, 55, ".4114.\n411224\n.4444.")

# mane down the nape (behind the head)
mane = union(stroke([(36, 27), (31, 31), (27, 37)], [4.0, 3.6, 2.4]), stroke([(35, 32), (31, 37)], [3.0, 1.6]))
paint_form(cv, mane, PUR, [0.75, 0.4, 0.12], R=3, outline="4", sel="o")

# ears with purple fur tufts and pink insides
far_ear = poly([(46, 20), (51.5, 7), (53.5, 23)])
paint_form(cv, far_ear, PUR, [0.7, 0.35, 0.1], R=2, outline="4")
for p in poly([(48.5, 19), (51, 11.5), (52.4, 21)]):
    cv.set(*p, "r")
near_ear = poly([(33, 25), (30, 7), (42.5, 19.5)])
paint_form(cv, near_ear, PUR, [0.75, 0.4, 0.1], R=2.5, outline="4", sel="o")
for p in poly([(34.3, 22), (32.2, 11.5), (39.5, 19.5)]):
    cv.set(*p, "a")

# big head
head = shape([(32, 26), (35.5, 20.5), (42, 18.5), (49, 20), (53, 25.5), (52.5, 31.5), (48, 36), (41, 37.5), (35, 35.5), (31.5, 31)])
paint_form(cv, head, FUR, [0.8, 0.42, 0.14], R=7, outline="4", tilt=0.2, sel="3")
hi = inner(head)
for p in shape([(45, 28.5), (52.5, 28), (52, 32), (47.5, 35.5), (42.5, 34.5)]) & hi:  # pale muzzle
    cv.set(*p, "1")
# purple forehead fringe, swept back
fringe = union(stroke([(42, 20), (39, 17.5), (36, 17.5)], [2.0, 1.4, 0.6]), stroke([(45, 20), (44.5, 17), (42.5, 15)], [1.7, 1.2, 0.6]))
paint_form(cv, fringe, PUR, [0.75, 0.4, 0.1], R=2, outline="4", sel="o")

# face
stamp(cv, 39, 24, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 49, 25, "4\nK\nK")
stamp(cv, 51, 28, "aa4\n.44")
stamp(cv, 48, 32, "4.4\n.4.")
stamp(cv, 37, 30, "aa")
outline_outer(cv, "4")
# connector plug with pink light at the cable end
stamp(cv, 9, 36, """
.4444.
4ooao4
4oaWo4
.4444.
.W..W.
""")
save(cv, OUT)
