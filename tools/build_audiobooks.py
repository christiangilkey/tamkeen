"""Build Tamkeen's audiobook catalogue: LibriVox's free public-domain audiobooks, by language and category.

LibriVox (librivox.org) records public-domain books read by volunteers, and puts the recordings in the
public domain too. Its API (https://librivox.org/api/info) lists every book with its language and genres,
but it can't be asked for "poetry in Arabic": it has no language filter, and asks for at most 500 books
a request, with a pause between requests. So the whole list is read here, once, and split into one small
file per language that GitHub Pages serves to the apps (web/js/audiobooks.js reads them):

    docs/audiobooks/index.json        {format, made, source, categories: [keys], languages: {code: {count, file, bytes, categories: {key: count}}}}
    docs/audiobooks/<code>.json.gz    {format, lang, made, categories: [[key, count]], books: [[id, title, author, seconds, chapters, [category keys], cover]]}

Books are listed most-downloaded first (archive.org's download counts for LibriVox's collection there).
The cover is the part of LibriVox's cover thumbnail address after "https://archive.org/download/".
Adding a book in the app subscribes to its chapter feed (https://librivox.org/rss/<id>), like a podcast.

    python tools/build_audiobooks.py            (uses what was downloaded in the last 7 days, else downloads again)
    python tools/build_audiobooks.py --refresh  (downloads everything again: about 10 minutes, with pauses)

Downloads are kept in tools/audiobooks/build/ (not in git). Run this now and then (say, at a release) so
new LibriVox books show up.
"""

from __future__ import annotations

import gzip
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "audiobooks"
CACHE = ROOT / "tools" / "audiobooks" / "build"
UA = {"User-Agent": "Tamkeen audiobook catalogue builder (https://github.com/christiangilkey/tamkeen)"}
API = "https://librivox.org/api/feed/audiobooks"
PAGE = 500          # LibriVox's most per request
PAUSE = 3.0         # seconds between requests, as LibriVox asks of large downloads
FRESH_DAYS = 7
COVER_PREFIXES = ("https://www.archive.org/download/", "https://archive.org/download/", "http://www.archive.org/download/")

# LibriVox's language names → the app's language codes (web/js/languages.js).
LANGUAGES = {
    "English": "en", "Spanish": "es", "French": "fr", "Italian": "it", "Russian": "ru", "Japanese": "ja",
    "Chinese": "zh", "Mandarin": "zh", "Arabic": "ar", "Tagalog": "tl", "Filipino": "tl", "Portuguese": "pt",
    "Catalan": "ca", "Cebuano": "ceb", "Bisaya": "ceb", "Thai": "th", "German": "de", "Persian": "fa",
    "Farsi": "fa", "Persian/Farsi": "fa", "Bisaya/Cebuano": "ceb", "Hindi": "hi", "Korean": "ko",
}

# The categories offered, in the order shown (web/js/audiobooks.js CATEGORIES has the same keys, with
# their names and icons).
CATEGORY_KEYS = ["fiction", "mystery", "fantasy", "short", "children", "myths", "poetry", "plays", "history",
                 "biography", "religion", "philosophy", "science", "nonfiction"]
# Which categories a LibriVox genre puts a book in. LibriVox gives each book a flat list of genres, main
# ones and finer ones ("Crime & Mystery Fiction", "Detective Fiction"); a book is in every category one of
# its genres matches. Each pattern is tried on the genre's name in lower case.
RULES = [
    ("children", r"children|juvenile|young adult|nursery|^school$"),
    ("myths", r"myth|legend|fairy|folk|fable|saga"),
    ("poetry", r"poetry|poem|epic|ballad|sonnet|verse|lyric|elegies|odes"),
    ("plays", r"^plays?$|drama|tragedy|comedy"),
    ("short", r"short stor|^short works$|antholog|single author|literary collections"),
    ("mystery", r"crime|mystery|detective|suspense|espionage|thriller"),
    ("fantasy", r"fantas|science fiction|horror|supernatural|gothic"),
    ("religion", r"christian|bible|relig|version$|translation$|testament|atheism"),
    ("philosophy", r"philosoph|atheism"),
    ("history", r"^history$|antiquity|middle ages|medieval|^modern \(|^ancient$|early modern|^war & military$|exploration"),
    ("biography", r"biograph|memoir|^letters$|autobiograph"),
    ("science", r"^science$|^nature$|^animals|life sciences|earth sciences|astronomy|chemistry|mathematics|medical|"
                r"technology|health|psychology"),
    ("nonfiction", r"non-?fiction|essay|travel & geography|political science|social science|true crime|self-help|cooking|literary criticism|"
                   r"^art|education|music|business|^law$|reference|family & relationships|performing arts|writing|"
                   r"sports & recreation|language learning|house & home|transportation|crafts|gardening|^games$|periodicals|"
                   r"narratives|^humor$"),
    ("fiction", r"(?<!non-)(?<!non)fiction|^romance$|western|satire|adventure|nautical|epistolary|family life"),
]
# A fiction genre ("Historical Fiction", "Nature & Animal Fiction", "Christian Fiction") is fiction only:
# not history, nature or religion. A children's genre is in Children's only.
FICTION = re.compile(r"(?<!non-)(?<!non)fiction|^romance$|western|satire|adventure|nautical|epistolary|family life")
NOT_FICTION = re.compile(r"non-?fiction")
FICTION_ALSO = {"fiction", "mystery", "fantasy", "myths", "short", "plays", "poetry"}
# Genre names that say nothing about a book's kind ("Published 1800 -1900", "General", "Modern").
IGNORED_GENRES = re.compile(r"^published|^\d|^general$|^modern$|^contemporary$|^historical$|^family$|^erotica$", re.I)


def get_json(url: str, tries: int = 5) -> dict:
    """GET a JSON address, waiting and trying again when the server is busy."""
    wait = PAUSE
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return {}
            if attempt == tries - 1 or exc.code not in (429, 500, 502, 503, 504):
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == tries - 1:
                raise
        time.sleep(wait)
        wait *= 3
    return {}


def fetch_librivox(refresh: bool) -> list[dict]:
    """Every LibriVox book (id, title, language, length, chapters, authors, genres, cover)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    whole = CACHE / "librivox.json"
    if not refresh and whole.exists() and time.time() - whole.stat().st_mtime < FRESH_DAYS * 86400:
        return json.loads(whole.read_text(encoding="utf-8"))
    fields = "{id,title,language,totaltimesecs,num_sections,url_iarchive,authors,genres,coverart_thumbnail}"
    books: list[dict] = []
    offset = 0
    while True:
        query = urllib.parse.urlencode({"format": "json", "extended": 1, "coverart": 1, "limit": PAGE,
                                        "offset": offset, "fields": fields, "sort_order": "asc"})
        data = get_json(f"{API}?{query}")
        page = data.get("books") or []
        books.extend(page)
        print(f"  LibriVox: {len(books)} books", flush=True)
        if len(page) < PAGE:
            break
        offset += PAGE
        time.sleep(PAUSE)
    whole.write_text(json.dumps(books, ensure_ascii=False), encoding="utf-8")
    return books


def fetch_downloads(refresh: bool) -> dict[str, int]:
    """How often each of LibriVox's archive.org items was downloaded: {identifier: count}."""
    whole = CACHE / "downloads.json"
    if not refresh and whole.exists() and time.time() - whole.stat().st_mtime < FRESH_DAYS * 86400:
        return json.loads(whole.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    cursor = None
    while True:
        query = {"q": "collection:librivoxaudio", "fields": "identifier,downloads", "count": 10000}
        if cursor:
            query["cursor"] = cursor
        data = get_json("https://archive.org/services/search/v1/scrape?" + urllib.parse.urlencode(query))
        for item in data.get("items") or []:
            counts[item.get("identifier", "")] = int(item.get("downloads") or 0)
        print(f"  archive.org: {len(counts)} download counts", flush=True)
        cursor = data.get("cursor")
        if not cursor:
            break
        time.sleep(PAUSE)
    whole.write_text(json.dumps(counts), encoding="utf-8")
    return counts


def categories_of(genres: list[str]) -> list[str]:
    """The categories a book with these LibriVox genres is in (in CATEGORY_KEYS order)."""
    found: set[str] = set()
    for name in genres:
        low = name.lower().strip()
        if not low or IGNORED_GENRES.search(low):
            continue
        hits = {key for key, pattern in RULES if re.search(pattern, low)}
        if "children" in hits:
            hits = {"children"}
        elif FICTION.search(low) and not NOT_FICTION.search(low):
            hits = (hits & FICTION_ALSO) | {"fiction"}
        found |= hits
    return [k for k in CATEGORY_KEYS if k in found]


def author_of(book: dict) -> str:
    names = []
    for a in book.get("authors") or []:
        name = " ".join(p for p in (str(a.get("first_name") or "").strip(), str(a.get("last_name") or "").strip()) if p)
        if name and name not in names:
            names.append(name)
    return ", ".join(names[:3]) + (" …" if len(names) > 3 else "")


def cover_of(book: dict) -> str:
    url = str(book.get("coverart_thumbnail") or "").strip()
    for prefix in COVER_PREFIXES:
        if url.startswith(prefix):
            return url[len(prefix):]
    return url if url.startswith("https://") else ""


def identifier_of(book: dict) -> str:
    url = str(book.get("url_iarchive") or "")
    return url.rstrip("/").rsplit("/", 1)[-1] if "/details/" in url else ""


def build(books: list[dict], downloads: dict[str, int]) -> dict:
    made = date.today().isoformat()
    per_lang: dict[str, list[tuple[int, list]]] = {}
    unmatched: Counter = Counter()
    for b in books:
        code = LANGUAGES.get(str(b.get("language") or "").strip())
        secs = int(b.get("totaltimesecs") or 0)
        chapters = int(b.get("num_sections") or 0)
        if not code or not secs or not chapters:  # another language, or not finished
            continue
        genres = [str(g.get("name") or "") for g in b.get("genres") or []]
        cats = categories_of(genres)
        if not cats:
            unmatched.update(g for g in genres if not IGNORED_GENRES.search(g.lower()))
        title = re.sub(r"\s+", " ", str(b.get("title") or "")).strip()
        if not title:
            continue
        row = [int(b["id"]), title, author_of(b), secs, chapters, cats, cover_of(b)]
        per_lang.setdefault(code, []).append((downloads.get(identifier_of(b), 0), row))
    OUT.mkdir(parents=True, exist_ok=True)
    index = {"format": 1, "made": made, "source": "LibriVox (https://librivox.org): public-domain recordings",
             "categories": CATEGORY_KEYS, "languages": {}}
    for code in sorted(per_lang):
        rows = [row for _, row in sorted(per_lang[code], key=lambda x: (-x[0], -x[1][0]))]
        counts = Counter(c for row in rows for c in row[5])
        body = {"format": 1, "lang": code, "made": made,
                "categories": [[k, counts[k]] for k in CATEGORY_KEYS if counts[k]], "books": rows}
        raw = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        packed = gzip.compress(raw, compresslevel=9, mtime=0)
        name = f"{code}.json.gz"
        (OUT / name).write_bytes(packed)
        index["languages"][code] = {"count": len(rows), "file": name, "bytes": len(packed),
                                    "categories": {k: counts[k] for k in CATEGORY_KEYS if counts[k]}}
        print(f"  {code}: {len(rows)} books, {len(packed) // 1024} KB")
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if unmatched:
        print("Genres in no category (books with only these are only under All audiobooks):",
              ", ".join(f"{g} ({n})" for g, n in unmatched.most_common(30)))
    return index


def main(argv: list[str]) -> None:
    refresh = "--refresh" in argv
    print("Reading LibriVox's catalogue…")
    books = fetch_librivox(refresh)
    print("Reading archive.org's download counts…")
    downloads = fetch_downloads(refresh)
    print("Writing docs/audiobooks…")
    build(books, downloads)


if __name__ == "__main__":
    main(sys.argv[1:])
