"""Dragon whelp, Final Fantasy style pass (pick 119): a golden young dragon in a low, alert crouch,
head raised. Scaled hide, segmented belly plates, swept horns, a flame crest and dorsal spikes, wings
half spread with finger bones and veined membranes, claws, a curled tail with a flame tip.
Three-quarter view facing right, light from the top left."""
import sys
from fire_ffkit import (Canvas, shape, stroke, poly, form, flame, feather, scales, scallops, union, disc, line, stamp,
                        outline_outer, save, px, is_edge, catmull)

OUT = sys.argv[1] if len(sys.argv) > 1 else "dragon_whelp_ff1.txt"
cv = Canvas(64, 64)
HIDE = ["L", "1", "2", "3", "D", "D"]
DARKHIDE = ["2", "3", "D", "D", "r"]
PLATE = ["c", "c", "y", "o", "o"]
HORN = ["W", "c", "y", "o", "H"]
MEMB = ["2", "3", "a", "r", "r"]
FL = ["F", "2", "1", "L", "W"]


def membrane(pts, veins):
    m = poly(pts)
    idx = form(cv, m, MEMB, cuts=[0.9, 0.7, 0.45, 0.25], R=3, outline="4", line_in="r")
    for v in veins:
        line(cv, v, "D", set(idx), smooth=False)
    return m


def bone(pts, w=1.4):
    form(cv, stroke(pts, [w, w * 0.9, w * 0.6]), HIDE, R=1.2, outline="4", line_in="D")


def claws(x, y, n=3):
    for i in range(n):
        px(cv, [(x + i * 2, y)], "W")
        px(cv, [(x + i * 2, y + 1)], "H")


# ---- far wing, raised behind the back (in shadow)
membrane([(37, 34), (36, 20), (40, 6), (35, 12), (31, 13), (30, 19), (27, 21), (31, 30)],
         [[(36, 20), (31, 13)], [(36, 20), (27, 21)]])
bone([(37, 34), (36, 20), (40, 6)], 1.3)

# ---- far legs (right of each pair, higher), behind the body
form(cv, stroke([(47, 44), (49, 49), (49, 53)], [2.8, 2.2, 2.0]), DARKHIDE, R=2, line_in="r")
stamp(cv, 46, 53, ".4DD44\n4D3D3D4\n4W4W4W.")
form(cv, stroke([(26, 46), (27, 51), (26, 54)], [2.8, 2.2, 2.0]), DARKHIDE, R=2, line_in="r")

# ---- tail: curls back and round, ends in a flame
fl = union(stroke([(8, 37), (11, 31), (10, 24)], [3.4, 2.4, 0.7]), stroke([(7, 37), (3, 32), (4, 27)], [2.6, 1.8, 0.6]),
           stroke([(9, 36), (14, 33), (16, 28)], [2.0, 1.4, 0.5]))
flame(cv, fl, FL, outline="a")
tail = stroke([(18, 47), (10, 51), (4, 48), (3, 42), (7, 37)], [4.6, 3.8, 3.1, 2.5, 1.9])
form(cv, tail, HIDE, R=3, line_in="D", tex=scallops((4, 3)))
for x0, y0 in ((7, 47), (4, 43), (5, 39)):
    px(cv, [(x0, y0)], "L")       # tail spikes' glints along the top of the curl

# ---- body, neck, near haunch and near front leg: one scaled form
mass = union(
    shape([(44, 36), (48, 41), (47, 47), (42, 50.5), (31, 52), (21, 51.5), (15.5, 47.5), (16, 41.5), (22, 37.5),
           (32, 35.5), (40, 35)]),
    stroke([(42, 39), (45, 31), (47, 24)], [6.0, 5.0, 4.4]),
    stroke([(22, 50), (28, 53.5), (32, 54.5)], [3.0, 2.5, 2.3]),
    stroke([(41, 45), (42, 51), (42, 55)], [3.6, 3.0, 2.8]),
)
midx = form(cv, mass, HIDE, R=7, tilt=0.3, rim="F", tex=scallops((5, 4)))
inm = set(midx)
# belly plates: segmented cream bands down the throat, chest and belly
belly = shape([(47, 23), (50.5, 30), (50, 40), (47, 47), (43, 50), (42, 45), (44.5, 39), (45, 30)]) & inm
pidx = form(cv, belly, PLATE, cuts=[0.92, 0.7, 0.45, 0.2], R=3, outline=None, tilt=0.3)
for y in range(25, 50, 3):
    px(cv, [p for p in pidx if p[1] == y], "o")
    px(cv, [p for p in pidx if p[1] == y + 1 and pidx[p] <= 1], "W")
# haunch and leg separation lines (darker hide, not outline)
line(cv, [(24, 41), (29, 45.5), (27.5, 51)], "D", inm)
line(cv, [(38.5, 46), (38.5, 53)], "D", inm, smooth=False)
claws(31, 54)
stamp(cv, 39, 55, ".4D3D4\n4D3D3D4\n4W4W4W.")
claws(26, 54, 1)

# ---- dorsal spikes along the spine, flame-tipped near the head
for base, tip in (((44, 30), (40, 27)), ((40, 35), (37, 31)), ((35, 35.5), (32, 31.5)), ((29, 36.5), (26, 33)),
                  ((23, 38), (20, 35)), ((18, 42), (14, 40))):
    sp = stroke([base, tip], [1.8, 0.6])
    form(cv, sp, HORN[1:], R=1, outline="4", line_in="D")

# ---- near wing, half spread: finger bones, veined membrane with a scalloped trailing edge
membrane([(32, 38), (24, 20), (8, 10), (12, 17), (5, 22), (12, 26), (8, 32), (17, 33), (19, 39)],
         [[(24, 20), (12, 17)], [(24, 20), (12, 26)], [(25, 24), (17, 33)], [(22, 22), (10, 22)]])
bone([(32, 38), (24, 20), (8, 10)], 1.8)
bone([(24, 20), (5, 22)], 1.1)
bone([(24, 20), (8, 32)], 1.1)
px(cv, [(24, 20), (23, 19)], "L")       # wrist knuckle glint
px(cv, [(22, 18), (21, 17)], "W")       # wrist claw

# ---- horns: swept back from the head (far one first)
form(cv, stroke([(54, 15), (52, 9), (48, 4)], [1.8, 1.3, 0.5]), HORN, R=1.2, outline="4", line_in="H")
# ---- flame crest: gold spikes behind the head with flame tips
for base, tip, w in (((49, 18), (42, 12), 2.2), ((48, 21), (40, 18), 2.2), ((47, 24), (40, 24), 2.0)):
    feather(cv, base, tip, w, HIDE[:5], "D", bend=-0.5, flame_tip=FL, flame_from=0.5)

# ---- head: long wedge, brow ridge, snout toward us and to the right
head = shape([(47, 17), (51, 13.5), (56, 13.5), (60, 16.5), (63, 20), (62.5, 23), (58, 25.5), (51, 26.5),
              (47, 24)])
hidx = form(cv, head, HIDE, R=4, tilt=0.25, line_in="D", rim="F")
inh = set(hidx)
jaw = shape([(52, 23), (62.5, 22), (61, 25), (56, 26.5), (50, 27), (49.5, 25)]) & inh
form(cv, jaw, PLATE, R=2, outline=None)
line(cv, [(52, 23), (57, 23), (62, 22)], "4", inh, smooth=False)       # mouth line
px(cv, [(58, 24), (60, 24)], "W")                                       # fangs
px(cv, [(61, 19), (62, 19)], "K")                                       # nostril
line(cv, [(50, 15), (54, 15.5), (57, 17)], "D", inh, smooth=False)     # brow ridge
stamp(cv, 51, 16, """
4444.
4LLK4
.444.
""")
px(cv, [(58, 17)], "4")
px(cv, [(58, 18)], "L")      # far eye, a glint past the brow
# near horn over the head
form(cv, stroke([(48.5, 15.5), (44, 10), (38, 7)], [2.2, 1.6, 0.6]), HORN, R=1.4, outline="4", line_in="H")

outline_outer(cv, "4", keep=("4", "K", "W"))
save(cv, OUT)
