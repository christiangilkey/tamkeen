"""The creature's room: Home's habitat window turned into a room (prototype "habitat_room", the owner's design of
2026-11-25). Designed pixel by pixel and placed in Aseprite by a script, as the guild tavern was (the method the owner
agreed for the game's art); it shares the tavern's palette and wood, plaster and floor (tavern.py), with the game's
neon highlights.

    .venv/Scripts/python.exe tools/game_art/room.py preview OUT.png   a sheet to look at (3x)
    .venv/Scripts/python.exe tools/game_art/room.py build [--aseprite] write web/game-art/room/*.png (and sources)

Files (web/game-art/room/, sources in game/art-src/room/):
    room.png       320 x 144  the room. The window's panes and the doorway are see-through: the game draws the habitat
                              theme's sky and far layer behind them, so the view outside is the real one (time of day,
                              weather, the theme chosen).
    door.png       DOOR size  the door, shut (drawn over the doorway)
    door_open.png  DOOR size  the door swung open against the wall (the doorway shows outside)
The numbers the game needs (the floor, the window, the door) are below and kept the same in web/js/game/room.js.
"""

from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tavern  # noqa: E402  (its canvas, palette and wood, plaster and floor)
from tavern import CREAM, GOLD, INK, IRON, PLASTER, SHADE, WOOD, Canvas, hexc  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "game-art" / "room"
SRC = ROOT / "game" / "art-src" / "room"
ASEPRITE = tavern.ASEPRITE

W, H = 320, 144
FLOOR_TOP = 84                 # the floor starts here (the wainscot's foot)
WINDOW = (116, 18, 198, 60)    # outer frame, inclusive
DOOR = (262, 20, 299, 83)      # the doorway's opening, inclusive: x0, y0, x1, y1
NEON_PINK = [hexc("8a1f5c"), hexc("ff3fa4"), hexc("ffb3dc")]
NEON_CYAN = [hexc("12505e"), hexc("2ee6ff"), hexc("b8f7ff")]
CLEAR = (0, 0, 0, 0)

tavern.W = W  # (its floor draws to the canvas's width)


def clear(cv: Canvas, x0, y0, x1, y1) -> None:
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            cv.px[x, y] = CLEAR


def window(cv: Canvas) -> None:
    """A wide window with two panes and a cross bar; the glass is left see-through (the game draws outside)."""
    x0, y0, x1, y1 = WINDOW
    clear(cv, x0 + 3, y0 + 3, x1 - 3, y1 - 3)
    # a faint reflection on the glass: two thin diagonal glints, half see-through
    for k in range(10):
        cv.put(x0 + 8 + k, y0 + 14 - k, (220, 240, 255, 70))
        cv.put(x0 + 12 + k, y0 + 18 - k, (220, 240, 255, 45))
        cv.put(x1 - 30 + k, y0 + 22 - k, (220, 240, 255, 55))
    for (a, b, c, d) in ((x0, y0, x1, y0 + 2), (x0, y1 - 2, x1, y1), (x0, y0, x0 + 2, y1), (x1 - 2, y0, x1, y1)):
        cv.rect(a, b, c, d, WOOD[3])
    cv.hline(x0, x1, y0, WOOD[5]); cv.vline(x0, y0, y1, WOOD[4]); cv.vline(x1, y0, y1, WOOD[1]); cv.hline(x0, x1, y1, WOOD[1])
    mid = (x0 + x1) // 2
    cv.rect(mid - 1, y0 + 3, mid + 1, y1 - 3, WOOD[3]); cv.vline(mid - 1, y0 + 3, y1 - 3, WOOD[4]); cv.vline(mid + 1, y0 + 3, y1 - 3, WOOD[1])
    bar = y0 + (y1 - y0) // 2
    cv.rect(x0 + 3, bar - 1, x1 - 3, bar + 1, WOOD[3]); cv.hline(x0 + 3, x1 - 3, bar - 1, WOOD[4]); cv.hline(x0 + 3, x1 - 3, bar + 1, WOOD[1])
    # the sill, with a shadow under it
    cv.rect(x0 - 4, y1 + 1, x1 + 4, y1 + 4, WOOD[4]); cv.hline(x0 - 4, x1 + 4, y1 + 1, WOOD[5]); cv.hline(x0 - 4, x1 + 4, y1 + 4, WOOD[1])
    cv.hline(x0 - 3, x1 + 3, y1 + 5, PLASTER[1]); cv.hline(x0 - 2, x1 + 2, y1 + 6, PLASTER[2])
    # curtains tied back at each side: a deep plum cloth with folds
    plum = [hexc("2a1430"), hexc("44203f"), hexc("63305a"), hexc("844276")]
    for side in (-1, 1):
        edge = x0 - 1 if side < 0 else x1 + 1
        for y in range(y0 - 4, y1 + 3):
            t = (y - (y0 - 4)) / (y1 + 3 - (y0 - 4))
            width = round(9 - 5 * math.sin(min(1, t * 1.6) * math.pi * 0.5) + (4 if t > 0.62 else 0) * (t - 0.62) * 2.6)
            for i in range(width):
                x = edge - i if side < 0 else edge + i
                fold = (i + y // 6) % 4
                c = plum[3] if fold == 0 and i < width - 1 else plum[2] if fold in (1, 2) else plum[1]
                if i == width - 1:
                    c = plum[0]
                cv.put(x, y, c)
        tie = y0 + 26
        for i in range(-1, 6):
            x = edge - i if side < 0 else edge + i
            cv.put(x, tie, GOLD[1]); cv.put(x, tie + 1, GOLD[0])
    # the rail it hangs from, with neon caps
    cv.rect(x0 - 14, y0 - 6, x1 + 14, y0 - 5, IRON[2]); cv.hline(x0 - 14, x1 + 14, y0 - 6, IRON[2]); cv.hline(x0 - 14, x1 + 14, y0 - 5, IRON[1])
    for x in (x0 - 16, x1 + 15):
        cv.rect(x, y0 - 7, x + 1, y0 - 4, NEON_CYAN[1]); cv.put(x, y0 - 7, NEON_CYAN[2])


def door(cv: Canvas, x0: int, y0: int, open_: bool) -> None:
    """The door leaf on a canvas of the doorway's size: shut (panels, a round window, a brass knob) or swung open
    against the wall (a narrow edge-on slab at the hinge side, the doorway behind it left see-through)."""
    w, h = DOOR[2] - DOOR[0] + 1, DOOR[3] - DOOR[1] + 1
    if open_:
        # edge-on, at the left (hinge) side: the leaf seen from its side, a little wider at the bottom (perspective)
        for y in range(h):
            k = 6 + (y * 2) // h
            for x in range(k):
                c = WOOD[4] if x == 0 else WOOD[1] if x == k - 1 else WOOD[3] if x < k - 2 else WOOD[2]
                cv.put(x0 + x, y0 + y, c)
        cv.rect(x0 + 2, y0 + h // 2 - 1, x0 + 3, y0 + h // 2 + 1, GOLD[1]); cv.put(x0 + 2, y0 + h // 2 - 1, GOLD[2])
        return
    cv.rect(x0, y0, x0 + w - 1, y0 + h - 1, WOOD[3])
    cv.vline(x0, y0, y0 + h - 1, WOOD[4]); cv.vline(x0 + 1, y0, y0 + h - 1, WOOD[5])
    cv.vline(x0 + w - 1, y0, y0 + h - 1, WOOD[1]); cv.vline(x0 + w - 2, y0, y0 + h - 1, WOOD[2])
    cv.hline(x0, x0 + w - 1, y0, WOOD[5])
    # two sunk panels below, a round window above
    for (py0, py1) in ((y0 + 30, y0 + 44), (y0 + 47, y0 + h - 5)):
        for (px0, px1) in ((x0 + 5, x0 + w // 2 - 2), (x0 + w // 2 + 2, x0 + w - 6)):
            cv.rect(px0, py0, px1, py1, WOOD[2])
            cv.hline(px0, px1, py0, WOOD[1]); cv.vline(px0, py0, py1, WOOD[1])
            cv.hline(px0, px1, py1, WOOD[4]); cv.vline(px1, py0, py1, WOOD[4])
            cv.speckle(px0 + 1, py0 + 1, px1 - 1, py1 - 1, WOOD[1], 0.08)
    cx, cy = x0 + w // 2, y0 + 15
    cv.ellipse(cx, cy, 9, 9, WOOD[1])
    cv.ellipse(cx, cy, 8, 8, IRON[1])
    for y in range(cy - 7, cy + 8):
        for x in range(cx - 7, cx + 8):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= 42:
                t = (y - (cy - 7)) / 14
                cv.put(x, y, NEON_CYAN[0] if t > 0.55 else hexc("1a2c4a") if t > 0.25 else hexc("24406a"))  # night glass, glowing a little
    cv.vline(cx, cy - 7, cy + 7, IRON[1]); cv.hline(cx - 7, cx + 7, cy, IRON[1])
    cv.put(cx - 4, cy - 4, NEON_CYAN[2]); cv.put(cx - 3, cy - 5, NEON_CYAN[1])
    # the knob and its plate, a mail slot
    kx, ky = x0 + w - 8, y0 + 37
    cv.rect(kx - 1, ky - 3, kx + 1, ky + 4, GOLD[0]); cv.ellipse(kx, ky, 2.2, 2.2, GOLD[1]); cv.put(kx - 1, ky - 1, GOLD[2])
    cv.rect(x0 + w // 2 - 6, y0 + 26, x0 + w // 2 + 5, y0 + 27, IRON[0]); cv.hline(x0 + w // 2 - 6, x0 + w // 2 + 5, y0 + 25, GOLD[1])


def neon_sign(cv: Canvas, x0: int, y0: int) -> None:
    """A little neon sign on the wall: a crescent moon and a star, pink and cyan (the game's outrun highlights)."""
    moon = [
        "..ppp...",
        ".pp.....",
        "pp......",
        "p.......",
        "p.......",
        "pp......",
        ".pp.....",
        "..ppp...",
    ]
    star = [
        "..c..",
        "..c..",
        "ccccc",
        ".ccc.",
        ".c.c.",
    ]
    def glow(gx, gy, ramp):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if (dx or dy) and cv.get(gx + dx, gy + dy)[:3] in [p[:3] for p in PLASTER]:
                    cv.put(gx + dx, gy + dy, ramp[0][:3] + (120,))
    for (shape, ox, oy, ramp) in ((moon, x0, y0, NEON_PINK), (star, x0 + 8, y0 + 1, NEON_CYAN)):
        for y, row in enumerate(shape):
            for x, ch in enumerate(row):
                if ch != ".":
                    glow(ox + x, oy + y, ramp)
        for y, row in enumerate(shape):
            for x, ch in enumerate(row):
                if ch != ".":
                    cv.put(ox + x, oy + y, ramp[1])
        # a bright core on the upper strokes
        for y, row in enumerate(shape[:3]):
            for x, ch in enumerate(row):
                if ch != "." and (x + y) % 2 == 0:
                    cv.put(ox + x, oy + y, ramp[2])
    # the little transformer box under it, and its cable
    cv.rect(x0 + 2, y0 + 11, x0 + 8, y0 + 13, IRON[1]); cv.hline(x0 + 2, x0 + 8, y0 + 11, IRON[2])
    cv.vline(x0 + 5, y0 + 14, FLOOR_TOP - 20, IRON[0])


def hooks(cv: Canvas, x0: int, y0: int) -> None:
    """Coat hooks by the door, with a little scarf and a bag hanging from them."""
    cv.rect(x0, y0, x0 + 18, y0 + 2, WOOD[4]); cv.hline(x0, x0 + 18, y0, WOOD[5]); cv.hline(x0, x0 + 18, y0 + 2, WOOD[1])
    for hx in (x0 + 3, x0 + 9, x0 + 15):
        cv.put(hx, y0 + 3, IRON[2]); cv.put(hx, y0 + 4, IRON[1]); cv.put(hx + 1, y0 + 4, IRON[1])
    scarf = [hexc("1d6b6b"), hexc("2e9a8f"), hexc("55c8b4")]
    for y in range(y0 + 4, y0 + 17):
        for x in (x0 + 2, x0 + 3, x0 + 4):
            cv.put(x + (1 if y > y0 + 12 else 0), y, scarf[1] if (y // 2) % 2 else scarf[2])
        cv.put(x0 + 1, y, scarf[0])
    for y in range(y0 + 4, y0 + 13):  # a satchel
        for x in range(x0 + 12, x0 + 19):
            cv.put(x, y, hexc("6a3d22") if x in (x0 + 12, x0 + 18) or y == y0 + 12 else hexc("8c5530"))
    cv.hline(x0 + 12, x0 + 18, y0 + 7, hexc("5a321c")); cv.put(x0 + 15, y0 + 8, GOLD[1])


def room() -> Image.Image:
    cv = Canvas(W, H, seed=11)
    # ceiling boards and the beam
    cv.rect(0, 0, W - 1, 8, WOOD[1])
    for x in range(0, W, 7):
        cv.vline(x, 0, 8, WOOD[0])
    tavern.beam(cv, 0, 9, W - 1, 15)
    # a neon strip under the beam: a thin pink line that glows onto the plaster
    cv.hline(0, W - 1, 16, NEON_PINK[0])
    tavern.plaster(cv, 0, 16, W - 1, 64)
    for x in range(0, W):
        if x % 2 == 0:
            cv.put(x, 17, NEON_PINK[0][:3] + (90,))
    # the wainscot and its rail
    tavern.planks_vertical(cv, 0, 67, W - 1, FLOOR_TOP - 1, width=9)
    cv.rect(0, 64, W - 1, 66, WOOD[4]); cv.hline(0, W - 1, 64, WOOD[5]); cv.hline(0, W - 1, 66, WOOD[1])
    cv.hline(0, W - 1, FLOOR_TOP - 2, WOOD[1]); cv.hline(0, W - 1, FLOOR_TOP - 1, WOOD[0])
    # corner posts at the ends of the wall
    tavern.post(cv, 0, 16, 4, FLOOR_TOP - 1)
    tavern.post(cv, W - 5, 16, W - 1, FLOOR_TOP - 1)
    tavern.floor(cv, FLOOR_TOP, H - 1)
    window(cv)
    neon_sign(cv, 40, 30)
    # the doorway: a timber frame, the opening left see-through (outside shows; the door is drawn over it)
    x0, y0, x1, y1 = DOOR
    tavern.post(cv, x0 - 5, y0 - 4, x0 - 1, y1)
    tavern.post(cv, x1 + 1, y0 - 4, x1 + 5, y1)
    tavern.beam(cv, x0 - 6, y0 - 6, x1 + 6, y0 - 1)
    clear(cv, x0, y0, x1, y1)
    # the threshold: a worn board in front of the doorway
    cv.rect(x0 - 3, y1 + 1, x1 + 3, y1 + 3, WOOD[4]); cv.hline(x0 - 3, x1 + 3, y1 + 1, WOOD[5]); cv.hline(x0 - 3, x1 + 3, y1 + 3, WOOD[1])
    hooks(cv, 232, 34)
    # a soft pool of light on the floor under the window
    for y in range(FLOOR_TOP + 2, FLOOR_TOP + 26):
        for x in range(WINDOW[0] - 8, WINDOW[2] + 9):
            spread = (y - FLOOR_TOP) * 0.6
            if WINDOW[0] - spread <= x <= WINDOW[2] + spread and (x + y) % 3 == 0:
                p = cv.get(x, y)
                if p[3]:
                    cv.px[x, y] = tuple(min(255, round(p[i] * 1.12 + 6)) for i in range(3)) + (255,)
    # the room's edges fall off into shade
    for y in range(H):
        for x in range(W):
            p = cv.get(x, y)
            if not p[3]:
                continue
            d = (abs(x - W / 2) / (W / 2)) ** 4 * 0.3 + max(0, (y - 120) / 24) * 0.12
            if d > 0 and (x + y) % 2 == 0:
                cv.px[x, y] = tuple(round(p[i] * (1 - d)) for i in range(3)) + (255,)
    return cv.im


def door_piece(open_: bool) -> Image.Image:
    w, h = DOOR[2] - DOOR[0] + 1, DOOR[3] - DOOR[1] + 1
    cv = Canvas(w, h, seed=12)
    door(cv, 0, 0, open_)
    return cv.im


PIECES = {"room": room, "door": lambda: door_piece(False), "door_open": lambda: door_piece(True)}


def lua_for(name: str, im: Image.Image) -> str:
    w, h = im.size
    ase = (SRC / f"{name}.aseprite").as_posix()
    png = (OUT / f"{name}.png").as_posix()
    lines = [f"do local s = Sprite({w}, {h}, ColorMode.RGB) local img = s.cels[1].image"]
    for y in range(h):
        for x in range(w):
            r, g, b, a = im.getpixel((x, y))
            if a:
                lines.append(f"img:drawPixel({x}, {y}, app.pixelColor.rgba({r}, {g}, {b}, {a}))")
    lines.append(f's:saveAs("{ase}") s:saveCopyAs("{png}") s:close() end')
    return "\n".join(lines)


def build(aseprite: bool) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    made = {name: fn() for name, fn in PIECES.items()}
    if aseprite:
        SRC.mkdir(parents=True, exist_ok=True)
        script = SRC / "_place.lua"
        script.write_text("\n".join(lua_for(n, im) for n, im in made.items()), encoding="utf-8")
        subprocess.run([ASEPRITE, "-b", "--script", str(script)], check=True)
        script.unlink()
    else:
        for name, im in made.items():
            im.save(OUT / f"{name}.png")
    print(f"{len(made)} room pieces written" + (" (placed in Aseprite, sources saved)" if aseprite else ""))


def preview(out: str, theme: str = "meadow") -> None:
    """The room as the game shows it: the theme's sky and far layer behind, the door shut; and again with it open."""
    sc = 3
    art = ROOT / "web" / "game-art"
    def scene(open_: bool) -> Image.Image:
        im = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        for layer in ("sky", "far", "mid"):
            p = art / "habitat" / theme / f"{layer}.png"
            if p.exists():
                im.alpha_composite(Image.open(p).convert("RGBA"))
        im.alpha_composite(room())
        im.alpha_composite(door_piece(open_), (DOOR[0], DOOR[1]))
        return im
    sheet = Image.new("RGBA", (W * sc, H * sc * 2 + 12), (30, 26, 40, 255))
    sheet.alpha_composite(scene(False).resize((W * sc, H * sc), Image.NEAREST), (0, 0))
    sheet.alpha_composite(scene(True).resize((W * sc, H * sc), Image.NEAREST), (0, H * sc + 12))
    sheet.save(out)
    print(f"preview -> {out}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "preview"
    if cmd == "build":
        build("--aseprite" in sys.argv)
    elif cmd == "preview":
        preview(sys.argv[2] if len(sys.argv) > 2 else "room_preview.png", sys.argv[3] if len(sys.argv) > 3 else "meadow")
    else:
        print(__doc__)
