"""Detail kit for the Final Fantasy style pass (fire helper's own file): many-tone form shading with
coloured inner lines, a rim light on the shadow side, scale/feather textures, layered feathers with
shafts, real flame shapes, glints."""
import math

from draw2 import Canvas, shape, stroke, poly, light_map, dist_out, stamp, save, line, catmull  # noqa: F401

N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def disc(cx, cy, r):
    return {(x, y) for y in range(int(cy - r) - 1, int(cy + r) + 2) for x in range(int(cx - r) - 1, int(cx + r) + 2)
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r}


def is_edge(mask, x, y):
    return any((x + dx, y + dy) not in mask for dx, dy in N4)


def form(cv, mask, ramp, cuts=None, R=5.0, tilt=0.2, outline="4", line_in=None, rim=None, tex=None,
         light=(-0.55, -0.75, 0.75), keep=None):
    """Shade `mask` with `ramp` (bright..dark). Edge pixels: `outline` where they face empty space,
    `line_in` (a coloured line) where they lie over something already drawn. `rim`: colour of a
    1-px edge light on the bottom-right (shadow) side. `tex(p, k)` may return a new ramp index.
    Returns {pixel: ramp index} for later detail passes."""
    n = len(ramp)
    if cuts is None:
        cuts = [0.95, 0.82, 0.66, 0.48, 0.3, 0.12][:n - 1]
    lm = light_map(mask, R, light, tilt)
    idx = {}
    before = {p: cv.get(*p) for p in mask}
    for p, v in lm.items():
        if keep is not None and p not in keep:
            continue
        x, y = p
        if is_edge(mask, x, y) and outline:
            open_px = [(x + dx, y + dy) for dx, dy in N4 if (x + dx, y + dy) not in mask]
            behind = all(cv.get(*q) != "." for q in open_px)
            cv.set(x, y, (line_in or outline) if behind else outline)
            continue
        k = 0
        while k < len(cuts) and v < cuts[k]:
            k += 1
        k = min(k, n - 1)
        if tex:
            k = max(0, min(n - 1, tex(p, k)))
        idx[p] = k
        cv.set(x, y, ramp[k])
    if rim:
        for (x, y), k in idx.items():
            for dx, dy in ((1, 0), (0, 1), (1, 1)):
                q = (x + dx, y + dy)
                if q in mask and q not in idx and (q[0] + dx, q[1] + dy) not in mask and cv.get(q[0] + dx, q[1] + dy) == ".":
                    if k >= n // 2:
                        cv.set(x, y, rim)
                    break
    return idx


def scales(cell=(4, 3), dark=1, light=1, offset=(0, 0)):
    """Texture: staggered small scales/feathers - a darker crescent along each scale's lower edge and
    a lighter fleck at its top left (only where the surface is lit)."""
    cw, ch = cell

    def tex(p, k):
        x, y = p[0] + offset[0], p[1] + offset[1]
        row = y // ch
        xx = (x + (cw // 2 if row % 2 else 0)) % cw
        yy = y % ch
        if yy == ch - 1 and xx not in (0,):
            return k + dark
        if yy == 0 and xx == 1 and k <= 2:
            return k - light
        return k
    return tex


def flame(cv, mask, ramp, outline=None, scale=1.0, line_in=None):
    """Flame fill: outline (or ramp[0]) on the edge, then hotter toward the core."""
    d = dist_out(mask)
    for p, v in d.items():
        if v <= 1.0 and outline:
            open_px = [(p[0] + dx, p[1] + dy) for dx, dy in N4 if (p[0] + dx, p[1] + dy) not in mask]
            behind = all(cv.get(*q) != "." for q in open_px)
            cv.set(*p, (line_in or outline) if behind else outline)
        else:
            i = int((v - (1.0 if outline else 0.0)) * scale)
            cv.set(*p, ramp[min(max(i, 0), len(ramp) - 1)])


def feather(cv, base, tip, width, ramp, line_in, shaft=None, bend=0.0, flame_tip=None, flame_from=0.6,
            outline="4", R=2.0):
    """One long feather from base to tip (lance shape), shaded, with a coloured edge where it lies over
    other feathers, a shaft line, and optionally a flame tip (ramp) from `flame_from` of its length."""
    (x0, y0), (x1, y1) = base, tip
    L = math.hypot(x1 - x0, y1 - y0) or 1
    nx, ny = -(y1 - y0) / L, (x1 - x0) / L
    mid = ((x0 + x1) / 2 + nx * bend, (y0 + y1) / 2 + ny * bend)
    pts = [base, mid, tip]
    m = stroke(pts, [width * 0.8, width, width * 0.55, 0.5])
    form(cv, m, ramp, R=R, outline=outline, line_in=line_in)
    if flame_tip:
        path = catmull(pts, closed=False, steps=20)
        cut = path[int(len(path) * flame_from)]
        fm = {p for p in m if (p[0] - x0) * (x1 - x0) + (p[1] - y0) * (y1 - y0) >= (cut[0] - x0) * (x1 - x0) + (cut[1] - y0) * (y1 - y0)}
        flame(cv, fm, flame_tip, outline=None)
    if shaft:
        path = catmull(pts, closed=False, steps=30)
        line(cv, [path[1], path[len(path) // 2], path[int(len(path) * 0.8)]], shaft, {p for p in m if not is_edge(m, *p)})
    return m


def outline_outer(cv, colour="4", keep=("4", "K")):
    for y in range(cv.h):
        for x in range(cv.w):
            if cv.g[y][x] not in (".",) + tuple(keep) and any(
                    cv.get(x + dx, y + dy) == "." for dx, dy in N4):
                cv.g[y][x] = colour


def px(cv, pts, c):
    for p in pts:
        cv.set(*p, c)


def scallops(cell=(5, 4), offset=(0, 0), lit_max=2):
    """Texture: overlapping rounded feathers - a U-shaped darker edge per feather, staggered rows,
    with a light fleck near the top of lit feathers."""
    cw, ch = cell
    U = {(1, ch - 1), (2, ch - 1), (3, ch - 1), (0, ch - 2), (4, ch - 2)} if cw >= 5 else {(1, ch - 1), (2, ch - 1), (0, ch - 2), (3, ch - 2)}

    def tex(p, k):
        x, y = p[0] + offset[0], p[1] + offset[1]
        row = y // ch
        xx = (x + (cw // 2 if row % 2 else 0)) % cw
        yy = y % ch
        if (xx, yy) in U:
            return k + 1
        if (xx, yy) == (2, 1) and k <= lit_max:
            return k - 1
        return k
    return tex
