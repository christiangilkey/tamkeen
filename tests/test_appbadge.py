"""The number of cards left today on the taskbar button / Dock icon (app/appbadge.py)."""

from app import appbadge


def test_the_badge_says_nothing_at_zero_and_caps_at_99_plus():
    assert appbadge.label(0) == ""
    assert appbadge.label(-3) == ""
    assert appbadge.label(7) == "7"
    assert appbadge.label(99) == "99"
    assert appbadge.label(100) == "99+"


def test_the_picture_is_a_round_badge_with_white_ink():
    for text in ("7", "42", "99+"):
        px = appbadge.draw(text)
        assert len(px) == appbadge.SIZE * appbadge.SIZE * 4
        corner = px[0:4]
        assert corner[3] == 0, "outside the circle is see-through"
        ink = sum(1 for i in range(0, len(px), 4) if px[i:i + 4] == b"\xff\xff\xff\xff")
        assert ink > 20, f"{text!r} has visible digits"


def test_outside_the_desktop_window_it_does_nothing(monkeypatch):
    monkeypatch.setenv("APS_DESKTOP", "0")
    assert appbadge.set_count(5) is False
