"""A course's audio packed into one file per unit, so the website has a few hundred files instead of 17,000.

GitHub Pages (which serves docs/) kept timing out with one small audio file per course word (17,456 of them).
So each unit's 50 clips go into one pack, docs/course/<id>/audio/uNN-<checksum>.pack: the clips' Ogg files
one after another, nothing between them and no header. Each word in course.json says where its clip is:

    "clip": {"pack": "audio/u01-3f9a1c2e7b.pack", "at": 10761, "size": 9097}

`at` is where its first byte is in the pack and `size` how many bytes it has. The app downloads a unit's
pack once (web/js/coursepacks.js) and plays or keeps a clip by cutting those bytes out: a Blob slice, no
library needed. The checksum in the name changes whenever a clip in it changes, so a kept pack never goes
out of date.

Older app versions (before the packs) read each word's own file, "audio": "audio/0001.ogg". While
KEEP_SINGLE_FILES is True those files stay too, so those versions keep their course audio. Set it to False
and run `python tools/course/pack_audio.py` to remove them (and the "audio" lines, so older versions then
show no Word / Sentence buttons rather than buttons that fail).

The clips themselves are kept by the packs: a build that finds a word's own file gone reads its clip back
out of the pack it was in (clip_bytes), so audio already made is never made again.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

# The old one-file-per-word audio, for app versions before the packs (v0.57.0 and older). Kept for one
# release, then removed (the owner's decision; HANDOFF "Course audio packs").
KEEP_SINGLE_FILES = True

UNIT = 50


def single_name(n: int) -> str:
    return f"audio/{n:04d}.ogg"


def unit_of(n: int, unit: int = UNIT) -> int:
    return (n - 1) // unit + 1


def clip_bytes(folder: Path, word: dict[str, Any]) -> bytes | None:
    """A word's clip: its own file if it is there, else cut out of the pack its "clip" names. None when
    neither is there (the word has no audio yet)."""
    own = folder / single_name(word["n"])
    if own.exists():
        return own.read_bytes()
    clip = word.get("clip")
    if not clip:
        return None
    pack = folder / clip["pack"]
    if not pack.exists():
        return None
    with pack.open("rb") as f:
        f.seek(int(clip["at"]))
        data = f.read(int(clip["size"]))
    return data if len(data) == int(clip["size"]) else None


def pack_course(folder: Path, words: list[dict[str, Any]], clips: dict[int, bytes], *,
                keep_singles: bool = KEEP_SINGLE_FILES, unit: int = UNIT) -> int:
    """Write the packs of a course into `folder`/audio and give each word in `words` its "clip" (changed
    in place). `clips`: each voiced word's Ogg bytes by its number. Packs no word points at any more are
    removed; so are the words' own files unless `keep_singles`, in which case each voiced word also keeps
    its "audio". Returns how many bytes of audio the packs hold."""
    audio = folder / "audio"
    audio.mkdir(parents=True, exist_ok=True)
    by_unit: dict[int, list[dict[str, Any]]] = {}
    for w in words:
        if w["n"] in clips:
            by_unit.setdefault(unit_of(w["n"], unit), []).append(w)
    wanted, total = set(), 0
    for u, members in sorted(by_unit.items()):
        members.sort(key=lambda w: w["n"])
        body = b"".join(clips[w["n"]] for w in members)
        name = f"u{u:02d}-{hashlib.sha256(body).hexdigest()[:10]}.pack"
        path = audio / name
        if not path.exists() or path.stat().st_size != len(body):
            path.write_bytes(body)
        wanted.add(name)
        total += len(body)
        at = 0
        for w in members:
            size = len(clips[w["n"]])
            w["clip"] = {"pack": f"audio/{name}", "at": at, "size": size}
            at += size
    for old in audio.glob("u*.pack"):
        if old.name not in wanted:
            old.unlink()
    for w in words:
        if w["n"] not in clips:
            w.pop("clip", None)
            continue
        own = folder / single_name(w["n"])
        if keep_singles:
            if not own.exists():
                own.write_bytes(clips[w["n"]])
            w["audio"] = single_name(w["n"])
        else:
            if own.exists():
                own.unlink()
            w.pop("audio", None)
    return total


def order_word(w: dict[str, Any]) -> dict[str, Any]:
    """The word's keys in the order course.json has always had them, "clip" after "times"."""
    head = [k for k in w if k not in ("audio", "times", "clip")]
    out = {k: w[k] for k in head}
    for k in ("audio", "times", "clip"):
        if k in w:
            out[k] = w[k]
    return out


def repack(folder: Path, *, keep_singles: bool = KEEP_SINGLE_FILES) -> dict[str, Any] | None:
    """Pack an already built course again (its words' own files or its old packs) and rewrite its
    course.json; nothing else in it changes. Returns the course, or None for a course without audio."""
    path = folder / "course.json"
    course = json.loads(path.read_text(encoding="utf-8"))
    words = course.get("words", [])
    clips = {w["n"]: b for w in words if w.get("times") and (b := clip_bytes(folder, w)) is not None}
    missing = [w["n"] for w in words if w.get("times") and w["n"] not in clips]
    if missing:
        raise SystemExit(f"{folder.name}: no audio found for words {missing[:10]}{'…' if len(missing) > 10 else ''}")
    if not clips:
        return None
    pack_course(folder, words, clips, keep_singles=keep_singles)
    course["words"] = [order_word(w) for w in words]
    path.write_bytes(json.dumps(course, ensure_ascii=False, indent=1).encode("utf-8"))
    return course


def index_entry_update(index_entry: dict[str, Any], folder: Path, course: dict[str, Any]) -> None:
    """The index's size, checksum and audio size for a course just written."""
    body = (folder / "course.json").read_bytes()
    index_entry["bytes"] = len(body)
    index_entry["sha256"] = hashlib.sha256(body).hexdigest()
    packs = {w["clip"]["pack"] for w in course.get("words", []) if w.get("clip")}
    index_entry["audio_bytes"] = sum((folder / p).stat().st_size for p in packs)
