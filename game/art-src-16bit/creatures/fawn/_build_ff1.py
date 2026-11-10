"""Fawn, Final Fantasy style (pick 20): an elegant, alert young deer, three-quarter view facing
right, light from the top left. Tan coat with fur texture and white spots, cream throat ruff, leaf
ears with veins, leaves along the neck and a leafy tail, slender jointed legs with dark hooves."""
import sys
from plant_ff_kit import (Canvas, shape, stroke, form, strands, tufts, leaf_shape, veins, inner, line, stamp,
                          outline_all, save)

OUT = sys.argv[1] if len(sys.argv) > 1 else "fawn_ff1.txt"
cv = Canvas(64, 64)
COAT = ["H", "1", "2", "3", "D"]
COAT_CUTS = [0.95, 0.8, 0.56, 0.3]
FAR = ["1", "2", "3", "D", "D"]
LEAF = ["c", "y", "o", "G", "G"]
CREAM = ["W", "a", "a", "1", "2"]


def leaf(stem, tip, width, bend=0.0, rim="c"):
    m, spine = leaf_shape(stem, tip, width, bend)
    form(cv, m, LEAF, [0.85, 0.55, 0.3, 0.1], R=2.5, tilt=0.1, rim=rim)
    veins(cv, spine, inner(cv, m), "G", "o", every=2, vlen=1.6)
    return m


def leg(pts, rad, far=False):
    m = stroke(pts, rad)
    form(cv, m, FAR if far else COAT, COAT_CUTS, R=2, tilt=0.1, rim=None)
    return m


def hoof(x, y, far=False):
    stamp(cv, x, y, ".4444.\n4rrWr4\n4rr4r4\n444444" if not far else ".4444.\n4rrrr4\n444444")


# --- far side, back to front -------------------------------------------------------------
leg([(27, 44), (26, 49), (24.5, 52.5), (25, 56), (25, 57.5)], [2.6, 1.8, 1.4, 1.3, 1.3], far=True)
hoof(22, 57, far=True)
leg([(44, 43), (45, 49), (45.5, 54), (46, 57.5)], [2.4, 1.7, 1.4, 1.3], far=True)
hoof(43, 57, far=True)
# leafy tail: three leaves fanned up and back from the rump
for stem, tip, w, b in (((17, 34), (9, 24), 3.0, 1.0), ((16, 35), (7, 31), 2.8, -0.8), ((18, 33), (15, 22), 2.4, -0.6)):
    leaf(stem, tip, w, b)
# far ear
leaf((49, 11), (58, 1), 3.4, -0.8)

# --- body: one form with neck; haunch and shoulder shown with shade lines --------------------
body = shape([(22, 31), (30, 29.5), (38, 30), (43.5, 32.5), (46.5, 38.5), (44, 44), (37, 46.5), (27, 46.5),
              (20, 45.5), (15.5, 41), (16, 35)]) | stroke([(45, 18), (43.5, 25), (40, 33)], [4.0, 4.6, 6.0])
body = tufts(body, [(43, 41, 0.3, 1), (40.5, 43, 0.2, 1), (38, 44.5, 0.1, 1), (45.5, 39, 0.6, 1)], 1.6, 3.0)
form(cv, body, COAT, COAT_CUTS, R=6, tilt=0.25, rim="R")
ins = inner(cv, body)
# throat and chest ruff in cream
ruff = (stroke([(46.5, 20), (46, 27), (44, 34), (44.5, 40)], [1.6, 2.4, 3.0, 2.4]) |
        tufts(set(), [(43, 41, 0.3, 1), (40.5, 43, 0.2, 1), (45.5, 39, 0.6, 1)], 1.6, 3.0)) & ins
form(cv, ruff, CREAM, [0.9, 0.6, 0.3, 0.12], R=2.5, tilt=0.15, outline=None, clip=ruff)
# fur texture, then anatomy lines
strands(cv, ins - ruff, (-1, 0.45), "3", on=("2",), step=(5, 3), length=2)
strands(cv, ins - ruff, (-1, 0.45), "D", on=("3",), step=(4, 3), length=2, offset=2)
strands(cv, ins - ruff, (-1, 0.45), "1", on=("H",), step=(6, 4), length=1, offset=1)
strands(cv, ruff, (0.2, 1), "1", on=("a",), step=(3, 3), length=1)
line(cv, [(16.5, 38), (21.5, 35.5), (25.5, 38.5), (26.5, 43)], "D", ins - ruff)      # haunch
line(cv, [(38.5, 33), (36.5, 37.5), (37, 42)], "3", ins - ruff)                     # shoulder
# white spots in two rows along the back, each with a shade pixel under it
for x, y in ((23, 33), (27, 32), (31, 32), (35, 32), (25, 36), (29, 35), (33, 35.5), (21, 37)):
    x, y = int(x), int(round(y))
    if (x, y) in ins and (x + 1, y) in ins:
        stamp(cv, x, y, "Wa\n.3")

# --- near legs ------------------------------------------------------------------------------
leg([(22, 44), (20.5, 49), (18.5, 53.5), (19, 57.5), (19.5, 59.5)], [3.4, 2.3, 1.6, 1.5, 1.5])
hoof(17, 59)
leg([(39, 44), (39.5, 50), (39, 55), (38.5, 59.5)], [2.9, 1.9, 1.6, 1.5])
stamp(cv, 39, 52, "3")  # knee
hoof(36, 59)

# --- leaves along the neck crest, near ear, head --------------------------------------------
for stem, tip, w, b in (((43, 21), (36, 19), 1.9, 0.6), ((42, 25.5), (34, 24.5), 2.1, 0.7), ((40.5, 30), (32, 30.5), 2.1, 0.6)):
    leaf(stem, tip, w, b)
leaf((43, 12), (31, 2), 4.4, 1.2)

head = shape([(41, 13), (45, 10.5), (50, 11.5), (54, 14.5), (58, 18.5), (57.5, 21.5), (54, 23), (49, 23),
              (44, 21.5), (41.5, 18)])
head = tufts(head, [(44, 21.5, -0.4, 1), (47, 22.8, 0.0, 1)], 1.4, 2.4)  # cheek fur
form(cv, head, COAT, [0.94, 0.76, 0.5, 0.25], R=4.5, tilt=0.2, rim="R")
hin = inner(cv, head)
muzzle = shape([(52.5, 17), (58, 18.8), (57.5, 21.5), (54, 23), (51, 21.5)]) & hin
form(cv, muzzle, CREAM, [0.85, 0.55, 0.3, 0.12], R=2, outline=None, clip=muzzle)
line(cv, [(50, 13), (53.5, 15.5), (56.5, 18)], "1", hin)          # bridge of the nose catching light
line(cv, [(45, 15.5), (47.5, 19), (51, 20.5)], "3", hin)          # cheekbone
stamp(cv, 56, 18, ".KK\nKWK\n.KK")                                 # nose with glint
stamp(cv, 53, 22, "DD3")                                           # mouth line
# narrow, alert eye with an angled brow; green iris and a glint
stamp(cv, 45, 13, """
44....
.D444.
..4KK4
..4yWK
...44.
""")
stamp(cv, 53, 14, "4\nK")  # far eye, a sliver past the bridge
outline_all(cv)
save(cv, OUT)
