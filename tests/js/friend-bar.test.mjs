// Run with: node --test tests/js/
// The bar next to a name in the friends list: today's XP and the favourite creature.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newGenome, describe } from "../../web/js/game/genome.js";
import { earn, newState, setShowcase, showcaseOf } from "../../web/js/game/rules.js";
import { publicProfile, showcaseGenome, xpToday } from "../../web/js/game/battle.js";

const at = (iso) => new Date(iso);

test("the showcased creature: my pick, else the one in the habitat, never an egg", () => {
  const s = newState(7);
  s.roster = [newGenome(1, "ember"), newGenome(2, "tide"), newGenome(3, "grove")];
  s.roster[0].growth = 0;      // still an egg
  s.roster[1].growth = 0.4;
  s.roster[2].growth = 0.8;
  s.active = 0;
  assert.equal(showcaseOf(s).seed, 2, "the habitat holds an egg, so the first hatched creature is shown");
  s.active = 1;
  assert.equal(showcaseOf(s).seed, 2);
  setShowcase(s, 3);
  assert.equal(showcaseOf(s).seed, 3, "my pick wins over the habitat");
  setShowcase(s, 999);
  assert.equal(s.showcase, null, "a creature I don't have can't be picked");
  setShowcase(s, 1);
  assert.equal(showcaseOf(s).seed, 2, "picking an egg falls back");
  const onlyEgg = newState(5);
  assert.equal(showcaseOf(onlyEgg), null);
  assert.equal(publicProfile(onlyEgg, null, at("2026-10-14T10:00:00")).showcase, null);
});

test("what is shared for the bar: today's XP and the favourite's look, nothing else", () => {
  const s = newState(11);
  s.roster = [newGenome(21, "dusk")];
  s.roster[0].growth = 0.5;
  s.roster[0].name = "Noor";
  const now = at("2026-10-14T10:00:00");
  for (let i = 0; i < 30; i++) earn(s, { type: "study", seconds: 5, mode: "read" }, { now });
  const p = publicProfile(s, null, now);
  assert.equal(p.xp_day, "2026-10-14");
  assert.equal(p.xp_today, Math.round(s.day.xp));
  assert.ok(p.xp_today > 0);
  assert.deepEqual(Object.keys(p.showcase).sort(), ["branch", "growth", "name", "partnerHue", "seed", "show", "type", "variant"]);
  assert.equal(p.showcase.name, "Noor");
  assert.ok(JSON.stringify(p.showcase).length < 1000);
  // The next morning, before any study, yesterday's XP is not reported as today's.
  assert.equal(publicProfile(s, null, at("2026-10-15T08:00:00")).xp_today, 0);
});

test("a friend's XP counts as today's only while it is fresh", () => {
  const now = at("2026-10-14T20:00:00");
  const row = (xp_day, hoursAgo, xp_today = 120) => ({ xp_day, xp_today, updated_at: new Date(now.getTime() - hoursAgo * 3600000).toISOString() });
  assert.equal(xpToday(row("2026-10-14", 30), now), 120, "same calendar day");
  assert.equal(xpToday(row("2026-10-15", 1), now), 120, "a friend ahead of me in time");
  assert.equal(xpToday(row("2026-10-13", 2), now), 120, "a friend behind me in time, just now");
  assert.equal(xpToday(row("2026-10-13", 20), now), 0, "yesterday's number");
  assert.equal(xpToday(row("2026-10-10", 1), now), 0);
  assert.equal(xpToday({ league: 1 }, now), 0, "a profile from an older app");
  assert.equal(xpToday(null, now), 0);
});

test("a friend's showcased creature is checked before it is drawn", () => {
  const good = showcaseGenome({ showcase: { seed: 21, type: "dusk", growth: 0.8, branch: "sage", variant: null, name: "Noor" } });
  assert.equal(good.seed, 21);
  assert.equal(good.name, "Noor");
  assert.ok(describe(good), "it can be drawn");
  assert.equal(showcaseGenome({ showcase: null }), null);
  assert.equal(showcaseGenome({}), null);
  assert.equal(showcaseGenome({ showcase: { seed: "x", growth: 0.5 } }), null);
  assert.equal(showcaseGenome({ showcase: { seed: 3, growth: 0 } }), null, "an egg is not a showcase");
  const odd = showcaseGenome({ showcase: { seed: 3, growth: 99, name: "x".repeat(200), branch: 5, traits: { hack: 1 } } });
  assert.equal(odd.growth, 1);
  assert.equal(odd.name.length, 20);
  assert.equal(odd.branch, null);
  assert.ok(!("hack" in odd.traits), "only the fields the app shares are read");
});
