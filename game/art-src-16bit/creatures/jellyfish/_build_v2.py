"""Jellyfish fairy v2 (water, fantasy pick 188): bell turned three-quarter (fuller near side on the
left, narrower far side on the right, rim tilted so we see a little underneath), soft swirling
cream ripples, pink face tucked under the rim with a small orange mouth, four soft wavy tentacles."""
import math
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "jellyfish2.txt"
cv = Canvas(56, 64)
NL = chr(10)


def ell(cx, cy, rx, ry, rot, n=48):
    c, s = math.cos(rot), math.sin(rot)
    return [(cx + rx * math.cos(t) * c - ry * math.sin(t) * s, cy + rx * math.cos(t) * s + ry * math.sin(t) * c)
            for t in (2 * math.pi * i / n for i in range(n))]


ROT = math.radians(12)          # rim tilted: far (right) side dips toward us
RIM = (26, 28, 16.5, 6.0)

# tentacles: few, soft and wavy, cream with pink edges, hanging and drifting back
for x0, y0, ln, drift, amp, ph, r0 in ((26, 41, 20, 6, 1.6, 0.0, 2.1), (32, 42, 21, 6, 1.7, 0.3, 2.2),
                                        (38, 41, 17, 5, 1.5, 0.6, 1.9), (20, 38, 18, 6, 1.5, -0.3, 1.8)):
    pts = [(x0 - drift * t + amp * math.sin(ph + t * 7.0) * (0.4 + t), y0 + ln * t) for t in (i / 11 for i in range(12))]
    m = stroke(pts, [r0 * 0.9, r0 * 0.8, r0 * 0.62, r0 * 0.48, 0.8])
    paint_form(cv, m, ["c", "y", "a", "a"], [0.8, 0.45, 0.15], R=1.6, outline="r")

# bell: asymmetric dome over a tilted rim ellipse
dome = shape([(9.5, 27), (9.5, 17), (13.5, 8), (20.5, 2.5), (28.5, 2), (35, 5.5), (39.5, 12), (42, 20), (42.5, 29)])
rim = poly(ell(*RIM, ROT))
bell = dome | rim
paint_form(cv, bell, ["1", "2", "3", "3"], [0.78, 0.42, 0.14], R=8, outline="4", tilt=0.15, sel="3")
inner = {p for p in bell if cv.get(*p) != "4"}
# soft swirling ripples: wavy cream arcs following the dome
for k, (rx, ry, ph) in enumerate(((13.5, 17.5, 0.0), (8, 11, 2.2))):
    arc = []
    for i in range(25):
        t = math.pi * (1.05 + 0.9 * i / 24)
        w = 0.9 * math.sin(ph + i * 0.55)
        arc.append((25 + (rx + w) * math.cos(t), 25 + (ry + w) * math.sin(t)))
    band = stroke(arc[::3], [1.0] * 3) & inner
    paint_form(cv, band, ["c", "y", "y"], [0.6, 0.3], R=1.0, outline=None)
    line(cv, [(x + 0.6, y + 1.4) for x, y in arc[::3]], "y", inner)
# underside: the dark inside of the bell, seen through the tilted rim
cavity = poly(ell(RIM[0] + 2, RIM[1] + 1.5, RIM[2] - 3.5, RIM[3] - 2.4, ROT)) & inner
for p in cavity:
    cv.set(*p, "3")

# face: pink, tucked under the rim on the right (toward us)
face = shape([(24, 31), (31, 28.5), (39, 29), (44, 33), (44, 39.5), (39.5, 44), (31, 45), (25, 42.5), (22.5, 37)])
paint_form(cv, face, ["c", "a", "a", "r"], [0.93, 0.55, 0.2], R=6, outline="4", tilt=0.2, sel="r")
# front lip of the rim: cream scalloped frill crossing over the top of the face
frill, lobes = set(), set()
pts = ell(*RIM, ROT, n=72)
for x, y in pts:
    if y > RIM[1] + 0.5:
        frill |= stroke([(x, y - 1.0), (x, y)], [1.1, 1.1])
for i, (x, y) in enumerate(pts):
    if y > RIM[1] + 1.0 and i % 4 == 0:
        lobes |= stroke([(x, y + 0.8), (x, y + 1.0)], [1.7, 1.7])
paint_form(cv, lobes, ["c", "y", "o", "o"], [0.6, 0.3, 0.1], R=1.5, outline="4")
paint_form(cv, frill, ["c", "c", "y"], [0.5, 0.2], R=1.5, outline=None)

# eyes, blush and a small orange mouth
stamp(cv, 29, 35, NL.join(["4444.", ".KKK4", ".KWKK", ".KKKK", "..KK."]))
stamp(cv, 40, 36, NL.join(["44", "KK", "WK", "KK"]))
stamp(cv, 35, 40, NL.join(["4oo4", ".44."]))
stamp(cv, 26, 40, "rr")
outline_outer(cv, "4", keep=("4", "K", "r"))
save(cv, OUT)
