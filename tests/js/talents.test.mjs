// Run with: node --test tests/js/
// Creature talents (web/js/game/talents.js, prototype "talents"): rolled from the seed, graded C..S (a 1..5 star total
// is kept inside only, for the "Perfect talent" badge: no stars are shown); they count only in battles against the game,
// and in battles between people (friends, ranked) everyone is evened out, whatever a device sends.
import { test } from "node:test";
import assert from "node:assert/strict";

// Prototype mode on (talents are a prototype): the battle tests must show talents add nothing between people even then.
const store = new Map([["tamkeenPrototype", "1"]]);
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { newGenome } = await import("../../web/js/game/genome.js");
const T = await import("../../web/js/game/talents.js");
const { fighter, fighters, friendTeam, publicProfile } = await import("../../web/js/game/battle.js");
const { cleanGenome, cleanTeam } = await import("../../web/js/game/remote.js");
const { teamFrom } = await import("../../web/js/game/rankedlive.js");
const { newState, layEgg, checkBadges } = await import("../../web/js/game/rules.js");
const { release, garden } = await import("../../web/js/game/idle.js");
const { combine } = await import("../../web/js/game/merge.js");

const hatched = (seed, extra = {}) => ({ ...newGenome(seed, "ember"), growth: 0.9, loadout: ["tackle"], ...extra });
/** The first seed from `from` whose creature has `stars` stars. */
function seedWith(stars, from = 1) {
  for (let s = from; s < from + 200000; s++) if (T.starsOf({ seed: s }) === stars) return s;
  throw new Error("none");
}
const FIVE = seedWith(5);
const ONE = seedWith(1);
const strengths = (f) => ({ max: f.max, atk: f.atk, def: f.def, spd: f.spd });

test("talents come from the seed alone: the same on every device, 0..15 each, graded C..S, 1..5 stars", () => {
  const a = T.talentsOf({ seed: 12345 });
  assert.deepEqual(a, T.talentsOf({ ...newGenome(12345), growth: 0.7, name: "Pip" }));
  for (let s = 1; s < 3000; s++) {
    const t = T.talentsOf({ seed: s });
    for (const k of T.STRENGTHS) assert.ok(Number.isInteger(t[k]) && t[k] >= 0 && t[k] <= 15);
    const n = T.starsOf({ seed: s });
    assert.ok(n >= 1 && n <= 5);
  }
  assert.equal(T.gradeOf(15), "S"); assert.equal(T.gradeOf(14), "S"); assert.equal(T.gradeOf(13), "A");
  assert.equal(T.gradeOf(10), "A"); assert.equal(T.gradeOf(9), "B"); assert.equal(T.gradeOf(6), "B"); assert.equal(T.gradeOf(0), "C");
});

test("5 stars are rare with no help (about 1 in 135) and commoner with earned help", () => {
  const share = (extra) => { let n = 0; for (let s = 1; s <= 40000; s++) if (T.starsOf({ seed: s, ...extra }) === 5) n++; return n / 40000; };
  const plain = share({});
  assert.ok(plain > 0.003 && plain < 0.015, String(plain));
  assert.ok(share({ tf: T.TF_MAX }) > plain * 4);
});

test("against the game a 5-star creature is stronger, by at most 15% a strength; never before hatching", () => {
  const g = hatched(FIVE);
  const plain = fighter(newState(1), g, { talents: false });
  const boosted = fighter(newState(1), g, { vsGame: true });
  assert.ok(boosted.atk > plain.atk && boosted.max > plain.max);
  for (const k of ["max", "atk", "def", "spd"]) assert.ok(boosted[k] <= plain[k] * 1.15 + 1, k);
  // prototype off: as before
  assert.deepEqual(strengths(fighter(newState(1), g, { vsGame: true, talents: false })), strengths(plain));
  // an egg has no talents in a battle (and can't fight anyway)
  assert.deepEqual(T.battleBoost({ seed: FIVE, growth: 0 }, { vsGame: true, on: true }), { hp: 1, atk: 1, def: 1, spd: 1 });
});

test("friend battles: my own talented creatures and a friend's are evened out (talents add nothing)", () => {
  const state = newState(1);
  const five = hatched(FIVE), one = hatched(ONE);
  // my side of a friend battle (battle-ui startFriendBattle: no vsGame)
  const mine5 = fighter(state, five, { rule: null, fed: new Date() });
  assert.deepEqual(strengths(mine5), strengths(fighter(state, five, { talents: false })));
  // two creatures of the same kind, one 5-star and one 1-star: what decides is only their kind and growth
  const kindOf = (s) => fighter(state, hatched(s), { talents: false });
  assert.deepEqual(strengths(fighter(state, five)), strengths(kindOf(FIVE)));
  assert.deepEqual(strengths(fighter(state, one)), strengths(kindOf(ONE)));
  // the friend's side, as it arrives: checked by remote.js, made without the owner's state
  const theirs = fighters(null, friendTeam({ team: cleanTeam([five]) }, null), { rule: null });
  assert.deepEqual(strengths(theirs[0]), strengths(fighter(null, hatched(FIVE), { talents: false })));
  // even if a device asks for vsGame for a friend's creature, a creature with no owner's state gets nothing
  assert.deepEqual(strengths(fighter(null, five, { vsGame: true })), strengths(theirs[0]));
});

test("ranked battles: a faked perfect creature gains nothing (the team is checked and evened out)", () => {
  const honest = hatched(ONE);
  // a hacked device sends its creature with every talent field it can think of at the top
  const faked = { ...hatched(ONE), tf: 99, tg: { s: "atk", p: 1e9, from: 1 }, talents: { hp: 15, atk: 15, def: 15, spd: 15 }, stars: 5, atk: 9999, hp: 9999 };
  const [a] = teamFrom([honest]);
  const [b] = teamFrom([faked]);
  assert.deepEqual(strengths(b), strengths(a));
  // and the faked extras never even arrive: a friend's creature is read field by field (remote.js)
  const clean = cleanGenome(faked);
  for (const k of ["tf", "tg", "talents", "stars", "atk", "hp"]) assert.equal(clean[k], undefined, k);
});

test("nothing about talents is shared with friends (no stars, no mark: the owner, 2026-11-26)", () => {
  const s = newState(1);
  s.roster = [hatched(FIVE, { tf: 0.4, tg: { s: "def", p: 15, from: 7 } })];
  s.showcase = s.roster[0].seed;
  const p = publicProfile(s, null);
  for (const g of [p.team[0], p.showcase]) for (const k of ["tf", "tg"]) assert.equal(g[k], undefined, k);
});

test("stardust raises new eggs' lowest roll; a release passes its best talent to the next egg only", () => {
  const s = newState(1);
  s.roster = [hatched(FIVE, { growth: 1 })];
  garden(s).stardust = 2;
  const egg = layEgg(s, () => 0.3);
  assert.equal(egg.tf, T.stardustFloor(2));
  assert.equal(egg.tg, undefined); // nothing released yet
  // release the grown creature: its best talent waits for the next egg, and eggs not hatched get the new stardust
  const best = T.bestOf(s.roster[0]);
  const r = release(s, 0, () => 0.4);
  assert.ok(r.stardust >= 1);
  assert.deepEqual(garden(s).released.at(-1).best, best);
  assert.equal(egg.tf, T.stardustFloor(garden(s).stardust));
  const next = layEgg(s, () => 0.6);
  assert.deepEqual(next.tg, { ...best, from: FIVE });
  assert.ok(T.talentsOf(next)[best.s] >= best.p);
  const after = layEgg(s, () => 0.7);
  assert.equal(after.tg, undefined); // only the next one
});

test("a release that leaves no creature lays an egg with the released one's best talent", () => {
  const s = newState(2);
  s.roster = [hatched(FIVE, { growth: 1 })];
  const best = T.bestOf(s.roster[0]);
  release(s, 0, () => 0.5);
  assert.equal(s.roster.length, 1);
  assert.deepEqual(s.roster[0].tg, { ...best, from: FIVE });
  assert.equal(s.roster[0].tf, T.stardustFloor(garden(s).stardust)); // and the stardust just gained
});

test("Warm porridge (the farm's hook) raises one egg's lowest roll, up to the most, never a hatched creature", () => {
  const s = newState(3);
  s.roster = [hatched(5), { ...newGenome(77), growth: 0 }];
  assert.equal(T.warmPorridge(s, 1), "");
  assert.equal(s.roster[1].tf, T.PORRIDGE_FLOOR);
  for (let i = 0; i < 10; i++) T.warmPorridge(s, 1);
  assert.equal(s.roster[1].tf, T.TF_MAX);
  assert.match(T.warmPorridge(s, 1), /warmer/);
  assert.match(T.warmPorridge(s, 0), /Only an egg/);
  assert.match(T.warmPorridge(s, 9), /isn't in your roster/);
  // the lowest roll is never lower than without it
  for (const k of T.STRENGTHS) assert.ok(T.talentsOf(s.roster[1])[k] >= T.talentsOf({ seed: 77 })[k]);
});

test("merging two copies keeps an egg's higher lowest roll", () => {
  const a = { xp: 90, updated_at: 90, clock: { a: 4 }, roster: [{ seed: 1, growth: 0.6 }, { seed: 2, growth: 0.05, tf: 0.1 }] };
  const b = { xp: 30, updated_at: 30, clock: { b: 2 }, roster: [{ seed: 1, growth: 0.6 }, { seed: 2, growth: 0.02, tf: 0.3 }] };
  const m = combine(a, b);
  assert.equal(m.roster[1].tf, 0.3);
  assert.equal(m.roster[1].growth, 0.05);
});

test("top talents in everything earn the quiet Perfect talent badge (prototype on)", () => {
  const s = newState(4);
  s.roster = [hatched(FIVE)];
  assert.ok(checkBadges(s).includes("five_star"));
  const t = newState(5);
  t.roster = [hatched(ONE)];
  assert.ok(!checkBadges(t).includes("five_star"));
});
