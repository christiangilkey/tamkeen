// Draws creatures and effects on a canvas from the art in web/game-art/.
// A creature is assembled from parts (torso, head, ears...) placed on named sockets, recoloured
// to its own palette, and animated by nudging parts a pixel or two (no per-frame art needed).

import { HEAD, KEY, PART, SIZES, SLOTS, SPECIES } from "./data.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const images = new Map();   // file -> Promise<HTMLImageElement | null>
const tinted = new Map();   // file + palette -> canvas

export function loadImage(file) {
  if (!images.has(file)) {
    images.set(file, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // a missing file leaves a gap rather than breaking the scene
      img.src = ART + file;
    }));
  }
  return images.get(file);
}

const rgbOf = (() => {
  let probe = null;
  const memo = new Map();
  return (css) => {
    if (!memo.has(css)) {
      probe = probe || document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = css;
      probe.fillRect(0, 0, 1, 1);
      memo.set(css, [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)]);
    }
    return memo.get(css);
  };
})();

/** The image with the key colours swapped for this creature's colours. */
async function recolored(file, colors, paletteId) {
  const id = `${file}|${paletteId}`;
  if (tinted.has(id)) return tinted.get(id);
  const img = await loadImage(file);
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const map = new Map();
  for (const group of ["primary", "secondary", "accent"]) {
    KEY[group].forEach((key, i) => map.set(rgbOf(key).join(","), rgbOf(colors[group][i])));
  }
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const to = map.get(`${px[i]},${px[i + 1]},${px[i + 2]}`);
    if (to) { px[i] = to[0]; px[i + 1] = to[1]; px[i + 2] = to[2]; }
  }
  ctx.putImageData(data, 0, 0);
  tinted.set(id, c);
  return c;
}

/** The torso with its pattern painted on: pattern pixels show only where the body colour is. */
async function patternedTorso(file, look, paletteId) {
  const base = await recolored(file, look.colors, paletteId);
  if (!base || look.pattern === "none") return base;
  const id = `${file}|${paletteId}|${look.pattern}`;
  if (tinted.has(id)) return tinted.get(id);
  const tile = await loadImage(`creature/pattern/${look.pattern}.png`);
  if (!tile) return base;
  const c = document.createElement("canvas");
  c.width = base.width;
  c.height = base.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(base, 0, 0);
  const t = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  t.canvas.width = tile.width;
  t.canvas.height = tile.height;
  t.drawImage(tile, 0, 0);
  const tp = t.getImageData(0, 0, tile.width, tile.height).data;
  const body = [rgbOf(look.colors.primary[1]).join(","), rgbOf(look.colors.primary[2]).join(",")];
  const mark = rgbOf(look.colors.secondary[1]);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (!px[i + 3] || !tp[((y % tile.height) * tile.width + (x % tile.width)) * 4 + 3]) continue;
      if (!body.includes(`${px[i]},${px[i + 1]},${px[i + 2]}`)) continue;
      px[i] = mark[0]; px[i + 1] = mark[1]; px[i + 2] = mark[2];
    }
  }
  ctx.putImageData(data, 0, 0);
  tinted.set(id, c);
  return c;
}

export const FRAME = 72; // creatures are composed in a square this size, feet on its bottom edge

/**
 * Compose one frame of a creature. `look` comes from describe(genome); `pose` is
 *   {step: 0|1 (walk frame), bob: px the head dips, eyes: expression, mouth, lift: px off the ground}.
 * Returns a canvas FRAME x FRAME with the creature facing right, feet at the bottom centre.
 */
export async function composeCreature(look, pose = {}) {
  const S = SIZES[look.size];
  const plan = SPECIES[look.species];
  const paletteId = [look.colors.primary[1], look.colors.secondary[1], look.colors.accent[0]].join("/");
  const suffix = look.branch ? `_${look.branch}` : "";
  const part = (file) => recolored(file, look.colors, paletteId);
  const step = pose.step ? "b" : "a";
  const [torso, head, tail, back, earB, earF, horn, eyes, mouth] = await Promise.all([
    patternedTorso(`creature/torso/${look.species}_${look.size}${suffix}.png`, look, paletteId),
    part(`creature/head/${look.species}${suffix}.png`),
    look.tail !== "none" ? part(`creature/tail/${look.tail}.png`) : null,
    look.back !== "none" ? part(`creature/back/${look.back}.png`) : null,
    look.ear !== "none" ? part(`creature/ear/${look.ear}.png`) : null,
    look.ear !== "none" ? part(`creature/ear/${look.ear}.png`) : null,
    look.horn !== "none" ? part(`creature/horn/${look.horn}.png`) : null,
    part(`creature/eyes/${look.eyes}_${pose.eyes || "open"}.png`),
    part(`creature/mouth/${pose.mouth || "neutral"}.png`),
  ]);
  const legA = plan.legs ? await part(`creature/leg/${look.species}_${look.size}_${step}.png`) : null;
  const legB = plan.legs ? await part(`creature/leg/${look.species}_${look.size}_${step === "a" ? "b" : "a"}.png`) : null;
  const arm = plan.arms ? await part(`creature/arm/${look.species}_${look.size}.png`) : null;
  const wing = plan.wings ? await part(`creature/wing/${look.species}_${look.size}_${step}.png`) : null;

  const worn = {};
  for (const slot of Object.keys(SLOTS)) {
    const id = look.equipped && look.equipped[slot];
    worn[slot] = id && look.stage !== "egg" ? await loadImage(`item/${id}.png`) : null;
  }

  const c = document.createElement("canvas");
  c.width = c.height = FRAME;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const legH = plan.legs ? S.leg[1] - 1 : 0;
  const tx = Math.round((FRAME - S.torso[0]) / 2) - 3;            // torso's top-left corner
  const ty = FRAME - legH - S.torso[1] - (plan.hover || 0) - (pose.lift || 0);
  const at = (img, socket, anchor, dx = 0, dy = 0) => {
    if (img) ctx.drawImage(img, tx + socket[0] - anchor[0] + dx, ty + socket[1] - anchor[1] + dy);
  };
  const bob = pose.bob || 0;
  at(tail, S.tail, PART.tail.anchor, 0, pose.step ? -1 : 0);
  at(back, S.back, PART.back.anchor);
  if (wing) at(wing, S.back, [wing.width - 2, wing.height - 1]);
  if (legB) at(legB, S.legB, [Math.floor(legB.width / 2), 1]);
  if (torso) ctx.drawImage(torso, tx, ty);
  if (legA) at(legA, S.legF, [Math.floor(legA.width / 2), 1]);
  if (arm) at(arm, S.arm, [Math.floor(arm.width / 2), 1], 0, pose.step ? 1 : 0);
  // The head and everything on it move together.
  const hx = tx + S.neck[0] - HEAD.neck[0];
  const hy = ty + S.neck[1] - HEAD.neck[1] + bob;
  const on = (img, socket, anchor) => { if (img) ctx.drawImage(img, hx + socket[0] - anchor[0], hy + socket[1] - anchor[1]); };
  on(earB, HEAD.earB, PART.ear.anchor);
  if (head) ctx.drawImage(head, hx, hy);
  on(eyes, HEAD.eye, PART.eyes.anchor);
  on(mouth, HEAD.mouth, PART.mouth.anchor);
  on(earF, HEAD.earF, PART.ear.anchor);
  on(horn, HEAD.horn, PART.horn.anchor);
  // Worn items sit on sockets, so they stay in place whatever the creature's size.
  at(worn.neck, S.neck, SLOTS.neck.anchor, 0, 1);
  at(worn.held, S.arm, SLOTS.held.anchor, 3, plan.arms ? S.armSize[1] - 2 : 2);
  on(worn.face, HEAD.face, SLOTS.face.anchor);
  on(worn.hat, HEAD.hat, SLOTS.hat.anchor);
  return c;
}

/** Draw frame `i` of a horizontal strip of square frames, centred on (x, y). */
export function drawSheet(ctx, img, frames, i, x, y, scale = 1) {
  if (!img) return;
  const size = img.height;
  const f = Math.max(0, Math.min(frames - 1, Math.floor(i)));
  ctx.drawImage(img, f * size, 0, size, size, Math.round(x - (size * scale) / 2), Math.round(y - (size * scale) / 2), size * scale, size * scale);
}
