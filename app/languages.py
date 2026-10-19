"""The languages Tamkeen can teach (server side).

web/js/languages.js holds what differs on screen (direction, fonts, labels). Here it is only
what the server needs: which language Whisper should listen for, and working out what language
an imported web page is written in.
"""

from __future__ import annotations

import re

from . import db

# code -> English name. The codes are also Whisper's language codes, except Bisaya's (WHISPER_CODES).
LANGUAGES = {"es": "Spanish", "ar": "Arabic", "fr": "French", "ja": "Japanese", "zh": "Chinese", "ru": "Russian",
             "it": "Italian", "tl": "Tagalog", "pt": "Brazilian Portuguese", "ca": "Catalan", "ceb": "Bisaya (Cebuano)",
             "th": "Thai", "en": "English"}
DEFAULT = "ar"  # the app's first language; anything stored before languages existed is Arabic

# Whisper doesn't know Bisaya (Cebuano): it is asked for its closest relative, Tagalog, and the opening
# prompt below keeps it writing Bisaya. (The phone does the same: web/js/stt.js whisperCode.)
WHISPER_CODES = {"ceb": "tl"}

# Opening lines that steer Whisper, by the app's language code: Chinese in simplified characters, and
# Bisaya words and spelling for Bisaya.
INITIAL_PROMPTS = {
    "zh": "以下是普通话的句子。",
    "ceb": "Maayong buntag kaninyong tanan. Karon, atong hisgotan ang atong kinabuhi diri sa Sugbo ug sa Mindanao.",
}


def whisper_code(code: str | None) -> str | None:
    """The code Whisper is asked to listen for when the app's language is `code`."""
    return WHISPER_CODES.get(code, code) if code else code

_SCRIPTS = {
    "ar": re.compile("[؀-ۿݐ-ݿࢠ-ࣿ]"),
    "kana": re.compile("[぀-ヿ]"),
    "han": re.compile("[㐀-䶿一-鿿]"),
    "ru": re.compile("[Ѐ-ӿ]"),
    "th": re.compile("[\u0E00-\u0E7F]"),
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
    (which could be Spanish, French, Italian, Tagalog, Portuguese, Catalan, Bisaya or something else)
    counts as the language being studied."""
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
    if top in ("ar", "ru", "th"):
        return top
    return hint
