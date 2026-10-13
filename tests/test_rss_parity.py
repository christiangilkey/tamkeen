"""The phone reads podcast feeds itself (mobile/src/js/rss.js) and must give every episode the same
id as this computer's parser, or the two would list the same episode twice.

tests/fixtures/rss_parity.json holds what the Python parser makes of the sample feeds; this test
keeps that file honest, and tests/js/rss.test.mjs checks the phone's reader against it.
To regenerate after changing app/feeds.py or a sample feed:
    python -m tests.test_rss_parity      (from the project folder)
"""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path

from app import feeds

FIXTURES = Path(__file__).parent / "fixtures"
PARITY = FIXTURES / "rss_parity.json"
SAMPLES = ("feed_normal.xml", "feed_messy.xml", "feed_tricky.xml")


def build() -> dict[str, dict]:
    return {name: dataclasses.asdict(feeds.parse_feed((FIXTURES / name).read_bytes())) for name in SAMPLES}


def test_parity_file_matches_the_python_parser():
    assert json.loads(PARITY.read_text(encoding="utf-8")) == json.loads(json.dumps(build())), \
        "app/feeds.py or a sample feed changed: regenerate rss_parity.json (see this file's docstring)"


def test_tricky_feed_is_read_as_expected():
    feed = build()["feed_tricky.xml"]
    assert feed["title"] == "Café & Co" and feed["image"] == "https://example.com/square.png"
    eps = feed["episodes"]
    assert [e["guid"] for e in eps] == ["https://example.com/?p=12&x=1", "group", "atom-link", "twin", "twin#536a4110ee",
                                        "https://cdn.example.com/stream?id=9"]
    assert eps[0]["audio_url"] == "https://cdn.example.com/ep12.mp3?token=a&b=2", "the sound file, not the cover picture"
    assert eps[1]["audio_url"] == "https://cdn.example.com/group.m4a" and eps[2]["audio_url"] == "https://cdn.example.com/atom.mp3"


if __name__ == "__main__":
    PARITY.write_text(json.dumps(build(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", PARITY)
