// Run with: node --test tests/js/
// The answer race in live battles (web/js/game/livebattle.js `race: true`, prototype "battle_race"): both sides answer
// every question; whoever is right first wins it, and an attack the other side out-answered does half damage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rng } from "../../web/js/game/genome.js";
import { COMBO, DODGE, RIVAL, RIVAL_FAST, TILE, answer, input, newLiveBattle, step, view } from "../../web/js/game/livebattle.js";

const DT = 1 / 60;
const at = (c, r) => ({ x: c * TILE + 8, y: r * TILE + 8 });
const mk = (type, moves) => ({ name: "", look: { species: "biped", beast: "test", type }, type, max: 100, hp: 100, atk: 20, def: 20, spd: 20, moves, heals: 2 });
function field(cols = 30, rows = 21) {
  const tiles = Array.from({ length: cols * rows }, () => "grass");
  return { seed: 1, theme: "meadow", cols, rows, width: cols * TILE, height: rows * TILE, base: "grass", tiles, props: [], propTiles: tiles.map(() => null),
    starts: { me: at(10, 10), foe: at(16, 10) } };
}
const QUESTION = { uid: "w1", prompt: "palabra", sentence: "", options: ["word", "other", "thing", "more"], answer: 0, reverse: false };
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const kinds = (events, kind) => events.filter((e) => e.kind === kind);
function duel({ race = true, foeAi = false, seed = 7, foeForm = 0.7 } = {}) {
  const b = newLiveBattle({ mine: [mk("ember", ["tackle", "guard"])], theirs: [mk("grove", ["tackle"])], map: field(), rand: rng(seed), ask: () => QUESTION, race, foeForm });
  if (!foeAi) b.ai.foe = null;
  return b;
}
/** Run until `done(b)` or `secs` pass; returns every event. */
function runUntil(b, done, secs = 30) {
  const out = [];
  for (let t = 0; t < secs && !done(b); t += DT) out.push(...step(b, DT));
  return out;
}
/** The player presses tackle with the rival's dice set: right (0.1 < foeForm), fast (0.1 < fast) at 0.8 + 0.5 * 1.2 s. */
function pressTackle(b, dice = [0.1, 0.1, 0.5]) {
  b.rand = seq(...dice, 0.5);
  input(b, { attack: "tackle" });
  step(b, DT);
  assert.ok(b.quiz && b.quiz.side === "me");
}

test("without the race (everyone else): the rival never answers and its attacks ask nothing", () => {
  const b = duel({ race: false, foeAi: true });
  pressTackle(b);
  assert.equal(b.quiz.rivalAt, null);
  answer(b, 0);
  const events = runUntil(b, (x) => x.quiz, 20);
  assert.ok(kinds(events, "attack").some((e) => e.side === "foe"), "the rival attacked");
  assert.equal(b.quiz, null, "with no question for the player");
});

test("the player's attack: right before the rival, it goes off in full", () => {
  const b = duel();
  pressTackle(b);
  // (a fast rival answer comes within RIVAL_FAST: 1.5-2.5 s since the owner found the AI too hard; it was 0.8-2 s)
  assert.ok(Math.abs(b.quiz.rivalAt - (RIVAL_FAST[0] + 0.5 * (RIVAL_FAST[1] - RIVAL_FAST[0]))) < 1e-9, "the rival would answer after 2 s (a fast answer)");
  assert.ok(b.quiz.rivalAt <= RIVAL_FAST[1]);
  runUntil(b, () => false, 0.5);
  assert.ok(b.quiz, "still open at 0.5 s");
  const ev = answer(b, 0);
  const attack = kinds(ev, "attack")[0];
  assert.ok(attack && !attack.half);
  assert.ok(Math.abs(attack.power - 1.1) < 1e-9, "a fast right answer, as always");
});

test("the player's attack: the rival answered quicker, so the question closes and the move does half damage", () => {
  const b = duel();
  pressTackle(b);
  const events = runUntil(b, (x) => !x.quiz, 3);
  const ans = kinds(events, "answer")[0];
  assert.ok(ans && ans.rival && !ans.correct && ans.choice === null, "the rival was first; the player never answered");
  assert.equal(ans.right, 0, "the screen is told the right answer to show");
  const attack = kinds(events, "attack")[0];
  assert.ok(attack && attack.half);
  assert.ok(Math.abs(attack.power - COMBO[0] * DODGE) < 1e-9);
  assert.deepEqual([b.answers.right, b.answers.wrong], [0, 0], "not counted as right or wrong");
  const hit = kinds(runUntil(b, (x) => x.fx.length === 0, 3), "hit")[0];
  assert.ok(hit && hit.half, "the hit says it was half");
});

test("the player's attack: a rival that gets it wrong never answers, and moves with nothing to dodge aren't raced", () => {
  const b = duel();
  pressTackle(b, [0.9]); // 0.9 >= foeForm: the rival would be wrong
  assert.equal(b.quiz.rivalAt, null);
  runUntil(b, () => false, 4);
  assert.ok(b.quiz, "the player keeps the whole time");
  answer(b, 0);
  const c = duel();
  c.rand = seq(0.1);
  input(c, { attack: "guard" });
  step(c, DT);
  assert.equal(c.quiz.rivalAt, null);
});

/** Let the rival play until it attacks and the player's dodge question opens. */
function dodgeQuestion(seed) {
  const b = duel({ foeAi: true, seed, foeForm: 0.95 });
  runUntil(b, (x) => x.quiz && x.quiz.side === "foe", 30);
  assert.ok(b.quiz && b.quiz.side === "foe", "the rival's attack opened a dodge question");
  assert.equal(view(b).quiz.side, "foe");
  return b;
}

test("the rival's attack: the player answers right first, and it does half damage", () => {
  const b = dodgeQuestion(11);
  const power = b.quiz.power;
  const ev = answer(b, 0);
  const ans = kinds(ev, "answer")[0];
  assert.ok(ans.dodge && ans.correct && !ans.rival);
  const attack = kinds(ev, "attack").find((e) => e.side === "foe");
  assert.ok(attack && attack.half && Math.abs(attack.power - power * DODGE) < 1e-9);
  assert.equal(b.answers.right, 1);
});

test("the rival's attack: a wrong answer, or the rival quicker, and it lands in full", () => {
  const b = dodgeQuestion(12);
  const power = b.quiz.power;
  const ev = answer(b, 1);
  const attack = kinds(ev, "attack").find((e) => e.side === "foe");
  assert.ok(attack && !attack.half && Math.abs(attack.power - power) < 1e-9);
  assert.equal(b.answers.wrong, 1);

  const c = dodgeQuestion(13);
  const p2 = c.quiz.power;
  const events = runUntil(c, (x) => !x.quiz, 10);
  const ans = kinds(events, "answer")[0];
  assert.ok(ans.rival && ans.dodge, "the rival's answer came first");
  const a2 = kinds(events, "attack").find((e) => e.side === "foe");
  assert.ok(a2 && !a2.half && Math.abs(a2.power - p2) < 1e-9);
  assert.deepEqual([c.answers.right, c.answers.wrong], [0, 0]);
});

test("a battle with the race still plays to the end", () => {
  const b = newLiveBattle({ mine: [mk("ember", ["tackle", "guard"])], theirs: [mk("grove", ["tackle"])], map: field(), rand: rng(5), ask: () => QUESTION, race: true });
  const r = rng(99);
  for (let t = 0; t < 600 && !b.over; t += DT) {
    if (b.quiz) { answer(b, r() < 0.5 ? (r() < 0.7 ? 0 : 1) : RIVAL); continue; }
    if (r() < 0.02) input(b, { attack: "tackle" });
    step(b, DT);
  }
  assert.ok(b.over, "it ended");
});
