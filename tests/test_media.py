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


def test_youtube_window_closes_once_its_video_is_showing(monkeypatch):
    import time

    from app import desktop

    class FakeWindow:
        def __init__(self):
            self.closed = False

        def get_current_url(self):
            return "https://www.youtube.com/"

        def destroy(self):
            self.closed = True

    answers = iter([{"ok": False, "error": "No captions available for this video."}, {"ok": True, "title": "Video"}])
    monkeypatch.setattr(youtube, "ask_app_to_watch", lambda video_id, at=None: next(answers))
    youtube_api = desktop.BrowserApi(None, close_after_watch=True)
    youtube_api._window = FakeWindow()
    assert youtube_api.watch_video(VIDEO)["ok"] is False
    time.sleep(0.6)
    assert not youtube_api._window.closed, "a video that couldn't open leaves the window open"
    assert youtube_api.watch_video(VIDEO)["ok"] is True
    time.sleep(0.6)
    assert youtube_api._window.closed

    monkeypatch.setattr(youtube, "ask_app_to_watch", lambda video_id, at=None: {"ok": True, "title": "Video"})
    browser_api = desktop.BrowserApi(None)  # the ordinary Web Browser stays open
    browser_api._window = FakeWindow()
    assert browser_api.watch_video(VIDEO)["ok"] is True
    time.sleep(0.6)
    assert not browser_api._window.closed


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


# ----- followed YouTube channels -----

CHANNEL = "UC-4KnPMmZzwAzW7SbVATUZQ"


def test_follow_lists_merge_like_the_phones():
    # The same cases as "two devices agree" in tests/js/ytfollow.test.mjs: both must give this.
    phone = [{"name": "A", "on": 1, "updated_at": 10, "watched_at": 10}, {"name": "B", "on": 1, "updated_at": 20, "watched_at": 20}]
    computer = [{"name": "B", "on": 0, "updated_at": 30, "watched_at": 20},
                {"name": "C", "on": 1, "updated_at": 5, "watched_at": 5, "id": CHANNEL}]
    expected = [
        {"name": "A", "id": "", "image": "", "on": 1, "watched_at": 10, "updated_at": 10},
        {"name": "B", "id": "", "image": "", "on": 0, "watched_at": 20, "updated_at": 30},
        {"name": "C", "id": CHANNEL, "image": "", "on": 1, "watched_at": 5, "updated_at": 5},
    ]
    assert youtube.merge_follows(phone, computer) == expected
    assert youtube.merge_follows(computer, phone) == expected
    assert youtube.merge_follows(expected, expected) == expected
    assert youtube.merge_follows([], None) == []
    names = [r["name"] for r in youtube.merge_follows([{"name": "😀 fun", "on": 1}, {"name": "ﻻ", "on": 1}, {"name": "Z", "on": 1}], [])]
    assert names == ["Z", "😀 fun", "ﻻ"], "the same order JavaScript sorts in"


def test_follow_lists_are_tidied_like_the_phones():
    tidy = youtube.clean_follows([
        {"name": "b", "on": 1, "updated_at": 5, "id": "not an id", "image": "http://insecure/x"},
        "junk", None, {"on": 1}, {"name": ""},
        {"name": "a", "on": "yes", "watched_at": "7.8", "updated_at": 3},
        {"name": "b", "on": 0, "updated_at": 9},
        {"name": "  AJ+   كبريت ", "on": True, "id": CHANNEL, "image": "https://yt3.example/a=s900", "watched_at": 100.9, "updated_at": 100},
    ])
    assert tidy == [
        {"name": "AJ+ كبريت", "id": CHANNEL, "image": "https://yt3.example/a=s900", "on": 1, "watched_at": 100, "updated_at": 100},
        {"name": "a", "id": "", "image": "", "on": 1, "watched_at": 7, "updated_at": 3},
        {"name": "b", "id": "", "image": "", "on": 0, "watched_at": 0, "updated_at": 9},
    ]
    assert youtube.clean_follows(None) == [] and youtube.clean_follows({"name": "x"}) == []


def test_follows_are_saved_through_settings_and_one_channels_videos_can_be_listed(client):
    r = client.patch("/api/settings", json={"youtube_follows": [{"name": " AJ+ ", "on": 1, "updated_at": 7, "extra": "x"}, "junk"]})
    assert r.status_code == 200
    assert r.json()["youtube_follows"] == [{"name": "AJ+", "id": "", "image": "", "on": 1, "watched_at": 0, "updated_at": 7}]
    assert client.get("/api/settings").json()["youtube_follows"][0]["name"] == "AJ+"

    client.post("/api/youtube", json={"video_id": VIDEO, "title": "One", "channel": "AJ+", "language": "ar", "lines": LINES})
    client.post("/api/youtube", json={"video_id": "abcdefghijk", "title": "Two", "channel": "Other channel", "language": "ar", "lines": LINES})
    feed = next(f for f in client.get("/api/feeds").json() if f["url"] == youtube.LOCAL_FEED_URL)
    everything = client.get(f"/api/episodes?feed_id={feed['id']}").json()
    assert everything["total"] == 2 and {e["description"] for e in everything["items"]} == {"AJ+", "Other channel"}
    mine = client.get(f"/api/episodes?feed_id={feed['id']}&channel=AJ%2B").json()
    assert mine["total"] == 1 and mine["items"][0]["title"] == "One"
    assert client.get(f"/api/episodes?feed_id={feed['id']}&channel=Nobody").json()["total"] == 0


def test_followed_channels_travel_between_devices(world):
    drive, a, b = world
    with a:
        db.set_settings({"youtube_follows": youtube.clean_follows([{"name": "AJ+", "on": 1, "id": CHANNEL, "watched_at": 50, "updated_at": 50}])})
    a.sync(drive)
    rb = b.sync(drive)
    with b:
        assert db.get_setting("youtube_follows") == [{"name": "AJ+", "id": CHANNEL, "image": "", "on": 1, "watched_at": 50, "updated_at": 50}]
        assert rb.merged.get("channels") == 1 and not rb.library_uploaded, "receiving it doesn't send anything back"
        # Unfollowed on the second device, and another channel followed there.
        db.set_settings({"youtube_follows": [{"name": "AJ+", "id": CHANNEL, "image": "", "on": 0, "watched_at": 50, "updated_at": 90},
                                             {"name": "Second", "id": "", "image": "", "on": 1, "watched_at": 80, "updated_at": 80}]})
    b.sync(drive)
    a.sync(drive)
    with a:
        got = db.get_setting("youtube_follows")
        assert [(r["name"], r["on"]) for r in got] == [("AJ+", 0), ("Second", 1)], "the unfollow arrives too"
    assert not a.sync(drive).library_uploaded and not b.sync(drive).library_uploaded, "then both are settled"


# ----- following from a channel's page in the browser window -----

def test_follow_and_unfollow_like_the_phones():
    # The same steps as the first test in tests/js/ytfollow.test.mjs.
    follows = youtube.set_follow([], {"name": "  AJ+   كبريت "}, True, 100.9)
    assert follows == [{"name": "AJ+ كبريت", "id": "", "image": "", "on": 1, "watched_at": 100, "updated_at": 100}]
    assert youtube.is_followed(follows, "AJ+ كبريت") and not youtube.is_followed(follows, "Someone else")
    follows = youtube.set_follow(follows, {"name": "AJ+ كبريت", "id": CHANNEL}, False, 200)
    assert not youtube.is_followed(follows, "AJ+ كبريت")
    assert [(r["on"], r["updated_at"], r["watched_at"], r["id"]) for r in follows] == [(0, 200, 100, CHANNEL)]
    assert youtube.set_follow(follows, {"name": "   "}, True, 300) == follows
    again = youtube.set_follow(follows, {"name": "AJ+ كبريت"}, True, 400)
    assert again[0]["id"] == CHANNEL and again[0]["on"] == 1, "what was known about the channel is kept"


class _Window:
    def __init__(self, url):
        self.url = url

    def get_current_url(self):
        return self.url


def test_browser_window_follows_a_channel_only_on_youtube(client):
    from app import desktop

    api = desktop.BrowserApi()
    api._window = _Window(f"https://www.youtube.com/channel/{CHANNEL}/videos")
    assert api.following("AJ+") == {"following": False}
    r = api.follow_channel("  AJ+ ", CHANNEL, "https://yt3.example/pic=s900", True)
    assert r == {"ok": True, "following": True}
    saved = client.get("/api/settings").json()["youtube_follows"]
    assert [(c["name"], c["id"], c["image"], c["on"]) for c in saved] == [("AJ+", CHANNEL, "https://yt3.example/pic=s900", 1)]
    assert api.following("AJ+") == {"following": True}
    assert api.follow_channel("AJ+", CHANNEL, "", False) == {"ok": True, "following": False}
    assert client.get("/api/settings").json()["youtube_follows"][0]["on"] == 0
    assert api.follow_channel("", CHANNEL, "", True)["ok"] is False

    # Any other website shown in the browser may not touch the list.
    api._window = _Window("https://example.com/")
    assert api.follow_channel("Evil", "", "", True)["ok"] is False
    assert api.following("AJ+") == {"following": False}
    assert [c["name"] for c in client.get("/api/settings").json()["youtube_follows"]] == ["AJ+"]
