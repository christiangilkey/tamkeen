"""Preview sheets and GIFs of the battle effects over sample ground colours.

    .venv/Scripts/python game/art-src/battle-fx/preview.py sheet ember_projectile ember_impact ...  -> out/_sheet.png
"""
from __future__ import annotations

import random

from PIL import Image, ImageDraw

GROUNDS = {
    "grass": ("#4f8a3a", "#3e7230", "#6aa64a"),
    "sand": ("#dcc48c", "#c6aa70", "#eedcae"),
    "water": ("#2c6c9c", "#24587e", "#4a92c0"),
    "stone": ("#7c7670", "#5c5650", "#9a948c"),
    "lava rock": ("#3a2420", "#2a1816", "#5a2a1c"),
    "night moss": ("#2a2640", "#201c32", "#3a3458"),
    "snow": ("#dfeaf2", "#c2d2de", "#f6fbff"),
}


def ground(name: str, w: int, h: int, seed: int = 1) -> Image.Image:
    """A simple textured patch of ground (preview only, not game art)."""
    base, dark, light = GROUNDS[name]
    im = Image.new("RGBA", (w, h), base)
    d = ImageDraw.Draw(im)
    rng = random.Random(seed)
    for _ in range(w * h // 18):
        x, y = rng.randrange(w), rng.randrange(h)
        if name == "grass":
            d.line([(x, y), (x, y - 1)], fill=dark if rng.random() < 0.6 else light)
        elif name == "water":
            d.line([(x, y), (x + 2, y)], fill=light if rng.random() < 0.4 else dark)
        else:
            d.point((x, y), fill=dark if rng.random() < 0.6 else light)
    return im


def scale(im: Image.Image, s: int) -> Image.Image:
    return im.resize((im.width * s, im.height * s), Image.NEAREST)
