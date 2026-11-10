"""Jellyfish hatchling (baby of jellyfish _ff1): same FF rendering and exact palette. About 2/3 the height:
a smaller bell (the juvenile bell scaled to 0.7) with a relatively bigger face set inside it in its cream
frill ring, glowing ribs and core in the inner dome, cream swirls, little side flaps, short frilly oral
arms and short fine tentacles. Floats (hover like the juvenile); three-quarter view facing right."""
import math
import sys
from water_ff_kit import (Canvas, shape, stroke, poly, paint_form, outline_outer, save, line, union, st,
                          rim, inner_line, dots, paint_vol, edge, catmull)

OUT = sys.argv[1] if len(sys.argv) > 1 else "jellyfish_hatch1.txt"
cv = Canvas(64, 64)
S = 0.7


def T(pts):
    """Juvenile bell coordinates -> baby: scaled 0.7 about the bell, bell top at y 24."""
    return [(32 + S * (x - 30), 24 + S * (y - 2)) for x, y in pts]


def ell(cx, cy, rx, ry, n=64):
    return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]


def wavy(x0, y0, length, drift, amp, ph, freq=6.0, n=12):
    return [(x0 - drift * t + amp * math.sin(ph + t * freq) * (0.3 + t), y0 + length * t) for t in (i / (n - 1) for i in range(n))]


FC = T([(37, 30)])[0]

# ---- short frilly oral arms from under the face
for x0, y0, ln, drift, amp, ph, w in ((36, 49, 14, 3, 1.3, 0.0, 2.6), (40.5, 49, 13, 2, 1.2, 0.9, 2.3), (32, 49, 12, 3, 1.1, -0.6, 2.1)):
    path = wavy(x0, y0, ln, drift, amp, ph)
    arm = set()
    for i, (x, y) in enumerate(path):
        t = i / (len(path) - 1)
        r = w * (1 - 0.55 * t) * (0.8 + 0.3 * math.sin(i * 1.9))
        arm |= stroke([(x, y), (x, y + 0.6)], [max(r, 0.8)] * 2)
    paint_vol(cv, arm, ["c", "a", "a", "r", "e"], [0.8, 0.55, 0.3, 0.1], (x0 - 1, y0 + ln / 2), (4, ln / 2 + 2), R=1.3, w=0.5, outline="r")
    line(cv, path, "r", arm - edge(arm))
    dots(cv, path[1::3], "c", arm - edge(arm))

# ---- bell outer veil (the juvenile's, smaller), with little side flaps
veil = shape(T([(26, 2), (34, 3.5), (42, 8.5), (48, 16), (51.5, 25), (52, 34), (48.5, 40), (41, 43), (32, 44),
                (22, 43), (13, 39.5), (8.5, 32), (8, 23), (11, 13), (18, 5.5)]))
veil |= union(stroke(T([(11, 37), (8.5, 44), (7.5, 49)]), [2.4, 1.6, 0.8]), stroke(T([(19, 41), (17.5, 47), (17, 51)]), [2.0, 1.4, 0.8]),
              stroke(T([(45, 40), (47, 46), (48, 50)]), [2.0, 1.4, 0.8]), stroke(T([(51, 33), (54, 40), (55.5, 44)]), [2.0, 1.4, 0.8]))
paint_vol(cv, veil, ["h", "1", "1", "2", "3"], [0.86, 0.66, 0.42, 0.18], T([(29, 24)])[0], (15.5, 17), R=4, w=0.6, outline="3")
vin = veil - edge(veil)
hem = set()
for x, y in catmull(T([(9, 33), (13, 38.5), (20, 42), (27, 43.5), (35, 43.5), (42, 42), (48, 38.5), (51.5, 33)]), closed=False, steps=3)[::2]:
    hem |= stroke([(x, y - 0.6), (x, y + 0.6)], [1.8, 1.8])
paint_vol(cv, hem, ["c", "c", "y", "2", "3"], [0.8, 0.55, 0.3, 0.1], T([(30, 38)])[0], (16, 5), R=1.5, w=0.5, outline="3")

# ---- inner dome with glowing ribs and the glowing four-ring core
dome = shape(T([(27, 7), (35, 8.5), (43, 14), (46.5, 23), (45, 31), (38, 35), (26, 35.5), (17, 32), (13.5, 24), (15.5, 14), (21, 8.5)])) & vin
paint_vol(cv, dome, ["2", "3", "3", "d", "d"], [0.84, 0.62, 0.38, 0.16], T([(30, 21)])[0], (12, 10), R=2.5, w=0.65)
for x, y in edge(dome):
    if cv.get(x, y) not in ("3", "d"):
        cv.set(x, y, "3")
din = dome - edge(dome)
TOP = T([(28, 8)])[0]
for end in T([(15, 27), (22, 32.5), (30, 34), (39, 32.5), (44.5, 27)]):
    mid = ((TOP[0] + end[0]) / 2 + (end[0] - TOP[0]) * 0.25, (TOP[1] + end[1]) / 2 - 1.5)
    line(cv, [TOP, mid, end], "g", din)
for cx, cy in T([(24.5, 15), (31.5, 14), (28, 19.5)]):
    for i in range(10):
        a = 2 * math.pi * i / 10
        p = (int(round(cx + 1.7 * math.cos(a))), int(round(cy + 1.3 * math.sin(a))))
        if p in din:
            cv.set(*p, "g")
dots(cv, [TOP], "W", din)
# cream swirls on the lit side of the veil
for pts in (T([(12, 21), (15, 13.5), (21, 8.5), (28, 5.5)]), T([(10, 30), (11, 24.5), (14, 19)]), T([(35, 5), (41, 7.5), (46, 13)])):
    line(cv, pts, "c", vin)
    line(cv, [(x + 0.7, y + 0.7) for x, y in pts], "y", vin)

# ---- frill ring and face (relatively bigger than the juvenile's: a baby's face)
ring = poly(ell(FC[0], FC[1], 8.2, 7.2))
for x, y in ell(FC[0], FC[1], 8.0, 7.0, n=14):
    ring |= stroke([(x, y), (x, y)], [1.6, 1.6])
paint_vol(cv, ring, ["c", "c", "y", "2", "3"], [0.82, 0.58, 0.32, 0.12], FC, (9.5, 8.5), R=1.6, w=0.6, outline="3")
for p in poly(ell(FC[0] + 0.3, FC[1] + 0.3, 6.2, 5.4)):
    cv.set(*p, "d")
face = poly(ell(FC[0] + 0.5, FC[1] + 0.8, 5.4, 4.7))
paint_vol(cv, face, ["c", "a", "a", "r", "r"], [0.9, 0.62, 0.3, 0.12], (FC[0] + 0.5, FC[1] + 0.8), (6, 5.5), R=2.5, w=0.6, outline="r")
fx, fy = int(round(FC[0])), int(round(FC[1]))
st(cv, fx - 5, fy - 2, ["dd44.",
                        ".4gK4",
                        ".4KK4",
                        "..44."])
st(cv, fx + 2, fy - 2, ["d4", "gK", "K4", "4."])
st(cv, fx - 1, fy + 3, ["oo"])
rim(cv, veil, "e", dirs=((1, 0), (1, 1)))

outline_outer(cv, "4", keep=("4", "K"))

# ---- short fine tentacles from the hem (only where nothing is drawn yet: they hang behind)
for x0, y0, ln, drift, amp, ph in ((20, 49, 14, 2, 1.0, 0.4), (25, 51, 13, 3, 1.1, 1.2), (44, 50, 13, 3, 1.0, 2.0),
                                   (48, 47, 14, 4, 0.9, 2.8), (29, 52, 11, 2, 0.8, 0.0)):
    path = wavy(x0, y0, ln, drift, amp, ph, freq=7.0, n=22)
    for i, (x, y) in enumerate(path):
        p = (int(round(x)), int(round(y)))
        if cv.get(*p) == ".":
            t = i / (len(path) - 1)
            cv.set(*p, "c" if t < 0.35 else ("y" if t < 0.7 else "e"))
for p in ((12, 30), (52, 33), (54, 50)):
    if cv.get(*p) == ".":
        cv.set(*p, "g")
save(cv, OUT)
