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

# ---- Rock golem, FF style (pick 103): v3's pose and pointed green crystal shards, on a dark rock
# core that now has real planes, cracks glowing green from inside, pits and a green rim light.
# Drawn in v3's 56-wide layout, then moved right by 4 onto the 64x64 canvas. ----
OUT = sys.argv[1] if len(sys.argv) > 1 else "rock_golem_ff1.txt"
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


# ---- far side (right, higher, partly hidden)
m, i = core([(33, 44), (40, 44), (41, 52), (34, 52)])
shard((37, 46), (43, 54), 2.2)
m, i = core([(33, 52), (41, 51.5), (43, 55), (41, 57), (33, 57)], R=2)
metal(i, [(33, 53), (42, 53), (42, 56), (33, 56)])
shard((46, 36), (53, 47), 2.8)
shard((45, 40), (49, 51), 2.1)
core([(42, 27), (48, 28), (49, 42), (44, 44), (42, 36)], glow=[[(45, 31), (46, 36)]])
m, i = core([(43, 43), (50, 43), (51, 49), (46, 51), (42, 48)], R=2)
metal(i, [(42, 44), (51, 44), (51, 47), (42, 47)])
shard((43, 22), (48, 9), 3.2)
shard((45, 24), (53, 16), 2.5)
core([(38, 19), (46, 18), (48, 26), (42, 29), (37, 26)], lit_plane=[(38, 19.5), (45, 18.5), (41, 22)])

# ---- torso: rock core with planes, a glowing fissure, and the chest crystal cluster
tm, ti = core([(17, 24), (41, 22), (44, 38), (37, 47), (21, 47), (16, 37)], R=5,
              lit_plane=[(18, 25), (30, 23.5), (27, 30), (18, 32)],
              cracks=[[(19, 33), (23, 36), (22, 41)]],
              glow=[[(36, 27), (39, 32), (38, 37), (40, 42)], [(26, 43), (31, 45)]],
              pit=[(33, 25), (20, 40), (35, 44)])
shard((25, 40), (33, 26), 4.2)
shard((30, 41), (41, 33), 3.2)
shard((22, 42), (21, 33), 2.5)
core([(19, 40), (33, 39.5), (34, 46), (21, 47)], cracks=[[(24, 42), (27, 45)]])
shard((34, 44), (44, 42), 2.2)

# ---- head: low and to the right; crystal helmet, a scowling brow, narrow glowing yellow eyes
hm, hi = solid([(28, 14), (36, 10), (43, 13), (46, 19), (43, 25), (31, 25), (28, 20)], "2")
plane(hi, [(28, 14), (36, 10), (43, 13), (38, 16), (30, 17)], "1")
plane(hi, [(43, 13), (46, 19), (43, 25), (42, 18)], "3")
ridge(hi, [(30, 17), (38, 16), (43, 13)], "h")
cv.set(33, 13, "W")
plane(hi, [(31, 18.5), (44, 18.5), (44.5, 22.5), (42, 25), (32, 25)], "o")      # dark face
ridge(hi, [(31, 18), (37, 19.5), (44, 18)], "4")                                  # brow dips to the centre
stamp(cv, 32, 20, """
aaaW.
.Kaa.
""")
stamp(cv, 41, 20, """
Wa
aK
""")
ridge(hi, [(35, 23), (40, 23)], "d")
for x in (36, 38):
    cv.set(x, 24, "e")   # stone teeth

# ---- near leg (left, lower, bigger)
core([(19, 44), (28, 44), (29, 53), (21, 53)], cracks=[[(22, 46), (24, 50)]])
shard((22, 46), (16, 53), 2.5)
m, i = core([(16, 53), (30, 53), (33, 57), (31, 60), (15, 60)], R=2)
metal(i, [(15, 54), (31, 54), (31, 57), (15, 57)])

# ---- near shoulder (left): three big shards up and out, buried in a cracked rock shoulder
shard((14, 24), (8, 4), 4.5)
shard((19, 22), (22, 7), 3.5)
shard((10, 27), (0, 16), 3.2)
core([(5, 22), (16, 18), (26, 21), (27, 29), (18, 33), (6, 31)], R=4,
     lit_plane=[(6, 22.5), (16, 19), (20, 20), (12, 25)],
     glow=[[(15, 25), (18, 28), (17, 31)]], pit=[(23, 24), (9, 28)])
# near arm: rock arm with a glowing seam, forearm shards down and out, banded fist
core([(5, 30), (15, 29), (17, 45), (12, 48), (4, 46)], R=3,
     lit_plane=[(5.5, 30.5), (12, 30), (8, 35)], glow=[[(10, 36), (12, 41)]])
shard((9, 37), (0, 48), 3.2)
shard((13, 41), (9, 53), 2.5)
m, i = core([(4, 46), (15, 46), (16, 52), (12, 55), (4, 53)], R=2)
metal(i, [(3, 47), (16, 47), (16, 50), (3, 50)])
for x, y in ((47, 47), (48, 47), (10, 51), (11, 51)):
    cv.set(x, y, "r")  # rust

# move the whole drawing right by 4 and down by 2 onto the 64x64 canvas
g = [row[:] for row in cv.g]
for y in range(64):
    for x in range(64):
        sx, sy = x - 4, y - 2
        cv.g[y][x] = g[sy][sx] if 0 <= sx < 64 and 0 <= sy < 64 else "."
outline_outer(cv, "4")
save(cv, OUT)
