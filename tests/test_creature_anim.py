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
    still = got["idle"]["frames"][0]["img"][anim.PAD:anim.PAD + look.dh, anim.PAD:anim.PAD + look.dw]
    assert (still == look.img["open"][anim.PAD:anim.PAD + look.dh, anim.PAD:anim.PAD + look.dw]).all(), "idle frame 0 must be the drawing"
    for name, a in got.items():
        assert len(a["ms"]) == len(a["frames"])
        for fr in a["frames"]:
            assert set(fr["at"]) == set(look.rig["sockets"])
            assert all(abs(v) <= 20 for d in fr["at"].values() for v in d)


def test_the_still_frame_is_the_drawing():
    look = anim.Look("griffin")
    a = look.frames("idle")
    still = a["frames"][0]["img"][anim.PAD:anim.PAD + look.dh, anim.PAD:anim.PAD + look.dw]
    drawn = look.img["open"][anim.PAD:anim.PAD + look.dh, anim.PAD:anim.PAD + look.dw]
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
