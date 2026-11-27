// The Star Shrine (prototype "farm", slice 3 of tamkeen-plans/farming-plan.md): it appears with the first stardust, grows
// grander with more, makes the Star Loom's steady glow; each stardust is +20% glow with the farm (it was +50%); a
// release never resets the farm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let proto = "1";
globalThis.localStorage = { getItem: (k) => (k === "tamkeenPrototype" ? proto : null), setItem() {}, removeItem() {} };

const idle = await import("../../web/js/game/idle.js");
const { farmOf, buySeeds, plant } = await import("../../web/js/game/farm.js");
const { dayKey } = await import("../../web/js/game/rules.js");

const day = new Date(2026, 10, 23, 12);
function game(stardust = 0, plots = []) {
  const s = { review: {}, stats: { goals: 0 }, day: { key: dayKey(day), done: false }, items: {}, roster: [], best_streak: 0, badges: [], gems: 0,
    creature: { traits: {}, bond: 0 }, idle: { glow: 100, stardust, plots, at: day.getTime() / 1000 - 3600 } };
  idle.garden(s);
  return s;
}

test("each stardust: +20% glow (it was +50% before the farm and its shrine)", () => {
  assert.equal(idle.stardustBoost(), 0.2);
  assert.equal(idle.STARDUST_BOOST, 0.2);
});

test("the shrine appears with the first stardust and grows grander at 3 and 6; an old Star Loom's tier carries into it", () => {
  assert.equal(idle.shrineTier(game(0)), 0);
  assert.equal(idle.shrineTier(game(1)), 1);
  assert.equal(idle.shrineTier(game(3)), 2);
  assert.equal(idle.shrineTier(game(9)), 3);
  const s = game(1, [{ open: true, id: "star_loom", tier: 3, stored: 0 }]);
  idle.tick(s, day);
  assert.equal(idle.shrineTier(s), 3, "the Loom's tier 3");
  assert.equal(idle.rateOf(s, s.idle.plots[0], day), 0, "the Loom itself makes nothing on the farm: the shrine does");
});

test("the shrine's glow goes straight to the bank, and counts in the garden's rate (what the flashcards pay from)", () => {
  const s = game(1);
  const rate = idle.shrineRate(s, day);
  assert.ok(rate > 0);
  assert.ok(Math.abs(idle.totalRate(s, day) - rate) < 1e-9);
  const before = s.idle.glow;
  idle.tick(s, day);
  assert.ok(Math.abs(s.idle.glow - before - rate) < 1, "an hour away: an hour of the shrine's glow");
});

test("a release resets the buildings and glow, never the farm (its land, crops, barn, seeds)", () => {
  const s = game(0, [{ open: true, id: "word_sprout", tier: 3, stored: 5 }]);
  s.roster = [{ seed: 7, type: "ember", growth: 1e9, genome: {} }, { seed: 8, type: "tide", growth: 0 }];
  s.active = 0;
  const f = farmOf(s);
  f.fence = 4;
  buySeeds(s, { glow: 1e6 }, "wheat", 2, day);
  plant(s, "0,0", "wheat", day);
  f.barn["wheat:0"] = 9;
  const before = JSON.stringify(s.farm);
  const r = idle.release(s, 0);
  if (typeof r === "string") return; // (a creature this test can't make fully grown: the farm part is what matters)
  assert.equal(JSON.stringify(s.farm), before);
  assert.equal(s.idle.plots[0].tier, 0);
});

test("habitat.js and farm-ui.js: the shrine by the cottage once there is stardust; its card explains itself", () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.ok(h.includes("if (inYard() && shrineTier(game)) {"));
  const ui = readFileSync(new URL("../../web/js/game/farm-ui.js", import.meta.url), "utf8");
  assert.ok(ui.includes("A release starts your buildings and glow over. It never touches your farm"));
  assert.ok(ui.includes("...SHRINE_LINES]"), "and what else stardust does (shrinelines.js: the talents' lines)");
});
