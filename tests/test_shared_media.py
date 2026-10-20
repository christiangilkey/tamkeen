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


# ---------------------------------------------------------------- a podcast episode sent from the Library

FEED_URL = "https://feeds.example.com/pod.xml"


def _follow(language: str = "ar") -> dict:
    """A followed podcast with one untranscribed episode (no network: written straight in)."""
    import time

    from app import db, ids

    fuid = ids.feed_uid(FEED_URL)
    with db.session() as conn:
        feed_id = conn.execute("INSERT INTO feeds(url, uid, title, created_at, language) VALUES(?,?,?,?,?)",
                               (FEED_URL, fuid, "Pod", time.time(), language)).lastrowid
        ep_id = conn.execute(
            "INSERT INTO episodes(feed_id, uid, guid, title, published, audio_url, created_at) VALUES(?,?,?,?,?,?,?)",
            (feed_id, ids.episode_uid(fuid, "ep-3"), "ep-3", "Episode 3", time.time(),
             "https://cdn.example.com/3.mp3", time.time())).lastrowid
    return {"feed_id": feed_id, "episode_id": ep_id, "feed_uid": fuid}


def _podcast(**extra) -> dict:
    return {"feed_url": FEED_URL, "guid": "ep-3", "audio_url": "https://cdn.example.com/3.mp3", "title": "Episode 3",
            "language": "ar", "model": "large-v3-turbo", "segments": SEGMENTS, **extra}


def test_a_sent_podcast_episode_arrives_transcribed(client):
    known = _follow()
    r = client.post("/api/shared/podcast", json=_podcast())
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["episode"]["id"] == known["episode_id"], "the episode already listed is the one used"
    assert out["transcribed"] is True and out["kept_own"] is False and out["added_feed"] is False
    assert out["episode"]["status"] == "done" and out["episode"]["model"] == "large-v3-turbo"
    t = client.get(f"/api/episodes/{known['episode_id']}/transcript").json()
    assert t["words"]["text"] == ["مرحبا", "بكم", "في", "المطبخ"]
    assert t["words"]["start"] == [0.0, 0.8, 1.6, 2.2]
    # Found by its audio address too (a guid written differently by another app).
    again = client.post("/api/shared/podcast", json=_podcast(guid="other-guid"))
    assert again.json()["episode"]["id"] == known["episode_id"]


def test_my_own_transcript_is_kept(client):
    known = _follow()
    client.post("/api/shared/podcast", json=_podcast(segments=SEGMENTS[:1]))
    r = client.post("/api/shared/podcast", json=_podcast())
    assert r.json()["kept_own"] is True and r.json()["transcribed"] is False
    t = client.get(f"/api/episodes/{known['episode_id']}/transcript").json()
    assert t["words"]["text"] == ["مرحبا", "بكم"], "the transcript already here wasn't replaced"


def test_an_episode_gone_from_the_feed_is_kept_from_what_was_sent(client):
    from app import ids

    known = _follow()
    r = client.post("/api/shared/podcast", json=_podcast(guid="ep-1", audio_url="https://cdn.example.com/1.mp3", title="Old one",
                                                         duration=95.5))
    assert r.status_code == 200, r.text
    ep = r.json()["episode"]
    assert ep["id"] != known["episode_id"] and ep["title"] == "Old one" and ep["duration"] == 95.5
    assert ep["uid"] == ids.episode_uid(known["feed_uid"], "ep-1"), "the id the feed itself would give it, so no copy appears later"
    assert ep["audio_url"] == "https://cdn.example.com/1.mp3" and ep["status"] == "done"
    # Without an audio address there is nothing to play: refused.
    bad = client.post("/api/shared/podcast", json=_podcast(guid="ep-0", audio_url=""))
    assert bad.status_code == 400


def test_a_podcast_not_followed_yet_is_followed_in_its_own_language(client, monkeypatch):
    import time

    from app import db, feeds, ids

    def fake_add(url):  # what feeds.add_feed does, without reading the feed from the internet
        with db.session() as conn:
            fid = conn.execute("INSERT INTO feeds(url, uid, title, created_at, language) VALUES(?,?,?,?,?)",
                               (url, ids.feed_uid(url), "New pod", time.time(), "es")).lastrowid
            return dict(conn.execute("SELECT * FROM feeds WHERE id = ?", (fid,)).fetchone())

    monkeypatch.setattr(feeds, "add_feed", fake_add)
    r = client.post("/api/shared/podcast", json=_podcast())
    assert r.status_code == 200, r.text
    assert r.json()["added_feed"] is True and r.json()["transcribed"] is True
    with db.session() as conn:
        lang = conn.execute("SELECT language FROM feeds WHERE url = ?", (FEED_URL,)).fetchone()["language"]
    assert lang == "ar", "filed under the episode's language, not the one being learned"
    # No words: still added, to transcribe here.
    r2 = client.post("/api/shared/podcast", json=_podcast(guid="ep-9", audio_url="https://cdn.example.com/9.mp3", segments=[]))
    assert r2.json()["transcribed"] is False and r2.json()["episode"]["status"] == "new"


def test_bad_podcast_sends_are_refused(client):
    assert client.post("/api/shared/podcast", json=_podcast(feed_url="local:videos")).status_code == 400
    assert client.post("/api/shared/podcast", json=_podcast(feed_url="javascript:alert(1)")).status_code == 400
    _follow()
    assert client.post("/api/shared/podcast", json=_podcast(guid="", audio_url="")).status_code == 400


def test_a_recordings_words_can_be_kept_as_a_book(client):
    """A friend's own video arrives as its words, through the ordinary books route (sharetext.js)."""
    r = client.post("/api/books", json={"guid": "file:shared:My lesson:4", "title": "My lesson", "author": "", "lang": "ar",
                                        "blocks": [{"kind": "p", "text": "مرحبا بكم"}, {"kind": "p", "text": "في المطبخ"}],
                                        "source": "transcript"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "done" and r.json()["audio_type"] == "text/book"


def test_a_sent_page_keeps_the_language_it_had_for_the_sender(client):
    """Latin letters could be several languages; a page a friend sent says which (POST /pages `language`)."""
    from app import db

    db.set_settings({"study_language": "ar"})
    blocks = [{"kind": "p", "text": "Es una bebida muy popular en todo el mundo."}]
    sent = client.post("/api/pages", json={"url": "https://example.es/cafe", "title": "El café", "blocks": blocks, "language": "es"})
    assert sent.status_code == 200, sent.text
    assert sent.json()["language"] == "es"
    # Arabic letters stay Arabic whatever the hint says.
    ar = client.post("/api/pages", json={"url": "https://example.com/q", "title": "q", "language": "es",
                                         "blocks": [{"kind": "p", "text": "القهوة مشروب شعبي"}]})
    assert ar.json()["language"] == "ar"
