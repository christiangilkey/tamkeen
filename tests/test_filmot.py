"""'Find in a video': a word with nothing to listen to is given a video, a moment and a sentence."""

from __future__ import annotations

import time

import pytest

from app import desktop, youtube

VIDEO = "lo3KyF50IGE"
LINES = [
    {"start": 0.84, "end": 3.2, "text": "عمو! لو سمحت!", "words": [[0.84, 1.5, "عمو!"], [1.5, 2.2, "لو"], [2.2, 3.2, "سمحت!"]]},
    {"start": 3.2, "end": 5.0, "text": "أنا بقيت عمو؟!", "words": [[3.2, 3.8, "أنا"], [3.8, 4.4, "بقيت"], [4.4, 5.0, "عمو؟!"]]},
]


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_a_word_is_given_the_video_and_sentence_it_is_said_in(client):
    word = client.post("/api/vocab", json={"text": "بقيت", "sentence": "typed in by hand", "meaning": "I became",
                                           "translation": "typed ⟦in⟧ by hand"}).json()
    assert word["episode_id"] is None and word["start"] is None
    ep = client.post("/api/youtube", json={"video_id": VIDEO, "title": "الدحيح", "language": "ar", "lines": LINES}).json()
    time.sleep(0.01)
    source = {"episode_id": ep["id"], "sentence": " أنا بقيت عمو؟! ", "start": 3.8, "end": 4.4, "sent_start": 3.2, "sent_end": 5.0}
    r = client.post(f"/api/vocab/{word['id']}/source", json=source)
    assert r.status_code == 200, r.text
    saved = r.json()
    assert (saved["episode_id"], saved["episode_title"], saved["sentence"]) == (ep["id"], "الدحيح", "أنا بقيت عمو؟!")
    assert (saved["start"], saved["end"], saved["sent_start"], saved["sent_end"]) == (3.8, 4.4, 3.2, 5.0)
    assert saved["meaning"] == "I became" and saved["text"] == "بقيت", "what the learner wrote stays"
    assert saved["translation"] == "", "the old sentence's translation goes with the old sentence"
    assert saved["updated_at"] > word["updated_at"], "so the change reaches the other devices"
    listed = client.get("/api/vocab").json()[0]
    assert listed["episode_id"] == ep["id"] and listed["sent_start"] == 3.2


def test_a_source_needs_a_real_word_a_real_episode_and_a_sentence(client):
    word = client.post("/api/vocab", json={"text": "بقيت"}).json()
    ep = client.post("/api/youtube", json={"video_id": VIDEO, "title": "الدحيح", "language": "ar", "lines": LINES}).json()
    source = {"episode_id": ep["id"], "sentence": "أنا بقيت عمو؟!", "start": 3.8, "end": 4.4, "sent_start": 3.2, "sent_end": 5.0}
    assert client.post(f"/api/vocab/{word['id']}/source", json={**source, "episode_id": 999}).status_code == 404
    assert client.post("/api/vocab/999/source", json=source).status_code == 404
    assert client.post(f"/api/vocab/{word['id']}/source", json={**source, "sentence": "  "}).status_code == 400
    assert client.get("/api/vocab").json()[0]["episode_id"] is None, "nothing was changed by the refused requests"


def test_the_moment_travels_with_the_request_to_watch(monkeypatch):
    from app import events

    heard = []

    def page_answers(event, data):
        heard.append((event, data["video_id"], data["at"]))
        youtube.answer_watch(data["token"], True, title="الدحيح")

    monkeypatch.setattr(events, "publish", page_answers)
    assert youtube.ask_app_to_watch(VIDEO, timeout=5, at=95.0)["ok"] is True
    assert youtube.ask_app_to_watch(VIDEO, timeout=5)["ok"] is True
    assert heard == [("youtube_watch", VIDEO, 95.0), ("youtube_watch", VIDEO, None)]


class _Window:
    def __init__(self, url: str) -> None:
        self.url = url

    def get_current_url(self) -> str:
        return self.url


def test_only_youtube_and_filmot_pages_may_hand_over_a_video(monkeypatch):
    asked = []
    monkeypatch.setattr(youtube, "ask_app_to_watch", lambda video_id, at=None: asked.append((video_id, at)) or {"ok": True})
    api = desktop.BrowserApi()
    api._window = _Window("https://filmot.com/search/x/1?gridView=1")
    assert api.watch_video(VIDEO, 95)["ok"] is True
    api._window = _Window("https://www.youtube.com/watch?v=" + VIDEO)
    assert api.watch_video(VIDEO)["ok"] is True
    # A moment that is not a sensible number of seconds is dropped, not passed on.
    for odd in ("95", -1, 10**9, True, None, {"a": 1}):
        api.watch_video(VIDEO, odd)
    assert asked == [(VIDEO, 95.0), (VIDEO, None)] + [(VIDEO, None)] * 6
    for elsewhere in ("https://filmot.com.example.org/", "https://notfilmot.com/", "https://example.com/?filmot.com"):
        api._window = _Window(elsewhere)
        assert api.watch_video(VIDEO, 5)["ok"] is False
    assert len(asked) == 8, "other websites reach nothing"
