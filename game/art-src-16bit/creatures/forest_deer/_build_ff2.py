"""Forest stag spirit ff2 (pick 133): resting young stag, three-quarter view facing right.
Changes from ff1: head ~18% bigger; the lying body is built from clear anatomy (ribcage barrel,
shoulder blade, front leg folded under with the knee showing, far front leg reaching forward,
haunch with the hind leg folded so the hock and hoof show, short tail tuft); moss as soft rounded
clumps with hanging strands and small leaves. Antlers, face, runes and chest ruff kept."""
import sys
from plant_ff_kit import (Canvas, shape, stroke, form, strands, tufts, leaf_shape, veins, inner, line, stamp,
                          outline_all, save)

OUT = sys.argv[1] if len(sys.argv) > 1 else "forest_deer_ff2.txt"
cv = Canvas(64, 64)
COAT = ["H", "1", "2", "3", "D"]
CUTS = [0.95, 0.8, 0.56, 0.3]
FAR = ["1", "2", "3", "D", "D"]
TAN = ["W", "c", "y", "o", "o"]
BARK = ["c", "B", "B", "o", "r"]
MOSS = ["H", "1", "2", "3", "3"]
HX, HY = 0, 10          # head placement relative to the fawn layout
HC = (49.5, 17)         # head centre in the fawn layout
S = 1.18                # head scale


def T(p):
    x, y = p[0], p[1]
    return (HC[0] + HX + S * (x - HC[0]), HC[1] + HY + S * (y - HC[1]))


def Tl(pts):
    return [T(p) for p in pts]


def Ti(p):
    x, y = T(p)
    return int(round(x)), int(round(y))


def leaf(stem, tip, width, bend=0.0):
    m, spine = leaf_shape(stem, tip, width, bend)
    form(cv, m, MOSS, [0.85, 0.6, 0.35, 0.15], R=2, tilt=0.1)
    veins(cv, spine, inner(cv, m), "3", "2", every=2, vlen=1.2)


def antler(trunk, tines, leaves, moss_at, far=False):
    m = set()
    for pts, r in [(trunk, [2.7, 2.3, 1.8, 1.2])] + [(t, [1.8, 1.3, 0.8]) for t in tines]:
        m |= stroke(pts, r)
    form(cv, m, ["B", "o", "o", "r", "r"] if far else BARK, [0.9, 0.7, 0.45, 0.2], R=2.0, tilt=0.0)
    line(cv, trunk, "o" if not far else "r", inner(cv, m))
    for x, y in moss_at:
        mm = stroke([(x - 1, y), (x + 1, y - 0.5)], [1.4, 1.2])
        form(cv, mm, MOSS, [0.8, 0.5, 0.25, 0.1], R=1.2, tilt=0.0)
    for stem, tip, w, b in leaves:
        leaf(stem, tip, w, b)
    for pts in [trunk] + tines:
        x, y = pts[-1]
        cv.set(int(round(x)), int(round(y)), "c")


def hoof(x, y, far=False):
    stamp(cv, x, y, ".444.\n4rBr4\n44444" if not far else ".444.\n4rrr4\n44444")


def moss_clumps(clumps, hang, leaves):
    """Soft rounded moss: overlapping round clumps lit from the top left, a few hanging strands."""
    m = set()
    for x, y, r in clumps:
        m |= shape([(x - r, y), (x - r * 0.6, y - r * 0.8), (x, y - r), (x + r * 0.7, y - r * 0.7), (x + r, y),
                    (x + r * 0.6, y + r * 0.6), (x, y + r * 0.7), (x - r * 0.7, y + r * 0.5)])
    form(cv, m, ["H", "H", "1", "1", "2"], [0.88, 0.7, 0.5, 0.25], R=2.2, tilt=0.15, outline="3")
    mi = inner(cv, m, "3")
    for x, y, r in clumps:  # a dark crease under each clump's top so the clumps read separately
        line(cv, [(x - r + 1.5, y + 0.8), (x, y + r * 0.55), (x + r - 1.5, y + 0.6)], "2", mi)
    for x, y, n in hang:   # hanging strands
        for i in range(n):
            cv.set(x, y + i, "2" if i < n - 1 else "3")
    for stem, tip, w, b in leaves:
        leaf(stem, tip, w, b)


# --- far side -------------------------------------------------------------------------------
far_fore = stroke([(43, 50), (49, 53), (54.5, 54)], [2.7, 2.0, 1.7])
form(cv, far_fore, FAR, CUTS, R=2, tilt=0.1)
stamp(cv, 49, 52, "D")
hoof(54, 52, far=True)
tail = tufts(stroke([(12.5, 45), (10, 42.5)], [2.4, 2.0]), [(9.5, 40.5, -0.4, -1), (11.5, 40.5, 0.3, -1)], 1.1, 1.8)
form(cv, tail, TAN, CUTS, R=2, tilt=0.1)
antler(Tl([(51, 11), (53, 6), (55, 1), (57, -4), (58, -7)]),
       [Tl([(53, 6), (58, 4), (60, 1)]), Tl([(55.5, 0), (59, -3)]), Tl([(54, 3), (51.5, 0)])],
       [(T((60, 1)), T((62, -2)), 1.8, 0.5)], [T((53.5, 4.5))], far=True)
far_ear = stroke(Tl([(53, 13), (57, 10.5), (60.5, 9.5)]), [1.8, 2.6, 1.0])
form(cv, far_ear, FAR, CUTS, R=1.5, tilt=0.0)
x, y = Ti((60, 9))
stamp(cv, x, y, "aa")

# --- body: ribcage barrel + neck -----------------------------------------------------------------
body = shape([(17, 42.5), (27, 40), (36, 40.5), (42, 44), (44.5, 50), (39, 55), (28, 57), (18, 56), (13, 51.5),
              (13, 46)]) | stroke([(40, 47), (43, 40), (46, 33)], [7.2, 6.4, 5.6])
form(cv, body, COAT, CUTS, R=7, tilt=0.2, rim="R")
ins = inner(cv, body)
strands(cv, ins, (-1, 0.3), "3", on=("2",), step=(6, 3), length=2)
strands(cv, ins, (-1, 0.3), "D", on=("3",), step=(5, 3), length=2, offset=2)
strands(cv, ins, (-1, 0.3), "1", on=("H",), step=(6, 4), length=1, offset=1)
# ribcage: two soft curved shade lines with light above them
for x0 in (30, 34):
    line(cv, [(x0, 44), (x0 - 1.5, 48.5), (x0 - 0.5, 53)], "3", ins)
    line(cv, [(x0 + 1, 44.5), (x0 - 0.5, 48.5)], "1", ins)
# shoulder blade: a ridge from the withers down toward the elbow
line(cv, [(39, 40.5), (37.5, 45), (38.5, 50)], "D", ins)
line(cv, [(40, 41), (38.5, 45), (39.5, 49)], "1", ins)

# --- haunch with the hind leg folded: thigh, then the lower leg forward along the ground ------------
haunch = shape([(12.5, 45), (18, 42), (24.5, 43.5), (28, 48.5), (26.5, 54), (20, 57), (14, 56.5), (11.5, 51)])
form(cv, haunch, COAT, CUTS, R=5, tilt=0.2, outline="D")
hi = inner(cv, haunch, "D")
strands(cv, hi, (0.7, 1), "3", on=("2",), step=(4, 3), length=2)
strands(cv, hi, (0.7, 1), "D", on=("3",), step=(4, 3), length=2, offset=2)
line(cv, [(15, 46.5), (20, 45), (24, 47.5)], "1", hi)                  # muscle highlight
stamp(cv, 17, 49, ".a.\naWa\n.a.")                                    # rune on the haunch
hind = stroke([(14, 56.5), (21, 58.6), (28, 59.2)], [2.2, 1.8, 1.6])
form(cv, hind, COAT, CUTS, R=1.8, tilt=0.1)
stamp(cv, 12, 55, "4D\n4D")                                           # hock point at the back
hoof(28, 57)

# --- near front leg folded under: forearm forward to the knee, cannon tucked back ---------------------
forearm = stroke([(40, 50), (44.5, 54.5), (47.5, 57)], [3.2, 2.5, 2.3])
form(cv, forearm, COAT, CUTS, R=2.2, tilt=0.1, outline="4")
cannon = stroke([(46.5, 59), (42, 60), (38.5, 60)], [1.8, 1.6, 1.5])
form(cv, cannon, FAR, CUTS, R=1.5, tilt=0.1)
stamp(cv, 46, 55, "1\n.3")                                            # the knee catching light
hoof(35, 58)

# --- chest ruff -------------------------------------------------------------------------------------
ruff = stroke([(48.5, 31.5), (48, 37), (46.5, 42), (44.5, 46)], [1.6, 2.4, 3.0, 2.6])
ruff = tufts(ruff, [(47.5, 45, 0.2, 1), (45, 47, -0.1, 1), (49, 42, 0.5, 1), (42.5, 47.5, -0.3, 1)], 1.6, 3.0)
form(cv, ruff, TAN, [0.92, 0.7, 0.42, 0.15], R=3, tilt=0.15, rim="R")
ri = inner(cv, ruff)
strands(cv, ri, (0.15, 1), "y", on=("c",), step=(3, 3), length=2)
strands(cv, ri, (0.15, 1), "o", on=("y",), step=(3, 3), length=2, offset=1)

# --- soft moss along the back, glowing runes on the shoulder and back --------------------------------
moss_clumps([(19, 42, 2.8), (25.5, 40.3, 3.3), (32, 40, 3.0), (38, 40.5, 2.6)],
            [(18, 44, 2), (24, 43, 3), (30, 43, 2), (36, 43, 3)],
            [((27, 38), (24, 34), 1.8, 0.5), ((38, 39), (37, 35), 1.6, -0.4)])
stamp(cv, 31, 47, "a.a\n.a.\n.a.")
for x, y in ((24, 46), (36, 47), (40, 44)):
    stamp(cv, x, y, "a")

# --- near antler, near ear, head (scaled up) ------------------------------------------------------------
antler(Tl([(45, 12), (43, 6), (40, 1), (38, -4), (37, -7)]),
       [Tl([(43, 6), (38, 5), (35, 3)]), Tl([(40.5, 1), (36, -1)]), Tl([(41.5, 3), (44.5, 0)]), Tl([(38.5, -3), (41, -5.5)])],
       [(T((35, 3)), T((31, 2)), 2.2, 0.6)], [T((42.5, 5)), T((39.5, 0))])
ear = stroke(Tl([(44, 14), (39.5, 11.5), (35, 11)]), [2.2, 3.2, 1.1])
form(cv, ear, COAT, CUTS, R=2, tilt=0.0, rim="R")
line(cv, Tl([(42, 13), (39, 12), (37, 11.6)]), "y", inner(cv, ear))
x, y = Ti((34, 10))
stamp(cv, x, y, "a.\naa")

head = shape(Tl([(41, 13), (45, 10.5), (50, 11.5), (54, 14.5), (58, 18.5), (57.5, 21.5), (54, 23), (49, 23),
                 (44, 21.5), (41.5, 18)]))
head = tufts(head, [(*T((44, 21.5)), -0.4, 1), (*T((47, 22.8)), 0.0, 1)], 1.5, 2.6)
form(cv, head, COAT, [0.94, 0.76, 0.5, 0.25], R=5, tilt=0.2, rim="R")
hin = inner(cv, head)
muzzle = shape(Tl([(52.5, 17), (58, 18.8), (57.5, 21.5), (54, 23), (51, 21.5)])) & hin
form(cv, muzzle, TAN, [0.85, 0.6, 0.32, 0.12], R=2.2, outline=None, clip=muzzle)
line(cv, Tl([(50, 13), (53.5, 15.5), (56.5, 18)]), "1", hin)
line(cv, Tl([(45, 15.5), (47.5, 19), (51, 20.5)]), "3", hin)
x, y = Ti((56, 18))
stamp(cv, x, y, ".KK\nKWK\n.KK")
x, y = Ti((53, 22))
stamp(cv, x, y, "DD3")
x, y = Ti((45, 13))
stamp(cv, x, y, """
44....
.D444.
..4aa4
..4aWK
...44.
""")
x, y = Ti((53, 14))
stamp(cv, x, y, "4\na")
x, y = Ti((46.5, 19.5))
stamp(cv, x, y, "a.\n.a")
outline_all(cv)
save(cv, OUT)
