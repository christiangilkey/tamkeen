// Run with: node --test tests/js/
// Choosing a creature's four battle moves (game/movepick.js, shown by game/movesui.js): a move goes into a free slot
// or replaces the one the learner picks, nothing is ever dropped without asking, and at least one attack stays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { LIVE_COOLDOWN, MOVES, TYPES, moveIcon } from "../../web/js/game/data.js";
import { newGenome } from "../../web/js/game/genome.js";
import { newState } from "../../web/js/game/rules.js";
import { knownMoves, loadout, publicProfile } from "../../web/js/game/battle.js";
import { cleanGenome } from "../../web/js/game/remote.js";
import {
  HASTE_UP, SLOTS, SLOT_ORDER, benched, moveElement, moveFacts, onlyAttack, slotsOf, useMove, whyNot,
} from "../../web/js/game/movepick.js";

const kind = (id) => MOVES.find((m) => m.id === id).kind;
const hasAttack = (slots) => slots.some((id) => kind(id) === "attack");
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the slots are cleaned: real moves only, each once, at most four", () => {
  assert.deepEqual(slotsOf(["tackle", "nope", "tackle", "guard", "__proto__", "zap", "cinder", "splash"]), ["tackle", "guard", "zap", "cinder"]);
  assert.deepEqual(slotsOf(null), []);
  assert.equal(SLOTS, 4);
});

test("a new move fills a free slot; with all four full it asks which to replace and changes nothing", () => {
  const three = ["tackle", "guard", "zap"];
  assert.deepEqual(useMove(three, "thunderclap"), { slots: ["tackle", "guard", "zap", "thunderclap"], problem: "" });
  const four = ["tackle", "guard", "zap", "thunderclap"];
  const full = useMove(four, "charge");
  assert.equal(full.problem, "full", "the screen must ask which move to replace");
  assert.deepEqual(full.slots, four, "nothing is dropped without asking");
  assert.deepEqual(useMove(four, "charge", 1).slots, ["tackle", "charge", "zap", "thunderclap"], "the picked slot is replaced, the rest stay where they are");
  assert.equal(useMove(four, "zap", 0).problem, "already");
  assert.equal(useMove(four, "nope", 0).problem, "unknown");
  assert.deepEqual(useMove(three, "charge", 3).slots, ["tackle", "guard", "zap", "charge"], "an empty slot is filled");
});

test("at least one attacking move stays, and the screen can say so before it is tried", () => {
  const one = ["guard", "hoard", "charge", "mend"];
  assert.ok(onlyAttack(one, 2) && !onlyAttack(one, 0));
  assert.equal(whyNot(one, "iron_shell", 2), "attack", "the only attack can't be swapped for a move that doesn't attack");
  assert.equal(whyNot(one, "tackle", 2), "", "it can be swapped for another attack");
  assert.equal(whyNot(one, "iron_shell", 0), "", "the other slots can take anything");
  assert.equal(useMove(one, "iron_shell", 2).problem, "attack");
  assert.deepEqual(useMove(one, "iron_shell", 2).slots, one);
  const two = ["tackle", "guard", "zap", "hoard"];
  assert.ok(!onlyAttack(two, 0) && whyNot(two, "mend", 0) === "", "with two attacks either may go");
});

test("any series of picks keeps four or fewer, never loses a move silently, and always keeps an attack", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const ids = MOVES.map((m) => m.id);
  let slots = ["tackle"];
  for (let i = 0; i < 3000; i++) {
    const id = ids[Math.floor(rand() * ids.length)];
    const at = rand() < 0.3 ? null : Math.floor(rand() * SLOTS);
    const before = slots.slice();
    const r = useMove(slots, id, at);
    if (r.problem) { assert.deepEqual(r.slots, before); continue; }
    const gone = before.filter((x) => !r.slots.includes(x));
    assert.ok(gone.length === 0 || (gone.length === 1 && gone[0] === before[at]), "only the move in the chosen slot leaves");
    assert.ok(r.slots.length <= SLOTS && new Set(r.slots).size === r.slots.length);
    assert.ok(hasAttack(r.slots));
    slots = r.slots;
  }
});

test("the four picked are the four a battle uses, and friends receive them in the same format", () => {
  const s = newState(31);
  const g = { ...newGenome(31, "spark"), growth: 0.9, moves: [] };
  s.roster = [g];
  s.active = 0;
  s.attacks = ["hoard", "iron_shell"];
  const known = knownMoves(s, g);
  const now = slotsOf(loadout(s, g));
  assert.equal(now.length, 4);
  const extra = benched(known, now).find((m) => m.kind !== "attack");
  const r = useMove(now, extra.id, 0);
  assert.equal(r.problem, "");
  g.moves = r.slots;
  assert.deepEqual(loadout(s, g), r.slots, "battle.js loadout keeps the picks, in their slots");
  const team = publicProfile(s).team;
  assert.deepEqual(team[0].loadout, r.slots);
  assert.deepEqual(cleanGenome(team[0]).loadout, r.slots, "remote.js accepts them as they are");
});

test("the other moves are listed strongest attack first", () => {
  const s = newState(32);
  const g = { ...newGenome(32, "ember"), growth: 0.9, moves: [] };
  s.attacks = ["hoard", "meteor"];
  const rest = benched(knownMoves(s, g), ["tackle"]);
  assert.ok(!rest.some((m) => m.id === "tackle"));
  const firstNon = rest.findIndex((m) => m.kind !== "attack");
  assert.ok(rest.slice(firstNon).every((m) => m.kind !== "attack"), "attacks first");
  assert.ok(rest.slice(0, firstNon).every((m, i, a) => i === 0 || a[i - 1].power >= m.power), "strongest first");
});

test("every move has its numbers for the details popup", () => {
  const labels = new Set(["Power", "Blocks", "Heals", "Attack", "Speed", "Ground"]);
  for (const m of MOVES) {
    const f = moveFacts(m);
    assert.ok(f.kind && f.text, m.id);
    assert.ok(labels.has(f.effect.label), m.id);
    assert.ok(String(f.effect.value).length > 0, `${m.id} has a value`);
    assert.equal(f.wait, LIVE_COOLDOWN[m.style], m.id);
    assert.ok(existsSync(new URL(`../../web/game-art/${moveIcon(m)}.png`, import.meta.url)), `${m.id} has an icon`);
  }
  assert.deepEqual(moveFacts(MOVES.find((m) => m.id === "guard")).effect, { label: "Blocks", value: "50%" });
  assert.equal(moveFacts(MOVES.find((m) => m.id === "bloom")).effect.value, "Spring");
  assert.equal(moveFacts(MOVES.find((m) => m.id === "mudslide")).effect.value, "Mud", "the live arena's own ground name");
  const haste = read("web/js/game/livebattle.js").match(/HASTE = ([\d.]+)/);
  assert.equal(Math.round((Number(haste[1]) - 1) * 100), HASTE_UP, "the speed power-up's number matches the battle engine");
});

test("a move's element: its own, the creature's for Resonance, none for a plain move; every element has its icon", () => {
  const g = { type: "dusk" };
  assert.equal(moveElement(MOVES.find((m) => m.id === "zap"), g), "spark");
  assert.equal(moveElement(MOVES.find((m) => m.id === "resonance"), g), "dusk");
  assert.equal(moveElement(MOVES.find((m) => m.id === "tackle"), g), null);
  for (const t of Object.keys(TYPES)) assert.ok(existsSync(new URL(`../../web/game-art/icon/type_${t}.png`, import.meta.url)), t);
});

test("the card lays the slots out like the battle's buttons (X Y over A B)", () => {
  const places = [...read("web/js/game/livebattle-ui.js").matchAll(/\{ slot: (\d), action: "move\d"/g)].map((m) => Number(m[1]));
  assert.deepEqual(SLOT_ORDER, places);
  assert.deepEqual([...SLOT_ORDER].sort(), [0, 1, 2, 3]);
});
