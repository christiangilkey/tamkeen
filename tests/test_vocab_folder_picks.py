"""GET /vocab?folder= takes several folders: "a,b", or the value repeated, and "none" for the words in no folder.
One folder on its own works as before (web/js/review/folderpicks.js has the same rule for the phone and web app)."""

from __future__ import annotations

import pytest

from app import db, voices
from app.api.vocab import folder_picks, in_picks


@pytest.fixture()
def client(fresh_db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setattr(voices.worker, "kick", lambda: None)
    with TestClient(create_app(start_worker=False)) as c:
        db.set_settings({"study_language": "es", "learning_languages": ["es"], "welcome_seen": True})
        yield c


def test_the_rule_on_its_own():
    assert folder_picks(None) == []
    assert folder_picks("a") == ["a"]
    assert folder_picks("a, b,a,,none") == ["a", "b", "none"]
    assert folder_picks(["a", "b,c"]) == ["a", "b", "c"]
    assert folder_picks("x" * 65) == [], "A uid longer than any real one is dropped"
    assert in_picks([], ["none"]) and not in_picks([], ["a"])
    assert in_picks(["a", "b"], ["b"]) and not in_picks(["a"], ["b", "none"])
    assert in_picks(["a"], []), "Nothing picked: every word"


def test_several_folders_and_none(client):
    kitchen = client.post("/api/vocab/folders", json={"name": "Kitchen"}).json()["uid"]
    garden = client.post("/api/vocab/folders", json={"name": "Garden"}).json()["uid"]
    cards = client.post("/api/vocab/batch", json={"cards": [{"text": w} for w in ["olla", "flor", "casa", "sartén"]]}).json()["cards"]
    ids = {c["text"]: c["id"] for c in cards}
    client.post("/api/vocab/bulk-folders", json={"ids": [ids["olla"], ids["sartén"]], "add": [kitchen]})
    client.post("/api/vocab/bulk-folders", json={"ids": [ids["flor"], ids["sartén"]], "add": [garden]})

    def texts(query: str) -> set[str]:
        return {v["text"] for v in client.get(f"/api/vocab{query}").json()}

    assert texts(f"?folder={kitchen}") == {"olla", "sartén"}, "One folder, as before"
    assert texts("?folder=none") == {"casa"}
    assert texts(f"?folder={kitchen},{garden}") == {"olla", "flor", "sartén"}, "A word in both comes once"
    assert len(client.get(f"/api/vocab?folder={kitchen},{garden}").json()) == 3
    assert texts(f"?folder={garden}&folder=none") == {"flor", "sartén", "casa"}, "The value repeated works too"
    assert texts("") == {"olla", "flor", "casa", "sartén"}
