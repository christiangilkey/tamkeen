"""Leaf fawn hatchling: a newborn fawn, three-quarter view facing right, light from the top left.
About two thirds of the juvenile's height: bigger head (about 40% of the height), short muzzle,
slightly bigger eyes, short legs with knobbly knees, rounder chest. Keeps the leaf ears with veins,
white spots, cream throat, a leaf on the neck and a little leaf tail. Same palette as _ff1."""
import sys
from plant_ff_kit import (Canvas, shape, stroke, form, strands, tufts, leaf_shape, veins, inner, line, stamp,
                          outline_all, save)

OUT = sys.argv[1] if len(sys.argv) > 1 else "fawn_hatch1.txt"
cv = Canvas(64, 64)
COAT = ["H", "1", "2", "3", "D"]
CUTS = [0.95, 0.8, 0.56, 0.3]
FAR = ["1", "2", "3", "D", "D"]
LEAF = ["c", "y", "o", "G", "G"]
CREAM = ["W", "a", "a", "1", "2"]


def leaf(stem, tip, width, bend=0.0, rim="c"):
    m, spine = leaf_shape(stem, tip, width, bend)
    form(cv, m, LEAF, [0.85, 0.55, 0.3, 0.1], R=2.5, tilt=0.1, rim=rim)
    veins(cv, spine, inner(cv, m), "G", "o", every=2, vlen=1.4)


def leg(pts, rad, far=False):
    form(cv, stroke(pts, rad), FAR if far else COAT, CUTS, R=2, tilt=0.1)


def hoof(x, y, far=False):
    stamp(cv, x, y, ".444.\n4rWr4\n44444" if not far else ".444.\n4rrr4\n44444")


# far legs (right of each pair, a little higher)
leg([(29, 53), (29, 56.5), (28.5, 59)], [2.4, 1.7, 1.6], far=True)
hoof(26, 58, far=True)
leg([(41, 52), (41.5, 55.5), (41.5, 59)], [2.3, 1.7, 1.6], far=True)
stamp(cv, 41, 56, "D")
hoof(39, 58, far=True)
# little leaf tail and the far ear
leaf((21, 46), (15, 40), 2.4, 0.6)
leaf((48, 28.5), (54, 22), 2.9, -0.6)

# body and short neck, one form; round chest, short back
body = shape([(24, 44), (31, 42.5), (37, 42.5), (41.5, 45), (43, 50), (40.5, 54.5), (33, 56), (25.5, 56),
              (20.5, 54), (19, 49.5), (20.5, 46)]) | stroke([(39.5, 47), (41.5, 41.5), (43.5, 37)], [4.8, 4.4, 4.0])
body = tufts(body, [(41.5, 53, 0.3, 1), (39, 55, 0.1, 1)], 1.4, 2.4)
form(cv, body, COAT, CUTS, R=6, tilt=0.25, rim="R")
ins = inner(cv, body)
ruff = (stroke([(45, 36), (44.5, 42), (42.5, 48), (41.5, 53)], [1.6, 2.2, 2.6, 2.0]) |
        tufts(set(), [(41.5, 53, 0.3, 1)], 1.4, 2.4)) & ins
form(cv, ruff, CREAM, [0.9, 0.6, 0.3, 0.12], R=2.2, tilt=0.15, outline=None, clip=ruff)
coat = ins - ruff
strands(cv, coat, (-1, 0.45), "3", on=("2",), step=(5, 3), length=1)
strands(cv, coat, (-1, 0.45), "D", on=("3",), step=(4, 3), length=2, offset=2)
line(cv, [(20.5, 49), (24.5, 47), (28, 50), (28, 54)], "D", coat)    # haunch
for x, y in ((25, 45), (29, 44), (33, 44), (27, 48), (31, 47.5), (35, 47)):
    x, y = int(x), int(round(y))
    if (x, y) in coat and (x + 1, y) in coat:
        stamp(cv, x, y, "Wa")

# near legs: short, knobbly knees
leg([(24, 52), (23, 56.5), (23, 60)], [3.0, 1.9, 1.7])
stamp(cv, 23, 56, "1")
hoof(21, 60)
leg([(37, 53), (37.5, 56.5), (37, 60)], [2.6, 1.8, 1.7])
stamp(cv, 37, 56, "1\n3")
hoof(35, 60)

# a leaf on the neck, the near leaf ear, then the head
leaf((42, 40), (36, 38), 2.0, 0.6)
leaf((42.5, 30), (34.5, 22.5), 3.6, 0.9)
head = shape([(40, 32.5), (43, 28.5), (48, 27.5), (52.5, 30), (56, 34), (55.5, 37), (52, 39), (46.5, 40),
              (42, 38.5), (40, 35.5)])
head = tufts(head, [(42, 38.5, -0.4, 1)], 1.3, 2.0)
form(cv, head, COAT, [0.94, 0.76, 0.5, 0.25], R=5, tilt=0.2, rim="R")
hin = inner(cv, head)
muzzle = shape([(51.5, 32.5), (56, 34), (55.5, 37), (52, 38.8), (49.5, 36.5)]) & hin
form(cv, muzzle, CREAM, [0.85, 0.55, 0.3, 0.12], R=2, outline=None, clip=muzzle)
line(cv, [(49, 29.5), (52.5, 31.5), (55, 33.5)], "1", hin)
stamp(cv, 54, 33, ".KK\nKWK\n.KK")      # nose
stamp(cv, 52, 37, "D3")                 # mouth
# eye: a touch bigger than the juvenile's, same narrow style and angled brow, green iris
stamp(cv, 44, 30, """
44....
.D444.
.4KKK4
.4yWK4
..444.
""")
stamp(cv, 52, 31, "4\nK")  # far eye sliver
outline_all(cv)
save(cv, OUT)
