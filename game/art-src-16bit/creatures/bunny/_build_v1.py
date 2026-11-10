"""Cyber bunny (pick 88): three-quarter view facing right, standing on its hind legs; lime coat,
long ears with neon inner stripes, mint belly, darker neon-green socks and paws, puff tail."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "bunny.txt"
cv = Canvas(56, 64)
COAT = ["1", "2", "3", "3"]
SOCK = ["a", "a", "r", "r"]


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


def part(mask, ramp=COAT, R=3, sel="3", cuts=(0.78, 0.45, 0.2), tilt=0.2):
    paint_form(cv, mask, ramp, list(cuts), R=R, outline="4", tilt=tilt, sel=sel)


def ear(pts, w, stripe):
    m = stroke(pts, [w * 0.7, w, w * 0.9, w * 0.35])
    part(m, R=2.5)
    line(cv, stripe, "a", inner(m))
    return m


# far foot and leg (right, higher)
far_leg = shape([(32, 45), (36, 46), (37, 50), (35, 52), (32, 51)])
part(far_leg, ramp=SOCK, R=2, sel="r")
part(shape([(32, 50.5), (39.5, 51), (41, 53), (39, 54.5), (32, 54)]), ramp=SOCK, R=1.5, sel="r")

# far arm behind the body
part(stroke([(37, 35), (40, 39), (41, 42)], [2.0, 1.7, 1.8]), R=1.5)
part(stroke([(41, 42), (41.5, 43)], [1.9, 1.9]), ramp=SOCK, R=1.5, sel="r")

# puff tail
part(shape([(19, 44), (22, 42), (25, 44), (24.5, 48), (21, 49), (18.5, 47)]), ramp=["c", "y", "o", "o"], R=3, sel="o")

# far ear behind the head
ear([(36, 18), (38, 11), (40, 6), (43, 2)], 3.0, [(37, 15), (39, 9), (41, 5)])

body = shape([(28, 31), (35, 31), (39, 36), (39.5, 43), (37, 49), (30, 51), (24, 49), (22, 43), (23.5, 36)]) | stroke([(31.5, 27), (31.5, 32)], [4.8, 5.4])
part(body, R=6, tilt=0.3, cuts=(0.88, 0.55, 0.28))
belly = shape([(34, 27), (36.5, 29), (38, 35.5), (39, 43), (36, 48.5), (32, 48.5), (31, 40)]) & inner(body)
paint_form(cv, belly, ["c", "y", "o", "o"], [0.75, 0.4, 0.2], R=4, outline=None, tilt=0.3)

# near hind leg: big haunch and long foot pointing forward
haunch = shape([(23, 42), (29, 41), (32, 45), (31, 51), (26, 53), (22.5, 50), (21.5, 46)])
part(haunch, R=4, tilt=0.25, cuts=(0.86, 0.52, 0.25))
sock = shape([(25, 50), (30.5, 49.5), (30, 53), (25, 54)]) & inner(haunch)
paint_form(cv, sock, SOCK, [0.7, 0.4, 0.2], R=2, outline=None)
part(shape([(23, 52.5), (31, 52.5), (35, 55), (33.5, 57.5), (24, 57.5), (22, 55)]), ramp=SOCK, R=1.5, sel="r")
stamp(cv, 32, 55, "W.\n.W")  # toe claws glint

# near arm in front: short, paw held at the chest
part(stroke([(27.5, 35), (29.5, 39), (33, 40.5)], [2.6, 2.2, 2.0]), R=2.5, cuts=(0.8, 0.45, 0.15))
part(stroke([(34, 40.5), (35, 40.5)], [2.1, 2.1]), ramp=SOCK, R=1.5, sel="r")


# near ear: tall, sweeping back a little
ear([(30, 18), (28, 11), (26, 5), (25, 0)], 3.6, [(29.5, 15), (27.5, 9), (26.2, 4)])

head = shape([(26, 20), (30, 16), (36, 15.5), (41, 18), (44.5, 22.5), (43.5, 26.5), (38, 29.5), (31, 30),
              (26.5, 27)])
part(head, R=6, tilt=0.2, cuts=(0.86, 0.5, 0.2))
cheek = shape([(38, 22), (44, 22.5), (43.5, 26.5), (39, 28.5), (36.5, 26)]) & inner(head)
paint_form(cv, cheek, ["c", "y", "o"], [0.6, 0.3], R=2, outline=None)
stamp(cv, 43, 23, "oo\no.")       # nose
stamp(cv, 41, 26, "33")           # mouth
stamp(cv, 31, 19, """
4444.
.KKK4
.KWKK
.KKKK
..KK.
""")
stamp(cv, 40, 20, "4\nK\nK")
stamp(cv, 30, 25, "aa")
outline_outer(cv, "4")
save(cv, OUT)
