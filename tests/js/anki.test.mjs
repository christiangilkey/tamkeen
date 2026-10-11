// Run with: node --test tests/js/
// What Anki reviews (reported by the companion add-on) earn in the creature game.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAILY_COMPLETE_XP, earn, earnAnki, newState } from "../../web/js/game/rules.js";

const at = (iso) => new Date(iso);
const NOW = at("2026-10-11T18:00:00");
const day = (reviews, extra = {}) => ({ day: "2026-10-11", reviews, again: 0, matured: 0, due_left: 30, ...extra });

test("clearing what was due is the day's goal, the same for 20 cards or 300", () => {
  for (const count of [20, 300]) {
    const s = newState(51);
    const part = earnAnki(s, [day(count - 1, { due_left: 1 })], NOW);
    assert.equal(part.goalDone, false);
    const done = earnAnki(s, [day(count, { due_left: 0 })], NOW);
    assert.equal(done.goalDone, true);
    assert.ok(done.xp >= DAILY_COMPLETE_XP);
    assert.deepEqual([s.streak, s.day.done, s.goalWeek.days], [1, true, 1]);
    assert.equal(earnAnki(s, [day(count, { due_left: 0 })], NOW), null, "the same report twice earns nothing");
  }
  const none = newState(52);
  assert.equal(earnAnki(none, [day(0, { due_left: 0 })], NOW), null, "nothing due and nothing reviewed is not a goal reached");
});

test("volume barely pays: 1000 reviews earn little more than 60", () => {
  const few = newState(53);
  const many = newState(53);
  const a = earnAnki(few, [day(60)], NOW).xp;
  const b = earnAnki(many, [day(1000)], NOW).xp;
  assert.equal(a, 60);
  assert.ok(b < a * 1.7, `${b} for 1000 reviews`);
  // Reported in pieces or all at once comes to the same.
  const pieces = newState(53);
  let total = 0;
  for (const n of [10, 50, 61, 400, 1000]) { const r = earnAnki(pieces, [day(n)], NOW); total += r ? r.xp : 0; }
  assert.ok(Math.abs(total - b) <= 3);
});

test("cards becoming mature pay a bonus, up to ten a day", () => {
  const s = newState(54);
  const r = earnAnki(s, [day(5, { matured: 3 })], NOW);
  assert.equal(r.matured, 3);
  assert.equal(r.xp, 5 + 45);
  assert.equal(s.coins, 3);
  const more = earnAnki(s, [day(5, { matured: 40 })], NOW);
  assert.equal(more.matured, 7);
  assert.equal(earnAnki(s, [day(5, { matured: 80 })], NOW), null);
  assert.ok(s.creature.traits.collector > 0);
});

test("the goal is paid once a day, whichever way it is reached; old days give no goal", () => {
  const s = newState(55);
  for (let i = 0; i < 120; i++) earn(s, { type: "study", seconds: 5, mode: "listen" }, { now: NOW }); // ten minutes of listening
  assert.equal(s.day.done, true);
  const xp = s.xp;
  const r = earnAnki(s, [day(20, { due_left: 0 })], NOW);
  assert.equal(r.goalDone, false);
  assert.equal(s.xp - xp, 20);
  assert.equal(s.streak, 1);

  const late = newState(56);
  const old = earnAnki(late, [{ day: "2026-10-09", reviews: 30, again: 0, matured: 1, due_left: 0 }], NOW);
  assert.equal(old.goalDone, false, "a day that has passed can't be today's goal");
  assert.equal(old.xp, 30 + 15, "but its reviews and matured cards still count");
  assert.equal(late.streak, 0);
});

test("bad or old reports are ignored, and only two weeks are remembered", () => {
  const s = newState(57);
  assert.equal(earnAnki(s, null, NOW), null);
  assert.equal(earnAnki(s, [{ day: "yesterday", reviews: 50 }, null, { reviews: 5 }], NOW), null);
  const days = Array.from({ length: 20 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, reviews: 1, due_left: 3 }));
  earnAnki(s, days, NOW);
  assert.equal(Object.keys(s.anki).length, 14);
  assert.ok(JSON.stringify(s).length < 5000);
});
