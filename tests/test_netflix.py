"""Netflix titles (app/netflix.py, app/netflix_overlay.py): reading Netflix's subtitle files, choosing
the right one, keeping titles in the library, and placing the video window over the stage.

The subtitle lines here are written for these tests; nothing comes from Netflix."""

from __future__ import annotations

import pytest

from app import db, jobs, netflix
from app.netflix_overlay import screen_box
from app.sync import engine

from test_sync import FakeDrive, world  # noqa: F401  (pytest fixture)

TICKS = 10_000_000


@pytest.fixture(autouse=True)
def fresh_catcher(monkeypatch):
    """Each test starts with nothing caught yet (the catcher lives for the whole run of the app)."""
    monkeypatch.setattr(netflix, "catcher", netflix.SubtitleCatcher())
    monkeypatch.setattr(netflix, "_choices", {})
    monkeypatch.setattr(netflix, "_waits", {})
    monkeypatch.setattr(netflix, "_timers", {})


def ttml(lang: str, cues: list[tuple[float, float, str]], extra_root: str = "", tick: bool = True) -> str:
    """A subtitle file shaped like Netflix's (DFXP, times in ticks)."""
    ps = []
    for i, (b, e, text) in enumerate(cues):
        when = f'begin="{int(b * TICKS)}t" end="{int(e * TICKS)}t"' if tick else f'begin="{b}s" end="{e}s"'
        ps.append(f'<p {when} region="region0" style="s1" xml:id="subtitle{i + 1}">{text}</p>')
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<tt xmlns:tt="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" '
            'xmlns:tts="http://www.w3.org/ns/ttml#styling" ttp:tickRate="10000000" ttp:timeBase="media" '
            f'xmlns="http://www.w3.org/ns/ttml" xml:lang="{lang}" {extra_root}>\n'
            '<head><ttp:profile use="http://netflix.com/ttml/profile/dfxp-ls-sdh"/><styling>'
            '<style tts:fontStyle="italic" xml:id="s2"/></styling><layout><region xml:id="region0"/></layout></head>\n'
            '<body><div xml:space="preserve">\n' + "\n".join(ps) + "\n</div></body></tt>\n")


FULL = [(2.0, 5.2, "مرحباً، كيف حالك اليوم؟"), (6.0, 9.2, "أنا بخير، شكراً."), (10.0, 13.2, "‫الجو جميل جداً.‬"),
        (14.0, 17.2, "[موسيقى]"), (18.0, 21.2, "- هل رأيت أخي؟<br/>- لا، لم أره."),
        (22.0, 25.2, '<span style="s2">هذا</span> كتاب جديد.')]
FORCED = [(10.0, 12.0, "مقهى البحر"), (40.0, 42.0, "شارع النخيل")]


# ----- reading TTML -----

def test_reads_netflix_subtitles_ticks_spans_and_line_breaks():
    parsed = netflix.parse_ttml(ttml("ar-LB", FULL))
    assert parsed["lang"] == "ar-LB"
    assert parsed["cues"] == [
        (2.0, 5.2, "مرحباً، كيف حالك اليوم؟"), (6.0, 9.2, "أنا بخير، شكراً."), (10.0, 13.2, "الجو جميل جداً."),
        (18.0, 21.2, "هل رأيت أخي؟ لا، لم أره."), (22.0, 25.2, "هذا كتاب جديد.")], \
        "bidi marks, sound labels and speakers' dashes are gone; a line break is a space; a cue of only a sound label is dropped"


def test_reads_every_kind_of_ttml_time():
    r = netflix._Rates(tick=10_000_000, frame=25, sub=2)
    t = netflix.ttml_seconds
    assert t("240000000t", r) == 24.0
    assert t("00:00:24.500", r) == 24.5 and t("01:02:03", r) == 3723 and t("00:00:24,25", r) == 24.25
    assert t("00:00:24:10", r) == pytest.approx(24.4) and t("00:00:24:10.1", r) == pytest.approx(24.42)
    assert t("1.5h", r) == 5400 and t("2m", r) == 120 and t("24.5s", r) == 24.5 and t("1500ms", r) == 1.5 and t("50f", r) == 2
    assert t("", r) is None and t("soon", r) is None and t(None, r) is None


def test_clock_times_durations_nested_offsets_and_missing_ends():
    text = ('<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="es"><body><div begin="10s">'
            '<p begin="00:00:01.000" end="00:00:03.000">Hola</p>'
            '<p begin="4s" dur="1.5s">¿Qué tal?</p>'
            '<p begin="7s">Sin final</p>'
            '<p begin="9s" end="10s">   </p>'
            '</div><div><p begin="00:00:02.000" end="00:00:02.500">Primero</p></div></body></tt>')
    parsed = netflix.parse_ttml(text)
    assert parsed["lang"] == "es"
    assert parsed["cues"] == [(2.0, 2.5, "Primero"), (11.0, 13.0, "Hola"), (14.0, 15.5, "¿Qué tal?"), (17.0, None, "Sin final")], \
        "times are inside their division's own start; in order; an empty cue is dropped"
    lines = netflix.caption_lines(parsed["cues"])
    assert lines[-1]["start"] == 17.0 and lines[-1]["end"] == 19.0, "no end given: two seconds"


def test_frame_rate_and_multiplier():
    text = ('<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:frameRate="30" '
            'ttp:frameRateMultiplier="1000 1001" xml:lang="fr"><body><p begin="00:00:01:15" end="90f">Bonjour</p></body></tt>')
    (b, e, _), = netflix.parse_ttml(text)["cues"]
    assert b == pytest.approx(1 + 15 / 29.97, abs=1e-3) and e == pytest.approx(90 / 29.97, abs=1e-3)


def test_refuses_what_isnt_a_subtitle_file():
    for bad in ("", "not xml at all", "<html><body>Pardon the interruption</body></html>",
                '<!DOCTYPE tt [<!ENTITY a "aaaa">]><tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1s">&a;</p></body></tt>',
                b"x" * (netflix.MAX_TTML_BYTES + 1)):
        with pytest.raises(netflix.NetflixError):
            netflix.parse_ttml(bad)
    assert netflix.parse_ttml(ttml("ar", FULL).encode("utf-8"))["cues"], "bytes are fine too"


def test_caption_lines_end_where_the_next_begins_and_spread_their_words():
    lines = netflix.caption_lines([(1.0, 4.0, "uno dos"), (3.0, 5.0, "tres"), (3.0, 3.0, "cuatro")])
    assert [(x["start"], x["end"]) for x in lines] == [(1.0, 3.0), (3.0, 5.0), (3.0, 3.5)], \
        "two speakers shown at once keep their own ends; a cue without length gets half a second"
    assert lines[0]["words"] == [[1.0, 2.0, "uno"], [2.0, 3.0, "dos"]], "spread in proportion to their length"
    starts = [w[0] for x in lines for w in x["words"]]
    assert starts == sorted(starts), "times never run backwards"


# ----- addresses and languages -----

def test_addresses(monkeypatch):
    monkeypatch.delenv("TAMKEEN_NETFLIX_BASE", raising=False)
    assert netflix.watch_url("81234567") == "https://www.netflix.com/watch/81234567"
    assert netflix.watch_id("https://www.netflix.com/watch/81946364?trackId=264163088&tctx=x") == "81946364"
    assert netflix.watch_id("https://www.netflix.com/title/81946364") == "" and netflix.watch_id("https://evil.example/watch/123456") == ""
    assert netflix.start_address("") == "https://www.netflix.com/browse/original-audio"
    assert netflix.start_address("https://www.netflix.com/browse/audio") == "https://www.netflix.com/browse/audio"
    assert netflix.start_address("https://evil.example/browse") == "https://www.netflix.com/browse/original-audio"
    assert not netflix.on_netflix("http://www.netflix.com/browse"), "only https"
    for bad in ("", "abc", "12", "1234567890123", "81234567; drop"):
        with pytest.raises(netflix.NetflixError):
            netflix.clean_id(bad)
    assert netflix.clean_id(" 81234567 ") == "81234567"


def test_a_local_stand_in_for_tests_only(monkeypatch):
    monkeypatch.setenv("TAMKEEN_NETFLIX_BASE", "http://127.0.0.1:8931")
    assert netflix.hosts() == {"127.0.0.1"} and netflix.watch_url("80001001") == "http://127.0.0.1:8931/watch/80001001"
    assert netflix.on_netflix("http://127.0.0.1:8931/watch/80001001")
    monkeypatch.setenv("TAMKEEN_NETFLIX_BASE", "https://evil.example")
    assert netflix.base_url() == "https://www.netflix.com", "only a local address can stand in for Netflix"


def test_which_downloads_may_be_subtitle_files(monkeypatch):
    monkeypatch.delenv("TAMKEEN_NETFLIX_SUBS", raising=False)
    xml = {"Content-Type": "text/xml"}
    assert netflix.is_subtitle_download("https://ipv6-c005-smf001-t-mobile-isp.1.oca.nflxvideo.net/?o=1&v=2&e=3", xml)
    assert not netflix.is_subtitle_download("https://occ-0-1.nflxso.net/dnm/api/v6/x.svg", {"content-type": "image/svg+xml"})
    assert not netflix.is_subtitle_download("https://x.oca.nflxvideo.net/range/0-100", {"content-type": "application/octet-stream"})
    assert not netflix.is_subtitle_download("https://nflxvideo.net.evil.example/?o=1", xml)
    assert not netflix.is_subtitle_download("https://x.oca.nflxvideo.net/?o=1", {"content-type": "image/svg+xml"})
    monkeypatch.setenv("TAMKEEN_NETFLIX_SUBS", r"^localhost$")
    assert netflix.is_subtitle_download("http://localhost:8932/sub/1/full.ttml", xml)
    assert not netflix.is_subtitle_download("https://x.oca.nflxvideo.net/?o=1", xml)


def test_language_codes():
    assert [netflix.base_language(c) for c in ("ar-LB", "zh-Hans", "fil", "pt-BR", "es-419", "nb", "", None)] == \
        ["ar", "zh", "tl", "pt", "es", "no", "", ""]


# ----- choosing among the files that arrive -----

def test_catcher_keeps_the_full_file_in_the_language_being_learned():
    now = [100.0]
    c = netflix.SubtitleCatcher(clock=lambda: now[0])
    c.begin("81")
    assert not c.offer("81", {"lang": "en", "cues": [(1, 2, "Hi")]}, "ar"), "another language"
    assert c.offer("81", {"lang": "ar-LB", "cues": [(1, 2, "x")] * 2}, "ar"), "forced lines (few) count, for now"
    assert c.offer("81", {"lang": "ar", "cues": [(1, 2, "y")] * 5}, "ar")
    assert not c.offer("81", {"lang": "ar", "cues": [(1, 2, "y")] * 5}, "ar"), "the same file twice"
    assert len(c.best("81").cues) == 5, "the most lines"
    assert c.offer("81", {"lang": "ar-LB", "cues": [(1, 2, "z")] * 4}, "ar")
    assert c.best("81", chosen="ar-LB").lang == "ar-LB", "the variant the page chose comes first"
    now[0] += c.WINDOW + 1
    assert not c.offer("81", {"lang": "ar", "cues": [(1, 2, "w")] * 50}, "ar"), "too late: perhaps the next episode's"
    c.mark_saved("81", c.best("81", "ar-LB"))
    assert c.is_saved("81", c.best("81", "ar-LB"))


# ----- titles in the library -----

def test_title_info_and_names():
    info = netflix.clean_info({"title": "  La  casa ", "show": "", "image": "http://insecure.example/x.jpg", "duration": "5400.7",
                               "season": "x", "evil": "<script>"})
    assert info == {"title": "La casa", "show": "", "season": None, "episode": None, "episode_title": "", "image": "",
                    "duration": 5400}
    assert netflix.display_title({"show": "حكايات الحي", "season": 1, "episode": 2, "episode_title": "المساء"}) == "حكايات الحي · S1:E2 · المساء"
    assert netflix.display_title({"show": "Dark", "title": "Dark"}) == "Dark"
    assert netflix.display_title({}) == "Netflix title"


def test_a_title_is_kept_and_then_gets_its_subtitles(fresh_db):
    ep = netflix.save_title("80001001", {"title": "بيت الجدة", "image": "https://occ.example/box.jpg"}, "ar")
    assert ep["audio_type"] == "video/netflix" and ep["status"] == "done" and ep["model"] == "netflix-pending"
    assert ep["audio_url"].endswith("/watch/80001001") and ep["words"] == 0 and ep["language"] == "ar"
    again = netflix.save_title("80001001", {}, "ar")
    assert again["id"] == ep["id"] and again["title"] == "بيت الجدة", "a page that knew less doesn't rename it"
    saved = netflix.save_subtitles("80001001", netflix.parse_ttml(ttml("ar-LB", FULL)))
    assert saved["model"] == "netflix-subtitles" and saved["words"] > 10 and saved["transcribed_at"]
    with db.session() as conn:
        segs = conn.execute("SELECT text FROM segments WHERE episode_id = ? ORDER BY idx", (ep["id"],)).fetchall()
    assert [s["text"] for s in segs][3] == "هل رأيت أخي؟ لا، لم أره."
    assert netflix.find_title("80001001")["id"] == ep["id"] and netflix.find_title("80009999") is None
    assert netflix.save_subtitles("80009999", netflix.parse_ttml(ttml("ar", FULL))) is None, "not in the library"


def test_a_series_number_gives_way_to_its_episode(fresh_db):
    show = netflix.save_title("80002000", {"title": "حكايات الحي"}, "ar")
    ep = netflix.save_title("80002001", {"show": "حكايات الحي", "season": 1, "episode": 1, "episode_title": "الصباح"}, "ar",
                            replaces="80002000")
    assert ep["title"] == "حكايات الحي · S1:E1 · الصباح" and ep["description"] == "حكايات الحي"
    assert netflix.find_title("80002000") is None, "the series' own entry never had words: it goes"
    netflix.save_subtitles("80002001", netflix.parse_ttml(ttml("ar", FULL)))
    netflix.save_title("80002002", {"title": "x"}, "ar", replaces="80002001")
    assert netflix.find_title("80002001") is not None, "an episode with its subtitles is never removed by the one after it"
    assert show["id"] != ep["id"]


def test_netflix_titles_are_never_queued_for_transcription(fresh_db):
    ep = netflix.save_title("80001001", {"title": "x"}, "ar")
    assert jobs.enqueue([ep["id"]]) == []


def test_flush_saves_only_what_the_page_chose(fresh_db, monkeypatch):
    published = []
    monkeypatch.setattr("app.events.publish", lambda name, data: published.append((name, data)))
    monkeypatch.setattr("app.sync.request", lambda *a, **k: None)
    monkeypatch.setattr(netflix, "_schedule", lambda *a, **k: None)  # no timers in a test: flush by hand
    netflix.save_title("80001001", {"title": "x"}, "ar")
    netflix.begin("80001001")
    assert netflix.offer_file("80001001", ttml("ar", FORCED).encode(), "ar")
    assert netflix.offer_file("80001001", ttml("ar-LB", FULL).encode(), "ar")
    assert not netflix.offer_file("80001001", b"<html>no</html>", "ar")
    assert netflix.flush("80001001") is None, "the page hasn't said what it chose yet"
    netflix.note_choice("80001001", "none", "", "ar")
    assert netflix.flush("80001001") is None, "no Arabic subtitles chosen: the forced lines are not a transcript"
    netflix.note_choice("80001001", "chosen", "ar-LB", "ar")
    ep = netflix.flush("80001001")
    assert ep and ep["model"] == "netflix-subtitles" and ep["words"] > 10
    assert ("netflix", {"kind": "subtitles", "episode": ep["id"], "netflix_id": "80001001", "words": ep["words"]}) in published
    assert netflix.flush("80001001") is None, "kept once"
    # Watched again later: the same file arrives again and nothing is redone.
    netflix.begin("80001001")
    netflix.offer_file("80001001", ttml("ar-LB", FULL).encode(), "ar")
    netflix.note_choice("80001001", "chosen", "ar-LB", "ar")
    assert netflix.flush("80001001") is None


def test_subtitles_that_arrive_before_the_title_is_kept(fresh_db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setattr(netflix, "_schedule", lambda *a, **k: None)
    netflix.begin("80002001")
    netflix.offer_file("80002001", ttml("ar", FULL).encode(), "ar")
    netflix.note_choice("80002001", "chosen", "ar", "ar")
    assert netflix.flush("80002001") is None, "not in the library yet"
    with TestClient(create_app(start_worker=False)) as c:
        r = c.post("/api/netflix", json={"id": "80002001", "info": {"show": "حكايات الحي", "season": 1, "episode": 1}, "language": "ar"})
        assert r.status_code == 200 and r.json()["model"] == "netflix-subtitles", "kept as soon as the title is"
        ep = r.json()
        assert c.get("/api/netflix/80002001").json()["id"] == ep["id"]
        assert c.get("/api/netflix/80009999").status_code == 404
        assert c.post("/api/netflix", json={"id": "nope"}).status_code == 400
        t = c.get(f"/api/episodes/{ep['id']}/transcript").json()
        assert t["words"]["text"][0] == "مرحباً،" and t["episode"]["audio_type"] == "video/netflix"
        assert c.get(f"/api/episodes/{ep['id']}/audio").status_code == 404, "nothing of Netflix's video is ever downloaded"
        assert c.delete(f"/api/episodes/{ep['id']}").json() == {"ok": True}


def test_a_title_syncs_with_its_subtitles_only_once_it_has_them(world):
    drive, a, b = world
    with a:
        netflix.save_title("80001001", {"title": "بيت الجدة"}, "ar")
    r = a.sync(drive)
    assert r.uploaded_transcripts == 1, "only the seeded episode's: a title without subtitles has no transcript to send"
    with a:
        ep = netflix.save_subtitles("80001001", netflix.parse_ttml(ttml("ar", FULL)))
    r = a.sync(drive)
    assert r.uploaded_transcripts == 1 and r.uploaded_audio == 0
    payload = engine._ungz(drive.by_name(engine.transcript_name(ep["uid"]))["data"])
    assert payload["model"] == "netflix-subtitles"
    b.sync(drive)
    with b:
        with db.session() as conn:
            row = conn.execute("SELECT * FROM episodes WHERE uid = ?", (ep["uid"],)).fetchone()
        assert row["status"] == "done" and row["audio_type"] == "video/netflix" and row["guid"] == "80001001"


# ----- the video window -----

def test_the_video_window_goes_exactly_over_the_stage():
    # A 1280 x 820 page shown at 150 % (1920 x 1230 screen pixels), its page area at (100, 50).
    box, clip = screen_box({"x": 8, "y": 120, "w": 722.4, "h": 406, "vw": 1280, "vh": 820}, (100, 50, 1920, 1230))
    assert box == (112, 230, 1084, 609) and clip is None
    # Scrolled partly above the page area: the window keeps its size, its hidden part is cut away.
    box, clip = screen_box({"x": 0, "y": -100, "w": 400, "h": 300, "vw": 800, "vh": 600}, (0, 0, 800, 600))
    assert box == (0, -100, 400, 300) and clip == (0, 100, 400, 300)
    assert screen_box({"x": 0, "y": 700, "w": 400, "h": 300, "vw": 800, "vh": 600}, (0, 0, 800, 600)) is None, "out of view"
    assert screen_box({"x": 0, "y": 0, "w": 1, "h": 300, "vw": 800, "vh": 600}, (0, 0, 800, 600)) is None, "no width"
    assert screen_box({"x": 0, "y": 0, "w": 100, "h": 100, "vw": 0, "vh": 600}, (0, 0, 800, 600)) is None
    assert screen_box({"x": "a"}, (0, 0, 800, 600)) is None


def test_what_the_netflix_window_is_told_is_kept_plain():
    from app.desktop import _netflix_config

    cfg = _netflix_config({"lang": "ar", "names": ["Arabic", "العربية", "x" * 41, "<img src=x>", 3, "Português (Brasil)"],
                           "text": {"tap": "  Pick a title  ", "evil": "x", "opened": 5}})
    assert cfg["lang"] == "ar" and cfg["names"] == ["Arabic", "العربية", "Português (Brasil)"]
    assert cfg["text"] == {"tap": "Pick a title"} and cfg["browse"][0].endswith("/browse/original-audio")
    assert _netflix_config(None)["lang"] == "" and _netflix_config({"lang": "ar\"; alert(1)"})["lang"] == ""
