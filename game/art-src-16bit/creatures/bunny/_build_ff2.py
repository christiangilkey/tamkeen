"""Cyber hare ff2 (pick 88): lean young hare in an alert upright sit, three-quarter view facing
right. Real hare anatomy: deep chest and tucked waist, a defined shoulder, a lean foreleg standing
straight, a powerful folded haunch with a thigh muscle line, a long hind foot flat on the ground,
fur strands that follow the muscles. Neon circuitry runs along the muscle lines. Head, ears, collar
and eyes kept from ff1."""
import sys
from plant_ff_kit import (Canvas, shape, stroke, form, strands, tufts, inner, line, stamp, outline_all, save)

OUT = sys.argv[1] if len(sys.argv) > 1 else "bunny_ff2.txt"
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
far_leg = stroke([(46, 40), (46.5, 47), (47, 53.5), (47, 58.5)], [2.6, 1.8, 1.5, 1.5])
form(cv, far_leg, FAR, CUTS, R=2, tilt=0.1)
stamp(cv, 45, 57, ".4444.\n4D33D4\n444444")
tail = stroke([(15.5, 43), (12, 41.5)], [3.0, 2.4])
tail = tufts(tail, [(10.5, 40, -1, -0.6), (10.5, 43, -1, 0.4), (12.5, 39, -0.4, -1)], 1.4, 2.2)
form(cv, tail, PALE, CUTS, R=3, tilt=0.1, rim="R")
far_ear = stroke([(48, 13), (46.5, 7), (44, 1), (42.5, -1)], [2.2, 3.0, 2.0, 0.6])
form(cv, far_ear, FAR, CUTS, R=2, tilt=0.1)
line(cv, [(47, 11), (45.5, 6), (44, 2)], "r", inner(cv, far_ear))

# --- torso: deep chest, back sloping to the rump, waist tucked up in front of the thigh -----------
torso = shape([(37, 26.5), (43.5, 25.5), (47.5, 30), (47.5, 37), (45, 42.5), (40.5, 44), (36.5, 43.5), (31, 46),
               (20, 47), (15, 44), (17.5, 37.5), (24, 32.5), (31, 29)]) | stroke([(40, 29), (42.5, 23), (45, 19)], [5.2, 4.6, 4.0])
torso = tufts(torso, [(46, 41, 0.4, 1), (43.5, 43.5, 0.2, 1)], 1.4, 2.4)
form(cv, torso, FUR, CUTS, R=6, tilt=0.15, rim="R")
ins = inner(cv, torso)
chest = (stroke([(45.5, 22), (46.5, 29), (46, 36), (44, 42)], [1.6, 2.4, 2.8, 2.2]) |
         tufts(set(), [(46, 41, 0.4, 1), (43.5, 43.5, 0.2, 1)], 1.4, 2.4)) & ins
form(cv, chest, PALE, [0.9, 0.62, 0.35, 0.15], R=2.5, tilt=0.1, outline=None, clip=chest)
strands(cv, chest, (0.2, 1), "y", on=("c",), step=(3, 3), length=1)
back = ins - chest
strands(cv, back, (-0.8, 0.6), "3", on=("2",), step=(4, 3), length=2)
strands(cv, back, (-0.8, 0.6), "D", on=("3",), step=(4, 3), length=2, offset=2)
strands(cv, back, (-0.8, 0.6), "1", on=("H",), step=(5, 4), length=1, offset=1)
# shoulder: blade ridge and the point of the shoulder above the foreleg
line(cv, [(36, 28.5), (35, 33), (37.5, 38)], "D", back)
line(cv, [(37, 28.5), (36, 33), (38.5, 37.5)], "1", back)
line(cv, [(39, 39), (41.5, 40.5)], "3", back)          # elbow crease
line(cv, [(32.5, 45.5), (35, 43.8), (38, 43.3)], "D", back)  # the tuck under the waist
# tech collar
collar = stroke([(38.5, 28.5), (42, 29.5), (46, 28.5)], [1.6, 1.8, 1.6]) & (ins | chest)
for p in collar:
    cv.set(*p, "M")
line(cv, [(38.5, 28), (42, 29), (45.5, 28)], "r", collar)
stamp(cv, 43, 29, "aW")

# --- haunch: big folded thigh, muscle line, fur following the muscle --------------------------------
haunch = shape([(16, 41), (22, 38.5), (27, 40), (30.5, 44.5), (33.8, 51), (32, 54.5), (27, 57.5), (19, 58),
                (14.5, 55.5), (13.5, 48.5)])
form(cv, haunch, FUR, CUTS, R=5, tilt=0.2, outline="D")
hi = inner(cv, haunch, "D")
strands(cv, hi, (0.9, 0.7), "3", on=("2",), step=(4, 3), length=2)
strands(cv, hi, (0.9, 0.7), "D", on=("3",), step=(4, 3), length=2, offset=2)
strands(cv, hi, (0.9, 0.7), "1", on=("H",), step=(5, 3), length=1, offset=1)
# thigh muscle: a long curve from the hip to the knee, light ridge above it
line(cv, [(17, 46), (22.5, 43.5), (27.5, 45.5), (31.5, 50.5)], "D", hi)
line(cv, [(17.5, 45), (22.5, 42.5), (27, 44.2)], "1", hi)
line(cv, [(18, 53), (24, 55), (30, 54.5)], "3", hi)       # lower thigh into the hock
circuit([(19, 48), (23.5, 46.5), (27.5, 48), (30.5, 52)], hi, node=(30, 53))
# hind foot: long, flat on the ground, from the heel at the back to the toes in front
foot = shape([(13.5, 56.5), (22, 57.5), (32, 58.5), (39, 60), (40.5, 62.5), (14, 62.5), (12, 60)])
form(cv, foot, FUR, CUTS, R=2.5, tilt=0.2)
fi = inner(cv, foot)
strands(cv, fi, (1, 0.1), "3", on=("2",), step=(4, 2), length=2)
circuit([(17, 60), (34, 60.5)], fi, node=(35, 60))
stamp(cv, 38, 60, "W")
stamp(cv, 12, 58, "4D\n4D")    # heel

# --- near foreleg: lean and straight from the shoulder to the paw ------------------------------------
front = stroke([(40.5, 37.5), (41, 44), (41, 50), (40.5, 55), (40.5, 59.5)], [3.4, 2.4, 1.9, 1.7, 1.8])
form(cv, front, FUR, CUTS, R=2.5, tilt=0.1)
fr = inner(cv, front)
strands(cv, fr, (0, 1), "3", on=("2",), step=(3, 4), length=2)
line(cv, [(39.5, 46), (40, 52)], "1", fr)               # tendon highlight
circuit([(41.5, 41), (42, 47), (41.5, 53)], fr, node=(41, 54))
stamp(cv, 37, 58, ".44444.\n4H1123W4\n4444444")
# --- near ear and head ---------------------------------------------------------------------------
ear = stroke([(44, 14), (40, 8), (35.5, 2.5), (32.5, 0)], [2.6, 3.4, 2.4, 0.7])
form(cv, ear, FUR, CUTS, R=2.5, tilt=0.1, rim="R")
ei = inner(cv, ear)
inner_ear = stroke([(43, 13), (39.5, 8), (36, 3.5)], [1.0, 1.4, 0.6]) & ei
for p in inner_ear:
    cv.set(*p, "D")
circuit([(42, 12), (40, 9), (38, 6), (36.5, 4)], ei, node=(36, 3))
stamp(cv, 42, 14, "M\nM")  # ear clip

head = shape([(40, 15), (44, 12), (49, 12.5), (53, 15), (57.5, 19), (57, 22), (52, 24), (46, 24.5), (41.5, 22),
              (39.5, 18.5)])
head = tufts(head, [(42, 22.5, -0.5, 1), (45, 24, -0.1, 1)], 1.3, 2.2)
form(cv, head, FUR, [0.94, 0.78, 0.52, 0.26], R=4.5, tilt=0.2, rim="R")
hin = inner(cv, head)
muzzle = shape([(52, 18), (57.5, 19.5), (57, 22), (53, 23.8), (50.5, 22)]) & hin
form(cv, muzzle, PALE, [0.85, 0.55, 0.3, 0.12], R=2, outline=None, clip=muzzle)
line(cv, [(48, 14), (52, 16), (56, 18.5)], "1", hin)    # bridge highlight
line(cv, [(43.5, 19.5), (47, 22), (51, 22.5)], "3", hin)  # cheekbone
stamp(cv, 56, 19, "KK\nKW")                              # nose
stamp(cv, 53, 23, "D3")                                  # mouth
# narrow glowing eye under a hard brow
stamp(cv, 44, 15, """
444...
.D444.
..4ra4
..4aW4
...44.
""")
stamp(cv, 52, 17, "4\na")  # far eye sliver
outline_all(cv)
save(cv, OUT)
