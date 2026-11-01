"""Forest stag spirit, Final Fantasy style (pick 133): a young stag resting with its legs folded,
head held high, three-quarter view facing right. Dark olive coat with fur texture, tan muzzle and
cream-tan chest ruff, tall branching antlers carrying moss and leaves, glowing yellow runes and ear
tips, glowing eyes. Light from the top left, cool rim light on the shadow side."""
import sys
from plant_ff_kit import (Canvas, shape, stroke, form, strands, tufts, leaf_shape, veins, inner, line, stamp,
                          outline_all, save)

OUT = sys.argv[1] if len(sys.argv) > 1 else "forest_deer_ff1.txt"
cv = Canvas(64, 64)
COAT = ["H", "1", "2", "3", "D"]
CUTS = [0.95, 0.8, 0.56, 0.3]
FAR = ["1", "2", "3", "D", "D"]
TAN = ["W", "c", "y", "o", "o"]
BARK = ["c", "B", "B", "o", "r"]
MOSS = ["H", "1", "2", "3", "3"]
HX, HY = 1, 11  # head placement relative to the fawn layout


def mv(pts):
    return [(x + HX, y + HY) for x, y in pts]


def leaf(stem, tip, width, bend=0.0):
    m, spine = leaf_shape(stem, tip, width, bend)
    form(cv, m, MOSS, [0.85, 0.6, 0.35, 0.15], R=2, tilt=0.1)
    veins(cv, spine, inner(cv, m), "3", "2", every=2, vlen=1.2)


def antler(trunk, tines, leaves, moss_at, far=False):
    m = set()
    for pts, r in [(trunk, [2.7, 2.3, 1.8, 1.2])] + [(t, [1.8, 1.3, 0.8]) for t in tines]:
        m |= stroke(pts, r)
    form(cv, m, ["B", "o", "o", "r", "r"] if far else BARK, [0.9, 0.7, 0.45, 0.2], R=2.0, tilt=0.0, outline="4")
    mi = inner(cv, m)
    line(cv, trunk, "o" if not far else "r", mi)  # bark groove along the beam
    for x, y in moss_at:  # moss clumps on the branches
        m = stroke([(x - 1, y), (x + 1, y - 0.5)], [1.4, 1.2])
        form(cv, m, MOSS, [0.8, 0.5, 0.25, 0.1], R=1.2, tilt=0.0)
    for stem, tip, w, b in leaves:
        leaf(stem, tip, w, b)
    for pts in [trunk] + tines:  # glinting tips
        x, y = pts[-1]
        cv.set(int(round(x)), int(round(y)), "c")


def hoof(x, y, far=False):
    stamp(cv, x, y, ".444.\n4rBr4\n44444" if not far else ".444.\n4rrr4\n44444")


def rune(x, y, glyph):
    stamp(cv, x, y, glyph)


# --- far side -------------------------------------------------------------------------------
far_fore = stroke([(43, 50), (49, 52.5), (54, 53.5)], [2.6, 2.0, 1.7])
form(cv, far_fore, FAR, CUTS, R=2, tilt=0.1)
hoof(53, 52, far=True)
tail = tufts(stroke([(12, 47), (9.5, 44)], [2.8, 2.2]), [(8.5, 42.5, -0.4, -1), (10.5, 42, 0.2, -1)], 1.2, 2.0)
form(cv, tail, TAN, CUTS, R=2, tilt=0.1)
antler(mv([(51, 11), (53, 6), (55, 1), (57, -4), (58, -8)]),
       [mv([(53, 6), (58, 4), (60, 1)]), mv([(55.5, 0), (59.5, -3)]), mv([(54, 3), (51.5, 0)])],
       [(mv([(60, 1)])[0], mv([(62, -2)])[0], 1.8, 0.5)], mv([(53.5, 4.5)]), far=True)
far_ear = stroke(mv([(53, 13), (57, 10.5), (60.5, 9.5)]), [1.7, 2.4, 0.9])
form(cv, far_ear, FAR, CUTS, R=1.5, tilt=0.0)
stamp(cv, 60 + HX, 9 + HY, "aa")

# --- body lying down, neck rising from the chest ----------------------------------------------
body = shape([(12, 46), (20, 41.5), (31, 40.5), (39, 42), (45, 47), (44.5, 53.5), (34, 57.5), (19, 57.5),
              (11, 53.5)]) | stroke([(39, 47), (42.5, 40), (45, 33)], [7.0, 6.2, 5.4])
form(cv, body, COAT, CUTS, R=7, tilt=0.2, rim="R")
ins = inner(cv, body)
# chest ruff: thick cream-tan fur hanging from the throat over the chest, pointed tufts
ruff = stroke([(48.5, 34), (48, 38.5), (46.5, 43), (44.5, 47)], [1.5, 2.3, 2.9, 2.6])
ruff = tufts(ruff, [(47.5, 46, 0.2, 1), (45, 48, -0.1, 1), (49, 43, 0.5, 1), (42.5, 48.5, -0.3, 1)], 1.6, 3.2)
form(cv, ruff, TAN, [0.92, 0.7, 0.42, 0.15], R=3, tilt=0.15, rim="R")
ri = inner(cv, ruff)
strands(cv, ri, (0.15, 1), "y", on=("c",), step=(3, 3), length=2)
strands(cv, ri, (0.15, 1), "o", on=("y",), step=(3, 3), length=2, offset=1)
# coat texture and anatomy
coat = ins - ruff
strands(cv, coat, (-1, 0.35), "3", on=("2",), step=(6, 3), length=2)
strands(cv, coat, (-1, 0.35), "D", on=("3",), step=(5, 3), length=2, offset=2)
strands(cv, coat, (-1, 0.35), "1", on=("H",), step=(6, 4), length=1, offset=1)
line(cv, [(13, 48), (19, 44.5), (26, 45), (29.5, 50), (27, 56)], "D", coat)   # folded hind leg
line(cv, [(14, 49), (19, 45.5), (25, 46)], "1", coat)
line(cv, [(39, 44), (37, 49), (38, 53)], "3", coat)                           # shoulder
# moss mantle along the spine with small leaves
moss = stroke([(15, 44), (22, 40.5), (30, 39.5), (37, 40.5), (42, 38)], [1.8, 2.4, 2.4, 2.0, 1.4])
form(cv, moss, MOSS, [0.85, 0.62, 0.38, 0.15], R=1.8, tilt=0.0)
for stem, tip, w, b in (((22, 40), (18, 36), 1.8, 0.4), ((30, 39), (27, 34.5), 2.0, 0.5), ((37, 39.5), (35, 35), 1.8, 0.4)):
    leaf(stem, tip, w, b)
# glowing runes
rune(20, 49, ".a.\naWa\n.a.")
rune(32, 46, "a.a\n.a.\n.a.")
for x, y in ((25, 44), (35, 44), (40, 46)):
    stamp(cv, x, y, "a")

# --- near folded legs ---------------------------------------------------------------------------
hind_foot = stroke([(21, 56.5), (27, 58.5), (32, 59)], [2.2, 1.9, 1.7])
form(cv, hind_foot, COAT, CUTS, R=2, tilt=0.1)
hoof(31, 57)
fore = stroke([(37, 51), (42, 55.5), (48, 57.5)], [3.0, 2.2, 1.8])
form(cv, fore, COAT, CUTS, R=2, tilt=0.1, rim="R")
stamp(cv, 41, 55, "3")
hoof(47, 56)

# --- near antler, near ear, head ------------------------------------------------------------------
antler(mv([(45, 12), (43, 6), (40, 1), (38, -4), (37, -9)]),
       [mv([(43, 6), (38, 5), (35, 3)]), mv([(40.5, 1), (36, -1)]), mv([(41.5, 3), (44.5, 0)]), mv([(38.5, -3), (41, -6)])],
       [(mv([(35, 3)])[0], mv([(31, 2)])[0], 2.2, 0.6)],
       mv([(42.5, 5), (39.5, 0)]))
ear = stroke(mv([(44, 14), (39.5, 11.5), (35, 11)]), [2.0, 2.9, 1.0])
form(cv, ear, COAT, CUTS, R=2, tilt=0.0, rim="R")
line(cv, mv([(42, 13), (39, 12), (37, 11.6)]), "y", inner(cv, ear))
stamp(cv, 34 + HX, 10 + HY, "a.\naa")

head = shape(mv([(41, 13), (45, 10.5), (50, 11.5), (54, 14.5), (58, 18.5), (57.5, 21.5), (54, 23), (49, 23),
                 (44, 21.5), (41.5, 18)]))
head = tufts(head, [(x + HX, y + HY, dx, dy) for x, y, dx, dy in ((44, 21.5, -0.4, 1), (47, 22.8, 0.0, 1))], 1.4, 2.4)
form(cv, head, COAT, [0.94, 0.76, 0.5, 0.25], R=4.5, tilt=0.2, rim="R")
hin = inner(cv, head)
muzzle = shape(mv([(52.5, 17), (58, 18.8), (57.5, 21.5), (54, 23), (51, 21.5)])) & hin
form(cv, muzzle, TAN, [0.85, 0.6, 0.32, 0.12], R=2, outline=None, clip=muzzle)
line(cv, mv([(50, 13), (53.5, 15.5), (56.5, 18)]), "1", hin)
line(cv, mv([(45, 15.5), (47.5, 19), (51, 20.5)]), "3", hin)
stamp(cv, 56 + HX, 18 + HY, ".KK\nKWK\n.KK")
stamp(cv, 53 + HX, 22 + HY, "DD3")
stamp(cv, 45 + HX, 13 + HY, """
44....
.D444.
..4aa4
..4aWK
...44.
""")
stamp(cv, 53 + HX, 14 + HY, "4\na")
stamp(cv, 46 + HX, 19 + HY, "a.\n.a")  # glowing mark under the eye
outline_all(cv)
save(cv, OUT)
