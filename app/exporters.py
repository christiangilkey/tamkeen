"""Transcript (TXT/SRT/VTT) and vocab (CSV/Anki) exporters. Pure functions."""

from __future__ import annotations

import csv
import html
import io
import re
from collections.abc import Sequence
from typing import Any

from . import arabic

RLM = "‏"  # right-to-left mark helps some subtitle players render Arabic punctuation


def _ts(seconds: float, sep: str) -> str:
    ms_total = max(0, int(round(seconds * 1000)))
    h, rem = divmod(ms_total, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def srt_timestamp(seconds: float) -> str:
    return _ts(seconds, ",")


def vtt_timestamp(seconds: float) -> str:
    return _ts(seconds, ".")


def to_txt(segments: Sequence[dict[str, Any]], title: str = "") -> str:
    lines = [title, ""] if title else []
    lines += [s["text"] for s in segments]
    return "\n".join(lines) + "\n"


def to_srt(segments: Sequence[dict[str, Any]]) -> str:
    out = []
    for i, s in enumerate(segments, 1):
        out.append(f"{i}\n{srt_timestamp(s['start'])} --> {srt_timestamp(s['end'])}\n{RLM}{s['text']}\n")
    return "\n".join(out)


def to_vtt(segments: Sequence[dict[str, Any]]) -> str:
    out = ["WEBVTT", ""]
    for s in segments:
        out.append(f"{vtt_timestamp(s['start'])} --> {vtt_timestamp(s['end'])}\n{RLM}{s['text']}\n")
    return "\n".join(out)


VOCAB_COLUMNS = ["text", "meaning", "notes", "sentence", "episode_title", "start", "end", "created_at"]


def vocab_to_csv(items: Sequence[dict[str, Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Word/Phrase", "Meaning", "Notes", "Sentence", "Episode", "Start (s)", "End (s)"])
    for v in items:
        writer.writerow([v["text"], v["meaning"], v["notes"], unmarked(v["sentence"]), v["episode_title"],
                         f"{v['start']:.2f}" if v["start"] is not None else "",
                         f"{v['end']:.2f}" if v["end"] is not None else ""])
    # BOM so Excel opens UTF-8 Arabic correctly.
    return "﻿" + buf.getvalue()


# ----- Anki -----
# Every exported word is one Anki note in the "Tamkeen" card layout (web/anki-card/), whose
# fields are Front, Back, image and TTS Input:
#   Front  the sentence in the learner's own language with the word's [meaning] in brackets
#          (the prompt); just the meaning for a word that was saved without a translation
#   Back   <b>word</b><br>sentence with the [word] in brackets<br><i>(kind • Label: value)</i><br>Note: ...
#          and, after those, the learner's own notes on the word (its memo) as a second "Note: ..."
# The layout draws that as the word, its sentence with the word highlighted, a grammar box and
# note lines. The image field is never written, so what the learner types there in Anki is safe.

ANKI_NOTETYPE = "Tamkeen"
ANKI_DECK = "Tamkeen"
ANKI_TAG = "tamkeen"
_LABELLED = re.compile(r"^[^:]{1,30}:\s*\S")
# A saved translation whose ⟦ ⟧ marks pair up around some text (one marked part, or several).
_MARKED = re.compile(r"[^⟦⟧]*(?:⟦[^⟦⟧]+⟧[^⟦⟧]*)+")


# ----- keeping the word off the front -----
# The reviewer's rule (hideAnswer in web/js/review/deck.js), written out again here and in
# mobile/src/js/shared-logic.js with the same letter ranges on both sides, so the computer and the
# phone make the same front and the two-way Anki sync has nothing to argue about. A meaning is
# whatever the AI or the learner wrote, and it sometimes names the word itself: "to raise your
# voice (Egyptian dialect: 'تعلّي' = to make a fuss)". On a card's front that gives the answer away.

_SCRIPT_LETTERS = {
    "Arabic": "؀-؋؍-ؚ؜-؞ؠ-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿",
    "Han": "々㐀-䶿一-鿿豈-﫿",
    "Hiragana": "぀-ゟ",
    "Katakana": "゠-ヿㇰ-ㇿ",
    "Cyrillic": "Ѐ-ԯ",
    "Hebrew": "֐-׿",
    "Greek": "Ͱ-Ͽἀ-῿",
    "Hangul": "ᄀ-ᇿ㄰-㆏가-힯",
    "Thai": "฀-๿",
    "Devanagari": "ऀ-ॿ",
}
_JAPANESE = ("Han", "Hiragana", "Katakana")
_MARKS = ("̀-ͯ҃-҉֑-ׇؐ-ًؚ-ٰٟۖ-ۜ۟-ۤۧۨ"
          "۪-ۭ࣓-ࣿऀ-ःऺ-ॏ॑-ॗॢॣัิ-ฺ็-๎"
          "゙゚")
_QUOTES = "\"'‘’“”«»「」『』"


def _answer_pattern(word: str) -> tuple[bool, re.Pattern[str]] | None:
    """What gives ``word`` away inside other text: for a word in its own script, any run of that
    script (with its vowel marks); for a word in Latin letters, that very word."""
    used = [name for name, letters in _SCRIPT_LETTERS.items() if re.search(f"[{letters}]", word)]
    if any(name in _JAPANESE for name in used):  # a kanji word's reading is in kana
        used = [name for name in _SCRIPT_LETTERS if name in used or name in _JAPANESE]
    if used:
        letter = "[" + "".join(_SCRIPT_LETTERS[name] for name in used) + "]"
        return True, re.compile(letter + "(?:[" + _MARKS + "ـ‌-‏\\s'’-]*" + letter + ")*[" + _MARKS + "]*")
    exact = word.strip()
    return (False, re.compile(r"(?<!\w)" + re.escape(exact) + r"(?!\w)", re.I)) if exact else None


def hide_answer(text: str, word: str) -> str:
    """``text`` (a meaning) without anything that gives ``word`` away: an aside in brackets that
    mentions it is dropped whole, the word in quote marks is dropped, and for a word in its own
    script any of that script left over is dropped too. A word in Latin letters is only removed
    inside brackets or quotes, never bare ("animal" really does mean "animal"). What is left is
    tidied of the punctuation that hung on the removed part."""
    original = (text or "").strip()
    found = _answer_pattern(str(word or ""))
    if not found or not found[1].search(original):
        return original
    script, rx = found
    out = original
    for _ in range(2):
        out = re.sub(r"\s*[(\[（][^()\[\]（）]*[)\]）]", lambda m: "" if rx.search(m.group(0)) else m.group(0), out)
    quoted = re.compile(r"\s*[" + _QUOTES + "]([^" + _QUOTES + "]{1,60})[" + _QUOTES + "]")
    out = quoted.sub(lambda m: "" if rx.search(m.group(1)) and not re.search(r"[^\W_]", rx.sub("", m.group(1)))
                     else m.group(0), out)
    if script:
        out = rx.sub("", out)
    out = re.sub(r"[(\[（]\s*[)\]）]", "", out)                  # brackets left empty
    out = re.sub(r"([,;/(（]|^)\s*[=:→]\s*", r"\1 ", out)        # "= ..." with nothing before the sign
    out = re.sub(r"\s*[=:→]\s*(?=[,;/)）]|$)", "", out)          # "... =" with nothing after it
    out = re.sub(r"\s*([,;/])(?:\s*[,;/])+", r"\1", out)         # separators left side by side
    out = re.sub(r"\s{2,}", " ", re.sub(r"\s+([,;.)）])", r"\1", out))
    return re.sub(r"^[\s,;/=:–-]+|[\s,;/=:–-]+$", "", out)


def gives_away(text: str, word: str) -> bool:
    """Whether ``text`` shows ``word`` (as hide_answer would find it)."""
    found = _answer_pattern(str(word or ""))
    return bool(found and found[1].search(text or ""))


def anki_guid(v: dict[str, Any]) -> str:
    """The same word always gets the same id in Anki, so exporting twice never doubles a card."""
    return f"tk-{v.get('uid') or ''}"


def _anki_field(text: str) -> str:
    return text.replace("\t", " ").replace("\r", "").replace("\n", "<br>")


def anki_grammar(notes: str) -> tuple[str, list[str]]:
    """Split a word's notes into the grammar line and the free notes.

    Notes saved from a looked-up word read "Dictionary form: X · Root: Y · noun · a remark".
    The labelled pieces and the kind of word make the grammar line; everything else stays a note.
    Notes the learner typed themselves have no labels, so they stay notes untouched.
    """
    pieces = [p.strip() for line in notes.replace("\r", "").split("\n") for p in line.split(" · ")]
    pieces = [p for p in pieces if p]
    rows = [p for p in pieces if _LABELLED.match(p)]
    kind = ""
    if rows:
        kind = next((p for p in pieces if p not in rows and len(p) <= 30 and len(p.split()) <= 3
                     and not any(c in p for c in ".!?")), "")
    free = [p for p in pieces if p not in rows and p != kind]
    return " • ".join(([kind] if kind else []) + rows), free


def anki_front(v: dict[str, Any]) -> str:
    """The prompt side of a word's card.

    A word saved from a lookup carries its sentence translated, with ⟦ ⟧ around the part that
    renders the word; the marks become the [brackets] the card layout highlights (brackets of
    the translation's own turn into parentheses, so only the word's part lights up). A word
    without such a translation shows its meaning, kept from giving the word away (``hide_answer``).
    With nothing of the meaning left, it shows the translated sentence if that does not show the
    word, else its own sentence with "…" where the word is, else just "…": never the word itself.
    """
    translation = v.get("translation") or ""
    if _MARKED.fullmatch(translation):
        plain = translation.replace("[", "(").replace("]", ")")
        return html.escape(plain).replace("⟦", "[").replace("⟧", "]")
    text = v.get("text") or ""
    meaning = hide_answer(v.get("meaning") or "", text)
    if meaning:
        return html.escape(meaning)
    said = translation.replace("⟦", "").replace("⟧", "").strip()
    if said and not gives_away(said, text):
        return html.escape(said)
    sentence = unmarked(v.get("sentence"))
    spans = arabic.find_spans(sentence, text) if text else []
    if spans:
        a, b = spans[0]
        return html.escape(f"{sentence[:a]}…{sentence[b:]}".strip())
    return "…"


def unmarked(text: str | None) -> str:
    """``text`` without the ⟦ ⟧ marks round the parts its card lights up (web/js/cardtext.js)."""
    return (text or "").replace("⟦", "").replace("⟧", "")


def _tidy_marks(plain: str, marks: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Lit parts in order, without spaces at their ends, joined where they touch or only spaces lie
    between (tidyMarks in web/js/cardtext.js)."""
    out: list[list[int]] = []
    for a, b in sorted(marks):
        a = max(0, min(a, len(plain)))
        b = max(a, min(b, len(plain)))
        while a < b and plain[a].isspace():
            a += 1
        while b > a and plain[b - 1].isspace():
            b -= 1
        if a >= b:
            continue
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        elif out and not plain[out[-1][1]:a].strip():
            out[-1][1] = b
        else:
            out.append([a, b])
    return [(a, b) for a, b in out]


def sentence_marks(text: str | None) -> tuple[str, list[tuple[int, int]], bool]:
    """A sentence's ⟦ ⟧ marks, as readMarks in web/js/cardtext.js reads them: (the sentence without
    them, the lit parts as (from, to) in it, whether the learner put out everything: an empty pair).
    The learner chooses them by holding words on the review card. Marks that don't pair up count for
    nothing."""
    text = text or ""
    plain = unmarked(text)
    if len(plain) == len(text):
        return plain, [], False
    marks: list[tuple[int, int]] = []
    start, at, none = -1, 0, False
    for ch in text:
        if ch == "⟦":
            if start >= 0:
                return plain, [], False
            start = at
        elif ch == "⟧":
            if start < 0:
                return plain, [], False
            if at > start:
                marks.append((start, at))
            else:
                none = True
            start = -1
        else:
            at += 1
    if start >= 0:
        return plain, [], False
    lit = _tidy_marks(plain, marks)
    return plain, lit, none and not lit


def anki_fields(v: dict[str, Any]) -> tuple[str, str]:
    """(Front, Back) for one saved word."""
    word = html.escape(v["text"])
    sentence, marks, none = sentence_marks(v["sentence"])
    spans = [] if none else marks or (arabic.find_spans(sentence, v["text"])[:1] if v["text"] else [])
    if spans:
        # The parts the learner lit up on the card, else the word found whatever its vowel marks: in
        # brackets, as the card layout lights them (the sentence's own brackets become parentheses then,
        # so only those parts light up; a sentence lit by itself is kept as it always was).
        own = sentence.replace("[", "(").replace("]", ")") if marks else sentence
        out, at = "", 0
        for a, b in spans:
            out += f"{html.escape(own[at:a])}[{html.escape(own[a:b])}]"
            at = b
        sentence = out + html.escape(own[at:])
    else:
        sentence = html.escape(sentence)
    grammar, free = anki_grammar(v["notes"] or "")
    lines = [f"<b>{word}</b>"]
    if sentence:
        lines.append(sentence)
    if grammar:
        lines.append(f"<i>({html.escape(grammar)})</i>")
    lines += [("Note: " if n == 0 else "") + html.escape(note) for n, note in enumerate(free)]
    # The learner's own notes (a mnemonic, say) follow as a note of their own, line for line.
    own = [m.strip() for m in (v.get("memo") or "").replace("\r", "").split("\n") if m.strip()]
    lines += [("Note: " if n == 0 else "") + html.escape(m) for n, m in enumerate(own)]
    return _anki_field(anki_front(v)), _anki_field("<br>".join(lines))


def vocab_to_anki(items: Sequence[dict[str, Any]]) -> str:
    """Anki 'Notes in Plain Text' import format (File → Import), with header directives.

    Used where a deck file can't be built (the phone). The cards are the same as in the deck
    file, without audio; they take the Tamkeen layout once Anki has it from a deck file.
    """
    lines = [
        "#separator:tab",
        "#html:true",
        "#if matches:keep current",
        f"#notetype:{ANKI_NOTETYPE}",
        f"#deck:{ANKI_DECK}",
        "#guid column:1",
        "#tags column:4",
        "#columns:GUID\tFront\tBack\tTags",
    ]
    for v in items:
        front, back = anki_fields(v)
        lines.append("\t".join((anki_guid(v), front, back, ANKI_TAG)))
    return "\n".join(lines) + "\n"
