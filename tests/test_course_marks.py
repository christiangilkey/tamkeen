"""A sentence that says where its word is, with ⟦ ⟧ (every basics course sentence, after the owner's report on
v0.37.0: the app lit up the لـ inside الْهَدِيَّةُ instead of the لَ of لَكَ). The marks decide what the Anki
export brackets and are never shown; a card added from a course before it was marked gets the marked sentence,
but never over one the learner changed (PATCH /api/vocab/<id> with sentence_if). The page's side is
tests/js/cardtext.test.mjs."""

from __future__ import annotations

import pytest

from app import db, exporters, voices


@pytest.fixture()
def client(fresh_db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setattr(voices.worker, "kick", lambda: None)
    with TestClient(create_app(start_worker=False)) as c:
        db.set_settings({"study_language": "ar", "learning_languages": ["ar"], "welcome_seen": True})
        yield c


def test_the_marks_say_where_the_word_is():
    text, spans = exporters.sentence_spans("هٰذِهِ الْهَدِيَّةُ ⟦لَ⟧كَ.", "لِـ")
    assert text == "هٰذِهِ الْهَدِيَّةُ لَكَ." and [text[a:b] for a, b in spans] == ["لَ"]
    text, spans = exporters.sentence_spans("Ich ⟦rufe⟧ dich morgen ⟦an⟧.", "anrufen")
    assert [text[a:b] for a, b in spans] == ["rufe", "an"]
    # No marks (or marks that don't pair up): looked for, as before.
    text, spans = exporters.sentence_spans("La ⟦mesa es grande.", "mesa")
    assert text == "La mesa es grande." and [text[a:b] for a, b in spans] == ["mesa"]


def test_the_anki_export_brackets_the_marked_word_and_shows_no_marks():
    v = {"text": "لِـ", "meaning": "", "notes": "", "translation": "", "memo": "",
         "sentence": "هٰذِهِ الْهَدِيَّةُ ⟦لَ⟧كَ."}
    _front, back = exporters.anki_fields(v)
    assert "هٰذِهِ الْهَدِيَّةُ [لَ]كَ." in back and "⟦" not in back
    # With nothing else to show, the front hides the word where the marks say (not the لـ of الْ).
    assert exporters.anki_front(v) == "هٰذِهِ الْهَدِيَّةُ …كَ."
    csv = exporters.vocab_to_csv([{**v, "episode_title": "Arabic basics · word 13", "start": None, "end": None}])
    assert "هٰذِهِ الْهَدِيَّةُ لَكَ." in csv and "⟦" not in csv


def test_a_course_card_gets_its_marks_but_not_over_the_learners_own_sentence(client):
    plain = "هٰذِهِ الْهَدِيَّةُ لَكَ."
    marked = "هٰذِهِ الْهَدِيَّةُ ⟦لَ⟧كَ."
    cards = client.post("/api/vocab/batch", json={"cards": [
        {"text": "لِـ", "sentence": plain, "source": "Arabic basics · word 13"},
        {"text": "مَعَ", "sentence": "أَسْكُنُ مَعَ عَائِلَتِي.", "source": "Arabic basics · word 14"},
    ]}).json()["cards"]
    first, second = cards[0]["id"], cards[1]["id"]
    r = client.patch(f"/api/vocab/{first}", json={"sentence": marked, "sentence_if": plain})
    assert r.status_code == 200 and r.json()["sentence"] == marked
    # The learner changed this one on another device meanwhile: the course's version doesn't replace it.
    client.patch(f"/api/vocab/{second}", json={"sentence": "أَسْكُنُ مَعَ أُمِّي."})
    r = client.patch(f"/api/vocab/{second}", json={"sentence": "أَسْكُنُ ⟦مَعَ⟧ عَائِلَتِي.", "sentence_if": "أَسْكُنُ مَعَ عَائِلَتِي."})
    assert r.json()["sentence"] == "أَسْكُنُ مَعَ أُمِّي."
