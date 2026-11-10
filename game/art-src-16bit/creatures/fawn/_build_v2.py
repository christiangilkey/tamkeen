"""Leaf-eared fawn (pick 20): three-quarter view facing right, sleek deer build, tan coat with
fawn spots, two big leaf ears, leaf collar and leaf tail, slim legs with dark hooves."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, paint_flame, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "fawn2.txt"
cv = Canvas(56, 64)
COAT = ["1", "2", "3", "3"]
LEAF = ["c", "y", "o", "o"]


def union(*m):
    s = set()
    for x in m:
        s |= x
    return s


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


def leaf(pts, w):
    """A leaf: narrow stem end, wide middle, pointed tip; midrib line."""
    m = stroke(pts, [w * 0.45, w, w * 0.8, 0.6])
    paint_form(cv, m, LEAF, [0.7, 0.4, 0.15], R=2.5, outline="4", sel="o")
    line(cv, pts[:-1] + [pts[-1]], "o", inner(m))
    return m


def leg(pts, rad, hoof_at, far=False):
    m = stroke(pts, rad)
    ramp = ["2", "3", "3", "3"] if far else COAT
    paint_form(cv, m, ramp, [0.8, 0.5, 0.25], R=2, outline="4", sel="3")
    x, y = hoof_at
    stamp(cv, x, y, ".4rr4\n4rrr4\n44444")


# far legs first (right side of each pair, higher)
leg([(26, 43), (25, 48), (26.5, 51), (26, 55)], [2.8, 1.7, 1.5, 1.5], (24, 53), far=True)
leg([(39, 42), (40, 48), (40, 54)], [2.4, 1.5, 1.4], (38, 52), far=True)

# leaf tail, rising behind
leaf([(19, 35), (15, 30), (13, 25), (12, 21)], 2.8)

# far ear (leaf) behind the head
leaf([(45, 14), (48, 9), (51, 5), (54, 1)], 3.4)

body = shape([(20, 33), (27, 31), (34, 31), (39.5, 34), (41.5, 39.5), (39, 45), (32, 46.5), (24, 46.5),
              (18.5, 44), (17, 38.5)])
paint_form(cv, body, COAT, [0.78, 0.45, 0.2], R=6, outline="4", tilt=0.3, sel="3")
# chest front plane and fawn spots
chest = shape([(36, 33), (40.5, 37), (40.5, 43), (37, 45), (34.5, 40)]) & inner(body)
paint_form(cv, chest, ["W", "1", "1"], [0.7, 0.3], R=3, outline=None)
for x, y in ((22, 35), (26, 34), (30, 34), (25, 38), (29, 38), (33, 36)):
    if cv.get(x, y) in ("1", "2", "3"):
        stamp(cv, x, y, "WW")

# near legs: hind with a thigh, front slim
thigh = shape([(18, 37), (23.5, 37), (25.5, 42), (23, 47), (19.5, 47.5), (17, 43)])
leg([(21, 45), (19, 50), (20.5, 53), (20, 57)], [3.0, 1.8, 1.6, 1.6], (18, 55))
thigh &= body | {p for p in thigh if p[1] > 45}
paint_form(cv, thigh, COAT, [0.78, 0.45, 0.2], R=4, outline=None, tilt=0.2)
line(cv, [(23.5, 38), (25, 42.5), (23, 46.5)], "3", thigh)
outline_outer(cv, "4")
leg([(34, 43), (34, 50), (33, 57)], [2.6, 1.6, 1.5], (31, 55))

# neck and leaf collar
neck = stroke([(36, 35), (39, 29), (41, 23)], [5.2, 4.6, 4.2])
paint_form(cv, neck, COAT, [0.8, 0.48, 0.22], R=4, outline="4", sel="3")
fr = inner(neck)
front = stroke([(42, 23), (41.5, 29), (39.5, 34)], [1.6, 2.0, 2.2]) & fr
paint_form(cv, front, ["W", "1", "1"], [0.6, 0.3], R=2, outline=None)
for pts in (([(35, 32), (34, 36), (33.5, 39)]), ([(38.5, 33), (38.5, 37), (38, 40)])):
    m = stroke(pts, [1.4, 2.4, 0.6])
    paint_form(cv, m, LEAF, [0.7, 0.4, 0.15], R=2, outline="4", sel="o")

# near ear (big leaf) sweeping up and back
leaf([(38, 14), (33, 9), (27, 5), (22, 2)], 4.2)

# head: longish, snout toward us and to the right
head = shape([(35.5, 15), (40, 11.5), (46, 12), (50.5, 16), (53, 20), (51.5, 23.5), (46, 25.5), (40, 25),
              (36, 21.5)])
paint_form(cv, head, COAT, [0.8, 0.45, 0.18], R=5, outline="4", tilt=0.2, sel="3")
muzzle = shape([(47, 18), (52, 19.5), (52, 23), (47, 24.5), (45, 21)]) & inner(head)
paint_form(cv, muzzle, ["W", "1", "1"], [0.65, 0.3], R=2, outline=None)
stamp(cv, 51, 19, "KK\nK.")       # nose
stamp(cv, 48, 23, "33")           # mouth
stamp(cv, 39, 14, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 48, 15, "4\nK\nK")
stamp(cv, 38, 20, "aa")
outline_outer(cv, "4")
save(cv, OUT)
