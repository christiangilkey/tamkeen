"""Cloud transcription: what is sent to the provider, reading its answer, and choosing it over a local model."""

from __future__ import annotations

import threading

import httpx
import numpy as np
import pytest

from app import audio, db, jobs, reels, reels_worker, transcriber
from app.transcriber import cloud

RATE = audio.SAMPLE_RATE


def answer(words, segments, language="arabic"):
    """A provider's answer: words as (start, end, text), segments as (start, end, text)."""
    return {"language": language, "duration": segments[-1][1] if segments else 0,
            "text": " ".join(s[2] for s in segments),
            "words": [{"word": w, "start": a, "end": b} for a, b, w in words],
            "segments": [{"id": i, "start": a, "end": b, "text": " " + t, "avg_logprob": -0.2, "no_speech_prob": 0.01}
                         for i, (a, b, t) in enumerate(segments)]}


def test_words_take_their_sentence_and_its_punctuation():
    data = answer([(0.0, 0.4, "مرحبا"), (0.5, 0.9, "بكم"), (1.2, 1.6, "كيف"), (1.7, 2.1, "الحال")],
                  [(0.0, 1.0, "مرحبا بكم."), (1.2, 2.2, "كيف الحال؟")])
    segs = cloud.parse(data)
    assert [s.text for s in segs] == ["مرحبا بكم.", "كيف الحال؟"]
    assert [[w.text for w in s.words] for s in segs] == [["مرحبا", "بكم."], ["كيف", "الحال؟"]]
    assert (segs[1].words[0].start, segs[1].words[1].end) == (1.2, 2.1)


def test_when_the_two_lists_disagree_the_timed_words_are_kept_as_they_came():
    # Japanese: the sentence has no spaces, so its "tokens" can't be matched to the words.
    data = answer([(0.0, 0.3, "今日"), (0.3, 0.5, "は"), (0.5, 1.0, "暑い")], [(0.0, 1.0, "今日は暑い。")], "japanese")
    segs = cloud.parse(data)
    assert [w.text for w in segs[0].words] == ["今日", "は", "暑い"]


def test_stretches_the_provider_doubts_and_known_made_up_lines_are_dropped():
    data = answer([(0.0, 0.5, "أهلا"), (5.0, 6.0, "ترجمة"), (6.0, 7.0, "نانسي"), (7.0, 8.0, "قنقر"), (9.0, 9.5, "شكرا")],
                  [(0.0, 0.6, "أهلا"), (5.0, 8.0, "ترجمة نانسي قنقر"), (9.0, 9.6, "شكرا")])
    data["segments"][2].update(no_speech_prob=0.9, avg_logprob=-1.4)
    assert [s.text for s in cloud.parse(data)] == ["أهلا"]


def test_times_are_moved_by_the_function_given():
    data = answer([(1.0, 1.5, "hola")], [(1.0, 1.6, "hola")], "spanish")
    seg = cloud.parse(data, lambda t: t + 100)[0]
    assert (seg.start, seg.words[0].start, seg.words[0].end) == (101.0, 101.0, 101.5)


def test_language_names_become_codes():
    assert cloud.language_code("Arabic") == "ar"
    assert cloud.language_code("ru") == "ru"
    assert cloud.language_code("") is None
    assert cloud.language_code("something long") is None


def test_speech_is_packed_into_pieces_cut_only_between_stretches():
    s = RATE
    spans = [(0, 200 * s), (210 * s, 330 * s), (340 * s, 400 * s), (500 * s, 520 * s)]
    pieces = cloud.plan(spans)
    # 200 s + 120 s reaches the five minutes: closed there, at a pause. The rest is the second piece.
    assert [p.parts for p in pieces] == [[(0, 200 * s), (210 * s, 330 * s)], [(340 * s, 400 * s), (500 * s, 520 * s)]]
    # Someone talking for 25 minutes without a pause is cut every ten.
    long = cloud.plan([(0, 1500 * s)])
    assert [round(p.seconds) for p in long] == [600, 600, 300]


def test_a_time_in_a_piece_maps_back_to_the_episode():
    s = RATE
    piece = cloud.Piece([(10 * s, 20 * s), (50 * s, 60 * s)])
    assert piece.seconds == 20
    assert len(piece.audio(np.zeros(70 * s, dtype=np.float32))) == int((20 + cloud.GAP_SECONDS) * s)
    assert piece.to_episode_time(0) == 10
    assert piece.to_episode_time(4.5) == 14.5
    assert piece.to_episode_time(10.1) == 50                       # in the quiet put between the two stretches
    assert piece.to_episode_time(10 + cloud.GAP_SECONDS + 2) == 52
    assert piece.to_episode_time(999) == 60                        # past the end: the end


def test_the_mp3_made_for_upload_is_real_audio(tmp_path):
    t = np.arange(RATE * 3) / RATE
    data = cloud.encode_mp3((0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32))
    assert 5_000 < len(data) < 40_000  # 3 seconds at 48 kbit/s is about 18 kB
    path = tmp_path / "piece.mp3"
    path.write_bytes(data)
    back = audio.decode(path)
    assert abs(len(back) / RATE - 3) < 0.2
    assert float(np.abs(back).max()) > 0.1


def test_a_hand_typed_model_name_goes_back_to_the_recommended_model(fresh_db):
    # Settings no longer offers "Another model…": a name typed in there before means the recommended model,
    # and is forgotten for good.
    db.set_settings({"stt_mode": "cloud", "stt_key_groq": "gsk_test", "stt_model_groq": "distil-whisper-large-v3-en"})
    assert cloud.config()["model"] == "whisper-large-v3"
    assert db.get_setting("stt_model_groq") == ""
    db.set_settings({"stt_provider": "openai", "stt_key_openai": "sk-test", "stt_model_openai": "gpt-4o-transcribe"})
    assert cloud.config()["model"] == "whisper-1"
    assert db.get_setting("stt_model_openai") == ""
    # A model Settings does offer is kept.
    db.set_settings({"stt_provider": "groq", "stt_model_groq": "whisper-large-v3-turbo"})
    assert cloud.config()["model"] == "whisper-large-v3-turbo"
    assert cloud.known_model("openai", None) == "whisper-1"


def test_settings_and_the_computer_offer_the_same_cloud_models():
    import re
    from pathlib import Path

    src = (Path(__file__).resolve().parent.parent / "web" / "js" / "stt.js").read_text(encoding="utf-8")
    for provider, p in cloud.PROVIDERS.items():
        block = re.search(rf"\n  {provider}: \{{(.*?)\n  \}},", src, re.S).group(1)
        assert re.search(r'defaultModel: "([^"]+)"', block).group(1) == p["default"]
        assert tuple(re.findall(r'\{ id: "([^"]+)"', block)) == p["models"]


def test_cloud_is_used_only_when_chosen_and_a_key_is_there(fresh_db):
    assert cloud.config() is None
    db.set_settings({"stt_mode": "cloud"})
    assert cloud.config() is None, "chosen, but no key yet"
    db.set_settings({"stt_key_groq": " gsk_test "})
    assert cloud.config() == {"provider": "groq", "key": "gsk_test", "model": "whisper-large-v3"}
    db.set_settings({"stt_model_groq": "whisper-large-v3-turbo"})
    assert cloud.config()["model"] == "whisper-large-v3-turbo"
    # OpenAI borrows the key entered for word definitions.
    db.set_settings({"stt_provider": "openai", "llm_key_openai": "sk-defs"})
    assert cloud.config() == {"provider": "openai", "key": "sk-defs", "model": "whisper-1"}
    transcriber.unload()
    engine = transcriber.get()
    assert (engine.engine, engine.model_size, engine.device) == ("cloud", "whisper-1", "openai")
    db.set_settings({"stt_mode": "local"})
    transcriber.unload()
    with pytest.raises(transcriber.NoModelError):
        transcriber.get()


def test_keys_stay_out_of_backups():
    assert {"stt_key_groq", "stt_key_openai"} <= set(db.SECRET_SETTINGS)


class FakeProvider:
    """Stands in for the provider: records what was sent and answers from a list."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def __call__(self, url, headers=None, data=None, files=None, timeout=None):
        self.calls.append({"url": url, "headers": headers, "data": data, "file": files["file"]})
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        status, body, extra = (*reply, {})[:3]
        return httpx.Response(status, json=body, headers=extra, request=httpx.Request("POST", url))


@pytest.fixture()
def no_waiting(monkeypatch):
    monkeypatch.setattr(cloud, "_pause", lambda seconds, cancel: None)


def test_a_whole_episode_goes_up_in_pieces_and_comes_back_in_episode_time(fresh_db, monkeypatch, no_waiting):
    s = RATE
    samples = np.zeros(700 * s, dtype=np.float32)
    # Speech from 100 s to 420 s and from 600 s to 650 s (the detector is stood in for).
    monkeypatch.setattr(cloud, "speech_spans", lambda audio_: [(100 * s, 420 * s), (600 * s, 650 * s)])
    fake = FakeProvider([
        (200, answer([(1.0, 1.4, "واحد"), (300.0, 300.5, "اثنان")], [(1.0, 1.5, "واحد."), (300.0, 300.6, "اثنان.")])),
        (200, answer([(2.0, 2.5, "ثلاثة")], [(2.0, 2.6, "ثلاثة.")])),
    ])
    monkeypatch.setattr(httpx, "post", fake)
    engine = cloud.CloudTranscriber("groq", "gsk_k", "whisper-large-v3")
    segs = list(engine.transcribe(samples, None, "ar"))
    assert [(round(x.start, 1), x.text) for x in segs] == [(101.0, "واحد."), (400.0, "اثنان."), (602.0, "ثلاثة.")]
    assert [w.text for x in segs for w in x.words] == ["واحد.", "اثنان.", "ثلاثة."]
    first = fake.calls[0]
    assert first["url"] == "https://api.groq.com/openai/v1/audio/transcriptions"
    assert first["headers"] == {"Authorization": "Bearer gsk_k"}
    assert first["data"]["model"] == "whisper-large-v3" and first["data"]["language"] == "ar"
    assert first["data"]["timestamp_granularities[]"] == ["word", "segment"]
    assert first["file"][0].endswith(".mp3") and first["file"][2] == "audio/mpeg"
    # Only the speech was sent and counted: 320 s + 50 s, in two requests.
    use = cloud.usage()
    assert (round(use["seconds"]), use["requests"]) == (370, 2)
    assert round(use["by"]["groq:whisper-large-v3"]) == 370


def test_silence_only_sends_nothing(fresh_db, monkeypatch):
    monkeypatch.setattr(cloud, "speech_spans", lambda audio_: [])
    monkeypatch.setattr(httpx, "post", FakeProvider([]))
    assert list(cloud.CloudTranscriber("groq", "k", "m").transcribe(np.zeros(RATE * 5, dtype=np.float32))) == []


def test_a_refused_key_is_said_plainly_and_not_retried(monkeypatch, no_waiting):
    fake = FakeProvider([(401, {"error": {"message": "Invalid API Key"}})])
    monkeypatch.setattr(httpx, "post", fake)
    with pytest.raises(cloud.CloudError) as err:
        cloud.send("groq", "bad", "whisper-large-v3", b"x")
    assert err.value.key_rejected and "rejected the API key" in str(err.value)
    assert len(fake.calls) == 1


def test_slow_down_is_waited_out_and_a_dropped_connection_retried(monkeypatch, no_waiting):
    ok = answer([(0.0, 0.5, "bonjour")], [(0.0, 0.6, "bonjour")], "french")
    fake = FakeProvider([(429, {"error": {"message": "Rate limit"}}, {"retry-after": "12"}),
                         httpx.ConnectError("down"), (503, {}), (200, ok)])
    monkeypatch.setattr(httpx, "post", fake)
    assert cloud.send("groq", "k", "m", b"x")["language"] == "french"
    assert len(fake.calls) == 4


def test_a_limit_that_lasts_too_long_gives_up_with_the_reason(monkeypatch, no_waiting):
    monkeypatch.setattr(httpx, "post", FakeProvider([(429, {}, {"retry-after": "3000"})]))
    with pytest.raises(cloud.CloudError, match="reached its limit"):
        cloud.send("groq", "k", "m", b"x")


def test_stopping_is_noticed_between_pieces(fresh_db, monkeypatch, no_waiting):
    stop = threading.Event()
    stop.set()
    monkeypatch.setattr(cloud, "speech_spans", lambda audio_: [(0, RATE)])
    with pytest.raises(transcriber.TranscriptionCancelled):
        list(cloud.CloudTranscriber("groq", "k", "m").transcribe(np.zeros(RATE, dtype=np.float32), stop))


def test_cloud_failures_reach_the_user_as_written():
    assert jobs._friendly_error(cloud.CloudError("Groq rejected the API key.")) == "Groq rejected the API key."


# ----- reels heard by a cloud provider -----

class HeardBy:
    """A cloud engine that has already "heard" a reel."""
    engine, model_size, device = "cloud", "whisper-large-v3", "groq"

    def __init__(self, language, text):
        self.heard = (language, [transcriber.Segment(0.0, 6.0, text, [transcriber.Word(i * 0.5, i * 0.5 + 0.4, w)
                                                                       for i, w in enumerate(text.split())])] if text else [])

    def transcribe_detecting(self, samples, cancel=None):
        return self.heard


ARABIC = "هذا مقطع قصير مضحك جدا عن الحياة اليومية في المدينة"


def test_a_found_reel_is_kept_only_in_the_language_being_studied(fresh_db):
    db.set_settings({"study_language": "ar"})
    cand = {"code": "AbCdE12345", "user": "someone", "caption": "ضحك"}
    kept, why = reels_worker._keep_heard_in_cloud(HeardBy("ar", ARABIC), None, cand, "ar", 6.0, False, False)
    assert kept and why == "10 words"
    kept, why = reels_worker._keep_heard_in_cloud(HeardBy("en", "this one is in english all the way through it"),
                                                  None, {**cand, "code": "ZzZzZ12345"}, "ar", 6.0, False, False)
    assert not kept and why == "spoken in English, not Arabic"


def test_an_own_save_is_kept_whatever_its_language(fresh_db):
    db.set_settings({"study_language": "ar"})
    cand = {"code": "SaVeD12345", "user": "someone", "caption": ""}
    kept, why = reels_worker._keep_heard_in_cloud(HeardBy("es", "hola amigos esto es un video corto"), None, cand, "ar", 5.0, True, True)
    assert kept and why == "7 words, in Spanish (plays when signed in to Instagram on the phone)"
    with db.session() as conn:
        row = conn.execute("SELECT language, model, audio_url FROM episodes WHERE guid = 'SaVeD12345'").fetchone()
    assert (row["language"], row["model"]) == ("es", "cloud:whisper-large-v3:groq")
    assert reels.needs_signin(row["audio_url"])
    kept, why = reels_worker._keep_heard_in_cloud(HeardBy("en", ""), None, {**cand, "code": "MuSiC12345"}, "ar", 5.0, True, False)
    assert not kept and why == "nothing is said in it"
