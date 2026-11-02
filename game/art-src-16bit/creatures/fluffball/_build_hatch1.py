"""Fluffball hatchling (baby of fluffball _ff3): same FF rendering and palette. Big head (~45% of height)
with the signature big round ear-headphones and glowing LED rings (relatively bigger), short muzzle,
narrow glowing cyan eyes a little bigger, chubby structured body with a small chest plate and the yellow
core light, short arms with a bracer, short legs, one fluffy plume tail with two clump divisions.
Standing, three-quarter view facing right, light from the top left."""
import sys
from fire_ffkit import (Canvas, shape, stroke, poly, form, feather, union, disc, line, stamp,
                        outline_outer, save, px, is_edge, settle)

OUT = sys.argv[1] if len(sys.argv) > 1 else "fluffball_hatch1.txt"
cv = Canvas(64, 64)
FUR = ["L", "1", "2", "3", "M", "M"]
FURC = [0.93, 0.78, 0.52, 0.26, 0.05]
FACE = ["c", "y", "y", "o", "r", "M"]
TECH = ["L", "3", "M", "T", "T"]
TECHL = ["L", "1", "2", "3", "M"]


def clump(base, tip, w, bend=0.0):
    return feather(cv, base, tip, w, FUR[:4], "3", shaft="2", bend=bend, R=2.5)


def ring(cx, cy, r0, r1):
    return {p for p in disc(cx, cy, r1) if (p[0] + 0.5 - cx) ** 2 + (p[1] + 0.5 - cy) ** 2 > r0 * r0}


def headphone(cx, cy, r_fur, r_cup, glint=True):
    form(cv, disc(cx, cy, r_fur), FUR, cuts=FURC, R=3.5, line_in="3")
    form(cv, disc(cx + 0.3, cy + 0.3, r_cup), TECH, R=2.5, outline="4", line_in="4")
    led = ring(cx + 0.3, cy + 0.3, r_cup - 1.9, r_cup - 0.9)
    px(cv, led, "G")
    if glint:
        px(cv, [p for p in led if p[0] < cx - 1 and p[1] < cy - 1], "W")
    spk = disc(cx + 0.3, cy + 0.3, r_cup - 2.0)
    form(cv, spk, ["y", "o", "r", "r"], cuts=[0.9, 0.65, 0.35], R=2.2, outline=None)
    for p in spk:
        if p[0] % 2 == 0 and p[1] % 2 == 0 and not is_edge(spk, *p):
            cv.set(*p, "M")


FOOT = """
.4MM44.
4M3MM34
4W4W4W4
"""

# far leg: short
form(cv, stroke([(42, 54), (42.5, 56)], [2.8, 2.5]), FUR, cuts=FURC, R=2.2, line_in="M")
stamp(cv, 40, 56, FOOT)

# tail: one fluffy plume curling up behind, two clump divisions, two small tip clumps
tail = shape([(29, 49), (25.5, 46), (24, 41), (24, 36), (24.5, 32), (21.5, 28), (16.5, 29), (12.5, 34), (11.5, 41),
              (13.5, 48), (18.5, 53), (24.5, 55), (29, 53.5)])
tidx = form(cv, tail, FUR, cuts=FURC, R=6, tilt=0.1, line_in="M", rim="G")
for p in tidx:
    if cv.get(*p) == "G" and not (p[1] >= 50 and p[0] <= 25):
        cv.set(*p, "1")
tin = set(tidx)
for pts in (((24, 47), (18, 47), (14, 44)), ((24, 39), (18, 38), (13, 35))):
    line(cv, list(pts), "3", tin)
    line(cv, [(x, y - 1) for x, y in pts], "L", {p for p in tin if tidx.get(p, 9) <= 2})
for x, y in ((13, 44), (12, 35)):
    cv.set(x, y, ".")
for base, tip, w, b in (((21, 31), (22, 25), 2.6, -0.5), ((17, 31), (15, 26), 2.4, 0.5)):
    clump(base, tip, w, b)

# body: chubby but structured
body = shape([(34, 40), (42, 40), (46.5, 44), (47, 50), (44, 55), (37, 57), (30.5, 56), (27, 52), (27, 46), (29.5, 42)])
bidx = form(cv, body, FUR, cuts=FURC, R=7, tilt=0.3, rim="1")
inb = set(bidx)
line(cv, [(28.5, 48), (28, 52)], "3", inb, smooth=False)
plate = poly([(36, 43), (43.5, 43.5), (45, 47), (43.5, 50.5), (37.5, 51), (35.5, 47)])
form(cv, plate, TECH, R=2, outline="4", line_in="4")
line(cv, [(37, 44.5), (43, 44.5)], "G", plate, smooth=False)
stamp(cv, 38, 45, """
.aaa.
aaWWa
.aaa.
""")
px(cv, [(37, 46), (43, 46)], "y")

# near leg: short
lidx = form(cv, stroke([(32.5, 54), (32, 57)], [3.2, 2.8]), FUR, cuts=FURC, R=2.2, line_in="3", rim="G")
for p in lidx:
    if cv.get(*p) == "G" and not (55 <= p[1] <= 57):
        cv.set(*p, "1")
stamp(cv, 29, 57, FOOT)

# arms: short; far one at the side, near one with the bracer and paw by the plate
form(cv, stroke([(45.5, 43), (48, 46), (46, 48.5)], [2.2, 2.0, 1.9]), FUR[:4], cuts=[0.88, 0.6, 0.3], R=2.2, line_in="3")
form(cv, stroke([(31, 43), (31, 47), (35, 49)], [2.6, 2.4, 2.2]), FUR[:4], cuts=[0.88, 0.6, 0.3], R=2.5, line_in="3")
form(cv, stroke([(30.8, 45), (31.2, 47)], [2.4, 2.4]), TECHL, cuts=[0.9, 0.7, 0.45, 0.2], R=2, outline="4", line_in="3")
line(cv, [(29, 46), (33, 46)], "G", smooth=False)
px(cv, [(35, 50), (36, 50)], "W")

# chest ruff: two clumps
for base, tip, w, b in (((35, 39.5), (35, 43), 2.2, 0.3), ((40, 39.5), (41.5, 43), 2.0, -0.3)):
    clump(base, tip, w, b)

# far ear-headphone
headphone(46.5, 22.5, 4.9, 3.8, glint=False)

# head: big, broad cheeks, short muzzle
head = shape([(31.5, 27), (35.5, 23.5), (42, 23), (46.5, 25.5), (48.5, 28.5), (50, 31), (50, 34), (47.5, 36.5), (43, 38.5),
              (37.5, 39.5), (32.5, 38.5), (30, 34.5), (30, 30)])
hidx = form(cv, head, FACE, cuts=[0.9, 0.74, 0.55, 0.3, 0.1], R=6, tilt=0.25, line_in="o")
inh = set(hidx)
cheek = shape([(32, 29.5), (39, 28.5), (43.5, 31), (44, 35.5), (40, 39), (34, 38.5), (31.5, 34)]) & inh
form(cv, cheek, ["c", "c", "y", "o"], cuts=[0.8, 0.5, 0.25], R=3.5, outline=None, tilt=0.4)
muzzle = shape([(44, 30), (47.5, 29.5), (50, 31.5), (50, 34), (47.5, 36), (45, 36.5), (43.8, 34)]) & inh
form(cv, muzzle, ["c", "y", "y", "o", "r"], cuts=[0.9, 0.7, 0.45, 0.22], R=2.5, outline=None, tilt=0.5)
line(cv, [(43.5, 29.5), (43, 33), (44.5, 36.5)], "o", inh)
line(cv, [(45.5, 35.5), (48.5, 34.5)], "r", inh, smooth=False)
px(cv, [(36, 39), (37, 39), (38, 39), (42, 38)], "r")
px(cv, [(48, 30), (49, 30), (49, 31)], "K")
px(cv, [(48, 29)], "W")
cap = union(shape([(30.5, 28), (32, 24), (37, 21), (43, 21), (47, 23.5), (43, 24), (38.5, 25), (34.5, 26.5), (32.5, 30), (31, 33)]),
            stroke([(41, 22.5), (43.5, 25.5), (43.5, 27)], [1.8, 1.4, 0.7]))
form(cv, cap, FUR[:5], cuts=[0.88, 0.7, 0.45, 0.2], R=3.5, line_in="3", tilt=0.3)
for base, tip, w, b in (((33, 36), (28, 39), 2.2, 0.4), ((32, 32), (27, 33.5), 2.0, 0.4)):
    clump(base, tip, w, b)
line(cv, [(37, 26), (40, 26), (44, 27.5)], "3", inh, smooth=False)
line(cv, [(38, 27), (40, 27), (43, 28)], "o", inh, smooth=False)
stamp(cv, 38, 27, """
.4444.
4GGKK4
.4444.
""")
px(cv, [(39, 28)], "W")
stamp(cv, 45, 28, "44\nGK\n4.")

# near ear-headphone: big round, LED ring; band over the crown
headphone(30.5, 28, 7.2, 5.5)
line(cv, [(34, 22), (38, 20), (42, 19.5), (44, 19.5)], "4")
line(cv, [(35, 23), (38, 21), (42, 20.5)], "T")
px(cv, [(38, 21), (41, 20)], "G")

outline_outer(cv, "4", keep=("4", "K", "W", "G"))
print("shift", settle(cv))
save(cv, OUT)
