"""Winged fox, FF pass 3 (pick 44): clear anatomy under the wing (shoulder where the wing attaches,
deep chest, ribcage-to-waist line, haunch with a thigh, jointed tucked legs with paws, clean big
tail) and a matched pair of slanted eyes under the mask. Palette and wing from pass 2.
: dark body, legs and face like the pick (lighter purple only on
the wing feathers and the rim light); fewer, broader wing feathers with clean tips.
: a young shadow fox hovering, three-quarter view facing right.
Layered-feather purple wings (primaries, secondaries, coverts), near-black face mask and ears,
narrow glowing orange eyes, cheek tufts, dark paws, bushy tail with a silver tip, cool rim light."""
import sys
from draw2 import Canvas, shape, stroke, poly, outline_outer, stamp, save, line
from night_ff_kit import union, core, form, strands, put, rim_outer, eye

OUT = sys.argv[1] if len(sys.argv) > 1 else "winged_fox_ff3.txt"
cv = Canvas(64, 64)
FUR = ["2", "3", "d", "k", "k"]
FURCUT = [0.97, 0.86, 0.56, 0.3]
FAR = ["d", "k", "k", "k", "k"]
CUT = [0.9, 0.68, 0.42, 0.18]
FEATHER = ["h", "1", "2", "3", "d"]
FCUT = [0.88, 0.62, 0.36, 0.12]
DARK = ["d", "k", "k", "k", "k"]
DCUT = [0.78, 0.5, 0.2, 0.05]

# ---- far wing: three feathers rising behind, in shadow --------------------------------------
for pts in ([(35, 29), (30, 18), (25, 10)], [(37, 28), (34.5, 17), (32.5, 7)]):
    f = stroke(pts, [3.4, 2.8, 1.0])
    form(cv, f, ["1", "2", "3", "d", "d"], FCUT, R=2, line_c="4", tilt=0.0)
    line(cv, pts[1:], "d", core(f))

# ---- tail: big clean fox brush, sweeping down and back, silver tip -----------------------
tail = union(stroke([(25, 44), (19, 48), (13, 53), (8, 59)], [3.4, 5.6, 5.2, 2.0]),
             poly([(10, 55), (5, 61.5), (8, 60), (8.5, 62.5), (11.5, 58.5)]))
form(cv, tail, FUR, FURCUT, R=4.5, line_c="d", tilt=0.2)
ti = core(tail)
line(cv, [(22, 47), (17, 51), (13, 55.5)], "k", ti)          # the brush's centre parting
line(cv, [(20, 46), (16, 48.5)], "3", ti, smooth=False)       # lit upper edge of the fur
tip = stroke([(12, 56), (8, 59)], [4.6, 2.0]) & ti
tip |= poly([(10, 55), (5, 61.5), (8, 60), (8.5, 62.5), (11.5, 58.5)]) & ti
put(cv, tip, "y")
put(cv, [p for p in tip if p[0] - p[1] < -48 or p[1] < 57], "c")

# ---- far legs: behind, darker, tucked -----------------------------------------------------
for pts in ([(48, 40), (47, 45), (51, 47), (54, 47)], [(33, 46), (31, 50), (32, 53), (34.5, 54)]):
    lg = stroke(pts, [2.6, 2.2, 1.9, 1.8])
    form(cv, lg, FAR, CUT, R=1.5, line_c="4")

# ---- torso: ribcage deep at the front, narrowing to the waist -------------------------------
torso = shape([(38, 29), (45, 31), (48, 36), (46.5, 42), (41, 45), (35, 45.5), (30, 44.5), (27, 41), (29, 35), (33, 31)])
form(cv, torso, FUR, FURCUT, R=6, line_c="4", tilt=0.3)
it = core(torso)
line(cv, [(43, 35), (41, 40), (37, 43.5), (32, 44)], "k", it)    # ribcage to waist line
line(cv, [(42, 34), (40, 38.5)], "3", it, smooth=False)            # lit edge of the ribs

# ---- haunch: a proper thigh at the back ---------------------------------------------------
thigh = shape([(22, 39), (28, 37), (32.5, 41), (32, 47.5), (27.5, 51), (22, 49), (19.5, 44)])
form(cv, thigh, FUR, FURCUT, R=5, line_c="4", tilt=0.25)
ih = core(thigh)
line(cv, [(23, 40), (27, 38.5), (30, 40)], "2", ih)               # lit top of the haunch
line(cv, [(30, 42), (28.5, 46), (25, 49)], "k", ih)                # crease where the thigh turns

# ---- near hind leg: knee, shin back to the hock, foot down to the paw ------------------------
shin = stroke([(27, 49), (22, 52.5)], [2.7, 2.2])
foot = stroke([(22, 52.5), (23, 55), (26, 56.5)], [2.1, 1.9, 1.8])
form(cv, union(shin, foot), DARK, DCUT, R=1.8, line_c="4")
line(cv, [(26, 49.5), (23, 52)], "d", core(union(shin, foot)), smooth=False)

# ---- chest: deep, with a zig-zag ruff under the jaw -----------------------------------------
chest = shape([(41, 28), (47, 30), (50, 35), (49, 41), (45, 44), (41, 41), (39.5, 34)])
form(cv, chest, FUR, FURCUT, R=4, line_c="4", tilt=0.25)
ruff = poly([(42, 28), (47, 30), (49.5, 35), (48, 39.5), (46.5, 37), (45, 41), (43.5, 37.5), (41.5, 39.5), (41, 33)])
form(cv, ruff, ["2", "3", "3", "d", "k"], [0.8, 0.55, 0.3, 0.1], R=2.5, line_c="d", tilt=0.2)

# ---- near foreleg tucked: elbow back, forearm forward, paw curled ---------------------------
upper = stroke([(44, 39), (42, 45)], [3.2, 2.6])
fore = stroke([(42, 45), (46, 48), (50, 48.5)], [2.4, 2.1, 2.0])
form(cv, upper, FUR, FURCUT, R=2, line_c="4", tilt=0.15)
form(cv, fore, DARK, DCUT, R=1.6, line_c="4")
line(cv, [(43, 46), (46, 47.5)], "d", core(fore), smooth=False)

# ---- near wing: primaries and secondaries (outermost first), coverts, then the arm ------------
feathers = [([(19, 12), (11, 7.5), (3.5, 4.5)], [4.0, 3.4, 1.2]),
            ([(20, 15.5), (11, 15), (2, 15)], [4.2, 3.6, 1.2]),
            ([(21, 19.5), (12, 22), (3.5, 26)], [4.2, 3.6, 1.2]),
            ([(25, 23), (17, 28.5), (9.5, 33.5)], [4.0, 3.4, 1.2]),
            ([(29, 27), (23.5, 32.5), (17.5, 38)], [3.8, 3.2, 1.1]),
            ([(33, 30), (29.5, 35), (26.5, 39.5)], [3.2, 2.7, 1.0])]
for pts, rad in feathers:
    f = stroke(pts, rad)
    form(cv, f, FEATHER, FCUT, R=2, line_c="4", tilt=0.0)
    line(cv, pts[1:], "d", core(f))            # the feather's shaft
coverts = [([(21, 13.5), (14, 14.5)], [3.6, 1.8]), ([(24, 19.5), (16.5, 22.5)], [3.6, 1.8]),
           ([(29, 25), (22.5, 29.5)], [3.4, 1.8])]
for pts, rad in coverts:
    form(cv, stroke(pts, rad), FEATHER, [0.8, 0.55, 0.3, 0.1], R=1.5, line_c="d", tilt=0.0)
arm = stroke([(35, 31), (28, 22), (19.5, 12)], [3.4, 2.6, 2.0])
form(cv, arm, ["1", "2", "3", "d", "d"], [0.8, 0.55, 0.3, 0.1], R=2, line_c="4", tilt=0.1)
line(cv, [(33, 28), (27.5, 21), (21, 13)], "h", core(arm))
# shoulder: the muscle the wing grows from
shoulder = shape([(33, 29), (38, 26.5), (42, 29), (42.5, 34), (39, 37.5), (34.5, 36)])
form(cv, shoulder, FUR, [0.9, 0.7, 0.45, 0.2], R=4, line_c="4", tilt=0.2)
line(cv, [(34.5, 30), (37.5, 28), (40.5, 29.5)], "2", core(shoulder))
line(cv, [(36, 35), (40, 34)], "k", core(shoulder), smooth=False)

EARS = set()
# ---- ears: big, near-black, purple insides ---------------------------------------------
for pts, rad in (([(52, 13.5), (54, 6.5), (55, 1.5)], [3.8, 2.4, 0.6]),
                 ([(44, 15), (42, 7), (41, 1)], [4.2, 2.6, 0.6])):
    ear = stroke(pts, rad)
    EARS |= ear
    form(cv, ear, DARK, DCUT, R=2, line_c="4")
    ins = stroke([(pts[0][0] + 0.5, pts[0][1] + 0.5), (pts[1][0] + 0.4, pts[1][1] + 1.5)], [1.8, 0.6]) & core(ear)
    put(cv, ins, "d")
    put(cv, [p for p in ins if p[1] > pts[1][1] + 2], "3")

# ---- head: purple crown, near-black mask over eyes, cheeks and muzzle -------------------
skull = shape([(41, 19), (44, 14), (50, 12.5), (55, 14.5), (57, 19), (56, 24), (52, 27.5), (46, 28), (42, 25)])
form(cv, skull, FUR, FURCUT, R=6, line_c="4", tilt=0.2)
muzzle = poly([(52, 19), (56, 18.5), (60, 21), (62.5, 23.5), (61, 25.5), (56, 27.5), (52, 27.5)])
form(cv, muzzle, DARK, DCUT, R=2.5, line_c=None)
hi = core(skull) | core(muzzle) | muzzle
mask = poly([(42, 20.5), (46, 18.2), (52, 18.2), (56, 18.8), (63, 23.5), (61, 26.5), (55, 28.5), (48, 29), (43, 27)]) & hi
form(cv, mask, DARK, DCUT, R=3, line_c=None)
line(cv, [(53, 20), (57, 20.5), (61, 23)], "d", hi)                  # muzzle bridge catches light
line(cv, [(43, 17.5), (47, 17), (52, 17.5), (55, 18.5)], "2", hi)      # lit brow ridge
# cheek tufts: fur sweeping back from the jaw
cheek = poly([(42, 22), (46.5, 25), (48.5, 29), (45.5, 28.5), (43.5, 31.5), (42, 28.5), (39, 30), (40, 25.5)])
form(cv, cheek, ["2", "3", "d", "k", "k"], [0.8, 0.55, 0.3, 0.1], R=2, line_c="4", tilt=0.2)
line(cv, [(44, 25), (42.5, 28)], "k", core(cheek))

outline_outer(cv, "4")
rim_outer(cv, "m", on=("d", "k"), dirs=((1, 0),), skip=EARS)

# eyes: a matched pair of sharp slants, outer corners up, same height, glowing orange with a
# bright core, under a hard brow ridge
eye(cv, 44, 19, """
ra....
.aWWa.
...aar
""", "4", "3")
eye(cv, 53, 19, """
..ar
.Wa.
ra..
""", "4", "3")
put(cv, [(62, 23), (62, 24)], "K")                  # nose
put(cv, [(56, 26)], "W")                            # fang
# claws
put(cv, [(51, 49), (51, 48), (27, 57), (25, 57)], "W")
save(cv, OUT)
