"""Cyber cat, FF pass 2 (pick 110): same coat, eyes, glow patches and ears as ff1; new stalking
pose with readable limbs: near front leg reaching forward (defined shoulder, planted paw), far
front leg behind it (darker, partly hidden by the head), near hind leg with a strong thigh and a
clear hock angle, far hind leg tucked behind; all paws on one ground line. Head lower and forward,
shorter body, graceful S tail."""
import sys
import draw2
from draw2 import Canvas, outline_outer, stamp, save
from night_ff_kit import union, core, form, put, rim_outer
import night_ff_kit


def U(pts):
    """Lift everything above the paws by 3 px (longer legs), tapering to nothing at the ground."""
    return [(x, y - 3 if y < 50 else (y - 1.5 if y < 55 else y)) for x, y in pts]


def shape(pts):
    return draw2.shape(U(pts))


def poly(pts):
    return draw2.poly(U(pts))


def stroke(pts, rad):
    return draw2.stroke(U(pts), rad)


def line(cv, pts, colour, only=None, smooth=True):
    return draw2.line(cv, U(pts), colour, only, smooth)


def strands(cv, lines, colour, only=None):
    return night_ff_kit.strands(cv, [U(p) for p in lines], colour, only)

OUT = sys.argv[1] if len(sys.argv) > 1 else "cat_ff2.txt"
cv = Canvas(64, 64)
FUR = ["h", "1", "2", "3", "d"]
FAR = ["2", "3", "d", "d", "d"]
CUT = [0.9, 0.7, 0.45, 0.2]
GROUND = 58
HX, HY = 1, 3          # head moved lower and forward from ff1


def H(pts):
    return [(x + HX, y + HY) for x, y in pts]


def glow(core_px, mid, halo):
    put(cv, halo, "o")
    put(cv, mid, "y")
    put(cv, core_px, "c")


def patch(cx, cy, size=2):
    """A glowing patch: bright core, green body, dim halo, slightly slanted like the pick's."""
    if size == 2:
        glow([(cx, cy)], [(cx - 1, cy), (cx + 1, cy), (cx, cy + 1), (cx + 1, cy + 1), (cx - 1, cy - 1)],
             [(cx - 2, cy), (cx + 2, cy + 1), (cx, cy + 2), (cx + 1, cy + 2), (cx - 2, cy - 1), (cx - 1, cy + 1)])
    else:
        glow([(cx, cy)], [(cx - 1, cy), (cx + 1, cy)], [(cx - 2, cy), (cx + 2, cy + 1), (cx, cy + 1)])


# ---- tail: graceful S, rising from the rump, tip curling forward -------------------------
tail = stroke([(17, 40), (11, 39.5), (7, 35), (6.5, 28), (9, 22.5), (14, 20), (17.5, 21.5)],
              [3.0, 2.8, 2.6, 2.3, 2.0, 1.6, 1.1])
form(cv, tail, FUR, CUT, R=2.5, line_c="4", tilt=0.1)
strands(cv, [[(9, 33), (8, 29)], [(10, 25), (12, 23)]], "h", core(tail))

# ---- far hind leg: tucked behind, darker -------------------------------------------------
far_hind = union(stroke([(31, 44), (31, 49)], [3.6, 3.0]),
                 stroke([(31, 49), (28, 52.5), (28.5, 55), (30.5, 57)], [2.8, 2.3, 2.1, 2.0]))
form(cv, far_hind, FAR, CUT, R=2.5, line_c="4")

# ---- far front leg: reaching forward like the near one, offset right and partly hidden -------
far_front = union(stroke([(47, 43), (49, 48)], [3.6, 3.0]),
                  stroke([(49, 48), (53, 52), (56, 55.5)], [2.8, 2.4, 2.2]))
form(cv, far_front, FAR, CUT, R=2.5, line_c="4")

# ---- body: shoulder blades high, back dipping, hips up; a little shorter --------------------
body = shape([(34, 33.5), (39.5, 33), (44.5, 36.5), (46, 42), (42.5, 46.5), (34, 48), (26, 47.5), (19.5, 46.5),
              (15.5, 42.5), (16, 37), (21, 34.5), (28, 36)])
form(cv, body, FUR, CUT, R=7, line_c="4", tilt=0.3)
inb = core(body)
strands(cv, [[(31, 36), (35, 35), (39, 35.5)], [(21, 37.5), (25, 38)]], "h", inb)
strands(cv, [[(29, 41), (31, 44)], [(25, 42), (26, 45)]], "3", inb)

# ---- near hind leg: strong thigh, knee forward, shin back to a sharp hock, foot down to the paw --
thigh = shape([(16, 38), (22.5, 36.5), (28.5, 41), (29, 47.5), (25.5, 51.5), (19.5, 51), (15.5, 45.5)])
form(cv, thigh, FUR, CUT, R=5, line_c="d", tilt=0.25)
strands(cv, [[(18.5, 40.5), (22, 39.5), (25, 40.5)], [(19, 45), (22, 44)]], "h", core(thigh))
strands(cv, [[(26, 44), (25, 48)]], "3", core(thigh))
shin = stroke([(24.5, 50), (19.5, 52.5), (16.5, 54)], [3.2, 2.7, 2.3])     # knee back to the hock
foot = stroke([(16.5, 54), (17.5, 56), (19.5, 57)], [2.3, 2.1, 2.0])       # hock down to the paw
form(cv, union(shin, foot), FUR, CUT, R=2.2, line_c="4", tilt=0.15)

# ---- near front leg: defined shoulder, upper arm to the elbow, forearm reaching forward -------
shoulder = shape([(36, 36), (41.5, 35.5), (45, 40), (44, 46), (39.5, 47.5), (36, 44)])
upper = stroke([(41, 42), (42, 47.5)], [3.8, 3.2])
fore = stroke([(42, 47.5), (45.5, 51.5), (48.5, 55), (50.5, 57)], [3.0, 2.7, 2.4, 2.2])
arm = union(shoulder, upper, fore)
form(cv, arm, FUR, CUT, R=3.5, line_c="4", tilt=0.15)
ia = core(arm)
line(cv, [(37, 38), (40, 37), (43, 38.5)], "h", ia)                       # top of the shoulder blade
line(cv, [(37.5, 44.5), (40, 46.5)], "3", ia, smooth=False)               # back of the elbow
line(cv, [(43.5, 49), (46, 52)], "h", ia, smooth=False)                   # forearm muscle

# ---- ears: tall, angled forward; purple insides -------------------------------------------
for pts, rad in ((H([(54, 33), (57, 26.5), (58.5, 21.5)]), [3.4, 2.1, 0.5]),
                 (H([(46, 34), (44, 27), (43, 21.5)]), [3.8, 2.3, 0.5])):
    ear = stroke(pts, rad)
    form(cv, ear, FUR, CUT, R=2, line_c="4")
    ins = stroke([(pts[0][0] + 0.4, pts[0][1]), (pts[1][0] + 0.3, pts[1][1] + 1.2)], [1.7, 0.6]) & core(ear)
    put(cv, ins, "r")
    put(cv, [p for p in ins if p[0] + p[1] < sum(pts[1]) + 2], "a")

# ---- head: low and forward ------------------------------------------------------------
head = shape(H([(42.5, 37), (45.5, 32.5), (51.5, 31), (57, 32.5), (59.5, 36.5), (59, 41), (55.5, 44.5),
                (48.5, 45.5), (44, 42.5)]))
form(cv, head, FUR, CUT, R=6, line_c="4", tilt=0.25)
muzzle = shape(H([(53.5, 39), (58, 38), (61.5, 40.5), (60.5, 44), (55.5, 45)]))
form(cv, muzzle, FUR, [0.85, 0.6, 0.35, 0.15], R=2.5, line_c="d")
strands(cv, [H([(45, 34.5), (49, 33.5)]), H([(47, 42), (50, 43.5)])], "h", core(head))
put(cv, U(H([(60, 39), (61, 39), (61, 40)])), "r")      # nose
put(cv, U(H([(57, 43), (58, 44), (59, 44)])), "d")      # mouth
tuft = poly(H([(44.5, 39), (47, 41.5), (46, 44.5), (43.5, 46), (44, 44), (41.5, 44.5), (42.5, 42), (41, 41.5)]))
form(cv, tuft, FUR, CUT, R=2, line_c="4", tilt=0.2)
strands(cv, [H([(45, 41), (43, 44)])], "3", core(tuft))
line(cv, H([(46, 35), (49, 35), (52, 36.5)]), "d", None, smooth=False)    # brows
line(cv, H([(55, 34.5), (57.5, 35.5)]), "d", None, smooth=False)
stamp(cv, 46 + HX, 36 + HY - 3, """
oyy....
.ocyyy.
..oyyyo
""")
stamp(cv, 55 + HX, 36 + HY - 3, """
yyo
.yy
""")

outline_outer(cv, "4")
rim_outer(cv, "m", on=("h", "1", "2", "3", "d"))

# glowing patches like the pick: shoulder, back, hip, foreleg, cheek, tail
patch(39, 37)
patch(25, 36)
patch(21, 42)
patch(46, 51, 1)
patch(52, 42, 1)
patch(7, 28, 1)

# paws on one ground line, claws pale
stamp(cv, 47, GROUND - 2, """
.4dd4d4.
4h3d3d3W
44444444
""")
stamp(cv, 16, GROUND - 2, """
.4dd4d4
4h3d3dW
4444444
""")
stamp(cv, 54, GROUND - 3, """
.4d44
4d3dW
44444
""")
stamp(cv, 28, GROUND - 3, """
.4d44
4d3dW
44444
""")
put(cv, U(H([(58, 44)])), "W")     # fang
save(cv, OUT)
