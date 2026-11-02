"""Forest stag hatchling: a newborn stag spirit LYING DOWN like the juvenile, head up, three-quarter
view facing right, light from the top left. About two thirds of the juvenile's height: bigger head,
short muzzle, short neck, small round barrel with the legs folded (near foreleg knee forward, far
foreleg reaching, hind leg folded with its hoof showing). Antler nubs with a leaf, glowing ear tips,
eyes, spots and a rune, a small tan chest ruff, two soft moss clumps. Same palette as _ff2."""
import sys
from plant_ff_kit import (Canvas, shape, stroke, form, strands, tufts, leaf_shape, veins, inner, line, stamp,
                          outline_all, save)

OUT = sys.argv[1] if len(sys.argv) > 1 else "forest_deer_hatch1.txt"
cv = Canvas(64, 64)
COAT = ["H", "1", "2", "3", "D"]
CUTS = [0.95, 0.8, 0.56, 0.3]
FAR = ["1", "2", "3", "D", "D"]
TAN = ["W", "c", "y", "o", "o"]
BARK = ["c", "B", "B", "o", "r"]
MOSS = ["H", "1", "2", "3", "3"]


def leaf(stem, tip, width, bend=0.0):
    m, spine = leaf_shape(stem, tip, width, bend)
    form(cv, m, MOSS, [0.85, 0.6, 0.35, 0.15], R=2, tilt=0.1)
    veins(cv, spine, inner(cv, m), "3", "2", every=2, vlen=1.1)


def hoof(x, y, far=False):
    stamp(cv, x, y, ".444.\n4rBr4\n44444" if not far else ".444.\n4rrr4\n44444")


def moss_clumps(clumps, hang):
    m = set()
    for x, y, r in clumps:
        m |= shape([(x - r, y), (x - r * 0.6, y - r * 0.8), (x, y - r), (x + r * 0.7, y - r * 0.7), (x + r, y),
                    (x + r * 0.6, y + r * 0.6), (x, y + r * 0.7), (x - r * 0.7, y + r * 0.5)])
    form(cv, m, ["H", "H", "1", "1", "2"], [0.88, 0.7, 0.5, 0.25], R=2.0, tilt=0.15, outline="3")
    mi = inner(cv, m, "3")
    for x, y, r in clumps:
        line(cv, [(x - r + 1.5, y + 0.8), (x, y + r * 0.55), (x + r - 1.5, y + 0.6)], "2", mi)
    for x, y, n in hang:
        for i in range(n):
            cv.set(x, y + i, "2" if i < n - 1 else "3")


# --- far side -------------------------------------------------------------------------------
far_fore = stroke([(40, 54), (45, 56.5), (49, 57.5)], [2.3, 1.7, 1.5])
form(cv, far_fore, FAR, CUTS, R=2, tilt=0.1)
hoof(48, 55, far=True)
tail = tufts(stroke([(17, 51), (15, 49)], [2.2, 1.8]), [(14.5, 47.5, -0.3, -1)], 1.0, 1.6)
form(cv, tail, TAN, CUTS, R=2, tilt=0.1)
far_nub = stroke([(50, 29.5), (51, 26.5), (51.5, 25)], [1.6, 1.3, 1.0])
form(cv, far_nub, ["B", "o", "o", "r", "r"], [0.9, 0.7, 0.45, 0.2], R=1.4, tilt=0.0)
cv.set(51, 25, "c")
far_ear = stroke([(51.5, 31), (55, 28.5), (58, 28)], [1.4, 2.0, 0.8])
form(cv, far_ear, FAR, CUTS, R=1.4, tilt=0.0)
stamp(cv, 57, 27, "aa")

# --- body: small round barrel lying down, short neck ----------------------------------------------
body = shape([(20, 49), (27, 46.5), (35, 46.5), (41, 49), (43, 53.5), (39.5, 58), (30, 60), (21, 59.5), (16.5, 56),
              (16.5, 52)]) | stroke([(38, 52), (40.5, 46.5), (43, 41)], [5.6, 5.0, 4.4])
form(cv, body, COAT, CUTS, R=6, tilt=0.2, rim="R")
ins = inner(cv, body)
strands(cv, ins, (-1, 0.3), "3", on=("2",), step=(6, 3), length=1)
strands(cv, ins, (-1, 0.3), "D", on=("3",), step=(5, 3), length=2, offset=2)
line(cv, [(31, 49), (30, 53), (31, 57)], "3", ins)            # a rib curve
line(cv, [(38, 47), (36.8, 51), (37.8, 54.5)], "D", ins)      # shoulder blade
line(cv, [(39, 47.5), (37.8, 51), (38.6, 54)], "1", ins)

# --- haunch, folded hind leg ------------------------------------------------------------------------
haunch = shape([(17, 52), (21.5, 49.5), (26.5, 51), (28.5, 55), (26, 59), (20, 59.8), (16.5, 57)])
form(cv, haunch, COAT, CUTS, R=4, tilt=0.2, outline="D")
hi = inner(cv, haunch, "D")
line(cv, [(18.5, 52.5), (22, 51.5), (25, 53)], "1", hi)
stamp(cv, 20, 54, ".a.\naWa\n.a.")
hind = stroke([(19, 59.6), (24.5, 60.6), (28.5, 60.8)], [1.7, 1.5, 1.4])
form(cv, hind, COAT, CUTS, R=1.6, tilt=0.1)
stamp(cv, 16, 58, "4D\n4D")
hoof(28, 59)

# --- near foreleg folded, knee forward, hoof tucked ---------------------------------------------------
fore = stroke([(37, 55), (41.5, 58.3), (45, 59.6)], [2.5, 1.9, 1.6])
form(cv, fore, COAT, CUTS, R=1.8, tilt=0.1)
stamp(cv, 41, 57, "1")
hoof(44, 59)

# --- small chest ruff and moss on the back, glowing spots ---------------------------------------------
ruff = tufts(stroke([(45.5, 39.5), (45, 43.5), (43.5, 47.5)], [1.4, 2.0, 2.0]),
             [(44, 48, 0.1, 1), (45.5, 46, 0.5, 1), (42, 49, -0.3, 1)], 1.2, 2.2)
form(cv, ruff, TAN, [0.92, 0.7, 0.42, 0.15], R=2.2, tilt=0.15, rim="R")
strands(cv, inner(cv, ruff), (0.15, 1), "y", on=("c",), step=(3, 3), length=1)
moss_clumps([(25, 47, 2.6), (31, 46.3, 2.8)], [(24, 49, 2), (30, 48, 2)])
leaf((31, 45), (29, 41.5), 1.6, 0.4)
for x, y in ((27, 51), (34, 50), (38, 49)):
    stamp(cv, x, y, "a")

# --- near antler nub with a leaf, near ear, head ---------------------------------------------------------
nub = stroke([(45, 29.5), (44, 26.5), (43.5, 25)], [1.8, 1.4, 1.1])
form(cv, nub, BARK, [0.9, 0.7, 0.45, 0.2], R=1.5, tilt=0.0)
line(cv, [(45, 29), (44, 26.5)], "o", inner(cv, nub))
cv.set(43, 25, "c")
leaf((43.5, 26), (39.5, 21.5), 2.2, 0.6)
ear = stroke([(43, 32), (39, 30), (35.5, 29.5)], [1.7, 2.4, 0.9])
form(cv, ear, COAT, CUTS, R=1.8, tilt=0.0, rim="R")
line(cv, [(41.5, 31), (39, 30.3), (37.5, 30)], "y", inner(cv, ear))
stamp(cv, 35, 29, "a.\naa")
head = shape([(41, 32.5), (44, 29), (49, 28.5), (53, 31), (57, 34.5), (56.5, 37.5), (52.5, 39.5), (47, 40),
              (43, 38.5), (41, 36)])
head = tufts(head, [(43, 38.5, -0.4, 1), (46, 40, 0, 1)], 1.3, 2.0)
form(cv, head, COAT, [0.94, 0.76, 0.5, 0.25], R=4.5, tilt=0.2, rim="R")
hin = inner(cv, head)
muzzle = shape([(52, 32.5), (57, 34.5), (56.5, 37.5), (53, 39.2), (50.5, 36.5)]) & hin
form(cv, muzzle, TAN, [0.85, 0.6, 0.32, 0.12], R=2, outline=None, clip=muzzle)
line(cv, [(49, 29.8), (52.5, 31.6), (55.5, 33.8)], "1", hin)
stamp(cv, 55, 34, ".KK\nKWK\n.KK")
stamp(cv, 53, 38, "D3")
stamp(cv, 44, 31, """
44....
.D444.
.4aaa4
.4aWa4
..444.
""")
stamp(cv, 52, 32, "4\na")
stamp(cv, 45, 37, "a.\n.a")
outline_all(cv)
save(cv, OUT)
