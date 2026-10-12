"""Media import: YouTube videos (captions as the transcript) and trending podcasts."""

from __future__ import annotations

import hashlib

import httpx
import pytest

from app import db, ids, podcastindex, youtube
from app.sync import engine

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)

VIDEO = "lo3KyF50IGE"
LINES = [
    {"start": 3.2, "end": 5.0, "text": "أنا بقيت عمو؟!", "words": [[3.2, 3.8, "أنا"], [3.8, 4.4, "بقيت"], [4.4, 5.0, "عمو؟!"]]},
    {"start": 0.84, "end": 3.2, "text": "عمو!  لو سمحت!", "words": [[0.84, 1.5, "عمو!"], [1.5, 2.2, "لو"], [2.2, 3.2, " سمحت! "]]},
    {"start": 6.0, "end": 7.0, "text": "", "words": []},
    {"start": 7.0, "end": 8.0, "text": "bad", "words": [["x", None, "  "], "nonsense"]},
]


# ----- YouTube -----

def test_save_video_stores_captions_with_their_times(world):
    _, a, _ = world
    with a:
        ep = youtube.save_video(VIDEO, "  الدحيح  ", LINES, channel="AJ+", duration=2037, language="ar")
        assert ep["audio_url"] == f"https://www.youtube.com/watch?v={VIDEO}" and ep["audio_type"] == "video/youtube"
        assert ep["status"] == "done" and ep["title"] == "الدحيح" and ep["words"] == 6
        assert ep["model"] == "youtube-captions" and ep["duration"] == 2037 and ep["language"] == "ar"
        assert ep["image"] == f"https://i.ytimg.com/vi/{VIDEO}/hqdefault.jpg" and ep["description"] == "AJ+"
        with db.session() as conn:
            feed = conn.execute("SELECT url, uid FROM feeds WHERE id = ?", (ep["feed_id"],)).fetchone()
            segs = conn.execute("SELECT start, end, text FROM segments WHERE episode_id = ? ORDER BY idx", (ep["id"],)).fetchall()
            words = conn.execute("SELECT start, end, text, seg_idx FROM words WHERE episode_id = ? ORDER BY idx", (ep["id"],)).fetchall()
            hits = conn.execute("SELECT COUNT(*) FROM segments_fts WHERE episode_id = ?", (ep["id"],)).fetchone()[0]
        assert feed["url"] == youtube.LOCAL_FEED_URL
        assert ep["uid"] == ids.episode_uid(feed["uid"], VIDEO), "the same video gets the same id on every device"
        assert [s["text"] for s in segs] == ["عمو! لو سمحت!", "أنا بقيت عمو؟!"], "lines are put in time order; empty ones dropped"
        assert [w["text"] for w in words] == ["عمو!", "لو", "سمحت!", "أنا", "بقيت", "عمو؟!"]
        assert [w["start"] for w in words] == [0.84, 1.5, 2.2, 3.2, 3.8, 4.4] and words[-1]["end"] == 5.0
        assert [w["seg_idx"] for w in words] == [0, 0, 0, 1, 1, 1]
        assert hits == 2, "captions are searchable"


def test_auto_captions_are_marked_and_language_is_worked_out(world):
    _, a, _ = world
    with a:
        ep = youtube.save_video(VIDEO, "", LINES, auto=True, language="klingon")
        assert ep["model"] == "youtube-auto" and ep["title"] == "YouTube video"
        assert ep["language"] == "ar", "an unknown language code falls back to the letters used"
        assert ep["duration"] == 5.0, "without a length, the last caption's end stands in"


def test_adding_a_video_again_replaces_it(world):
    _, a, _ = world
    with a:
        first = youtube.save_video(VIDEO, "One", LINES)
        again = youtube.save_video(VIDEO, "Two", [{"start": 0, "end": 1, "text": "جديد", "words": [[0, 1, "جديد"]]}])
        assert again["id"] == first["id"] and again["title"] == "Two" and again["words"] == 1
        with db.session() as conn:
            assert conn.execute("SELECT COUNT(*) FROM words WHERE episode_id = ?", (first["id"],)).fetchone()[0] == 1


def test_rejects_bad_ids_and_videos_without_captions(world):
    _, a, _ = world
    with a:
        for bad in ("", "short", "https://www.youtube.com/watch?v=" + VIDEO, "x" * 12):
            with pytest.raises(youtube.YouTubeError):
                youtube.save_video(bad, "t", LINES)
        with pytest.raises(youtube.YouTubeError, match="No captions available"):
            youtube.save_video(VIDEO, "t", [{"start": 0, "end": 1, "text": "", "words": []}])


def test_requests_only_go_to_youtube():
    for url in ("http://www.youtube.com/x", "https://example.com/", "https://www.youtube.com.evil.net/", "file:///c:/x",
                "https://127.0.0.1/"):
        with pytest.raises(youtube.YouTubeError):
            youtube.request(url)
    with pytest.raises(youtube.YouTubeError):
        youtube.request("https://www.youtube.com/x", method="DELETE")


def test_video_syncs_to_another_device(world):
    drive, a, b = world
    with a:
        ep = youtube.save_video(VIDEO, "الدحيح", LINES, channel="AJ+", duration=2037, language="ar")
    r = a.sync(drive)
    assert r.uploaded_transcripts >= 1 and r.uploaded_audio == 0, "only the captions travel; there is no audio to copy"
    payload = engine._ungz(drive.by_name(engine.transcript_name(ep["uid"]))["data"])
    assert payload["model"] == "youtube-captions" and "kinds" not in payload
    rb = b.sync(drive)
    with b:
        with db.session() as conn:
            row = conn.execute("SELECT * FROM episodes WHERE uid = ?", (ep["uid"],)).fetchone()
            assert row["feed_id"] not in rb.new_feeds, "the YouTube list has no RSS to fetch"
            starts = [w[0] for w in conn.execute("SELECT start FROM words WHERE episode_id = ? ORDER BY idx", (row["id"],))]
        assert row["status"] == "done" and row["audio_type"] == "video/youtube" and row["duration"] == 2037
        assert row["guid"] == VIDEO and starts == [0.84, 1.5, 2.2, 3.2, 3.8, 4.4]


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_youtube_api_add_watch_delete(client):
    body = {"video_id": VIDEO, "title": "الدحيح", "channel": "AJ+", "duration": 2037, "language": "ar", "auto": False, "lines": LINES}
    r = client.post("/api/youtube", json=body)
    assert r.status_code == 200, r.text
    ep = r.json()
    t = client.get(f"/api/episodes/{ep['id']}/transcript").json()
    assert t["episode"]["audio_type"] == "video/youtube" and t["episode"]["model"] == "youtube-captions"
    assert t["words"]["text"][:2] == ["عمو!", "لو"] and t["words"]["start"][0] == 0.84
    assert client.get(f"/api/episodes/{ep['id']}/audio").status_code == 404, "nothing is downloaded from YouTube"
    mine = next(f for f in client.get("/api/feeds").json() if f["url"] == youtube.LOCAL_FEED_URL)
    assert mine["episode_count"] == 1 and mine["done_count"] == 1
    assert client.get("/api/search?q=سمحت").json()["total"] >= 1
    assert client.post("/api/youtube", json={**body, "lines": []}).status_code == 400
    assert client.post("/api/youtube/request", json={"url": "https://example.com/"}).status_code == 400
    assert client.delete(f"/api/feeds/{mine['id']}").status_code == 400
    assert client.delete(f"/api/episodes/{ep['id']}").json() == {"ok": True}
    assert client.get(f"/api/episodes?feed_id={mine['id']}").json()["total"] == 0


# ----- trending podcasts -----

FEEDS = [
    {"id": 1, "url": "https://a.example/rss", "title": " Fnjan  ", "author": "Thmanyah", "description": "x " * 500,
     "image": "http://a.example/small.jpg", "artwork": "https://a.example/big.jpg", "trendScore": 5, "language": "AR",
     "categories": {"77": "Society", "78": "Culture"}, "newestItemPublishTime": 1700000000},
    {"id": 2, "url": "https://b.example/rss", "title": "News", "trendScore": 9, "language": "ar-sa", "categories": None},
    {"id": 3, "url": "ftp://c.example/rss", "title": "Not a web address"},
    {"id": 4, "url": "https://d.example/rss", "title": "   "},
]


def test_request_is_signed_the_way_the_directory_expects():
    h = podcastindex.auth_headers("KEY", "SECRET", 1700000000)
    assert h["X-Auth-Key"] == "KEY" and h["X-Auth-Date"] == "1700000000"
    assert h["Authorization"] == hashlib.sha1(b"KEYSECRET1700000000").hexdigest()
    assert h["User-Agent"]


def test_language_list_is_cleaned():
    assert podcastindex.clean_languages("AR, ar-SA  es-419,ar") == "ar,ar-sa,es-419"
    for bad in ("", "../etc", "a", "ar;drop"):
        with pytest.raises(podcastindex.DirectoryError):
            podcastindex.clean_languages(bad)


def test_trending_tidies_sorts_and_caches(monkeypatch):
    calls = []

    def fake_get(url, **kw):
        calls.append((url, kw))
        return httpx.Response(200, json={"feeds": FEEDS})

    monkeypatch.setattr(podcastindex, "credentials", lambda: ("KEY", "SECRET"))
    monkeypatch.setattr(podcastindex.httpx, "get", fake_get)
    podcastindex._cache.clear()
    feeds = podcastindex.trending("ar,ar-sa")
    assert [f["title"] for f in feeds] == ["News", "Fnjan"], "best first; unusable entries dropped"
    assert feeds[1]["image"] == "https://a.example/big.jpg" and feeds[1]["categories"] == ["Society", "Culture"]
    assert feeds[1]["language"] == "ar" and len(feeds[1]["description"]) <= 600 and feeds[0]["categories"] == []
    url, kw = calls[0]
    assert url.endswith("/podcasts/trending") and kw["params"]["lang"] == "ar,ar-sa" and kw["headers"]["X-Auth-Key"] == "KEY"
    podcastindex.trending("ar,ar-sa")
    assert len(calls) == 1, "a second look within the hour doesn't ask the directory again"
    podcastindex.trending("ar,ar-sa", fresh=True)
    assert len(calls) == 2


def test_trending_api_explains_itself(client, monkeypatch):
    podcastindex._cache.clear()
    monkeypatch.setattr(podcastindex, "credentials", lambda: None)
    r = client.get("/api/discover/trending?lang=ar")
    assert r.status_code == 503 and "switched on" in r.json()["detail"]
    monkeypatch.setattr(podcastindex, "credentials", lambda: ("KEY", "SECRET"))
    monkeypatch.setattr(podcastindex.httpx, "get", lambda url, **kw: httpx.Response(401, json={}))
    assert client.get("/api/discover/trending?lang=ar").status_code == 502
    monkeypatch.setattr(podcastindex.httpx, "get", lambda url, **kw: httpx.Response(200, json={"feeds": FEEDS}))
    assert [f["id"] for f in client.get("/api/discover/trending?lang=ar").json()["feeds"]] == [2, 1]
