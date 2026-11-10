"""Forest deer v2 (pick 133): resting with legs folded, head up, three-quarter view facing right.
Dark olive coat, dark branch antlers with leaves, tan muzzle, glowing yellow patches, a pale mossy
chest ruff with scalloped shade lines (not dark stripes)."""
import sys
from draw2 import Canvas, shape, stroke, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "forest_deer2.txt"
cv = Canvas(56, 64)
COAT = ["1", "2", "3", "3"]
TAN = ["c", "y", "o", "o"]
BARK = ["o", "r", "r", "r"]
DX, DY = -1, 9  # head offset from the fawn's head layout


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


def mv(pts):
    return [(x + DX, y + DY) for x, y in pts]


def part(mask, ramp=COAT, R=3, sel="3", cuts=(0.8, 0.48, 0.2), tilt=0.2, outline="4"):
    paint_form(cv, mask, ramp, list(cuts), R=R, outline=outline, tilt=tilt, sel=sel)


def leaf(pts, w):
    m = stroke(pts, [w * 0.45, w, w * 0.8, 0.6])
    part(m, R=2.5, cuts=(0.7, 0.4, 0.15))
    line(cv, pts, "3", inner(m))


def antler(trunk, tines, leaves):
    for pts, r in [(trunk, [1.6, 1.3, 0.9])] + [(t, [1.1, 0.8]) for t in tines]:
        part(stroke(pts, r), ramp=BARK, R=1.2, sel="r", cuts=(0.7, 0.4, 0.15))
    for pts in leaves:
        leaf(pts, 2.6)


def hoof(x, y):
    stamp(cv, x, y, "4rr4\n4rrr4\n.444")


# far folded foreleg, poking out ahead (right, higher), behind the body
part(stroke([(38, 47), (43, 50), (46, 51)], [2.2, 1.7, 1.5]), ramp=["2", "3", "3", "3"], R=1.5)
hoof(46, 49)
# tail tuft
part(stroke([(12, 45), (9.5, 42), (9, 40)], [2.6, 2.3, 1.3]), ramp=TAN, R=2, sel="o")
stamp(cv, 9, 39, "a")
# far antler and far ear
antler(mv([(44, 12), (46, 7), (49, 2)]), [mv([(46, 7), (51, 6)]), mv([(47.5, 4.5), (46, 1)])],
       [mv([(51, 6), (52.5, 4), (53.5, 2), (54, 0)])])
ear = stroke(mv([(46, 15), (50, 12), (53, 10.5)]), [1.6, 2.4, 1.0])
part(ear, R=2)
stamp(cv, 52 + DX, 10 + DY, "aa")

# body lying down, low and long, with the neck rising from the chest
body = shape([(12, 44.5), (20, 39.5), (30, 38.5), (37, 40), (42, 46), (41, 52), (31, 55.5), (18, 55.5),
              (11, 51.5)]) | stroke([(35.5, 45), (38, 39), (40, 33)], [6.6, 5.8, 5.2])
part(body, R=7, tilt=0.15, cuts=(0.84, 0.5, 0.2))
ins = inner(body)
# folded hind leg: haunch shown by a shade line, glowing patch on it
line(cv, [(14, 46), (19, 43), (25, 44.5), (27.5, 49), (25, 54)], "3", ins)
stamp(cv, 19, 47, "aa\nac")
for x, y in ((23, 42), (28, 41), (32, 41)):
    stamp(cv, x, y, "a")
# throat and chest: tan front plane, then a pale mossy ruff with scalloped shade lines
front = stroke([(42.5, 33), (42, 38), (41, 43)], [1.8, 2.2, 2.4]) & ins
paint_form(cv, front, TAN, [0.6, 0.3, 0.15], R=2, outline=None)
ruff = (stroke([(33.5, 40), (34, 44)], [2.3, 1.6]) | stroke([(37, 41), (37.5, 45.5)], [2.4, 1.7]) |
        stroke([(40.5, 41), (40.5, 45)], [2.2, 1.5])) & ins
paint_form(cv, ruff, ["1", "1", "2"], [0.6, 0.3], R=2, outline=None)
for x, y in ruff:
    if (x, y + 1) not in ruff:
        cv.set(x, y, "3")
# folded near hind foot along the ground, folded near foreleg tucked in front
part(stroke([(21, 54), (28, 55.5)], [1.8, 1.6]), ramp=["2", "3", "3", "3"], R=1.5)
hoof(28, 54)
part(stroke([(33, 49), (37, 53), (41, 55)], [2.5, 1.9, 1.6]), R=1.8)
hoof(41, 53)

# near antler and ear, then the head
antler(mv([(39, 12), (36, 7), (33, 2)]), [mv([(36, 7), (31, 6)]), mv([(34.5, 4.5), (36, 1)])],
       [mv([(31, 6), (28.5, 4.5), (27, 2.5), (26, 0)])])
ear = stroke(mv([(38, 15), (33, 12.5), (29, 12)]), [1.8, 2.8, 1.1])
part(ear, R=2)
line(cv, mv([(36, 14), (33, 13), (31, 12.5)]), "y", inner(ear))
stamp(cv, 29 + DX, 11 + DY, "a\na")
head = shape(mv([(35.5, 15), (40, 11.5), (46, 12), (50.5, 16), (53, 20), (51.5, 23.5), (46, 25.5), (40, 25),
                 (36, 21.5)]))
part(head, R=5, cuts=(0.8, 0.45, 0.18))
muzzle = shape(mv([(47, 18), (52, 19.5), (52, 23), (47, 24.5), (45, 21)])) & inner(head)
paint_form(cv, muzzle, TAN, [0.65, 0.35, 0.15], R=2, outline=None)
stamp(cv, 51 + DX, 19 + DY, "KK\nK.")
stamp(cv, 48 + DX, 23 + DY, "oo")
stamp(cv, 39 + DX, 14 + DY, """
4444.
.KKK4
.KWKK
.KKKK
..aa.
""")
stamp(cv, 48 + DX, 15 + DY, "4\nK\nK")
stamp(cv, 37 + DX, 20 + DY, "a")  # glow under the eye
outline_outer(cv, "4")
save(cv, OUT)
