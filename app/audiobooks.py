"""Audiobooks: LibriVox's free public-domain audiobooks (librivox.org) and audiobook files of the learner's
own, studied like podcasts.

A LibriVox book the learner adds is a "podcast" whose address is the book's chapter feed
(https://librivox.org/rss/<id>) and whose episodes are its chapters, so transcription, the player, word
lookup, saving and Drive sync all work unchanged. A book of the learner's own files is a list
"local:audiobook:<key>" whose episodes are the files, uploaded like "My audio" files (app/videos.py
save_upload with `book`). This file holds what differs (the same rules as web/js/audiobooks.js, which the
phones and the web app use):
    - which lists are audiobooks (is_audiobook_feed), so they get their own kind in the Library and stay
      out of the podcasts;
    - the book's title tidied ("Divine Comedy, The by Dante Alighieri (1265 - 1321)" → "The Divine
      Comedy by Dante Alighieri"), the same on every device, or each sync would change it back;
    - chapters in order (chapter_key): a podcast lists its newest episode first, a book starts at chapter 1
      (a LibriVox book by its files' numbered names; the learner's own by the files' names, its chapter titles).

It also serves the catalogue (which books there are, per language and category: tools/build_audiobooks.py,
published in docs/audiobooks) to the computer's page through /api/audiobooks/... (app/api/audiobooks.py):
the repository's own copy when running from source, otherwise the published files, downloaded and kept in
the data folder so the list still opens without a connection.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import httpx

from . import paths

BASE_URL = "https://christiangilkey.github.io/tamkeen/audiobooks/"
LIBRIVOX_RSS = "https://librivox.org/rss/"
OWN_PREFIX = "local:audiobook:"
# SQL: leaves the audiobooks out of a list of podcasts (`f` is the feeds table).
NOT_AUDIOBOOK_SQL = "f.url NOT LIKE '%librivox.org/rss/%'"
NAME = re.compile(r"^(index\.json|[a-z]{2,3}\.json\.gz)$")
_FEED = re.compile(r"^https?://(www\.)?librivox\.org/rss/\d+/?$", re.I)
_ARTICLES = re.compile(r"^(.+), (The|A|An|La|Le|Les|L'|El|Los|Las|Lo|Il|Gli|I|Der|Die|Das|Den|Het|De|O|Os|As|Un|Una|Une)$")


class CatalogueError(RuntimeError):
    pass


def is_librivox_feed(url: str | None) -> bool:
    return bool(url) and bool(_FEED.match(str(url).strip()))


def is_own_book(url: str | None) -> bool:
    return bool(url) and str(url).startswith(OWN_PREFIX)


def is_audiobook_feed(url: str | None) -> bool:
    return is_librivox_feed(url) or is_own_book(url)


def rss_for(book_id: int) -> str:
    return f"{LIBRIVOX_RSS}{int(book_id)}"


def tidy_title(raw: str | None) -> str:
    """LibriVox's feed title with the article back in front and no life dates (see the docstring)."""
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    cut = text.rfind(" by ")
    title = text[:cut] if cut > 0 else text
    author = text[cut + 4:] if cut > 0 else ""
    author = re.sub(r"\s+", " ", re.sub(r"\s*\([^()]*\)", "", author)).strip()
    m = _ARTICLES.match(title.strip())
    if m:
        title = f"{m.group(2)}{m.group(1)}" if m.group(2).endswith("'") else f"{m.group(2)} {m.group(1)}"
    title = title.strip()
    return f"{title} by {author}" if author else title


def _natural(text: str) -> tuple:
    return tuple((0, int(part), "") if part.isdigit() else (1, 0, part.lower()) for part in re.split(r"(\d+)", text) if part)


def chapter_key(audio_url: str | None, title: str | None = "", own: bool = False) -> tuple:
    """Sort key for a book's chapters: the file name in natural order (LibriVox numbers each chapter's file),
    then the title. A book of the learner's own files (`own`): the title, which is the file's name."""
    if own:
        return (_natural(str(title or "")),)
    name = str(audio_url or "").split("?")[0].split("#")[0].rsplit("/", 1)[-1]
    return (_natural(name), _natural(str(title or "")))


# --- the catalogue files ---------------------------------------------------------------------

def _source_dir() -> Path | None:
    if getattr(sys, "frozen", False):
        return None
    path = Path(__file__).resolve().parent.parent / "docs" / "audiobooks"
    return path if (path / "index.json").exists() else None


def cache_dir() -> Path:
    path = paths.data_dir() / "audiobooks"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get(name: str) -> bytes:
    """A catalogue file by its published name ("index.json", "ar.json.gz")."""
    if not NAME.match(name):
        raise CatalogueError("There is no such file.")
    src = _source_dir()
    if src is not None:
        path = src / name
        if not path.exists():
            raise CatalogueError("LibriVox has no audiobooks in this language yet.")
        return path.read_bytes()
    kept = cache_dir() / name
    try:
        r = httpx.get(BASE_URL + name, timeout=60, follow_redirects=True)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        if kept.exists():
            return kept.read_bytes()
        raise CatalogueError(f"Couldn't download the list of audiobooks ({exc.__class__.__name__}). "
                             "Check your connection and try again.") from exc
    kept.write_bytes(r.content)
    return r.content
