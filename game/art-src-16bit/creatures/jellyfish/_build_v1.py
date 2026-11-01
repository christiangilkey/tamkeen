"""Jellyfish fairy (water, fantasy pick 188): floater, three-quarter view facing right. A peaked mint
bell with cream frill ridges and a scalloped cream rim, a pink face peeking out under the rim, and
ribbon tentacles trailing down and back as it drifts."""
import math
import sys
from draw2 import Canvas, shape, stroke, paint_form, outline_outer, stamp, save, line, catmull

OUT = sys.argv[1] if len(sys.argv) > 1 else "jellyfish.txt"
cv = Canvas(56, 64)
CREAM = ["c", "y", "o", "o"]


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def ribbon(x0, y0, length, drift, amp, phase, r0=1.8):
    """A wavy tentacle hanging down and drifting back (left)."""
    pts = []
    for i in range(6):
        t = i / 5
        pts.append((x0 - drift * t + amp * math.sin(phase + t * 5.0), y0 + length * t))
    return stroke(pts, [r0, r0 * 0.85, r0 * 0.7, 1.0])


def tentacles(specs):
    for spec in specs:
        m = ribbon(*spec)
        paint_form(cv, m, CREAM, [0.75, 0.45, 0.2], R=1.5, outline="4", sel="o")


# far tentacles (behind the face)
tentacles([(40, 36, 20, 9, 1.4, 0.5, 1.6), (33, 38, 22, 11, 1.6, 2.0, 1.7)])

# near tentacles and frilly oral arms (in front)
tentacles([(25, 37, 20, 10, 1.8, 1.0, 2.0), (29, 39, 23, 12, 1.5, 3.0, 2.0), (36, 40, 19, 8, 1.6, 4.2, 1.8)])

# face: pink, peeking out under the bell toward us on the right
face = shape([(23, 25), (32, 21), (41, 21), (47, 26), (47.5, 34), (43.5, 40), (35, 42.5), (27, 41), (22.5, 35)])
paint_form(cv, face, ["c", "a", "a", "r"], [0.92, 0.55, 0.2], R=6, outline="4", tilt=0.2, sel="r")

# bell: a peaked cap tipped toward us, scalloped rim
rim = [(47, 24), (42, 28), (35, 30.5), (27, 30.5), (19, 28.5), (12, 25), (8, 21)]
bell = shape([(8, 21), (10, 13), (16, 6), (24, 2.5), (32, 3), (39, 7), (44.5, 13), (47.5, 19), (47, 24),
              (42, 28), (35, 30.5), (27, 30.5), (19, 28.5), (12, 25)])
for x, y in catmull(rim, closed=False, steps=2)[1:-1:2]:
    bell |= stroke([(x, y), (x, y + 0.5)], [2.3, 2.3])
paint_form(cv, bell, ["1", "2", "3", "3"], [0.8, 0.45, 0.15], R=7, outline="4", tilt=0.15, sel="3")
inner = {p for p in bell if cv.get(*p) != "4"}
# cream frill ridges radiating from the peak, and a cream band along the rim
for end in ((12, 22), (19, 26), (27, 28), (35, 28), (42, 25)):
    ridge = stroke([(26, 4), ((26 + end[0]) / 2 - 2, (4 + end[1]) / 2), end], [0.6, 1.3, 1.6]) & inner
    paint_form(cv, ridge, CREAM, [0.7, 0.4, 0.15], R=1.2, outline=None)
band = set()
for x, y in catmull(rim, closed=False, steps=6):
    band |= stroke([(x, y - 1.5), (x, y - 1.0)], [1.6, 1.6])
paint_form(cv, band & inner, CREAM, [0.6, 0.3, 0.1], R=1.5, outline=None)

# eyes and a small beak-like mouth on the face
stamp(cv, 30, 32, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 43, 33, "4\nK\nK")
stamp(cv, 35, 37, "4r4|.4.".replace("|", chr(10)))
stamp(cv, 27, 38, "rr")
outline_outer(cv, "4")
save(cv, OUT)
