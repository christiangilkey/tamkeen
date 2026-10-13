"""The memory model behind the vocab reviewer: FSRS-6 with its published default parameters.

This is web/js/review/fsrs.js in Python (that file explains the model). The reviewer itself runs
in the page; the computer needs the same sums only to write a word's review progress into an
Anki deck. tests/fixtures/fsrs_parity.json keeps the two in step.

What is stored is the list of a word's answers, each ``[t, rating, day, ms]``: when
(milliseconds), GOOD / AGAIN (0 = taken back), the answering device's local day number, and how
long the card was looked at. A word's state is worked out by replaying them.
"""

from __future__ import annotations

import math
from typing import Any

W = (0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
     1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542)
RETENTION = 0.9
AGAIN, GOOD = 1, 3
MAX_DAYS = 36500
AGAIN_SECONDS = 60
MIN_STABILITY = 0.001
DECAY = -W[20]
FACTOR = math.pow(0.9, 1 / DECAY) - 1


def _clamp(x: float, low: float, high: float) -> float:
    return min(high, max(low, x))


def recall(days: float, s: float) -> float:
    """The chance (0..1) of recalling a word ``days`` after its last answer."""
    return math.pow(1 + (FACTOR * days) / s, DECAY)


def wait_for(s: float, retention: float = RETENTION) -> int:
    """Whole days to wait so that the chance of recall is ``retention`` when the word returns."""
    return int(_clamp(math.floor((s / FACTOR) * (math.pow(retention, 1 / DECAY) - 1) + 0.5), 1, MAX_DAYS))


def _first_difficulty(rating: int) -> float:
    return W[4] - math.exp(W[5] * (rating - 1)) + 1


def _next_difficulty(d: float, rating: int) -> float:
    moved = d + (-W[6] * (rating - 3) * (10 - d)) / 9
    return _clamp(W[7] * _first_difficulty(4) + (1 - W[7]) * moved, 1, 10)


def _after_recall(d: float, s: float, r: float) -> float:
    return s * (1 + math.exp(W[8]) * (11 - d) * math.pow(s, -W[9]) * (math.exp((1 - r) * W[10]) - 1))


def _after_forgetting(d: float, s: float, r: float) -> float:
    return min(W[11] * math.pow(d, -W[12]) * (math.pow(s + 1, W[13]) - 1) * math.exp((1 - r) * W[14]),
               s / math.exp(W[17] * W[18]))


def _same_day(s: float, rating: int) -> float:
    change = math.exp(W[17] * (rating - 3 + W[18])) * math.pow(s, -W[19])
    return s * (max(change, 1) if rating >= GOOD else change)


def answer(card: dict[str, Any] | None, rating: int, day: int) -> dict[str, Any]:
    """A word's state after one more answer on local day ``day`` (``card`` is None for a word
    never answered). See fsrs.js for what each part of the state means."""
    again = rating == AGAIN
    if card is None:
        s, d = W[rating - 1], _first_difficulty(rating)
    else:
        days = max(0, day - card["day"])
        if days == 0:
            s = _same_day(card["s"], rating)
        elif again:
            s = _after_forgetting(card["d"], card["s"], recall(days, card["s"]))
        else:
            s = _after_recall(card["d"], card["s"], recall(days, card["s"]))
        d = _next_difficulty(card["d"], rating)
    s = _clamp(s, MIN_STABILITY, MAX_DAYS)
    d = _clamp(d, 1, 10)
    ivl = 0 if again else wait_for(s)
    return {
        "s": s, "d": d, "day": day, "due": day + ivl, "ivl": ivl,
        "reps": (card["reps"] if card else 0) + 1,
        "lapses": (card["lapses"] if card else 0) + (1 if again and card and card["known"] and not card["learning"] else 0),
        "learning": again,
        "known": (not again) or bool(card and card["known"]),
        "first": card["first"] if card else day,
    }


def _number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def answers(entries: Any) -> list[list[Any]]:
    """The answers that count, oldest first (ones taken back, and anything malformed, are dropped)."""
    kept = [list(e) for e in (entries if isinstance(entries, (list, tuple)) else [])
            if isinstance(e, (list, tuple)) and len(e) >= 3 and _number(e[0]) and e[1] in (AGAIN, GOOD) and _number(e[2])]
    return sorted(kept, key=lambda e: e[0])


def history(entries: Any) -> list[dict[str, Any]]:
    """Every answer with the word's state before and after it."""
    out: list[dict[str, Any]] = []
    card: dict[str, Any] | None = None
    for e in answers(entries):
        t, rating, day = e[0], e[1], int(e[2])
        ms = e[3] if len(e) > 3 and _number(e[3]) else 0
        after = answer(card, rating, max(day, card["day"]) if card else day)
        out.append({"t": t, "rating": rating, "ms": ms, "before": card, "after": after})
        card = after
    return out


def replay(entries: Any) -> dict[str, Any] | None:
    """A word's state now, from its list of answers; None for a word never answered."""
    steps = history(entries)
    return steps[-1]["after"] if steps else None


# ----- what the Anki export writes (anki_deck.py explains Anki's side) -----

def anki_data(card: dict[str, Any]) -> str:
    """Anki's note of a card's memory state (its cards.data column)."""
    return f'{{"s":{card["s"]:.4f},"d":{card["d"]:.4f},"dr":{RETENTION},"decay":{W[20]}}}'


def anki_schedule(card: dict[str, Any], today: int) -> tuple[int, int, int, int, int, int, int]:
    """Anki's (type, queue, due, interval, ease, reviews, lapses) for a word with this state.
    A word still to be remembered today goes over as due today."""
    return (2, 2, 0 if card["learning"] else max(0, card["due"] - today), max(1, card["ivl"]), 2500,
            card["reps"], card["lapses"])


def anki_log(entries: Any) -> list[tuple[int, int, int, int, int, int, int]]:
    """Anki's review log for a word: (id, ease, interval, interval before, factor, time, type) per
    answer. Intervals are days, or seconds as a negative number while a word is being learned;
    type is 0 learning, 1 review, 2 relearning."""
    def interval(card: dict[str, Any] | None) -> int:
        return 0 if card is None else -AGAIN_SECONDS if card["learning"] else card["ivl"]

    return [(math.floor(step["t"]), step["rating"], interval(step["after"]), interval(step["before"]),
             math.floor(((step["after"]["d"] - 1) / 9 + 0.1) * 1000),
             int(_clamp(math.floor(step["ms"]), 0, 60000)),
             0 if step["before"] is None or not step["before"]["known"] else 2 if step["before"]["learning"] else 1)
            for step in history(entries)]
