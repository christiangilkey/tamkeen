"""95 cat-ferret -> a sleek, dangerous electric ferret-cat, Final Fantasy-style. 64x64, three-quarter
view facing right, stalking low. Yellow coat, purple mane and back in fur clumps, purple cable tail
arching over the back to a plug with a pink light and sparks, narrow glowing eyes, a fang.

Letters: 0 1 2 3 5 coat light..deep, 4 outline, c y o q purple fur light..deep, a r pink light,
e electric rim/spark/eye glow, W white, K near-black."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, dist_out
from el_kit import groove, rim, inner_of, bolt, path_pixels

OUT = sys.argv[1] if len(sys.argv) > 1 else "cat_ferret_ff1.txt"
cv = Canvas(64, 64)
COAT = ["0", "1", "2", "3", "5"]
COAT_CUT = [0.93, 0.78, 0.5, 0.22]
PUR = ["c", "y", "o", "q"]


def coat(mask, R=5, tilt=0.15, cuts=COAT_CUT):
    paint_form(cv, mask, COAT, cuts, R=R, outline="5", tilt=tilt)
    return inner_of(cv, mask, ("5", "4"))


def clump(pts, rad, R=2):
    """A clump of purple fur: tapered lock with a dark edge and a lit strand along its top."""
    m = stroke(pts, rad)
    paint_form(cv, m, PUR, [0.8, 0.5, 0.2], R=R, outline="q")
    inner = inner_of(cv, m, ("q",))
    for p in path_pixels([(pts[0][0], pts[0][1] - rad[0] * 0.35)] + list(pts[1:-1]) + [pts[-1]]):
        if p in inner and cv.get(*p) in ("y", "o"):
            cv.set(*p, "c")
            break
    return m


def strands(mask, lines, colour="3"):
    """Fur strand lines: short strokes inside the mask, darkening lit coat one step."""
    for pts in lines:
        for p in path_pixels(pts):
            if p in mask and cv.get(*p) in ("0", "1", "2"):
                cv.set(*p, {"0": "1", "1": "2", "2": "3"}[cv.get(*p)])


def paw(x, y, far=False):
    stamp(cv, x, y, """
.5225.
523325
5W5W55
""" if not far else """
.533.
53355
5W5W5
""")


# --- cable tail arching up over the back, segmented ---
tail_pts = [(13, 40), (6, 35), (4, 27), (8, 19.5), (16, 15.5), (25, 16)]
cable = stroke(tail_pts, [3.0, 2.6, 2.4, 2.2, 2.1, 2.0])
paint_form(cv, cable, PUR, [0.82, 0.55, 0.25], R=2.2, outline="q")
ci = inner_of(cv, cable, ("q",))
for i, p in enumerate(path_pixels(tail_pts)):
    if i % 5 == 2:   # segment rings
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1)):
            q = (p[0] + dx, p[1] + dy)
            if q in ci:
                cv.set(*q, "q" if cv.get(*q) in ("o", "q") else "o")
rim(cv, cable, "e", ("q",))

# --- far legs (darker, a step higher) ---
far_fore = stroke([(48, 43), (47, 48), (50, 52.5), (52, 55)], [2.8, 2.3, 2.0, 1.8])
paint_form(cv, far_fore, ["2", "3", "5", "5"], [0.75, 0.45, 0.2], R=1.8, outline="5")
paw(50, 54, far=True)
far_hind = stroke([(25, 46), (22, 50.5), (24, 54.5)], [2.8, 2.2, 1.9])
paint_form(cv, far_hind, ["2", "3", "5", "5"], [0.75, 0.45, 0.2], R=1.8, outline="5")
paw(21, 54, far=True)

# --- long low body with the neck reaching forward and down ---
body = shape([(14, 37), (24, 34.5), (36, 34.5), (44, 35.5), (49, 38), (50, 42), (46.5, 46.5), (38, 48.5), (26, 48.5), (17, 48), (11.5, 44), (11, 39.5)])
bi = coat(body, R=8, tilt=0.2)
back = shape([(10, 41), (15, 35.5), (26, 33.5), (38, 33.5), (46, 35), (45, 38.5), (35, 38.5), (26, 40), (17, 42.5), (12, 45)]) & bi
paint_form(cv, back, PUR, [0.8, 0.5, 0.2], R=3, outline=None)
for pts in ([(43, 37), (37, 38)], [(34, 37), (28, 38.5)], [(25, 38), (19, 40.5)]):
    groove(cv, pts, PUR, back, depth=1, lip=(0, -1), smooth=False)
for p in shape([(26, 46), (42, 45), (46, 46.5), (39, 48.6), (27, 48.6)]) & bi:
    if cv.get(*p) in ("2", "3"):
        cv.set(*p, "1")
strands(bi, [[(30, 43), (26, 44.5)], [(36, 42.5), (32, 44)], [(41, 41.5), (37, 43)], [(24, 44), (20, 45.5)]])
rim(cv, body, "e", ("3", "5"))
groove(cv, [(45, 38), (41.5, 41), (40.5, 45)], COAT, bi, depth=1, lip=(1, 0))      # shoulder blade
groove(cv, [(31, 46.5), (36, 47.5), (41, 47)], COAT, bi, depth=1, lip=(0, -1))     # belly line
strands(bi, [[(33, 41), (30, 42.5)], [(39, 44), (36, 45.5)], [(27, 41.5), (24, 43)]])

# --- mane: purple clumps lying back along the spine ---
for pts, rad in (
    ([(30, 35.5), (23, 34), (16, 35)], [2.4, 1.9, 0.8]),
    ([(37, 35), (30, 33), (23, 32.5)], [2.6, 2.0, 0.8]),
    ([(43, 35), (36, 32), (29, 31)], [2.8, 2.2, 0.8]),
    ([(48, 34), (42, 30.5), (35, 29.5)], [3.0, 2.3, 0.8]),
):
    clump(pts, rad)

# --- near hind leg: haunch, hock angled back, paw ---
haunch = shape([(11, 40.5), (19, 40), (23.5, 44.5), (22, 50), (17, 51.5), (12.5, 48)])
hi_ = coat(haunch, R=5, tilt=0.2)
strands(hi_, [[(20, 43), (16, 46)], [(17, 42), (13.5, 44.5)]])
rim(cv, haunch, "e", ("3", "5"))
shin = stroke([(19, 49.5), (14, 54), (16, 58)], [3.0, 2.4, 2.1])
paint_form(cv, shin, COAT, [0.9, 0.7, 0.42, 0.2], R=1.8, outline="5")
paw(13, 58)

# --- near foreleg: elbow back, wrist forward ---
fore = stroke([(45, 43), (42, 48.5), (44, 53.5), (46, 57)], [3.8, 3.0, 2.5, 2.2])
fi = coat(fore, R=2, cuts=[0.9, 0.72, 0.45, 0.2])
rim(cv, fore, "e", ("3", "5"))
strands(fi, [[(44, 45), (43, 48)]])
paw(43, 57)

# --- ears (far, near) with pink insides and purple tufted tips ---
far_ear = poly([(54.5, 29), (59, 17), (61.5, 29.5)])
paint_form(cv, far_ear, ["2", "3", "5", "5"], [0.7, 0.4, 0.15], R=2, outline="5")
for p in poly([(56.5, 28), (59, 20.5), (60.5, 28.5)]):
    cv.set(*p, "r")
near_ear = poly([(46, 33), (41.5, 14.5), (54, 28.5)])
nei = coat(near_ear, R=3, cuts=[0.9, 0.72, 0.45, 0.2])
for p in poly([(47.5, 30), (43.6, 19), (51.2, 28)]):
    cv.set(*p, "a" if p[1] > 24 else "r")
for p in near_ear:
    if p[1] < 20 and cv.get(*p) not in ("5",):
        cv.set(*p, "y" if p[0] < 45 else "o")

# --- head, held low and forward ---
head = shape([(46, 32.5), (50, 28.5), (56, 28), (61, 31), (63.5, 35.5), (62, 38.5), (57, 40.5), (50, 40.5), (46, 37.5)])
hd = coat(head, R=5, tilt=0.15)
cheek = stroke([(49, 38), (45.5, 40.5), (42, 40)], [2.4, 1.8, 0.7]) | stroke([(48, 40), (45, 43), (42.5, 43.5)], [2.0, 1.5, 0.6])
ck = coat(cheek, R=2, cuts=[0.85, 0.65, 0.4, 0.18])
rim(cv, head, "e", ("3", "5"))
for p in shape([(56, 35), (62.8, 34.5), (62, 38), (57, 40), (53.5, 38.5)]) & hd:
    cv.set(*p, "0" if p[1] < 37 else "1")
clump([(51, 29.5), (47, 26), (43, 26)], [2.0, 1.5, 0.6], R=1.5)
stamp(cv, 50, 30, """
55555..
.5eeeW5
..5555.
""")
stamp(cv, 62, 34, """
55
5r
""")
stamp(cv, 55, 38, """
5555555
.W...W.
""")

outline_outer(cv, "4")

for p in [(56, 39), (59, 39), (56, 40)]:   # fangs on the jaw line
    cv.set(*p, "W")

# --- plug at the cable end: dark housing, pink light, prongs, sparks ---
stamp(cv, 23, 13, """
.44444..
4qqqoq4.
4qaaWq44
4qraaq4W
4qqqqq44
.44444..
""")
stamp(cv, 31, 14, "W\n.\nW")
for pts in ([(33, 12), (35, 10), (34, 8)], [(33, 17), (36, 18), (35, 20)], [(31, 11), (31, 8)]):
    bolt(cv, pts, "e")
cv.set(36, 14, "e"); cv.set(37, 13, "W")
save(cv, OUT)
