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
    assert st == {"lang": "xx", "kind": "words", "needed": False, "names": [], "installed": False, "bytes": 0, "files": {}, "stale": []}
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
        elif meta["file"].startswith("ocr-"):  # reading text in photos (tests/test_scan_words.py)
            assert len(gzip.decompress(blob)) > 500_000
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


def test_german_word_table_and_meanings(client):
    """German downloads a table of forms that keeps capitals and today's spelling (tools/build_lemmas.py),
    and a meanings file keyed with ß as ss (tools/build_meanings.py)."""
    st = client.get("/api/lexicon/status?lang=de").json()
    assert st["needed"] and st["names"] == ["de"] and not st["installed"] and 500_000 < st["bytes"] < 3_000_000
    assert client.post("/api/lexicon/download", json={"lang": "de"}).json()["installed"]
    data = client.get("/api/lexicon/data/de").json()
    lemma = lambda form: data["lemmas"][data["forms"][form]]  # noqa: E731
    assert data["kind"] == "lemmas" and data["ranked"] and "zeit" in data["caps_first"]
    assert lemma("Häuser") == "Haus" and lemma("musste") == "müssen" and lemma("mußte") == "müssen"
    assert lemma("Strasse") == "Straße" and lemma("daß") == "dass" and "anfangen" in data["lemmas"]
    st = client.post("/api/lexicon/download", json={"lang": "de", "kind": "meanings"}).json()
    assert st["installed"] and st["names"] == ["mean-de"]
    meanings = client.get("/api/lexicon/data/mean-de").json()
    assert {"strasse", "dass", "anfangen"} <= set(meanings["words"]) and "straße" not in meanings["words"]


def test_hindi_word_table_and_meanings(client):
    """Hindi downloads one table of word forms, with Wiktionary's readings where the app's rule differs
    (tools/build_hindi.py), and its meanings on their own (tools/build_meanings.py)."""
    st = client.get("/api/lexicon/status?lang=hi").json()
    assert st["needed"] and st["names"] == ["hi"] and not st["installed"] and 100_000 < st["bytes"] < 2_000_000
    assert client.post("/api/lexicon/download", json={"lang": "hi"}).json()["installed"]
    data = client.get("/api/lexicon/data/hi").json()
    assert data["kind"] == "lemmas" and data["lang"] == "hi" and len(data["lemmas"]) > 15_000
    assert data["lemmas"][data["forms"]["लड़कों"]] == "लड़का" and data["lemmas"][data["forms"]["किया"]] == "करना"
    assert "पानी" not in data["forms"] and "पिता" not in data["forms"], "words of their own stay themselves"
    assert len(data["readings"]) > 5000
    st = client.get("/api/lexicon/status?lang=hi&kind=meanings").json()
    assert st["names"] == ["mean-hi"] and not st["installed"]


def test_korean_word_table_and_meanings(client):
    """Korean downloads a list of dictionary words with their verb stems (tools/build_korean_words.mjs), and
    for No AI its Wiktionary meanings, with each Sino-Korean word's Hanja."""
    st = client.get("/api/lexicon/status?lang=ko").json()
    assert st["needed"] and st["names"] == ["ko"] and not st["installed"] and 100_000 < st["bytes"] < 1_000_000
    assert client.post("/api/lexicon/download", json={"lang": "ko"}).json()["installed"]
    data = client.get("/api/lexicon/data/ko").json()
    assert data["kind"] == "ko" and data["lemmas"][:2] == ["하다", "있다"] and data["preds"]["듣다"] == "들어|들으"
    assert len(data["pos"]) == len(data["lemmas"])
    meanings = client.get("/api/lexicon/status?lang=ko&kind=meanings").json()
    assert meanings["names"] == ["mean-ko"]
    assert client.post("/api/lexicon/download", json={"lang": "ko", "kind": "meanings"}).json()["installed"]
    words = client.get("/api/lexicon/data/mean-ko").json()["words"]
    assert "school" in words["학교"][0][2][0] and words["학교"][0][3].split("|")[0] == "學校"
    assert words["우리"][0][2][0].startswith("we"), "the everyday meaning first"


def test_latin_word_table_and_meanings(client):
    """Latin downloads a table of every form Wiktionary lists (tools/build_latin.py), keyed without macrons, j as i
    and v as u, with each dictionary form written with its macrons; and for No AI its Wiktionary meanings."""
    st = client.get("/api/lexicon/status?lang=la").json()
    assert st["needed"] and st["names"] == ["la"] and not st["installed"] and 1_000_000 < st["bytes"] < 6_000_000
    assert client.post("/api/lexicon/download", json={"lang": "la"}).json()["installed"]
    data = client.get("/api/lexicon/data/la").json()
    assert data["kind"] == "lemmas" and data["lang"] == "la" and data["ranked"] and data["lemmas"][0] == "sum"
    form = lambda key: data["lemmas"][data["forms"][key]]  # noqa: E731
    assert form("puellarum") == "puella" and form("amauisset") == "amō" and form("est") == "sum" and form("uiri") == "vir"
    meanings = client.get("/api/lexicon/status?lang=la&kind=meanings").json()
    assert meanings["names"] == ["mean-la"]
    assert client.post("/api/lexicon/download", json={"lang": "la", "kind": "meanings"}).json()["installed"]
    m = client.get("/api/lexicon/data/mean-la").json()
    assert m["words"]["amo"][0][0] == "amō" and m["words"]["amo"][0][2][0].startswith("to love")
    assert ["amo", "amāvit: third-person singular perfect active indicative of amō"] in m["forms"]["amauit"]


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



def test_example_sentences_and_keywords_are_their_own_downloads(client):
    """No AI key: "Add words" finds example sentences and the Mnemonic maker its English keywords in files of
    their own (tools/build_examples.py), downloaded the first time they are needed (web/js/examples.js)."""
    st = client.get("/api/lexicon/status?lang=es&kind=examples").json()
    assert st["names"] == ["ex-es"] and not st["installed"]
    assert client.get("/api/lexicon/status?lang=en&kind=examples").json()["needed"] is False  # (no English examples)
    st = client.post("/api/lexicon/download", json={"lang": "ceb", "kind": "examples"}).json()
    assert st["installed"]
    data = client.get("/api/lexicon/data/ex-ceb").json()
    assert data["kind"] == "examples" and any("balay" in s[0] for s in data["sentences"])
    assert all(len(s) == 3 and s[2][0] in "twdcb" for s in data["sentences"])  # each says where it is from (d: Wolff)
    assert any(s[2] == "d" for s in data["sentences"]), "Bisaya: Wolff's example sentences"
    # (b: the Basics course's own sentence for each of its words, and which word each form is: tools/enrich_examples.mjs)
    assert sum(s[2] == "b" for s in data["sentences"]) > 900 and data["forms"]
    kw = client.post("/api/lexicon/download", json={"lang": "en", "kind": "keywords"}).json()
    assert kw["installed"] and kw["names"] == ["kw-en"]
    words = client.get("/api/lexicon/data/kw-en").json()["words"]
    assert ["pot", "ˈpɑt", "n", "artifact"] == next(w for w in words if w[0] == "pot")[:4]


def test_keywords_in_the_app_languages_are_their_own_downloads(client):
    """The free Mnemonic maker's keywords in an app language other than English (kind "keywords", lang = it)."""
    for lang in ("es", "fr", "de", "it", "pt", "ru", "ca"):
        assert client.get(f"/api/lexicon/status?lang={lang}&kind=keywords").json()["names"] == [f"kw-{lang}"]
    assert client.post("/api/lexicon/download", json={"lang": "it", "kind": "keywords"}).json()["installed"]
    data = client.get("/api/lexicon/data/kw-it").json()
    assert data["lang"] == "it" and any(w[0] == "gatta" for w in data["words"])


def test_a_newer_published_file_replaces_the_downloaded_one(tmp_path, monkeypatch):
    """An installed app (not run from source) fetches a file again when the published list gives it another
    checksum: in the background, after looking at the list again a day later; the old copy works until then."""
    import time

    monkeypatch.setattr(lexicon, "lexicon_dir", lambda: _dir(tmp_path / "lexicon"))
    monkeypatch.setattr(lexicon, "_source_dir", lambda: None)
    site: dict[str, bytes] = {}

    def publish(text: str) -> None:
        blob = text.encode()
        site["ceb-examples.json.gz"] = blob
        site["index.json"] = json.dumps({"files": {"ex-ceb": {"file": "ceb-examples.json.gz", "bytes": len(blob),
                                                             "sha256": hashlib.sha256(blob).hexdigest()}}}).encode()

    monkeypatch.setattr(lexicon, "_fetch", lambda name: site[name])
    started: list[tuple[str, str]] = []
    publish("v1")
    assert lexicon.download("ceb", "examples")["installed"]
    assert lexicon.file_path("ex-ceb").read_bytes() == b"v1"
    assert lexicon.status("ceb", "examples", update=False)["stale"] == []

    publish("v2")
    real = lexicon.update_in_background
    monkeypatch.setattr(lexicon, "update_in_background", lambda lang, kind: started.append((lang, kind)))
    st = lexicon.status("ceb", "examples")
    assert st["installed"] and started == [("ceb", "examples")], "the old copy works; an update is started"
    # The list here is a day old: looked at again, the newer file is found and fetched.
    old = time.time() - 2 * lexicon.INDEX_MAX_AGE
    import os
    os.utime(lexicon.lexicon_dir() / "index.json", (old, old))
    monkeypatch.setattr(lexicon, "update_in_background", real)
    lexicon.update_in_background("ceb", "examples")
    for _ in range(200):
        if lexicon.file_path("ex-ceb").read_bytes() == b"v2":
            break
        time.sleep(0.01)
    assert lexicon.file_path("ex-ceb").read_bytes() == b"v2"
    assert lexicon.status("ceb", "examples", update=False)["stale"] == []
    # A file downloaded before checksums were kept: worked out once, then it's up to date.
    (lexicon.lexicon_dir() / "installed.json").unlink()
    assert lexicon.status("ceb", "examples", update=False)["stale"] == []
