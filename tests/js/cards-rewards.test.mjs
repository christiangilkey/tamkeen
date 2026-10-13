// Run with: node --test tests/js/
// What flashcards and battles are each worth, and the one bonus that joins them. They are paid
// apart on purpose (the owner's rule): battles in coins, flashcards in glow, no shared counters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOTH_COINS, BOTH_XP, REVIEW_CLEAR_CARDS, earn, finishBattle, newState } from "../../web/js/game/rules.js";
import { CARDS_GLOW_MIN, build, cardsGlow, garden, tick, totalRate } from "../../web/js/game/idle.js";

const at = (iso) => new Date(iso);
const NOW = at("2026-10-12T10:00:00");
const common = () => { let i = 0; return () => [0.1, 0.5][i++ % 2]; }; // every roll is a common 10 XP
/** Answer `n` cards; the last one reports that nothing is left due. Returns the last result. */
function clearCards(state, n = REVIEW_CLEAR_CARDS, now = NOW) {
  let last = null;
  for (let i = 0; i < n; i++) last = earn(state, { type: "review", cleared: i === n - 1 }, { rand: common(), now });
  return last;
}
const wonBattle = (state, now = NOW) => finishBattle(state, { mode: "wild", won: true }, { now, rand: () => 0.99 });

test("clearing the day's flashcards pays glow, once a day, and never coins", () => {
  const s = newState(31);
  const g = garden(s);
  const before = g.glow;
  assert.equal(cardsGlow(s, NOW), 0, "nothing before the cards are cleared");
  const coins = s.coins;
  const last = clearCards(s);
  assert.ok(last.cleared);
  assert.equal(s.coins, coins, "flashcards never pay coins");
  assert.equal(cardsGlow(s, NOW), CARDS_GLOW_MIN, "with nothing built, the floor");
  assert.equal(g.glow, before + CARDS_GLOW_MIN);
  assert.equal(cardsGlow(s, NOW), 0, "once a day");
  earn(s, { type: "review", cleared: true }, { rand: common(), now: NOW });
  assert.equal(cardsGlow(s, NOW), 0);

  // The next day, with a building standing, it is an hour of what the garden makes.
  const tomorrow = at("2026-10-13T10:00:00");
  g.plots[0].open = true;
  g.glow = 1000;
  assert.equal(build(s, 0, "word_sprout"), "");
  tick(s, tomorrow);
  for (const p of g.plots) p.stored = 0;
  clearCards(s, REVIEW_CLEAR_CARDS, tomorrow);
  const hour = Math.round(totalRate(s, tomorrow));
  const had = g.glow;
  assert.equal(cardsGlow(s, tomorrow), Math.max(CARDS_GLOW_MIN, hour));
  assert.equal(g.glow, had + Math.max(CARDS_GLOW_MIN, hour));
});

test("too few cards clear nothing, so an empty deck pays no glow", () => {
  const s = newState(32);
  const last = clearCards(s, REVIEW_CLEAR_CARDS - 1);
  assert.ok(!last.cleared);
  assert.equal(cardsGlow(s, NOW), 0);
});

test("a battle and cleared flashcards on one day pay a bonus once, whichever comes second", () => {
  // Cards first, then the battle: the battle's result carries the bonus, apart from its own pay.
  const a = newState(33);
  assert.equal(clearCards(a).both, undefined, "the cards alone are not both");
  const coins = a.coins;
  const xp = a.xp;
  const pay = wonBattle(a);
  assert.deepEqual([pay.both.xp, pay.both.coins], [BOTH_XP, BOTH_COINS]);
  assert.deepEqual([pay.xp, pay.coins], [40, 4], "the battle's own pay is unchanged");
  assert.equal(a.coins, coins + 4 + BOTH_COINS);
  assert.equal(a.xp, xp + 40 + BOTH_XP);
  assert.equal(wonBattle(a).both, null, "once a day");

  // The battle first, then the cards: the last card carries it, inside its XP.
  const b = newState(34);
  assert.equal(wonBattle(b).both, null, "the battle alone is not both");
  const before = { coins: b.coins, xp: b.xp };
  let earned = 0;
  let last = null;
  for (let i = 0; i < REVIEW_CLEAR_CARDS; i++) {
    last = earn(b, { type: "review", cleared: i === REVIEW_CLEAR_CARDS - 1 }, { rand: common(), now: NOW });
    earned += last.xp;
  }
  assert.deepEqual([last.both.xp, last.both.coins], [BOTH_XP, BOTH_COINS]);
  assert.equal(b.coins, before.coins + BOTH_COINS);
  assert.equal(b.xp, before.xp + earned, "what the cards reported is exactly what was given");
  assert.equal(earned, REVIEW_CLEAR_CARDS * 3 + BOTH_XP, "five common cards at 3 XP each, plus the bonus");

  // A new day starts the pair again.
  const tomorrow = at("2026-10-13T09:00:00");
  assert.equal(wonBattle(b, tomorrow).both, null);
  assert.ok(clearCards(b, REVIEW_CLEAR_CARDS, tomorrow).both);
});

test("flashcards and battles keep separate counts", () => {
  const s = newState(35);
  clearCards(s, 8);
  assert.deepEqual([s.day.cards, s.stats.cards], [8, 8]);
  assert.deepEqual([s.day.reviews, s.stats.reviews, s.stats.right, s.week.total, s.day.battles], [0, 0, 0, 0, 0]);
  wonBattle(s);
  assert.deepEqual([s.day.cards, s.stats.cards, s.day.battles], [8, 8, 1]);
});
