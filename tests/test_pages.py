"""Imported web pages ("My webpages"): storage, API and sync between two devices."""

from __future__ import annotations

import pytest

from app import db, ids, pages
from app.sync import engine

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)

BLOCKS = [
    {"kind": "h2", "text": "القهوة العربية"},
    {"kind": "p", "text": "القهوة   مشروب  يُحضر من بذور البن."},
    {"kind": "li", "text": "حبوب البن"},
    {"kind": "weird", "text": "Unknown kinds become paragraphs"},
    {"kind": "p", "text": "   "},
]


def test_save_page_stores_blocks_as_clickable_text(world):
    _, a, _ = world
    with a:
        ep = pages.save_page("example.com/coffee", "  القهوة  ", BLOCKS, image="https://example.com/i.jpg")
        assert ep["audio_url"] == "https://example.com/coffee" and ep["audio_type"] == "text/html"
        assert ep["status"] == "done" and ep["title"] == "القهوة" and ep["words"] == 14
        with db.session() as conn:
            feed = conn.execute("SELECT url, uid FROM feeds WHERE id = ?", (ep["feed_id"],)).fetchone()
            segs = conn.execute("SELECT kind, text FROM segments WHERE episode_id = ? ORDER BY idx", (ep["id"],)).fetchall()
            words = [w[0] for w in conn.execute("SELECT text FROM words WHERE episode_id = ? ORDER BY idx", (ep["id"],))]
            hits = conn.execute("SELECT COUNT(*) FROM segments_fts WHERE episode_id = ?", (ep["id"],)).fetchone()[0]
        assert feed["url"] == pages.LOCAL_FEED_URL
        assert ep["uid"] == ids.episode_uid(feed["uid"], "https://example.com/coffee")
        assert [s["kind"] for s in segs] == ["h2", "p", "li", "p"]
        assert segs[1]["text"] == "القهوة مشروب يُحضر من بذور البن.", "whitespace is tidied"
        assert words[:2] == ["القهوة", "العربية"] and len(words) == 14
        assert hits == 4, "imported pages are searchable"


def test_reimporting_replaces_instead_of_duplicating(world):
    _, a, _ = world
    with a:
        first = pages.save_page("https://example.com/a", "One", BLOCKS)
        again = pages.save_page("https://example.com/a", "Two", [{"kind": "p", "text": "جديد تماما"}])
        assert again["id"] == first["id"] and again["title"] == "Two" and again["words"] == 2
        assert again["transcribed_at"] >= first["transcribed_at"]
        with db.session() as conn:
            assert conn.execute("SELECT COUNT(*) FROM words WHERE episode_id = ?", (first["id"],)).fetchone()[0] == 2


def test_rejects_bad_addresses_and_empty_pages(world):
    _, a, _ = world
    with a:
        for bad in ("", "ftp://x.com/file", "javascript:alert(1)"):
            with pytest.raises(pages.PageError):
                pages.save_page(bad, "t", BLOCKS)
        with pytest.raises(pages.PageError):
            pages.save_page("https://example.com", "t", [{"kind": "p", "text": "  "}])


def test_browser_start_address():
    assert pages.browser_start("") == pages.BROWSER_HOME
    assert pages.browser_start("aljazeera.net") == "https://aljazeera.net"
    assert pages.browser_start("https://bbc.com/arabic") == "https://bbc.com/arabic"
    assert pages.browser_start("arabic news").startswith("https://www.google.com/search?q=arabic%20news")


def test_browser_opens_on_the_start_page_in_the_study_language(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    assert pages.browser_home("http://127.0.0.1:5000/") == "http://127.0.0.1:5000/browser-home.html?lang=ar"
    db.set_settings({"study_language": "ja"})
    assert pages.browser_home("http://127.0.0.1:5000") == "http://127.0.0.1:5000/browser-home.html?lang=ja"
    with TestClient(create_app(start_worker=False)) as c:
        page = c.get("/browser-home.html?lang=ja")
        assert page.status_code == 200 and "/js/browser-home.js" in page.text
        script = c.get("/js/browser-home.js")
        assert script.status_code == 200 and "google.com/search" in script.text


def test_extractor_source_is_plain_script():
    src = pages.extractor_source()
    assert "function extractArticle(doc, url)" in src and "export" not in src.split("function extractArticle")[1]


def test_page_syncs_to_another_device_with_headings(world):
    drive, a, b = world
    with a:
        ep = pages.save_page("https://example.com/coffee", "القهوة", BLOCKS)
    r = a.sync(drive)
    assert r.uploaded_transcripts >= 1 and r.uploaded_audio == 0
    payload = engine._ungz(drive.by_name(engine.transcript_name(ep["uid"]))["data"])
    assert payload["kinds"] == ["h2", "p", "li", "p"] and payload["model"] == "webpage"
    rb = b.sync(drive)
    with b:
        with db.session() as conn:
            row = conn.execute("SELECT * FROM episodes WHERE uid = ?", (ep["uid"],)).fetchone()
            assert row["feed_id"] not in rb.new_feeds, "My webpages has no RSS to fetch"
            kinds = [s[0] for s in conn.execute("SELECT kind FROM segments WHERE episode_id = ? ORDER BY idx", (row["id"],))]
        assert row["status"] == "done" and row["audio_type"] == "text/html"
        assert kinds == ["h2", "p", "li", "p"]


def test_bold_and_italic_words_are_stored_and_synced_in_the_kind(world):
    """Marks from the extractor ride in segments.kind ("p|b0-1,i4"), are checked, and reach other devices."""
    drive, a, b = world
    blocks = [
        {"kind": "h2", "text": "Un viaje", "marks": [[0, 1, 1]]},             # headings keep no marks
        {"kind": "p", "text": "Muy  pronto el tren llega.", "marks": [[0, 1, 1], [4, 4, 2], [9, 12, 1], "x"]},
        {"kind": "q|i0-1", "text": "Dijo algo"},                              # a kind that already carries marks
        {"kind": "li", "text": "Uno", "marks": "not a list"},
    ]
    with a:
        ep = pages.save_page("https://example.com/tren", "El tren", blocks)
        with db.session() as conn:
            kinds = [s[0] for s in conn.execute("SELECT kind FROM segments WHERE episode_id = ? ORDER BY idx", (ep["id"],))]
    assert kinds == ["h2", "p|b0-1,i4", "q|i0-1", "li"]
    a.sync(drive)
    b.sync(drive)
    with b:
        with db.session() as conn:
            row = conn.execute("SELECT id FROM episodes WHERE uid = ?", (ep["uid"],)).fetchone()
            synced = [s[0] for s in conn.execute("SELECT kind FROM segments WHERE episode_id = ? ORDER BY idx", (row["id"],))]
    assert synced == kinds


def test_block_kinds_match_the_javascript_copy():
    from app.blockmarks import block_kind, decode_kind, encode_kind

    assert encode_kind("p", [(0, 2, 1), (5, 5, 2), (9, 10, 3)], 20) == "p|b0-2,i5,bi9-10"
    assert decode_kind("p|b0-2,i5,bi9-10") == ("p", [(0, 2, 1), (5, 5, 2), (9, 10, 3)])
    assert decode_kind("weird|x1,b3") == ("p", [(3, 3, 1)])
    assert block_kind({"kind": "p|b0-9"}, 3) == "p|b0-2"
    assert block_kind({"kind": "h2|b0"}, 3) == "h2"
    assert block_kind({"kind": "p"}, 3) == "p"


def test_podcast_transcripts_keep_their_old_format(world):
    drive, a, _ = world
    a.sync(drive)
    uid = ids.episode_uid(ids.feed_uid("https://example.com/rss"), "g1")
    payload = engine._ungz(drive.by_name(engine.transcript_name(uid))["data"])
    assert "kinds" not in payload


# ----- API -----

@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_page_api_import_read_delete(client, monkeypatch):
    r = client.post("/api/pages", json={"url": "https://example.com/coffee", "title": "القهوة", "blocks": BLOCKS})
    assert r.status_code == 200, r.text
    ep = r.json()
    t = client.get(f"/api/episodes/{ep['id']}/transcript").json()
    assert [s["kind"] for s in t["segments"]] == ["h2", "p", "li", "p"]
    assert t["episode"]["audio_type"] == "text/html" and len(t["words"]["text"]) == 14
    feeds = client.get("/api/feeds").json()
    mine = next(f for f in feeds if f["url"] == pages.LOCAL_FEED_URL)
    assert mine["episode_count"] == 1 and mine["done_count"] == 1
    assert client.get("/api/search?q=القهوة").json()["total"] >= 1
    assert client.post("/api/pages", json={"url": "https://x.com", "title": "", "blocks": []}).status_code == 400
    assert client.delete(f"/api/feeds/{mine['id']}").status_code == 400
    assert client.delete(f"/api/episodes/{ep['id']}").json() == {"ok": True}
    assert client.get(f"/api/episodes?feed_id={mine['id']}").json()["total"] == 0

    monkeypatch.setattr(pages, "fetch_html", lambda url: {"url": url, "html": "<p>hi</p>"})
    assert client.get("/api/web/fetch?url=https://example.com").json()["html"] == "<p>hi</p>"
