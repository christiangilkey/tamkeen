"""54 firefly beetle, HATCHLING: the same armoured thunder beetle, younger. ~2/3 of the juvenile's height,
standing (as the juvenile). Rounder shell and glowing tail, a bigger helmeted head with only a horn
nub, short antennae, tiny mandibles, short stubby legs, a slightly bigger red eye. Same palette, same
rendering (grooved glossy chitin, glowing yellow margins, cyan rim and spark halo).

Letters: 0 1 2 3 5 chitin light..deep, 4 outline, c y o p glow light..deep, e electric rim/spark,
a r eye red, W specular, K pupil."""
import sys
from draw2 import Canvas, shape, stroke, paint_form, outline_outer, stamp, save, dist_out
from el_kit import groove, rim, inner_of, bolt, path_pixels

OUT = sys.argv[1] if len(sys.argv) > 1 else "firefly_hatch1.txt"
cv = Canvas(64, 64)
CH = ["0", "1", "2", "3", "5"]
CH_CUT = [0.97, 0.89, 0.7, 0.44]
GL = ["W", "c", "y", "o", "p"]


def chitin(mask, R=5, tilt=0.15, cuts=CH_CUT):
    paint_form(cv, mask, CH, cuts, R=R, outline="5", tilt=tilt)
    return inner_of(cv, mask, ("5", "4"))


def leg(pts, rad, far=False):
    m = stroke(pts, rad)
    if far:
        paint_form(cv, m, ["3", "5", "5"], [0.7, 0.3], R=1.5, outline="5")
        return m
    paint_form(cv, m, ["1", "2", "3", "5"], [0.86, 0.6, 0.3], R=1.6, outline="5")
    knee = (int(round(pts[1][0])), int(round(pts[1][1])))
    for dx, dy in ((0, 0), (-1, 0)):
        q = (knee[0] + dx, knee[1] + dy)
        if q in m and cv.get(*q) != "5":
            cv.set(*q, "0")
    return m


# --- far legs ---
leg([(51, 52), (54, 55), (55.5, 58), (57, 61)], [2.0, 1.6, 1.2, 0.9], far=True)
leg([(38, 52), (40, 56), (41, 60.5)], [2.0, 1.6, 1.0], far=True)

# --- round glowing tail ---
abd = shape([(26, 46.5), (28.5, 52.5), (24.5, 58), (16, 59.5), (9.5, 57), (7.5, 51.5), (9.5, 46), (17, 43.5)])
paint_form(cv, abd, GL, [0.97, 0.8, 0.5, 0.25], R=6, outline="p", tilt=0.1)
ai = inner_of(cv, abd, ("p",))
for pts in ([(8, 52), (15, 54.5), (23, 54.5), (28, 52)],):
    groove(cv, pts, GL, ai, depth=2, lip=(0, -1))
for p in [(11, 49), (12, 49), (13, 49), (11, 50), (12, 50), (10, 50)]:
    if p in ai:
        cv.set(*p, "W")

# --- wing-case shell: rounder dome, seam along the top ---
shell = shape([(37, 35), (31, 32.5), (24, 33), (18, 36), (14.5, 41.5), (15.5, 47), (19.5, 51.5), (27.5, 53), (34.5, 51.5), (39, 46.5), (40, 40)])
ni = chitin(shell, R=8, tilt=0.2)
groove(cv, [(37, 36.5), (30, 36.5), (23, 38.5), (17, 43)], CH, ni, depth=2, lip=(0, 1))
groove(cv, [(39, 43), (32, 44.5), (25, 46.5), (18, 48.5)], CH, ni, depth=1, lip=(0, -1))
rim(cv, shell, "e", ("3", "5"))
_d = dist_out(shell)
for p in ni:
    if cv.get(*p) == "5" and _d[p] <= 2.5 and p[1] > 43:
        cv.set(*p, "p" if p[0] < 19 else "3")
for p in path_pixels([(15, 46), (20, 49.5), (28, 50.5), (35, 49), (38.5, 45)]):
    if p in ni:
        cv.set(*p, "o")
        q = (p[0], p[1] - 1)
        if q in ni:
            cv.set(*q, "y")
for p in [(23, 34), (24, 34), (25, 33), (26, 33), (22, 35), (19, 38)]:
    if p in ni:
        cv.set(*p, "W")
for p in [(29, 38), (30, 38)]:
    if p in ni:
        cv.set(*p, "0")

# --- near legs: short and stubby ---
leg([(22, 51), (18.5, 55), (17, 59), (15, 62.5)], [2.5, 2.0, 1.4, 1.0])
leg([(31, 52), (30, 56), (29.5, 60), (27.5, 62.5)], [2.5, 2.0, 1.4, 1.0])

# --- helmet shield with a horn nub ---
horn = stroke([(46.5, 32), (49, 28.5), (51, 26)], [3.0, 2.0, 0.8])
hi_ = chitin(horn, R=2, cuts=[0.88, 0.72, 0.5, 0.28])
rim(cv, horn, "e", ("3", "5"))
shield = shape([(36, 35), (40.5, 30.5), (47.5, 30), (52.5, 34), (53.5, 40.5), (50.5, 46), (44, 48.5), (38.5, 47), (35.5, 41)])
si = chitin(shield, R=6, tilt=0.15)
groove(cv, [(37.5, 37.5), (43, 34), (51, 35.5)], CH, si, depth=1)
rim(cv, shield, "e", ("3", "5"))
for p in path_pixels([(37, 42), (40.5, 46), (45, 47)]):
    if p in si:
        cv.set(*p, "y")
for p in [(42, 33), (43, 32), (44, 32), (41, 34)]:
    if p in si:
        cv.set(*p, "W")
for p in [(48, 29)]:
    if p in hi_:
        cv.set(*p, "W")

# --- head: bigger for a baby; tiny mandibles, short antennae ---
head = shape([(44.5, 42.5), (50, 39.5), (55.5, 41.5), (58.5, 46.5), (56.5, 52), (50.5, 54), (45, 50.5)])
hdi = chitin(head, R=4, cuts=[0.9, 0.75, 0.52, 0.28])
rim(cv, head, "e", ("3", "5"))
m = stroke([(56, 51), (59.5, 52), (61, 50.5)], [1.5, 1.1, 0.6])
paint_form(cv, m, CH, [0.85, 0.65, 0.4, 0.2], R=1.2, outline="5")
for pts in ([(55.5, 41.5), (58, 37.5), (60, 35)], [(53, 40.5), (54.5, 36.5), (55, 34)]):
    mm = stroke(pts, [1.0, 0.9, 0.8])
    paint_form(cv, mm, CH, [0.85, 0.65, 0.45, 0.2], R=1, outline="5")
    cv.set(int(pts[-1][0]), int(pts[-1][1]), "e")
# a slightly bigger, still intense eye under a hard brow
stamp(cv, 49, 43, """
555555
.raaa5
..rrW.
""")

# --- near front leg ---
leg([(46, 52), (48, 55.5), (49, 59), (51, 62.5)], [2.5, 2.0, 1.4, 1.0])

outline_outer(cv, "4")

# --- electric halo round the glowing tail ---
for pts in ([(6, 46), (4, 49), (6, 51)], [(8, 60), (11, 61), (10, 63)]):
    bolt(cv, pts, "e")
for p in [(5, 55), (21, 62)]:
    cv.set(*p, "c")
save(cv, OUT)
