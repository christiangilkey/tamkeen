// Hungry creatures (prototype "hunger"; idle.js, battle.js fighter, hunger-ui.js): a creature that hasn't eaten for
// HUNGRY_HOURS is hungry, fights at HUNGRY_STRENGTH of its attack and defence in the owner's own battles, and any
// meal ends it. Its last meal syncs (merge: the later one; tests/fixtures/game_merge.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HUNGRY_HOURS, HUNGRY_STRENGTH, feed, foodFor, hoursToHungry, isHungry, startMeals, tick } from "../../web/js/game/idle.js";
import { fighter } from "../../web/js/game/battle.js";
import { feedFish, fishingOf } from "../../web/js/game/fishing.js";
import { newState } from "../../web/js/game/rules.js";
import { PROTOTYPES } from "../../web/js/prototype.js";

const T0 = new Date("2026-11-25T09:00:00");
const later = (h) => new Date(T0.getTime() + h * 3600 * 1000);
const hatched = () => { const s = newState(61); s.creature.growth = 0.3; return s; };
/** Run `fn` with prototype mode on, as the owner's devices have it. */
function prototypeMode(fn) {
  const had = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k === "tamkeenPrototype" ? "1" : null), setItem() {}, removeItem() {} };
  try { return fn(); } finally { if (had === undefined) delete globalThis.localStorage; else globalThis.localStorage = had; }
}

test("hunger is released: everyone's creatures get hungry, with or without prototype mode", () => {
  assert.equal(PROTOTYPES.hunger.released, true, "released for everybody in v0.75.0");
  const s = hatched();
  startMeals(s, T0);
  assert.equal(isHungry(s.creature, later(100)), true, "without prototype mode too, since v0.75.0");
  prototypeMode(() => assert.equal(isHungry(s.creature, later(100)), true));
});

test("a day without a meal makes a creature hungry; any meal ends it at once", () => prototypeMode(() => {
  assert.equal(HUNGRY_HOURS, 24);
  const s = hatched();
  // an old save, or a creature just hatched: its first day counts from when hunger first sees it
  assert.equal(s.creature.fedAt, undefined);
  tick(s, T0);
  assert.equal(s.creature.fedAt, T0.getTime() / 1000);
  assert.equal(isHungry(s.creature, later(23.9)), false);
  assert.ok(Math.abs(hoursToHungry(s.creature, later(20)) - 4) < 1e-9);
  assert.equal(isHungry(s.creature, later(24)), true);
  // a meal from the Supplies page's food
  s.items.food_leaf = 1;
  const r = feed(s, "food_leaf", later(30));
  assert.equal(typeof r, "object");
  assert.equal(isHungry(s.creature, later(30)), false);
  assert.equal(isHungry(s.creature, later(53.9)), false);
  assert.equal(isHungry(s.creature, later(54)), true);
  // a fish from the basket is a meal too
  fishingOf(s).bag.push({ sp: "minnow", t: 0, cm: 5, w: 1 });
  assert.equal(typeof feedFish(s, 0, later(60)), "object");
  assert.equal(isHungry(s.creature, later(60)), false);
}));

test("eggs never get hungry, and hunger takes nothing away but strength", () => prototypeMode(() => {
  const s = newState(62);
  const egg = s.creature;
  egg.fedAt = 0;
  assert.equal(isHungry(egg, later(1000)), false);
  startMeals(s, T0);
  assert.equal(egg.fedAt, 0, "an egg's meal time is left alone");
  const c = hatched().creature;
  c.fedAt = T0.getTime() / 1000;
  const before = { growth: c.growth, bond: c.bond };
  assert.ok(isHungry(c, later(500)));
  assert.deepEqual({ growth: c.growth, bond: c.bond }, before);
}));

test("any of the owner's hatched creatures can be fed, not only the one in the habitat (the team's \"Feed first?\")", () => prototypeMode(() => {
  const s = hatched();
  const other = { ...JSON.parse(JSON.stringify(s.creature)), seed: s.creature.seed + 1, fedAt: 0, fed: null, bond: 0 };
  s.roster.push(other);
  s.items.food_cake = 2;
  assert.ok(isHungry(other, T0));
  const r = feed(s, "food_cake", T0, other.seed);
  assert.equal(typeof r, "object");
  assert.equal(isHungry(other, T0), false);
  assert.equal(other.bond, r.bond);
  assert.equal(feed(s, "food_cake", T0, 999999), "That creature isn't in your roster.");
  // the food chosen for "feed it": its favourite when there is any
  s.items = { ...s.items, food_berry: 3, food_leaf: 1 };
  const fav = { ember: "food_berry", grove: "food_leaf" };
  assert.equal(foodFor(s, { type: "grove" }).id, fav.grove);
  s.items.food_leaf = 0; s.items.food_cake = 0;
  assert.equal(foodFor(s, { type: "grove" }).id, "food_berry", "else whatever there is most of");
  for (const k of Object.keys(s.items)) if (k.startsWith("food_")) s.items[k] = 0;
  assert.equal(foodFor(s, { type: "grove" }), null);
}));

test("a hungry creature fights at 85% attack and defence in the owner's battles; a friend's fights as sent", () => {
  assert.equal(HUNGRY_STRENGTH, 0.85);
  const s = hatched();
  const g = s.creature;
  g.fedAt = T0.getTime() / 1000 - 30 * 3600;
  const full = fighter(s, g);
  const fed = prototypeMode(() => fighter(s, { ...g, fedAt: T0.getTime() / 1000 }, { fed: T0 }));
  const hungry = prototypeMode(() => fighter(s, g, { fed: T0 }));
  assert.equal(fed.hungry, false);
  assert.equal(fed.atk, full.atk);
  assert.equal(hungry.hungry, true);
  assert.ok(Math.abs(hungry.atk - full.atk * 0.85) < 1e-9);
  assert.ok(Math.abs(hungry.def - full.def * 0.85) < 1e-9);
  assert.equal(hungry.max, full.max, "its health is untouched");
  assert.equal(hungry.spd, full.spd, "and its speed");
  // the rival's side never gets `fed` (battle-ui.js, gyms-ui.js): as sent
  const src = (f) => readFileSync(new URL(`../../web/js/game/${f}`, import.meta.url), "utf8");
  for (const [file, re] of [["battle-ui.js", /fighters\(null, [^\n]*fed:/], ["gyms-ui.js", /fighters\(null, [^\n]*fed:/]]) assert.doesNotMatch(src(file), re, file);
  assert.match(src("battle-ui.js"), /fighters\(game, teamOf\(game\)[^\n]*fed: new Date\(\)/, "wild battles");
  assert.match(src("battle-ui.js"), /await feedFirst\(game, mineIdx/, "friend battles ask Feed first?");
  assert.match(src("gyms-ui.js"), /await feedFirst\(game, team/, "gyms ask Feed first?");
  assert.match(src("gyms-ui.js"), /fighters\(game, team[^\n]*fed: new Date\(\)/);
});

test("the sign shows wherever the creature is: Home, its tile and page, the battle team, the battle card", () => {
  const src = (f) => readFileSync(new URL(`../../web/js/game/${f}`, import.meta.url), "utf8");
  assert.match(src("habitat.js"), /isHungry\(game\.creature\)/);
  assert.match(src("creatures.js"), /hungrySignHtml/);
  assert.match(src("creatures.js"), /hungryButton/);
  assert.match(src("battle-ui.js"), /hungryButton/);
  assert.match(src("battle-ui.js"), /hungrySignHtml/);
  assert.match(src("livebattle-ui.js"), /Hungry: −\{0\}%/);
});
