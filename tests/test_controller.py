"""The game controller's buttons (app/controller.py; the mapping itself is web/js/padmap.js): kept
tidy, saved with the other settings, and synced between devices where the one changed last wins."""

from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from app import controller, db
from app.sync import engine

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)


@pytest.fixture()
def client(fresh_db):
    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_the_setting_is_kept_tidy():
    raw = {"at": 1700000000123.7, "map": {
        "video": {"playPause": "b2", "lookUp": "", "bad": "b999", "worse": 4, "no way": "b1"},
        "review": "not a dict", "elsewhere": {"x": "b1"}, "general": {"back": "a1-"}}}
    assert controller.clean(raw) == {"at": 1700000000123, "map": {
        "video": {"playPause": "b2", "lookUp": ""}, "general": {"back": "a1-"}}}
    assert controller.clean(None) == {"at": 0, "map": {}}
    assert controller.clean({"at": True, "map": []}) == {"at": 0, "map": {}}


def test_the_mapping_changed_last_wins():
    older = {"at": 100, "map": {"video": {"playPause": "b1"}}}
    newer = {"at": 200, "map": {}}
    assert controller.wins(newer, older)
    assert not controller.wins(older, newer)
    assert not controller.wins(older, older)
    assert controller.wins(older, {})


def test_it_is_saved_with_the_other_settings(client):
    assert client.get("/api/settings").json()["controller_map"] == {}
    s = client.patch("/api/settings", json={"controller_map": {"at": 5, "map": {"review": {"good": "b7"}}}}).json()
    assert s["controller_map"] == {"at": 5, "map": {"review": {"good": "b7"}}}
    assert db.get_setting("controller_map") == {"at": 5, "map": {"review": {"good": "b7"}}}


def test_the_buttons_travel_between_devices(world):
    drive, a, b = world
    with a:
        db.set_settings({"controller_map": {"at": 100, "map": {"video": {"playPause": "b9"}}}})
    a.sync(drive)
    b.sync(drive)
    with b:
        assert db.get_setting("controller_map") == {"at": 100, "map": {"video": {"playPause": "b9"}}}
        db.set_settings({"controller_map": {"at": 200, "map": {}}})  # put back to the defaults there, later
    assert b.sync(drive).library_uploaded
    a.sync(drive)
    with a:
        assert db.get_setting("controller_map") == {"at": 200, "map": {}}
    assert not a.sync(drive).library_uploaded and not b.sync(drive).library_uploaded


def test_an_older_mapping_never_replaces_a_newer_one(world):
    drive, a, b = world
    with a:
        db.set_settings({"controller_map": {"at": 100, "map": {"review": {"again": "b2"}}}})
    with b:
        db.set_settings({"controller_map": {"at": 300, "map": {"review": {"again": "b3"}}}})
    a.sync(drive)
    b.sync(drive)
    a.sync(drive)
    for dev in (a, b):
        with dev:
            assert db.get_setting("controller_map")["map"] == {"review": {"again": "b3"}}


def test_a_library_from_before_controllers_is_not_a_difference(world):
    drive, a, _ = world
    a.sync(drive)
    lib = engine._ungz(drive.by_name(engine.LIBRARY)["data"])
    assert lib["controller"] == {"at": 0, "map": {}}
    old = {k: v for k, v in lib.items() if k != "controller"}
    assert engine._content(old) == engine._content(lib)
