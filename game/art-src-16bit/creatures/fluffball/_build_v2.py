"""Fluffball v2 (pick 74): the pick's identity kept - a big wide peach face is the main shape, two big
round fluffy ears that double as headphone cups (coral cups with a light), a fluffy pink mane and
cheek ruff, and a soft fluffy body with a yellow chest light. Three-quarter view facing right."""
import math
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "fluffball_v2.txt"
cv = Canvas(56, 64)
FUR = ["1", "2", "3", "3"]
FACE = ["c", "y", "o", "o"]


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def disc(cx, cy, r):
    return {(x, y) for y in range(int(cy - r) - 1, int(cy + r) + 2) for x in range(int(cx - r) - 1, int(cx + r) + 2)
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r}


def fluffy_disc(cx, cy, r, n=7, tuft=1.6, start=0.0):
    """A round shape with soft tufts around its edge."""
    m = disc(cx, cy, r)
    for i in range(n):
        a = start + 2 * math.pi * i / n
        m |= disc(cx + math.cos(a) * (r - 0.3), cy + math.sin(a) * (r - 0.3), tuft)
    return m


def fur(mask, R=4, tilt=0.2, ramp=FUR):
    paint_form(cv, mask, ramp, [0.78, 0.45, 0.2], R=R, outline="4", tilt=tilt, sel="3")


def soft(mask, R=2.5):
    """Fur part in front of other fur: edge drawn in dark fur colour, not the outline colour
    (the outer silhouette still gets the outline at the end)."""
    paint_form(cv, mask, FUR, [0.78, 0.45, 0.2], R=R, outline="3", tilt=0.2)


FEET = []
FOOT = """
.43334.
4333334
4444444
"""

# far leg (right, higher)
fur(stroke([(35, 49), (36, 53)], [3.4, 3.0]), R=2.5)
FEET.append(((33, 53), FOOT))

# small fluffy tail behind
tail = union(stroke([(23, 46), (16, 45), (11, 41), (9, 35)], [4.0, 4.8, 4.6, 3.6]),
             fluffy_disc(9, 34, 3.6, n=5, tuft=1.8, start=-2.0), fluffy_disc(12, 43, 3.8, n=5, tuft=1.8, start=1.0),
             stroke([(8, 32), (6, 27)], [2.4, 1.0]), stroke([(6, 37), (2, 35)], [2.0, 0.8]))

MASS_AT = None
# soft fluffy body: clear torso with tufted sides, lighter fluffy chest toward us
body = union(shape([(26, 31), (36, 31), (40.5, 36), (40.5, 44), (37, 50.5), (28, 52), (22, 49), (21, 41), (23, 35)]),
             stroke([(22.5, 44), (19, 47)], [2.0, 1.0]), stroke([(22, 38), (18.5, 40)], [2.0, 0.9]),
             stroke([(40, 44), (43, 47)], [1.8, 0.8]))
# pink mane and cheek ruff behind the face
mane = union(
    stroke([(24, 22), (17, 24), (13, 29)], [5.0, 3.6, 1.2]),
    stroke([(25, 28), (20, 33), (18, 37)], [4.4, 3.2, 1.0]),
    stroke([(30, 31), (28, 35), (27, 38)], [3.8, 2.6, 0.9]),
    stroke([(38, 31), (41, 34), (42, 37)], [3.4, 2.4, 0.9]),
    stroke([(23, 17), (16, 17), (12, 21)], [4.4, 3.2, 1.0]),
)

mass = union(tail, body, mane)
fur(mass, R=6, tilt=0.25)
inm = {p for p in mass if cv.get(*p) != "4"}
for pts in (((16, 44), (11, 41)), ((19, 30), (16, 34)), ((19, 21), (15, 24)), ((24, 44), (21, 47))):
    line(cv, list(pts), "3", inm, smooth=False)
inb = {p for p in body if cv.get(*p) != "4"} & inm
chest = shape([(31, 33), (38, 34), (40, 40), (38, 47), (32, 49), (29, 43)]) & inb
paint_form(cv, chest, ["c", "1", "1", "2"], [0.88, 0.55, 0.3], R=4, outline=None, tilt=0.3)
# yellow chest light
stamp(cv, 31, 38, """
..44..
.4aa4.
4aaWa4
4aaaa4
.4aa4.
..44..
""")

# near leg (left, lower)
soft(stroke([(26, 48), (26, 54)], [3.8, 3.2]))
FEET.append(((22, 54), FOOT))

# arms: both short and fluffy, paws held in front of the chest light
soft(stroke([(38.5, 35), (41, 39), (38.5, 42)], [2.6, 2.4, 2.4]), R=2)
soft(stroke([(25, 35), (24, 40), (29, 43)], [3.0, 2.7, 2.6]), R=2)
stamp(cv, 28, 42, "11\n.1")

# far ear-cup, behind the head (upper right)
fur(fluffy_disc(44.5, 8.5, 5.5, n=6, tuft=1.6, start=-1.2), R=3)
cupf = disc(45, 9, 3.2)
paint_form(cv, cupf, ["r", "r", "o"], [0.6, 0.3], R=2, outline="4")

# face: big and wide, cheeks full, a soft muzzle toward us on the right
face = shape([(22, 14), (27, 9), (34, 7.5), (41, 8.5), (46, 12), (48.5, 17.5), (50.5, 22.5), (48.5, 27),
              (44, 30), (37, 32), (30, 31.5), (24.5, 28.5), (21.5, 23), (21, 18)])
paint_form(cv, face, FACE, [0.8, 0.42, 0.16], R=7, outline="4", tilt=0.2, sel="o")
inf = {p for p in face if cv.get(*p) != "4"}
line(cv, [(41, 21), (40.5, 25), (42.5, 28.5)], "o", inf)     # cheek line, muzzle starts here
muzzle = shape([(42, 20.5), (48, 19), (50, 22.5), (48.5, 26.5), (44, 28.5), (41.5, 25)]) & inf
paint_form(cv, muzzle, ["c", "c", "y"], [0.5, 0.2], R=3, outline=None)

# pink fur on the crown with a little forehead tuft
cap = union(shape([(24, 13), (28, 8), (35, 6), (42, 7.5), (45.5, 10.5), (41, 10.5), (36, 11.5), (31, 11.5), (27, 14.5)]),
            stroke([(33, 9), (36, 4), (40, 3)], [2.6, 1.8, 0.8]))
fur(cap, R=3)

# headphone band over the head, joining the two ear-cups
line(cv, [(22, 8), (27, 4.5), (34, 3.5), (41, 4.5)], "4")
line(cv, [(23, 9), (27, 5.5), (34, 4.5), (40, 5.5)], "3")

# near ear-cup: big round fluffy ear with a coral cup and a light
fur(fluffy_disc(21.5, 13.5, 7.0, n=8, tuft=1.8, start=0.4), R=4)
cup = disc(21.5, 14, 4.3)
paint_form(cv, cup, ["a", "r", "r", "o"], [0.85, 0.5, 0.2], R=3, outline="4")
stamp(cv, 20, 12, "aW\naa")

# eyes: near eye with a lid, far eye narrower at the right; nose, small smile, blush
stamp(cv, 30, 15, """
44444.
.KKKK4
.KWKKK
.KKKKK
..KKK.
""")
stamp(cv, 42, 15, """
444
KK4
WK.
KK.
""")
stamp(cv, 48, 20, "KK\n.K")
stamp(cv, 44, 25, "4..4\n.44.")
stamp(cv, 31, 24, "rrr")
outline_outer(cv, "4")
for xy, f in FEET:
    stamp(cv, *xy, f)
save(cv, OUT)
