"""Books (app/books.py): stored like a web page, in "My books", read a page at a time."""

import json

import pytest

from app import books, db


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_a_book_is_stored_with_its_headings_and_paragraphs(client):
    blocks = [{"kind": "h2", "text": "Capítulo I"}, {"kind": "p", "text": "En un lugar de la Mancha, de cuyo nombre no quiero acordarme."},
              {"kind": "p", "text": "  "}, {"kind": "weird", "text": "Otro párrafo."}]
    r = client.post("/api/books", json={"guid": "book:es/quijote", "title": "Don Quijote", "author": "Miguel de Cervantes",
                                        "lang": "es", "blocks": blocks, "source": "Project Gutenberg #2000"})
    assert r.status_code == 200, r.text
    ep = r.json()
    assert ep["audio_type"] == "text/book" and ep["description"] == "Miguel de Cervantes" and ep["language"] == "es"
    assert ep["words"] == 2 + 12 + 2
    with db.session() as conn:
        kinds = [row["kind"] for row in conn.execute("SELECT kind FROM segments WHERE episode_id = ? ORDER BY idx", (ep["id"],))]
        feed = conn.execute("SELECT url, title FROM feeds WHERE id = ?", (ep["feed_id"],)).fetchone()
    assert kinds == ["h2", "p", "p"]
    assert (feed["url"], feed["title"]) == ("local:books", "My books")
    # Adding the same book again replaces it rather than making a second copy.
    again = client.post("/api/books", json={"guid": "book:es/quijote", "title": "Don Quijote", "lang": "es",
                                            "blocks": [{"kind": "p", "text": "Solo esto."}]}).json()
    assert again["id"] == ep["id"] and again["words"] == 2


def test_an_uploaded_book_finds_its_language_and_odd_requests_are_refused(client):
    # Without a language, a book in Latin letters counts as the language being studied; Cyrillic is Russian.
    client.patch("/api/settings", json={"study_language": "fr"})
    ep = client.post("/api/books", json={"guid": "file:cafe.txt:123", "title": "Le café",
                                         "blocks": [{"kind": "p", "text": "Le café est une boisson très populaire dans le monde entier."}]}).json()
    assert ep["language"] == "fr"
    ru = client.post("/api/books", json={"guid": "file:mumu.txt:9", "title": "Муму",
                                         "blocks": [{"kind": "p", "text": "В одной из отдаленных улиц Москвы жила барыня."}]}).json()
    assert ru["language"] == "ru"
    assert client.post("/api/books", json={"guid": "https://example.com", "blocks": [{"text": "x"}]}).status_code == 400
    assert client.post("/api/books", json={"guid": "file:empty.txt:1", "blocks": [{"text": "   "}]}).status_code == 400


def test_the_free_shelf_matches_its_index():
    """docs/books is what the apps download: every listed book must be there, as described."""
    import gzip
    import hashlib
    from pathlib import Path

    folder = Path(__file__).resolve().parent.parent / "docs" / "books"
    index = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    for lang in ("ar", "es", "fr", "it", "ru", "en", "tl", "ja", "zh"):
        shelf = index["books"][lang]
        assert len(shelf) >= 5, lang
        for row in shelf:
            blob = (folder / row["file"]).read_bytes()
            assert len(blob) == row["bytes"] and hashlib.sha256(blob).hexdigest() == row["sha256"]
            data = json.loads(gzip.decompress(blob))
            assert data["format"] == 1 and data["lang"] == lang and data["blocks"]
            assert all(b["kind"] in books.KINDS for b in data["blocks"])
