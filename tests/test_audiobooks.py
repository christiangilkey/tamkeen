"""Audiobooks (LibriVox): a book is a "podcast" whose address is its chapter feed. Its title is tidied as on
the phone, its chapters are listed in order, it stays out of the podcasts' "All episodes", it isn't read
again by the automatic refresh, and its catalogue files are served to the computer's page. Also: .m4b files."""

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


def test_catalogue_builder_puts_genres_in_the_right_categories():
    sys.path.insert(0, str(ROOT / "tools"))
    import build_audiobooks as build

    assert build.categories_of(["Historical Fiction", "Published 1800 -1900"]) == ["fiction"]
    assert build.categories_of(["Detective Fiction"]) == ["fiction", "mystery"]
    assert build.categories_of(["Children's Fiction", "Action & Adventure"]) == ["fiction", "children"]
    assert build.categories_of(["*Non-fiction", "Political Science"]) == ["nonfiction"]
    assert build.categories_of(["Poetry", "Epics"]) == ["poetry"]
    assert build.categories_of(["King James Version"]) == ["religion"]
    assert build.categories_of(["General", "Modern"]) == []
    assert build.author_of({"authors": [{"first_name": "Dante", "last_name": "Alighieri"}]}) == "Dante Alighieri"
    assert build.cover_of({"coverart_thumbnail": "https://www.archive.org/download/A/b_thumb.jpg"}) == "A/b_thumb.jpg"


def test_m4b_audiobook_files_are_accepted():
    assert videos.mime_for("Book.M4B") == "audio/mp4"
    assert ".m4b" in videos.AUDIO_TYPES
    assert ".m4b" in feeds.AUDIO_EXTENSIONS
    parsed = feeds.parse_feed(b"<rss><channel><title>T</title><item><title>Book</title>"
                              b"<enclosure url='https://cdn/book.m4b'/></item></channel></rss>")
    assert parsed.episodes[0].audio_url == "https://cdn/book.m4b"
