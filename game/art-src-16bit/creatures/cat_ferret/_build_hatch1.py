"""95 cat-ferret, HATCHLING (a kit): the same electric ferret-cat, younger. ~2/3 of the juvenile's height,
standing (as the juvenile). Big head with big pointed ears, short muzzle, slightly bigger narrow cyan
eye, purple fur framing the head and a short mane down the back, a rounder chest, short legs with
paws, and the purple cable tail (shorter) ending in the plug with its pink light and a small spark.
Same palette and rendering as the juvenile.

Letters: 0 1 2 3 5 coat light..deep, 4 outline, c y o q purple fur light..deep, a r pink light,
e electric glow/spark, W white, K near-black."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save
from el_kit import groove, inner_of, bolt, path_pixels

OUT = sys.argv[1] if len(sys.argv) > 1 else "cat_ferret_hatch1.txt"
cv = Canvas(64, 64)
COAT = ["0", "1", "2", "3", "5"]
PUR = ["c", "y", "o", "q"]


def coat(mask, R=5, tilt=0.15, cuts=(0.93, 0.78, 0.5, 0.22), outline="5"):
    paint_form(cv, mask, COAT, list(cuts), R=R, outline=outline, tilt=tilt)
    return inner_of(cv, mask, ("5", "4"))


def clump(pts, rad, R=2):
    m = stroke(pts, rad)
    paint_form(cv, m, PUR, [0.8, 0.5, 0.2], R=R, outline="q")
    inner = inner_of(cv, m, ("q",))
    for p in path_pixels([(pts[0][0], pts[0][1] - rad[0] * 0.4)] + list(pts[1:])):
        if p in inner and cv.get(*p) in ("y",):
            cv.set(*p, "c")
    return m


def strands(mask, lines):
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
.5555..
5233225
5W5W555
"""
PAW_FAR = """
.555.
53335
5W5W5
"""

# --- cable tail: a shorter arch, ringed ---
tail_pts = [(15, 48), (9, 45.5), (6.5, 39.5), (9, 33.5), (15, 31), (21, 32)]
cable = stroke(tail_pts, [2.6, 2.4, 2.2, 2.1, 2.0, 1.9])
paint_form(cv, cable, PUR, [0.82, 0.55, 0.25], R=2.0, outline="q")
ci = inner_of(cv, cable, ("q",))
for i, p in enumerate(path_pixels(tail_pts)):
    if i % 5 == 2:
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (p[0] + dx, p[1] + dy)
            if q in ci:
                cv.set(*q, "q" if cv.get(*q) in ("o", "q") else "o")
for p in ci:
    if p[0] < 9 and cv.get(*p) == "q" and (p[0] - 1, p[1]) not in ci:
        cv.set(*p, "e")

# --- far legs (short) ---
limb([(42, 51), (42.5, 55.5), (43.5, 59)], [2.6, 2.1, 1.9], far=True)
stamp(cv, 41, 59, PAW_FAR)
limb([(27, 53), (26, 57), (26.5, 59.5)], [2.6, 2.1, 1.9], far=True)
stamp(cv, 24, 59, PAW_FAR)

# --- round little torso; short thick neck merges in ---
torso = shape([(19, 44.5), (27, 43), (35, 43.5), (40.5, 46), (43.5, 50), (42, 54.5), (36, 57), (27, 56.5),
               (20, 55.5), (15.5, 52), (15, 47.5)])
torso |= stroke([(39, 47), (42, 43), (44, 40)], [4.8, 4.6, 4.4])
ti = coat(torso, R=8, tilt=0.28)
groove(cv, [(40, 54), (35, 53.5), (30, 52)], COAT, ti, depth=1, lip=(0, -1))
strands(ti, [[(35, 48), (32, 49.5)], [(40, 49), (38.5, 51)]])

# purple fur along the back, ragged edge
back = poly([(14, 48), (17, 43.5), (26, 41.5), (36, 41.5), (42, 41), (44, 43.5), (41, 46), (38, 45), (35, 46.5),
             (32, 45), (29, 46.5), (26, 45), (23, 47), (20, 46), (16.5, 49)]) & ti
paint_form(cv, back, PUR, [0.8, 0.5, 0.2], R=3, outline=None)

# a short mane: three locks from the crown down the neck to the back
for pts, rad in (
    ([(37, 43), (30, 41.5), (23, 42.5)], [2.6, 2.0, 0.8]),
    ([(43, 39.5), (38, 40.5), (32, 41.5)], [2.8, 2.2, 0.9]),
    ([(45, 34), (41.5, 36.5), (37.5, 40)], [2.8, 2.4, 0.9]),
):
    clump(pts, rad)

# --- near hind: round haunch, short shin, paw ---
haunch = shape([(15, 46.5), (21.5, 45.5), (25.5, 49), (25, 54), (20.5, 56.5), (16, 55), (14, 51)])
hi_ = coat(haunch, R=5, tilt=0.22)
strands(hi_, [[(21, 48), (17.5, 50.5)], [(23, 51), (20, 53.5)]])
limb([(20.5, 55.5), (19, 58.5), (19.5, 60.5)], [2.6, 2.2, 2.0])
stamp(cv, 16, 61, PAW)

# --- near foreleg: short, chunky ---
arm = limb([(38, 51), (37, 55), (38.5, 58.5), (39, 60.5)], [3.2, 2.6, 2.2, 2.0])
stamp(cv, 35, 61, PAW)

# --- big ears ---
far_ear = poly([(48.5, 31), (52.5, 23), (55.5, 32)])
paint_form(cv, far_ear, ["2", "3", "5", "5"], [0.7, 0.4, 0.15], R=2, outline="5")
for p in poly([(50.3, 30), (52.4, 25.5), (54.5, 31)]):
    cv.set(*p, "r")
near_ear = poly([(39, 35.5), (35.5, 23), (46.5, 30)])
coat(near_ear, R=3, cuts=(0.9, 0.72, 0.45, 0.2))
for p in poly([(40.3, 33), (37.4, 26), (44, 29.5)]):
    cv.set(*p, "a" if p[1] > 28 else "r")

# --- big head, short muzzle ---
head = shape([(38.5, 37), (42, 31.5), (48, 30.5), (53.5, 32.5), (57, 37), (56.5, 41.5), (52.5, 45), (45, 46), (40, 43.5)])
hd = coat(head, R=6, tilt=0.15)
for p in shape([(49.5, 37.5), (57, 37), (56.2, 41.5), (52.5, 44.5), (47.5, 43)]) & hd:
    cv.set(*p, "0" if p[1] < 40 else "1")
strands(hd, [[(44, 42.5), (41.5, 43.5)]])
groove(cv, [(42.5, 39.5), (46, 41), (49.5, 41)], COAT, hd, depth=1, lip=(0, -1))

# purple framing: cheek tuft, crown tufts
for pts, rad in (([(41.5, 42.5), (38.5, 44.5), (35.5, 44)], [2.2, 1.7, 0.6]),
                 ([(45.5, 31.5), (42.5, 27.5), (39.5, 26)], [2.2, 1.6, 0.6]),
                 ([(48.5, 31), (48.5, 27.5), (47, 25)], [1.9, 1.4, 0.6])):
    clump(pts, rad, R=1.6)

# a slightly bigger narrow glowing eye under the brow
stamp(cv, 43, 34, """
5555555.
.55eeeW5
..5eee5.
...555..
""")
stamp(cv, 56, 37, """
55
5r
""")
stamp(cv, 51, 42, "55555")

outline_outer(cv, "4")
cv.set(52, 43, "W")   # one small fang

# --- plug with its pink light, and a spark ---
stamp(cv, 20, 29, """
.4444..
4qqoq4.
4qaWq44
4qraq4W
.4444..
""")
bolt(cv, [(28, 29), (30, 27), (29, 25)], "e")
cv.set(29, 32, "e")
save(cv, OUT)
