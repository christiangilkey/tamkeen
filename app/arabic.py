"""Arabic text normalization for search matching (and Hindi's nukta and chandrabindu, written or not, and Latin's
macrons: ā = a).

Normalization is only ever applied to *copies* used for matching. Displayed text keeps
Whisper's output exactly, diacritics included.
"""

from __future__ import annotations

import re

# Tashkeel (harakat, tanween, shadda, sukun), Quranic annotation marks, superscript alef.
_DIACRITICS = re.compile(
    "[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ࣓-ࣿ]"
)
# Hindi: the nukta (ज़ / ज) is left off too, as people often write without it.
# Latin's macron (ā ē ī ō ū: long vowels), which most Latin text leaves out, is left off too when it is a mark of its own.
_DIACRITICS = re.compile(_DIACRITICS.pattern[:-1] + "\N{DEVANAGARI SIGN NUKTA}\N{COMBINING MACRON}]")
_TATWEEL = "ـ"

_CHAR_MAP = str.maketrans(
    {
        "آ": "ا",  # آ -> ا
        "أ": "ا",  # أ -> ا
        "إ": "ا",  # إ -> ا
        "ٱ": "ا",  # ٱ -> ا
        "ٲ": "ا",  # ٲ -> ا
        "ٳ": "ا",  # ٳ -> ا
        "ة": "ه",  # ة -> ه
        "ى": "ي",  # ى -> ي
        "ؤ": "و",  # ؤ -> و
        "ئ": "ي",  # ئ -> ي
        _TATWEEL: None,
        # Persian: its own y and k (ی ک) match the Arabic ones, ۀ matches ه, and the half space inside a
        # word (ZWNJ: می‌خواهم) is ignored, so a word typed with or without it is found either way.
        "ی": "ي",  # ی -> ي
        "ک": "ك",  # ک -> ك
        "ۀ": "ه",  # ۀ -> ه
        "‌": None,
        # Latin: a vowel with a macron matches it without (amō / amo); no other language taught writes these.
        **dict(zip("āēīōūȳĀĒĪŌŪȲ", "aeiouyAEIOUY")),
        "\N{DEVANAGARI SIGN CANDRABINDU}": "\N{DEVANAGARI SIGN ANUSVARA}",  # Hindi हूँ / हूं: one way of writing
    }
)

_WS = re.compile(r"\s+")


def strip_diacritics(text: str) -> str:
    return _DIACRITICS.sub("", text)


def normalize(text: str) -> str:
    """Normalize Arabic for matching: strip tashkeel/tatweel, unify alef/yaa/taa-marbuta forms."""
    text = strip_diacritics(text).translate(_CHAR_MAP)
    return _WS.sub(" ", text).strip().lower()


def find_spans(original: str, query: str) -> list[tuple[int, int]]:
    """Find ``query`` in ``original`` using normalized matching.

    Returns (start, end) character offsets into the *original* (diacritized) text, so the
    UI can highlight matches without altering what is displayed.
    """
    q = normalize(query)
    if not q:
        return []
    norm_chars: list[str] = []
    index: list[int] = []  # index[i] = offset in original of norm_chars[i]
    prev_space = True
    for i, ch in enumerate(original):
        if ch.isspace():
            if not prev_space:
                norm_chars.append(" ")
                index.append(i)
            prev_space = True
            continue
        mapped = strip_diacritics(ch).translate(_CHAR_MAP).lower()
        for m in mapped:
            norm_chars.append(m)
            index.append(i)
        if mapped:
            prev_space = False
    norm = "".join(norm_chars)
    spans: list[tuple[int, int]] = []
    pos = norm.find(q)
    while pos != -1:
        start = index[pos]
        end = index[pos + len(q) - 1] + 1
        # Extend over trailing diacritics so highlighted words keep their marks.
        while end < len(original) and not strip_diacritics(original[end]) and not original[end].isspace():
            end += 1
        spans.append((start, end))
        pos = norm.find(q, pos + len(q))
    return spans
