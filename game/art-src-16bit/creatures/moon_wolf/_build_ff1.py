"""Moon wolf, FF pass (pick 160): young wolf standing alert, three-quarter view facing right.
Violet coat with layered fur and raised hackles, zig-zag pale ruff at the cheeks and chest,
moonlit cyan rim light on the shadow side, gold crescent on the brow, sharp gold eyes, sturdy paws."""
import sys
from draw2 import Canvas, shape, stroke, poly, outline_outer, stamp, save, line
from night_ff_kit import union, core, form, strands, put, rim_outer

OUT = sys.argv[1] if len(sys.argv) > 1 else "moon_wolf_ff1.txt"
cv = Canvas(64, 64)
COAT = ["h", "1", "2", "3", "d"]
FAR = ["2", "3", "d", "d", "d"]
CUT = [0.9, 0.68, 0.42, 0.18]
PALE = ["c", "y", "o", "2", "3"]
PCUT = [0.82, 0.55, 0.3, 0.1]

# ---- tail: bushy, held low and out behind, layered clumps, pale tip --------------------------
tail = union(poly([(17, 36), (12, 37.5), (7, 41), (3.5, 46), (2, 52), (3.5, 55), (5, 51.5), (6.5, 54),
                   (8, 49.5), (10.5, 51), (11, 46.5), (14.5, 46), (18, 42)]))
form(cv, tail, COAT, CUT, R=4, line_c="d", tilt=0.2)
strands(cv, [[(14, 40), (9, 43), (6, 48)], [(15, 43), (11, 46)]], "d", core(tail))
strands(cv, [[(13, 38.5), (8, 41.5)]], "h", core(tail))
tip = poly([(5, 46), (2, 52), (3.5, 55), (5, 51.5), (6.5, 54), (8, 49.5)]) & core(tail)
put(cv, tip, "y")
put(cv, [p for p in tip if p[0] + p[1] < 54], "c")

# ---- far legs ---------------------------------------------------------------------------
far_hind = stroke([(31, 43), (33, 49), (32, 55)], [3.2, 2.6, 2.4])
form(cv, far_hind, FAR, CUT, R=2, line_c="4")
far_front = stroke([(51, 40), (52, 48), (53, 54)], [3.6, 2.8, 2.6])
form(cv, far_front, FAR, CUT, R=2, line_c="4")

# ---- body: deep chest, level back, tucked belly -------------------------------------------
body = shape([(40, 27), (48, 28), (53.5, 33), (53, 40), (49, 45), (40, 46.5), (30, 46), (21, 45), (15, 41),
              (15, 34), (21, 30), (30, 29.5)])
form(cv, body, COAT, CUT, R=7, line_c="4", tilt=0.3)
inb = core(body)
# fur clumps: dark parting lines and lit tips along the flank
strands(cv, [[(23, 34), (21, 36.5)], [(29, 33.5), (27, 36)], [(35, 33.5), (33, 36)], [(26, 40), (24, 42.5)],
             [(32, 40), (30, 42.5)], [(38, 39.5), (36, 42)]], "2", inb)
strands(cv, [[(23, 33), (21, 35)], [(29, 32), (27, 34.5)], [(35, 32), (33, 34.5)]], "h", inb)
strands(cv, [[(24, 45), (31, 45.5), (38, 45.5)]], "d", inb)
# layered fur: scalloped clump edges on the flank (lit tops, shaded undersides)
for x0, y0 in ((21, 34), (27, 33.5), (33, 33), (24, 39.5), (30, 39), (36, 38.5)):
    line(cv, [(x0, y0), (x0 - 2, y0 + 2), (x0 - 1.5, y0 + 4)], "3", inb)
    line(cv, [(x0 + 1, y0 - 0.5), (x0 + 3, y0 - 0.5)], "h", inb, smooth=False)
# shoulder: an anatomy line separating the shoulder from the chest
line(cv, [(41, 30.5), (39, 35), (39.5, 40)], "2", inb)
# belly fringe: fur hanging in short points under the belly
for bx in (25, 29.5, 34, 38.5):
    sp = poly([(bx - 2, 45), (bx - 1.5, 49), (bx + 1.5, 45.5)])
    form(cv, sp, ["2", "3", "d", "d", "d"], [0.7, 0.4, 0.2, 0.05], R=1, line_c="4", tilt=0.0)

# hackles: short raised fur spikes along the shoulders, sweeping back, lit tips
for (bx, by), (tx, ty) in (((40, 28.5), (36, 23.5)), ((35, 29), (30.5, 25)), ((30, 30), (25.5, 26.5)),
                           ((25, 30.5), (20.5, 28))):
    sp = poly([(bx - 2.5, by + 1.5), (tx, ty), (bx + 2, by + 0.5)])
    form(cv, sp, ["h", "1", "2", "3", "d"], [0.75, 0.5, 0.25, 0.05], R=1.5, line_c="4", tilt=0.0)
    put(cv, [(int(tx) + 1, int(ty) + 1)], "h")

# ---- near hind leg: thigh, hock angled back, sturdy paw --------------------------------
thigh = shape([(16, 36), (24, 35), (28, 41), (27, 48), (22, 50.5), (16.5, 47)])
form(cv, thigh, COAT, CUT, R=5, line_c="d", tilt=0.25)
strands(cv, [[(18, 39), (22, 38)], [(19, 43), (23, 41.5)]], "h", core(thigh))
strands(cv, [[(24, 44), (21, 47.5)]], "3", core(thigh))
hock = stroke([(22, 48), (20, 53), (21, 57)], [3.0, 2.6, 2.6])
form(cv, hock, COAT, CUT, R=2, line_c="4")

# ---- near front leg: straight, heavy, big paw -------------------------------------------
fleg = union(stroke([(45, 38), (44.5, 46)], [4.6, 3.6]), stroke([(44.5, 46), (44, 52), (44, 56)], [3.4, 3.0, 3.0]))
form(cv, fleg, COAT, CUT, R=3, line_c="4", tilt=0.2)
strands(cv, [[(43, 41), (43, 45)], [(42, 49), (42, 52)]], "h", core(fleg))

# ---- chest ruff: zig-zag pale fur down the front of the chest --------------------------
chest = poly([(45, 26), (51, 27.5), (54.5, 33), (53.5, 38.5), (51.5, 36.5), (50.5, 41.5), (48.5, 38), (46.5, 42.5),
               (45, 37.5), (43, 39.5), (42.5, 32)])
form(cv, chest, PALE, PCUT, R=3, line_c="o", tilt=0.25)
strands(cv, [[(48, 31), (47, 35)], [(51, 32), (51, 35)]], "o", core(chest))

# ---- ears ------------------------------------------------------------------------------
for pts, rad in (([(50.5, 13.5), (52, 7.5), (53, 2.5)], [3.6, 2.3, 0.6]),
                 ([(42.5, 14.5), (40.5, 7.5), (39.5, 1.5)], [4.0, 2.6, 0.6])):
    ear = stroke(pts, rad)
    form(cv, ear, COAT, CUT, R=2, line_c="4")
    ins = stroke([(pts[0][0] + 0.5, pts[0][1] + 0.5), (pts[1][0] + 0.4, pts[1][1] + 1.5)], [1.8, 0.6]) & core(ear)
    put(cv, ins, "3")
    put(cv, [p for p in ins if p[1] > pts[1][1] + 3], "o")   # pale fur at the ear base

# ---- head: long skull, wedge muzzle toward us and to the right ------------------------
skull = shape([(39, 18), (42, 13), (48, 11.5), (53, 13.5), (55, 18), (54, 23), (50, 26.5), (44, 27), (40, 24)])
form(cv, skull, COAT, CUT, R=6, line_c="4", tilt=0.2)
muzzle = poly([(50, 17.5), (54, 17), (58, 19), (60.5, 21.5), (59.5, 24), (55, 26.5), (50, 26.5)])
form(cv, muzzle, ["h", "1", "2", "3", "d"], [0.88, 0.6, 0.35, 0.12], R=2.5, line_c="d")
line(cv, [(51, 18.5), (55, 18.5), (58.5, 20.5)], "h", core(muzzle))      # lit bridge
put(cv, [(52, 24), (53, 24), (54, 24), (55, 24)], "y")                     # pale lip fur
# cheek ruff: zig-zag pale fur sweeping back from the jaw
cheek = poly([(40, 19.5), (46, 21.5), (50.5, 26), (47.5, 27.5), (46.5, 31), (44, 28), (41.5, 31.5), (40, 27.5),
              (36.5, 29.5), (37.5, 24)])
form(cv, cheek, PALE, PCUT, R=2.5, line_c="o", tilt=0.2)
strands(cv, [[(42, 23), (40, 26)], [(45, 24), (44, 27)]], "o", core(cheek))
# brow ridge over the eye, angled down toward the muzzle
line(cv, [(42, 15.5), (45, 15.5), (49, 17.5)], "d", None, smooth=False)
line(cv, [(42, 14.5), (45, 14.5)], "h", None, smooth=False)
line(cv, [(51, 17), (53, 16.5)], "d", None, smooth=False)

outline_outer(cv, "4")
rim_outer(cv, "m", on=("2", "3", "d"), dirs=((1, 0),))

# eyes: narrow, gold, slit pupil; far eye a sharp sliver
stamp(cv, 43, 16, """
d4444.
.4aaK4
..raa4
""")
stamp(cv, 51, 17, """
aK
r.
""")
# crescent moon on the brow
stamp(cv, 45, 11, """
.aa
a..
""")
put(cv, [(60, 21), (60, 22), (59, 21)], "K")        # nose
put(cv, [(56, 25)], "W")                            # fang
# paws: heavy, toes and dark claws
stamp(cv, 40, 55, """
.4h14h14.
4h1214124
4d3d3d3d4
444444444
""")
stamp(cv, 18, 56, """
.4h14h14
4h121412
4d3d3d34
44444444
""")
stamp(cv, 50, 53, """
.4214214
42323234
44444444
""")
stamp(cv, 29, 54, """
.42142
423234
444444
""")
cv.set(44, 59, ".")  # clear the stray outline pixel below the near front paw
save(cv, OUT)
