"""Pictures on the backs of flashcards (app/pictures.py, web/js/cardpicture.js): what may be kept, the computer's
routes, syncing the small JPEG files through Drive, and the Anki export."""

from __future__ import annotations

import io
import json
import sqlite3
import tempfile
import zipfile
from pathlib import Path

import pytest

from app import anki_deck, db, paths, pictures
from app.sync import engine

from test_sync import Device, FakeDrive

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200 + b"\xff\xd9"
OPENVERSE = {"v": "a1b2c3d4e5f6", "src": "openverse", "id": "dcef0b54-2338-4141-9be0-1b5bb50fa729", "title": "A dog",
             "by": "Jane Doe", "by_url": "https://www.flickr.com/photos/jane", "lic": "by", "lic_v": "2.0",
             "lic_url": "https://creativecommons.org/licenses/by/2.0/", "url": "https://www.flickr.com/photos/jane/1"}


# ---------------------------------------------------------------- what may be kept

def test_only_licences_that_allow_commercial_use_are_kept():
    for lic in ("cc0", "pdm", "by", "by-sa"):
        assert pictures.clean({**OPENVERSE, "lic": lic}) is not None, lic
    for lic in ("by-nc", "by-nd", "by-nc-sa", "by-nc-nd", "nc-sampling+", "sampling+", "", None):
        assert pictures.clean({**OPENVERSE, "lic": lic}) is None, f"{lic} (non-commercial or no derivatives) is never kept"


def test_bad_details_are_dropped():
    assert pictures.clean({"v": "a1b2c3d4", "src": "own"}) == {"v": "a1b2c3d4", "src": "own"}
    assert pictures.clean({"v": "../../x", "src": "own"}) is None, "the version is part of a file name"
    assert pictures.clean({"v": "a1b2c3d4", "src": "somewhere"}) is None
    assert pictures.clean({**OPENVERSE, "id": "../etc"}) is None
    assert pictures.clean("not json") is None and pictures.clean("") is None and pictures.clean(None) is None
    meta = pictures.clean({**OPENVERSE, "url": "javascript:alert(1)", "by": "  Jane \n Doe ", "extra": "x"})
    assert meta["url"] == "" and meta["by"] == "Jane Doe" and "extra" not in meta
    assert pictures.file_stem("bad uid!", meta) == "" and pictures.drive_name("w123", meta) == "p_w123_a1b2c3d4e5f6.jpg"


def test_the_text_another_device_wrote_is_kept_exactly():
    raw = json.dumps(pictures.clean(OPENVERSE), separators=(",", ":"))  # (as JSON.stringify writes it)
    assert pictures.stored(raw) == raw
    extra = json.dumps({**pictures.clean(OPENVERSE), "planted": "x"})
    assert pictures.stored(extra) == pictures.dumps(pictures.clean(OPENVERSE)), "a text with more in it is tidied"
    assert pictures.stored(json.dumps({**OPENVERSE, "lic": "by-nc"})) == ""


def test_credit_line():
    assert pictures.credit(pictures.clean(OPENVERSE)) == "Photo: Jane Doe · CC BY 2.0"
    assert pictures.credit(pictures.clean({**OPENVERSE, "lic": "cc0", "lic_v": "1.0"})) == "Photo: Jane Doe · CC0"
    assert pictures.credit(pictures.clean({**OPENVERSE, "lic": "pdm", "by": ""})) == "Photo: unknown · Public domain"
    assert pictures.credit({"v": "a1b2c3d4", "src": "own"}) == ""


# ---------------------------------------------------------------- the computer's routes

@pytest.fixture()
def client(fresh_db, tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    (tmp_path / "pictures").mkdir()
    monkeypatch.setattr(paths, "pictures_dir", lambda: tmp_path / "pictures")
    monkeypatch.setattr("app.sync.vocab_picture", lambda uid, meta: None)
    with TestClient(create_app(start_worker=False)) as c:
        c.tmp = tmp_path
        yield c


def test_put_show_change_and_remove_a_picture(client):
    word = client.post("/api/vocab", json={"text": "كلب", "meaning": "dog"}).json()
    assert word["picture"] == ""
    assert client.get(f"/api/vocab/{word['id']}/picture").status_code == 404

    meta = json.dumps(OPENVERSE, separators=(",", ":"))
    saved = client.put(f"/api/vocab/{word['id']}/picture", params={"meta": meta}, content=JPEG)
    assert saved.status_code == 200, saved.text
    assert json.loads(saved.json()["picture"])["lic"] == "by"
    got = client.get(f"/api/vocab/{word['id']}/picture")
    assert got.status_code == 200 and got.content == JPEG and got.headers["content-type"] == "image/jpeg"
    first = client.tmp / "pictures" / f"{word['uid']}_{OPENVERSE['v']}.jpg"
    assert first.exists()
    listed = next(v for v in client.get("/api/vocab").json() if v["id"] == word["id"])
    assert listed["picture"] == saved.json()["picture"], "the Vocab list carries the picture's details"

    # A new picture (the learner's own): the old file goes.
    own = json.dumps({"v": "0000aaaa1111", "src": "own"})
    assert client.put(f"/api/vocab/{word['id']}/picture", params={"meta": own}, content=JPEG).status_code == 200
    assert not first.exists() and (client.tmp / "pictures" / f"{word['uid']}_0000aaaa1111.jpg").exists()

    gone = client.delete(f"/api/vocab/{word['id']}/picture")
    assert gone.status_code == 200 and gone.json()["picture"] == ""
    assert not list((client.tmp / "pictures").glob("*.jpg"))
    assert client.get(f"/api/vocab/{word['id']}/picture").status_code == 404


def test_refused_pictures(client):
    word = client.post("/api/vocab", json={"text": "قط", "meaning": "cat"}).json()
    url = f"/api/vocab/{word['id']}/picture"
    nc = json.dumps({**OPENVERSE, "lic": "by-nc"})
    assert client.put(url, params={"meta": nc}, content=JPEG).status_code == 400, "a non-commercial licence is refused"
    ok = json.dumps(OPENVERSE)
    assert client.put(url, params={"meta": ok}, content=b"<html>not a picture</html>").status_code == 400
    assert client.put(url, params={"meta": ok}, content=JPEG + b"\x00" * pictures.MAX_BYTES).status_code == 400
    assert client.put(url, params={"meta": ok}, content=b"").status_code == 400
    assert client.put("/api/vocab/9999/picture", params={"meta": ok}, content=JPEG).status_code == 404


# ---------------------------------------------------------------- syncing

class PicDevice(Device):
    def __enter__(self):
        (self.dir / "pictures").mkdir(exist_ok=True)
        self.mp.setattr(paths, "pictures_dir", lambda: self.dir / "pictures")
        return super().__enter__()


def test_a_picture_travels_to_the_other_device_and_old_ones_are_let_go(tmp_path, monkeypatch):
    drive = FakeDrive()
    a, b = PicDevice(tmp_path, "a", monkeypatch), PicDevice(tmp_path, "b", monkeypatch)
    with a:
        with db.session() as conn:
            conn.execute("INSERT INTO vocab(uid, text, norm, meaning, created_at) VALUES('w1', 'كلب', 'كلب', 'dog', 1)")
            uid = conn.execute("SELECT uid FROM vocab").fetchone()[0]
            conn.execute("UPDATE vocab SET picture = ? WHERE uid = ?", (pictures.dumps(pictures.clean(OPENVERSE)), uid))
        (a.dir / "pictures" / f"{uid}_{OPENVERSE['v']}.jpg").write_bytes(JPEG)
    a.sync(drive)
    name = f"p_{uid}_{OPENVERSE['v']}.jpg"
    assert drive.by_name(name) is not None, "the picture is in Drive"
    b.sync(drive)
    assert (b.dir / "pictures" / f"{uid}_{OPENVERSE['v']}.jpg").read_bytes() == JPEG, "and on the other device, for offline use"
    with b:
        with db.session() as conn:
            assert pictures.clean(conn.execute("SELECT picture FROM vocab WHERE uid = ?", (uid,)).fetchone()[0])["by"] == "Jane Doe"

    # The other device changes the picture: the next syncs let the old file go, everywhere.
    with b:
        with db.session() as conn:
            conn.execute("UPDATE vocab SET picture = ? WHERE uid = ?", (json.dumps({"v": "bbbbcccc0000", "src": "own"}), uid))
        (b.dir / "pictures" / f"{uid}_bbbbcccc0000.jpg").write_bytes(JPEG + b"2")
    b.sync(drive)
    a.sync(drive)
    assert drive.by_name(name) is None, "the replaced picture left Drive"
    assert (a.dir / "pictures" / f"{uid}_bbbbcccc0000.jpg").read_bytes() == JPEG + b"2"


def test_an_older_app_without_pictures_keeps_the_picture(tmp_path, monkeypatch):
    with PicDevice(tmp_path, "a", monkeypatch):
        with db.session() as conn:
            conn.execute("INSERT INTO vocab(uid, text, norm, meaning, created_at) VALUES('w1', 'كلب', 'كلب', 'dog', 1)")
            row = dict(conn.execute("SELECT * FROM vocab").fetchone())
            conn.execute("UPDATE vocab SET picture = ? WHERE id = ?", (pictures.dumps(pictures.clean(OPENVERSE)), row["id"]))
        snap = engine.snapshot("a")
        word = next(v for v in snap["vocab"] if v["uid"] == row["uid"])
        assert word["picture"], "the library sent to Drive carries the picture"
        older = {**word, "meaning": "a dog", "updated_at": word["updated_at"] + 10}
        older.pop("picture")
        engine.merge({**snap, "vocab": [older]}, engine.Result())
        with db.session() as conn:
            kept = conn.execute("SELECT meaning, picture FROM vocab WHERE id = ?", (row["id"],)).fetchone()
        assert kept["meaning"] == "a dog" and pictures.clean(kept["picture"]) is not None
        planted = {**word, "picture": json.dumps({**OPENVERSE, "lic": "by-nd"}), "updated_at": word["updated_at"] + 20}
        engine.merge({**snap, "vocab": [planted]}, engine.Result())
        with db.session() as conn:
            assert conn.execute("SELECT picture FROM vocab WHERE id = ?", (row["id"],)).fetchone()[0] == "", \
                "a picture with a licence that isn't allowed doesn't come in"


# ---------------------------------------------------------------- Anki

def test_the_anki_deck_has_the_picture_and_its_credit():
    meta = pictures.clean(OPENVERSE)
    word = {"uid": "w1", "text": "كلب", "meaning": "dog", "sentence": "", "translation": "", "notes": "", "memo": "",
            "created_at": 1, "start": None, "end": None, "sent_start": None, "sent_end": None, "picture": pictures.dumps(meta)}
    bare = {**word, "uid": "w2", "picture": ""}
    deck = anki_deck.build([word, bare], {}, now=1_800_000_000, pictures={"w1": JPEG})
    z = zipfile.ZipFile(io.BytesIO(deck))
    index = json.loads(z.read("media"))
    name = pictures.anki_name("w1", meta)
    assert name == f"tk-w1-p-{meta['v']}.jpg" and name in index.values()
    number = next(k for k, v in index.items() if v == name)
    assert z.read(number) == JPEG
    data = z.read("collection.anki2")
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "c.anki2"
        f.write_bytes(data)
        conn = sqlite3.connect(f)
        rows = {guid: flds.split("\x1f") for guid, flds in conn.execute("SELECT guid, flds FROM notes")}
        conn.close()
    image = next(v for g, v in rows.items() if "w1" in g)[2]
    assert image.startswith(f'<img src="{name}">') and "Photo: Jane Doe · CC BY 2.0" in image and OPENVERSE["url"] in image
    assert next(v for g, v in rows.items() if "w2" in g)[2] == "", "a card without a picture leaves the field empty"
