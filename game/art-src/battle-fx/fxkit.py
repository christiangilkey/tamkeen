"""Drawing kit for the live-battle effects.

Effects are drawn as shapes made of "heat" fields (a value per pixel, highest in the middle of a shape),
cut into bands of an element's colour ramp (dark edge -> bright core), plus hand-made stamps (sparkles,
droplets, leaves, shards) for the small details. Every frame is an Img: an RGBA numpy array.
"""
from __future__ import annotations

import math
import random

import numpy as np

# Colour ramps, darkest (the edge colour) first, brightest last. Hue shifts toward warm in the lights
# and cool in the darks, as in the creatures' shading.
RAMP = {
    "ember": ["#2c0608", "#6e1208", "#b2240c", "#e2501a", "#ff8a24", "#ffc43c", "#fff1a0", "#ffffff"],
    "tide": ["#081438", "#0f2f78", "#1656b0", "#228ed8", "#44beec", "#92e4ff", "#e4fbff", "#ffffff"],
    "grove": ["#0b1d0c", "#173c14", "#286a1c", "#44962a", "#72c234", "#b0e45a", "#e6ffb0", "#ffffff"],
    "spark": ["#261402", "#6c4602", "#c08e04", "#f2c81c", "#fff04c", "#fffcae", "#ffffff", "#ffffff"],
    "stone": ["#1a1008", "#3c2a1a", "#62462c", "#8a6844", "#b08e66", "#d4bc94", "#f0e4c8", "#ffffff"],
    "dusk": ["#0b0416", "#25083e", "#43136c", "#6a24a2", "#9848d2", "#c27cf2", "#eccaff", "#ffffff"],
}
# Second colours per element (accents).
ACC = {
    "spark": ["#082a48", "#1288c8", "#46d8ff", "#c8f8ff"],  # cyan arcs
    "stone": ["#3a342e", "#6a6058", "#9a9084", "#c8c0b2", "#ece6da"],  # grey dust
    "grove": ["#2e1a0a", "#5a3416", "#86552a", "#b07c44", "#d6a868"],  # bark / vine wood
    "dusk": ["#5a0a4a", "#b0208e", "#ff52cc", "#ffb4ee"],  # magenta glints
    "tide": ["#0a2a3a", "#1e6e86", "#4ab6c4", "#a8eef0"],  # teal foam
    "ember": ["#1c1418", "#3a2c30", "#5a4848", "#7e6a66", "#a8948c"],  # smoke
}


def hexrgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Img:
    def __init__(self, w: int, h: int | None = None):
        self.w, self.h = w, (h or w)
        self.a = np.zeros((self.h, self.w, 4), np.uint8)

    def px(self, x, y, c):
        x, y = int(math.floor(x)), int(math.floor(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x, :3] = hexrgb(c) if isinstance(c, str) else c
            self.a[y, x, 3] = 255

    def has(self, x, y) -> bool:
        x, y = int(math.floor(x)), int(math.floor(y))
        return 0 <= x < self.w and 0 <= y < self.h and self.a[y, x, 3] > 0

    def paint(self, mask, c):
        self.a[mask, :3] = hexrgb(c) if isinstance(c, str) else c
        self.a[mask, 3] = 255

    def over(self, o: "Img", dx: int = 0, dy: int = 0):
        for y in range(o.h):
            for x in range(o.w):
                if o.a[y, x, 3]:
                    X, Y = x + dx, y + dy
                    if 0 <= X < self.w and 0 <= Y < self.h:
                        self.a[Y, X] = o.a[y, x]
        return self

    def mask(self):
        return self.a[:, :, 3] > 0

    def erase(self, mask):
        self.a[mask] = 0

    def flipx(self) -> "Img":
        o = Img(self.w, self.h)
        o.a = self.a[:, ::-1].copy()
        return o


# ---------- fields ----------

def XY(w, h=None):
    h = h or w
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    return xs + 0.5, ys + 0.5


def ell(X, Y, cx, cy, rx, ry=None):
    ry = ry or rx
    d = np.sqrt(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2)
    return np.clip(1 - d, 0, 1)


def ring(X, Y, cx, cy, rx, ry, width):
    """A band around an ellipse; 1 on the ellipse line, 0 at +-width."""
    d = np.sqrt(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2)
    return np.clip(1 - np.abs(d - 1) * min(rx, ry) / width, 0, 1)


def bez(pts, n=24):
    """Points along a quadratic (3 points) or cubic (4 points) Bezier curve."""
    out = []
    if len(pts) > 4:  # a polyline: points spaced evenly along it
        seg = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)]
        total = sum(seg) or 1
        for i in range(n + 1):
            d = total * i / n
            j = 0
            while j < len(seg) - 1 and d > seg[j]:
                d -= seg[j]
                j += 1
            t = min(1.0, d / seg[j]) if seg[j] else 0
            out.append((pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t))
        return out
    for i in range(n + 1):
        t = i / n
        if len(pts) == 2:
            (a, b) = pts
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        elif len(pts) == 3:
            a, b, c = pts
            u = 1 - t
            out.append((u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]))
        else:
            a, b, c, d = pts
            u = 1 - t
            out.append((u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
                        u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1]))
    return out


def tongue(X, Y, pts, w0, w1=0.35, h0=1.0, h1=0.3, n=24, power=0.85):
    """A tapered stroke along a curve: wide and hot at pts[0], thin and cool at the tip."""
    f = np.zeros_like(X)
    path = bez(pts, n)
    for i, (px, py) in enumerate(path):
        t = i / n
        r = w0 * (1 - t) ** power + w1 * t
        if r <= 0.05:
            continue
        heat = h0 + (h1 - h0) * t
        d = np.hypot(X - px, Y - py)
        f = np.maximum(f, np.clip(1 - d / r, 0, 1) * heat)
    return f


def dil(m):
    o = m.copy()
    o[1:] |= m[:-1]
    o[:-1] |= m[1:]
    o[:, 1:] |= m[:, :-1]
    o[:, :-1] |= m[:, 1:]
    return o


def dil8(m):
    o = dil(m)
    o[1:, 1:] |= m[:-1, :-1]
    o[1:, :-1] |= m[:-1, 1:]
    o[:-1, 1:] |= m[1:, :-1]
    o[:-1, :-1] |= m[1:, 1:]
    return o


def ero(m):
    return ~dil(~m)


def bands(f, ramp, cuts, edge=None, img=None, inner=False):
    """Cut a field into colour bands. cuts: [(threshold, ramp index), ...] ascending.
    edge: ramp index (or colour) for a 1-pixel outline outside the shape (inside if inner=True)."""
    h, w = f.shape
    img = img or Img(w, h)
    base = f > cuts[0][0]
    for thr, ci in cuts:
        img.paint(f > thr, ramp[ci] if isinstance(ci, int) else ci)
    if edge is not None:
        col = ramp[edge] if isinstance(edge, int) else edge
        e = (base & ~ero(base)) if inner else (dil(base) & ~base)
        img.paint(e, col)
    return img


def clean(img: Img, keep_alone=()):
    """Drop single pixels with no 4-neighbours unless their colour is in keep_alone (sparks stay)."""
    m = img.mask()
    n = np.zeros_like(m, dtype=int)
    n[1:] += m[:-1]
    n[:-1] += m[1:]
    n[:, 1:] += m[:, :-1]
    n[:, :-1] += m[:, 1:]
    keep = {hexrgb(c) for c in keep_alone}
    for y, x in zip(*np.where(m & (n == 0))):
        if tuple(img.a[y, x, :3]) not in keep:
            img.a[y, x] = 0
    return img


def thin_alpha(img: Img, keep: float, seed: int, protect=()):
    """Remove a share of pixels in an ordered (Bayer) pattern, to dissolve an effect as it fades."""
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
    h, w = img.h, img.w
    rng = random.Random(seed)
    ox, oy = rng.randrange(4), rng.randrange(4)
    pat = np.tile(np.roll(np.roll(bayer, oy, 0), ox, 1), (h // 4 + 1, w // 4 + 1))[:h, :w]
    m = img.mask() & (pat >= keep)
    prot = {hexrgb(c) for c in protect}
    for y, x in zip(*np.where(m)):
        if tuple(img.a[y, x, :3]) not in prot:
            img.a[y, x] = 0
    return img


# ---------- stamps (small hand-drawn shapes) ----------

def stamp(img: Img, x, y, rows, cmap, anchor="c"):
    """rows: strings; each letter maps through cmap to a colour; '.' leaves the pixel."""
    h, w = len(rows), len(rows[0])
    ox = int(math.floor(x)) - (w // 2 if anchor == "c" else 0)
    oy = int(math.floor(y)) - (h // 2 if anchor == "c" else 0)
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != "." and ch in cmap and cmap[ch]:
                img.px(ox + i, oy + j, cmap[ch])
    return img


STAR5 = ["..a..", "..b..", "abcba", "..b..", "..a.."]
STAR7 = ["...a...", "...b...", "...b...", "abbcbba", "...b...", "...b...", "...a..."]
PLUS3 = [".a.", "aca", ".a."]
DIAG5 = ["a...a", ".b.b.", "..c..", ".b.b.", "a...a"]
GLINT = ["...a...", "..aba..", ".abcba.", "...a...".replace("a", "b").replace("...b...", "..aba.."), ]


def sparkle(img, x, y, size, cols):
    """A 4-point sparkle: size 1 (pixel), 2 (plus), 3 (star5), 4 (star7). cols = (outer, mid, core)."""
    a, b, c = cols
    if size <= 1:
        img.px(x, y, c)
    elif size == 2:
        stamp(img, x, y, PLUS3, {"a": a, "c": c})
    elif size == 3:
        stamp(img, x, y, STAR5, {"a": a, "b": b, "c": c})
    else:
        stamp(img, x, y, STAR7, {"a": a, "b": b, "c": c})


def line(img, x0, y0, x1, y1, c):
    """Bresenham line."""
    x0, y0, x1, y1 = (int(math.floor(v)) for v in (x0, y0, x1, y1))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    pts = []
    while True:
        pts.append((x0, y0))
        img.px(x0, y0, c)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy
    return pts


def polymask(w, h, pts):
    """Pixels whose centres are inside the polygon."""
    X, Y = XY(w, h)
    m = np.zeros((h, w), bool)
    n = len(pts)
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
        cond = ((y0 <= Y) & (Y < y1)) | ((y1 <= Y) & (Y < y0))
        with np.errstate(divide="ignore", invalid="ignore"):
            xc = x0 + (Y - y0) * (x1 - x0) / (y1 - y0 if y1 != y0 else 1e-9)
        m ^= cond & (X < xc)
    return m


def facet_shard(img, pts, cols, light=(-1, -1)):
    """A faceted rock/crystal polygon: outline, a lit face and a shaded face split along its long axis.
    cols = (outline, dark, mid, light, highlight)."""
    w, h = img.w, img.h
    m = polymask(w, h, pts)
    if not m.any():
        return img
    ys, xs = np.where(m)
    cx, cy = xs.mean() + 0.5, ys.mean() + 0.5
    X, Y = XY(w, h)
    lx, ly = light
    side = (X - cx) * lx + (Y - cy) * ly  # >0 toward the light
    img.paint(m, cols[2])
    img.paint(m & (side > 0.6), cols[3])
    img.paint(m & (side < -0.9), cols[1])
    # highlight along the lit outer edge
    edge = m & ~ero(m)
    img.paint(edge & (side > 0.4), cols[4])
    img.paint(dil(m) & ~m, cols[0])
    return img


def rot(pts, ang, cx=0.0, cy=0.0):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in pts]


def tone(f, light=(-0.55, -0.83), flat=0.35):
    """Lighting for a field shape: 0 (turned away from a top-left light) .. 1 (facing it).
    Uses the slope of the field, so it works on any union of shapes."""
    gy, gx = np.gradient(f)
    mag = np.hypot(gx, gy) + 1e-6
    cos = -(gx * light[0] + gy * light[1]) / mag
    w = np.clip((1 - f) / (1 - flat), 0, 1)  # the middle of a shape is flatter
    return np.clip(0.5 + 0.5 * cos * w + 0.15 * (f - 0.5), 0, 1)


def glossy(img, f, ramp, cuts=((0.0, 1), (0.3, 2), (0.48, 3), (0.66, 4)), shine=(0.86, 6), edge=0, light=(-0.55, -0.83)):
    """A shiny, lit shape (water, crystal, orbs): bands by lighting, a specular glint, an outline."""
    t = tone(f, light)
    m = f > 0
    for thr, ci in cuts:
        img.paint(m & (t >= thr), ramp[ci] if isinstance(ci, int) else ci)
    if shine:
        thr, ci = shine
        img.paint(m & (t >= thr) & (f > 0.15) & (f < 0.75), ramp[ci] if isinstance(ci, int) else ci)
    if edge is not None:
        img.paint(dil(m) & ~m, ramp[edge] if isinstance(edge, int) else edge)
    return img


def wrap_crop(big: "Img", w: int) -> "Img":
    """Middle tile of a canvas drawn three tiles wide (seamless horizontal tiling)."""
    o = Img(w, big.h)
    o.a = big.a[:, w:2 * w].copy()
    return o


def cloud(img, blobs, cols, fade=0.0, edge=True):
    """Puffy clouds (dust, smoke, mist) lit from the top left. blobs = [(cx, cy, r)];
    cols = (outline, shadow, base, light, highlight). fade 0..1 shrinks them and drops the outline."""
    X, Y = XY(img.w, img.h)
    f = np.zeros_like(X)
    lit = np.zeros_like(X)
    dark = np.zeros_like(X)
    for cx, cy, r in blobs:
        r = r * (1 - 0.35 * fade)
        if r < 0.6:
            continue
        f = np.maximum(f, ell(X, Y, cx, cy, r, r * 0.85))
        for a in (0.4, 2.0, 3.6, 5.0):
            f = np.maximum(f, ell(X, Y, cx + r * 0.72 * math.cos(a), cy + r * 0.55 * math.sin(a), r * 0.5, r * 0.45))
        lit = np.maximum(lit, ell(X, Y, cx - r * 0.3, cy - r * 0.45, r * 0.95, r * 0.7))
        dark = np.maximum(dark, ell(X, Y, cx + r * 0.3, cy + r * 0.5, r * 0.9, r * 0.55))
    s = Img(img.w, img.h)
    m = f > 0
    s.paint(m, cols[2])
    s.paint(m & (dark > 0.3) & (lit < 0.15), cols[1])
    s.paint(m & (lit > 0.15), cols[3])
    s.paint(m & (lit > 0.7) & (f > 0.3), cols[4])
    if edge and fade < 0.5:
        s.paint(dil(m) & ~m, cols[0])
    if fade >= 0.5:  # thin, outline-less wisps: keep only the lit tops and a broken edge
        s.erase(m & ~(lit > 0.25))
        clean(s)
    return img.over(s)
