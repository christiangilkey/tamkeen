"""The Chrome Web Store images for "Tamkeen for Netflix", from real screenshots of the extension.
To make them again (after the web app is built: node webapp/build-web.mjs):
  python extension/store/tools/make_sample_video.py SCRATCH/sample.webm
  node extension/test/e2e.mjs --size 1280x800 --video SCRATCH/sample.webm --shots SCRATCH/shots
  python extension/store/tools/make_store_images.py SCRATCH/shots extension/icons/icon-128.png extension/store/images
(SCRATCH: any folder outside the repo.) Needs Pillow (in requirements-dev) and Microsoft Edge.
Usage: python make_store_images.py SHOTS_DIR ICON_128 OUT_DIR
  screenshot-1..5.png  1280x800, RGB (no transparency), full bleed
  promo-small-440x280.png  the small promo tile: plain solid colours, the icon, the name, a real
                           piece of the subtitle bar (cut from screenshot 1)
  store-icon-128.png  the icon at 96x96 inside 16 px of transparent padding (the store's rule)"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

shots, icon_path, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)

ORDER = ["4-netflix-watch-bar-and-sidebar", "5-word-popup-above-the-bar", "8-word-popup-in-the-sidebar",
         "6-webapp-vocab", "9-sidebar-folded"]
for n, name in enumerate(ORDER, 1):
    im = Image.open(shots / f"{name}.png").convert("RGB")
    assert im.size == (1280, 800), (name, im.size)
    im.save(out / f"screenshot-{n}.png", optimize=True)

# The store icon: 96x96 artwork, 16 px transparent padding.
icon = Image.open(icon_path).convert("RGBA")
box = icon.getchannel("A").getbbox()
art = icon.crop(box).resize((96, 96), Image.LANCZOS)
store_icon = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
store_icon.paste(art, (16, 16), art)
store_icon.save(out / "store-icon-128.png", optimize=True)

# The small promo tile, in the app's dark colours.
BG, SURFACE, BORDER, TEXT, MUTED, ACCENT = "#131116", "#1c1a20", "#37323f", "#f2f1ec", "#aaa4b0", "#2bb8c6"
W, H = 440, 280
tile = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(tile)
logo = icon.crop(box).resize((72, 72), Image.LANCZOS)
tile.paste(logo, (28, 30), logo)
bold = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 34)
semi = ImageFont.truetype("C:/Windows/Fonts/seguisb.ttf", 17)
d.text((116, 30), "Tamkeen", font=bold, fill=TEXT)
d.text((117, 76), "for Netflix", font=semi, fill=MUTED)
# A real piece of the subtitle bar: the line with its highlighted word.
shot = Image.open(shots / "4-netflix-watch-bar-and-sidebar.png").convert("RGB")
line = shot.crop((300, 630, 600, 676))  # around the caption in the bar
card = (24, 124, W - 24, 196)
d.rounded_rectangle(card, radius=14, fill=line.getpixel((3, 3)), outline=BORDER, width=1)  # the bar's own colour
lw, lh = line.size
tile.paste(line.resize((int(lw * 1.0), int(lh * 1.0))), ((W - lw) // 2, card[1] + (card[3] - card[1] - lh) // 2))
d.text((W // 2, 226), "Click any subtitle word to learn it", font=semi, fill=ACCENT, anchor="mm")
tile.save(out / "promo-small-440x280.png", optimize=True)
print("ok")
