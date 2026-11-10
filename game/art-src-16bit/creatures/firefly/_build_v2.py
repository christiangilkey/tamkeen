"""54 firefly beetle v2: a beetle, not a bee. Hard shiny black-olive wing cases (two halves, slightly
parted at the back with a hint of membrane wing), chunky armour, glowing yellow tail segments with a
white-hot core, yellow face with a brow under the helmet plate, antennae. Floater, three-quarter view."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "firefly_v2.txt"
cv = Canvas(56, 64)
ARM = ["1", "2", "3", "3"]
GLOW = ["c", "y", "o", "o"]


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


# far legs (thick, bent, dangling)
for pts in ([(42, 39), (45, 42), (47, 45)],):
    paint_form(cv, stroke(pts, [1.8, 1.5, 1.3]), ["2", "3", "3"], [0.6, 0.3], R=1.5, outline="4")

# glowing tail segments under the back of the wing cases
lantern = shape([(26, 39), (29, 46), (25.5, 53), (17, 54), (10, 49), (9.5, 42), (15, 39)])
paint_form(cv, lantern, GLOW, [0.72, 0.38, 0.12], R=6, outline="4", sel="o")
li = inner(lantern)
for pts in ([(10, 45), (18, 48), (28, 46)], [(12, 50), (19, 52), (26, 50)]):
    line(cv, pts, "o", li)
for p in [(14, 47), (15, 47), (16, 47), (13, 48), (14, 48), (15, 46)]:  # white-hot core
    if p in li:
        cv.set(*p, "W")

# a hint of membrane wing peeking out where the cases part
mem = stroke([(19, 32), (11, 29.5), (5, 26)], [3.0, 2.4, 1.2])
paint_form(cv, mem, ["W", "c", "c"], [0.6, 0.3], R=1.5, outline="4")

# far wing case: the strip along the top of the back
far_case = shape([(32, 21.5), (37, 24), (33, 28.5), (23, 31), (13, 34), (10, 32), (15, 27), (24, 23)])
paint_form(cv, far_case, ARM, [0.7, 0.42, 0.18], R=4, outline="4", sel="2")
# near wing case: the big shell over our side, parted from the far case at the back
near_case = shape([(34, 26), (38.5, 32), (35.5, 40), (26, 45.5), (15.5, 45), (10.5, 39), (14, 34), (23, 30.5)])
paint_form(cv, near_case, ARM, [0.76, 0.46, 0.2], R=7, outline="4", tilt=0.25, sel="2")
ni = inner(near_case)
line(cv, [(33, 28), (24, 32), (15, 36)], "1", ni)           # thin lit edge along the seam
for p in [(29, 33), (28, 34), (27, 34), (30, 32), (22, 35), (21, 36)]:  # gloss
    if p in ni:
        cv.set(*p, "W")
line(cv, [(35, 34), (30, 39), (22, 42)], "2", ni)           # ridge on the case

# thorax plate
thorax = shape([(30, 22), (37, 20.5), (41.5, 24), (40.5, 30.5), (35, 33), (30.5, 29)])
paint_form(cv, thorax, ARM, [0.72, 0.42, 0.16], R=4, outline="4", sel="2")

# near legs
for pts in ([(31, 44), (30.5, 48.5), (33, 51.5)], [(38, 41), (39.5, 45.5), (42.5, 48)]):
    paint_form(cv, stroke(pts, [2.0, 1.6, 1.4]), ARM, [0.7, 0.4], R=1.5, outline="4")

# head: yellow face, flatter brow, a cheek corner
head = shape([(36, 28), (42, 25.5), (48.5, 27.5), (51.5, 32), (50, 37.5), (45, 41), (38, 40.5), (35, 35)])
paint_form(cv, head, GLOW, [0.75, 0.4, 0.14], R=5, outline="4", tilt=0.2, sel="o")
helmet = shape([(34.5, 30), (37.5, 24.5), (43.5, 22), (49.5, 24), (52, 28.5), (46, 28), (40, 28.5), (36.5, 32)])
paint_form(cv, helmet, ARM, [0.72, 0.4, 0.15], R=3, outline="4", sel="2")
for p in [(41, 24), (42, 24), (43, 23)]:
    cv.set(*p, "W")
line(cv, [(40, 29), (45, 28.6), (50, 29)], "o", inner(head))  # brow shadow under the plate
line(cv, [(49.5, 34), (48, 37.5), (45, 39.5)], "o", inner(head))  # cheek

# antennae from the helmet, glowing tips
line(cv, [(46, 23), (50, 17), (53, 14)], "3")
line(cv, [(42, 22), (43, 15), (46, 10)], "3")
TIP = """
.4
4y4
.4
"""
stamp(cv, 52, 13, TIP)
stamp(cv, 45, 9, TIP)

# face
stamp(cv, 39, 30, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 48, 31, "4\nK\nK")
stamp(cv, 37, 36, "aa")
stamp(cv, 46, 37, "4.4\n.4.")
outline_outer(cv, "4")
save(cv, OUT)
