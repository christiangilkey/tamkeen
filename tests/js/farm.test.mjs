// The farm (prototype "farm", web/js/game/farm.js; the owner's design, tamkeen-plans/farming-plan.md section 1): crops
// grow with every word studied and more with each watering (growth, 2026-11-28), right or wrong the same, nothing dies
// (a missed day only wilts the look), the seasons turn weekly for everyone, harvests roll their rarity and wait in the
// barn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CROPS, FENCE_MAX, GROW_PER_WORD, MATURITY_PER_DAY, MAX_SIZE, RARE_CROPS, SEASONS, WATER_BOOST, barnList, buySeeds, cropById, digUp,
  daysToNextSeason, farmOf, fenceCost, fieldSize, grow, growFence, harvest, inSeason, needOf, nextSeasonOf, plant, plantState, rareSeedOf,
  rollTier, seasonOf, seedsComing, seedsOnSale, sizeAfter, spots, stageOf, ungrow, water,
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

test("the season ahead (the owner, 2026-11-28): next week's season, the seeds it brings, the days until it turns", () => {
  for (let d = 0; d < 7; d++) {
    assert.equal(nextSeasonOf(day(d)), seasonOf(day(7)), "all week, next week's season");
    assert.equal(daysToNextSeason(day(d)), 7 - d, "Monday: 7 days to go; Sunday: 1 (tomorrow)");
    assert.equal(rareSeedOf(day(d)).id, rareSeedOf(day(0)).id, "the rare packet changes when the season does");
  }
  const coming = seedsComing(day(0));
  assert.equal(coming.length, 8);
  assert.ok(coming.every((c) => c.season === nextSeasonOf(day(0)) && !inSeason(c, day(0)) && inSeason(c, day(7))));
  // the words for it (farm-ui.js): "All year", the season while it's on, "Back in Autumn" out of it; "This week only"
  // and its countdown on the rare packet; "Autumn in 3 days" on the farm page's header, a tap peeking at the seeds
  const ui = src("farm-ui.js");
  assert.match(ui, /c\.season === "all" \? t\("All year"\)\s*: inSeason\(c, now\) \? t\(SEASON_NAME\[c\.season\]\) : t\("Back in \{0\}", t\(SEASON_NAME\[c\.season\]\)\)/);
  assert.match(ui, /weekly \? \[t\("This week only"\), rareChanges\(\)\] : \[seasonTag\(c\)\]/);
  for (const card of ["fact(\"Season\", `<span>${seasonTag(c)}</span>`), fact(\"Bait\"", "fact(\"Growth\", `<span>${growthLine(s)}</span>`), fact(\"Season\", `<span>${seasonTag(c)}</span>`)",
    "cell.onclick = () => cropCard(c);"]) assert.ok(ui.includes(card), card);
  const page = src("farmpage.js");
  assert.match(page, /\$\("\.farmp-season"\)\.textContent = `\$\{t\(SEASON_NAME\[seasonOf\(now\)\]\)\} · \$\{nextSeasonLine\(now\)\}`/);
  assert.match(page, /\$\("\.farmp-season"\)\.onclick = \(\) => \{ sfx\("tick"\); openSeasonPeek\(\); \}/);
  assert.match(page, /toast\(seasonTag\(c\)\)/, "planting out of season says when it's back");
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

test("growth: every word studied grows every growing plant; a watering one plant more, right or wrong the same; no daily cap", () => {
  const s = planted("tomato"); // (75 to ripen: 3 x MATURITY_PER_DAY)
  assert.equal(buySeeds(s, glow(s), "basil", 1, day(0)), ""); // (all year, ripe at 50)
  assert.equal(plant(s, "1,0", "basil", day(0)), "");
  let st = plantState(s, "0,0", day(0));
  assert.ok(st.thirsty && st.stage === 0 && st.m === 0 && st.need === needOf(cropById("tomato")) && st.need === 75);
  assert.deepEqual(grow(s, 1, day(0)), { "0,0": GROW_PER_WORD, "1,0": GROW_PER_WORD }, "one word: every plant a little");
  assert.deepEqual(water(s, "0,0", false, day(0)), { grew: true, ripe: false, revived: false, lantern: false }, "a wrong answer: a full watering");
  assert.equal(plantState(s, "0,0", day(0)).m, GROW_PER_WORD + WATER_BOOST);
  assert.equal(water(s, "0,0", true, day(0)).grew, true, "again the same day: no daily cap");
  assert.equal(plantState(s, "0,0", day(0)).m, GROW_PER_WORD + 2 * WATER_BOOST);
  grow(s, 49, day(0));
  assert.ok(plantState(s, "1,0", day(0)).ripe, "50 words ripen a basil the same day");
  assert.equal(plantState(s, "0,0", day(0)).stage, 2, "the tomato past half: growing");
  assert.deepEqual(grow(s, 1, day(0)), { "0,0": 1 }, "a ripe plant grows no more");
  grow(s, 100, day(0));
  st = plantState(s, "0,0", day(0));
  assert.ok(st.ripe && st.stage === 3 && st.m === 75 && st.pct === 100 && !st.thirsty);
  assert.match(water(s, "0,0", true, day(0)), /ripe/);
});

test("a bigger field grows more per word; Undo takes a word's growth back; the stages follow maturity", () => {
  const s = fresh();
  assert.equal(buySeeds(s, glow(s), "tomato", 4, day(0)), "");
  for (const k of ["0,0", "1,0"]) plant(s, k, "tomato", day(0));
  const small = Object.values(grow(s, 1, day(0))).reduce((a, b) => a + b, 0);
  for (const k of ["2,0", "0,1"]) plant(s, k, "tomato", day(0));
  const grown = grow(s, 1, day(0));
  assert.equal(Object.values(grown).reduce((a, b) => a + b, 0), small * 2, "twice the plants, twice the growth for one word");
  ungrow(s, grown);
  assert.deepEqual(["0,0", "1,0", "2,0", "0,1"].map((k) => plantState(s, k, day(0)).m), [1, 1, 0, 0], "Undo: as before that word");
  assert.deepEqual([0, 0.1, 0.15, 0.49, 0.5, 0.99, 1].map(stageOf), [0, 0, 1, 1, 2, 2, 3]);
  grow(s, 44, day(0));
  assert.deepEqual([plantState(s, "0,0", day(0)).stage, plantState(s, "0,0", day(0)).pct], [2, 60], "45 of 75: Growing · 60%");
});

test("an old save's plants keep their growth: water days become maturity, and an older copy of the app reads days", () => {
  const s = fresh();
  s.farm = { plots: { "0,0": { crop: "tomato", days: 2, last: 0, planted: 0, wet: { d: 0, n: 1 } } }, seeds: {}, barn: {}, fence: 0, at: 1 };
  const st = plantState(s, "0,0", day(0));
  assert.equal(st.m, 2 * MATURITY_PER_DAY);
  assert.equal(s.farm.plots["0,0"].wet, undefined, "a half watering is gone (a wrong answer is a full one now)");
  grow(s, 30, day(0));
  assert.equal(s.farm.plots["0,0"].days, 3, "days kept for older copies: 80 of 75 is ripe, 3 days");
  s.farm.plots["0,0"] = { crop: "pumpkin", m: 10, days: 2, last: 0, planted: 0 }; // (an older copy watered it since)
  assert.equal(plantState(s, "0,0", day(0)).m, 2 * MATURITY_PER_DAY, "the older copy's days count");
});

test("dig up: the spot is empty again and its seed back in the tray, at any stage; a ripe one is harvested instead", () => {
  const s = planted("tomato");
  assert.equal(s.farm.seeds.tomato, undefined);
  grow(s, 20, day(0));
  assert.equal(digUp(s, "0,0", day(0)), "");
  assert.equal(plantState(s, "0,0", day(0)), null);
  assert.equal(s.farm.seeds.tomato, 1, "the seed back");
  assert.match(digUp(s, "0,0", day(0)), /Nothing/);
  plant(s, "0,0", "tomato", day(0));
  grow(s, 75, day(0));
  assert.match(digUp(s, "0,0", day(0)), /harvest it instead/);
});

test("nothing dies: a plant left unwatered for a day only looks wilted, still grows, and one watering perks it up", () => {
  const s = planted("tomato");
  water(s, "0,0", true, day(0));
  assert.equal(plantState(s, "0,0", day(1)).wilted, false, "the next day it's only thirsty");
  const st = plantState(s, "0,0", day(5));
  assert.ok(st.wilted && st.m === WATER_BOOST, "days later: wilted, its growth kept");
  assert.deepEqual(grow(s, 1, day(5)), { "0,0": 1 }, "a wilted plant still grows");
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
  const s = planted("basil"); // (all year: ripe at 50, gives 2 or 3)
  assert.match(harvest(s, "0,0", Math.random, day(0)), /isn't ripe/);
  grow(s, 50, day(1));
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
  for (const k of ['"plant"', '"dig"']) assert.ok(card.includes(`kind: ${k}`), `its own moment: ${k}`);
  assert.ok(card.includes('kind: correct ? "water" : "drizzle"'), "a right watering's splash, a wrong one's drizzle (a full watering either way)");
});

test("the farm by its entrance: the field just west of the barn and the buildings, growing west, its spots staying put", () => {
  assert.ok(FARM_IN.x >= BARN.x0 * 16, "you come in at the right, below the barn");
  for (const b of BUILD_SPOTS) assert.ok(b.x > (FIELD.right + 1) * 16 && FARM_IN.x - b.x < 160, "the buildings' spots are between the pen and the way in");
  assert.ok(Math.abs(SEED_STAND.x - (FIELD.right + 1) * 16) < 40 && Math.abs(SEED_STAND.y - GAP_ROW * 16) < 56, "the seed stand right in front of the pen's entrance");
  assert.ok(FARM_IN.x - (FIELD.right + 1) * 16 < 320 - 32, "the field is in view as you come in (the window is 320 across)");
  assert.ok(fieldLeft(12) < fieldLeft(3), "a bigger field reaches further west");
  assert.deepEqual(spotXY(0, 0), { x: FIELD.right * 16 + 8, y: FIELD.y * 16 + 8 }, "spot 0,0 is the field's top right whatever its size");
});

test("a question answered anywhere (the pond's, a battle's, the farm's) grows every plant: rules.answerQuestion's hook", async () => {
  const { answerQuestion, newState } = await import("../../web/js/game/rules.js");
  const s = newState();
  s.farm = { plots: { "0,0": { crop: "tomato", m: 0, days: 0, last: 0, planted: 0 }, "1,0": { crop: "basil", m: 10, days: 0, last: 0, planted: 0 } }, seeds: {}, barn: {}, fence: 0, at: 7 };
  answerQuestion(s, "w1", false, day(0)); // (wrong or right, a word studied)
  answerQuestion(s, "w2", true, day(0));
  assert.deepEqual([plantState(s, "0,0", day(0)).m, plantState(s, "1,0", day(0)).m], [2, 12]);
  assert.equal(s.farm.at, 7, "growth isn't stamped as a farm change (merge.js keeps each plant's higher maturity)");
  assert.match(src("game.js"), /const grown = grow\(g, 1\);[\s\S]*ungrow\(g, grown\)/, "a flashcard grows the farm too, and its Undo takes it back");
});
