// The champion's dais in the championship hall, 80 x 40: a hand-designed pixel plan (every pixel placed here on
// purpose, nothing random). Writes champion_dais.txt, the plan the Aseprite drawing follows exactly.
//   node game/art-src/hall/plans/champion_dais.mjs
//
// Two oval tiers of pale polished stone (the knights' statues' stone ramp), lit from the upper left, each with a gold
// rim along its front edge. A royal-purple drape hangs over the upper tier's face, gold-edged and fringed, with the gold
// crown on it: the mark of the best player. Gold studs run round the lower tier's face, and a gold laurel sits in its
// middle. The champion's lead creature stands on the upper tier (its feet at 40, 6); the other two on the lower tier's
// ends (11, 17) and (69, 17). Outlines are the hall props' dark violet (#120c18), never black.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const W = 80, H = 30;
export const PAL = {
  K: "#120c18",
  // stone (prop_statue_knight's ramp)
  1: "#24222e", 2: "#363442", 3: "#4a4858", 4: "#605e70", 5: "#787688", 6: "#9492a2", 7: "#b2b0bc", 8: "#d2d0d8",
  // gold (prop_banner's and prop_counter's ramp)
  a: "#8a5c16", b: "#b48420", c: "#d8aa30", d: "#f0cc4a", e: "#fce47c", f: "#fff6c0",
  // royal purple (the champion's cloth; the brand's plum family, darkest first)
  m: "#24123a", n: "#3a1a5a", o: "#55287e", p: "#7240a0", q: "#9466c4",
};
export const SPOTS = { lead: [40, 6], left: [11, 17], right: [69, 17] };

const g = Array.from({ length: H }, () => Array(W).fill("."));
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };

/** One oval tier: its top (centre cx, cy; half-widths rx, ry) and a front face `deep` pixels high. */
function tier(cx, cy, rx, ry, deep) {
  const top = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  const mask = new Set();
  const lowest = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (top(x, y)) { mask.add(`${x},${y}`); lowest[x] = Math.max(lowest[x] ?? -1, y); }
  const third = rx / 3;
  // the top: pale stone, brightest at the front left, a little shaded at the back right
  for (const k of mask) {
    const [x, y] = k.split(",").map(Number);
    set(x, y, x < cx - rx / 2 && y >= cy ? "8" : x > cx + rx / 2 && y < cy ? "6" : "7");
  }
  // the front rim in gold (bright on the left, deep on the right) and the face under it
  for (const [xs, yb] of Object.entries(lowest)) {
    const x = Number(xs);
    set(x, yb, x < cx - third ? "e" : x <= cx + third ? "d" : "c");
    for (let k = 1; k <= deep; k++) {
      mask.add(`${x},${yb + k}`);
      set(x, yb + k, k === deep ? (x > cx + third ? "2" : "3") : x < cx - third ? "6" : x <= cx + third ? "5" : "4");
    }
    set(x, yb + 1, x < cx - third ? "7" : x <= cx + third ? "6" : "5"); // (the face's top row catches the light)
  }
  return { mask, lowest, cx, cy, rx, ry, deep };
}
const outline = (t, inside) => {
  for (const k of t.mask) {
    const [x, y] = k.split(",").map(Number);
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inside(x + dx, y + dy))) set(x, y, "K");
  }
};

// ---- the lower tier, then the upper one standing on it
const low = tier(40, 16, 39, 7, 6);
const up = tier(40, 5, 24, 5, 6);
// the upper tier's shadow on the lower top: just under its face, and off to its right (the light is upper left)
for (const [xs, yb] of Object.entries(up.lowest)) {
  const x = Number(xs), foot = yb + up.deep;
  for (const y of [foot + 1, foot + 2]) if (low.mask.has(`${x},${y}`) && g[y][x] !== "K" && !/[a-f]/.test(g[y][x])) set(x, y, x > 44 || y === foot + 1 ? "5" : "6");
}
for (let y = 7; y < 18; y++) for (const x of [65, 66]) if (low.mask.has(`${x},${y}`) && !up.mask.has(`${x},${y}`) && !/[a-fK]/.test(g[y][x])) set(x, y, "6");
outline(low, (x, y) => low.mask.has(`${x},${y}`) || up.mask.has(`${x},${y}`));
outline(up, (x, y) => up.mask.has(`${x},${y}`));

// ---- studs round the lower face (one gold dot with a glint above it and its shade below), and the laurel
for (const x of [7, 15, 23, 57, 65, 73]) {
  const y = low.lowest[x] + 3;
  set(x, y, "d"); set(x, y - 1, x < 40 ? "f" : "e"); set(x, y + 1, "b");
}
const LAUREL = [
  // x from 32, rows from 24: a wreath open at the top, its two branches meeting under a little gold knot
  "d............d",
  "cd..........dc",
  ".bdc......cdb.",
  "...bcdeedcb...",
];
LAUREL.forEach((row, i) => [...row].forEach((c, j) => { if (c !== ".") set(32 + j, 24 + i, c); }));

// ---- the drape over the upper tier's face: royal purple, gold edges, a gold fringe, the crown on it
const D0 = 30, D1 = 49;
for (let x = D0; x <= D1; x++) {
  const yt = up.lowest[x], yb = yt + up.deep + 1; // (from its rim to one pixel over the foot: it hangs)
  for (let y = yt; y <= yb; y++) {
    let c = x === D0 || x === D1 ? "K" : x === D0 + 1 ? "c" : x === D1 - 1 ? "b" : x === D0 + 2 ? "q" : x >= D1 - 3 ? "o" : "p";
    if ((x === 35 || x === 44) && c === "p") c = "o"; // (two soft folds)
    if (y === yt && x > D0 && x < D1) c = x < 40 ? "e" : "d"; // (it hangs from the gold rim)
    if (y === yb && x > D0 && x < D1) c = x % 2 ? "c" : "a"; // (the fringe)
    set(x, y, c);
  }
  if (x > D0 && x < D1 && x % 2) set(x, yb + 1, "K"); // (the fringe's tassel ends against the stone)
}
const CROWN = [
  // x from 36, rows from 11
  "e..dd..c",
  "ed.dd.dc",
  "eddddddc",
  "cbcbbcbc",
];
CROWN.forEach((row, i) => [...row].forEach((c, j) => { if (c !== ".") set(36 + j, 11 + i, c); }));

export const plan = () => g.map((r) => r.join(""));
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const head = ["# The champion's dais, plan (hand-placed: game/art-src/hall/plans/champion_dais.mjs)", `SIZE ${W} ${H}`,
    ...Object.entries(PAL).map(([k, v]) => `${k}=${v}`)];
  const out = join(dirname(fileURLToPath(import.meta.url)), "champion_dais.txt");
  writeFileSync(out, [...head, ...plan()].join("\n") + "\n");
  console.log(out);
  console.log(plan().join("\n"));
}
