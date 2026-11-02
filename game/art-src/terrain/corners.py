"""Shapes for the "dual grid": the terrain sheets are drawn on cells that sit between four map tiles.

A drawn cell is 16x16 and is centred on the point where four tiles meet; its corners are the centres of those
tiles. Sheet tile `mask` = the terrain's shape when the corners that are this terrain are mask's bits:
north-west 1, north-east 2, south-west 4, south-east 8. (The Map chat's drawCorners() gives the mask; the
game draws the cell offset by half a tile.) The shapes join up across cells because a boundary crossing a
cell's side depends only on that side's two corners.

Two kinds of shape:
- organic: a smooth outline through the cell (marching squares on the four corner values, with a wobble that
  fades to nothing at the cell's sides), so a diagonal run of tiles draws as a diagonal shore and inner corners
  are round. For ground, water, grass...
- blocky: the old tile-shaped outline (each corner tile's square, pulled back from sides whose neighbour is
  different), for things that are built: walls and bridges.

Either way the result is a Region: which pixels are the terrain, and how far each is from the edge in each
direction (the rims, banks and cliff faces are drawn from those distances). To get the distances right near
the cell's sides, the region is worked out over a margin round the cell too (extending the corner values).
"""

from __future__ import annotations

import math
from collections import deque

import numpy as np

from edges import BIG, Shape
from pix import T

E = 8   # extra pixels worked out round the cell
NW, NE, SW, SE = 1, 2, 4, 8


class Region:
    """ins over the cell plus E pixels round it; cell coordinates run 0..15, the extension -E..15+E."""

    def __init__(self, ins_ext: np.ndarray, mask: int):
        self.mask = self.bits = mask
        self.ext = ins_ext
        n = ins_ext.shape[0]
        self.ins = ins_ext[E:E + T, E:E + T].copy()
        dN = np.full((n, n), BIG)
        dS = np.full((n, n), BIG)
        dW = np.full((n, n), BIG)
        dE = np.full((n, n), BIG)
        for x in range(n):
            run = BIG
            for y in range(n):          # distance to the outside above
                if not ins_ext[y, x]:
                    run = 0
                else:
                    run = run + 1 if run < BIG else BIG
                    dN[y, x] = run
            run = BIG
            for y in range(n - 1, -1, -1):
                if not ins_ext[y, x]:
                    run = 0
                else:
                    run = run + 1 if run < BIG else BIG
                    dS[y, x] = run
        for y in range(n):
            run = BIG
            for x in range(n):
                if not ins_ext[y, x]:
                    run = 0
                else:
                    run = run + 1 if run < BIG else BIG
                    dW[y, x] = run
            run = BIG
            for x in range(n - 1, -1, -1):
                if not ins_ext[y, x]:
                    run = 0
                else:
                    run = run + 1 if run < BIG else BIG
                    dE[y, x] = run
        d = np.full((n, n), BIG)
        q = deque()
        for y in range(n):
            for x in range(n):
                if not ins_ext[y, x]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < n and 0 <= yy < n and not ins_ext[yy, xx]:
                        d[y, x] = 1
                        q.append((x, y))
                        break
        while q:
            x, y = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < n and 0 <= yy < n and ins_ext[yy, xx] and d[yy, xx] > d[y, x] + 1:
                    d[yy, xx] = d[y, x] + 1
                    q.append((xx, yy))
        sl = (slice(E, E + T), slice(E, E + T))
        self.dN, self.dS, self.dW, self.dE, self.d = dN[sl], dS[sl], dW[sl], dE[sl], d[sl]
        self.dN_ext, self.dS_ext = dN, dS
        # a side of the cell is "open" when the terrain doesn't run solidly across it
        self.open = {
            "N": not (mask & NW and mask & NE), "S": not (mask & SW and mask & SE),
            "W": not (mask & NW and mask & SW), "E": not (mask & NE and mask & SE),
        }

    def inside(self, x: int, y: int) -> bool:
        xx, yy = x + E, y + E
        n = self.ext.shape[0]
        if 0 <= xx < n and 0 <= yy < n:
            return bool(self.ext[yy, xx])
        xx, yy = min(max(xx, 0), n - 1), min(max(yy, 0), n - 1)
        return bool(self.ext[yy, xx])


def corner_values(mask: int):
    return (1.0 if mask & NW else 0.0, 1.0 if mask & NE else 0.0, 1.0 if mask & SW else 0.0, 1.0 if mask & SE else 0.0)


def organic(mask: int, margin: float, rng, amp: float = 1.3) -> Region:
    """A smooth outline. Each corner that is this terrain claims the ground within r = 8 - margin px of it:
    one corner -> a quarter disc (four of them round a lone tile make a round blob); two side by side -> a
    straight band; three -> a rounded inner corner; two diagonal corners -> two quarter discs joined by a neck.
    Every outline crosses a cell's side at the same point and square to it, so cells join smoothly. A gentle
    wobble, zero on the cell's sides, keeps long straight shores from looking ruled."""
    cs = {NW: (0.0, 0.0), NE: (16.0, 0.0), SW: (0.0, 16.0), SE: (16.0, 16.0)}
    ins_c = [c for c in (NW, NE, SW, SE) if mask & c]
    out_c = [c for c in (NW, NE, SW, SE) if not mask & c]
    r = T / 2 - margin
    n = T + 2 * E
    k = rng.random((3, 3)) * 2 - 1
    ins = np.zeros((n, n), bool)
    for py in range(n):
        for px in range(n):
            x, y = px - E + 0.5, py - E + 0.5
            if len(ins_c) == 0:
                s_ = -1.0
            elif len(ins_c) == 4:
                s_ = 1.0
            elif len(ins_c) == 1:
                cx, cy = cs[ins_c[0]]
                s_ = r - math.hypot(x - cx, y - cy)
            elif len(ins_c) == 3:
                cx, cy = cs[out_c[0]]
                s_ = math.hypot(x - cx, y - cy) - (T - r)
            elif mask in (NW | SE, NE | SW):
                (ax, ay), (bx, by) = cs[ins_c[0]], cs[ins_c[1]]
                da, db = math.hypot(x - ax, y - ay), math.hypot(x - bx, y - by)
                # distance from the diagonal between the two corners
                dl = abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / math.hypot(bx - ax, by - ay)
                s_ = max(r - da, r - db, 2.6 - dl)
            else:  # two corners on one side: a straight band along that side
                if mask == NW | NE:
                    s_ = r - y
                elif mask == SW | SE:
                    s_ = r - (T - y)
                elif mask == NW | SW:
                    s_ = r - x
                else:
                    s_ = r - (T - x)
            u, v = x / T, y / T
            if 0 < u < 1 and 0 < v < 1 and 0 < len(ins_c) < 4:
                w = sum(k[i, j] * math.sin(math.pi * u * (i + 1)) * math.sin(math.pi * v * (j + 1)) / (i + j + 1)
                        for i in range(3) for j in range(3))
                s_ += amp * w
            ins[py, px] = s_ > 0
    return Region(ins, mask)


def blocky(mask: int, margin: dict, rng_of, amp: int = 1, radius: float = 4.5) -> Region:
    """The old tile-shaped outline: build the four tiles round the cell (each pulled back from sides whose
    neighbour is different, using the edge shapes) and take the middle 16x16."""
    inn = {NW: bool(mask & NW), NE: bool(mask & NE), SW: bool(mask & SW), SE: bool(mask & SE)}
    pos = {NW: (0, 0), NE: (1, 0), SW: (0, 1), SE: (1, 1)}
    at = {v: k for k, v in pos.items()}
    big = np.zeros((2 * T, 2 * T), bool)
    for corner, (tx, ty) in pos.items():
        if not inn[corner]:
            continue
        bits = 0
        for bit, (dx, dy) in ((1, (0, -1)), (2, (1, 0)), (4, (0, 1)), (8, (-1, 0))):
            nx, ny = tx + dx, ty + dy
            if (nx, ny) in at:
                same = inn[at[(nx, ny)]]
            else:
                same = True   # beyond the 2x2 block: assume the terrain carries on
            if same:
                bits |= bit
        sh = Shape(bits, margin, rng_of(bits), amp, radius)
        big[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T] = sh.ins
    # the cell is the middle of the 2x2 block; the extension reaches into the rest of it
    n = T + 2 * E
    ext = np.zeros((n, n), bool)
    off = T // 2 - E
    for y in range(n):
        for x in range(n):
            by, bx = y + off, x + off
            if 0 <= by < 2 * T and 0 <= bx < 2 * T:
                ext[y, x] = big[by, bx]
            else:
                ext[y, x] = big[min(max(by, 0), 2 * T - 1), min(max(bx, 0), 2 * T - 1)]
    return Region(ext, mask)
