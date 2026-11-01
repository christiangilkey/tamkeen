"""Seal FF1 (water, cyberpunk pick 79): a sleek young cyber seal in the Final Fantasy monster style.
Three-quarter view facing right, propped on its fore flippers, head raised and alert. Streamlined
body, normal-size intense eyes with a cyan glow, whisker pad with whiskers, dark teal stripe
markings with glowing panel lines, a small ear implant, detailed flippers with digit ridges and claws.
Extra colour letters: h highlight, d deep shade, g cyan glow / rim light, e magenta LED."""
import sys
from water_ff_kit import (Canvas, shape, stroke, poly, paint_form, outline_outer, save, line, union, st,
                          rim, inner_line, rays, dots, paint_vol, edge, catmull)

OUT = sys.argv[1] if len(sys.argv) > 1 else "seal_ff1.txt"
cv = Canvas(64, 64)
SKIN = ["h", "1", "2", "3", "d"]
FLIP = ["1", "2", "3", "d", "d"]

# ---- far fore flipper (right, higher, in shade)
far = shape([(50, 42), (54, 45), (57, 51), (56.5, 54), (51, 53.5), (49, 48)])
paint_form(cv, far, ["2", "3", "d", "d"], [0.7, 0.4, 0.15], R=2, outline="d")
rays(cv, [((51, 46), (53, 53)), ((53, 46), (55.5, 52.5))], "d", far - edge(far))

# ---- hind flippers fanned at the tail end
for tip_a, tip_b in (((1, 44), (3, 41)), ((1, 58), (4, 60))):
    fl = poly([(10, 51.5), tip_a, tip_b, (10, 54.5)]) | stroke([(10, 53), ((tip_a[0] + tip_b[0]) / 2, (tip_a[1] + tip_b[1]) / 2)], [2.2, 1.6])
    paint_form(cv, fl, FLIP, [0.85, 0.55, 0.3, 0.1], R=2, outline="d")
    mid = ((tip_a[0] + tip_b[0]) / 2, (tip_a[1] + tip_b[1]) / 2)
    rays(cv, [((9, 53), tip_a), ((9, 53), mid), ((9, 53), tip_b)], "3", fl - edge(fl))

# ---- body: one streamlined tube along a curved spine
spine = [(45, 28), (43, 37), (36, 45.5), (25, 50.5), (15, 53), (8, 53)]
body = stroke(spine, [7.0, 9.0, 9.0, 7.0, 4.5, 2.6])
paint_vol(cv, body, SKIN, [0.9, 0.74, 0.52, 0.28], (30, 42), (20, 13), R=5, w=0.6, outline="d", tilt=0.15)
bin_ = body - edge(body)
belly = shape([(47, 30), (52, 37), (50, 46), (43, 53), (32, 57), (26, 56), (37, 49), (45, 41), (48, 34)]) & bin_
paint_vol(cv, belly, ["c", "c", "y", "o", "3"], [0.82, 0.62, 0.4, 0.18], (30, 42), (20, 13), R=3, w=0.6)
back = bin_ - belly
# dark teal stripe markings across the back, each with a glowing panel line inside
path = catmull(spine, closed=False, steps=20)
import math
radii = [7.0, 9.0, 9.0, 7.0, 4.5, 2.6]
for t in (0.18, 0.33, 0.48, 0.62, 0.76):
    i = int(t * (len(path) - 1))
    (x0, y0), (x1, y1) = path[i], path[i + 1]
    L = math.hypot(x1 - x0, y1 - y0) or 1
    nx, ny = (y1 - y0) / L, -(x1 - x0) / L
    if ny > 0:
        nx, ny = -nx, -ny
    f = t * (len(radii) - 1)
    r = radii[int(f)] + (radii[min(int(f) + 1, 5)] - radii[int(f)]) * (f - int(f))
    a = (x0 + nx * (r - 5.5) - 1, y0 + ny * (r - 5.5))
    b = (x0 + nx * (r + 1) + 1.5, y0 + ny * (r + 1))
    band = stroke([a, b], [1.3, 1.0]) & back
    for p in band:
        cv.set(*p, "a")
    line(cv, [a, b], "r", band, smooth=False)
# glowing panel line along the flank, shoulder to tail
glow = [(41, 41), (35, 47), (26, 51.5), (17, 53.5), (11, 53.5)]
line(cv, glow, "g", bin_)
line(cv, [(x, y + 1) for x, y in glow], "a", bin_)
dots(cv, [(39, 43), (30, 49.5), (21, 52.8)], "W", bin_)     # panel nodes
# wet speculars on the back
dots(cv, [(40, 33), (41, 32), (33, 41), (34, 40), (24, 46)], "h", back)
rim(cv, body, "g", dirs=((0, 1), (1, 1)))

# ---- near fore flipper: broad paddle with digit ridges and claws, planted
near = shape([(39, 42), (44, 45.5), (45.5, 51), (47.5, 57.5), (46, 60.5), (38, 60.5), (36, 57.5), (37.5, 51), (37, 46)])
paint_vol(cv, near, FLIP, [0.85, 0.6, 0.35, 0.12], (40, 50), (6, 9), R=2.5, w=0.5, outline="d")
nin = near - edge(near)
rays(cv, [((39, 53), (38, 59)), ((41, 53), (41, 59)), ((43, 53), (44, 59))], "3", nin)
dots(cv, [(38, 60), (41, 60), (44, 60), (46, 60)], "c")     # claws
dots(cv, [(39, 46), (40, 45)], "h", nin)
inner_line(cv, near, "d")

# ---- head: sleek and long, flat crown, defined muzzle toward us
head = shape([(38, 20), (42.5, 15), (49.5, 13), (55.5, 14.5), (59.5, 18.5), (62.8, 22.5), (62, 26.8), (57.5, 29.5),
              (50, 30.2), (43, 28.5), (38.5, 25)])
paint_vol(cv, head, SKIN, [0.9, 0.72, 0.5, 0.28], (50, 21), (13, 9), R=4, w=0.6, outline="d", tilt=0.1)
hin = head - edge(head)
pad = shape([(54, 21), (58.5, 19.5), (62.5, 22.5), (62, 26.5), (57.5, 28.8), (53.5, 27)]) & hin
paint_vol(cv, pad, ["y", "y", "o", "3", "3"], [0.8, 0.5, 0.3, 0.12], (57, 23), (6, 5), R=2, w=0.5)
dots(cv, [(56, 23), (58, 22.5), (57, 25), (59, 24.5), (55, 25.5)], "3", pad)     # whisker pits
st(cv, 60, 20, ["KK.", "4KK"])                                           # nose
line(cv, [(61.5, 27), (58, 28.2), (54, 28.4)], "d", hin, smooth=False)   # mouth
# brow and eyes: normal size, narrow, glowing cyan, angled brow
st(cv, 45, 15, [".hh1...",
                "dd4444.",
                ".4eeK44",
                "..4ee4.",
                "...44.."])
st(cv, 55, 16, ["d4", "eK", "44"])
# cyber ear implant behind the eye: dark plate with a magenta LED
st(cv, 39, 20, ["4aa4.", "arrg4", "4aa4."])
dots(cv, [(47, 14), (48, 14), (51, 14)], "W", hin)       # wet glints on the crown
rim(cv, head, "g", dirs=((0, 1), (1, 1)))

outline_outer(cv, "4", keep=("4", "K"))
save(cv, OUT)
