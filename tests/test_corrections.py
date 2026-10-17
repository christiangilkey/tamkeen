"""Misheard words: changing a transcript's words in place (app/corrections.py), the API, and sync."""

from __future__ import annotations

import pytest

from app import corrections, db, ids
from app.sync import engine

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)

# The same cases as LINE_CASES in tests/js/correction.test.mjs (correction.js must agree).
LINE_CASES = [
    ("I red the book.", ["I", "red", "the", "book."], ["I", "read", "the", "book."], "I read the book."),
    ("He said: red, red!", ["He", "said:", "red,", "red!"], ["He", "said:", "red,", "read!"], "He said: red, read!"),
    ("انتي جديدة هون؟", ["انتي", "جديدة", "هون؟"], ["انتي", "جديدة", "هنا؟"], "انتي جديدة هنا؟"),
    ("a  lot   of", ["a", "lot", "of"], ["a", "lot", "off"], "a  lot   off"),
    ("text that changed elsewhere", ["missing", "words"], ["new", "words"], "new words"),
]


def test_line_changes_only_where_its_words_changed():
    for text, old, new, want in LINE_CASES:
        assert corrections.replace_in_text(text, old, new) == want, text


def _episode(conn, words_per_line):
    conn.execute("INSERT INTO feeds(uid, url, title, created_at) VALUES('ffix', 'https://example.com/rss', 'Pod', 1)")
    feed_id = conn.execute("SELECT id FROM feeds WHERE uid = 'ffix'").fetchone()[0]
    cur = conn.execute("INSERT INTO episodes(feed_id, uid, guid, title, audio_url, status, transcribed_at, created_at) "
                       "VALUES(?,?,?,?,?,?,?,?)", (feed_id, "efix", "g", "Ep", "https://example.com/a.mp3", "done", 100.0, 1))
    ep = cur.lastrowid
    idx = 0
    for seg, words in enumerate(words_per_line):
        text = " ".join(words)
        conn.execute("INSERT INTO segments(episode_id, idx, start, end, text, norm) VALUES(?,?,?,?,?,?)",
                     (ep, seg, float(idx), float(idx + len(words)), text, text.lower()))
        conn.execute("INSERT INTO segments_fts(norm, episode_id, seg_idx) VALUES(?,?,?)", (text.lower(), ep, seg))
        for w in words:
            conn.execute("INSERT INTO words(episode_id, idx, seg_idx, start, end, text) VALUES(?,?,?,?,?,?)",
                         (ep, idx, seg, float(idx), float(idx + 1), w))
            idx += 1
    return ep


LINES = [["Hello", "there."], ["I", "red", "the", "book", "yesterday."]]


def test_words_line_and_search_change_and_sync_is_due(fresh_db):
    with db.session() as conn:
        ep = _episode(conn, LINES)
    out = corrections.correct_words(ep, 3, 3, ["red"], ["read"])
    assert out["ok"] and out["transcribed_at"] > 100
    with db.session() as conn:
        words = [r[0] for r in conn.execute("SELECT text FROM words WHERE episode_id = ? ORDER BY idx", (ep,))]
        line = conn.execute("SELECT text, norm FROM segments WHERE episode_id = ? AND idx = 1", (ep,)).fetchone()
        hits = conn.execute("SELECT seg_idx FROM segments_fts WHERE segments_fts MATCH 'read' AND episode_id = ?", (ep,)).fetchall()
        stale = conn.execute("SELECT COUNT(*) FROM segments_fts WHERE segments_fts MATCH 'red' AND episode_id = ?", (ep,)).fetchone()[0]
        row = conn.execute("SELECT transcribed_at, synced_rev FROM episodes WHERE id = ?", (ep,)).fetchone()
    assert words == ["Hello", "there.", "I", "read", "the", "book", "yesterday."]
    assert line["text"] == "I read the book yesterday."
    assert [h[0] for h in hits] == [1] and stale == 0, "search finds the corrected word, not the old one"
    assert row["transcribed_at"] == out["transcribed_at"], "a newer transcript, so the next sync sends it"


def test_refuses_when_the_transcript_moved_on_or_the_change_does_not_fit(fresh_db):
    with db.session() as conn:
        ep = _episode(conn, LINES)
    with pytest.raises(corrections.CorrectionError, match="changed"):
        corrections.correct_words(ep, 3, 3, ["blue"], ["read"])
    for first, last, expect, words in [(3, 3, ["red"], []), (3, 3, ["red"], [""]), (-1, 0, ["x", "y"], ["a", "b"]),
                                       (0, 9, ["x"] * 10, ["y"] * 10), (3, 3, ["red"], ["x" * 200])]:
        with pytest.raises(corrections.CorrectionError):
            corrections.correct_words(ep, first, last, expect, words)
    with db.session() as conn:
        assert conn.execute("SELECT text FROM words WHERE episode_id = ? AND idx = 3", (ep,)).fetchone()[0] == "red"


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_api_corrects_and_undoes(client):
    with db.session() as conn:
        ep = _episode(conn, LINES)
    r = client.post(f"/api/episodes/{ep}/correct", json={"first": 3, "last": 3, "expect": ["red"], "words": ["read"]})
    assert r.status_code == 200, r.text
    t = client.get(f"/api/episodes/{ep}/transcript").json()
    assert t["words"]["text"][3] == "read" and t["segments"][1]["text"] == "I read the book yesterday."
    # Undo is the same call the other way round.
    assert client.post(f"/api/episodes/{ep}/correct", json={"first": 3, "last": 3, "expect": ["read"], "words": ["red"]}).status_code == 200
    assert client.get(f"/api/episodes/{ep}/transcript").json()["segments"][1]["text"] == "I red the book yesterday."
    stale = client.post(f"/api/episodes/{ep}/correct", json={"first": 3, "last": 3, "expect": ["read"], "words": ["reed"]})
    assert stale.status_code == 409 and "changed" in stale.json()["detail"]
    assert client.post("/api/episodes/999999/correct", json={"first": 0, "last": 0, "expect": ["a"], "words": ["b"]}).status_code == 404


def test_corrected_transcript_reaches_the_other_device(world):
    drive, a, b = world
    a.sync(drive)
    b.sync(drive)
    uid = ids.episode_uid(ids.feed_uid("https://example.com/rss"), "g1")
    with a:
        with db.session() as conn:
            ep = conn.execute("SELECT id FROM episodes WHERE uid = ?", (uid,)).fetchone()[0]
            first = conn.execute("SELECT idx, text FROM words WHERE episode_id = ? ORDER BY idx LIMIT 1", (ep,)).fetchone()
        corrections.correct_words(ep, first["idx"], first["idx"], [first["text"]], ["مصحح"])
    r = a.sync(drive)
    assert r.uploaded_transcripts == 1
    payload = engine._ungz(drive.by_name(engine.transcript_name(uid))["data"])
    assert payload["words"]["text"][0] == "مصحح"
    rb = b.sync(drive)
    assert rb.downloaded_transcripts == 1
    with b:
        with db.session() as conn:
            ep_b = conn.execute("SELECT id FROM episodes WHERE uid = ?", (uid,)).fetchone()[0]
            assert conn.execute("SELECT text FROM words WHERE episode_id = ? ORDER BY idx LIMIT 1", (ep_b,)).fetchone()[0] == "مصحح"
            assert "مصحح" in conn.execute("SELECT text FROM segments WHERE episode_id = ? ORDER BY idx LIMIT 1", (ep_b,)).fetchone()[0]
