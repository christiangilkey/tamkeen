"""Axolotl FF1 (water, pick 10): a cool young salamander in the Final Fantasy monster style.
Three-quarter view facing right, light top left. Flat wedge head with small intense gold eyes,
ribbed gill fronds, a spined fin crest running down the back into a finned tail, glossy skin with
speculars and an aqua rim light, clawed splayed toes.
Extra colour letters: h highlight, d deep shade, g rim light (aqua), e eye gold."""
import sys
from water_ff_kit import (Canvas, shape, stroke, poly, paint_form, outline_outer, save, line, union, st,
                          rim, inner_line, rays, dots, frond, paint_vol, edge)

OUT = sys.argv[1] if len(sys.argv) > 1 else "axolotl_ff1.txt"
cv = Canvas(64, 64)
SKIN = ["h", "1", "2", "3", "d"]
SKIN_CUTS = [0.93, 0.74, 0.48, 0.22]
FIN = ["c", "c", "y", "o", "3"]
GILL = ["h", "1", "a", "a", "r"]


def leg(pts, rad, toes_xy, toes, far=False):
    m = stroke(pts, rad)
    paint_form(cv, m, SKIN[1:] if far else SKIN, [0.7, 0.45, 0.2] if far else SKIN_CUTS, R=2.5, outline="d")
    TOES.append((toes_xy, toes))
    return m


TOES = []
FAR_FOOT = [".2.2.2.", "d2d2d2d", "4d4d4d4"]
NEAR_FOOT = [".1..1..1.", "d12d12d12", "21232323d", "4d4d4d4d4"]

# ---- far legs (right of their partners, higher, in shade)
leg([(28, 50), (29.5, 54), (29.5, 56)], [2.8, 2.2, 2.0], (26, 55), FAR_FOOT, far=True)
leg([(50, 44), (52, 49), (52, 53)], [2.8, 2.2, 2.0], (49, 52), FAR_FOOT, far=True)

# ---- far gills peeking over the head (shaded)
for rach in ([(50, 26), (47, 19), (45, 14)], [(54, 25), (55, 18), (56.5, 13)]):
    stem, fils = frond(rach, [1.8, 1.4, 0.9], n=4, flen=3.0, frad=(1.2, 0.7), back=0.5)
    m = union(stem, *fils)
    paint_form(cv, m, ["1", "a", "a", "r"], [0.85, 0.55, 0.25], R=1.2, outline=None)
    line(cv, rach, "r", stem)

# ---- tail: finned, curling up at the end
tail_path = [(19, 47), (11, 47), (5, 43), (2.5, 36), (4, 29)]
fin = stroke(tail_path, [6.5, 6.5, 5.0, 3.6, 1.5])
paint_form(cv, fin, FIN, [0.9, 0.62, 0.35, 0.1], R=3, outline="o")
core = stroke(tail_path, [4.2, 3.6, 2.8, 1.9, 0.8])
paint_form(cv, core, SKIN, [0.9, 0.7, 0.45, 0.2], R=3, outline="d", tilt=0.3)
fin_only = fin - core
rays(cv, [((13, 44), (12, 40)), ((9, 44), (7, 40.5)), ((6, 41), (2.5, 39)), ((4.5, 37), (0.5, 36)),
          ((4.5, 33), (1, 31)), ((14, 50), (13, 54)), ((9, 49), (7, 52.5)), ((6, 46), (2.5, 48)),
          ((5, 42), (1.5, 44))], "o", fin_only)
rim(cv, core, "g", dirs=((0, 1), (1, 1)))

# ---- dorsal crest: spined membrane from behind the head down to the tail
crest_pts = []
base = [(41, 35.5), (35, 36.5), (28, 38.5), (21, 41.5), (16, 44)]
tops = [(40, 28), (37, 32), (34, 26.5), (31, 32), (28, 27.5), (25, 33.5), (22, 30), (19, 36.5), (16, 34.5), (14, 41)]
crest = poly(base + tops)
paint_form(cv, crest, FIN, [0.85, 0.55, 0.3, 0.1], R=2, outline="o")
rays(cv, [((32, 37.5), (34, 27.5)), ((28, 38.5), (28, 28.5)), ((24, 40), (22, 31)),
          ((20, 42), (16, 35.5))], "o", crest)
dots(cv, [(34, 27), (28, 28), (22, 30), (16, 35)], "h", crest)  # lit spine tips

# ---- body: long and low, chest toward us on the right
body = shape([(45, 37), (49, 42), (48.5, 48.5), (43.5, 53), (34, 55), (24, 54), (16.5, 51), (13.5, 46),
              (18, 41.5), (27, 38.5), (37, 36)])
paint_vol(cv, body, SKIN, [0.9, 0.74, 0.54, 0.3], (31, 43), (19, 10), R=5, w=0.65, outline="d", tilt=0.15)
binner = body - edge(body)
belly = shape([(42, 45), (48, 43.5), (49, 48), (45.5, 52.5), (41, 53), (39.5, 49)]) & binner
paint_vol(cv, belly, ["c", "y", "y", "o", "3"], [0.7, 0.5, 0.3, 0.12], (31, 43), (19, 10), R=3, w=0.65)
# freckles and wet speculars
dots(cv, [(30, 42), (25, 44), (34, 40), (21, 46), (38, 41)], "3", binner)
dots(cv, [(29, 40), (30, 40), (36, 38), (23, 43)], "W", binner)
rim(cv, body, "g", dirs=((0, 1), (1, 1)))

# ---- near legs (in front): splayed, clawed
nh = leg([(22, 49), (19, 54), (18, 57)], [3.6, 2.8, 2.4], (14, 57), NEAR_FOOT)
nf = leg([(42, 47), (40, 52.5), (40.5, 57)], [3.6, 2.8, 2.4], (36, 57), NEAR_FOOT)
dots(cv, [(21, 50), (41, 48)], "W")

# ---- near gills: three big ribbed fronds fanning back from behind the head
for rach, rad, n, fl in (([(43, 28), (39, 21), (35.5, 15), (33, 10)], [2.2, 1.8, 1.3, 0.8], 6, 4.2),
                         ([(41.5, 31), (35, 26), (28.5, 22.5), (23, 21)], [2.2, 1.8, 1.3, 0.8], 6, 4.2),
                         ([(41.5, 34), (35, 33.5), (28.5, 35), (23.5, 37.5)], [2.0, 1.6, 1.2, 0.7], 5, 3.6)):
    stem, fils = frond(rach, rad, n=n + 2, flen=fl + 0.6, frad=(1.3, 0.7), back=0.5)
    m = union(stem, *fils)
    paint_form(cv, m, GILL, [0.92, 0.7, 0.45, 0.2], R=1.6, outline=None)
    inner_line(cv, m, "r")
    line(cv, rach, "r", stem)
    dots(cv, [rach[-1]], "h")

# ---- head: flat wedge, top plane lit, jaw in shade
head = shape([(40.5, 27.5), (46, 24), (53, 23), (59, 24.5), (62.5, 28), (62.5, 31.5), (58.5, 35), (51, 37.5),
              (44, 37), (40, 33)])
paint_vol(cv, head, SKIN, [0.9, 0.72, 0.5, 0.28], (50, 28.5), (13, 8.5), R=4, w=0.6, outline="d", tilt=0.15)
hin = head - edge(head)
jaw = shape([(46, 34), (55, 33), (62, 31), (58.5, 35.5), (51, 38), (44, 37.5)]) & hin
paint_form(cv, jaw, ["1", "2", "3", "3", "d"], [0.95, 0.6, 0.3, 0.1], R=2, outline=None)
line(cv, [(62, 31), (58, 32.5), (53, 33.5), (48, 34)], "d", hin, smooth=False)   # mouth line
line(cv, [(60, 32.5), (55, 34.2), (50, 34.8)], "1", hin, smooth=False)           # lit lower lip
rim(cv, head, "g", dirs=((0, 1), (1, 1)))
# speculars on the wet head
dots(cv, [(48, 26), (49, 26), (50, 25), (55, 25), (56, 25), (60, 27)], "W", hin)
dots(cv, [(61, 28)], "d", hin)     # nostril
# brows and eyes: small, narrow, gold, intense
line(cv, [(46, 30), (45, 33), (45.5, 35.5)], "3", hin, smooth=False)   # cheek crease
st(cv, 45, 24, ["..hh1..",
                ".dd44..",
                "..4eeK4",
                "...4e44",
                "....4.."])
st(cv, 57, 26, ["d4", "eK", "4."])

outline_outer(cv, "4", keep=("4", "K"))
for xy, rows in TOES:
    st(cv, *xy, rows)
save(cv, OUT)
