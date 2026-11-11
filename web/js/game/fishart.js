// Fish pictures: a fish's drawing (game-art/fish/<id>.png, 24 x 16, facing right) as a small canvas, with an edge in
// its tier's colour from Rare up, so a rare fish looks rare wherever it is shown (the pond, the basket, the Fishdex,
// the aquarium, a friend's aquarium). A fish whose picture is missing is drawn as a plain grey shape instead.

import { FISH_ART, fishById } from "./fishdata.js";
import { RARE, TIERS } from "./loot.js";
import { loadImage } from "./render.js";

const [FW, FH] = FISH_ART;
/** A fish sprite's size: its drawing with a pixel of room all round for the tier's edge. */
export const SPRITE = [FW + 2, FH + 2];
const sprites = new Map(); // "sp|tier" -> Promise<canvas>

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) || 0);

/** A plain fish shape, for a picture that didn't load. */
function plainFish(ctx) {
  ctx.fillStyle = "#8a93a6";
  for (let x = 6; x < 22; x++) {
    const half = Math.round(5 * Math.sqrt(Math.max(0, 1 - ((x - 14) / 8) ** 2)));
    ctx.fillRect(x + 1, 9 - half, 1, half * 2);
  }
  for (let i = 0; i < 5; i++) ctx.fillRect(2 + i, 9 - (5 - i), 1, (5 - i) * 2);
  ctx.fillStyle = "#1b1420";
  ctx.fillRect(19, 7, 1, 1);
}

/** Colour the empty pixels that touch the drawing: an edge one pixel wide. */
function edge(ctx, colour) {
  const { width: w, height: h } = ctx.canvas;
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 40;
  const at = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) at.push((y * w + x) * 4);
    }
  }
  const [r, g, b] = rgb(colour);
  for (const i of at) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; }
  ctx.putImageData(data, 0, 0);
}

/** The sprite of fish `sp` at `tier`: a canvas SPRITE in size, facing right (made once, then kept). */
export function fishSprite(sp, tier = 0) {
  const key = `${sp}|${tier}`;
  if (!sprites.has(key)) {
    sprites.set(key, loadImage(`fish/${sp}.png`).then((img) => {
      const c = document.createElement("canvas");
      [c.width, c.height] = SPRITE;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      if (img) ctx.drawImage(img, 1, 1); else plainFish(ctx);
      if (tier >= RARE && TIERS[tier]) edge(ctx, TIERS[tier].colour);
      return c;
    }));
  }
  return sprites.get(key);
}

/** A fish's picture as an element: its sprite `scale` times its size (whole numbers keep the pixels square). */
export function fishPicture(sp, tier = 0, scale = 2) {
  const c = document.createElement("canvas");
  c.className = "fish-pic";
  [c.width, c.height] = SPRITE;
  c.style.width = `${SPRITE[0] * scale}px`;
  c.style.height = `${SPRITE[1] * scale}px`;
  const fish = fishById(sp);
  if (fish) c.setAttribute("aria-label", fish.name);
  fishSprite(sp, tier).then((s) => { c.getContext("2d").drawImage(s, 0, 0); });
  return c;
}

/** A fish on a square tile, 32 x 32, its drawing in the middle at its own size (the face of a reveal: reveal.js). */
export function fishTile(sp, tier = 0) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  fishSprite(sp, tier).then((s) => { c.getContext("2d").drawImage(s, Math.floor((32 - SPRITE[0]) / 2), Math.floor((32 - SPRITE[1]) / 2)); });
  return c;
}

/** A fish not caught yet: its shape only, dark (for the Fishdex). */
export function fishShape(sp, scale = 2) {
  const c = document.createElement("canvas");
  c.className = "fish-pic fish-unknown";
  [c.width, c.height] = SPRITE;
  c.style.width = `${SPRITE[0] * scale}px`;
  c.style.height = `${SPRITE[1] * scale}px`;
  fishSprite(sp, 0).then((s) => {
    const ctx = c.getContext("2d");
    ctx.drawImage(s, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#3a3550";
    ctx.fillRect(0, 0, c.width, c.height);
  });
  return c;
}
