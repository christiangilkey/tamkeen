"""The Library's "Delete selected": whole episodes (podcast episodes too) are removed for good,
on every device, and a podcast's feed does not bring them back."""

from __future__ import annotations

import pytest

from app import db, feeds, ids
from app.api import episodes as episodes_api
from app.sync import engine

from test_sync import FakeDrive, seed_library, transcribe_locally, world  # noqa: F401  (pytest fixture)

FEED_URL = "https://example.com/rss"


def parsed_feed() -> feeds.ParsedFeed:
    """What the podcast's feed says: the two seeded episodes plus one more."""
    return feeds.ParsedFeed(title="Feed", episodes=[
        feeds.ParsedEpisode(guid=f"g{n}", title=f"Episode {n}", audio_url=f"https://cdn/ep{n}.mp3") for n in (3, 2, 1)])


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        with db.session() as conn:
            seed_library(conn)
        transcribe_locally(1)
        yield c


def listed(client) -> list[str]:
    return sorted(e["title"] for e in client.get("/api/episodes").json()["items"])


def test_delete_selected_removes_podcast_episodes_for_good(client):
    assert listed(client) == ["Episode 1", "Episode 2"]
    assert client.get("/api/search?q=مرحبا").json()["total"] == 1
    r = client.post("/api/episodes/delete", json={"ids": [1, 2, 999]})
    assert r.status_code == 200 and r.json() == {"deleted": 2}, "an id that doesn't exist is simply skipped"
    assert listed(client) == []
    assert client.get("/api/episodes/1").status_code == 404
    assert client.get("/api/search?q=مرحبا").json()["total"] == 0, "its transcript is gone from search"
    with db.session() as conn:
        assert conn.execute("SELECT COUNT(*) FROM words WHERE episode_id = 1").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM segments WHERE episode_id = 1").fetchone()[0] == 0
        assert conn.execute("SELECT deleted FROM vocab WHERE uid = 'vword1'").fetchone()[0] == 0, "saved vocab is kept"
    feed = next(f for f in client.get("/api/feeds").json() if f["url"] == FEED_URL)
    assert feed["episode_count"] == 0 and not feed["done_count"], "the podcast's counts no longer include them"
    assert client.post("/api/episodes/delete", json={"ids": [1]}).json() == {"deleted": 0}, "deleting twice does nothing"
    assert client.post("/api/episodes/delete", json={"ids": []}).json() == {"deleted": 0}


def test_refreshing_the_podcast_does_not_bring_a_deleted_episode_back(client):
    client.post("/api/episodes/delete", json={"ids": [2]})
    with db.session() as conn:
        new_ids = feeds._upsert_episodes(conn, 1, parsed_feed())
        titles = [r["title"] for r in conn.execute("SELECT title FROM episodes WHERE id IN (%s)" % ",".join("?" * len(new_ids)), new_ids)]
    assert titles == ["Episode 3"], "only the episode that is really new counts as new"
    assert listed(client) == ["Episode 1", "Episode 3"]


def test_one_episode_can_be_deleted_by_itself_whatever_it_belongs_to(client):
    assert client.delete("/api/episodes/2").json() == {"ok": True}, "a podcast episode, not only one of the user's own files"
    assert listed(client) == ["Episode 1"]
    assert client.delete("/api/episodes/2").status_code == 404


def test_a_queued_transcription_is_dropped_with_the_episode(client):
    assert client.post("/api/episodes/transcribe", json={"ids": [2]}).json()["queued"] == [2]
    client.post("/api/episodes/delete", json={"ids": [2]})
    with db.session() as conn:
        assert conn.execute("SELECT COUNT(*) FROM jobs WHERE episode_id = 2 AND state IN ('queued','running')").fetchone()[0] == 0
    assert client.post("/api/episodes/transcribe", json={"ids": [2]}).json()["queued"] == [], "a deleted episode can't be queued"


def test_deleting_reaches_the_other_device_and_frees_drive(world):
    drive, a, b = world
    a.sync(drive)
    b.sync(drive)
    uid1 = ids.episode_uid(ids.feed_uid(FEED_URL), "g1")
    assert drive.by_name(engine.transcript_name(uid1)), "the transcript was shared first"
    with b:
        with db.session() as conn:
            assert conn.execute("SELECT COUNT(*) FROM words w JOIN episodes e ON e.id = w.episode_id WHERE e.uid = ?",
                                (uid1,)).fetchone()[0] == 2
    with a:
        episodes_api._remove_episode(1)
    a.sync(drive)
    assert drive.by_name(engine.transcript_name(uid1)) is None, "its transcript no longer takes up space in Drive"
    b.sync(drive)
    with b:
        with db.session() as conn:
            row = conn.execute("SELECT id, deleted FROM episodes WHERE uid = ?", (uid1,)).fetchone()
            assert row["deleted"] == 1
            assert conn.execute("SELECT COUNT(*) FROM words WHERE episode_id = ?", (row["id"],)).fetchone()[0] == 0
            assert conn.execute("SELECT deleted FROM vocab WHERE uid = 'vword1'").fetchone()[0] == 0, "vocab survives there too"
            # The other device's own look at the feed must not revive it either.
            feed_id = conn.execute("SELECT id FROM feeds WHERE url = ?", (FEED_URL,)).fetchone()[0]
            feeds._upsert_episodes(conn, feed_id, parsed_feed())
            assert conn.execute("SELECT deleted FROM episodes WHERE uid = ?", (uid1,)).fetchone()[0] == 1
    # And nothing bounces back: after one more round both sides still agree it is gone.
    a.sync(drive)
    with a:
        with db.session() as conn:
            assert conn.execute("SELECT deleted FROM episodes WHERE id = 1").fetchone()[0] == 1
