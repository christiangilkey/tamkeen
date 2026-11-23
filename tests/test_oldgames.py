"""Find an older game, the desktop's side (app/sync/oldgames.py, GET /api/sync/game-versions): the older versions
Google Drive keeps of library.json.gz, and only the game read out of one. Drive is faked: no real account."""

from __future__ import annotations

import gzip
import json

import pytest
from fastapi.testclient import TestClient

from app.sync import oldgames

VERSIONS = {
    "r1": {"vocab": [{"uid": "w1", "text": "كتاب"}], "game": {"xp": 900, "roster": [{"seed": 7}], "gyms": {"beaten": 3}}},
    "r2": {"vocab": [{"uid": "w1", "text": "كتاب"}]},
}


class FakeDrive:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def list(self):
        self.calls.append("list")
        return [{"id": "lib-1", "name": "library.json.gz"}, {"id": "t-1", "name": "t_x.json.gz"}]

    def revisions(self, file_id):
        self.calls.append(f"revisions {file_id}")
        return [{"id": "r1", "modifiedTime": "2026-11-01T10:00:00.000Z", "size": "1200"},
                {"id": "r2", "modifiedTime": "2026-11-20T10:00:00Z", "size": "900"}]

    def download_revision(self, file_id, rev):
        self.calls.append(f"download {file_id} {rev}")
        return gzip.compress(json.dumps(VERSIONS[rev]).encode())

    def close(self):
        pass


def test_versions_and_only_the_game_of_one():
    drive = FakeDrive()
    assert oldgames.versions(drive) == [{"id": "r1", "at": 1793527200.0, "size": 1200}, {"id": "r2", "at": 1795168800.0, "size": 900}]
    one = oldgames.version(drive, "r1")
    assert one == {"id": "r1", "game": {"xp": 900, "roster": [{"seed": 7}], "gyms": {"beaten": 3}}}
    assert "vocab" not in one, "the old version's words are left out"
    assert oldgames.version(drive, "r2") == {"id": "r2", "game": None}
    with pytest.raises(ValueError):
        oldgames.version(drive, "../files")


def test_the_page_asks_through_the_local_server(fresh_db, monkeypatch, tmp_path):
    from app import paths
    from app.main import create_app

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    with TestClient(create_app(start_worker=False)) as client:
        monkeypatch.setattr(oldgames.oauth, "signed_in", lambda: False)
        assert client.get("/api/sync/game-versions").json() == {"signed_in": False, "versions": []}
        monkeypatch.setattr(oldgames.oauth, "signed_in", lambda: True)
        monkeypatch.setattr(oldgames, "_open", FakeDrive)
        listed = client.get("/api/sync/game-versions").json()
        assert listed["signed_in"] is True and [v["id"] for v in listed["versions"]] == ["r1", "r2"]
        assert client.get("/api/sync/game-versions/r1").json()["game"]["gyms"]["beaten"] == 3
        assert client.get("/api/sync/game-versions/bad$id").status_code in (400, 404)
