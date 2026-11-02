"""Dragon whelp hatchling (baby of dragon_whelp _ff1): same FF rendering and palette. Low crouch like the
juvenile, head raised and big (~45% of height) with a short snout, horn nubs, a short flame crest, a bigger
glowing eye in the same style; small half-raised wings with finger bones and veins, scalloped hide, belly
plates, short legs with claws, a curled tail with a small flame. Three-quarter view facing right."""
import sys
from fire_ffkit import (Canvas, shape, stroke, poly, form, flame, feather, scallops, union, line, stamp,
                        outline_outer, save, px, settle)

OUT = sys.argv[1] if len(sys.argv) > 1 else "dragon_whelp_hatch1.txt"
cv = Canvas(64, 64)
HIDE = ["L", "1", "2", "3", "D", "D"]
DARKHIDE = ["2", "3", "D", "D", "r"]
PLATE = ["c", "c", "y", "o", "o"]
HORN = ["W", "c", "y", "o", "H"]
MEMB = ["2", "3", "a", "r", "r"]
FL = ["F", "2", "1", "L", "W"]
FOOT = ".4D3D4\n4D3D3D4\n4W4W4W."


def membrane(pts, veins):
    m = poly(pts)
    idx = form(cv, m, MEMB, cuts=[0.9, 0.7, 0.45, 0.25], R=2.5, outline="4", line_in="r")
    for v in veins:
        line(cv, v, "D", set(idx), smooth=False)


def bone(pts, w=1.3):
    form(cv, stroke(pts, [w, w * 0.9, w * 0.6]), HIDE, R=1.2, outline="4", line_in="D")


# far wing: small, raised behind the back
membrane([(38, 44), (37, 36), (40, 29), (36, 32), (33, 33), (32, 37), (34, 42)], [[(37, 36), (33, 34)]])
bone([(38, 44), (37, 36), (40, 29)], 1.1)

# far front leg
form(cv, stroke([(48, 50), (49, 53), (49, 55)], [2.4, 2.0, 1.9]), DARKHIDE, R=2, line_in="r")
stamp(cv, 46, 55, FOOT)

# tail: curled, small flame tip with a brown edge
fl = union(stroke([(15, 45), (17, 40), (16, 36)], [2.4, 1.7, 0.6]), stroke([(14, 45), (12, 41), (12.5, 38)], [1.8, 1.2, 0.5]))
flame(cv, fl, FL, outline="a")
tail = stroke([(24, 52), (17, 55.5), (12.5, 52.5), (12.5, 48), (15, 45)], [3.6, 3.0, 2.4, 2.0, 1.5])
form(cv, tail, HIDE, R=2.5, line_in="D", tex=scallops((4, 3)))
px(cv, [(13, 51), (13, 48)], "L")

# body, neck, near hind foot and near front leg: one scaled form
mass = union(
    shape([(43, 41), (47, 45), (46.5, 51), (42, 55), (33, 56.5), (25, 55.5), (21.5, 52), (22, 46.5), (26, 43), (34, 41.5)]),
    stroke([(44, 45), (45, 40.5), (46.5, 37)], [5.2, 4.6, 4.2]),
    stroke([(26, 54), (30, 57), (33, 57.5)], [2.6, 2.2, 2.0]),
    stroke([(42, 51), (42, 55), (42, 57.5)], [3.0, 2.6, 2.4]),
)
midx = form(cv, mass, HIDE, R=6, tilt=0.3, rim="F", tex=scallops((5, 4)))
inm = set(midx)
belly = shape([(47, 36), (50, 41), (49.5, 47), (46.5, 52), (43, 54), (42.5, 49.5), (44, 45), (44.5, 39)]) & inm
pidx = form(cv, belly, PLATE, cuts=[0.92, 0.7, 0.45, 0.2], R=2.5, outline=None, tilt=0.3)
for y in range(38, 54, 3):
    px(cv, [p for p in pidx if p[1] == y], "o")
    px(cv, [p for p in pidx if p[1] == y + 1 and pidx[p] <= 1], "W")
line(cv, [(27, 46), (30.5, 50), (29, 55)], "D", inm)
line(cv, [(39.5, 51), (39.5, 56)], "D", inm, smooth=False)
px(cv, [(33, 58), (31, 58)], "W")
stamp(cv, 39, 58, FOOT)

# small dorsal spikes
for base, tip in (((37, 42), (35, 39.5)), ((31, 42), (29, 39.5)), ((25, 44), (22.5, 42))):
    form(cv, stroke([base, tip], [1.4, 0.5]), HORN[1:], R=1, outline="4", line_in="D")

# near wing: small, half raised, three fingers, veined membrane, scalloped edge
membrane([(36, 46), (30, 35), (21, 30), (23, 34.5), (19, 37.5), (23.5, 40), (21.5, 44), (28, 45)],
         [[(30, 35), (23, 34.5)], [(30, 36), (23.5, 40)], [(31, 38), (22, 43)]])
bone([(36, 46), (30, 35), (21, 30)], 1.5)
bone([(30, 35), (19, 37.5)], 1.0)
px(cv, [(30, 35)], "L")
px(cv, [(29, 34)], "W")

# horn nubs (far one first)
form(cv, stroke([(51.5, 28.5), (51, 25.5), (50, 24)], [2.0, 1.4, 0.6]), HORN, R=1.2, outline="4", line_in="H")
# short flame crest behind the head
for base, tip, w in (((44, 30), (38, 26), 2.0), ((43, 33), (37, 31), 2.0), ((43, 36), (38, 36.5), 1.8)):
    feather(cv, base, tip, w, HIDE[:5], "D", bend=-0.4, flame_tip=FL, flame_from=0.45)

# head: big, short snout
head = shape([(40.5, 30), (44.5, 26.5), (50, 26), (54.5, 28.5), (57.5, 31.5), (57, 35), (53, 37.5), (46, 38),
              (41.5, 36)])
hidx = form(cv, head, HIDE, R=4.5, tilt=0.25, line_in="D", rim="F")
inh = set(hidx)
jaw = shape([(48, 35), (57, 34), (56, 36.5), (52, 38), (46, 38.5), (45, 36.5)]) & inh
form(cv, jaw, PLATE, R=2, outline=None)
line(cv, [(48, 35), (52, 35), (56.5, 34)], "4", inh, smooth=False)
px(cv, [(54, 36)], "W")
px(cv, [(56, 32)], "K")
line(cv, [(44, 28), (48, 28), (51, 29.5)], "D", inh, smooth=False)
stamp(cv, 45, 29, """
.4444.
4LLKK4
4LKKK4
.4444.
""")
px(cv, [(46, 30)], "W")
px(cv, [(53, 30)], "4")
px(cv, [(53, 31)], "L")
# near horn nub over the head
form(cv, stroke([(43.5, 27.5), (41.5, 24), (39.5, 22.5)], [1.9, 1.3, 0.6]), HORN, R=1.2, outline="4", line_in="H")

outline_outer(cv, "4", keep=("4", "K", "W"))
print("shift", settle(cv))
save(cv, OUT)
