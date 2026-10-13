"""Sites saved to the in-app browser's start page: the list's rules (the same cases as the phone's
copy in tests/js/browser-sites.test.mjs), the API the start page uses, the star's bridge, and sync."""

from __future__ import annotations

import pytest

from app import db, pages
from app.sync import engine

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)


def test_address_is_kept_without_its_part_and_only_web_addresses_count():
    assert pages.site_key("https://www.aljazeera.net/news/2026/1#top") == "https://www.aljazeera.net/news/2026/1"
    assert pages.site_key("https://example.com") == "https://example.com/"
    assert pages.site_key("http://example.com/a?b=1") == "http://example.com/a?b=1"
    for bad in ("", "hello", "ftp://example.com/x", "javascript:alert(1)", "file:///c:/x", None,
                "https://x.example/" + "a" * 600):
        assert pages.site_key(bad) == "", bad


def test_saving_taking_off_and_saving_again():
    sites = pages.set_site([], "https://example.com/a?b=1#c", "  Hello   there ", True, 100)
    assert sites == [{"url": "https://example.com/a?b=1", "title": "Hello there", "on": 1, "updated_at": 100}]
    assert pages.is_saved(sites, "https://example.com/a?b=1#other") and not pages.is_saved(sites, "https://example.com/")
    # Taken off with a clock that runs behind: the change still counts as the newer one.
    sites = pages.set_site(sites, "https://example.com/a?b=1", "", False, 50)
    assert sites == [{"url": "https://example.com/a?b=1", "title": "Hello there", "on": 0, "updated_at": 101}]
    assert pages.saved_sites(sites) == []
    sites = pages.set_site(sites, "https://example.com/a?b=1", "New name", True, 200)
    assert pages.saved_sites(sites) == [{"url": "https://example.com/a?b=1", "title": "New name"}]
    assert pages.set_site(sites, "not an address", "", True, 300) == sites


def test_start_page_lists_sites_in_the_order_they_were_saved():
    sites = pages.set_site([], "https://b.example/", "B", True, 10)
    sites = pages.set_site(sites, "https://a.example/", "A", True, 20)
    sites = pages.set_site(sites, "https://c.example/", "C", True, 15)  # a clock that runs behind
    sites = pages.set_site(sites, "https://d.example/", "D", True, 15)  # and the same second
    assert [s["title"] for s in pages.saved_sites(sites)] == ["B", "A", "C", "D"]
    assert [r["url"] for r in sites] == ["https://a.example/", "https://b.example/", "https://c.example/", "https://d.example/"]
    assert [r["updated_at"] for r in sites] == [20, 10, 21, 22]


def test_messy_list_is_tidied():
    sites = pages.clean_sites([
        {"url": "https://a.example/#x", "title": "old", "on": 1, "updated_at": 5},
        {"url": "https://a.example/", "title": "new", "on": 0, "updated_at": 9},
        {"url": "nope", "title": "x", "on": 1, "updated_at": 1},
        None, "text", {"title": "no address"},
        {"url": "https://b.example/", "title": "t" * 300, "on": "yes", "updated_at": "12.9"},
    ])
    assert sites == [
        {"url": "https://a.example/", "title": "new", "on": 0, "updated_at": 9},
        {"url": "https://b.example/", "title": "t" * 120, "on": 1, "updated_at": 12},
    ]
    assert pages.clean_sites("nonsense") == []


PHONE = [
    {"url": "https://a.example/", "title": "A", "on": 1, "updated_at": 10},
    {"url": "https://b.example/", "title": "B", "on": 0, "updated_at": 30},
    {"url": "https://tie.example/", "title": "T", "on": 0, "updated_at": 7},
]
COMPUTER = [
    {"url": "https://a.example/", "title": "A", "on": 0, "updated_at": 20},
    {"url": "https://b.example/", "title": "B", "on": 1, "updated_at": 25},
    {"url": "https://c.example/", "title": "C", "on": 1, "updated_at": 5},
    {"url": "https://tie.example/", "title": "T", "on": 1, "updated_at": 7},
]
MERGED = [
    {"url": "https://a.example/", "title": "A", "on": 0, "updated_at": 20},
    {"url": "https://b.example/", "title": "B", "on": 0, "updated_at": 30},
    {"url": "https://c.example/", "title": "C", "on": 1, "updated_at": 5},
    {"url": "https://tie.example/", "title": "T", "on": 1, "updated_at": 7},
]


def test_two_devices_lists_merge_the_same_way_whichever_does_the_merging():
    assert pages.merge_sites(PHONE, COMPUTER) == MERGED
    assert pages.merge_sites(COMPUTER, PHONE) == MERGED
    assert pages.merge_sites(MERGED, MERGED) == MERGED


def test_list_cannot_grow_without_end():
    many = [{"url": f"https://s{i}.example/", "title": "", "on": 1 if i < 20 else 0, "updated_at": i} for i in range(400)]
    sites = pages.clean_sites(many)
    assert len(sites) == 300 and sum(r["on"] for r in sites) == 20


# ----- the API the start page uses -----

@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_start_page_api_lists_adds_and_takes_off(client):
    assert client.get("/api/browser/sites").json() == {"sites": []}
    r = client.post("/api/browser/sites", json={"url": "https://www.aljazeera.net/news#top", "title": "الجزيرة"})
    assert r.status_code == 200 and r.json()["sites"] == [{"url": "https://www.aljazeera.net/news", "title": "الجزيرة"}]
    client.post("/api/browser/sites", json={"url": "https://elpais.com/", "title": "El País"})
    assert [s["title"] for s in client.get("/api/browser/sites").json()["sites"]] == ["الجزيرة", "El País"]
    assert client.post("/api/browser/sites", json={"url": "javascript:alert(1)"}).status_code == 400
    r = client.post("/api/browser/sites", json={"url": "https://www.aljazeera.net/news", "on": False})
    assert [s["title"] for s in r.json()["sites"]] == ["El País"]
    # The whole list also passes through Settings (the phone keeps it there); it is tidied on the way in.
    s = client.patch("/api/settings", json={"browser_sites": [{"url": "nope"}, {"url": "https://x.example", "on": 1, "updated_at": 3}]}).json()
    assert s["browser_sites"] == [{"url": "https://x.example/", "title": "", "on": 1, "updated_at": 3}]


class FakeWindow:
    def __init__(self, url):
        self.url = url

    def get_current_url(self):
        return self.url


def test_star_in_the_bar_saves_only_the_site_being_shown(client):
    from app.desktop import BrowserApi

    api = BrowserApi()
    api._window = FakeWindow("https://www.bbc.com/arabic#live")
    assert api.site_saved() == {"saved": False}
    assert api.save_site("  BBC   عربي ") == {"ok": True, "saved": True}
    assert api.site_saved() == {"saved": True}
    assert client.get("/api/browser/sites").json()["sites"] == [{"url": "https://www.bbc.com/arabic", "title": "BBC عربي"}]
    assert api.save_site("whatever") == {"ok": True, "saved": False}, "pressing the star again takes it off"
    assert client.get("/api/browser/sites").json()["sites"] == []
    # The app's own start page (and anything that isn't a website) can't be saved.
    for url in ("http://127.0.0.1:8790/browser-home.html?lang=ar", "http://localhost:1/x", "about:blank", ""):
        api._window = FakeWindow(url)
        assert api.save_site("x")["ok"] is False and api.site_saved() == {"saved": False}


# ----- between devices -----

def test_saved_sites_travel_between_devices_and_so_do_removals(world):
    drive, a, b = world
    with a:
        db.set_settings({"browser_sites": pages.set_site([], "https://www.aljazeera.net/", "الجزيرة", True, 100)})
    a.sync(drive)
    b.sync(drive)
    with b:
        assert pages.saved_sites(db.get_setting("browser_sites")) == [{"url": "https://www.aljazeera.net/", "title": "الجزيرة"}]
        sites = pages.set_site(db.get_setting("browser_sites"), "https://www.aljazeera.net/", "", False, 200)
        db.set_settings({"browser_sites": pages.set_site(sites, "https://elpais.com/", "El País", True, 210)})
    rb = b.sync(drive)
    assert rb.library_uploaded, "a change to the list is something to upload"
    a.sync(drive)
    with a:
        assert pages.saved_sites(db.get_setting("browser_sites")) == [{"url": "https://elpais.com/", "title": "El País"}]
    # Nothing changed: neither device uploads again.
    assert not a.sync(drive).library_uploaded and not b.sync(drive).library_uploaded


def test_a_library_from_before_saved_sites_is_not_a_difference(world):
    drive, a, _ = world
    a.sync(drive)
    lib = engine._ungz(drive.by_name(engine.LIBRARY)["data"])
    assert lib["sites"] == []
    old = {k: v for k, v in lib.items() if k != "sites"}  # as an older version of the app wrote it
    assert engine._content(old) == engine._content(lib)
