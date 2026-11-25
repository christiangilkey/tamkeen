// Battle trials: the computer plays the player's side against the computer, many times, on real generated arenas,
// and prints the win rates: against each gym leader, and against wild creatures. Battles are played as the live game
// plays them (the answer race on: the rival answers too, and the player answers "defend" questions when attacked).
//
//   node tools/game_sim/gym-trials.mjs [battles a row = 60] [share answered right = 0.8] [leader id | "fast" | "-"] [skill = 0.7]
//
// With a leader id, every leader fights with that leader's team, stats and arena: only how it plays (its brain, how
// often and how quickly it answers, the seconds a question) differs, so the AI alone shows. "fast" is a quick player.
//
// The "player" brings three fully grown creatures of random elements with their usual moves, moves and dodges with
// autoSkill `skill` (0.7 as the engine's own trials: a sharp player; 0.4 is nearer an ordinary person still getting used
// to running about and aiming) and answers `right` of the questions right. How long a learner takes (`pace`):
//   ordinary  1.5 to 3.5 s, one answer in five up to 2 s more (thinking about a word in another language)
//   fast      1 to 2.5 s, one in five up to 1.5 s more
// An answer slower than the time limit fails, and one slower than the rival's loses the race, as it would for a person.

import { fighters, wildTeam } from "../../web/js/game/battle.js";
import { generateMap } from "../../web/js/game/battlemap.js";
import { rng } from "../../web/js/game/genome.js";
import { LEADERS, gymSetup, leaderTeam } from "../../web/js/game/gyms.js";
import { RIVAL, answer, newLiveBattle, step } from "../../web/js/game/livebattle.js";
import { wildSetup } from "../../web/js/game/battlescreen.js";

const QUESTION = { uid: "w", prompt: "?", options: ["a", "b", "c", "d"], answer: 0 };
const DT = 1 / 60;
export const PACES = { ordinary: [1.5, 3.5, 2], fast: [1, 2.5, 1.5] };

/** Play one battle to the end with the computer on both sides; returns {won, time, over}. */
function play(b, rand, right, pace) {
  const [lo, hi, extra] = PACES[pace] || PACES.ordinary;
  for (let i = 0; i < 60 * 400 && !b.over; i++) {
    if (b.quiz) {
      const took = lo + rand() * (hi - lo) + (rand() < 0.2 ? rand() * extra : 0);
      const ok = rand() < right;
      const q = b.quiz;
      if (q.rivalAt != null && q.rivalAt <= Math.min(took, q.total)) { q.timeLeft = q.total - q.rivalAt; answer(b, RIVAL); } // the rival was quicker
      else if (took >= q.total) { q.timeLeft = 0; answer(b, null); }
      else { q.timeLeft = q.total - took; answer(b, ok ? 0 : 1); }
      continue;
    }
    step(b, DT);
  }
  return { won: !!b.won, time: b.time, over: b.over };
}

const playerTeam = (rand, opts) => fighters({ tags: [], attacks: [] }, wildTeam(rand, 3).map((g) => ({ ...g, growth: 0.9 })), opts);

/** One battle against a leader. */
export function gymBattle(leader, seed, { right = 0.8, pace = "ordinary", skill = 0.7, cols = 90, rows = 54, same = null } = {}) {
  const rand = rng(seed);
  const mine = playerTeam(rand);
  // `same`: every leader fights with this one leader's team, stats and arena, so only how it plays differs
  const body = same || leader;
  const theirs = fighters(null, leaderTeam(body), { scale: body.scale });
  const map = generateMap(seed, { theme: body.theme || undefined, cols, rows });
  const b = newLiveBattle({ ...gymSetup(leader), mine, theirs, map, rand, auto: true, autoSkill: skill, race: true, autoDodge: true, ask: () => QUESTION });
  return play(b, rand, right, pace);
}

/** One wild encounter, as the Battle screen starts it (battlescreen.js wildSetup). */
export function wildBattle(seed, { right = 0.8, pace = "ordinary", skill = 0.7, cols = 90, rows = 54 } = {}) {
  const rand = rng(seed);
  const mine = playerTeam(rand, { wild: true });
  const theirs = fighters(null, wildTeam(rand, mine.length));
  const map = generateMap(seed, { cols, rows });
  const b = newLiveBattle({ ...wildSetup(rand), mine, theirs, map, rand, auto: true, autoSkill: skill, race: true, autoDodge: true, ask: () => QUESTION });
  return play(b, rand, right, pace);
}

function rate(n, one) {
  let wins = 0, time = 0, stuck = 0;
  for (let i = 0; i < n; i++) {
    const r = one(7001 + i * 13);
    wins += r.won ? 1 : 0;
    time += r.time;
    stuck += r.over ? 0 : 1;
  }
  return { rate: wins / n, time: time / n, stuck };
}

/** Win rate against each leader over `n` battles (the same seeds for every leader). */
export const gymTrials = (n = 60, opts = {}) => LEADERS.map((leader) => ({ id: leader.id, name: leader.name, ...rate(n, (s) => gymBattle(leader, s, opts)) }));
/** Win rate against wild creatures over `n` battles. */
export const wildTrials = (n = 60, opts = {}) => ({ id: "wild", name: "Wild", ...rate(n, (s) => wildBattle(s, opts)) });

if (process.argv[1] && process.argv[1].endsWith("gym-trials.mjs")) {
  const n = Number(process.argv[2]) || 60;
  const right = Number(process.argv[3]) || 0.8;
  const arg = process.argv[4] || "";
  const skill = Number(process.argv[5]) || 0.7;
  const pace = arg === "fast" ? "fast" : "ordinary";
  const same = arg && arg !== "fast" && arg !== "-" ? LEADERS.find((l) => l.id === arg) : null;
  const t0 = Date.now();
  console.log(`${n} battles a row, ${Math.round(right * 100)}% answered right, ${pace} answers, moving skill ${skill}, answer race on` +
    (same ? `; every leader with ${same.name}'s team, stats and arena` : ""));
  for (const r of [wildTrials(n, { right, pace, skill }), ...gymTrials(n, { right, pace, skill, same })]) {
    console.log(`${r.name.padEnd(8)} won ${String(Math.round(r.rate * 100)).padStart(3)}%   ~${r.time.toFixed(0)} s a battle${r.stuck ? `   ${r.stuck} didn't end` : ""}`);
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
