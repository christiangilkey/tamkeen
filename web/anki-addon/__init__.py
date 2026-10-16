"""Tamkeen companion for Anki.

Tells the Tamkeen app on this computer how your Anki reviews are going, so they count toward your
creature: clearing what is due is the day's goal, and cards that become mature earn a bonus.
For that, only numbers are sent (reviews, failed, matured, still due).

When "Sync with Anki" is switched on in Tamkeen's settings, it also keeps your saved words and
one deck per language you learn (such as "Tamkeen – Spanish"; the names are set in Tamkeen) in
step, both ways: new words, edits and deletions, and each card's progress for Tamkeen to show.
Only those decks are read or changed; your other decks are never touched. Everything stays on
this computer.

This file is the part that talks to Anki's window; the logic is in core.py (reports) and
syncer.py (the deck).
"""

from __future__ import annotations

import os
import threading
import time

from aqt import gui_hooks, mw
from aqt.qt import QAction, QTimer
from aqt.utils import showInfo

from . import core, syncer

ADDON_DIR = os.path.dirname(__file__)
STATE = os.path.join(ADDON_DIR, "user_files", "days.json")  # user_files survives add-on updates
SEND_DELAY_MS = 4000

_days = core.load(STATE)
_before: dict[int, int] = {}   # card id -> its interval when the question was shown
_timer: QTimer | None = None
_last = {"ok": None}


def _on_question(card) -> None:
    _before[card.id] = int(card.ivl) if card.type == 2 else 0  # type 2 = a review card


def _on_answer(reviewer, card, ease) -> None:
    core.note_answer(_days, core.today(), int(ease), _before.pop(card.id, 0), int(card.ivl))
    core.save(STATE, core.prune(_days))
    _send_soon()


def _send_soon() -> None:
    """Wait a few seconds after the last answer, so a run of cards makes one report, not fifty."""
    global _timer
    if _timer is None:
        _timer = QTimer(mw)
        _timer.setSingleShot(True)
        _timer.timeout.connect(_send)
    _timer.start(SEND_DELAY_MS)


def _send() -> None:
    if mw.col is None:
        return
    try:
        due = len(mw.col.find_cards("is:due -is:suspended"))
        core.set_due_left(_days, core.today(), due)
        core.save(STATE, _days)
    except Exception:
        pass  # the collection is busy (syncing, say): send what we have
    target = core.endpoint(ADDON_DIR)
    if target is None:
        _last["ok"] = False
        return
    body = core.payload(_days)

    def work() -> None:
        _last["ok"] = core.post(target[0], target[1], body)

    threading.Thread(target=work, daemon=True).start()


def _status() -> None:
    rec = _days.get(core.today(), {})
    state = {True: "Connected to Tamkeen.", False: "Tamkeen isn't open right now. Your totals are kept and sent when it is.",
             None: "Nothing sent yet this session."}[_last["ok"]]
    showInfo(f"{state}\n\nToday: {rec.get('reviews', 0)} reviewed, {rec.get('matured', 0)} became mature, "
             f"{rec.get('due_left', '?')} still due.\n\nDeck sync: {_sync['result'] or 'not run yet this session.'}"
             "\n\nEverything stays on this computer.",
             title="Tamkeen companion")
    _send_soon()


# ----- the two-way sync of the Tamkeen deck -----

DELETED = os.path.join(ADDON_DIR, "user_files", "deleted.json")  # notes deleted in Anki, and when
SYNC_TIMEOUT = 300   # seconds: the first sync may wait while Tamkeen cuts audio clips for new cards
MAX_ROUNDS = 40
_sync = {"busy": False, "at": None, "result": "", "timer": None}


def _background(work, then) -> None:
    """Run ``work`` off Anki's main thread (it talks to Tamkeen), then ``then(result)`` back on it."""
    def run() -> None:
        try:
            result = work()
        except Exception:
            result = None
        mw.taskman.run_on_main(lambda: then(result))

    threading.Thread(target=run, daemon=True).start()


def _remember_deleted(note_ids=(), when: float = 0.0) -> dict:
    """Add to the list of notes deleted in Anki: the ones just named, and any Anki itself still lists."""
    log = core.load(DELETED)
    before = len(log)
    core.note_deleted(log, note_ids, when)
    try:
        if mw.col is not None:
            core.note_deleted(log, syncer.pending_deletions(mw.col), 0.0)
    except Exception:
        pass
    core.prune_deleted(log, time.time())
    if len(log) != before:
        core.save(DELETED, log)
    return log


def _on_notes_deleted(col, note_ids) -> None:
    _remember_deleted(list(note_ids), time.time())


def _finish(result: str, tell: bool) -> None:
    _sync.update(busy=False, at=time.time(), result=result)
    if tell:
        showInfo(result, title="Tamkeen sync")


def sync_now(tell: bool = False) -> None:
    """Sync the Tamkeen deck with Tamkeen. Quiet unless ``tell`` (the menu item): when Tamkeen is not
    running, or the sync is switched off there, nothing happens and nothing is shown."""
    if _sync["busy"] or mw.col is None:
        return
    target = core.base(ADDON_DIR)
    if target is None:
        _sync.update(result="Tamkeen isn't open right now.")
        if tell:
            showInfo("Tamkeen isn't open right now. Open Tamkeen and try again.", title="Tamkeen sync")
        return
    url, token = target
    _sync["busy"] = True
    totals = {"added": 0, "changed": 0, "removed": 0, "failed": 0}

    def round_(number: int, applied, decks: list) -> None:
        if mw.col is None:  # the profile was closed meanwhile
            return _finish("Anki's collection was closed before the sync finished.", False)
        try:
            body, ids = syncer.request(mw.col, decks, number, applied, _remember_deleted(), mw.pm.name or "")
        except Exception as exc:
            return _finish(f"The deck could not be read: {exc}", tell)

        def fetch():
            reply = core.ask(url + "/sync", token, body, timeout=SYNC_TIMEOUT)
            files = {name: core.ask(f"{url}/media/{name}", token, timeout=30, raw=True)
                     for name in (syncer.wanted_media(reply) if reply else [])}
            return reply, files

        def use(got) -> None:
            reply, files = got or (None, {})
            if reply is None:
                return _finish("Tamkeen stopped answering before the sync finished. It will carry on next time.", tell)
            if not reply.get("enabled") and reply.get("retry"):
                return _finish("Two of the Anki decks named in Tamkeen's settings clash. Nothing was synced.", tell)
            if not reply.get("enabled"):
                return _finish("Sync with Anki is switched off in Tamkeen's settings.", tell)
            if reply.get("paused"):
                return _finish("Tamkeen is linked to a different Anki collection (another profile). Nothing was "
                               "changed. Open Tamkeen's settings to choose which one to sync with.", tell)
            if reply.get("retry") and number < MAX_ROUNDS:
                return round_(number + 1, None, reply["decks"])
            if mw.col is None:
                return _finish("Anki's collection was closed before the sync finished.", False)
            try:
                done, again = syncer.carry_out(mw.col, reply, files, ids)
            except Exception as exc:
                return _finish(f"The deck could not be changed: {exc}", tell)
            for key in totals:
                totals[key] += done.get(key, 0)
            if done["added"] or done["changed"] or done["removed"] or done["tagged"]:
                try:
                    mw.reset()  # redraw Anki's screens with the changed cards
                except Exception:
                    pass
            if again and number < MAX_ROUNDS:
                return round_(number + 1, done, decks)  # confirms the changes to Tamkeen, and fetches the next batch
            failed = f" {totals['failed']} could not be made and will be tried again." if totals["failed"] else ""
            _finish(f"Synced with Tamkeen. In Anki: {totals['added']} added, {totals['changed']} changed, "
                    f"{totals['removed']} removed.{failed}", tell)

        _background(fetch, use)

    def begin(config) -> None:
        if config is None:
            return _finish("Tamkeen isn't open right now.", tell)
        if not config.get("enabled"):
            return _finish("Sync with Anki is switched off in Tamkeen's settings.", tell)
        timer = _sync["timer"]
        if timer is not None:
            timer.setInterval(max(1, int(config.get("minutes") or 10)) * 60 * 1000)
        round_(1, None, config["decks"])

    _background(lambda: core.ask(url + "/sync/config", token), begin)


def _on_timer() -> None:
    if mw.state != "review":  # never change cards under someone who is in the middle of reviewing
        sync_now()


def _on_state_change(new_state, old_state) -> None:
    if old_state == "review" and new_state != "review":
        sync_now()


def _on_profile_open() -> None:
    if _sync["timer"] is None:
        _sync["timer"] = QTimer(mw)
        _sync["timer"].timeout.connect(_on_timer)
        _sync["timer"].start(10 * 60 * 1000)
    sync_now()


def _before_anki_sync() -> None:
    _remember_deleted()  # Anki forgets its own list of deleted notes once it has synced


gui_hooks.profile_did_open.append(_on_profile_open)
gui_hooks.sync_will_start.append(_before_anki_sync)
gui_hooks.sync_did_finish.append(sync_now)
gui_hooks.state_did_change.append(_on_state_change)
if hasattr(gui_hooks, "notes_will_be_deleted"):
    gui_hooks.notes_will_be_deleted.append(_on_notes_deleted)

_sync_action = QAction("Sync Tamkeen now", mw)
_sync_action.triggered.connect(lambda: sync_now(tell=True))
mw.form.menuTools.addAction(_sync_action)

gui_hooks.reviewer_did_show_question.append(_on_question)
gui_hooks.reviewer_did_answer_card.append(_on_answer)
gui_hooks.profile_did_open.append(_send_soon)

_action = QAction("Tamkeen companion…", mw)
_action.triggered.connect(_status)
mw.form.menuTools.addAction(_action)
