// Draws creatures and effects on a canvas from the art in web/game-art/.
// A creature is a finished drawing with frame animations made from it (idle, walk and, for the winged ones,
// fly: tools/game_art/anim.py), each frame with its eyelids and where worn things sit; worn things go on its
// own sockets.

import { SLOTS, TYPES, beastById, canWear, eggCanWear, itemById } from "./data.js";
import { FORM_KINDS, formFinish, formParticles, formPixels, formRows, formSweep, seedOf } from "./forms.js";

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

// The colourings earned by feats (forms.js) colour a layer in its drawing's own coordinates: the drawing (drawingOf)
// is looked up by its folder, so an animation's sheet is coloured frame by frame.
const drawn = new Map(); // a drawing's folder -> the drawing (set by composeCreature)
function formLayer(px, w, h, kind, file) {
  const dir = file.slice(0, file.lastIndexOf("/") + 1);
  const name = file.slice(dir.length).replace(/\.png$/, "");
  const b = drawn.get(dir);
  formPixels(px, w, h, kind, b ? b.box : undefined, b && b.anims && b.anims[name] ? b.anims.cell : null);
}

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
    if (FORM_KINDS.has(tint.kind)) formLayer(data.data, c.width, c.height, tint.kind, file);
    else tintPixels(data.data, tint);
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

/** The middle tone of a look's torso: the median brightness of the pixels under its shirt mask in its still pose
 * (the idle animation's first frame), in its special form's colours. */
async function torsoTone(form, look) {
  const id = `${form.key}|tone|${look.tint ? JSON.stringify(look.tint) : ""}`;
  if (layers.has(id)) return layers.get(id);
  const [sheet, mask] = await Promise.all([layer(`${form.dir}idle.png`, look.tint || null), loadImage(`${form.dir}idle_shirt.png`)]);
  if (!sheet || !mask) return 1;
  const [cw, ch] = form.anims.cell;
  const sp = pixelsOf(sheet), mp = pixelsOf(mask);
  const under = [];
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * sheet.width + x) * 4, j = (y * mask.width + x) * 4;
      if (mp[j + 3]) under.push(0.299 * sp[i] + 0.587 * sp[i + 1] + 0.114 * sp[i + 2]);
    }
  }
  under.sort((a, b) => a - b);
  const mid = under[under.length >> 1] || 1;
  layers.set(id, mid);
  return mid;
}

/** Animation `name`'s frames wearing a shirt. The mask (<name>_shirt.png) marks each shirt pixel with the drawing
 * pixel it came from (red = x, green = y), so the pattern sits on the body as it moves. The body's light and shade
 * stay on the shirt (each pixel as much lighter or darker than the torso's middle tone, torsoTone, as the body was
 * there), so it reads as cloth round the body, not a flat patch. Only the frames row changes (the eyelids row stays). */
async function shirtedFrames(sheet, name, form, look) {
  const shirt = look.equipped && look.equipped.shirt;
  if (!sheet || !shirt || !form.shirt) return sheet;
  const id = `${form.key}|${name}|shirt|${shirt}|${look.tint ? JSON.stringify(look.tint) : ""}`;
  if (layers.has(id)) return layers.get(id);
  const [tile, mask, mid] = await Promise.all([loadImage(`item/${shirt}.png`), loadImage(`${form.dir}${name}_shirt.png`), torsoTone(form, look)]);
  if (!tile || !mask) return sheet;
  const tp = pixelsOf(tile);
  const mp = pixelsOf(mask);
  const c = document.createElement("canvas");
  c.width = sheet.width;
  c.height = sheet.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(sheet, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const i = (y * c.width + x) * 4, k = (y * mask.width + x) * 4;
      if (!mp[k + 3]) continue;
      const j = ((mp[k + 1] % tile.height) * tile.width + (mp[k] % tile.width)) * 4;
      if (!tp[j + 3]) continue;
      const f = shirtShade(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2], mid);
      px[i] = Math.min(255, Math.round(tp[j] * f)); px[i + 1] = Math.min(255, Math.round(tp[j + 1] * f)); px[i + 2] = Math.min(255, Math.round(tp[j + 2] * f));
    }
  }
  ctx.putImageData(data, 0, 0);
  layers.set(id, c);
  return c;
}

// What a creature does when it lacks the action asked for (mini-games can ask for actions not drawn yet): one that
// gets somewhere walks, anything else stands breathing. (The built-in actions: idle, walk, and fly for the winged.)
const ACTION_FALLBACK = { fly: "walk", run: "walk", swim: "walk", climb: "walk", hop: "walk", glide: "walk" };
/** The action a creature's drawing plays for `name`: its own, or the fallback. */
export const actionOf = (anims, name) => (anims[name] ? name : anims[ACTION_FALLBACK[name]] ? ACTION_FALLBACK[name] : "idle");

/**
 * The pose for action `name` ("idle", "walk", "fly", or any other: see ACTION_FALLBACK) at `ms` milliseconds:
 * {anim, frame, eyes, done}. The idle loop blinks: the eyes shut for 150 ms at the start of about one loop in three.
 * `seed` (any whole number) puts creatures out of step with each other; `speed` plays it faster (2 = twice as
 * fast). An action that plays once (`once` in beasts.js) holds its last frame afterwards, with `done` true.
 */
export function animAt(look, name, ms, seed = 0, speed = 1) {
  const anims = drawingOf(look).anims;
  const anim = actionOf(anims, name);
  const a = anims[anim];
  const total = a.ms.reduce((s, v) => s + v, 0);
  const t0 = Math.floor(ms * speed) + (a.once ? 0 : seed * 1777);
  if (a.once && t0 >= total) return { anim, frame: a.frames - 1, eyes: "open", done: true };
  let t = ((t0 % total) + total) % total;
  let frame = 0;
  while (frame < a.frames - 1 && t >= a.ms[frame]) t -= a.ms[frame++];
  const loop = Math.floor(t0 / total);
  const blink = anim === "idle" && frame === 0 && t < 150 && (((loop + seed) % 3) + 3) % 3 === 0;
  return { anim, frame, eyes: blink ? "blink" : "open", done: false };
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
export function beastHeight(look, anim = null) {
  const f = drawingOf(look);
  // (taller while doing `anim` if that reaches well above the drawing: the forest stag standing up to walk)
  const a = anim && f.anims && f.anims[actionOf(f.anims, anim)];
  const top = a && Number.isInteger(a.top) ? Math.min(f.box[1], a.top) : f.box[1];
  return f.box[3] - top + 1 + f.hover;
}

const SHUT = new Set(["blink", "sleepy", "happy"]);

// ---------- a dressed egg ----------
// An egg wears a hat and anything on its back (data.eggCanWear; the owner: "because that's funny"): the small versions
// a baby wears, a hat on its crown and a back item peeking out on the egg's left, its back (the hat's brim faces
// right). Wings (`wings: true`) go on as a pair, the picture on the left and its mirror on the right: one alone hid
// behind the egg. Where they sit on the 32 x 32 egg (egg/<type>.png):
const EGG_SOCKETS = { hat: [16, 7], back: [9, 22] };
/** How much bigger a dressed egg's picture is than the egg, in its pixels: room above for the hat and each side
 * for the wings. */
export const EGG_TOP = 8;
export const EGG_SIDE = 4;
const eggWears = (equipped) => ["back", "hat"].filter((slot) => equipped && equipped[slot] && eggCanWear(itemById(equipped[slot])));

/** Egg picture `egg` (32 x 32) with what it wears (`equipped`): a canvas (32 + 2 EGG_SIDE) x (32 + EGG_TOP) with
 * the egg at the middle of its foot, or `egg` itself when it wears no hat and no wings. */
export async function dressEgg(egg, equipped) {
  const slots = eggWears(equipped);
  if (!egg || !slots.length) return egg;
  const worn = await Promise.all(slots.map(async (slot) => [slot,
    (await loadImage(`item/small/${equipped[slot]}.png`)) || (await loadImage(`item/${equipped[slot]}.png`))]));
  const c = document.createElement("canvas");
  c.width = 32 + 2 * EGG_SIDE;
  c.height = 32 + EGG_TOP;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const put = (slot) => {
    const img = (worn.find(([s]) => s === slot) || [])[1];
    if (!img) return;
    const [sx, sy] = EGG_SOCKETS[slot], [ax, ay] = SLOTS[slot].anchor;
    const y = EGG_TOP + sy - ay;
    ctx.drawImage(img, EGG_SIDE + sx - ax, y);
    if (slot !== "back" || !(itemById(equipped[slot]) || {}).wings) return;
    // the other wing: mirrored, as far right of the middle as the first is left of it
    const x = EGG_SIDE + 32 - sx - (img.width - ax);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(img, -(x + img.width), y);
    ctx.restore();
  };
  put("back");
  ctx.drawImage(egg, EGG_SIDE, EGG_TOP);
  put("hat");
  return c;
}

/** Creature `genome`'s egg as an element: the egg picture `size` px wide, or, when it wears a hat or wings, a canvas
 * of the dressed egg with the egg the same size (so the picture is a little bigger, for the hat and wings). `cls`:
 * its class. */
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
  c.width = 32 + 2 * EGG_SIDE;
  c.height = 32 + EGG_TOP;
  c.style.width = `${Math.round((size * c.width) / 32)}px`;
  c.style.height = `${Math.round((size * c.height) / 32)}px`;
  c.style.imageRendering = "pixelated";
  loadImage(`egg/${type}.png`).then((img) => dressEgg(img, on)).then((pic) => {
    if (!pic) return;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pic, (c.width - pic.width) / 2, c.height - pic.height);
  });
  return c;
}

// ---------- turned items ----------
// A socket may carry an angle ([x, y, degrees] in rig.json, clockwise): the item is turned that much about its anchor,
// taking the nearest pixel so it stays crisp (the firefly's cap tilts forward with its head). Same as
// tools/game_art/beasts.py rotated(), pixel for pixel.
/** Pixels `src` ({width, height, data: RGBA}) turned `deg` degrees clockwise about pixel (ax, ay): {width, height,
 * data, anchor}, square, with the anchor in the middle. */
export function turnPixels(src, ax, ay, deg) {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const { width: w, height: h, data } = src;
  let r = 0;
  for (const x of [0, w]) for (const y of [0, h]) r = Math.max(r, Math.hypot(x - ax, y - ay));
  r = Math.ceil(r);
  const size = 2 * r + 1;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i - r, dy = j - r;
      const sx = Math.floor(ax + 0.5 + dx * c + dy * s), sy = Math.floor(ay + 0.5 - dx * s + dy * c);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const from = (sy * w + sx) * 4, to = (j * size + i) * 4;
      for (let k = 0; k < 4; k++) out[to + k] = data[from + k];
    }
  }
  return { width: size, height: size, data: out, anchor: [r, r] };
}
const turned = new Map(); // "src|anchor|deg" -> {pic, anchor}: each item turned once per angle
function turnItem(img, anchor, deg) {
  const key = `${img.src}|${anchor}|${deg}`;
  if (!turned.has(key)) {
    const c0 = document.createElement("canvas");
    c0.width = img.width;
    c0.height = img.height;
    const x0 = c0.getContext("2d", { willReadFrequently: true });
    x0.drawImage(img, 0, 0);
    const p = turnPixels(x0.getImageData(0, 0, img.width, img.height), anchor[0], anchor[1], deg);
    const pic = document.createElement("canvas");
    pic.width = p.width;
    pic.height = p.height;
    pic.getContext("2d").putImageData(new ImageData(p.data, p.width, p.height), 0, 0);
    turned.set(key, { pic, anchor: p.anchor });
  }
  return turned.get(key);
}

/**
 * Compose one frame of a creature. `look` comes from describe(genome); `pose` is
 *   {anim: "idle" | "walk" | "fly" (or any action: a missing one plays its fallback, actionOf) and frame: which of
 *     its frames (animAt gives both for a moment in time; a creature without wings walks instead of flying),
 *   eyes: "open" or a shut look ("blink", "sleepy", "happy"), lift: px off the ground,
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
  drawn.set(dir, b); // (for the colourings' layers: formLayer)
  const tint = look.tint || null;
  const t = Math.max(0, Math.min(1, pose.t || 0));
  const shut = SHUT.has(pose.eyes) || pose.act === "hurt" || pose.act === "faint";
  // Which action and frame (a missing action plays its fallback: actionOf), and how far each socket has moved in it.
  const name = actionOf(b.anims, pose.anim || "idle");
  const anim = b.anims[name];
  const frame = Number.isInteger(pose.frame) && name === (pose.anim || "idle") ? ((pose.frame % anim.frames) + anim.frames) % anim.frames : 0;
  const sheet = await shirtedFrames(await layer(`${dir}${name}.png`, tint), name, b, look);
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
  const oy = oy0 - (pose.lift || 0) + dy;
  if (pose.act === "faint") ctx.globalAlpha = 1 - t;
  // Where a worn thing sits: its socket on this creature, moved by the item's own `shift` and `offset`, and turned
  // by the socket's angle if it has one (the nudge turns with it).
  const item = (slot) => {
    const img = worn[slot];
    if (!img) return;
    const [mx, my, turn = 0] = anim.at[slot][frame]; // (where its socket has moved in this frame, and any turn)
    const it = itemById(look.equipped[slot]);
    const shift = (it && it.shift) || [0, 0];
    const a = b.baby ? shift.map((v) => Math.round(v * 0.75)) : shift; // the small item's own nudge
    const o = (it && it.offset && it.offset[look.size]) || [0, 0];
    const [sx, sy, deg0 = 0] = b.sockets[slot];
    const deg = deg0 + turn;
    let pic = img, [ax, ay] = SLOTS[slot].anchor, [nx, ny] = [a[0] + o[0], a[1] + o[1]];
    if (deg) {
      ({ pic, anchor: [ax, ay] } = turnItem(img, SLOTS[slot].anchor, deg));
      const t = (deg * Math.PI) / 180;
      [nx, ny] = [Math.round(nx * Math.cos(t) - ny * Math.sin(t)), Math.round(nx * Math.sin(t) + ny * Math.cos(t))];
    }
    ctx.drawImage(pic, ox + sx - ax + nx + mx, oy + sy - ay + ny + my);
  };
  // the frame, and its eyelids (the row below) when the eyes are shut
  const [cw, ch, cx, cy] = b.anims.cell;
  if (sheet) ctx.drawImage(sheet, frame * cw, 0, cw, ch, ox - cx, oy - cy, cw, ch);
  if (sheet && shut) ctx.drawImage(sheet, frame * cw, ch, cw, ch, ox - cx, oy - cy, cw, ch);
  if (tint && tint.kind === "champion") goldEdge(ctx);
  else if (tint && FORM_KINDS.has(tint.kind)) finishForm(ctx, tint.kind, ox, oy, b.box); // (its edge, pattern or echoes)
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
  item("hat");
  item("face");
  item("neck");
  item("held");
  ctx.globalAlpha = 1;
  return c;
}

// ---------- the colourings earned by feats, alive (forms.js) ----------
/** The whole creature finished in colouring `kind` (forms.formFinish), before what it wears goes on. */
function finishForm(ctx, kind, ox, oy, box) {
  const { width: w, height: h } = ctx.canvas;
  const data = ctx.getImageData(0, 0, w, h);
  formFinish(data.data, w, h, kind, ox, oy, box);
  ctx.putImageData(data, 0, 0);
}

let scratch = null; // one spare frame-sized canvas for a shine across a creature
/** The creature's box in its frame: [x0, y0, x1, y1]. */
function frameBox(look) {
  const b = drawingOf(look);
  const [ox, oy] = beastOrigin(b);
  return [ox + b.box[0], oy + b.box[1], ox + b.box[2], oy + b.box[3]];
}

/**
 * Draw a composed creature `frame` (composeCreature) with its feet at (0, 0) of `ctx`'s current transform, as
 * `ctx.drawImage(frame, -FRAME / 2, -FRAME)` does, plus what moves in a colouring earned by a feat: a ripple or a
 * glitch, a shine, and its particles (forms.js). `now`: milliseconds (performance.now()). Cheap: a handful of
 * rectangles, and a few more drawImage calls while a ripple or glitch is on.
 */
export function drawLiving(ctx, frame, look, now = performance.now()) {
  if (!frame) return;
  const kind = look && look.tint && look.tint.kind;
  if (!FORM_KINDS.has(kind)) { ctx.drawImage(frame, -FRAME / 2, -FRAME); return; }
  const seed = seedOf(look.beast);
  const rows = formRows(kind, now, seed, frame.height);
  const drawRows = (g, ox, oy) => { // the frame, each run of rows shifted as `rows` says
    if (!rows) { g.drawImage(frame, ox, oy); return; }
    for (let y = 0; y < frame.height;) {
      let y2 = y + 1;
      while (y2 < frame.height && rows[y2] === rows[y]) y2++;
      g.drawImage(frame, 0, y, frame.width, y2 - y, ox + rows[y], oy + y, frame.width, y2 - y);
      y = y2;
    }
  };
  const sweep = formSweep(kind, now, seed, FRAME);
  if (sweep) { // the creature with a shine across it, made on the spare canvas (the shine only where the creature is)
    if (!scratch) { scratch = document.createElement("canvas"); scratch.width = scratch.height = FRAME; }
    const g = scratch.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, FRAME, FRAME);
    drawRows(g, 0, 0);
    g.globalCompositeOperation = "source-atop";
    g.globalAlpha = sweep.alpha;
    g.fillStyle = "#ffffff";
    if (sweep.kind === "band") {
      g.beginPath();
      g.moveTo(sweep.x, 0);
      g.lineTo(sweep.x + sweep.width, 0);
      g.lineTo(sweep.x + sweep.width + sweep.slope * FRAME, FRAME);
      g.lineTo(sweep.x + sweep.slope * FRAME, FRAME);
      g.closePath();
      g.fill();
    } else g.fillRect(0, sweep.y, FRAME, 2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    ctx.drawImage(scratch, -FRAME / 2, -FRAME);
  } else drawRows(ctx, -FRAME / 2, -FRAME);
  const alpha = ctx.globalAlpha;
  for (const p of formParticles(kind, now, frameBox(look), seed)) {
    ctx.globalAlpha = alpha * p.a;
    ctx.fillStyle = p.c;
    ctx.fillRect(-FRAME / 2 + p.x, -FRAME + p.y, p.w, p.h);
  }
  ctx.globalAlpha = alpha;
}

// Portraits (battle-ui.js portrait) of a creature in a colouring that moves: one shared loop, about 12 times a second,
// redraws them while they are on the page, and stops when none is left.
const living = new Set(); // {canvas, frame, look, born}
let livingTimer = 0;
function paintLiving() {
  livingTimer = 0;
  const now = performance.now();
  for (const p of living) {
    if (!p.canvas.isConnected) { if (p.seen || now - p.born > 10000) living.delete(p); continue; } // (gone, or never shown)
    p.seen = true;
    if (document.hidden) continue;
    const ctx = p.canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
    ctx.save();
    ctx.translate(FRAME / 2, FRAME);
    drawLiving(ctx, p.frame, p.look, now);
    ctx.restore();
  }
  if (living.size) livingTimer = setTimeout(paintLiving, 85);
}
/** Keep portrait `canvas` (FRAME x FRAME, showing `frame`) alive when `look` has a colouring that moves. */
export function animatePortrait(canvas, frame, look) {
  if (!frame || !look || !look.tint || !FORM_KINDS.has(look.tint.kind)) return;
  living.add({ canvas, frame, look, born: performance.now(), seen: false });
  if (!livingTimer) livingTimer = setTimeout(paintLiving, 0);
}

/** Draw frame `i` of a horizontal strip of square frames, centred on (x, y). */
export function drawSheet(ctx, img, frames, i, x, y, scale = 1) {
  if (!img) return;
  const size = img.height;
  const f = Math.max(0, Math.min(frames - 1, Math.floor(i)));
  ctx.drawImage(img, f * size, 0, size, size, Math.round(x - (size * scale) / 2), Math.round(y - (size * scale) / 2), size * scale, size * scale);
}
