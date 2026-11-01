"""Detail helpers for the electric creatures (Final Fantasy-style pass). Own file; draw2 stays untouched.

Ramps are lists of colour letters, light..dark. Helpers shift pixels along a ramp (darken/lighten),
cut grooves with a lit lip, add rim light on the shadow edge, feathers with shafts, sparks."""
import math
from draw2 import stroke, catmull, paint_form

N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def shift(cv, p, ramp, k):
    """Move pixel p k steps along the ramp (k>0 darker). Pixels not in the ramp are left alone."""
    c = cv.get(*p)
    if c in ramp:
        i = max(0, min(len(ramp) - 1, ramp.index(c) + k))
        cv.set(*p, ramp[i])


def path_pixels(points, smooth=True):
    pts = catmull(points, closed=False, steps=24) if smooth and len(points) > 2 else None
    if pts is None:
        pts = []
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
            pts += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n + 1)]
    out = []
    for x, y in pts:
        p = (int(round(x)), int(round(y)))
        if not out or out[-1] != p:
            out.append(p)
    return out


def groove(cv, points, ramp, only, depth=1, lip=(0, -1), smooth=True):
    """A cut line: pixels along the path darken; the pixel on the lit side (lip) brightens."""
    pix = path_pixels(points, smooth)
    ps = set(pix)
    for p in pix:
        if p in only:
            shift(cv, p, ramp, depth)
    for x, y in pix:
        q = (x + lip[0], y + lip[1])
        if q in only and q not in ps:
            shift(cv, q, ramp, -1)


def inner_of(cv, mask, out=("4",)):
    return {p for p in mask if cv.get(*p) not in out}


def rim(cv, mask, colour, replace, dirs=((1, 0), (0, 1), (1, 1))):
    """Edge light on the shadow side: interior pixels whose lower/right neighbour leaves the mask."""
    edge = {p for p in mask if any((p[0] + dx, p[1] + dy) not in mask for dx, dy in N4)}
    inner = mask - edge
    for (x, y) in inner:
        if cv.get(x, y) in replace and any((x + dx, y + dy) in edge for dx, dy in dirs) and \
                not any((x + dx, y + dy) in edge for dx, dy in ((-1, 0), (0, -1))):
            cv.set(x, y, colour)


def feather(cv, base, tip, width, ramp, cuts, outline, shaft=None, bend=0.0, R=2.5):
    """A long feather: tapered vane with a shaft line from base to near the tip."""
    mx, my = (base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2
    L = math.hypot(tip[0] - base[0], tip[1] - base[1]) or 1
    nx, ny = -(tip[1] - base[1]) / L, (tip[0] - base[0]) / L
    mid = (mx + nx * bend, my + ny * bend)
    m = stroke([base, mid, tip], [width, width * 0.85, 0.7])
    paint_form(cv, m, ramp, cuts, R=R, outline=outline)
    if shaft:
        inner = {p for p in m if cv.get(*p) != outline}
        for p in path_pixels([base, mid, (base[0] + (tip[0] - base[0]) * 0.85, base[1] + (tip[1] - base[1]) * 0.85)]):
            if p in inner:
                cv.set(*p, shaft)
    return m


def bolt(cv, points, colour, core=None):
    """A crackling zigzag spark through the points (straight segments)."""
    pix = path_pixels(points, smooth=False)
    for p in pix:
        cv.set(*p, colour)
    if core:
        for p in pix[1:-1:2]:
            cv.set(*p, core)
