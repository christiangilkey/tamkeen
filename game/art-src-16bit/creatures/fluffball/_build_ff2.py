"""Fluffball, Final Fantasy pass 2 (pick 74): cleaner and more striking. Smooth main silhouette with
fur clumps only at chosen places (cheek ruff, chest ruff, elbows, tail tip); one big shaped tail plume
with a few large clump divisions; a face shaded in planes (lit crown, brow shadow, cheek plane, muzzle
plane); big round ear-headphones with glowing LED rings; chest core light and bracer; compact build.
Three-quarter view facing right, light from the top left."""
import math
import sys
from fire_ffkit import (Canvas, shape, stroke, poly, form, feather, union, disc, line, stamp,
                        outline_outer, save, px, is_edge)

OUT = sys.argv[1] if len(sys.argv) > 1 else "fluffball_ff2.txt"
cv = Canvas(64, 64)
FUR = ["L", "1", "2", "3", "M", "M"]
FURC = [0.93, 0.78, 0.52, 0.26, 0.05]
FACE = ["c", "y", "y", "o", "r", "M"]
TECH = ["L", "3", "M", "T", "T"]


def clump(base, tip, w, bend=0.0):
    """One deliberate fur clump: soft lance shape, coloured edge over other fur, a strand line."""
    return feather(cv, base, tip, w, FUR[:4], "3", shaft="2", bend=bend, R=2.5)


def ring(cx, cy, r0, r1):
    return {p for p in disc(cx, cy, r1) if (p[0] + 0.5 - cx) ** 2 + (p[1] + 0.5 - cy) ** 2 > r0 * r0}


def headphone(cx, cy, r_fur, r_cup, glint=True):
    """Big round ear: smooth fur rim, dark tech cup, glowing LED ring, coral speaker with grille."""
    form(cv, disc(cx, cy, r_fur), FUR, cuts=FURC, R=4, line_in="3")
    form(cv, disc(cx + 0.3, cy + 0.3, r_cup), TECH, R=2.5, outline="4", line_in="4")
    led = ring(cx + 0.3, cy + 0.3, r_cup - 2.0, r_cup - 0.9)
    px(cv, led, "G")
    if glint:
        px(cv, [p for p in led if p[0] < cx - 1 and p[1] < cy - 1], "W")
    spk = disc(cx + 0.3, cy + 0.3, r_cup - 2.1)
    form(cv, spk, ["y", "o", "r", "r"], cuts=[0.9, 0.65, 0.35], R=2.5, outline=None)
    for p in spk:
        if p[0] % 2 == 0 and p[1] % 2 == 0 and not is_edge(spk, *p):
            cv.set(*p, "M")
    return led


FOOT = """
.4MM44.
4M3MM34
4W4W4W4
"""

# ---- far leg (right, higher): short, chunky
form(cv, stroke([(41, 49), (42, 53), (42, 55)], [3.2, 2.8, 2.4]), FUR, cuts=FURC, R=2.5, line_in="M")
stamp(cv, 39, 55, FOOT)

# ---- tail: one big plume curling up behind, a few large clump divisions, clumps only at the tip
tail = shape([(24, 42), (20.5, 38), (19, 31), (19.5, 24), (20, 17), (16, 12), (10, 13), (5, 19), (3, 28), (3.5, 38),
              (8, 46), (15, 51), (22, 52), (26, 49)])
tidx = form(cv, tail, FUR, cuts=FURC, R=7, tilt=0.1, line_in="M", rim="G")
tin = set(tidx)
for pts in (((19, 43), (12, 43), (6, 40)), ((19, 34), (11, 33), (4, 31)), ((19, 25), (12, 23), (6, 19))):
    line(cv, list(pts), "3", tin)
    line(cv, [(x, y - 1) for x, y in pts], "L", {p for p in tin if tidx.get(p, 9) <= 2})
for x, y in ((5, 40), (3, 31), (5, 19)):      # small notches where the clumps meet the edge
    cv.set(x, y, ".")
for base, tip, w, b in (((15, 16), (18, 9), 3.0, -0.6), ((10, 16), (8, 9), 2.8, 0.5)):
    clump(base, tip, w, b)

# ---- body: compact and chunky, smooth outline
body = shape([(29, 30), (40, 30), (45, 34.5), (46.5, 42), (44, 49), (36, 52.5), (27.5, 52), (22.5, 47.5), (22, 39),
              (24.5, 33)])
bidx = form(cv, body, FUR, cuts=FURC, R=8, tilt=0.3, rim="G")
inb = set(bidx)
line(cv, [(25, 41), (24, 46)], "3", inb, smooth=False)
line(cv, [(42, 47), (39.5, 50)], "3", inb, smooth=False)
# chest plate with the yellow core light
plate = poly([(32, 34), (41, 34.5), (43, 39.5), (41, 44.5), (33.5, 45), (31.5, 39.5)])
form(cv, plate, TECH, R=2, outline="4", line_in="4")
line(cv, [(33, 36), (41, 36)], "G", plate, smooth=False)
line(cv, [(34, 43), (40, 43)], "G", plate, smooth=False)
stamp(cv, 35, 37, """
.aaa.
aaWWa
aaWaa
.aaa.
""")
px(cv, [(34, 38), (40, 38), (34, 40), (40, 40)], "y")

# ---- near leg (left, lower): short, chunky
form(cv, stroke([(29, 49), (28.5, 54), (28, 56)], [3.8, 3.2, 2.6]), FUR, cuts=FURC, R=2.5, line_in="3")
stamp(cv, 25, 56, FOOT)

# ---- far arm: hand on the hip, elbow clump
form(cv, stroke([(44, 34), (48, 38.5), (45.5, 43)], [2.5, 2.3, 2.1]), FUR[:5], cuts=FURC, R=2, line_in="3")
clump((47.5, 38.5), (51, 40), 1.4)
px(cv, [(44, 44), (45, 44)], "W")

# ---- near arm: bent, paw by the chest plate, bracer, elbow clump
form(cv, stroke([(27, 33), (27.5, 40), (32.5, 43)], [3.0, 2.7, 2.4]), FUR[:5], cuts=FURC, R=2.5, line_in="3")
clump((27, 40), (22.5, 43), 1.6, 0.3)
form(cv, stroke([(27, 36.5), (27.5, 39.5)], [2.7, 2.7]), TECH, R=1.5, outline="4", line_in="4")
px(cv, [(26, 37), (27, 38), (28, 37)], "G")
px(cv, [(33, 44), (34, 44), (34, 43)], "W")

# ---- chest ruff: three clumps over the top of the chest
for base, tip, w, b in (((32, 29), (31, 34), 2.4, 0.4), ((36, 29.5), (36.5, 34.5), 2.4, 0.0), ((40, 29.5), (42.5, 33.5), 2.2, -0.4)):
    clump(base, tip, w, b)

# ---- far ear-headphone (behind the head, upper right)
headphone(48.5, 8, 6.6, 4.9, glint=False)

# ---- head: big face, shaded in planes
head = shape([(28, 15), (33, 10), (41, 9.5), (47, 12.5), (50, 17), (53.5, 20), (54, 23.5), (50.5, 26.5), (44, 29.5),
              (37, 31), (31, 29.5), (27.5, 24)])
hidx = form(cv, head, FACE, cuts=[0.9, 0.74, 0.55, 0.3, 0.1], R=7, tilt=0.25, line_in="o")
inh = set(hidx)
# cheek plane (side of the face, turned to the light): lighter, soft
cheek = shape([(30, 17), (38, 16), (43, 19), (43, 25), (38, 29), (32, 27.5), (29.5, 22.5)]) & inh
form(cv, cheek, ["c", "c", "y", "o"], cuts=[0.8, 0.5, 0.25], R=4, outline=None, tilt=0.4)
# muzzle plane (front, turned toward us): its own form, top ridge lit, underside in shadow
muzzle = shape([(43.5, 18.5), (49, 18), (53.5, 20.5), (53.5, 23.5), (50, 26), (45, 27), (43, 24)]) & inh
form(cv, muzzle, ["c", "y", "y", "o", "r"], cuts=[0.9, 0.7, 0.45, 0.22], R=3, outline=None, tilt=0.5)
line(cv, [(43, 18), (42.5, 22), (44, 26.5)], "o", inh)                 # cheek / muzzle edge
line(cv, [(45, 26), (49, 25.5), (51.5, 24)], "r", inh, smooth=False)   # mouth line
px(cv, [(36, 30), (37, 30), (38, 30), (42, 29), (43, 29)], "r")        # under-jaw shadow
px(cv, [(52, 19), (53, 19), (53, 20)], "K")                             # nose
px(cv, [(52, 18)], "W")
# pink fur crown, lit on top, smooth edge with a forelock
cap = union(shape([(27, 16), (29, 10.5), (35, 7), (42, 7), (47, 10.5), (42, 11), (37, 12.5), (33, 14.5), (30.5, 19),
                   (28.5, 23)]),
            stroke([(41, 9), (44, 13), (44, 15)], [2.0, 1.6, 0.7]))
form(cv, cap, FUR[:5], cuts=[0.88, 0.7, 0.45, 0.2], R=4, line_in="3", tilt=0.3)
# cheek ruff: three clumps at the back of the jaw
for base, tip, w, b in (((31, 26), (25, 30), 2.4, 0.5), ((33, 28.5), (29, 33), 2.2, 0.4), ((29.5, 22), (23, 24.5), 2.2, 0.4)):
    clump(base, tip, w, b)
# brow shadow over the eye, then the eyes: narrow, glowing cyan, angled brows
line(cv, [(36, 13), (40, 13), (44, 15)], "3", inh, smooth=False)
line(cv, [(37, 14), (40, 14), (43, 15.5)], "o", inh, smooth=False)
stamp(cv, 38, 15, """
4444.
4GGK4
.444.
""")
px(cv, [(39, 16)], "W")
stamp(cv, 46, 16, "44\nGK\n4.")

# ---- near ear-headphone: big round, glowing LED ring; headband over the crown
headphone(26.5, 15, 8.4, 6.2)
line(cv, [(31, 8), (37, 4.5), (43, 4), (47, 2.5)], "4")
line(cv, [(32, 9), (37, 5.5), (43, 5)], "T")
px(cv, [(38, 5), (41, 5)], "G")

outline_outer(cv, "4", keep=("4", "K", "W", "G"))
save(cv, OUT)
