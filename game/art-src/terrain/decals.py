"""Decals: small things lying on the ground that never block anything (pebbles, twigs, leaves, flowers, bones,
shells, puddles, cracks...). The Map scatters them in clusters at any pixel position; the game draws them right
after the ground, before props and creatures.

Each decal file is a strip of 16x16 cells side by side, one variant per cell (decal_<name>.png). Flat things, so
no outline: lit on their top-left, a small see-through shadow to the lower right where they stand up at all.
Nothing touches a cell's border.
"""

from __future__ import annotations

import math
import zlib

import numpy as np

from pix import T, blank, hx, mix, put, ramp, stamp

SHADOW = hx("#140a26", 100)
STONE = ramp("#2a2436 #433c4e #605868 #847a86 #aaa0a4 #d0c8c4")
WOOD = ramp("#2a1a16 #4a3020 #6e4a2c #8e6a40 #b08c58")
LEAVES = [hx("#4a2a1e"), hx("#6a3c22"), hx("#8a5428"), hx("#a8723a"), hx("#c4903e")]
GREEN = ramp("#173a32 #1f5236 #2a6a3c #3a8443 #559d4b #7db756 #b0d36c")
BONE = ramp("#5a4a44 #8a7a6e #b8aa98 #ddd2c0 #f4ecdc")
SHELLS = [(hx("#c07a78"), hx("#f0b8a8"), hx("#fbe8e0")), (hx("#8a6a9a"), hx("#c4a6d4"), hx("#f0e4f8")),
          (hx("#b0703a"), hx("#e8a86a"), hx("#fde0b8"))]
STAR = (hx("#b0402a"), hx("#e8703a"), hx("#ffb07a"))
WEED = ramp("#122a22 #1c3e2a #2a5a30 #3e7a3a #5c9a48")
WATER = (hx("#1d5a98"), hx("#2a7cb0"), hx("#7cc8d8"), hx("#c4eef0"))
MUSH = [(hx("#8a1e2a"), hx("#d8383a"), hx("#f4e8e0")), (hx("#6a4a2a"), hx("#a8784a"), hx("#e4c898")),
        (hx("#2a4a8a"), hx("#5ad8c8"), hx("#e0fff8"))]
STEM = (hx("#9a8e7c"), hx("#e4d8c4"))
SNOW = ramp("#5a6ea0 #7e94c0 #a8bedc #cad8ec #e6eef8 #ffffff")
CINDER = ramp("#0e0a0c #1e1618 #2e2426 #463a3a #6e5e5a")
GLOW = ramp("#5a1410 #8e2410 #c8420e #f07a18 #ffb83a #ffe88a")


def rng_for(*parts):
    return np.random.default_rng(zlib.crc32("/".join(str(p) for p in parts).encode()))


def cells(name, k, draw):
    """A strip of k cells; draw(img, rng, i) paints cell i."""
    strip = blank(k * T, T)
    for i in range(k):
        img = blank()
        draw(img, rng_for("decal", name, i), i)
        img[0, :] = 0
        img[-1, :] = 0
        img[:, 0] = 0
        img[:, -1] = 0
        strip[:, i * T:(i + 1) * T] = img
    return strip


def free(img, x, y, rows):
    """Is a stamp's footprint free and inside the cell (one pixel clear of its border)?"""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in ". ":
                continue
            xx, yy = x + i, y + j
            if not (1 <= xx < T - 1 and 1 <= yy < T - 1) or img[yy, xx, 3]:
                return False
    return True


def scatter(img, rng, rows, cmap, n, tries=40):
    placed = 0
    for _ in range(tries):
        if placed >= n:
            break
        w = max(len(r) for r in rows)
        x, y = int(rng.integers(1, T - w)), int(rng.integers(1, T - len(rows)))
        if free(img, x, y, rows):
            stamp(img, x, y, rows, cmap)
            placed += 1


def pebbles(img, rng, i):
    stones = [[".ab", "abc", "ccs"], ["ab", "bs"], [".aab", "abbc", ".ccs"], ["a", "s"]]
    cm = {"a": STONE[4], "b": STONE[3], "c": STONE[2], "s": SHADOW}
    for k in range(3 + i % 2):
        scatter(img, rng, stones[(k + i) % 4], cm, 1)


def twigs(img, rng, i):
    shapes = [["ab...", ".bb..", "..bba", "....s"], ["...ab", "..bb.", "abb..", "s...."], ["abbba", ".s..."],
              ["a...", ".b..", ".bb.", "..ba"]]
    scatter(img, rng, shapes[i % 4], {"a": WOOD[4], "b": WOOD[2], "s": SHADOW}, 1)
    scatter(img, rng, shapes[(i + 2) % 4], {"a": WOOD[3], "b": WOOD[1], "s": SHADOW}, 1 if i % 2 else 0)


def leaves(img, rng, i):
    shapes = [[".aa", "abc", "cc."], ["aab", ".bc"], [".a.", "abc", ".c."], ["ab", "bc"]]
    greenish = i == 3
    for k in range(4 + i % 2):
        c = int(rng.integers(0, 3))
        cm = {"a": LEAVES[c + 2], "b": LEAVES[c + 1], "c": LEAVES[c]} if not greenish else \
            {"a": GREEN[5], "b": GREEN[4], "c": GREEN[2]}
        scatter(img, rng, shapes[int(rng.integers(0, 4))], cm, 1)


def tuft(img, rng, i):
    tufts = [
        ["l..l.", ".l.ml", "lml.m", "mdmdm", ".ddd."],
        ["..l..", "l.m.l", ".mml.", "mdmdm", ".ddd."],
        ["l...l", ".l.l.", "lmmml", ".dmd."],
        [".l.l.", "lmlml", "mdmdm", ".ddd."],
    ]
    rows = tufts[i % 4]
    cm = {"l": GREEN[6], "m": GREEN[4], "d": GREEN[1]}
    scatter(img, rng, rows, cm, 1)
    if i % 2:
        scatter(img, rng, [".l.", "lml", "ddd"], cm, 1)


def flowers(img, rng, i):
    petals = [(hx("#e83a5a"), hx("#ff8aa0")), (hx("#f4c030"), hx("#fff09a")), (hx("#ece8f4"), hx("#ffffff")),
              (hx("#7a5ae0"), hx("#b8a4ff")), (hx("#ff7a3a"), hx("#ffc07a")), (hx("#e85aa8"), hx("#ffb0dc"))]
    dark, light = petals[i % 6]
    for k in range(3 + (i % 3)):
        rows = [".l.", "dcl", ".d.", ".g."] if k % 2 == 0 else ["l.", "dg"]
        scatter(img, rng, rows, {"l": light, "d": dark, "c": hx("#ffe070"), "g": GREEN[2]}, 1)
    scatter(img, rng, ["g.g", ".g."], {"g": GREEN[3]}, 1)


def bones(img, rng, i):
    shapes = [
        ["ab...", ".bbb.", "...ba", "....s"],          # a long bone
        [".aab.", "abcbb", "bdbdb", ".bbs."],          # a small skull
        ["a.a.a", "b.b.b", "bbbbb"],                   # ribs
        ["ab", "bb", "bs"],                            # a knuckle
    ]
    cm = {"a": BONE[4], "b": BONE[3], "c": BONE[1], "d": BONE[0], "s": SHADOW}
    scatter(img, rng, shapes[i % 4], cm, 1)
    scatter(img, rng, shapes[3], cm, 1 if i != 3 else 2)


def shells(img, rng, i):
    if i == 3:  # a starfish
        scatter(img, rng, ["..b..", "bbabb", ".bcb.", "b...b", "s...s"], {"a": STAR[2], "b": STAR[1], "c": STAR[0], "s": SHADOW}, 1)
        return
    d, m, l = SHELLS[i % 3]
    scatter(img, rng, [".lm", "lmm", "mds"], {"l": l, "m": m, "d": d, "s": SHADOW}, 1)
    scatter(img, rng, ["lm", "ds"], {"l": l, "m": m, "d": d, "s": SHADOW}, 1 + i % 2)


def seaweed(img, rng, i):
    shapes = [["d.d..", "mdmdm", ".mlm.", "..m.."], ["ml...", ".mmd.", "..dml", "...m."], ["dmmmd", ".lml."],
              [".m.m", "mlmd", "d.m."]]
    scatter(img, rng, shapes[i % 4], {"d": WEED[1], "m": WEED[3], "l": WEED[4]}, 1)
    scatter(img, rng, ["m", "d"], {"d": WEED[1], "m": WEED[3]}, 1)


def puddle(img, rng, i):
    w, h = [(7, 4), (9, 5), (6, 3), (10, 4)][i % 4]
    x0, y0 = (T - w) // 2 + int(rng.integers(-1, 2)), (T - h) // 2 + int(rng.integers(-1, 2))
    for y in range(h):
        for x in range(w):
            dx, dy = (x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2)
            if dx * dx + dy * dy > 1:
                continue
            c = WATER[1] if dy > -0.2 else WATER[0]   # the sky reflected brighter at the near side
            if dy > 0.3 and abs(dx) < 0.5:
                c = WATER[2]
            put(img, x0 + x, y0 + y, c)
    put(img, x0 + w // 2 - 1, y0 + h - 2, WATER[3])   # a glint
    for x in range(w):  # a dark wet rim along the far side
        for y in range(h):
            if img[y0 + y, x0 + x, 3] and not img[y0 + y - 1, x0 + x, 3]:
                put(img, x0 + x, y0 + y - 1, hx("#140a26", 90))
                break


def crack(img, rng, i):
    """A crack in hard ground: a dark see-through line (it darkens whatever ground it lies on), forking once or
    twice, with a fainter shadow along its lower side."""
    x, y = int(rng.integers(2, 5)), int(rng.integers(5, 9))
    dark, soft = hx("#140a26", 170), hx("#140a26", 70)
    forks = {int(rng.integers(3, 6)), int(rng.integers(7, 10))}
    for k in range(10 + i % 3):
        put(img, x, y, dark)
        if not img[y + 1, x, 3]:
            put(img, x, y + 1, soft)
        if k in forks and 3 < y < 12:
            dy = -1 if (k + i) % 2 else 1
            put(img, x + 1, y + dy, dark)
            put(img, x + 2, y + 2 * dy, dark)
        x += 1
        step = int(rng.integers(-1, 2)) if k % 2 else 0
        y = min(11, max(4, y + step))
        if x >= T - 2:
            break


def mushrooms(img, rng, i):
    dark, mid, light = MUSH[i % 3]
    big = [".mm.", "mlmm", ".ss.", ".sd."]
    small = ["ml", "sd"]
    cm = {"m": mid, "l": light, "s": STEM[1], "d": SHADOW}
    scatter(img, rng, big, cm, 1)
    scatter(img, rng, small, cm, 1 + (i == 3))
    if i == 2:  # the glowing kind leaves a few spores
        scatter(img, rng, ["l"], {"l": light}, 2)


def snowdrift(img, rng, i):
    shapes = [["..lll..", ".lwwwl.", "lwwwwwm", ".mmmmm."], [".ll.", "lwwm", ".mm."], ["..ll", ".lwwl", "lwwwm", ".mmm."],
              ["lll..", "wwwl.", "wwwwm", "mmmm."]]
    cm = {"l": SNOW[5], "w": SNOW[4], "m": SNOW[2]}
    scatter(img, rng, shapes[i % 4], cm, 1)
    if i % 2 == 0:
        scatter(img, rng, ["l.", "dl", "ds"], {"l": hx("#c8a868"), "d": hx("#8a6a3e"), "s": hx("#2a3a80", 80)}, 1)


def cinders(img, rng, i):
    for k in range(5 + i % 3):
        scatter(img, rng, ["ab", "bc"] if k % 2 else ["ab"], {"a": CINDER[4], "b": CINDER[2], "c": CINDER[0]}, 1)
    for k in range(1 + i % 2):  # one or two still glowing
        scatter(img, rng, ["gh"] if k else ["g"], {"g": GLOW[2], "h": GLOW[4]}, 1)


# ---------- for the walled arenas: village, dungeon, fortress ----------

STRAW = ramp("#6a4a1c #a88234 #dcb650 #f4d672 #fff2b4")
RUG_RED = ramp("#3a1418 #5a2024 #7a3030 #9a4a40 #b46a54")
RUG_TEAL = ramp("#123034 #1c4a4c #2a6664 #44847a #6aa494")
RUG_OCHRE = ramp("#4a3214 #6e4c1c #946a2a #b88c40 #d4ae62")
CREAM = hx("#dccca4")
WEB = (hx("#eeecf8", 150), hx("#e0deee", 85))
DUST = hx("#d0c8c0", 70)


def seg(img, x0, y0, x1, y1, c):
    """A straight line inside the cell (kept one pixel clear of its border)."""
    n = int(max(abs(x1 - x0), abs(y1 - y0)))
    for k in range(n + 1):
        t = k / max(1, n)
        x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
        if 1 <= x < T - 1 and 1 <= y < T - 1:
            put(img, x, y, c)


def straw(img, rng, i):
    """Loose straws: short golden stalks, a darker end where they lie in their own shade."""
    bits = [["abbc", "..ss"], ["abc", ".ss"], ["a..", ".b.", ".sc", "..s"], ["..a", ".b.", "cs.", "s.."],
            ["ab...", "..bbc", "...ss"], ["...ba", "cbb..", "ss..."], ["a....", ".bb..", "..sbc", "...ss"]]
    cm = {"a": STRAW[4], "b": STRAW[3], "c": STRAW[1], "s": SHADOW}
    old = {"a": STRAW[2], "b": STRAW[1], "c": STRAW[0], "s": SHADOW}
    if i == 1:  # a loose little heap: stalks lying across each other
        x0, y0 = 3 + int(rng.integers(0, 3)), 4 + int(rng.integers(0, 3))
        for k in range(6):
            rows = bits[int(rng.integers(0, len(bits)))]
            stamp(img, x0 + int(rng.integers(0, 5)), y0 + int(rng.integers(0, 5)), rows, cm if k % 3 else old)
        return
    for k in range(5 if i == 0 else 4):
        scatter(img, rng, bits[int(rng.integers(0, len(bits)))], old if (i == 3 and k % 2) else cm, 1)


def rug(img, rng, i):
    """A small woven rug or mat lying flat: a border, a pattern in the field, fringes on the short ends."""
    if i == 2:  # a round braided mat: rings of ochre round a red middle
        for y in range(3, 13):
            for x in range(1, 15):
                dx, dy = (x + 0.5 - 8) / 6.4, (y + 0.5 - 8) / 4.6
                r = math.hypot(dx, dy)
                if r > 1:
                    continue
                if r < 0.3:
                    c = RUG_RED[3]
                elif r < 0.45:
                    c = RUG_RED[1]
                else:
                    ring_i = int(r * 7)
                    c = RUG_OCHRE[3] if ring_i % 2 else RUG_OCHRE[2]
                    if (x + y) % 3 == 0:
                        c = RUG_OCHRE[1] if ring_i % 2 == 0 else RUG_OCHRE[2]   # the braid's twist
                if dy > 0.75 or (r > 0.88 and dy > 0.3):
                    c = RUG_OCHRE[1]                                       # its near edge, a hair thick
                put(img, x, y, c)
        return
    pal, accent, x0, x1, y0, y1 = [
        (RUG_RED, RUG_OCHRE, 2, 13, 4, 11),
        (RUG_TEAL, RUG_OCHRE, 2, 13, 5, 10),
        None,
        (RUG_TEAL, RUG_RED, 3, 12, 4, 11),
    ][i]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            edge = x in (x0, x1) or y in (y0, y1)
            inner = x in (x0 + 1, x1 - 1) or y in (y0 + 1, y1 - 1)
            if i == 1:  # a runner in stripes
                c = pal[2] if not edge else pal[1]
                if not edge and (y - y0) % 2 == 0:
                    c = accent[3] if (y - y0) % 4 == 2 else pal[3]
                if not edge and x in (x0 + 3, x1 - 3) and (y - y0) % 2:
                    c = CREAM
            else:
                c = pal[1] if edge else accent[2] if inner else pal[2]
                mx, my = (x0 + x1) / 2, (y0 + y1) / 2   # a diamond in the middle
                d = abs(x - mx) / ((x1 - x0) / 2 - 1.5) + abs(y - my) / ((y1 - y0) / 2 - 1.5)
                if not edge and not inner:
                    if d < 0.45:
                        c = accent[3]
                    elif d < 0.8:
                        c = pal[3] if (x + y) % 2 else pal[2]
            if y == y1:
                c = pal[0]                    # its near edge, a hair thick
            put(img, x, y, c)
    for y in range(y0 + 1, y1, 1):  # fringes
        if (y - y0) % 2:
            put(img, x0 - 1, y, CREAM)
            put(img, x1 + 1, y, CREAM)


WEB_CORNER = [
    "mmmmmmmmmmmff.",
    "mm.m..mm..ff..",
    "m.m..m...f....",
    "mm.mm..ff.....",
    "m..mm.f.......",
    "m.m..m........",
    "mm..f.m.......",
    "mm.f...m......",
    "m..f....m.....",
    "m.f......f....",
    "mf............",
    "ff............",
    "f.............",
]
WEB_ORB = [
    ".............",
    "......m......",
    "..m.ffmff.m..",
    "...m..m..m...",
    "..f.mmmmm.f..",
    "..f.m.m.m.f..",
    ".mmmmmmmmmmm.",
    "..f.m.m.m.f..",
    "..f.mmmmm.f..",
    "...m..m..m...",
    "..m.ffmff.m..",
    "......m......",
]
WEB_TORN = [
    ".m............",
    ".mmm.......mm.",
    ".fm.mm...mmm..",
    ".fm.m.mmm.fm..",
    "..fmm...f.m...",
    "..f.mm..fm....",
    "...f..mmm.....",
    "...f.....f....",
    "....ff....f...",
    "......ff..f...",
    "........f.....",
    "........f.....",
]


def cobweb(img, rng, i):
    """Cobwebs: see-through silver threads that lighten whatever stone they're on. Cells 0 and 1 fill a corner
    (top left, top right: for the foot of a wall), cell 2 is a small round web with its spider in the middle,
    cell 3 a torn web sagging from two points."""
    cm = {"m": WEB[0], "f": WEB[1]}
    if i in (0, 1):
        stamp(img, 1, 1, WEB_CORNER, cm)
        if i == 1:
            img[:] = img[:, ::-1].copy()
    elif i == 2:
        stamp(img, 1, 1, WEB_ORB, cm)
        for x, y in ((6, 6), (8, 6), (6, 8), (8, 8)):   # the spider: legs, then its body over the web
            img[y, x] = hx("#1e1626", 150)
        img[7, 7] = hx("#1e1626")
        img[8, 7] = hx("#1e1626")
        img[6, 7] = hx("#5a4a66")
    else:
        stamp(img, 1, 1, WEB_TORN, cm)


def rubble(img, rng, i):
    """Broken stone: sharp chunks lit on their top faces, with a small shade each, in a haze of dust."""
    big = ["aaab.", "aabbc", "bbbcc", "ccccs"]
    block = ["aaaaa.", "abbbbc", "bbbbcc", "cccc.s"]
    heap = ["..ab...", ".aabbc.", "abbbcab", "bbcccbc", ".ccssc."]
    small = [["aab", "bcs"], ["ab", "cs"], ["a", "s"], ["ab.", "bcc", ".cs"]]
    cm = {"a": STONE[5], "b": STONE[3], "c": STONE[1], "s": SHADOW}
    warm = {"a": hx("#c8b098"), "b": hx("#8e7866"), "c": hx("#54463a"), "s": SHADOW}
    if i == 0:
        scatter(img, rng, big, cm, 1)
        for k in range(3):
            scatter(img, rng, small[k % 4], cm, 1)
    elif i == 1:  # a broken block of masonry, mortar still on it
        scatter(img, rng, block, cm, 1)
        for y in range(T):
            for x in range(T):
                if tuple(img[y, x]) == tuple(STONE[5]) and (y == 0 or not img[y - 1, x, 3]):
                    img[y, x] = hx("#e4dcd4")
        scatter(img, rng, small[1], warm, 1)
        scatter(img, rng, small[2], cm, 2)
    elif i == 2:  # gravel
        for k in range(7):
            scatter(img, rng, small[2 + k % 2] if k % 3 else small[1], cm if k % 4 else warm, 1)
    else:  # a little heap
        scatter(img, rng, heap, cm, 1)
        scatter(img, rng, small[2], cm, 2)
    for _ in range(9 if i != 2 else 6):  # dust
        x, y = int(rng.integers(1, T - 1)), int(rng.integers(2, T - 1))
        if not img[y, x, 3]:
            put(img, x, y, DUST)


DECALS_K = {
    "pebbles": (4, pebbles), "twigs": (4, twigs), "leaves": (4, leaves), "tuft": (4, tuft), "flowers": (6, flowers),
    "bones": (4, bones), "shells": (4, shells), "seaweed": (4, seaweed), "puddle": (4, puddle), "crack": (4, crack),
    "mushrooms": (4, mushrooms), "snowdrift": (4, snowdrift), "cinders": (4, cinders),
    "straw": (4, straw), "rug": (4, rug), "cobweb": (4, cobweb), "rubble": (4, rubble),
}
DECALS = {f"decal_{n}": (lambda n=n, k=k, f=f: cells(n, k, f)) for n, (k, f) in DECALS_K.items()}
