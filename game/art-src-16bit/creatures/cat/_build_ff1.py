"""Cyber cat, FF pass (pick 110): near-black cat prowling low, three-quarter view facing right.
Green-only slanted glowing eyes (no pupils), glowing green patches like the pick, purple ear
insides, cool blue rim light on the outer shadow edge so the black form still reads."""
import sys
from draw2 import Canvas, shape, stroke, poly, outline_outer, stamp, save, line
from night_ff_kit import union, core, form, strands, put, rim_outer

OUT = sys.argv[1] if len(sys.argv) > 1 else "cat_ff1.txt"
cv = Canvas(64, 64)
FUR = ["h", "1", "2", "3", "d"]
FAR = ["2", "3", "d", "d", "d"]
CUT = [0.9, 0.7, 0.45, 0.2]


def glow(core_px, mid, halo):
    put(cv, halo, "o")
    put(cv, mid, "y")
    put(cv, core_px, "c")


# tail: held low behind, curling up at the end
tail = stroke([(11, 42), (6, 40), (3, 35), (3, 28), (6, 24), (10, 23)], [2.8, 2.6, 2.4, 2.2, 1.8, 1.2])
form(cv, tail, FUR, CUT, R=2.5, line_c="4", tilt=0.1)

# far legs: higher and to the right of their near partners, in shadow
far_hind = stroke([(25, 48), (28, 52), (27, 55), (30, 56)], [3.4, 2.4, 1.9, 1.8])
form(cv, far_hind, FAR, CUT, R=2, line_c="4")
far_front = stroke([(47, 44), (48, 49), (51, 53), (54, 55)], [3.0, 2.3, 1.9, 1.8])
form(cv, far_front, FAR, CUT, R=2, line_c="4")

# body: shoulder blades high, back dipping, hips up; long and low
body = shape([(36, 34), (41, 33.5), (46, 37), (47.5, 43), (43.5, 48), (34, 49.5), (25, 49), (16, 48),
              (10, 44), (10.5, 38), (16, 35), (23, 37), (29, 37)])
form(cv, body, FUR, CUT, R=7, line_c="4", tilt=0.3)
inb = core(body)
strands(cv, [[(33, 36.5), (37, 35.5), (41, 36.5)], [(19, 38.5), (24, 39)], [(13, 38.5), (16, 37.5)]], "h", inb)
strands(cv, [[(38, 40), (40, 44)], [(31, 42), (33, 45)], [(27, 43), (28, 46)]], "3", inb)

# near hind leg: big thigh, crouched hock, long foot flat on the ground
thigh = shape([(10.5, 39), (17, 37), (23, 41), (24, 48), (20, 53), (14, 52.5), (10, 47)])
form(cv, thigh, FUR, CUT, R=5, line_c="d", tilt=0.25)
strands(cv, [[(13, 42), (16, 40.5), (19, 41)]], "h", core(thigh))
shin = stroke([(17, 51), (14, 55), (18, 57), (23, 57.5)], [2.8, 2.3, 2.0, 1.8])
form(cv, shin, FUR, CUT, R=2, line_c="4")

# near front leg: from the shoulder, elbow back, paw reaching forward
arm = union(stroke([(41, 40), (40, 47)], [4.2, 3.2]), stroke([(40, 47), (42, 53), (45, 57)], [2.8, 2.3, 2.2]))
form(cv, arm, FUR, CUT, R=3, line_c="4", tilt=0.15)
strands(cv, [[(40, 42), (40, 45)]], "h", core(arm))

# ears: tall, angled forward; purple insides
for pts, rad in (([(54, 33), (57, 26.5), (58.5, 21.5)], [3.4, 2.1, 0.5]),
                 ([(46, 34), (44, 27), (43, 21.5)], [3.8, 2.3, 0.5])):
    ear = stroke(pts, rad)
    form(cv, ear, FUR, CUT, R=2, line_c="4")
    ins = stroke([(pts[0][0] + 0.4, pts[0][1]), (pts[1][0] + 0.3, pts[1][1] + 1.2)], [1.7, 0.6]) & core(ear)
    put(cv, ins, "r")
    put(cv, [p for p in ins if p[0] + p[1] < sum(pts[1]) + 2], "a")

# head: low and forward, wedge skull, short muzzle at the lower right
head = shape([(42.5, 37), (45.5, 32.5), (51.5, 31), (57, 32.5), (59.5, 36.5), (59, 41), (55.5, 44.5),
              (48.5, 45.5), (44, 42.5)])
form(cv, head, FUR, CUT, R=6, line_c="4", tilt=0.25)
muzzle = shape([(53.5, 39), (58, 38), (61.5, 40.5), (60.5, 44), (55.5, 45)])
form(cv, muzzle, FUR, [0.85, 0.6, 0.35, 0.15], R=2.5, line_c="d")
strands(cv, [[(45, 34.5), (49, 33.5)], [(47, 42), (50, 43.5)]], "h", core(head))
put(cv, [(60, 39), (61, 39), (61, 40)], "r")       # nose
put(cv, [(57, 43), (58, 44), (59, 44)], "d")       # mouth
# cheek tuft: fur sweeping back from the jaw
tuft = poly([(44.5, 39), (47, 41.5), (46, 44.5), (43.5, 46), (44, 44), (41.5, 44.5), (42.5, 42), (41, 41.5)])
form(cv, tuft, FUR, CUT, R=2, line_c="4", tilt=0.2)
strands(cv, [[(45, 41), (43, 44)]], "3", core(tuft))
# brows: hard dark ridges angled down toward the nose
line(cv, [(46, 35), (49, 35), (52, 36.5)], "d", None, smooth=False)
line(cv, [(55, 34.5), (57.5, 35.5)], "d", None, smooth=False)
# eyes: green only, slanted, glowing, no pupils
stamp(cv, 46, 36, """
oyy....
.ocyyy.
..oyyyo
""")
stamp(cv, 55, 36, """
yyo
.yy
""")

outline_outer(cv, "4")
rim_outer(cv, "m", on=("h", "1", "2", "3", "d"))

# glowing patches like the pick: shoulder, back, hip, front leg, cheek, tail
glow([(37, 38)], [(36, 38), (38, 38), (37, 39), (38, 39), (36, 37), (39, 39)],
     [(35, 38), (40, 39), (37, 40), (38, 40), (35, 37), (39, 40)])
glow([(23, 39)], [(22, 39), (24, 39), (25, 40), (23, 40), (24, 40)], [(21, 39), (26, 40), (25, 41), (22, 40), (23, 41)])
glow([(16, 44)], [(15, 44), (17, 44), (16, 45), (17, 45), (15, 43)], [(14, 44), (18, 45), (16, 46), (17, 46), (14, 43)])
glow([(41, 50)], [(41, 49), (41, 51), (42, 51)], [(40, 49), (42, 52), (40, 51)])
glow([(51, 42)], [(50, 42), (52, 42)], [(49, 42), (53, 43), (51, 43)])
glow([(4, 31)], [(3, 31), (5, 31), (4, 32)], [(3, 32), (5, 32), (4, 30)])

# paws and claws
stamp(cv, 42, 56, """
.4dd4d4.
4h3d3d3W
44444444
""")
stamp(cv, 21, 56, """
.4dd4d4
4h3d3dW
4444444
""")
stamp(cv, 52, 54, """
.4d44
4d3dW
44444
""")
stamp(cv, 27, 55, """
.4d44
4d3dW
44444
""")
put(cv, [(58, 44)], "W")                      # fang under the lip
save(cv, OUT)
