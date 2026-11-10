"""Forest deer (pick 133): three-quarter view facing right; mossy olive coat, tan muzzle and
belly, branch antlers with leaves, glowing yellow ear tips and back spots, mossy chest ruff."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, paint_flame, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "forest_deer.txt"
cv = Canvas(56, 64)
COAT = ["1", "2", "3", "3"]
LEAF = ["1", "2", "3", "3"]
TAN = ["c", "y", "o", "o"]
BARK = ["y", "o", "r", "r"]


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
leg([(26, 43), (25, 49), (26.5, 53), (26, 57)], [2.8, 1.7, 1.5, 1.5], (24, 55), far=True)
leg([(39, 42), (40, 50), (40, 56)], [2.4, 1.5, 1.4], (38, 54), far=True)

# leaf tail, rising behind
paint_form(cv, stroke([(19, 35), (16.5, 31.5), (16, 29)], [2.8, 2.6, 1.4]), TAN, [0.7, 0.4, 0.15], R=2, outline="4", sel="o")
stamp(cv, 16, 29, "a")

# far ear (leaf) behind the head
def antler(trunk, tines, leaves):
    for pts, r in [(trunk, [1.6, 1.3, 0.9])] + [(t, [1.1, 0.8]) for t in tines]:
        paint_form(cv, stroke(pts, r), BARK, [0.7, 0.4, 0.15], R=1.2, outline="4", sel="r")
    for pts in leaves:
        leaf(pts, 2.6)


antler([(44, 12), (46, 7), (49, 2)], [[(46, 7), (51, 6)], [(47.5, 4.5), (46, 1)]], [[(51, 6), (52.5, 4), (53.5, 2), (54, 0)]])
ear = stroke([(46, 15), (50, 12), (53, 10.5)], [1.6, 2.4, 1.0])
paint_form(cv, ear, COAT, [0.75, 0.45, 0.2], R=2, outline="4", sel="3")
stamp(cv, 52, 10, "aa")

body = shape([(20, 33), (27, 31), (34, 31), (39.5, 34), (41.5, 39.5), (39, 45), (32, 46.5), (24, 46.5),
              (18.5, 44), (17, 38.5)])
paint_form(cv, body, COAT, [0.78, 0.45, 0.2], R=6, outline="4", tilt=0.3, sel="3")
# chest front plane and fawn spots
chest = shape([(36, 33), (40.5, 37), (40.5, 43), (37, 45), (34.5, 40)]) & inner(body)
paint_form(cv, chest, TAN, [0.7, 0.4, 0.2], R=3, outline=None)
for x, y in ((23, 34), (28, 33), (32, 34)):
    stamp(cv, x, y, "a")

# near legs: hind with a thigh, front slim
thigh = shape([(18, 37), (23.5, 37), (25.5, 42), (23, 47), (19.5, 47.5), (17, 43)])
leg([(21, 45), (19, 51), (20.5, 55), (20, 59)], [3.0, 1.8, 1.6, 1.6], (18, 57))
thigh &= body | {p for p in thigh if p[1] > 45}
paint_form(cv, thigh, COAT, [0.78, 0.45, 0.2], R=4, outline=None, tilt=0.2)
line(cv, [(23.5, 38), (25, 42.5), (23, 46.5)], "3", thigh)
outline_outer(cv, "4")
leg([(34, 43), (34, 51), (33, 59)], [2.6, 1.6, 1.5], (31, 57))

# neck and leaf collar
neck = stroke([(36, 35), (39, 29), (41, 23)], [5.2, 4.6, 4.2])
paint_form(cv, neck, COAT, [0.8, 0.48, 0.22], R=4, outline="4", sel="3")
fr = inner(neck)
front = stroke([(42, 23), (41.5, 29), (39.5, 34)], [1.6, 2.0, 2.2]) & fr
paint_form(cv, front, TAN, [0.6, 0.3, 0.15], R=2, outline=None)
for pts in (([(34, 31), (33, 35), (32.5, 38)]), ([(37, 32), (36.5, 36.5), (36, 39.5)]), ([(40, 31), (40.5, 35), (40, 38)])):
    m = stroke(pts, [1.6, 2.2, 0.6])
    paint_form(cv, m, ["1", "2", "3", "3"], [0.8, 0.5, 0.25], R=2, outline="4", sel="3")

# near ear (big leaf) sweeping up and back
antler([(39, 12), (36, 7), (33, 2)], [[(36, 7), (31, 6)], [(34.5, 4.5), (36, 1)]], [[(31, 6), (28.5, 4.5), (27, 2.5), (26, 0)]])
ear = stroke([(38, 15), (33, 12.5), (29, 12)], [1.8, 2.8, 1.1])
paint_form(cv, ear, COAT, [0.75, 0.45, 0.2], R=2, outline="4", sel="3")
line(cv, [(36, 14), (33, 13), (31, 12.5)], "y", inner(ear))
stamp(cv, 29, 11, "a" + chr(10) + "a")

# head: longish, snout toward us and to the right
head = shape([(35.5, 15), (40, 11.5), (46, 12), (50.5, 16), (53, 20), (51.5, 23.5), (46, 25.5), (40, 25),
              (36, 21.5)])
paint_form(cv, head, COAT, [0.8, 0.45, 0.18], R=5, outline="4", tilt=0.2, sel="3")
muzzle = shape([(47, 18), (52, 19.5), (52, 23), (47, 24.5), (45, 21)]) & inner(head)
paint_form(cv, muzzle, TAN, [0.65, 0.35, 0.15], R=2, outline=None)
stamp(cv, 51, 19, "KK\nK.")       # nose
stamp(cv, 48, 23, "33")           # mouth
stamp(cv, 39, 14, """
4444.
.KKK4
.KWKK
.KKKK
..aa.
""")
stamp(cv, 48, 15, "4\nK\nK")

outline_outer(cv, "4")
save(cv, OUT)
