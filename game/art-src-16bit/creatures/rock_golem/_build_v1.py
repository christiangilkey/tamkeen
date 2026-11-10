"""Rock golem (pick 103): a hulking green crystal golem on a dark core: huge shoulder slabs, small
head set low between them with glowing eyes, long arms with crystal gauntlets, short thick legs.
Three-quarter view facing right, light from the top left."""
import sys
from draw2 import Canvas, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "rock_golem.txt"
cv = Canvas(56, 64)
GREEN = ["1", "2", "3", "3"]
CORE = ["y", "o", "o", "o"]


def inside(mask):
    return {p for p in mask if cv.get(*p) != "4"}


def flat(mask, pts, colour):
    for p in poly(pts) & mask:
        cv.set(*p, colour)


def slab(pts, lit=None, dark=None, R=None):
    """A crystal slab cut with flat planes: base colour, a flat lit facet, a flat shadow facet, a
    bright rim along its top-left edges and a dark outline."""
    m = poly(pts)
    for x, y in m:
        nb = [(x + dx, y + dy) not in m for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
        if any(nb):
            cv.set(x, y, "4")
        else:
            cv.set(x, y, "2")
    i = inside(m)
    if lit:
        flat(i, lit, "1")
    if dark:
        flat(i, dark, "3")
    for x, y in i:  # rim light where the slab's edge faces up or left
        if (x - 1, y) not in i and (x, y - 1) not in i and cv.get(x, y) != "3":
            cv.set(x, y, "1")
        elif ((x + 1, y) not in i or (x, y + 1) not in i) and cv.get(x, y) == "2":
            cv.set(x, y, "3")
    return m


def core(pts, R=3):
    m = poly(pts)
    paint_form(cv, m, CORE, [0.75, 0.4, 0.2], R=R, outline="4", tilt=0.2)
    return m


# far side first: far leg (right, higher), far arm, far shoulder
core([(32, 44), (39, 44), (40, 52), (33, 52)])
slab([(31, 42), (40, 41), (41, 48), (33, 50)], dark=[(37, 41), (41, 41), (41, 48), (37, 49)])
core([(32, 52), (41, 51), (43, 55), (41, 57), (32, 57)])
flat(inside(poly([(32, 52), (41, 51), (43, 55), (41, 57), (32, 57)])), [(33, 52), (40, 51.5), (41, 53), (33, 53.5)], "c")
core([(42, 26), (47, 27), (47, 33), (42, 33)])
slab([(41, 31), (49, 30), (52, 40), (49, 46), (42, 44)], lit=[(42, 32), (47, 31), (45, 36), (42, 38)],
     dark=[(49, 31), (52, 40), (49, 45), (47, 38)])
core([(43, 44), (50, 44), (51, 49), (46, 51), (42, 48)])
flat(inside(poly([(43, 44), (50, 44), (51, 49), (46, 51), (42, 48)])), [(44, 44.5), (49, 44.5), (48, 46), (44, 46)], "c")
slab([(35, 18), (45, 17), (49, 23), (47, 29), (38, 29)], dark=[(45, 18), (49, 23), (47, 28), (43, 24)])

# body: dark core with a green chest plate
core([(18, 24), (40, 22), (42, 40), (35, 46), (22, 46), (17, 38)], R=5)
slab([(23, 26), (38, 25), (40, 35), (34, 41), (25, 40), (22, 33)],
     lit=[(24, 27), (31, 26), (29, 32), (24, 33)], dark=[(35, 30), (40, 35), (34, 40.5), (32, 36)])
line(cv, [(29, 33), (32, 36), (31, 40)], "3", inside(poly([(23, 26), (38, 25), (40, 35), (34, 41), (25, 40), (22, 33)])), smooth=False)

# head, set low between the shoulders: crystal helmet with a heavy brow, dark face, glowing eyes
helmet = slab([(27, 13), (35, 11), (41, 14), (42, 20), (39, 24), (29, 24), (25, 19)],
              lit=[(28, 13.5), (34, 12), (33, 16), (28, 18)])
face = poly([(31, 18), (41, 18), (41.5, 22), (38, 25), (31, 24.5)]) & inside(helmet)
for p in face:
    cv.set(*p, "o")
line(cv, [(30, 17), (41, 17)], "4", None, smooth=False)  # brow edge
stamp(cv, 31, 18, """
4444
.aaW
.Kaa
""")
stamp(cv, 39, 18, """
44
aW
Ka
""")
line(cv, [(34, 23), (38, 23)], "4", None, smooth=False)  # mouth slit

# near leg (left, lower): green thigh plate, grey shin guard, dark foot
core([(20, 45), (28, 45), (29, 53), (21, 53)])
slab([(18, 42), (28, 42), (29, 49), (20, 51)], lit=[(19, 43), (25, 43), (22, 47), (19, 48)])
foot = core([(18, 53), (29, 53), (32, 57), (30, 59), (17, 59)])
flat(inside(foot), [(19, 53.5), (28, 53.5), (29, 55), (19, 55)], "c")

# near shoulder: the biggest crystal slab, then the near arm hanging from it
core([(10, 27), (17, 27), (17, 34), (10, 34)])
slab([(6, 31), (16, 30), (18, 40), (15, 47), (7, 46), (4, 39)],
     lit=[(7, 32), (14, 31), (12, 37), (6, 38)], dark=[(14, 38), (18, 40), (15, 46.5), (12, 45)])
fist = core([(5, 46), (14, 46), (15, 51), (11, 54), (5, 52)])
flat(inside(fist), [(6, 46.5), (13, 46.5), (12, 48), (6, 48)], "c")
slab([(5, 18), (15, 14), (24, 15), (26, 22), (22, 29), (11, 30), (5, 26)],
     lit=[(6, 19), (15, 15), (21, 16), (14, 21), (7, 24)], dark=[(22, 22), (26, 22), (22, 28.5), (17, 27)])
line(cv, [(14, 21), (17, 27)], "2", inside(poly([(5, 18), (15, 14), (24, 15), (26, 22), (22, 29), (11, 30), (5, 26)])), smooth=False)
stamp(cv, 9, 17, "W")  # glint on the crystal
for x, y in ((25, 27), (8, 32), (36, 12), (20, 43), (43, 32)):
    cv.set(x, y, "W")  # glints on the crystal edges
for x, y in ((47, 47), (48, 47), (12, 49)):
    cv.set(x, y, "r")  # rust on the knuckles
outline_outer(cv, "4")
save(cv, OUT)
