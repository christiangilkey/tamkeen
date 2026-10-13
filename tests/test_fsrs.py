"""The vocab reviewer on the computer: the memory model, the record of answers, its sync, the
learner's own notes, and how all of it reaches an Anki deck.

tests/fixtures/fsrs_parity.json holds what app/fsrs.py and the deck builder make of the sample
answers below; tests/js/review.test.mjs and tests/js/anki-deck.test.mjs check the phone's code
against it. After changing fsrs.py, fsrs.js or the samples, regenerate it:

    python -m tests.test_fsrs      (from the project folder)
"""

from __future__ import annotations

import io
import json
import sqlite3
import time
import zipfile
from pathlib import Path

import pytest

from app import anki_deck, db, exporters, fsrs
from app.sync import engine

try:
    from test_clips import client  # noqa: F401  (pytest fixture)
except ModuleNotFoundError:  # run as a script (to regenerate the parity file): no fixtures needed
    client = None

PARITY = Path(__file__).resolve().parent / "fixtures" / "fsrs_parity.json"
TODAY = 20_000
NOW = 1_800_000_000
MS = 1_700_000_000_000

# Lists of answers, each [t, rating, day, ms]: 3 = remembered, 1 = not remembered, 0 = taken back.
SAMPLES = {
    "remembered once": [[MS, 3, TODAY - 2, 4200]],
    "remembered three times": [[MS, 3, TODAY - 40, 3000], [MS + 1, 3, TODAY - 38, 2500], [MS + 2, 3, TODAY - 26, 2000]],
    "missed then remembered the same day": [[MS, 1, TODAY - 1, 9000], [MS + 60_000, 3, TODAY - 1, 4000]],
    "only ever missed": [[MS, 1, TODAY, 7000], [MS + 5, 1, TODAY, 3000]],
    "known, then forgotten": [[MS, 3, TODAY - 30, 3000], [MS + 1, 3, TODAY - 28, 3000], [MS + 2, 1, TODAY - 10, 8000]],
    "forgotten and relearned": [[MS, 3, TODAY - 30, 3000], [MS + 1, 3, TODAY - 28, 3000], [MS + 2, 1, TODAY - 10, 8000],
                                [MS + 3, 3, TODAY - 10, 2000], [MS + 4, 3, TODAY - 9, 2000]],
    "an answer taken back": [[MS, 3, TODAY - 5, 3000], [MS + 1, 0, TODAY - 3, 3000]],
    "out of order, with junk": [[MS + 9, 3, TODAY - 1, 100_000], "x", [MS, 3, TODAY - 4, 2000], [MS + 5, 7, TODAY, 0], [1, 3]],
    "a day that runs backwards": [[MS, 3, TODAY - 3, 1000], [MS + 1, 3, TODAY - 6, 1000]],
    "long overdue": [[MS, 3, TODAY - 400, 1000], [MS + 1, 3, TODAY - 398, 1000], [MS + 2, 3, TODAY, 1000]],
    "nothing": [],
}

# The words of tests/js/anki-deck.test.mjs, with reviewer answers for some of them.
DECK_WORDS = [
    {"uid": "v1", "text": "كتاب", "sentence": "هذا كتاب جميل", "meaning": 'book, "tome"', "notes": "n.", "episode_title": "Ep",
     "start": 65.0, "end": 65.5, "memo": "sounds like 'kit-tab': a kit of tabs\n\n  my uncle's shop  "},
    {"uid": "v2", "text": "مُرْتَبِكَة", "sentence": "كانت البنت مرتبكة من <السؤال>.", "meaning": "confused", "episode_title": "Ep",
     "start": None, "end": None,
     "notes": "Dictionary form: اِرْتَبَكَ · Root: ر ب ك · adjective · Common in everyday speech.\nheard in ep. 3",
     "translation": "The girl [Sara] was ⟦confused⟧ by the <question>.", "memo": "tied in <knots>"},
    {"uid": "v3", "text": "قلم", "sentence": "", "meaning": "", "notes": "my own note", "episode_title": "", "start": None, "end": None},
    {"uid": "v4", "text": "هون", "sentence": "انتي جديدة هون؟", "meaning": "here", "notes": "", "episode_title": "", "start": None,
     "end": None, "translation": "Are you new here?"},
]
DECK_REVIEW = {"v1": [3, TODAY + 4, 6, 1], "v3": [2, TODAY + 1, 2, 0]}   # the battles' boxes
DECK_REVIEWS = {"v1": SAMPLES["forgotten and relearned"], "v2": SAMPLES["only ever missed"],
                "v4": [[MS + 2, 3, TODAY - 1, 5000]]}                   # some answers share a millisecond across words


def parity() -> dict:
    cases = []
    for name, entries in SAMPLES.items():
        state = fsrs.replay(entries)
        cases.append({"name": name, "entries": entries, "state": state,
                      "schedule": list(fsrs.anki_schedule(state, TODAY)) if state else None,
                      "data": fsrs.anki_data(state) if state else None,
                      "log": [list(row) for row in fsrs.anki_log(entries)]})
    conn, _ = open_deck(anki_deck.build(DECK_WORDS, {}, now=NOW, review=DECK_REVIEW, today=TODAY, reviews=DECK_REVIEWS))
    try:
        deck = {"notes": [list(r) for r in conn.execute("SELECT * FROM notes ORDER BY id")],
                "cards": [list(r) for r in conn.execute("SELECT * FROM cards ORDER BY id")],
                "revlog": [list(r) for r in conn.execute("SELECT * FROM revlog ORDER BY id")]}
    finally:
        conn.close()
    return {"today": TODAY, "now": NOW, "cases": cases, "words": DECK_WORDS, "review": DECK_REVIEW, "reviews": DECK_REVIEWS,
            "deck": deck, "waits": [[s, fsrs.wait_for(s)] for s in (0.001, 0.4, 1.49, 1.5, 2.3065, 10, 99.5, 4000, 50_000)]}


def open_deck(data: bytes):
    """The deck's database, opened in memory, and the names of the files beside it."""
    z = zipfile.ZipFile(io.BytesIO(data))
    conn = sqlite3.connect(":memory:")
    conn.deserialize(z.read("collection.anki2"))
    return conn, z.namelist()


def test_parity_file_matches_the_python_model():
    assert json.loads(PARITY.read_text("utf-8")) == json.loads(json.dumps(parity(), ensure_ascii=False)), (
        "app/fsrs.py, the deck builder or a sample changed: regenerate fsrs_parity.json (see this file's docstring)")


# ----- the memory model -----

def test_a_remembered_word_waits_longer_each_time():
    card, day, waits = None, TODAY, []
    for _ in range(6):
        card = fsrs.answer(card, fsrs.GOOD, day)
        waits.append(card["ivl"])
        day = card["due"]
    assert waits[0] == 2, "a new word remembered at once comes back in two days"
    assert all(b > a for a, b in zip(waits, waits[1:])), waits
    assert waits[-1] > 300, "after six right answers on time the wait is about a year or more"
    assert card["lapses"] == 0 and card["reps"] == 6 and card["known"] and not card["learning"]


def test_a_missed_word_comes_back_the_same_day_until_remembered():
    card = fsrs.answer(None, fsrs.AGAIN, TODAY)
    assert card["learning"] and card["due"] == TODAY and card["ivl"] == 0 and not card["known"]
    assert card["lapses"] == 0, "missing a word never learned is not forgetting it"
    card = fsrs.answer(card, fsrs.GOOD, TODAY)
    assert not card["learning"] and card["ivl"] == 1 and card["due"] == TODAY + 1


def test_forgetting_a_known_word_costs_it_most_of_its_wait():
    card = None
    for day in (TODAY, TODAY + 2, TODAY + 14):
        card = fsrs.answer(card, fsrs.GOOD, day)
    known_for = card["ivl"]
    missed = fsrs.answer(card, fsrs.AGAIN, card["due"])
    assert missed["lapses"] == 1 and missed["learning"] and missed["known"]
    assert missed["d"] > card["d"], "a forgotten word is marked as harder"
    again = fsrs.answer(missed, fsrs.AGAIN, card["due"])
    assert again["lapses"] == 1, "missing it again the same day is still the one lapse"
    back = fsrs.answer(missed, fsrs.GOOD, card["due"])
    assert 1 <= back["ivl"] < known_for / 4


def test_the_wait_is_when_recall_falls_to_ninety_percent():
    for s in (0.5, 2.3065, 30, 500):
        assert fsrs.recall(s, s) == pytest.approx(0.9)
        assert fsrs.wait_for(s) == max(1, int(s + 0.5))
    assert fsrs.wait_for(10, retention=0.8) > fsrs.wait_for(10) > fsrs.wait_for(10, retention=0.95)
    assert fsrs.wait_for(10 ** 9) == fsrs.MAX_DAYS


def test_answers_taken_back_and_junk_are_ignored():
    assert fsrs.replay(None) is None and fsrs.replay("x") is None and fsrs.replay([[MS, 0, TODAY, 0]]) is None
    kept = fsrs.replay(SAMPLES["out of order, with junk"])
    assert kept["reps"] == 2 and kept["first"] == TODAY - 4, "sorted by time; the rating 7 and the short row are dropped"
    assert fsrs.replay(SAMPLES["an answer taken back"]) == fsrs.replay([[MS, 3, TODAY - 5, 3000]])
    assert fsrs.replay(SAMPLES["a day that runs backwards"])["day"] == TODAY - 3


def test_what_anki_is_told():
    learned = fsrs.replay(SAMPLES["forgotten and relearned"])
    assert fsrs.anki_schedule(learned, TODAY) == (2, 2, max(0, learned["due"] - TODAY), learned["ivl"], 2500, 5, 1)
    assert json.loads(fsrs.anki_data(learned)) == {"s": round(learned["s"], 4), "d": round(learned["d"], 4), "dr": 0.9, "decay": 0.1542}
    log = fsrs.anki_log(SAMPLES["forgotten and relearned"])
    assert [row[0] for row in log] == [MS, MS + 1, MS + 2, MS + 3, MS + 4]
    assert [row[1] for row in log] == [3, 3, 1, 3, 3], "Anki's Good and Again"
    assert [row[6] for row in log] == [0, 1, 1, 2, 1], "learning, review, review (forgot), relearning, review"
    assert log[2][2] == -60 and log[3][3] == -60, "a missed word's wait is written in seconds, as a negative number"
    assert all(100 <= row[4] <= 1100 for row in log) and log[0][5] == 3000
    stuck = fsrs.replay(SAMPLES["only ever missed"])
    assert fsrs.anki_schedule(stuck, TODAY)[:4] == (2, 2, 0, 1), "still to be remembered: due today in Anki"
    assert fsrs.anki_log([[MS, 3, TODAY, 10 ** 9]])[0][5] == 60000, "Anki caps the time on a card at a minute"


# ----- the record of answers -----

def test_answers_are_kept_and_one_can_be_taken_back(client):  # noqa: F811
    word = client.post("/api/vocab", json={"text": "كتاب", "meaning": "book"}).json()
    assert client.get("/api/reviews").json() == {"reviews": {}}
    for t, rating in ((MS + 5, 3), (MS, 1)):
        assert client.post("/api/reviews", json={"uid": word["uid"], "t": t, "rating": rating, "day": TODAY, "ms": 1500}).json() == {"ok": True}
    assert client.get("/api/reviews").json()["reviews"][word["uid"]] == [[MS, 1, TODAY, 1500], [MS + 5, 3, TODAY, 1500]]
    client.post("/api/reviews", json={"uid": word["uid"], "t": MS + 5, "rating": 0, "day": TODAY, "ms": 1500})  # Undo
    assert client.get("/api/reviews").json()["reviews"][word["uid"]] == [[MS, 1, TODAY, 1500], [MS + 5, 0, TODAY, 1500]]
    for bad in ({"uid": word["uid"], "t": MS, "rating": 2, "day": TODAY}, {"uid": " ", "t": MS, "rating": 3, "day": TODAY},
                {"uid": word["uid"], "t": 0, "rating": 3, "day": TODAY}):
        assert client.post("/api/reviews", json=bad).status_code == 400, bad


def test_own_notes_are_saved_searched_and_synced(client):  # noqa: F811
    word = client.post("/api/vocab", json={"text": "كتاب", "meaning": "book"}).json()
    assert word["memo"] == ""
    before = word["updated_at"]
    time.sleep(0.01)
    saved = client.patch(f"/api/vocab/{word['id']}", json={"memo": "a kit of tabs"}).json()
    assert saved["memo"] == "a kit of tabs" and saved["updated_at"] > before, "a new note counts as a change, so it syncs"
    assert [v["uid"] for v in client.get("/api/vocab", params={"q": "KIT of"}).json()] == [word["uid"]]
    assert engine.snapshot("d")["vocab"][0]["memo"] == "a kit of tabs"


def test_answers_from_two_devices_add_up(client):  # noqa: F811
    word = client.post("/api/vocab", json={"text": "كتاب", "meaning": "book"}).json()
    uid = word["uid"]
    client.post("/api/reviews", json={"uid": uid, "t": MS, "rating": 3, "day": TODAY, "ms": 100})
    client.post("/api/reviews", json={"uid": uid, "t": MS + 10, "rating": 1, "day": TODAY, "ms": 100})
    mine = engine.snapshot("d")
    assert mine["reviews"] == {uid: [[MS, 3, TODAY, 100], [MS + 10, 1, TODAY, 100]]}
    remote = {**mine, "reviews": {uid: [[MS, 3, TODAY, 100], [MS + 10, 0, TODAY, 100], [MS + 20, 3, TODAY + 1, 900], "junk", [MS + 30, 9, 1, 1]],
                                  "other-word": [[MS + 40, 1, TODAY, 50]]}}
    result = engine.Result()
    engine.merge(remote, result)
    assert result.merged["reviews"] == 3, "one taken back there, one new answer, one answer for another word"
    merged = engine.snapshot("d")["reviews"]
    assert merged == {uid: [[MS, 3, TODAY, 100], [MS + 10, 0, TODAY, 100], [MS + 20, 3, TODAY + 1, 900]],
                      "other-word": [[MS + 40, 1, TODAY, 50]]}
    again = engine.Result()
    engine.merge({**mine, "reviews": {uid: [[MS + 10, 1, TODAY, 100]]}}, again)
    assert again.merged.get("reviews", 0) == 0 and engine.snapshot("d")["reviews"] == merged, "an answer taken back stays taken back"
    # A device from before the reviewer sends no answers and no notes: nothing is lost here.
    client.patch(f"/api/vocab/{word['id']}", json={"memo": "kept"})
    old = {k: v for k, v in engine.snapshot("d").items() if k != "reviews"}
    old["vocab"] = [{k: v for k, v in w.items() if k != "memo"} | {"meaning": "a book", "updated_at": time.time() + 60} for w in old["vocab"]]
    engine.merge(old, engine.Result())
    row = client.get("/api/vocab").json()[0]
    assert (row["meaning"], row["memo"]) == ("a book", "kept")
    assert engine.snapshot("d")["reviews"] == merged
    assert engine._content(old) != engine._content(engine.snapshot("d")), "so this computer uploads its answers again"


# ----- into the Anki deck -----

def test_own_notes_go_on_the_back_of_the_card():
    word = {"uid": "v1", "text": "كتاب", "sentence": "هذا كتاب جميل", "meaning": "book", "notes": "Root: ك ت ب · noun · Very common."}
    plain = exporters.anki_fields(word)[1]
    assert exporters.anki_fields({**word, "memo": "  "})[1] == plain and exporters.anki_fields({**word, "memo": None})[1] == plain
    back = exporters.anki_fields({**word, "memo": "a <kit> of tabs\r\n\n my uncle's shop "})[1]
    assert back == plain + "<br>Note: a &lt;kit&gt; of tabs<br>my uncle&#x27;s shop"
    assert exporters.anki_fields({"uid": "v2", "text": "قلم", "sentence": "", "meaning": "", "notes": "", "memo": "pen pal"})[1] == "<b>قلم</b><br>Note: pen pal"


def test_reviewed_words_take_their_schedule_and_log_into_the_deck():
    conn, _ = open_deck(anki_deck.build(DECK_WORDS, {}, now=NOW, review=DECK_REVIEW, today=TODAY, reviews=DECK_REVIEWS))
    try:
        cards = {guid: card for guid, *card in conn.execute(
            "SELECT n.guid, c.id, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses, c.data FROM cards c JOIN notes n ON n.id = c.nid")}
        log = conn.execute("SELECT id, cid, usn, ease, ivl, lastIvl, factor, time, type FROM revlog ORDER BY id").fetchall()
        mods = conn.execute("SELECT mod FROM notes").fetchall()
    finally:
        conn.close()
    learned = fsrs.replay(DECK_REVIEWS["v1"])
    # The reviewer's record wins over the battles' box for v1; v3 has only the box; v4 was answered once.
    assert cards["tk-v1"][1:] == [2, 2, max(0, learned["due"] - TODAY), learned["ivl"], 2500, 5, 1, fsrs.anki_data(learned)]
    assert cards["tk-v2"][1:5] == [2, 2, 0, 1] and cards["tk-v2"][6:8] == [2, 0]
    assert cards["tk-v3"][1:] == [2, 2, 1, 2, 2500, 2, 0, ""], "the battles' box 2, with no memory state and no log"
    assert cards["tk-v4"][1:5] == [2, 2, 1, 2] and json.loads(cards["tk-v4"][8])["s"] == 2.3065
    assert len(log) == 5 + 2 + 1 and len({row[0] for row in log}) == 8, "every line has its own id"
    assert [row[0] for row in log] == sorted(row[0] for row in log)
    by_card = {cid: [row for row in log if row[1] == cid] for cid in {row[1] for row in log}}
    assert len(by_card[cards["tk-v1"][0]]) == 5 and len(by_card[cards["tk-v2"][0]]) == 2 and len(by_card[cards["tk-v4"][0]]) == 1
    assert [row[3] for row in by_card[cards["tk-v1"][0]]] == [3, 3, 1, 3, 3], "each word's answers stay in order"
    assert {row[2] for row in log} == {-1}
    assert all(m[0] == NOW for m in mods), "notes stay dated by when the word was saved (here: the export, having no date)"


def test_export_reads_the_reviewers_record(client, tmp_path):  # noqa: F811
    known = client.post("/api/vocab", json={"text": "كتاب", "meaning": "book"}).json()
    boxed = client.post("/api/vocab", json={"text": "قلم", "meaning": "pen"}).json()
    client.patch(f"/api/vocab/{known['id']}", json={"memo": "a kit of tabs"})
    today = anki_deck.day_number(time.time())
    db.set_settings({"game_state": {"review": {known["uid"]: [1, today, 1, 3], boxed["uid"]: [3, today + 4, 6, 1]}}})
    for n, rating in enumerate((3, 3)):
        client.post("/api/reviews", json={"uid": known["uid"], "t": MS + n, "rating": rating, "day": today - 2 + 2 * n, "ms": 2000})
    conn, _ = open_deck(client.get("/api/vocab/export/apkg").content)
    try:
        cards = {guid: card for guid, *card in conn.execute(
            "SELECT n.guid, c.type, c.queue, c.due, c.ivl, c.reps, c.lapses, c.data, n.flds FROM cards c JOIN notes n ON n.id = c.nid")}
        assert conn.execute("SELECT count(*) FROM revlog").fetchone()[0] == 2
    finally:
        conn.close()
    state = fsrs.replay([[MS, 3, today - 2, 2000], [MS + 1, 3, today, 2000]])
    assert cards[f"tk-{known['uid']}"][:7] == [2, 2, state["ivl"], state["ivl"], 2, 0, fsrs.anki_data(state)]
    assert "<br>Note: a kit of tabs" in cards[f"tk-{known['uid']}"][7]
    assert cards[f"tk-{boxed['uid']}"][:7] == [2, 2, 4, 4, 7, 1, ""]


if __name__ == "__main__":
    PARITY.write_text(json.dumps(parity(), ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"wrote {PARITY}")
