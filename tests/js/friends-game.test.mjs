// Run with: node --test tests/js/
// The parts of the game that involve friends: what is shared, the league, the raid, gifts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOSSES, MOVES } from "../../web/js/game/data.js";
import { newGenome } from "../../web/js/game/genome.js";
import {
  answerQuestion, claimRaid, earn, giveEgg, giveItem, leaguePercent, newState, raidDamage, receiveGift, recordDefence, rollLeague,
  weekNumber, weeklyBoss,
} from "../../web/js/game/rules.js";
import { fighter, fits, publicProfile } from "../../web/js/game/battle.js";

const at = (iso) => new Date(iso);
const studyDay = (s, iso) => { for (let i = 0; i < 120; i++) earn(s, { type: "study", seconds: 5, mode: "read" }, { now: at(iso) }); };

test("what friends see: a team and a few numbers, never words", () => {
  const s = newState(41);
  s.roster = [newGenome(1, "ember"), newGenome(2, "tide"), newGenome(3, "grove"), newGenome(4, "dusk"), newGenome(5, "spark")];
  s.roster.forEach((g, i) => { g.growth = i === 2 ? 0 : 0.4; });
  s.roster[0].name = "Pip";
  s.review = { secretword: [3, 99999, 5, 1] };
  const now = at("2026-10-14T10:00:00");
  for (let i = 0; i < 20; i++) answerQuestion(s, `w${i}`, i % 5 !== 0, now);
  const p = publicProfile(s, null, now);
  assert.equal(p.team.length, 3, "at most three, eggs left out");
  assert.deepEqual(p.team.map((g) => g.seed), [1, 2, 4]);
  assert.equal(p.team[0].name, "Pip");
  assert.ok(p.team.every((g) => g.loadout.length >= 2 && g.loadout.every((id) => MOVES.some((m) => m.id === id))));
  assert.equal(p.form, 0.8);
  assert.equal(p.reviews, 16);
  assert.equal(p.week, weekNumber(now));
  const text = JSON.stringify(p);
  assert.ok(!text.includes("secretword") && !("review" in p) && !text.includes("traits"), "no words, no review history, no habits");
  assert.ok(text.length < 6000);
  assert.equal(publicProfile(s, { id: "solo", team: 1 }, now).team.length, 1);
  assert.deepEqual(publicProfile(s, { id: "cool", types: ["tide", "grove", "dusk"] }, now).team.map((g) => g.type), ["tide", "dusk"]);
});

test("a friend's published team is checked before it fights", () => {
  const good = { seed: 9, type: "ember", growth: 0.5, branch: null, loadout: ["cinder", "guard"] };
  assert.ok(fits(good, null));
  assert.ok(!fits({ ...good, growth: 0 }, null), "an egg cannot fight");
  assert.ok(!fits({ type: "ember" }, null), "nor can something that isn't a creature");
  assert.ok(!fits(good, { id: "cool", types: ["tide"] }));
  assert.ok(!fits({ ...good, branch: "echo" }, { id: "starters" }));
  const f = fighter(null, { ...good, loadout: ["cinder", "made_up", "hoard", "guard", "tackle", "zap"] });
  assert.deepEqual(f.moves, ["cinder", "hoard", "guard", "tackle"].slice(0, 4).filter((id) => id !== "made_up"), "only real moves, four at most");
  assert.deepEqual(fighter(null, { ...good, loadout: ["guard"] }).moves, ["guard", "tackle"], "always something to attack with");
  assert.ok(!fighter(null, { ...good, loadout: ["hoard", "cinder"] }, { rule: { id: "no_heal" } }).moves.includes("hoard"));
  const strong = fighter(null, { ...good, growth: 1, loadout: ["cinder"] });
  assert.equal(strong.max, fighter(null, { ...good, growth: 0.1, loadout: ["cinder"] }).max, "claiming to be older gains nothing");
});

test("the league counts days you kept your own goal, and moves a step a week", () => {
  const s = newState(42);
  s.goal = 5;
  for (const day of ["12", "13", "14", "15", "16"]) studyDay(s, `2026-10-${day}T10:00:00`); // Monday to Friday
  assert.equal(s.goalWeek.days, 5);
  assert.equal(leaguePercent(5, at("2026-10-16T20:00:00")), 100);
  assert.equal(leaguePercent(5, at("2026-10-18T20:00:00")), 71, "five of seven by Sunday");
  assert.equal(leaguePercent(1, at("2026-10-12T20:00:00")), 100, "Monday: one of one");
  assert.equal(s.league, 0);
  rollLeague(s, at("2026-10-19T08:00:00"));
  assert.equal(s.league, 1, "five days moves up");
  assert.equal(s.goalWeek.days, 0);
  studyDay(s, "2026-10-20T10:00:00");
  studyDay(s, "2026-10-21T10:00:00");
  rollLeague(s, at("2026-10-26T08:00:00"));
  assert.equal(s.league, 1, "two to four days holds steady");
  rollLeague(s, at("2026-11-02T08:00:00"));
  assert.equal(s.league, 0, "a week with none moves down");
  rollLeague(s, at("2026-11-30T08:00:00"));
  assert.equal(s.league, 0, "never below bronze");
  const big = newState(43);
  big.goal = 20;
  studyDay(big, "2026-10-12T10:00:00");
  assert.equal(big.goalWeek.days, 0, "ten minutes is not a twenty-minute goal");
  assert.equal(s.goal, 5);
});

test("the raid: right answers are the damage; the reward is claimed once a week", () => {
  const s = newState(44);
  const now = at("2026-10-14T10:00:00");
  for (let i = 0; i < 12; i++) answerQuestion(s, `w${i}`, i < 9, now);
  assert.equal(raidDamage(s, now), 9);
  assert.equal(raidDamage(s, at("2026-10-21T10:00:00")), 0, "last week's answers don't count this week");
  assert.ok(BOSSES.includes(weeklyBoss(now)));
  assert.notEqual(weeklyBoss(now), weeklyBoss(at("2026-10-21T10:00:00")));
  const xp = s.xp;
  const pay = claimRaid(s, now);
  assert.deepEqual([pay.xp, pay.coins], [150, 20]);
  assert.ok(s.xp === xp + 150 && pay.badges.includes("raid_win"));
  assert.equal(claimRaid(s, now), null);
  assert.ok(claimRaid(s, at("2026-10-21T10:00:00")), "next week's boss can be claimed again");
});

test("gifts: giving takes it out of your game; receiving only ever adds a real item or a fresh egg", () => {
  const s = newState(45);
  s.creature.growth = 0.3;
  s.owned = ["hat/cap", "decor/mushroom"];
  s.creature.equipped.hat = "hat/cap";
  s.decor = [{ id: "decor/mushroom", x: 50 }];
  assert.equal(giveItem(s, "hat/crown"), null, "can't give what you don't own");
  assert.deepEqual(giveItem(s, "hat/cap"), { id: "hat/cap" });
  assert.ok(!s.owned.includes("hat/cap") && s.creature.equipped.hat === undefined);
  giveItem(s, "decor/mushroom");
  assert.equal(s.decor.length, 0);

  assert.equal(giveEgg(s, 0), null, "not your only creature, and not the one in the habitat");
  s.roster.push(newGenome(77, "tide"), newGenome(78, "dusk"));
  s.roster[2].growth = 0.2;
  assert.equal(giveEgg(s, 2), null, "a hatched creature is not given away");
  assert.deepEqual(giveEgg(s, 1), { seed: 77, type: "tide" });
  assert.equal(s.roster.length, 2);

  const t = newState(46);
  assert.match(receiveGift(t, "item", { id: "hat/cap" }), /Cap/);
  assert.ok(t.owned.includes("hat/cap"));
  const coins = t.coins;
  assert.match(receiveGift(t, "item", { id: "hat/cap" }), /already/);
  assert.ok(t.coins > coins);
  assert.match(receiveGift(t, "item", { id: "coins/999999" }), /couldn't/);
  assert.match(receiveGift(t, "egg", { seed: 77, type: "tide", growth: 1, branch: "echo" }), /Tide egg/);
  assert.equal(t.roster[1].growth, 0, "an egg arrives as an egg, whatever the sender claims");
  assert.match(receiveGift(t, "egg", { seed: 1, type: "plasma" }), /couldn't/);
  assert.match(receiveGift(t, "coins", { n: 999 }), /couldn't/);

  recordDefence(t, { id: "u9", name: "Ana" }, true);
  recordDefence(t, { id: "u9", name: "Ana" }, false);
  assert.deepEqual(t.rivals.u9, { name: "Ana", wins: 1, losses: 1 });
});
