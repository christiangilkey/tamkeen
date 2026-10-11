"""Scratch: look at PNGs (enlarged, on the game's dark background) and report their size, colours and
whether any pixel is partly transparent or pure black. Usage: look.py OUT.png SCALE COLS file-or-folder ..."""
import sys
from pathlib import Path

from PIL import Image

out, scale, cols = Path(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
files = []
for a in sys.argv[4:]:
    if a == "-v":
        continue
    p = Path(a)
    files += sorted(p.glob("*.png")) if p.is_dir() else [p]
ims = [Image.open(f).convert("RGBA") for f in files]
for f, im in zip(files, ims):
    px = list(im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata())
    cols_used = sorted({"#%02x%02x%02x" % p[:3] for p in px if p[3]})
    flags = []
    if any(p[3] not in (0, 255) for p in px):
        flags.append("PARTIAL ALPHA")
    if (0, 0, 0, 255) in px:
        flags.append("PURE BLACK")
    print(f"{f.name}: {im.width}x{im.height}, {sum(1 for p in px if p[3])} px, {len(cols_used)} colours {' '.join(flags)}")
    if "-v" in sys.argv:
        print("   ", " ".join(cols_used))
pad = 3
cw, ch = max(i.width for i in ims), max(i.height for i in ims)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGBA", (cols * (cw + pad) + pad, rows * (ch + pad) + pad), (30, 22, 52, 255))
for n, im in enumerate(ims):
    x, y = pad + (n % cols) * (cw + pad), pad + (n // cols) * (ch + pad)
    sheet.alpha_composite(Image.new("RGBA", (cw, ch), (62, 50, 96, 255)), (x, y))
    sheet.alpha_composite(im, (x + (cw - im.width) // 2, y + (ch - im.height)))
sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST).save(out)
