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
             "th": "Thai", "fa": "Persian", "hi": "Hindi", "ko": "Korean", "en": "English", "de": "German"}
DEFAULT = "ar"  # the app's first language; anything stored before languages existed is Arabic

# Whisper doesn't know Bisaya (Cebuano): it is asked for its closest relative, Tagalog, and the opening
# prompt below keeps it writing Bisaya. (The phone does the same: web/js/stt.js whisperCode.)
WHISPER_CODES = {"ceb": "tl"}

# Opening lines that steer Whisper, by the app's language code: Chinese in simplified characters, and
# Bisaya words and spelling for Bisaya. (The phone's copy: mobile/src/js/transcribe-service.js PROMPTS.)
# The Bisaya one was picked on real Bisaya podcasts (a talk show, Mass readings, Bisaya-English chat,
# storytelling; 2026-10-18): this longer everyday talk kept 97% of the speech against 84% for a shorter
# prompt (on the Mass readings Whisper skipped half the text) with more Bisaya and no more Tagalog
# spellings. It has no food or place talk worth copying: Whisper took "pagkaon" from an earlier try into
# the text. Asking for Indonesian or Malay instead gave Bisaya-looking spellings but lost a quarter of
# the speech and wrote Indonesian ("aku", "terima kasih").
INITIAL_PROMPTS = {
    "zh": "以下是普通话的句子。",
    "ceb": ("Maayong buntag kaninyong tanan! Unsa man ang atong istorya karon? Dili gyud ko kasabot, pero nindot kaayo. "
            "Kumusta na ka? Ayaw kabalaka, okay ra ta. Unsay imong gibuhat ganina? Wala koy kwarta, mao nga nagtrabaho ko. "
            "Ingon niya nga mouli siya ugma sa among balay. Nindot kaayo ang panahon diri sa Sugbo ug sa Davao."),
}


def whisper_code(code: str | None) -> str | None:
    """The code Whisper is asked to listen for when the app's language is `code`."""
    return WHISPER_CODES.get(code, code) if code else code


# Spoken Hindi and Urdu are nearly the same language (they differ mostly in writing: Devanagari and Arabic
# letters, and in some learned words), so Whisper's language guess often says Urdu for Hindi speech. While
# Hindi is studied, speech heard as Urdu counts as Hindi; it is still written down in Devanagari, as Whisper
# is told the language. (The phone's copy: web/js/stt.js SPOKEN_ALIKE.)
SPOKEN_ALIKE = {"hi": ("ur",)}


def heard_as_study(heard: str | None, study: str) -> bool:
    """Is a language Whisper says it heard the one being studied (or one it can't tell apart from it)?"""
    return bool(heard) and (heard == whisper_code(study) or heard in SPOKEN_ALIKE.get(study, ()))

_SCRIPTS = {
    "ar": re.compile("[؀-ۿݐ-ݿࢠ-ࣿ]"),
    "kana": re.compile("[぀-ヿ]"),
    "han": re.compile("[㐀-䶿一-鿿]"),
    "ru": re.compile("[Ѐ-ӿ]"),
    "th": re.compile("[\u0E00-\u0E7F]"),
    "latin": re.compile("[A-Za-zÀ-ɏ]"),
    # Devanagari (U+0900-097F): Hindi, as far as the app is concerned (Marathi and Nepali use it too)
    "hi": re.compile("[{}-{}]".format(chr(0x900), chr(0x97F))),
    "ko": re.compile("[ᄀ-ᇿ㄰-㆏가-힯]"),
}


# Persian is written in Arabic letters, with four of its own (پ چ ژ گ), its own k and y (ک ی where Arabic has
# ك ي) and ZWNJ, the half space inside words (می‌خواهم); Arabic has ة ى ي ك and tanween. (As web/js/languages.js.)
_PERSIAN_SIGNS = re.compile("[پچژگکی‌]")
_ARABIC_SIGNS = re.compile("[ةىيكًٌٍ]")


def looks_persian(text: str, hint: str | None = None) -> bool:
    """Is this Arabic-script text Persian rather than Arabic? A tie counts for the language being studied."""
    sample = (text or "")[:4000]
    fa, ar = len(_PERSIAN_SIGNS.findall(sample)), len(_ARABIC_SIGNS.findall(sample))
    return hint == "fa" if fa == ar else fa > ar


# Persian letters for what speech recognition and Arabic keyboards write (ي ى ك), as persianLetters in
# web/js/languages.js: the Arabic ones look different at the end of a word and miss the dictionaries.
_PERSIAN_LETTERS = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک"})


def persian_letters(text: str) -> str:
    return (text or "").translate(_PERSIAN_LETTERS)


def valid(code: object) -> bool:
    return isinstance(code, str) and code in LANGUAGES


def study() -> str:
    """The language the user is learning (chosen on first run, changeable in Settings)."""
    code = db.get_setting("study_language")
    return code if valid(code) else DEFAULT


def detect(text: str, hint: str | None = None) -> str:
    """Which taught language a text is written in, judged by its letters. Text in Latin letters
    (which could be Spanish, French, Italian, Tagalog, Portuguese, Catalan, Bisaya, German or something else)
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
    if top == "ar":
        return "fa" if looks_persian(sample, hint) else "ar"
    if top in ("ru", "th", "hi", "ko"):
        return top
    return hint
