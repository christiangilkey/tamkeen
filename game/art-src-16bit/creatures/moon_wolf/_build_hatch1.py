"""Moon wolf hatchling (pup), from juvenile ff1: standing alert, three-quarter view facing right.
Violet coat with layered fur and little hackle tufts, pale zig-zag ruff at cheeks and chest, gold
crescent on the brow, narrow gold eyes, moonlit rim light, big pup paws, short bushy tail with a pale
tip. About 2/3 the juvenile's height, head ~43% of it, short muzzle, rounder chest."""
import sys
from draw2 import Canvas, shape, stroke, poly, outline_outer, stamp, save, line
from night_ff_kit import union, core, form, strands, put, rim_outer

OUT = sys.argv[1] if len(sys.argv) > 1 else "moon_wolf_hatch1.txt"
cv = Canvas(64, 64)
COAT = ["h", "1", "2", "3", "d"]
FAR = ["2", "3", "d", "d", "d"]
CUT = [0.9, 0.68, 0.42, 0.18]
PALE = ["c", "y", "o", "2", "3"]
PCUT = [0.82, 0.55, 0.3, 0.1]

# tail: short and bushy, held low behind, pale tip
tail = poly([(26.5, 48), (22, 49), (18.5, 51.5), (16.5, 55), (16, 58.5), (17.5, 60.5), (18.5, 58), (19.5, 59.5),
             (20.5, 56.5), (22.5, 57), (23, 54), (26.5, 53)])
form(cv, tail, COAT, CUT, R=3, line_c="d", tilt=0.2)
strands(cv, [[(23, 51), (20, 54)]], "d", core(tail))
tip = poly([(16.5, 55), (16, 58.5), (17.5, 60.5), (18.5, 58), (19.5, 59.5), (20.5, 56.5)]) & core(tail)
put(cv, tip, "y")
put(cv, [p for p in tip if p[1] < 57], "c")

# far legs
far_hind = stroke([(33.5, 55), (34, 58.5), (34, 60.5)], [2.5, 2.2, 2.1])
form(cv, far_hind, FAR, CUT, R=2, line_c="4")
far_front = stroke([(47, 50), (47.5, 55.5), (48, 59.5)], [2.9, 2.5, 2.3])
form(cv, far_front, FAR, CUT, R=2, line_c="4")

# body: short, deep round chest
body = shape([(37, 43), (44, 43.5), (48.5, 47), (48.5, 52.5), (45.5, 56), (38, 57), (30, 56.5), (25, 54), (24, 48.5),
              (28, 45), (33, 44)])
form(cv, body, COAT, CUT, R=6, line_c="4", tilt=0.3)
inb = core(body)
for x0, y0 in ((29, 47.5), (34, 47), (31, 51.5), (36, 51)):
    line(cv, [(x0, y0), (x0 - 1.5, y0 + 2), (x0 - 1, y0 + 3.5)], "3", inb)
    line(cv, [(x0 + 1, y0 - 0.5), (x0 + 2.5, y0 - 0.5)], "h", inb, smooth=False)
line(cv, [(39.5, 45.5), (38.5, 49), (39, 52.5)], "2", inb)    # shoulder line
# hackles: little tufts along the back
for (bx, by), (tx, ty) in (((37, 43.5), (34.5, 40.5)), ((32.5, 44.5), (29.5, 42)), ((28, 46), (25, 44.5))):
    sp = poly([(bx - 2, by + 1.2), (tx, ty), (bx + 1.5, by + 0.4)])
    form(cv, sp, ["h", "1", "2", "3", "d"], [0.75, 0.5, 0.25, 0.05], R=1.2, line_c="4", tilt=0.0)

# near hind leg: round thigh, short hock
thigh = shape([(24, 49), (29.5, 48), (32.5, 52), (31.5, 57), (27.5, 59), (24, 57.5), (23, 53)])
form(cv, thigh, COAT, CUT, R=4, line_c="d", tilt=0.25)
strands(cv, [[(25, 51), (28.5, 50)]], "h", core(thigh))
hock = stroke([(27, 57), (26, 59.5), (26.5, 61)], [2.6, 2.3, 2.3])
form(cv, hock, COAT, CUT, R=2, line_c="4")

# near front leg: short, thick, big pup paw
fleg = stroke([(42.5, 49), (42.5, 55), (42.5, 60)], [3.4, 2.9, 2.7])
form(cv, fleg, COAT, CUT, R=2.5, line_c="4", tilt=0.2)
strands(cv, [[(41.5, 51), (41.5, 55)]], "h", core(fleg))

# chest ruff: pale zig-zag fur down the front of the chest
chest = poly([(42, 42), (47, 43.5), (49.5, 47.5), (48.5, 51), (47, 49.5), (46, 53), (44.5, 50), (43, 53.5),
              (42, 50), (40.5, 51.5), (40, 46)])
form(cv, chest, PALE, PCUT, R=2.5, line_c="o", tilt=0.25)

# ears: big for the head, pale fur at the base
for pts, rad in (([(47, 31), (48.5, 27), (49.5, 24)], [2.9, 1.9, 0.5]),
                 ([(39.5, 32), (38.5, 27.5), (38, 24)], [3.3, 2.1, 0.5])):
    ear = stroke(pts, rad)
    form(cv, ear, COAT, CUT, R=2, line_c="4")
    ins = stroke([(pts[0][0] + 0.4, pts[0][1] + 0.5), (pts[1][0] + 0.3, pts[1][1] + 1.2)], [1.5, 0.6]) & core(ear)
    put(cv, ins, "3")
    put(cv, [p for p in ins if p[1] > pts[1][1] + 2], "o")

# head: rounder skull, short wedge muzzle
skull = shape([(37, 35), (39.5, 31), (44.5, 29.5), (49.5, 31), (51.5, 35), (51, 39.5), (47.5, 42.5), (42, 43),
               (38, 40.5)])
form(cv, skull, COAT, CUT, R=5, line_c="4", tilt=0.2)
muzzle = poly([(47, 35), (50, 34.5), (52.5, 35.8), (54.5, 38.2), (53.7, 40.5), (50.5, 42.5), (47, 42.5)])
form(cv, muzzle, ["h", "1", "2", "3", "d"], [0.88, 0.6, 0.35, 0.12], R=2, line_c="d")
line(cv, [(48, 35.8), (50.5, 35.8), (53, 37.5)], "h", core(muzzle))
put(cv, [(50, 41), (51, 41), (52, 41)], "y")         # pale lip fur
# cheek ruff: pale zig-zag sweeping back from the jaw
cheek = poly([(37, 36.5), (42, 38), (46, 42), (43.5, 43.5), (42.5, 46), (40.5, 44), (38.5, 46.5), (37.5, 44),
              (35, 45), (35.5, 40.5)])
form(cv, cheek, PALE, PCUT, R=2, line_c="o", tilt=0.2)
line(cv, [(39, 32.5), (42, 32.5), (45.5, 34.3)], "d", None, smooth=False)   # brow ridge
line(cv, [(39, 31.5), (42, 31.5)], "h", None, smooth=False)

outline_outer(cv, "4")
rim_outer(cv, "m", on=("2", "3", "d"), dirs=((1, 0),))

# eyes: narrow and gold, a touch bigger than the juvenile's for the head; far eye a sliver
stamp(cv, 39, 33, """
d4444.
.4aaK4
..raa4
""")
stamp(cv, 47, 34, """
aK
r.
""")
stamp(cv, 42, 29, """
.aa
a..
""")
put(cv, [(54, 37), (54, 38), (53, 37)], "K")       # nose
# paws: big and soft, dark claws; near paws on the bottom row
stamp(cv, 39, 60, """
.4h14h1.
4h12141.
4d3d3d34
44444444
""")
stamp(cv, 23, 60, """
.4h14h
4h1214
4d3d34
444444
""")
stamp(cv, 45, 58, """
.42142
423234
444444
""")
stamp(cv, 32, 59, """
.4214
42324
44444
""")
save(cv, OUT)
