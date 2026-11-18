// Run with: node --test tests/js/
// Live battles with the player's own aim (web/js/game/livebattle.js `aim: true`, prototype "battle_aim"): a right
// answer opens an aim moment with the world still frozen, and the move goes where the player points it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rng } from "../../web/js/game/genome.js";
import { AIM_S, TILE, answer, current, fire, input, newLiveBattle, step, view, whyNot } from "../../web/js/game/livebattle.js";

const DT = 1 / 60;
const at = (c, r) => ({ x: c * TILE + 8, y: r * TILE + 8 });
const mk = (type, moves) => ({ name: "", look: { species: "biped", beast: "test", type }, type, max: 100, hp: 100, atk: 20, def: 20, spd: 20, moves, heals: 2 });
function field(cols = 30, rows = 21) {
  const tiles = Array.from({ length: cols * rows }, () => "grass");
  return { seed: 1, theme: "meadow", cols, rows, width: cols * TILE, height: rows * TILE, base: "grass", tiles, props: [], propTiles: tiles.map(() => null),
    starts: { me: at(8, 10), foe: at(20, 10) } };
}
const QUESTION = { uid: "w1", prompt: "palabra", sentence: "", options: ["word", "other", "thing", "more"], answer: 0, reverse: false };
function duel(moves, aim) {
  const b = newLiveBattle({ mine: [mk("ember", moves)], theirs: [mk("grove", ["tackle"])], map: field(), rand: rng(7), ask: () => QUESTION, aim });
  b.ai.foe = null;
  return b;
}
/** Press a move and answer its question (0 = right). Returns the answer's events. */
function pressAndAnswer(b, id, choice = 0) {
  input(b, { attack: id });
  step(b, DT);
  assert.ok(b.quiz, "the question opened");
  return answer(b, choice);
}
const kinds = (events, kind) => events.filter((e) => e.kind === kind);

test("without aiming (everyone else): a right answer sets the move off at once, at the rival", () => {
  const b = duel(["tackle"], false);
  const ev = pressAndAnswer(b, "tackle");
  assert.equal(b.aiming, null);
  assert.equal(kinds(ev, "attack").length, 1);
  const shot = b.fx.find((p) => p.kind === "projectile");
  assert.ok(shot && shot.dx > 0.99, "straight at the rival, to the right");
});

test("aiming: a right answer opens the aim moment; the world stays frozen; it goes off when the moment runs out", () => {
  const b = duel(["tackle"], true);
  const ev = pressAndAnswer(b, "tackle");
  assert.equal(kinds(ev, "attack").length, 0, "nothing goes off on the answer itself");
  assert.equal(kinds(ev, "aim").length, 1);
  assert.ok(b.aiming && b.aiming.move === "tackle");
  assert.equal(whyNot(b, "me", "tackle"), "busy");
  const foe = current(b, "foe");
  foe.x += 0; // (still: the rival's AI is off; the world's clock must not run either)
  const time = b.time;
  input(b, { move: { x: 1, y: 0 } });
  const me0 = { x: current(b, "me").x, y: current(b, "me").y };
  let fired = [];
  for (let t = 0; t < AIM_S - 0.1; t += DT) fired.push(...step(b, DT));
  assert.equal(kinds(fired, "attack").length, 0, "not yet");
  assert.equal(b.time, time, "the world waited");
  assert.deepEqual({ x: current(b, "me").x, y: current(b, "me").y }, me0, "the creature didn't walk off");
  for (let t = 0; t < 0.2; t += DT) fired.push(...step(b, DT));
  assert.equal(kinds(fired, "attack").length, 1, "the moment ran out: it went off");
  assert.equal(b.aiming, null);
});

test("aiming: the move goes where the player points, not at the rival", () => {
  const b = duel(["tackle"], true);
  pressAndAnswer(b, "tackle");
  const me = current(b, "me");
  input(b, { aim: { x: me.x, y: me.y - 100 } }); // straight up; the rival is to the right
  const v = view(b);
  assert.ok(v.aiming && v.aiming.aimed);
  assert.ok(Math.abs(v.aiming.area.dy + 1) < 1e-9, "the preview points up");
  const ev = fire(b);
  assert.equal(kinds(ev, "attack").length, 1);
  const shot = b.fx.find((p) => p.kind === "projectile");
  assert.ok(Math.abs(shot.dx) < 1e-9 && Math.abs(shot.dy + 1) < 1e-9, "the shot flies up");
  assert.equal(fire(b).length, 0, "only once");
});

test("aiming: a drop lands on the point aimed at, as far as it reaches; no aim given goes at the rival", () => {
  const near = duel(["rockslide"], true);
  pressAndAnswer(near, "rockslide");
  const me = current(near, "me");
  input(near, { aim: { x: me.x + 60, y: me.y + 40 } });
  fire(near);
  const area = near.fx.find((p) => p.kind === "area");
  assert.ok(Math.abs(area.x - (me.x + 60)) < 1e-6 && Math.abs(area.y - (me.y + 40)) < 1e-6, "right on the point");

  const far = duel(["rockslide"], true);
  pressAndAnswer(far, "rockslide");
  const m2 = current(far, "me");
  input(far, { aim: { x: m2.x, y: m2.y + 1000 } });
  fire(far);
  const a2 = far.fx.find((p) => p.kind === "area");
  assert.ok(Math.abs(a2.y - (m2.y + 230)) < 1e-6 && Math.abs(a2.x - m2.x) < 1e-6, "no further than the move's range");

  const auto = duel(["tackle"], true);
  pressAndAnswer(auto, "tackle");
  fire(auto);
  assert.ok(auto.fx.find((p) => p.kind === "projectile").dx > 0.99, "no aim: at the rival");
});

test("aiming: a wrong answer still fails at once, and moves that aren't attacks need no aim", () => {
  const b = duel(["tackle", "guard"], true);
  const wrong = pressAndAnswer(b, "tackle", 1);
  assert.equal(b.aiming, null);
  assert.equal(kinds(wrong, "failed").length, 1);
  current(b, "me").recover = 0;
  const ev = pressAndAnswer(b, "guard");
  assert.equal(b.aiming, null);
  assert.equal(kinds(ev, "guard").length, 1);
});
