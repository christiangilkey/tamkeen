// Run with: node --test tests/js/
// Growing up (no adult forms), special colourings, the vocab review that powers battles, and the battle engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_STATS, BATTLE_UNLOCK_WORDS, CYCLE, MOVES, TERRAIN, WEEKLY_RULES, matchup } from "../../web/js/game/data.js";
import { describe, formOf, isGrown, newGenome, rng } from "../../web/js/game/genome.js";
import {
  FULLY_GROWN_COINS, MATURE_BOX, answerQuestion, checkBadges, dayNumber, earn, finishBattle, newState, normalize, pickQuestion,
  reshape, retention, reviewSummary, setActive, variantOptions, weeklyRule, weekNumber, wildBonus,
} from "../../web/js/game/rules.js";
import { COLS, COMBO, ROWS, act, area, battleResult, current, eligible, fighter, fighters, knownMoves, layTerrain, loadout, moveTo, newBattle, reachable,
  rentalPool, start, tileAt, timeline, turnLength, whoseTurn, wildTeam, wouldHit } from "../../web/js/game/battle.js";

const at = (iso) => new Date(iso);
const vocab = (n, withMeaning = n) => Array.from({ length: n }, (_, i) => ({ uid: `v${i}`, text: `palabra${i}`, meaning: i < withMeaning ? `meaning ${i}` : "", sentence: `Una frase con palabra${i}.` }));

test("creatures stay young: fully grown pays once with coins and an egg; looks come from habits, company, the hour and battle feats", () => {
  const s = newState(21);
  const g = s.creature;
  g.growth = 0.7 - 10 / 6000; // ten creature XP short of fully grown
  const coins = s.coins;
  const r = earn(s, { type: "save" }, { now: at("2026-10-12T10:00:00") });
  assert.ok(r && r.xp >= 10, "saving a word paid");
  assert.ok(isGrown(g));
  assert.equal(formOf(g).id, "juvenile", "it stays a juvenile");
  assert.equal(describe(g).size, "m");
  assert.equal(r.stage, "grown");
  assert.equal(s.roster.length, 2, "a fully grown creature leaves an egg");
  assert.equal(formOf(s.roster[1]).id, "egg");
  assert.ok(s.coins >= coins + FULLY_GROWN_COINS);
  assert.ok(s.badges.includes("grown"));
  const after = s.coins;
  earn(s, { type: "save" }, { now: at("2026-10-12T10:01:00") });
  assert.equal(s.roster.length, 2, "only once");
  assert.ok(s.coins - after < FULLY_GROWN_COINS);

  // Reversible: keep a younger look.
  reshape(s, 0, { show: "hatchling" });
  assert.equal(describe(g).size, "s");
  reshape(s, 0, { show: null });
  assert.equal(describe(g).stage, "juvenile");
  assert.ok(variantOptions(s, g).every((v) => v.id === "twin" || !v.open));

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
  const old = normalize({ v: 1, xp: 500, creature: { seed: 77, growth: 0.9, branch: "keeper", branches: ["keeper", "echo"], show: "adult", traits: {} }, updated_at: 5 });
  assert.equal(old.roster.length, 1);
  assert.equal(old.creature.seed, 77);
  assert.ok(!("branch" in old.creature) && !("branches" in old.creature), "adult forms are gone");
  assert.equal(old.creature.grown, true, "already paid: it left its egg when it evolved");
  assert.equal(old.creature.show, null);
  assert.equal(describe(old.creature).stage, "juvenile");
  assert.deepEqual(old.attacks.sort(), ["hoard", "resonance"], "its forms' moves become its owner's");
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

test("studying adds choices, never power: same level for a hatchling and a fully grown juvenile", () => {
  const s = newState(27);
  const baby = s.creature;
  baby.growth = 0.1;
  const few = knownMoves(s, baby).map((m) => m.id);
  assert.deepEqual(few.slice(0, 2), ["tackle", "guard"]);
  assert.equal(few.length, 3, "a hatchling knows its first element move");
  const old = { ...newGenome(baby.seed, baby.type), growth: 0.95, traits: baby.traits, moves: [], equipped: {} };
  assert.ok(!knownMoves(s, old).some((m) => m.price), "shop moves must be bought first");
  s.attacks.push("resonance", "insight");
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
  s.attacks.push("hoard");
  assert.ok(!loadout(s, { ...old, moves: [] }, { id: "basic" }).some((id) => MOVES.find((m) => m.id === id).price), "basic week: no bought moves");
  assert.ok(!loadout(s, { ...old, moves: [] }, { id: "no_heal" }).some((id) => MOVES.find((m) => m.id === id).kind === "heal"));
});

test("this week's rule decides who may fight; rentals are the same six for everyone", () => {
  const s = newState(28);
  s.roster = [newGenome(1, "ember"), newGenome(2, "tide"), newGenome(3, "grove"), newGenome(4, "ember")];
  s.roster[0].growth = 0.9;
  s.roster[1].growth = 0.4;
  s.roster[2].growth = 0; // still an egg
  s.roster[3].growth = 0.2;
  s.active = 1;
  assert.deepEqual(eligible(s), [1, 0, 3], "eggs stay home; the creature in the habitat leads");
  assert.deepEqual(eligible(s, { id: "basic" }), [1, 0, 3], "a basic-moves week keeps every creature in");
  assert.deepEqual(eligible(s, { id: "warm", types: ["ember", "spark", "stone"] }), [0, 3]);
  const pool = rentalPool(2960);
  assert.equal(pool.length, 6);
  assert.deepEqual(rentalPool(2960).map((g) => g.seed), pool.map((g) => g.seed));
  assert.notDeepEqual(rentalPool(2961).map((g) => g.seed), pool.map((g) => g.seed));
  assert.ok(pool.every((g) => describe(g).stage === "juvenile"));
  assert.equal(wildTeam(rng(4), 3).length, 3);
});

const plain = () => Array(18).fill(null);
const oneEach = (type = "tide", growth = 0.5) => fighters(null, [{ ...newGenome(500, type), growth }]);

test("a battle is won by answers: right lands, fast builds a combo, wrong misses", () => {
  const duel = (quality, seed) => {
    const b = newBattle({ mine: oneEach(), theirs: oneEach(), foeForm: 0.7, rand: rng(seed), tiles: plain() });
    start(b);
    let turns = 0;
    while (!b.over && turns < 200) {
      const me = current(b, "me");
      const foe = current(b, "foe");
      if (me.pos.r !== foe.pos.r) moveTo(b, "me", { c: me.pos.c, r: foe.pos.r }); // line up with it
      act(b, "splash", quality);
      turns++;
    }
    return b;
  };
  const wins = { fast: 0, right: 0, wrong: 0 };
  for (let seed = 1; seed <= 40; seed++) for (const q of Object.keys(wins)) if (duel(q, seed).won) wins[q]++;
  assert.ok(wins.fast > wins.right && wins.right > wins.wrong, JSON.stringify(wins));
  assert.ok(wins.fast >= 32, "knowing your words wins");
  assert.equal(wins.wrong, 0, "not knowing them never does: a wrong answer misses");

  const chainOf = (...qualities) => {
    const b = newBattle({ mine: oneEach(), theirs: oneEach(), rand: () => 0.5, tiles: plain() });
    for (const f of [b.mine[0], b.theirs[0]]) f.hp = f.max = 100000; // long enough to watch the chain
    start(b);
    return qualities.map((q) => act(b, "seeker", q).find((e) => e.side === "me" && (e.kind === "attack" || e.kind === "miss")));
  };
  const [w] = chainOf("wrong");
  assert.equal(w.kind, "miss");
  const chain = chainOf("fast", "fast", "fast", "fast", "right", "right");
  assert.deepEqual(chain.map((e) => Math.round((e.power / chain[0].power) * 100) / 100), [1, COMBO[1], COMBO[2], COMBO[3], Math.round((COMBO[3] / 1.1) * 100) / 100, Math.round((1 / 1.1) * 100) / 100],
    "each fast answer raises the next move; a slow one spends the chain and ends it");
  assert.equal(chain[3].surged, true);
  assert.equal(chain[0].surged, false);
});

test("the grid: a creature steps around its own half, and where it stands decides what it hits", () => {
  const b = newBattle({ mine: oneEach(), theirs: oneEach(), rand: () => 0.5, tiles: plain() });
  assert.deepEqual([current(b, "me").pos, current(b, "foe").pos], [{ c: 1, r: 1 }, { c: 4, r: 1 }]);
  start(b);
  assert.equal(whoseTurn(b), "me", "equal speed: the player goes first");
  assert.equal(reachable(b, "me").length, 9, "from the middle, all of its half is in reach");
  assert.equal(moveTo(b, "me", { c: 3, r: 1 }), null, "never onto the other side");
  assert.deepEqual(moveTo(b, "me", { c: 0, r: 0 }), { side: "me", kind: "step", from: { c: 1, r: 1 }, to: { c: 0, r: 0 } });
  assert.equal(moveTo(b, "me", { c: 1, r: 0 }), null, "once a turn");
  assert.equal(reachable(b, "me").length, 6, "two steps from a corner");
  assert.deepEqual(area(b, "me", "tackle"), [{ c: 3, r: 0 }, { c: 4, r: 0 }, { c: 5, r: 0 }], "a line: its own row, all the way across");
  assert.deepEqual(area(b, "me", "rockslide").map((p) => p.c), [5, 5, 5], "a column mirrors its own: from the back, their back");
  assert.deepEqual(area(b, "me", "wildfire"), [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 4, r: 0 }, { c: 4, r: 1 }], "a burst: the front two columns, its row and the next");
  assert.equal(wouldHit(b, "me", "tackle"), false);
  assert.equal(wouldHit(b, "me", "wildfire"), true);
  assert.equal(wouldHit(b, "me", "seeker"), true, "homing always finds it");
  const ev = act(b, "tackle", "right");
  assert.equal(ev[0].kind, "dodge", "out of line: the move lands on empty squares");
  assert.equal(current(b, "foe").hp, current(b, "foe").max);
});

test("the timeline: speed decides how often, charges wind up and can be cut short, delays push back", () => {
  const b = newBattle({ mine: oneEach(), theirs: oneEach(), rand: () => 0.5, tiles: plain() });
  current(b, "me").spd = 40;
  current(b, "foe").spd = 10;
  const next = timeline(b, 12);
  assert.ok(next.filter((t) => t.side === "me").length > next.filter((t) => t.side === "foe").length * 1.4, "the faster one acts more often");
  assert.ok(next.every((t, i) => !i || t.at >= next[i - 1].at), "in order of time");

  // A charge aims where its user stands; the other creature steps out of the way before it lands.
  const c = newBattle({ mine: oneEach(), theirs: oneEach(), rand: () => 0.5, tiles: plain() });
  start(c);
  const winding = act(c, "thunderhead", "right");
  assert.equal(winding[0].kind, "charge");
  assert.ok(winding.some((e) => e.side === "foe" && e.kind === "step"), "it sees the charge coming and moves");
  const landed = start(c).concat(act(c, "guard", "right"));
  assert.ok(landed.some((e) => e.side === "me" && e.kind === "dodge" && e.move === "thunderhead") || winding.some((e) => e.side === "me" && e.kind === "dodge"));

  // An interrupt cancels a charge that is winding up.
  const i = newBattle({ mine: oneEach(), theirs: oneEach(), rand: () => 0.5, tiles: plain() });
  current(i, "me").spd = 40;
  current(i, "foe").spd = 20;
  current(i, "foe").moves = ["thunderhead"];
  start(i);
  const up = act(i, "guard", "right");
  assert.ok(up.some((e) => e.side === "foe" && e.kind === "charge"), "the other side winds up");
  assert.equal(timeline(i).find((t) => t.side === "foe").charging, "thunderhead", "the timeline shows the charge");
  const cut = act(i, "startle", "right");
  const hit = cut.find((e) => e.side === "me" && e.move === "startle");
  assert.equal(hit.interrupted, "thunderhead");
  assert.ok(!cut.some((e) => e.side === "foe" && e.move === "thunderhead" && e.dmg), "its charge never lands");

  // A delay pushes the other creature's next turn back.
  const d = newBattle({ mine: oneEach(), theirs: oneEach(), rand: () => 0.5, tiles: plain() });
  current(d, "foe").moves = ["tackle"];
  start(d);
  const before = current(d, "foe").next;
  const tripped = act(d, "trip", "right").find((e) => e.side === "me" && e.move === "trip");
  assert.ok(tripped.delayed && tripped.dmg > 0);
  assert.ok(current(d, "foe").next > before);
});

test("the squares: the same on both sides, and each one does what it says", () => {
  for (let seed = 1; seed < 30; seed++) {
    const tiles = layTerrain(rng(seed));
    assert.equal(tiles.filter(Boolean).length, 4);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) assert.equal(tiles[r * COLS + c], tiles[r * COLS + (COLS - 1 - c)], "mirrored");
    assert.equal(tiles[1 * COLS + 1], null, "nobody starts on one");
  }
  for (const id of layTerrain(rng(3)).filter(Boolean)) assert.ok(TERRAIN[id]);
  const firstHit = (tiles) => {
    const b = newBattle({ mine: oneEach(), theirs: oneEach(), rand: () => 0.5, tiles });
    start(b);
    return act(b, "seeker", "right")[0].dmg;
  };
  const grass = plain(); grass[1 * COLS + 4] = "grass";
  const high = plain(); high[1 * COLS + 1] = "high";
  assert.ok(firstHit(grass) < firstHit(plain()), "tall grass covers the one standing in it");
  assert.ok(firstHit(high) > firstHit(plain()), "high ground lifts the attacker");
  const tick = (tile, type) => {
    const tiles = plain(); tiles[1 * COLS + 1] = tile;
    const b = newBattle({ mine: oneEach(type), theirs: oneEach(), rand: () => 0.5, tiles });
    start(b);
    current(b, "me").hp = 50;
    return act(b, "guard", "right").find((e) => e.side === "me" && e.kind === "terrain") || null;
  };
  assert.ok(tick("spring").heal > 0);
  assert.ok(tick("coals").dmg > 0);
  assert.equal(tick("coals", "ember"), null, "Ember creatures don't mind hot coals");
  const b = newBattle({ mine: oneEach(), theirs: oneEach(), rand: () => 0.5, tiles: plain() });
  start(b);
  act(b, "bloom", "right");
  assert.equal(tileAt(b, 1, 1), "spring", "Bloom makes its own square a spring");
  const s = newBattle({ mine: oneEach(), theirs: oneEach(), rand: () => 0.5, tiles: plain() });
  start(s);
  const at = { ...current(s, "foe").pos };
  act(s, "scorch", "right");
  assert.equal(tileAt(s, at.c, at.r), "coals", "Scorch sets the other creature's square alight");
  const slow = newBattle({ mine: oneEach(), theirs: oneEach(), rand: () => 0.5, tiles: plain() });
  const usual = turnLength(slow, current(slow, "me"));
  slow.tiles[1 * COLS + 1] = "puddle";
  assert.ok(turnLength(slow, current(slow, "me")) > usual, "a puddle slows it");
});

test("moves do what they say; a team fights on; feats and rewards are settled", () => {
  const mk = (type, n = 1) => fighters(null, Array.from({ length: n }, (_, i) => ({ ...newGenome(600 + i, type), growth: 0.95 })));
  const strong = newBattle({ mine: mk("ember"), theirs: mk("grove"), rand: () => 0.5, tiles: plain() });
  const weak = newBattle({ mine: mk("ember"), theirs: mk("dusk"), rand: () => 0.5, tiles: plain() });
  start(strong); start(weak);
  assert.equal(act(strong, "cinder", "right")[0].mult, 1.25);
  assert.equal(act(weak, "cinder", "right")[0].mult, 0.8);

  const b = newBattle({ mine: mk("stone", 2), theirs: mk("stone", 2), rand: () => 0.5, tiles: plain() });
  start(b);
  b.mine[0].hp = 30;
  const healed = act(b, "hoard", "right").find((e) => e.kind === "heal" && e.side === "me");
  assert.ok(healed.heal > 0 && b.mine[0].heals === 1);
  b.mine[0].hp = 30;
  act(b, "hoard", "right");
  assert.equal(act(b, "hoard", "right").find((e) => e.side === "me").failed, true, "healing runs out");
  b.theirs[0].hp = 1;
  const events = act(b, "seeker", "right");
  assert.ok(events.some((e) => e.kind === "faint" && e.side === "foe") && events.some((e) => e.kind === "enter" && e.side === "foe"));
  assert.equal(b.foe, 1);
  assert.deepEqual(current(b, "foe").pos, { c: 4, r: 1 }, "it steps in at its starting square");
  assert.ok(!b.over);
  b.theirs[1].hp = 1;
  b.mine[b.me].hp = b.mine[b.me].max;
  const last = act(b, "seeker", "fast");
  assert.ok(b.over && b.won && last.some((e) => e.kind === "end"));
  assert.deepEqual(act(b, "tackle", "right"), []);

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

  const br = newBattle({ mine: mk("dusk"), theirs: mk("dusk"), rand: () => 0.5, tiles: plain() });
  br.won = true; br.over = true; br.answers = { right: 4, wrong: 0, fast: 2 }; br.brink = true;
  assert.deepEqual(battleResult(br), { mode: "wild", won: true, flawless: true, comeback: true, rival: null });
  assert.deepEqual(checkBadges(newState(31), { words: 150 }), ["words_100"]);
});

test("a reverse battle question never shows the word inside its meaning", () => {
  const vocab = [];
  for (let i = 0; i < 8; i++) vocab.push({ uid: "w" + i, text: "كلمة" + i, meaning: "meaning " + i });
  vocab[0] = { uid: "w0", text: "تعلّي", meaning: "to raise your voice (Egyptian dialect: 'تعلّي' = to make a fuss)" };
  const picks = [0, 0];                       // first word, then "reverse"
  const rand = () => (picks.length ? picks.shift() : 0.5);
  const q = pickQuestion(newState(), vocab, rand);
  assert.equal(q.reverse, true);
  assert.equal(q.uid, "w0");
  assert.ok(!q.prompt.includes("تعلّي"), q.prompt);
  assert.ok(q.prompt.startsWith("to raise your voice"));
});

test("word modes: the last 100 words for an even fight, or every word with creatures as strong as what you know", async () => {
  const { LAST_WORDS, battleWords, knownWords, buyMove, moveStock } = await import("../../web/js/game/rules.js");
  const { knownScale, publicProfile } = await import("../../web/js/game/battle.js");
  const { SHOP_MOVES } = await import("../../web/js/game/data.js");
  const words = Array.from({ length: 250 }, (_, i) => ({ uid: `w${i}`, text: `palabra${i}`, meaning: i % 10 === 9 ? "" : `meaning ${i}`, created_at: 1000 + i }));
  const last = battleWords(words, "last100");
  assert.equal(last.length, LAST_WORDS);
  assert.equal(last[0].uid, "w248", "newest first (w249 has no meaning, so it can't be asked)");
  assert.ok(last.every((v) => v.meaning), "only words with a meaning");
  assert.equal(battleWords(words, "unlimited").length, 225, "every word with a meaning");

  const s = newState(40);
  s.review.w1 = [MATURE_BOX, 0, 5, 0];
  s.review.w2 = [1, 0, 1, 0];
  assert.equal(knownWords(s, words, new Set(["w3", "w4", "w1"])), 3, "remembered in the flashcards, or well known from battles, counted once");
  assert.equal(knownScale(0), 1);
  assert.equal(knownScale(100), 1.25);
  assert.equal(knownScale(300), 1.5);
  assert.equal(knownScale(1e9), 2, "never more than double");
  const g = { ...newGenome(41, "ember"), growth: 0.5 };
  assert.equal(fighter(s, g, { scale: 1.5 }).max, Math.round(fighter(s, g).max * 1.5));
  assert.equal(fighter(s, g, { scale: 1.5 }).spd, fighter(s, g).spd, "speed stays: the timeline stays fair");
  s.roster[0].growth = 0.5;
  s.known = 321;
  assert.equal(publicProfile(s, null).team[0].known, 321, "friends' Unlimited battles use it");

  // Moves are bought with coins, once, for every creature.
  const stock = moveStock(s, at("2026-10-30T10:00:00"));
  assert.equal(stock.length, 4);
  assert.deepEqual(moveStock(s, at("2026-10-30T18:00:00")).map((m) => m.id), stock.map((m) => m.id), "the same all day");
  assert.match(buyMove(s, stock[0].id), /more coin/);
  s.coins = 500;
  assert.equal(buyMove(s, stock[0].id), "");
  assert.equal(s.coins, 500 - stock[0].price);
  assert.match(buyMove(s, stock[0].id), /already/);
  assert.match(buyMove(s, "tackle"), /isn't for sale/);
  assert.ok(!moveStock(s, at("2026-10-30T10:00:00")).some((m) => m.id === stock[0].id), "what you have isn't offered again");
  const other = { ...newGenome(42, "tide"), growth: 0.1 };
  assert.ok(knownMoves(s, other).some((m) => m.id === stock[0].id), "every creature may take it");
  for (const m of SHOP_MOVES) assert.ok(m.price > 0 && m.style && (m.kind !== "attack" || m.aim), m.id);
});
