"""Bold and italic words in imported text (web pages and books), kept in each block's kind.

The computer's copy of web/js/blockmarks.js (`blockKind` / `cleanKind`); keep the two alike.
A block's kind is "h1", "h2", "h3", "p", "li" or "q", optionally followed by "|" and its marked
words: "p|b0-2,i5,bi9-10" = words 0 to 2 bold, word 5 italic, words 9 and 10 both. Word numbers
count the block's own words (its text split at spaces), from 0. The string is stored and synced as
it is (segments.kind, the transcript files' `kinds`), and an older app reading it shows a plain
paragraph. Headings keep no marks (they are bold already).
"""

from __future__ import annotations

import re
from typing import Any

BLOCK_KINDS = ("h1", "h2", "h3", "p", "li", "q")
BOLD = 1
ITALIC = 2
MAX_MARKS = 400
_ITEM = re.compile(r"^(b|i|bi|ib)(\d{1,6})(?:-(\d{1,6}))?$")


def decode_kind(kind: Any) -> tuple[str, list[tuple[int, int, int]]]:
    text = str(kind or "")
    head, bar, rest = text.partition("|")
    base = head if head in BLOCK_KINDS else "p"
    marks: list[tuple[int, int, int]] = []
    if bar:
        for item in rest.split(","):
            m = _ITEM.match(item.strip())
            if not m:
                continue
            a = int(m.group(2))
            b = a if m.group(3) is None else int(m.group(3))
            if b < a:
                continue
            marks.append((a, b, (BOLD if "b" in m.group(1) else 0) | (ITALIC if "i" in m.group(1) else 0)))
            if len(marks) >= MAX_MARKS:
                break
    return base, marks


def encode_kind(base: str, marks: list[Any], count: int) -> str:
    kind = base if base in BLOCK_KINDS else "p"
    if not marks or kind.startswith("h") or count <= 0:
        return kind
    flags = [0] * count
    for m in marks:
        if not isinstance(m, (list, tuple)) or len(m) < 2:
            continue
        try:
            a = max(0, int(m[0]))
            b = min(count - 1, int(m[1]))
            f = (int(m[2]) & 3) if len(m) > 2 else BOLD
        except (TypeError, ValueError):
            continue
        for k in range(a, b + 1):
            flags[k] |= f
    items: list[str] = []
    k = 0
    while k < count and len(items) < MAX_MARKS:
        f = flags[k]
        e = k
        while e + 1 < count and flags[e + 1] == f:
            e += 1
        if f:
            name = "b" if f == BOLD else "i" if f == ITALIC else "bi"
            items.append(f"{name}{k}" + (f"-{e}" if e > k else ""))
        k = e + 1
    return f"{kind}|{','.join(items)}" if items else kind


def block_kind(block: dict[str, Any], count: int) -> str:
    """The kind to store for an imported block ({kind, text, marks?}) that keeps `count` words."""
    base, marks = decode_kind(block.get("kind"))
    extra = block.get("marks")
    all_marks: list[Any] = list(marks) + (list(extra) if isinstance(extra, list) else [])
    return encode_kind(base, all_marks, count)
