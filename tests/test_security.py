"""The local server's defences (app/guard.py, app/api/limits.py, app/backup.py): other websites, DNS
rebinding, the session token, the AI keys, the safety headers, input limits and booby-trapped backups."""

from __future__ import annotations

import json
import sqlite3
import time
import zipfile

import pytest
from fastapi.testclient import TestClient

BASE = "http://127.0.0.1:8790"  # as the real server is reached (scope "server" = 127.0.0.1:8790)
STRANGER = {"X-Tamkeen-Session": ""}  # a request that doesn't come from the app's page (conftest.py)


@pytest.fixture()
def app(fresh_db):
    from app.main import create_app

    return create_app(start_worker=False)


@pytest.fixture()
def client(app):
    with TestClient(app, base_url=BASE) as c:
        yield c


@pytest.fixture()
def stranger(app):
    """A client without the page's token (and with no cookie from it)."""
    c = TestClient(app, base_url=BASE, headers=STRANGER)
    yield c
    c.close()


def _secrets() -> None:
    from app import db

    db.set_settings({"llm_key_openai": "sk-FAKE-TEST-KEY", "tts_key_azure": "AZURE-FAKE", "google_refresh_token": "FAKE-REFRESH",
                     "anki_token": "ANKI-FAKE", "google_email": "me@example.com"})


# ---------------------------------------------------------------- 1. Host (DNS rebinding)

def test_a_foreign_host_is_refused_before_anything_is_answered(client):
    _secrets()
    for path in ("/api/settings", "/api/status", "/", "/embed?v=dQw4w9WgXcQ", "/js/app.js"):
        r = client.get(path, headers={"Host": "attacker.example"})
        assert r.status_code == 400, path
        assert "FAKE" not in r.text
    # The audit's exact probe: the rebinding page's own name with the right port, no Origin.
    r = client.get("/api/settings", headers={"Host": "attacker.example:8790"})
    assert r.status_code == 400 and "sk-FAKE-TEST-KEY" not in r.text and "FAKE-REFRESH" not in r.text
    assert client.post("/api/sync/now", headers={"Host": "attacker.example:8790"}).status_code == 400


def test_only_this_servers_own_names_and_port_are_hosts(client):
    for host in ("127.0.0.1:8790", "localhost:8790", "LOCALHOST:8790", "[::1]:8790"):
        assert client.get("/api/app/info", headers={"Host": host}).status_code == 200, host
    for host in ("127.0.0.1:9999", "localhost", "127.0.0.1", "127.0.0.1.nip.io:8790", "localhost.:8790",
                 "evil.localhost:8790", "127.0.0.1:8790@evil.example", "127.0.0.1:87900", ""):
        assert client.get("/api/app/info", headers={"Host": host}).status_code == 400, host


def test_host_and_origin_rules():
    from app import guard

    allowed = guard.allowed_hosts({"server": ("127.0.0.1", 8790)})
    assert allowed == {"127.0.0.1:8790", "localhost:8790", "[::1]:8790"}
    assert guard.host_ok("127.0.0.1:8790", allowed) and not guard.host_ok("127.0.0.1:8791", allowed)
    assert guard.origin_ok("http://localhost:8790", allowed)
    for origin in ("http://localhost:3000", "https://127.0.0.1:8790", "null", "http://127.0.0.1:8790/x",
                   "http://evil.example", "file://", "http://127.0.0.1:8790.evil.example"):
        assert not guard.origin_ok(origin, allowed), origin
    assert guard.allowed_hosts({"server": None}) == frozenset()  # unknown address: nothing is a good host


# ---------------------------------------------------------------- 2. Origin

def test_an_origin_must_be_exactly_this_servers(client):
    assert client.patch("/api/settings", json={"theme": "dark"}, headers={"Origin": BASE}).status_code == 200
    assert client.patch("/api/settings", json={"theme": "dark"}, headers={"Origin": "http://localhost:8790"}).status_code == 200
    for origin in ("http://localhost:3000", "http://127.0.0.1:5555", "https://evil.example", "null"):
        assert client.patch("/api/settings", json={"theme": "light"}, headers={"Origin": origin}).status_code == 403, origin
        assert client.get("/api/settings", headers={"Origin": origin}).status_code == 403, origin


# ---------------------------------------------------------------- 3. the session token

def test_the_page_carries_the_token_in_a_meta_tag_and_a_strict_cookie(app, stranger):
    token = app.state.session_token
    for path in ("/", "/embed?v=dQw4w9WgXcQ", "/browser-home.html"):
        r = stranger.get(path)
        assert r.status_code == 200 and f'<meta name="tamkeen-session" content="{token}">' in r.text, path
        cookie = r.headers["set-cookie"]
        assert cookie.startswith(f"tamkeen_session_8790={token};") and "HttpOnly" in cookie and "SameSite=Strict" in cookie
        assert r.headers["cache-control"] == "no-store"
    assert "set-cookie" not in stranger.get("/api/settings").headers  # only pages hand it out
    assert "set-cookie" not in stranger.get("/js/app.js").headers


def test_changes_need_the_token(app, stranger):
    from app import db

    r = stranger.patch("/api/settings", json={"theme": "dark"})
    assert r.status_code == 403 and db.get_setting("theme") == "system"
    assert stranger.post("/api/sync/id-token").status_code == 403  # the Google ID token: only for the page
    assert stranger.post("/api/backup/import", content=b"x").status_code == 403
    assert stranger.delete("/api/definitions/" + "a" * 40).status_code == 403
    wrong = {"X-Tamkeen-Session": "not-the-token"}
    assert stranger.patch("/api/settings", json={"theme": "dark"}, headers=wrong).status_code == 403
    # With the header (api() in web/js/app.js) or the cookie (everything else the page sends): taken.
    ok = {"X-Tamkeen-Session": app.state.session_token}
    assert stranger.patch("/api/settings", json={"theme": "dark"}, headers=ok).status_code == 200
    stranger.cookies.set("tamkeen_session_8790", app.state.session_token)
    assert stranger.patch("/api/settings", json={"theme": "light"}).status_code == 200
    assert db.get_setting("theme") == "light"


def test_reading_and_the_routes_with_their_own_secret_need_no_session(stranger, monkeypatch):
    from app import companion

    assert stranger.get("/api/app/info").status_code == 200   # Onyx Calendar asks this from its own process
    assert stranger.get("/api/episodes").status_code == 200
    # The second launch's hand-over and the Anki add-on check their own secrets: the route answers.
    r = stranger.post("/api/app/open-link", json={"url": ""}, headers={"X-Tamkeen-Token": "wrong"})
    assert r.status_code == 403 and r.json()["detail"] == "Not allowed."
    r = stranger.post("/api/anki/report", json={"days": []}, headers={"X-Tamkeen-Token": companion.token()})
    assert r.status_code == 200


def test_fetching_a_web_page_for_someone_needs_the_session(client, stranger, monkeypatch):
    from app import pages

    monkeypatch.setattr(pages, "fetch_html", lambda url: {"url": url, "html": "<p>hi</p>"})
    # (an <img src> on another website could otherwise make this computer fetch addresses on the home network)
    assert stranger.get("/api/web/fetch", params={"url": "http://192.168.1.1/"}).status_code == 403
    assert client.get("/api/web/fetch", params={"url": "https://example.com/"}).json()["html"] == "<p>hi</p>"


# ---------------------------------------------------------------- 4. the keys

def test_keys_only_reach_the_apps_own_page_and_some_never_leave(client, stranger):
    _secrets()
    for c, trusted in ((stranger, False), (client, True)):
        for s in (c.get("/api/settings").json(), c.get("/api/status").json()["settings"]):
            assert "google_refresh_token" not in s and "anki_token" not in s  # the page never needs them
            assert (s["llm_key_openai"] == "sk-FAKE-TEST-KEY") is trusted
            assert (s["tts_key_azure"] == "AZURE-FAKE") is trusted
            assert s["theme"] == "system"  # everything else is there
    patched = client.patch("/api/settings", json={"theme": "dark"}).json()
    assert "google_refresh_token" not in patched and patched["llm_key_openai"] == "sk-FAKE-TEST-KEY"


def test_the_page_cant_write_the_sign_in_or_the_add_ons_settings(client):
    from app import db

    _secrets()
    client.patch("/api/settings", json={"google_refresh_token": "OVERWRITTEN", "anki_token": "X", "google_email": "x@evil",
                                        "device_id": "other", "anki_days": {"2026-01-01": {}}, "theme": "dark"})
    assert db.get_setting("google_refresh_token") == "FAKE-REFRESH" and db.get_setting("anki_token") == "ANKI-FAKE"
    assert db.get_setting("google_email") == "me@example.com" and db.get_setting("device_id") != "other"
    assert db.get_setting("theme") == "dark"


def test_settings_are_checked(client):
    from app import db

    bad = [{"theme": {"x": "y" * 10}}, {"theme": "neon"}, {"font_size": "huge"}, {"font_size": True}, {"font_size": 10_000},
           {"page_font_size": -3}, {"llm_key_openai": "k" * 5000}, {"llm_key_openai": 42}, {"tts_region_azure": "west\x00eu"},
           {"mnemonic_prefs": "x" * 200_000}, {"game_state": {"blob": "x" * 2_100_000}}]
    for values in bad:
        r = client.patch("/api/settings", json=values)
        assert r.status_code == 400, values
    assert db.get_setting("theme") == "system"
    good = {"theme": "dark", "font_size": 30, "page_font_size": 18, "llm_key_openai": "sk-new", "tts_region_azure": "westeurope",
            "game_state": {"level": 3}, "learning_languages": ["ar"], "study_level": "beginner"}
    r = client.patch("/api/settings", json=good)
    assert r.status_code == 200, r.text
    assert {k: r.json()[k] for k in ("theme", "font_size", "llm_key_openai", "game_state")} == \
        {"theme": "dark", "font_size": 30, "llm_key_openai": "sk-new", "game_state": {"level": 3}}


# ---------------------------------------------------------------- 5. safety headers

def test_safety_headers(client):
    from app import guard

    r = client.get("/")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"  # YouTube's player needs the origin
    assert r.headers["x-frame-options"] == "SAMEORIGIN"
    csp = r.headers["content-security-policy"]
    assert csp == guard.APP_CSP + "; frame-ancestors 'self'"
    script_src = next(p for p in csp.split("; ") if p.startswith("script-src "))
    assert "'unsafe-inline'" not in script_src and "'unsafe-eval'" not in script_src and "https://www.youtube.com" in script_src
    assert "object-src 'none'" in csp
    embed = client.get("/embed?v=dQw4w9WgXcQ")
    assert "x-frame-options" not in embed.headers and "frame-ancestors" not in embed.headers["content-security-policy"]
    assert "script-src 'self'" in embed.headers["content-security-policy"]
    home = client.get("/browser-home.html")
    assert home.headers["referrer-policy"] == "no-referrer" and "script-src" not in home.headers["content-security-policy"]
    api = client.get("/api/settings")
    assert api.headers["cross-origin-resource-policy"] == "same-origin" and api.headers["x-content-type-options"] == "nosniff"
    for path, kind in (("/js/app.js", "text/javascript"), ("/css/app.css", "text/css"),
                       ("/js/vendor/pdfjs/pdf.worker.min.mjs", "text/javascript")):
        assert client.get(path).headers["content-type"].startswith(kind), path
    refused = client.get("/", headers={"Host": "attacker.example"})
    assert refused.headers["x-content-type-options"] == "nosniff"


def test_developer_pages_are_off_in_the_installed_app(monkeypatch, fresh_db):
    import sys
    from pathlib import Path

    from app.main import create_app

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(Path(__file__).resolve().parent.parent), raising=False)
    c = TestClient(create_app(start_worker=False), base_url=BASE)
    assert c.get("/api/docs").status_code == 404 and c.get("/api/openapi.json").status_code == 404
    assert c.get("/redoc").status_code == 404
    assert c.get("/").status_code == 200


# ---------------------------------------------------------------- 6. input limits

def test_web_addresses_and_home_network_addresses():
    from app.api import limits

    for url in ("https://example.com/feed.xml", "http://feeds.example.org/x?y=1", "https://8.8.8.8/"):
        assert limits.web_url(url) == url and not limits.is_local_address(url)
    for url in ("javascript:alert(1)", "file:///C:/x", "https://", "https://user:pw@example.com/", "https://exa mple.com",
                "ftp://example.com/", "https://example.com:99999/"):
        with pytest.raises(ValueError):
            limits.web_url(url)
    for url in ("http://127.0.0.1:8790/api/settings", "http://localhost/", "http://192.168.1.1/", "http://10.0.0.5/",
                "http://172.16.0.1/", "http://[::1]/", "http://169.254.169.254/latest", "http://2130706433/",
                "http://0x7f000001/", "http://127.1/", "http://router.local/", "http://[::ffff:192.168.0.1]/", "http://0.0.0.0/"):
        assert limits.is_local_address(url), url


def test_a_friends_podcast_cant_point_at_the_home_network(client):
    for feed in ("http://192.168.1.1/feed", "http://127.0.0.1:8790/api/settings", "http://localhost/rss"):
        r = client.post("/api/shared/podcast", json={"feed_url": feed, "guid": "g", "segments": []})
        assert r.status_code == 400 and "home network" in r.json()["detail"], feed


def test_lists_names_and_keys_have_limits(client, monkeypatch):
    from app import notify

    assert client.post("/api/episodes/delete", json={"ids": list(range(10_001))}).status_code == 422
    assert client.post("/api/episodes/delete", json={"ids": [1, 2]}).status_code == 200
    assert client.get("/api/definitions/not a key!").status_code == 422
    assert client.get("/api/definitions/" + "a" * 40).status_code == 200
    big = {"key": "k", "word": "w", "sentence": "s", "data": {"x": "y" * 1_100_000}}
    assert client.put("/api/definitions/" + "b" * 40, json=big).status_code == 422
    assert client.post("/api/pages", json={"url": "https://e.com", "title": "t" * 5000, "blocks": []}).status_code == 422
    shown = []
    monkeypatch.setattr(notify, "show", lambda title, text, link: shown.append((title, text, link)) or True)
    r = client.post("/api/notify", json={"title": "T" * 500, "text": "m" * 5000, "friend": ""})
    assert r.status_code == 200 and len(shown[0][0]) == 200 and len(shown[0][1]) == 1000  # shortened, not refused
    assert client.post("/api/notify", json={"title": "t", "text": "m", "friend": "x" * 300}).status_code == 422


def test_save_file_only_downloads_the_apps_own_files():
    from app.desktop import JsApi

    api = JsApi(server=None)  # type: ignore[arg-type]
    for url in ("@evil.example/x", "https://evil.example/x", "//evil.example/x", "/js/../api", "/api\\..\\x"):
        assert api.save_file(url, "x.zip")["ok"] is False, url


# ---------------------------------------------------------------- 7. stored files and backups

def _episode(**columns) -> int:
    from app import db, ids

    with db.session() as conn:
        feed = conn.execute("INSERT INTO feeds(url, uid, title, created_at) VALUES(?,?,?,?)",
                            ("https://pod.example/rss", ids.feed_uid("https://pod.example/rss"), "Pod", time.time())).lastrowid
        cols = {"feed_id": feed, "uid": "ep-uid-1", "guid": "g1", "title": "One", "published": time.time(),
                "audio_url": "https://pod.example/1.mp3", "created_at": time.time(), **columns}
        return conn.execute(f"INSERT INTO episodes({','.join(cols)}) VALUES({','.join('?' * len(cols))})",
                            tuple(cols.values())).lastrowid


def test_only_files_in_the_audio_folder_are_ever_served_or_uploaded(client, tmp_path):
    from app import paths
    from app.sync import engine

    secret = tmp_path / "private.txt"
    secret.write_text("my secret", encoding="utf-8")
    ep = _episode(status="done", audio_path=str(secret), sync_audio_path=str(secret))
    assert paths.audio_file(str(secret)) is None and paths.audio_file(str(paths.audio_dir() / ".." / "library.db")) is None
    r = client.get(f"/api/episodes/{ep}/audio", follow_redirects=False)
    assert r.status_code == 307 and "my secret" not in r.text  # only the episode's own address, not the file

    class Drive:
        uploads: list = []

        def upload(self, name, path, mime):
            self.uploads.append(path)
            return {"id": "x"}

    drive = Drive()
    engine.upload_audio_copies(drive, {}, engine.Result())  # type: ignore[arg-type]
    assert drive.uploads == []
    inside = paths.audio_dir() / f"{ep}.mp3"
    inside.write_bytes(b"ID3 fake")
    assert paths.audio_file(str(inside)) == inside
    assert paths.audio_dir_path("..") is None and paths.audio_dir_path("a/b.mp3") is None and paths.audio_dir_path("a.mp3:x") is None


def _crafted_backup(tmp_path, outside: str) -> "zipfile.Path":
    """A backup someone else made: their Google sign-in and keys, file paths anywhere on the computer, a trigger."""
    from app import backup, db

    evil = tmp_path / "evil.db"
    db.init_db(evil)
    conn = sqlite3.connect(evil)
    for key, value in {"google_refresh_token": "ATTACKER-REFRESH", "google_email": "attacker@example.com",
                       "google_scopes": "drive", "device_id": "attacker-device", "llm_key_openai": "ATTACKER-KEY",
                       "anki_token": "ATTACKER-ANKI", "theme": "dark"}.items():
        conn.execute("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)", (key, json.dumps(value)))
    feed = conn.execute("INSERT INTO feeds(url, uid, title, created_at) VALUES('https://p.example/rss', 'f1', 'P', 1)").lastrowid
    for i, (audio, copy) in enumerate(((outside, outside), ("D:/old pc/audio/7.mp3", "/home/x/audio/7.sync.ogg"),
                                       ("C:/x/audio/..", None))):
        conn.execute("INSERT INTO episodes(feed_id, uid, guid, title, published, audio_url, status, audio_path, sync_audio_path, "
                     "created_at) VALUES(?,?,?,?,1,'https://p.example/a.mp3','done',?,?,1)",
                     (feed, f"u{i}", f"g{i}", f"E{i}", audio, copy))
    conn.execute(f"CREATE TRIGGER evil AFTER UPDATE ON episodes BEGIN UPDATE episodes SET sync_audio_path = '{outside}'; END")
    conn.execute("CREATE VIEW evil_view AS SELECT * FROM settings")
    conn.commit()
    conn.close()
    out = tmp_path / "backup.zip"
    with zipfile.ZipFile(out, "w") as zf:
        zf.writestr(backup.MANIFEST, json.dumps({"app_version": "9", "created": 1, "include_audio": True}))
        zf.write(evil, "library.db")
        zf.writestr("audio/7.mp3", b"ID3 their audio")
    return out


def test_a_booby_trapped_backup_cant_sign_in_or_point_at_other_files(client, tmp_path):
    from app import backup, db, paths

    secret = tmp_path / "private.txt"
    secret.write_text("my secret", encoding="utf-8")
    db.set_settings({"llm_key_claude": "MY-OWN-KEY"})  # this device's; not signed in to Google
    backup.import_(_crafted_backup(tmp_path, str(secret)))
    s = db.get_settings()
    assert s["google_refresh_token"] == "" and s["google_email"] == "" and s["google_scopes"] == ""
    assert s["device_id"] != "attacker-device" and s["anki_token"] != "ATTACKER-ANKI"
    assert s["llm_key_openai"] == "" and s["llm_key_claude"] == "MY-OWN-KEY" and s["theme"] == "dark"
    with db.session() as conn:
        rows = {r["uid"]: (r["audio_path"], r["sync_audio_path"])
                for r in conn.execute("SELECT uid, audio_path, sync_audio_path FROM episodes")}
        triggers = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'trigger'")}
        views = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'view'")]
        conn.execute("UPDATE episodes SET title = 'x'")  # (the planted trigger would fire here)
        after = [r[0] for r in conn.execute("SELECT sync_audio_path FROM episodes")]
    assert rows["u0"] == (None, None)  # a file elsewhere on the computer: forgotten
    assert rows["u1"] == (str(paths.audio_dir() / "7.mp3"), None)  # the backup's own audio: found in the audio folder
    assert rows["u2"] == (None, None)  # ".." is not a file name
    assert "evil" not in triggers and "episodes_upd" in triggers and views == []
    assert str(secret) not in after


def test_importing_keeps_this_devices_sign_in(client, tmp_path):
    from app import backup, db

    db.set_settings({"google_refresh_token": "MINE", "google_email": "me@example.com", "device_id": "dev-1"})
    backup.import_(_crafted_backup(tmp_path, str(tmp_path / "x.txt")))
    assert (db.get_setting("google_refresh_token"), db.get_setting("google_email"), db.get_setting("device_id")) == \
        ("MINE", "me@example.com", "dev-1")
