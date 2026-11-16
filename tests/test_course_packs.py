"""The basics courses' audio packs (tools/course/packs.py, pack_audio.py): one file per unit, each word's clip
where course.json says, audio made before never lost. The app's side: tests/js/coursepacks.test.mjs."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools" / "course"))
import packs  # noqa: E402

TIMES = {"start": 0.0, "end": 0.3, "sent_start": 1.0, "sent_end": 2.0}


def clip(n: int) -> bytes:
    return b"OggS" + f"-clip-{n}-".encode() * (n % 7 + 1)


def built_course(folder: Path, count: int = 120, *, silent: bool = False) -> dict:
    """A course as build_course.py made it before the packs: each word's own file."""
    (folder / "audio").mkdir(parents=True)
    words = []
    for n in range(1, count + 1):
        w = {"n": n, "word": f"w{n}", "meaning": "m", "sentence": "s", "translation": "t"}
        if not silent:
            (folder / "audio" / f"{n:04d}.ogg").write_bytes(clip(n))
            w.update({"audio": f"audio/{n:04d}.ogg", "times": TIMES})
        words.append(w)
    course = {"format": 1, "lang": "xx", "title": "Test basics", "unit": 50, "built": "2026-10-25", "words": words}
    (folder / "course.json").write_bytes(json.dumps(course, ensure_ascii=False, indent=1).encode())
    return course


def read_clip(folder: Path, w: dict) -> bytes:
    data = (folder / w["clip"]["pack"]).read_bytes()
    return data[w["clip"]["at"]: w["clip"]["at"] + w["clip"]["size"]]


def test_each_unit_becomes_one_pack_and_each_word_says_where_its_clip_is(tmp_path):
    before = built_course(tmp_path)
    course = packs.repack(tmp_path, keep_singles=True)
    names = sorted(p.name for p in (tmp_path / "audio").glob("*.pack"))
    assert len(names) == 3 and [n[:4] for n in names] == ["u01-", "u02-", "u03-"], "120 words: units of 50, 50 and 20"
    for w in course["words"]:
        assert read_clip(tmp_path, w) == clip(w["n"])
        assert w["clip"]["pack"].startswith(f"audio/u{(w['n'] - 1) // 50 + 1:02d}-")
        assert w["audio"] == f"audio/{w['n']:04d}.ogg", "kept for app versions before the packs"
        assert list(w)[-3:] == ["audio", "times", "clip"]
    # Nothing else in the course changed.
    again = json.loads((tmp_path / "course.json").read_text(encoding="utf-8"))
    for w in again["words"]:
        w.pop("clip")
    assert again == before
    assert b"\r\n" not in (tmp_path / "course.json").read_bytes()


def test_a_pack_is_named_by_what_is_in_it_and_an_old_one_is_removed(tmp_path):
    built_course(tmp_path)
    packs.repack(tmp_path)
    first = sorted(p.name for p in (tmp_path / "audio").glob("*.pack"))
    packs.repack(tmp_path)
    assert sorted(p.name for p in (tmp_path / "audio").glob("*.pack")) == first, "nothing changed: the same packs"
    (tmp_path / "audio" / "0060.ogg").write_bytes(b"OggS-made-again")  # (word 60's audio made again)
    course = packs.repack(tmp_path)
    now = sorted(p.name for p in (tmp_path / "audio").glob("*.pack"))
    assert now[0] == first[0] and now[2] == first[2] and now[1] != first[1], "only unit 2's pack is new"
    assert read_clip(tmp_path, course["words"][59]) == b"OggS-made-again"


def test_without_the_single_files_the_packs_keep_every_clip(tmp_path):
    built_course(tmp_path)
    packs.repack(tmp_path, keep_singles=True)
    course = packs.repack(tmp_path, keep_singles=False)
    assert not list((tmp_path / "audio").glob("*.ogg")), "the old one-file-per-word audio is gone"
    assert all("audio" not in w for w in course["words"]), \
        "no \"audio\" line: an older app version shows no Word / Sentence buttons rather than ones that fail"
    for w in course["words"]:
        assert packs.clip_bytes(tmp_path, w) == clip(w["n"]), "read back out of its pack"
    # And packed again from the packs alone (a later build), nothing is lost; the single files can come back.
    course = packs.repack(tmp_path, keep_singles=True)
    assert (tmp_path / "audio" / "0042.ogg").read_bytes() == clip(42)
    assert read_clip(tmp_path, course["words"][41]) == clip(42)


def test_a_course_without_audio_gets_no_packs_and_missing_audio_stops_the_packing(tmp_path):
    built_course(tmp_path / "mor", silent=True)
    assert packs.repack(tmp_path / "mor") is None
    assert not list((tmp_path / "mor" / "audio").glob("*.pack"))
    built_course(tmp_path / "xx")
    (tmp_path / "xx" / "audio" / "0007.ogg").unlink()
    with pytest.raises(SystemExit, match="7"):
        packs.repack(tmp_path / "xx")


def test_pack_audio_updates_the_index(tmp_path, monkeypatch):
    import pack_audio

    built_course(tmp_path / "xx")
    built_course(tmp_path / "zz", count=10, silent=True)
    index = {"format": 1, "courses": {"xx": {"file": "xx/course.json", "bytes": 1, "sha256": "old", "audio_bytes": 0},
                                      "zz": {"file": "zz/course.json", "bytes": 2}}}
    (tmp_path / "index.json").write_text(json.dumps(index), encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["pack_audio.py", "--dir", str(tmp_path)])
    pack_audio.main()
    out = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    body = (tmp_path / "xx" / "course.json").read_bytes()
    assert out["courses"]["xx"]["bytes"] == len(body) and out["courses"]["xx"]["sha256"] != "old"
    assert out["courses"]["xx"]["audio_bytes"] == sum(len(clip(n)) for n in range(1, 121))
    assert out["courses"]["zz"] == {"file": "zz/course.json", "bytes": 2}, "a course without audio is left as it was"
    assert b"\r\n" not in (tmp_path / "index.json").read_bytes()


def test_the_build_reads_audio_made_before_out_of_the_packs():
    src = (Path(__file__).resolve().parent.parent / "tools" / "course" / "build_course.py").read_text(encoding="utf-8")
    assert "made_before = lambda n: packs.clip_bytes(folder, old_words.get(n) or {\"n\": n})" in src
    assert "packs.pack_course(folder, items, clips)" in src
    assert "for p in {it[\"clip\"][\"pack\"] for it in items if it.get(\"clip\")}" in src, "the index counts the packs"
