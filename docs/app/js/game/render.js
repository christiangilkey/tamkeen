// Draws creatures and effects on a canvas from the art in web/game-art/.
// A creature is assembled from parts (torso, head, ears...) placed on named sockets, recoloured
// to its own palette, and animated by nudging parts a pixel or two (no per-frame art needed).

import { HANDS, HEAD, KEY, PART, SIZES, SLOTS, SPECIES, itemById } from "./data.js";

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

/** The HTML for a small pixel-art picture from game-art/: icon("coin"), or a path such as icon("ui/pip_on", 8).
 * `px` is the size to show it at: the art's own size (icons are 16x16) or a whole multiple of it, so the
 * pixels stay square. */
export function icon(id, px = 16, alt = "") {
  const file = id.includes("/") ? id : `icon/${id}`;
  return `<img class="px-icon" alt="${alt}" width="${px}" height="${px}" src="${ART}${file}.png">`;
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

export const FRAME = 88; // creatures are composed in a square this size, feet on its bottom edge (room above for hats)

/**
 * The torso pixels a shirt must not cover: the outline round the body's shape, and anything in the accent
 * colour that grows out of that outline (back fins, the tip of a floater's tail). Marks inside the body
 * (ripples, crystals, the rim of a plate) are not joined to the outline, so the shirt covers them.
 */
function bareOfShirt(px, w, h, colors) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h || !px[(y * w + x) * 4 + 3] ? null : `${px[(y * w + x) * 4]},${px[(y * w + x) * 4 + 1]},${px[(y * w + x) * 4 + 2]}`);
  const line = rgbOf(colors.primary[3]).join(",");
  const accent = colors.accent.map((a) => rgbOf(a).join(","));
  const around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const bare = new Uint8Array(w * h);
  const todo = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) === line && around.some(([dx, dy]) => at(x + dx, y + dy) === null)) { bare[y * w + x] = 1; todo.push([x, y]); }
    }
  }
  while (todo.length) {
    const [x, y] = todo.pop();
    for (const [dx, dy] of around) {
      const nx = x + dx, ny = y + dy;
      if (!accent.includes(at(nx, ny)) || bare[ny * w + nx]) continue;
      bare[ny * w + nx] = 1;
      todo.push([nx, ny]);
    }
  }
  return bare;
}

/** The torso wearing a shirt: the shirt's pattern fills the body's shape, leaving its outline. */
async function shirtedTorso(base, look, paletteId, file) {
  const id = `${file}|${paletteId}|${look.pattern}|${look.equipped.shirt}`;
  if (tinted.has(id)) return tinted.get(id);
  const tile = await loadImage(`item/${look.equipped.shirt}.png`);
  if (!tile || !base) return base;
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
  const line = rgbOf(KEY.outline).join(","); // the fixed line colour (older art); hand-drawn bodies are outlined in their darkest body colour
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const bare = bareOfShirt(px, c.width, c.height, look.colors);
  const top = Math.round(c.height * 0.18);      // leave the shoulders' top edge
  const bottom = Math.round(c.height * 0.8);    // and the underside bare
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (!px[i + 3] || bare[y * c.width + x] || `${px[i]},${px[i + 1]},${px[i + 2]}` === line) continue;
      const j = ((y % tile.height) * tile.width + (x % tile.width)) * 4;
      if (!tp[j + 3]) continue;
      px[i] = tp[j]; px[i + 1] = tp[j + 1]; px[i + 2] = tp[j + 2];
    }
  }
  ctx.putImageData(data, 0, 0);
  tinted.set(id, c);
  return c;
}

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
  const bigEyes = look.size === "s"; // a hatchling's eyes are a size larger: they shrink relative to the face as it grows
  const [torso, head, tail, back, earB, earF, horn, eyes, mouth] = await Promise.all([
    patternedTorso(`creature/torso/${look.species}_${look.size}${suffix}.png`, look, paletteId),
    part(`creature/head/${look.species}${suffix}.png`),
    look.tail !== "none" ? part(`creature/tail/${look.tail}.png`) : null,
    look.back !== "none" ? part(`creature/back/${look.back}.png`) : null,
    look.ear !== "none" ? part(`creature/ear/${look.ear}.png`) : null,
    look.ear !== "none" ? part(`creature/ear/${look.ear}.png`) : null,
    look.horn !== "none" ? part(`creature/horn/${look.horn}.png`) : null,
    part(`creature/${bigEyes ? "eyes_big" : "eyes"}/${look.eyes}_${pose.eyes || "open"}.png`),
    part(`creature/mouth/${pose.mouth || "neutral"}.png`),
  ]);
  const legA = plan.legs ? await part(`creature/leg/${look.species}_${look.size}_${step}.png`) : null;
  const legB = plan.legs ? await part(`creature/leg/${look.species}_${look.size}_${step === "a" ? "b" : "a"}.png`) : null;
  const arm = plan.arms ? await part(`creature/arm/${look.species}_${look.size}.png`) : null;
  const wing = plan.wings ? await part(`creature/wing/${look.species}_${look.size}_${step}.png`) : null;

  const worn = {};
  for (const slot of Object.keys(SLOTS)) {
    const id = look.equipped && look.equipped[slot];
    worn[slot] = id && slot !== "shirt" && look.stage !== "egg" ? await loadImage(`item/${id}.png`) : null;
  }
  const torsoFile = `creature/torso/${look.species}_${look.size}${suffix}.png`;
  const dressed = look.equipped && look.equipped.shirt ? await shirtedTorso(torso, look, paletteId, torsoFile) : torso;

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
  // Where an item sits: its socket, moved by the item's own `shift` and its per-size `offset`.
  const nudge = (slot) => {
    const it = look.equipped && itemById(look.equipped[slot]);
    const a = (it && it.shift) || [0, 0];
    const b = (it && it.offset && it.offset[look.size]) || [0, 0];
    return [a[0] + b[0], a[1] + b[1]];
  };
  at(worn.back, S.back, SLOTS.back.anchor, nudge("back")[0], nudge("back")[1]); // capes and packs go behind everything
  at(tail, S.tail, PART.tail.anchor, 0, pose.step ? -1 : 0);
  at(back, S.back, PART.back.anchor);
  if (wing) at(wing, S.back, [wing.width - 2, wing.height - 1]);
  if (legB) at(legB, S.legB, [Math.floor(legB.width / 2), 1]);
  if (dressed) ctx.drawImage(dressed, tx, ty);
  if (legA) at(legA, S.legF, [Math.floor(legA.width / 2), 1]);
  if (arm) at(arm, S.arm, [Math.floor(arm.width / 2), 1], 0, pose.step ? 1 : 0);
  // The head and everything on it move together.
  const hx = tx + S.neck[0] - HEAD.neck[0];
  const hy = ty + S.neck[1] - HEAD.neck[1] + bob;
  const on = (img, socket, anchor) => { if (img) ctx.drawImage(img, hx + socket[0] - anchor[0], hy + socket[1] - anchor[1]); };
  on(earB, HEAD.earB, PART.ear.anchor);
  if (head) ctx.drawImage(head, hx, hy);
  on(eyes, HEAD.eye, (bigEyes ? PART.eyesBig : PART.eyes).anchor);
  on(mouth, HEAD.mouth, PART.mouth.anchor);
  on(earF, HEAD.earF, PART.ear.anchor);
  on(horn, HEAD.horn, PART.horn.anchor);
  // Worn items sit on sockets, so they stay in place whatever the creature's size.
  at(worn.neck, S.neck, SLOTS.neck.anchor, nudge("neck")[0], 1 + nudge("neck")[1]);
  at(worn.held, HANDS[look.species][look.size], SLOTS.held.anchor, nudge("held")[0], nudge("held")[1] + (pose.step ? 1 : 0));
  if (worn.face) ctx.drawImage(worn.face, hx + HEAD.face[0] - SLOTS.face.anchor[0] + nudge("face")[0], hy + HEAD.face[1] - SLOTS.face.anchor[1] + nudge("face")[1]);
  if (worn.hat) ctx.drawImage(worn.hat, hx + HEAD.hat[0] - SLOTS.hat.anchor[0] + nudge("hat")[0], hy + HEAD.hat[1] - SLOTS.hat.anchor[1] + nudge("hat")[1]);
  return c;
}

/** Draw frame `i` of a horizontal strip of square frames, centred on (x, y). */
export function drawSheet(ctx, img, frames, i, x, y, scale = 1) {
  if (!img) return;
  const size = img.height;
  const f = Math.max(0, Math.min(frames - 1, Math.floor(i)));
  ctx.drawImage(img, f * size, 0, size, size, Math.round(x - (size * scale) / 2), Math.round(y - (size * scale) / 2), size * scale, size * scale);
}
