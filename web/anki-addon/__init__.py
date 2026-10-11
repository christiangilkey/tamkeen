"""Tamkeen companion for Anki.

Tells the Tamkeen app on this computer how your Anki reviews are going, so they count toward your
creature: clearing what is due is the day's goal, and cards that become mature earn a bonus.
Only numbers are sent (reviews, failed, matured, still due), to Tamkeen on this computer only.

This file is the part that talks to Anki; the logic is in core.py.
"""

from __future__ import annotations

import os
import threading

from aqt import gui_hooks, mw
from aqt.qt import QAction, QTimer
from aqt.utils import showInfo

from . import core

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
             f"{rec.get('due_left', '?')} still due.\n\nOnly these numbers are sent, to Tamkeen on this computer.",
             title="Tamkeen companion")
    _send_soon()


gui_hooks.reviewer_did_show_question.append(_on_question)
gui_hooks.reviewer_did_answer_card.append(_on_answer)
gui_hooks.profile_did_open.append(_send_soon)

_action = QAction("Tamkeen companion…", mw)
_action.triggered.connect(_status)
mw.form.menuTools.addAction(_action)
