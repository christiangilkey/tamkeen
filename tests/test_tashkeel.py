"""Arabic vowel marks (app/tashkeel.py): a vowelled copy beside the original words, made on the
computer, carried to the phone in the transcript file, never touching the original."""

from __future__ import annotations

import json
import os
import unicodedata
from pathlib import Path

import pytest

from app import corrections, db, ids, tashkeel
from app.sync import engine

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)

FATHA, KASRA, SUKUN, SHADDA = "َ", "ِ", "ْ", "ّ"
TAG_FATHA = tashkeel._TAGS.index(FATHA)


@pytest.fixture()
def fake_model(monkeypatch):
    """A stand-in for the model: a fatha on every letter. Records what it was asked to read."""
    seen: list[list[int]] = []

    def predict(rows):
        seen.extend(rows)
        return [[TAG_FATHA if t != tashkeel._SPACE else 3 for t in r] for r in rows]

    monkeypatch.setattr(tashkeel, "_predict", predict)
    monkeypatch.setattr(tashkeel, "installed", lambda: True)
    monkeypatch.setattr(tashkeel, "kick", lambda first=None: None)  # no background thread: tests call vowel_episode
    return seen


def _letters(row):
    return "".join(tashkeel._LETTERS[i] for i in row)


# ----- adding marks -----

def test_marks_go_after_letters_and_everything_else_is_kept(fake_model):
    out = tashkeel.vowel_lines([["كتب،", "2024", "«ولد»", "OK", "مـن"]])[0]
    f = FATHA
    assert out == [f"ك{f}ت{f}ب{f}،", "2024", f"«و{f}ل{f}د{f}»", "OK", f"م{f}ـن{f}"]
    # The model reads the whole line, letters only, one space between words (punctuation is a break).
    assert _letters(fake_model[0]) == "ktb wld mn"


def test_a_word_that_already_has_marks_is_left_as_written(fake_model):
    out = tashkeel.vowel_lines([["كَتَبَ", "ولد"]])[0]
    assert out[0] == "كَتَبَ", "hand-placed marks are kept exactly"
    assert out[1] == f"و{FATHA}ل{FATHA}د{FATHA}"
    assert _letters(fake_model[0]) == "ktb wld", "but its letters still give the next word context"


def test_long_lines_are_read_in_pieces_cut_between_words(fake_model, monkeypatch):
    monkeypatch.setattr(tashkeel, "MAX_LETTERS", 10)
    words = ["كتاب"] * 7
    out = tashkeel.vowel_lines([words])[0]
    assert all(w == "".join(ch + FATHA for ch in "كتاب") for w in out)
    assert all(len(r) <= 10 for r in fake_model) and all(_letters(r).strip() == _letters(r) for r in fake_model)
    assert sum(_letters(r).count("ktAb") for r in fake_model) == 7


def test_vowel_text_keeps_spacing(fake_model):
    assert tashkeel.vowel_text("هل  ذهب؟") == f"ه{FATHA}ل{FATHA}  ذ{FATHA}ه{FATHA}ب{FATHA}؟"
    assert tashkeel.vowel_text("  ") == "  "


# ----- dialect -----

def test_dialect_giveaways():
    msa = [["قال", "الرئيس", "إن", "الحكومة", "ستعمل"], ["كان", "الطقس", "جميلا", "في", "الصباح"]]
    assert tashkeel.judge_dialect(msa) == ("", [])
    lev = [["شو", "بدك", "تعمل", "بكرا"], ["هلق", "رايح", "عالبيت"]]
    assert tashkeel.judge_dialect(lev) == ("lev", [0, 1])
    egy = [["انت", "عامل", "ايه", "النهارده؟"]]
    assert tashkeel.judge_dialect(egy)[0] == "egy"
    # A long Standard Arabic text with one dialect line: Standard, but that line is a guess.
    mixed = msa * 60 + [["مش", "عارف"]]
    assert tashkeel.judge_dialect(mixed) == ("", [120])
    # Words that are also ordinary Standard Arabic don't count.
    assert tashkeel.judge_dialect([["دول", "قوية", "أبي", "كذا"]]) == ("", [])


# ----- episodes -----

def _arabic_episode(conn, lines, transcribed_at=100.0, language="ar"):
    conn.execute("INSERT INTO feeds(uid, url, title, created_at) VALUES('fv', 'https://example.com/v', 'Pod', 1)")
    feed = conn.execute("SELECT id FROM feeds WHERE uid = 'fv'").fetchone()[0]
    ep = conn.execute("INSERT INTO episodes(feed_id, uid, guid, title, audio_url, status, transcribed_at, language, created_at) "
                      "VALUES(?,?,?,?,?,?,?,?,1)", (feed, "ev", "g", "Ep", "https://example.com/a.mp3", "done",
                                                    transcribed_at, language)).lastrowid
    idx = 0
    for seg, words in enumerate(lines):
        text = " ".join(words)
        conn.execute("INSERT INTO segments(episode_id, idx, start, end, text, norm) VALUES(?,?,?,?,?,?)",
                     (ep, seg, float(idx), float(idx + len(words)), text, text))
        for w in words:
            conn.execute("INSERT INTO words(episode_id, idx, seg_idx, start, end, text) VALUES(?,?,?,?,?,?)",
                         (ep, idx, seg, float(idx), float(idx + 1), w))
            idx += 1
    return ep


LINES = [["مرحبا", "بكم،"], ["شو", "بدك", "OK"]]


def test_episode_gets_a_vowelled_copy_and_the_original_is_untouched(fresh_db, fake_model):
    with db.session() as conn:
        ep = _arabic_episode(conn, LINES)
        before = [tuple(r) for r in conn.execute("SELECT text FROM words WHERE episode_id = ? ORDER BY idx", (ep,))]
        segs_before = [tuple(r) for r in conn.execute("SELECT text, norm FROM segments WHERE episode_id = ?", (ep,))]
        assert tashkeel.pending(conn) == [ep]
    assert tashkeel.for_episode(ep) is None
    assert tashkeel.vowel_episode(ep)
    v = tashkeel.for_episode(ep)
    f = FATHA
    assert v["words"] == [f"م{f}ر{f}ح{f}ب{f}ا{f}", f"ب{f}ك{f}م{f}،", f"ش{f}و{f}", f"ب{f}د{f}ك{f}", None]
    assert v["dialect"] == "lev" and v["model"] == tashkeel.MODEL_ID
    with db.session() as conn:
        assert [tuple(r) for r in conn.execute("SELECT text FROM words WHERE episode_id = ? ORDER BY idx", (ep,))] == before
        assert [tuple(r) for r in conn.execute("SELECT text, norm FROM segments WHERE episode_id = ?", (ep,))] == segs_before
        row = conn.execute("SELECT transcribed_at, vowels FROM episodes WHERE id = ?", (ep,)).fetchone()
        assert row["transcribed_at"] > 100, "a newer transcript, so sync sends the vowels"
        assert json.loads(row["vowels"])["rev"] == row["transcribed_at"]
        assert tashkeel.pending(conn) == []


def test_only_arabic_is_vowelled(fresh_db, fake_model):
    with db.session() as conn:
        ep = _arabic_episode(conn, [["hola", "amigos"]], language="es")
        assert tashkeel.pending(conn) == []
    assert tashkeel.vowel_episode(ep) and tashkeel.for_episode(ep) is None


def test_a_new_transcript_makes_the_vowels_stale(fresh_db, fake_model):
    with db.session() as conn:
        ep = _arabic_episode(conn, LINES)
    tashkeel.vowel_episode(ep)
    with db.session() as conn:
        conn.execute("UPDATE episodes SET transcribed_at = transcribed_at + 50 WHERE id = ?", (ep,))
        assert tashkeel.pending(conn) == [ep]
    assert tashkeel.for_episode(ep) is None


def test_a_corrected_word_loses_its_vowels_until_they_are_made_again(fresh_db, fake_model):
    with db.session() as conn:
        ep = _arabic_episode(conn, LINES)
    tashkeel.vowel_episode(ep)
    corrections.correct_words(ep, 1, 1, ["بكم،"], ["بكما،"])
    v = tashkeel.for_episode(ep)
    assert v["words"][1] is None and v["words"][0] is not None, "the rest keep showing their vowels"
    with db.session() as conn:
        assert tashkeel.pending(conn) == [ep]
    tashkeel.vowel_episode(ep)
    assert tashkeel.for_episode(ep)["words"][1] == f"ب{FATHA}ك{FATHA}م{FATHA}ا{FATHA}،"


def test_words_changed_while_reading_are_not_overwritten(fresh_db, fake_model, monkeypatch):
    with db.session() as conn:
        ep = _arabic_episode(conn, LINES)
    real = tashkeel.vowel_lines

    def slow(lines):
        with db.session() as c:
            c.execute("UPDATE episodes SET transcribed_at = 555 WHERE id = ?", (ep,))
        return real(lines)

    monkeypatch.setattr(tashkeel, "vowel_lines", slow)
    assert tashkeel.vowel_episode(ep) is False
    assert tashkeel.for_episode(ep) is None


# ----- the API -----

@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_api(client, fake_model, monkeypatch):
    kicked = []
    monkeypatch.setattr(tashkeel, "kick", lambda first=None: kicked.append(first))
    with db.session() as conn:
        ep = _arabic_episode(conn, LINES)
    t = client.get(f"/api/episodes/{ep}/transcript").json()
    assert t["vowels"] is None and kicked == [ep], "opening it asks for its vowels first"
    assert client.get(f"/api/episodes/{ep}/vowels").json() == {"vowels": None, "pending": True}
    tashkeel.vowel_episode(ep)
    t = client.get(f"/api/episodes/{ep}/transcript").json()
    assert t["words"]["text"] == ["مرحبا", "بكم،", "شو", "بدك", "OK"], "the words themselves never change"
    assert t["vowels"]["words"][0] == "".join(ch + FATHA for ch in "مرحبا")
    assert client.get(f"/api/episodes/{ep}/vowels").json()["vowels"] == t["vowels"]
    assert client.post("/api/vowels/sentence", json={"sentence": "هل ذهب؟"}).json() == {
        "sentence": f"ه{FATHA}ل{FATHA} ذ{FATHA}ه{FATHA}ب{FATHA}؟", "guess": False}
    assert client.post("/api/vowels/sentence", json={"sentence": "شو بدك"}).json()["guess"] is True
    st = client.get("/api/vowels/status").json()
    assert st["installed"] and st["waiting"] == 0 and st["bytes"] == tashkeel.MODEL_BYTES


def test_api_without_the_model(client):
    st = client.get("/api/vowels/status").json()
    assert not st["installed"] and st["waiting"] == 0
    assert client.post("/api/vowels/sentence", json={"sentence": "هل"}).json() == {"sentence": None, "guess": False}


# ----- sync -----

def test_vowels_reach_the_phone_and_the_other_computer(world, fake_model):
    drive, a, b = world
    uid = ids.episode_uid(ids.feed_uid("https://example.com/rss"), "g1")
    a.sync(drive)
    with a:
        with db.session() as conn:
            ep = conn.execute("SELECT id FROM episodes WHERE uid = ?", (uid,)).fetchone()[0]
        assert tashkeel.vowel_episode(ep)
    assert a.sync(drive).uploaded_transcripts == 1, "the vowelled transcript goes up again"
    payload = engine._ungz(drive.by_name(engine.transcript_name(uid))["data"])
    assert payload["words"]["text"] == ["مرحبا", "بكم"]
    assert payload["vowels"]["words"] == ["".join(ch + FATHA for ch in w) for w in ("مرحبا", "بكم")]
    b.sync(drive)
    with b:
        with db.session() as conn:
            ep_b = conn.execute("SELECT id FROM episodes WHERE uid = ?", (uid,)).fetchone()[0]
            assert tashkeel.pending(conn) == [], "received with its vowels: nothing to redo"
        assert tashkeel.for_episode(ep_b)["words"] == payload["vowels"]["words"]


def test_vowels_the_phone_marked_dirty_are_shown_and_made_again(world, fake_model):
    drive, a, b = world
    uid = ids.episode_uid(ids.feed_uid("https://example.com/rss"), "g1")
    payload = {"format": 1, "rev": 777.0, "model": "x", "segments": [[0, 1.5, "مرحبا بكما"]],
               "words": {"start": [0, 0.8], "end": [0.7, 1.5], "text": ["مرحبا", "بكما"], "seg": [0, 0]},
               "vowels": {"words": ["مَرْحَبًا", None], "dialect": "", "guess": [], "model": "catt-eo-int8", "dirty": True}}
    with b:
        with db.session() as conn:
            seed_url = "https://example.com/rss"
            conn.execute("INSERT INTO feeds(url, uid, title, created_at) VALUES(?,?,?,?)", (seed_url, ids.feed_uid(seed_url), "F", 1.0))
            ep = conn.execute("INSERT INTO episodes(feed_id, uid, guid, title, audio_url, language, created_at) "
                              "VALUES(1,?,?,?,?,'ar',1)", (uid, "g1", "E", "https://cdn/ep1.mp3")).lastrowid
        engine.store_transcript(ep, payload)
        assert tashkeel.for_episode(ep)["words"] == ["مَرْحَبًا", None]
        with db.session() as conn:
            assert tashkeel.pending(conn) == [ep]


# ----- the real model (only where it has been downloaded) -----

REAL = os.environ.get("TAMKEEN_TASHKEEL_MODEL")


@pytest.mark.skipif(not REAL or not Path(REAL).exists(), reason="set TAMKEEN_TASHKEEL_MODEL to the downloaded catt_eo.int8.onnx")
def test_real_model_on_standard_arabic(monkeypatch):
    monkeypatch.setattr(tashkeel, "model_path", lambda: Path(REAL))
    monkeypatch.setattr(tashkeel, "_session", None)
    nfc = lambda t: unicodedata.normalize("NFC", t)  # noqa: E731  (shadda before or after the vowel)
    assert nfc(tashkeel.vowel_text("كان الطقس جميلا في الصباح.")) == nfc("كَانَ الطَّقْسُ جَمِيلًا فِي الصَّبَاحِ.")
    assert nfc(tashkeel.vowel_text("يحب الأطفال اللعب في الحديقة")) == nfc("يُحِبُّ الْأَطْفَالُ اللَّعِبَ فِي الْحَدِيقَةِ")
