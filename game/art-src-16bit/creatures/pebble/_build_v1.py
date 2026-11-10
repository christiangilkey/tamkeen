"""Mossy pebble (pick 40): a chunky faceted boulder with a moss cap draped over the top, a pale
stone face turned toward us on the right, sleepy eyes, stubby stone arms and feet.
Three-quarter view facing right, light from the top left."""
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

OUT = sys.argv[1] if len(sys.argv) > 1 else "pebble.txt"
cv = Canvas(56, 64)
STONE = ["1", "2", "3", "3"]


def flat(mask, pts, colour):
    """Fill a flat facet (polygon) inside a shape, leaving its outline alone."""
    for p in poly(pts) & mask:
        if cv.get(*p) != "4":
            cv.set(*p, colour)


# far foot and far arm (behind the body)
far_foot = poly([(35, 51), (42, 50), (44, 55), (41, 57), (35, 57)])
paint_form(cv, far_foot, STONE, [0.8, 0.45, 0.2], R=2, outline="4")
far_arm = poly([(46, 36), (52, 37), (54, 43), (51, 46), (47, 44)])
paint_form(cv, far_arm, ["2", "3", "3", "3"], [0.8, 0.45, 0.2], R=2, outline="4")

# body: an angular boulder (straight facets, not a ball)
body = poly([(10, 32), (17, 23), (30, 19), (42, 21), (49, 28), (51, 40), (46, 51), (34, 56), (20, 55),
             (11, 49), (8, 40)])
paint_form(cv, body, STONE, [0.78, 0.42, 0.18], R=7, outline="4", tilt=0.25, sel="3")
inner = {p for p in body if cv.get(*p) != "4"}
# face plane turned toward us: pale stone, lit at its top left
face = poly([(27, 29), (45, 28), (48.5, 39), (44, 49), (31, 50.5), (26, 41)]) & inner
paint_form(cv, face, ["c", "y", "o", "o"], [0.75, 0.38, 0.12], R=5, outline=None, tilt=0.3)
# facet edges: where the face plane meets the side planes, and a chip low on the left
line(cv, [(27, 30), (26, 41), (31, 50)], "3", inner, smooth=False)
line(cv, [(45, 29), (48, 39), (44, 48)], "o", inner, smooth=False)
line(cv, [(12, 44), (18, 47), (22, 53)], "3", inner, smooth=False)
flat(inner, [(13, 45), (18, 47.5), (21, 53), (14, 50)], "3")
# lit facet on the upper left of the boulder and a crack across the side
flat(inner, [(11, 33), (17, 30), (22, 33), (21, 40), (14, 42), (10, 39)], "1")
line(cv, [(11, 40), (14, 42), (21, 40), (22, 33)], "2", inner, smooth=False)
line(cv, [(17, 41), (19, 44), (24, 45)], "3", inner, smooth=False)

# moss cap draped over the top, with a ragged lower edge
moss = poly([(8.5, 34), (12, 25), (21, 18.5), (33, 15.5), (44, 18), (50.5, 26), (50, 31), (47, 29),
             (44, 32), (41, 28.5), (37, 31), (33, 27.5), (29, 30.5), (25, 27.5), (21, 31), (17, 28),
             (13, 33), (11, 31)])
paint_form(cv, moss, ["a", "a", "r", "r"], [0.9, 0.55, 0.3], R=4, outline="4", tilt=0.2, sel="r")
mos = {p for p in moss if cv.get(*p) != "4"}
for pts in (([16, 27], [19, 25]), ([24, 25], [27, 23]), ([33, 24], [36, 22]), ([41, 25], [44, 23]),
            ([29, 21], [31, 20]), ([38, 20], [40, 19]), ([21, 22], [23, 21])):
    line(cv, pts, "r", mos, smooth=False)  # clumps of moss
for x, y in ((18, 24), (26, 22), (34, 21), (22, 20), (30, 19)):
    cv.set(x, y, "c")  # sunlit tips

# near arm: a stubby stone arm on the left side
near_arm = poly([(9, 38), (14, 40), (13, 47), (8, 50), (4, 48), (4, 43)])
paint_form(cv, near_arm, STONE, [0.8, 0.45, 0.2], R=2.5, outline="4", sel="3")
# near foot (left, lower)
near_foot = poly([(19, 52), (27, 52), (29, 57), (26, 59), (18, 59), (16, 56)])
paint_form(cv, near_foot, STONE, [0.8, 0.45, 0.2], R=2, outline="4", sel="3")

# sleepy eyes: heavy lids, orange-brown lower rim; far eye narrower at the right of the face
stamp(cv, 31, 34, """
44444
.KKK4
.KWK.
.oKo.
""")
stamp(cv, 43, 34, """
444
KK4
WK.
oK.
""")
stamp(cv, 37, 42, """
4..4
.44.
""")  # small smile
stamp(cv, 30, 39, "oo")    # cheek
outline_outer(cv, "4")
save(cv, OUT)
