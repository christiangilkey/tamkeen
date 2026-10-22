"""Persian (fa) on the computer: told apart from Arabic, Persian letters in what Whisper writes, search that
ignores the half space (ZWNJ) and Persian's own k and y, its dictionaries, and the builders' matching keys
(which must agree with web/js/lexicon/persian.js persianKey: tests/js/persian.test.mjs has the same cases)."""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import pytest

from app import arabic, jobs, languages, lexicon
from app.transcriber import Segment, Word

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_meanings  # noqa: E402
import build_persian  # noqa: E402

ZWNJ = "‌"


def test_persian_is_taught_and_listened_for_by_its_own_code():
    assert languages.LANGUAGES["fa"] == "Persian" and languages.valid("fa")
    assert languages.whisper_code("fa") == "fa", "Whisper knows Persian"
    from app.transcriber import cloud
    assert cloud.language_code("persian") == "fa" and cloud.language_code("Farsi") == "fa"


@pytest.mark.parametrize("text, hint, expected", [
    ("من می‌خواهم کتاب بخوانم", "es", "fa"),       # ZWNJ, ک, ی
    ("چرا اینجا نیستی؟", "ar", "fa"),               # چ
    ("أريد أن أقرأ كتابا في المكتبة", "fa", "ar"),  # ك ي and tanween
    ("مدرسة جديدة", "fa", "ar"),                    # ة
    ("سلام", "fa", "fa"),                           # nothing either way: the language being studied
    ("سلام", "ar", "ar"),
])
def test_persian_is_told_from_arabic(fresh_db, text, hint, expected):
    assert languages.detect(text, hint) == expected


def test_whisper_s_arabic_letters_become_persian_ones():
    segs = [Segment(0, 1, "كتابي خوبي", [Word(0, 0.5, " كتابي"), Word(0.5, 1, " خوبي")])]
    jobs._persian_letters(segs)
    assert segs[0].text == "کتابی خوبی" and [w.text for w in segs[0].words] == [" کتابی", " خوبی"]


def test_search_ignores_the_half_space_and_persian_k_and_y():
    assert arabic.normalize(f"می{ZWNJ}خواهم") == arabic.normalize("ميخواهم")
    assert arabic.normalize("کتابی") == arabic.normalize("كتابي")
    assert arabic.find_spans(f"ما کتاب{ZWNJ}ها را خواندیم", "کتابها") == [(3, 10)]


@pytest.mark.parametrize("word, key", [
    (f"می{ZWNJ}خواهم", "میخواهم"), ("میخواهم", "میخواهم"), ("كتابي", "کتابی"), ("کِتاب", "کتاب"), ("خانهٔ", "خانه"),
    ("مدرسة", "مدرسه"),
])
def test_the_builders_match_words_as_the_app_does(word, key):
    assert build_persian.key(word) == key
    assert build_meanings.key(word, "fa") == key


def test_persian_dictionaries_are_published():
    assert lexicon.LANGUAGES["fa"] == ("fa",) and lexicon.FILES["fa"] == "fa-lemmas.json.gz"
    assert lexicon.MEANINGS["fa"] == ("mean-fa",) and lexicon.FILES["mean-fa"] == "fa-meanings.json.gz"
    table = json.loads(gzip.decompress((ROOT / "docs" / "lexicon" / "fa-lemmas.json.gz").read_bytes()))
    assert table["kind"] == "lemmas" and table["lang"] == "fa"
    lemmas, forms = table["lemmas"], table["forms"]
    assert lemmas[forms["میخواهم"]] == "خواستن" and lemmas[forms["کرد"]] == "کردن"
    assert "مردم" not in forms, "مردم is 'people', not 'I died'"
    assert lemmas[table["stems"]["نویس"]] == "نوشتن", "every verb's stems, for the forms the table leaves out"
    meanings = json.loads(gzip.decompress((ROOT / "docs" / "lexicon" / "fa-meanings.json.gz").read_bytes()))
    assert any("book" in g for group in meanings["words"]["کتاب"] for g in group[2])
