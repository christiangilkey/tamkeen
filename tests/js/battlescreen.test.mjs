// Run with: node --test tests/js/
// The Battle screen and its Friends side (game/battlescreen.js): when battles open, the team that fights, what each
// choice of words means, the gym leaders as a path, choosing a rental team, the friends' league and the guild raid.
// Also that the screens are blocks with their explanations behind the "?", not paragraphs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BATTLE_UNLOCK_WORDS, RAID_HP_PER_MEMBER } from "../../web/js/game/data.js";
import { newGenome } from "../../web/js/game/genome.js";
import { LAST_WORDS, newState, weekNumber } from "../../web/js/game/rules.js";
import { GYM_COUNT, LEADERS } from "../../web/js/game/gyms.js";
import {
  RENTAL_PICK, battleGate, gymEntry, gymPath, leagueRows, nextGym, raidState, rentalLeft, teamOf, teamSlots, toggleRental, wordChoice,
} from "../../web/js/game/battlescreen.js";

const src = (file) => readFileSync(new URL(`../../web/js/game/${file}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-06T12:00:00"); // a Friday
const WEEK = weekNumber(NOW);

/** A state with `n` creatures; `eggs` of them (the last ones) still eggs. */
function withCreatures(n, eggs = 0) {
  const s = newState(7);
  s.roster = Array.from({ length: n }, (_, i) => { const g = newGenome(100 + i); g.growth = i >= n - eggs ? 0 : 0.4; return g; });
  s.active = 0;
  return s;
}

test("battles open at 20 saved words, with meanings to ask, and a hatched creature", () => {
  assert.deepEqual(battleGate({ words: 12, meanings: 12, hatched: 1 }), { id: "words", have: 12, need: BATTLE_UNLOCK_WORDS });
  assert.deepEqual(battleGate({ words: 0 }), { id: "words", have: 0, need: BATTLE_UNLOCK_WORDS });
  assert.deepEqual(battleGate({ words: 120, meanings: 0, hatched: 1 }), { id: "meanings", have: 0, need: 120 });
  assert.equal(battleGate({ words: 120, meanings: 3, canAsk: false, hatched: 1 }).id, "meanings", "too few different meanings to make a question");
  assert.deepEqual(battleGate({ words: 120, meanings: 80, hatched: 0 }), { id: "egg", have: 0, need: 1 });
  assert.equal(battleGate({ words: 120, meanings: 80, hatched: 2 }), null, "open");
  assert.equal(battleGate({ words: BATTLE_UNLOCK_WORDS, meanings: 10, hatched: 1 }), null, "exactly 20 is enough");
});

test("the team: the first three hatched creatures, in the roster's order, with an empty place for each still to come", () => {
  const s = withCreatures(5, 1);
  assert.deepEqual(teamOf(s), [0, 1, 2]);
  assert.deepEqual(teamSlots(s), [0, 1, 2]);
  const few = withCreatures(3, 2);
  assert.deepEqual(teamOf(few), [0], "eggs don't fight");
  assert.deepEqual(teamSlots(few), [0, null, null], "the row keeps its three places");
  const solo = { team: 1, types: null };
  assert.deepEqual(teamOf(s, solo), [0], "this week's rule can make the team smaller");
});

test("what each choice of words means: the newest 100 at the same level for all, or every word with the cards' strength", () => {
  assert.deepEqual(wordChoice("last100", { meanings: 340, scale: 1.4 }), { mode: "last100", all: false, questions: LAST_WORDS, strength: 1 });
  assert.equal(wordChoice("last100", { meanings: 60 }).questions, 60, "never more than there are");
  assert.deepEqual(wordChoice("unlimited", { meanings: 340, scale: 1.3456 }), { mode: "unlimited", all: true, questions: 340, strength: 1.35 });
  assert.equal(wordChoice("nonsense", { meanings: 5 }).mode, "last100", "anything else reads as the default");
  assert.equal(wordChoice("unlimited", { meanings: 5, scale: 0.4 }).strength, 1, "never weaker than everyone else");
});

test("the gym leaders as a path: beaten, then the next one open, then the rest locked", () => {
  const s = newState(3);
  let path = gymPath(s);
  assert.equal(path.length, GYM_COUNT);
  assert.deepEqual(path.map((p) => p.status), ["open", ...Array(GYM_COUNT - 1).fill("locked")]);
  assert.deepEqual(path.map((p) => p.id), LEADERS.map((l) => l.id), "in order");
  assert.equal(nextGym(s), 0);
  s.gyms = { beaten: 3, wins: { pip: 2, marin: 1, tor: 1 } };
  path = gymPath(s);
  assert.deepEqual(path.slice(0, 5).map((p) => p.status), ["beaten", "beaten", "beaten", "open", "locked"]);
  assert.equal(path.filter((p) => p.status === "open").length, 1, "one highlighted");
  assert.equal(nextGym(s), 3);
  assert.equal(path.find((p) => p.id === "zenith").element, null, "the champion has no element of its own");
  s.gyms = { beaten: GYM_COUNT, wins: {} };
  assert.equal(nextGym(s), -1, "all beaten");
  assert.ok(gymPath(s).every((p) => p.status === "beaten"));
});

test("a leader's entry: the reward until it is beaten, then the wins; a locked one says who to beat first", () => {
  const s = newState(3);
  s.gyms = { beaten: 1, wins: { pip: 3 } };
  const pip = gymEntry(s, 0);
  assert.equal(pip.status, "beaten");
  assert.equal(pip.reward, null);
  assert.equal(pip.wins, 3);
  assert.ok(pip.canFight, "a rematch");
  const marin = gymEntry(s, 1);
  assert.deepEqual(marin.reward, LEADERS[1].reward);
  assert.equal(marin.after, "Pip");
  assert.ok(marin.canFight);
  assert.equal(marin.creatures, LEADERS[1].team.length);
  assert.equal(marin.seconds, LEADERS[1].quiz);
  assert.deepEqual([marin.number, marin.of], [2, GYM_COUNT]);
  const tor = gymEntry(s, 2);
  assert.equal(tor.status, "locked");
  assert.equal(tor.canFight, false);
  assert.equal(tor.after, "Marin");
  s.gyms = { beaten: 1, wins: {} };
  assert.equal(gymEntry(s, 0).wins, 1, "a beaten leader was beaten at least once");
  assert.equal(gymEntry(s, 0).after, null, "nobody before the first");
});

test("a rental duel: choose three of six, a tap puts one back, never a fourth", () => {
  let chosen = new Set();
  for (const i of [0, 2, 4]) chosen = toggleRental(chosen, i);
  assert.deepEqual([...chosen], [0, 2, 4]);
  assert.equal(rentalLeft(chosen), 0);
  const before = chosen;
  chosen = toggleRental(chosen, 5);
  assert.deepEqual([...chosen], [0, 2, 4], "a fourth is not taken");
  assert.notEqual(chosen, before, "a copy every time");
  chosen = toggleRental(chosen, 2);
  assert.deepEqual([...chosen], [0, 4]);
  assert.equal(rentalLeft(chosen), 1);
  assert.equal(rentalLeft(new Set()), RENTAL_PICK);
});

test("the league: the share of this week's goal days first, then skill; last week's numbers count as none", () => {
  const game = newState(5);
  game.goalWeek = { n: WEEK, days: 3 };
  game.rating = 1050;
  const people = new Map([["a", { id: "a", username: "Ana" }], ["b", { id: "b", username: "Bo" }], ["c", { id: "c", username: "Cy" }]]);
  const profiles = new Map([
    ["a", { week: WEEK, goal_days: 5, rating: 900, league: 2, team: [{ seed: 1 }] }],
    ["b", { week: WEEK - 1, goal_days: 7, rating: 1200, league: 1, team: [] }],
    ["c", { week: WEEK, goal_days: 3, rating: 1100, league: 0, team: [{ seed: 2 }] }],
  ]);
  const rows = leagueRows({ me: { id: "me" }, game, people, profiles, now: NOW });
  assert.deepEqual(rows.map((r) => r.name), ["Ana", "Cy", "You", "Bo"]);
  assert.equal(rows.find((r) => r.name === "Bo").pct, 0, "last week's goal days don't count this week");
  assert.ok(rows.find((r) => r.mine).name === "You" && rows.filter((r) => r.mine).length === 1);
  assert.equal(rows.find((r) => r.name === "Cy").profile, profiles.get("c"), "the checked row, for a challenge");
  const alone = leagueRows({ me: { id: "me" }, game, people: new Map(), profiles: new Map(), now: NOW });
  assert.deepEqual(alone.map((r) => r.name), ["You"]);
});

test("the guild raid: each member's share of the boss, every right answer this week, others counted at most twice their share", () => {
  const game = newState(5);
  game.week = { n: WEEK, right: 40, total: 50, paid: false };
  const members = [{ id: "me", username: "me" }, { id: "a", username: "Ana" }, { id: "b", username: "Bo" }];
  const profiles = new Map([["a", { week: WEEK, reviews: 10 ** 6 }], ["b", { week: WEEK - 1, reviews: 80 }]]);
  const r = raidState({ me: { id: "me" }, game, members, profiles, now: NOW });
  assert.equal(r.hp, 3 * RAID_HP_PER_MEMBER);
  assert.ok(r.parts.find(([n]) => n === "Ana")[1] <= 2 * RAID_HP_PER_MEMBER, "capped");
  assert.equal(r.parts.find(([n]) => n === "Bo")[1], 0, "last week's answers don't count");
  assert.deepEqual(r.parts.map(([, d]) => d), [...r.parts.map(([, d]) => d)].sort((x, y) => y - x), "most first");
  assert.equal(r.left, Math.max(0, r.hp - r.dealt));
  assert.equal(r.down, r.left === 0);
  game.week.n = WEEK - 1;
  assert.equal(raidState({ me: { id: "me" }, game, members, profiles: new Map(), now: NOW }).parts[0][1], 0);
  const beaten = raidState({ me: { id: "me" }, game: { ...game, week: { n: WEEK, right: 999 } }, members: [{ id: "me" }], profiles: new Map(), now: NOW });
  assert.equal(beaten.down, true);
  assert.equal(beaten.left, 0);
});

test("the Battle screen and its Friends side are blocks, with the long explanations behind the '?'", () => {
  const ui = src("battle-ui.js");
  const gyms = src("gyms-ui.js");
  const friends = src("friends-game.js");
  for (const [name, text] of [["battle-ui.js", ui], ["gyms-ui.js", gyms], ["friends-game.js", friends]]) {
    assert.doesNotMatch(text, /class="small muted"/, `${name}: no small grey paragraphs on the screen`);
    assert.match(text, /\bblock\(/, `${name}: drawn in the shared blocks`);
  }
  assert.doesNotMatch(ui, /battle-mode|b-friends|today-chip/, "the old menu is gone");
  assert.doesNotMatch(gyms, /gym-blurb|gym-list/, "the old gym list is gone");
  assert.doesNotMatch(friends, /league-row|creature-card/, "the old league table is gone");
  // What used to be paragraphs on the screen is now in the "?".
  const help = ui.slice(ui.indexOf("export function battleHelp"));
  for (const words of ["Battles are live", "Your own creatures against wild ones", "Ten gym leaders, each harder", "Questions come from the"]) {
    assert.ok(help.includes(words), words);
  }
  assert.ok(friends.slice(friends.indexOf("export function friendsHelp")).includes("Ranked by the share of days"));
  // Each leader's entry and the rental pick are the app's own box (screenparts.details), not a sheet of their own.
  assert.match(gyms, /details\(/);
  assert.match(ui, /function rentalBox[\s\S]*?details\(/);
  assert.doesNotMatch(gyms, /\bsheet\(/);
});
