"""Helpers for the night creatures' Final-Fantasy-style pass (used by winged_fox_ff1.py, cat_ff1.py,
moon_wolf_ff1.py). Builds on draw2.py; nothing here changes the shared kit."""
from draw2 import paint_form, line, stamp  # noqa: F401

N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def union(*masks):
    s = set()
    for m in masks:
        s |= m
    return s


def core(mask):
    """Pixels whose four neighbours are all in the mask (the inside, without the edge ring)."""
    return {(x, y) for x, y in mask if all((x + a, y + b) in mask for a, b in N4)}


def edge(mask):
    return mask - core(mask)


def form(cv, mask, ramp, cuts, R=5.0, line_c="4", tilt=0.2, sel=None):
    """paint_form with a part line colour (coloured inner lines; outline_outer darkens the silhouette)."""
    if not mask:
        return
    paint_form(cv, mask, ramp, cuts, R=R, outline=line_c, tilt=tilt, sel=sel)


def rim(cv, mask, colour, only=None, depth=1, dirs=((1, 0), (0, 1))):
    """Rim light: a bright line just inside the part's edge on the shadow side (bottom/right),
    as if lit from behind by moonlight or neon."""
    e = edge(mask)
    ring = set(e)
    out = set()
    for _ in range(depth):
        nxt = set()
        for x, y in core(mask) - ring:
            for dx, dy in dirs:
                q = (x + dx, y + dy)
                if q in ring and any((q[0] + a, q[1] + b) not in mask for a, b in dirs):
                    nxt.add((x, y))
                    break
        out |= nxt
        ring |= nxt
    for p in out:
        if only is None or p in only:
            cv.set(*p, colour)
    return out


def strands(cv, lines, colour, only=None):
    """Fur strand / feather-edge lines: each a short polyline [(x, y), ...]."""
    for pts in lines:
        line(cv, pts, colour, only, smooth=len(pts) > 2)


def put(cv, pts, colour):
    for p in pts:
        cv.set(*p, colour)


def rim_outer(cv, colour, on=None, dirs=((1, 0), (0, 1)), skip=()):
    """Rim light on the finished silhouette only: pixels just inside the dark outer outline on its
    bottom/right side. `on` = letters allowed to turn into rim (e.g. the fur ramp)."""
    hits = []
    for y in range(cv.h):
        for x in range(cv.w):
            c = cv.g[y][x]
            if c in (".", "4") or (on and c not in on) or (x, y) in skip:
                continue
            for dx, dy in dirs:
                qx, qy = x + dx, y + dy
                if cv.get(qx, qy) == "4" and any(cv.get(qx + a, qy + b) == "." for a, b in dirs):
                    hits.append((x, y))
                    break
    for p in hits:
        cv.set(*p, colour)
    return hits


def eye(cv, x0, y0, text, brow_dark, brow_light=None):
    """Stamp an eye (letters, '.' = leave) and set a brow ridge over it: a dark pixel right above
    each column's top eye pixel, and optionally a lit pixel above that."""
    rows = text.strip("\n").split("\n")
    top = {}
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row):
            if ch != ".":
                cv.set(x0 + dx, y0 + dy, ch)
                top.setdefault(x0 + dx, y0 + dy)
    for x, y in top.items():
        cv.set(x, y - 1, brow_dark)
        if brow_light:
            cv.set(x, y - 2, brow_light)


def glow_stripe(cv, pts, radii, allowed, edge="o", body="y", core_c="c"):
    """A tapered glowing swoosh along a curve: darker green edge, glowing body, bright core line
    through its middle; drawn only over pixels whose letter is in `allowed`."""
    from draw2 import stroke as _stroke, catmull
    outer = _stroke(pts, radii)
    inner = _stroke(pts, [max(r - 0.9, 0.3) for r in radii])
    ok = lambda p: cv.get(*p) in allowed  # noqa: E731
    paint = [(p, edge) for p in outer if ok(p)] + [(p, body) for p in inner if ok(p)]
    path = catmull(pts, closed=False, steps=24)
    n = len(path)
    mid = {(int(round(x)), int(round(y))) for i, (x, y) in enumerate(path) if 0.25 * n < i < 0.75 * n}
    paint += [(p, core_c) for p in mid if ok(p)]
    for p, c in paint:
        cv.set(*p, c)


def swoosh(cv, pts, radii, allowed, edge="o", body="y", core_c="c"):
    """A stylized crescent swoosh: glowing body thick in the middle, sharp points at both ends,
    dark edge on the shadow side (bottom/right) only, bright core along the middle."""
    from draw2 import stroke as _stroke, catmull
    m = {p for p in _stroke(pts, radii) if cv.get(*p) in allowed}
    paint = {p: body for p in m}
    for x, y in m:
        if (x + 1, y) not in m or (x, y + 1) not in m:
            if (x - 1, y) in m or (x, y - 1) in m:   # not a lone end pixel
                paint[(x, y)] = edge
    path = catmull(pts, closed=False, steps=24)
    n = len(path)
    for i, (x, y) in enumerate(path):
        p = (int(round(x)), int(round(y - 0.4)))
        if 0.22 * n < i < 0.78 * n and p in m:
            paint[p] = core_c
    for p, c in paint.items():
        cv.set(*p, c)
