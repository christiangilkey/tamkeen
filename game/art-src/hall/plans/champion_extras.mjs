// The champion's smaller pieces in the championship hall: hand-designed pixel plans (every pixel placed on purpose).
// Writes champion_crown.txt, champion_pennant.txt and champion_hidden.txt, the plans the Aseprite drawings follow.
//   node game/art-src/hall/plans/champion_extras.mjs
//
// - champion_crown: 22 x 8, two frames side by side (11 x 8 each): the gold crown that floats over the champion's lead
//   creature. Three points with balls, a red jewel; in the second frame the jewel catches the light and a glint shows.
// - champion_pennant: 16 x 36: a royal-purple pennant on a gold rod, gold-edged, swallow-tailed, the gold crown on it
//   and a laurel under it. Two hang on the wall either side of the dais.
// - champion_hidden: 24 x 24: a creature-shaped shadow with a pale question mark, standing in for a champion's team
//   when they have chosen not to show it.
// Outlines are the hall props' dark violet (#120c18); light from the upper left.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const GOLD = { a: "#8a5c16", b: "#b48420", c: "#d8aa30", d: "#f0cc4a", e: "#fce47c", f: "#fff6c0" };
const PURPLE = { m: "#24123a", n: "#3a1a5a", o: "#55287e", p: "#7240a0", q: "#9466c4" };
const K = "#120c18";
const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill("."));
const stamp = (g, rows, x0, y0) => rows.forEach((r, i) => [...r].forEach((c, j) => { if (c !== ".") g[y0 + i][x0 + j] = c; }));

// ---- the crown, two frames
const CROWN_1 = [
  ".K...K...K.",
  "KfK.KeK.KdK",
  "KeK.KdK.KcK",
  "KedKdddKdcK",
  "KedddrddddK",
  "KeccccccccK",
  "KcbbbbbbbaK",
  ".KKKKKKKKK.",
];
const CROWN_2 = [ // (the jewel lit, a glint on the right point instead of the left)
  ".K...K...K.",
  "KeK.KeK.KfK",
  "KeK.KdK.KeK",
  "KedKdfdKdcK",
  "KeddsrsdddK",
  "KeccccccccK",
  "KcbbbbbbbaK",
  ".KKKKKKKKK.",
];
const crown = grid(22, 8);
stamp(crown, CROWN_1, 0, 0);
stamp(crown, CROWN_2, 11, 0);

// ---- the pennant
const pennant = grid(16, 36);
stamp(pennant, [
  ".KKKKKKKKKKKKKK.",
  "KeedddddddddcccK",
  ".KKKKKKKKKKKKKK.",
], 0, 0);
for (let y = 3; y < 36; y++) {
  for (let x = 2; x <= 13; x++) {
    const k = Math.floor((y - 30) / 2) + (y >= 30 ? 0 : -1); // the swallow-tail's notch, from row 30 down, a pixel wider every two rows
    if (y >= 30 && x >= 7 - k && x <= 8 + k) continue;
    pennant[y][x] = x === 3 ? "c" : x === 12 ? "b" : x === 4 ? "q" : x >= 10 ? "o" : "p";
    if (y === 3 && x > 2 && x < 13) pennant[y][x] = "n"; // (in the rod's shadow)
  }
}
// its outline: every cloth pixel touching the outside (or the notch)
const cloth = (x, y) => y >= 3 && y < 36 && x >= 2 && x <= 13 && pennant[y][x] !== ".";
const edge = [];
for (let y = 3; y < 36; y++) for (let x = 2; x <= 13; x++) {
  if (!cloth(x, y)) continue;
  if (x === 2 || x === 13 || y === 35 || [[1, 0], [-1, 0], [0, 1]].some(([dx, dy]) => !cloth(x + dx, y + dy))) edge.push([x, y]);
}
for (const [x, y] of edge) pennant[y][x] = "K";
// the gold edging follows the notch too, and the tails end in gold
for (let y = 28; y < 35; y++) for (let x = 3; x <= 12; x++) {
  if (pennant[y][x] === "K" || pennant[y][x] === ".") continue;
  const nextToNotch = pennant[y + 1] && pennant[y + 1][x] === "K" && y + 1 >= 30;
  if (nextToNotch) pennant[y][x] = x < 8 ? "c" : "b";
}
stamp(pennant, ["e..dd..c", "ed.dd.dc", "eddddddc", "cbcbbcbc"], 4, 11); // the crown
stamp(pennant, ["d......d", "cd....dc", ".bc..cb.", "..bccb.."], 4, 18); // the laurel
// a fold of light down its left, a shade fold right of the middle
for (let y = 5; y < 30; y++) { if (pennant[y][9] === "p") pennant[y][9] = "o"; }

// ---- the hidden champion's stand-in
const hidden = grid(24, 24);
const S = { 1: "#24222e", 2: "#363442", 3: "#4a4858", 6: "#9492a2", 7: "#b2b0bc" };
const body = (x, y) => ((x + 0.5 - 12) / 9.5) ** 2 + ((y + 0.5 - 15) / 8.5) ** 2 <= 1;
// the ears: hand-set spans per row (the left one; the right one is its mirror)
const EAR = { 3: [6, 6], 4: [5, 7], 5: [5, 7], 6: [5, 8], 7: [5, 9], 8: [5, 9] };
const ear = (x, y) => EAR[y] && ((x >= EAR[y][0] && x <= EAR[y][1]) || (23 - x >= EAR[y][0] && 23 - x <= EAR[y][1]));
const shape = (x, y) => x >= 0 && y >= 0 && x < 24 && y < 24 && (body(x, y) || ear(x, y));
for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (shape(x, y)) hidden[y][x] = "1";
for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
  if (!shape(x, y)) continue;
  if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !shape(x + dx, y + dy))) hidden[y][x] = "K";
  else if (!shape(x - 1, y - 1) || !shape(x - 2, y)) hidden[y][x] = "2"; // (a dim rim of light on the upper left)
}
stamp(hidden, [
  ".676.",
  "7...7",
  "....6",
  "..76.",
  "..6..",
  ".....",
  "..6..",
], 10, 10); // the question mark

const PLANS = {
  champion_crown: { g: crown, pal: { K, ...GOLD, r: "#ac2a30", s: "#de6a50" } },
  champion_pennant: { g: pennant, pal: { K, ...GOLD, ...PURPLE } },
  champion_hidden: { g: hidden, pal: { K, ...S } },
};
export const plans = PLANS;
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const [name, { g, pal }] of Object.entries(PLANS)) {
    const used = new Set(g.flat());
    const head = [`# ${name}, plan (hand-placed: game/art-src/hall/plans/champion_extras.mjs)`, `SIZE ${g[0].length} ${g.length}`,
      ...Object.entries(pal).filter(([k]) => used.has(k)).map(([k, v]) => `${k}=${v}`)];
    writeFileSync(join(here, `${name}.txt`), [...head, ...g.map((r) => r.join(""))].join("\n") + "\n");
    console.log(name);
    console.log(g.map((r) => r.join("")).join("\n"));
  }
}
