// The battle party (web/js/game/battle.js partySeeds, setParty, placeInParty, eligible): the owner chooses which
// creatures fight and the order they come out, and every battle uses it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { eligible, partySeeds, placeInParty, publicProfile, ruleTeam, setParty } from "../../web/js/game/battle.js";
import { teamOf } from "../../web/js/game/battlescreen.js";
import { newGenome } from "../../web/js/game/genome.js";
import { newState, normalize } from "../../web/js/game/rules.js";
import { combine } from "../../web/js/game/merge.js";

/** A game with creatures of these elements (seed 101, 102, ...), all hatched unless the growth says otherwise. */
function gameWith(types, growths = []) {
  const s = newState(100);
  s.roster = types.map((ty, i) => Object.assign(newGenome(101 + i, ty), { growth: growths[i] ?? 0.5 }));
  s.active = 0;
  return s;
}
const seeds = (s, idx) => idx.map((i) => s.roster[i].seed);

test("no party chosen: as before, the creature in the habitat first, then the roster's order", () => {
  const s = gameWith(["ember", "tide", "grove", "stone"]);
  s.active = 2;
  assert.deepEqual(eligible(s), [2, 0, 1, 3]);
  assert.deepEqual(teamOf(s), [2, 0, 1]);
});

test("a chosen party comes out in its order, in every battle that uses the team", () => {
  const s = gameWith(["ember", "tide", "grove", "stone"]);
  setParty(s, [104, 102, 101], 1000);
  assert.deepEqual(seeds(s, teamOf(s)), [104, 102, 101]);
  // friends see (and fight) the same order
  assert.deepEqual(publicProfile(s, null).team.map((g) => g.seed), [104, 102, 101]);
  // a shorter party is topped up the usual way
  setParty(s, [103]);
  assert.deepEqual(seeds(s, teamOf(s)), [103, 101, 102]);
});

test("the week's element rule: a party member it leaves out isn't there, the next one steps up", () => {
  const s = gameWith(["ember", "tide", "ember", "grove"]);
  setParty(s, [102, 103, 101]); // tide, ember, ember
  const warm = { id: "warm", types: ["ember"], team: 3 };
  assert.deepEqual(seeds(s, teamOf(s, warm)), [103, 101]);
  // none of the rule's elements in the party or the roster: the usual team, in the party's order
  const cool = { id: "cool", types: ["spark"], team: 3 };
  assert.deepEqual(seeds(s, ruleTeam(s, cool)).slice(0, 3), [102, 103, 101]);
});

test("eggs, released creatures and repeats are never in the party", () => {
  const s = gameWith(["ember", "tide", "grove"], [0.5, 0, 0.5]); // 102 is still an egg
  setParty(s, [102, 103, 103, 999, 101, 101]);
  assert.deepEqual(s.party.seeds, [103, 101]);
  s.roster = s.roster.filter((g) => g.seed !== 103); // released
  assert.deepEqual(partySeeds(s), [101]);
  assert.deepEqual(partySeeds({ roster: s.roster, party: "junk" }), []);
  assert.deepEqual(partySeeds({ roster: s.roster }), []);
});

test("swapping and moving places", () => {
  assert.deepEqual(placeInParty([1, 2, 3], 0, 3), [3, 2, 1], "one in the team swaps with the one in its new place");
  assert.deepEqual(placeInParty([1, 2, 3], 1, 9), [1, 9, 3], "one from outside replaces the one there");
  assert.deepEqual(placeInParty([1, 2], 2, 9), [1, 2, 9], "an empty place is filled");
  assert.deepEqual(placeInParty([1, 2], 2, 1), [2, 1], "moving one past the end moves it last");
  assert.deepEqual(placeInParty([1, 2, 3], 2, 1), [3, 2, 1]);
});

test("the party is saved with the game, and the later choice wins when two devices' games are joined", () => {
  const s = gameWith(["ember", "tide", "grove"]);
  setParty(s, [103, 101, 102], 5000);
  const back = normalize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(seeds(back, teamOf(back)), [103, 101, 102]);
  const other = JSON.parse(JSON.stringify(s));
  setParty(other, [102, 103, 101], 9000);
  other.xp = 0;
  s.xp = 500;
  const both = combine(s, other);
  assert.deepEqual(both.party.seeds, [102, 103, 101]);
});
