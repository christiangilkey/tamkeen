"""Fluffball, Final Fantasy style pass (pick 74): a lithe cyber creature - pink fur in clumps with
strand lines, peach face with a defined muzzle and sharp glowing eyes, big round ears that are
headphone cups with glowing LED rings, a tech chest plate with the yellow core light, bracers, a big
fur tail with a tech ring. Three-quarter view facing right, light from the top left."""
import math
import sys
from fire_ffkit import (Canvas, shape, stroke, poly, form, flame, feather, union, disc, line, stamp,
                        outline_outer, save, px, is_edge)

OUT = sys.argv[1] if len(sys.argv) > 1 else "fluffball_ff1.txt"
cv = Canvas(64, 64)
FUR = ["L", "1", "2", "3", "M", "M"]
FACE = ["c", "y", "y", "o", "r", "M"]
TECH = ["L", "3", "M", "T", "T"]


def clump(base, tip, w, bend=0.0, ramp=FUR, strand="2", line_in="3"):
    return feather(cv, base, tip, w, ramp[:4], line_in, shaft=strand, bend=bend, R=2.5)


def ring(cx, cy, r0, r1):
    return {p for p in disc(cx, cy, r1) if (p[0] + 0.5 - cx) ** 2 + (p[1] + 0.5 - cy) ** 2 > r0 * r0}


# ---- far leg (right, higher): digitigrade, dark paw with claws
form(cv, stroke([(38, 46), (40, 50), (38, 55)], [3.0, 2.2, 1.8]), FUR, R=2, line_in="M")
stamp(cv, 36, 55, """
.4MM44.
4M3MM34
4W4W4W4
""")

# ---- tail: a big plume of fur clumps curling up behind, with a tech ring
tail_spine = [(25, 45), (16, 45), (9, 39), (7, 30), (10, 21)]
core = stroke(tail_spine, [3.5, 5.0, 5.5, 5.0, 3.0])
form(cv, core, FUR, cuts=[0.92, 0.75, 0.5, 0.25, 0.05], R=6, tilt=0.1, line_in="M", rim="G")
for base, tip, w, b in (((12, 44), (3, 46), 2.4, 1.0), ((9, 41), (1, 39), 2.4, 0.5), ((7, 35), (0, 31), 2.4, 0.5),
                        ((7, 30), (1, 24), 2.4, 0.5), ((8, 25), (5, 17), 2.2, 0.5), ((11, 23), (12, 14), 2.2, -0.5),
                        ((12, 26), (16, 19), 2.0, -0.5), ((18, 43), (11, 50), 2.2, -0.5)):
    clump(base, tip, w, b)
band = {p for p in core if 34 <= p[1] <= 36}
form(cv, band, TECH, R=1.5, outline=None)
px(cv, [p for p in band if p[1] == 35 and p[0] % 2 == 0], "G")

# ---- body: lean torso, fur clumps on the flanks
body = shape([(31, 29), (38, 30), (42, 35), (42, 42), (39, 48), (31, 50), (25, 47.5), (23.5, 40), (25.5, 33)])
bidx = form(cv, body, FUR, cuts=[0.92, 0.75, 0.5, 0.25, 0.05], R=7, tilt=0.3, rim="G")
inb = set(bidx)
for a, b in (((27, 36), (25.5, 41)), ((29, 41), (27, 46)), ((26, 44), (25, 47)), ((40, 43), (38, 47))):
    line(cv, [a, b], "3", inb, smooth=False)
# chest plate harness with the yellow core light
plate = poly([(32, 33), (40, 33.5), (41.5, 38), (39.5, 43), (33, 43.5), (31, 38)])
form(cv, plate, TECH, R=2, outline="4", line_in="4")
line(cv, [(33, 35), (39, 35)], "G", plate, smooth=False)
line(cv, [(33, 42), (38, 42)], "G", plate, smooth=False)
stamp(cv, 34, 36, """
.aaa.
aaWWa
aaWaa
.aaa.
""")
px(cv, [(33, 37), (39, 37), (33, 39), (39, 39)], "y")     # glow spill

# ---- near leg (left, lower)
form(cv, stroke([(28, 46), (30, 51), (28, 56)], [3.4, 2.6, 2.0]), FUR, R=2, line_in="M")
stamp(cv, 25, 56, """
.4MM44.
4M3MM34
4W4W4W4
""")

# ---- arms: far arm behind the plate edge, near arm forward with a tech bracer and claws
form(cv, stroke([(41, 34), (44.5, 37.5), (43, 41)], [2.3, 2.1, 2.0]), FUR[:5], R=2, line_in="3")
px(cv, [(42, 42), (43, 42)], "W")
narm = stroke([(28, 33), (29, 39.5), (33, 42)], [2.8, 2.5, 2.3])
form(cv, narm, FUR[:5], R=2.5, line_in="3")
form(cv, stroke([(28.5, 37), (29.5, 40)], [2.5, 2.5]), TECH, R=1.5, outline="4", line_in="4")
px(cv, [(28, 38), (29, 39)], "G")
px(cv, [(34, 43), (35, 43), (35, 42)], "W")

# ---- neck ruff: clumps around the throat
for base, tip, w, b in (((30, 28), (25, 33), 2.6, 0.5), ((33, 29), (31, 35), 2.4, 0.5), ((37, 29), (40, 33), 2.2, -0.5),
                        ((28, 25), (22, 28), 2.6, 0.5)):
    clump(base, tip, w, b)

# ---- far ear: round headphone cup behind the head, upper right
far_fur = disc(47, 8, 5.2)
form(cv, far_fur, FUR[:5], R=3, line_in="3")
form(cv, disc(47.5, 8.5, 3.6), TECH, R=2, outline="4")
px(cv, [p for p in ring(47.5, 8.5, 2.2, 3.2)], "G")
form(cv, disc(47.5, 8.5, 2.0), ["r", "r", "M"], R=1, outline=None)

# ---- head: peach face, defined muzzle toward us and to the right
head = shape([(28, 14), (33, 10), (40, 9.5), (45.5, 12.5), (48, 16.5), (51, 19.5), (51.5, 22.5), (48.5, 25.5),
              (43, 28), (37, 29.5), (31, 27.5), (27.5, 22.5)])
hidx = form(cv, head, FACE, cuts=[0.9, 0.72, 0.5, 0.28, 0.08], R=6, tilt=0.2, line_in="o")
inh = set(hidx)
line(cv, [(43, 18), (42.5, 22), (44, 26)], "o", inh)          # cheek line: where the muzzle starts
line(cv, [(45, 25), (48, 24.5), (50, 23)], "r", inh, smooth=False)   # mouth line
px(cv, [(50, 19), (51, 19), (51, 20)], "K")                 # nose
px(cv, [(50, 18)], "W")
# pink fur cap over crown and back of head, clumps sweeping back
cap = shape([(27, 15), (29, 10), (35, 6.5), (42, 7), (46, 10.5), (41, 11), (36, 13), (32, 15.5), (30, 20), (28, 22)])
form(cv, cap, FUR[:5], R=3, line_in="3")
for base, tip, w, b in (((33, 8), (25, 4), 2.4, -0.5), ((30, 12), (21, 11), 2.6, 0.0), ((29, 18), (21, 20), 2.4, 0.5),
                        ((30, 23), (23, 26), 2.2, 0.5), ((40, 8), (37, 2), 2.0, -0.5)):
    clump(base, tip, w, b)

# ---- near ear: big round headphone cup with a glowing LED ring, pink fur around it
form(cv, disc(27, 15, 7.2), FUR[:5], R=4, line_in="3")
for a in range(0, 360, 45):
    r = math.radians(a + 20)
    clump((27 + math.cos(r) * 5.5, 15 + math.sin(r) * 5.5), (27 + math.cos(r) * 8.5, 15 + math.sin(r) * 8.5), 1.6,
          strand=None)
form(cv, disc(27, 15, 5.2), TECH, R=2.5, outline="4")
px(cv, [p for p in ring(27, 15, 3.4, 4.6)], "G")
px(cv, [p for p in ring(27, 15, 3.4, 4.6) if p[0] < 26 and p[1] < 14], "W")
form(cv, disc(27, 15, 3.2), ["r", "r", "o", "M"], R=2, outline=None)
px(cv, [(26, 14), (28, 16), (26, 16), (28, 14)], "M")        # speaker grille dots
# headband over the crown joining the cups
line(cv, [(30, 9), (36, 5), (42, 5), (46, 4)], "4")
line(cv, [(31, 10), (36, 6), (42, 6)], "T")
px(cv, [(37, 6), (40, 6)], "G")

# ---- eyes: narrow, glowing, angled brows
line(cv, [(37, 13), (41, 13.5), (44, 15)], "o", inh, smooth=False)     # brow
stamp(cv, 38, 14, """
4444.
4GGK4
.444.
""")
px(cv, [(39, 15)], "W")
stamp(cv, 46, 15, "44\nGK\n4.")
outline_outer(cv, "4", keep=("4", "K", "W", "G"))
save(cv, OUT)
