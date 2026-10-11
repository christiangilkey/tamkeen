"""The Anki companion: the add-on's own logic, and the app's side that receives its reports."""

from __future__ import annotations

import datetime
import importlib.util
import io
import json
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent


def load_core():
    """The add-on's logic module, loaded straight from where it ships (it imports nothing from Anki)."""
    spec = importlib.util.spec_from_file_location("tamkeen_companion_core", ROOT / "web" / "anki-addon" / "core.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def client(fresh_db, tmp_path, monkeypatch):
    from app import paths
    from app.main import create_app

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_addon_counts_reviews_failures_and_cards_becoming_mature():
    core = load_core()
    days: dict = {}
    assert core.today(datetime.datetime(2026, 10, 11, 9, 30)) == "2026-10-11"
    core.note_answer(days, "2026-10-11", 3, 10, 25)   # crossed three weeks: mature
    core.note_answer(days, "2026-10-11", 1, 30, 1)    # failed a mature card
    core.note_answer(days, "2026-10-11", 3, 25, 60)   # already mature: not counted again
    core.note_answer(days, "2026-10-11", 4, 0, 4)     # a new card
    assert days["2026-10-11"] == {"reviews": 4, "again": 1, "matured": 1, "due_left": None}
    core.set_due_left(days, "2026-10-11", 0)
    assert core.payload(days) == {"days": [{"day": "2026-10-11", "reviews": 4, "again": 1, "matured": 1, "due_left": 0}]}
    for n in range(1, 15):
        core.note_answer(days, f"2026-09-{n:02d}", 3, 1, 2)
    assert len(core.prune(days)) == core.KEEP_DAYS and "2026-10-11" in days, "only the newest days are kept"


def test_addon_remembers_totals_and_finds_the_app(tmp_path):
    core = load_core()
    state = tmp_path / "user_files" / "days.json"
    core.save(str(state), {"2026-10-11": {"reviews": 2, "again": 0, "matured": 0, "due_left": 5}})
    assert core.load(str(state))["2026-10-11"]["reviews"] == 2
    assert core.load(str(tmp_path / "missing.json")) == {}
    state.write_text("not json", encoding="utf-8")
    assert core.load(str(state)) == {}

    addon = tmp_path / "addon"
    data = tmp_path / "data"
    addon.mkdir()
    data.mkdir()
    assert core.endpoint(str(addon)) is None, "no settings file: the app has never been set up"
    (addon / "tamkeen.json").write_text(json.dumps({"data_dir": str(data)}), encoding="utf-8")
    assert core.endpoint(str(addon)) is None, "the app isn't running"
    (data / "companion.json").write_text(json.dumps({"port": 51234, "token": "abc"}), encoding="utf-8")
    assert core.endpoint(str(addon)) == ("http://127.0.0.1:51234/api/anki/report", "abc")
    assert core.post("http://127.0.0.1:9/api/anki/report", "abc", {"days": []}, timeout=0.5) is False, "a closed app is not an error"


def test_app_tells_the_addon_where_it_is_and_builds_the_addon_file(client, tmp_path):
    from app import companion, db

    companion.write_info(54321)
    info = json.loads((tmp_path / "companion.json").read_text(encoding="utf-8"))
    assert info["port"] == 54321 and len(info["token"]) >= 20
    assert info["token"] == companion.token() == db.get_setting("anki_token"), "the token stays the same between starts"
    assert "anki_token" in db.SECRET_SETTINGS, "and is never put in a backup"

    r = client.get("/api/anki/addon")
    assert r.status_code == 200 and "Tamkeen-Anki-Companion.ankiaddon" in r.headers["content-disposition"]
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert {"__init__.py", "core.py", "manifest.json", "tamkeen.json"} <= set(z.namelist())
    assert json.loads(z.read("tamkeen.json"))["data_dir"] == str(tmp_path)
    assert json.loads(z.read("manifest.json"))["package"] == "tamkeen_companion"
    compile(z.read("__init__.py"), "__init__.py", "exec")  # at least valid Python


def test_reports_need_the_token_and_totals_only_go_up(client):
    from app import companion

    day = {"day": "2026-10-11", "reviews": 40, "again": 4, "matured": 2, "due_left": 12}
    assert client.post("/api/anki/report", json={"days": [day]}).status_code == 403
    assert client.post("/api/anki/report", json={"days": [day]}, headers={"X-Tamkeen-Token": "wrong"}).status_code == 403
    assert client.get("/api/anki/days").json() == {"days": [], "last_report": None}
    ok = {"X-Tamkeen-Token": companion.token()}
    assert client.post("/api/anki/report", json={"days": [day]}, headers=ok).json() == {"ok": True}
    # A stale report (an older count, a junk day, a huge number) can't undo or inflate anything.
    stale = [{"day": "2026-10-11", "reviews": 10, "again": 0, "matured": 0, "due_left": 0}, {"day": "nonsense", "reviews": 5},
             {"day": "2026-10-10", "reviews": 10 ** 9, "matured": -5, "due_left": None}]
    assert client.post("/api/anki/report", json={"days": stale}, headers=ok).status_code == 200
    assert client.post("/api/anki/report", json={"days": ["junk"]}, headers=ok).status_code == 422
    got = client.get("/api/anki/days").json()
    assert got["last_report"] is not None
    assert got["days"] == [
        {"day": "2026-10-10", "reviews": 100000, "again": 0, "matured": 0, "due_left": None},
        {"day": "2026-10-11", "reviews": 40, "again": 4, "matured": 2, "due_left": 0},
    ]
    many = [{"day": f"2026-09-{n:02d}", "reviews": 1} for n in range(1, 31)]
    assert client.post("/api/anki/report", json={"days": many}, headers=ok).status_code == 200
    assert len(client.get("/api/anki/days").json()["days"]) == companion.KEEP_DAYS
    assert client.post("/api/anki/report", json={"days": many + many}, headers=ok).status_code == 400
    assert client.post("/api/anki/report", json={"days": [day]}, headers={**ok, "Origin": "https://evil.example"}).status_code == 403
