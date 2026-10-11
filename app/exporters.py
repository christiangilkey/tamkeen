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
        writer.writerow([v["text"], v["meaning"], v["notes"], v["sentence"], v["episode_title"],
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
# The layout draws that as the word, its sentence with the word highlighted, a grammar box and
# note lines. The image field is never written, so what the learner types there in Anki is safe.

ANKI_NOTETYPE = "Tamkeen"
ANKI_DECK = "Tamkeen"
ANKI_TAG = "tamkeen"
_LABELLED = re.compile(r"^[^:]{1,30}:\s*\S")
# A saved translation whose ⟦ ⟧ marks pair up around some text (one marked part, or several).
_MARKED = re.compile(r"[^⟦⟧]*(?:⟦[^⟦⟧]+⟧[^⟦⟧]*)+")


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
    without such a translation shows its meaning, or the word itself when it has none.
    """
    translation = v.get("translation") or ""
    if _MARKED.fullmatch(translation):
        plain = translation.replace("[", "(").replace("]", ")")
        return html.escape(plain).replace("⟦", "[").replace("⟧", "]")
    return html.escape(v["meaning"] or "") or html.escape(v["text"])


def anki_fields(v: dict[str, Any]) -> tuple[str, str]:
    """(Front, Back) for one saved word."""
    word = html.escape(v["text"])
    sentence = v["sentence"] or ""
    spans = arabic.find_spans(sentence, v["text"]) if v["text"] else []
    if spans:  # found whatever its vowel marks: put the sentence's own spelling in brackets
        a, b = spans[0]
        sentence = f"{html.escape(sentence[:a])}[{html.escape(sentence[a:b])}]{html.escape(sentence[b:])}"
    else:
        sentence = html.escape(sentence)
    grammar, free = anki_grammar(v["notes"] or "")
    lines = [f"<b>{word}</b>"]
    if sentence:
        lines.append(sentence)
    if grammar:
        lines.append(f"<i>({html.escape(grammar)})</i>")
    lines += [("Note: " if n == 0 else "") + html.escape(note) for n, note in enumerate(free)]
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
