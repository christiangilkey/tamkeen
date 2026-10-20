"""tamkeen://watch links from other apps (app/applink.py): reading them, and a second launch of the
app handing its link to the one already running instead of opening another window."""

from __future__ import annotations

import json
import sys
import threading
import time
from pathlib import Path

import pytest
import uvicorn
from fastapi.testclient import TestClient

from app import applink

ROOT = Path(__file__).resolve().parent.parent
CASES = json.loads((ROOT / "tests" / "fixtures" / "applink_cases.json").read_text(encoding="utf-8"))["cases"]
VIDEO = "dQw4w9WgXcQ"


@pytest.fixture(autouse=True)
def clean_state(tmp_path, monkeypatch):
    """Each test: its own data folder, and nothing left over in the module from another test."""
    from app import paths

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(applink, "_token", "")
    applink.take()
    applink.on_link(None)
    yield
    applink.take()
    applink.on_link(None)


@pytest.fixture()
def client(fresh_db):
    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


@pytest.fixture()
def running_app(fresh_db):
    """A real server on a local port, as a running Tamkeen has, with its instance.json written."""
    from app.desktop import free_port
    from app.main import create_app

    port = free_port()
    server = uvicorn.Server(uvicorn.Config(create_app(start_worker=False), host="127.0.0.1", port=port,
                                           log_level="warning", log_config=None))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 15
    while not server.started:
        assert time.monotonic() < deadline, "the test server didn't start"
        time.sleep(0.02)
    applink.write_instance(port)
    yield port
    server.should_exit = True
    thread.join(timeout=5)


@pytest.mark.parametrize("case", CASES, ids=[c["url"][:60] for c in CASES])
def test_links_are_read_as_the_phone_reads_them(case):
    # The same cases run against web/js/applink.js in tests/js/applink.test.mjs.
    assert applink.parse(case["url"]) == case["expect"]


def test_is_link_spots_tamkeen_links_only():
    assert applink.is_link("tamkeen://watch?v=x")
    assert applink.is_link("TAMKEEN:anything")
    assert not applink.is_link("--browser")
    assert not applink.is_link("https://youtube.com/watch?v=" + VIDEO)
    assert not applink.is_link(None)


def test_the_instance_file_has_the_port_pid_and_a_fresh_secret_each_run(tmp_path):
    applink.write_instance(51234)
    first = json.loads((tmp_path / "instance.json").read_text(encoding="utf-8"))
    assert first["port"] == 51234 and first["pid"] > 0 and len(first["token"]) >= 24
    applink.write_instance(51234)
    assert json.loads((tmp_path / "instance.json").read_text(encoding="utf-8"))["token"] != first["token"]
    assert applink.read_instance()["port"] == 51234


def test_closing_removes_the_instance_file_only_if_it_is_still_ours(tmp_path):
    applink.write_instance(51234)
    applink.remove_instance()
    assert not (tmp_path / "instance.json").exists()
    applink.write_instance(51234)
    (tmp_path / "instance.json").write_text(json.dumps({"port": 4000, "token": "another run's"}), encoding="utf-8")
    applink.remove_instance()
    assert (tmp_path / "instance.json").exists()


def test_open_link_needs_this_runs_secret_in_the_header(client):
    body = {"url": f"tamkeen://watch?v={VIDEO}"}
    assert client.post("/api/app/open-link", json=body).status_code == 403  # no secret yet, none given
    applink.write_instance(51234)
    token = applink.read_instance()["token"]
    assert client.post("/api/app/open-link", json=body).status_code == 403
    assert client.post("/api/app/open-link", json=body, headers={applink.TOKEN_HEADER: "wrong"}).status_code == 403
    # Never from an address: a web page could put it there.
    assert client.post(f"/api/app/open-link?token={token}", json=body).status_code == 403
    assert client.post(f"/api/app/open-link?x_tamkeen_token={token}", json=body).status_code == 403
    # Never from a web page, even with the secret.
    r = client.post("/api/app/open-link", json=body,
                    headers={applink.TOKEN_HEADER: token, "Origin": "https://example.com"})
    assert r.status_code == 403
    assert client.post("/api/app/pending-links").json() == {"links": []}


def test_a_link_waits_for_the_page_and_brings_the_window_forward(client, monkeypatch):
    applink.write_instance(51234)
    token = applink.read_instance()["token"]
    shown, published = [], []
    applink.on_link(lambda: shown.append(True))
    from app import events

    monkeypatch.setattr(events, "publish", lambda event, data: published.append(event))
    r = client.post("/api/app/open-link", json={"url": f"tamkeen://watch?v={VIDEO}&t=30&from=onyx"},
                    headers={applink.TOKEN_HEADER: token})
    assert r.json() == {"ok": True, "app": "Tamkeen"}
    assert shown == [True] and published == ["app_link"]
    assert client.post("/api/app/pending-links").json() == {"links": [{"video_id": VIDEO, "at": 30.0, "source": "onyx"}]}
    assert client.post("/api/app/pending-links").json() == {"links": []}  # opened once only


def test_a_bad_link_brings_the_window_forward_but_opens_nothing(client):
    applink.write_instance(51234)
    shown = []
    applink.on_link(lambda: shown.append(True))
    r = client.post("/api/app/open-link", json={"url": "tamkeen://watch?v=short"},
                    headers={applink.TOKEN_HEADER: applink.read_instance()["token"]})
    assert r.status_code == 200 and r.json()["ok"] is False and r.json()["app"] == "Tamkeen"
    assert shown == [True]
    assert client.post("/api/app/pending-links").json() == {"links": []}


def test_pending_links_cannot_be_taken_by_a_web_page(client):
    applink.push({"video_id": VIDEO, "at": None, "source": ""})
    assert client.post("/api/app/pending-links", headers={"Origin": "https://example.com"}).status_code == 403
    assert len(client.post("/api/app/pending-links").json()["links"]) == 1


def test_a_second_launch_hands_its_link_to_the_running_app(running_app):
    assert applink.hand_off(f"tamkeen://watch?v={VIDEO}&from=onyx") is True
    assert applink.take() == [{"video_id": VIDEO, "at": None, "source": "onyx"}]


def test_a_second_launch_with_a_bad_link_still_exits(running_app):
    assert applink.hand_off("tamkeen://watch?v=nope") is True  # the running app came forward
    assert applink.take() == []


def test_with_no_instance_file_the_app_starts_normally():
    assert applink.hand_off(f"tamkeen://watch?v={VIDEO}") is False


def test_a_stale_instance_file_means_start_normally(tmp_path):
    from app.desktop import free_port

    port = free_port()  # nothing is listening there any more
    (tmp_path / "instance.json").write_text(json.dumps({"port": port, "pid": 1, "token": "old"}), encoding="utf-8")
    started = time.monotonic()
    assert applink.hand_off(f"tamkeen://watch?v={VIDEO}") is False
    assert time.monotonic() - started < applink.HAND_OFF_TIMEOUT + 1


def test_a_wrong_secret_in_the_file_means_start_normally(running_app, tmp_path):
    info = json.loads((tmp_path / "instance.json").read_text(encoding="utf-8"))
    (tmp_path / "instance.json").write_text(json.dumps({**info, "token": "not this run's"}), encoding="utf-8")
    assert applink.hand_off(f"tamkeen://watch?v={VIDEO}") is False
    assert applink.take() == []


def test_a_broken_instance_file_means_start_normally(tmp_path):
    for text in ("", "not json", "[]", '{"port": "x", "token": "t"}', '{"port": 0, "token": "t"}', '{"port": 4000}'):
        (tmp_path / "instance.json").write_text(text, encoding="utf-8")
        assert applink.hand_off(f"tamkeen://watch?v={VIDEO}") is False, text


def test_run_py_exits_without_a_window_when_the_running_app_took_the_link(monkeypatch):
    sys.path.insert(0, str(ROOT))
    import run

    from app import desktop

    handed = []
    monkeypatch.setattr(applink, "hand_off", lambda url, show=True: handed.append(url) or True)
    monkeypatch.setattr(desktop, "run", lambda **kw: pytest.fail("a second window was opened"))
    monkeypatch.setattr(sys, "argv", ["ArabicPodcastStudio.exe", f"tamkeen://watch?v={VIDEO}"])
    assert run.main() == 0
    assert handed == [f"tamkeen://watch?v={VIDEO}"]


def test_run_py_starts_with_the_link_when_nothing_is_running(monkeypatch):
    import run

    from app import audio, desktop

    started = []
    monkeypatch.setattr(applink, "hand_off", lambda url, show=True: False)
    monkeypatch.setattr(audio, "check_ffmpeg", lambda: (True, ""))
    monkeypatch.setattr(desktop, "run", lambda **kw: started.append(kw))
    monkeypatch.setattr(sys, "argv", ["ArabicPodcastStudio.exe", f"tamkeen://watch?v={VIDEO}"])
    assert run.main() == 0
    assert started and started[0]["link"] == f"tamkeen://watch?v={VIDEO}"
    # Anything that isn't a tamkeen:// link is ignored: the app just starts.
    monkeypatch.setattr(sys, "argv", ["ArabicPodcastStudio.exe", "C:\\some\\file.txt"])
    assert run.main() == 0
    assert started[1]["link"] is None


# ---------------------------------------------------------------- one Tamkeen at a time, /embed

def test_run_py_without_a_link_brings_the_running_app_forward(monkeypatch):
    import run

    from app import desktop

    calls = []
    monkeypatch.setattr(applink, "hand_off", lambda url, show=True: calls.append((url, show)) or True)
    monkeypatch.setattr(desktop, "run", lambda **kw: pytest.fail("a second window was opened"))
    monkeypatch.setattr(sys, "argv", ["ArabicPodcastStudio.exe"])
    assert run.main() == 0
    monkeypatch.setattr(sys, "argv", ["ArabicPodcastStudio.exe", "--background"])
    assert run.main() == 0
    assert calls == [("", True), ("", False)]  # --background: only checks it is running


def test_run_py_background_starts_hidden_when_nothing_is_running(monkeypatch):
    import run

    from app import audio, desktop

    started = []
    monkeypatch.setattr(applink, "hand_off", lambda url, show=True: False)
    monkeypatch.setattr(audio, "check_ffmpeg", lambda: (True, ""))
    monkeypatch.setattr(desktop, "run", lambda **kw: started.append(kw))
    monkeypatch.setattr(sys, "argv", ["ArabicPodcastStudio.exe", "--background"])
    assert run.main() == 0
    assert started[0]["background"] is True and started[0]["link"] is None


def test_server_and_browser_runs_never_hand_over(monkeypatch):
    import run

    from app import audio, desktop

    started = []
    monkeypatch.setattr(applink, "hand_off", lambda url, show=True: pytest.fail("handed over"))
    monkeypatch.setattr(audio, "check_ffmpeg", lambda: (True, ""))
    monkeypatch.setattr(desktop, "run", lambda **kw: started.append(kw))
    for argv in (["--server", "--port", "8790"], ["--browser"], ["--port", "8791"]):
        monkeypatch.setattr(sys, "argv", ["run.py", *argv])
        assert run.main() == 0
    assert len(started) == 3


def test_a_second_plain_launch_brings_the_window_forward_without_a_link(client):
    applink.write_instance(51234)
    token = applink.read_instance()["token"]
    shown = []
    applink.on_link(lambda: shown.append(True))
    headers = {applink.TOKEN_HEADER: token}
    assert client.post("/api/app/open-link", json={"url": ""}, headers=headers).json() == {"ok": True, "app": "Tamkeen"}
    assert shown == [True]
    # --background: only asks whether Tamkeen is running; nothing comes forward.
    assert client.post("/api/app/open-link", json={"url": "", "show": False}, headers=headers).json()["ok"] is True
    assert shown == [True]
    assert client.post("/api/app/pending-links").json() == {"links": []}
    assert client.post("/api/app/open-link", json={"url": ""}).status_code == 403  # still needs the secret


def test_hand_off_without_a_link_reaches_the_running_app(running_app):
    shown = []
    applink.on_link(lambda: shown.append(True))
    assert applink.hand_off("", show=False) is True and shown == []
    assert applink.hand_off("") is True and shown == [True]
    assert applink.take() == []


def test_info_says_which_app_answers_and_that_it_has_embed(client):
    from app.version import __version__

    assert client.get("/api/app/info").json() == {"app": "Tamkeen", "version": __version__, "embed": 1}


def test_embed_serves_the_app_page(client):
    r = client.get(f"/embed?v={VIDEO}&t=30&from=onyx")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert '<script type="module" src="/js/app.js">' in r.text  # absolute paths: they work from /embed too
    assert r.headers.get("cache-control") == "no-cache"
    css = client.get("/css/embed.css")
    assert css.status_code == 200 and "html.embed" in css.text


def test_a_background_start_closes_when_nothing_uses_it(monkeypatch):
    from app import desktop, events

    class Window:
        destroyed = False

        def destroy(self):
            Window.destroyed = True

    clients = {"n": 0}
    monkeypatch.setattr(events, "client_count", lambda: clients["n"])
    shown = threading.Event()
    window = Window()
    # Never used: closes after `idle` seconds.
    t = threading.Thread(target=desktop._quit_when_unused, args=(window, shown, 0.2, 0.02))
    t.start()
    t.join(5)
    assert Window.destroyed


def test_a_background_start_stays_while_an_embed_is_open_or_once_shown(monkeypatch):
    from app import desktop, events

    class Window:
        destroyed = False

        def destroy(self):
            Window.destroyed = True

    monkeypatch.setattr(events, "client_count", lambda: 1)  # an /embed page is open
    shown = threading.Event()
    t = threading.Thread(target=desktop._quit_when_unused, args=(Window(), shown, 0.2, 0.02), daemon=True)
    t.start()
    time.sleep(0.6)
    assert not Window.destroyed
    shown.set()  # the window was asked for: the user is using it, it stays
    t.join(2)
    assert not t.is_alive() and not Window.destroyed
