"""Words marked important (web/js/review/deck.js plan puts them first): saved on the computer, synced, and kept
when a device with an older version (which knows no important mark) edits the word."""

from __future__ import annotations

import time

from app import db
from app.sync import engine

from test_sync import world  # noqa: F401  (the two devices and the fake Drive)


def test_marking_a_word_important_saves_and_bumps_it_for_sync(world):  # noqa: F811
    drive, a, b = world
    with a:
        from app.api import vocab

        with db.session() as conn:
            vid = conn.execute("SELECT id FROM vocab WHERE uid='vword1'").fetchone()[0]
            before = conn.execute("SELECT updated_at FROM vocab WHERE id=?", (vid,)).fetchone()[0]
        time.sleep(0.01)
        out = vocab.update_vocab(vid, vocab.VocabPatch(important=True))
        assert out["important"] == 1
        with db.session() as conn:
            assert conn.execute("SELECT updated_at FROM vocab WHERE id=?", (vid,)).fetchone()[0] != before
        assert vocab.update_vocab(vid, vocab.VocabPatch(important=False))["important"] == 0
        assert vocab.update_vocab(vid, vocab.VocabPatch(meaning="book"))["important"] == 0, "left alone when not sent"


def test_important_syncs_and_survives_a_device_that_does_not_know_it(world):  # noqa: F811
    drive, a, b = world
    a.sync(drive)
    b.sync(drive)
    with b:
        with db.session() as conn:
            conn.execute("UPDATE vocab SET important=1 WHERE uid='vword1'")
    b.sync(drive)
    a.sync(drive)
    with a:
        with db.session() as conn:
            assert conn.execute("SELECT important FROM vocab WHERE uid='vword1'").fetchone()[0] == 1

    # A device with an older version edits the word and uploads it without the mark: the mark stays.
    library = drive.by_name("library.json.gz")
    lib = engine._ungz(library["data"])
    (word,) = lib["vocab"]
    assert word["important"] == 1
    del word["important"]
    word.update(meaning="a book", updated_at=time.time() + 60)
    lib["vocab"].append({**word, "uid": "vold", "text": "قلم"})
    drive.upload("library.json.gz", engine._gz(lib), "application/gzip", library["id"])
    a.sync(drive)
    with a:
        with db.session() as conn:
            rows = {r["uid"]: (r["meaning"], r["important"]) for r in conn.execute("SELECT * FROM vocab")}
    assert rows == {"vword1": ("a book", 1), "vold": ("a book", 0)}


def test_a_word_saved_from_the_popup_keeps_its_folder_and_important_mark(world):  # noqa: F811
    """The word popup's folder button and its ! (web/js/components/wordbubble.js): POST /vocab with folders and
    important. A folder that doesn't exist is left out."""
    drive, a, b = world
    with a:
        from app.api import vocab

        folder = vocab.add_folder(vocab.FolderIn(name="Food"))
        out = vocab.add_vocab(vocab.VocabIn(text="mantequilla", meaning="butter", language="es",
                                            folders=[folder["uid"], "dnotthere"], important=True))
        assert out["folders"] == [folder["uid"]]
        assert out["important"] == 1
        plain = vocab.add_vocab(vocab.VocabIn(text="leche", meaning="milk", language="es"))
        assert plain["folders"] == [] and not plain["important"]
