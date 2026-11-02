"""Neon cat hatchling (kitten), from juvenile ff4: standing, three-quarter view facing right, tail up.
Near-black coat with blue rim light, green-only slanted slit eyes (no pupils) under a dark brow,
purple ear insides, the two curved green stripes (flank, haunch-to-tail). About 2/3 the juvenile's
height, head ~43% of it, short legs, short muzzle, rounder chest."""
import sys
import draw2
import night_ff_kit
from draw2 import Canvas, outline_outer, stamp, save
from night_ff_kit import union, core, form, put, rim_outer, eye


def X(pts):
    """Shorten the back half: points behind x=36 pulled forward by 12% (a shorter kitten body)."""
    return [(36 - (36 - x) * 0.88 if x < 36 else x, y) for x, y in pts]


def shape(pts):
    return draw2.shape(X(pts))


def poly(pts):
    return draw2.poly(X(pts))


def stroke(pts, rad):
    return draw2.stroke(X(pts), rad)


def line(cv, pts, colour, only=None, smooth=True):
    return draw2.line(cv, X(pts), colour, only, smooth)


def strands(cv, lines, colour, only=None):
    return night_ff_kit.strands(cv, [X(p) for p in lines], colour, only)


def swoosh(cv, pts, radii, allowed):
    return night_ff_kit.swoosh(cv, X(pts), radii, allowed)


def stampx(cv, x, y, text):
    stamp(cv, round(X([(x + 2.5, y)])[0][0] - 2.5), y, text)

OUT = sys.argv[1] if len(sys.argv) > 1 else "cat_hatch1.txt"
cv = Canvas(64, 64)
FUR = ["h", "1", "2", "3", "d"]
FAR = ["2", "3", "d", "d", "d"]
CUT = [0.9, 0.7, 0.45, 0.2]

# tail: up behind, curling over at the tip
tail = stroke([(22, 51), (17.5, 48.5), (15.5, 44), (16.5, 39.5), (20, 37.5), (22.5, 38.5)],
              [2.3, 2.1, 1.9, 1.7, 1.3, 0.9])
form(cv, tail, FUR, CUT, R=2, line_c="4", tilt=0.1)

# far legs (higher, darker)
far_hind = stroke([(30.5, 56), (31, 59.5), (32, 61.5)], [2.5, 2.1, 2.0])
form(cv, far_hind, FAR, CUT, R=2, line_c="4")
far_front = stroke([(45, 54), (46, 58), (46.5, 61.5)], [2.4, 2.1, 2.0])
form(cv, far_front, FAR, CUT, R=2, line_c="4")

# body: short, round chest, shoulders a touch high
body = shape([(33, 46.5), (39, 46), (43.5, 49), (44.5, 54), (41.5, 57.5), (33, 58.5), (26, 58), (21.5, 55),
              (21.5, 50), (25.5, 47.5)])
form(cv, body, FUR, CUT, R=6, line_c="4", tilt=0.3)
strands(cv, [[(29, 48.5), (33, 47.8), (37, 48.3)]], "h", core(body))
strands(cv, [[(31, 54), (32, 56.5)]], "3", core(body))

# near hind leg: round thigh, short foot
thigh = shape([(21.5, 50), (26, 48.5), (29.5, 52), (29, 57), (25.5, 59.5), (21.5, 58), (20.5, 54)])
form(cv, thigh, FUR, CUT, R=4, line_c="d", tilt=0.25)
strands(cv, [[(22.5, 51.5), (25.5, 50.5)]], "h", core(thigh))
foot = stroke([(24.5, 58), (23.5, 60.5), (24.5, 61.5)], [2.4, 2.1, 2.0])
form(cv, foot, FUR, CUT, R=2, line_c="4")

# near front leg: soft shoulder, short straight leg
arm = union(shape([(37, 48), (41, 47.5), (43.5, 51), (42.5, 55), (38.5, 56), (36.5, 53)]),
            stroke([(40.5, 54), (41, 58.5), (41.5, 61.5)], [2.7, 2.3, 2.2]))
form(cv, arm, FUR, CUT, R=3, line_c="4", tilt=0.15)
line(cv, [(38, 49), (40.5, 48.5)], "h", core(arm), smooth=False)

# ears: big for the head, purple insides
for pts, rad in (([(49.5, 40), (51.7, 36.5), (52.6, 34)], [2.9, 1.8, 0.5]),
                 ([(42, 41), (40.7, 37), (40.2, 34)], [3.3, 2.0, 0.5])):
    ear = stroke(pts, rad)
    form(cv, ear, FUR, CUT, R=2, line_c="4")
    ins = stroke([(pts[0][0] + 0.4, pts[0][1]), (pts[1][0] + 0.3, pts[1][1] + 1)], [1.5, 0.6]) & core(ear)
    put(cv, ins, "r")
    put(cv, [p for p in ins if p[0] + p[1] < sum(pts[1]) + 2], "a")

# head: big for the body, short muzzle
head = shape([(39, 44), (41.5, 40), (46.5, 38.5), (51.5, 39.5), (54, 43), (53.5, 47), (50.5, 50), (44.5, 50.5),
              (40.5, 48)])
form(cv, head, FUR, CUT, R=5, line_c="4", tilt=0.25)
muzzle = shape([(49.5, 45.5), (53, 44.5), (55.5, 46.5), (54.5, 49), (50.5, 50)])
form(cv, muzzle, FUR, [0.85, 0.6, 0.35, 0.15], R=2, line_c="d")
strands(cv, [[(41.5, 41.5), (45, 40.3)]], "h", core(head))
put(cv, [(55, 45), (55, 46)], "r")           # nose
put(cv, [(53, 48), (54, 48)], "d")           # mouth
# cheek fluff
tuft = poly([(41, 46), (43.5, 48), (42.5, 50.5), (40.5, 51.5), (41, 50), (39, 50), (39.5, 48)])
form(cv, tuft, FUR, CUT, R=1.5, line_c="4", tilt=0.2)

outline_outer(cv, "4")
rim_outer(cv, "m", on=("h", "1", "2", "3", "d"))

FURL = ("h", "1", "2", "3", "d", "m")
swoosh(cv, [(41, 49), (37.5, 51.8), (33.5, 53), (30, 52.3), (28, 50.6)], [0.3, 1.0, 1.4, 1.0, 0.3], FURL)
swoosh(cv, [(27, 58), (24.5, 55), (22, 52), (19, 50), (16.7, 46), (16.3, 42)], [0.3, 0.9, 1.3, 1.1, 0.8, 0.3], FURL)
# eyes: green-only slanted slits, matched pair, under a dark brow
eye(cv, 42, 43, """
oy....
.ycyy.
...yyo
""", "d", "h")
eye(cv, 50, 43, """
..yo
.cy.
oy..
""", "d", "h")
# paws with pale claws, all on the bottom row
stamp(cv, 39, 61, """
.4dd4.
4h3d3W
444444
""")
stampx(cv, 22, 61, """
.4dd4.
4h3d3W
444444
""")
stamp(cv, 45, 60, """
.4d4
4d3W
4444
""")
stampx(cv, 30, 60, """
.4d4
4d3W
4444
""")
save(cv, OUT)
