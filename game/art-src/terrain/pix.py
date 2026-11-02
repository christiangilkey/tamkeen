"""Small pixel-placing helpers shared by the terrain art (terrain.py) and its props (props.py).

An image is a numpy array of shape (h, w, 4), RGBA bytes. Colours are (r, g, b, a) tuples.
A colour with alpha below 255 is a see-through shadow: over an opaque pixel it darkens that pixel
(the result stays opaque); over an empty pixel it stays see-through, so it darkens whatever the game
draws underneath.
"""

from __future__ import annotations

import numpy as np

T = 16  # tile size

BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def hx(s: str, a: int = 255) -> tuple:
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def ramp(spec: str) -> list:
    """'#111 #222 ...' -> list of colours, darkest first."""
    return [hx(h) for h in spec.split()]


def blank(w: int = T, h: int = T) -> np.ndarray:
    return np.zeros((h, w, 4), np.uint8)


def put(img: np.ndarray, x: int, y: int, c, wrap: bool = False) -> None:
    h, w = img.shape[:2]
    if wrap:
        x %= w
        y %= h
    elif not (0 <= x < w and 0 <= y < h):
        return
    if c is None:
        return
    if len(c) == 4 and c[3] < 255:
        under = img[y, x]
        if under[3] == 255:
            a = c[3] / 255.0
            img[y, x, :3] = (under[:3] * (1 - a) + np.array(c[:3]) * a).round().astype(np.uint8)
        elif under[3] == 0:
            img[y, x] = c
        else:  # two shadows on top of each other: keep the darker one
            if c[3] > under[3]:
                img[y, x] = c
        return
    img[y, x] = c if len(c) == 4 else (*c, 255)


def erase(img: np.ndarray, x: int, y: int) -> None:
    h, w = img.shape[:2]
    if 0 <= x < w and 0 <= y < h:
        img[y, x] = 0


def stamp(img: np.ndarray, x: int, y: int, rows: list, cmap: dict, wrap: bool = False) -> None:
    """Paint a small designed pixel grid. '.' and ' ' are left alone."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in ". ":
                continue
            put(img, x + i, y + j, cmap[ch], wrap)


def footprint(rows: list) -> list:
    return [(i, j) for j, row in enumerate(rows) for i, ch in enumerate(row) if ch not in ". "]


def mix(c1, c2, t: float) -> tuple:
    return tuple(int(round(a * (1 - t) + b * t)) for a, b in zip(c1, c2))


# ---------- noise that wraps round the tile, so a tile repeats with no seam ----------

def vnoise(rng, cells: int, size: int = T) -> np.ndarray:
    g = rng.random((cells, cells))
    out = np.zeros((size, size))
    for y in range(size):
        for x in range(size):
            fx, fy = x * cells / size, y * cells / size
            x0, y0 = int(fx), int(fy)
            tx, ty = fx - x0, fy - y0
            sx, sy = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
            a = g[y0 % cells, x0 % cells]
            b = g[y0 % cells, (x0 + 1) % cells]
            c = g[(y0 + 1) % cells, x0 % cells]
            d = g[(y0 + 1) % cells, (x0 + 1) % cells]
            out[y, x] = (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy
    return out


def fbm(rng, octaves=((2, 0.55), (4, 0.3), (8, 0.15)), size: int = T) -> np.ndarray:
    n = sum(w * vnoise(rng, c, size) for c, w in octaves)
    return rank(n)


def rank(n: np.ndarray) -> np.ndarray:
    """Spread values evenly over 0..1 so thresholds mean 'this share of pixels'."""
    flat = n.flatten()
    order = flat.argsort(kind="stable")
    r = np.empty_like(flat)
    r[order] = np.arange(len(flat)) / max(1, len(flat) - 1)
    return r.reshape(n.shape)


def quantize(n: np.ndarray, cuts: list, dither: float = 0.0) -> np.ndarray:
    """Band index per pixel; cuts are ascending shares. dither widens each cut by a Bayer pattern."""
    h, w = n.shape
    out = np.zeros((h, w), int)
    for y in range(h):
        for x in range(w):
            v = n[y, x] + (BAYER4[y % 4, x % 4] - 0.5) * dither
            out[y, x] = sum(1 for c in cuts if v > c)
    return out


# ---------- placing things without overlaps ----------

class Spots:
    """Keeps track of taken pixels so details don't pile on top of each other."""

    def __init__(self, ok: np.ndarray):
        self.ok = ok.copy()  # True where a detail may go

    def fits(self, x: int, y: int, fp: list, pad: int = 1) -> bool:
        h, w = self.ok.shape
        for i, j in fp:
            for dx in range(-pad, pad + 1):
                for dy in range(-pad, pad + 1):
                    if dx == 0 and dy == 0 or pad == 0:
                        px, py = x + i, y + j
                    else:
                        px, py = x + i + dx, y + j + dy
                        if not (0 <= px < w and 0 <= py < h):
                            continue
                    if not (0 <= px < w and 0 <= py < h) or not self.ok[py, px]:
                        return False
        return True

    def take(self, x: int, y: int, fp: list) -> None:
        h, w = self.ok.shape
        for i, j in fp:
            if 0 <= x + i < w and 0 <= y + j < h:
                self.ok[y + j, x + i] = False

    def place(self, rng, rows: list, tries: int = 40, pad: int = 1):
        fp = footprint(rows)
        h, w = self.ok.shape
        bw = max(len(r) for r in rows)
        bh = len(rows)
        for _ in range(tries):
            x = int(rng.integers(0, w - bw + 1))
            y = int(rng.integers(0, h - bh + 1))
            if self.fits(x, y, fp, pad):
                self.take(x, y, fp)
                return x, y
        return None


def to_image(arr: np.ndarray):
    from PIL import Image
    return Image.fromarray(arr, "RGBA")
