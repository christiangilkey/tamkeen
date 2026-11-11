"""The creatures' frame animations (tools/game_art/anim.py): moving parts leaves whatever doesn't move exactly as
drawn, the eyelids and shirt area follow the frames, and the game draws the frames as the tool composes them."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools" / "game_art"))
import anim  # noqa: E402
import beasts  # noqa: E402

LOOKS = [(p.parent.name, form) for p in sorted(beasts.SRC.glob("*/rig.json"))
         for form, name in (("juvenile", "anim.json"), ("hatchling", "anim_hatchling.json")) if (p.parent / name).exists()]


def test_epx_doubles_and_keeps_flat_areas_flat():
    a = np.full((3, 4), 7, np.int16)
    b = anim.epx(a)
    assert b.shape == (6, 8) and (b == 7).all()
    # an inside corner gets its quarter filled from the two sides, as Scale2x does
    g = np.array([[0, 1, 0], [1, 0, 0], [0, 0, 0]], np.int16)
    assert anim.epx(g)[2, 2] == 1 and anim.epx(g)[3, 3] == 0


def test_fill_holes_fills_a_pinhole_but_not_an_edge():
    a = np.array([[2, 2, 2, 0], [2, 0, 2, 0], [2, 2, 2, 0], [0, 0, 0, 0]], np.int16)
    src = np.zeros((2, 4, 4), np.int32)
    anim.fill_holes(a, src)
    assert a[1, 1] == 2 and a[1, 3] == 0


def test_leg_step_moves_the_foot_not_the_hip():
    x = np.array([10.5, 10.5, 10.5]), np.array([20.0, 25.5, 30.5])  # hip row 20, foot row 30
    sx, sy = anim.inverse(("leg", 10, 20, 30, 2, 0, 0), *x)
    assert sx[0] == pytest.approx(10.5) and sx[2] < 10   # the foot came from further back: it moved forward


@pytest.mark.parametrize("cid,form", LOOKS)
def test_every_look_animates_cleanly(cid, form):
    look = anim.Look(cid, form)  # (checks the parts grid covers exactly the drawing)
    got = look.all()
    assert len(got["idle"]["frames"]) == 4 and len(got["walk"]["frames"]) == 6
    assert ("fly" in got) == look.wings, "fly exactly for a creature drawn with wings"
    # the idle loop starts from the drawing as drawn (it is the still picture: portraits, the Creatures page)
    y, x = look.py0, look.px0  # (where the main drawing is on the working canvas)
    still = got["idle"]["frames"][0]["img"][y:y + look.dh, x:x + look.dw]
    assert (still == look.img["open"][y:y + look.dh, x:x + look.dw]).all(), "idle frame 0 must be the drawing"
    for name, a in got.items():
        assert len(a["ms"]) == len(a["frames"])
        for fr in a["frames"]:
            assert set(fr["at"]) == set(look.rig["sockets"])
            assert all(abs(v) <= 20 for d in fr["at"].values() for v in d)


def test_the_still_frame_is_the_drawing():
    look = anim.Look("griffin")
    a = look.frames("idle")
    y, x = look.py0, look.px0
    still = a["frames"][0]["img"][y:y + look.dh, x:x + look.dw]
    drawn = look.img["open"][y:y + look.dh, x:x + look.dw]
    assert (still == drawn).all()
    lids = a["frames"][0]["lids"]
    assert lids.any() and (look.img["shut"] != look.img["open"]).sum() == np.count_nonzero(lids)


def test_compose_frames_draws_the_still_frame_where_the_drawing_stands(tmp_path):
    meta = anim.write("griffin", "juvenile", tmp_path)
    rig, rows, pal = beasts.load("griffin")
    look = {"box": beasts.bbox(rows), "hover": rig.get("hover", 0), "shirt": False, "sockets": rig["sockets"], "anims": meta}
    im = beasts.compose_frames(look, tmp_path, "idle", 0)
    ox, oy = beasts.origin(look["box"], look["hover"])
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                assert im.getpixel((ox + x, oy + y)) == pal[ch] + (255,)
    assert {p.name for p in tmp_path.iterdir()} >= {"idle.png", "walk.png", "fly.png", "idle_shirt.png"}


@pytest.mark.parametrize("cid,form", LOOKS)
def test_a_drawn_shirt_comes_up_to_a_collar_where_the_neckwear_sits(cid, form):
    """A shirt area drawn in Aseprite (rig.json "shirt": {"mask": "_shirt.png"}) stays on the body (and arms): never
    on legs, wings, tail or head, so they stay bare in every frame. Its top is a collar where a bow tie or scarf sits
    (the neck socket): the owner saw the dragon's shirt low on its side with the bow tie floating above it."""
    look = anim.Look(cid, form)
    if not (look.rig.get("shirt") or {}).get("mask"):
        pytest.skip("shirt area still by colour letters in a box")
    assert look.mask, "the drawn shirt covers something"
    assert {chr(look.main.parts0[y, x]) for x, y in look.mask} <= set(anim.SHIRT_PARTS)
    nx, ny = look.rig["sockets"]["neck"][:2]
    collar = min(y for x, y in look.mask if abs(x - nx) <= 2)
    assert -2 <= collar - ny <= 3, f"the collar (row {collar}) is where the neckwear sits (row {ny})"


@pytest.mark.parametrize("form", ["juvenile", "hatchling"])
def test_the_dragon_wears_its_shirt_over_its_chest(form):
    """The dragon whelp's shirt covers the front of its body, the cream throat and chest plates, from the collar at the
    base of the neck down: not just a patch low on its side."""
    look = anim.Look("dragon_whelp", form)
    nx, ny = look.rig["sockets"]["neck"][:2]
    assert all(y >= ny - 1 for x, y in look.mask if x >= nx - 4), "nothing above the collar: the throat stays bare"
    for y in range(ny + 1, ny + 11):
        front = max(x for x in range(look.dw) if look.main.parts0[y, x] == ord("b"))
        assert max(x for x, yy in look.mask if yy == y) >= front - 3, f"row {y}: the shirt reaches the chest's front"


def test_a_look_can_walk_with_another_drawing():
    """The forest stag rests lying down and stands up to walk: its walk and getting-up frames come from its standing
    drawing, placed so both stand on the same ground, and its worn things move up with it."""
    look = anim.Look("forest_deer")
    got = look.all()
    assert set(got) >= {"idle", "walk", "rise"} and got["rise"]["once"]
    stand = look.drawings["stand"]
    assert stand.off[1] < 0 and stand.box[3] + stand.off[1] == look.box[3], "the standing hooves are on the lying stag's ground"
    hat = got["walk"]["frames"][0]["at"]["hat"]
    assert hat[1] <= stand.off[1] + 1, "the hat goes up with the standing head"
    meta = anim.write("forest_deer", "juvenile", __import__("pathlib").Path(__import__("tempfile").mkdtemp()))
    assert meta["walk"]["top"] < look.box[1] and "top" not in meta["idle"]
