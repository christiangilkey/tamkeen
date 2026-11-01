"""Dragon whelp (pick 119, fantasy fire): a golden young dragon on all fours, brown back stripes,
swept-back horns, small raised wings, a curled tail ending in a flame. Three-quarter view, facing right."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, paint_flame, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "dragon_whelp.txt"
cv = Canvas(56, 64)
SCALE = ["1", "2", "3", "3"]
FLAME = ["2", "1", "c", "W"]


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def gold(mask, R=4, tilt=0.2):
    paint_form(cv, mask, SCALE, [0.78, 0.45, 0.2], R=R, outline="4", tilt=tilt, sel="3")


FEET = []
FOOT = """
.4224.
422224
4W4W4W
"""


def leg(pts, rad, foot_xy, R=2.5):
    gold(stroke(pts, rad), R=R)
    FEET.append((foot_xy, FOOT))


# far legs (right of each pair, higher), behind the body
leg([(27, 46), (28, 50), (28, 53)], [3.4, 2.8, 2.6], (26, 52))
leg([(42, 42), (43, 47), (43, 52)], [3.4, 2.8, 2.6], (41, 51))

# far wing, peeking up behind the back
fwing = union(poly([(36, 31), (34, 18), (31, 22), (29, 24), (31, 29)]), stroke([(36, 31), (34, 18)], [1.4, 0.8]))
paint_form(cv, fwing, ["a", "r", "r"], [0.6, 0.3], R=2, outline="4")

# tail: curls round behind and up, ending in a flame
tail = stroke([(18, 42), (10, 45), (5, 41), (5, 34), (9, 30)], [4.6, 3.8, 3.0, 2.4, 1.8])
flame = union(stroke([(9, 31), (12, 25), (11, 19)], [3.2, 2.2, 0.8]), stroke([(8, 31), (5, 26), (6, 22)], [2.4, 1.6, 0.6]))
paint_flame(cv, flame, FLAME, outline="3")
gold(tail, R=3)
tin = {p for p in tail if cv.get(*p) != "4"}
for a, b in (((9, 42), (10, 47)), ((5, 37), (9, 39)), ((4, 34), (8, 33))):
    line(cv, [a, b], "a", tin, smooth=False)

# body and neck as one form
body = union(
    shape([(41, 33), (44, 38), (42.5, 44), (36, 47), (26, 48), (18, 46), (14.5, 41), (16.5, 35), (23, 32), (32, 31)]),
    stroke([(39, 34), (41, 29), (42, 25)], [5.5, 4.8, 4.4]),
)
gold(body, R=6, tilt=0.25)
inb = {p for p in body if cv.get(*p) != "4"}
belly = shape([(42, 21), (45.5, 28), (45, 37), (42, 44), (36, 47.5), (29, 48), (31, 44.5), (37, 40), (40, 32), (40, 25)]) & inb
paint_form(cv, belly, ["c", "y", "o", "o"], [0.8, 0.5, 0.25], R=3, outline=None, tilt=0.3)
# brown stripes across the back
for pts in (((20, 34), (21, 38), (20, 41)), ((25, 32), (26, 36), (25, 39)), ((30, 31), (31, 35), (30, 38)),
            ((36, 31), (37, 34))):
    line(cv, list(pts), "a", inb)
    line(cv, [(x + 1, y) for x, y in pts], "r", inb)

# near legs (left of each pair, lower)
gold(stroke([(20, 42), (21, 47)], [5.0, 4.0]), R=4)
leg([(21, 48), (20, 52), (20, 55)], [3.2, 2.8, 2.6], (17, 54))
leg([(37, 43), (37, 49), (37, 54)], [3.6, 3.0, 2.8], (35, 53))

# near wing, raised up and back
wing = poly([(33, 33), (26, 19), (18, 17), (20, 21.5), (15, 24), (18.5, 27), (15.5, 31), (24, 34)])
paint_form(cv, wing, ["a", "a", "r", "r"], [0.7, 0.45, 0.2], R=3, outline="4")
win = {p for p in wing if cv.get(*p) != "4"}
line(cv, [(26, 20), (17, 23.5)], "3", win, smooth=False)
line(cv, [(26, 20), (17, 30)], "3", win, smooth=False)
gold(stroke([(33, 33), (26, 19), (19, 17)], [1.6, 1.3, 0.8]), R=1.5)

outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "dragon_whelp.txt"
cv = Canvas(56, 64)
SCALE = ["1", "2", "3", "3"]
FLAME = ["2", "1", "c", "W"]


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def gold(mask, R=4, tilt=0.2):
    paint_form(cv, mask, SCALE, [0.78, 0.45, 0.2], R=R, outline="4", tilt=tilt, sel="3")


FEET = []
FOOT = """
.4224.
422224
4W4W4W
"""


def leg(pts, rad, foot_xy, R=2.5):
    gold(stroke(pts, rad), R=R)
    FEET.append((foot_xy, FOOT))


# far legs (right of each pair, higher), behind the body
leg([(27, 46), (28, 50), (28, 53)], [3.4, 2.8, 2.6], (26, 52))
leg([(42, 42), (43, 47), (43, 52)], [3.4, 2.8, 2.6], (41, 51))

# far wing, peeking up behind the back
fwing = union(poly([(36, 31), (34, 18), (31, 22), (29, 24), (31, 29)]), stroke([(36, 31), (34, 18)], [1.4, 0.8]))
paint_form(cv, fwing, ["a", "r", "r"], [0.6, 0.3], R=2, outline="4")

# tail: curls round behind and up, ending in a flame
tail = stroke([(18, 42), (10, 45), (5, 41), (5, 34), (9, 30)], [4.6, 3.8, 3.0, 2.4, 1.8])
flame = union(stroke([(9, 31), (12, 25), (11, 19)], [3.2, 2.2, 0.8]), stroke([(8, 31), (5, 26), (6, 22)], [2.4, 1.6, 0.6]))
paint_flame(cv, flame, FLAME, outline="3")
gold(tail, R=3)
tin = {p for p in tail if cv.get(*p) != "4"}
for a, b in (((9, 42), (10, 47)), ((5, 37), (9, 39)), ((4, 34), (8, 33))):
    line(cv, [a, b], "a", tin, smooth=False)

# body and neck as one form
body = union(
    shape([(41, 33), (44, 38), (42.5, 44), (36, 47), (26, 48), (18, 46), (14.5, 41), (16.5, 35), (23, 32), (32, 31)]),
    stroke([(39, 34), (41, 29), (42, 25)], [5.5, 4.8, 4.4]),
)
gold(body, R=6, tilt=0.25)
inb = {p for p in body if cv.get(*p) != "4"}
belly = shape([(42, 21), (45.5, 28), (45, 37), (42, 44), (36, 47.5), (29, 48), (31, 44.5), (37, 40), (40, 32), (40, 25)]) & inb
paint_form(cv, belly, ["c", "y", "o", "o"], [0.8, 0.5, 0.25], R=3, outline=None, tilt=0.3)
# brown stripes across the back
for pts in (((20, 34), (21, 38), (20, 41)), ((25, 32), (26, 36), (25, 39)), ((30, 31), (31, 35), (30, 38)),
            ((36, 31), (37, 34))):
    line(cv, list(pts), "a", inb)
    line(cv, [(x + 1, y) for x, y in pts], "r", inb)

# near legs (left of each pair, lower)
gold(stroke([(20, 42), (21, 47)], [5.0, 4.0]), R=4)
leg([(21, 48), (20, 52), (20, 55)], [3.2, 2.8, 2.6], (17, 54))
leg([(37, 43), (37, 49), (37, 54)], [3.6, 3.0, 2.8], (35, 53))

# near wing, raised up and back
wing = poly([(33, 33), (26, 19), (18, 17), (20, 21.5), (15, 24), (18.5, 27), (15.5, 31), (24, 34)])
paint_form(cv, wing, ["a", "a", "r", "r"], [0.7, 0.45, 0.2], R=3, outline="4")
win = {p for p in wing if cv.get(*p) != "4"}
line(cv, [(26, 20), (17, 23.5)], "3", win, smooth=False)
line(cv, [(26, 20), (17, 30)], "3", win, smooth=False)
gold(stroke([(33, 33), (26, 19), (19, 17)], [1.6, 1.3, 0.8]), R=1.5)

# horns, swept back, behind and above the head
for pts in (([(45, 12), (43, 7), (40, 3)], [2.2, 1.5, 0.6]), ([(40, 13), (35, 9), (31, 7)], [2.4, 1.6, 0.6])):
    paint_form(cv, stroke(*pts), ["c", "y", "o"], [0.6, 0.3], R=1.5, outline="4")

# head: wedge-shaped, snout toward us and to the right
head = shape([(36, 15), (40.5, 11.5), (46.5, 12), (50.5, 15.5), (53.5, 19.5), (52.5, 23), (46.5, 25), (40, 25),
              (36, 21.5)])
gold(head, R=5)
inh = {p for p in head if cv.get(*p) != "4"}
jaw = shape([(45, 22), (52.5, 21), (52, 23.5), (46, 25.5), (40, 25.5), (40, 23)]) & inh
paint_form(cv, jaw, ["c", "y", "o"], [0.6, 0.3], R=2, outline=None)
line(cv, [(44, 22), (48, 22), (52, 21)], "4", inh, smooth=False)
stamp(cv, 41, 14, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 49, 15, "4\nK\nK")
stamp(cv, 51, 18, "K")
stamp(cv, 41, 20, "aa")
outline_outer(cv, "4")
for xy, f in FEET:
    stamp(cv, *xy, f)
cv.g = [['.'] * 56] * 0 + [['.'] * 56 for _ in range(3)] + cv.g[:-3]
save(cv, OUT)
