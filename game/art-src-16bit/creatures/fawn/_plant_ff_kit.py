"""Detail kit for the Final Fantasy style plant creatures (fawn, bunny, forest deer).
Builds on draw2 (import only). Adds: 6-tone form shading with a rim light on the shadow edge,
fur strand texture that follows a flow direction, pointed fur tufts on silhouettes, leaf veins."""
import math
from draw2 import Canvas, shape, stroke, poly, light_map, dist_out, outline_outer, stamp, save, line  # noqa: F401

LX, LY = -0.59, -0.81  # light direction on the picture plane (top left)


def inner(cv, mask, outline="4"):
    return {p for p in mask if cv.get(*p) != outline}


def form(cv, mask, ramp, cuts, R=5.0, tilt=0.2, outline="4", rim=None, rim_w=1, sel=None, clip=None):
    """Shade a form with a long ramp (bright..dark), dark outline on its edge, and an optional rim
    light: a 1-2 px band just inside the outline on the side facing away from the light."""
    lm = light_map(mask, R, tilt=tilt)
    d = dist_out(mask)
    for (x, y), v in lm.items():
        if clip is not None and (x, y) not in clip:
            continue
        edge = d[(x, y)] <= 1.0
        if edge and outline:
            c = outline
            if sel:
                open_dirs = [(dx, dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if (x + dx, y + dy) not in mask]
                if all(dx + dy < 0 for dx, dy in open_dirs):
                    c = sel
            cv.set(x, y, c)
            continue
        k = 0
        while k < len(cuts) and v < cuts[k]:
            k += 1
        cv.set(x, y, ramp[k])
    if rim:
        for (x, y), dv in d.items():
            if clip is not None and (x, y) not in clip:
                continue
            if 1.0 < dv <= 1.0 + rim_w:
                # outward direction = toward the nearest outside: sample neighbours
                ox = sum(dx for dx in (-2, -1, 1, 2) if (x + dx, y) not in mask)
                oy = sum(dy for dy in (-2, -1, 1, 2) if (x, y + dy) not in mask)
                n = math.hypot(ox, oy)
                if n and (ox * LX + oy * LY) / n < -0.45:
                    cv.set(x, y, rim)


def strands(cv, mask, flow, colour, on, step=(4, 3), length=2, offset=0):
    """Fur strand texture: short lines along `flow` (dx, dy) placed on a staggered grid, only where
    the current colour is in `on` (e.g. the mid and shade tones) so the texture follows the form."""
    fx, fy = flow
    n = math.hypot(fx, fy)
    fx, fy = fx / n, fy / n
    xs = [p[0] for p in mask]
    ys = [p[1] for p in mask]
    sx, sy = step
    for row, y in enumerate(range(min(ys), max(ys) + 1, sy)):
        for x in range(min(xs) + ((row * sx) // 2 + offset) % sx, max(xs) + 1, sx):
            pts = [(int(round(x + fx * t)), int(round(y + fy * t))) for t in range(length + 1)]
            if all(p in mask and cv.get(*p) in on for p in pts):
                for p in pts:
                    cv.set(*p, colour)


def tufts(base, pts, size=2.2, length=3.5):
    """Pointed fur tufts on a silhouette: small tapered spikes at points (x, y, dx, dy)."""
    out = set(base)
    for x, y, dx, dy in pts:
        n = math.hypot(dx, dy)
        tx, ty = x + dx / n * length, y + dy / n * length
        out |= stroke([(x, y), (tx, ty)], [size, 0.4])
    return out


def leaf_shape(stem, tip, width, bend=0.0):
    """A leaf: pointed tip, widest a third of the way, slight bend."""
    (x0, y0), (x1, y1) = stem, tip
    L = math.hypot(x1 - x0, y1 - y0)
    nx, ny = -(y1 - y0) / L, (x1 - x0) / L
    mid1 = (x0 + (x1 - x0) * 0.35 + nx * bend, y0 + (y1 - y0) * 0.35 + ny * bend)
    mid2 = (x0 + (x1 - x0) * 0.7 + nx * bend * 0.8, y0 + (y1 - y0) * 0.7 + ny * bend * 0.8)
    return stroke([stem, mid1, mid2, tip], [width * 0.45, width, width * 0.7, 0.4]), [stem, mid1, mid2, tip]


def veins(cv, spine, mask, colour, side_colour=None, every=3, vlen=2.5, back=1.0):
    """Leaf midrib plus side veins angled toward the tip."""
    line(cv, spine, colour, mask)
    from draw2 import catmull
    path = catmull(spine, closed=False, steps=10)
    for i in range(every, len(path) - every, every * 2):
        x, y = path[i]
        x2, y2 = path[min(i + 1, len(path) - 1)]
        dx, dy = x2 - x, y2 - y
        n = math.hypot(dx, dy) or 1
        dx, dy = dx / n, dy / n
        for s in (-1, 1):
            vx, vy = -dy * s, dx * s
            line(cv, [(x, y), (x + vx * vlen + dx * back * vlen, y + vy * vlen + dy * back * vlen)],
                 side_colour or colour, mask, smooth=False)


def outline_all(cv, colour="4", keep=("4", "K")):
    outline_outer(cv, colour, keep)
