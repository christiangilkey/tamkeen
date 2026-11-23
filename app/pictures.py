"""Pictures on the backs of flashcards (prototype "card_pictures"; the page's side is web/js/cardpicture.js).

A card's ``picture`` column is a short JSON text: its version ``v`` (part of the file's name, so a changed picture
is a new file) and, for a picture found with Openverse, its credit (creator, licence, source link). The picture
itself is a small JPEG made on the page (360 px at most, about 20-30 KB): ``pictures/<uid>_<v>.jpg`` here and
``p_<uid>_<v>.jpg`` in the learner's Drive app folder, so every device keeps a copy and shows it offline.

Only licences that allow commercial use are ever kept (Tamkeen will be a paid app): CC0, public domain, CC BY and
CC BY-SA. Never NC or ND. The same check as cardpicture.js cleanMeta, so a picture planted in a synced library
with another licence, or a strange version, is dropped.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from . import paths

LICENSES = ("cc0", "pdm", "by", "by-sa")
MAX_BYTES = 400 * 1024
_VERSION = re.compile(r"^[a-f0-9]{8,16}$")
_SAFE_ID = re.compile(r"^[A-Za-z0-9-]{1,64}$")
_UID = re.compile(r"^\w{1,64}$")
_URL = re.compile(r"^https?://[^\s\"<>]+$", re.I)


def _text(x: Any, n: int) -> str:
    return " ".join(str("" if x is None else x).split())[:n]


def _url(x: Any) -> str:
    s = str(x or "")
    return s[:500] if _URL.match(s) else ""


def clean(meta: Any) -> dict[str, Any] | None:
    """A picture's details as they may be stored, or None if they are wrong (JSON text or a dict)."""
    if isinstance(meta, str):
        if not meta.strip():
            return None
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            return None
    if not isinstance(meta, dict) or not _VERSION.match(str(meta.get("v") or "")):
        return None
    if meta.get("src") == "own":
        return {"v": meta["v"], "src": "own"}
    if meta.get("src") != "openverse" or meta.get("lic") not in LICENSES or not _SAFE_ID.match(str(meta.get("id") or "")):
        return None
    return {"v": meta["v"], "src": "openverse", "id": str(meta["id"]), "title": _text(meta.get("title"), 200),
            "by": _text(meta.get("by"), 120), "by_url": _url(meta.get("by_url")), "lic": meta["lic"],
            "lic_v": _text(meta.get("lic_v"), 10), "lic_url": _url(meta.get("lic_url")), "url": _url(meta.get("url"))}


def dumps(meta: dict[str, Any] | None) -> str:
    return json.dumps(meta, ensure_ascii=False, separators=(",", ":")) if meta else ""


def stored(raw: Any) -> str:
    """What a card keeps as its ``picture``: the text exactly as another device wrote it when it is already right
    (so every device keeps the same text and the library compares equal), else the corrected one, or ""."""
    meta = clean(raw)
    if meta is None:
        return ""
    if isinstance(raw, str):
        try:
            if json.loads(raw) == meta:
                return raw
        except json.JSONDecodeError:
            pass
    return dumps(meta)


def file_stem(uid: str, meta: dict[str, Any] | None) -> str:
    """<uid>_<v>, or "" when either can't be part of a file name."""
    if not meta or not _UID.match(str(uid or "")) or not _VERSION.match(str(meta.get("v") or "")):
        return ""
    return f"{uid}_{meta['v']}"


def drive_name(uid: str, meta: dict[str, Any] | None) -> str:
    stem = file_stem(uid, meta)
    return f"p_{stem}.jpg" if stem else ""


def local_path(uid: str, meta: dict[str, Any] | None) -> Path | None:
    stem = file_stem(uid, meta)
    return paths.pictures_dir() / f"{stem}.jpg" if stem else None


def is_picture(data: bytes) -> bool:
    """A JPEG (what the page makes), or a PNG or WebP."""
    return data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")


def media_type(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def anki_name(uid: str, meta: dict[str, Any] | None) -> str:
    """What a card's picture is called inside Anki (cardpicture.js ankiName)."""
    stem = file_stem(uid, meta)
    return f"tk-{stem.replace('_', '-p-', 1) if stem else ''}.jpg" if stem else ""


def anki_field(meta: dict[str, Any] | None, name: str) -> str:
    """The Anki note's image field for a card's picture: the picture and its credit, linked to where it came from
    (cardpicture.js ankiImageField)."""
    import html

    if not name:
        return ""
    out = f'<img src="{html.escape(name)}">'
    text = credit(meta)
    if text:
        link = (meta or {}).get("url") or ""
        inner = f'<a href="{html.escape(link)}">{html.escape(text)}</a>' if link else html.escape(text)
        out += f'<div class="tk-credit">{inner}</div>'
    return out


def credit(meta: dict[str, Any] | None) -> str:
    """"Photo: Jane Doe · CC BY 2.0" (cardpicture.js creditText), "" for the learner's own picture."""
    if not meta or meta.get("src") != "openverse":
        return ""
    names = {"cc0": "CC0", "pdm": "Public domain", "by": "CC BY", "by-sa": "CC BY-SA"}
    name = names.get(meta.get("lic") or "", "")
    if meta.get("lic") in ("by", "by-sa") and meta.get("lic_v"):
        name = f"{name} {meta['lic_v']}"
    return f"Photo: {meta.get('by') or 'unknown'} · {name}"
