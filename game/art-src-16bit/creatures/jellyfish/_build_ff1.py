"""Jellyfish FF1 (water, fantasy pick 188): an ethereal young jellyfish spirit in the Final Fantasy
monster style. The face sits inside the bell (the bell wraps round it like a hood, with a cream frill
ring framing the face, as in the pick). Translucent two-layer bell: a pale outer veil with swirling
cream ripples over a deeper inner dome with glowing ribs. Frilly oral arms and long fine tentacles
drift below; a few glowing motes. Small splash of cute in the face only.
Extra colour letters: h veil highlight, d deep inner shade, g glow, e violet (rim light, tentacle shade)."""
import math
import sys
from water_ff_kit import (Canvas, shape, stroke, poly, paint_form, outline_outer, save, line, union, st,
                          rim, inner_line, dots, paint_vol, edge, catmull)

OUT = sys.argv[1] if len(sys.argv) > 1 else "jellyfish_ff1.txt"
cv = Canvas(64, 64)
FC = (37, 30)            # face centre (right of the bell centre: the bell is turned toward us)


def ell(cx, cy, rx, ry, n=64):
    return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]


def wavy(x0, y0, length, drift, amp, ph, freq=6.5, n=14):
    return [(x0 - drift * t + amp * math.sin(ph + t * freq) * (0.3 + t), y0 + length * t) for t in (i / (n - 1) for i in range(n))]


# ---- oral arms: frilly ribbons hanging from under the face (behind the frill ring's lower edge)
for x0, y0, ln, drift, amp, ph, w in ((34, 38, 24, 6, 2.0, 0.0, 3.4), (40, 38, 22, 4, 1.8, 0.9, 3.0), (29, 38, 19, 7, 1.7, -0.6, 2.6)):
    path = wavy(x0, y0, ln, drift, amp, ph)
    arm = set()
    for i, (x, y) in enumerate(path):
        t = i / (len(path) - 1)
        r = w * (1 - 0.6 * t) * (0.8 + 0.3 * math.sin(i * 1.9))      # ruffled width
        arm |= stroke([(x, y), (x, y + 0.6)], [max(r, 0.8)] * 2)
    paint_vol(cv, arm, ["c", "a", "a", "r", "e"], [0.8, 0.55, 0.3, 0.1], (x0 - 2, y0 + ln / 2), (5, ln / 2 + 2), R=1.5, w=0.5, outline="r")
    line(cv, path, "r", arm - edge(arm))
    dots(cv, path[1::3], "c", arm - edge(arm))

# ---- bell outer veil: a hood wrapping round the face, fuller on the near (left) side
veil = shape([(26, 2), (34, 3.5), (42, 8.5), (48, 16), (51.5, 25), (52, 34), (48.5, 40), (41, 43), (32, 44),
              (22, 43), (13, 39.5), (8.5, 32), (8, 23), (11, 13), (18, 5.5)])
veil |= union(stroke([(11, 37), (8, 45), (6, 52)], [3.2, 2.0, 0.8]), stroke([(19, 41), (17, 48), (16, 55)], [2.8, 1.8, 0.8]),
              stroke([(45, 40), (47.5, 47), (49, 54)], [2.8, 1.8, 0.8]), stroke([(51, 33), (54.5, 41), (57, 47)], [2.8, 1.8, 0.8]))
paint_vol(cv, veil, ["h", "1", "1", "2", "3"], [0.86, 0.66, 0.42, 0.18], (29, 24), (22, 24), R=5, w=0.6, outline="3")
vin = veil - edge(veil)
# scalloped veil hem along the bottom edge (cream frill)
hem = set()
for x, y in catmull([(9, 33), (13, 38.5), (20, 42), (27, 43.5), (35, 43.5), (42, 42), (48, 38.5), (51.5, 33)], closed=False, steps=3)[::2]:
    hem |= stroke([(x, y - 0.8), (x, y + 0.8)], [2.3, 2.3])
paint_vol(cv, hem, ["c", "c", "y", "2", "3"], [0.8, 0.55, 0.3, 0.1], (30, 38), (22, 7), R=1.8, w=0.5, outline="3")

# ---- inner dome seen through the veil: deeper mint with glowing ribs
dome = shape([(27, 7), (35, 8.5), (43, 14), (46.5, 23), (45, 31), (38, 35), (26, 35.5), (17, 32), (13.5, 24), (15.5, 14), (21, 8.5)])
dome &= vin
paint_vol(cv, dome, ["2", "3", "3", "d", "d"], [0.84, 0.62, 0.38, 0.16], (30, 21), (17, 14), R=3, w=0.65)
for x, y in [p for p in edge(dome)]:
    if cv.get(x, y) not in ("3", "d"):
        cv.set(x, y, "3")
din = dome - edge(dome)
TOP = (28, 8)
for end in ((15, 27), (21, 32), (29, 33.5), (38, 33), (44.5, 27)):
    mid = ((TOP[0] + end[0]) / 2 + (end[0] - TOP[0]) * 0.25, (TOP[1] + end[1]) / 2 - 2)
    line(cv, [TOP, mid, end], "g", din)
    line(cv, [(TOP[0] + 1, TOP[1]), (mid[0] + 1, mid[1]), (end[0] + 1, end[1])], "2", din)
for cx, cy in ((25, 15), (31, 13.5), (28, 19), (22.5, 19.5)):          # glowing core, four rings
    for i in range(12):
        a = 2 * math.pi * i / 12
        p = (int(round(cx + 2.2 * math.cos(a))), int(round(cy + 1.7 * math.sin(a))))
        if p in din:
            cv.set(*p, "g")
dots(cv, [TOP, (27, 8), (26.5, 16.5), (29, 16.5)], "W", din)
# swirling cream ripples on the veil (wide soft bands, like the pick's cream swirls)
for pts in ([(12, 21), (14, 13.5), (20, 8), (28, 5.5)], [(10, 30), (11, 24.5), (14, 19), (19, 15)],
            [(34, 5), (40.5, 7.5), (46, 13)], [(48, 19), (50, 26), (49.5, 31)]):
    line(cv, pts, "c", vin)
    line(cv, [(x + 0.7, y + 0.7) for x, y in pts], "c", vin)
    line(cv, [(x + 1.5, y + 1.5) for x, y in pts], "y", vin)

# ---- frill ring framing the face, with a lobed outer edge
ring = poly(ell(FC[0], FC[1], 10.0, 8.8))
for i, (x, y) in enumerate(ell(FC[0], FC[1], 9.8, 8.6, n=16)):
    ring |= stroke([(x, y), (x, y)], [1.9, 1.9])
paint_vol(cv, ring, ["c", "c", "y", "2", "3"], [0.82, 0.58, 0.32, 0.12], FC, (12, 11), R=2, w=0.6, outline="3")
hole = poly(ell(FC[0] + 0.3, FC[1] + 0.3, 7.4, 6.5))
for p in hole:                                   # shadowed recess just inside the frill
    cv.set(*p, "d")

# ---- face: pink, set inside the recess
face = poly(ell(FC[0] + 0.6, FC[1] + 1.0, 6.5, 5.7))
paint_vol(cv, face, ["c", "a", "a", "r", "r"], [0.9, 0.62, 0.3, 0.12], (FC[0] + 0.6, FC[1] + 0.8), (8, 7), R=3, w=0.6, outline="r")
st(cv, 32, 28, ["dd44.",
                ".4gK4",
                "..44."])
st(cv, 40, 28, ["d4", "gK", "4."])
st(cv, 37, 33, ["oo"])
rim(cv, veil, "e", dirs=((1, 0), (1, 1)))

outline_outer(cv, "4", keep=("4", "K"))

# ---- fine tentacles from the hem, drifting behind (drawn only where nothing is drawn yet)
for x0, y0, ln, drift, amp, ph in ((12, 40, 21, 4, 1.4, 0.4), (19, 44, 19, 5, 1.6, 1.2), (46, 42, 20, 6, 1.5, 2.0),
                                   (51, 37, 22, 7, 1.3, 2.8), (24, 46, 16, 4, 1.2, 0.0)):
    path = wavy(x0, y0, ln, drift, amp, ph, freq=7.5, n=30)
    for i, (x, y) in enumerate(path):
        p = (int(round(x)), int(round(y)))
        if cv.get(*p) == ".":
            t = i / (len(path) - 1)
            cv.set(*p, "c" if t < 0.35 else ("y" if t < 0.7 else "e"))
# glowing motes
for p in ((5, 14), (56, 20), (58, 46), (6, 50), (54, 9)):
    if cv.get(*p) == ".":
        cv.set(*p, "g")
save(cv, OUT)
