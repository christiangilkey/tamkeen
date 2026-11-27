// The farm's upgrades, decorations, Cropdex and harvest board (prototype "farm", slice 5 of
// tamkeen-plans/farming-plan.md): upgrades bought with glow, the sprinkler EARNED, decorations with no power, a
// friends-only weekly board (supabase/v20-farm.sql), and the four old buildings redrawn without neon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  BARN_CAP, DECOR, SPRINKLER_DAYS, UPGRADES, barnCap, buyDecor, buySeeds, buyUpgrade, decorOn, farmOf, grind, harvest, level,
  placeDecor, plant, plantState, publicFarm, removeDecor, sprinklerOn, underGlass, upgradeCost, water, waterAround, farmJobs,
} from "../../web/js/game/farm.js";
import { have } from "../../web/js/game/farmuses.js";
import { cleanFarm, cleanProfile } from "../../web/js/game/remote.js";
import { dayKey } from "../../web/js/game/rules.js";

const day = (n) => new Date(2026, 10, 23 + n, 12); // a summer week
const game = () => { const s = { review: {}, stats: {}, day: { key: dayKey(day(0)) }, items: {}, roster: [], idle: { glow: 1e6, plots: [] } }; farmOf(s); return s; };

test("upgrades: bought with glow, level by level, each saying what it does; the sprinkler isn't for sale", () => {
  const s = game();
  for (const u of UPGRADES) assert.ok(u.text && u.cost.length, u.id);
  assert.ok(!UPGRADES.some((u) => u.id === "sprinkler"));
  assert.equal(buyUpgrade(s, s.idle, "can"), "");
  assert.equal(level(s, "can"), 1);
  assert.equal(upgradeCost(s, "can"), UPGRADES[0].cost[1]);
  buyUpgrade(s, s.idle, "can");
  assert.match(buyUpgrade(s, s.idle, "can"), /as far as it goes/);
  s.idle.glow = 1;
  assert.match(buyUpgrade(s, s.idle, "windmill"), /more glow/);
});

test("the watering can waters a right answer's thirsty neighbours; the greenhouse's row grows out of season", () => {
  const s = game();
  buySeeds(s, s.idle, "wheat", 3, day(0));
  for (const k of ["1,1", "2,1", "1,2"]) plant(s, k, "wheat", day(0));
  buyUpgrade(s, s.idle, "can");
  water(s, "1,1", true, day(0));
  assert.deepEqual(waterAround(s, "1,1", day(0)), ["2,1"], "one neighbour at the first level");
  assert.equal(plantState(s, "2,1", day(0)).watered, true);
  s.farm.seeds.melon = 1; // (a summer crop's seed, kept)
  const winter = day(14);
  assert.match(plant(s, "0,1", "melon", winter), /out of season/);
  buyUpgrade(s, s.idle, "greenhouse");
  assert.ok(underGlass(s, "3,0") && !underGlass(s, "3,1"));
  assert.equal(plant(s, "0,0", "melon", winter), "");
  assert.equal(plantState(s, "0,0", winter).resting, false, "under glass it grows");
});

test("the barn has room; a full barn waits (the ripe crop stays ripe); a bigger barn holds more", () => {
  const s = game();
  assert.equal(barnCap(s), BARN_CAP[0]);
  s.farm.barn = { "tomato:0": BARN_CAP[0] };
  buySeeds(s, s.idle, "basil", 1, day(0));
  plant(s, "0,0", "basil", day(0));
  water(s, "0,0", true, day(0));
  water(s, "0,0", true, day(1));
  assert.match(harvest(s, "0,0", Math.random, day(1)), /barn is full/);
  assert.equal(plantState(s, "0,0", day(1)).ripe, true);
  buyUpgrade(s, s.idle, "barn");
  assert.equal(typeof harvest(s, "0,0", Math.random, day(1)), "object");
  assert.equal(publicFarm(s, day(1)).n > 0, true, "this week's harvests counted");
});

test("the windmill grinds wheat into flour; flour counts as two grain in the Cookbook", () => {
  const s = game();
  s.farm.barn = { "wheat:0": 3 };
  assert.match(grind(s, 3), /windmill first/);
  buyUpgrade(s, s.idle, "windmill");
  assert.equal(grind(s, 3), 3);
  assert.equal(s.farm.flour, 3);
  assert.equal(have(s, "grain"), 6);
});

test("the sprinkler is earned by watering on many days; then nothing wilts, and it waters two plants a day", () => {
  const s = game();
  buySeeds(s, s.idle, "basil", 3, day(0));
  for (const k of ["0,0", "1,0", "2,0"]) plant(s, k, "basil", day(0));
  for (let d = 0; d < SPRINKLER_DAYS - 1; d++) { const k = ["0,0", "1,0", "2,0"][d % 3]; s.farm.plots[k] = { crop: "basil", days: 0, last: 0, planted: 0 }; water(s, k, true, day(d)); }
  assert.equal(sprinklerOn(s), false);
  water(s, "0,0", true, day(SPRINKLER_DAYS));
  s.farm.plots["1,0"] = { crop: "basil", days: 0, last: 0, planted: 0 };
  s.farm.plots["2,0"] = { crop: "basil", days: 0, last: 0, planted: 0 };
  assert.equal(sprinklerOn(s), true);
  const later = day(SPRINKLER_DAYS + 3);
  assert.equal(plantState(s, "1,0", later).wilted, false, "no wilting with the sprinkler");
  assert.equal(farmJobs(s, Math.random, later).watered.length, 2);
});

test("decorations: bought with glow, placed on open grass, moved, put away for half back; no power", () => {
  const s = game();
  for (const d of DECOR) assert.ok(d.cost > 0 && (d.prop || d.art), d.id);
  assert.equal(buyDecor(s, s.idle, "bench"), "");
  const [d] = decorOn(s);
  assert.match(placeDecor(s, d.i, 25 * 16 + 8, 40), /can't stand/, "not in the field");
  assert.equal(placeDecor(s, d.i, 60, 120), "");
  const glow = s.idle.glow;
  assert.equal(removeDecor(s, s.idle, d.i), 75);
  assert.equal(s.idle.glow, glow + 75);
  assert.equal(decorOn(s).length, 0);
});

test("the harvest board: what friends get is checked on arrival, numbers only (remote.cleanFarm); the SQL file adds one column", () => {
  assert.deepEqual(cleanFarm({ week: 2969, n: 12, best: { c: "pumpkin", t: 4 }, size: [5, 3], dex: 9, words: ["secret"] }),
    { week: 2969, n: 12, best: { c: "pumpkin", t: 4 }, size: [5, 3], dex: 9 });
  assert.equal(cleanFarm("nope"), null);
  assert.equal(cleanFarm({ best: { c: "<script>", t: 99 } }).best, null);
  assert.ok("farm" in cleanProfile({ team: [] }));
  const sql = readFileSync(new URL("../../supabase/v20-farm.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("add column if not exists farm jsonb") && sql.includes("private.valid_farm"));
  const social = readFileSync(new URL("../../web/js/social.js", import.meta.url), "utf8");
  assert.ok(social.includes("const { farm, ...v19 } = row;"), "an older database: the row without the farm");
});

test("the four old buildings are redrawn in the cozy look, with their sources; the farm's new pictures exist", () => {
  for (const id of ["word_sprout", "echo_shell", "page_lantern", "memory_stone"]) for (const t of [1, 2, 3]) {
    assert.ok(existsSync(new URL(`../../game/art-src/structure/${id}_${t}.aseprite`, import.meta.url)), `${id}_${t}`);
  }
  for (const f of ["windmill", "compost", "sprinkler", "weathervane", "stones", "glass", "upgrades"]) {
    assert.ok(existsSync(new URL(`../../web/game-art/farm/${f}.png`, import.meta.url)), f);
  }
});
