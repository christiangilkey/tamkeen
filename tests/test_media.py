"""Media import: YouTube videos (captions as the transcript) and trending podcasts."""

from __future__ import annotations

import httpx
import pytest

from app import charts, db, ids, youtube
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


# ----- trending podcasts (Apple's charts, fetched for web/js/trending.js) -----

CHART = "https://itunes.apple.com/sa/rss/toppodcasts/limit=200/json?l=en"


def test_chart_requests_only_go_to_apple():
    for url in ("http://itunes.apple.com/x", "https://example.com/", "https://itunes.apple.com.evil.net/x",
                "file:///c:/x", "https://127.0.0.1/", ""):
        with pytest.raises(charts.ChartError, match="allowed"):
            charts.get_json(url)


def test_chart_answers_are_kept_for_a_while(monkeypatch):
    calls = []

    def fake_get(url, **kw):
        calls.append(url)
        return httpx.Response(200, json={"feed": {"entry": []}})

    monkeypatch.setattr(charts.httpx, "get", fake_get)
    charts._cache.clear()
    assert charts.get_json(CHART) == {"feed": {"entry": []}}
    charts.get_json(CHART)
    assert calls == [CHART], "a second look within the hour doesn't ask Apple again"
    charts.get_json(CHART.replace("/sa/", "/eg/"))
    assert len(calls) == 2


def test_chart_api_passes_answers_and_failures_on(client, monkeypatch):
    charts._cache.clear()
    monkeypatch.setattr(charts.httpx, "get", lambda url, **kw: httpx.Response(200, json={"resultCount": 0, "results": []}))
    r = client.get("/api/discover/apple", params={"url": CHART})
    assert r.status_code == 200 and r.json() == {"resultCount": 0, "results": []}
    assert client.get("/api/discover/apple", params={"url": "https://example.com/"}).status_code == 400
    charts._cache.clear()
    monkeypatch.setattr(charts.httpx, "get", lambda url, **kw: httpx.Response(503, text="busy"))
    assert client.get("/api/discover/apple", params={"url": CHART}).status_code == 502

    def offline(url, **kw):
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(charts.httpx, "get", offline)
    r = client.get("/api/discover/apple", params={"url": CHART})
    assert r.status_code == 502 and "Couldn't reach" in r.json()["detail"]


# ----- "Open YouTube": a video tapped in the browser window opens in the app's player -----

def test_a_video_already_in_the_library_is_found_again(client):
    assert client.get(f"/api/youtube/{VIDEO}").status_code == 404
    assert client.get("/api/youtube/not-a-video-id").status_code == 400
    body = {"video_id": VIDEO, "title": "الدحيح", "language": "ar", "lines": LINES}
    ep = client.post("/api/youtube", json=body).json()
    found = client.get(f"/api/youtube/{VIDEO}").json()
    assert found["id"] == ep["id"] and found["audio_type"] == "video/youtube"
    client.delete(f"/api/episodes/{ep['id']}")
    assert client.get(f"/api/youtube/{VIDEO}").status_code == 404, "a removed video is not offered again"


def test_browser_window_waits_for_the_apps_answer(client, monkeypatch):
    import threading

    from app import events

    asked = []

    def page_answers(event, data):
        # Stands in for the app's page: it hears the request and reports how adding the video went.
        asked.append((event, data["video_id"]))
        reply = {"token": data["token"], "ok": False, "error": "No captions available for this video."}
        threading.Thread(target=lambda: client.post("/api/youtube/watch-result", json=reply)).start()

    monkeypatch.setattr(events, "publish", page_answers)
    assert youtube.ask_app_to_watch(VIDEO, timeout=5) == {"ok": False, "error": "No captions available for this video."}
    assert asked == [("youtube_watch", VIDEO)]

    def page_succeeds(event, data):
        youtube.answer_watch(data["token"], True, title="الدحيح")

    monkeypatch.setattr(events, "publish", page_succeeds)
    assert youtube.ask_app_to_watch(VIDEO, timeout=5) == {"ok": True, "title": "الدحيح"}


def test_browser_window_gives_up_when_nobody_answers(client, monkeypatch):
    from app import events

    monkeypatch.setattr(events, "publish", lambda event, data: None)
    r = youtube.ask_app_to_watch(VIDEO, timeout=0.05)
    assert r["ok"] is False and "didn't answer" in r["error"]
    assert youtube.ask_app_to_watch("nonsense")["ok"] is False
    assert client.post("/api/youtube/watch-result", json={"token": "stale", "ok": True}).json() == {"ok": False}
    assert not youtube._watching, "nothing is left waiting"


# ----- the phone's Library: "All episodes" under Podcasts leaves the built-in lists out -----

def test_episode_list_can_be_limited_to_podcasts(client):
    from app import pages

    with db.session() as conn:
        conn.execute("INSERT INTO feeds(uid, url, title, created_at) VALUES('fpod', 'https://example.com/rss', 'Pod', 1)")
        feed_id = conn.execute("SELECT id FROM feeds WHERE uid = 'fpod'").fetchone()[0]
        for n in (1, 2):
            conn.execute("INSERT INTO episodes(feed_id, uid, guid, title, audio_url, created_at) VALUES(?,?,?,?,?,?)",
                         (feed_id, f"epod{n}", f"g{n}", f"Episode {n}", "https://example.com/a.mp3", n))
    client.post("/api/youtube", json={"video_id": VIDEO, "title": "Video", "language": "ar", "lines": LINES})
    pages.save_page("https://example.com/coffee", "Page", [{"kind": "p", "text": "قهوة عربية"}])

    everything = client.get("/api/episodes").json()
    assert everything["total"] == 4 and everything["counts"] == {"new": 2, "done": 2}
    only = client.get("/api/episodes?scope=podcasts").json()
    assert only["total"] == 2 and {e["title"] for e in only["items"]} == {"Episode 1", "Episode 2"}
    assert only["counts"] == {"new": 2}, "the filter tabs count podcasts only too"
    assert client.get("/api/episodes?scope=podcasts&status=done").json()["total"] == 0
    assert client.get(f"/api/episodes?scope=podcasts&feed_id={feed_id}").json()["total"] == 2


def test_youtube_window_only_starts_on_youtube():
    start = "https://www.youtube.com/results?search_query=%D9%81%D9%8A&sp=CAMSBAgDEAE%3D&gl=SA&hl=ar"
    assert youtube.start_address(start) == start
    assert youtube.start_address("https://m.youtube.com/") == "https://m.youtube.com/"
    for other in ("", None, "https://example.com/", "http://www.youtube.com/", "javascript:alert(1)",
                  "https://www.youtube.com.evil.example/results"):
        assert youtube.start_address(other) == youtube.BROWSER_HOME
