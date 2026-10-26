"""A card put right while it is reviewed (web/js/review/cardedit.js), on the computer: its word, meaning,
sentence and the sentence's translation saved through PATCH /api/vocab/<id>, so they sync like any edit, and
the parts of the sentence the learner lit up by holding words (⟦ ⟧ in the sentence, web/js/cardtext.js)
shown by the Anki export and left out of search and the list file. The page's side is
tests/js/cardedit.test.mjs (which checks the phone's Anki export gives the same cards)."""

from __future__ import annotations

import time

import pytest

from app import db, exporters, voices


@pytest.fixture()
def client(fresh_db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setattr(voices.worker, "kick", lambda: None)
    with TestClient(create_app(start_worker=False)) as c:
        db.set_settings({"study_language": "es", "learning_languages": ["es"], "welcome_seen": True})
        yield c


def _card(client) -> dict:
    return client.post("/api/vocab", json={"text": "cartera", "meaning": "wallet", "sentence": "Perdí mi cartera en el metro.",
                                           "translation": "I lost my ⟦wallet⟧ on the subway."}).json()


def _stamp(vocab_id: int) -> float:
    with db.session() as conn:
        return conn.execute("SELECT updated_at FROM vocab WHERE id = ?", (vocab_id,)).fetchone()[0]


def _age(vocab_id: int) -> None:
    """Make the card look last changed long ago, so a change now shows in its updated_at."""
    with db.session() as conn:
        conn.execute("INSERT INTO sync_guard(active) VALUES (1)")
        conn.execute("UPDATE vocab SET updated_at = 1000 WHERE id = ?", (vocab_id,))
        conn.execute("DELETE FROM sync_guard")


def test_every_text_on_the_card_can_be_put_right_and_syncs(client):
    v = _card(client)
    for field, value in [("text", "la cartera"), ("meaning", "wallet, purse"),
                         ("sentence", "⟦Perdí⟧ mi ⟦cartera⟧ en el metro."), ("translation", "I lost my ⟦wallet⟧ on the train.")]:
        _age(v["id"])
        out = client.patch(f"/api/vocab/{v['id']}", json={field: value}).json()
        assert out[field] == value, field
        assert _stamp(v["id"]) > time.time() - 60, f"{field}: a changed card is stamped, so the sync sends it"
    assert out["text"] == "la cartera" and out["meaning"] == "wallet, purse"


def test_a_card_keeps_its_word_and_long_texts_are_cut(client):
    v = _card(client)
    out = client.patch(f"/api/vocab/{v['id']}", json={"text": "   "}).json()
    assert out["text"] == "cartera", "an empty word is not saved"
    out = client.patch(f"/api/vocab/{v['id']}", json={"sentence": "  " + "a" * 2500 + "  ", "translation": ""}).json()
    assert len(out["sentence"]) == 2000 and out["translation"] == ""
    _age(v["id"])
    client.patch(f"/api/vocab/{v['id']}", json={"memo": ""})
    assert _stamp(v["id"]) == 1000, "nothing changed: nothing to send"


def test_lit_words_are_left_out_of_search(client):
    v = _card(client)
    client.patch(f"/api/vocab/{v['id']}", json={"sentence": "Perdí mi ⟦cartera en⟧ el metro."})
    found = client.get("/api/vocab", params={"q": "cartera en el"}).json()
    assert [w["id"] for w in found] == [v["id"]]


def test_the_anki_card_lights_what_the_learner_lit():
    card = {"uid": "v1", "text": "cartera", "meaning": "wallet", "notes": "", "translation": "",
            "sentence": "⟦Perdí⟧ mi ⟦cartera⟧ nueva."}
    assert exporters.sentence_spans(card["sentence"], "cartera") == ("Perdí mi cartera nueva.", [(0, 5), (9, 16)])
    # The same cards as the phone makes (tests/js/cardedit.test.mjs).
    assert exporters.anki_fields(card)[1] == "<b>cartera</b><br>[Perdí] mi [cartera] nueva."
    # Every lit word put out on the review card: nothing in brackets, not even the word.
    assert exporters.sentence_spans("⟦⟧Perdí mi cartera.", "cartera") == ("Perdí mi cartera.", [])
    assert exporters.anki_fields({**card, "sentence": "⟦⟧Perdí mi cartera."})[1] == "<b>cartera</b><br>Perdí mi cartera."
    assert exporters.anki_fields({**card, "sentence": "Perdí mi cartera nueva."})[1] == "<b>cartera</b><br>Perdí mi [cartera] nueva."
    for broken in ("a ⟦b c", "a b⟧ c", "⟦a ⟦b⟧ c⟧", "⟦⟧a ⟦b c"):
        assert exporters.sentence_spans(broken, "zz")[1] == []


def test_the_list_file_has_the_sentence_without_marks():
    out = exporters.vocab_to_csv([{"text": "cartera", "meaning": "wallet", "notes": "", "sentence": "Perdí mi ⟦cartera⟧.",
                                   "episode_title": "", "start": None, "end": None}])
    assert "Perdí mi cartera." in out and "⟦" not in out
