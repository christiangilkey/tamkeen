"""FF-style detail kit for the stone creatures (inlined in each build). 64x64, three-quarter view
facing right, light from the top left. Base forms from draw2 shapes, then detail passes: cracks with
lit lower walls, strata, pits, moss clumps and hanging strands, rim light on the shadow side,
crystal prisms, flat-cut planes."""
import math
import sys
from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line

cv = Canvas(64, 64)
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
LX, LY = -0.6, -0.8


def inside(mask):
    return {p for p in mask if cv.get(*p) not in ("4",)}


def form(mask, ramp, cuts, R=6, outline="4", tilt=0.25, sel=None):
    paint_form(cv, mask, list(ramp), list(cuts), R=R, outline=outline, tilt=tilt, sel=sel)
    return inside(mask)


def solid(pts, colour, outline="4"):
    m = poly(pts)
    for x, y in m:
        cv.set(x, y, outline if any((x + dx, y + dy) not in m for dx, dy in N4) else colour)
    return m, inside(m)


def plane(inner, pts, colour):
    for p in poly(pts) & inner:
        cv.set(*p, colour)


def ridge(inner, pts, colour, smooth=False):
    line(cv, pts, colour, inner, smooth=smooth)


def crack(inner, pts, dark, lit=None, glow=None, smooth=False):
    """A crack: a dark groove line; its lower-right wall catches the light (lit pixel below/right);
    with glow, the groove itself glows (light from inside)."""
    before = {p: cv.get(*p) for p in inner}
    line(cv, pts, glow or dark, inner, smooth=smooth)
    groove = {p for p in inner if cv.get(*p) != before[p]}
    if glow:
        for x, y in groove:   # dark lips either side of a glowing groove
            for q in ((x - 1, y), (x, y - 1)):
                if q in inner and q not in groove:
                    cv.set(*q, dark)
    if lit:
        for x, y in groove:
            for q in ((x + 1, y + 1), (x, y + 1)):
                if q in inner and q not in groove and cv.get(*q) != dark:
                    cv.set(*q, lit)
                    break


def pits(inner, pts, dark, lit):
    for x, y in pts:
        if (x, y) in inner:
            cv.set(x, y, dark)
        if (x + 1, y + 1) in inner:
            cv.set(x + 1, y + 1, lit)


def rimlight(inner, colour, shadow, mask=None):
    """Reflected light along the lower-right edge of a form, only over its shadow tones."""
    m = mask or inner
    for x, y in list(inner):
        if cv.get(x, y) in shadow and ((x + 1, y) not in m or (x, y + 1) not in m or
                                        cv.get(x + 1, y) == "4" or cv.get(x, y + 1) == "4"):
            cv.set(x, y, colour)


def clump(cx, cy, r, ramp, edge):
    """A small shaded clump (moss, lichen): light top left, edge colour around it."""
    m = shape([(cx + r * math.cos(a) * (1 + 0.12 * math.sin(3 * a)), cy + r * 0.85 * math.sin(a))
               for a in [i * math.pi / 5 for i in range(10)]])
    paint_form(cv, m, list(ramp), [0.85, 0.5, 0.22][:len(ramp) - 1], R=max(1.5, r * 0.7), outline=edge, tilt=0.2)
    return m


def strand(x, y, n, colours):
    """A hanging strand of moss: colours from root to tip, 1px wide, slight sway."""
    for i in range(n):
        cv.set(x + (1 if i in (n // 2, n // 2 + 1) and n > 4 else 0), y + i, colours[min(i * len(colours) // n, len(colours) - 1)])


def prism(base, tip, w, lit="1", mid="2", dark="3", glint="W", shoulder=0.72, edge="4"):
    """Elongated hexagonal crystal: three long facets (lit/mid/dark by orientation) to a sharp tip."""
    (bx, by), (tx, ty) = base, tip
    L = math.hypot(tx - bx, ty - by)
    dx, dy = (tx - bx) / L, (ty - by) / L
    nx, ny = -dy, dx
    sx, sy = bx + dx * L * shoulder, by + dy * L * shoulder
    m = poly([(bx + nx * w, by + ny * w), (sx + nx * w, sy + ny * w), (tx, ty),
              (sx - nx * w, sy - ny * w), (bx - nx * w, by - ny * w)])
    strips = []
    for k in range(3):
        s0, s1 = -w + k * 2 * w / 3, -w + (k + 1) * 2 * w / 3
        sm = (s0 + s1) / 2
        strips.append((nx * sm * LX + ny * sm * LY, s0, s1))
    order = sorted(strips)
    col = {order[2][1]: lit, order[1][1]: mid, order[0][1]: dark}
    for x, y in m:
        px, py = x + 0.5 - bx, y + 0.5 - by
        t = (px * dx + py * dy) / L
        sc = 1.0 if t <= shoulder else max(0.05, (1 - t) / (1 - shoulder))
        a = (px * nx + py * ny) / sc
        c = col[strips[0][1]] if a < strips[0][2] else (col[strips[1][1]] if a < strips[1][2] else col[strips[2][1]])
        cv.set(x, y, c)
    for x, y in m:
        if any((x + ex, y + ey) not in m for ex, ey in N4):
            cv.set(x, y, edge)
    ls = [s for s in strips if col[s[1]] == lit][0]
    for f in (0.55, 0.62):
        gx = bx + dx * L * f + nx * (ls[1] + ls[2]) / 2 * 0.7
        gy = by + dy * L * f + ny * (ls[1] + ls[2]) / 2 * 0.7
        if cv.get(int(gx), int(gy)) == lit:
            cv.set(int(gx), int(gy), glint)
    return m

# ---- Treasure golem HATCHLING (baby of treasure_golem _ff1): ~2/3 the height, a big faceted amber
# head (about 42% of the height) with bigger gold-glowing eyes and a stubby crown of three small pink
# crystals; small cut-amber body with gold veins and one set gem, chunky dark rock fists with bands,
# stubby legs. Same palette and rendering. ----
OUT = sys.argv[1] if len(sys.argv) > 1 else "treasure_golem_hatch1.txt"
ROCK = ("c", "y", "o", "o")
GEM = """
.vvvv.
vWaaav
vaWarv
varrrv
.vrrv.
..vv..
"""


def amber(pts, top=None, side=None, under=None, bevel=None, veins=(), gems=(), glints=(), facets=(), edges=()):
    """A cut-amber block: base mid tone, flat lit top plane, dark far side and underside planes,
    a bright bevel line, gold veins (cracks filled with gold), set gems."""
    m, i = solid(pts, "2")
    if top:
        plane(i, top, "1")
    if side:
        plane(i, side, "3")
    if under:
        plane(i, under, "d")
    for f, c in facets:
        plane(i, f, c)
    for r_, c in edges:
        ridge(i, r_, c)
    if bevel:
        ridge(i, bevel, "u")
    for v in veins:
        crack(i, v, "d", None, glow="u")
        line(cv, v[1:2], "v", i, smooth=False)
    for gx, gy in gems:
        stamp(cv, gx, gy, GEM)
    for p in glints:
        cv.set(*p, "W")
    rimlight(i, "3", ("d",), m)
    return m, i


def rock(pts, R=2, cracks=()):
    m = poly(pts)
    i = form(m, ROCK, (0.8, 0.45, 0.2), R=R, tilt=0.3)
    for c in cracks:
        crack(i, c, "o", "c")
    return m, i


def band(i, y0, y1):
    """Riveted metal band across a rock part."""
    for x, y in i:
        if y0 <= y <= y1:
            cv.set(x, y, "W" if y == y0 else ("o" if y == y1 else ("y" if x % 3 == 0 else "m")))


def crystal(base, tip, w):
    return prism(base, tip, w, "a", "r", "d", "W")


SMALLGEM = """
.vv.
vWav
vrrv
.vv.
"""

# far side (right, behind): far leg and foot, far fist, far shoulder
rock([(36, 54), (42, 54), (43, 58), (36, 58)])
m, i = rock([(34, 57), (44, 56.5), (46, 60), (44, 62.5), (34, 62.5)])
band(i, 58, 59)
m, i = rock([(46, 45), (51, 46), (52, 52), (47, 53)])
m, i = rock([(44, 51), (53, 51), (54.5, 55.5), (51, 58.5), (44, 57)])
band(i, 52, 53)
amber([(43, 39), (50, 40), (52, 45), (50, 49), (44, 48)], top=[(43, 39.5), (50, 40.5), (47, 43), (44, 42)],
      side=[(50, 41), (52, 45), (50, 48.5), (49, 44)])

# body: small cut-amber block, faceted chest, two gold veins, one set gem
tm, ti = amber([(19, 42), (31, 38), (44, 40), (48, 46), (47, 53), (40, 57), (24, 57), (18, 52)],
               top=[(18.5, 43), (31, 38.5), (44, 40.5), (46, 43), (36, 45), (24, 46)],
               side=[(46, 43), (48, 46), (47, 53), (44, 54), (44, 46)],
               under=[(18, 52), (26, 54), (44, 53), (44, 54), (40, 57), (24, 57)],
               bevel=[(19, 45), (24, 46), (36, 45), (45, 43)],
               veins=[[(28, 46), (30, 50), (29, 54)], [(39, 46), (41, 50)]],
               facets=[([(25, 46.5), (36, 45.5), (34, 50), (26, 51)], "1"),
                       ([(34, 50), (44, 47), (44, 53), (33, 54)], "3")],
               edges=[([(26, 46.5), (35, 45.5)], "u"), ([(34, 50), (44, 47.5)], "3")])
stamp(cv, 35, 49, SMALLGEM)

# near leg (left, lower)
rock([(23, 54), (32, 54), (33, 59), (24, 59)], cracks=[[(26, 55), (27, 58)]])
m, i = rock([(20, 58), (34, 58), (36.5, 61), (35, 63.5), (20, 63.5)])
band(i, 59, 60)

# head: big faceted amber block, lit top, dark far side, crevice with bigger gold-glowing eyes
hm, hi = amber([(30, 31), (38, 27), (46, 28.5), (50, 33), (49.5, 40), (46, 43.5), (33, 43.5), (30, 38)],
               top=[(30.5, 31), (38, 27.5), (45.5, 29), (40, 32), (32, 33.5)],
               side=[(46, 29), (50, 33), (49.5, 40), (47, 42.5), (46.5, 34)],
               bevel=[(32, 33.5), (40, 32), (46, 29)], glints=[(35, 29), (36, 29)])
plane(hi, [(32, 35), (46.5, 34), (47, 39.5), (33, 40)], "K")
ridge(hi, [(32, 34.5), (39, 35.5), (46.5, 34)], "d")
stamp(cv, 33, 36, """
uuuuW
.duuu
""")
stamp(cv, 43, 36, """
Wu
ud
""")
ridge(hi, [(37, 42), (43, 42)], "d")
# stubby crown: three small pink crystals
crystal((37, 29), (35, 21), 2.2)
crystal((41, 28.5), (42, 22), 1.8)
crystal((33, 30.5), (29, 25), 1.6)

# near shoulder: small amber pauldron with a set gem; dark rock forearm, chunky fist with a band
amber([(12, 41), (19, 37.5), (26, 39), (27, 44), (23, 48), (13, 48), (11, 45)],
      top=[(12, 41), (19, 38), (26, 39.5), (20, 41.5), (13, 43)], under=[(12, 46), (24, 46.5), (23, 48), (13, 48)],
      bevel=[(13, 43), (20, 41.5), (26, 39.5)], glints=[(16, 39)])
stamp(cv, 18, 42, SMALLGEM)
m, i = rock([(13, 47), (21, 47), (22, 52), (14, 53)], cracks=[[(16, 48), (17, 51)]])
m, i = rock([(10, 51), (22, 50.5), (24, 55), (21, 60), (11, 60), (9, 56)], R=2.5)
band(i, 52, 53)
for kx in (13, 17):
    ridge(i, [(kx, 55), (kx, 58)], "o")
    cv.set(kx + 1, 54, "c")
outline_outer(cv, "4")
# stand on the bottom row of the canvas
low = max(y for y in range(64) for x in range(64) if cv.g[y][x] != ".")
g = [row[:] for row in cv.g]
for y in range(64):
    for x in range(64):
        sy = y - (63 - low)
        cv.g[y][x] = g[sy][x] if 0 <= sy < 64 else "."
save(cv, OUT)
