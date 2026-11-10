"""Cyber hare hatchling: a leveret sitting up, three-quarter view facing right, light from the top
left. About two thirds of the juvenile's height: bigger head, shorter (still long) ears with their
neon lines and the ear clip, short neck with the metal collar, round deep chest, small folded haunch
with a thigh line, short hind foot, short straight forelegs, glowing eye. Same palette as _ff2."""
import sys
from plant_ff_kit import (Canvas, shape, stroke, form, strands, tufts, inner, line, stamp, outline_all, save)

OUT = sys.argv[1] if len(sys.argv) > 1 else "bunny_hatch1.txt"
cv = Canvas(64, 64)
FUR = ["H", "1", "2", "3", "D"]
CUTS = [0.95, 0.8, 0.56, 0.3]
FAR = ["1", "2", "3", "D", "D"]
PALE = ["c", "c", "y", "o", "o"]


def circuit(pts, mask, node=None):
    line(cv, pts, "a", mask, smooth=False)
    if node:
        stamp(cv, node[0], node[1], "W")


# --- far side --------------------------------------------------------------------------------
far_leg = stroke([(43.5, 47), (44, 52.5), (44.5, 58)], [2.2, 1.6, 1.5])
form(cv, far_leg, FAR, CUTS, R=2, tilt=0.1)
stamp(cv, 42, 57, ".444.\n4D3D4\n44444")
tail = tufts(stroke([(21, 47), (18.5, 45.5)], [2.6, 2.1]), [(17, 44, -1, -0.6), (17, 46.5, -1, 0.4)], 1.2, 1.8)
form(cv, tail, PALE, CUTS, R=2.5, tilt=0.1, rim="R")
far_ear = stroke([(47.5, 28), (46.5, 24), (44.8, 20.5), (43.5, 19)], [1.8, 2.4, 1.6, 0.6])
form(cv, far_ear, FAR, CUTS, R=1.6, tilt=0.1)
line(cv, [(47, 26.5), (46, 23), (44.8, 21)], "r", inner(cv, far_ear))

# --- torso: round deep chest, short back down to the rump ----------------------------------------
torso = shape([(37, 37.5), (42.5, 37), (45.5, 40), (46, 44.5), (44, 48.5), (40.5, 50), (36, 50.5), (30, 52),
               (24.5, 52), (21.5, 49), (22.5, 44), (27, 40.5), (32, 38.5)]) | stroke([(41, 39), (42.5, 35.5)], [4.4, 4.0])
torso = tufts(torso, [(44.5, 48, 0.4, 1), (42, 50, 0.2, 1)], 1.3, 2.0)
form(cv, torso, FUR, CUTS, R=5.5, tilt=0.15, rim="R")
ins = inner(cv, torso)
chest = (stroke([(45, 35.5), (45.5, 40), (45, 44.5), (43, 49)], [1.5, 2.2, 2.4, 1.8]) |
         tufts(set(), [(44.5, 48, 0.4, 1), (42, 50, 0.2, 1)], 1.3, 2.0)) & ins
form(cv, chest, PALE, [0.9, 0.62, 0.35, 0.15], R=2.2, tilt=0.1, outline=None, clip=chest)
back = ins - chest
strands(cv, back, (-0.8, 0.6), "3", on=("2",), step=(4, 3), length=1)
strands(cv, back, (-0.8, 0.6), "D", on=("3",), step=(4, 3), length=2, offset=2)
line(cv, [(36.5, 38.5), (35.8, 42), (37.5, 45.5)], "D", back)   # shoulder
line(cv, [(37.5, 38.5), (36.8, 42), (38.5, 45)], "1", back)
collar = stroke([(39, 37.5), (42, 38.3), (45, 37.5)], [1.4, 1.6, 1.4]) & (ins | chest)
for p in collar:
    cv.set(*p, "M")
line(cv, [(39, 37), (42, 37.8), (44.5, 37)], "r", collar)
stamp(cv, 42, 38, "aW")

# --- haunch and hind foot --------------------------------------------------------------------------
haunch = shape([(22, 45), (27, 42.5), (31, 44), (34, 48), (33, 52.5), (28.5, 55), (23.5, 55), (21, 52.5),
                (20.5, 48.5)])
form(cv, haunch, FUR, CUTS, R=4.5, tilt=0.2, outline="D")
hi = inner(cv, haunch, "D")
strands(cv, hi, (0.9, 0.7), "3", on=("2",), step=(4, 3), length=1)
line(cv, [(22, 48), (26, 46), (30, 47.5), (32.5, 51)], "D", hi)
line(cv, [(22.5, 47), (26, 45), (29.5, 46.5)], "1", hi)
circuit([(24, 50), (27.5, 48.8), (30.5, 50.5)], hi, node=(31, 51))
foot = shape([(20.5, 55), (28, 55.5), (33.5, 56.5), (37, 58.5), (37.5, 61), (35.5, 62.5), (21, 62.5), (19.5, 60)])
form(cv, foot, FUR, CUTS, R=2.2, tilt=0.2)
fi = inner(cv, foot)
circuit([(23, 60), (33, 60)], fi, node=(34, 60))
stamp(cv, 19, 58, "4D\n4D")

# --- near foreleg: short and straight, paw on the ground in front of the hind foot --------------------
front = stroke([(39.5, 45), (40, 50), (40, 55), (40, 59)], [2.8, 2.0, 1.8, 1.8])
form(cv, front, FUR, CUTS, R=2.2, tilt=0.1)
fr = inner(cv, front)
circuit([(40.8, 48), (41, 53)], fr, node=(40, 54))
stamp(cv, 37, 59, ".44444.\n4H112W4\n4444444")

# --- near ear and head -------------------------------------------------------------------------------
ear = stroke([(43, 28.5), (40, 24.5), (36.5, 21), (33.5, 19)], [2.2, 2.9, 2.1, 0.6])
form(cv, ear, FUR, CUTS, R=2.2, tilt=0.1, rim="R")
ei = inner(cv, ear)
for p in stroke([(42.2, 27.5), (39.6, 24.5), (36.8, 21.8)], [0.8, 1.1, 0.5]) & ei:
    cv.set(*p, "D")
circuit([(41.5, 26.5), (39.5, 24), (37.5, 22)], ei, node=(36, 21))
stamp(cv, 42, 29, "M\nM")
head = shape([(39, 31.5), (42, 27.8), (47, 27.2), (51, 29.3), (55, 32.8), (54.5, 35.3), (50.5, 37.3), (45, 37.8),
              (41, 36.3), (39, 34)])
head = tufts(head, [(41, 36.3, -0.5, 1)], 1.2, 1.8)
form(cv, head, FUR, [0.94, 0.78, 0.52, 0.26], R=4.5, tilt=0.2, rim="R")
hin = inner(cv, head)
muzzle = shape([(50.5, 31.5), (55, 32.8), (54.5, 35.3), (51, 36.8), (49, 34.8)]) & hin
form(cv, muzzle, PALE, [0.85, 0.55, 0.3, 0.12], R=2, outline=None, clip=muzzle)
line(cv, [(47, 29), (50.5, 30.6), (54, 32.5)], "1", hin)
stamp(cv, 54, 33, "KK\nKW")
stamp(cv, 51, 36, "D3")
stamp(cv, 43, 30, """
444...
.D444.
.4raa4
.4aWa4
..444.
""")
stamp(cv, 51, 31, "4\na")
outline_all(cv)
save(cv, OUT)
