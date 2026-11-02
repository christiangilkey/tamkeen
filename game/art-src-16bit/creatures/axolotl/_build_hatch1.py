"""Axolotl hatchling (baby of axolotl _ff1): same FF rendering and exact palette. About 2/3 the height,
big broad head (~45% of height), short stubby gill fans, a low spined crest, short finned tail, stubby
clawed legs. Three-quarter view facing right, standing; light top left."""
import sys
from water_ff_kit import (Canvas, shape, stroke, poly, paint_form, outline_outer, save, line, union, st,
                          rim, inner_line, rays, dots, frond, paint_vol, edge)

OUT = sys.argv[1] if len(sys.argv) > 1 else "axolotl_hatch1.txt"
cv = Canvas(64, 64)
SKIN = ["h", "1", "2", "3", "d"]
FIN = ["c", "c", "y", "o", "3"]
GILL = ["h", "1", "a", "a", "r"]
TOES = []


def leg(pts, rad, toes_xy, toes, far=False):
    m = stroke(pts, rad)
    paint_form(cv, m, SKIN[1:] if far else SKIN, [0.7, 0.45, 0.2] if far else [0.93, 0.74, 0.48, 0.22], R=2, outline="d")
    TOES.append((toes_xy, toes))


FAR_FOOT = [".2.2.", "d2d2d", "4d4d4"]
NEAR_FOOT = [".1.1.1.", "d12d12d", "4d4d4d4"]

# far legs (shaded, right of their partners and a touch higher)
leg([(27, 56), (27.5, 59)], [2.2, 1.8], (25, 59), FAR_FOOT, far=True)
leg([(44, 54), (45, 58)], [2.2, 1.8], (43, 58), FAR_FOOT, far=True)

# far gills: two small fronds peeking over the head
for rach in ([(45, 40), (43.5, 35), (42.5, 32)], [(48, 40), (49, 35), (50, 32)]):
    stem, fils = frond(rach, [1.8, 1.4, 1.0], n=3, flen=2.6, frad=(1.2, 0.7), back=0.5)
    m = union(stem, *fils)
    paint_form(cv, m, ["1", "a", "a", "r"], [0.85, 0.55, 0.25], R=1.2, outline=None)
    line(cv, rach, "r", stem)

# short finned tail curling up
tail_path = [(19, 53), (12, 53), (8, 50), (7, 45)]
fin = stroke(tail_path, [5.0, 4.8, 3.4, 1.4])
paint_form(cv, fin, FIN, [0.9, 0.62, 0.35, 0.1], R=2.5, outline="o")
core = stroke(tail_path, [3.4, 2.8, 2.0, 0.8])
paint_form(cv, core, SKIN, [0.9, 0.7, 0.45, 0.2], R=2.5, outline="d", tilt=0.3)
rays(cv, [((14, 50), (13, 47.5)), ((10, 50), (8, 47.5)), ((14, 56), (13, 58)), ((10, 55), (8, 57))], "o", fin - core)
rim(cv, core, "g", dirs=((0, 1), (1, 1)))

# low spined crest along the back
crest = poly([(35, 46), (29, 46.5), (23, 48), (18, 50), (17, 46.5), (20, 47.5), (22, 44), (25, 46), (28, 42.5), (31, 45), (33, 42)])
paint_form(cv, crest, FIN, [0.85, 0.55, 0.3, 0.1], R=1.5, outline="o")
rays(cv, [((29, 46.5), (28, 43.5)), ((24, 47.5), (22, 45))], "o", crest)
dots(cv, [(28, 43), (22, 45), (33, 43)], "h", crest)

# body: short and plump, still structured (chest toward us)
body = shape([(37, 46.5), (40.5, 50), (40, 55), (35.5, 58.5), (27, 59.5), (20, 58), (16.5, 54), (19, 49.5), (26, 46.5), (32, 45.5)])
paint_vol(cv, body, SKIN, [0.9, 0.74, 0.54, 0.3], (28, 52), (12, 7), R=4, w=0.65, outline="d", tilt=0.15)
binner = body - edge(body)
belly = shape([(35, 53), (40, 51.5), (40.5, 55), (36, 58.5), (32, 58.5), (32.5, 55.5)]) & binner
paint_vol(cv, belly, ["c", "y", "y", "o", "3"], [0.7, 0.5, 0.3, 0.12], (28, 52), (12, 7), R=2, w=0.65)
dots(cv, [(27, 50), (23, 52)], "3", binner)
dots(cv, [(26, 48), (27, 48), (31, 47)], "W", binner)
rim(cv, body, "g", dirs=((0, 1), (1, 1)))

# near legs: short, stubby, clawed
leg([(22, 56), (21, 60)], [2.8, 2.3], (18, 60), NEAR_FOOT)
leg([(36, 55), (35.5, 59.5)], [2.8, 2.3], (32, 60), NEAR_FOOT)
dots(cv, [(21, 56), (35, 55)], "W")

# near gills: three short ribbed fans behind the head
for rach, rad, n, fl in (([(36, 41), (33, 36), (31, 32), (30, 29)], [2.0, 1.7, 1.3, 0.8], 5, 3.4),
                         ([(35, 43), (30, 40), (25, 38), (21.5, 37.5)], [2.0, 1.7, 1.3, 0.8], 5, 3.4),
                         ([(35, 46), (30, 45.5), (25.5, 46), (22, 47.5)], [1.8, 1.5, 1.1, 0.7], 4, 3.0)):
    stem, fils = frond(rach, rad, n=n, flen=fl, frad=(1.3, 0.7), back=0.5)
    m = union(stem, *fils)
    paint_form(cv, m, GILL, [0.92, 0.7, 0.45, 0.2], R=1.6, outline=None)
    inner_line(cv, m, "r")
    line(cv, rach, "r", stem)
    dots(cv, [rach[-1]], "h")

# head: big, broad and flat, short snout
head = shape([(35, 41.5), (40, 38.5), (46, 38), (51, 39.5), (54.5, 43), (54.5, 47), (51, 50.5), (45, 52.5), (39, 52), (35, 49), (34, 45)])
paint_vol(cv, head, SKIN, [0.9, 0.72, 0.5, 0.28], (44, 44), (11, 8), R=4, w=0.6, outline="d", tilt=0.15)
hin = head - edge(head)
jaw = shape([(41, 49), (48, 48.5), (54, 46.5), (51, 51), (45, 53), (39, 52.5)]) & hin
paint_form(cv, jaw, ["1", "2", "3", "3", "d"], [0.95, 0.6, 0.3, 0.1], R=2, outline=None)
line(cv, [(54, 46.5), (50, 48), (46, 48.8), (42.5, 49)], "d", hin, smooth=False)   # mouth line
line(cv, [(52, 48), (48, 49.6), (44, 50)], "1", hin, smooth=False)                 # lit lower lip
rim(cv, head, "g", dirs=((0, 1), (1, 1)))
dots(cv, [(41, 40), (42, 40), (43, 39), (47, 39), (48, 39), (52, 41)], "W", hin)
dots(cv, [(53, 43)], "d", hin)     # nostril
# eyes: same narrow gold style, a touch bigger than the juvenile's
st(cv, 38, 39, [".hh1...",
                "dd444..",
                ".4eeK4.",
                ".4eKK4.",
                "..444.."])
st(cv, 49, 41, ["d4", "eK", "eK", "4."])

outline_outer(cv, "4", keep=("4", "K"))
for xy, rows in TOES:
    st(cv, *xy, rows)
save(cv, OUT)
