"""Books (app/books.py): stored like a web page, in "My books", read a page at a time."""

import json
import re

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


def test_a_book_keeps_heading_levels_lists_quotes_and_bold(client):
    blocks = [{"kind": "h1", "text": "Parte primera"}, {"kind": "h3", "text": "1"},
              {"kind": "p", "text": "Una frase con palabras importantes.", "marks": [[3, 4, 1]]},
              {"kind": "li", "text": "Un punto"}, {"kind": "q", "text": "Una cita", "marks": [[0, 1, 2]]}]
    ep = client.post("/api/books", json={"guid": "file:libro.docx:123", "title": "Libro", "lang": "es", "blocks": blocks}).json()
    with db.session() as conn:
        kinds = [row["kind"] for row in conn.execute("SELECT kind FROM segments WHERE episode_id = ? ORDER BY idx", (ep["id"],))]
    assert kinds == ["h1", "h3", "p|b3-4", "li", "q|i0-1"]


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
    for lang in ("ar", "es", "fr", "it", "ru", "en", "tl", "ja", "zh", "pt", "ca", "th", "ceb", "de", "hi", "ko", "la"):
        shelf = index["books"][lang]
        assert len(shelf) >= 5, lang
        for row in shelf:
            blob = (folder / row["file"]).read_bytes()
            assert len(blob) == row["bytes"] and hashlib.sha256(blob).hexdigest() == row["sha256"]
            data = json.loads(gzip.decompress(blob))
            assert data["format"] == 1 and data["lang"] == lang and data["blocks"]
            assert all(b["kind"] in books.KINDS for b in data["blocks"])
            # Nothing of the source's own wrapping is left in the text: its licence, its transcriber's notes.
            text = "\n".join(b["text"] for b in data["blocks"])
            assert "Project Gutenberg" not in text and "gutenberg.org" not in text, row["file"]
            # (Korean Wikisource: its licence box, and the poems' first printing in letters no longer used)
            assert "퍼블릭 도메인" not in text and "Public domain" not in text, row["file"]
            assert not re.search("[ᄀ-ᇿꥠ-꥿ힰ-퟿]", text), row["file"]
            if lang == "la":
                # Latin: no printed line or page numbers ("amoris.  45", "{186}", "[23,7]"), pictures' captions or
                # editors' notes; long vowels as macrons, not as the acute accents of Fabulae Faciles.
                assert not any(re.search(r"\s\d{1,4}$", b["text"]) for b in data["blocks"] if b["kind"] == "p"), row["file"]
                assert not re.search(r"\{\d+\}|\[\d+(,\d+)?\]|\[Image|Sidenote| \\ ", text), row["file"]
                assert len(re.findall(r"\b(the|and|which)\b", text)) <= 3, row["file"]  # (a ship's English name in a novel)
    latin = {row["id"]: row for row in index["books"]["la"]}
    assert len(latin) >= 10 and "puer-romanus" not in latin  # (Appleton and Jones's: not free in Britain)
    faciles = json.loads(gzip.decompress((folder / latin["fabulae-faciles"]["file"]).read_bytes()))["blocks"]
    assert "Haec nārrantur ā poētīs dē Perseō." in faciles[2]["text"] and not re.search("[áéíóú]", json.dumps(faciles, ensure_ascii=False))
    # A poem keeps a line of verse to a block, and its lines don't turn into headings ("parte tamen meliore mei…").
    ovid = json.loads(gzip.decompress((folder / latin["metamorphoses"]["file"]).read_bytes()))["blocks"]
    assert ovid[1] == {"kind": "p", "text": "In nova fert animus mūtātās dīcere fōrmās"}
    assert [b["text"] for b in ovid if b["kind"] == "h2"] == [f"Liber {n}" for n in "I II III IV V VI VII VIII IX X XI XII XIII XIV XV".split()]


def test_the_shelf_builder_tidies_a_book():
    """tools/build_books.py: a heading said twice becomes one, a chapter number takes the name on the
    line after it, and what comes after "FIN" (the publisher's list of books) and the end notes go."""
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
    import build_books as bb

    prose = "Era una noche oscura y tormentosa, y el viento soplaba entre los árboles del camino viejo. " * 3
    blocks = [{"kind": "h2", "text": "Capitolo I"}, {"kind": "p", "text": "CAPITOLO I."}, {"kind": "p", "text": prose},
              {"kind": "h2", "text": "-II-"}, {"kind": "p", "text": "Perdido"}, {"kind": "p", "text": prose},
              {"kind": "p", "text": "―4―"}, {"kind": "p", "text": "หน้า:Book.pdf/12"},
              {"kind": "h2", "text": "นิทานที่ 3"}, {"kind": "h2", "text": "นิทานที่ ๓ เรื่อง หนู"}, {"kind": "p", "text": prose},
              {"kind": "p", "text": "FIN"}, {"kind": "p", "text": "Madrid.--Enero de 1878."},
              {"kind": "p", "text": "OBRAS DEL AUTOR"}, {"kind": "p", "text": "La barraca, 3 pesetas."}]
    out = bb.clean(blocks)
    heads = [b["text"] for b in out if b["kind"] == "h2"]
    assert heads == ["CAPITOLO I.", "-II- Perdido", "นิทานที่ ๓ เรื่อง หนู"]
    assert out[-1]["text"] == "Madrid.--Enero de 1878." and not any("pdf" in b["text"] or "―" in b["text"] for b in out)
    # A book's own cuts: from its first page, to its notes, without the printer's notices.
    cut = bb.trim([{"kind": "p", "text": t} for t in ("Imprenta X", "TITLE", "Text one", "Notice", "TITLE", "Text two", "NOTES", "n")],
                  {"from": [r"^TITLE$", 1], "to": r"^NOTES$", "drop": r"^Notice$"})
    assert [b["text"] for b in cut] == ["TITLE", "Text one", "TITLE", "Text two"]
    # German: chapters, acts and scenes are headings ("Erstes Kapitel", "Zweiter Aufzug.", "Erste Scene."); a list
    # of titles with page or chapter numbers is a contents list; a book may name its own other headings.
    assert all(bb.HEADING.search(t) for t in ("Erstes Kapitel", "Zweiter Aufzug.", "Erste Scene.", "Letzter Streich.", "Vorrede"))
    assert not bb.HEADING.search("Der Herausgeber an den Leser") and not bb.HEADING.search("Kapitelweise las er weiter.")
    assert bb._listing(["Aschenputtel                94", "Rapunzel             30", "Marienkind               1"])
    assert bb._listing(["1  Zum Alm-Öhi hinauf", "2  Beim Großvater", "3  Auf der Weide"])
    assert not bb._listing(["Es war einmal ein König,", "der hatte drei Töchter,", "die waren alle schön."])
    marked = bb.trim([{"kind": "p", "text": "Der Herausgeber an den Leser"}], {"headings": r"^Der Herausgeber an den Leser$"})
    assert marked[0]["kind"] == "h2"
    # Latin: its own chapter words, with a number after them ("caput" is also a head), long vowels printed as acute
    # accents become macrons, and a line of verse stays a line, never a heading, even when it starts with "parte".
    assert all(bb.LA_HEADING.search(t) for t in ("Caput I.", "CAPUT (II.) SECUNDUM.", "Caput vīcēsimum.", "Liber XII", "Pars altera", "Praefatio"))
    assert not any(bb.LA_HEADING.search(t) for t in ("Caput ephebi iam in rima evanuerat", "parte tamen meliore mei", "vix."))
    assert bb.trim([{"kind": "p", "text": "Haec nárrantur á poétís"}], {"acutes": True})[0]["text"] == "Haec nārrantur ā poētīs"
    verse = [{"kind": "h2", "text": "Liber XV"}, {"kind": "p", "text": "parte tamen meliore mei super alta perennis", "verse": True},
             {"kind": "p", "text": "astra ferar, nomenque erit indelebile nostrum,", "verse": True}]
    assert bb.clean(verse, "la") == [{"kind": b["kind"], "text": b["text"]} for b in verse]
