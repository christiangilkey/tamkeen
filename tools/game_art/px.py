"""A tiny pixel-art engine for the creature game's art (cute cyberpunk, soft-neon palette).

Shapes are sets of pixels ("masks"). `Spr.blob` paints a mask as a shaded, outlined form:
light from the top left, a shadow crescent on the bottom right, one highlight cluster, and a
coloured outline that is lighter where the light hits it (selective outlining). No pixel is
ever partly transparent, and no pure black is used.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "game-art"

# ---------- palette ----------
# Dark and gritty, lit by neon: every ramp runs from a bright glow down to a near-black of the
# same family. Ramps are highlight, base, shade, outline.
PINK = ["#ff9ad5", "#ff2a8a", "#a3156b", "#3d0f3f"]
MINT = ["#c2ffd9", "#3dffa2", "#16a77a", "#0d4048"]
CYAN = ["#b8fbff", "#05d9e8", "#0a7fa6", "#0c2f55"]
LEMON = ["#fff3a0", "#f9c80e", "#c2701c", "#4d2433"]
LILAC = ["#d9b8ff", "#9d4edd", "#5a2a9c", "#24124a"]
PEACH = ["#ffc89a", "#ff7a3c", "#b83a3a", "#48152f"]
STEEL = ["#aab0d0", "#5d6390", "#353a66", "#161a3a"]
CHAR = ["#3f4268", "#262846", "#181930", "#0d0e20"]
PLUM = ["#7a4f9c", "#472a6b", "#2b1847", "#150b28"]
NAVY = ["#3b4d9c", "#1f2a66", "#141a45", "#0a0d28"]
SNOW = ["#f2f4ff", "#c4c8ea", "#7d82b5", "#33366a"]
WOOD = ["#9c6a7a", "#633d5c", "#3d2445", "#1e1230"]
LEAF = ["#5fe0a8", "#1f9c80", "#126266", "#0b2f40"]
TREE = ["#2fae8e", "#165e63", "#0f3d4e", "#0a2238"]
TEAL = ["#5fd6d6", "#1f8f9c", "#145a70", "#0b2a45"]
SAND = ["#e0b89c", "#a8707c", "#6b4266", "#2f1c40"]
W = "#ffffff"
SCREEN = "#0d0e20"      # a switched-on dark display
SCREEN_HI = "#1f2a66"
INK = "#0b0a1c"         # the darkest colour used anywhere: blue-black, never pure black


def dim(r):
    """The unlit version of a ramp: what a neon colour looks like on a dark body."""
    return [r[2], mix(r[2], r[3], 0.55), r[3], mix(r[3], "#05040f", 0.5)]


TYPE_RAMP = {"ember": PEACH, "tide": CYAN, "grove": MINT, "spark": LEMON, "stone": STEEL, "dusk": LILAC}
TYPE_GLOW = {"ember": LEMON, "tide": MINT, "grove": LEMON, "spark": PINK, "stone": CYAN, "dusk": PINK}


def rgb(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def mix(a: str, b: str, t: float) -> str:
    x, y = rgb(a), rgb(b)
    return "#%02x%02x%02x" % tuple(round(x[i] + (y[i] - x[i]) * t) for i in range(3))


# ---------- masks ----------
def n4(p):
    x, y = p
    return ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))


def E(cx, cy, rx, ry):
    """Ellipse."""
    return {(x, y) for y in range(int(cy - ry) - 1, int(cy + ry) + 2) for x in range(int(cx - rx) - 1, int(cx + rx) + 2)
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0}


def R(x0, y0, x1, y1):
    return {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)}


def RR(x0, y0, x1, y1, r):
    """Rounded rectangle."""
    out = set()
    for (x, y) in R(x0, y0, x1, y1):
        cx = min(max(x, x0 + r), x1 - r)
        cy = min(max(y, y0 + r), y1 - r)
        if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6:
            out.add((x, y))
    return out


def LN(x0, y0, x1, y1, t=1):
    x0, y0, x1, y1 = round(x0), round(y0), round(x1), round(y1)
    pts = set()
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err, x, y = dx + dy, x0, y0
    while True:
        pts.add((x, y))
        if x == x1 and y == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x += sx
        if e2 <= dx:
            err += dx
            y += sy
    if t > 1:
        pts = {(x + i, y + j) for (x, y) in pts for i in range(t) for j in range(t)}
    return pts


def PATH(pts, t=1):
    out = set()
    for a, b in zip(pts, pts[1:]):
        out |= LN(*a, *b, t)
    return out


def PG(pts):
    """Filled polygon."""
    out = set()
    n = len(pts)
    for i in range(n):
        out |= LN(*pts[i], *pts[(i + 1) % n])
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    for y in range(math.floor(min(ys)), math.ceil(max(ys)) + 1):
        for x in range(math.floor(min(xs)), math.ceil(max(xs)) + 1):
            inside = False
            for i in range(n):
                (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % n]
                if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                    inside = not inside
            if inside:
                out.add((x, y))
    return out


def ARC(cx, cy, r, a0, a1, t=1):
    """Part of a circle's rim, angles in degrees (0 = right, 90 = down)."""
    out = set()
    steps = max(8, int(r * abs(a1 - a0) / 20))
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        x, y = round(cx + math.cos(a) * r), round(cy + math.sin(a) * r)
        out |= {(x + i2, y + j) for i2 in range(t) for j in range(t)}
    return out


def erode(m, k=1):
    for _ in range(k):
        m = {p for p in m if all(q in m for q in n4(p))}
    return m


def grow(m, k=1):
    for _ in range(k):
        m = m | {q for p in m for q in n4(p)}
    return m


def rim(m):
    return {p for p in m if any(q not in m for q in n4(p))}


def shift(m, dx, dy):
    return {(x + dx, y + dy) for (x, y) in m}


def flipx(m, w):
    return {(w - 1 - x, y) for (x, y) in m}


def STAR(cx, cy, ro, ri, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        a = math.radians(rot + i * 180 / n)
        r = ro if i % 2 == 0 else ri
        pts.append((round(cx + math.cos(a) * r), round(cy + math.sin(a) * r)))
    return PG(pts)


def HEART(x, y, s=1):
    """A heart whose top-left corner is (x, y); s=1 is 7x6, s=2 is 9x8."""
    rows = ([".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."] if s == 1 else
            [".###.###.", "#########", "#########", "#########", ".#######.", "..#####..", "...###...", "....#...."])
    return {(x + i, y + j) for j, row in enumerate(rows) for i, ch in enumerate(row) if ch == "#"}


# ---------- sprite ----------
class Spr:
    def __init__(self, w, h, grit=True, rim=False):
        self.w, self.h = w, h
        self.grit = grit   # dither where light meets shadow on big forms, for a rougher texture
        self.rim = rim     # catch the light on the outline itself: a bright edge for dark bodies
        self.px = {}   # (x, y) -> "#rrggbb"
        self.bd = {}   # (x, y) -> shading band 0..3, remembered so overlays can follow the form

    def put(self, p, c, band=None):
        if 0 <= p[0] < self.w and 0 <= p[1] < self.h:
            self.px[p] = c
            if band is None:
                self.bd.pop(p, None)
            else:
                self.bd[p] = band

    def fill(self, m, c):
        for p in m:
            self.put(p, c)
        return self

    def erase(self, m):
        for p in m:
            self.px.pop(p, None)
            self.bd.pop(p, None)
        return self

    def mask(self):
        return set(self.px)

    def blob(self, m, ramp, t=None, hi="auto", sel=True, line=True):
        """Paint mask `m` as a lit, outlined form in `ramp` (highlight, base, shade, outline)."""
        if not m:
            return self
        if len(ramp) == 3:
            ramp = [*ramp, ramp[2]]
        xs = [p[0] for p in m]
        ys = [p[1] for p in m]
        x0, y0 = min(xs), min(ys)
        w, h = max(xs) - x0 + 1, max(ys) - y0 + 1
        if t is None:
            t = 1 if min(w, h) < 10 else 2 if min(w, h) < 26 else 3
        edge = rim(m) if line else set()
        inner = m - edge
        if hi == "auto":
            k = 0.6 if self.rim else 1.0   # a dark body shows only a small sheen
            hi = E(x0 + w * 0.34, y0 + h * 0.28, max(1.0, w * 0.15 * k), max(0.8, h * 0.11 * k)) if min(w, h) >= 7 else set()
        bands = {}
        for p in inner:
            x, y = p
            dark = any((x + k, y + k) not in inner for k in range(1, t + 1)) or any(
                (x + k, y) not in inner or (x, y + k) not in inner for k in range(1, t))
            bands[p] = 2 if dark else 0 if p in hi else 1
        if self.grit and min(w, h) >= 14:
            for (x, y), b in list(bands.items()):
                if b < 2 and (x + y) % 2 == 0 and any(bands.get(q) == b + 1 for q in ((x + 1, y), (x, y + 1), (x + 1, y + 1))):
                    bands[(x, y)] = b + 1
        for p, band in bands.items():
            self.put(p, ramp[band], band)
        for p in edge:
            x, y = p
            lit = sel and ((x - 1, y) not in m or (x, y - 1) not in m) and (x + 1, y) in m and (x, y + 1) in m
            self.put(p, (ramp[0] if self.rim else ramp[2]) if lit else ramp[3], 3)
        return self

    def over(self, m, ramp):
        """Recolour what is already painted inside `m`, keeping its light and shadow."""
        for p in m:
            band = self.bd.get(p)
            if band is not None and band < 3 and p in self.px:
                self.px[p] = ramp[min(band, len(ramp) - 1)]
        return self

    def dither(self, m, c, phase=0):
        for p in m:
            if (p[0] + p[1]) % 2 == phase:
                self.put(p, c)
        return self

    def holo(self, m, a, base=None):
        """A hologram: a bright rim around a see-through checkerboard."""
        edge = rim(m)
        if base:
            self.fill(m - edge, base)
        self.erase(m - edge) if not base else None
        self.dither(m - edge, a[1])
        self.fill(edge, a[0])
        return self

    def led(self, x, y, a, core=None):
        """A tiny light: one bright pixel, with its neighbours (where painted) in a dimmer shade."""
        for q in n4((x, y)):
            if q in self.px:
                self.put(q, a[1])
        self.put((x, y), core or a[0])
        return self

    def blit(self, other, ox=0, oy=0):
        for (x, y), c in other.px.items():
            self.put((x + ox, y + oy), c, other.bd.get((x, y)))
        return self

    def image(self):
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            img.putpixel((x, y), (*rgb(c), 255))
        return img


def grid(rows, legend, w=None, h=None, ox=0, oy=0):
    """A sprite typed out as text: each character is a pixel, looked up in `legend` ('.' is clear)."""
    s = Spr(w or len(rows[0]), h or len(rows))
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != "." and ch != " ":
                s.put((i + ox, j + oy), legend[ch])
    return s


def strip(frames):
    """Frames side by side in one row."""
    w, h = frames[0].w, frames[0].h
    s = Spr(w * len(frames), h)
    for i, f in enumerate(frames):
        s.blit(f, i * w, 0)
    return s
