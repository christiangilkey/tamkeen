"""An original, plain sample "video" for the store screenshots (no Netflix content): a flat dusk city
scene marked "Sample video", 1280x720, 2 frames a second for 100 s, VP8 WebM (PyAV, Pillow; Windows
fonts). Usage: python make_sample_video.py OUT.webm. make_store_images.py says how it is used."""
import random
import sys

import av
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, SECONDS = 1280, 720, 2, 100
SKY = ["#1b1530", "#2a1d45", "#3d2457", "#5a2d63", "#7c3a68", "#a04d6a"]
rng = random.Random(7)

# A skyline: rectangles of different heights, with windows.
buildings = []
x = -20
while x < W + 20:
    w = rng.randint(60, 150)
    h = rng.randint(140, 380)
    buildings.append((x, w, h, rng.choice(["#15112a", "#1a1533", "#211a3d"])))
    x += w + rng.randint(-10, 12)
windows = []
for bx, bw, bh, _ in buildings:
    for wy in range(H - 120 - bh + 18, H - 130, 26):
        for wx in range(bx + 12, bx + bw - 16, 22):
            if rng.random() < 0.28:
                windows.append((wx, wy, rng.choice(["#f2c46d", "#e9a65a", "#7fd6d0"]), rng.random()))

font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)


def frame(i):
    im = Image.new("RGB", (W, H), SKY[0])
    d = ImageDraw.Draw(im)
    band = (H - 120) // len(SKY)
    for k, c in enumerate(SKY):
        d.rectangle([0, k * band, W, (k + 1) * band + 1], fill=c)
    # A low sun with stripes cut through it, slowly setting.
    cx, cy, r = 900, 430 + i * 0.25, 120
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#f3b562")
    for s in range(0, 7):
        y = cy + 10 + s * 16
        d.rectangle([cx - r, y, cx + r, y + 3 + s], fill=SKY[-1])
    for bx, bw, bh, c in buildings:
        d.rectangle([bx, H - 120 - bh, bx + bw, H - 120], fill=c)
    for wx, wy, c, p in windows:
        if (p + i * 0.013) % 1 < 0.85:
            d.rectangle([wx, wy, wx + 9, wy + 12], fill=c)
    d.rectangle([0, H - 120, W, H], fill="#102a33")
    for k in range(6):
        y = H - 120 + 8 + k * k * 4
        d.line([0, y, W, y], fill="#1d4b55", width=2)
    d.text((24, H - 46), "Sample video", font=font, fill="#7f9aa0")
    return im


def main(out):
    with av.open(out, "w", format="webm") as box:
        stream = box.add_stream("libvpx", rate=FPS)
        stream.width, stream.height, stream.pix_fmt = W, H, "yuv420p"
        stream.options = {"crf": "10", "b": "1M"}
        for i in range(FPS * SECONDS):
            for packet in stream.encode(av.VideoFrame.from_image(frame(i))):
                box.mux(packet)
        for packet in stream.encode():
            box.mux(packet)
    frame(20).save(out.replace(".webm", ".png"))


if __name__ == "__main__":
    main(sys.argv[1])
