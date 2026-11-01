"""54 firefly -> armoured thunder beetle, Final Fantasy-style. 64x64, three-quarter view facing right,
light from the top left. Glossy black-olive chitin (grooved wing cases, horned shield), mandibles,
jointed spined legs, glowing segmented abdomen with an electric halo, small intense red eyes.

Letters: 0 1 2 3 5 chitin light..deep, 4 outline, c y o p glow light..deep, e electric rim/spark,
a r eye red, W specular, K pupil."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save
from el_kit import groove, rim, inner_of, bolt, path_pixels, shift

OUT = sys.argv[1] if len(sys.argv) > 1 else "firefly_ff1.txt"
cv = Canvas(64, 64)
CH = ["0", "1", "2", "3", "5"]
CH_CUT = [0.97, 0.89, 0.7, 0.44]
GL = ["W", "c", "y", "o", "p"]


def chitin(mask, R=5, tilt=0.15, cuts=CH_CUT):
    paint_form(cv, mask, CH, cuts, R=R, outline="5", tilt=tilt)
    return inner_of(cv, mask, ("5", "4"))


def leg(pts, rad, far=False, spines=()):
    """Jointed leg: thick femur, spined shin, thin foot. Near legs lit along the top edge with a shiny
    knee; far legs kept dark so they sit behind."""
    m = stroke(pts, rad)
    if far:
        paint_form(cv, m, ["3", "5", "5"], [0.7, 0.3], R=1.5, outline="5")
        return m
    paint_form(cv, m, ["1", "2", "3", "5"], [0.86, 0.6, 0.3], R=1.6, outline="5")
    knee = (int(round(pts[1][0])), int(round(pts[1][1])))
    for dx, dy in ((0, 0), (-1, 0), (0, -1)):
        q = (knee[0] + dx, knee[1] + dy)
        if q in m and cv.get(*q) != "5":
            cv.set(*q, "0")
    for x, y in spines:  # little spurs on the shin
        cv.set(x, y, "5")
    return m


# --- far legs (behind the body) ---
leg([(52, 41), (56, 45), (58, 50), (60, 55)], [2.4, 1.9, 1.4, 1.0], far=True)
leg([(41, 44), (43, 49), (44, 53), (46, 56)], [2.4, 1.9, 1.4, 1.0], far=True)

# --- glowing abdomen: segments under the rear of the wing cases ---
abd = shape([(25, 39), (28.5, 46), (24, 52.5), (14, 55), (5.5, 52.5), (2, 46), (3.5, 39), (12, 35.5)])
paint_form(cv, abd, GL, [0.97, 0.8, 0.5, 0.25], R=7, outline="p", tilt=0.1)
ai = inner_of(cv, abd, ("p",))
for pts in ([(3, 45), (11, 48), (20, 48.5), (27, 46)], [(5, 50), (13, 52.5), (23, 51)]):
    groove(cv, pts, GL, ai, depth=2, lip=(0, -1))
for p in [(6, 41), (7, 41), (8, 41), (6, 42), (7, 42), (5, 42), (8, 40), (7, 40)]:  # white-hot core
    if p in ai:
        cv.set(*p, "W")

# --- the wing-case shell: one dome; the seam between the two cases runs along the top ---
shell = shape([(38, 20), (29, 16.5), (18, 18), (10, 23.5), (7, 30), (8.5, 37), (12, 42), (19, 45.5), (30, 46), (38, 42.5), (41.5, 35), (41, 26)])
ni = chitin(shell, R=9, tilt=0.2)
groove(cv, [(38, 22.5), (29, 22), (19, 24.5), (11, 30)], CH, ni, depth=2, lip=(0, 1))   # the seam
# grooves running along the shell, following the seam
for k, pts in enumerate(([(39, 28), (30, 29), (21, 32), (13, 37)],
                         [(40, 34), (31, 36), (22, 39), (15, 42)])):
    groove(cv, pts, CH, ni, depth=1, lip=(0, -1))
rim(cv, shell, "e", ("3", "5"))
from draw2 import dist_out
_d = dist_out(shell)
for p in ni:  # bounce light: the underside picks up light near the bottom edge, warm near the glow
    if cv.get(*p) == "5" and _d[p] <= 3.2 and p[1] > 33:
        cv.set(*p, "p" if p[0] < 17 else "3")
for p in path_pixels([(9, 35), (13, 40), (20, 42.5), (29, 43), (36, 40.5), (39.5, 35)]):
    if p in ni:
        cv.set(*p, "o")
        q = (p[0], p[1] - 1)
        if q in ni:
            cv.set(*q, "y")
for p in [(22, 20), (23, 20), (24, 19), (25, 19), (26, 19), (21, 21), (17, 26), (16, 27)]:  # long gloss
    if p in ni:
        cv.set(*p, "W")
for p in [(28, 26), (29, 26), (30, 26)]:
    if p in ni:
        cv.set(*p, "0")

# --- near legs (in front): femur, shin with spurs, foot claw ---
leg([(24, 44), (18, 49), (15, 55), (12, 60)], [3.0, 2.2, 1.6, 1.0], spines=[(15, 52), (13, 57)])
leg([(33, 45), (31, 50), (30, 55), (28, 60)], [3.0, 2.2, 1.6, 1.0], spines=[(29, 52), (28, 57)])

# --- thorax shield with the horn ---
horn = stroke([(46, 21), (50, 15), (54, 10.5), (58, 7.5)], [3.4, 2.6, 1.6, 0.6])
hi_ = chitin(horn, R=2.5, cuts=[0.88, 0.72, 0.5, 0.28])
rim(cv, horn, "e", ("3", "5"))
shield = shape([(35, 21), (40, 17.5), (47, 18), (52, 21.5), (53.5, 28), (50.5, 34.5), (44, 37.5), (38, 36.5), (35, 30)])
si = chitin(shield, R=6, tilt=0.15)
groove(cv, [(37, 25), (43, 22), (50, 23)], CH, si, depth=1)   # rim of the shield
rim(cv, shield, "e", ("3", "5"))
for p in path_pixels([(36, 30), (40, 33.5), (45, 34.5)]):
    if p in si:
        cv.set(*p, "y")
for p in [(41, 21), (42, 20), (43, 20), (40, 22), (44, 20)]:
    if p in si:
        cv.set(*p, "W")
for p in [(50, 15), (51, 14)]:
    if p in hi_:
        cv.set(*p, "W")

# --- head under the shield: eye, mandibles, antennae ---
head = shape([(47.5, 31), (53, 29.5), (57, 32), (58.5, 37), (55.5, 41.5), (50, 42.5), (46.5, 38)])
hdi = chitin(head, R=4, cuts=[0.9, 0.75, 0.52, 0.28])
rim(cv, head, "e", ("3", "5"))
for pts, rad in (([(55, 40), (59, 42.5), (62, 40.5)], [1.8, 1.3, 0.6]),      # near mandible
                 ([(57, 37), (61, 37), (63, 35)], [1.4, 1.0, 0.5])):           # far mandible
    m = stroke(pts, rad)
    paint_form(cv, m, CH, [0.85, 0.65, 0.4, 0.2], R=1.2, outline="5")
for pts in ([(56, 31), (60, 26), (62, 21)], [(53.5, 30), (55.5, 25), (56.5, 21)]):
    m = stroke(pts, [1.1, 1.0, 0.9])
    paint_form(cv, m, CH, [0.85, 0.65, 0.45, 0.2], R=1, outline="5")
    for i, p in enumerate(path_pixels(pts)):
        if i % 3 == 2 and p in m:
            cv.set(*p, "5")   # segment joints
    cv.set(int(pts[-1][0]), int(pts[-1][1]), "e")
# small intense eye with a hard brow
stamp(cv, 51, 33, """
55555
.raa5
..rW.
""")

# --- near front leg last (in front of the head) ---
leg([(47, 41), (50, 46), (51, 52), (54, 59)], [3.0, 2.2, 1.6, 1.0], spines=[(53, 49), (53, 54)])

outline_outer(cv, "4")

# --- electric halo around the glowing abdomen (outside the outline) ---
for pts in ([(2, 38), (0, 41), (2, 43)], [(4, 55), (7, 56), (6, 58)], [(19, 56), (21, 58)]):
    bolt(cv, pts, "e")
for p in [(1, 47), (12, 57)]:
    cv.set(*p, "c")
save(cv, OUT)
