"""Library → My audio → Listen: a recording from the microphone is kept like an audio file the learner added
(app/videos.py save_upload, `recording`): in My audio, under the name the page gives it, and queued for the
computer's own transcription. The page's part (the name, WebM into Ogg) is tested in tests/js/listenrec.test.mjs."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

import pytest

from app import audio, db, videos
from conftest import FIXTURES

WEBM = FIXTURES / "chromium-recording.webm"  # two seconds recorded by Chromium's MediaRecorder


@pytest.fixture()
def client(fresh_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(start_worker=False)) as c:
        yield c


def opus_tone(path, seconds: float = 1.5) -> bytes:
    """A short tone as Ogg Opus, as the page sends a recording it has turned into Ogg."""
    import av
    import numpy as np

    out = av.open(str(path), "w", format="ogg")
    stream = out.add_stream("libopus", rate=48000)
    stream.layout = "mono"
    t = np.arange(int(48000 * seconds)) / 48000
    frame = av.AudioFrame.from_ndarray((0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32).reshape(1, -1),
                                       format="fltp", layout="mono")
    frame.sample_rate = 48000
    for packet in stream.encode(frame):
        out.mux(packet)
    for packet in stream.encode(None):
        out.mux(packet)
    out.close()
    return path.read_bytes()


def queued() -> set[int]:
    with db.session() as conn:
        return {r[0] for r in conn.execute("SELECT episode_id FROM jobs").fetchall()}


def test_a_recording_goes_to_my_audio_under_its_name_and_is_transcribed(client, tmp_path):
    title = "Recording, 16 Nov 14:05"
    r = client.post(f"/api/videos?filename=recording-20261116-1405.ogg&title={quote(title)}&recording=true",
                    content=opus_tone(tmp_path / "r.ogg"))
    assert r.status_code == 200, r.text
    ep = r.json()
    assert ep["title"] == title
    assert ep["audio_type"] == "audio/ogg" and ep["audio_url"].endswith(".ogg")
    assert ep["duration"] and abs(ep["duration"] - 1.5) < 0.1
    feed = next(f for f in client.get("/api/feeds").json() if f["id"] == ep["feed_id"])
    assert feed["url"] == videos.AUDIO_FEED_URL and feed["title"] == "My audio"
    assert queued() == {ep["id"]}  # the computer's own speech model, as for an added file


def test_a_recorders_webm_is_kept_as_ogg_opus_in_my_audio(client):
    # (The page turns Chromium's WebM into Ogg itself; if it couldn't, the computer does.)
    r = client.post("/api/videos?filename=recording-20261116-1405.webm&recording=true", content=WEBM.read_bytes())
    assert r.status_code == 200, r.text
    ep = r.json()
    assert ep["audio_type"] == "audio/ogg" and ep["audio_url"].endswith(".ogg") and ep["audio_path"].endswith(".ogg")
    assert ep["title"] == "recording-20261116-1405"
    assert abs(ep["duration"] - 2.0) < 0.2
    assert abs(audio.probe_duration(Path(ep["audio_path"])) - 2.0) < 0.2
    feed = next(f for f in client.get("/api/feeds").json() if f["id"] == ep["feed_id"])
    assert feed["url"] == videos.AUDIO_FEED_URL
    # The same WebM added as a file of the learner's own is a video, as before.
    r = client.post("/api/videos?filename=clip.webm", content=WEBM.read_bytes())
    assert r.status_code == 200 and r.json()["audio_type"] == "video/webm"


def test_a_recording_must_be_sound(client):
    r = client.post("/api/videos?filename=recording.mp4&recording=true", content=b"\x00" * 64)
    assert r.status_code == 400 and "recording" in r.json()["detail"]
    r = client.post("/api/videos?filename=recording.ogg&recording=true", content=b"")
    assert r.status_code == 400
