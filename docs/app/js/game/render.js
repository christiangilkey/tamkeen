// Draws creatures and effects on a canvas from the art in web/game-art/.
// A creature is a finished drawing cut into layers (body, head, its legs: tools/game_art/beasts.py),
// animated by nudging layers a pixel or two (the head dips, the near legs lift, the eyes shut), with
// worn things placed on its own sockets.

import { SLOTS, TYPES, beastById, canWear, eggCanWear, itemById } from "./data.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const images = new Map();   // file -> Promise<HTMLImageElement | null>

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
  const file = String(id).includes("/") ? String(id) : `icon/${id}`;
  const size = Math.round(Number(px)) || 16;
  // (escaped, so a name that came from somewhere else can never close the attribute and add its own)
  return `<img class="px-icon" alt="${attr(alt)}" width="${size}" height="${size}" src="${attr(ART + file)}.png">`;
}

const attr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The same picture as icon(), made as an element (no HTML is parsed). */
export function iconEl(id, px = 16, alt = "") {
  const img = document.createElement("img");
  img.className = "px-icon";
  img.alt = alt;
  img.width = img.height = Math.round(Number(px)) || 16;
  img.src = `${ART}${String(id).includes("/") ? id : `icon/${id}`}.png`;
  return img;
}

export const FRAME = 88; // creatures are composed in a square this size, feet on its bottom edge (room above for hats)

// ---------- colour changes for the special forms ----------

function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function toRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}

/** The hue `h` moved part of the way (`by`, 0..1) toward `to`, the short way round. */
const toward = (h, to, by) => { const d = ((to - h + 540) % 360) - 180; return (h + d * by + 360) % 360; };

/** A layer in a special form's colours: the Nocturne form is moonlit (hues drawn toward violet, a little
 * darker; glints and glows kept), a Twin wears its companion's hue on its light parts. */
export function tintPixels(px, tint) {
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    let [h, s, l] = toHsl(px[i], px[i + 1], px[i + 2]);
    if (tint.kind === "nocturne") {
      if (l > 0.86) continue;
      h = toward(h, 265, 0.45); s *= 0.85; l *= 0.82;
    } else if (tint.kind === "twin") {
      if (l < 0.55 || s < 0.15) continue;
      h = tint.hue;
    } else continue;
    [px[i], px[i + 1], px[i + 2]] = toRgb(h, s, l);
  }
}

const layers = new Map(); // file + tint -> canvas

/** One of a creature's layers, in its special form's colours if it has one. */
async function layer(file, tint) {
  const id = `${file}|${tint ? JSON.stringify(tint) : ""}`;
  if (layers.has(id)) return layers.get(id);
  const img = await loadImage(file);
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  if (tint && tint.kind !== "champion") {
    const data = ctx.getImageData(0, 0, c.width, c.height);
    tintPixels(data.data, tint);
    ctx.putImageData(data, 0, 0);
  }
  layers.set(id, c);
  return c;
}

const pixelsOf = (img) => {
  const g = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  g.canvas.width = img.width;
  g.canvas.height = img.height;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, img.width, img.height).data;
};

/** The drawing a creature is shown with: its hatchling look while it is a hatchling (if it has one), else its
 * juvenile look. Both have a box, hover, legs, shirt and sockets; `dir` is where its layers are. */
export function drawingOf(look) {
  const b = beastById(look.beast);
  if (look.size === "s" && b.young) return { ...b.young, id: b.id, dir: `creature/beast/${b.id}/hatchling/`, key: `${b.id}/s`, baby: true };
  return { ...b, dir: `creature/beast/${b.id}/`, key: b.id };
}

/** How much a shirt pixel is lit: the body's brightness there against the torso's middle tone, kept within bounds. */
export const shirtShade = (bodyLum, mid) => Math.max(0.6, Math.min(1.35, bodyLum / (mid || 1)));

/** The body wearing a shirt: the shirt's pattern fills the pixels its mask marks (the coat of the torso). */
async function shirted(body, form, look) {
  const shirt = look.equipped && look.equipped.shirt;
  if (!body || !shirt || !form.shirt) return body;
  const id = `${form.key}|shirt|${shirt}|${look.tint ? JSON.stringify(look.tint) : ""}`;
  if (layers.has(id)) return layers.get(id);
  const [tile, mask] = await Promise.all([loadImage(`item/${shirt}.png`), loadImage(`${form.dir}shirt.png`)]);
  if (!tile || !mask) return body;
  const tp = pixelsOf(tile);
  const mp = pixelsOf(mask);
  const c = document.createElement("canvas");
  c.width = body.width;
  c.height = body.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(body, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  // The body's light and shade stay on the shirt (each pixel as much lighter or darker than the torso's
  // middle tone as the body was there), so it reads as cloth round the body, not a flat patch.
  const lum = (i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const under = [];
  for (let i = 0; i < px.length; i += 4) if (mp[i + 3]) under.push(lum(i));
  under.sort((a, b) => a - b);
  const mid = under[under.length >> 1] || 1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (!mp[i + 3]) continue;
      const j = ((y % tile.height) * tile.width + (x % tile.width)) * 4;
      if (!tp[j + 3]) continue;
      const f = shirtShade(lum(i), mid);
      px[i] = Math.min(255, Math.round(tp[j] * f)); px[i + 1] = Math.min(255, Math.round(tp[j + 1] * f)); px[i + 2] = Math.min(255, Math.round(tp[j + 2] * f));
    }
  }
  ctx.putImageData(data, 0, 0);
  layers.set(id, c);
  return c;
}

/** A gold edge round everything drawn so far (the Champion form). */
function goldEdge(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) edge.push((y * w + x) * 4);
    }
  }
  for (const i of edge) { px[i] = 255; px[i + 1] = 210; px[i + 2] = 72; px[i + 3] = 255; }
  ctx.putImageData(data, 0, 0);
}

/** Where a creature's drawing goes in the frame: centred, standing on the bottom edge (a floater above it). */
export function beastOrigin(form) {
  const [x0, , x1, y1] = form.box;
  return [Math.round(FRAME / 2 - (x0 + x1 + 1) / 2), FRAME - (y1 + 1) - form.hover];
}

/** How tall a creature stands, from the ground to the top of its head (for what is shown above it). */
export function beastHeight(look) {
  const f = drawingOf(look);
  return f.box[3] - f.box[1] + 1 + f.hover;
}

const SHUT = new Set(["blink", "sleepy", "happy"]);

// ---------- a dressed egg ----------
// An egg wears a hat and wings (data.eggCanWear; the owner: "because that's funny"): the small versions a baby wears,
// wings behind the egg and a hat on its crown. Where they sit on the 32 x 32 egg (egg/<type>.png):
const EGG_SOCKETS = { hat: [16, 7], back: [13, 21] };
/** How much taller a dressed egg's picture is than the egg (room for the hat), in its pixels. */
export const EGG_TOP = 8;
const eggWears = (equipped) => ["back", "hat"].filter((slot) => equipped && equipped[slot] && eggCanWear(itemById(equipped[slot])));

/** Egg picture `egg` (32 x 32) with what it wears (`equipped`): a canvas 32 x (32 + EGG_TOP) with the egg at its
 * foot, or `egg` itself when it wears no hat and no wings. */
export async function dressEgg(egg, equipped) {
  const slots = eggWears(equipped);
  if (!egg || !slots.length) return egg;
  const worn = await Promise.all(slots.map(async (slot) => [slot,
    (await loadImage(`item/small/${equipped[slot]}.png`)) || (await loadImage(`item/${equipped[slot]}.png`))]));
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32 + EGG_TOP;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const put = (slot) => {
    const img = (worn.find(([s]) => s === slot) || [])[1];
    if (!img) return;
    const [sx, sy] = EGG_SOCKETS[slot], [ax, ay] = SLOTS[slot].anchor;
    ctx.drawImage(img, sx - ax, EGG_TOP + sy - ay);
  };
  put("back");
  ctx.drawImage(egg, 0, EGG_TOP);
  put("hat");
  return c;
}

/** Creature `genome`'s egg as an element `size` px wide: the egg picture, or, when it wears a hat or wings, a canvas
 * of the dressed egg (a little taller, for the hat). `cls`: its class. */
export function eggPicture(genome, size, cls = "cr-egg") {
  const type = TYPES[genome && genome.type] ? genome.type : "ember";
  const on = (genome && genome.equipped) || {};
  if (!eggWears(on).length) {
    const img = new Image(size, size);
    img.className = cls;
    img.alt = "";
    img.src = `${ART}egg/${type}.png`;
    return img;
  }
  const c = document.createElement("canvas");
  c.className = cls;
  c.width = 32;
  c.height = 32 + EGG_TOP;
  c.style.width = `${size}px`;
  c.style.height = `${Math.round((size * (32 + EGG_TOP)) / 32)}px`;
  c.style.imageRendering = "pixelated";
  loadImage(`egg/${type}.png`).then((img) => dressEgg(img, on)).then((pic) => {
    if (!pic) return;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pic, 0, c.height - pic.height);
  });
  return c;
}

/**
 * Compose one frame of a creature. `look` comes from describe(genome); `pose` is
 *   {walk: 0-3, the walk cycle (0 and 2: both feet down; 1: the near legs lift and the head dips; 3: the far legs
 *     lift and the head dips; a creature without legs bobs up a pixel on 1 and 3) - or the older
 *     step: 0|1 (the same as walk 0 and 1),
 *   bob: px the head dips, eyes: "open" or a shut look ("blink", "sleepy", "happy"), lift: px off the ground,
 *   act: "lunge" | "hurt" | "faint", with t: 0..1 how far along it is -
 *     lunge: the whole creature darts forward (up to 5px at t = 0.5) and back,
 *     hurt: knocked back 3px easing to 0, eyes shut, flashing white for the first third,
 *     faint: eyes shut, sinking 4px and fading out}.
 * Returns a canvas FRAME x FRAME with the creature facing right, feet at the bottom centre.
 */
const actOffset = (act, t) => {
  if (act === "lunge") return [Math.round(5 * Math.sin(Math.PI * t)), 0];
  if (act === "hurt") return [-Math.round(3 * (1 - t)), 0];
  if (act === "faint") return [0, Math.round(4 * t)];
  return [0, 0];
};
export async function composeCreature(look, pose = {}) {
  const b = drawingOf(look);
  const dir = b.dir;
  const tint = look.tint || null;
  const walk = Number.isInteger(pose.walk) ? ((pose.walk % 4) + 4) % 4 : (pose.step ? 1 : 0);
  const step = walk === 1 ? 1 : 0;             // the near legs lift
  const back = walk === 3 ? 1 : 0;             // the far legs lift
  const t = Math.max(0, Math.min(1, pose.t || 0));
  const shut = SHUT.has(pose.eyes) || pose.act === "hurt" || pose.act === "faint";
  const bob = (pose.bob || 0) + (walk % 2 && !pose.bob && b.legs.length ? 1 : 0);
  const float = walk % 2 && !b.legs.length ? 1 : 0; // a creature without legs bobs up as it goes
  const [body0, head, legsBack, legsFront] = await Promise.all([
    layer(`${dir}body.png`, tint),
    layer(`${dir}${shut ? "blink" : "head"}.png`, tint),
    b.legs.includes("legs_back") ? layer(`${dir}legs_back.png`, tint) : null,
    b.legs.includes("legs_front") ? layer(`${dir}legs_front.png`, tint) : null,
  ]);
  const body = await shirted(body0, b, look);
  const worn = {};
  for (const slot of Object.keys(SLOTS)) {
    const id = look.equipped && look.equipped[slot];
    // A baby wears small versions of what it wears (item/small/<slot>/<id>.png: tools/game_art/small_items.py).
    const file = b.baby ? `item/small/${id}.png` : `item/${id}.png`;
    // (never wings on a creature with wings of its own: a friend's saved before that was refused, say)
    worn[slot] = id && slot !== "shirt" && look.stage !== "egg" && canWear(look.beast, itemById(id)) ? await loadImage(file) : null;
  }

  const c = document.createElement("canvas");
  c.width = c.height = FRAME;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const [ox0, oy0] = beastOrigin(b);
  const [dx, dy] = actOffset(pose.act, t);
  const ox = ox0 + dx;
  const oy = oy0 - (pose.lift || 0) - float + dy;
  if (pose.act === "faint") ctx.globalAlpha = 1 - t;
  const put = (img, dy = 0) => { if (img) ctx.drawImage(img, ox, oy + dy); };
  // Where a worn thing sits: its socket on this creature, moved by the item's own `shift` and `offset`.
  const item = (slot, dy = 0) => {
    const img = worn[slot];
    if (!img) return;
    const it = itemById(look.equipped[slot]);
    const shift = (it && it.shift) || [0, 0];
    const a = b.baby ? shift.map((v) => Math.round(v * 0.75)) : shift; // the small item's own nudge
    const o = (it && it.offset && it.offset[look.size]) || [0, 0];
    const [sx, sy] = b.sockets[slot];
    ctx.drawImage(img, ox + sx - SLOTS[slot].anchor[0] + a[0] + o[0], oy + sy - SLOTS[slot].anchor[1] + a[1] + o[1] + dy);
  };
  put(legsBack, -back);
  put(body);
  put(legsFront, -step);
  put(head, bob);
  if (tint && tint.kind === "champion") goldEdge(ctx);
  if (pose.act === "hurt" && t < 1 / 3) { // a white flash over the creature (not what it wears)
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(0, 0, FRAME, FRAME);
    ctx.globalCompositeOperation = "source-over";
  }
  // Capes and packs hang behind the creature: drawn now, underneath what is there.
  if (worn.back) {
    ctx.globalCompositeOperation = "destination-over";
    item("back");
    ctx.globalCompositeOperation = "source-over";
  }
  item("hat", bob);
  item("face", bob);
  item("neck");
  item("held", step);
  ctx.globalAlpha = 1;
  return c;
}

/** Draw frame `i` of a horizontal strip of square frames, centred on (x, y). */
export function drawSheet(ctx, img, frames, i, x, y, scale = 1) {
  if (!img) return;
  const size = img.height;
  const f = Math.max(0, Math.min(frames - 1, Math.floor(i)));
  ctx.drawImage(img, f * size, 0, size, size, Math.round(x - (size * scale) / 2), Math.round(y - (size * scale) / 2), size * scale, size * scale);
}
