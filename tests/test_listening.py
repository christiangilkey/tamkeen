"""What has been listened to, watched and read, shared between devices (app/listening.py, app/api/listening.py,
the "listening" part of the Drive sync). tests/js/listening.test.mjs checks the phone's twin with the same cases."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import db, ids, listening
from app.sync import engine

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)

CASES = Path(__file__).parent / "fixtures" / "listening_cases.json"


def test_the_shared_cases_still_match_this_code():
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    for c in cases["clean"]:
        assert listening.clean_state(c["in"]) == c["out"], c["in"]
    for c in cases["merge"]:
        assert listening.merge_state(c["mine"], c["theirs"]) == c["out"], c
        # (the same answer whichever device merges)
        assert listening.merge_state(c["theirs"], c["mine"]) == c["out"], c


def test_finished_items_are_never_dropped_and_unfinished_ones_keep_the_newest():
    state = {f"d{i}": {"done": i + 1, "ts": i + 1} for i in range(3000)}
    state.update({f"u{i}": {"ts": 10_000 + i, "pos": 30, "dur": 900} for i in range(1500)})
    kept = listening.clean_state(state)
    assert sum(1 for r in kept.values() if r["done"]) == 3000
    unfinished = [u for u, r in kept.items() if not r["done"]]
    assert len(unfinished) == listening.UNFINISHED_KEPT
    assert "u1499" in kept and "u0" not in kept  # the newest are kept


def test_once_finished_on_one_device_it_stays_finished():
    phone = {"ep": {"ts": 100, "pos": 1190, "dur": 1200, "done": 100}}
    computer = {"ep": {"ts": 200, "pos": 40, "dur": 1200}}  # played again from the start later
    merged = listening.merge_state(phone, computer)
    assert merged["ep"]["done"] == 100 and merged["ep"]["pos"] == 40 and merged["ep"]["ts"] == 200


# ---------------------------------------------------------------------------------- the page's routes

@pytest.fixture()
def client(fresh_db, monkeypatch):
    from app import sync
    from app.main import create_app

    asked: list[float] = []
    monkeypatch.setattr(sync, "request", lambda delay=0: asked.append(delay))
    with db.session() as conn:
        conn.execute("INSERT INTO feeds(url, uid, title, created_at) VALUES('https://x/rss', 'f1', 'Feed', 1)")
        for n in (1, 2, 3):
            conn.execute("INSERT INTO episodes(feed_id, uid, guid, title, audio_url, created_at, deleted) VALUES(1,?,?,?,?,1,?)",
                         (f"uid{n}", f"g{n}", f"Episode {n}", f"https://x/{n}.mp3", 1 if n == 3 else 0))
    with TestClient(create_app(start_worker=False)) as c:
        c.asked = asked
        yield c


def test_the_page_sends_by_its_ids_and_the_app_keeps_by_uid(client):
    r = client.post("/api/listening", json={"items": [
        {"id": "1", "kind": "audio", "ts": 500, "pos": 300, "dur": 1200, "title": "Episode 1", "sub": "Feed"},
        {"id": 2, "kind": "audio", "ts": 0, "done": 1},
        {"id": "999", "ts": 5},          # not in the library: left out
        {"id": "nf:abc", "ts": 5},       # not an episode at all: left out
    ]}).json()
    assert r == {"saved": 2}
    assert client.asked == [60]
    with db.session() as conn:
        kept = listening.load(conn)
    assert set(kept) == {"uid1", "uid2"} and kept["uid1"]["pos"] == 300 and kept["uid2"]["done"] == 1
    # The same again changes nothing and asks for no sync.
    assert client.post("/api/listening", json={"items": [{"id": "1", "kind": "audio", "ts": 500, "pos": 300, "dur": 1200,
                                                          "title": "Episode 1", "sub": "Feed"}]}).json() == {"saved": 0}
    assert client.asked == [60]


def test_the_page_takes_in_by_its_ids_and_only_what_is_still_in_the_library(client):
    with db.session() as conn:
        listening.merge_into(conn, {"uid1": {"ts": 9, "pos": 20, "dur": 60}, "uid3": {"done": 4}, "elsewhere": {"done": 5}})
    items = client.get("/api/listening").json()["items"]
    assert [(i["id"], i["uid"], i["pos"]) for i in items] == [(1, "uid1", 20)]


def test_a_wrong_body_is_refused(client):
    assert client.post("/api/listening", json={"items": "x"}).status_code == 400
    assert client.post("/api/listening", json={"items": [{}] * 2001}).status_code == 400


# ---------------------------------------------------------------------------------- between devices

def _episode_uid(n: int) -> str:
    return ids.episode_uid(ids.feed_uid("https://example.com/rss"), f"g{n}")


def test_what_was_heard_travels_between_devices_and_finished_stays_finished(world):
    drive, a, b = world
    one, two = _episode_uid(1), _episode_uid(2)
    with a:
        with db.session() as conn:
            listening.merge_into(conn, {one: {"kind": "audio", "ts": 100, "pos": 1195, "dur": 1200, "done": 100},
                                        two: {"kind": "audio", "ts": 110, "pos": 60, "dur": 1200}})
    a.sync(drive)
    b.sync(drive)
    with b:
        with db.session() as conn:
            got = listening.load(conn)
        assert got[one]["done"] == 100 and got[two]["pos"] == 60
        with db.session() as conn:  # B plays episode 1 again from the start, and gets further in episode 2
            listening.merge_into(conn, {one: {"kind": "audio", "ts": 300, "pos": 15, "dur": 1200},
                                        two: {"kind": "audio", "ts": 310, "pos": 700, "dur": 1200}})
    assert b.sync(drive).library_uploaded
    a.sync(drive)
    with a:
        with db.session() as conn:
            got = listening.load(conn)
    assert got[one]["done"] == 100 and got[one]["pos"] == 15  # still finished, and where B is now
    assert got[two]["pos"] == 700
    assert not a.sync(drive).library_uploaded and not b.sync(drive).library_uploaded  # settled: nothing goes back and forth


def test_a_library_from_before_listening_was_shared_is_not_a_difference(world):
    drive, a, _b = world
    a.sync(drive)
    lib = engine._ungz(drive.by_name(engine.LIBRARY)["data"])
    assert "listening" in lib
    old = {k: v for k, v in lib.items() if k != "listening"}
    assert engine._content(old) == engine._content(lib)  # nothing heard yet: an older device's copy is the same
