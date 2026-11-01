"""141 griffin -> a proud young thunder griffin, Final Fantasy-style. 64x64, three-quarter view facing
right, light top left. Eagle head with a hooked beak and a heavy brow, tall tufted cat ears, a
lightning-bolt crest; layered wings (coverts, secondaries, primaries with shafts) raised behind;
scaled eagle forelegs with dark talons; cream lion haunches; lion tail with a crackling tuft.

Letters: 0 1 2 3 5 cream fur light..deep, 4 outline, c y o q gold wing feathers light..deep,
a r bolt yellow light/dark, e electric rim/spark, W white, K pupil."""
import math
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save
from el_kit import groove, rim, inner_of, bolt, path_pixels, shift

OUT = sys.argv[1] if len(sys.argv) > 1 else "griffin_ff2.txt"
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


# --- lion tail with a crackling tuft ---
tail = stroke([(20, 44), (13, 49), (8, 46), (8, 40)], [2.2, 1.9, 1.7, 1.6])
fur(tail, R=1.8, cuts=[0.9, 0.7, 0.42, 0.2])
tuft = stroke([(8, 41), (6, 36), (9, 32)], [3.0, 2.2, 0.8]) | stroke([(9, 41), (12, 36), (11, 33)], [2.4, 1.6, 0.6])
paint_form(cv, tuft, ["W", "a", "r", "o"], [0.85, 0.55, 0.25], R=2, outline="o")

# --- far legs ---
far_hind = stroke([(32, 47), (32, 52), (33, 56)], [2.8, 2.2, 2.0])
paint_form(cv, far_hind, ["2", "3", "5", "5"], [0.75, 0.45, 0.2], R=1.8, outline="5")
stamp(cv, 28, 56, ".5335\n55555")
far_fore = stroke([(48, 44), (50, 50), (50, 55)], [2.4, 1.6, 1.4])
paint_form(cv, far_fore, ["y", "o", "q", "q"], [0.7, 0.4, 0.15], R=1.5, outline="4")
stamp(cv, 48, 55, ".q.q.\nqqqqq\n4.4.4")

# --- far wing: primaries rising behind, between the near wing and the head ---
for base, tip, w in (((35, 27), (31, 11), 2.4), ((37, 26), (36, 9), 2.6), ((39, 26), (41, 12), 2.4)):
    quill(base, tip, w, bend=1.0, tipband=0.6)
far_cov = shape([(32, 28), (36, 23.5), (41, 24), (42.5, 28.5), (37, 31)])
paint_form(cv, far_cov, ["y", "o", "q", "q"], [0.7, 0.4, 0.15], R=2, outline="q")

# --- body: lion body, chest high and forward ---
body = shape([(30, 31), (39, 29.5), (46, 32.5), (49, 39), (46, 45), (39, 47.5), (34, 46), (28, 47.5), (22, 46.5), (19, 41.5), (21.5, 35), (26, 32)])
bi = fur(body, R=8, tilt=0.2)
# --- near hind: big haunch, hock, paw ---
haunch = shape([(19, 39), (28, 38), (33, 43.5), (31.5, 50.5), (25, 53), (19.5, 49.5), (17.5, 44)])
hi_ = fur(haunch, R=6, tilt=0.2)
groove(cv, [(30, 45), (26, 49), (21, 50)], FUR, hi_, depth=1, lip=(0, -1))
shin = stroke([(25, 52), (22, 56), (24, 59.5)], [2.8, 2.3, 2.1])
fur(shin, R=2, cuts=[0.9, 0.72, 0.45, 0.2])
stamp(cv, 20, 59, """
.522225
52333325
5W55W555
""")

# --- near wing, raised: primaries from the wrist, secondaries along the arm, coverts on top ---
for base, tip, w, b in (((22, 19), (1, 22), 2.6, -1.5), ((22, 18), (1, 14), 2.8, -1.0),
                        ((22, 17), (4, 6), 2.8, 0.0), ((23, 16), (10, 1), 2.6, 0.8)):
    quill(base, tip, w, bend=b)
for base, tip, w in (((26, 26), (8, 31), 2.8), ((28, 28), (11, 36), 2.8), ((30, 30), (15, 39), 2.6)):
    quill(base, tip, w, bend=-1.0, tipband=0.75)
coverts = shape([(20, 16), (26, 17), (32, 24), (33, 30), (29, 32), (24, 28.5), (17, 23), (16, 19)])
paint_form(cv, coverts, GOLD, [0.8, 0.5, 0.22], R=3, outline="q", tilt=0.15)
ci = inner_of(cv, coverts, ("q",))
for pts in ([(18, 20), (23, 22), (27, 26), (30, 29)], [(19, 23), (24, 26), (28, 30)]):  # rows of small feathers
    groove(cv, pts, GOLD, ci, depth=1, lip=(-1, -1))
# the leading edge of the arm (wrist to shoulder), lit
for p in path_pixels([(18, 17), (24, 17), (30, 22), (33, 27)]):
    if p in ci:
        cv.set(*p, "0")

# --- neck ruff ---
neck = stroke([(43, 33), (46, 27), (48, 23)], [5.0, 4.6, 4.2])
ni = fur(neck, R=4, cuts=[0.9, 0.74, 0.48, 0.22])
for row, y0 in enumerate((26, 29, 32, 35)):   # overlapping feather scallops on the chest
    for x0 in range(44 + row % 2 - row, 51, 3):
        for dx, dy, c in ((0, 0, "0"), (1, 0, "0"), (-1, 1, "2"), (2, 1, "2"), (0, 1, "1"), (1, 1, "1")):
            p = (x0 + dx, y0 + dy)
            if p in ni:
                cv.set(*p, c)

# --- near foreleg: scaled eagle leg, talons ---
fore = stroke([(43, 44), (44, 50), (44.5, 56)], [2.8, 1.8, 1.6])
paint_form(cv, fore, ["c", "y", "o", "q"], [0.8, 0.5, 0.22], R=1.6, outline="4")
for y in (49, 51, 53, 55):  # scale rings
    for x in range(42, 47):
        if (x, y) in fore and cv.get(x, y) != "4":
            shift(cv, (x, y), GOLD, 1)
thigh = shape([(40, 40), (46, 39.5), (47.5, 45), (44.5, 48), (40.5, 46)])
fi = fur(thigh, R=3, cuts=[0.9, 0.72, 0.45, 0.2])   # feathered "trousers"
stamp(cv, 41, 56, """
..q..q.
.qoq.qo
qqoqqoqq
q4.q4.q4
""")

# --- ears: tall, tufted, brown inside ---
far_ear = poly([(50.5, 17.5), (52.5, 4), (56, 16.5)])
paint_form(cv, far_ear, ["2", "3", "5", "5"], [0.7, 0.4, 0.15], R=2, outline="5")
for p in poly([(52, 16.5), (52.6, 8), (54.8, 16)]):
    cv.set(*p, "q")
near_ear = poly([(44, 22), (38.5, 5), (49.5, 17)])
fur(near_ear, R=3, cuts=[0.9, 0.72, 0.45, 0.2])
for p in poly([(45.3, 19.5), (40.3, 9.5), (47.6, 16.5)]):
    cv.set(*p, "o" if p[1] > 13 else "q")
cv.set(39, 5, "5"); cv.set(38, 4, "5")   # ear-tip tuft

# --- head: eagle-ish skull, heavy brow, feather streaks swept back ---
head = shape([(43, 22), (47, 16.5), (53, 15), (58, 17.5), (60.5, 22), (58.5, 27), (53, 29.5), (47, 29), (43, 26)])
hd = fur(head, R=5, tilt=0.15)
for pts in ([(50, 25), (46, 26.5)], [(52, 27.5), (48, 28.5)], [(48, 22), (45, 23.5)]):
    groove(cv, pts, FUR, hd, depth=1, lip=(0, -1), smooth=False)

# --- lightning-bolt crest rising from the crown, swept back ---
crest = poly([(55, 16), (52.5, 8), (56, 9), (54.5, 0.5), (62, 9.5), (58, 9.5), (59.5, 15.5)])
paint_form(cv, crest, ["W", "a", "r", "r"], [0.82, 0.5, 0.2], R=2, outline="o")
# fur tuft hiding the base of the crest
tuft2 = stroke([(59.5, 17), (56.5, 14.5), (53, 15)], [2.4, 2.0, 0.8])
fur(tuft2, R=1.5, cuts=[0.85, 0.65, 0.4, 0.18])

# --- hooked beak ---
beak = poly([(56, 19), (60, 18.5), (63, 21.5), (63.5, 25.5), (62, 28), (60.5, 25), (56.5, 24.5)])
paint_form(cv, beak, ["c", "y", "o", "q"], [0.8, 0.5, 0.2], R=2, outline="4")
for p in [(62, 27), (63, 25), (63, 26)]:
    cv.set(*p, "q")
lower = poly([(56.5, 24.5), (60, 25.5), (58, 27.5)])
paint_form(cv, lower, ["y", "o", "q"], [0.6, 0.3], R=1, outline="4")
cv.set(59, 21, "q")   # nostril

# --- brow and a narrow, intense eye ---
stamp(cv, 50, 19, """
555555.
.5aKKW5
..5555.
""")

outline_outer(cv, "4")
silhouette_rim("e", ("3", "5", "2"), [(14, 44, 22, 56), (6, 46, 20, 52)])   # back of haunch, under the tail

# --- sparks crackling off the tail tuft and the crest ---
for pts in ([(4, 33), (6, 30), (5, 27)], [(13, 31), (15, 28), (14, 26)], [(49, 2), (47, 4)]):
    bolt(cv, pts, "e")
cv.set(61, 4, "e"); cv.set(62, 3, "W")
save(cv, OUT)
