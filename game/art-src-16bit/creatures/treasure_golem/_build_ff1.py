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

# ---- Treasure golem, FF style (pick 154): a sturdy amber golem. Torso and shoulders of cut amber
# (flat gem planes) split by gold veins, pink gems set in gold sockets; a small faceted head sunk
# between the shoulders with eyes glowing gold in a dark crevice and a crown of pink crystals; dark
# rock forearms, fists and legs bound with riveted metal bands. ----
OUT = sys.argv[1] if len(sys.argv) > 1 else "treasure_golem_ff1.txt"
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


# ---- far side (right, higher, partly hidden)
m, i = rock([(37, 46), (44, 46), (45, 55), (38, 55)])
m, i = rock([(36, 54), (45, 53.5), (47, 57), (45, 59), (36, 59)])
band(i, 54, 56)
m, i = rock([(50, 29), (57, 30), (58, 43), (51, 44)], cracks=[[(54, 33), (55, 38)]])
m, i = rock([(49, 42), (59, 42), (60, 48), (56, 52), (49, 50)])
band(i, 43, 45)
amber([(46, 19), (55, 20), (58, 26), (56, 32), (48, 31)], top=[(46, 19.5), (55, 20.5), (52, 24), (47, 23)],
      side=[(55, 21), (58, 26), (56, 31.5), (54, 25)])

# ---- torso: a big cut-amber block
tm, ti = amber([(14, 22), (30, 16), (46, 18), (53, 27), (52, 42), (44, 50), (24, 51), (15, 44), (12, 32)],
               top=[(13, 31), (14, 22.5), (30, 16.5), (46, 18.5), (50, 23), (40, 26), (22, 28)],
               side=[(50, 23), (53, 27), (52, 42), (48, 45), (48, 29)],
               under=[(15, 44), (24, 47), (44, 46), (48, 45), (44, 50), (24, 51)],
               bevel=[(14, 31), (22, 28), (40, 26), (49, 23.5)],
               veins=[[(20, 30), (24, 35), (22, 41), (25, 46)], [(24, 35), (31, 37)],
                      [(40, 28), (43, 34), (41, 40), (44, 45)], [(33, 19), (30, 24)]],
               gems=[(31, 37), (15, 34)], glints=[(18, 21), (19, 21), (24, 19)],
               facets=[([(24, 28), (40, 26), (36, 34), (24.5, 36)], "1"),     # chest, upper left: lit
                       ([(40, 26), (48, 29), (48, 37), (36, 34)], "2"),
                       ([(24.5, 36), (36, 34), (34, 44), (24, 46)], "2"),
                       ([(36, 34), (48, 37), (48, 45), (34, 44)], "3"),       # chest, lower right: shade
                       ([(13, 31), (22, 28), (24, 36), (14, 38)], "1"),       # flank, upper: lit
                       ([(14, 38), (24, 36), (24, 46), (16, 44)], "2")],
               edges=[([(25, 28), (39, 26)], "u"), ([(40, 26), (36, 34)], "u"),
                      ([(36, 34), (48, 37)], "3"), ([(36, 34), (34, 44)], "d"),
                      ([(14, 38), (24, 36)], "3")])
ridge(ti, [(22, 28), (24, 36), (24, 47)], "1")       # near flank / chest edge, lit
ridge(ti, [(48, 29), (48, 45)], "d")                 # chest / far side edge

# ---- head: small faceted amber block sunk between the shoulders, scowling, eyes glowing gold
hm, hi = amber([(33, 10), (41, 7), (48, 10), (51, 16), (48, 22), (36, 22), (33, 16)],
               top=[(33.5, 10.5), (41, 7.5), (47.5, 10.5), (43, 12.5), (35, 13.5)],
               side=[(48, 11), (51, 16), (48, 21.5), (47, 15)], bevel=[(35, 13), (43, 12), (48, 10)])
plane(hi, [(35, 14.5), (47, 13.5), (47.5, 18), (36, 18.5)], "K")       # crevice under the brow
ridge(hi, [(35, 14), (41, 15), (47, 13)], "d")                          # brow dips to the centre
stamp(cv, 36, 15, """
uuuW.
.duu.
""")
stamp(cv, 44, 15, """
Wu
ud
""")
ridge(hi, [(38, 20), (45, 20)], "d")                                    # hard mouth line
# crown of pink crystals, leaning back
crystal((37, 10), (34, 0), 2.6)
crystal((41, 9), (42, 1), 2.2)
crystal((34, 12), (28, 5), 2.0)
crystal((45, 10), (49, 4), 1.6)

# ---- near leg (left, lower)
m, i = rock([(21, 48), (31, 48), (32, 55), (22, 55)], cracks=[[(25, 49), (27, 53)]])
m, i = rock([(18, 55), (33, 55), (36, 59), (34, 62), (17, 62)])
band(i, 56, 58)

# ---- near shoulder (left): a big amber pauldron with a set gem; dark rock forearm and a big fist
amber([(5, 22), (15, 17), (25, 19), (27, 26), (22, 33), (8, 33), (4, 28)],
      top=[(5, 22.5), (15, 17.5), (25, 19.5), (18, 23), (8, 25)], under=[(5, 29), (22, 30), (21, 33), (8, 33)],
      bevel=[(8, 25), (18, 23), (25, 20)], veins=[[(13, 24), (15, 29)]], gems=[(17, 25)], glints=[(10, 20)])
m, i = rock([(6, 32), (17, 31), (19, 44), (14, 47), (5, 45)], R=3, cracks=[[(10, 34), (12, 40)]])
m, i = rock([(2, 44), (17, 43), (20, 50), (16, 57), (4, 57), (1, 51)], R=3)
band(i, 45, 47)
for kx in (6, 10, 14):   # knuckles
    ridge(i, [(kx, 50), (kx, 53)], "o")
    cv.set(kx + 1, 49, "c")

# move down by 1 so the feet sit on the ground line
g = [row[:] for row in cv.g]
for y in range(64):
    for x in range(64):
        sy = y - 1
        cv.g[y][x] = g[sy][x] if 0 <= sy < 64 else "."
outline_outer(cv, "4")
save(cv, OUT)
