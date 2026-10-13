"""Export for Anki: the card format, the deck file (.apkg) and the audio clips inside it."""

from __future__ import annotations

import io
import json
import sqlite3
import time
import zipfile

from app import anki_deck, audio, db, exporters, paths

from test_clips import add_episode_word, client, make_wav  # noqa: F401  (pytest fixture)

LOOKED_UP = {"uid": "v1", "text": "مُرْتَبِكَة", "sentence": "كانت البنت مرتبكة من السؤال.", "meaning": "confused",
             "notes": "Dictionary form: اِرْتَبَكَ · Root: ر ب ك · adjective · Common in everyday speech.",
             "episode_title": "Ep", "start": 5.0, "end": 5.6, "created_at": 1_700_000_000.0}


def test_card_is_word_sentence_grammar_and_notes():
    front, back = exporters.anki_fields(LOOKED_UP)
    assert front == "confused"
    # The word is found in the sentence whatever its vowel marks, and the sentence's own spelling is kept.
    assert back == ("<b>مُرْتَبِكَة</b><br>كانت البنت [مرتبكة] من السؤال.<br>"
                    "<i>(adjective • Dictionary form: اِرْتَبَكَ • Root: ر ب ك)</i><br>Note: Common in everyday speech.")


def test_front_is_the_translated_sentence_with_the_meaning_in_brackets():
    front, back = exporters.anki_fields({**LOOKED_UP, "translation": "The girl was ⟦confused⟧ by the question."})
    assert front == "The girl was [confused] by the question."
    assert back == exporters.anki_fields(LOOKED_UP)[1], "the back is the same either way"
    # Only the word's part ends up in brackets, whatever else the translation holds.
    marked = {**LOOKED_UP, "translation": "She <said> [sic] ⟦it⟧ & ⟦left⟧"}
    assert exporters.anki_front(marked) == "She &lt;said&gt; (sic) [it] &amp; [left]"


def test_front_falls_back_to_the_meaning_without_a_marked_translation():
    assert exporters.anki_front(LOOKED_UP) == "confused", "a word saved before translations were kept"
    for translation in ("", None, "The girl was confused by the question.", "The girl was ⟦confused by it.",
                        "The girl was ⟧confused⟦ by it.", "The girl was ⟦⟧ by it."):
        assert exporters.anki_front({**LOOKED_UP, "translation": translation}) == "confused", translation


def test_typed_notes_stay_notes():
    assert exporters.anki_grammar("my uncle says this") == ("", ["my uncle says this"])
    assert exporters.anki_grammar("slang") == ("", ["slang"]), "a lone short note is not taken for the kind of word"
    # A label the learner typed themselves joins the grammar box, like the ones the app writes.
    assert exporters.anki_grammar("Root: ك ت ب\nused in the news") == ("Root: ك ت ب", ["used in the news"])
    _, back = exporters.anki_fields({**LOOKED_UP, "notes": "my <uncle> says this\nall the time"})
    assert back.endswith("<br>Note: my &lt;uncle&gt; says this<br>all the time")
    assert "<i>" not in back


def test_word_without_meaning_or_sentence_still_makes_a_card():
    front, back = exporters.anki_fields({"uid": "v2", "text": "كتاب", "sentence": "", "meaning": "", "notes": ""})
    assert (front, back) == ("كتاب", "<b>كتاب</b>")


def test_text_export_names_each_word_once():
    out = exporters.vocab_to_anki([LOOKED_UP]).splitlines()
    assert "#guid column:1" in out and "#if matches:keep current" in out and "#notetype:Tamkeen" in out
    assert out[-1].split("\t") == ["tk-v1", *exporters.anki_fields(LOOKED_UP), "tamkeen"]


def open_deck(data: bytes, tmp_path):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        index = json.loads(z.read("media"))
        media = {name: z.read(number) for number, name in index.items()}
        (tmp_path / "collection.anki2").write_bytes(z.read("collection.anki2"))
    conn = sqlite3.connect(tmp_path / "collection.anki2")
    conn.row_factory = sqlite3.Row
    return conn, media


def test_deck_file_holds_cards_layout_font_and_audio(tmp_path):
    plain = {"uid": "v2", "text": "كتاب", "sentence": "", "meaning": "book", "notes": "", "created_at": 1_700_000_500.0}
    data = anki_deck.build([LOOKED_UP, plain], {"v1": {"word": b"WORD", "sentence": b"SENTENCE"}}, now=1_800_000_000)
    conn, media = open_deck(data, tmp_path)
    try:
        assert media["tk-v1-w.mp3"] == b"WORD" and media["tk-v1-s.mp3"] == b"SENTENCE"
        assert len(media[anki_deck.FONT_NAME]) > 10_000
        assert set(media) == {"tk-v1-w.mp3", "tk-v1-s.mp3", anki_deck.FONT_NAME}

        col = conn.execute("SELECT * FROM col").fetchone()
        (layout,) = json.loads(col["models"]).values()
        assert layout["name"] == "Tamkeen" and [f["name"] for f in layout["flds"]] == ["Front", "Back", "image", "TTS Input"]
        card = layout["tmpls"][0]
        assert "{{edit:Front}}" in card["qfmt"] and '<div class="card-timer">Time: <span id="timer">0.0</span>s</div>' in card["qfmt"]
        assert "<strong>Image:</strong><br>\n{{edit:image}}" in card["afmt"] and "{{TTS Input}}" in card["afmt"]
        assert anki_deck.FONT_NAME in layout["css"]
        assert str(anki_deck.DECK_ID) in json.loads(col["decks"])

        notes = conn.execute("SELECT * FROM notes ORDER BY id").fetchall()
        assert [n["guid"] for n in notes] == ["tk-v1", "tk-v2"]
        front, back, image, sound = notes[0]["flds"].split("\x1f")
        assert (front, back) == exporters.anki_fields(LOOKED_UP)
        assert image == "", "the image field belongs to the learner"
        assert sound == "[sound:tk-v1-w.mp3][sound:tk-v1-s.mp3]"
        assert notes[1]["flds"].split("\x1f")[3] == ""
        # Dated by when the word was saved, so a card already in Anki always counts as the newer one.
        assert notes[0]["mod"] == 1_700_000_000 and notes[0]["mid"] == anki_deck.MODEL_ID
        cards = conn.execute("SELECT nid, did, ord FROM cards ORDER BY id").fetchall()
        assert [tuple(c) for c in cards] == [(n["id"], anki_deck.DECK_ID, 0) for n in notes]
    finally:
        conn.close()


def test_word_saved_from_a_lookup_exports_with_a_sentence_front(client, tmp_path):  # noqa: F811
    looked_up = client.post("/api/vocab", json={
        "text": "مُرْتَبِكَة", "sentence": "كانت البنت مرتبكة من السؤال.", "meaning": "confused",
        "translation": " The girl was ⟦confused⟧ by the question. "}).json()
    assert looked_up["translation"] == "The girl was ⟦confused⟧ by the question."
    typed = client.post("/api/vocab", json={"text": "قلم", "meaning": "pen"}).json()
    assert typed["translation"] == ""
    fronts = {f"tk-{looked_up['uid']}": "The girl was [confused] by the question.", f"tk-{typed['uid']}": "pen"}

    rows = [line.split("\t") for line in client.get("/api/vocab/export/anki").text.splitlines() if line.startswith("tk-")]
    assert {row[0]: row[1] for row in rows} == fronts
    conn, _ = open_deck(client.get("/api/vocab/export/apkg").content, tmp_path)
    try:
        assert {n["guid"]: n["flds"].split("\x1f")[0] for n in conn.execute("SELECT guid, flds FROM notes")} == fronts
    finally:
        conn.close()


def test_library_from_before_translations_were_kept_still_exports(tmp_path, monkeypatch):
    path = tmp_path / "library.db"
    monkeypatch.setattr(paths, "db_path", lambda: path)
    db.init_db(path)
    # Rewind to the old layout: no translation column, one saved word.
    conn = sqlite3.connect(path)
    for name in db._TRIGGER_NAMES:
        conn.execute(f"DROP TRIGGER IF EXISTS {name}")
    conn.execute("ALTER TABLE vocab DROP COLUMN translation")
    conn.execute("INSERT INTO vocab(uid, text, norm, meaning, created_at) VALUES('vold', 'كتاب', 'كتاب', 'book', 1)")
    conn.commit()
    conn.close()

    db._initialized.discard(path)
    db.init_db(path)
    with db.session() as c:
        word = dict(c.execute("SELECT * FROM vocab").fetchone())
    assert word["translation"] == "" and exporters.anki_front(word) == "book"


def test_review_progress_becomes_ankis_schedule():
    today = 20_000
    new_card = (0, 0, 7, 0, 0, 0, 0)  # (type, queue, due, interval, ease, reviews, lapses) of a card in position 7
    assert anki_deck.card_schedule(None, today, 7) == new_card
    assert anki_deck.card_schedule([0, today, 0, 2], today, 7) == new_card, "box 0 is as good as new"
    # Box 3 comes round every 4 days; due in 4 days; answered 6 times right and once wrong.
    assert anki_deck.card_schedule([3, today + 4, 6, 1], today, 7) == (2, 2, 4, 4, 2500, 7, 1)
    assert anki_deck.card_schedule([1, today - 5, 1, 4], today, 7) == (2, 2, 0, 1, 2500, 5, 4), "overdue means due today"
    assert anki_deck.card_schedule([9, today + 40, 9, 0], today, 7)[3] == 32, "no wait is longer than the top box's"
    for junk in ("x", [1, 2], [1, "a", 0, 0], {"box": 2}, 5):
        assert anki_deck.card_schedule(junk, today, 7) == new_card


def test_export_carries_review_progress(client, tmp_path):  # noqa: F811
    known = client.post("/api/vocab", json={"text": "كتاب", "meaning": "book"}).json()
    fresh = client.post("/api/vocab", json={"text": "قلم", "meaning": "pen"}).json()
    due_day = anki_deck.day_number(time.time()) + 8
    db.set_settings({"game_state": {"review": {known["uid"]: [4, due_day, 5, 1]}}})
    conn, _ = open_deck(client.get("/api/vocab/export/apkg").content, tmp_path)
    try:
        cards = {guid: tuple(card) for guid, *card in conn.execute(
            "SELECT n.guid, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses FROM cards c JOIN notes n ON n.id = c.nid")}
        assert conn.execute("SELECT count(*) FROM revlog").fetchone()[0] == 0, "single answers are not recorded, so there is no log"
    finally:
        conn.close()
    assert cards[f"tk-{known['uid']}"] == (2, 2, 8, 8, 2500, 6, 1)
    assert cards[f"tk-{fresh['uid']}"][:2] == (0, 0) and cards[f"tk-{fresh['uid']}"][3:] == (0, 0, 0, 0)


def test_export_cuts_a_word_clip_and_a_sentence_clip(client, tmp_path, monkeypatch):  # noqa: F811
    (tmp_path / "anki-clips").mkdir()
    monkeypatch.setattr(paths, "anki_clips_dir", lambda: tmp_path / "anki-clips")
    word = add_episode_word(client)
    typed = client.post("/api/vocab", json={"text": "قلم", "meaning": "pen"}).json()

    r = client.get("/api/vocab/export/apkg")
    assert r.status_code == 200
    conn, media = open_deck(r.content, tmp_path)
    try:
        sounds = {n["guid"]: n["flds"].split("\x1f")[3] for n in conn.execute("SELECT guid, flds FROM notes")}
    finally:
        conn.close()
    uid = word["uid"]
    assert sounds == {f"tk-{uid}": f"[sound:tk-{uid}-w.mp3][sound:tk-{uid}-s.mp3]", f"tk-{typed['uid']}": ""}
    for name, low, high in ((f"tk-{uid}-w.mp3", 0.6, 1.1), (f"tk-{uid}-s.mp3", 3.5, 4.1)):
        clip = tmp_path / name
        clip.write_bytes(media[name])
        assert low <= audio.probe_duration(clip) <= high, name  # 5.0-5.6 s word, 4.5-7.5 s sentence, plus a little air
    # The second export reuses the clips instead of cutting them again.
    cut = sorted(p.name for p in (tmp_path / "anki-clips").iterdir())
    assert len(cut) == 2
    monkeypatch.setattr(audio, "cut_clip", lambda *a, **k: (_ for _ in ()).throw(AssertionError("cut again")))
    assert client.get(f"/api/vocab/export/apkg?ids={word['id']}").status_code == 200


def test_word_whose_audio_is_not_on_this_computer_exports_as_text(client, tmp_path, monkeypatch):  # noqa: F811
    monkeypatch.setattr(paths, "anki_clips_dir", lambda: tmp_path)
    word = add_episode_word(client)
    (client.tmp / "episode.wav").unlink()
    conn, media = open_deck(client.get("/api/vocab/export/apkg").content, tmp_path)
    try:
        assert conn.execute("SELECT flds FROM notes").fetchone()["flds"].split("\x1f")[3] == ""
    finally:
        conn.close()
    assert set(media) == {anki_deck.FONT_NAME} and word["uid"]
