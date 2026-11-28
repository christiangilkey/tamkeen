// The garden's buildings on the farm (prototype "farm", slice 2 of tamkeen-plans/farming-plan.md): no plots; each
// building opens by its own milestone (or a key), stands anywhere on the farm, and does a farm job matched to its study
// habit. Old saves keep their buildings at their tiers; the Ink Well is the Spelling Bee Hive there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// (prototype mode on, as on the owner's devices: feature("farm") is true)
globalThis.localStorage = { getItem: (k) => (k === "tamkeenPrototype" ? "1" : null), setItem() {}, removeItem() {} };

const { buildOptions, buildingName, structureArt } = await import("../../web/js/game/sections.js");
const { build, garden, useKey } = await import("../../web/js/game/idle.js");
const {
  ECHO_EVERY, ECHO_GROW, GROW_PER_WORD, LANTERN_GROW, SPROUT_EVERY, WATER_BOOST, beesToday, buildingsOn, buySeeds, farmJobs, grow,
  harvest, nearTier, placeBuilding, plant, plantState, stoneLuck, water,
} = await import("../../web/js/game/farm.js");
const { BUILD_SPOTS, canPlace, spotXY } = await import("../../web/js/game/farmmap.js");
const { dayKey } = await import("../../web/js/game/rules.js");

const day = (n) => new Date(2026, 10, 23 + n, 12); // Monday 23 November 2026 (a summer week)
function game(plots = []) {
  const s = { review: {}, stats: { lookups: 0, goals: 0, words: 0 }, day: { key: dayKey(day(0)), saves: 0 }, items: {}, roster: [], best_streak: 0,
    creature: { traits: {} }, idle: { glow: 1e6, plots } };
  garden(s);
  return s;
}
const slot = (id, tier, at) => ({ open: true, id, tier, stored: 0, ...(at ? { at } : {}) });

test("with the farm: no plots to open; each building by its own milestone or a key; no Star Loom; the Ink Well is the Spelling Bee Hive", () => {
  const s = game();
  const opts = buildOptions(s, 3);
  assert.ok(!opts.some((o) => o.id === "star_loom"), "the Star Loom folds into the shrine");
  assert.equal(opts.find((o) => o.id === "ink_well").name, "Spelling Bee Hive");
  assert.equal(structureArt("ink_well", 2).file, "farm/bee_hive_2.png");
  assert.equal(buildingName({ id: "word_sprout", name: "Word Sprout" }), "Word Sprout");
  assert.equal(build(s, 3, "word_sprout"), "", "a closed plot doesn't matter on the farm");
  assert.match(build(s, 4, "echo_shell"), /Not yet/);
  assert.match(build(s, 4, "star_loom"), /doesn't exist/);
  assert.equal(opts.find((o) => o.id === "echo_shell").key, false, "no key held");
  s.items.key = 1;
  assert.equal(useKey(s, "echo_shell"), "");
  assert.deepEqual(garden(s).keyed, ["echo_shell"]);
  assert.equal(build(s, 4, "echo_shell"), "", "a key skips the building's milestone");
  assert.match(useKey(s, "echo_shell"), /open already|no key/);
});

test("an old save keeps its buildings at their tiers, each in its slot's spot on the farm until moved", () => {
  const s = game([slot("word_sprout", 3), slot("ink_well", 2), slot("star_loom", 1), slot(null, 0)]);
  const on = buildingsOn(s);
  assert.deepEqual(on.map((b) => [b.id, b.tier, b.x, b.y]), [["word_sprout", 3, BUILD_SPOTS[0].x, BUILD_SPOTS[0].y], ["ink_well", 2, BUILD_SPOTS[1].x, BUILD_SPOTS[1].y]],
    "the Star Loom isn't on the farm (the shrine, slice 3)");
  for (const p of BUILD_SPOTS) assert.ok(canPlace(p.x, p.y, []), `a default spot is open: ${p.x},${p.y}`);
});

test("moving a building: never into the field (as big as it can grow), the barn, or on another building", () => {
  const s = game([slot("word_sprout", 1), slot("echo_shell", 1)]);
  const field = spotXY(5, 3);
  assert.match(placeBuilding(s, 0, field.x, field.y), /can't stand/);
  assert.match(placeBuilding(s, 0, 40, 30), /can't stand/, "the barn");
  assert.match(placeBuilding(s, 0, BUILD_SPOTS[1].x + 5, BUILD_SPOTS[1].y), /can't stand/, "on top of the other");
  assert.equal(placeBuilding(s, 0, 520, 110), "");
  assert.deepEqual(s.idle.plots[0].at, { x: 520, y: 110 });
  assert.match(placeBuilding(s, 5, 400, 100), /no building/);
});

test("Word Sprout: lookups drop seeds of this week's crops, a few a day; lookups from before it stood don't count", () => {
  const s = game();
  s.stats.lookups = 500;
  farmJobs(s, () => 0, day(0));
  s.idle.plots[0] = slot("word_sprout", 1);
  assert.deepEqual(farmJobs(s, () => 0, day(0)).seeds, [], "the 500 from before don't count");
  s.stats.lookups += SPROUT_EVERY[1] * 10;
  assert.equal(farmJobs(s, () => 0, day(0)).seeds.length, 3, "2 + tier a day");
  s.stats.lookups += SPROUT_EVERY[1];
  assert.equal(farmJobs(s, () => 0, day(0)).seeds.length, 0);
  s.stats.lookups += SPROUT_EVERY[1];
  assert.equal(farmJobs(s, () => 0, day(1)).seeds.length, 1, "a new day");
});

test("Echo Shell: on a listening day every word grows every plant more (growth, 2026-11-28; it no longer waters)", () => {
  const s = game([slot("echo_shell", 1)]);
  buySeeds(s, s.idle, "basil", 2, day(0));
  plant(s, "0,0", "basil", day(0));
  plant(s, "1,0", "basil", day(0));
  s.day = { key: dayKey(day(3)), listen: ECHO_EVERY[1] - 5 };
  assert.deepEqual(grow(s, 1, day(3)), { "0,0": GROW_PER_WORD, "1,0": GROW_PER_WORD }, "not yet a listening day: a word's usual growth");
  s.day = { key: dayKey(day(3)), listen: ECHO_EVERY[1] + 5 };
  assert.deepEqual(grow(s, 1, day(3)), { "0,0": GROW_PER_WORD * ECHO_GROW[1], "1,0": GROW_PER_WORD * ECHO_GROW[1] });
  assert.deepEqual(farmJobs(s, Math.random, day(3)).watered, [], "the shell waters nothing itself");
});

test("Page Lantern: on a reading day plants near it grow twice as much from words and waterings; Memory Stone: better harvest luck", () => {
  const s = game([slot("page_lantern", 1, BUILD_SPOTS[0])]); // (its first spot by the entrance: beside the field's east columns)
  buySeeds(s, s.idle, "wheat", 1, day(0));
  plant(s, "0,2", "wheat", day(0));
  assert.ok(nearTier(s, "lantern", "0,2") > 0);
  s.day = { key: dayKey(day(0)), read: 600 };
  assert.equal(water(s, "0,2", true, day(0)).lantern, true);
  assert.equal(plantState(s, "0,2", day(0)).m, WATER_BOOST * LANTERN_GROW);
  assert.deepEqual(grow(s, 1, day(0)), { "0,2": GROW_PER_WORD * LANTERN_GROW });
  assert.equal(stoneLuck(game()), 1);
  assert.ok(stoneLuck(game([slot("memory_stone", 2)])) > 1.3);
});

test("Spelling Bee Hive: a bee for each word saved today; crops near it give more; saved words make honey", () => {
  const s = game([slot("ink_well", 1, { x: spotXY(0, 0).x, y: spotXY(0, 0).y + 50 })]);
  s.day = { key: dayKey(day(1)), saves: 7 };
  assert.equal(beesToday(s, day(1)), 3, "three a tier at most");
  farmJobs(s, Math.random, day(1));
  assert.equal(s.farm.honey, 1, "a jar every 6 words at tier 1");
  buySeeds(s, s.idle, "basil", 1, day(0));
  plant(s, "0,0", "basil", day(0));
  grow(s, 50, day(1)); // (basil ripens at 50: fifty words studied)
  const got = harvest(s, "0,0", () => 0, day(1));
  assert.equal(got.n, 2 + 1, "basil's least, and one more for the bees");
});

test("habitat.js: buildings on the farm (tap: collect or its card; Move it), the yard's plots gone with the farm; the Garden tile goes to the farm", () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.ok(h.includes("for (const b of buildingsOn(game))"));
  assert.ok(h.includes('window.addEventListener("tamkeen-farm-move", onMove);'));
  assert.ok(h.includes('window.removeEventListener("tamkeen-farm-move", onMove);'));
  assert.ok(!h.includes("structure/plot.png"), "the yard's old plots are gone (the buildings stand on the farm)");
  assert.ok(h.includes('teleportTo(feature("farm") ? "farm" : "fruit")'));
});

test("an old save's building or decoration standing where the new layout puts the field or the barn moves to the nearest open spot", async () => {
  const { canPlace: ok } = await import("../../web/js/game/farmmap.js");
  const s = game([slot("word_sprout", 2, { x: spotXY(1, 1).x, y: spotXY(1, 1).y })]); // (inside the field now)
  const [b] = buildingsOn(s);
  assert.ok(ok(b.x, b.y, []), "moved somewhere it can stand");
  assert.ok(Math.hypot(b.x - spotXY(1, 1).x, b.y - spotXY(1, 1).y) < 260, "near where it was");
  const fine = game([slot("word_sprout", 2, BUILD_SPOTS[2])]);
  assert.deepEqual(buildingsOn(fine).map((x) => [x.x, x.y]), [[BUILD_SPOTS[2].x, BUILD_SPOTS[2].y]], "one standing where it can stays put");
});

test("nothing on the farm overlaps: six fully grown buildings in their spots, the upgrades, the seed stand, the barn, the pen as big as it grows", async () => {
  const { BUILD_SPOTS: SPOTS, FIXED, UPGRADE_SPOTS, boxOf, buildingSize, overlaps } = await import("../../web/js/game/farmmap.js");
  const things = [
    ...SPOTS.map((p, i) => ({ id: `building${i}`, ...boxOf(p.x, p.y, buildingSize(3).w, buildingSize(3).h) })),
    ...UPGRADE_SPOTS.map((u, i) => ({ id: `upgrade${i}`, ...boxOf(u.x, u.y, u.w, u.h) })),
  ];
  const all = [...things, ...FIXED];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (i >= things.length && j >= things.length) continue; // (the fixed ones are laid out together: the stand at the pen's gap)
    assert.ok(!overlaps(all[i], all[j]), `${all[i].id} and ${all[j].id} overlap`);
  }
  const s = game([slot("word_sprout", 3), slot("echo_shell", 3), slot("page_lantern", 3), slot("ink_well", 3), slot("memory_stone", 3), slot("word_sprout", 2)]);
  const on = buildingsOn(s);
  assert.deepEqual(on.map((b) => [b.x, b.y]), SPOTS.map((p) => [p.x, p.y]), "a farm of grown buildings stands in its spots as laid out");
});
