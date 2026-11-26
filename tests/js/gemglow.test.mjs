// Gems for glow (prototype "gem_glow", web/js/game/idle.js buyGemWithGlow; Supplies' Gems block in garden.js): the
// owner's "B" of 2026-11-25: the day's first gem 5,000 glow, each more that day twice the one before, starting again
// each day. Two devices keep the day's count with its date and merge by the higher count (tests/fixtures/game_merge.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GEM_GLOW, buyGemWithGlow, garden, gemGlowPrice, gemsBoughtToday } from "../../web/js/game/idle.js";
import { PROTOTYPES } from "../../web/js/prototype.js";

const day1 = new Date(2026, 10, 25, 10), later1 = new Date(2026, 10, 25, 22), day2 = new Date(2026, 10, 26, 8);
const fresh = (glow) => { const s = { gems: 0, idle: { glow } }; garden(s); return s; };

test("the day's first gem costs 5,000 glow, then each one twice the one before", () => {
  const s = fresh(100000);
  assert.equal(GEM_GLOW, 5000);
  assert.equal(gemGlowPrice(s, day1), 5000);
  assert.equal(gemGlowPrice(s, day1, 1), 10000, "the next one, shown under the price");
  const paid = [];
  for (let i = 0; i < 4; i++) {
    const before = s.idle.glow;
    assert.equal(buyGemWithGlow(s, day1), "");
    paid.push(before - s.idle.glow);
  }
  assert.deepEqual(paid, [5000, 10000, 20000, 40000]);
  assert.equal(s.gems, 4);
  assert.equal(gemsBoughtToday(s, later1), 4);
  assert.deepEqual(s.idle.gemBuys, { day: s.idle.gemBuys.day, n: 4 });
});

test("not enough glow: nothing is spent; the next day the price starts again", () => {
  const s = fresh(14000);
  assert.equal(buyGemWithGlow(s, day1), "");
  assert.equal(s.idle.glow, 9000);
  assert.match(buyGemWithGlow(s, day1), /You need 1000 more glow\./);
  assert.equal(s.idle.glow, 9000);
  assert.equal(s.gems, 1);
  assert.equal(gemGlowPrice(s, day2), 5000);
  assert.equal(buyGemWithGlow(s, day2), "");
  assert.equal(s.idle.glow, 4000);
  assert.equal(gemsBoughtToday(s, day2), 1);
});

test("a prototype; the Gems block and the popups' lines only show while it is on", () => {
  assert.equal(PROTOTYPES.gem_glow.released, false);
  const src = (f) => readFileSync(new URL(`../../web/js/game/${f}`, import.meta.url), "utf8");
  assert.match(src("garden.js"), /if \(feature\("gem_glow"\)\) \{\s*const b = block\("Gems"\);/);
  assert.match(src("garden.js"), /t\("Next one today: \{0\}"/);
  assert.match(src("info.js"), /const shown = \(l\) => !l\.prototype \|\| feature\(l\.prototype\)/);
});
