"""Library → Conversation on the computer: a spoken reply is written down by POST /api/stt/say
(app/api/system.py), with the same engine as the transcripts and nothing kept. The page's side is
tests/js/converse.test.mjs."""

from __future__ import annotations

import io
import wave

import numpy as np
import pytest

from app import db, paths, transcriber
from app.transcriber import Segment


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        db.set_settings({"study_language": "es", "learning_languages": ["es", "ar"], "welcome_seen": True})
        yield c


def _wav(seconds: float = 1.0, rate: int = 16000) -> bytes:
    t = np.arange(int(rate * seconds)) / rate
    pcm = (np.sin(2 * np.pi * 220 * t) * 9000).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


class _Engine:
    """Stands in for a transcription model: remembers what it was asked."""

    def __init__(self, engine: str = "faster-whisper") -> None:
        self.engine = engine
        self.asked: list[tuple[int, str]] = []

    def transcribe(self, audio, cancel=None, language="ar"):  # type: ignore[no-untyped-def]
        self.asked.append((len(audio), language))
        yield Segment(0.0, 0.5, " Quiero un café ")
        yield Segment(0.5, 0.6, "")
        yield Segment(0.6, 1.0, "con leche.")


def test_a_spoken_reply_is_written_down_in_the_language_asked_for(client, monkeypatch):
    engine = _Engine()
    wanted: list[str | None] = []
    monkeypatch.setattr(transcriber, "get", lambda model_size=None, language=None: (wanted.append(language), engine)[1])
    r = client.post("/api/stt/say?lang=ar", content=_wav(1.0))
    assert r.status_code == 200
    assert r.json() == {"text": "Quiero un café con leche.", "local": True}
    assert wanted == ["ar"]
    assert engine.asked == [(16000, "ar")]
    # Without a language, the one being learned.
    client.post("/api/stt/say", content=_wav(0.5))
    assert wanted[-1] == "es"
    # Nothing is left behind.
    assert not list(paths.tmp_dir().glob("say-*"))


def test_it_says_when_the_cloud_wrote_it_and_when_nothing_can(client, monkeypatch):
    monkeypatch.setattr(transcriber, "get", lambda model_size=None, language=None: _Engine("cloud"))
    assert client.post("/api/stt/say?lang=es", content=_wav()).json()["local"] is False

    def none(model_size=None, language=None):  # type: ignore[no-untyped-def]
        raise transcriber.NoModelError("No transcription model selected yet.")

    monkeypatch.setattr(transcriber, "get", none)
    r = client.post("/api/stt/say?lang=es", content=_wav())
    assert r.status_code == 409
    assert "model" in r.json()["detail"]


def test_what_is_not_sound_is_refused(client, monkeypatch):
    monkeypatch.setattr(transcriber, "get", lambda model_size=None, language=None: _Engine())
    assert client.post("/api/stt/say?lang=es", content=b"").status_code == 400
    assert client.post("/api/stt/say?lang=es", content=b"this is not sound" * 20).status_code == 400
    assert not list(paths.tmp_dir().glob("say-*"))


def test_only_tamkeens_own_page_may_ask(client):
    r = client.post("/api/stt/say?lang=es", content=_wav(), headers={"X-Tamkeen-Session": ""})
    assert r.status_code in (401, 403)
