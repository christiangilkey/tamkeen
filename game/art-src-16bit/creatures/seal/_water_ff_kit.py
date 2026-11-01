"""Helpers for the water creatures' Final Fantasy style pass (my own file; shared kits untouched):
rim light on the shadow edge, speculars, fin rays, coloured inner lines."""
import math

from draw2 import Canvas, shape, stroke, poly, paint_form, outline_outer, stamp, save, line, catmull, dist_out  # noqa: F401

NL = chr(10)


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def st(cv, x, y, rows):
    """Stamp hand-drawn rows ('.' = leave)."""
    stamp(cv, x, y, NL.join(rows))


def edge(mask):
    return {p for p in mask if any((p[0] + dx, p[1] + dy) not in mask for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}


def rim(cv, mask, colour, dirs=((1, 0), (0, 1), (1, 1)), keep=("4", "K", "W")):
    """Rim light: the pixel just inside the shadow-side (bottom/right) edge of a form."""
    e = edge(mask)
    pts = []
    for p in mask - e:
        for dx, dy in dirs:
            q = (p[0] + dx, p[1] + dy)
            if q in e and (q[0] + dx, q[1] + dy) not in mask:
                pts.append(p)
                break
    for p in pts:
        if cv.get(*p) not in keep:
            cv.set(int(round(p[0])), int(round(p[1])), colour)


def inner_line(cv, front, colour):
    """Coloured line on the front shape's edge where it lies over something drawn before."""
    for x, y in front:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in front and cv.get(*q) != ".":
                cv.set(x, y, colour)
                break


def rays(cv, pairs, colour, clip):
    """Fin rays: straight 1-pixel lines from base to tip, only inside clip."""
    for a, b in pairs:
        line(cv, [a, b], colour, clip, smooth=False)


def dots(cv, pts, colour, clip=None):
    for p in pts:
        if clip is None or p in clip:
            cv.set(int(round(p[0])), int(round(p[1])), colour)


def frond(rachis, rad, n=6, flen=3.5, frad=(1.1, 0.6), back=0.6):
    """A gill frond / ribbed feather: a stem plus pairs of filaments sweeping back along it.
    Returns (stem mask, filament masks list)."""
    stem = stroke(rachis, rad)
    path = catmull(rachis, closed=False, steps=12)
    fils = []
    for i in range(1, n + 1):
        t = i / (n + 1)
        k = int(t * (len(path) - 1))
        (x0, y0), (x1, y1) = path[k], path[min(k + 1, len(path) - 1)]
        L = math.hypot(x1 - x0, y1 - y0) or 1
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        ln = flen * (1.0 - 0.45 * t)
        for side in (1, -1):
            nx, ny = -uy * side, ux * side
            ex, ey = x0 + (nx + ux * back) * ln, y0 + (ny + uy * back) * ln
            fils.append(stroke([(x0, y0), (ex, ey)], list(frad)))
    return stem, fils


def paint_vol(cv, mask, ramp, cuts, center, radii, R=4.0, w=0.6, outline=None, tilt=0.0, clip=None):
    """Volume shading: blend the form's own edge-roll light (draw2) with an ellipsoid's light, so big
    forms get a real gradient top-left to bottom-right instead of a flat middle."""
    from draw2 import light_map, LIGHT
    lm = light_map(mask, R, LIGHT, tilt)
    L = math.sqrt(sum(c * c for c in LIGHT))
    lx, ly, lz = (c / L for c in LIGHT)
    cx, cy = center
    rx, ry = radii
    for (x, y), v in lm.items():
        if clip is not None and (x, y) not in clip:
            continue
        if outline and any((x + dx, y + dy) not in mask for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            cv.set(x, y, outline)
            continue
        u, vv = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
        rr = u * u + vv * vv
        nz = math.sqrt(max(0.02, 1 - rr)) if rr < 1 else 0.15
        n = math.sqrt(u * u + vv * vv + nz * nz)
        ie = (u * lx + vv * ly + nz * lz) / n
        i = w * ie + (1 - w) * v
        k = 0
        while k < len(cuts) and i < cuts[k]:
            k += 1
        cv.set(x, y, ramp[k])
