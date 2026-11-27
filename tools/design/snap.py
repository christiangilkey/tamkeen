"""Snap a stylesheet's typed-in sizes to DESIGN.md's tokens (the design sweep, 2026-11-27).

    python tools/design/snap.py <file> [--from "marker text"] [--to "marker text"] [--lines A-B] [--dry]

Within the chosen part of the file (all of it by default), inside CSS declarations only:
  font-size (and the size in a `font:` shorthand) -> var(--fs-12|14|16|20|26|34|48), the nearest
  padding / margin / gap (every value of the shorthand; negatives too) -> var(--s-4 ... --s-64), the nearest;
      0, 1px and auto stay as they are
  border-radius -> 0 | var(--r-s) | var(--r-l) | var(--r-pill) (50% stays: a circle)
  font-weight -> 400 | 600 | 700
  line-height between 1.05 and 1.8 -> var(--lh-head) (under 1.35) or var(--lh-text)
Colours and shadows are not touched: they need a person's judgement (which job does this colour do?).
It prints how many values it changed. Look at the screen afterwards.
"""
import re
import sys

FS = [12, 14, 16, 20, 26, 34, 48]
SP = [4, 8, 12, 16, 24, 32, 48, 64]


def nearest(n, scale):
    return min(scale, key=lambda v: (abs(v - n), -v))  # (a tie goes to the larger)


def snap_space(tok):
    m = re.fullmatch(r"(-?)(\d+(?:\.\d+)?)px", tok)
    if not m:
        return tok
    sign, n = m.group(1), float(m.group(2))
    if n <= 1:
        return tok
    v = nearest(n, SP)
    return f"calc(-1 * var(--s-{v}))" if sign else f"var(--s-{v})"


def snap_radius(tok):
    m = re.fullmatch(r"(\d+(?:\.\d+)?)px", tok)
    if not m:
        return tok
    n = float(m.group(1))
    if n == 0:
        return "0"
    if n >= 99:
        return "var(--r-pill)"
    if n >= 18:
        return "var(--r-l)"
    return "var(--r-s)"


def snap_decl(prop, value, counts):
    prop_l = prop.strip().lower()
    out = value
    if prop_l == "font-size":
        m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)px(\s*!important)?\s*", value)
        if m:
            out = f" var(--fs-{nearest(float(m.group(1)), FS)}){m.group(2) or ''}"
    elif prop_l == "font":
        def f(m):
            return f"var(--fs-{nearest(float(m.group(1)), FS)})" + (m.group(2) or "")
        out = re.sub(r"(?<![\w.-])(\d+(?:\.\d+)?)px(/[\d.]+)?", f, value, count=1)
    elif re.fullmatch(r"(padding|margin)(-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?|gap|row-gap|column-gap", prop_l):
        if "calc(" in value or "var(" in value or "env(" in value or "max(" in value or "min(" in value or "clamp(" in value:
            return value
        parts = re.split(r"(\s+)", value)
        out = "".join(snap_space(p) if p.strip() else p for p in parts)
    elif prop_l in ("border-radius",) or re.fullmatch(r"border-(top|bottom)-(left|right)-radius|border-(start|end)-(start|end)-radius", prop_l):
        if "var(" in value or "calc(" in value:
            return value
        parts = re.split(r"(\s+)", value)
        out = "".join(snap_radius(p) if p.strip() else p for p in parts)
    elif prop_l == "font-weight":
        m = re.fullmatch(r"\s*(\d{3})(\s*!important)?\s*", value)
        if m:
            n = int(m.group(1))
            w = 400 if n < 500 else 600 if n < 700 else 700
            out = f" {w}{m.group(2) or ''}"
    elif prop_l == "line-height":
        m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)(\s*!important)?\s*", value)
        if m:
            n = float(m.group(1))
            if 1.05 <= n <= 1.8:
                out = f" var(--lh-{'head' if n < 1.35 else 'text'}){m.group(2) or ''}"
    if out != value:
        counts[prop_l.split("-")[0]] = counts.get(prop_l.split("-")[0], 0) + 1
    return out


DECL = re.compile(r"(?<=[{;\s])([a-z-]+)(\s*:)([^;{}]+?)(?=;|\s*})")


def snap(text, counts):
    def rep(m):
        prop, colon, value = m.group(1), m.group(2), m.group(3)
        if prop.startswith("--"):
            return m.group(0)
        return prop + colon + snap_decl(prop, value, counts)
    return DECL.sub(rep, text)


def main():
    args = sys.argv[1:]
    path = args[0]
    dry = "--dry" in args
    src = open(path, encoding="utf8", newline="").read()
    start, end = 0, len(src)
    if "--from" in args:
        start = src.index(args[args.index("--from") + 1])
    if "--to" in args:
        end = src.index(args[args.index("--to") + 1], start)
    if "--lines" in args:
        a, b = map(int, args[args.index("--lines") + 1].split("-"))
        lines = src.splitlines(keepends=True)
        start = sum(len(x) for x in lines[: a - 1])
        end = sum(len(x) for x in lines[:b])
    counts = {}
    part = snap(src[start:end], counts)
    if not dry:
        open(path, "w", encoding="utf8", newline="").write(src[:start] + part + src[end:])
    print(path, counts)


if __name__ == "__main__":
    main()
