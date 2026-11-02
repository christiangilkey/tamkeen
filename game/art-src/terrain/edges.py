"""The 16 edge shapes of an area terrain.

Tile i of a terrain's 4x4 sheet is the terrain with same-terrain neighbours i (north 1, east 2, south 4, west 8).
On a side whose neighbour is different the terrain stops a couple of pixels inside the tile along a slightly
wobbly line, and corners where two open sides meet are rounded. Where the line meets the tile's corner it is
always the same distance in, so the shapes of neighbouring tiles join up.
"""

from __future__ import annotations

import numpy as np

from pix import T

BIT = {"N": 1, "E": 2, "S": 4, "W": 8}
BIG = 99


def wob(rng, amp: int) -> np.ndarray:
    """How far the edge line moves in or out along one side; 0 near both ends so tiles join."""
    v = np.zeros(T, int)
    cur = 0
    for t in range(T):
        r = rng.random()
        if r < 0.28:
            cur -= 1
        elif r < 0.56:
            cur += 1
        cur = max(-amp, min(amp, cur))
        v[t] = cur
    for t in range(T):
        lim = max(0, min(t, T - 1 - t) - 2)
        v[t] = max(-lim, min(lim, v[t]))
    return v


class Shape:
    """Which pixels of the tile belong to the terrain, and how far each is from the edge in each direction."""

    def __init__(self, bits: int, margin: dict, rng, amp: int = 1, radius: float = 4.5):
        self.bits = bits
        self.open = {s: not (bits & BIT[s]) for s in "NESW"}
        pr = {s: wob(rng, amp) for s in "NESW"}
        ins = np.ones((T, T), bool)
        m = margin
        for y in range(T):
            for x in range(T):
                if self.open["N"] and y < m["N"] + pr["N"][x]:
                    ins[y, x] = False
                if self.open["S"] and y > T - 1 - (m["S"] + pr["S"][x]):
                    ins[y, x] = False
                if self.open["W"] and x < m["W"] + pr["W"][y]:
                    ins[y, x] = False
                if self.open["E"] and x > T - 1 - (m["E"] + pr["E"][y]):
                    ins[y, x] = False
        for a, b in (("N", "W"), ("N", "E"), ("S", "W"), ("S", "E")):
            if not (self.open[a] and self.open[b]):
                continue
            cy = m["N"] + radius if a == "N" else T - m["S"] - radius
            cx = m["W"] + radius if b == "W" else T - m["E"] - radius
            for y in range(T):
                for x in range(T):
                    px, py = x + 0.5, y + 0.5
                    inq = (py < cy if a == "N" else py > cy) and (px < cx if b == "W" else px > cx)
                    if inq and (px - cx) ** 2 + (py - cy) ** 2 > radius * radius:
                        ins[y, x] = False
        self.ins = ins
        self._dirs()
        self._dist()

    def inside(self, x: int, y: int) -> bool:
        """Is (x, y) terrain? Beyond the tile: yes on a same-terrain side, no on an open side."""
        if x < 0:
            return not self.open["W"]
        if x >= T:
            return not self.open["E"]
        if y < 0:
            return not self.open["N"]
        if y >= T:
            return not self.open["S"]
        return bool(self.ins[y, x])

    def _dirs(self):
        self.dN = np.full((T, T), BIG)
        self.dS = np.full((T, T), BIG)
        self.dW = np.full((T, T), BIG)
        self.dE = np.full((T, T), BIG)
        for y in range(T):
            for x in range(T):
                if not self.ins[y, x]:
                    continue
                for arr, dx, dy in ((self.dN, 0, -1), (self.dS, 0, 1), (self.dW, -1, 0), (self.dE, 1, 0)):
                    k = 1
                    while True:
                        xx, yy = x + dx * k, y + dy * k
                        if not (0 <= xx < T and 0 <= yy < T):
                            arr[y, x] = k if not self.inside(xx, yy) else BIG
                            break
                        if not self.ins[yy, xx]:
                            arr[y, x] = k
                            break
                        k += 1

    def _dist(self):
        """Steps (4-neighbour) to the nearest pixel that isn't terrain."""
        d = np.full((T, T), BIG)
        from collections import deque
        q = deque()
        for y in range(T):
            for x in range(T):
                if not self.ins[y, x]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if not self.inside(x + dx, y + dy):
                        d[y, x] = 1
                        q.append((x, y))
                        break
        while q:
            x, y = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < T and 0 <= yy < T and self.ins[yy, xx] and d[yy, xx] > d[y, x] + 1:
                    d[yy, xx] = d[y, x] + 1
                    q.append((xx, yy))
        self.d = d

    def outside_near(self, x: int, y: int) -> bool:
        return not self.ins[y, x]
