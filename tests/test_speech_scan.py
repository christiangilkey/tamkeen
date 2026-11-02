"""The speech scan done a block at a time (app/transcriber/faster.py scan_speech, batches)."""

import threading

import numpy as np
import pytest

from app.transcriber import faster
from app.transcriber.base import TranscriptionCancelled


def fake_vad(found):
    """A voice detector that finds `found(block_length)` in every block it is given."""
    def get_speech_timestamps(audio, options):
        return found(len(audio))
    return get_speech_timestamps


@pytest.fixture
def small_blocks(monkeypatch):
    monkeypatch.setattr(faster, "SCAN_BLOCK", 1000)


def test_scan_reports_progress_and_offsets_blocks(monkeypatch, small_blocks):
    monkeypatch.setattr("faster_whisper.vad.get_speech_timestamps", fake_vad(lambda n: [{"start": 100, "end": 200}]))
    seen = []
    chunks = faster.scan_speech(np.zeros(2500, dtype=np.float32), on_scan=seen.append)
    assert chunks == [{"start": 100, "end": 200}, {"start": 1100, "end": 1200}, {"start": 2100, "end": 2200}]
    assert seen == [40.0, 80.0, 100.0]


def test_speech_over_a_block_edge_is_joined(monkeypatch, small_blocks):
    # Speech to the end of each block and from the start of the next: one stretch.
    monkeypatch.setattr("faster_whisper.vad.get_speech_timestamps",
                        fake_vad(lambda n: [{"start": 0, "end": 50}, {"start": 900, "end": n}]))
    chunks = faster.scan_speech(np.zeros(2000, dtype=np.float32))
    assert chunks == [{"start": 0, "end": 50}, {"start": 900, "end": 1050}, {"start": 1900, "end": 2000}]


def test_scan_stops_when_cancelled(monkeypatch, small_blocks):
    monkeypatch.setattr("faster_whisper.vad.get_speech_timestamps", fake_vad(lambda n: []))
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(TranscriptionCancelled):
        faster.scan_speech(np.zeros(5000, dtype=np.float32), cancel)


def test_batches_hold_at_most_the_limit_of_speech():
    chunks = [{"start": i * 100, "end": i * 100 + 40} for i in range(5)]
    groups = list(faster.batches(chunks, limit=100))
    assert [len(g) for g in groups] == [2, 2, 1]
    assert [c for g in groups for c in g] == chunks
    # A stretch longer than the limit goes alone.
    assert list(faster.batches([{"start": 0, "end": 500}], limit=100)) == [[{"start": 0, "end": 500}]]
    assert list(faster.batches([])) == []


def test_scan_blocks_fit_the_detector_window():
    assert faster.SCAN_BLOCK % 512 == 0
