"""Phoenix hatchling (baby of chick _ff1): same FF rendering and palette. Big head (~43% of height), short
hooked beak, slightly bigger fierce eye with the eye stripe, short flame crest, stubby wings with flame
tips, round structured chest with a golden breast, short legs with talons, a short flame tail.
Standing, three-quarter view facing right, light from the top left."""
import sys
from fire_ffkit import (Canvas, shape, stroke, poly, form, flame, feather, scallops, union, line, stamp,
                        outline_outer, save, px, settle)

OUT = sys.argv[1] if len(sys.argv) > 1 else "chick_hatch1.txt"
cv = Canvas(64, 64)
BODY = ["1", "2", "3", "a", "r", "D"]
GOLD = ["c", "y", "1", "2", "3", "a"]
FL = ["a", "3", "2", "1", "y", "c", "W"]
FLT = ["2", "1", "y", "c", "W"]
HORN = ["c", "B", "B", "H", "H"]
DARKF = ["3", "a", "r", "r", "D", "D"]

# far wing: two short feathers peeking above the back
for base, tip, w in (((37, 38), (32, 29), 2.2), ((36, 39), (29, 32), 2.0)):
    feather(cv, base, tip, w, DARKF, "D", bend=-0.8, flame_tip=["a", "3", "2", "1"], flame_from=0.6)

# far leg
form(cv, stroke([(40, 53), (40.5, 55.5)], [1.5, 1.4]), HORN, R=1.2, line_in="H")
stamp(cv, 38, 56, """
.4BB44.
4BHBHB4
4H4H4H4
""")

# short flame tail
for base, tip, w, b in (((28, 49), (16, 48), 2.6, 1.5), ((28, 51), (17, 54), 2.6, 1.0), ((29, 52), (22, 58), 2.2, 0.5)):
    feather(cv, base, tip, w, BODY, "r", shaft="1", bend=b, flame_tip=FL, flame_from=0.4)
flame(cv, stroke([(18, 48), (15, 45), (15, 42)], [1.5, 1.0, 0.5]), FLT, outline="a")

# body: round but structured chest, small scalloped feathers, golden breast
body = shape([(41, 35), (45, 39), (46, 45), (43, 51), (36, 54), (29, 53.5), (25.5, 50), (25, 44), (28, 38.5), (34, 35.5)])
bidx = form(cv, body, BODY, R=6, tilt=0.3, rim="y", tex=scallops((5, 4)))
breast = shape([(43, 36), (46.5, 41), (46, 47), (42, 52), (38, 53), (37.5, 45), (39, 39)]) & set(bidx)
form(cv, breast, GOLD, R=4, tilt=0.35, outline=None, tex=scallops((5, 4), offset=(2, 1)))
for c in ((31, 52), (34, 53), (37, 52.5)):        # fluffy thighs
    form(cv, stroke([c, (c[0] - 1, c[1] + 2.5)], [2.0, 0.8]), BODY[1:], R=1.5, line_in="r")

# near leg: short, with talons
form(cv, stroke([(32, 54), (31.5, 57)], [1.8, 1.6]), HORN, R=1.2, line_in="H")
stamp(cv, 28, 57, """
..4BB44..
.4BHBHB4.
4BH4BH4H4
4W4.4W4.W
""")

# head: big, round-crowned but shaped, forehead into the beak
head = shape([(33, 26), (37, 22.5), (43, 22), (47.5, 25), (49, 29.5), (47.5, 34), (43, 37), (37, 37), (33.5, 34), (32.5, 30)])
hidx = form(cv, head, GOLD, R=5, tilt=0.25, rim="1", line_in="3")
inh = set(hidx)
line(cv, [(41, 30), (38, 31), (34.5, 32.5)], "r", inh)       # eye stripe
line(cv, [(41, 31), (38, 32), (35, 34)], "a", inh)
for a, b in (((39, 34), (38, 36)), ((42, 34), (41, 36))):
    line(cv, [a, b], "2", inh, smooth=False)

# short flame crest: a tuft on the crown sweeping back (drawn over the crown)
for base, tip, w, b in (((44, 23.5), (35, 18), 2.6, -1.2), ((41, 24), (31, 21), 2.8, -1.0), ((38, 26), (30, 28), 2.4, -0.4)):
    feather(cv, base, tip, w, GOLD[1:], "3", shaft="c", bend=b, flame_tip=FL[1:], flame_from=0.35)

# short hooked beak
upper = poly([(46, 25.5), (49.5, 26), (52, 28.5), (52.5, 31.5), (51, 32.5), (50, 31), (46.5, 31)])
form(cv, upper, ["W", "c", "B", "B", "H"], cuts=[0.9, 0.7, 0.45, 0.25], R=2.2, outline="4", line_in="H")
px(cv, [(46, 26), (46, 27), (46, 28), (46, 29), (46, 30)], "y")
px(cv, [(51, 31), (51, 32)], "H")
lower = poly([(47, 31), (50, 31.5), (48.5, 33), (47, 33)])
form(cv, lower, ["B", "H", "H"], R=1.2, outline="4")
px(cv, [(47, 27)], "W")

# eye: same fierce style, a little bigger
line(cv, [(36, 25), (40, 25), (45, 27)], "3", inh, smooth=False)
stamp(cv, 39, 26, """
.4444.
4yyKK4
4yKKK4
.4444.
""")
px(cv, [(42, 27)], "W")
px(cv, [(46, 27)], "4")

# near wing: stubby, half raised, three short flight feathers with flame tips, coverts on top
for base, tip, w in (((30, 41), (21, 42), 2.4), ((29, 38), (20, 37), 2.4), ((29, 36), (21, 32), 2.2)):
    feather(cv, base, tip, w, BODY, "r", shaft="1", bend=0.8, flame_tip=FLT, flame_from=0.6)
coverts = shape([(34, 38), (35.5, 42), (31.5, 45), (27, 43), (25.5, 38), (27, 34.5), (30.5, 35)])
form(cv, coverts, BODY, R=3, tilt=0.15, line_in="r", rim="y", tex=scallops((4, 3), offset=(1, 0)))
line(cv, [(34, 38), (30, 35.5), (27, 35)], "1", coverts)

outline_outer(cv, "4", keep=("4", "K", "W"))
print("shift", settle(cv))
save(cv, OUT)
