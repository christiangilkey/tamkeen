"""95 cyberpunk cat-ferret: sleek yellow ferret-cat, tall purple ears, a purple fur tuft, coiled purple
cable tail ending in a glowing pink plug. Three-quarter view facing right."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "cat_ferret.txt"
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


def limb(pts, rad, near=True):
    paint_form(cv, stroke(pts, rad), FUR if near else ["2", "3", "3"], [0.8, 0.45, 0.2] if near else [0.6, 0.3],
               R=2.5, outline="4", sel="3" if near else None)


# cable tail: a coil rising behind the rump, plug at the end
cable = stroke([(18, 44), (11, 45), (5, 41), (4, 34), (8, 29), (14, 30), (15, 35), (11, 38)],
               [2.4, 2.2, 2.0, 2.0, 2.0, 1.9, 1.8, 1.8])
paint_form(cv, cable, PUR, [0.75, 0.4, 0.1], R=2, outline="4", sel="o")
ci = inner(cable)
for p in [(5, 37), (6, 31), (11, 29), (8, 44), (14, 45)]:  # cable bands
    if p in ci:
        cv.set(*p, "a")

# far legs (right side, higher)
limb([(26, 48), (27, 52), (27, 55)], [2.6, 2.0, 1.8], near=False)
limb([(39, 47), (40, 52), (40, 55)], [2.6, 2.0, 1.8], near=False)
stamp(cv, 25, 55, "4334\n.44.")
stamp(cv, 38, 55, "4334\n.44.")

# body: long and low, chest toward us on the right
body = shape([(22, 40.5), (29, 39), (36, 39), (41, 41.5), (41, 46), (36, 49), (26, 50), (19, 49), (16, 45.5), (18, 41.5)])
paint_form(cv, body, FUR, [0.78, 0.4, 0.12], R=7, outline="4", tilt=0.15, sel="3")
bi = inner(body)
for pts in ([(21, 41), (22, 45)], [(25.5, 39.5), (26.5, 43.5)], [(30, 39), (30.5, 42.5)]):  # purple stripes
    line(cv, pts, "y", bi, smooth=False)
for p in shape([(31, 46), (39, 45), (37, 49), (30, 50)]) & bi:  # pale belly
    cv.set(*p, "1")

# near legs (left side, lower): hind with a thigh, fore leg slim
paint_form(cv, shape([(17.5, 43), (23.5, 43.5), (24, 49), (22, 56), (19, 56), (18.5, 50)]), FUR, [0.8, 0.45, 0.2], R=3, outline="4", sel="3")
limb([(34, 46), (33.5, 51), (33, 56)], [2.8, 2.3, 2.1])
stamp(cv, 17, 56, ".4114.\n411224\n.4444.")
stamp(cv, 30, 56, ".4114.\n411224\n.4444.")

# collar: a band of purple fur at the base of the neck
collar = stroke([(35, 36), (38.5, 39.5), (42, 40)], [2.2, 2.4, 1.8])
paint_form(cv, collar, PUR, [0.75, 0.4, 0.1], R=2, outline="4", sel="o")

# ears: far ear behind the head, near ear tall and swept back; pink insides
far_ear = poly([(44.5, 24), (50, 11), (51.5, 26)])
paint_form(cv, far_ear, PUR, [0.7, 0.35, 0.1], R=2, outline="4")
near_ear = poly([(33.5, 27), (31.5, 10), (42, 22)])
paint_form(cv, near_ear, PUR, [0.75, 0.4, 0.1], R=2.5, outline="4", sel="o")
for p in poly([(35, 24), (33.6, 14.5), (39.5, 22)]):
    cv.set(*p, "a")
for p in poly([(47.5, 23), (49.6, 15.5), (50.4, 24)]):
    cv.set(*p, "r")

# head: wedge muzzle toward us and to the right
head = shape([(33.5, 27), (37, 22.5), (43, 21.5), (48.5, 23.5), (52, 28.5), (51, 33), (46.5, 36.5), (40, 37.5), (35, 35.5), (32.5, 31.5)])
paint_form(cv, head, FUR, [0.8, 0.42, 0.14], R=6, outline="4", tilt=0.2, sel="3")
hi = inner(head)
for p in shape([(44.5, 29.5), (51, 29), (51, 33), (46.5, 36), (42.5, 34.5)]) & hi:  # pale muzzle
    cv.set(*p, "1")
# small purple tuft on the crown, swept back
tuft = union(stroke([(42, 23), (39, 19), (36, 18)], [2.2, 1.6, 0.8]), stroke([(44.5, 22.5), (43.5, 18.5), (41.5, 16)], [1.9, 1.4, 0.7]))
paint_form(cv, tuft, PUR, [0.75, 0.4, 0.1], R=2, outline="4", sel="o")

# face
stamp(cv, 39, 25, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 48, 26, "4\nK\nK")
stamp(cv, 50, 29, "aa4\n.44")   # pink nose
stamp(cv, 47, 32, "4.4\n.4.")    # mouth
stamp(cv, 37, 31, "aa")          # blush
outline_outer(cv, "4")
cv.set(11, 38, "a"); cv.set(10, 38, "W"); cv.set(10, 39, "a")  # plug glow
save(cv, OUT)
