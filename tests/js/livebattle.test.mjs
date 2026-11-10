// Run with: node --test tests/js/
// Live battles (web/js/game/livebattle.js): creatures moving in real time over terrain, moves in
// real-time forms, the question that freezes the action, the type chart, word modes, the rival.
// Everything here is deterministic: a seeded rand and a fixed step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_FORMS, LIVE_STYLE_TEXT, MOVES, MOVE_STYLES, STRONG, TYPE_CHART, TYPE_IDS, WEAK, defenceOf, liveMove, matchup, moveById } from "../../web/js/game/data.js";
import { newGenome, rng } from "../../web/js/game/genome.js";
import { finishBattle, newState } from "../../web/js/game/rules.js";
import { fighters, wildTeam } from "../../web/js/game/battle.js";
import { generateMap } from "../../web/js/game/battlemap.js";
import {
  COMBO, ENTER_GAP, SIGHT, FAINT_S, FAST_S, FEET, QUIZ_S, RECOVER_S, SPIKE_S, TILE, answer, axeAngle, battleResult, cardScale, crackAt, current, input, inRange,
  newLiveBattle, reachOf, speedOf, spikeFrame, spikesUp,
  step, useNow, usePotion, view, whyNot, wordModeOf, wordPool,
} from "../../web/js/game/livebattle.js";

const DT = 1 / 60;
const at = (c, r) => ({ x: c * TILE + 8, y: r * TILE + 8 });
// A creature as battle.js's fighter() makes one, with numbers kept simple.
const mk = (type, { moves = ["tackle"], species = "biped", hp = 100, atk = 20, def = 20, spd = 20, name = "" } = {}) =>
  ({ name, look: { species, beast: "test", type }, type, max: hp, hp, atk, def, spd, moves, heals: 2 });
// An arena drawn as text: . grass, g tall grass, m mud, i ice, h high ground, c hot coals, s spring,
// a shallows, d deep water, w wall, o a boulder (a prop on grass).
const LEGEND = { ".": "grass", g: "tall_grass", m: "mud", i: "ice", h: "high", c: "coals", s: "spring", a: "shallows", d: "deep_water", w: "wall", o: "grass",
  "^": "spikes", x: "cracked_wall", f: "stone_floor", D: "dungeon_wall" };
function arena(rows, starts) {
  const tiles = [], propTiles = [];
  for (const line of rows) for (const ch of line) { tiles.push(LEGEND[ch]); propTiles.push(ch === "o" ? "boulder" : null); }
  const cols = rows[0].length;
  return { seed: 1, theme: "meadow", cols, rows: rows.length, width: cols * TILE, height: rows.length * TILE, base: "grass", tiles, props: [], propTiles, starts };
}
const open = (cols = 24, rows = 9, ch = ".") => Array.from({ length: rows }, () => ch.repeat(cols));
const field = (ch = ".", me = at(3, 4), foe = at(15, 4)) => arena(open(24, 9, ch), { me, foe });
/** A battle where the rival only does what the test tells it to. */
function duel({ mine = [mk("ember")], theirs = [mk("grove")], map = field(), seed = 7, still = true, ...rest } = {}) {
  const b = newLiveBattle({ mine, theirs, map, rand: rng(seed), ...rest });
  if (still) b.ai.foe = null;
  return b;
}
/** Run for `secs`, stopping early if a question opens (or, if one is open, when it closes); returns every event. */
function run(b, secs) {
  const out = [];
  const wasOpen = !!b.quiz;
  for (let t = 0; t < secs - 1e-9 && (wasOpen ? !!b.quiz : !b.quiz); t += DT) out.push(...step(b, DT));
  return out;
}
const QUESTION = { uid: "w1", prompt: "palabra", sentence: "", options: ["word", "other", "thing", "more"], answer: 0, reverse: false };
const kinds = (events, kind) => events.filter((e) => e.kind === kind);

test("the type chart: like Pokemon's, every element hits two hard and two softly, and is hit hard by two", () => {
  assert.deepEqual(Object.keys(TYPE_CHART).sort(), [...TYPE_IDS].sort());
  for (const a of TYPE_IDS) {
    const row = TYPE_CHART[a];
    assert.equal(row.strong.length, 2, `${a} is strong against two`);
    assert.equal(row.weak.length, 2, `${a} is weak against two`);
    assert.ok(row.weak.includes(a), `${a} is weak against its own element`);
    assert.ok(!row.strong.some((d) => row.weak.includes(d)));
    for (const d of row.strong) assert.equal(matchup(a, d), STRONG);
    for (const d of row.weak) assert.equal(matchup(a, d), WEAK);
    const def = defenceOf(a);
    assert.equal(def.weakTo.length, 2, `two elements hit ${a} hard`);
    assert.equal(def.resists.length, 2, `${a} shrugs off two`);
    // never both ways: if A beats B, B doesn't beat A
    for (const d of row.strong) assert.ok(!TYPE_CHART[d].strong.includes(a), `${a} and ${d} don't both beat each other`);
  }
  assert.equal(matchup("tide", "ember"), STRONG);
  assert.equal(matchup("ember", "tide"), WEAK);
  assert.equal(matchup("ember", "spark"), 1);
  assert.equal(matchup(null, "ember"), 1, "a plain move hits everyone the same");
  assert.ok(STRONG > 1 && WEAK < 1);
});

test("every move has a real-time form with its numbers", () => {
  for (const m of MOVES) {
    const lm = liveMove(m);
    assert.ok(LIVE_FORMS[lm.form], `${m.id} has a known form`);
    assert.ok(lm.cooldown > 0, `${m.id} cools down`);
    assert.ok(Number.isFinite(lm.range), `${m.id} has a range`);
    if (m.kind === "attack") assert.ok(["shot", "homing", "beam", "burst", "drop", "dash"].includes(lm.form), `${m.id} is an attack form`);
    if (m.style === "charge") assert.ok(lm.windup > 0, `${m.id} winds up`);
    else assert.equal(lm.windup, 0);
    if (m.kind === "terrain") assert.ok(lm.terrain && ["self", "foe", "row"].includes(lm.where), `${m.id} lays live ground`);
    if (lm.form === "shot" || lm.form === "homing") assert.ok(lm.speed > 0 && lm.r > 0);
    if (lm.form === "drop" || lm.form === "burst") assert.ok(lm.r > 0 && lm.warn > 0);
  }
  for (const s of Object.keys(MOVE_STYLES)) assert.ok(LIVE_STYLE_TEXT[s], `the ${s} style is explained for live battles`);
  assert.equal(liveMove(moveById("zap")).form, "shot");
  assert.equal(liveMove(moveById("rockslide")).form, "drop");
  assert.equal(liveMove(moveById("wildfire")).form, "burst");
  assert.equal(liveMove(moveById("seeker")).form, "homing");
  assert.equal(liveMove(moveById("pounce")).form, "dash");
  assert.equal(liveMove(moveById("dawn_ray")).form, "beam");
  assert.ok(liveMove(moveById("quick_jab")).cooldown < liveMove(moveById("tackle")).cooldown, "quick moves are ready again sooner");
});

test("moving: fluid, with speed-up and slow-down, inside the arena, stopped by walls and boulders", () => {
  const b = duel();
  const me = current(b, "me");
  input(b, { move: { x: 1, y: 0 } });
  step(b, DT);
  assert.ok(me.vx > 0 && me.vx < speedOf(me.spd) / 2, "it speeds up rather than jumping to full speed");
  run(b, 1);
  assert.ok(Math.abs(me.vx - speedOf(me.spd)) < 0.5, "then runs at its top speed");
  assert.equal(view(b).me.face, 1, "facing the way it runs");
  assert.ok(view(b).me.moving);
  const x = me.x;
  input(b, { move: null });
  run(b, 0.6);
  assert.equal(me.vx, 0);
  assert.ok(me.x > x && me.x - x < 30, "it slows to a stop");
  input(b, { move: { x: -1, y: -1 } });
  run(b, 0.5);
  assert.equal(view(b).me.face, -1, "it turned to face left");
  run(b, 4);
  assert.ok(me.x >= FEET.rx && me.y >= FEET.ry, "the arena's edge stops it");
  assert.equal(view(b).me.face, 1, "standing still, it faces the rival");

  // A wall, and a boulder.
  const map = arena(["........w.......", "........w.......", "....o...w.......", "........w......."], { me: at(1, 0), foe: at(14, 0) });
  const w = duel({ map });
  const f = current(w, "me");
  input(w, { move: { x: 1, y: 0 } });
  run(w, 2);
  assert.ok(f.x + FEET.rx <= 8 * TILE + 0.01 && f.x > 7 * TILE, "it stops against the wall");
  const v = duel({ map: arena(["........w.......", "........w.......", "....o...w.......", "........w......."], { me: at(1, 2), foe: at(14, 0) }) });
  input(v, { move: { x: 1, y: 0 } });
  run(v, 1);
  assert.ok(current(v, "me").x + FEET.rx <= 4 * TILE + 0.01, "a boulder stops it too");
});

test("click or tap to move: it walks there around obstacles, and fits through a one-tile gap", () => {
  const map = arena([
    "..........w.........",
    "..........w.........",
    "..........w.........",
    "....................", // the only way through: one tile wide
    "..........w.........",
    "..........w.........",
  ], { me: at(2, 1), foe: at(18, 5) });
  const b = duel({ map });
  const me = current(b, "me");
  const goal = at(16, 1);
  input(b, { goTo: goal });
  run(b, 6);
  assert.ok(Math.hypot(me.x - goal.x, me.y - goal.y) < 2, `it got there (${me.x.toFixed(1)}, ${me.y.toFixed(1)})`);
  assert.equal(b.ctl.me.dest, null, "and stopped");
  // A stick push cancels the walk; goTo null cancels it too.
  input(b, { goTo: at(2, 1) });
  input(b, { move: { x: 0, y: 1 } });
  assert.equal(b.ctl.me.dest, null);
  input(b, { move: null, goTo: at(2, 1) });
  input(b, { goTo: null });
  assert.equal(b.ctl.me.dest, null);
});

test("the ground under its feet: mud slows, ice slides, deep water only for swimmers and floaters", () => {
  const topOn = (ch) => {
    const b = duel({ map: field(ch) });
    input(b, { move: { x: 1, y: 0 } });
    run(b, 1.5);
    return current(b, "me").speed;
  };
  const grass = topOn(".");
  assert.ok(Math.abs(grass - speedOf(20)) < 1);
  assert.ok(topOn("m") < grass * 0.7, "mud is much slower");
  assert.ok(topOn("g") < grass, "tall grass is a little slower");
  const slideOn = (ch) => {
    const b = duel({ map: field(ch) });
    const me = current(b, "me");
    input(b, { move: { x: 1, y: 0 } });
    run(b, 1);
    const x = me.x;
    input(b, { move: null });
    run(b, 1);
    return me.x - x;
  };
  assert.ok(slideOn("i") > slideOn(".") * 3, "on ice it keeps sliding");

  const lake = arena(["......dddd......", "......dddd......", "......dddd......"], { me: at(2, 1), foe: at(14, 1) });
  const crossed = (type, species) => {
    const b = duel({ map: lake, mine: [mk(type, { species })] });
    input(b, { move: { x: 1, y: 0 } });
    run(b, 3);
    return current(b, "me").x > 10 * TILE;
  };
  assert.equal(crossed("ember", "biped"), false, "a walker can't go into deep water");
  assert.equal(crossed("tide", "biped"), true, "a tide creature swims");
  assert.equal(crossed("ember", "floater"), true, "a floater floats over");
});

test("the ground changes the fight: high ground hits harder, tall grass defends, coals burn, springs heal", () => {
  const dmgFrom = (mine, foe) => {
    const b = duel({ map: arena([mine + "........" + foe], { me: at(0, 0), foe: at(9, 0) }) });
    useNow(b, "me", "tackle");
    return kinds(run(b, 1), "hit")[0].dmg;
  };
  const plain = dmgFrom(".", ".");
  assert.ok(dmgFrom("h", ".") > plain, "attacks from high ground hit harder");
  assert.ok(dmgFrom(".", "g") < plain, "a creature in tall grass takes less");

  const burnt = (type) => {
    const b = duel({ map: field("c"), mine: [mk(type)] });
    return kinds(run(b, 3.05), "terrain-tick").filter((e) => e.side === "me");
  };
  assert.equal(burnt("grove").length, 3, "hot coals burn once a second");
  assert.ok(burnt("grove").every((e) => e.dmg > 0 && e.terrain === "coals"));
  assert.equal(burnt("ember").length, 0, "but never an Ember creature: the coals favour it");
  const fire = duel({ map: field("c"), mine: [mk("ember")] });
  assert.ok(view(fire).me.ground.atk > 1, "and it hits harder there");

  const b = duel({ map: field("s") });
  const me = current(b, "me");
  me.hp = 50;
  const ticks = kinds(run(b, 2.05), "terrain-tick").filter((e) => e.side === "me");
  assert.equal(ticks.length, 2);
  assert.ok(me.hp > 50 && ticks.every((e) => e.heal > 0), "a spring heals");
  assert.ok(view(b).me.statuses.some((s) => s.id === "wet" && s.ground), "the ground's status shows");
  me.hp = 10;
  run(b, 120);
  assert.ok(me.hp < 70, `the ground heals at most half a creature's health a battle, so nobody can camp on it for ever (${me.hp})`);
});

test("pressing a move freezes the action for a question with a 5 second timer", () => {
  const b = duel({ ask: () => QUESTION, still: false, foeForm: 0.9 });
  run(b, 0.5);
  input(b, { attack: "tackle", move: { x: 0, y: 1 } });
  const opened = step(b, DT);
  assert.equal(kinds(opened, "quiz").length, 1);
  assert.deepEqual(b.quiz.q, QUESTION);
  assert.equal(b.quiz.timeLeft, QUIZ_S);
  const snap = JSON.stringify([b.time, b.mine, b.theirs, b.fx]);
  for (let i = 0; i < 60; i++) assert.deepEqual(step(b, DT), [], "nothing happens while the question is open");
  assert.equal(JSON.stringify([b.time, b.mine, b.theirs, b.fx]), snap, "the world stood still, the rival too");
  assert.ok(Math.abs(b.quiz.timeLeft - (QUIZ_S - 1)) < 1e-6, "only the timer ran");
  assert.equal(view(b).quiz.total, QUIZ_S);
  input(b, { attack: "tackle" });
  assert.deepEqual(step(b, DT), [], "another press waits");

  // Out of time: the move fails, and still cools down.
  const out = run(b, QUIZ_S);
  const failed = kinds(out, "failed")[0];
  assert.ok(failed && failed.why === "time" && failed.side === "me");
  assert.equal(kinds(out, "answer")[0].correct, false);
  assert.equal(b.quiz, null);
  assert.equal(whyNot(b, "me", "tackle"), "busy", "a short pause after any move");
  run(b, RECOVER_S + 0.05);
  assert.equal(whyNot(b, "me", "tackle"), "cooldown", "then the move's own cooldown");
  assert.equal(b.answers.wrong, 1);

  // A wrong answer fails it ("failed"); a right one sets it off.
  const w = duel({ ask: () => QUESTION });
  input(w, { attack: "tackle" });
  step(w, DT);
  const wrong = answer(w, 2);
  assert.equal(kinds(wrong, "failed")[0].why, "wrong");
  assert.equal(kinds(wrong, "answer")[0].right, 0, "the right choice is told, to mark it");
  assert.equal(kinds(wrong, "attack").length, 0);
  const r = duel({ ask: () => QUESTION });
  input(r, { attack: "tackle" });
  step(r, DT);
  const right = answer(r, 0);
  assert.equal(right[0].kind, "answer");
  assert.ok(right[0].correct && right[0].fast && right[0].uid === "w1");
  assert.equal(kinds(right, "attack")[0].move, "tackle");
  assert.equal(kinds(right, "projectile").length, 1);
  assert.deepEqual(answer(r, 0), [], "nothing to answer now");
  assert.equal(kinds(run(r, RECOVER_S + 0.1), "hit").length, 1);
  assert.deepEqual(r.answers, { right: 1, wrong: 0, fast: 1 });

  // A move on cooldown is refused, and with nothing to ask a move just goes.
  input(r, { attack: "tackle" });
  assert.equal(kinds(step(r, DT), "refused")[0].why, "cooldown");
  const n = duel({ ask: () => null });
  input(n, { attack: "tackle" });
  const ev = step(n, DT);
  assert.equal(n.quiz, null);
  assert.equal(kinds(ev, "attack").length, 1);
});

test("fast answers build a combo; a slow right answer ends it; a wrong one fails the move", () => {
  const b = duel({ ask: () => QUESTION, theirs: [mk("grove", { hp: 5000 })] });
  const me = current(b, "me");
  const press = (wait) => {
    me.cd = {};
    me.recover = 0;
    input(b, { attack: "tackle" });
    step(b, DT);
    b.quiz.timeLeft -= wait;
    return answer(b, 0);
  };
  const powers = [];
  for (let i = 0; i < 5; i++) powers.push(kinds(press(0.5), "attack")[0].power);
  assert.deepEqual(powers.map((p) => +(p / 1.1).toFixed(3)), [COMBO[0], COMBO[1], COMBO[2], COMBO[3], COMBO[3]]);
  assert.equal(b.combo, COMBO.length - 1);
  assert.equal(view(b).combo, COMBO.length - 1);
  const slow = press(FAST_S + 0.5);
  assert.equal(kinds(slow, "answer")[0].fast, false);
  assert.equal(kinds(slow, "attack")[0].power, COMBO[3], "the chain still powers this one");
  assert.equal(b.combo, 0, "then it's over");
});

test("shots fly straight: step aside and they miss; boulders stop them", () => {
  const b = duel();
  useNow(b, "me", "tackle");
  assert.equal(kinds(run(b, 1.5), "hit").length, 1, "a creature standing still is hit");

  const d = duel();
  useNow(d, "me", "tackle");
  d.ctl.foe.move = { x: 0, y: 1 };
  const ev = run(d, 1.5);
  assert.equal(kinds(ev, "hit").length, 0);
  assert.ok(["range", "wall"].includes(kinds(ev, "miss")[0].why), "it flew past");

  const rock = duel({ map: arena(["..........o.........."], { me: at(2, 0), foe: at(18, 0) }) });
  useNow(rock, "me", "tackle");
  const blocked = run(rock, 1.5);
  assert.equal(kinds(blocked, "hit").length, 0);
  assert.equal(kinds(blocked, "miss")[0].why, "wall");
  const far = duel({ map: arena([".".repeat(40)], { me: at(1, 0), foe: at(38, 0) }) });
  assert.equal(inRange(far, "me", "tackle"), false);
  useNow(far, "me", "tackle");
  assert.equal(kinds(run(far, 2), "miss")[0].why, "range", "it falls short");
});

test("a move is \"in range\" exactly when it would land: a still rival just inside its reach is hit, just outside is not", () => {
  // the owner: moves showed "Out of range" while the rival was in range (the button used one rough distance per move)
  for (const id of ["tackle", "seeker", "dawn_ray", "wildfire", "rockslide", "charge"]) { // shot, homing, beam, burst, drop, dash
    for (const [ux, uy] of [[1, 0], [0, -1], [0.6, 0.8]]) {
      const reach = reachOf(liveMove(moveById(id)), ux, uy);
      for (const [d, lands] of [[reach - 3, true], [reach + 4, false]]) {
        const b = duel({ mine: [mk("ember", { moves: [id], hp: 5000 })], theirs: [mk("grove", { hp: 5000 })], map: arena(open(60, 40), { me: at(30, 20), foe: at(40, 20) }) });
        const me = current(b, "me"), foe = current(b, "foe");
        foe.x = me.x + ux * d;
        foe.y = me.y + uy * d;
        me.grace = foe.grace = 0;
        const said = `${id} with the rival ${d.toFixed(0)} px away (${ux}, ${uy})`;
        assert.equal(inRange(b, "me", id), lands, `${said}: ${lands ? "in" : "out of"} range`);
        useNow(b, "me", id);
        assert.equal(kinds(run(b, 3), "hit").length, lands ? 1 : 0, `${said}: ${lands ? "lands" : "misses"}`);
      }
    }
  }
  // the areas are a good 1.4 times wider than they were (the owner: harder to dodge)
  assert.ok(liveMove(moveById("rockslide")).r >= 40 && liveMove(moveById("wildfire")).r >= 60 && liveMove(moveById("meteor")).r >= 60);
});

test("drops land where the rival stood, beams hit along a line, homing shots follow, dashes rush in", () => {
  const near = () => field(".", at(6, 4), at(14, 4));
  const drop = (moving) => {
    const b = duel({ map: near(), mine: [mk("stone", { moves: ["rockslide"] })] });
    const ev = useNow(b, "me", "rockslide");
    const area = kinds(ev, "area")[0];
    assert.ok(Math.abs(area.x - current(b, "foe").x) < 1 && area.r > 0, "it marks the rival's spot");
    assert.equal(view(b).fx[0].warn, true, "a warning first");
    if (moving) b.ctl.foe.move = { x: 0, y: -1 };
    return run(b, 1.2);
  };
  assert.equal(kinds(drop(false), "hit").length, 1);
  const dodged = drop(true);
  assert.equal(kinds(dodged, "hit").length, 0);
  assert.equal(kinds(dodged, "miss")[0].why, "dodged", "moving off the circle dodges it");

  const beam = duel({ map: near(), mine: [mk("spark", { moves: ["dawn_ray"] })] });
  const bev = kinds(useNow(beam, "me", "dawn_ray"), "beam")[0];
  assert.ok(bev.len > 0 && bev.warn > 0);
  assert.equal(kinds(run(beam, 1), "hit").length, 1);

  const homing = duel({ map: field(".", at(6, 1), at(14, 1)), mine: [mk("ember", { moves: ["seeker"] })] });
  useNow(homing, "me", "seeker");
  homing.ctl.foe.move = { x: 0, y: 1 };
  assert.equal(kinds(run(homing, 2.5), "hit").length, 1, "it followed the rival");

  const dash = duel({ map: field(".", at(6, 4), at(11, 4)), mine: [mk("ember", { moves: ["pounce"] })] });
  const x0 = current(dash, "me").x;
  assert.equal(kinds(useNow(dash, "me", "pounce"), "dash").length, 1);
  const hits = kinds(run(dash, 1), "hit");
  assert.equal(hits.length, 1);
  assert.ok(current(dash, "me").x > x0 + 40, "the creature itself rushed in");
});

test("charges wind up rooted to the spot, and an interrupt cancels them", () => {
  const b = duel({ map: field(".", at(6, 4), at(14, 4)), mine: [mk("spark", { moves: ["startle"] })], theirs: [mk("spark", { moves: ["thunderhead"] })] });
  const foe = current(b, "foe");
  const ev = useNow(b, "foe", "thunderhead");
  const charge = kinds(ev, "charge")[0];
  assert.ok(charge && charge.total > 1 && charge.area.dx < 0, "it aims at the player as it starts");
  b.ctl.foe.move = { x: 0, y: 1 };
  run(b, 0.3);
  assert.ok(Math.abs(foe.y - at(14, 4).y) < 0.01, "it can't move while winding up");
  assert.ok(view(b).foe.charging.t > 0.1);
  useNow(b, "me", "startle");
  const after = run(b, 1.5);
  assert.equal(kinds(after, "interrupt").length, 1);
  assert.equal(foe.charging, null);
  assert.equal(kinds(after, "beam").length, 0, "the charge never went off");

  const c = duel({ map: field(".", at(6, 4), at(14, 4)), theirs: [mk("spark", { moves: ["thunderhead"] })] });
  useNow(c, "foe", "thunderhead");
  const landed = run(c, 2.5);
  assert.equal(kinds(landed, "beam").length, 1, "left alone, it goes off");
  const big = kinds(landed, "hit")[0];
  assert.ok(big && big.dmg > 40, "and hits hard");
});

test("guard, heal, power-up, haste and delay do what they say", () => {
  const hitBy = (prep) => {
    const b = duel({ mine: [mk("ember", { moves: ["tackle", "focus"] })], theirs: [mk("grove", { moves: ["guard", "trip"] })] });
    prep(b);
    current(b, "me").recover = 0;
    useNow(b, "me", "tackle");
    return kinds(run(b, 1.5), "hit")[0];
  };
  const plain = hitBy(() => {});
  const guarded = hitBy((b) => useNow(b, "foe", "guard"));
  assert.ok(guarded.guarded && guarded.dmg < plain.dmg * 0.7, "a guard blocks part of the next hit");
  const boosted = hitBy((b) => assert.equal(kinds(useNow(b, "me", "focus"), "boost")[0].buff, "atk"));
  assert.ok(boosted.dmg > plain.dmg, "a power-up makes the next attacks stronger");

  const h = duel({ mine: [mk("ember", { moves: ["mend"] })] });
  const me = current(h, "me");
  for (let i = 0; i < 2; i++) {
    me.hp = 40;
    me.cd = {};
    me.recover = 0;
    const heal = kinds(useNow(h, "me", "mend"), "heal")[0];
    assert.ok(heal.amount > 0 && me.hp > 40);
  }
  me.cd = {};
  me.recover = 0;
  assert.equal(whyNot(h, "me", "mend"), "used up", "twice a battle");
  assert.equal(view(h).moves[0].uses, 0);

  const fast = duel({ mine: [mk("ember", { moves: ["haste"] })] });
  useNow(fast, "me", "haste");
  input(fast, { move: { x: 1, y: 0 } });
  run(fast, 1);
  assert.ok(current(fast, "me").speed > speedOf(20) * 1.2, "haste: faster");
  assert.ok(view(fast).me.statuses.some((s) => s.id === "haste"));

  const t = duel({ map: field(".", at(6, 4), at(12, 4)), mine: [mk("ember", { moves: ["trip"] })], theirs: [mk("grove", { moves: ["tackle"] })] });
  useNow(t, "me", "trip");
  const tripped = kinds(run(t, 1), "hit")[0];
  assert.ok(tripped.delayed);
  assert.ok(current(t, "foe").cd.tackle > 0.5, "its moves are held back");
  assert.ok(view(t).foe.statuses.some((s) => s.id === "slow"), "and it is slowed");
});

test("terrain moves repaint the ground: a spring at your feet, coals under the rival, a strip of mud", () => {
  const map = arena(open(24, 9).map((line, r) => (r === 4 ? line.slice(0, 12) + "w" + line.slice(13) : line)), { me: at(4, 4), foe: at(18, 4) });
  const b = duel({ map, mine: [mk("grove", { moves: ["bloom", "scorch", "mudslide"] })] });
  const bloom = kinds(useNow(b, "me", "bloom"), "terrain-change")[0];
  assert.equal(bloom.terrain, "spring");
  assert.equal(bloom.tiles.length, 9, "a 3x3 patch");
  assert.equal(b.map.tiles[4 * 24 + 4], "spring");
  assert.equal(map.tiles[4 * 24 + 4], "grass", "the map given isn't changed");
  assert.equal(view(b).me.terrain, "spring");
  const me = current(b, "me");
  me.cd = {};
  me.recover = 0;
  const scorch = kinds(useNow(b, "me", "scorch"), "terrain-change")[0];
  assert.equal(scorch.terrain, "coals");
  assert.equal(view(b).foe.terrain, "coals", "under the rival");
  me.cd = {};
  me.recover = 0;
  const mud = kinds(useNow(b, "me", "mudslide"), "terrain-change")[0];
  assert.equal(mud.terrain, "mud");
  assert.ok(mud.tiles.length >= 5);
  assert.ok(!mud.tiles.some((t) => t.r === 4 && t.c === 12), "a wall is never repainted");
  assert.equal(b.map.tiles[4 * 24 + 12], "wall");
});

test("a creature faints, the next steps in, the last one ends it; rewards are as before", () => {
  const b = duel({ mine: [mk("tide")], theirs: [mk("ember", { hp: 1 }), mk("ember", { hp: 1 })], mode: "wild" });
  useNow(b, "me", "tackle");
  const ev = run(b, 1);
  assert.equal(kinds(ev, "faint")[0].side, "foe");
  assert.equal(b.foe, 0, "the next waits while the first faints");
  assert.equal(view(b).foe.act.kind, "faint");
  const swap = kinds(run(b, FAINT_S + 0.1), "swap")[0];
  assert.ok(swap && swap.side === "foe" && swap.index === 1);
  assert.equal(b.foe, 1);
  const second = current(b, "foe");
  assert.ok(view(b).foe.grace, "just stepped in: it can't be hit for a moment");
  assert.deepEqual(view(b).teams.foe.map((t) => t.fainted), [true, false]);
  const me = current(b, "me");
  me.cd = {};
  me.recover = 0;
  run(b, 1);
  useNow(b, "me", "tackle");
  const end = run(b, 2);
  assert.equal(kinds(end, "end")[0].won, true);
  assert.ok(b.over && b.won && second.fainted);
  assert.deepEqual(step(b, DT), [], "nothing happens once it's over");
  const result = battleResult(b);
  assert.deepEqual(result, { mode: "wild", won: true, flawless: false, comeback: false, rival: null });
  const s = newState(5);
  const pay = finishBattle(s, result, { now: new Date("2026-11-01T10:00:00"), rand: () => 0.9 });
  assert.equal(pay.xp, 3, "a win pays what rules.js pays now (no word made well known: 3)");
  assert.ok(pay.coins > 0);

  // Answering every question right, and winning from the brink, are feats.
  const f = duel({ mine: [mk("tide", { hp: 100 })], theirs: [mk("ember", { hp: 1 })], ask: () => QUESTION, mode: "friend", rival: { id: "x", name: "Sam", rating: 1000 } });
  current(f, "me").hp = 10;
  for (let i = 0; i < 3; i++) {
    const m = current(f, "me");
    m.cd = {};
    m.recover = 0;
    current(f, "foe").hp = 1000;
    input(f, { attack: "tackle" });
    step(f, DT);
    answer(f, 0);
    run(f, 0.1);
  }
  current(f, "foe").hp = 1;
  run(f, 2);
  assert.ok(f.over && f.won);
  const fr = battleResult(f);
  assert.ok(fr.flawless && fr.comeback);
  assert.equal(fr.rival.name, "Sam");

  const lost = duel({ mine: [mk("tide", { hp: 1 })], theirs: [mk("ember")] });
  useNow(lost, "foe", "tackle");
  run(lost, 2);
  assert.ok(lost.over && lost.won === false);
  assert.equal(battleResult(lost).won, false);
});

test("word modes: the last 100 words at one level, or every card with creatures scaled by cards saved", () => {
  assert.equal(cardScale(0), 1);
  assert.ok(Math.abs(cardScale(200) - 1.25) < 1e-9);
  assert.ok(Math.abs(cardScale(600) - 1.5) < 1e-9);
  assert.equal(cardScale(3000), 2);
  assert.equal(cardScale(1e6), 2, "never more than double");
  assert.ok(cardScale(500) > cardScale(400), "every card helps a little");
  assert.equal(wordModeOf("unlimited"), "alltime", "the old name still works");
  assert.equal(wordModeOf("alltime"), "alltime");
  assert.equal(wordModeOf(undefined), "last100");

  const vocab = Array.from({ length: 150 }, (_, i) => ({ uid: `v${i}`, text: `w${i}`, meaning: `m${i}`, created_at: i }));
  vocab.push({ uid: "blank", text: "x", meaning: "", created_at: 999 });
  assert.equal(wordPool(vocab, "last100").length, 100);
  assert.equal(wordPool(vocab, "last100")[0].uid, "v149", "the newest first");
  assert.equal(wordPool(vocab, "alltime").length, 150, "every card with a meaning");

  const level = duel({ wordMode: "last100", cards: { me: 3000, foe: 3000 } });
  assert.equal(current(level, "me").max, 100, "last 100: everyone at the same level");
  const all = duel({ wordMode: "alltime", cards: { me: 600 } });
  const me = current(all, "me");
  assert.equal(me.max, 150);
  assert.equal(me.atk, 30);
  assert.equal(me.def, 30);
  assert.equal(me.spd, 20, "speed isn't scaled");
  assert.equal(current(all, "foe").max, 100, "a wild foe is never scaled");
  const friend = duel({ wordMode: "unlimited", cards: { me: 0, foe: 3000 } });
  assert.equal(current(friend, "foe").max, 200, "a friend's creatures by their own cards");
});

test("the rival plays in real time: it moves, attacks without asking the player anything, and fails as often as its owner", () => {
  const b = duel({ still: false, foeForm: 0.35, seed: 11, theirs: [mk("grove", { moves: ["tackle", "vine", "overgrowth"] })], mine: [mk("ember", { hp: 100000 })] });
  const start = { ...at(15, 4) };
  const ev = run(b, 60);
  assert.equal(b.quiz, null, "its moves never open a question");
  const foe = current(b, "foe");
  assert.ok(Math.hypot(foe.x - start.x, foe.y - start.y) > 16, "it moved");
  const tries = kinds(ev, "attack").filter((e) => e.side === "foe").length + kinds(ev, "failed").filter((e) => e.side === "foe").length;
  const fails = kinds(ev, "failed").filter((e) => e.side === "foe").length;
  assert.ok(tries >= 15, `it kept attacking (${tries})`);
  assert.ok(fails / tries > 0.45 && fails / tries < 0.85, `about 65% of its moves fail at 35% (${fails}/${tries})`);
  assert.ok(kinds(ev, "hit").some((e) => e.side === "foe"), "and some land");

  // It gets out of the way of what's coming.
  const d = duel({ still: false, foeForm: 0.95, seed: 3, theirs: [mk("grove", { hp: 100000, moves: ["guard"] })], map: field(".", at(3, 4), at(16, 4)) });
  let dodged = 0, shots = 0;
  for (let i = 0; i < 12; i++) {
    const me = current(d, "me");
    me.cd = {};
    me.recover = 0;
    useNow(d, "me", "tackle");
    shots++;
    dodged += kinds(run(d, 1.6), "miss").filter((e) => e.side === "me").length;
  }
  assert.ok(dodged >= 3, `a sharp rival dodges some shots (${dodged}/${shots})`);
});

test("whole battles are the same every time with the same seed, and they end", () => {
  const play = (seed) => {
    const rand = rng(seed);
    const mine = fighters({ tags: [], attacks: [] }, wildTeam(rand, 3).map((g) => ({ ...g, growth: 0.9 })), { wild: true });
    const theirs = fighters(null, wildTeam(rand, 3));
    const b = newLiveBattle({ mine, theirs, rand, auto: true, foeForm: 0.7, ask: () => QUESTION, mode: "wild" });
    const log = [];
    for (let i = 0; i < 60 * 400 && !b.over; i++) {
      if (b.quiz) { b.quiz.timeLeft -= 1 + rand() * 2; log.push(...answer(b, rand() < 0.8 ? 0 : 1)); continue; }
      log.push(...step(b, DT));
    }
    return { b, log };
  };
  const a = play(42), c = play(42);
  assert.ok(a.b.over, "it ended");
  assert.equal(JSON.stringify(a.log), JSON.stringify(c.log), "the same seed plays out the same");
  assert.equal(a.b.won, c.b.won);
  for (const k of ["attack", "hit", "faint", "swap", "end", "quiz", "answer"]) assert.ok(kinds(a.log, k).length, `a battle has ${k} events`);
  assert.ok(a.log.every((e) => e.kind === "end" || (e.side && Number.isFinite(e.x) && Number.isFinite(e.y))), "every event says who and where");
  // The default arena (when no map is given) is laid out from the seed too.
  assert.ok(a.b.map.tiles.length === a.b.map.cols * a.b.map.rows);
});

test("view: everything the screen draws", () => {
  const b = duel({ mine: [mk("ember", { moves: ["tackle", "guard", "cinder", "mend"] }), mk("tide")], theirs: [mk("grove")], mode: "wild" });
  useNow(b, "me", "cinder");
  run(b, 0.1);
  const v = view(b);
  for (const k of ["time", "over", "won", "combo", "quiz", "map", "width", "height", "me", "foe", "teams", "index", "moves", "fx", "potion"]) assert.ok(k in v, k);
  for (const k of ["x", "y", "face", "moving", "speed", "hp", "max", "type", "look", "name", "act", "statuses", "terrain", "charging", "fainted"]) assert.ok(k in v.me, k);
  assert.equal(v.me.act.kind, "lunge");
  assert.ok(v.me.act.t > 0 && v.me.act.t < 1);
  assert.equal(v.teams.me.length, 2);
  assert.deepEqual(v.index, { me: 0, foe: 0 });
  const cinder = v.moves.find((m) => m.id === "cinder");
  assert.ok(!cinder.ready && cinder.left > 0 && cinder.total > 0 && cinder.element === "ember" && cinder.form === "shot");
  assert.ok(typeof cinder.inRange === "boolean");
  assert.equal(v.fx.length, 1);
  assert.equal(v.fx[0].kind, "projectile");
  assert.ok(v.fx[0].dir.x > 0.9, "flying toward the rival");
  assert.equal(v.width, 24 * TILE);

  // A potion, in wild battles only, once.
  current(b, "me").hp = 30;
  assert.ok(usePotion(b) > 0);
  assert.equal(usePotion(b), 0);
  const rental = duel({ mode: "rental" });
  current(rental, "me").hp = 30;
  assert.equal(usePotion(rental), 0);
});

test("fighters from battle.js work as they are", () => {
  const s = newState(9);
  s.creature.growth = 0.9;
  const mine = fighters(s, [s.creature]);
  const theirs = fighters(null, [{ ...newGenome(77), growth: 0.5 }]);
  const b = newLiveBattle({ mine, theirs, rand: rng(1) });
  const v = view(b);
  assert.equal(v.me.type, s.creature.type);
  assert.ok(v.me.look && v.me.look.beast, "its look, for drawing");
  assert.equal(v.moves.length, mine[0].moves.length);
  assert.ok(Number.isFinite(v.me.x) && Number.isFinite(v.foe.x) && v.me.x < v.foe.x, "the player starts on the left");
});

test("big arenas: the rival crosses the map round walls to find the player, and newcomers step in near the fight", () => {
  // 90 x 30 tiles, a wall all the way down with one gap at the bottom: the rival has to go round.
  const rows = Array.from({ length: 30 }, (_, r) => ".".repeat(45) + (r === 27 ? "." : "w") + ".".repeat(44));
  const map = arena(rows, { me: at(10, 5), foe: at(80, 5) });
  const b = duel({ map, still: false, foeForm: 0.8, seed: 5, mine: [mk("ember", { hp: 100000 })], theirs: [mk("grove", { moves: ["tackle", "vine"] })] });
  const foe = current(b, "foe");
  let met = null;
  for (let t = 0; t < 40 && met === null; t += DT) {
    const ev = step(b, DT);
    if (ev.some((e) => e.kind === "hit" && e.side === "foe")) met = b.time;
  }
  assert.ok(met !== null, "it found the player and hit it");
  assert.ok(met < 25, `soon enough (${met.toFixed(1)} s for about 1,300 px of walking round the wall)`);
  assert.ok(foe.x < 45 * TILE, "it came through the gap to the player's side");

  // A creature stepping in after a faint appears near the fight, not back at its far start.
  const s = duel({ map: arena(open(90, 30), { me: at(5, 15), foe: at(85, 15) }), theirs: [mk("grove", { hp: 1 }), mk("grove")] });
  const me = current(s, "me");
  me.x = 60 * TILE; // the fight has moved across the map, toward the rival's start
  current(s, "foe").x = 66 * TILE;
  useNow(s, "me", "tackle");
  run(s, 1);
  const swap = kinds(run(s, FAINT_S + 0.2), "swap")[0];
  assert.ok(swap, "the next one stepped in");
  const gap = Math.hypot(swap.x - me.x, swap.y - me.y);
  assert.ok(Math.abs(gap - ENTER_GAP) < 40, `about ${ENTER_GAP} px from the rival (${gap.toFixed(0)})`);
  assert.ok(swap.x > me.x, "on its own side");
  assert.ok(swap.x < 85 * TILE - 100, "not back at its start");
  // ...but at its start when that is nearer than the gap.
  const near = duel({ theirs: [mk("grove", { hp: 1 }), mk("grove")] });
  current(near, "me").x = 12 * TILE;
  useNow(near, "me", "tackle");
  run(near, 1);
  const back = kinds(run(near, FAINT_S + 0.2), "swap")[0];
  assert.ok(Math.abs(back.x - at(15, 4).x) < 2 && Math.abs(back.y - at(15, 4).y) < 2);
});

test("whole battles on generated big arenas end, about as long as on small ones", () => {
  const play = (seed, size) => {
    const rand = rng(seed);
    const mine = fighters({ tags: [], attacks: [] }, wildTeam(rand, 3).map((g) => ({ ...g, growth: 0.9 })), { wild: true });
    const theirs = fighters(null, wildTeam(rand, 3));
    const map = generateMap(seed, size);
    const b = newLiveBattle({ mine, theirs, map, rand, auto: true, foeForm: 0.7, ask: () => QUESTION, mode: "wild" });
    for (let i = 0; i < 60 * 300 && !b.over; i++) {
      if (b.quiz) { b.quiz.timeLeft -= 1 + rand() * 2; answer(b, rand() < 0.8 ? 0 : 1); continue; }
      step(b, DT);
    }
    return b;
  };
  let small = 0, big = 0;
  for (const seed of [21, 22, 23, 24]) {
    const a = play(seed, { cols: 30, rows: 18 }), c = play(seed, { cols: 90, rows: 54 });
    assert.ok(a.over && c.over, `seed ${seed} ended on both`);
    small += a.time;
    big += c.time;
  }
  assert.ok(big < small * 1.6, `big arenas don't drag on (${(big / 4).toFixed(0)} s against ${(small / 4).toFixed(0)} s)`);
});

test("the rival attacks only from inside the player's view, whatever the screen's shape", () => {
  const firstAttack = (sight, foeAt, extra = {}) => {
    const b = duel({ map: arena(open(60, 40), { me: at(30, 20), foe: foeAt }), still: false, foeForm: 0.9, seed: 9, sight,
      mine: [mk("ember", { hp: 100000 })], theirs: [mk("grove", { moves: ["tackle", "vine", "overgrowth"] })], ...extra });
    for (let t = 0; t < 30; t += DT) {
      const ev = step(b, DT);
      const a = ev.find((e) => e.kind === "attack" && e.side === "foe");
      if (a) return { dx: Math.abs(a.x - current(b, "me").x), dy: Math.abs(a.y - current(b, "me").y) };
    }
    return null;
  };
  const phone = firstAttack({ w: 360, h: 520 }, at(44, 20));
  assert.ok(phone && phone.dx <= 360 / 2, `an upright phone: it came within ${phone && phone.dx.toFixed(0)} px across before attacking`);
  const desk = firstAttack(SIGHT, at(30, 33));
  assert.ok(desk && desk.dy <= SIGHT.h / 2, `a computer: within ${desk && desk.dy.toFixed(0)} px up or down`);
  // The screen can change it during the battle (a phone turned round).
  const b = duel();
  input(b, { sight: { w: 560, h: 330 } });
  assert.deepEqual(b.sight, { w: 560, h: 330 });
  for (const m of MOVES) assert.ok(liveMove(m).range <= 260, `${m.id} reaches no further than the camera shows`);
  // A homing shot may come from just outside the view: it is slow, and shows up near the player in time.
  const far = firstAttack({ w: 360, h: 520 }, at(46, 20), { theirs: [mk("grove", { moves: ["seeker"] })] });
  assert.ok(far && far.dx > 360 / 2 - 30, `it fired its homing shot from outside the view (${far && far.dx.toFixed(0)} px across)`);
});

test("dungeon traps: spikes rise every 2 seconds and hurt whoever stands on them; the picture follows the same clock", () => {
  const rows = open(24, 9);
  rows[4] = ".....^^^................";
  const b = duel({ map: arena(rows, { me: at(6, 4), foe: at(18, 4) }) });
  const me = current(b, "me");
  const ev = run(b, 4.3);
  const hits = kinds(ev, "trap").filter((e) => e.trap === "spikes");
  assert.equal(hits.length, 2, "up at 2 s and at 4 s, not at the start");
  assert.ok(hits.every((e) => e.side === "me" && e.dmg === Math.round(me.max * 0.07)));
  assert.equal(current(b, "foe").hp, current(b, "foe").max, "the rival on grass is untouched");
  assert.ok(spikesUp(0.5) && !spikesUp(1.5) && spikesUp(2.2));
  assert.equal(spikeFrame(0.5), 2); assert.equal(spikeFrame(1.5), 0); assert.equal(spikeFrame(1.95), 1); assert.equal(spikeFrame(0.95), 3);
  assert.equal(SPIKE_S, 2);
});

test("dungeon traps: a swinging axe hits a creature in its path at the bottom of its swing and throws it along the swing", () => {
  const map = { ...field(".", at(6, 4)), hazards: [{ kind: "axe", x: 6 * TILE + 8, y: 4 * TILE + 8, period: 2, phase: 0, reach: 42 }] };
  const b = duel({ map });
  const ev = run(b, 3);
  const hits = kinds(ev, "trap").filter((e) => e.trap === "axe");
  assert.ok(hits.length >= 1 && hits.every((e) => e.side === "me"), "the creature standing under it is hit");
  assert.ok(hits.length <= 4, "not every step: once per pass at most");
  assert.equal(current(b, "foe").hp, current(b, "foe").max);
  const a = axeAngle({ period: 2, phase: 0 }, 0.5);
  assert.ok(Math.abs(a.deg - 60) < 1e-6, "a quarter of the way through, swung right out");
  assert.equal(axeAngle({ period: 2, phase: 0 }, 0).dir, 1);
});

test("hidden rooms: clicking a cracked wall walks the creature up to it and breaks it open; the way through is new", () => {
  const rows = [
    "DDDDDDDDDDDDDDDDDDDDDDDD",
    "DffffffffffffffffffffffD",
    "DffffffffffffffffffffffD",
    "DDDDDDDDDDxxDDDDDDDDDDDD",
    "DDDDDDDDDffffDDDDDDDDDDD",
    "DDDDDDDDDffffDDDDDDDDDDD",
    "DDDDDDDDDDDDDDDDDDDDDDDD",
  ];
  const map = { ...arena(rows, { me: at(3, 1), foe: at(20, 2) }), base: "stone_floor" };
  const b = duel({ map });
  assert.equal(crackAt(b, at(3, 1).x, at(3, 1).y), null, "no crack on open floor");
  const crack = crackAt(b, at(10, 3).x, at(10, 3).y);
  assert.deepEqual(crack, [3 * 24 + 10, 3 * 24 + 11], "the whole crack, from one of its tiles");
  assert.deepEqual(crackAt(b, at(11, 4).x, at(11, 4).y - 6), crack, "or a click just below it, on its face");
  const keys = b.map.propTiles;
  input(b, { open: at(10, 3) });
  const ev = run(b, 4);
  const open = kinds(ev, "wall-open");
  assert.equal(open.length, 1, "it walked over and broke it");
  assert.deepEqual(open[0].tiles.map((t) => [t.c, t.r]), [[10, 3], [11, 3]]);
  assert.equal(b.map.tiles[3 * 24 + 10], "stone_floor");
  assert.notEqual(b.map.propTiles, keys, "a fresh key for the way-finding cache");
  input(b, { goTo: at(10, 5) });
  run(b, 3);
  assert.ok(Math.abs(current(b, "me").y - at(10, 5).y) < 6, "and it can walk into the room");
});
