"""Seen words (kept by dictionary form) and the dictionaries that find a word's dictionary form."""

from __future__ import annotations

import gzip
import hashlib
import json

import pytest

from app import db, lexicon
from app.sync import engine

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)

WROTE = {"key": "ar|كتب|v", "lemma": "كَتَب", "pos": "verb", "root": "ك.ت.ب"}
BOOK = {"key": "ar|كتاب|n", "lemma": "كِتاب", "pos": "noun", "root": "ك.ت.ب"}


@pytest.fixture()
def client(fresh_db, tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setattr(lexicon, "lexicon_dir", lambda: _dir(tmp_path / "lexicon"))
    with TestClient(create_app(start_worker=False)) as c:
        yield c


def _dir(path):
    path.mkdir(parents=True, exist_ok=True)
    return path


# ----- seen words -----

def test_marking_words_seen_and_new_again(client):
    assert client.get("/api/lexemes").json() == {"keys": []}
    assert client.post("/api/lexemes", json={"items": [WROTE, BOOK]}).json() == {"added": 2}
    assert client.post("/api/lexemes", json={"items": [WROTE]}).json() == {"added": 0}, "already seen: nothing to do"
    assert sorted(client.get("/api/lexemes").json()["keys"]) == sorted([WROTE["key"], BOOK["key"]])
    with db.session() as conn:
        row = conn.execute("SELECT * FROM known_lexemes WHERE key = ?", (WROTE["key"],)).fetchone()
    # What is kept is the dictionary form and its part of speech, never the spelling that was tapped.
    assert (row["lang"], row["lemma"], row["pos"], row["root"]) == ("ar", "كَتَب", "verb", "ك.ت.ب")
    assert client.post("/api/lexemes/forget", json={"keys": [WROTE["key"], "ar|nothere|n"]}).json() == {"forgotten": 1}
    assert client.get("/api/lexemes").json() == {"keys": [BOOK["key"]]}
    assert client.post("/api/lexemes", json={"items": [WROTE]}).json() == {"added": 1}, "seen again after being forgotten"


def test_rejects_keys_that_are_not_lexemes(client):
    r = client.post("/api/lexemes", json={"items": [{"key": "كتب"}, {"key": "ar|" + "x" * 300 + "|n"}, {"key": " es|hola|x "}]})
    assert r.json() == {"added": 1}
    assert client.get("/api/lexemes").json() == {"keys": ["es|hola|x"]}


def test_earlier_lookups_are_listed_for_the_first_count(client):
    with db.session() as conn:
        conn.execute("INSERT INTO definitions(key, word, sentence, data, created_at) VALUES('k1','كتب','في ⟦كتب⟧ كثيرة','{}',3)")
    assert client.get("/api/lexemes/lookups").json() == [{"word": "كتب", "sentence": "في ⟦كتب⟧ كثيرة"}]


def test_seen_words_travel_between_devices(world):
    drive, a, b = world
    with a, db.session() as conn:
        conn.execute("INSERT INTO known_lexemes(key, lang, lemma, pos, root, created_at, updated_at) "
                     "VALUES('ar|كتب|v','ar','كَتَب','verb','ك.ت.ب',10,10)")
    a.sync(drive)
    r = b.sync(drive)
    assert r.merged["lexemes"] == 1 and not r.library_uploaded
    with b, db.session() as conn:
        row = conn.execute("SELECT lemma, deleted FROM known_lexemes WHERE key = 'ar|كتب|v'").fetchone()
        assert (row["lemma"], row["deleted"]) == ("كَتَب", 0)
        # B says the word is new again; the newer change wins on A too.
        conn.execute("UPDATE known_lexemes SET deleted = 1, updated_at = 20 WHERE key = 'ar|كتب|v'")
    assert b.sync(drive).library_uploaded
    a.sync(drive)
    with a, db.session() as conn:
        assert conn.execute("SELECT deleted FROM known_lexemes WHERE key = 'ar|كتب|v'").fetchone()[0] == 1
    assert not a.sync(drive).library_uploaded, "settled: nothing more to send"


def test_a_library_from_an_older_version_has_no_seen_words(world):
    drive, a, _ = world
    a.sync(drive)
    remote = engine._ungz(drive.by_name("library.json.gz")["data"])
    older = {k: v for k, v in remote.items() if k != "lexemes"}
    assert engine._content(older) == engine._content(remote), "no upload just because the list is missing"
    with a:
        assert engine.merge(older, engine.Result()) == []


# ----- dictionaries -----

def _fake_source(tmp_path, monkeypatch):
    src = _dir(tmp_path / "published")
    files = {}
    for name in lexicon.LANGUAGES["ar"]:
        blob = gzip.compress(json.dumps({"format": 1, "name": name}).encode(), mtime=0)
        (src / f"ar-{name}.json.gz").write_bytes(blob)
        files[name] = {"file": f"ar-{name}.json.gz", "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
                       "title": name.upper(), "license": "test"}
    (src / "index.json").write_text(json.dumps({"format": 1, "files": files}), encoding="utf-8")
    monkeypatch.setattr(lexicon, "_source_dir", lambda: src)
    return src


def test_dictionaries_are_only_there_once_downloaded(client, tmp_path, monkeypatch):
    src = _fake_source(tmp_path, monkeypatch)
    st = client.get("/api/lexicon/status?lang=ar").json()
    assert st["needed"] and not st["installed"] and st["names"] == ["msa", "egy", "lev", "glf"] and st["bytes"] > 0
    assert client.get("/api/lexicon/data/msa").status_code == 404
    st = client.post("/api/lexicon/download", json={"lang": "ar"}).json()
    assert st["installed"] and all(f["installed"] for f in st["files"].values())
    r = client.get("/api/lexicon/data/egy")
    assert r.status_code == 200 and r.json() == {"format": 1, "name": "egy"}, "sent gzipped, read as plain JSON"
    assert client.get("/api/lexicon/data/..%2F..%2Flibrary").status_code == 404
    assert not client.post("/api/lexicon/remove", json={"lang": "ar"}).json()["installed"]
    # A file that doesn't match its published checksum is refused.
    (src / "ar-lev.json.gz").write_bytes(b"damaged")
    r = client.post("/api/lexicon/download", json={"lang": "ar"})
    assert r.status_code == 502 and "damaged" in r.json()["detail"]
    assert not client.get("/api/lexicon/status?lang=ar").json()["installed"]


def test_languages_without_dictionaries_need_none(client):
    st = client.get("/api/lexicon/status?lang=xx").json()  # (every taught language has one now)
    assert st == {"lang": "xx", "kind": "words", "needed": False, "names": [], "installed": False, "bytes": 0, "files": {}}
    # Spanish, French, Italian and Russian have one table of word forms each.
    for lang in ("es", "fr", "it", "ru"):
        st = client.get(f"/api/lexicon/status?lang={lang}").json()
        assert st["needed"] and st["names"] == [lang] and not st["installed"]


def test_the_published_dictionaries_match_their_index():
    """docs/lexicon/ is what the apps download: every file must be the one the index describes."""
    from pathlib import Path

    folder = Path(__file__).resolve().parent.parent / "docs" / "lexicon"
    index = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    assert sorted(index["files"]) == sorted(lexicon.FILES)
    assert all(index["files"][name]["file"] == lexicon.FILES[name] for name in lexicon.FILES)
    for meta in index["files"].values():
        blob = (folder / meta["file"]).read_bytes()
        assert len(blob) == meta["bytes"] and hashlib.sha256(blob).hexdigest() == meta["sha256"]
        if meta["file"].endswith(".bin.gz"):  # the Japanese dictionary: binary, see web/js/lexicon/kuromoji.js
            assert gzip.decompress(blob)[:4] == b"TKJA"
        else:
            assert json.loads(gzip.decompress(blob))["format"] == 1


def test_japanese_and_chinese_dictionaries(client):
    """Japanese and Chinese download one dictionary each (from the repository's own copy here);
    the Japanese one is binary and is sent as bytes."""
    for lang, name in (("ja", "ja"), ("zh", "zh")):
        st = client.get(f"/api/lexicon/status?lang={lang}").json()
        assert st["needed"] and st["names"] == [name] and not st["installed"] and st["bytes"] > 1_000_000
    assert client.post("/api/lexicon/download", json={"lang": "ja"}).json()["installed"]
    r = client.get("/api/lexicon/data/ja")
    assert r.status_code == 200 and r.headers["content-type"] == "application/octet-stream"
    assert r.content[:4] == b"TKJA", "sent gzipped, arrives unpacked"
    assert client.post("/api/lexicon/download", json={"lang": "zh"}).json()["installed"]
    data = client.get("/api/lexicon/data/zh").json()
    assert data["kind"] == "zh" and data["words"]["学习"][0] == "xue2 xi2" and data["t2s"]["學"] == "学"


def test_thai_reading_table(client):
    """Thai downloads one small table of how its words are said (tools/build_thai_readings.py)."""
    st = client.get("/api/lexicon/status?lang=th").json()
    assert st["needed"] and st["names"] == ["th"] and not st["installed"] and 50_000 < st["bytes"] < 1_000_000
    assert client.post("/api/lexicon/download", json={"lang": "th"}).json()["installed"]
    data = client.get("/api/lexicon/data/th").json()
    assert data["kind"] == "th" and data["words"]["สวัสดี"] == "sà-wàt-dii" and "ประวัติ" in data["nojoin"]
    assert not client.post("/api/lexicon/remove", json={"lang": "th"}).json()["installed"]


def test_word_meanings_for_no_ai_are_a_separate_download(client):
    """No AI (Settings): each language's meanings file is downloaded on its own (kind=meanings)."""
    st = client.get("/api/lexicon/status?lang=es&kind=meanings").json()
    assert st["kind"] == "meanings" and st["names"] == ["mean-es"] and not st["installed"]
    words = client.get("/api/lexicon/status?lang=es").json()
    assert words["names"] == ["es"]  # the word tables are their own download
    st = client.post("/api/lexicon/download", json={"lang": "tl", "kind": "meanings"}).json()
    assert st["installed"] and st["names"] == ["mean-tl"]
    data = client.get("/api/lexicon/data/mean-tl").json()
    assert data["kind"] == "meanings" and "bahay" in data["words"]
    assert client.post("/api/lexicon/remove", json={"lang": "tl", "kind": "meanings"}).json()["installed"] is False

