"""95 cat-ferret ff2: a dangerous electric ferret-cat with real anatomy. Deep chest and shoulder, ribcage
tucking to a waist, a muscular haunch, jointed legs with paws on one ground line; a bigger head framed
by purple fur (crown tufts, cheek tufts) with a mane flowing down the back; narrow cyan eye, fangs;
purple cable tail arching over the back to a plug with a pink light and sparks.

Letters: 0 1 2 3 5 coat light..deep, 4 outline, c y o q purple fur light..deep, a r pink light,
e electric glow/spark, W white, K near-black."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save
from el_kit import groove, rim, inner_of, bolt, path_pixels

OUT = sys.argv[1] if len(sys.argv) > 1 else "cat_ferret_ff2.txt"
cv = Canvas(64, 64)
COAT = ["0", "1", "2", "3", "5"]
PUR = ["c", "y", "o", "q"]


def coat(mask, R=5, tilt=0.15, cuts=(0.93, 0.78, 0.5, 0.22), outline="5"):
    paint_form(cv, mask, COAT, list(cuts), R=R, outline=outline, tilt=tilt)
    return inner_of(cv, mask, ("5", "4"))


def clump(pts, rad, R=2):
    """A lock of purple fur: tapered, dark edged, a lit strand along its upper side."""
    m = stroke(pts, rad)
    paint_form(cv, m, PUR, [0.8, 0.5, 0.2], R=R, outline="q")
    inner = inner_of(cv, m, ("q",))
    for p in path_pixels([(pts[0][0], pts[0][1] - rad[0] * 0.4)] + list(pts[1:])):
        if p in inner and cv.get(*p) in ("y",):
            cv.set(*p, "c")
    return m


def strands(mask, lines):
    """Fur strands: darken lit coat one step along short strokes."""
    for pts in lines:
        for p in path_pixels(pts, smooth=False):
            if p in mask and cv.get(*p) in ("0", "1", "2"):
                cv.set(*p, {"0": "1", "1": "2", "2": "3"}[cv.get(*p)])


def limb(pts, rad, far=False):
    m = stroke(pts, rad)
    if far:
        paint_form(cv, m, ["2", "3", "5", "5"], [0.75, 0.45, 0.2], R=2, outline="5")
        return inner_of(cv, m, ("5",))
    return coat(m, R=2.5, cuts=(0.9, 0.72, 0.45, 0.2))


PAW = """
..5555..
.523325.
52333225
5W5W5W55
"""
PAW_FAR = """
.5555.
533335
5W5W55
"""

# --- cable tail arching up over the back, ringed segments ---
tail_pts = [(12, 38), (6, 33), (4.5, 25), (8.5, 18), (16.5, 13.5), (25.5, 13.5)]
cable = stroke(tail_pts, [3.0, 2.7, 2.5, 2.3, 2.2, 2.1])
paint_form(cv, cable, PUR, [0.82, 0.55, 0.25], R=2.2, outline="q")
ci = inner_of(cv, cable, ("q",))
for i, p in enumerate(path_pixels(tail_pts)):
    if i % 5 == 2:
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1)):
            q = (p[0] + dx, p[1] + dy)
            if q in ci:
                cv.set(*q, "q" if cv.get(*q) in ("o", "q") else "o")
for p in ci:   # a thin glow strip only along the outer underside of the arch
    if p[0] < 9 and cv.get(*p) == "q" and (p[0] - 1, p[1]) not in ci:
        cv.set(*p, "e")

# --- far legs (a step higher on the ground plane) ---
limb([(49, 43), (47.5, 49), (50, 53.5), (51, 55.5)], [3.0, 2.4, 2.0, 1.9], far=True)
stamp(cv, 48, 55, PAW_FAR)
limb([(27, 45), (25, 50), (26.5, 54), (26.5, 55.5)], [3.0, 2.3, 2.0, 1.9], far=True)
stamp(cv, 24, 55, PAW_FAR)

# --- torso: deep chest, ribcage tucking to the waist, croup; the neck merges in ---
torso = shape([(42, 32.5), (48, 34.5), (50.5, 39), (50, 44), (46.5, 48.5), (40, 49), (33.5, 46.5), (27, 44.5),
               (20, 46), (13, 45.5), (10, 41), (11.5, 36), (17, 33.5), (26, 33), (34, 33.5)])
torso |= stroke([(45, 36), (49, 31), (51.5, 27.5)], [5.5, 5.0, 4.6])
ti = coat(torso, R=9, tilt=0.28)
groove(cv, [(45, 47.5), (39, 46.5), (33, 44.5), (28, 43)], COAT, ti, depth=1, lip=(0, -1))     # ribcage to waist
groove(cv, [(47, 36), (43.5, 40), (42, 45)], COAT, ti, depth=1, lip=(1, 0))                    # shoulder blade
groove(cv, [(40, 36), (39, 41)], COAT, ti, depth=1, lip=(1, 0), smooth=False)                  # back of the shoulder
strands(ti, [[(37, 39), (34, 41)], [(33, 38), (30, 40)], [(44, 43), (42, 45)], [(48, 40), (47, 43)]])

# --- purple fur over the back, ragged lower edge ---
back = poly([(9.5, 40), (12.5, 34), (22, 31.5), (34, 31.5), (43, 30.5), (47, 33), (44, 36.5), (41, 35.3), (38, 37),
             (35, 35.5), (32, 37), (29, 35.5), (26, 37), (23, 35.5), (20, 37.5), (17, 36.5), (13.5, 39.5)])
back &= ti
paint_form(cv, back, PUR, [0.8, 0.5, 0.2], R=3, outline=None)

# --- mane: locks from the crown down the neck and along the back (rear ones first) ---
for pts, rad in (
    ([(30, 33.5), (23, 32.5), (16.5, 34.5)], [2.6, 2.0, 0.8]),
    ([(38, 33), (31, 31.5), (24.5, 32)], [2.8, 2.2, 0.9]),
    ([(45, 31), (39, 30), (32.5, 31)], [3.0, 2.4, 0.9]),
    ([(49, 26.5), (45, 28.5), (40, 31.5)], [3.2, 2.6, 1.0]),
    ([(51, 21.5), (47, 23), (42.5, 27)], [3.0, 2.6, 1.0]),
):
    clump(pts, rad)

# --- near hind: muscular haunch, knee, hock angled back, paw ---
haunch = shape([(12, 36.5), (20, 35.5), (26, 39.5), (27, 45.5), (24, 50.5), (18, 52), (13, 49), (10.5, 43)])
hi_ = coat(haunch, R=6, tilt=0.22)
groove(cv, [(25, 43), (22, 48), (17, 50)], COAT, hi_, depth=1, lip=(-1, -1))
strands(hi_, [[(21, 40), (17, 43)], [(18, 39), (14, 41.5)], [(23, 44), (20, 46.5)]])
for p in haunch:   # a short stretch of edge light on the back of the haunch only
    if p in hi_ and p[0] <= 13 and 41 <= p[1] <= 48 and (p[0] - 1, p[1]) not in haunch | {q for q in hi_}:
        cv.set(*p, "e")
limb([(21, 50), (16.5, 54), (17.5, 57.5)], [3.0, 2.4, 2.2])
stamp(cv, 14, 57, PAW)

# --- near foreleg: upper arm, elbow, forearm, wrist, paw ---
arm = limb([(44, 42), (41.5, 48.5), (43.5, 54), (45, 57.5)], [3.8, 3.0, 2.5, 2.3])
strands(arm, [[(44, 45), (43, 48)]])
stamp(cv, 41, 57, PAW)

# --- ears: tall and pointed, pink inside ---
far_ear = poly([(55.5, 20), (60.5, 4.5), (62.5, 21.5)])
paint_form(cv, far_ear, ["2", "3", "5", "5"], [0.7, 0.4, 0.15], R=2, outline="5")
for p in poly([(57.5, 19), (60.3, 9), (61.5, 20)]):
    cv.set(*p, "r")
near_ear = poly([(46, 23.5), (41, 3.5), (54, 17.5)])
coat(near_ear, R=3, cuts=(0.9, 0.72, 0.45, 0.2))
for p in poly([(47.4, 20.5), (42.9, 8), (51.4, 17)]):
    cv.set(*p, "a" if p[1] > 13 else "r")

# --- head: a bigger skull, muzzle forward and down ---
head = shape([(45, 25.5), (49, 19.5), (55, 18.5), (60, 21), (63.2, 26), (62.8, 30), (58.5, 33.5), (51, 34.5), (46, 31.5)])
hd = coat(head, R=6, tilt=0.15)
for p in shape([(55.5, 25.5), (63, 25), (62.4, 29.5), (58, 32.8), (53.5, 31)]) & hd:   # pale muzzle
    cv.set(*p, "0" if p[1] < 28 else "1")
strands(hd, [[(52, 30), (49, 31.5)], [(54, 32), (51, 33)]])
groove(cv, [(50, 26.5), (53.5, 28.5), (57, 29)], COAT, hd, depth=1, lip=(0, -1))   # cheekbone
for p in [(58, 27), (60, 27), (59, 28), (61, 28)]:                                   # whisker pads
    if p in hd:
        cv.set(*p, "2")

# purple framing: cheek tufts swept back, crown tufts between the ears
for pts, rad in (([(48.5, 31), (45, 33), (41.5, 32.5)], [2.5, 1.9, 0.7]),
                 ([(52, 20), (48, 15), (44.5, 12.5)], [2.4, 1.7, 0.6]),
                 ([(55, 19.5), (54.5, 13.5), (52, 9.5)], [2.1, 1.5, 0.6])):
    clump(pts, rad, R=1.6)

# brow and a narrow glowing eye, angled toward the nose
stamp(cv, 51, 22, """
5555555..
.555eeeW5
...55555.
""")
stamp(cv, 62, 25, """
55
5r
""")
stamp(cv, 56, 30, """
555555
""")

outline_outer(cv, "4")
for p in [(57, 31), (60, 31)]:   # fangs just under the mouth line
    cv.set(*p, "W")

# --- plug at the cable end: dark housing, pink light, prongs, sparks ---
stamp(cv, 24, 10, """
.44444..
4qqqoq4.
4qaaWq44
4qraaq4W
4qqqqq44
.44444..
""")
stamp(cv, 32, 11, """
W
.
W
""")
for pts in ([(34, 9), (36, 7), (35, 5)], [(34, 14), (37, 15), (36, 17)], [(32, 8), (32, 5)]):
    bolt(cv, pts, "e")
cv.set(37, 11, "e"); cv.set(38, 10, "W")
save(cv, OUT)
