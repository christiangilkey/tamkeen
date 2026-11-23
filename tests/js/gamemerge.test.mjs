// Two copies of the creature game meeting (web/js/game/merge.js): a copy that was behind (a phone not synced for days,
// a web app whose browser wiped its storage and started a new egg, a tab left open) must never wipe out the garden or
// the gym leaders beaten, as it did up to v0.68.0. The cases in tests/fixtures/game_merge.json are also run through the
// desktop's copy of the rules (app/sync/gamemerge.py, tests/test_gamemerge.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { combine, order, resolve, settle, stamp } from "../../web/js/game/merge.js";
import { newState, normalize } from "../../web/js/game/rules.js";
import { garden } from "../../web/js/game/idle.js";

const { cases } = JSON.parse(readFileSync(new URL("../fixtures/game_merge.json", import.meta.url), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const at = (state, path) => {
  if (path === "roster#seed") return state.roster.map((c) => c.seed);
  return path.split(".").reduce((v, k) => (v == null ? undefined : v[k]), state);
};

for (const c of cases) {
  test(`merge: ${c.name}`, () => {
    const mine = clone(c.mine);
    const theirs = clone(c.theirs);
    const { keep, state } = resolve(mine, theirs);
    assert.equal(keep, c.keep);
    for (const [path, want] of Object.entries(c.expect)) assert.deepEqual(at(state, path), want, path);
    assert.deepEqual(mine, c.mine, "mine is left as it was");
    assert.deepEqual(theirs, c.theirs, "theirs is left as it was");
    if (keep === "merged") {
      assert.equal(resolve(clone(c.theirs), clone(c.mine)).keep, "merged", "whichever side it is on");
      // The combined copy is newer than both, so each side takes it and the two stop disagreeing. (A copy from
      // before the clocks is never taken to be older: it is combined once more, which changes nothing.)
      for (const side of [c.mine, c.theirs]) {
        const again = resolve(clone(side), state);
        assert.equal(again.keep, side.clock ? "theirs" : "merged");
        for (const [path, want] of Object.entries(c.expect)) {
          if (!path.startsWith("clock.")) assert.deepEqual(at(again.state, path), want, `again: ${path}`);
        }
        assert.equal(resolve(state, clone(side)).keep, side.clock ? "mine" : "merged");
      }
      // ...and it loads as a game (nothing in it trips normalize).
      const loaded = normalize(clone(state));
      assert.ok(loaded.roster.length >= 1);
    }
  });
}

/** What saved games did up to v0.68.0 (app/sync/engine.py game_wins, mobile/src/js/sync.js gameWins, game.js adopt). */
const oldWins = (theirs, mine) => ((theirs.xp || 0) > 0) !== ((mine.xp || 0) > 0) ? (theirs.xp || 0) > 0 : (theirs.updated_at || 0) > (mine.updated_at || 0);

test("the cause: a copy from days ago, played for a minute, used to replace the whole game", () => {
  // One game, played on the computer for a week; the same game as the phone (or a second tab) last saw it.
  const old = normalize(newState(7));
  old.xp = 1000;
  stamp(old, "desk");
  const phone = normalize(clone(old));
  const desk = normalize(clone(old));
  desk.gyms = { beaten: 4, wins: { pip: 1, marin: 1, tor: 1, volta: 1 } };
  Object.assign(garden(desk).plots[0], { open: true, id: "word_sprout", tier: 2 });
  garden(phone); // (the phone's garden as it was: nothing built)
  desk.xp += 2000;
  desk.updated_at = 2000;
  stamp(desk, "desk");
  // The phone opens with the old copy, earns 30 XP before it hears of the new one, and so is "saved last".
  phone.xp += 30;
  phone.updated_at = 5000;
  stamp(phone, "phone");
  assert.ok(desk.gyms.beaten >= 1 && garden(desk).plots[0].tier === 2);
  assert.ok(oldWins(phone, desk), "the old rule took the phone's copy: garden and gyms lost");
  const { keep, state } = resolve(desk, phone);
  assert.equal(keep, "merged");
  assert.equal(state.gyms.beaten, desk.gyms.beaten, "every gym leader beaten is still beaten");
  assert.equal(state.idle.plots[0].tier, 2, "the garden's building is still there");
  assert.equal(state.xp, desk.xp + 30, "and the phone's 30 XP are added, not lost and not counted twice");
});

test("a save counts what this device changed, and its clock moves on", () => {
  const s = normalize(newState(3));
  assert.deepEqual(s.tally.xp, {}, "a new game owes nobody anything");
  s.xp = 50;
  s.coins = 5;
  stamp(s, "dev");
  assert.deepEqual(s.tally.xp, { dev: [50, 0] });
  assert.deepEqual(s.clock, { dev: 1 });
  s.coins = 2; // (spent 3)
  stamp(s, "dev");
  assert.deepEqual(s.tally.coins, { dev: [5, 3] });
  assert.deepEqual(s.clock, { dev: 2 });
  // A save from before the tally: its XP and coins are one unclaimed share, the same on every device.
  const old = settle({ xp: 700, coins: 40, roster: [{ seed: 1 }] });
  assert.deepEqual(old.tally.xp, { _: [700, 0] });
  const loaded = normalize({ xp: 700, coins: 40, roster: [{ seed: 1 }] });
  assert.deepEqual(loaded.tally.coins, { _: [40, 0] });
  assert.deepEqual(loaded.clock, {});
});

test("clocks: newer, older, the same, or played apart", () => {
  assert.equal(order({ a: 2 }, { a: 1 }), "after");
  assert.equal(order({ a: 1 }, { a: 1, b: 1 }), "before");
  assert.equal(order({}, {}), "same");
  assert.equal(order({ a: 2 }, { b: 1 }), "apart");
  assert.equal(order(null, { a: 0 }), "same");
});

test("combine is the same whichever copy arrives", () => {
  for (const c of cases.filter((x) => x.keep === "merged")) {
    const one = combine(clone(c.mine), clone(c.theirs));
    const two = combine(clone(c.theirs), clone(c.mine));
    for (const k of ["xp", "coins", "gems", "gyms", "idle", "roster", "badges", "stats"]) assert.deepEqual(two[k], one[k], `${c.name}: ${k}`);
  }
});
