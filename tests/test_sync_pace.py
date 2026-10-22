"""Changes reaching the other devices within seconds: the cheap check (engine.quick_check), the
manager's pace (a check every minute on screen, at once on coming back, a waiting change sent when
the window is left or closed) and the nudge key shared with web/js/syncpace.js."""

from __future__ import annotations

import time

from app import db, sync
from app.sync import engine

from test_sync import FakeDrive, transcribe_locally, world  # noqa: F401  (world: the two-device fixture)


class CountingDrive(FakeDrive):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[str] = []

    def list(self):
        self.calls.append("list")
        return super().list()

    def download(self, file_id):
        self.calls.append("download")
        return super().download(file_id)

    def upload(self, name, data, mime, file_id=None):
        self.calls.append("upload")
        return super().upload(name, data, mime, file_id)


def run(device, drive, memo, quick=True):
    with device:
        return engine.run(drive, device.name, sync_audio=False, can_transcribe=False, memo=memo, quick=quick)


def test_a_check_that_finds_nothing_new_is_one_request(world):
    _, a, b = world
    drive = CountingDrive()
    memo_a: dict = {}
    first = run(a, drive, memo_a)
    assert first.library_uploaded and not first.skipped
    assert memo_a["complete"] and memo_a["fp"] and memo_a["library_id"]
    drive.calls.clear()
    again = run(a, drive, memo_a)
    assert again.skipped and drive.calls == ["list"], "nothing changed anywhere: just the folder's list"
    assert again.summary()["received"] == 0 and not again.summary()["uploaded"]
    # Not a check (a change made here asked for it): the library is read as before.
    drive.calls.clear()
    full = run(a, drive, memo_a, quick=False)
    assert not full.skipped and "download" in drive.calls


def test_a_change_on_another_device_is_seen_by_the_next_check(world):
    _, a, b = world
    drive = CountingDrive()
    memo_a: dict = {}
    run(a, drive, memo_a)
    memo_b: dict = {}
    run(b, drive, memo_b)
    with b:
        with db.session() as conn:
            conn.execute("UPDATE vocab SET meaning = 'a book' WHERE uid = 'vword1'")
    sent = run(b, drive, memo_b)
    assert not sent.skipped and sent.library_uploaded and sent.summary()["uploaded"]
    got = run(a, drive, memo_a)
    assert not got.skipped and got.merged["vocab"] == 1 and got.summary()["received"] >= 1
    with a:
        with db.session() as conn:
            assert conn.execute("SELECT meaning FROM vocab WHERE uid = 'vword1'").fetchone()[0] == "a book"
    drive.calls.clear()
    assert run(a, drive, memo_a).skipped and drive.calls == ["list"]


def test_a_change_here_is_never_skipped(world):
    _, a, _ = world
    drive = CountingDrive()
    memo: dict = {}
    run(a, drive, memo)
    with a:
        with db.session() as conn:
            conn.execute("INSERT INTO reviews(vocab_uid, t, rating, day, ms) VALUES('vword1', 1700000000, 3, 19000, 900)")
    r = run(a, drive, memo)
    assert not r.skipped and r.library_uploaded


def test_a_waiting_transcript_or_an_old_read_means_a_full_sync(world):
    _, a, _ = world
    drive = CountingDrive()
    memo: dict = {}
    run(a, drive, memo)
    with a:
        transcribe_locally(2)
    r = run(a, drive, memo)
    assert not r.skipped and r.uploaded_transcripts == 1
    assert run(a, drive, memo).skipped
    memo["full_at"] = time.time() - engine.FULL_EVERY - 1
    assert not run(a, drive, memo).skipped
    memo["complete"] = False
    assert not run(a, drive, memo).skipped


def test_nudge_key_matches_the_web_pages():
    # The same value is checked in tests/js/syncpace.test.mjs (nudgeKey).
    assert sync.nudge_key("1AbCdEfGhIjKlMnOpQrStUvWxYz012345") == "47378edb89ce41282d6e8ccb44359cfc"
    assert sync.nudge_key("") == ""


def signed_in_manager(monkeypatch):
    monkeypatch.setattr(sync.oauth, "signed_in", lambda: True)
    m = sync.Manager()
    m._wake.set = lambda: None  # no loop thread here
    return m


def test_a_later_longer_request_never_pushes_back_a_sooner_one(monkeypatch):
    m = signed_in_manager(monkeypatch)
    m.request(delay=20)
    due = m._due
    m.request(delay=90)
    assert m._due == due and m.pending


def test_presence_sets_the_pace_and_flushes_or_checks(monkeypatch):
    m = signed_in_manager(monkeypatch)
    assert m.period == sync.PERIOD
    # On screen and in front: every minute, and a check now (the last one was long ago).
    m._last_run = time.monotonic() - 60
    r = m.presence(visible=True, focused=True)
    assert r == {"period": sync.PERIOD_VISIBLE, "action": "check"}
    assert m._due and not m._changed, "a check, not a change: it may stop after listing Drive"
    m._due = 0.0
    # Back again a moment later: no second check.
    m._on_screen = False
    m._last_run = time.monotonic()
    assert m.presence(visible=True, focused=True)["action"] == "none"
    # A review answer waits 20 s; leaving the window sends it now.
    m.request(delay=20)
    r = m.presence(visible=True, focused=False)
    assert r["action"] == "flush" and m._due <= time.monotonic() + 0.01
    m._due = 0.0
    m._changed = False
    # Put away (minimised): checks every five minutes.
    assert m.presence(visible=False, focused=False) == {"period": sync.PERIOD, "action": "none"}


def test_flush_only_sends_a_waiting_change(monkeypatch):
    m = signed_in_manager(monkeypatch)
    assert not m.flush()
    m.check()
    assert not m.flush(), "a waiting check isn't a change to send"
    m.request(delay=20)
    assert m.flush()


def test_closing_the_window_sends_a_waiting_change(monkeypatch):
    m = signed_in_manager(monkeypatch)
    ran = []
    monkeypatch.setattr(m, "sync_now", lambda quick=False: ran.append(quick))
    m.flush_on_exit(timeout=5)
    assert ran == []
    m.request(delay=20)
    m.flush_on_exit(timeout=5)
    assert ran == [False]
