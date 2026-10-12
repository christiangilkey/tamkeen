"""Reels: choosing which to try, judging what Whisper heard, storing, and syncing to another device."""

from __future__ import annotations

import pytest

from app import db, ids, reels
from app.transcriber import Segment, Word

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)

NOW = 1_800_000_000.0
DAY = 86400


def post(code, user, plays=0, likes=0, days=1, comedy=False, **more):
    return {"code": code, "user": user, "plays": plays, "likes": likes, "taken": NOW - days * DAY, "video": True,
            "comedy": comedy, **more}


def seg(start, text, per_word=0.4):
    words = [Word(start + i * per_word, start + (i + 1) * per_word, w) for i, w in enumerate(text.split())]
    return Segment(start, start + len(words) * per_word, text, words)


# ----- usernames and choices -----

def test_usernames_are_tidied():
    assert reels.clean_username(" @Some.Creator ") == "some.creator"
    assert reels.clean_username("https://www.instagram.com/BBCArabic/reels/") == "bbcarabic"
    for bad in ("", "two words", "a" * 31, "naughty<script>", "https://www.instagram.com/reel/abc/"):
        with pytest.raises(reels.ReelError):
            reels.clean_username(bad)


def test_choices_are_kept_and_a_new_creator_starts_chosen(world):
    _, a, _ = world
    with a:
        assert reels.load()["mode"] == "mix" and reels.load()["mine"] == []
        reels.update(mode="mine", add="@First")
        state = reels.update(add="second")
        assert state["mine"] == ["first", "second"] and state["selected"] == ["first", "second"]
        state = reels.update(selected=["second", "stranger"])
        assert state["selected"] == ["second"], "only your own creators can be chosen"
        state = reels.update(remove="second")
        assert state["mine"] == ["first"] and state["selected"] == [] and state["mode"] == "mine"
        with pytest.raises(reels.ReelError):
            reels.update(mode="everything")


# ----- who is popular -----

def test_popular_creators_are_ranked_by_what_is_doing_well_now():
    ranked = reels.rank_creators([
        post("a1", "big", plays=2_000_000, comedy=True), post("a2", "big", plays=900_000, comedy=True),
        post("b1", "likes_only", likes=90_000, comedy=True),       # no play count: likes stand in
        post("c1", "old_hit", plays=5_000_000, days=400, comedy=True),  # popular once, long ago
        post("d1", "not_comedy", plays=1_000_000),
        post("e1", "bad name!", plays=10),
    ], NOW)
    names = [c["username"] for c in ranked]
    assert names[0] == "big" and "bad name!" not in names
    assert names.index("likes_only") < names.index("old_hit"), "recent beats old"
    assert names.index("likes_only") < names.index("not_comedy"), "comedy counts double"
    assert ranked[0]["posts"] == 2


def test_the_popular_list_changes_but_does_not_forget_overnight(world):
    _, a, _ = world
    with a:
        reels.remember_popular("ar", [post("a1", "alpha", plays=1_000_000, comedy=True), post("b1", "beta", plays=50_000, comedy=True)], NOW)
        state = reels.load()
        assert [c["username"] for c in reels.popular_creators(state, "ar")] == ["alpha", "beta"]
        assert reels.popular_is_fresh(state, "ar", NOW + 3600) and not reels.popular_is_fresh(state, "ar", NOW + 13 * 3600)
        assert not reels.popular_is_fresh(state, "es", NOW)
        reels.remember_popular("ar", [post("g1", "gamma", plays=3_000_000, comedy=True)], NOW + DAY)
        names = [c["username"] for c in reels.popular_creators(reels.load(), "ar")]
        assert names[0] == "gamma" and "alpha" in names, "yesterday's favourite fades instead of vanishing"
        assert reels.popular_creators(reels.load(), "es") == []


def test_whose_reels_are_read_depends_on_the_choice(world):
    _, a, _ = world
    with a:
        reels.remember_popular("ar", [post(f"p{i}", f"pop{i}", plays=10 ** (8 - i), comedy=True) for i in range(6)], NOW)
        reels.update(add="mine1")
        reels.update(add="mine2")
        state = reels.load()
        assert reels.creators_to_visit(state, "ar", "mine") == ["mine1", "mine2"]
        assert reels.creators_to_visit(state, "ar", "popular", limit=3) == ["pop0", "pop1", "pop2"]
        assert reels.creators_to_visit(state, "ar", "mix", limit=4) == ["mine1", "mine2", "pop0", "pop1"]
        reels.update(selected=["mine2"])
        assert reels.creators_to_visit(reels.load(), "ar", "mine") == ["mine2"], "only the ticked ones"


# ----- which reels to try -----

def test_candidates_are_unseen_popular_and_take_turns(world):
    _, a, _ = world
    with a:
        reels.update(add="mine1")
        state = reels.load()
        posts = [
            post("big_1", "star", plays=9_000_000, comedy=True), post("big_2", "star", plays=8_000_000, comedy=True),
            post("big_3", "star", plays=7_000_000, comedy=True), post("mid_1", "other", plays=400_000, comedy=True),
            post("seen_1", "star", plays=99_000_000), post("mine_a", "mine1", plays=1000),
            post("photo", "other", plays=5_000_000, video=False), post("long_1", "other", plays=5_000_000, seconds=900),
            post("bad code!", "other", plays=1),
            post("big_1", "star", likes=123),  # the same reel described twice
        ]
        picked = reels.pick_candidates(posts, {"seen_1"}, state, "ar", "popular")
        codes = [p["code"] for p in picked]
        assert codes[:3] == ["big_1", "mid_1", "mine_a"], "each creator's best first, then the second round"
        assert codes[3:] == ["big_2", "big_3"] and len(codes) == len(set(codes))
        assert picked[0]["plays"] == 9_000_000 and picked[0]["likes"] == 123, "two descriptions of a reel are merged"
        assert [p["code"] for p in reels.pick_candidates(posts, set(), state, "ar", "mine")] == ["mine_a"]
        assert reels.pick_candidates(posts, set(), state, "ar", "mix", limit=1)[0]["code"] == "seen_1", \
            "nothing counts as seen here, so the biggest reel comes first"


# ----- judging what was heard -----

SPEECH = [seg(0.5, "يا جماعة احنا النهاردة رايحين نعمل فيديو جديد مع الراجل ده"), seg(6, "شوفوا المفاجأة اللي حصلت في الآخر")]


def test_a_reel_is_kept_only_if_it_is_spoken_in_the_language():
    assert reels.verdict("ar", "ar", 0.97, SPEECH, 12) == ""
    assert "English" in reels.verdict("ar", "en", 0.9, SPEECH, 12)
    assert reels.verdict("ar", "en", 0.3, SPEECH, 12) == "", "an unsure guess doesn't throw a reel out"
    assert "no speech" in reels.verdict("ar", "ar", 0.9, [seg(1, "يلا بينا")], 30)
    assert "no speech" in reels.verdict("ar", "ar", 0.9, SPEECH, 120), "a few words over two minutes of music"
    assert "no speech" in reels.verdict("ar", "ar", 0.9, [], 20)
    # An engine that can't name the language: the letters of the transcript decide.
    assert reels.verdict("ar", None, 0.0, SPEECH, 12) == ""
    assert "not in Russian" in reels.verdict("ru", None, 0.0, SPEECH, 12)


def test_language_is_asked_of_whisper_when_it_can_say():
    class Model:
        def detect_language(self, audio, vad_filter=False):
            return "ar", 0.93, [("ar", 0.93)]

    class Engine:
        model = Model()

    assert reels.spoken_language(Engine(), [0.0] * 16000, "ar") == ("ar", 0.93, 0.93)
    assert reels.spoken_language(object(), [0.0], "ar") == (None, 0.0, 0.0)

    class Torn:  # a real case: a 14-second Arabic reel heard as English by a whisker
        class model:
            @staticmethod
            def detect_language(audio, vad_filter=False):
                return "en", 0.53, [("en", 0.53), ("ar", 0.41), ("tl", 0.01)]

    assert reels.spoken_language(Torn(), [0.0], "ar") == ("en", 0.53, 0.41)
    assert reels.spoken_language(Torn(), [0.0], "ru") == ("en", 0.53, 0.0)


def test_a_near_tie_with_the_studied_language_is_not_thrown_out():
    assert not reels.other_language("ar", "en", 0.53, 0.41), "Arabic is a close second: listen to it as Arabic"
    assert reels.other_language("ar", "en", 0.97, 0.01)
    assert not reels.other_language("ar", "en", 0.4, 0.05), "not sure of anything"
    assert not reels.other_language("ar", "ar", 0.9, 0.9) and not reels.other_language("ar", None, 0.0, 0.0)
    assert reels.verdict("ar", "en", 0.53, SPEECH, 12, 0.41) == ""
    assert "English" in reels.verdict("ar", "en", 0.9, SPEECH, 12, 0.02)


def test_your_own_saves_are_never_skipped_for_language_or_little_speech():
    # A reel you picked: English-sounding, mostly music, whatever. Kept as long as anything is said.
    assert reels.verdict("ar", "en", 0.99, SPEECH, 12, 0.0, own_save=True) == ""
    assert reels.verdict("ar", "en", 0.99, [seg(1, "hello habibi")], 60, 0.0, own_save=True) == ""
    assert "nothing is said" in reels.verdict("ar", "en", 0.99, [], 20, 0.0, own_save=True)
    assert "English" in reels.verdict("ar", "en", 0.99, SPEECH, 12, 0.0), "found reels keep the strict rule"


def test_your_own_saves_are_kept_in_any_language_the_app_teaches():
    # Studying Arabic. A French save is kept as French; an English one is still skipped (not taught).
    assert reels.language_to_use("ar", "fr", 0.95, True, 0.0) == "fr"
    assert reels.language_to_use("ar", "fr", 0.95, False, 0.0) == "ar", "only for your own saves, not for found reels"
    assert reels.language_to_use("ar", "en", 0.95, True, 0.0) == "ar"
    assert reels.language_to_use("ar", "fr", 0.4, True, 0.0) == "ar", "not sure enough to call it French"
    assert reels.language_to_use("ar", "fr", 0.55, True, 0.4) == "ar", "a near tie goes to the language being studied"
    assert reels.language_to_use("ar", None, 0.0, True, 0.0) == "ar"


# ----- storing and syncing -----

def test_a_reel_is_stored_as_its_address_and_its_words(world):
    _, a, _ = world
    with a:
        ep = reels.save_reel("DdWrMMkitIL", "@HamoStreet1", "واحد صعيدي راكب حمار 😱 #كوميديا #ضحك\nmore", SPEECH,
                             "ar", "faster-whisper:large-v3:cuda", 158.6)
        assert ep["audio_url"] == "https://www.instagram.com/reel/DdWrMMkitIL/" and ep["audio_type"] == "video/instagram"
        assert ep["status"] == "done" and ep["description"] == "hamostreet1" and ep["guid"] == "DdWrMMkitIL"
        assert ep["title"] == "واحد صعيدي راكب حمار 😱", "the first line, without its hashtags"
        assert ep["duration"] == 158.6 and ep["language"] == "ar" and ep["words"] == 17
        with db.session() as conn:
            feed = conn.execute("SELECT url, uid FROM feeds WHERE id = ?", (ep["feed_id"],)).fetchone()
            words = conn.execute("SELECT start, text FROM words WHERE episode_id = ? ORDER BY idx", (ep["id"],)).fetchall()
            hits = conn.execute("SELECT COUNT(*) FROM segments_fts WHERE episode_id = ?", (ep["id"],)).fetchone()[0]
        assert feed["url"] == reels.LOCAL_FEED_URL and ep["uid"] == ids.episode_uid(feed["uid"], "DdWrMMkitIL")
        assert words[0]["text"] == "يا" and words[0]["start"] == 0.5 and hits == 2
        again = reels.save_reel("DdWrMMkitIL", "hamostreet1", "", SPEECH[:1], "ar", "m")
        assert again["id"] == ep["id"] and again["title"] == "@hamostreet1" and again["words"] == 11
        for code, creator in (("bad code!", "x"), ("DdWrMMkitIL", "not a name")):
            with pytest.raises(reels.ReelError):
                reels.save_reel(code, creator, "", SPEECH, "ar", "m")
        with pytest.raises(reels.ReelError):
            reels.save_reel("DdWrMMkitIL", "x", "", [Segment(0, 1, "  ", [])], "ar", "m")


def test_seen_reels_are_remembered(world):
    _, a, _ = world
    with a:
        reels.mark_seen(["a", "b"])
        reels.mark_seen(["b", "c"])
        assert reels.load()["seen"] == ["a", "b", "c"]


def test_a_reel_reaches_the_phone_as_words_only(world):
    drive, a, b = world
    with a:
        ep = reels.save_reel("DdWrMMkitIL", "hamostreet1", "caption", SPEECH, "ar", "faster-whisper:large-v3:cuda", 158.6)
    r = a.sync(drive)
    assert r.uploaded_transcripts >= 1 and r.uploaded_audio == 0, "nothing of the video is stored or sent"
    assert not [f for f in drive.files.values() if f["name"].startswith("v_")]
    rb = b.sync(drive)
    with b:
        with db.session() as conn:
            row = conn.execute("SELECT * FROM episodes WHERE uid = ?", (ep["uid"],)).fetchone()
            n = conn.execute("SELECT COUNT(*) FROM words WHERE episode_id = ?", (row["id"],)).fetchone()[0]
        assert row["feed_id"] not in rb.new_feeds, "the Reels list has no RSS to fetch"
        assert row["status"] == "done" and row["audio_type"] == "video/instagram" and row["guid"] == "DdWrMMkitIL" and n == 17


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def test_reels_api(client, monkeypatch):
    monkeypatch.delenv("APS_DESKTOP", raising=False)
    view = client.get("/api/reels").json()
    assert view["mode"] == "mix" and view["available"] is False and view["status"]["running"] is False
    assert client.put("/api/reels/choices", json={"mode": "mine", "add": "@Creator"}).json()["selected"] == ["creator"]
    assert client.put("/api/reels/choices", json={"add": "not a name"}).status_code == 400
    r = client.post("/api/reels/batch", json={"count": 10})
    assert r.status_code == 400 and "installed computer app" in r.json()["detail"], "no window to work in here"
    assert client.post("/api/reels/cancel").json()["running"] is False


# ----- reels from the user's own Instagram saves -----

SAVED_LINKS = [
    {"path": "/me.name/saved/arabic-comedy/18012345678901234/", "name": "Arabic comedy\n12 posts"},
    {"path": "/me.name/saved/all-posts/", "name": "All posts"},                 # not a collection of its own
    {"path": "/me.name/saved/to-watch/17900000000000001", "name": ""},          # no name shown, no final slash
    {"path": "/me.name/saved/arabic-comedy/18012345678901234/?x=1", "name": "again"},  # the same one twice
    {"path": "/someone/p/ABCDEFGHIJK/", "name": "a post"},
    {"path": "https://evil.example/me/saved/x/18012345678901234/", "name": "elsewhere"},
    "nonsense",
]


def test_saved_collections_are_read_from_the_saved_pages_links(world):
    _, a, _ = world
    with a:
        found = reels.remember_collections(SAVED_LINKS)
        assert found == [
            {"id": "18012345678901234", "name": "Arabic comedy", "path": "/me.name/saved/arabic-comedy/18012345678901234/"},
            {"id": "17900000000000001", "name": "Collection 2", "path": "/me.name/saved/to-watch/17900000000000001/"},
        ]
        state = reels.load()
        assert state["collection"] == "all", "until one is chosen, it is everything saved"
        assert reels.saved_path(state, "Me.Name") == "/me.name/saved/all-posts/"
        state = reels.update(mode="saved", collection="17900000000000001")
        assert state["mode"] == "saved" and reels.saved_path(state, "me.name") == "/me.name/saved/to-watch/17900000000000001/"
        with pytest.raises(reels.ReelError):
            reels.update(collection="555")
        # The collection was deleted on Instagram: the choice falls back to everything saved.
        reels.remember_collections(SAVED_LINKS[:1])
        assert reels.load()["collection"] == "all"


def test_saves_are_tried_in_their_own_order_whoever_made_them(world):
    _, a, _ = world
    with a:
        reels.update(mode="saved")
        state = reels.load()
        posts = [
            {"code": "saved_new_1"},                                      # nothing known yet: looked up when tried
            {"code": "saved_old_2", "user": "Someone", "plays": 5, "caption": "x"},
            {"code": "saved_new_1", "user": "dup"},
            {"code": "seen_before"},
            {"code": "bad code!"},
            {"code": "saved_big_3", "user": "star", "plays": 9_000_000},
        ]
        picked = reels.pick_candidates(posts, {"seen_before"}, state, "ar")
        assert [p["code"] for p in picked] == ["saved_new_1", "saved_old_2", "saved_big_3"], "saved order, not popularity"
        assert picked[0]["user"] == "" and picked[1]["user"] == "someone"
        assert len(reels.pick_candidates(posts, set(), state, "ar", limit=2)) == 2


def test_saved_choices_through_the_api(client, monkeypatch):
    monkeypatch.delenv("APS_DESKTOP", raising=False)
    reels.remember_collections(SAVED_LINKS)
    view = client.get("/api/reels").json()
    assert view["collections"] == [{"id": "18012345678901234", "name": "Arabic comedy"}, {"id": "17900000000000001", "name": "Collection 2"}]
    assert "path" not in view["collections"][0], "the page only needs names; the address (with the username) stays behind"
    view = client.put("/api/reels/choices", json={"mode": "saved", "collection": "18012345678901234"}).json()
    assert view["mode"] == "saved" and view["collection"] == "18012345678901234"
    assert client.put("/api/reels/choices", json={"collection": "nope"}).status_code == 400
    r = client.post("/api/reels/collections")
    assert r.status_code == 400 and "installed computer app" in r.json()["detail"]
