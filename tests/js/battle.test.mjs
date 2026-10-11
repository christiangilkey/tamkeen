// Run with: node --test tests/js/
// Evolution choices, the vocab review that powers battles, and the battle engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_STATS, BATTLE_UNLOCK_WORDS, CYCLE, MOVES, WEEKLY_RULES, matchup } from "../../web/js/game/data.js";
import { describe, formOf, newGenome, readyToEvolve, rng } from "../../web/js/game/genome.js";
import {
  MATURE_BOX, answerQuestion, branchOptions, checkBadges, dayNumber, evolve, finishBattle, newState, normalize, pickQuestion,
  reshape, retention, reviewSummary, setActive, variantOptions, weeklyRule, weekNumber, wildBonus,
} from "../../web/js/game/rules.js";
import { COMBO, battleResult, eligible, fighter, fighters, knownMoves, loadout, newBattle, playTurn, rentalPool, wildTeam } from "../../web/js/game/battle.js";

const at = (iso) => new Date(iso);
const vocab = (n, withMeaning = n) => Array.from({ length: n }, (_, i) => ({ uid: `v${i}`, text: `palabra${i}`, meaning: i < withMeaning ? `meaning ${i}` : "", sentence: `Una frase con palabra${i}.` }));

test("evolving is the owner's choice, with forms opened by habits, company, the hour and battle feats", () => {
  const s = newState(21);
  const g = s.creature;
  g.growth = 0.8;
  assert.ok(readyToEvolve(g));
  assert.equal(formOf(g).id, "juvenile", "it keeps its middle stage until evolved");
  g.traits.reader = 0.6;
  g.traits.listener = 0.3;
  const open = Object.fromEntries(branchOptions(g).map((b) => [b.id, b.open]));
  assert.deepEqual(open, { echo: true, sage: true, keeper: false }, "habits with real use are open, the rest say what they need");
  assert.match(branchOptions(g).find((b) => b.id === "keeper").why, /collecting/);
  assert.match(evolve(s, 0, "keeper"), /isn't open/);
  assert.match(evolve(s, 0, "sage", "nocturne"), /hasn't been earned/);
  assert.ok(variantOptions(s, g).every((v) => !v.open));

  assert.equal(evolve(s, 0, "sage", null, rng(5)), "");
  assert.equal(describe(g).branch, "sage");
  assert.equal(s.roster.length, 2, "a grown creature leaves an egg");
  assert.equal(formOf(s.roster[1]).id, "egg");
  assert.ok(s.badges.includes("adult_sage"));
  assert.match(evolve(s, 0, "echo"), /isn't ready/);

  // Reversible: keep a younger look, and switch between unlocked forms.
  reshape(s, 0, { show: "hatchling" });
  assert.equal(describe(g).size, "s");
  reshape(s, 0, { show: null });
  assert.equal(describe(g).stage, "adult");
  reshape(s, 0, { branch: "echo" });
  assert.equal(g.branch, "sage", "a form must be unlocked first");
  g.branches.push("echo");
  reshape(s, 0, { branch: "echo" });
  assert.equal(describe(g).branch, "echo");

  // Special forms: by the hour studied, by a battle feat, by the company it keeps.
  const plain = describe(g);
  s.tags.push("night_owl");
  reshape(s, 0, { variant: "nocturne" });
  const night = describe(g);
  assert.equal(night.variant, "nocturne");
  assert.notDeepEqual(night.colors.primary, plain.colors.primary);
  for (const k of ["species", "ear", "tail", "eyes"]) assert.equal(night[k], plain[k], "still the same animal");
  reshape(s, 0, { variant: "champion" });
  assert.equal(g.variant, "nocturne", "the Champion form needs a battle feat");
  s.tags.push("comeback");
  reshape(s, 0, { variant: "champion" });
  assert.equal(describe(g).horn, "crest");
  assert.equal(variantOptions(s, g).find((v) => v.id === "twin").open, false, "an egg is no company yet");
  s.roster[1].growth = 0.1;
  s.roster[1].type = g.type === "tide" ? "ember" : "tide";
  reshape(s, 0, { variant: "twin" });
  assert.equal(g.variant, "twin");
  assert.ok(Number.isFinite(g.partnerHue));
  assert.notDeepEqual(describe(g).colors.secondary, plain.colors.secondary, "it takes on its companion's colours");
  reshape(s, 0, { variant: null });
  assert.deepEqual(describe(g).colors, describe({ ...g, variant: null }).colors);

  setActive(s, 1);
  assert.equal(s.creature, s.roster[1], "the creature in the habitat is the one that grows");
});

test("old saves with a single creature become a roster; saving keeps it small", () => {
  const old = normalize({ v: 1, xp: 500, creature: { seed: 77, growth: 0.9, branch: "keeper", traits: {} }, updated_at: 5 });
  assert.equal(old.roster.length, 1);
  assert.equal(old.creature.seed, 77);
  assert.deepEqual(old.creature.branches, ["keeper"]);
  const json = JSON.parse(JSON.stringify(old));
  assert.ok(!("creature" in json) && json.roster.length === 1, "the shortcut is not saved twice");
  assert.equal(normalize(json).creature.seed, 77);
  assert.equal(normalize({ roster: [] }).roster.length, 1);
});

test("questions come from the owner's own words: due first, four distinct choices", () => {
  const s = newState(22);
  const now = at("2026-10-12T10:00:00");
  assert.equal(pickQuestion(s, vocab(3), rng(1), now), null, "too few meanings to make four choices");
  assert.equal(pickQuestion(s, vocab(50, 2), rng(1), now), null);
  const words = vocab(120);
  for (let i = 0; i < 40; i++) {
    const q = pickQuestion(s, words, rng(i + 1), now);
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    const word = words.find((w) => w.uid === q.uid);
    assert.equal(q.options[q.answer], q.reverse ? word.text : word.meaning);
    assert.equal(q.prompt, q.reverse ? word.meaning : word.text);
  }
  // Everything answered today is no longer due, except the one word left.
  for (const w of words.slice(1)) answerQuestion(s, w.uid, true, now);
  for (let i = 0; i < 10; i++) assert.equal(pickQuestion(s, words, rng(i + 50), now).uid, "v0");
  assert.equal(reviewSummary(s, words, now).due, 1);
  assert.notEqual(pickQuestion(s, words, rng(3), now, ["v0"]).uid, "v0", "a word just asked is not asked again straight away");
  // Duplicate meanings never appear as two choices.
  const dupes = vocab(10).map((w, i) => ({ ...w, meaning: i < 5 ? "same" : `m${i}` }));
  for (let i = 0; i < 30; i++) { const q = pickQuestion(s, dupes, rng(i + 9), now); assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, 4); }
});

test("a word becomes well known only over weeks of right answers; that pays best", () => {
  const s = newState(23);
  let day = at("2026-10-01T10:00:00");
  const dues = [];
  let graduated = null;
  for (let i = 0; i < 6 && !graduated; i++) {
    const r = answerQuestion(s, "w", true, day);
    dues.push(s.review.w[1] - dayNumber(day));
    if (r.graduated) graduated = { answers: i + 1, xp: r.xp };
    day = new Date(day.getTime() + dues[i] * 86400000);
  }
  assert.deepEqual(dues, [1, 2, 4, 8], "each right answer doubles the wait");
  assert.equal(graduated.answers, MATURE_BOX);
  assert.ok(graduated.xp >= 15);
  assert.equal(s.coins, 1);
  assert.equal(reviewSummary(s, [{ uid: "w", text: "a", meaning: "b" }], at("2026-10-02T10:00:00")).mature, 1);
  const before = s.review.w[0];
  answerQuestion(s, "w", false, day);
  assert.equal(s.review.w[0], before - 2, "a wrong answer sets it back, not to zero");
  assert.equal(answerQuestion(s, "w", true, day).graduated, false, "climbing back is not a second graduation yet");

  // Answering in bulk fades; mashing wrong answers earns nothing and wrecks the accuracy bonus.
  const grind = newState(24);
  const today = at("2026-10-12T10:00:00");
  let xp = 0;
  for (let i = 0; i < 200; i++) xp += answerQuestion(grind, `g${i}`, true, today).xp;
  assert.ok(xp < 40 * 3 + 40 * 2 + 40 + 61 + 1, "200 reviews earn little more than 40 (plus the weekly accuracy bonus once)");
  const sloppy = newState(25);
  let got = 0;
  let bonus = false;
  for (let i = 0; i < 60; i++) { const r = answerQuestion(sloppy, `s${i}`, i % 2 === 0, today); got += r.xp; bonus = bonus || r.retentionBonus; }
  assert.equal(bonus, false);
  assert.equal(retention(sloppy), 0.5);
  const careful = newState(26);
  let paid = 0;
  for (let i = 0; i < 60; i++) if (answerQuestion(careful, `c${i}`, i % 10 !== 0, today).retentionBonus) paid++;
  assert.equal(paid, 1, "accuracy kept up over the week pays once");
  assert.equal(weekNumber(at("2026-10-12T00:30:00")), weekNumber(at("2026-10-18T23:00:00")));
  assert.notEqual(weekNumber(at("2026-10-18T23:00:00")), weekNumber(at("2026-10-19T00:30:00")), "weeks turn on Monday");
});

test("battle data: equal totals, a closed element cycle, every creature has moves", () => {
  const totals = Object.values(BASE_STATS).map((b) => b.hp / 5 + b.atk + b.def + b.spd);
  assert.ok(Math.max(...totals) - Math.min(...totals) <= 2, "no body plan is simply better");
  for (let i = 0; i < CYCLE.length; i++) {
    const next = CYCLE[(i + 1) % CYCLE.length];
    assert.equal(matchup(CYCLE[i], next), 1.25);
    assert.equal(matchup(next, CYCLE[i]), 0.8);
    assert.equal(matchup(CYCLE[i], CYCLE[i]), 1);
  }
  assert.equal(matchup(null, "ember"), 1);
  assert.equal(new Set(MOVES.map((m) => m.id)).size, MOVES.length);
  assert.equal(BATTLE_UNLOCK_WORDS, 100);
  assert.ok(WEEKLY_RULES.includes(weeklyRule(at("2026-10-12T10:00:00"))));
  assert.notEqual(weeklyRule(at("2026-10-12T10:00:00")), weeklyRule(at("2026-10-19T10:00:00")), "a different rule next week");
});

test("studying adds choices, never power: same level for a hatchling and an adult", () => {
  const s = newState(27);
  const baby = s.creature;
  baby.growth = 0.1;
  const few = knownMoves(s, baby).map((m) => m.id);
  assert.deepEqual(few.slice(0, 2), ["tackle", "guard"]);
  assert.equal(few.length, 3, "a hatchling knows its first element move");
  const old = { ...newGenome(baby.seed, baby.type), growth: 0.95, branch: "echo", branches: ["echo", "sage"], traits: baby.traits, moves: [], equipped: {} };
  const many = knownMoves(s, old).map((m) => m.id);
  assert.ok(many.length >= 7 && many.includes("resonance") && many.includes("insight"));
  s.tags.push("night_owl", "comeback");
  assert.ok(knownMoves(s, baby).some((m) => m.id === "night_strike") && knownMoves(s, baby).some((m) => m.id === "second_wind"), "earned moves reach every creature");
  const a = fighter(s, baby);
  const b = fighter(s, old);
  assert.deepEqual([a.max, a.atk, a.def, a.spd], [b.max, b.atk, b.def, b.spd], "between people, age gives nothing");
  assert.ok(fighter(s, old, { wild: true }).max > b.max, "against wild creatures only, age gives a small edge");
  assert.ok(wildBonus(old) <= 1.15);
  old.moves = ["resonance", "guard", "insight", "tackle"];
  assert.deepEqual(loadout(s, old), ["resonance", "guard", "insight", "tackle"], "the owner's picks are kept");
  old.moves = ["guard"];
  assert.ok(loadout(s, old).length === 4 && loadout(s, old).some((id) => MOVES.find((m) => m.id === id).kind === "attack"));
  assert.ok(!loadout(s, { ...old, moves: [], branches: ["keeper"] }, { id: "no_heal" }).some((id) => MOVES.find((m) => m.id === id).kind === "heal"));
});

test("this week's rule decides who may fight; rentals are the same six for everyone", () => {
  const s = newState(28);
  s.roster = [newGenome(1, "ember"), newGenome(2, "tide"), newGenome(3, "grove"), newGenome(4, "ember")];
  s.roster[0].growth = 0.9; s.roster[0].branch = "echo"; s.roster[0].branches = ["echo"];
  s.roster[1].growth = 0.4;
  s.roster[2].growth = 0; // still an egg
  s.roster[3].growth = 0.2;
  s.active = 1;
  assert.deepEqual(eligible(s), [1, 0, 3], "eggs stay home; the creature in the habitat leads");
  assert.deepEqual(eligible(s, { id: "starters" }), [1, 3]);
  assert.deepEqual(eligible(s, { id: "warm", types: ["ember", "spark", "stone"] }), [0, 3]);
  const pool = rentalPool(2960);
  assert.equal(pool.length, 6);
  assert.deepEqual(rentalPool(2960).map((g) => g.seed), pool.map((g) => g.seed));
  assert.notDeepEqual(rentalPool(2961).map((g) => g.seed), pool.map((g) => g.seed));
  assert.ok(pool.every((g) => describe(g).stage === "adult"));
  assert.equal(wildTeam(rng(4), 3).length, 3);
});

test("a battle is won by answers: right lands, fast builds a combo, wrong only glances", () => {
  const duel = (quality, seed = 3) => {
    const team = () => fighters(null, [{ ...newGenome(500, "tide"), growth: 0.5 }]);
    const b = newBattle({ mine: team(), theirs: team(), foeForm: 0.7, rand: rng(seed) });
    let turns = 0;
    while (!b.over && turns < 60) { playTurn(b, "splash", quality); turns++; }
    return b;
  };
  let wins = { fast: 0, right: 0, wrong: 0 };
  for (let seed = 1; seed <= 40; seed++) for (const q of Object.keys(wins)) if (duel(q, seed).won) wins[q]++;
  assert.ok(wins.fast > wins.right && wins.right > wins.wrong, JSON.stringify(wins));
  assert.ok(wins.fast >= 36 && wins.wrong <= 6, "knowing your words wins; not knowing them loses");

  const one = (...qualities) => {
    const mk = () => fighters(null, [{ ...newGenome(500, "tide"), growth: 0.5 }]);
    const b = newBattle({ mine: mk(), theirs: mk(), rand: () => 0.5 });
    for (const f of [b.mine[0], b.theirs[0]]) f.hp = f.max = 100000; // long enough to watch the chain
    return qualities.map((q) => playTurn(b, "tackle", q).find((e) => e.side === "me" && e.kind === "attack"));
  };
  const [w] = one("wrong");
  const [r] = one("right");
  assert.ok(w.dmg < r.dmg && w.dmg >= 1, "a wrong answer still does something");
  const chain = one("fast", "fast", "fast", "fast", "right", "right");
  assert.deepEqual(chain.map((e) => Math.round((e.power / chain[0].power) * 100) / 100), [1, COMBO[1], COMBO[2], COMBO[3], Math.round((COMBO[3] / 1.1) * 100) / 100, Math.round((1 / 1.1) * 100) / 100],
    "each fast answer raises the next move; a slow one spends the chain and ends it");
  assert.equal(chain[3].surged, true);
  assert.equal(chain[0].surged, false);
});

test("moves do what they say; a team fights on; feats and rewards are settled", () => {
  const mk = (type, n = 1) => fighters(null, Array.from({ length: n }, (_, i) => ({ ...newGenome(600 + i, type), growth: 0.95, branch: "keeper", branches: ["keeper"] })));
  const strong = newBattle({ mine: mk("ember"), theirs: mk("grove"), rand: () => 0.5 });
  const weak = newBattle({ mine: mk("ember"), theirs: mk("dusk"), rand: () => 0.5 });
  const hit = (b) => playTurn(b, "cinder", "right").find((e) => e.side === "me" && e.kind === "attack");
  const s1 = hit(strong);
  const s2 = hit(weak);
  assert.equal(s1.mult, 1.25);
  assert.equal(s2.mult, 0.8);

  const b = newBattle({ mine: mk("stone", 2), theirs: mk("stone", 2), rand: () => 0.5 });
  b.mine[0].hp = 30;
  const healed = playTurn(b, "hoard", "right").find((e) => e.kind === "heal" && e.side === "me");
  assert.ok(healed.heal > 0 && b.mine[0].heals === 1);
  playTurn(b, "hoard", "right");
  assert.equal(playTurn(b, "hoard", "right").find((e) => e.side === "me").failed, true, "healing runs out");
  b.theirs[0].hp = 1;
  const events = playTurn(b, "tackle", "right");
  assert.ok(events.some((e) => e.kind === "faint" && e.side === "foe") && events.some((e) => e.kind === "enter" && e.side === "foe"));
  assert.equal(b.foe, 1);
  assert.ok(!b.over);
  b.theirs[1].hp = 1;
  b.mine[b.me].hp = b.mine[b.me].max;
  const last = playTurn(b, "tackle", "fast");
  assert.ok(b.over && b.won && last.some((e) => e.kind === "end"));
  assert.deepEqual(playTurn(b, "tackle", "right"), []);

  const s = newState(29);
  s.creature.growth = 0.2;
  const now = at("2026-10-12T10:00:00");
  const pay = finishBattle(s, { mode: "wild", won: true, flawless: true, comeback: true }, { now, rand: () => 0.99 });
  assert.deepEqual([pay.xp, pay.coins, pay.rating], [40, 4, 0]);
  assert.deepEqual(pay.tags.sort(), ["comeback", "flawless"]);
  assert.equal(s.rating, 1000, "wild encounters don't touch the skill rating");
  assert.ok(variantOptions(s, s.creature).find((v) => v.id === "champion").open, "a battle feat opens the Champion form");
  finishBattle(s, { mode: "wild", won: true }, { now });
  finishBattle(s, { mode: "wild", won: true }, { now });
  assert.ok(finishBattle(s, { mode: "wild", won: true }, { now }).xp < 40, "only the first few battles of the day pay in full");
  const up = finishBattle(s, { mode: "friend", won: true, rival: { id: "u1", name: "Sam", rating: 1200 } }, { now });
  assert.ok(up.rating > 12, "beating a stronger rival moves the rating more");
  const down = finishBattle(s, { mode: "friend", won: false, rival: { id: "u1", name: "Sam", rating: 1200 } }, { now });
  assert.ok(down.rating < 0 && down.rating > -12);
  assert.deepEqual(s.rivals.u1, { name: "Sam", wins: 1, losses: 1 }, "head-to-head record");
  assert.ok(s.badges.includes("friend_battle"));
  assert.ok(wildEggs() > 0);
  function wildEggs() { const t = newState(30); t.creature.growth = 0.2; return finishBattle(t, { mode: "wild", won: true }, { now, rand: () => 0.01 }).egg ? 1 : 0; }

  const br = newBattle({ mine: mk("dusk"), theirs: mk("dusk"), rand: () => 0.5 });
  br.won = true; br.over = true; br.answers = { right: 4, wrong: 0, fast: 2 }; br.brink = true;
  assert.deepEqual(battleResult(br), { mode: "wild", won: true, flawless: true, comeback: true, rival: null });
  assert.deepEqual(checkBadges(newState(31), { words: 150 }), ["words_100"]);
});
