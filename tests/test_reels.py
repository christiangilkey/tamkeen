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
    # Studying Arabic. A French save is kept as French; a German one is still skipped (not taught).
    assert reels.language_to_use("ar", "fr", 0.95, True, 0.0) == "fr"
    assert reels.language_to_use("ar", "fr", 0.95, False, 0.0) == "ar", "only for your own saves, not for found reels"
    assert reels.language_to_use("ar", "de", 0.95, True, 0.0) == "ar"
    assert reels.language_to_use("ar", "fr", 0.4, True, 0.0) == "ar", "not sure enough to call it French"
    assert reels.language_to_use("ar", "fr", 0.55, True, 0.4) == "ar", "a near tie goes to the language being studied"
    assert reels.language_to_use("ar", None, 0.0, True, 0.0) == "ar"


def test_hindi_heard_as_urdu_is_hindi():
    """Spoken Hindi and Urdu sound the same (only their writing differs): Whisper's "Urdu" is Hindi when
    Hindi is being studied, and is listened to as Hindi (in Devanagari)."""
    from app import languages

    assert languages.heard_as_study("ur", "hi") and languages.heard_as_study("hi", "hi")
    assert not languages.heard_as_study("ur", "ar") and not languages.heard_as_study("en", "hi")
    assert not reels.other_language("hi", "ur", 0.95, 0.02)
    assert reels.other_language("hi", "en", 0.95, 0.02)

    class Engine:
        class model:
            @staticmethod
            def detect_language(audio, vad_filter=False):
                return "ur", 0.7, [("ur", 0.7), ("hi", 0.2), ("en", 0.05)]

    assert reels.spoken_language(Engine(), [0.0], "hi") == ("hi", 0.7, 0.7)
    assert reels.spoken_language(Engine(), [0.0], "ar") == ("ur", 0.7, 0.0)


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


def test_why_a_reel_could_not_be_used_is_remembered_until_it_is_kept(world):
    _, a, _ = world
    with a:
        reels.mark_outcome("code_one_11", "can't be shown outside Instagram")
        reels.mark_outcome("code_two_22", "nothing is said in it")
        assert reels.load()["skipped"] == {"code_one_11": "can't be shown outside Instagram", "code_two_22": "nothing is said in it"}
        reels.mark_outcome("code_one_11")  # tried again later and kept
        assert reels.load()["skipped"] == {"code_two_22": "nothing is said in it"}
        reels.update(mode="saved")
        assert reels.load()["skipped"], "changing a choice doesn't lose it"


def test_the_picking_list_is_tidied():
    posts = [
        {"code": "ABCDEFGHIJK", "user": "Some.One", "caption": "first line\n  second", "seconds": "14.6", "thumb": "https://scontent.cdninstagram.com/a.jpg?x=1"},
        {"code": "ABCDEFGHIJK", "user": "again"},
        {"code": "bad code"},
        {"code": "PHOTO123456", "video": False, "thumb": "https://evil.example/a.jpg", "user": "not a name!"},
    ]
    assert reels.tidy_listing(posts) == [
        {"code": "ABCDEFGHIJK", "user": "some.one", "caption": "first line second", "video": True, "seconds": 14, "thumb": "https://scontent.cdninstagram.com/a.jpg?x=1"},
        {"code": "PHOTO123456", "user": "", "caption": "", "video": False, "seconds": 0, "thumb": ""},
    ]
    assert len(reels.tidy_listing([{"code": f"code_{i:06d}"} for i in range(200)])) == reels.LIST_LIMIT
    for ok in ("https://scontent-sjc3-1.cdninstagram.com/v/x.jpg", "https://instagram.fabc1-1.fna.fbcdn.net/x.jpg"):
        assert reels.thumb_allowed(ok)
    for bad in ("http://x.cdninstagram.com/x.jpg", "https://cdninstagram.com.evil.net/x.jpg", "https://evil.example/cdninstagram.com/x.jpg",
                "https://127.0.0.1/x.jpg", "file:///c:/x.jpg", "", "nonsense"):
        assert not reels.thumb_allowed(bad), bad


def test_picking_api(client, monkeypatch):
    monkeypatch.delenv("APS_DESKTOP", raising=False)
    assert client.get("/api/reels/saved").json() == {"collection": "", "at": 0.0, "posts": []}
    for path, body in (("/api/reels/saved/list", {"collection": "all"}), ("/api/reels/saved/send", {"codes": ["ABCDEFGHIJK"]})):
        r = client.post(path, json=body)
        assert r.status_code == 400 and "installed computer app" in r.json()["detail"], path
    assert client.post("/api/reels/saved/list", json={"collection": "no-such"}).status_code == 400
    assert client.get("/api/reels/thumb", params={"u": "https://evil.example/x.jpg"}).status_code == 400


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


def test_the_episode_list_says_each_reels_language(client):
    # The reel player on the computer draws the words in this language (direction, dictionaries,
    # lookups); without it every reel was taken for Arabic.
    from app import db
    db.set_settings({"study_language": "es"})
    reels.save_reel("DdWrMMkitIL", "creator", "", SPEECH, "es", "m")
    feed = next(f for f in client.get("/api/feeds").json() if f["url"] == reels.LOCAL_FEED_URL)
    items = client.get(f"/api/episodes?feed_id={feed['id']}").json()["items"]
    assert [e["language"] for e in items] == ["es"]


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


# ----- reels Instagram plays only to someone signed in -----

def test_a_reel_that_needs_a_sign_in_is_marked_in_its_address(world):
    _, a, _ = world
    with a:
        plain = reels.save_reel("PLAINreel01", "someone", "x", SPEECH, "ar", "m")
        assert plain["audio_url"] == "https://www.instagram.com/reel/PLAINreel01/" and not reels.needs_signin(plain["audio_url"])
        marked = reels.save_reel("MUSICreel02", "someone", "x", SPEECH, "ar", "m", signin=True)
        assert marked["audio_url"] == "https://www.instagram.com/reel/MUSICreel02/#signin" and reels.needs_signin(marked["audio_url"])
        assert marked["audio_type"] == "video/instagram" and marked["guid"] == "MUSICreel02", "still an ordinary reel otherwise"
        # Saved again later, when its embed page does play: the mark goes.
        again = reels.save_reel("MUSICreel02", "someone", "x", SPEECH, "ar", "m")
        assert again["id"] == marked["id"] and not reels.needs_signin(again["audio_url"])
    assert not reels.needs_signin(None) and not reels.needs_signin("")


def test_saves_once_skipped_as_not_playable_outside_can_be_picked_again(world, monkeypatch):
    from app import reels_worker

    _, a, _ = world
    with a:
        monkeypatch.setattr(reels_worker, "_listing", {"collection": "all", "at": 1.0, "posts": reels.tidy_listing(
            [{"code": "MUSICreel02"}, {"code": "SILENTreel3"}, {"code": "KEPTreel004"}])})
        reels.mark_outcome("MUSICreel02", reels.NOT_OUTSIDE)        # from before such reels were kept
        reels.mark_outcome("SILENTreel3", "nothing is said in it")
        reels.save_reel("KEPTreel004", "someone", "x", SPEECH, "ar", "m")
        posts = {p["code"]: p for p in reels_worker.listing()["posts"]}
        assert posts["MUSICreel02"]["skipped"] == "" and not posts["MUSICreel02"]["have"], "tickable again"
        assert posts["SILENTreel3"]["skipped"] == "nothing is said in it"
        assert posts["KEPTreel004"]["have"] and posts["KEPTreel004"]["skipped"] == ""


# ----- every collection, not only the few the Saved page draws -----

def test_collections_found_through_the_saves_join_the_ones_on_the_saved_page(world):
    _, a, _ = world
    with a:
        on_page = [{"path": "/learner/saved/arabic/17900000000000001/", "name": "Arabic\n12 posts"},
                   {"path": "/learner/", "name": "not a collection"}]
        named = {"17900000000000001": "Arabic 🇸🇦", "17900000000000002": "Funny", "17900000000000003": "", "x": "Nope"}
        before = [{"id": "17900000000000009", "name": "Old one", "path": "/learner/saved/old-one/17900000000000009/"}]
        got = reels.merge_collections(on_page, named, "Learner", before, complete=False)
        assert [(c["id"], c["name"]) for c in got] == [
            ("17900000000000001", "Arabic 🇸🇦"),   # the collection's own name, not the link's text
            ("17900000000000002", "Funny"),        # known only from the saves
            ("17900000000000009", "Old one"),      # not reached this time, so kept
        ]
        assert got[0]["path"] == "/learner/saved/arabic/17900000000000001/"
        assert got[1]["path"] == "/learner/saved/c/17900000000000002/", "a stand-in name in the address; Instagram goes by the number"
        # Every save was read: a collection that didn't turn up is gone.
        assert [c["id"] for c in reels.merge_collections(on_page, named, "learner", before, complete=True)] == [
            "17900000000000001", "17900000000000002"]
        # What comes out can be remembered and chosen, and gives the page to read.
        reels.remember_collections(got)
        state = reels.update(collection="17900000000000002")
        assert reels.saved_path(state, "learner") == "/learner/saved/c/17900000000000002/"


# ----- "Get random reels": a number of reels found by searching for everyday words -----

def test_random_reels_have_words_to_search_for_in_every_language_reels_cover():
    assert set(reels.RANDOM_WORDS) == set(reels.COMEDY_WORDS)
    for lang, words in reels.RANDOM_WORDS.items():
        assert len(words) >= 2 * reels.RANDOM_SEARCHES, lang  # so two batches in a row needn't search the same words
        assert len(set(words)) == len(words) and all(w and " " not in w for w in words), lang  # each is also looked up as a hashtag


def test_the_phone_searches_for_the_same_random_words():
    import json
    import re
    from pathlib import Path

    js = (Path(__file__).resolve().parents[1] / "mobile" / "src" / "js" / "reels-phone.js").read_text(encoding="utf-8")
    block = js[js.index("export const RANDOM_WORDS = {"):]
    block = block[block.index("{"): block.index("};") + 1]
    phone = json.loads(re.sub(r"\n\s*(\w+): \[", r'\n"\1": [', block).replace("],\n}", "]\n}"))
    assert phone == reels.RANDOM_WORDS


def test_random_reels_are_picked_from_what_a_search_found():
    import random

    found = [
        {"code": "GoodReel001", "user": "Some.Creator", "video": True, "seconds": 34},
        {"code": "GoodReel001", "user": "some.creator", "video": True, "seconds": 34},   # the same one again
        {"code": "KeptBefore2", "user": "someone", "video": True, "seconds": 20},        # already in the library
        {"code": "TriedOnce03", "user": "someone", "video": True, "seconds": 20},        # listened to before
        {"code": "MusicReel04", "user": "someone", "video": True, "seconds": 20, "music": True},  # plays only signed in
        {"code": "APhoto00005", "user": "someone", "video": False},
        {"code": "LongVideo06", "user": "someone", "video": True, "seconds": reels.MAX_SECONDS + 1},
        {"code": "Blink000007", "user": "someone", "video": True, "seconds": 3},
        {"code": "NoMaker0008", "user": "", "video": True, "seconds": 20},
        {"code": "bad code", "user": "someone", "video": True, "seconds": 20},
        {"code": "GoodReel009", "user": "another", "video": True},                        # length unknown: tried
        {"code": "GoodReel010", "user": "third", "video": True, "seconds": 59},
    ]
    picked = reels.pick_random(found, {"KeptBefore2", "TriedOnce03"}, random.Random(1))
    assert sorted(p["code"] for p in picked) == ["GoodReel001", "GoodReel009", "GoodReel010"]
    assert next(p for p in picked if p["code"] == "GoodReel001")["user"] == "some.creator"
    orders = {tuple(p["code"] for p in reels.pick_random(found, set(), random.Random(seed))) for seed in range(12)}
    assert len(orders) > 1, "a different order each time"
    assert reels.pick_random([], set()) == []


def test_random_reels_api(client, monkeypatch):
    monkeypatch.delenv("APS_DESKTOP", raising=False)
    assert client.get("/api/reels").json()["random"] is True, "Arabic has words to search for"
    r = client.post("/api/reels/random", json={"count": 5})
    assert r.status_code == 400 and "installed computer app" in r.json()["detail"], "no window to work in here"


# ----- saved collections shared with the phone through the library sync -----

def test_synced_collections_merge_like_the_phones():
    # The same cases as "two devices agree" in tests/js/igcollections.test.mjs: both must give this.
    phone = {"at": 100, "items": [{"id": "17900000000000001", "name": "Arabic"}, {"id": "17900000000000002", "name": "Cooking 🍲"}],
             "chosen": "17900000000000002", "chosen_at": 300}
    computer = {"at": 200, "items": [{"id": "17900000000000001", "name": "Arabic"}, {"id": "17900000000000003", "name": "Funny"}],
                "chosen": "17900000000000003", "chosen_at": 250}
    expected = {"at": 200, "items": computer["items"], "chosen": "all", "chosen_at": 300}
    assert reels.merge_synced_collections(phone, computer) == expected
    assert reels.merge_synced_collections(computer, phone) == expected
    assert reels.merge_synced_collections(expected, expected) == expected
    chose = {**phone, "chosen": "17900000000000001"}
    assert reels.merge_synced_collections(chose, computer)["chosen"] == "17900000000000001"
    assert reels.merge_synced_collections(computer, chose)["chosen"] == "17900000000000001"
    empty = {"at": 0, "items": [], "chosen": "all", "chosen_at": 0}
    assert reels.merge_synced_collections(empty, phone) == reels.clean_synced_collections(phone)
    assert reels.merge_synced_collections(phone, None) == reels.clean_synced_collections(phone)
    a = {"at": 5, "items": [{"id": "17900000000000001", "name": "😀"}]}
    b = {"at": 5, "items": [{"id": "17900000000000001", "name": "ﻻ"}]}
    assert reels.merge_synced_collections(a, b) == reels.merge_synced_collections(b, a)
    assert reels.merge_synced_collections(a, b)["items"][0]["name"] == "ﻻ", "the same pick JavaScript makes"
    # And the tidying, as in "anything odd becomes a tidy record".
    assert reels.clean_synced_collections([1, 2]) == empty
    assert reels.clean_synced_collections({
        "at": "12.9", "chosen": "17900000000000002", "chosen_at": -5,
        "items": [{"id": "17900000000000001", "name": "  Arabic \n comedy "}, {"id": "17900000000000002x"},
                  {"id": "17900000000000001", "name": "again"}, {"id": "12", "name": "too short"}, "nope",
                  {"id": "17900000000000003", "name": "x" * 90}],
    }) == {"at": 12, "chosen": "all", "chosen_at": 0,
           "items": [{"id": "17900000000000001", "name": "Arabic comedy"}, {"id": "17900000000000003", "name": "x" * 80}]}


def test_collections_found_on_one_device_reach_the_other(world):
    drive, a, b = world
    with a:
        reels.remember_collections(SAVED_LINKS)
        reels.update(collection="18012345678901234")
        assert reels.saved_path(reels.load(), "learner") == "/me.name/saved/arabic-comedy/18012345678901234/"
    a.sync(drive)
    r = b.sync(drive)
    assert r.merged.get("ig_collections") == 1
    with b:
        state = reels.load()
        assert [(c["id"], c["name"]) for c in state["collections"]] == [("18012345678901234", "Arabic comedy"), ("17900000000000001", "Collection 2")]
        assert state["collection"] == "18012345678901234"
        # B never saw the Saved page, so it goes to the collection by its number (Instagram corrects the rest).
        assert reels.saved_path(state, "learner") == "/learner/saved/c/18012345678901234/"
    assert not b.sync(drive).library_uploaded, "receiving the list must not send it back"
    # B chooses another collection later: A takes the choice and keeps its own page addresses.
    with b:
        reels.update(collection="17900000000000001")
        b_state = reels.load()
        b_state["collection_at"] += 5  # (so it is later than A's choice, made within the same second)
        reels.save(b_state)
    b.sync(drive)
    a.sync(drive)
    with a:
        state = reels.load()
        assert state["collection"] == "17900000000000001"
        assert state["collections"][0]["path"] == "/me.name/saved/arabic-comedy/18012345678901234/"
