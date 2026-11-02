"""Winged fox hatchling (kit), from juvenile ff3: hovering, three-quarter view facing right.
Dark body and near-black face mask, matched slanted orange eyes under a brow, big ears, small
purple wings (four broad feathers), legs tucked, a big fluffy tail with a silver tip. About 2/3 the
juvenile's height, head ~43% of it, short muzzle, round chest."""
import sys
from draw2 import Canvas, shape, stroke, poly, outline_outer, save, line
from night_ff_kit import union, core, form, put, rim_outer, eye

OUT = sys.argv[1] if len(sys.argv) > 1 else "winged_fox_hatch1.txt"
cv = Canvas(64, 64)
FUR = ["2", "3", "d", "k", "k"]
FURCUT = [0.97, 0.86, 0.56, 0.3]
FAR = ["d", "k", "k", "k", "k"]
CUT = [0.9, 0.68, 0.42, 0.18]
FEATHER = ["h", "1", "2", "3", "d"]
FCUT = [0.88, 0.62, 0.36, 0.12]
DARK = ["d", "k", "k", "k", "k"]
DCUT = [0.78, 0.5, 0.2, 0.05]
EARS = set()

# far wing: one small feather rising behind
f = stroke([(35, 42), (31.5, 36), (28.5, 31.5)], [2.6, 2.1, 0.9])
form(cv, f, ["1", "2", "3", "d", "d"], FCUT, R=2, line_c="4", tilt=0.0)

# tail: big and fluffy for a kit, trailing down and back, silver tip
tail = union(stroke([(32, 50), (27, 54), (22, 58), (18, 61.5)], [2.8, 4.4, 4.0, 1.6]),
             poly([(19.5, 58.5), (15.5, 63.5), (18, 62.5), (18.5, 63.8), (21, 61)]))
form(cv, tail, FUR, FURCUT, R=3.5, line_c="d", tilt=0.2)
ti = core(tail)
line(cv, [(29, 53), (25, 56), (21.5, 59)], "k", ti)
line(cv, [(27.5, 52), (24.5, 53.5)], "3", ti, smooth=False)
tip = stroke([(21, 59.5), (18, 61.5)], [3.6, 1.6]) & ti
tip |= poly([(19.5, 58.5), (15.5, 63.5), (18, 62.5), (18.5, 63.8), (21, 61)]) & ti
put(cv, tip, "y")
put(cv, [p for p in tip if p[1] < 61], "c")

# far legs, tucked, behind
for pts in ([(45, 50), (47.5, 53), (49.5, 53)], [(37, 53), (36, 56), (37.5, 57.5)]):
    form(cv, stroke(pts, [2.1, 1.8, 1.6]), FAR, CUT, R=1.5, line_c="4")

# body: small round chest, short torso
torso = shape([(37, 42), (43, 43.5), (46, 47), (45, 51.5), (40.5, 54), (34.5, 54), (30.5, 51.5), (30.5, 47), (33, 43.5)])
form(cv, torso, FUR, FURCUT, R=5, line_c="4", tilt=0.3)
line(cv, [(42.5, 46.5), (40.5, 50), (37, 52.5)], "k", core(torso))       # ribcage line
# haunch with a round thigh
thigh = shape([(30, 47), (34, 46), (36.5, 49.5), (35.5, 53.5), (32, 55), (29, 53)])
form(cv, thigh, FUR, FURCUT, R=3.5, line_c="4", tilt=0.25)
line(cv, [(30.5, 48), (33.5, 47.2)], "2", core(thigh), smooth=False)
# near hind leg tucked: short shin back, little foot
shin = union(stroke([(33, 54.5), (30.5, 57)], [2.0, 1.8]), stroke([(30.5, 57), (31.5, 59), (33.5, 59.5)], [1.7, 1.5, 1.4]))
form(cv, shin, DARK, DCUT, R=1.5, line_c="4")
# chest ruff: zig-zag fur under the jaw
ruff = poly([(39.5, 42), (44, 43.5), (46, 47), (44.5, 50), (43.5, 48.5), (42.5, 51), (41.5, 48.5), (40, 50), (39, 46)])
form(cv, ruff, ["2", "3", "3", "d", "k"], [0.8, 0.55, 0.3, 0.1], R=2, line_c="d", tilt=0.2)
# near foreleg tucked: elbow back, little paw forward
upper = stroke([(42.5, 50), (41.5, 53.5)], [2.4, 2.0])
fore = stroke([(41.5, 53.5), (44.5, 55.5), (47, 55.5)], [1.9, 1.7, 1.6])
form(cv, upper, FUR, FURCUT, R=1.8, line_c="4", tilt=0.15)
form(cv, fore, DARK, DCUT, R=1.4, line_c="4")

# near wing: small fan of four broad feathers, coverts, wing arm
for pts, rad in (([(26, 33), (20.5, 29), (15.5, 27)], [3.0, 2.5, 1.0]),
                 ([(27, 35.5), (20.5, 34.5), (14.5, 35.5)], [3.2, 2.6, 1.0]),
                 ([(29, 38), (23, 40), (17.5, 43)], [3.0, 2.5, 1.0]),
                 ([(32, 41), (27.5, 45), (23.5, 48)], [2.6, 2.1, 0.9])):
    fe = stroke(pts, rad)
    form(cv, fe, FEATHER, FCUT, R=2, line_c="4", tilt=0.0)
    line(cv, pts[1:], "d", core(fe))
for pts, rad in (([(27.5, 34), (22, 33)], [2.6, 1.4]), ([(30, 38.5), (25, 40.5)], [2.4, 1.4])):
    form(cv, stroke(pts, rad), FEATHER, [0.8, 0.55, 0.3, 0.1], R=1.5, line_c="d", tilt=0.0)
arm = stroke([(36, 44), (31, 38), (26, 33)], [2.6, 2.1, 1.6])
form(cv, arm, ["1", "2", "3", "d", "d"], [0.8, 0.55, 0.3, 0.1], R=2, line_c="4", tilt=0.1)
line(cv, [(34.5, 41.5), (30.5, 37), (27, 33.5)], "h", core(arm))
shoulder = shape([(33, 42.5), (37, 40.5), (40, 42.5), (40, 46), (37, 48), (33.5, 46.5)])
form(cv, shoulder, FUR, [0.9, 0.7, 0.45, 0.2], R=3, line_c="4", tilt=0.2)
line(cv, [(34, 43), (37, 41.8)], "2", core(shoulder), smooth=False)

# ears: big for the head, near-black, purple insides
for pts, rad in (([(49.5, 29), (51.2, 24.5), (52, 21.5)], [3.2, 2.1, 0.6]),
                 ([(42, 30), (40.3, 25), (39.6, 21.5)], [3.6, 2.3, 0.6])):
    ear = stroke(pts, rad)
    EARS |= ear
    form(cv, ear, DARK, DCUT, R=2, line_c="4")
    ins = stroke([(pts[0][0] + 0.4, pts[0][1] + 0.5), (pts[1][0] + 0.3, pts[1][1] + 1.2)], [1.5, 0.6]) & core(ear)
    put(cv, ins, "d")
    put(cv, [p for p in ins if p[1] > pts[1][1] + 1.5], "3")

# head: rounder skull, short muzzle, near-black mask
skull = shape([(39, 34), (41.5, 29.5), (46.5, 28), (51, 29.5), (53, 33.5), (52.5, 38), (49, 40.5), (43.5, 41), (40, 38.5)])
form(cv, skull, FUR, FURCUT, R=5, line_c="4", tilt=0.2)
muzzle = poly([(48.5, 33.5), (52, 33), (55.5, 35.3), (57, 37), (56, 38.6), (52, 40.3), (48.5, 40.3)])
form(cv, muzzle, DARK, DCUT, R=2, line_c=None)
hi = core(skull) | core(muzzle) | muzzle
mask = poly([(39.5, 35), (43, 32.8), (48.5, 32.8), (52, 33.3), (57.5, 37), (56, 39.5), (51, 41), (45, 41.5), (40.5, 40)]) & hi
form(cv, mask, DARK, DCUT, R=2.5, line_c=None)
line(cv, [(49.5, 34.3), (53, 34.8), (56, 36.5)], "d", hi)                 # muzzle bridge
line(cv, [(40, 32.3), (44, 31.8), (48.5, 32.3), (51.5, 33)], "2", hi)     # lit brow ridge
cheek = poly([(39.5, 36.5), (43, 38.5), (44.5, 41.5), (42, 41), (40.5, 43.5), (39.5, 41.5), (37, 42.5), (37.5, 39)])
form(cv, cheek, ["2", "3", "d", "k", "k"], [0.8, 0.55, 0.3, 0.1], R=1.5, line_c="4", tilt=0.2)

outline_outer(cv, "4")
rim_outer(cv, "m", on=("d", "k"), dirs=((1, 0),), skip=EARS)

# eyes: matched slanted pair, glowing orange with a bright core, under a hard brow
eye(cv, 41, 34, """
ra....
.aWWa.
...aar
""", "4", "3")
eye(cv, 50, 34, """
..ar
.Wa.
ra..
""", "4", "3")
put(cv, [(57, 37), (57, 38)], "K")          # nose
put(cv, [(47, 56), (48, 56)], "W")          # claws
save(cv, OUT)
