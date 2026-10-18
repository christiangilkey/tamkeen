# Tamkeen's free book shelf

Famous public-domain books in each language Tamkeen teaches, downloaded by the apps one at a time when
a learner adds one (`web/js/books.js`). `index.json` lists them per language with each file's size and
SHA-256 checksum (the apps refuse a file that doesn't match); each `<lang>/<id>.json.gz` holds one book:
`{"format": 1, "id", "lang", "title", "author", "year", "source", "blocks": [{"kind": "h2"|"p", "text"}]}`.

Made by `tools/build_books.py` from Project Gutenberg, Wikisource and Aozora Bunko (see the top of that
file and `licenses/free-books.txt`). Only works in the public domain where they were written and in the
United States are listed.
