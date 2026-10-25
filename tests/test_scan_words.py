"""'Add words' → Scan: the files that read the text in a photo on the device (Tesseract and each language's
trained data), downloaded once with the dictionaries (app/lexicon.py kinds "ocr" and "ocr-plain")."""

from __future__ import annotations

import gzip
import hashlib
import json
import re
from pathlib import Path

import pytest

from app import lexicon

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture()
def client(fresh_db, tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    folder = tmp_path / "lexicon"
    folder.mkdir()
    monkeypatch.setattr(lexicon, "lexicon_dir", lambda: folder)
    with TestClient(create_app(start_worker=False)) as c:
        yield c


def _js_ocr_langs() -> dict[str, tuple[str, ...]]:
    """web/js/scanwords.js OCR_LANGS, read from the file."""
    src = (ROOT / "web" / "js" / "scanwords.js").read_text(encoding="utf-8")
    body = re.search(r"export const OCR_LANGS = \{(.*?)\};", src, re.S).group(1)
    return {code: tuple(re.findall(r'"(\w+)"', names)) for code, names in re.findall(r"(\w+): \[([^\]]*)\]", body)}


def test_the_phone_and_the_computer_name_the_same_files():
    assert _js_ocr_langs() == lexicon.OCR_LANGS
    # Every language Tamkeen teaches can be read on the device (English too).
    for code in ("ar", "es", "fr", "ja", "zh", "ru", "it", "tl", "pt", "ca", "ceb", "th", "de", "fa", "hi", "ko", "en"):
        assert lexicon.OCR_LANGS[code], code


def test_names_for_a_study_language_and_the_learners_own():
    assert lexicon.names_for("es+en", "ocr") == ("ocr-core", "ocr-spa", "ocr-eng")
    assert lexicon.names_for("es en", "ocr") == ("ocr-core", "ocr-spa", "ocr-eng"), "a + read from a web address is a space"
    assert lexicon.names_for("en+en", "ocr") == ("ocr-core", "ocr-eng")
    assert lexicon.names_for("zh+en", "ocr-plain") == ("ocr-core-plain", "ocr-chi_sim", "ocr-chi_tra", "ocr-eng")
    assert lexicon.names_for("xx", "ocr") == ()
    assert lexicon.names_for("es", "words") == ("es",), "the dictionaries are as before"


def test_status_download_and_the_files_as_bytes(client):
    st = client.get("/api/lexicon/status", params={"lang": "es+en", "kind": "ocr"}).json()
    assert st["needed"] and not st["installed"] and st["names"] == ["ocr-core", "ocr-spa", "ocr-eng"]
    index = json.loads((ROOT / "docs" / "lexicon" / "index.json").read_text(encoding="utf-8"))
    assert st["bytes"] == sum(index["files"][n]["bytes"] for n in st["names"]), "the size said before downloading"
    assert client.get("/api/lexicon/data/ocr-spa").status_code == 404
    st = client.post("/api/lexicon/download", json={"lang": "es+en", "kind": "ocr"}).json()
    assert st["installed"]
    # Arabic now needs only its own data: Tesseract and the English are here already.
    ar = client.get("/api/lexicon/status", params={"lang": "ar+en", "kind": "ocr"}).json()
    assert not ar["installed"] and [n for n, f in ar["files"].items() if not f["installed"]] == ["ocr-ara"]
    r = client.get("/api/lexicon/data/ocr-core")
    assert r.status_code == 200 and r.headers["content-type"] == "application/octet-stream"
    assert r.content.startswith(b"var TesseractCore"), "sent gzipped, arrives unpacked: the program itself"
    r = client.get("/api/lexicon/data/ocr-spa")
    assert r.status_code == 200 and len(r.content) > 1_000_000
    assert client.post("/api/lexicon/remove", json={"lang": "es+en", "kind": "ocr"}).json()["installed"] is False


def test_the_published_files_are_tesseracts():
    folder = ROOT / "docs" / "lexicon"
    index = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    names = {n for codes in lexicon.OCR_LANGS.values() for n in (f"ocr-{c}" for c in codes)} | {"ocr-core", "ocr-core-plain"}
    for name in names:
        meta = index["files"][name]
        assert meta["file"] == lexicon.FILES[name] and meta["license"] == "Apache-2.0", name
        blob = (folder / meta["file"]).read_bytes()
        assert hashlib.sha256(blob).hexdigest() == meta["sha256"], name
    core = gzip.decompress((folder / lexicon.FILES["ocr-core"]).read_bytes())
    assert core.startswith(b"var TesseractCore") and b"wasm" in core[:100_000]
    # The part that runs the reader is part of the app (web/js/vendor/tesseract), with its licence.
    vendor = ROOT / "web" / "js" / "vendor" / "tesseract"
    for f in ("tesseract.esm.min.js", "worker.min.js", "LICENSE.md"):
        assert (vendor / f).exists(), f
    assert "tesseract.txt" in (ROOT / "licenses" / "index.json").read_text(encoding="utf-8")
