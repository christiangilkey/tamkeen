// The colourings earned by feats (data.js VARIANTS with a `feat`), drawn. Each is more than new colours: an outline,
// a pattern, an echo or a cut-paper edge that is drawn once per pose (and so costs nothing more in a battle), plus a
// little movement drawn every frame (a few particles, a ripple, a glitch, a shine). Tied to its feat:
//   glyph      (words saved)        dark slate, glowing letters written over the body, letters drifting up
//   synth      (hours listened)     an outrun sunset from gold to violet, sun-slits, a neon edge; ripples to a beat
//   holo       (cards reviewed)     a rare foil card: rainbow bands, a silver rim, glints and a shine sweeping across
//   papercut   (a book read)        cut out of a storybook: flat paper tones, a white paper edge, a drop shadow
//   broadcast  (Netflix episodes)   an old TV: colour fringes, scanlines, now and then a glitch
//   molten     (a raid boss)        obsidian with magma cracks and hot edges, embers rising
//   chorus     (podcast episodes)   lighter colours trailed by two echoes of itself; sound waves from its mouth
// No canvas code here: pixels in, pixels out (and lists of what to draw), so tests can check it. render.js draws it:
// formPixels on each of a creature's layers (cached), formFinish on the composed creature before what it wears, and
// formRows / formSweep / formParticles each frame (drawLiving).

/** The colourings this file draws (VARIANTS ids). */
export const FORM_KINDS = new Set(["glyph", "synth", "holo", "papercut", "broadcast", "molten", "chorus"]);

// ---------- colour helpers ----------
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
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Hue `a` to `b` by `t` the short way round. */
const mixHue = (a, b, t) => { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
/** A steady number 0..1 for (x, y, salt): the same every time, so a pattern never crawls. */
export function hash(x, y, salt = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** A creature's own number for its effects (from its kind's id), so two of a kind still differ from other kinds. */
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
const isWhite = (s, l) => l > 0.88 && s < 0.35; // eye glints and the brightest whites stay as they are

// Magma cracks: the edges of cells about 9 px across (the same on every layer, in the drawing's coordinates).
function crack(x, y) {
  const cx = Math.floor(x / 9), cy = Math.floor(y / 9);
  let d1 = 1e9, d2 = 1e9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const px = (cx + i) * 9 + hash(cx + i, cy + j, 7) * 9, py = (cy + j) * 9 + hash(cx + i, cy + j, 8) * 9;
    const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1 < 1.05;
}

/**
 * One layer of a creature (RGBA pixels `px`, `w` x `h`; body, head, legs: all share the drawing's coordinates) in
 * colouring `kind`'s colours. `box` = [x0, y0, x1, y1], the drawing's box (for the sunset's gradient). For an
 * animation's sheet (frames side by side, the eyelids in a row below), `cell` = [width, height, x, y] of one frame
 * and where the drawing's origin is in it, so every frame is coloured in the drawing's own coordinates.
 */
export function formPixels(px, w, h, kind, box = [0, 0, w - 1, h - 1], cell = null) {
  const top = box[1], tall = Math.max(1, box[3] - box[1]);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const i = (yy * w + xx) * 4;
      if (!px[i + 3]) continue;
      const x = cell ? (xx % cell[0]) - cell[2] : xx, y = cell ? (yy % cell[1]) - cell[3] : yy;
      let [hu, s, l] = toHsl(px[i], px[i + 1], px[i + 2]);
      if (kind === "glyph") {
        if (isWhite(s, l)) continue;
        hu = 226; s = 0.26 + 0.22 * s; l = 0.09 + l * 0.55;
      } else if (kind === "synth") {
        if (isWhite(s, l)) continue;
        if (l < 0.16) { hu = 262; s = 0.7; l = 0.1; } else {
          const t = clamp01((y - top) / tall);
          hu = t < 0.45 ? mixHue(46, 330, t / 0.45) : mixHue(330, 268, (t - 0.45) / 0.55);
          s = 0.92; l = Math.min(0.9, 0.24 + l * 0.66);
        }
      } else if (kind === "holo") {
        if (isWhite(s, l)) continue;
        if (l < 0.15) { hu = 250; s = 0.45; l = 0.14; } else {
          hu = (((x + y * 0.7) * 9) % 360 + 360) % 360; s = 0.58; l = Math.min(0.88, 0.42 + l * 0.5);
        }
      } else if (kind === "papercut") {
        if (l < 0.13) { hu = 18; s = 0.35; l = 0.12; } else {
          hu = Math.round(hu / 20) * 20; s = Math.min(0.66, s * 0.9 + 0.14);
          const want = 0.3 + l * 0.65;
          l = [0.44, 0.63, 0.8, 0.92].reduce((best, v) => (Math.abs(v - want) < Math.abs(best - want) ? v : best));
          l += (Math.floor(hash(x + 64, y + 64, 3) * 3) - 1) * 0.022; // paper fibre
        }
      } else if (kind === "broadcast") {
        // a worn tape on a late-night TV: fewer colours, punchy, the shadows gone teal
        if (l < 0.45) hu = mixHue(hu, 188, 0.45 * (1 - l / 0.45));
        s = Math.min(1, s * 1.3 + 0.08); l = clamp01((l - 0.5) * 1.18 + 0.5);
        l = Math.round(l * 6) / 6;
      } else if (kind === "molten") {
        if (l > 0.88) { hu = 46; s = 1; l = 0.74; } else if (l > 0.72) { hu = 28; s = 1; l = 0.58; } else if (l > 0.2 && crack(x + 64, y + 64)) {
          hu = 16; s = 1; l = 0.5;
        } else { hu = 265; s = 0.2; l = 0.05 + l * 0.3; }
      } else if (kind === "chorus") {
        if (isWhite(s, l)) continue;
        s *= 0.55; l = 0.22 + l * 0.76; // pale, like a voice half heard
      } else return;
      [px[i], px[i + 1], px[i + 2]] = toRgb(hu, s, l);
    }
  }
}

// ---------- what goes round the whole creature (once per pose) ----------
// The runes written over a Glyph creature: little made-up letters (3 x 4), one in about half of the 8 x 8 cells of
// its body, each cell's letter picked by the cell (so they read as writing, not as a pattern).
const RUNE_SHAPES = [
  ["#.#", "###", "#.#", "#.#"], ["###", ".#.", "#.#", "###"], ["##.", "#.#", "##.", "#.."], [".#.", "###", ".#.", "#.#"],
  ["#..", "###", "..#", "###"], ["###", "#..", "###", "..#"], ["#.#", ".#.", "#.#", "#.#"], [".##", "#..", "#..", ".##"],
];
function runeAt(x, y) {
  const cx = Math.floor(x / 8), cy = Math.floor(y / 8);
  if (hash(cx, cy, 21) > 0.55) return false;
  const shape = RUNE_SHAPES[Math.floor(hash(cx, cy, 22) * RUNE_SHAPES.length)];
  const lx = x - cx * 8 - 2 - (cy & 1), ly = y - cy * 8 - 2;
  return lx >= 0 && lx < 3 && ly >= 0 && ly < 4 && shape[ly][lx] === "#";
}

/** The pixels just outside a shape: empty ones beside a solid one (up, down, left, right). */
function ringOf(solid, w, h) {
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (solid[i]) continue;
    if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) out.push(i);
  }
  return out;
}
const put = (px, i, [r, g, b], a = 1) => {
  const k = i * 4;
  const was = px[k + 3] / 255;
  const na = a + was * (1 - a);
  if (!na) return;
  px[k] = Math.round((r * a + px[k] * was * (1 - a)) / na);
  px[k + 1] = Math.round((g * a + px[k + 1] * was * (1 - a)) / na);
  px[k + 2] = Math.round((b * a + px[k + 2] * was * (1 - a)) / na);
  px[k + 3] = Math.round(na * 255);
};
const shade = (px, i, f) => { const k = i * 4; for (let c = 0; c < 3; c++) px[k + c] = Math.max(0, Math.min(255, Math.round(px[k + c] * f))); };

/**
 * The whole creature (RGBA `px`, `w` x `h`, before what it wears goes on), finished in colouring `kind`: its edge,
 * pattern, echoes or shadow. (ox, oy) is where its drawing sits in the frame, `box` the drawing's box.
 */
export function formFinish(px, w, h, kind, ox = 0, oy = 0, box = [0, 0, w - 1, h - 1]) {
  if (!FORM_KINDS.has(kind)) return;
  const n = w * h;
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = px[i * 4 + 3] > 0 ? 1 : 0;
  const ring = ringOf(solid, w, h);
  const outer = () => { const s2 = solid.slice(); for (const i of ring) s2[i] = 1; return ringOf(s2, w, h); };
  const inside = (i) => { const x = i % w, y = (i / w) | 0; return x > 0 && x < w - 1 && y > 0 && y < h - 1 && solid[i - 1] && solid[i + 1] && solid[i - w] && solid[i + w]; };
  if (kind === "glyph") {
    const runes = [];
    for (let i = 0; i < n; i++) {
      if (!solid[i] || !inside(i)) continue;
      const [, s, l] = toHsl(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      if (isWhite(s, l) || l < 0.09) continue;
      if (runeAt((i % w) - ox, ((i / w) | 0) - oy)) runes.push(i);
    }
    const lit = new Set(runes);
    for (const i of runes) for (const j of [i - 1, i + 1, i - w, i + w]) if (solid[j] && !lit.has(j)) put(px, j, hex("#2b8fb3"), 0.45); // the glow round each stroke
    for (const i of runes) put(px, i, hex("#86fcff"));
    const far = outer();
    for (const i of ring) put(px, i, hex("#0c2633"));
    for (const i of far) put(px, i, hex("#3fd8ff"), 0.32);
  } else if (kind === "synth") {
    const y0 = oy + box[1], y1 = oy + box[3];
    const from = y0 + Math.round((y1 - y0) * 0.55);
    for (let i = 0; i < n; i++) {
      if (!solid[i]) continue;
      const y = (i / w) | 0;
      if (y < from) continue;
      const depth = (y - from) / Math.max(1, y1 - from); // the sun's slits grow wider toward the bottom
      if ((y - from) % 4 < 1 + Math.round(depth * 1.4)) shade(px, i, 0.5);
    }
    const far = outer();
    for (const i of ring) put(px, i, hex("#3ff6ff"));
    for (const i of far) put(px, i, hex("#ff3fd2"), 0.4);
  } else if (kind === "holo") {
    for (let i = 0; i < n; i++) {
      if (!solid[i]) continue;
      const x = i % w, y = (i / w) | 0;
      if ((y > 0 && !solid[i - w]) || (x > 0 && !solid[i - 1])) put(px, i, [250, 252, 255], 0.65); // the rim catching the light
    }
    const body = [];
    for (let i = 0; i < n; i++) if (solid[i] && inside(i)) body.push(i);
    for (let k = 0; k < 3 && body.length; k++) { // three glints that stay put
      const i = body[Math.floor(hash(k, body.length, 11) * body.length)];
      put(px, i, [255, 255, 255]);
      for (const j of [i - 1, i + 1, i - w, i + w]) if (solid[j]) put(px, j, [255, 255, 255], 0.6);
    }
    for (const i of ring) put(px, i, hex("#e6edff"), 0.55);
  } else if (kind === "papercut") {
    const paper = solid.slice();
    for (const i of ring) { put(px, i, hex("#fbf6e8")); paper[i] = 1; }
    // the shadow it casts on the page: 2 px down and to the right, under everything
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0;
      if (paper[i] || x < 2 || y < 2 || !paper[i - 2 * w - 2]) continue;
      put(px, i, [32, 18, 10], 0.34);
    }
  } else if (kind === "broadcast") {
    // The picture's red slips 2 px right and its blue 2 px left (a red fringe on one edge, a blue one on the other),
    // with scanlines and the screen's glow round it.
    const src = px.slice();
    for (let i = 0; i < n; i++) {
      const x = i % w;
      const left = x > 1 ? i - 2 : -1, right = x < w - 2 ? i + 2 : -1;
      const aR = left >= 0 ? src[left * 4 + 3] : 0, aB = right >= 0 ? src[right * 4 + 3] : 0, aG = src[i * 4 + 3];
      if (!aR && !aB && !aG) continue;
      const k = i * 4;
      px[k] = aR ? Math.max(src[left * 4], aG ? 0 : 200) : aG ? 0 : 0;
      px[k + 1] = aG ? src[k + 1] : 0;
      px[k + 2] = aB ? Math.max(src[right * 4 + 2], aG ? 0 : 230) : 0;
      px[k + 3] = aG ? aG : Math.round(Math.max(aR, aB) * 0.8);
    }
    const lit = new Uint8Array(n);
    for (let i = 0; i < n; i++) lit[i] = px[i * 4 + 3] > 0 ? 1 : 0;
    for (let i = 0; i < n; i++) if (px[i * 4 + 3] && ((i / w) | 0) % 2) shade(px, i, 0.55); // scanlines
    for (const i of ringOf(lit, w, h)) put(px, i, hex("#8fe3ff"), 0.28);
  } else if (kind === "molten") {
    const far = outer();
    for (const i of ring) put(px, i, hex("#2a0804"));
    for (const i of far) put(px, i, hex("#ff5a1f"), 0.38);
  } else if (kind === "chorus") {
    // two echoes trailing behind it (it faces right: they trail left), the nearer one stronger
    const src = px.slice();
    const echo = (dx, color, a) => {
      for (let i = 0; i < n; i++) {
        const x = i % w;
        if (x + dx >= w || !src[(i + dx) * 4 + 3]) continue;
        const [, , l] = toHsl(src[(i + dx) * 4], src[(i + dx) * 4 + 1], src[(i + dx) * 4 + 2]);
        if (!solid[i]) put(px, i, color, a * (0.6 + 0.4 * l));
      }
    };
    echo(8, hex("#3fe4ff"), 0.3);
    echo(4, hex("#ff4fd8"), 0.5);
  }
}

// ---------- what moves, every frame ----------
/**
 * How each row of the frame (`rows` tall) is shifted sideways right now (an Int8Array, or null for none): Synthwave
 * ripples to a beat; Broadcast glitches now and then.
 */
export function formRows(kind, now, seed = 0, rows = 88) {
  if (kind === "synth") {
    const beat = (now % 640) / 640;
    const amp = beat < 0.35 ? Math.sin((beat / 0.35) * Math.PI) * 1.4 : 0;
    if (amp < 0.5) return null;
    const out = new Int8Array(rows);
    for (let y = 0; y < rows; y++) out[y] = Math.round(Math.sin(y * 0.42 - now / 90) * amp);
    return out;
  }
  if (kind === "broadcast") {
    const cycle = 2300 + (seed % 900);
    const k = Math.floor(now / cycle);
    if (now % cycle > 150) return null;
    const out = new Int8Array(rows);
    const bands = 2 + Math.floor(hash(k, 1, seed) * 2);
    for (let b = 0; b < bands; b++) {
      const y0 = 20 + Math.floor(hash(k, b * 3 + 2, seed) * (rows - 26)), tall = 2 + Math.floor(hash(k, b * 3 + 3, seed) * 4);
      const dx = (hash(k, b * 3 + 4, seed) < 0.5 ? -1 : 1) * (2 + Math.floor(hash(k, b * 3 + 5, seed) * 4));
      for (let y = y0; y < Math.min(rows, y0 + tall); y++) out[y] = dx;
    }
    return out;
  }
  return null;
}

/** A shine crossing the creature right now, or null: Holofoil's foil shine every few seconds, Broadcast's rolling
 * bar. {kind: "band", x (where the band crosses y = 0, frame px), width, slope, alpha} or {kind: "bar", y, alpha}. */
export function formSweep(kind, now, seed = 0, size = 88) {
  if (kind === "holo") {
    const cycle = 2800 + (seed % 600), t = (now % cycle) / 700;
    if (t > 1) return null;
    return { kind: "band", x: -size * 0.6 + t * size * 1.9, width: 7, slope: -0.8, alpha: 0.55 };
  }
  if (kind === "broadcast") return { kind: "bar", y: Math.floor(((now % 3200) / 3200) * (size + 8)) - 4, alpha: 0.16 };
  return null;
}

const frac = (v) => v - Math.floor(v);
// little letter shapes that float up off a Glyph creature (3 x 3, each row a bit mask, left bit first)
const GLYPHS = [[0b101, 0b111, 0b101], [0b111, 0b010, 0b010], [0b110, 0b101, 0b110], [0b010, 0b111, 0b010], [0b011, 0b100, 0b011]];

/**
 * The particles round a creature right now: [{x, y, w, h, c (colour), a (alpha)}] in frame pixels. `rect` =
 * [x0, y0, x1, y1], the creature's box in the frame.
 */
export function formParticles(kind, now, rect, seed = 0) {
  const [x0, y0, x1, y1] = rect;
  const wide = Math.max(1, x1 - x0), tall = Math.max(1, y1 - y0);
  const out = [];
  const dot = (x, y, c, a, w2 = 1, h2 = 1) => { if (a > 0.04) out.push({ x: Math.round(x), y: Math.round(y), w: w2, h: h2, c, a: Math.min(1, a) }); };
  if (kind === "glyph") {
    for (let i = 0; i < 4; i++) {
      const p = frac(now / 2600 + i / 4 + hash(i, 0, seed) * 0.2);
      const cycle = Math.floor(now / 2600 + i / 4 + hash(i, 0, seed) * 0.2);
      const x = x0 + 4 + hash(i, cycle, seed) * (wide - 8), y = y0 + tall * 0.55 - p * (tall * 0.75 + 8);
      const g = GLYPHS[Math.floor(hash(i, cycle + 9, seed) * GLYPHS.length)];
      const a = Math.sin(Math.PI * p) * 0.9;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (g[r] & (4 >> c)) dot(x + c, y + r, "#86fcff", a);
    }
  } else if (kind === "synth") {
    for (let i = 0; i < 2; i++) { // rings pulsing out along the floor from its feet, to the beat
      const p = frac(now / 1280 + i / 2);
      const rx = 6 + p * (wide * 0.5 + 6), ry = 1.5 + p * 3.5, cx = (x0 + x1) / 2, cy = y1 - 1;
      const a = (1 - p) * 0.8;
      for (let k = 0; k < 28; k++) {
        const t = (k / 28) * Math.PI * 2;
        const y = cy + Math.sin(t) * ry;
        if (y > y1) continue;
        dot(cx + Math.cos(t) * rx, y, i ? "#ff3fd2" : "#3ff6ff", a);
      }
    }
  } else if (kind === "holo") {
    for (let i = 0; i < 3; i++) {
      const p = frac(now / 900 + i / 3);
      const cycle = Math.floor(now / 900 + i / 3);
      const x = x0 + hash(i, cycle, seed) * wide, y = y0 + hash(i, cycle + 5, seed) * tall * 0.8;
      const a = Math.sin(Math.PI * p);
      dot(x, y, "#ffffff", a);
      if (a > 0.5) { dot(x - 1, y, "#fff7c2", a * 0.7); dot(x + 1, y, "#c2f4ff", a * 0.7); dot(x, y - 1, "#ffd1f7", a * 0.7); dot(x, y + 1, "#d7ffc2", a * 0.7); }
    }
  } else if (kind === "papercut") {
    for (let i = 0; i < 2; i++) { // scraps of paper tumbling down past it
      const p = frac(now / 3600 + i / 2 + hash(i, 0, seed) * 0.3);
      const cycle = Math.floor(now / 3600 + i / 2 + hash(i, 0, seed) * 0.3);
      const x = x0 - 4 + hash(i, cycle, seed) * (wide + 8) + Math.sin(p * 9 + i) * 3, y = y0 - 6 + p * (tall + 6);
      const a = Math.min(1, (1 - p) * 2) * 0.95;
      const flat = Math.floor(now / 220 + i) % 2;
      dot(x, y, "#fbf6e8", a, flat ? 3 : 1, flat ? 2 : 2);
      dot(x, y + 1, "#c9b99a", a * 0.8, flat ? 3 : 1, 1);
    }
  } else if (kind === "broadcast") {
    const cycle = 2300 + (seed % 900);
    if (now % cycle <= 150) { // snow while it glitches
      const k = Math.floor(now / cycle);
      for (let i = 0; i < 8; i++) dot(x0 + hash(i, k * 7 + Math.floor(now / 50), seed) * wide, y0 + hash(i + 40, k, seed) * tall, i % 2 ? "#ffffff" : "#9aa4b8", 0.85);
    }
  } else if (kind === "molten") {
    for (let i = 0; i < 6; i++) { // embers rising off it
      const p = frac(now / 1700 + i / 6 + hash(i, 0, seed) * 0.3);
      const cycle = Math.floor(now / 1700 + i / 6 + hash(i, 0, seed) * 0.3);
      const x = x0 + 3 + hash(i, cycle, seed) * (wide - 6) + Math.sin(p * 6 + i * 2) * 2.5, y = y0 + tall * 0.4 - p * (tall * 0.6 + 6);
      const a = (1 - p) * 0.95;
      dot(x, y, p < 0.4 ? "#ffd25a" : "#ff6a1a", a, i % 3 === 0 ? 2 : 1, 1);
    }
  } else if (kind === "chorus") {
    // sound waves from its mouth: arcs opening out in front of its head (it faces right)
    const cx = x1 - wide * 0.12, cy = y0 + tall * 0.32;
    for (let i = 0; i < 3; i++) {
      const p = frac(now / 1500 + i / 3);
      const r = 3 + p * 9, a = Math.sin(Math.PI * p) * 0.8;
      for (let k = -3; k <= 3; k++) {
        const t = (k / 3) * 0.95;
        dot(cx + Math.cos(t) * r, cy + Math.sin(t) * r, i % 2 ? "#ff4fd8" : "#3fe4ff", a);
      }
    }
  }
  return out;
}
