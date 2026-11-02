"""Cyber seal pup (baby of seal _ff1): same FF rendering and exact palette. About 2/3 the height, big
head with a short muzzle, plump but streamlined body, small flippers. Keeps the teal stripes, the glowing
flank line, the ear implant and the magenta glowing eyes (normal size). Propped on its fore flippers,
three-quarter view facing right; light top left."""
import math
import sys
from water_ff_kit import (Canvas, shape, stroke, poly, paint_form, outline_outer, save, line, union, st,
                          rim, inner_line, rays, dots, paint_vol, edge, catmull)

OUT = sys.argv[1] if len(sys.argv) > 1 else "seal_hatch1.txt"
cv = Canvas(64, 64)
SKIN = ["h", "1", "2", "3", "d"]
FLIP = ["1", "2", "3", "d", "d"]

# far fore flipper (right, higher, shaded)
far = shape([(46, 52), (49.5, 54.5), (51.5, 59), (50.5, 61), (46.5, 60.5), (45, 56.5)])
paint_form(cv, far, ["2", "3", "d", "d"], [0.7, 0.4, 0.15], R=2, outline="d")
rays(cv, [((47, 55), (48.5, 60))], "d", far - edge(far))

# small hind flippers fanned at the tail end
for tip_a, tip_b in (((4, 55), (5.5, 53)), ((4, 62.5), (7, 63))):
    fl = poly([(11, 58.5), tip_a, tip_b, (11, 60.5)]) | stroke([(11, 59.5), ((tip_a[0] + tip_b[0]) / 2, (tip_a[1] + tip_b[1]) / 2)], [1.8, 1.3])
    paint_form(cv, fl, FLIP, [0.85, 0.55, 0.3, 0.1], R=1.5, outline="d")
    mid = ((tip_a[0] + tip_b[0]) / 2, (tip_a[1] + tip_b[1]) / 2)
    rays(cv, [((10, 59.5), mid)], "3", fl - edge(fl))

# body: short streamlined tube, plump chest
spine = [(43, 44), (41, 50), (35, 55.5), (26, 58.5), (17, 60), (11, 60)]
radii = [5.8, 7.2, 7.0, 5.4, 3.4, 2.0]
body = stroke(spine, radii)
paint_vol(cv, body, SKIN, [0.9, 0.74, 0.52, 0.28], (30, 54), (16, 9), R=4, w=0.6, outline="d", tilt=0.15)
bin_ = body - edge(body)
belly = shape([(45, 46), (49, 51), (47.5, 57), (41, 61), (32, 63), (28, 62.5), (37, 57.5), (43, 52), (45.5, 48)]) & bin_
paint_vol(cv, belly, ["c", "c", "y", "o", "3"], [0.82, 0.62, 0.4, 0.18], (30, 54), (16, 9), R=2.5, w=0.6)
back = bin_ - belly
path = catmull(spine, closed=False, steps=20)
for t in (0.22, 0.42, 0.62, 0.8):
    i = int(t * (len(path) - 1))
    (x0, y0), (x1, y1) = path[i], path[i + 1]
    L = math.hypot(x1 - x0, y1 - y0) or 1
    nx, ny = (y1 - y0) / L, -(x1 - x0) / L
    if ny > 0:
        nx, ny = -nx, -ny
    f = t * (len(radii) - 1)
    r = radii[int(f)] + (radii[min(int(f) + 1, 5)] - radii[int(f)]) * (f - int(f))
    a = (x0 + nx * (r - 4.0) - 0.5, y0 + ny * (r - 4.0))
    b = (x0 + nx * (r + 1) + 1, y0 + ny * (r + 1))
    band = stroke([a, b], [1.1, 0.9]) & back
    for p in band:
        cv.set(*p, "a")
    line(cv, [a, b], "r", band, smooth=False)
glow = [(39, 52), (33, 56.5), (25, 59), (18, 60.3)]
line(cv, glow, "g", bin_)
line(cv, [(x, y + 1) for x, y in glow], "a", bin_)
dots(cv, [(36, 54.5), (28, 58)], "W", bin_)
dots(cv, [(39, 46), (40, 45), (33, 51)], "h", back)
rim(cv, body, "g", dirs=((0, 1), (1, 1)))

# near fore flipper: small paddle, planted
near = shape([(38, 51), (42, 53.5), (43, 57), (44.5, 61), (43.5, 63.5), (37, 63.5), (35.5, 61), (36.5, 56.5), (36.5, 53.5)])
paint_vol(cv, near, FLIP, [0.85, 0.6, 0.35, 0.12], (39.5, 57), (4.5, 6), R=2, w=0.5, outline="d")
nin = near - edge(near)
rays(cv, [((38, 58), (37.5, 62)), ((40, 58), (40, 62)), ((42, 58), (42.5, 62))], "3", nin)
dots(cv, [(37, 63), (40, 63), (43, 63)], "c")
inner_line(cv, near, "d")

# head: big for a pup, rounded crown but structured, short muzzle toward us
head = shape([(36, 37), (40, 32.5), (46.5, 31), (52, 32.5), (55.5, 36), (57.5, 40), (56.5, 43.5), (52.5, 46), (45.5, 46.5), (39.5, 45), (36, 41.5)])
paint_vol(cv, head, SKIN, [0.9, 0.72, 0.5, 0.28], (47, 38), (11, 8), R=4, w=0.6, outline="d", tilt=0.1)
hin = head - edge(head)
pad = shape([(50, 38.5), (54, 37.5), (57.2, 40), (56.5, 43.2), (52.5, 45.2), (49.5, 43.5)]) & hin
paint_vol(cv, pad, ["y", "y", "o", "3", "3"], [0.8, 0.5, 0.3, 0.12], (53, 41), (4.5, 4), R=2, w=0.5)
dots(cv, [(51, 40), (53, 39.5), (52, 42), (54, 41.5)], "3", pad)     # whisker pits
st(cv, 55, 38, ["KK", "4K"])                                          # nose
line(cv, [(56, 44), (53.5, 44.8), (50.5, 45)], "d", hin, smooth=False)  # mouth
# eyes: same narrow glowing magenta style, a touch bigger relative to the head
st(cv, 41, 33, [".hh1...",
                "dd4444.",
                ".4eeK44",
                "..4ee4.",
                "...44.."])
st(cv, 50, 34, ["d4", "eK", "44"])
st(cv, 37, 37, ["4a4.", "arg4", "4a4."])          # small ear implant with its glow
dots(cv, [(43, 32), (44, 32), (47, 32)], "W", hin)
rim(cv, head, "g", dirs=((0, 1), (1, 1)))

outline_outer(cv, "4", keep=("4", "K"))
save(cv, OUT)
