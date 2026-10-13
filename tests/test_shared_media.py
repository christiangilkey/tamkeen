"""A reel a friend sent arrives with its words (app/api/shared.py)."""

from __future__ import annotations

import pytest

from app.api.shared import clean_segments


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


SEGMENTS = [
    {"start": 0.0, "end": 1.5, "text": "مرحبا بكم", "words": [[0.0, 0.7, "مرحبا"], [0.8, 1.5, "بكم"]]},
    {"start": 1.6, "end": 3.0, "text": "في المطبخ", "words": [[1.6, 2.1, "في"], [2.2, 3.0, "المطبخ"]]},
]


def test_a_sent_reel_is_kept_with_its_words(client):
    r = client.post("/api/shared/reel", json={"code": "DAbc123_x-9", "creator": "@chef.layla", "title": "Kitchen words",
                                               "language": "ar", "seconds": 3.2, "segments": SEGMENTS})
    assert r.status_code == 200, r.text
    ep = r.json()
    assert ep["audio_type"] == "video/instagram" and ep["guid"] == "DAbc123_x-9"
    assert ep["audio_url"] == "https://www.instagram.com/reel/DAbc123_x-9/"
    feeds = client.get("/api/feeds").json()
    assert any(f["url"] == "local:reels" for f in feeds)
    listed = client.get(f"/api/episodes?feed_id={ep['feed_id']}").json()["items"]
    assert [e["status"] for e in listed] == ["done"], "ready to play at once"
    t = client.get(f"/api/episodes/{ep['id']}/transcript").json()
    assert t["words"]["text"] == ["مرحبا", "بكم", "في", "المطبخ"]
    assert t["words"]["start"][2] == 1.6
    # Accepting the same reel again refreshes it instead of making a second one.
    again = client.post("/api/shared/reel", json={"code": "DAbc123_x-9", "creator": "chef.layla", "segments": SEGMENTS[:1]})
    assert again.json()["id"] == ep["id"]
    assert len(client.get(f"/api/episodes/{ep['id']}/transcript").json()["words"]["text"]) == 2


def test_bad_reels_are_refused(client):
    assert client.post("/api/shared/reel", json={"code": "../etc", "segments": SEGMENTS}).status_code == 400
    assert client.post("/api/shared/reel", json={"code": "DAbc123_x-9", "segments": []}).status_code == 400
    assert client.post("/api/shared/reel", json={"code": "DAbc123_x-9", "segments": [{"text": "   ", "words": []}]}).status_code == 400


def test_a_friends_words_are_checked_and_limited():
    out = clean_segments([
        {"start": "x", "end": -5, "text": "  two   words ", "words": [[1, 0.5, " a b "], ["bad"], [2, 3, ""], "nope"]},
        "not a segment",
        {"text": "", "words": []},
        {"start": 4, "end": 5, "text": "", "words": [[4, 5, "kept"]]},
    ] + [{"start": i, "end": i + 1, "text": "x" * 5000} for i in range(600)])
    assert out[0].text == "two words" and out[0].start == 0.0
    assert [(w.start, w.end, w.text) for w in out[0].words] == [(1.0, 1.0, "ab")], "times repaired, junk dropped"
    assert out[1].text == "kept"
    assert len(out) <= 400 and all(len(s.text) <= 2000 for s in out)
