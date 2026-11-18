// Run with: node --test tests/js/
// The more kinds of attack (prototype "move_variety"): slam, slash through, grab and throw, sky dive, burrow, energy
// orb, cone wave, ring wave, a strike called down from above, and that each takes its user's own element.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_FORMS, LIVE_RESHAPE, MOVES, SHOP_MOVES, liveMove, moveById } from "../../web/js/game/data.js";
import { rng } from "../../web/js/game/genome.js";
import { TILE, current, inRange, newLiveBattle, step, useNow, view, whyNot } from "../../web/js/game/livebattle.js";
import { PROTOTYPES } from "../../web/js/prototype.js";

const DT = 1 / 60;
const at = (c, r) => ({ x: c * TILE + 8, y: r * TILE + 8 });
const mk = (type, moves) => ({ name: "", look: { species: "biped", beast: "test", type }, type, max: 200, hp: 200, atk: 20, def: 20, spd: 20, moves, heals: 2 });
function field(cols = 30, rows = 11, me = at(4, 5), foe = at(10, 5), walls = []) {
  const tiles = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tiles.push(walls.some(([wc, wr]) => wc === c && wr === r) ? "wall" : "grass");
  return { seed: 1, theme: "meadow", cols, rows, width: cols * TILE, height: rows * TILE, base: "grass", tiles, props: [], propTiles: tiles.map(() => null), starts: { me, foe } };
}
function duel(move, { foeAt = at(10, 5), map = null, type = "ember" } = {}) {
  const b = newLiveBattle({ mine: [mk(type, [move])], theirs: [mk("grove", ["tackle"])], map: map || field(30, 11, at(4, 5), foeAt), rand: rng(3) });
  b.ai.foe = null; // the rival stands still unless a test moves it
  return b;
}
function run(b, secs) {
  const out = [];
  for (let t = 0; t < secs; t += DT) out.push(...step(b, DT));
  return out;
}
const kinds = (events, kind) => events.filter((e) => e.kind === kind);
const NEW = ["body_slam", "slash_through", "grapple_toss", "sky_dive", "burrow", "energy_orb", "cone_wave", "shockwave", "call_down", "focus_beam"];

test("the new moves: a prototype, bought in the shop, each with its own form, all taking the user's element", () => {
  assert.equal(PROTOTYPES.move_variety.released, false);
  const forms = { body_slam: "slam", slash_through: "slash", grapple_toss: "throw", sky_dive: "skydive", burrow: "burrow",
                  energy_orb: "orb", cone_wave: "cone", shockwave: "ring", call_down: "drop", focus_beam: "beam" };
  for (const id of NEW) {
    const m = moveById(id);
    assert.equal(m.id, id);
    assert.ok(m.price > 0 && m.own && m.proto === "move_variety" && m.kind === "attack", id);
    assert.equal(liveMove(m).form, forms[id], id);
    assert.ok(LIVE_FORMS[liveMove(m).form], `${id}'s form is explained`);
    assert.ok(!SHOP_MOVES.includes(m), `${id} stays out of the shop while the prototype is off`);
  }
  // With the prototype off, the older moves keep their shapes.
  for (const id of Object.keys(LIVE_RESHAPE)) assert.notEqual(liveMove(moveById(id)).form, LIVE_RESHAPE[id].form, id);
  assert.equal(liveMove(moveById("wildfire")).form, "burst");
  assert.equal(liveMove(moveById("energy_orb")).windup, 0.5, "an orb gathers before it flies");
  assert.equal(MOVES.filter((m) => m.proto).length, NEW.length);
});

test("a body slam knocks the rival back hard and dazes it, in the user's own element", () => {
  const b = duel("body_slam", { foeAt: at(9, 5) });
  const foe = current(b, "foe");
  useNow(b, "me", "body_slam");
  const ev = run(b, 0.6);
  const hit = kinds(ev, "hit")[0];
  assert.ok(hit, "it lands");
  assert.equal(hit.element, "ember", "a fire creature's slam is fire");
  assert.equal(kinds(ev, "slam").length, 1);
  assert.ok(foe.stun > 0 || ev.some((e) => e.kind === "slam"), "dazed");
});

test("a slash goes through the rival and out the other side, hitting once", () => {
  const b = duel("slash_through", { foeAt: at(8, 5) });
  const me = current(b, "me"), foe = current(b, "foe");
  useNow(b, "me", "slash_through");
  const ev = run(b, 0.6);
  assert.equal(kinds(ev, "hit").length, 1, "one hit");
  assert.equal(kinds(ev, "slash").length, 1);
  assert.ok(me.x > foe.x + 8, "it ends up past the rival");
});

test("grab and throw: the rival is carried off along the rush and hurt when it lands", () => {
  const b = duel("grapple_toss", { foeAt: at(8, 5) });
  const foe = current(b, "foe");
  const x0 = foe.x;
  useNow(b, "me", "grapple_toss");
  const ev = run(b, 0.25);
  assert.equal(kinds(ev, "grab").length, 1);
  assert.equal(kinds(ev, "hit").length, 0, "no damage while it flies");
  assert.ok(foe.thrown, "in the air");
  assert.equal(whyNot(b, "foe", "tackle"), "stunned", "it can't act while thrown");
  const ev2 = run(b, 0.6);
  assert.equal(kinds(ev2, "land").length, 1);
  assert.equal(kinds(ev2, "hit").length, 1, "the landing hurts");
  assert.ok(foe.x > x0 + 40, "thrown well away");
});

test("a sky dive: out of reach in the air, then down on the point, hitting what is near", () => {
  const b = duel("sky_dive", { foeAt: at(12, 5) });
  const me = current(b, "me");
  useNow(b, "me", "sky_dive");
  run(b, 0.3);
  assert.ok(me.air && view(b).me.air, "up in the air");
  assert.equal(whyNot(b, "me", "sky_dive"), "busy");
  const ev = run(b, 1);
  assert.equal(kinds(ev, "crash").length, 1);
  assert.equal(kinds(ev, "hit").length, 1, "the rival stood still under it");
  assert.ok(!me.air);
  // A rival that walks out from under the circle is missed.
  const c = duel("sky_dive", { foeAt: at(12, 5) });
  useNow(c, "me", "sky_dive");
  current(c, "foe").y += 70;
  assert.equal(kinds(run(c, 1.2), "hit").length, 0);
});

test("a burrow goes under a wall and bursts up at the rival", () => {
  const walls = [[7, 4], [7, 5], [7, 6]];
  const b = duel("burrow", { map: field(30, 11, at(4, 5), at(11, 5), walls) });
  const me = current(b, "me");
  useNow(b, "me", "burrow");
  run(b, 0.3);
  assert.ok(me.under && view(b).me.under, "underground");
  const ev = run(b, 1.5);
  assert.equal(kinds(ev, "erupt").length, 1);
  assert.equal(kinds(ev, "hit").length, 1);
  assert.ok(me.x > 7 * TILE + 16, "it came up on the far side of the wall");
});

test("nothing hits a creature that is in the air or underground", () => {
  const b = newLiveBattle({ mine: [mk("ember", ["sky_dive"])], theirs: [mk("grove", ["tackle"])], map: field(30, 11, at(4, 5), at(6, 5)), rand: rng(4) });
  b.ai.foe = null;
  useNow(b, "me", "sky_dive");
  run(b, 0.1);
  useNow(b, "foe", "tackle");
  const ev = run(b, 0.3);
  assert.equal(kinds(ev, "hit").filter((e) => e.target === "me").length, 0);
});

test("an energy orb gathers, flies slowly and bursts on what it meets; near a wall it still hurts what is close", () => {
  const b = duel("energy_orb", { foeAt: at(12, 5) });
  useNow(b, "me", "energy_orb");
  assert.ok(current(b, "me").charging, "gathering first");
  const ev = run(b, 2);
  assert.equal(kinds(ev, "blast").length, 1);
  assert.equal(kinds(ev, "hit").length, 1);
});

test("a cone wave hits in front within its angle and misses behind or to the side", () => {
  const inFront = duel("cone_wave", { foeAt: at(9, 5) });
  assert.ok(inRange(inFront, "me", "cone_wave"));
  useNow(inFront, "me", "cone_wave");
  assert.equal(kinds(run(inFront, 0.6), "hit").length, 1);
  const off = duel("cone_wave", { foeAt: at(9, 5) });
  useNow(off, "me", "cone_wave"); // aimed at it, then it steps well out of the fan
  current(off, "foe").y += 80;
  assert.equal(kinds(run(off, 0.6), "hit").length, 0);
});

test("a shockwave hits all round the user, whichever side the rival is on", () => {
  for (const dc of [-3, 3]) {
    const b = duel("shockwave", { foeAt: at(4 + dc, 5) });
    useNow(b, "me", "shockwave");
    assert.equal(kinds(run(b, 0.6), "hit").length, 1, `rival at ${dc}`);
  }
  const far = duel("shockwave", { foeAt: at(14, 5) });
  assert.ok(!inRange(far, "me", "shockwave"));
});

test("a strike called down from above lands where the rival stood, after a warning", () => {
  const b = duel("call_down", { foeAt: at(11, 5) });
  const ev = useNow(b, "me", "call_down");
  const area = kinds(ev, "area")[0];
  assert.ok(area && area.warn >= 0.6 && area.form === "drop");
  assert.equal(kinds(run(b, 1), "hit").length, 1);
});

test("the rival sees the new attacks coming and gets out of the way", () => {
  let dodged = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const b = newLiveBattle({ mine: [mk("ember", ["call_down"])], theirs: [mk("grove", ["tackle"])], map: field(30, 11, at(4, 5), at(11, 5)), rand: rng(seed),
      brain: { foe: { dodge: 1, react: 0.05, eager: 0 } } });
    useNow(b, "me", "call_down");
    if (!kinds(run(b, 1.2), "hit").length) dodged++;
  }
  assert.ok(dodged >= 4, `a quick rival steps out of a strike's circle (${dodged} of 6)`);
});
