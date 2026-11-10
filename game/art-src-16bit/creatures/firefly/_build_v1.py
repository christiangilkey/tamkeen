"""54 firefly beetle: black armoured shell, yellow face, glowing yellow lantern abdomen, clear wings
raised behind, two antennae with glowing tips. Floater; three-quarter view facing right."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "firefly.txt"
cv = Canvas(56, 64)
ARM = ["1", "2", "3", "3"]      # glossy black armour
GLOW = ["c", "y", "o", "o"]


def union(*m):
    s = set()
    for x in m:
        s |= x
    return s


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


# wings, raised behind the shell (far wing first)
far_wing = shape([(30, 27), (32, 13), (38, 7), (41.5, 10), (39, 21), (34, 29)])
paint_form(cv, far_wing, ["c", "c", "1"], [0.6, 0.2], R=3, outline="4")
near_wing = shape([(25, 28), (17, 15), (9, 9), (5.5, 13), (10, 23), (20, 31)])
paint_form(cv, near_wing, ["W", "c", "c"], [0.6, 0.3], R=3, outline="4")
line(cv, [(23, 27), (15, 18), (8, 12)], "1", inner(near_wing))
line(cv, [(33, 26), (37, 16), (42, 10)], "1", inner(far_wing))

# far legs (thin, dangling)
for pts in ([(40, 39), (42, 42), (42, 45)],):
    paint_form(cv, stroke(pts, [1.2, 1.0, 0.9]), ["2", "3", "3"], [0.6, 0.3], R=1, outline="4")

# glowing lantern abdomen at the back, with segment bands
lantern = shape([(21, 35), (27, 38), (28.5, 45), (25, 51.5), (18, 52.5), (12.5, 48), (12.5, 41), (15, 36.5)])
paint_form(cv, lantern, GLOW, [0.72, 0.38, 0.12], R=6, outline="4", sel="o")
li = inner(lantern)
for pts in ([(14, 43), (19, 45.5), (27, 44)], [(15, 48.5), (20, 50), (26, 48.5)]):
    line(cv, pts, "o", li)
for p in [(14, 45), (15, 45), (16, 45), (14, 46), (15, 46)]:  # hot glow spot
    if p in li:
        cv.set(*p, "W")

# thorax/neck and the armoured wing-case shell over the back
shell = shape([(19, 27), (29, 23.5), (36, 26.5), (37.5, 33), (32, 39.5), (24, 41.5), (16, 39.5), (12.5, 35), (14, 30)])
paint_form(cv, shell, ARM, [0.78, 0.48, 0.2], R=6, outline="4", tilt=0.2, sel="2")
si = inner(shell)
line(cv, [(34, 26), (26, 33), (17, 38)], "4", si)  # split between the two wing cases
for p in [(20, 29), (21, 29), (22, 28), (23, 28), (19, 30), (25, 27), (26, 27)]:  # gloss
    if p in si:
        cv.set(*p, "W")

# near legs
for pts in ([(30, 40), (29, 44), (31, 47)], [(36, 40), (36.5, 44), (38.5, 46.5)]):
    paint_form(cv, stroke(pts, [1.4, 1.1, 1.0]), ARM, [0.7, 0.4], R=1, outline="4")

# head: yellow face under a black helmet plate
head = shape([(33.5, 29), (39, 25.5), (45.5, 26.5), (50, 31), (49.5, 35), (44.5, 39.5), (37, 39.5), (33, 34.5)])
paint_form(cv, head, GLOW, [0.75, 0.4, 0.14], R=6, outline="4", tilt=0.2, sel="o")
helmet = shape([(33, 31), (36, 26), (42, 23.5), (47.5, 25.5), (49.5, 29.5), (44, 28.5), (39, 29), (35, 32.5)])
paint_form(cv, helmet, ARM, [0.72, 0.4, 0.15], R=3, outline="4", sel="2")
for p in [(39, 25), (40, 25), (41, 24)]:
    cv.set(*p, "W")

# antennae (far, then near), glowing tips
line(cv, [(45, 26), (49, 21), (53, 18)], "3")
line(cv, [(41, 25), (43, 18), (47, 13)], "3")
TIP = """
.4
4y4
.4
"""
stamp(cv, 52, 17, TIP)
stamp(cv, 46, 12, TIP)

# face
stamp(cv, 38, 30, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 47, 31, "4\nK\nK")
stamp(cv, 36, 36, "aa")             # red cheek spots, like the pick
stamp(cv, 45, 36, "4.4\n.4.")       # small mouth
outline_outer(cv, "4")
save(cv, OUT)
