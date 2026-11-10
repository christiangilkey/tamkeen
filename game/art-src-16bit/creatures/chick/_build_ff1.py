"""Young phoenix (pick 8, Final Fantasy style pass): wings half raised, layered feathers with shafts and
flame tips, golden head with a dark eye stripe and fierce eye, hooked horn beak, flame crest and a
long flame tail, scaled legs with talons. Three-quarter view facing right, light from the top left."""
import sys
from fire_ffkit import (Canvas, shape, stroke, poly, form, flame, feather, scales, scallops, union, disc, line, stamp,
                        outline_outer, save, px, is_edge)

OUT = sys.argv[1] if len(sys.argv) > 1 else "chick_ff1.txt"
cv = Canvas(64, 64)
BODY = ["1", "2", "3", "a", "r", "D"]
GOLD = ["c", "y", "1", "2", "3", "a"]
FL = ["a", "3", "2", "1", "y", "c", "W"]          # flame, edge -> core
FLT = ["2", "1", "y", "c", "W"]                    # small flame tips
HORN = ["c", "B", "B", "H", "H"]
DARKF = ["3", "a", "r", "r", "D", "D"]             # far side, in shadow

# ---- far wing (behind everything, in shadow): a few primaries peeking above the back
for base, tip, w in (((37, 29), (30, 7), 2.4), ((36, 30), (26, 10), 2.4), ((35, 31), (23, 14), 2.2)):
    feather(cv, base, tip, w, DARKF, "D", bend=-1.0, flame_tip=["a", "3", "2", "1"], flame_from=0.7)

# ---- far leg
form(cv, stroke([(38, 48), (39, 53), (39, 56)], [1.6, 1.4, 1.4]), HORN, R=1.2, line_in="H")
stamp(cv, 36, 56, """
.4BB44..
4BHBHBB4
4H4H44H4
""")

# ---- tail: long flame feathers sweeping down and back, with flame streamers
for base, tip, w, b in (((24, 46), (3, 50), 3.0, 3.0), ((24, 48), (5, 58), 3.0, 2.0), ((25, 49), (12, 62), 2.6, 1.0)):
    feather(cv, base, tip, w, BODY, "r", shaft="1", bend=b, flame_tip=FL, flame_from=0.45)
# loose flame tongues flicking off the tail ends
for pts, rad in (([(6, 49), (2, 45), (1, 40)], [1.8, 1.2, 0.5]), ([(8, 56), (3, 55), (0, 52)], [1.6, 1.0, 0.5])):
    flame(cv, stroke(pts, rad), FLT, outline="a")

# ---- body: chest out, small feathers (scale texture) on the breast
body = union(shape([(40, 27), (44.5, 32), (45, 39), (42, 45), (35, 49), (27, 49.5), (22, 46), (21.5, 40), (25, 33),
                    (32, 28)]),
             stroke([(43, 22), (42, 26), (39, 30)], [4.2, 4.6, 5.2]))
bidx = form(cv, body, BODY, R=6, tilt=0.3, rim="y", tex=scallops((5, 4)))
# golden breast: the front plane toward us
breast = shape([(43, 23), (46.5, 30), (46.5, 38), (43, 45), (38, 47.5), (36.5, 40), (38, 31)]) & set(bidx)
form(cv, breast, GOLD, R=4, tilt=0.35, outline=None, tex=scallops((5, 4), offset=(2, 1)))
# ragged feathered thighs ("trousers") over the legs
for c in ((28, 47), (31, 48.5), (34, 49), (37, 48)):
    form(cv, stroke([c, (c[0] - 1, c[1] + 3)], [2.2, 0.8]), BODY[1:], R=1.5, line_in="r")

# ---- near leg: scaled tarsus and talons
form(cv, stroke([(30, 50), (29, 55), (29, 58)], [1.9, 1.6, 1.6]), HORN, R=1.2, line_in="H")
px(cv, [(29, 52), (29, 55)], "H")
stamp(cv, 25, 58, """
..4BB44...
.4BHBHBB4.
4BH4BH4HB4
4W4.4W4.4W
""")

# ---- crest: flame feathers sweeping back from the crown, with real flame tips
for base, tip, w, b in (((44, 10), (36, 1), 2.4, -1.5), ((41, 11), (30, 3), 2.6, -1.5),
                        ((39, 13), (27, 9), 2.4, -1.0), ((38, 16), (28, 16), 2.0, 0.5)):
    feather(cv, base, tip, w, GOLD[1:], "3", shaft="c", bend=b, flame_tip=FL[1:], flame_from=0.45)

# ---- head: golden, crown at the back, forehead running down into the beak
head = shape([(37, 12), (41, 8.5), (46.5, 8.5), (50.5, 11.5), (52, 16), (50, 20.5), (45.5, 23), (40, 23),
              (36.5, 19.5), (35.5, 15)])
hidx = form(cv, head, GOLD, R=5, tilt=0.25, rim="1", line_in="3")
inh = set(hidx)
# dark red eye stripe sweeping back from the eye (falcon mask)
line(cv, [(44, 15), (40, 16), (36.5, 18)], "r", inh)
line(cv, [(44, 16), (40, 17), (37, 19.5)], "a", inh)
# cheek feathers: a few short strokes toward the throat
for a, b in (((41, 20), (39, 22)), ((44, 20), (43, 22)), ((47, 20), (46, 22))):
    line(cv, [a, b], "2", inh, smooth=False)

# ---- beak: hooked, horn coloured, aimed toward us and to the right
upper = poly([(48.5, 11.5), (52.5, 12), (56, 14.5), (57.5, 18), (56.5, 21), (55, 19.5), (53.5, 18.5), (49, 18.5)])
form(cv, upper, ["W", "c", "B", "B", "H"], cuts=[0.9, 0.7, 0.45, 0.25], R=2.5, outline="4", line_in="H")
px(cv, [(49, 12), (49, 13), (49, 14), (49, 15), (49, 16), (49, 17), (50, 12)], "y")   # cere
px(cv, [(56, 19), (56, 20), (55, 19)], "H")   # hook tip
lower = poly([(49.5, 18.5), (54, 19), (52.5, 21), (49.5, 21.5)])
form(cv, lower, ["B", "H", "H"], R=1.2, outline="4")
px(cv, [(50, 14), (51, 14)], "W")        # glint on the beak ridge
px(cv, [(53, 15)], "H")                  # nostril

# ---- eye: narrow, yellow iris, heavy brow slanting down toward the beak
line(cv, [(39, 11), (43, 11), (47, 13)], "3", inh, smooth=False)   # brow ridge
stamp(cv, 42, 12, """
.4444.
4yyKK4
.4444.
""")
px(cv, [(45, 12)], "W")
px(cv, [(48, 12), (48, 13)], "4")        # far eye hidden by the brow; just its brow edge

# ---- near wing, half raised: secondaries hanging back, primaries fanning up, coverts on top
for base, tip, w in (((27, 33), (12, 37), 2.6), ((25, 30), (9, 33), 2.6), ((24, 27), (7, 28), 2.6)):
    feather(cv, base, tip, w, BODY, "r", shaft="1", bend=1.0, flame_tip=FLT, flame_from=0.75)
for base, tip, w in (((22, 22), (6, 22), 2.6), ((21, 19), (5, 15), 2.6), ((21, 17), (7, 9), 2.5),
                     ((22, 16), (11, 4), 2.4)):
    feather(cv, base, tip, w, BODY, "r", shaft="1", bend=1.2, flame_tip=FL[1:], flame_from=0.65)
coverts = shape([(31, 30), (33, 34), (29, 37), (24, 34), (20, 28), (19, 21), (21, 15.5), (25, 17), (28, 23)])
form(cv, coverts, BODY, R=3, tilt=0.15, line_in="r", rim="y", tex=scallops((4, 3), offset=(1, 0)))
# leading edge of the wing: a bright bone line from shoulder to wrist
line(cv, [(31, 30), (26, 23), (22, 17)], "1", coverts)

outline_outer(cv, "4", keep=("4", "K", "W"))
save(cv, OUT)
