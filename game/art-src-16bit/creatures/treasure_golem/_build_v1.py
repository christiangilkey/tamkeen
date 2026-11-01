"""Treasure golem (pick 154): a chunky cut-amber body (flat facets like a gemstone), a pink crystal
growing from the top, small dark rock fists and feet, a cheerful face turned toward us on the right.
Three-quarter view facing right, light from the top left."""
import sys
from draw2 import Canvas, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "treasure_golem.txt"
cv = Canvas(56, 64)
ROCK = ["c", "y", "o", "o"]


def inside(mask):
    return {p for p in mask if cv.get(*p) != "4"}


def flat(mask, pts, colour):
    for p in poly(pts) & mask:
        cv.set(*p, colour)


def cut(pts, base, lit, dark, facets=()):
    """A cut-stone form: flat base colour, flat facets [(polygon, colour)], bright rim on edges facing
    up/left, dark rim on edges facing down/right, outline."""
    m = poly(pts)
    for x, y in m:
        edge = any((x + dx, y + dy) not in m for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        cv.set(x, y, "4" if edge else base)
    i = inside(m)
    for f, c in facets:
        flat(i, f, c)
    for x, y in i:
        if (x - 1, y) not in i and (x, y - 1) not in i:
            cv.set(x, y, lit)
        elif ((x + 1, y) not in i or (x, y + 1) not in i) and cv.get(x, y) == base:
            cv.set(x, y, dark)
    return m


def rock(pts, R=2):
    m = poly(pts)
    paint_form(cv, m, ROCK, [0.8, 0.45, 0.2], R=R, outline="4", tilt=0.2, sel="o")
    return m


# far foot and far fist (right, higher, behind)
rock([(34, 49), (42, 48), (44, 53), (41, 56), (34, 56)])
rock([(46, 30), (52, 31), (55, 37), (52, 42), (47, 41)])

# body: cut amber with a lit top plane, a mid side plane on the left, the face plane toward us, a dark base
body = cut([(9, 30), (17, 18), (31, 13), (44, 17), (51, 29), (50, 44), (41, 53), (22, 54), (11, 47)],
           "2", "1", "3", facets=(
    ([(10, 29), (17, 19), (31, 14), (43, 18), (36, 24), (21, 26)], "1"),      # top plane, lit
    ([(43, 18), (51, 29), (50, 44), (46, 46), (47, 33), (45, 25), (36, 24)], "3"),  # far side plane
    ([(23, 48), (46, 46), (41, 53), (22, 54), (12, 47)], "3"),                # underside
))
inner = inside(body)
line(cv, [(10, 29), (21, 26), (36, 24), (43, 18)], "3", inner, smooth=False)    # top ridge
line(cv, [(36, 24), (45, 25), (47, 33), (46, 46)], "4", inner, smooth=False)    # face / far side ridge
line(cv, [(21, 26), (25, 37), (23, 48)], "3", inner, smooth=False)              # face / left ridge
line(cv, [(12, 47), (23, 48), (46, 46)], "4", inner, smooth=False)              # base ridge
flat(inner, [(22, 27), (35, 25), (44, 26), (45.5, 32), (24, 33)], "1")          # light catching the face top
line(cv, [(21, 26), (36, 24), (45, 25)], "3", inner, smooth=False)
for x, y in ((14, 24), (15, 24), (15, 23), (19, 21)):
    cv.set(x, y, "W")  # sparkle on the cut top
# small pink gems set into the amber
stamp(cv, 14, 36, """
.a.
arr
.r.
""")
stamp(cv, 41, 41, "ar\nrr")

# pink crystal growing from the top, leaning back
crystal = cut([(29, 16), (31, 7), (35, 2), (38, 6), (38, 16)], "a", "W", "r",
              facets=(([(34, 3), (38, 6), (38, 16), (34, 16)], "r"),))
cut([(37, 17), (39, 10), (42, 8), (43, 13), (42, 18)], "a", "W", "r", facets=(([(41, 9), (43, 13), (42, 18), (40, 18)], "r"),))

# face toward us: near eye left, far eye at the right edge, a wide happy mouth
stamp(cv, 29, 30, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 42, 30, """
444
KK4
WK.
KK.
""")
stamp(cv, 33, 38, """
444444
4WWWW4
.4rr4.
..44..
""")
stamp(cv, 27, 36, "aa")
stamp(cv, 44, 36, "a")

# near fist (left) and near foot (left, lower)
rock([(3, 36), (10, 35), (12, 41), (9, 46), (3, 45), (1, 40)])
rock([(15, 52), (25, 52), (27, 57), (24, 59), (15, 59), (13, 56)])
outline_outer(cv, "4")
save(cv, OUT)
