"""Lesson bundles on the computer (app/lessons.py and its routes): the passage and tracks in the lessons' own list,
the synced lesson record merged lesson by lesson (the twin of web/js/lessons.js), a whole transcript put right by
hand, and finding an episode by its uid."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app import lessons

ROOT = Path(__file__).resolve().parents[1]
WAV = ROOT / "tests" / "fixtures" / "arabic-sample.wav"


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def rec(id_: str, updated: float, **more):
    return {"id": id_, "title": "Unit 1", "updated": updated, **more}


def test_records_merge_lesson_by_lesson_and_removals_win():
    mine = {"abc123def": rec("abc123def", 100, title="mine"), "zzz999yyy": rec("zzz999yyy", 5)}
    theirs = {"abc123def": rec("abc123def", 50, title="theirs"), "new000lesson": rec("new000lesson", 7)}
    out = lessons.merge_state(mine, theirs, now=200)
    assert out["abc123def"]["title"] == "mine", "the copy changed last wins"
    assert set(out) == {"abc123def", "zzz999yyy", "new000lesson"}
    gone = {"abc123def": {"id": "abc123def", "gone": 300, "updated": 300}}
    assert lessons.merge_state(mine, gone, now=301)["abc123def"] == {"id": "abc123def", "gone": 300.0, "updated": 300.0}
    assert "abc123def" not in lessons.merge_state(gone, {}, now=300 + 61 * 86400), "removals are forgotten after 60 days"
    # junk is dropped: a bad id, a record that isn't one, a huge one
    junk = {"x": rec("x", 1), "bad": "nope", "big0000001": rec("big0000001", 1, blob="x" * 500_000)}
    assert lessons.clean_state(junk) == {}
    assert lessons.clean_state("not json") == {}


def test_the_merge_agrees_with_the_phones(tmp_path):
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node isn't on PATH")
    mine = {"abc123def": rec("abc123def", 100, title="A"), "gone00000a": {"id": "gone00000a", "gone": 10, "updated": 10}}
    theirs = {"abc123def": rec("abc123def", 150, title="B"), "new000lesson": rec("new000lesson", 7)}
    script = tmp_path / "m.mjs"
    script.write_text(
        f"import {{ mergeStates }} from {json.dumps((ROOT / 'web/js/lessons.js').as_uri())};\n"
        f"const out = mergeStates({json.dumps(mine)}, {json.dumps(theirs)}, 200);\n"
        "console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [v.updated, !!v.gone, v.title || '']]))));\n",
        encoding="utf-8")
    js = json.loads(subprocess.run([node, str(script)], capture_output=True, text=True, check=True).stdout)
    py = {k: [v["updated"], bool(v.get("gone")), v.get("title", "")] for k, v in lessons.merge_state(mine, theirs, now=200).items()}
    assert js == py


def test_the_setting_is_merged_when_the_page_saves_it(client):
    first = {"abc123def": rec("abc123def", 100)}
    assert client.patch("/api/settings", json={"lesson_state": first}).status_code == 200
    # a page that read the setting before another device's lesson arrived can't drop it
    from app import db

    db.set_settings({"lesson_state": {**first, "other00000": rec("other00000", 50)}})
    out = client.patch("/api/settings", json={"lesson_state": {"abc123def": rec("abc123def", 120, title="changed")}}).json()
    assert set(out["lesson_state"]) == {"abc123def", "other00000"}
    assert out["lesson_state"]["abc123def"]["title"] == "changed"


def test_a_passage_and_its_tracks_are_in_the_lessons_own_list(client):
    r = client.post("/api/books", json={"guid": "file:lesson:abc123def", "title": "Unit 1", "lang": "ar", "list": "lessons",
                                        "blocks": [{"kind": "h2", "text": "الدرس"}, {"kind": "p", "text": "ذهب أحمد إلى السوق."}]})
    assert r.status_code == 200, r.text
    passage = r.json()
    assert passage["audio_type"] == "text/book"
    up = client.post("/api/videos?filename=track-1.wav&lesson=true&transcribe=false", content=WAV.read_bytes())
    assert up.status_code == 200, up.text
    track = up.json()
    assert track["feed_id"] == passage["feed_id"], "the passage and the track share the lessons' list"
    from app import db

    with db.session() as conn:
        url = conn.execute("SELECT url FROM feeds WHERE id = ?", (passage["feed_id"],)).fetchone()["url"]
    assert url == "local:lessons"
    # (a built-in "local:" list: the Library leaves those out of Podcasts, web/js/pages/library.js)
    # not in My books, not in My audio
    mine = client.get("/api/episodes?scope=podcasts").json()["items"]
    assert all(e["id"] not in (passage["id"], track["id"]) for e in mine)
    # found again by the id it has on every device
    assert client.get(f"/api/episodes/uid/{track['uid']}").json()["id"] == track["id"]
    assert client.get("/api/episodes/uid/nope").status_code == 404
    assert client.post("/api/books", json={"guid": "file:x", "blocks": [{"text": "x"}], "list": "elsewhere"}).status_code == 422


def test_a_whole_transcript_is_put_right_by_hand(client):
    up = client.post("/api/videos?filename=track-1.wav&lesson=true&transcribe=false", content=WAV.read_bytes()).json()
    segments = [{"start": 0.0, "end": 1.4, "text": "مرحبا بكم", "words": [[0.0, 0.6, "مرحبا"], [0.7, 1.4, "بكم"]]},
                {"start": 1.5, "end": 2.5, "text": "في الدرس الأول", "words": [[1.5, 1.8, "في"], [1.8, 2.1, "الدرس"], [2.1, 2.5, "الأول"]]}]
    r = client.put(f"/api/episodes/{up['id']}/transcript", json={"segments": segments, "model": "teacher"})
    assert r.status_code == 200, r.text
    assert r.json()["words"] == 5 and r.json()["episode"]["status"] == "done"
    t = client.get(f"/api/episodes/{up['id']}/transcript").json()
    assert [s["text"] for s in t["segments"]] == ["مرحبا بكم", "في الدرس الأول"]
    assert t["words"]["start"][3] == 1.8
    assert t["episode"]["model"] == "teacher"
    # nothing to save, or a book (its text is its blocks): refused
    assert client.put(f"/api/episodes/{up['id']}/transcript", json={"segments": [{"text": "  "}]}).status_code == 400
    book = client.post("/api/books", json={"guid": "file:lesson:x1y2z3w4", "title": "P", "list": "lessons", "blocks": [{"text": "نص"}]}).json()
    assert client.put(f"/api/episodes/{book['id']}/transcript", json={"segments": segments}).status_code == 400
    # the page's token is needed, as for every change (an empty one acts as a stranger: tests/conftest.py)
    r = client.put(f"/api/episodes/{up['id']}/transcript", json={"segments": segments}, headers={"X-Tamkeen-Session": ""})
    assert r.status_code in (401, 403)


def test_a_lesson_track_must_be_sound(client):
    r = client.post("/api/videos?filename=clip.mp4&lesson=true", content=b"\x00\x00\x00\x20ftypisom")
    assert r.status_code == 400


def test_the_record_travels_with_the_library(fresh_db):
    from app import db
    from app.sync import engine

    db.set_settings({"lesson_state": {"abc123def": rec("abc123def", 100)}})
    assert "abc123def" in engine.snapshot("dev")["lessons"]
    result = engine.Result()
    engine.merge({"lessons": {"abc123def": rec("abc123def", 200, title="from the phone"), "new000lesson": rec("new000lesson", 1)}}, result)
    kept = db.get_settings()["lesson_state"]
    assert kept["abc123def"]["title"] == "from the phone" and "new000lesson" in kept
    assert result.merged["lessons"] == 2
