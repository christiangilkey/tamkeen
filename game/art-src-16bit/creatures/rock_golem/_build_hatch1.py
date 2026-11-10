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

# ---- Crystal golem HATCHLING (baby of rock_golem _ff1): ~2/3 the height, big crystal helmet (about
# 45% of the height) with bigger glowing yellow eyes, a small dark rock body with a few small pointed
# shards (two on the near shoulder, one far, one on the chest, one forearm), stubby legs and fists
# with riveted bands. Same palette and rendering. ----
OUT = sys.argv[1] if len(sys.argv) > 1 else "rock_golem_hatch1.txt"
CORE = ("e", "y", "d", "o")
CORE_CUTS = (0.78, 0.5, 0.24)


def core(pts, R=3, lit_plane=None, cracks=(), glow=(), pit=()):
    m = poly(pts)
    i = form(m, CORE, CORE_CUTS, R=R, tilt=0.3)
    if lit_plane:
        plane(i, lit_plane, "e")
    for c in cracks:
        crack(i, c, "o", "e")
    for c in glow:
        crack(i, c, "o", None, glow="g")
    pits(i, pit, "o", "e")
    rimlight(i, "3", ("o",), m)
    return m, i


def metal(m_inner, pts):
    """Grey metal band with rivets."""
    band = poly(pts) & m_inner
    for p in band:
        cv.set(*p, "c")
    ys = sorted({y for _, y in band})
    if ys:
        for x, y in band:
            if y == ys[-1]:
                cv.set(x, y, "y")
            if y == ys[0]:
                cv.set(x, y, "W" if x % 4 == 0 else "c")
        mid = ys[len(ys) // 2]
        for x, y in band:
            if y == mid and x % 4 == 2:
                cv.set(x, y, "o")


def shard(base, tip, w):
    return prism(base, tip, w, "1", "2", "3", "h")



# far side (right, behind): far leg, far arm and fist, far shoulder shard
core([(36, 53), (42, 53), (43, 58), (36, 58)], R=2)
m, i = core([(35, 57), (43, 56.5), (45, 60), (43, 62.5), (35, 62.5)], R=2)
metal(i, [(35, 58), (44, 58), (44, 59), (35, 59)])
core([(44, 43), (49, 44), (50, 52), (46, 54), (44, 49)], R=2, glow=[[(47, 46), (47, 50)]])
m, i = core([(43, 51.5), (50, 51.5), (51.5, 56), (48, 59), (43, 57.5)], R=2)
metal(i, [(43, 53), (51, 53), (51, 54), (43, 54)])
shard((45, 43), (51, 29), 2.3)
core([(41, 37), (49, 37), (50, 44), (44, 46), (40, 43)], R=2, lit_plane=[(41.5, 37.5), (48, 37.5), (44, 40)])

# body: small dark rock torso with a lit plane, a glowing seam and one chest shard
tm, ti = core([(20, 41), (43, 40), (46, 50), (40, 56), (24, 56), (19, 50)], R=4,
              lit_plane=[(21, 41.5), (31, 41), (28, 46), (21, 47)],
              glow=[[(39, 43), (41, 47), (40, 52)]], pit=[(25, 50), (35, 53)])
shard((29, 52), (36, 42), 3.0)
shard((34, 53), (42, 48), 1.9)

# near leg (left, lower)
core([(23, 54), (32, 54), (33, 59), (24, 59)], R=2)
m, i = core([(20, 58), (34, 58), (36.5, 61), (35, 63.5), (20, 63.5)], R=2)
metal(i, [(20, 59), (36, 59), (36, 60), (20, 60)])

# head: big crystal helmet, lit top, dark face with a brow, bigger narrow-glowing eyes
hm, hi = solid([(29, 31), (37, 26.5), (45, 28), (49, 34), (48.5, 40), (45, 43), (32, 43), (29, 38)], "2")
plane(hi, [(29, 31), (37, 26.5), (45, 28), (40, 31.5), (31, 33)], "1")
plane(hi, [(45, 28.5), (49, 34), (48.5, 40), (46, 42), (45.5, 33)], "3")
ridge(hi, [(31, 33), (40, 31.5), (45, 28.5)], "h")
cv.set(34, 29, "W")
cv.set(35, 29, "W")
plane(hi, [(31.5, 34.5), (46, 34), (46.5, 39), (44, 42), (32.5, 42)], "o")
ridge(hi, [(31, 34), (38, 35.5), (46, 34)], "4")
stamp(cv, 33, 36, """
aaaaW
.Kaaa
..dd.
""")
stamp(cv, 43, 36, """
aW
aa
d.
""")
ridge(hi, [(37, 40.5), (41, 40.5)], "d")
cv.set(38, 41, "e")

# near shoulder: rock with two small shards pointing up and out; short arm, fist with a band
shard((18, 43), (13, 28), 2.8)
shard((22, 42), (25, 30), 2.2)
core([(14, 39), (21, 37), (27, 40), (26, 47), (19, 49), (14, 46)], R=3,
     lit_plane=[(14.5, 39.5), (21, 37.8), (24, 39), (17, 42)], glow=[[(19, 42), (20, 46)]])
core([(15, 45), (22, 44.5), (23, 50), (16, 51)], R=2)
shard((17, 47), (10, 52), 1.9)
m, i = core([(12, 49), (23, 48.5), (24.5, 53), (21, 57), (12, 56.5), (11, 53)], R=2)
metal(i, [(12, 50), (24, 50), (24, 51), (12, 51)])
cv.set(17, 55, "r")
for kx in (15, 19):
    ridge(i, [(kx, 52), (kx, 55)], "o")
outline_outer(cv, "4")
# stand on the bottom row of the canvas
low = max(y for y in range(64) for x in range(64) if cv.g[y][x] != ".")
g = [row[:] for row in cv.g]
for y in range(64):
    for x in range(64):
        sy = y - (63 - low)
        cv.g[y][x] = g[sy][x] if 0 <= sy < 64 else "."
save(cv, OUT)
