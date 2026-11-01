"""Dragon whelp v2 (pick 119): golden young dragon in a low crouch, head raised. One clean form for
body and near legs (only meaningful separation lines), a gold spiky crest/mane behind the head,
folded bat wing, curled tail ending in a flame edged with brown. Three-quarter view, facing right."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, paint_flame, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "dragon_whelp_v2.txt"
cv = Canvas(56, 64)
SCALE = ["1", "2", "3", "3"]


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def gold(mask, R=4, tilt=0.2, outline="4"):
    paint_form(cv, mask, SCALE, [0.78, 0.45, 0.2], R=R, outline=outline, tilt=tilt, sel="3")


FEET = []
FOOT = """
.4224.
422224
4W4W4W
"""

# far front leg (right, higher), behind the body
gold(stroke([(43, 46), (44, 51), (44, 53)], [2.8, 2.4, 2.2]), R=2.5)
FEET.append(((42, 52), FOOT))

# far wing peeking up behind the back
fw = poly([(38, 37), (36, 26), (33, 29), (31.5, 34)])
paint_form(cv, fw, ["a", "r", "r"], [0.6, 0.3], R=2, outline="4")

# tail curled round on the ground behind, ending in a flame with a brown edge
flame = union(stroke([(8, 39), (11, 33), (10, 27)], [3.4, 2.4, 0.8]), stroke([(7, 39), (4, 34), (5, 30)], [2.6, 1.8, 0.7]))
paint_flame(cv, flame, ["a", "2", "1", "c", "W"], outline="r")
tail = stroke([(16, 47), (9, 50), (4, 47), (4, 41), (8, 38)], [4.4, 3.6, 3.0, 2.4, 1.8])
gold(tail, R=3)
tin = {p for p in tail if cv.get(*p) != "4"}
for a, b in (((9, 47), (10, 52)), ((3, 44), (7, 45)), ((3, 40), (7, 41))):
    line(cv, [a, b], "a", tin, smooth=False)

# body, neck, near haunch with its hind foot, near front leg: one form
mass = union(
    shape([(43, 37), (46, 42), (45, 48), (40, 51), (30, 53), (20, 52.5), (14, 48), (14.5, 42), (20, 38), (30, 36.5),
           (38, 36)]),
    stroke([(40, 40), (42, 34), (43, 29)], [6.0, 5.0, 4.6]),
    stroke([(21, 50), (26, 53), (30, 53.5)], [2.8, 2.4, 2.2]),
    stroke([(37, 45), (37, 51), (37, 54)], [3.4, 2.9, 2.7]),
)
gold(mass, R=6, tilt=0.25)
inm = {p for p in mass if cv.get(*p) != "4"}
belly = shape([(43, 27), (46.5, 33), (46, 42), (43, 47), (40, 49), (39, 44), (41, 39), (41, 31)]) & inm
paint_form(cv, belly, ["c", "y", "o", "o"], [0.8, 0.5, 0.25], R=3, outline=None, tilt=0.3)
line(cv, [(23, 41), (27.5, 45), (26, 50.5)], "3", inm)     # front edge of the folded haunch
line(cv, [(34.5, 47), (34.5, 52)], "3", inm, smooth=False)  # back edge of the front leg
for pts in (((20, 39), (21, 43)), ((25, 37.5), (26, 41)), ((30, 37), (31, 40)), ((35, 37), (36, 40))):
    line(cv, list(pts), "a", inm, smooth=False)
    line(cv, [(x + 1, y) for x, y in pts], "r", inm, smooth=False)
stamp(cv, 29, 53, "W.W")
FEET.append(((35, 54), FOOT))

# near wing folded on the back
wing = poly([(34, 38), (28, 27), (21, 26), (23, 30), (19, 32), (22, 35), (20, 38), (27, 39.5)])
paint_form(cv, wing, ["a", "a", "r", "r"], [0.7, 0.45, 0.2], R=3, outline="4")
win = {p for p in wing if cv.get(*p) != "4"}
line(cv, [(28, 28), (20, 32)], "3", win, smooth=False)
line(cv, [(29, 30), (21, 37)], "3", win, smooth=False)
gold(stroke([(34, 38), (28, 27), (22, 26)], [1.6, 1.3, 0.8]), R=1.5)

# gold spiky crest behind the head, flame-like
crest = union(
    stroke([(42, 18), (40, 11), (38, 6)], [3.0, 2.0, 0.7]),
    stroke([(40, 20), (35, 15), (30, 13)], [3.2, 2.2, 0.7]),
    stroke([(39, 24), (33, 22), (28, 23)], [3.0, 2.0, 0.7]),
    stroke([(40, 27), (35, 29), (31, 32)], [2.6, 1.8, 0.7]),
    stroke([(46, 17), (46, 12), (44, 8)], [2.2, 1.5, 0.6]),
)
paint_flame(cv, crest, ["3", "2", "1", "c"], outline="4")

# head: wedge, snout toward us and to the right
head = shape([(37, 21), (41.5, 17.5), (47.5, 18), (51.5, 21.5), (54, 25.5), (53, 29), (47.5, 31), (41, 31),
              (37, 27.5)])
gold(head, R=5)
inh = {p for p in head if cv.get(*p) != "4"}
jaw = shape([(46, 28), (53, 27), (52.5, 29.5), (46.5, 31.5), (40, 31.5), (40, 29)]) & inh
paint_form(cv, jaw, ["c", "y", "o"], [0.6, 0.3], R=2, outline=None)
line(cv, [(44, 28), (48, 28), (52, 27)], "4", inh, smooth=False)
stamp(cv, 42, 20, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 50, 21, "4\nK\nK")
stamp(cv, 52, 24, "K")
stamp(cv, 42, 26, "aa")
outline_outer(cv, "4")
for xy, f in FEET:
    stamp(cv, *xy, f)
save(cv, OUT)
