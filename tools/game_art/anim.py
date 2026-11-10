"""Frame animations for the hand-drawn creatures: walk, idle (the game adds a blink) and, for winged ones, fly.

Each look of a creature (its juvenile drawing and its hatchling drawing) is animated from its finished drawing:
every pixel belongs to a part (a parts grid, `_parts.txt` / `_parts_hatchling.txt`, one letter per pixel), and a
frame moves the parts with simple steps: legs swing from the hip, wings beat about their root, a tail bends, the
chest rises with a breath. `anim.json` / `anim_hatchling.json` in the creature's folder says where the hips,
roots and pivots are and how big the moves are; the guide is `game/art-src-16bit/creatures/ANIM_GUIDE.md`.

Moving pixel art without smearing it: the drawing is enlarged 8x with EPX (Scale2x three times), each frame pixel
looks up where it came from in that big picture (the RotSprite idea), and a pixel that lands within a quarter of a
pixel of where it was keeps its exact colour, so whatever doesn't move stays identical. A see-through pinhole left
by a move (an empty pixel with drawn pixels on three or four sides) is filled with its neighbours' colour, and
`fix` stamps in anim.json repaint pixels of a single frame by hand.

For each frame the tool also works out:
- the eyelids: the frame made again with the rig's blink stamps on the head; the pixels that differ (`lids`);
- the shirt mask: the frame pixels that came from the drawing's shirt area (beasts.shirt_mask);
- where worn things sit: each socket follows the part it rides on (hat and face the head, neck and back the
  body, held the part anim.json names), as a whole-pixel offset from the socket in rig.json.

    .venv/Scripts/python tools/game_art/anim.py grid <id> [--hatchling]      the drawing big with coordinates (_grid.png),
                                                                             and the parts in colour if it has a parts grid
    .venv/Scripts/python tools/game_art/anim.py start <id> spec.json [--hatchling] [--force]
                                         a first parts grid from polygons: {"t": poly, "W": poly, ...} (+ "legs": "auto"
                                         takes the legs from rig.json), the head from rig.json; prints it
    .venv/Scripts/python tools/game_art/anim.py preview <id> [--hatchling]   GIFs (_anim_<name>.gif, not committed) and a
                                                                             sheet (_anim_preview.png) in the creature's folder
    .venv/Scripts/python tools/game_art/anim.py zoom <id> <anim> [--hatchling]  every frame of one animation at 8x with a
                                                                             pixel grid (_anim_zoom.png), for checking seams
    (beasts.py build writes the game's frames with write())

Part letters: b body, h head, t tail, W near wing, w far wing, F near fore leg, f far fore leg, R near hind leg
(a biped's near leg), r far hind leg (a biped's far leg), A near arm, a far arm, e ear, plus any other letter for
a part that only moves with `extra` steps or rides on the body.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import beasts  # noqa: E402

SRC = Path(__file__).resolve().parents[2] / "game" / "art-src-16bit" / "creatures"  # (as beasts.SRC)
PAD = 28                     # empty margin round the drawing while moving parts (trimmed off afterwards)
ANIMS = ("idle", "walk", "fly")  # the built-in actions; anim.json may add more (see Look.actions)
NOT_ACTIONS = {"parts", "z", "legs", "pivot", "breathe", "sockets", "tail_radius", "tail_power", "fix", "drawings"}
CONTEXT = ("z", "legs", "pivot", "breathe", "sockets", "tail_radius", "tail_power")  # an action may set its own
MS = {"idle": [420, 300, 520, 300], "walk": 120, "fly": 100}
LEGS = "FfRr"
WINGS = "Ww"
ARMS = "Aa"
SOCKET_PART = {"hat": "h", "face": "h", "neck": "b", "held": "b", "back": "b"}
NAMES = {"juvenile": ("anim.json", "_parts.txt"), "hatchling": ("anim_hatchling.json", "_parts_hatchling.txt")}


# ---------- moving pixels ----------

def epx(a: np.ndarray) -> np.ndarray:
    """Scale2x (EPX) on an array of colour numbers (0 = empty): twice the size, edges kept sharp."""
    p = np.pad(a, 1, mode="edge")
    P, A, B, C, D = a, p[:-2, 1:-1], p[1:-1, 2:], p[1:-1, :-2], p[2:, 1:-1]  # self, above, right, left, below
    out = np.zeros((a.shape[0] * 2, a.shape[1] * 2), a.dtype)
    out[0::2, 0::2] = np.where((C == A) & (C != D) & (A != B), A, P)
    out[0::2, 1::2] = np.where((A == B) & (A != C) & (B != D), B, P)
    out[1::2, 0::2] = np.where((D == C) & (D != B) & (C != A), C, P)
    out[1::2, 1::2] = np.where((B == D) & (B != A) & (D != C), D, P)
    return out


def inverse(st, x, y):
    """Where a point of the frame (x, y: arrays, drawing pixels) came from, undoing one step."""
    kind = st[0]
    if kind == "move":                       # ("move", dx, dy)
        return x - st[1], y - st[2]
    if kind == "rot":                        # ("rot", px, py, degrees clockwise)
        _, px, py, deg = st
        c, s = math.cos(math.radians(-deg)), math.sin(math.radians(-deg))
        X, Y = x - px, y - py
        return px + X * c - Y * s, py + X * s + Y * c
    if kind == "bend":                       # ("bend", px, py, degrees, radius, power): more turn further out
        _, px, py, deg, radius, power = st
        X, Y = x - px, y - py
        a = -np.radians(deg) * np.minimum(1, np.sqrt(X * X + Y * Y) / radius) ** power  # (radius is kept: exact)
        c, s = np.cos(a), np.sin(a)
        return px + X * c - Y * s, py + X * s + Y * c
    if kind == "scale":                      # ("scale", px, py, fx, fy)
        _, px, py, fx, fy = st
        return px + (x - px) / fx, py + (y - py) / fy
    if kind == "sway":                       # ("sway", y0, y1, amp, wavelength, phase): rows shift sideways, more lower down
        _, y0, y1, amp, wl, ph = st
        t = np.clip((y - y0) / (y1 - y0), 0, 1)
        return x - amp * t * np.sin(2 * math.pi * (y - y0) / wl + ph), y
    if kind == "leg":                        # ("leg", hip x, hip y, foot y, swing, lift, bob)
        _, hx, hy, fy, swing, lift, bob = st  # the hip rides the body's bob, the foot swings and lifts, straight between
        if fy - hy <= bob + lift:
            raise SystemExit(f"leg step {st}: the hip must be more than bob + lift ({bob + lift}) rows above the foot")
        k = (bob + lift) / (fy - hy)          # forward, hy <= y <= fy: y' = y + bob - k (y - hy)
        ymid = (y - bob - k * hy) / (1 - k)
        yy = np.where(y - bob < hy, y - bob, np.where(ymid > fy, y + lift, ymid))
        return x - swing * np.clip((yy - hy) / (fy - hy), 0, 1), yy
    if kind == "breathe":                    # ("breathe", top, mid, x0, x1, amount): above `mid` rises, most at `top`
        _, top, mid, x0, x1, amount = st
        ramp = np.clip((mid - y) / (mid - top), 0, 1) * ((x >= x0) & (x <= x1))
        return x, y + amount * ramp
    raise ValueError(f"unknown step {kind!r}")


def forward(steps, x: float, y: float) -> tuple[int, int]:
    """Where pixel (x, y) of the drawing goes: the frame pixel whose source is nearest it."""
    gy, gx = np.mgrid[-20:21, -20:21]
    cx, cy = gx + math.floor(x) + 0.5, gy + math.floor(y) + 0.5
    sx, sy = cx.astype(float), cy.astype(float)
    for st in reversed(steps):
        sx, sy = inverse(st, sx, sy)
    d = (sx - x - 0.5) ** 2 + (sy - y - 0.5) ** 2
    j = np.unravel_index(np.argmin(d), d.shape)
    return int(gx[j] + math.floor(x)), int(gy[j] + math.floor(y))


def pinholes(a: np.ndarray) -> np.ndarray:
    """Empty pixels with drawn pixels on three or four sides."""
    up, dn, lf, rt = np.zeros_like(a), np.zeros_like(a), np.zeros_like(a), np.zeros_like(a)
    up[1:], dn[:-1], lf[:, 1:], rt[:, :-1] = a[:-1], a[1:], a[:, :-1], a[:, 1:]
    return (a == 0) & ((up > 0).astype(int) + (dn > 0) + (lf > 0) + (rt > 0) >= 3)


def fill_holes(a: np.ndarray, src: np.ndarray, drawn: np.ndarray | None = None) -> None:
    """An empty pixel with drawn pixels on three or four sides is a pinhole a move left: give it their commonest
    colour (and the source of one of them). A gap the drawing itself has stays a gap wherever its part moved it
    (`drawn`, the drawing on the same grid as `src`): it is one when two opposite neighbours came from drawing
    pixels two apart with an empty drawing pixel between them (the gap between two talons, in a crest). In place."""
    up, dn, lf, rt = np.zeros_like(a), np.zeros_like(a), np.zeros_like(a), np.zeros_like(a)
    up[1:], dn[:-1], lf[:, 1:], rt[:, :-1] = a[:-1], a[1:], a[:, :-1], a[:, 1:]
    holes = pinholes(a)
    if drawn is not None:
        holes &= ~pinholes(drawn)
    h, w = a.shape

    def drawn_gap(y, x) -> bool:
        if drawn is None:
            return False
        for (y0, x0), (y1, x1), (dy, dx) in (((y - 1, x), (y + 1, x), (1, 0)), ((y, x - 1), (y, x + 1), (0, 1))):
            if not (0 <= y0 and 0 <= x0 and y1 < h and x1 < w):
                continue
            (sy0, sx0), (sy1, sx1) = src[:, y0, x0], src[:, y1, x1]
            if sy0 >= 0 and sy1 >= 0 and sy1 - sy0 == 2 * dy and sx1 - sx0 == 2 * dx and not drawn[sy0 + dy, sx0 + dx]:
                return True
        return False

    for y, x in zip(*np.nonzero(holes)):
        if drawn_gap(y, x):
            continue
        n = [(v, s) for v, s in ((up[y, x], (y - 1, x)), (dn[y, x], (y + 1, x)), (lf[y, x], (y, x - 1)), (rt[y, x], (y, x + 1))) if v]
        cols = [v for v, _ in n]
        best = max(set(cols), key=cols.count)
        a[y, x] = best
        src[:, y, x] = src[:, n[cols.index(best)][1][0], n[cols.index(best)][1][1]]


# ---------- one look of a creature ----------

class Drawing:
    """One finished drawing of a look, on the look's shared working canvas: its main drawing, or another one an
    action uses (anim.json `drawings`: {"stand": {"rig": "rig_stand.json", "parts": "_parts_stand.txt",
    "offset": [0, -11]}}, the forest stag standing up to walk). `offset` is where its top-left pixel sits in the
    main drawing's coordinates; its rig gives its art, head and blink stamps, sockets and shirt area."""

    def __init__(self, look, name: str, rig: dict, rows: list[str], prow: list[str], offset):
        self.name, self.rig, self.rows, self.off = name, rig, rows, tuple(offset)
        self.dh, self.dw = len(rows), len(rows[0])
        self.img0 = np.array([[look.num.get(ch, 0) for ch in r] for r in rows], np.int16)
        self.parts0 = np.array([[ord(ch) for ch in r] for r in prow], np.int16)
        if self.parts0.shape != self.img0.shape or ((self.parts0 == ord(".")) != (self.img0 == 0)).any():
            bad = [(x, y) for y in range(min(len(prow), self.dh)) for x in range(self.dw)
                   if (prow[y][x] == ".") != (rows[y][x] == ".")]
            raise SystemExit(f"{look.cid} {look.form} {name}: the parts grid must cover exactly the drawing's pixels "
                             f"(differs at {bad[:8]})")
        self.has = {chr(c) for c in np.unique(self.parts0)} - {"."}
        layers = beasts.cut(rig, rows)
        self.mask = beasts.shirt_mask(rig, layers)
        self.box = beasts.bbox_of(layers)
        self.shut0 = self.img0.copy()
        for (x, y), ch in layers["blink"].items():
            if (x, y) not in layers["head"] or layers["head"][(x, y)] != ch:
                self.shut0[y, x] = look.num[ch]

    def place(self, W: int, H: int, cx: int, cy: int):
        """Onto the shared canvas (W x H), its top-left pixel at (cx, cy)."""
        self.cx, self.cy = cx, cy

        def embed(a, fill=0):
            out = np.full((H, W), fill, a.dtype)
            out[cy:cy + self.dh, cx:cx + self.dw] = a
            return out
        self.parts = embed(self.parts0, ord("."))
        self.img = {"open": embed(self.img0), "shut": embed(self.shut0)}
        self.big = {}
        for k, a in self.img.items():
            for _ in range(3):
                a = epx(a)
            self.big[k] = a
        self.owner = np.repeat(np.repeat(self.parts, 8, 0), 8, 1)
        self.maskmap = np.zeros((H, W), bool)
        for (mx, my) in self.mask:
            self.maskmap[my + cy, mx + cx] = True


class Look:
    def __init__(self, cid: str, form: str = "juvenile"):
        self.cid, self.form = cid, form
        self.rig, rows, self.pal = beasts.load(cid, form)
        # (drawn with wings: said in the juvenile's rig.json only, for both looks)
        self.wings = bool(self.rig.get("wings") or json.loads((SRC / cid / "rig.json").read_text(encoding="utf-8")).get("wings"))
        aname, pname = NAMES[form]
        self.spec = json.loads((SRC / cid / aname).read_text(encoding="utf-8"))
        self.letters = sorted(self.pal)
        self.num = {ch: i + 1 for i, ch in enumerate(self.letters)}
        self.colour = {i + 1: self.pal[ch] for i, ch in enumerate(self.letters)}
        read = lambda f: [r for r in (SRC / cid / f).read_text(encoding="utf-8").split() if r]  # noqa: E731
        self.main = Drawing(self, "main", self.rig, rows, read(self.spec.get("parts", pname)), (0, 0))
        self.drawings = {"main": self.main}
        for name, d in self.spec.get("drawings", {}).items():
            rig = json.loads((SRC / cid / d["rig"]).read_text(encoding="utf-8"))
            if rig["palette"] != self.rig["palette"]:
                raise SystemExit(f"{cid} {form} {name}: its rig's palette must be the main rig's")
            self.drawings[name] = Drawing(self, name, rig, read(rig["art"]), read(d["parts"]), d.get("offset", (0, 0)))
        # the shared working canvas: every drawing with an empty margin of PAD round it
        ds = self.drawings.values()
        gx0, gy0 = min(d.off[0] for d in ds) - PAD, min(d.off[1] for d in ds) - PAD
        gx1, gy1 = max(d.off[0] + d.dw for d in ds) + PAD, max(d.off[1] + d.dh for d in ds) + PAD
        self.w, self.h = gx1 - gx0, gy1 - gy0
        for d in ds:
            d.place(self.w, self.h, d.off[0] - gx0, d.off[1] - gy0)
        self.px0, self.py0 = self.main.cx, self.main.cy  # where the main drawing's top-left is on the canvas
        # (the main drawing, as before)
        self.rows, self.dh, self.dw, self.has, self.mask, self.box = rows, self.main.dh, self.main.dw, self.main.has, self.main.mask, self.main.box
        self.img, self.parts = self.main.img, self.main.parts
        self.d, self.ctx = self.main, self.spec  # the drawing and settings the action being made uses

    # one frame
    def render(self, steps: dict, eyes: str = "open", d: Drawing | None = None):
        """steps: part letter -> forward steps (in drawing `d`'s own pixels; the main drawing unless given).
        Returns colour numbers and, per pixel, the canvas pixel it came from ([y, x], -1 where empty)."""
        d = d or self.main
        ys, xs = np.mgrid[0:self.h, 0:self.w]
        out = np.zeros((self.h, self.w), np.int16)
        src = np.full((2, self.h, self.w), -1, np.int32)
        img, big = d.img[eyes], d.big[eyes]
        for part in self.z(d):
            sx, sy = xs + 0.5 - d.cx, ys + 0.5 - d.cy
            for st in reversed(steps.get(part, [])):
                sx, sy = inverse(st, sx, sy)
            sx, sy = sx + d.cx, sy + d.cy
            ix, iy = np.floor(sx).astype(int), np.floor(sy).astype(int)
            ok = (ix >= 0) & (iy >= 0) & (ix < self.w) & (iy < self.h)
            ixc, iyc = np.clip(ix, 0, self.w - 1), np.clip(iy, 0, self.h - 1)
            bx = np.clip(np.floor(sx * 8).astype(int), 0, self.w * 8 - 1)
            by = np.clip(np.floor(sy * 8).astype(int), 0, self.h * 8 - 1)
            exact = ok & (np.abs(sx - ix - 0.5) < 0.25) & (np.abs(sy - iy - 0.5) < 0.25) & (d.parts[iyc, ixc] == ord(part))
            own = (ok & (d.owner[by, bx] == ord(part))) | exact
            col = np.where(exact, img[iyc, ixc], big[by, bx])
            put = own & (col != 0)
            out[put] = col[put]
            src[0][put], src[1][put] = iyc[put], ixc[put]
        if np.count_nonzero(out[:2]) or np.count_nonzero(out[-2:]) or np.count_nonzero(out[:, :2]) or np.count_nonzero(out[:, -2:]):
            raise SystemExit(f"{self.cid} {self.form}: a frame reaches the edge of the {PAD}px margin; make the move smaller")
        fill_holes(out, src, img)
        return out, src

    def z(self, d: Drawing | None = None) -> str:
        has = (d or self.d).has
        z = self.ctx.get("z", "wrfatbRFAhW")
        return "".join(p for p in z if p in has) + "".join(sorted(has - set(z)))

    def actions(self) -> list[str]:
        """Its actions: idle and walk, fly if it has wings, then any other named in anim.json (an action of its own
        there is {"like": "walk" | "idle" | "fly", ...that preset's numbers} or {"custom": [...], "ms": [...]}, and
        "loop": false makes it play once, e.g. a jump). The game falls back to walk or idle for one a creature lacks
        (render.js ACTION_FALLBACK), so a mini-game can ask for "swim" before it is drawn."""
        extra = [k for k, v in self.spec.items() if k not in NOT_ACTIONS and k not in ANIMS and isinstance(v, dict)]
        return [k for k in ANIMS if k != "fly" or self.wings] + extra

    # what each animation does in each frame
    def plan(self, anim: str) -> tuple[list[dict], list[int]]:
        """Per frame, part -> steps; and each frame's time in ms."""
        sp = self.spec
        if anim == "fly" and not self.wings:  # only a creature drawn with wings flies
            return [], []
        a = sp.get(anim) or {}
        self.d = self.drawings[a.get("drawing", "main")]
        self.ctx = {**sp, **{k: a[k] for k in CONTEXT if k in a}}  # (its own hips, pivots... for another drawing)
        like = a.get("like", anim)
        if "custom" in a:
            frames = [{k: [tuple(s) for s in v] for k, v in fr.items()} for fr in a["custom"]]
        elif like in ANIMS:
            frames = getattr(self, f"_{like}")(a)
        else:
            raise SystemExit(f"{self.cid} {self.form}: action {anim!r} needs \"custom\" frames or \"like\": one of {ANIMS}")
        for i, extra in enumerate(a.get("extra", [])):  # more steps on some frames
            for part, sts in (extra or {}).items():
                frames[i].setdefault(part, []).extend(tuple(s) for s in sts)
        ms = a.get("ms", MS.get(like))
        if ms is None:
            raise SystemExit(f"{self.cid} {self.form} {anim}: give its frames' times (\"ms\")")
        ms = ms if isinstance(ms, list) else [ms] * len(frames)
        if len(ms) != len(frames):
            raise SystemExit(f"{self.cid} {self.form} {anim}: {len(frames)} frames but {len(ms)} times")
        return frames, ms

    def _legs(self):
        return {k: v for k, v in self.ctx.get("legs", {}).items() if k in self.d.has}

    def _pivot(self, part, default=None):
        p = self.ctx.get("pivot", {}).get(part)
        return p if p else default

    def _tail(self, deg):
        p = self._pivot("t")
        if "t" not in self.d.has or not p or not deg:
            return []
        ys, xs = np.nonzero(self.d.parts == ord("t"))
        radius = self.ctx.get("tail_radius") or float(np.max(np.hypot(xs - self.d.cx + 0.5 - p[0], ys - self.d.cy + 0.5 - p[1])))
        return [("bend", p[0], p[1], deg, radius, self.ctx.get("tail_power", 1.3))]

    def _walk(self, a):
        n = a.get("frames", 6)
        S, L, B = a.get("swing", 2), a.get("lift", 2), a.get("bob", 1)
        gait = {"F": 0.5, "f": 0, "R": 0, "r": 0.5, **a.get("gait", {})}
        legs = self._legs()
        frames = []
        for f in range(n):
            p = f / n
            bob = B if legs and f % max(1, n // 2) == 0 else 0
            if not legs:  # a floater or a blob drifts up and down as it goes
                bob = round(-B * math.sin(2 * math.pi * p))
            st = {}
            for leg, (hx, hy, fy) in legs.items():
                ang = 2 * math.pi * (p + gait.get(leg, 0))
                st[leg] = [("leg", hx, hy, fy, round(S * math.cos(ang)), round(L * max(0, -math.sin(ang))), bob)]
            for arm in ARMS:
                if arm in self.d.has and self._pivot(arm):
                    ang = 2 * math.pi * (p + (0 if arm == "A" else 0.5))  # (the near arm swings back as the near leg steps forward)
                    st[arm] = [("rot", *self._pivot(arm), a.get("arm", 8) * math.cos(ang)), ("move", 0, bob)]
            for part in self.d.has - set(legs) - set(st):
                st[part] = [("move", 0, bob)]
            st["t"] = self._tail(a.get("tail", 5) * math.sin(2 * math.pi * p)) + st.get("t", [])
            for w in WINGS:
                if w in self.d.has and a.get("flap") and self._pivot(w):
                    st[w] = [("rot", *self._pivot(w), a["flap"][f % len(a["flap"])])] + st.get(w, [])
            frames.append(st)
        return frames

    def _idle(self, a):
        breath = a.get("breath", [0, 1, 1, 0])
        tail = a.get("tail", [0, 2, 4, 2])  # (frame 0 is the drawing as drawn: the still picture)
        box = self.ctx.get("breathe")
        rides = set(a.get("rides", "hWwAae")) & self.d.has
        frames = []
        for f, b in enumerate(breath):
            st = {}
            if box and b:
                st["b"] = [("breathe", *box, b)]
            for part in rides if box else ():  # (no breathing body, nothing to ride up on)
                st[part] = [("move", 0, -b)]
            st["t"] = self._tail(tail[f % len(tail)]) + st.get("t", [])
            frames.append(st)
        return frames

    def _fly(self, a):
        flap = a.get("flap", [18, -12, -62, -12])
        lift = a.get("lift", [8, 9, 10, 9])
        tail = a.get("tail", [-6, -3, 0, -3])
        tuck = {"F": [-4, 3], "f": [-3, 3], "R": [-5, 2], "r": [-4, 2], **a.get("tuck", {})}
        legs = self._legs()
        frames = []
        for f in range(len(lift)):
            st = {}
            for leg, (hx, hy, fy) in legs.items():
                st[leg] = [("leg", hx, hy, fy, tuck[leg][0], tuck[leg][1], 0)]
            for w in WINGS:
                if w in self.d.has and self._pivot(w):
                    angles = a.get(f"flap_{w}", flap)
                    st[w] = [("rot", *self._pivot(w), angles[f % len(angles)])]
            st["t"] = self._tail(tail[f % len(tail)])
            for part in self.d.has:  # the whole creature rises and falls with the beat
                st.setdefault(part, []).append(("move", 0, -lift[f]))
            frames.append(st)
        return frames

    # every frame, finished
    def frames(self, anim: str) -> dict | None:
        plan, ms = self.plan(anim)
        if not plan:
            return None
        fixes = self.spec.get("fix", {}).get(anim, {})
        d = self.d  # (set by plan)
        out = []
        for i, st in enumerate(plan):
            col, src = self.render(st, d=d)
            shut, _ = self.render(st, "shut", d)
            for stamp in fixes.get(str(i), []):
                self.stamp(col, stamp, d)
                self.stamp(shut, stamp, d)
            lids = np.where(shut != col, shut, 0)
            ys, xs = src
            masked = (ys >= 0) & d.maskmap[np.clip(ys, 0, None), np.clip(xs, 0, None)] & (col != 0)
            at = {}
            for slot, (sx, sy, *turn) in d.rig["sockets"].items():
                part = self.ctx.get("sockets", {}).get(slot, SOCKET_PART[slot])
                part = part if part in d.has else "b"
                fx, fy = forward(st.get(part, []), sx, sy)
                # where the socket is now, from where it is in the main drawing (rig.json): for another drawing that
                # also says how its sockets differ (a standing stag's chest is higher)
                mx, my, *mturn = self.rig["sockets"][slot]
                # a part that turns (an arm swinging) turns what it holds too: a third number, degrees clockwise
                deg = round(sum(step[3] for step in st.get(part, []) if step[0] == "rot")
                            + (turn[0] if turn else 0) - (mturn[0] if mturn else 0))
                at[slot] = [fx + d.off[0] - mx, fy + d.off[1] - my] + ([deg] if deg else [])
            out.append({"img": col, "lids": lids, "shirt": masked, "src": (ys - d.cy, xs - d.cx), "at": at})
        return {"frames": out, "ms": ms, "once": (self.spec.get(anim) or {}).get("loop", True) is False}

    def stamp(self, a: np.ndarray, st: dict, d: Drawing | None = None) -> None:
        """A `fix` stamp, in drawing `d`'s own pixels (the drawing the action moves)."""
        d = d or self.main
        x0, y0 = st["at"]
        for dy, line in enumerate(st["rows"]):
            for dx, ch in enumerate(line):
                if ch == ".":
                    continue
                a[y0 + dy + d.cy, x0 + dx + d.cx] = 0 if ch == "_" else self.num[ch]

    def all(self) -> dict:
        return {k: v for k in self.actions() if (v := self.frames(k))}

    def image(self, a: np.ndarray, box=None) -> Image.Image:
        rgba = np.zeros(a.shape + (4,), np.uint8)
        for n, c in self.colour.items():
            rgba[a == n] = c + (255,)
        im = Image.fromarray(rgba, "RGBA")
        return im.crop(box) if box else im


# ---------- what the game gets ----------

def trim_box(anims: dict) -> tuple[int, int, int, int]:
    """The smallest box (in padded coordinates) holding every frame of every animation."""
    acc = None
    for a in anims.values():
        for fr in a["frames"]:
            acc = fr["img"] != 0 if acc is None else acc | (fr["img"] != 0)
    ys, xs = np.nonzero(acc)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def write(cid: str, form: str, folder: Path, lua: list | None = None) -> dict:
    """The game's frames for one look: <anim>.png (row 1 the frames, row 2 the eyelids) and <anim>_shirt.png (the
    shirt mask) for idle, walk and fly; returns what beasts.js says about them. With `lua`, also adds the lines that
    save <id>.aseprite."""
    look = Look(cid, form)
    anims = look.all()
    x0, y0, x1, y1 = trim_box(anims)
    cw, ch = x1 - x0, y1 - y0
    meta = {"cell": [cw, ch, look.px0 - x0, look.py0 - y0]}  # a frame's size, and where the drawing's top-left is in it
    for name in set(ANIMS) | set(look.spec) - NOT_ACTIONS:  # (an action it no longer has)
        for suffix in ("", "_shirt"):
            p = folder / f"{name}{suffix}.png"
            if p.exists() and name not in anims:
                p.unlink()
    for name, a in anims.items():
        n = len(a["frames"])
        sheet = Image.new("RGBA", (cw * n, ch * 2), (0, 0, 0, 0))
        shirt = Image.new("RGBA", (cw * n, ch), (0, 0, 0, 0))
        for i, fr in enumerate(a["frames"]):
            sheet.alpha_composite(look.image(fr["img"], (x0, y0, x1, y1)), (i * cw, 0))
            sheet.alpha_composite(look.image(fr["lids"], (x0, y0, x1, y1)), (i * cw, ch))
            # the shirt mask says which drawing pixel each shirt pixel came from (red = x, green = y), so the
            # shirt's pattern moves with the body (render.js shirted)
            m = np.zeros((ch, cw, 4), np.uint8)
            sel = fr["shirt"][y0:y1, x0:x1]
            m[..., 0][sel] = fr["src"][1][y0:y1, x0:x1][sel]
            m[..., 1][sel] = fr["src"][0][y0:y1, x0:x1][sel]
            m[..., 2][sel] = 255
            m[..., 3][sel] = 255
            shirt.alpha_composite(Image.fromarray(m, "RGBA"), (i * cw, 0))
        sheet.save(folder / f"{name}.png")
        if look.mask:
            shirt.save(folder / f"{name}_shirt.png")
        elif (folder / f"{name}_shirt.png").exists():
            (folder / f"{name}_shirt.png").unlink()
        meta[name] = {"frames": n, "ms": a["ms"], "once": a["once"],
                      "at": {slot: [fr["at"][slot] for fr in a["frames"]] for slot in look.rig["sockets"]}}
        # an action that reaches well above the drawing (the stag standing up, a wing beat) says how high, in the
        # drawing's rows, so what floats over the creature (its hearts) can stay clear of it (render.beastHeight)
        top = min(int(np.nonzero(fr["img"].any(axis=1))[0][0]) for fr in a["frames"]) - look.py0
        if top < look.box[1] - 2:
            meta[name]["top"] = top
    if lua is not None:
        lua += lua_for(cid, form, look, anims)
    return meta


def anim_js(meta: dict) -> str:
    """beasts.js text for one look's animations."""
    parts = [f"cell: [{', '.join(map(str, meta['cell']))}]"]
    for name, m in meta.items():
        if name == "cell":
            continue
        at = ", ".join(f"{slot}: [{', '.join('[' + ', '.join(map(str, d)) + ']' for d in v)}]" for slot, v in m["at"].items())
        once = "once: true, " if m.get("once") else ""
        top = f"top: {m['top']}, " if "top" in m else ""
        parts.append(f"{name}: {{ frames: {m['frames']}, ms: [{', '.join(map(str, m['ms']))}], {once}{top}at: {{ {at} }} }}")
    return "anims: {\n      " + ",\n      ".join(parts) + " }"


def lua_for(cid: str, form: str, look: Look, anims: dict) -> list[str]:
    """Aseprite script lines: <id>.aseprite (or <id>_hatchling.aseprite) with every frame, its eyelids on a hidden
    layer, and a tag per animation (play them with Aseprite's tag buttons)."""
    x0, y0, x1, y1 = trim_box(anims)
    w, h = x1 - x0, y1 - y0
    seq = [(name, i, fr, a["ms"][i]) for name, a in anims.items() for i, fr in enumerate(a["frames"])]
    out = [f"do local spr = Sprite({w}, {h}, ColorMode.RGB)", "spr.layers[1].name = 'creature'",
           "local lids = spr:newLayer() lids.name = 'eyelids' lids.isVisible = false"]
    for k in range(1, len(seq)):
        out.append("spr:newEmptyFrame()")
    for k, (name, i, fr, ms) in enumerate(seq):
        out.append(f"spr.frames[{k + 1}].duration = {ms / 1000}")
        for layer, arr in ((1, fr["img"]), (2, fr["lids"])):
            out.append(f"do local img = Image({w}, {h}, ColorMode.RGB)")
            ys, xs = np.nonzero(arr[y0:y1, x0:x1])
            for y, x in zip(ys, xs):
                r, g, b = look.colour[int(arr[y + y0, x + x0])]
                out.append(f"img:drawPixel({x},{y},Color{{r={r},g={g},b={b},a=255}})")
            out.append(f"spr:newCel(spr.layers[{layer}], {k + 1}, img, Point(0, 0)) end")
    k = 1
    for name, a in anims.items():
        n = len(a["frames"])
        out.append(f"do local t = spr:newTag({k}, {k + n - 1}) t.name = '{name}' end")
        k += n
    path = (SRC / cid / (f"{cid}.aseprite" if form == "juvenile" else f"{cid}_hatchling.aseprite")).as_posix()
    out.append(f'spr:saveAs("{path}") spr:close() end')
    return out


# ---------- checking it by eye ----------

def preview(cid: str, form: str = "juvenile", scale: int = 5) -> list[Path]:
    """_anim_<name>.gif for each animation (on a strip of ground, with the shadow and a cap, glasses and a book on
    the second copy) and _anim_preview.png (every frame, then the eyelids and the shirt area in colour)."""
    look = Look(cid, form)
    anims = look.all()
    x0, y0, x1, y1 = trim_box(anims)
    x0, y0, x1 = x0 - 4, y0 - 14, x1 + 4
    gy = look.py0 + look.box[3] + 1 + look.rig.get("hover", 0) - y0  # the ground: under the drawing's lowest pixel (a floater above it)
    W, H = x1 - x0, gy + 6
    shadow = Image.open(beasts.ROOT / "web" / "game-art" / "fx" / "shadow_m.png").convert("RGBA")
    s = "small/" if form == "hatchling" else ""
    dressed = {slot: Image.open(beasts.ITEMS / f"{s}{f}").convert("RGBA") for slot, f in
               (("hat", "hat/cap.png"), ("face", "face/round_glasses.png"), ("held", "held/book.png"))}
    so = look.rig["sockets"]
    mid = (look.box[0] + look.box[2]) // 2 + look.px0 - x0
    paths = []
    folder = SRC / cid
    tag = "" if form == "juvenile" else "_hatchling"
    for name, a in anims.items():
        imgs = []
        for i, fr in enumerate(a["frames"]):
            row = Image.new("RGBA", (W * 2, H), (58, 50, 82, 255))
            d = ImageDraw.Draw(row)
            d.rectangle([0, gy, W * 2, H], fill=(70, 88, 62, 255))
            for c in range(2):
                row.alpha_composite(shadow, (c * W + mid - shadow.width // 2, gy - shadow.height // 2))
                row.alpha_composite(look.image(fr["img"], (x0, y0, x1, y0 + H)), (c * W, 0))
                if c:
                    for slot, im in dressed.items():
                        sx, sy, *turn = so[slot]
                        dx, dy, *more = fr["at"][slot]  # (a third number: this frame turns it further)
                        im2, (ax, ay) = beasts.rotated(im, beasts.SLOTS[slot], (turn[0] if turn else 0) + (more[0] if more else 0))
                        row.alpha_composite(im2, (W + sx + dx - ax + look.px0 - x0, sy + dy - ay + look.py0 - y0))
            imgs.append(row.resize((W * 2 * scale, H * scale), Image.NEAREST).convert("P", palette=Image.ADAPTIVE, colors=255))
        p = folder / f"_anim{tag}_{name}.gif"
        imgs[0].save(p, save_all=True, append_images=imgs[1:], duration=a["ms"], loop=0, disposal=1)
        paths.append(p)
    # the sheet: frames, then eyelids (red) and shirt area (yellow) over a faded copy
    cols = max(len(a["frames"]) for a in anims.values())
    sheet = Image.new("RGBA", (cols * W * 2 + 8, len(anims) * (H + 6)), (40, 34, 56, 255))
    for r, (name, a) in enumerate(anims.items()):
        for i, fr in enumerate(a["frames"]):
            sheet.alpha_composite(look.image(fr["img"], (x0, y0, x1, y0 + H)), (i * W, r * (H + 6)))
            faded = look.image(fr["img"], (x0, y0, x1, y0 + H))
            faded.putalpha(faded.getchannel("A").point(lambda v: v // 3))
            over = np.zeros((H, W, 4), np.uint8)
            over[fr["shirt"][y0:y0 + H, x0:x1]] = (255, 220, 40, 255)
            over[fr["lids"][y0:y0 + H, x0:x1] != 0] = (255, 60, 60, 255)
            faded.alpha_composite(Image.fromarray(over, "RGBA"))
            sheet.alpha_composite(faded, (cols * W + 8 + i * W, r * (H + 6)))
    sheet = sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST)
    p = folder / f"_anim{tag}_preview.png"
    sheet.save(p)
    return paths + [p]


PART_COLOURS = {"b": (190, 190, 190), "h": (255, 70, 70), "t": (255, 160, 40), "W": (60, 200, 255), "w": (40, 110, 220),
                "F": (60, 220, 90), "f": (30, 130, 60), "R": (230, 230, 60), "r": (150, 150, 30), "A": (255, 120, 220),
                "a": (170, 60, 150), "e": (255, 200, 200)}


def grid(cid: str, form: str = "juvenile") -> Path:
    """The drawing at 14x with coordinates every 2 pixels; beside it the parts in colour, if there is a parts grid."""
    from PIL import ImageFont
    rig, rows, pal = beasts.load(cid, form)
    pfile = SRC / cid / NAMES[form][1]
    prow = [r for r in pfile.read_text(encoding="utf-8").split() if r] if pfile.exists() else None
    S, M = 14, 30
    font = ImageFont.truetype("arial.ttf", 10)
    w, h = len(rows[0]), len(rows)
    panels = 2 if prow else 1
    im = Image.new("RGB", (panels * (w * S + M) + 10, h * S + M), (40, 34, 56))
    d = ImageDraw.Draw(im)
    for k in range(panels):
        ox = k * (w * S + M + 10)
        for y in range(h):
            for x in range(w):
                ch = rows[y][x]
                X, Y = ox + M + x * S, M + y * S
                if ch == ".":
                    fill = (52, 46, 70) if (x + y) % 2 else (46, 40, 64)
                elif k == 0:
                    fill = pal[ch]
                else:
                    c = PART_COLOURS.get(prow[y][x], (255, 255, 255))
                    lum = sum(pal[ch]) / 765
                    fill = tuple(int(v * (0.55 + 0.45 * lum)) for v in c)
                d.rectangle([X, Y, X + S - 1, Y + S - 1], fill=fill)
        for x in range(0, w, 2):
            d.text((ox + M + x * S + 1, 2 + (x % 4 == 0) * 12), str(x), fill=(255, 220, 120), font=font)
            if x % 4 == 0:
                d.line([ox + M + x * S, M, ox + M + x * S, im.height], fill=(110, 100, 140))
        for y in range(0, h, 2):
            d.text((ox + 2, M + y * S + 1), str(y), fill=(255, 220, 120), font=font)
            if y % 4 == 0:
                d.line([ox + M, M + y * S, ox + M + w * S, M + y * S], fill=(110, 100, 140))
    out = SRC / cid / ("_grid.png" if form == "juvenile" else "_grid_hatchling.png")
    im.save(out)
    return out


def start(cid: str, spec: dict, form: str = "juvenile", force: bool = False) -> list[str]:
    """A first parts grid from polygons (precedence: legs, head, then the spec's other keys in order, else body)."""
    rig, rows, _pal = beasts.load(cid, form)
    spec = dict(spec)
    if spec.pop("legs", None) == "auto":  # near legs = legs_front, far = legs_back; the right-most of each is the fore leg
        for layer, (fore, hind) in (("legs_front", "FR"), ("legs_back", "fr")):
            ps = sorted(beasts.polys(rig.get(layer)), key=lambda p: -max(q[0] for q in p))
            if ps:
                spec.setdefault(fore if len(ps) > 1 or rig["plan"] != "biped" else hind, ps[0])
            if len(ps) > 1:
                spec.setdefault(hind, ps[1:])
    spec.setdefault("h", rig["head"])
    order = [k for k in LEGS + ARMS if k in spec] + ["h"] + [k for k in spec if k not in LEGS + ARMS + "h"]
    out = []
    for y, row in enumerate(rows):
        line = ""
        for x, ch in enumerate(row):
            to = "." if ch == "." else next((k for k in order if any(beasts.inside(p, x + 0.5, y + 0.5) for p in beasts.polys(spec[k]))), "b")
            line += to
        out.append(line)
    p = SRC / cid / NAMES[form][1]
    if p.exists() and not force:
        print(f"{p} exists; not overwritten (--force to replace it)")
    else:
        p.write_text("\n".join(out) + "\n", encoding="utf-8", newline="\n")
    return out


def zoom(cid: str, anim: str, form: str = "juvenile") -> Path:
    """Every frame of one animation at 8x, side by side, with a faint pixel grid."""
    look = Look(cid, form)
    a = look.frames(anim)
    x0, y0, x1, y1 = trim_box({anim: a})
    S = 8
    W, H = (x1 - x0) * S, (y1 - y0) * S
    im = Image.new("RGB", (len(a["frames"]) * (W + 8), H), (20, 18, 30))
    for i, fr in enumerate(a["frames"]):
        bg = Image.new("RGBA", (x1 - x0, y1 - y0), (58, 50, 82, 255))
        bg.alpha_composite(look.image(fr["img"], (x0, y0, x1, y1)))
        big = bg.resize((W, H), Image.NEAREST)
        d = ImageDraw.Draw(big)
        for x in range(0, W, S):
            d.line([x, 0, x, H], fill=(0, 0, 0, 60) if (x // S) % 4 else (255, 255, 255, 40))
        for y in range(0, H, S):
            d.line([0, y, W, y], fill=(0, 0, 0, 60) if (y // S) % 4 else (255, 255, 255, 40))
        im.paste(big.convert("RGB"), (i * (W + 8), 0))
    out = SRC / cid / f"_anim_zoom{'' if form == 'juvenile' else '_hatchling'}_{anim}.png"
    im.save(out)
    return out


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    form = "hatchling" if "--hatchling" in sys.argv else "juvenile"
    if len(args) >= 2 and args[0] == "preview":
        for c in args[1:]:
            for p in preview(c, form):
                print(p)
    elif len(args) >= 2 and args[0] == "grid":
        print(grid(args[1], form))
    elif len(args) == 3 and args[0] == "start":
        rows = start(args[1], json.loads(Path(args[2]).read_text(encoding="utf-8")), form, "--force" in sys.argv)
        for y, r in enumerate(rows):
            print(f"{y:02d} {r}")
        print("   " + "0123456789" * 6 + "0123")
    elif len(args) == 3 and args[0] == "zoom":
        print(zoom(args[1], args[2], form))
    else:
        print(__doc__)
