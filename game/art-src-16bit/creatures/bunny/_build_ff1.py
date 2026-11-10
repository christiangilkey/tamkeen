"""Cyber hare, Final Fantasy style (pick 88): lean, athletic young hare sitting up alert on its
haunches, three-quarter view facing right. Lime fur with strand texture, pale chest, long swept
ears with neon circuit lines, a metal tech collar with lights, neon circuitry on the limbs, glowing
narrow eyes. Light from the top left, cyan rim light on the shadow side."""
import sys
from plant_ff_kit import (Canvas, shape, stroke, form, strands, tufts, inner, line, stamp, outline_all, save)

OUT = sys.argv[1] if len(sys.argv) > 1 else "bunny_ff1.txt"
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
far_leg = stroke([(42, 41), (43, 49), (43.5, 55), (43.5, 58.5)], [2.6, 1.9, 1.6, 1.6])
form(cv, far_leg, FAR, CUTS, R=2, tilt=0.1)
stamp(cv, 41, 57, ".4444.\n4D33D4\n444444")
tail = stroke([(16, 47), (12.5, 45.5)], [3.2, 2.6])
tail = tufts(tail, [(11, 44, -1, -0.6), (11, 47, -1, 0.4), (13, 43, -0.4, -1)], 1.4, 2.2)
form(cv, tail, PALE, CUTS, R=3, tilt=0.1, rim="R")
far_ear = stroke([(48, 13), (46.5, 7), (44, 1), (42.5, -1)], [2.2, 3.0, 2.0, 0.6])
form(cv, far_ear, FAR, CUTS, R=2, tilt=0.1)
fe = inner(cv, far_ear)
line(cv, [(47, 11), (45.5, 6), (44, 2)], "r", fe)

# --- torso with haunch, one form ---------------------------------------------------------------
torso = shape([(24, 34), (31, 29.5), (38, 29), (43, 32.5), (44.5, 38), (41.5, 45), (37, 50), (32, 56.5), (24, 59),
               (17, 56), (15.5, 48), (19, 40)]) | stroke([(39, 33), (41.5, 27), (44, 21)], [5.2, 4.6, 4.0])
torso = tufts(torso, [(42.5, 41, 0.5, 1), (40, 45, 0.3, 1), (44, 36, 1, 0.6)], 1.5, 2.6)
form(cv, torso, FUR, CUTS, R=7, tilt=0.2, rim="R")
ins = inner(cv, torso)
chest = (stroke([(45.5, 22), (45, 29), (43.5, 36), (41.5, 43)], [1.6, 2.4, 3.0, 2.4]) |
         tufts(set(), [(42.5, 41, 0.5, 1), (40, 45, 0.3, 1)], 1.5, 2.6)) & ins
form(cv, chest, PALE, [0.9, 0.62, 0.35, 0.15], R=2.5, tilt=0.1, outline=None, clip=chest)
strands(cv, chest, (0.2, 1), "y", on=("c",), step=(3, 3), length=1)
body_fur = ins - chest
strands(cv, body_fur, (-0.6, 1), "3", on=("2",), step=(4, 3), length=2)
strands(cv, body_fur, (-0.6, 1), "D", on=("3",), step=(4, 3), length=2, offset=2)
strands(cv, body_fur, (-0.6, 1), "1", on=("H",), step=(5, 4), length=1, offset=1)
# haunch: a big muscle shown by a curved shade line and a light ridge
line(cv, [(18, 44), (23, 40.5), (29, 42), (32, 47.5), (31, 53)], "D", body_fur)
line(cv, [(19, 45), (23.5, 42), (28, 43)], "1", body_fur)
circuit([(20, 50), (24, 50), (26, 47), (29, 47)], body_fur, node=(29, 47))
# tech collar: metal band with lights
collar = stroke([(38.5, 28.5), (42, 29.5), (46, 28.5)], [1.6, 1.8, 1.6]) & (ins | chest)
for p in collar:
    cv.set(*p, "M")
line(cv, [(38.5, 28), (42, 29), (45.5, 28)], "r", collar)
stamp(cv, 43, 29, "aW")

# --- near limbs ----------------------------------------------------------------------------------
foot = shape([(18, 57), (28, 56.5), (35, 59), (36.5, 61.5), (33, 62.5), (19, 62.5), (16.5, 60)])
form(cv, foot, FUR, CUTS, R=2.5, tilt=0.2)
fi = inner(cv, foot)
strands(cv, fi, (1, 0.1), "3", on=("2",), step=(4, 2), length=2)
circuit([(21, 60), (31, 60)], fi, node=(31, 60))
stamp(cv, 34, 60, "W")  # claw glint
front = stroke([(37, 41), (37.5, 48), (37, 54), (36.5, 59.5)], [3.0, 2.2, 1.8, 1.8])
form(cv, front, FUR, CUTS, R=2.5, tilt=0.1)
fr = inner(cv, front)
circuit([(37, 45), (37, 52), (36, 54)], fr, node=(36, 55))
stamp(cv, 33, 58, ".44444.\n4H1123W4\n4444444")

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
