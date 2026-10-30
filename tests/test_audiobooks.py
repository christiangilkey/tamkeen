"""Audiobooks. A LibriVox book is a "podcast" whose address is its chapter feed: its title is tidied as on the
phone, its chapters are listed in order, it stays out of the podcasts' "All episodes", it isn't read again by the
automatic refresh, and its catalogue files are served to the computer's page. A book of the learner's own files is
a list of its own, its chapters in file-name order. Also: the audio formats taken, and Audible's refused."""

from __future__ import annotations

import json
import sys

import pytest

from app import audiobooks, db, feeds, videos
from conftest import FIXTURES, ROOT

RSS = (FIXTURES / "librivox_rss.xml").read_bytes()
BOOK_URL = "https://librivox.org/rss/67"


def test_which_feeds_are_audiobooks():
    assert audiobooks.rss_for(67) == BOOK_URL
    for url in (BOOK_URL, "http://www.librivox.org/rss/12345/", " https://librivox.org/rss/1 "):
        assert audiobooks.is_audiobook_feed(url), url
    for url in ("https://librivox.org/", "https://example.com/rss/67", "https://librivox.org/rss/abc", "local:audio", "", None):
        assert not audiobooks.is_audiobook_feed(url), url


def test_titles_are_tidied_as_on_the_phone():
    # The same cases as tests/js/audiobooks.test.mjs: both devices write the title, so they must agree.
    for raw, tidy in json.loads((FIXTURES / "audiobook_titles.json").read_text(encoding="utf-8")):
        assert audiobooks.tidy_title(raw) == tidy, raw


def test_chapter_order_is_natural():
    urls = ["https://x/b_10_a_64kb.mp3", "https://x/b_01_a_64kb.mp3", "https://x/b_2_a_64kb.mp3?x=1"]
    assert sorted(urls, key=audiobooks.chapter_key) == [urls[1], urls[2], urls[0]]
    assert audiobooks.chapter_key("x/a.mp3", "Part 2") < audiobooks.chapter_key("x/a.mp3", "Part 10")


@pytest.fixture()
def client(fresh_db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    calls: list[str] = []

    def fake_fetch(url, etag=None, modified=None):
        calls.append(url)
        if audiobooks.is_audiobook_feed(url):
            return RSS, url, None, None
        return (b"<rss><channel><title>A podcast</title><item><title>Newest</title><pubDate>Mon, 02 Jan 2023 00:00:00 GMT</pubDate>"
                b"<enclosure url='https://cdn/new.mp3' type='audio/mpeg'/></item></channel></rss>"), url, None, None

    monkeypatch.setattr(feeds, "fetch", fake_fetch)
    with TestClient(create_app(start_worker=False)) as c:
        c.calls = calls
        yield c


def test_adding_a_book_lists_its_chapters_in_order(client):
    r = client.post("/api/feeds", json={"url": BOOK_URL, "title": "ignored here", "image": "https://x/c.jpg"})
    assert r.status_code == 200, r.text
    book = r.json()
    assert book["title"] == "The Divine Comedy by Dante Alighieri"
    assert book["image"].endswith("The_Divine_Comedy_1005.jpg")
    chapters = client.get(f"/api/episodes?feed_id={book['id']}").json()["items"]
    assert [c["title"] for c in chapters] == ["Bk 1, Inferno: Canto I - Canto V", "Bk 1, Inferno: Canto VI - Canto X",
                                              "Bk 3, Paradiso: Canto XXXI - Canto XXXIII"]
    assert [c["duration"] for c in chapters] == [2590, 2200, 1800]
    # Paging keeps the order.
    second = client.get(f"/api/episodes?feed_id={book['id']}&limit=1&offset=1").json()
    assert second["total"] == 3 and [c["duration"] for c in second["items"]] == [2200]


def test_books_stay_out_of_all_episodes_and_the_automatic_refresh(client):
    book = client.post("/api/feeds", json={"url": BOOK_URL}).json()
    podcast = client.post("/api/feeds", json={"url": "https://example.com/feed"}).json()
    every = client.get("/api/episodes?scope=podcasts").json()
    assert [e["title"] for e in every["items"]] == ["Newest"]
    assert sum(every["counts"].values()) == 1
    assert {f["id"] for f in client.get("/api/feeds").json()} == {book["id"], podcast["id"]}
    client.calls.clear()
    feeds.refresh_all()
    assert client.calls == ["https://example.com/feed"]  # the finished book isn't read again
    feeds.refresh_feed(book["id"])  # (but it is when it alone is refreshed)
    assert client.calls[-1] == BOOK_URL
    with db.session() as conn:
        assert conn.execute("SELECT title FROM feeds WHERE id = ?", (book["id"],)).fetchone()[0] == "The Divine Comedy by Dante Alighieri"


def test_the_catalogue_is_served_to_the_computers_page(client):
    if not (ROOT / "docs" / "audiobooks" / "index.json").exists():
        pytest.skip("docs/audiobooks not built")
    index = client.get("/api/audiobooks/index.json")
    assert index.status_code == 200 and "languages" in index.json()
    packed = client.get("/api/audiobooks/en.json.gz")
    assert packed.status_code == 200 and packed.headers["content-type"] == "application/gzip"
    assert client.get("/api/audiobooks/..%2Fapp.py").status_code == 404
    assert client.get("/api/audiobooks/xx.json.gz").status_code == 404


def test_catalogue_builder_rows():
    sys.path.insert(0, str(ROOT / "tools"))
    import build_audiobooks as build

    assert build.author_of({"authors": [{"first_name": "Dante", "last_name": "Alighieri"}]}) == "Dante Alighieri"
    assert build.cover_of({"coverart_thumbnail": "https://www.archive.org/download/A/b_thumb.jpg"}) == "A/b_thumb.jpg"
    assert build.LANGUAGES["Persian/Farsi"] == "fa" and build.LANGUAGES["Bisaya/Cebuano"] == "ceb"


def tone(path, fmt: str, codec: str, seconds: float = 2.0) -> bytes:
    """A short tone in the given container and codec (made with the app's own audio library)."""
    import av
    import numpy as np

    out = av.open(str(path), "w", format=fmt)
    stream = out.add_stream(codec, rate=16000)
    stream.layout = "mono"
    t = np.arange(int(16000 * seconds)) / 16000
    layout = "fltp" if codec == "aac" else "s16p" if codec == "pcm_s16be" else "fltp"
    data = (0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32).reshape(1, -1)
    if layout == "s16p":
        data = (data * 32767).astype(np.int16)
    frame = av.AudioFrame.from_ndarray(data, format=layout, layout="mono")
    frame.sample_rate = 16000
    for packet in stream.encode(frame):
        out.mux(packet)
    for packet in stream.encode(None):
        out.mux(packet)
    out.close()
    return path.read_bytes()


def test_own_audiobook_files_become_one_book_in_name_order(client, tmp_path):
    m4b = tone(tmp_path / "a.m4b", "mp4", "aac")
    sent = []
    for name, first in (("My Book - Part 10.m4b", False), ("My Book - Part 2.m4b", True)):
        r = client.post(f"/api/videos?filename={name}&book=k1abc&book_title=My%20Book&transcribe={'true' if first else 'false'}",
                        content=m4b)
        assert r.status_code == 200, r.text
        sent.append(r.json())
    assert sent[0]["feed_id"] == sent[1]["feed_id"] and sent[0]["audio_type"] == "audio/mp4"
    book = next(f for f in client.get("/api/feeds").json() if f["id"] == sent[0]["feed_id"])
    assert book["url"] == "local:audiobook:k1abc" and book["title"] == "My Book" and book["language"]
    chapters = client.get(f"/api/episodes?feed_id={book['id']}").json()["items"]
    assert [c["title"] for c in chapters] == ["My Book - Part 2", "My Book - Part 10"]
    with db.session() as conn:
        queued = {r[0] for r in conn.execute("SELECT episode_id FROM jobs").fetchall()}
    assert queued == {sent[1]["id"]}  # only the first chapter is transcribed straight away
    # Out of the podcasts, and only a list in its own language.
    assert client.get("/api/episodes?scope=podcasts").json()["total"] == 0


def test_unplayable_formats_are_kept_as_opus_and_audible_files_are_refused(client, tmp_path):
    aiff = tone(tmp_path / "a.aiff", "aiff", "pcm_s16be")
    r = client.post("/api/videos?filename=Chapter%201.aiff", content=aiff)
    assert r.status_code == 200, r.text
    ep = r.json()
    assert ep["audio_type"] == "audio/ogg" and ep["audio_url"].endswith(".ogg") and ep["audio_path"].endswith(".ogg")
    assert ep["duration"] and abs(ep["duration"] - 2.0) < 0.3
    r = client.post("/api/videos?filename=Book.aax", content=b"not really an Audible file")
    assert r.status_code == 400 and "copy-protected" in r.json()["detail"]
    r = client.post("/api/videos?filename=cover.jpg&book=k2&book_title=X", content=b"jpg")
    assert r.status_code == 400


def test_audio_formats_are_the_same_list_everywhere():
    assert videos.mime_for("Book.M4B") == "audio/mp4"
    for ext in (".m4b", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".flac", ".wav", ".wma", ".amr", ".webm", ".mka", ".aiff", ".aif"):
        assert ext in videos.AUDIO_TYPES, ext
    assert set(feeds.AUDIO_EXTENSIONS) == set(videos.AUDIO_TYPES) | {".mp4"}
    assert videos.PLAYABLE_COPY <= set(videos.AUDIO_TYPES)
    assert not (videos.AUDIBLE & set(videos.AUDIO_TYPES))
    parsed = feeds.parse_feed(b"<rss><channel><title>T</title><item><title>Book</title>"
                              b"<enclosure url='https://cdn/book.m4b'/></item></channel></rss>")
    assert parsed.episodes[0].audio_url == "https://cdn/book.m4b"
    assert audiobooks.is_audiobook_feed("local:audiobook:x") and audiobooks.is_own_book("local:audiobook:x")
    assert audiobooks.chapter_key("drive:v_z.mp3", "Part 2", own=True) < audiobooks.chapter_key("drive:v_a.mp3", "Part 10", own=True)
