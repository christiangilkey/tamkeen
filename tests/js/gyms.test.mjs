// Gym leaders (web/js/game/gyms.js): ten, in order, each harder than the last, unlocked one at a time,
// saved in the game state; and the live battle engine's brain and answer time they use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOVES, BEASTS, TYPES } from "../../web/js/game/data.js";
import { THEMES } from "../../web/js/game/battlemap.js";
import { describe as describeGenome } from "../../web/js/game/genome.js";
import { GYM_COUNT, LEADERS, gymSetup, gymStatus, leaderTeam } from "../../web/js/game/gyms.js";
import { brainOf, newLiveBattle, step, current } from "../../web/js/game/livebattle.js";
import { beatGym, finishBattle, newState, normalize } from "../../web/js/game/rules.js";
import { gymTrials } from "../../tools/game_sim/gym-trials.mjs";

test("ten leaders, each with a real team, arena and reward", () => {
  assert.equal(GYM_COUNT, 10);
  assert.equal(new Set(LEADERS.map((l) => l.id)).size, 10);
  for (const l of LEADERS) {
    assert.ok(l.name && l.title && l.blurb, l.id);
    assert.ok(l.element === null || TYPES[l.element], l.id);
    assert.ok(l.theme === null || THEMES[l.theme], `${l.id} arena ${l.theme}`);
    assert.ok(l.team.length >= 1 && l.team.length <= 3, l.id);
    const team = leaderTeam(l);
    l.team.forEach((m, i) => {
      assert.ok(BEASTS.some((b) => b.id === m.beast), m.beast);
      assert.equal(describeGenome(team[i]).beast, m.beast, `${l.id}: the genome draws as a ${m.beast}`);
      for (const id of m.moves) assert.ok(MOVES.some((x) => x.id === id), `${l.id}: move ${id}`);
      assert.ok(m.moves.length <= 4);
    });
    assert.deepEqual(leaderTeam(l).map((g) => g.seed), team.map((g) => g.seed), "the same team every time");
    assert.ok(l.reward.coins > 0 && l.reward.xp > 0);
  }
});

test("each leader plays better than the one before, not only with bigger numbers", () => {
  const up = ["form", "eager", "dodge", "pick", "types", "ground", "lead", "interrupt"];
  for (let i = 1; i < LEADERS.length; i++) {
    const a = LEADERS[i - 1], b = LEADERS[i];
    for (const k of up) {
      const x = k === "form" ? a.form : a.brain[k], y = k === "form" ? b.form : b.brain[k];
      assert.ok(y >= x, `${b.id} ${k} ${y} >= ${a.id}'s ${x}`);
    }
    assert.ok(b.brain.react <= a.brain.react, `${b.id} reacts at least as fast`);
    assert.ok(b.quiz <= a.quiz, `${b.id} gives no more time a question`);
    assert.ok(b.team.length >= a.team.length);
    assert.ok(b.reward.coins > a.reward.coins);
  }
  assert.ok(LEADERS[0].quiz > 5 && LEADERS[9].quiz < 5, "the first gym gives more than the usual 5 s, the last less");
});

test("the engine takes a brain and an answer time; without them nothing changes", () => {
  const mk = (type) => ({ name: "", look: {}, type, max: 100, hp: 100, atk: 20, def: 20, spd: 20, moves: ["tackle"] });
  const plain = newLiveBattle({ mine: [mk("ember")], theirs: [mk("grove")], foeForm: 0.7, rand: () => 0.5 });
  assert.deepEqual(plain.brain.foe, brainOf(0.7));
  assert.equal(plain.quizS, 5);
  const leader = LEADERS[9];
  const g = newLiveBattle({ ...gymSetup(leader), mine: [mk("ember")], theirs: [mk("grove")], rand: () => 0.5 });
  assert.equal(g.quizS, leader.quiz);
  assert.equal(g.brain.foe.react, leader.brain.react);
  assert.equal(g.brain.foe.lead, 1);
  assert.equal(g.foeForm, leader.form);
  assert.equal(g.mode, "gym");
  // a question opens with the leader's time
  const q = { uid: "w", prompt: "?", options: ["a", "b", "c", "d"], answer: 0 };
  const b = newLiveBattle({ ...gymSetup(LEADERS[0]), mine: [mk("ember")], theirs: [mk("grove")], rand: () => 0.5, ask: () => q });
  current(b, "me").x = current(b, "foe").x - 40;
  b.ctl.me.attack = "tackle";
  step(b, 1 / 60);
  assert.ok(b.quiz, "a question");
  assert.equal(b.quiz.total, LEADERS[0].quiz);
});

test("leaders open one at a time; the first win pays the reward once; progress is saved", () => {
  const s = newState(5);
  assert.deepEqual(s.gyms, { beaten: 0, wins: {} });
  assert.equal(gymStatus(s, 0), "open");
  assert.equal(gymStatus(s, 1), "locked");
  const result = (i, won) => ({ mode: "gym", won, flawless: false, comeback: false, rival: { id: null, name: LEADERS[i].name, gym: LEADERS[i].id } });
  // a loss changes nothing
  let pay = finishBattle(s, result(0, false));
  assert.equal(s.gyms.beaten, 0);
  assert.equal(pay.gym.first, false);
  // a locked leader can't be skipped to
  assert.equal(beatGym(s, result(3, true)).first, false);
  assert.equal(s.gyms.beaten, 0);
  // the first win opens the next and pays
  const coins = s.coins;
  pay = finishBattle(s, result(0, true));
  assert.equal(s.gyms.beaten, 1);
  assert.ok(pay.gym.first && pay.gym.next === LEADERS[1].id);
  assert.equal(pay.gym.coins, LEADERS[0].reward.coins);
  assert.equal(s.coins - coins, pay.coins, "the reward is in the battle's coins");
  assert.ok(pay.coins >= LEADERS[0].reward.coins);
  assert.equal(pay.rating, 0, "gyms don't move the skill rating");
  assert.equal(gymStatus(s, 0), "beaten");
  assert.equal(gymStatus(s, 1), "open");
  // a rematch counts the win but pays no reward again
  pay = finishBattle(s, result(0, true));
  assert.equal(pay.gym.first, false);
  assert.equal(s.gyms.wins.pip, 2);
  // saved and loaded (the state syncs as a whole)
  const back = normalize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.gyms, s.gyms);
  // old saves and bad values
  const old = JSON.parse(JSON.stringify(s));
  delete old.gyms;
  assert.deepEqual(normalize(old).gyms, { beaten: 0, wins: {} });
  old.gyms = { beaten: 99, wins: [] };
  assert.deepEqual(normalize(old).gyms, { beaten: 10, wins: {} });
  // the last one
  s.gyms.beaten = 9;
  pay = finishBattle(s, result(9, true));
  assert.ok(pay.gym.first);
  assert.equal(pay.gym.next, null);
  assert.equal(s.gyms.beaten, 10);
});

test("trials: the computer playing the player wins less against each leader in turn", () => {
  // 24 battles a leader at 80% right answers (tools/game_sim/gym-trials.mjs runs more); the halves and the
  // ends must be clearly apart, and every battle must end.
  const rows = gymTrials(24, { right: 0.8 });
  const rate = rows.map((r) => r.rate);
  assert.ok(rows.every((r) => r.stuck === 0), "every battle ended");
  assert.ok(rate[0] >= 0.9, `the first gym is easy (${rate[0]})`);
  assert.ok(rate[9] <= 0.4, `the champion is a real challenge (${rate[9]})`);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(rate.slice(0, 5)) > avg(rate.slice(5)) + 0.3, `the first five are easier than the last five (${rate.map((r) => r.toFixed(2)).join(" ")})`);
  for (let i = 2; i < 10; i++) assert.ok(rate[i] <= rate[i - 2] + 0.05, `${rows[i].name} is no easier than two before (${rate.map((r) => r.toFixed(2)).join(" ")})`);
});
