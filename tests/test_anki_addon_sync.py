"""The two-way Anki sync end to end on the computer: the app's endpoints, the add-on's deck code
(web/anki-addon/syncer.py), and a real Anki collection made by Anki's own Python library.

The collection is a throwaway. It has a second deck, "Other", full of things that look tempting
(the same word, Tamkeen's own tag): every test ends by checking that deck is exactly as it was.

Needs the ``anki`` library, which the app itself does not use. Without it these tests are skipped:

    uv pip install --python .venv/Scripts/python.exe --target <some folder> anki
    TAMKEEN_ANKI_LIB=<some folder> .venv/Scripts/python -m pytest tests/test_anki_addon_sync.py -q
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
if os.environ.get("TAMKEEN_ANKI_LIB"):
    sys.path.append(os.environ["TAMKEEN_ANKI_LIB"])
pytest.importorskip("anki", reason="the anki library is not installed (see the top of this file)")
from anki.collection import Collection  # noqa: E402


def load(name: str):
    """One of the add-on's modules, loaded from where it ships (neither imports Anki's window code)."""
    spec = importlib.util.spec_from_file_location(f"tamkeen_addon_{name}", ROOT / "web" / "anki-addon" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


core, syncer = load("core"), load("syncer")
IMAGE = '<img src="my-own-picture.jpg">'
DECK = "Tamkeen – Arabic"   # a new learner's Arabic deck (each language has its own)


class World:
    """Tamkeen (through its real endpoints) and one Anki collection, with the add-on's loop between them."""

    def __init__(self, client: TestClient, folder: Path, name: str = "collection"):
        from app import companion

        self.client, self.folder = client, folder
        self.headers = {"X-Tamkeen-Token": companion.token()}
        self.col = Collection(str(folder / f"{name}.anki2"))
        self.deleted: dict = {}
        self.last: dict = {}

    def sync(self) -> dict:
        """What the add-on does on "Sync Tamkeen now" (web/anki-addon/__init__.py), minus the window."""
        config = self.client.get("/api/anki/sync/config", headers=self.headers).json()
        totals = {"added": 0, "changed": 0, "removed": 0, "failed": 0, "refused": 0, "rounds": 0}
        if not config["enabled"]:
            return {**totals, "off": True}
        decks, applied = config["decks"], None
        for number in range(1, 41):
            core.note_deleted(self.deleted, syncer.pending_deletions(self.col), 0.0)
            body, ids = syncer.request(self.col, decks, number, applied, self.deleted, "User 1")
            reply = self.client.post("/api/anki/sync", json=body, headers=self.headers).json()
            self.last = reply
            totals["rounds"] = number
            if reply.get("paused") or not reply.get("enabled"):
                return {**totals, "paused": reply.get("paused")}
            if reply.get("retry"):
                decks = reply["decks"]
                continue
            files = {}
            for wanted in syncer.wanted_media(reply):
                got = self.client.get(f"/api/anki/media/{wanted}", headers=self.headers)
                files[wanted] = got.content if got.status_code == 200 else None
            applied, again = syncer.carry_out(self.col, reply, files, ids)
            for key in ("added", "changed", "removed", "failed", "refused"):
                totals[key] += applied[key]
            if not again:
                break
        return totals

    # Tamkeen
    def save(self, text: str, meaning: str, **more) -> dict:
        return self.client.post("/api/vocab", json={"text": text, "meaning": meaning, **more}).json()

    def words(self) -> dict[str, dict]:
        return {v["text"]: v for v in self.client.get("/api/vocab").json()}

    def status(self) -> dict:
        return self.client.get("/api/anki/sync/status").json()

    # Anki
    def notes(self, deck: str = DECK) -> list:
        return [self.col.get_note(i) for i in self.col.find_notes(f'"deck:{deck}"')]

    def note(self, uid: str):
        found = [n for n in self.notes() if n.guid == f"tk-{uid}" or f"tamkeen-id::{uid}" in n.tags]
        assert len(found) == 1, f"{len(found)} cards for {uid}"
        return found[0]

    def other(self) -> list:
        """Everything about the cards outside the Tamkeen deck, to compare before and after."""
        deck = self.col.decks.id_for_name("Other")
        return [self.col.db.all("select * from notes where id in (select nid from cards where did = ?) order by id", deck),
                self.col.db.all("select * from cards where did = ? order by id", deck),
                self.col.db.all("select * from revlog where cid in (select id from cards where did = ?) order by id", deck),
                sorted(d.name for d in self.col.decks.all_names_and_ids())]


@pytest.fixture()
def world(fresh_db, tmp_path, monkeypatch):
    from app import paths
    from app.main import create_app

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    for name in ("clips", "anki-clips", "tmp"):
        (tmp_path / name).mkdir()
    with TestClient(create_app(start_worker=False)) as client:
        w = World(client, tmp_path)
        # A second deck that must come out untouched: a card of the very same word, one wearing
        # Tamkeen's tag, and one that has been studied.
        basic = w.col.models.by_name("Basic")
        other = w.col.decks.id("Other")
        for front, back, tags in (("book", "كتاب", []), ("pen", "قلم", ["tamkeen"]), ("door", "باب", ["mine"])):
            n = w.col.new_note(basic)
            n["Front"], n["Back"], n.tags = front, back, tags
            w.col.add_note(n, other)
        w.col.decks.select(other)
        card = w.col.sched.getCard()
        w.col.sched.answerCard(card, 3)
        w.before = w.other()
        client.post("/api/anki/sync/options", json={"enabled": True})
        yield w
        assert w.other()[:3] == w.before[:3], "the other deck was changed"
        w.col.close()


def test_nothing_happens_while_the_sync_is_switched_off(world):
    world.client.post("/api/anki/sync/options", json={"enabled": False})
    world.save("كتاب", "book")
    assert world.sync()["off"] is True
    assert world.col.decks.id_for_name(DECK) is None, "no deck is made in an Anki that has not been asked"


def test_the_add_on_is_refused_without_its_token(world):
    assert world.client.get("/api/anki/sync/config").status_code == 403
    assert world.client.post("/api/anki/sync", json={"deck": "Tamkeen"}, headers={"X-Tamkeen-Token": "nope"}).status_code == 403
    assert world.client.get("/api/anki/media/_tamkeen-naskh.woff2").status_code == 403


def test_new_words_become_cards_in_the_tamkeen_deck_only(world):
    from app import anki_deck, exporters

    saved = world.save("كتاب", "book", sentence="هذا كتاب جميل", notes="Dictionary form: كِتَاب · noun · common")
    world.save("مرتبكة", "confused", translation="The girl was ⟦confused⟧ by the question.")
    done = world.sync()
    assert (done["added"], done["changed"], done["removed"], done["failed"]) == (2, 0, 0, 0)
    assert done["rounds"] == 2, "one round to make the cards, one for Tamkeen to see them and link"
    note = world.note(saved["uid"])
    assert (note["Front"], note["Back"]) == exporters.anki_fields(saved), "the same card Export for Anki makes"
    assert note["image"] == "" and note["TTS Input"] == ""
    assert note.guid == f"tk-{saved['uid']}" and set(note.tags) == {"tamkeen", f"tamkeen-id::{saved['uid']}"}
    model = note.note_type()
    assert model["name"] == "Tamkeen" and [f["name"] for f in model["flds"]] == list(anki_deck.FIELDS)
    assert model["tmpls"][0]["qfmt"] == (ROOT / "web" / "anki-card" / "front.html").read_text("utf-8")
    assert world.col.media.have(anki_deck.FONT_NAME)
    assert len(world.notes()) == 2 and len(world.notes("Other")) == 3
    again = world.sync()
    assert (again["added"], again["changed"], again["rounds"]) == (0, 0, 1), "a second sync finds nothing to do"
    status = world.status()
    assert status["linked"] == 2 and status["last_change"]["to_anki"] == {"added": 2, "changed": 0, "removed": 0}


def test_a_word_with_audio_takes_its_clips_along(world):
    from app.sync import engine

    saved = world.save("كتاب", "book", sentence="هذا كتاب", start=1.0, end=1.6, sent_start=0.5, sent_end=3.0)
    shutil.copy(ROOT / "tests" / "fixtures" / "tone.ogg", engine.clip_path(saved["uid"]))
    world.client.put(f"/api/vocab/{saved['id']}/clip?start=1.0&end=1.6&sent_start=0.5&sent_end=3.0",
                     content=(ROOT / "tests" / "fixtures" / "tone.ogg").read_bytes())
    assert world.sync()["added"] == 1
    note = world.note(saved["uid"])
    assert note["TTS Input"] == f"[sound:tk-{saved['uid']}-w.mp3][sound:tk-{saved['uid']}-s.mp3]"
    for part in ("w", "s"):
        clip = Path(world.col.media.dir()) / f"tk-{saved['uid']}-{part}.mp3"
        assert clip.exists() and clip.stat().st_size > 500


def test_edits_travel_both_ways_and_the_image_field_is_never_written(world):
    saved = world.save("كتاب", "book", notes="Dictionary form: كِتَاب · noun · common")
    world.sync()
    note = world.note(saved["uid"])
    note["image"] = IMAGE                     # the learner adds a picture in Anki
    note["TTS Input"] = "[sound:mine.mp3]"   # and their own audio
    world.col.update_note(note)
    assert world.sync()["changed"] == 0, "a picture added in Anki is not Tamkeen's business"

    # edited in Tamkeen -> the card's front
    world.client.patch(f"/api/vocab/{saved['id']}", json={"meaning": "a book"})
    assert world.sync()["changed"] == 1
    note = world.note(saved["uid"])
    assert note["Front"] == "a book" and note["image"] == IMAGE and note["TTS Input"] == "[sound:mine.mp3]"

    # edited in Anki -> the word's notes
    note["Back"] = note["Back"].replace("Note: common", "Note: very common<br>seen in a shop")
    world.col.update_note(note)
    done = world.sync()
    assert done["changed"] == 0, "the card is not rewritten after its own edit"
    word = world.words()["كتاب"]
    assert word["notes"] == "noun · Dictionary form: كِتَاب · very common · seen in a shop" and word["meaning"] == "a book"
    assert world.status()["last"]["to_tamkeen"] == {"added": 0, "changed": 1, "removed": 0}
    assert world.note(saved["uid"])["image"] == IMAGE


def test_a_hand_made_card_becomes_a_word_and_one_of_an_existing_word_is_linked(world):
    saved = world.save("كتاب", "book")
    deck = world.col.decks.id(DECK)
    basic = world.col.models.by_name("Basic")
    for front, back in (("the book", "كِتَاب"), ("window", "شباك<br>افتح الشباك")):
        n = world.col.new_note(basic)
        n["Front"], n["Back"] = front, back
        world.col.add_note(n, deck)
    done = world.sync()
    assert done["added"] == 0, "the word that already has a hand-made card gets no second card"
    words = world.words()
    assert set(words) == {"كتاب", "شباك"} and words["شباك"]["meaning"] == "window" and words["شباك"]["sentence"] == "افتح الشباك"
    assert words["كتاب"]["meaning"] == "book", "linking a hand-made card changes neither side"
    linked = world.note(saved["uid"])
    assert (linked["Front"], linked["Back"]) == ("the book", "كِتَاب")
    assert len(world.notes()) == 2
    assert world.sync()["rounds"] == 1


def test_review_progress_is_read_and_anki_keeps_its_own_schedule(world):
    saved = world.save("كتاب", "book")
    world.sync()
    world.col.decks.select(world.col.decks.id_for_name(DECK))
    card = world.col.sched.getCard()
    world.col.sched.answerCard(card, 1)   # wrong
    card = world.col.sched.getCard()
    world.col.sched.answerCard(card, 4)   # right ("easy"): it becomes a review card, due in a few days
    schedule = world.col.db.all("select type, queue, due, ivl, factor, reps, lapses, left from cards where nid = ?", card.nid)
    world.sync()
    progress = world.client.get("/api/anki/progress").json()[saved["uid"]]
    assert progress["state"] == "review" and progress["right"] == 1 and progress["wrong"] == 1 and progress["history"] == "01"
    assert progress["interval"] >= 1 and progress["due_days"] == progress["interval"] and progress["due"] > progress["seen"]
    assert world.col.db.all("select type, queue, due, ivl, factor, reps, lapses, left from cards where nid = ?", card.nid) == schedule


def test_deleting_a_word_asks_first_then_removes_the_card(world):
    saved = world.save("كتاب", "book")
    keep = world.save("قلم", "pen")
    world.sync()
    assert world.client.get(f"/api/anki/linked/{saved['uid']}").json() == {"linked": True}
    world.client.delete(f"/api/vocab/{saved['id']}")
    assert world.sync()["removed"] == 0
    status = world.status()
    assert [w["text"] for w in status["held"]] == ["كتاب"] and status["delete_ok"] is False
    assert len(world.notes()) == 2, "nothing is deleted in Anki before the learner agrees"
    world.client.post("/api/anki/sync/resolve", json={"what": "held", "choice": "delete"})
    assert world.sync()["removed"] == 1
    assert [n.guid for n in world.notes()] == [f"tk-{keep['uid']}"]
    assert world.status()["held"] == [] and world.status()["delete_ok"] is True


def test_a_held_deletion_can_be_taken_back(world):
    saved = world.save("كتاب", "book")
    world.sync()
    world.client.delete(f"/api/vocab/{saved['id']}")
    world.sync()
    world.client.post("/api/anki/sync/resolve", json={"what": "held", "choice": "restore"})
    assert "كتاب" in world.words() and world.sync()["removed"] == 0 and len(world.notes()) == 1


def test_a_card_deleted_in_anki_removes_the_word_but_a_missing_card_does_not(world):
    deleted, lost = world.save("كتاب", "book"), world.save("قلم", "pen")
    world.sync()
    world.col.remove_notes([world.note(deleted["uid"]).id])   # Anki records this deletion
    gone = world.note(lost["uid"]).id
    world.col.remove_notes([gone])
    world.col.db.execute("delete from graves where oid = ?", gone)  # ...and has no record of this one
    done = world.sync()
    assert done["added"] == 0, "neither card is quietly made again"
    assert set(world.words()) == {"قلم"}, "only the recorded deletion removed its word"
    status = world.status()
    assert [w["text"] for w in status["missing"]] == ["قلم"] and status["last"]["to_tamkeen"]["removed"] == 1
    # The learner decides about the missing one: put the card back.
    world.client.post("/api/anki/sync/resolve", json={"what": "missing", "choice": "recreate"})
    assert world.sync()["added"] == 1 and world.note(lost["uid"])["Front"] == "pen"


def test_an_emptied_anki_wipes_nothing(world):
    world.save("كتاب", "book"), world.save("قلم", "pen")
    world.sync()
    for n in world.notes():
        world.col.remove_notes([n.id])
    world.col.db.execute("delete from graves")   # as after restoring an old backup: no record of any deletion
    done = world.sync()
    assert done["added"] == 0 and set(world.words()) == {"كتاب", "قلم"}
    assert len(world.status()["missing"]) == 2


def test_a_different_collection_is_left_alone_until_the_learner_says_so(world, tmp_path):
    world.save("كتاب", "book")
    world.sync()
    second = World(world.client, tmp_path, "another-profile")
    second.col.db.execute("update col set crt = crt + 86400")  # made on another day: another collection
    done = second.sync()
    assert done.get("paused") == "collection" and second.col.decks.id_for_name(DECK) is None
    assert world.status()["other"]["profile"] == "User 1"
    world.client.post("/api/anki/sync/resolve", json={"what": "collection", "choice": "adopt"})
    assert second.sync()["added"] == 1
    second.col.close()


def test_a_card_moved_to_another_deck_is_not_made_again(world):
    saved = world.save("كتاب", "book")
    world.sync()
    card_ids = world.col.find_cards(f'"deck:{DECK}"')
    spare = world.col.decks.id("Spare")
    world.col.set_deck(card_ids, spare)
    done = world.sync()
    assert done["added"] == 0 and len(world.col.find_notes('"deck:Spare"')) == 1
    assert world.status()["moved"] == 1 and "كتاب" in world.words()
    moved = world.col.get_note(world.col.find_notes('"deck:Spare"')[0])
    assert moved.guid == f"tk-{saved['uid']}"


def test_the_add_on_refuses_to_touch_a_note_outside_the_deck(world):
    """Even if Tamkeen asked for it: the add-on only changes notes it found in the deck itself."""
    world.save("كتاب", "book")
    world.sync()
    outsider = world.col.find_notes('"deck:Other"')[0]
    _, ids = syncer.request(world.col, [{"language": "ar", "name": DECK}], 1, None, {})
    assert outsider not in ids
    done = syncer.apply(world.col, {
        "update": [{"note": outsider, "fields": {"Front": "hacked", "Back": "hacked"}}],
        "tag": [{"note": outsider, "add": ["tamkeen-id::vabc"]}], "delete": [outsider]}, None, lambda name: None, ids)
    assert done["refused"] == 3 and done["changed"] == done["removed"] == 0
    # And inside the deck, only Front and Back can be written: never the image field.
    inside = next(iter(ids))
    done = syncer.apply(world.col, {"update": [{"note": inside, "fields": {"image": "x", "TTS Input": "y", "Front": "ok"}}]},
                        None, lambda name: None, ids)
    note = world.col.get_note(inside)
    assert (note["Front"], note["image"], note["TTS Input"]) == ("ok", "", "")


def test_a_note_with_cards_in_two_decks_is_left_out(world):
    """A hand-made note whose second card lives in another deck is not Tamkeen's to change."""
    model = world.col.models.by_name("Basic (and reversed card)")
    deck, other = world.col.decks.id(DECK), world.col.decks.id_for_name("Other")
    n = world.col.new_note(model)
    n["Front"], n["Back"] = "chair", "كرسي"
    world.col.add_note(n, deck)
    world.col.set_deck([n.cards()[1].id], other)
    world.before = world.other()
    world.sync()
    assert world.words() == {} and world.status()["skipped"] == 1
    assert world.col.get_note(n.id).tags == []


# ----- the part of the add-on that talks to Anki's window (web/anki-addon/__init__.py) -----

class FakeWindow:
    """A stand-in for Anki's main window and the few pieces of its toolkit the add-on touches."""

    def __init__(self, col):
        import types

        self.shown: list[str] = []
        self.actions: dict[str, object] = {}
        self.resets = 0
        window = self

        class Signal:
            def __init__(self):
                self.handlers = []

            def connect(self, fn):
                self.handlers.append(fn)

            def emit(self):
                for fn in self.handlers:
                    fn()

        class QAction:
            def __init__(self, text, parent=None):
                self.text, self.triggered = text, Signal()

        class QTimer:
            def __init__(self, parent=None):
                self.timeout, self.interval, self.running = Signal(), None, False

            def setSingleShot(self, value):
                pass

            def setInterval(self, ms):
                self.interval = ms

            def start(self, ms=None):
                self.interval, self.running = ms if ms is not None else self.interval, True

        class Hooks:
            def __getattr__(self, name):
                self.__dict__[name] = []
                return self.__dict__[name]

        def reset():
            window.resets += 1

        self.hooks = Hooks()
        self.mw = types.SimpleNamespace(
            col=col, state="deckBrowser", pm=types.SimpleNamespace(name="User 1"), reset=reset,
            taskman=types.SimpleNamespace(run_on_main=lambda fn: fn()),
            form=types.SimpleNamespace(menuTools=types.SimpleNamespace(
                addAction=lambda action: self.actions.__setitem__(action.text, action))))
        self.modules = {
            "aqt": types.SimpleNamespace(gui_hooks=self.hooks, mw=self.mw),
            "aqt.qt": types.SimpleNamespace(QAction=QAction, QTimer=QTimer),
            "aqt.utils": types.SimpleNamespace(showInfo=lambda text, title="": self.shown.append(text)),
        }


@pytest.fixture()
def addon(world, tmp_path, monkeypatch):
    """The add-on installed from the app's own download, loaded the way Anki loads it."""
    import io
    import time
    import zipfile

    from app import companion

    folder = tmp_path / "addons21" / "tamkeen_companion"
    with zipfile.ZipFile(io.BytesIO(world.client.get("/api/anki/addon").content)) as z:
        z.extractall(folder)
    companion.write_info(8765)  # what the app writes when it starts: where it is listening
    window = FakeWindow(world.col)
    for name, module in window.modules.items():
        monkeypatch.setitem(sys.modules, name, module)
    spec = importlib.util.spec_from_file_location("tamkeen_companion", folder / "__init__.py",
                                                  submodule_search_locations=[str(folder)])
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "tamkeen_companion", module)
    spec.loader.exec_module(module)

    def ask(url, token, body=None, timeout=10.0, raw=False):
        """The add-on's requests, sent to the app under test instead of over the network."""
        assert url.startswith("http://127.0.0.1:8765/api/anki/")
        path, headers = url.split(":8765", 1)[1], {"X-Tamkeen-Token": token}
        reply = world.client.get(path, headers=headers) if body is None else world.client.post(path, json=body, headers=headers)
        if reply.status_code != 200:
            return None
        return reply.content if raw else reply.json()

    monkeypatch.setattr(module.core, "ask", ask)

    def settle():
        for _ in range(400):
            if not module._sync["busy"]:
                return
            time.sleep(0.02)
        raise AssertionError("the sync did not finish")

    module.settle, module.window = settle, window
    yield module
    settle()
    monkeypatch.delitem(sys.modules, "tamkeen_companion.core", raising=False)
    monkeypatch.delitem(sys.modules, "tamkeen_companion.syncer", raising=False)


def test_the_add_on_syncs_when_a_profile_opens_and_from_its_menu(world, addon):
    saved = world.save("كتاب", "book")
    for opened in addon.window.hooks.profile_did_open:
        opened()
    addon.settle()
    assert world.note(saved["uid"])["Front"] == "book", "the card was made without anyone asking"
    assert addon.window.shown == [], "an automatic sync says nothing"
    assert addon.window.resets == 1 and addon._sync["timer"].running
    assert addon._sync["timer"].interval == 10 * 60 * 1000

    assert {"Tamkeen companion…", "Sync Tamkeen now"} <= set(addon.window.actions)
    world.client.patch(f"/api/vocab/{saved['id']}", json={"meaning": "a book"})
    addon.window.actions["Sync Tamkeen now"].triggered.emit()
    addon.settle()
    assert addon.window.shown == ["Synced with Tamkeen. In Anki: 0 added, 1 changed, 0 removed."]
    assert world.note(saved["uid"])["Front"] == "a book"
    # ...and after Anki's own sync, and when leaving the reviewer, but not in the middle of reviewing
    assert addon.sync_now in addon.window.hooks.sync_did_finish
    world.client.patch(f"/api/vocab/{saved['id']}", json={"meaning": "the book"})
    addon.window.mw.state = "review"
    addon._sync["timer"].timeout.emit()
    addon.settle()
    assert world.note(saved["uid"])["Front"] == "a book", "the timer waits while cards are being reviewed"
    addon.window.mw.state = "overview"
    for changed in addon.window.hooks.state_did_change:
        changed("overview", "review")
    addon.settle()
    assert world.note(saved["uid"])["Front"] == "the book"


def test_the_add_on_records_deletions_made_in_anki(world, addon):
    saved = world.save("كتاب", "book")
    addon.sync_now()
    addon.settle()
    note_id = world.note(saved["uid"]).id
    for deleted in addon.window.hooks.notes_will_be_deleted:   # what Anki calls when the learner deletes a note
        deleted(world.col, [note_id])
    world.col.remove_notes([note_id])
    for before in addon.window.hooks.sync_will_start:           # Anki's own sync then forgets its list
        before()
    world.col.db.execute("delete from graves")
    addon.sync_now()
    addon.settle()
    assert world.words() == {}, "the add-on's own record of the deletion removed the word"
    assert world.status()["missing"] == []


def test_the_add_on_is_quiet_when_tamkeen_is_closed_or_the_sync_is_off(world, addon, tmp_path):
    world.save("كتاب", "book")
    world.client.post("/api/anki/sync/options", json={"enabled": False})
    addon.sync_now()
    addon.settle()
    assert world.col.decks.id_for_name(DECK) is None and addon.window.shown == []
    (tmp_path / "companion.json").unlink()   # Tamkeen is not running
    addon.sync_now()
    addon.settle()
    assert addon.window.shown == [] and not addon._sync["busy"]
    addon.sync_now(tell=True)                # asked for by hand: then it says why nothing happened
    assert addon.window.shown == ["Tamkeen isn't open right now. Open Tamkeen and try again."]



# ----- a deck per language -----

def test_each_language_gets_its_own_deck_and_a_hand_made_card_takes_its_decks_language(world):
    arabic = world.save("كتاب", "book")
    world.client.patch("/api/settings", json={"study_language": "es", "learning_languages": ["ar", "es"]})
    spanish = world.save("libro", "book")
    assert spanish["language"] == "es"
    assert world.client.get("/api/anki/sync/status").json()["decks"] == [
        {"language": "ar", "name": DECK}, {"language": "es", "name": "Tamkeen – Spanish"}]
    assert world.sync()["added"] == 2
    assert [n.guid for n in world.notes()] == [f"tk-{arabic['uid']}"]
    assert [n.guid for n in world.notes("Tamkeen – Spanish")] == [f"tk-{spanish['uid']}"]
    hand = world.col.new_note(world.col.models.by_name("Basic"))
    hand["Front"], hand["Back"] = "book", "el libro"       # same front as the Arabic word's card
    world.col.add_note(hand, world.col.decks.id_for_name("Tamkeen – Spanish"))
    world.sync()
    made = [v for v in world.client.get("/api/vocab").json() if v["text"] == "el libro"]  # shown while learning Spanish
    assert len(made) == 1 and made[0]["language"] == "es"
    assert len(world.notes()) == 1, "the Arabic deck is unchanged"


def test_an_existing_learner_keeps_the_tamkeen_deck_and_nothing_is_doubled(world):
    """Someone who synced (or imported) into the single "Tamkeen" deck before languages had decks."""
    from app import db

    db.set_settings({"anki_decks": None, "anki_deck": "Tamkeen"})   # as it was before
    old = [world.save("كتاب", "book"), world.save("قلم", "pen")]
    old_spanish = world.save("gato", "cat", episode_id=None)
    with db.session() as conn:
        conn.execute("UPDATE vocab SET language = 'es' WHERE uid = ?", (old_spanish["uid"],))
    # their cards from before: all three in the one deck, the Spanish word's too
    for v in old + [old_spanish]:
        n = world.col.new_note(world.col.models.by_name("Basic"))
        n["Front"], n["Back"], n.guid = v["meaning"], v["text"], f"tk-{v['uid']}"
        world.col.add_note(n, world.col.decks.id("Tamkeen"))
    decks = world.client.get("/api/anki/sync/status").json()["decks"]
    assert {"language": "ar", "name": "Tamkeen"} in decks, "the old deck stays the deck of the language with most words"
    done = world.sync()
    assert done["added"] == 0 and done["removed"] == 0, "no card made twice, none taken for deleted"
    assert world.col.decks.id_for_name("Tamkeen – Spanish") is None
    assert len(world.notes("Tamkeen")) == 3 and world.status()["missing"] == [] and world.status()["moved"] == 0
    new_spanish = world.save("perro", "dog")
    with db.session() as conn:
        conn.execute("UPDATE vocab SET language = 'es' WHERE uid = ?", (new_spanish["uid"],))
    assert world.sync()["added"] == 1
    assert [n.guid for n in world.notes("Tamkeen – Spanish")] == [f"tk-{new_spanish['uid']}"]
    assert len(world.notes("Tamkeen")) == 3, "the old Spanish card stays where it was"


def test_two_languages_cannot_share_a_deck(world):
    reply = world.client.post("/api/anki/sync/options", json={"decks": {"ar": "Same", "es": "same"}})
    assert reply.status_code == 400 and "share" in reply.json()["detail"]
    reply = world.client.post("/api/anki/sync/options", json={"decks": {"ar": "Mine", "es": "Mine::Spanish"}})
    assert reply.status_code == 400
    assert world.client.post("/api/anki/sync/options", json={"decks": {"es": "Spanish words"}}).json()["decks"][1] == \
        {"language": "es", "name": "Spanish words"}


def test_export_for_anki_uses_each_words_language_deck(world):
    import io
    import sqlite3
    import zipfile

    world.save("كتاب", "book")
    data = world.client.get("/api/vocab/export/apkg").content
    folder = world.folder / "unzipped"
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        z.extractall(folder)
    conn = sqlite3.connect(folder / "collection.anki2")
    decks = json.loads(conn.execute("select decks from col").fetchone()[0])
    conn.close()
    assert DECK in [d["name"] for d in decks.values()], "the same deck the sync uses"
