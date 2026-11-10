"""141 thunder griffin, HATCHLING: the same proud thunder griffin, younger. ~2/3 of the juvenile's height,
standing (as the juvenile). Big head with a short hooked beak and a slightly bigger intense eye, small
ear tufts, a small lightning-bolt crest growing from a fur tuft; small layered wings (coverts, short
primaries with shafts) raised behind; a round chest ruff; short scaled forelegs with talons; round
cat haunch; short lion tail with a crackling tuft. Same palette and rendering as the juvenile.

Letters: 0 1 2 3 5 cream fur light..deep, 4 outline, c y o q gold wing feathers light..deep,
a r bolt yellow light/dark, e electric rim/spark, W white, K pupil."""
import math
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save
from el_kit import groove, rim, inner_of, bolt, path_pixels, shift

OUT = sys.argv[1] if len(sys.argv) > 1 else "griffin_hatch1.txt"
cv = Canvas(64, 64)
FUR = ["0", "1", "2", "3", "5"]
FUR_CUT = [0.93, 0.78, 0.5, 0.22]
GOLD = ["c", "y", "o", "q"]


def silhouette_rim(colour, replace, boxes):
    """Edge light along the outer outline on the shadow (right/bottom) side."""
    outer = {(x, y) for y in range(cv.h) for x in range(cv.w) if cv.g[y][x] == "4" and any(
        cv.get(x + dx, y + dy) == "." for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
    for y in range(cv.h):
        for x in range(cv.w):
            if not any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in boxes):
                continue
            if cv.g[y][x] in replace and ((x + 1, y) in outer or (x, y + 1) in outer) and                     (x - 1, y) not in outer and (x, y - 1) not in outer:
                cv.g[y][x] = colour


def fur(mask, R=5, tilt=0.15, cuts=FUR_CUT):
    paint_form(cv, mask, FUR, cuts, R=R, outline="5", tilt=tilt)
    return inner_of(cv, mask, ("5", "4"))


def quill(base, tip, width, bend=0.0, dark=False, tipband=0.7):
    """One flight feather: gold vane, pale shaft, darker band toward the tip."""
    ramp = ["y", "o", "q", "q"] if dark else GOLD
    mx, my = (base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2
    L = math.hypot(tip[0] - base[0], tip[1] - base[1]) or 1
    nx, ny = -(tip[1] - base[1]) / L, (tip[0] - base[0]) / L
    mid = (mx + nx * bend, my + ny * bend)
    m = stroke([base, mid, tip], [width, width * 0.9, 0.8])
    paint_form(cv, m, ramp, [0.8, 0.5, 0.22], R=2, outline="q" if not dark else "4")
    inner = inner_of(cv, m, ("q", "4"))
    for p in inner:
        if math.hypot(p[0] - base[0], p[1] - base[1]) > tipband * L:
            shift(cv, p, GOLD, 1)
    if not dark:
        for p in path_pixels([base, mid, (base[0] + (tip[0] - base[0]) * 0.82, base[1] + (tip[1] - base[1]) * 0.82)]):
            if p in inner:
                cv.set(*p, "0" if p[1] < base[1] - 4 else "c")
    return m



# --- short lion tail with its crackling tuft ---
tail = stroke([(20, 49), (14, 52.5), (10, 50), (10, 46.5)], [1.8, 1.6, 1.5, 1.4])
fur(tail, R=1.6, cuts=[0.9, 0.7, 0.42, 0.2])
tuft = stroke([(10, 47), (8.5, 43), (10.5, 40)], [2.4, 1.8, 0.7]) | stroke([(11, 47), (13, 43.5), (12.5, 41)], [1.9, 1.3, 0.6])
paint_form(cv, tuft, ["W", "a", "r", "o"], [0.85, 0.55, 0.25], R=2, outline="o")

# --- far legs ---
far_hind = stroke([(31, 53), (31, 57), (32, 60)], [2.4, 2.0, 1.8])
paint_form(cv, far_hind, ["2", "3", "5", "5"], [0.75, 0.45, 0.2], R=1.8, outline="5")
stamp(cv, 30, 60, """
.5335
55555
""")
far_fore = stroke([(45.5, 51), (47, 55.5), (47.5, 59)], [2.0, 1.4, 1.3])
paint_form(cv, far_fore, ["y", "o", "q", "q"], [0.7, 0.4, 0.15], R=1.5, outline="4")
stamp(cv, 46, 59, """
.q.q
qqqq
4.4.
""")

# --- far wing: two short feathers peeking above the back ---
for base, tip, w in (((33, 41), (31, 32), 2.2), ((35, 41), (35.5, 32.5), 2.2)):
    quill(base, tip, w, bend=0.8, tipband=0.6)
far_cov = shape([(30.5, 42), (33.5, 38.5), (37.5, 39), (38.5, 42.5), (34, 44)])
paint_form(cv, far_cov, ["y", "o", "q", "q"], [0.7, 0.4, 0.15], R=2, outline="q")

# --- round little body ---
body = shape([(30, 41), (38, 40), (44, 42.5), (46.5, 47.5), (44, 52.5), (38, 55), (31, 54), (25, 55), (20.5, 53), (18.5, 48.5), (21, 43.5), (25, 41.5)])
bi = fur(body, R=8, tilt=0.2)

# --- near hind: round haunch, short shin, paw ---
haunch = shape([(19, 46), (26, 45), (30, 49), (29, 54.5), (24, 57), (19.5, 55), (17.5, 50.5)])
hi_ = fur(haunch, R=5, tilt=0.2)
groove(cv, [(28, 51), (25, 54), (21, 55)], FUR, hi_, depth=1, lip=(0, -1))
shin = stroke([(24, 56.5), (22.5, 59.5), (23.5, 61)], [2.5, 2.1, 2.0])
fur(shin, R=2, cuts=[0.9, 0.72, 0.45, 0.2])
stamp(cv, 20, 61, """
.52225
5233325
5W55W55
""")

# --- near wing, small: short primaries, secondaries, coverts ---
for base, tip, w, b in (((26, 40), (15, 37.5), 2.2, -0.8), ((26, 39), (15.5, 33), 2.4, -0.5),
                        ((26.5, 38), (18.5, 29), 2.4, 0.0), ((27.5, 37), (23, 27.5), 2.2, 0.5)):
    quill(base, tip, w, bend=b)
for base, tip, w in (((29, 42), (19, 43.5), 2.4), ((30.5, 43.5), (21.5, 47), 2.3)):
    quill(base, tip, w, bend=-0.6, tipband=0.72)
coverts = shape([(24.5, 35.5), (30, 36.5), (34, 40.5), (33, 45), (29, 46), (24, 42.5), (22.5, 38.5)])
paint_form(cv, coverts, GOLD, [0.8, 0.5, 0.22], R=3, outline="q", tilt=0.15)
ci = inner_of(cv, coverts, ("q",))
for pts in ([(24, 39), (28, 40.5), (31.5, 43.5)],):
    groove(cv, pts, GOLD, ci, depth=1, lip=(-1, -1))
for p in path_pixels([(23.5, 37), (28, 37), (32, 39.5), (34, 43)]):
    if p in ci:
        cv.set(*p, "0")

# --- chest ruff with feather scallops ---
neck = stroke([(43.5, 46), (46, 41.5)], [4.6, 4.2])
ni = fur(neck, R=4, cuts=[0.9, 0.74, 0.48, 0.22])
for row, y0 in enumerate((41, 44, 47)):
    for x0 in range(42 + row % 2 - row, 49, 3):
        for dx, dy, c in ((0, 0, "0"), (1, 0, "0"), (-1, 1, "2"), (2, 1, "2"), (0, 1, "1"), (1, 1, "1")):
            p = (x0 + dx, y0 + dy)
            if p in ni:
                cv.set(*p, c)

# --- near foreleg: feathered thigh, short scaled leg, talons ---
fore = stroke([(41, 52), (41.5, 56), (42, 59.5)], [2.3, 1.6, 1.5])
paint_form(cv, fore, ["c", "y", "o", "q"], [0.8, 0.5, 0.22], R=1.6, outline="4")
for y in (55, 57):
    for x in range(40, 44):
        if (x, y) in fore and cv.get(x, y) != "4":
            shift(cv, (x, y), GOLD, 1)
thigh = shape([(38, 47.5), (43, 47), (44.5, 51), (42, 53.5), (38.5, 52)])
fur(thigh, R=3, cuts=[0.9, 0.72, 0.45, 0.2])
stamp(cv, 39, 60, """
.q..q.
qoqqoq
q4.q4q
""")

# --- small ear tufts behind the crest ---
far_ear = poly([(46.5, 27), (48.5, 21.5), (51, 26.5)])
paint_form(cv, far_ear, ["2", "3", "5", "5"], [0.7, 0.4, 0.15], R=2, outline="5")
near_ear = poly([(41, 31), (38.5, 23.5), (45.5, 28)])
fur(near_ear, R=2.5, cuts=[0.9, 0.72, 0.45, 0.2])
for p in poly([(41.8, 29.5), (39.8, 25.5), (44, 28.2)]):
    cv.set(*p, "o")

# --- big head ---
head = shape([(39, 32), (43, 27), (49, 25.5), (54.5, 27.5), (57.5, 32), (56, 37.5), (51, 40.5), (44.5, 40.5), (40, 37)])
hd = fur(head, R=5, tilt=0.15)
for pts in ([(47, 37), (43.5, 38.5)], [(49.5, 39), (46, 40)]):
    groove(cv, pts, FUR, hd, depth=1, lip=(0, -1), smooth=False)

# --- small lightning-bolt crest growing from a fur tuft ---
BOLT = """
....oo.
...oWo.
..oWao.
.oWaaoo
oaaaaWo
.oooaao
...oao.
"""
stamp(cv, 49, 20, BOLT)
tuft2 = stroke([(56, 28.5), (53.5, 26.5), (50, 27)], [2.0, 1.7, 0.7])
fur(tuft2, R=1.5, cuts=[0.85, 0.65, 0.4, 0.18])

# --- short hooked beak ---
beak = poly([(54, 30.5), (58, 30), (60.5, 33), (60.5, 36), (59, 38), (57.5, 35.5), (54.5, 35)])
paint_form(cv, beak, ["c", "y", "o", "q"], [0.8, 0.5, 0.2], R=2, outline="4")
for p in [(60, 37), (59, 37)]:
    cv.set(*p, "q")
lower = poly([(54.5, 35), (57.5, 36), (56, 37.5)])
paint_form(cv, lower, ["y", "o", "q"], [0.6, 0.3], R=1, outline="4")
cv.set(57, 32, "q")   # nostril

# --- brow and a slightly bigger intense eye ---
stamp(cv, 46, 30, """
555555.
.5aKKW5
.5aaKK5
..5555.
""")

outline_outer(cv, "4")
silhouette_rim("e", ("3", "5", "2"), [(16, 49, 24, 57), (9, 51, 20, 55)])   # back of haunch, under the tail

for pts in ([(7, 40), (8.5, 37.5), (7.5, 35.5)], [(57.5, 21), (59, 19.5)]):
    bolt(cv, pts, "e")
save(cv, OUT)
