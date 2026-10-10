"""The languages Tamkeen can teach (server side).

web/js/languages.js holds what differs on screen (direction, fonts, labels). Here it is only
what the server needs: which language Whisper should listen for, and working out what language
an imported web page is written in.
"""

from __future__ import annotations

import re

from . import db

# code -> English name. The codes are also Whisper's language codes.
LANGUAGES = {"es": "Spanish", "ar": "Arabic", "fr": "French", "ja": "Japanese", "zh": "Chinese", "ru": "Russian"}
DEFAULT = "ar"  # the app's first language; anything stored before languages existed is Arabic

# Whisper writes Chinese in either script unless nudged; this opening line asks for simplified.
INITIAL_PROMPTS = {"zh": "以下是普通话的句子。"}

_SCRIPTS = {
    "ar": re.compile("[؀-ۿݐ-ݿࢠ-ࣿ]"),
    "kana": re.compile("[぀-ヿ]"),
    "han": re.compile("[㐀-䶿一-鿿]"),
    "ru": re.compile("[Ѐ-ӿ]"),
    "latin": re.compile("[A-Za-zÀ-ɏ]"),
}


def valid(code: object) -> bool:
    return isinstance(code, str) and code in LANGUAGES


def study() -> str:
    """The language the user is learning (chosen on first run, changeable in Settings)."""
    code = db.get_setting("study_language")
    return code if valid(code) else DEFAULT


def detect(text: str, hint: str | None = None) -> str:
    """Which taught language a text is written in, judged by its letters. Text in Latin letters
    (which could be Spanish, French or something else) counts as the language being studied."""
    hint = hint if valid(hint) else study()
    sample = (text or "")[:4000]
    counts = {name: len(rx.findall(sample)) for name, rx in _SCRIPTS.items()}
    top = max(counts, key=lambda k: counts[k])
    if not counts[top]:
        return hint
    if counts["kana"] and top in ("han", "kana"):
        return "ja"
    if top == "han":
        return "ja" if hint == "ja" else "zh"
    if top in ("ar", "ru"):
        return top
    return hint
