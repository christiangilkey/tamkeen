"""DESIGN.md audit: colours, shadows and sizes typed outside the tokens.

    python tools/design/audit.py [--all]

Looks at web/css/*.css, mobile/src/css/*.css and the style blocks of the app's scripts. A colour counts when it is
written directly (#hex, rgb(), rgba(), hsl(), a named colour) anywhere except inside a token's own definition
(a line `--name: ...`). Mask gradients (#000 in mask-image) and `transparent` / `currentColor` / `inherit` are fine.
A shadow counts unless it is var(--shadow-float) or none, an inset bevel / pixel outline on game art, a focus
ring, or a band of the page's colour (0 16px 0 var(--surface)) that hides what scrolls under a pinned part.
Prints file:line and the line; with --all, also font sizes, radii and spacing that are not tokens.
"""
import re, sys, glob

FILES = sorted(glob.glob("web/css/*.css") + glob.glob("mobile/src/css/*.css"))
SCRIPTS = [p for p in glob.glob("web/js/**/*.js", recursive=True) + glob.glob("mobile/src/js/**/*.js", recursive=True)
           if not re.search(r"vendor|browser-home|browser-toolbar|youtube-browser|netflix-browser|netflix-pad|reel-embed|reel-page", p)]
COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*\d")
SHADOW = re.compile(r"\b(?:box|text)-shadow\s*:\s*([^;}]+)")
SIZES = re.compile(r"\b(font-size|border-radius|padding|margin|gap)\s*:\s*([^;}]*\d+(?:\.\d+)?px[^;}]*)")


def check(path, text, report, all_):
    for n, line in enumerate(text.split("\n"), 1):
        if re.match(r"\s*--[\w-]+\s*:", line) or "mask" in line:
            continue
        stripped = re.sub(r"/\*.*?\*/", "", line)
        values = " ".join(v for _, v in re.findall(r"(?<![\w-])([a-z-]+)\s*:\s*([^;{}]+)", stripped))  # (declaration values only)
        if COLOUR.search(values):
            report.append(f"{path}:{n}: colour: {line.strip()[:150]}")
        for m in SHADOW.finditer(stripped):
            v = m.group(1).strip()
            if v.startswith("var(--shadow-float)") or v == "none" or "inset" in v or "game-" in v or "200vmax" in v:
                continue
            if re.fullmatch(r"0 -?\d+px 0( 0)? var\(--(surface|paper)\)", v):
                continue  # (a band of the page's colour, hiding what scrolls under a pinned part: not a shadow)
            if "focus" in stripped:
                continue  # (a focus ring)
            report.append(f"{path}:{n}: shadow: {line.strip()[:150]}")
        if all_:
            for m in SIZES.finditer(stripped):
                if "exact" in line:
                    continue
                report.append(f"{path}:{n}: size: {m.group(0)[:80]}")


def main():
    all_ = "--all" in sys.argv
    report = []
    for p in FILES:
        check(p, open(p, encoding="utf8").read(), report, all_)
    for p in SCRIPTS:
        src = open(p, encoding="utf8").read()
        for m in re.finditer(r"style\.textContent = `(.*?)`;", src, re.S):
            start = src[: m.start()].count("\n")
            block = "\n" * start + m.group(1)
            check(p, block, report, all_)
    print("\n".join(report))
    print(f"{len(report)} found")


if __name__ == "__main__":
    main()
