// Gym trials: the computer plays the player's side against each gym leader, many times, on real
// generated arenas, and prints the win rates. Shows that each leader is harder than the one before.
//
//   node tools/game_sim/gym-trials.mjs [battles per leader = 60] [share answered right = 0.8] [leader id]
//
// With a leader id, every leader fights with that leader's team, stats and arena: only how it plays
// (its brain, how often its moves come off, the seconds a question) differs, so the AI alone shows.
//
// The "player" brings three fully grown creatures of random elements with their usual moves, plays with
// autoSkill 0.7 (as the engine's own trials), answers `right` of the questions right, and takes 1 to 3 s
// to answer (one answer in five up to 2 s more): an answer slower than the gym's time limit fails, as it would for a person.

import { fighters, wildTeam } from "../../web/js/game/battle.js";
import { generateMap } from "../../web/js/game/battlemap.js";
import { rng } from "../../web/js/game/genome.js";
import { LEADERS, gymSetup, leaderTeam } from "../../web/js/game/gyms.js";
import { answer, newLiveBattle, step } from "../../web/js/game/livebattle.js";

const QUESTION = { uid: "w", prompt: "?", options: ["a", "b", "c", "d"], answer: 0 };
const DT = 1 / 60;

/** One battle against a leader; returns {won, time}. */
export function gymBattle(leader, seed, { right = 0.8, slow = [1, 3], cols = 90, rows = 54, same = null } = {}) {
  const rand = rng(seed);
  const mine = fighters({ tags: [], attacks: [] }, wildTeam(rand, 3).map((g) => ({ ...g, growth: 0.9 })));
  // `same`: every leader fights with this one leader's team, stats and arena, so only its brain, form and time limit differ
  const body = same || leader;
  const theirs = fighters(null, leaderTeam(body), { scale: body.scale });
  const map = generateMap(seed, { theme: body.theme || undefined, cols, rows });
  const b = newLiveBattle({ ...gymSetup(leader), mine, theirs, map, rand, auto: true, ask: () => QUESTION });
  for (let i = 0; i < 60 * 400 && !b.over; i++) {
    if (b.quiz) {
      const took = slow[0] + rand() * (slow[1] - slow[0]) + (rand() < 0.2 ? rand() * 2 : 0);
      const ok = rand() < right;
      if (took >= b.quiz.total) { b.quiz.timeLeft = 0; answer(b, null); } else { b.quiz.timeLeft = b.quiz.total - took; answer(b, ok ? 0 : 1); }
      continue;
    }
    step(b, DT);
  }
  return { won: !!b.won, time: b.time, over: b.over };
}

/** Win rate against each leader over `n` battles (the same seeds for every leader). */
export function gymTrials(n = 60, opts = {}) {
  return LEADERS.map((leader) => {
    let wins = 0, time = 0, stuck = 0;
    for (let i = 0; i < n; i++) {
      const r = gymBattle(leader, 7001 + i * 13, opts);
      wins += r.won ? 1 : 0;
      time += r.time;
      stuck += r.over ? 0 : 1;
    }
    return { id: leader.id, name: leader.name, rate: wins / n, time: time / n, stuck };
  });
}

if (process.argv[1] && process.argv[1].endsWith("gym-trials.mjs")) {
  const n = Number(process.argv[2]) || 60;
  const right = Number(process.argv[3]) || 0.8;
  const same = process.argv[4] ? LEADERS.find((l) => l.id === process.argv[4]) : null; // e.g. "sola": everyone with Sola's team
  const t0 = Date.now();
  console.log(`${n} battles a leader, ${Math.round(right * 100)}% answered right, 1-3 s an answer, one in five up to 2 s slower` +
    (same ? `; every leader with ${same.name}'s team, stats and arena` : ""));
  for (const r of gymTrials(n, { right, same })) {
    console.log(`${r.name.padEnd(8)} won ${String(Math.round(r.rate * 100)).padStart(3)}%   ~${r.time.toFixed(0)} s a battle${r.stuck ? `   ${r.stuck} didn't end` : ""}`);
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
