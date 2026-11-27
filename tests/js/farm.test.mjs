// The farm (prototype "farm", web/js/game/farm.js; the owner's design, tamkeen-plans/farming-plan.md section 1): crops
// ripen after water on DIFFERENT days, watering is a word answered, nothing dies (a missed day wilts, one answer
// revives), the seasons turn weekly for everyone, harvests roll their rarity and wait in the barn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CROPS, FENCE_MAX, MAX_SIZE, RARE_CROPS, SEASONS, barnList, buySeeds, cropById, farmOf, fenceCost, fieldSize, growFence,
  harvest, inSeason, plant, plantState, rareSeedOf, rollTier, seasonOf, seedsOnSale, sizeAfter, spots, water,
} from "../../web/js/game/farm.js";
import { BARN, BUILD_SPOTS, FARM_COLS, FARM_IN, FIELD, GAP_ROW, PLOT_SLACK, SEED_STAND, farmBlocked, farmMap, fieldLeft, gapCol, plotAt, spotXY, tapFarm } from "../../web/js/game/farmmap.js";
import { LEGENDARY } from "../../web/js/game/loot.js";
import { PROTOTYPES } from "../../web/js/prototype.js";

const day = (n) => new Date(2026, 10, 23 + n, 12); // Monday 23 November 2026, then the days after it
const fresh = () => ({ review: {}, stats: {}, day: {}, idle: { glow: 10000 } });
const glow = (s) => s.idle;
const src = (f) => readFileSync(new URL(`../../web/js/game/${f}`, import.meta.url), "utf8");
/** A game with tomato seeds planted at 0,0 on Monday (a summer week: 23 November 2026). */
function planted(id = "tomato") {
  const s = fresh();
  assert.equal(buySeeds(s, glow(s), id, 1, day(0)), "");
  assert.equal(plant(s, "0,0", id, day(0)), "");
  return s;
}

test("the farm (released in v0.76.0): about 30 crops: 8 a season, a few all year, a rare seed packet in turn", () => {
  assert.ok(PROTOTYPES.farm);
  for (const season of SEASONS) assert.equal(CROPS.filter((c) => c.season === season).length, 8, season);
  assert.ok(CROPS.length >= 30 && CROPS.length <= 40);
  assert.equal(new Set(CROPS.map((c) => c.id)).size, CROPS.length);
  assert.ok(RARE_CROPS.length >= 2 && RARE_CROPS.every((c) => c.season === "all"));
  assert.equal(cropById("carrot").days, 2);
  assert.equal(cropById("pumpkin").days, 5);
  assert.equal(cropById("apple").days, 10, "a fruit tree: 10 days of water");
});

test("seasons turn weekly, the same for everyone; seeds on sale are the season's and the all-year ones", () => {
  const seen = [0, 7, 14, 21].map((d) => seasonOf(day(d)));
  assert.equal(new Set(seen).size, 4, "four weeks, four seasons");
  for (let d = 0; d < 7; d++) assert.equal(seasonOf(day(d)), seasonOf(day(0)), "all week the same");
  const sale = seedsOnSale(day(0));
  assert.ok(sale.every((c) => !c.rare && (c.season === "all" || c.season === seasonOf(day(0)))));
  assert.equal(sale.length, 10);
  assert.notEqual(rareSeedOf(day(0)).id, rareSeedOf(day(7)).id, "a different rare packet each week");
});

test("seeds for glow: out of season refused, the rare packet once a week; not enough glow refused", () => {
  const s = fresh();
  const off = CROPS.find((c) => c.season !== "all" && !inSeason(c, day(0)));
  assert.match(buySeeds(s, glow(s), off.id, 1, day(0)), /out of season/);
  const rare = rareSeedOf(day(0));
  assert.equal(buySeeds(s, glow(s), rare.id, 1, day(0)), "");
  assert.match(buySeeds(s, glow(s), rare.id, 1, day(1)), /this week/);
  s.idle.glow = 1;
  assert.match(buySeeds(s, glow(s), "tomato", 1, day(0)), /more glow/);
});

test("a crop ripens only with water on different days: one watering a day, wrong answers water a little", () => {
  const s = planted("tomato"); // 3 days of water
  let st = plantState(s, "0,0", day(0));
  assert.ok(st.thirsty && st.stage === 0);
  assert.deepEqual(water(s, "0,0", false, day(0)), { grew: false, ripe: false, revived: false }, "a wrong answer: a little");
  assert.ok(plantState(s, "0,0", day(0)).half);
  assert.equal(water(s, "0,0", false, day(0)).grew, true, "two wrong answers make a watering");
  assert.match(water(s, "0,0", true, day(0)), /had its water today/, "never twice in one day");
  assert.equal(water(s, "0,0", true, day(1)).grew, true);
  const last = water(s, "0,0", true, day(2));
  assert.deepEqual(last, { grew: true, ripe: true, revived: false, lantern: false });
  st = plantState(s, "0,0", day(2));
  assert.ok(st.ripe && st.stage === 3 && !st.thirsty);
});

test("nothing dies: a plant missed for a day wilts and waits; one answer revives it", () => {
  const s = planted("tomato");
  water(s, "0,0", true, day(0));
  assert.equal(plantState(s, "0,0", day(1)).wilted, false, "the next day it's only thirsty");
  const st = plantState(s, "0,0", day(5));
  assert.ok(st.wilted && st.days === 1, "days later: wilted, its progress kept");
  assert.deepEqual(water(s, "0,0", true, day(5)), { grew: true, ripe: false, revived: true, lantern: false });
  assert.equal(plantState(s, "0,0", day(5)).wilted, false);
});

test("out of its season a plant rests (no water asked, no wilting) and grows again when its season comes back", () => {
  const s = planted("tomato");
  const off = [7, 14, 21].map(day).find((d) => !inSeason(cropById("tomato"), d));
  const st = plantState(s, "0,0", off);
  assert.ok(st.resting && !st.thirsty && !st.wilted);
  assert.match(water(s, "0,0", true, off), /resting/);
});

test("a harvest: its rarity rolled (Legendary at most), how many it gives, into the barn; the spot empties", () => {
  const s = planted("basil"); // (all year: 2 days of water, gives 2 or 3)
  assert.match(harvest(s, "0,0", Math.random, day(0)), /isn't ripe/);
  water(s, "0,0", true, day(0));
  water(s, "0,0", true, day(1));
  const got = harvest(s, "0,0", () => 0.5, day(1));
  assert.equal(got.crop.id, "basil");
  assert.ok(got.n >= 2 && got.n <= 3);
  assert.equal(plantState(s, "0,0", day(1)), null);
  assert.deepEqual(barnList(s).map((b) => [b.crop.id, b.n]), [["basil", got.n]]);
  for (let i = 0; i < 2000; i++) assert.ok(rollTier(5, Math.random) <= LEGENDARY);
  assert.equal(rollTier(1, () => 0.999), 0, "most harvests are Common");
  assert.equal(farmOf(s).dex.basil, got.tier + 1, "the Cropdex keeps the rarest grown");
});

test("the field grows a column or a row with each fence section, to 12 x 6, each dearer than the last", () => {
  assert.deepEqual(sizeAfter(0), [3, 3]);
  assert.deepEqual(sizeAfter(FENCE_MAX), MAX_SIZE);
  const s = fresh();
  s.idle.glow = 1e9;
  let last = 0;
  for (let i = 0; i < FENCE_MAX; i++) {
    const cost = fenceCost(s);
    assert.ok(cost > last);
    last = cost;
    assert.equal(growFence(s, glow(s)), "");
  }
  assert.deepEqual(fieldSize(s), [12, 6]);
  assert.equal(spots(s).length, 72);
  assert.match(growFence(s, glow(s)), /as big/);
  assert.match(plant(s, "12,0", "carrot"), /isn't part/);
});

test("the farm's map: the fence round the field with a gap, the path to the gate; every spot reachable; taps", () => {
  for (const [w, h] of [[3, 3], [12, 6]]) {
    const m = farmMap(w, h);
    assert.equal(m.tiles.length, FARM_COLS * 9);
    assert.equal(m.tiles[GAP_ROW * FARM_COLS + FIELD.right + 1], "dirt", "the pen's entrance: a gap in its east fence");
    assert.equal(m.tiles[(FIELD.y - 1) * FARM_COLS + FIELD.right], "fence");
    for (const p of m.props) assert.ok(p.x > FIELD.right + 1 || p.y > FIELD.y + h || p.x + p.w <= fieldLeft(w) - 1 || p.y < FIELD.y - 1, `${p.id} outside the fence`);
    const at = spotXY(0, 0);
    assert.deepEqual(tapFarm(at.x, at.y, w, h), { kind: "plot", c: 0, r: 0 });
    const blocked = farmBlocked(w, h, (p) => `${Math.round(p.x)},${Math.round(p.y)}`);
    assert.ok(blocked.size > 0);
  }
  assert.equal(tapFarm(fieldLeft(3) * 16 - 12, 40, 3, 3).kind, "fence");
});

test("the art: a row of five frames for every crop and an icon each, in farm.js's order (farmart.py's CROPS)", () => {
  const png = (f) => { const b = readFileSync(new URL(`../../web/game-art/farm/${f}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(png("crops.png"), [80, 24 * CROPS.length]);
  assert.deepEqual(png("icons.png"), [16 * CROPS.length, 16]);
  assert.deepEqual(png("soil.png"), [32, 16]);
  const py = readFileSync(new URL("../../tools/game_art/farmart.py", import.meta.url), "utf8");
  const list = py.slice(py.indexOf("CROPS = ["));
  const order = [...list.slice(0, list.indexOf("\n]")).matchAll(/\("(\w+)", "\w+"\)/g)].map((m) => m[1]);
  assert.deepEqual(order, CROPS.map((c) => c.id));
});

test("every spot of a 3 x 3 and a 12 x 6 field takes a tap anywhere on it, and a near miss goes to the nearest spot", () => {
  for (const [w, h] of [[3, 3], [12, 6]]) {
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const at = spotXY(c, r);
      for (const [dx, dy] of [[0, 0], [-8, -8], [7, 7], [-8, 7], [7, -8]]) { // its middle and its four corners
        assert.deepEqual(plotAt(at.x + dx, at.y + dy, w, h), { c, r }, `${w}x${h} spot ${c},${r} at ${dx},${dy}`);
        assert.equal(tapFarm(at.x + dx, at.y + dy, w, h).kind, "plot");
      }
    }
    const east = spotXY(0, 0), west = spotXY(w - 1, h - 1); // (columns count from the field's right edge)
    assert.deepEqual(plotAt(east.x + 8 + PLOT_SLACK - 1, east.y, w, h), { c: 0, r: 0 }, "just right of the field: its first spot");
    assert.deepEqual(plotAt(west.x - 8 - PLOT_SLACK + 1, west.y + 8 + PLOT_SLACK - 1, w, h), { c: w - 1, r: h - 1 }, "just past its far corner");
    assert.equal(plotAt(east.x + 8 + PLOT_SLACK + 2, east.y, w, h), null, "further off: not the field");
    assert.equal(tapFarm(west.x - 8 - PLOT_SLACK - 4, west.y + 30, w, h).kind === "plot", false);
  }
});

test("a tap in the field is the field's before anything standing or wandering over it, and opens the spot at once", () => {
  const h = src("habitat.js");
  const tap = h.slice(h.indexOf('canvas.addEventListener("click"'));
  assert.ok(tap.indexOf("plotAt(x, y, fw, fh)") < tap.indexOf("decorAt(x, y)"), "before decorations");
  assert.ok(tap.indexOf("plotAt(x, y, fw, fh)") < tap.indexOf("muffleAt(x, y)"), "before the Muffles");
  const fn = h.slice(h.indexOf("function tapSpot("), h.indexOf("async function useSpot("));
  assert.match(fn, /useSpot\(key\)/, "its card opens on the tap");
  assert.doesNotMatch(fn, /use:spot/, "not only when the creature arrives");
});

test("planting asks one word on the farm's question card; right or wrong it is planted, and with no word it plants at once", () => {
  const ui = src("farm-ui.js");
  const pick = ui.slice(ui.indexOf("export function pickSeed("), ui.indexOf("export function plantCard("));
  assert.match(pick, /askToPlant\(key, c\)/, "the seed picker's Plant asks the word");
  assert.doesNotMatch(pick, /plant\(game, key, c\.id\)/, "it no longer plants straight from the picker");
  const ask = ui.slice(ui.indexOf("export async function askToPlant("));
  assert.match(ask, /if \(!q\) \{ const r = sow\(\)/, "no word to ask: planted straight away");
  assert.match(ask, /act: \(\) => sow\(\)/, "planted whatever the answer: the seed is never lost");
  const card = ui.slice(ui.indexOf("function farmCard("), ui.indexOf("export async function askToWater("));
  assert.match(card, /answerQuestion\(game, q\.uid, correct\)/, "the answer counts for the word, as watering's does");
  assert.doesNotMatch(card, /coins|gems|glow/, "no pay for answering (the owner's farm rules)");
  for (const k of ['"plant"', '"water"', '"drizzle"']) assert.ok(card.includes(`kind: ${k}`), `its own moment: ${k}`);
});

test("the farm by its entrance: the field just west of the barn and the buildings, growing west, its spots staying put", () => {
  assert.ok(FARM_IN.x >= BARN.x0 * 16, "you come in at the right, below the barn");
  for (const b of BUILD_SPOTS) assert.ok(b.x > (FIELD.right + 1) * 16 && FARM_IN.x - b.x < 160, "the buildings' spots are between the pen and the way in");
  assert.ok(Math.abs(SEED_STAND.x - (FIELD.right + 1) * 16) < 40 && Math.abs(SEED_STAND.y - GAP_ROW * 16) < 56, "the seed stand right in front of the pen's entrance");
  assert.ok(FARM_IN.x - (FIELD.right + 1) * 16 < 320 - 32, "the field is in view as you come in (the window is 320 across)");
  assert.ok(fieldLeft(12) < fieldLeft(3), "a bigger field reaches further west");
  assert.deepEqual(spotXY(0, 0), { x: FIELD.right * 16 + 8, y: FIELD.y * 16 + 8 }, "spot 0,0 is the field's top right whatever its size");
});
