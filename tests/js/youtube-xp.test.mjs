// Run with: node --test tests/js/
// Watching YouTube earns no XP (YouTube API policy III.F.3 forbids rewarding people for watching; the
// owner's choice, 2026-11-06): time on a YouTube video gives no XP, no goal minutes, no goal streak
// or league day. Looking up and saving words while watching still pays, and other listening
// (podcasts, Netflix, reels, your own files) keeps its time-based XP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UNPAID_TIME, earn, newState } from "../../web/js/game/rules.js";

const now = new Date("2026-11-06T10:00:00");
/** Report `minutes` of listening, as the player's 5-second ticks. */
function listen(s, minutes, source = undefined) {
  const out = [];
  for (let i = 0; i < minutes * 12; i++) out.push(earn(s, { type: "study", seconds: 5, mode: "listen", ...(source ? { source } : {}) }, { now }));
  return out;
}

test("time on a YouTube video earns nothing: no XP, no goal minutes, no goal streak, no habit", () => {
  const s = newState(4);
  const before = { xp: s.xp, coins: s.coins, streak: s.streak, traits: { ...s.creature.traits } };
  const results = listen(s, 30, "youtube");
  assert.ok(results.every((r) => r === null), "nothing is earned");
  assert.equal(s.day.seconds, 0, "no minutes toward the daily goal");
  assert.equal(s.day.done, false, "the goal isn't reached by watching");
  assert.deepEqual({ xp: s.xp, coins: s.coins, streak: s.streak, traits: { ...s.creature.traits } }, before);
  assert.equal(s.goalWeek.days || 0, 0, "no league day");
  assert.ok(UNPAID_TIME.has("youtube"));
});

test("podcasts, Netflix, reels and your own files keep their listening XP", () => {
  const s = newState(4);
  const results = listen(s, 30);
  assert.ok(results.some((r) => r && r.xp > 0), "listening still pays a trickle");
  assert.ok(results.some((r) => r && r.goalDone), "and reaches the daily goal");
  assert.equal(s.day.done, true);
  assert.ok(s.xp > 0);
});

test("looking words up and saving them while watching YouTube still pay", () => {
  const s = newState(4);
  listen(s, 5, "youtube");
  const word = earn(s, { type: "word", key: "ar:كلمة" }, { now, rand: () => 0.5 });
  assert.ok(word && word.xp > 0, "a word looked up pays");
  const save = earn(s, { type: "save" }, { now });
  assert.ok(save && save.xp > 0, "a word saved pays");
});

test("the player tells the game which videos are YouTube's", () => {
  const src = readFileSync(new URL("../../web/js/pages/player.js", import.meta.url), "utf8");
  assert.match(src, /trackStudy\("listen", \(\) => !audio\.paused, yt \? "youtube" : null\)/);
  const game = readFileSync(new URL("../../web/js/game/game.js", import.meta.url), "utf8");
  assert.match(game, /if \(UNPAID_TIME\.has\(source\)\) return \(\) => \{\};/, "and then counts nothing for them");
  // Reels are Instagram's, not YouTube's: they keep their time.
  const reels = readFileSync(new URL("../../web/js/pages/reels.js", import.meta.url), "utf8");
  assert.match(reels, /trackStudy\("listen", \(\) => playing\)/);
});
