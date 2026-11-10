"""Moon wolf (pick 160): sitting wolf pup, three-quarter view facing right. Dark violet coat, pale
lavender ruff, muzzle, chest and tail tip; a small gold crescent on the brow (accent)."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line
HC, S, NC = (36, 17), 1.12, (36, 16.5)


def T(pts):
    return [(NC[0] + S * (x - HC[0]), NC[1] + S * (y - HC[1])) for x, y in pts]


OUT = sys.argv[1] if len(sys.argv) > 1 else "moon_wolf.txt"
cv = Canvas(56, 64)
COAT = ["1", "2", "3", "4"]
PALE = ["c", "y", "o", "3"]


def union(*m):
    s = set()
    for x in m:
        s |= x
    return s


def inner(mask):
    return {p for p in mask if cv.get(*p) != "4"}


# tail: bushy, curling up behind on the left, pale tip
tail = stroke([(18, 52), (10, 50), (6, 44), (6, 36)], [3.2, 4.4, 4.0, 2.2])
paint_form(cv, tail, COAT, [0.8, 0.45, 0.15], R=4, outline="4", tilt=0.2, sel="3")
tip = stroke([(6, 41), (6, 36)], [3.6, 2.2]) & inner(tail)
paint_form(cv, tip, PALE, [0.7, 0.4, 0.1], R=3, outline=None)

# far front leg (right, higher)
far = stroke([(40, 44), (40, 51), (40, 56)], [3.0, 2.4, 2.4])
paint_form(cv, far, ["2", "3", "4", "4"], [0.8, 0.4, 0.1], R=2, outline="4")
stamp(cv, 37, 55, ".4444.\n4o3334\n444444")

# body: upright sitting torso, chest at the front
torso = shape([(30, 26), (38, 27), (42.5, 33), (42.5, 42), (39, 50), (30, 53), (21, 53), (16, 48), (17, 40), (22, 32)])
paint_form(cv, torso, COAT, [0.78, 0.45, 0.15], R=6, outline="4", tilt=0.25, sel="3")
chest = poly([(35, 27), (41, 30), (43, 37), (41.5, 43), (39.5, 41), (38.5, 45.5), (36.5, 42), (34.5, 44.5), (34, 38), (34.5, 32)]) & inner(torso)
paint_form(cv, chest, PALE, [0.8, 0.45, 0.12], R=4, outline=None, tilt=0.3)

line(cv, [(24, 35), (21, 39)], "1", inner(torso))
line(cv, [(28, 33), (26, 37)], "1", inner(torso))

# near haunch (folded back leg) with its paw in front
haunch = shape([(15, 42), (22, 39.5), (27, 45), (26.5, 53), (21, 56.5), (14, 55), (12, 48)])
paint_form(cv, haunch, COAT, [0.78, 0.42, 0.15], R=4, outline="4", tilt=0.25, sel="3")
line(cv, [(17, 45), (20, 44), (23, 46)], "1", inner(haunch))
paw_b = stroke([(19, 58), (27, 58.5)], [2.0, 2.0])
paint_form(cv, paw_b, ["2", "3", "3"], [0.6, 0.3], R=1.5, outline="4")

# near front leg (left, lower)
near = stroke([(33, 44), (33, 52), (33, 57)], [3.2, 2.6, 2.6])
paint_form(cv, near, COAT, [0.78, 0.45, 0.15], R=2.5, outline="4", sel="3")
stamp(cv, 30, 57, ".44444.\n4c4y4o4\n4444444")

# ears behind the skull: near ear (left) and far ear (right)
for pts, rad in ((T([(39.5, 12), (41, 7), (42, 2.5)]), [3.6, 2.4, 0.6]),
                 (T([(31, 12.5), (29.5, 7), (28.5, 2)]), [4.0, 2.6, 0.6])):
    ear = stroke(pts, rad)
    paint_form(cv, ear, COAT, [0.78, 0.45, 0.15], R=2, outline="4", sel="3")
    innr = stroke([(pts[0][0] + 0.5, pts[0][1] + 1), (pts[1][0] + 0.3, pts[1][1] + 1)], [1.6, 0.6]) & inner(ear)
    paint_form(cv, innr, ["o", "o", "3"], [0.6, 0.2], R=1, outline=None)

# skull and muzzle
skull = shape(T([(27, 15), (30, 10.5), (36, 9), (41.5, 11), (44.5, 16), (43.5, 22), (38, 25.5), (31, 25), (27, 21)]))
paint_form(cv, skull, COAT, [0.8, 0.45, 0.15], R=6, outline="4", tilt=0.2, sel="3")
# ruff: pale fur at the jaw and throat, ending in tufts
ruff = poly([(28, 20), (33, 19.5), (37, 22), (41.5, 26.5), (39.5, 29), (38.5, 33), (36.5, 29.5), (34.5, 33.5), (32.5, 29.5), (30, 32.5), (29.5, 28.5), (26.5, 29.5), (27, 25)])
paint_form(cv, ruff, PALE, [0.78, 0.45, 0.12], R=3, outline="4", tilt=0.2, sel="o")

muzzle = poly(T([(38.5, 17.5), (42, 16.8), (45, 17.6), (47.3, 19.3), (47.3, 21.3), (45.5, 22.8), (42, 23.8), (38.5, 23.8)]))
paint_form(cv, muzzle, PALE, [0.78, 0.42, 0.12], R=3, outline="4", sel="o")
stamp(cv, 47, 17, ".44.\n4KK4\n.4K4")  # nose
line(cv, [(43, 23), (46, 22.5)], "3", None, smooth=False)  # mouth line
# eyes: near eye left of the muzzle with a lid line, far eye a sliver at the edge
stamp(cv, 32, 13, "4444.\n.KKK4\n.KWKK\n.KKK.")
stamp(cv, 42, 14, "44\nKK\nK.")
stamp(cv, 35, 10, ".aa\naa.")  # crescent moon mark on the brow
outline_outer(cv, "4")
save(cv, OUT)
