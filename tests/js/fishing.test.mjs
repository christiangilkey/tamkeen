// Run with: node --test tests/js/
// Fishing (game/fishing.js, fishdata.js): which words swim in the pond and how big their shadows are, the card a
// bite asks, answers recorded as reviews and rolled, fights, the one that got away, landing, the basket, the
// aquarium, rods, the Fishdex and what friends see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FISH, FISH_ART, GUARDIAN_ODDS, KIND_WEIGHT, PONDS, RODS, SELL, SHADOWS, fishOf, isGuardian } from "../../web/js/game/fishdata.js";
import { PROTOTYPES } from "../../web/js/prototype.js";
import { TYPE_IDS } from "../../web/js/game/data.js";
import { newState, dayNumber, normalize } from "../../web/js/game/rules.js";
import { rng } from "../../web/js/game/genome.js";
import { TIERS, rollAnswer } from "../../web/js/game/loot.js";
import { cleanAquarium, cleanFish, cleanProfile } from "../../web/js/game/remote.js";
import { TIER_COUNT, PEARLS } from "../../web/js/game/fishdata.js";
import { existsSync, readFileSync } from "node:fs";
import {
  BAG_SIZE, CATCH_FULL, DEX_TOTAL, TANK_SIZE, buyRod, canFish, catchBoard, classify, cleanFishing, dexCount, dexHas, escape, escapedIn,
  MISSED_AT_ONCE, MISS_WAIT, cleanRound, nextShadows, pondWords, roundOf, turnTaken, feedFish, fightLength, fishingOf, fromTank, hook, land, lengthOf, luckOf, pondNeed, pondShadows, publicAquarium, questionFor, record, sell,
  sellCommon, tierOfRoll, toTank, kindOdds, pickKind, bestRod, nextRod, upgradeReady, buyTank,
} from "../../web/js/game/fishing.js";

const T0 = new Date("2026-11-10T09:00:00");
const TODAY = dayNumber(T0);
const WORDS = ["كتاب", "قلم", "بيت", "باب", "شمس", "قمر", "ماء", "خبز", "ولد", "بنت"];
const MEANINGS = ["book", "pen", "house", "door", "sun", "moon", "water", "bread", "boy", "girl"];
const vocab = () => WORDS.map((text, i) => ({ uid: `w${i}`, text, meaning: MEANINGS[i], created_at: i }));
const hatched = (seed = 7) => { const s = newState(seed); s.creature.growth = 0.2; return s; };

test("six ponds, one per element, nine fish in each (one of them its guardian), every fish's numbers sane", () => {
  assert.deepEqual(PONDS.map((p) => p.id).sort(), [...TYPE_IDS].sort());
  assert.equal(FISH.length, 54);
  for (const p of PONDS) {
    const kinds = fishOf(p.id);
    assert.deepEqual(kinds.filter((f) => !f.guardian).map((f) => `${f.size}${f.rare || 0}`), ["10", "11", "12", "20", "21", "22", "30", "31"], p.id);
    assert.equal(kinds.filter((f) => f.guardian).length, 1, p.id);
    assert.ok(kinds[8].guardian, "the guardian is listed last");
    assert.equal(p.water.length, 4);
  }
  assert.equal(new Set(FISH.map((f) => f.id)).size, FISH.length);
  for (const f of FISH) assert.ok(f.cm[0] > 0 && f.cm[1] > f.cm[0], f.id);
  assert.equal(SELL.length, 10);
  assert.equal(DEX_TOTAL, 540);
  for (const s of Object.values(SHADOWS)) assert.equal(s.kinds.length, 3);
  assert.deepEqual(RODS.map((r) => r.pearls), [...RODS.map((r) => r.pearls)].sort((a, b) => a - b));
});

test("two ponds are open from the start; the others open with gym leaders OR fish caught", () => {
  const s = hatched();
  assert.ok(pondNeed(s, "tide").open && pondNeed(s, "grove").open);
  assert.ok(!pondNeed(s, "ember").open);
  s.gyms.beaten = 1;
  assert.ok(pondNeed(s, "ember").open, "a gym badge opens it");
  const t = hatched();
  fishingOf(t).caught = 30;
  assert.ok(pondNeed(t, "ember").open, "so do 30 fish");
  assert.ok(!pondNeed(t, "dusk").open);
});

test("luck: the rod, and the creature's own element's water", () => {
  const s = hatched();
  const home = s.creature.type;
  const away = PONDS.find((p) => p.id !== home).id;
  assert.equal(luckOf(s, away), 1);
  assert.equal(luckOf(s, home), 1.25);
  fishingOf(s).pearls = 10;
  assert.equal(buyRod(s, 1), "");
  assert.equal(luckOf(s, away), 1.1);
  assert.equal(fishingOf(s).pearls, 0);
  assert.match(buyRod(s, 2), /more pearls/);
  assert.match(buyRod(s, 3), /Buy the Neon rod first/);
});

test("the pond shows what's due: due words are shadows, often-missed ones bigger, boss words biggest", () => {
  const s = hatched();
  s.review.w0 = [1, TODAY, 1, 0];       // due today
  s.review.w1 = [0, TODAY - 3, 1, 3];   // due, missed more than got right: big
  s.review.w2 = [3, TODAY + 4, 5, 0];   // asked lately: not due
  s.review.w4 = [2, TODAY - 9, 2, 0];   // long overdue
  for (let i = 6; i < 10; i++) s.review[`w${i}`] = [3, TODAY + 2, 3, 0];
  const flashDue = new Set(["w3", "w2"]); // the flashcards have these due; w2 was asked lately in the game
  const boss = (uid) => uid === "w3";
  const p = pondShadows(s, vocab(), { pond: "tide", now: T0, flashDue, boss });
  assert.equal(p.practice, false);
  assert.equal(p.due, 5);
  // the boss, the often missed, then the longest overdue, then a word never asked
  assert.deepEqual(p.shadows.map((x) => [x.uid, x.cls]), [["w3", "boss"], ["w1", "l"], ["w4", "m"], ["w0", "m"], ["w5", "m"]]);
  const big = p.shadows.find((x) => x.uid === "w1");
  assert.ok(big.luck > p.shadows.find((x) => x.uid === "w0").luck, "an often-missed word is luckier");
  assert.ok(fishOf("tide").filter((f) => f.size === 3).some((f) => f.id === p.shadows.find((x) => x.uid === "w3").sp), "a boss word is one of the pond's big fish");
  // the same word is the same fish all day
  const again = pondShadows(s, vocab(), { pond: "tide", now: new Date("2026-11-10T18:00:00"), flashDue, boss });
  assert.deepEqual(again.shadows.map((x) => x.sp), p.shadows.map((x) => x.sp));
  assert.deepEqual(classify(s, vocab()[2], { today: TODAY, flashDue }), { cls: "s", due: false, extra: true, hard: false, rank: 3 });
  // a word never asked that the flashcards have due comes before one they don't
  assert.equal(classify(s, vocab()[3], { today: TODAY, flashDue }).rank, 1);
  assert.equal(classify(s, vocab()[5], { today: TODAY, flashDue }).rank, 2);
});

test("nothing due: practice fishing on other words, small shadows, as extras (lower luck)", () => {
  const s = hatched();
  for (let i = 0; i < 10; i++) s.review[`w${i}`] = [2, TODAY + 1 + i, 2, 0];
  const p = pondShadows(s, vocab(), { pond: "grove", now: T0 });
  assert.equal(p.due, 0);
  assert.equal(p.practice, true);
  assert.equal(p.shadows.length, 6);
  assert.deepEqual(p.shadows.map((x) => x.uid), ["w0", "w1", "w2", "w3", "w4", "w5"], "the ones that come due soonest");
  assert.ok(p.shadows.every((x) => x.cls === "s" && x.extra && !x.due));
  // a word already out of the water is not put back
  const skip = new Set([p.shadows[0].uid]);
  assert.ok(!pondShadows(s, vocab(), { pond: "grove", now: T0, skip }).shadows.some((x) => skip.has(x.uid)));
});

test("a word whose meaning gives it away never swims; too few meanings: no fishing", () => {
  const s = hatched();
  const v = [...vocab(), { uid: "x", text: "سلام", meaning: "(سلام)" }];
  s.review.x = [0, TODAY, 0, 0];
  assert.ok(!pondShadows(s, v, { now: T0 }).shadows.some((x) => x.uid === "x"));
  assert.ok(canFish(s, vocab()));
  assert.ok(!canFish(s, vocab().slice(0, 3)));
});

test("a bite asks that very word: its meaning, four choices in the language being learnt", () => {
  const s = hatched();
  for (const uid of ["w0", "w4", "w9"]) {
    const q = questionFor(s, vocab(), uid, { rand: rng(3), now: T0 });
    assert.equal(q.uid, uid);
    assert.equal(q.prompt, MEANINGS[Number(uid.slice(1))]);
    assert.equal(q.options.length, 4);
    assert.equal(q.options[q.answer], WORDS[Number(uid.slice(1))]);
    assert.ok(q.options.every((o) => WORDS.includes(o)));
  }
});

test("an answer is a review (as battles record them) and a roll; a wrong one comes back sooner", () => {
  const s = hatched();
  s.review.w0 = [3, TODAY, 3, 0];
  const calls = [];
  const roller = (st, ctx, rand, now) => { calls.push(ctx); return rollAnswer(st, ctx, rand, now); };
  const right = record(s, { uid: "w0", correct: true, ms: 3000, due: true, luck: 1.25 }, () => 0.99, T0, roller);
  assert.equal(s.review.w0[0], 4, "up a box");
  assert.equal(right.roll.rolled, true);
  assert.ok(right.review.xp > 0);
  assert.deepEqual(calls[0], { source: "fish", correct: true, ms: 3000, uid: "w0", due: true, extra: false, luck: 1.25, pay: false });
  const wrong = record(s, { uid: "w0", correct: false, ms: 3000, due: true, luck: 1 }, () => 0.5, T0, roller);
  assert.equal(s.review.w0[0], 2, "down two boxes: it comes back sooner");
  assert.equal(wrong.roll.rolled, false);
  assert.equal(calls[1].correct, false, "wrong answers are rolled too (they end the streak, make boss words)");
  // too fast to have been read: no roll, a Common at most
  const fast = record(s, { uid: "w1", correct: true, ms: 300, due: true, luck: 1 }, () => 0.001, T0, roller);
  assert.equal(fast.roll.rolled, false);
  assert.equal(tierOfRoll(fast.roll), 0);
});

test("Legendary and up fight back: one or two more right answers", () => {
  assert.deepEqual([0, 3, 4, 6, 7, 9].map((t) => fightLength(t)), [0, 0, 1, 1, 2, 2]);
  assert.equal(TIERS[4].id, "legendary");
});

test("landing: the basket, the Fishdex, the longest, this week's best, pearls in rare fish", () => {
  const s = hatched();
  const r = land(s, { pond: "tide", sp: "ray", tier: 4 }, () => 0.5, T0);
  assert.ok(r.newKind && r.newTier && r.longest && r.weekBest);
  assert.equal(r.pearls, 2);
  const f = fishingOf(s);
  assert.equal(f.pearls, 2);
  assert.equal(f.caught, 1);
  assert.equal(f.bag.length, 1);
  assert.equal(f.bag[0].w, SELL[4]);
  assert.ok(dexHas(s, "ray", 4) && !dexHas(s, "ray", 3));
  assert.equal(dexCount(s), 1);
  assert.equal(r.fish.cm, lengthOf("ray", 4, () => 0.5));
  const again = land(s, { pond: "tide", sp: "ray", tier: 4 }, () => 0.1, T0);
  assert.ok(!again.newKind && !again.newTier && !again.longest && !again.weekBest);
  assert.equal(dexCount(s), 1);
});

test("the day's catches sell for less after the first ones; a full basket sells its cheapest for room", () => {
  const s = hatched();
  for (let i = 0; i < CATCH_FULL; i++) land(s, { pond: "tide", sp: "guppy", tier: 2 }, () => 0.9, T0);
  const late = land(s, { pond: "tide", sp: "guppy", tier: 2 }, () => 0.9, T0);
  assert.ok(late.fish.w < SELL[2]);
  const t = hatched();
  const coins = t.coins;
  for (let i = 0; i < BAG_SIZE; i++) land(t, { pond: "tide", sp: "guppy", tier: 1 }, () => 0.9, new Date(T0.getTime() + i * 86400000));
  land(t, { pond: "tide", sp: "ray", tier: 0 }, () => 0.9, T0);
  assert.equal(fishingOf(t).bag.length, BAG_SIZE);
  assert.ok(fishingOf(t).bag.some((x) => x.sp === "ray") === false, "the Common went for room");
  assert.equal(t.coins, coins + SELL[0]);
});

test("the one that got away: it waits in that pond today, and is the next fish hooked there (it fights again)", () => {
  const s = hatched();
  escape(s, { pond: "tide", sp: "ray", tier: 6 }, T0);
  assert.equal(escapedIn(s, "grove", T0), null);
  assert.equal(escapedIn(s, "tide", new Date("2026-11-11T09:00:00")), null, "gone the next day");
  assert.deepEqual(hook(s, { pond: "grove", sp: "koi", tier: 1 }, T0), { sp: "koi", tier: 1, back: false });
  const h = hook(s, { pond: "tide", sp: "guppy", tier: 1 }, T0);
  assert.deepEqual(h, { sp: "ray", tier: 6, back: true });
  assert.equal(fightLength(h.tier), 1, "so it has to be fought again");
  assert.ok(escapedIn(s, "tide", T0), "still out there until it is landed");
  const r = land(s, { pond: "tide", ...h }, () => 0.5, T0);
  assert.equal(r.fish.sp, "ray");
  assert.equal(r.fish.t, 6);
  assert.equal(escapedIn(s, "tide", T0), null);
  // something rarer than the one that got away is itself; landing it, the smaller one is forgotten
  escape(s, { pond: "tide", sp: "ray", tier: 4 }, T0);
  const big = hook(s, { pond: "tide", sp: "clownfish", tier: 8 }, T0);
  assert.deepEqual(big, { sp: "clownfish", tier: 8, back: false });
  land(s, { pond: "tide", ...big }, () => 0.5, T0);
  assert.equal(escapedIn(s, "tide", T0), null);
  // a bigger one that gets away replaces a smaller, never the other way
  escape(s, { pond: "tide", sp: "ray", tier: 7 }, T0);
  escape(s, { pond: "tide", sp: "guppy", tier: 5 }, T0);
  assert.equal(escapedIn(s, "tide", T0).t, 7);
});

test("the basket: sell, sell the commons, feed (a meal, up to three a day), the aquarium", () => {
  const s = hatched();
  for (const t of [0, 1, 5, 3]) land(s, { pond: "tide", sp: "guppy", tier: t }, () => 0.5, T0);
  const c0 = s.coins;
  assert.deepEqual(sellCommon(s), { n: 2, coins: SELL[0] + SELL[1] });
  assert.equal(s.coins, c0 + SELL[0] + SELL[1]);
  const f = fishingOf(s);
  assert.equal(f.bag.length, 2);
  assert.equal(toTank(s, 0), "");
  assert.equal(f.tank.length, 1);
  assert.equal(f.tank[0].t, 5);
  assert.equal(fromTank(s, 0), "");
  assert.equal(f.bag.length, 2);
  const fed = feedFish(s, 0, T0);
  assert.ok(fed.bond >= 1);
  assert.equal(f.bag.length, 1);
  assert.equal(sell(s, [0]), SELL[5]);
  for (let i = 0; i < TANK_SIZE + 1; i++) land(s, { pond: "tide", sp: "guppy", tier: 0 }, () => 0.5, T0);
  for (let i = 0; i < TANK_SIZE; i++) assert.equal(toTank(s, 0), "");
  assert.match(toTank(s, 0), /full/);
});

test("an egg can't eat a fish: it stays in the basket", () => {
  const s = newState(9);
  land(s, { pond: "tide", sp: "guppy", tier: 0 }, () => 0.5, T0);
  assert.equal(typeof feedFish(s, 0, T0), "string");
  assert.equal(fishingOf(s).bag.length, 1);
  assert.equal(s.items.food_fish || 0, 0);
});

test("a saved fishing part is checked, and survives the game's own normalize", () => {
  const bad = cleanFishing({ pond: "lava", rod: 3, rods: [1], pearls: -4, dex: { ray: 5, nope: 1, __proto__: 3 },
    bag: [{ sp: "ray", t: 99, cm: 5000 }, { sp: "shark", t: 1 }], tank: "x", escaped: { day: "2026-11-10", sp: "nope" } });
  assert.equal(bad.pond, "tide");
  assert.equal(bad.rod, 0, "a rod not owned isn't in use");
  assert.deepEqual(bad.rods, [0, 1]);
  assert.equal(bad.pearls, 0);
  assert.deepEqual(bad.dex, { ray: 5 });
  assert.equal(bad.bag.length, 1);
  assert.equal(bad.bag[0].t, 9);
  assert.equal(bad.bag[0].cm, 999);
  assert.deepEqual(bad.tank, []);
  assert.equal(bad.escaped, null);
  const s = hatched();
  land(s, { pond: "tide", sp: "koi", tier: 2 }, () => 0.5, T0);
  const back = normalize(JSON.parse(JSON.stringify(s)));
  assert.equal(fishingOf(back).caught, 1);
  assert.ok(dexHas(back, "koi", 2));
});

test("friends see the aquarium and this week's biggest catch, nothing else; the board is this week's, longest first", () => {
  const s = hatched();
  land(s, { pond: "tide", sp: "ray", tier: 3 }, () => 0.5, T0);
  toTank(s, 0);
  const mine = publicAquarium(s, T0);
  assert.deepEqual(Object.keys(mine).sort(), ["best", "dex", "tank", "week"]);
  assert.equal(mine.tank.length, 1);
  assert.equal(mine.best.sp, "ray");
  const old = { ...mine, week: mine.week - 1 };
  const board = catchBoard([
    { id: "a", name: "Ana", aquarium: { ...mine, best: { sp: "koi", t: 1, cm: 40 } } },
    { id: "me", name: "Me", me: true, aquarium: mine },
    { id: "b", name: "Ben", aquarium: old },
    { id: "c", name: "Cy", aquarium: null },
  ], T0);
  assert.deepEqual(board.map((r) => r.id), board[0].fish.cm >= 40 ? ["me", "a"] : ["a", "me"]);
  assert.ok(!board.some((r) => r.id === "b" || r.id === "c"));
});

test("the fish tables cover every tier of the shared roll (loot.js)", () => {
  assert.equal(TIER_COUNT, TIERS.length);
  assert.equal(SELL.length, TIERS.length);
  assert.equal(PEARLS.length, TIERS.length);
  for (let t = 1; t < TIERS.length; t++) assert.ok(SELL[t] >= SELL[t - 1] && PEARLS[t] >= PEARLS[t - 1], `tier ${t} is worth no less than the one below`);
});

test("a friend's aquarium is checked on arrival: only fish the game has, sane tiers and lengths, at most six", () => {
  assert.equal(cleanAquarium(null), null);
  assert.equal(cleanAquarium("<img src=x onerror=alert(1)>"), null);
  const a = cleanAquarium({
    tank: [{ sp: "ray", t: 4, cm: 80.26 }, { sp: "<script>", t: 1, cm: 5 }, { sp: "koi", t: 99, cm: 1e9 }, { sp: "koi", t: 1, cm: "9" }, null,
      ...Array.from({ length: 30 }, () => ({ sp: "guppy", t: 0, cm: 4 }))],
    week: 2967, best: { sp: "pike", t: 3, cm: 77 }, dex: 5000, extra: "ignored",
  });
  assert.deepEqual(Object.keys(a).sort(), ["best", "dex", "tank", "week"]);
  assert.equal(a.tank.length, 6);
  assert.deepEqual(a.tank[0], { sp: "ray", t: 4, cm: 80.3 });
  assert.deepEqual(a.tank[1], { sp: "koi", t: 9, cm: 999 }, "a made-up tier and length are brought into range");
  assert.ok(a.tank.every((f) => FISH.some((k) => k.id === f.sp)));
  assert.equal(a.dex, 540);
  assert.deepEqual(a.best, { sp: "pike", t: 3, cm: 77 });
  assert.equal(cleanFish({ sp: "__proto__", t: 0, cm: 3 }), null);
  assert.equal(cleanAquarium({ week: -4, best: { sp: "nope" } }).week, null);
  // it rides in the friend's game profile; an older app's profile simply has none
  assert.equal(cleanProfile({ team: [], aquarium: { tank: [{ sp: "eel", t: 2, cm: 120 }], week: 1, best: null, dex: 3 } }).aquarium.tank[0].sp, "eel");
  assert.equal(cleanProfile({ team: [] }).aquarium, null);
});

test("what I publish of my aquarium passes the same check unchanged", () => {
  const s = hatched();
  land(s, { pond: "tide", sp: "ray", tier: 3 }, () => 0.5, T0);
  land(s, { pond: "tide", sp: "guppy", tier: 0 }, () => 0.5, T0);
  toTank(s, 0);
  const mine = publicAquarium(s, T0);
  assert.deepEqual(cleanAquarium(JSON.parse(JSON.stringify(mine))), mine);
});

test("the screens never put a friend's text into HTML, and the pond records answers the way battles do", () => {
  const src = (f) => readFileSync(new URL(`../../web/js/game/${f}`, import.meta.url), "utf8");
  const screen = src("fishscreen.js");
  assert.match(screen, /cleanProfiles\(await social\.gameProfiles/, "friends' rows are checked first");
  assert.match(screen, /cleanName\(user\.username/);
  assert.doesNotMatch(screen, /innerHTML[^;]*\b(r\.name|user\.username|name)\b/);
  const rules = src("fishing.js");
  assert.match(rules, /answerQuestion\(state, uid, !!correct, now\)/, "the same review path as battles");
  assert.match(rules, /pay: false/, "the fish is the reward: the roll itself pays nothing more");
  // nothing in fishing is sold for coins, gems or money that makes a roll: rods cost pearls, which only fishing finds
  assert.doesNotMatch(rules, /state\.(coins|gems) -= /);
});

test("the online database's check (supabase/v9-fishing.sql) allows what the app sends and no more", () => {
  const sql = readFileSync(new URL("../../supabase/v9-fishing.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists aquarium jsonb/);
  assert.match(sql, /check \(private\.valid_aquarium\(aquarium\)\)/);
  assert.match(sql, /jsonb_array_length\(a->'tank'\) > 6/, "the tank holds six, as fishing.TANK_SIZE");
  assert.equal(TANK_SIZE, 6);
  // a fish's kind is a short lower-case name: every kind the game has fits the pattern
  const kind = /\(f->>'sp'\) !~ '(\^\[a-z_\]\{1,24\}\$)'/.exec(sql);
  assert.ok(kind, "the fish-kind pattern is there");
  for (const f of FISH) assert.match(f.id, new RegExp(kind[1]), f.id);
  assert.match(sql, /\(f->>'t'\)::numeric > 9/, "tiers 0 to 9");
  assert.equal(TIERS.length, 10);
  // it adds no rule of its own about who may read: the row's existing rule (friends and guild-mates) covers the column
  assert.doesNotMatch(sql, /create policy|drop policy|grant select/i);
  // and what the app publishes is small enough for it
  const s = hatched();
  for (let i = 0; i < 6; i++) { land(s, { pond: "tide", sp: "coelacanth", tier: 9 }, () => 0.99, T0); toTank(s, 0); }
  assert.ok(JSON.stringify(publicAquarium(s, T0)).length < 1500);
});

test("the habitat draws the aquarium in the room on its own and answers a tap on it (not from inside the gifts' or the glow's code)", () => {
  // (2df7fda6 had both blocks a few lines off: the tank only showed while a gift waited, and its tap did nothing;
  // since the room the tank stands in it: roomTank)
  const src = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.ok(src.includes("const roomTank = () => (fishingOf(game).caught > 0 ?"), "in the room once a fish is caught");
  assert.match(src, /if \(roomTank\(\)\.length && Math\.abs\(x - TANK_IN\.x\) < 18/, "its own tap: the creature walks over, then the basket");
  const data = readFileSync(new URL("../../web/js/game/data.js", import.meta.url), "utf8");
  assert.ok(data.indexOf("Fishing (fishdata.js)") < data.indexOf("const listed = new Set(out.map"), "the fishing art is listed before the arenas' leftovers are worked out");
});

test("Home shows the aquarium under the Fishing tile once a fish has been caught, with words for an empty tank", () => {
  const src = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  const fishing = src.indexOf('subTile("fishing"');
  assert.ok(fishing > 0 && fishing < src.indexOf('id="g-aquarium"'), "the aquarium comes after the Fishing tile");
  assert.match(src, /box\.hidden = !\(F\.caught > 0 \|\| F\.tank\.length\)/, "nothing is shown before the first catch");
  assert.match(src, /aquariumView\(F\.tank/, "the fish kept in the tank are the ones drawn");
  assert.match(src, /hud-aq-empty"\)\.hidden = F\.tank\.length > 0/, "an empty tank says what it is for");
  assert.match(src, /#g-aquarium"\)\.onclick = \(\) => go\("basket"\)/, "a tap opens the Basket");
  // (its two lines of words are ones the Basket already has, so they are translated in every language)
  const basket = readFileSync(new URL("../../web/js/game/fishscreen.js", import.meta.url), "utf8");
  assert.ok(basket.includes("Keep your best fish here. Your friends can see your aquarium.") && src.includes("Keep your best fish here. Your friends can see your aquarium."));
});

test("the pond says the right answer's word when a choice is made, as battles do, and never waits for it", () => {
  const src = readFileSync(new URL("../../web/js/game/fishing-ui.js", import.meta.url), "utf8");
  assert.match(src, /import \{ snippetPlayer \} from "\.\.\/snippetplayer\.js";/);
  assert.match(src, /const sayCard = cardSayer\(player\.playSnippet\);/, "the shared player: one word at a time");
  assert.match(src, /game_sound === false\) return;/, "game sound off: not said");
  assert.match(src, /sayCard\(v, "word"\)\.catch\(\(\) => \{\}\);/, "not awaited: the card moves on at once");
  assert.doesNotMatch(src, /await sayCard|await sayAnswer/);
  assert.match(src, /if \(i !== null\) sayAnswer\(c\.q\);/, "said for a right or a wrong choice, not when the time ran out");
  assert.match(src, /correct \? 500 : 1400/, "the card's own timings are as they were");
  assert.match(src, /player\.stop\(\); stopDevice\(\);/, "leaving the pond stops it");
});

// One word choice for every game (the owner: "if you set the current vocab list, that it sets the vocab for all
// games"): the pond's fish are the words battles ask (rules.battleWordsFor), and the Fishing screen has the same picker.
test("the pond fishes the game's word choice, the same words as battles", async () => {
  const { battleWordsFor, setBattlePicks } = await import("../../web/js/game/rules.js");
  const s = hatched();
  // 30 words: the first 22 in folder "f1", the rest in no folder.
  const many = Array.from({ length: 30 }, (_, i) => ({ uid: `m${i}`, text: `كلمة${i}`, meaning: `meaning ${i}`, created_at: i,
    folders: i < 22 ? ["f1"] : [] }));
  s.battleMode = "folder";
  setBattlePicks(s, ["f1"]);
  const pool = battleWordsFor(many, s);
  assert.equal(pool.length, 22);
  const fish = pondShadows(s, pool, { now: T0 }).shadows.map((x) => x.uid);
  assert.ok(fish.length > 0);
  assert.ok(fish.every((uid) => Number(uid.slice(1)) < 22), "only the folder's words swim");
  const src = (f) => readFileSync(new URL(`../../web/js/game/${f}`, import.meta.url), "utf8");
  const ui = src("fishing-ui.js");
  assert.match(ui, /vocab: pondWords\(vocab, game\)/, "the pond's words are the game's word choice");
  assert.match(src("fishing.js"), /battleWordsFor\(vocab, state/, "which is the battles' own");
  assert.match(ui, /loadWords\(game\), battleDictionary\(\)/);
  // One place to choose them (the owner, 2026-11-17: "the words folder picker should be here as a button"): the Words
  // tile on the games home, not a copy in the Battle and Fishing screens.
  const home = src("habitat.js");
  // (the owner: "the fishing and the words button should be on the same line, equal to the size of the other buttons")
  assert.ok(home.includes('${subTile("fishing", "fishing", "Fishing")}${subTile("words", "words", "Words")}'), "Words sits beside Fishing");
  assert.ok(home.includes('class="hud-tile has-sub" id="g-${id}"'), "a tile like the others (no wide tile)");
  assert.match(home, /openWordChoice\(\{ changed: \(\) => \{ paintWords\(\); paintFishing\(\); \} \}\)/, "a change repaints Words and the fish waiting");
  assert.doesNotMatch(src("fishscreen.js"), /wordModePicker/, "the Fishing screen has no copy of its own");
  const battleUi = src("battle-ui.js");
  assert.doesNotMatch(battleUi, /wordsBlock/, "nor the Battle screen");
  assert.match(battleUi, /export function openWordChoice[\s\S]*?wordModePicker\(game, changed/, "the box holds the one picker");
});

// ---------- every word gets its turn (the owner: "the pond shows the same words on a loop even with a folder picked") ----------

/** `n` words, all in folder "f1" unless `folder` says otherwise. */
const wordList = (n, folder = () => ["f1"]) => Array.from({ length: n }, (_, i) => ({ uid: `m${i}`, text: `كلمة${i}`, meaning: `meaning ${i}`, created_at: i, folders: folder(i) }));
/** Fish the pond the way the screen does: take the first shadow, answer it (`right(uid)`), record it, and again. */
function fishOn(s, words, right, turns, now = T0, seen = []) {
  for (let i = 0; i < turns; i++) {
    const res = nextShadows(s, words, { now });
    if (!res.shadows.length) break;
    const uid = res.shadows[0].uid;
    const ok = right(uid);
    record(s, { uid, correct: ok, ms: 3000, due: res.shadows[0].due, extra: res.shadows[0].extra, luck: 1 }, () => 0.9, now, () => ({ rolled: false }));
    turnTaken(s, uid, ok, now);
    seen.push(uid);
  }
  return seen;
}

test("the loop is gone: 40 words, 12 shadows, and every word has its turn before any answered right comes back", () => {
  const s = hatched();
  const words = wordList(40);
  const seen = fishOn(s, words, () => true, 40);
  assert.equal(new Set(seen).size, 40, "40 casts, 40 different words");
  // (before the fix the first shadow was the same word for ever once it was missed, and the same dozen otherwise)
  const again = fishOn(s, words, () => true, 5);
  assert.equal(again.length, 5, "then the round starts again: the pond is never empty");
});

test("leaving the pond and coming back carries on: the round is in the saved game, for the day", () => {
  const s = hatched();
  const words = wordList(30);
  const first = fishOn(s, words, () => true, 10);
  // closing the pond, the app, another device: only the saved game survives
  const back = normalize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(roundOf(back, T0).done, first);
  const next = fishOn(back, words, () => true, 20);
  assert.equal(new Set([...first, ...next]).size, 30, "the 20 that hadn't had their turn, none of the 10 that had");
  // a new day starts a new round
  assert.deepEqual(roundOf(back, new Date("2026-11-11T09:00:00")).done, []);
});

test("a missed word comes back ahead of new ones, after a few other fish, and can't keep the rest from their turn", () => {
  const s = hatched();
  const words = wordList(30);
  const bad = new Set(["m3", "m7"]); // two words this learner always misses
  const seen = fishOn(s, words, (uid) => !bad.has(uid), 60);
  // every other word had its turn...
  assert.equal(new Set(seen.filter((u) => !bad.has(u))).size, 28);
  // ...and while other words were still waiting for theirs, a missed one came back only after other fish
  const others = new Set();
  const allSeenAt = seen.findIndex((u) => { if (!bad.has(u)) others.add(u); return others.size === 28; });
  assert.ok(allSeenAt > 0 && allSeenAt <= 40, `the 28 others had their turn within 40 casts (${allSeenAt + 1})`);
  for (const u of bad) {
    const at = seen.map((x, i) => (x === u ? i : -1)).filter((i) => i >= 0);
    assert.ok(at.length >= 2, `${u} came back`);
    for (let i = 1; i < at.length && at[i] <= allSeenAt; i++) assert.ok(at[i] - at[i - 1] > MISS_WAIT, `${u} waited for other fish: ${at}`);
    assert.ok(at[1] <= allSeenAt, `${u} came back before the new words ran out`);
  }
  // a missed word whose wait is over swims ahead of words never asked
  const t = hatched();
  turnTaken(t, "m5", false, T0);
  record(t, { uid: "m5", correct: false, ms: 3000, due: true, luck: 1 }, () => 0.9, T0, () => ({ rolled: false }));
  for (const u of ["m0", "m1", "m2"]) turnTaken(t, u, true, T0);
  assert.equal(nextShadows(t, words, { now: T0 }).shadows[0].uid, "m5");
  // and at most MISSED_AT_ONCE missed words are in the water at once
  const many = hatched();
  for (let i = 0; i < 10; i++) turnTaken(many, `m${i}`, false, T0);
  for (let i = 0; i < 40; i++) turnTaken(many, "x", true, T0); // (time passes: all ten may come back)
  const water = nextShadows(many, words, { now: T0 }).shadows.map((x) => x.uid);
  assert.equal(water.filter((u) => Number(u.slice(1)) < 10).length, MISSED_AT_ONCE);
  assert.ok(water.length > MISSED_AT_ONCE, "the rest of the water is words that haven't had their turn");
});

test("only missed words left: they come without more waiting, and a round of nothing but misses never empties the pond", () => {
  const s = hatched();
  const words = wordList(6);
  const seen = fishOn(s, words, () => false, 20);
  assert.equal(seen.length, 20);
  assert.equal(new Set(seen).size, 6);
});

test("practice (nothing due) goes through the whole set too, not the same six", () => {
  const s = hatched();
  const words = wordList(25);
  for (let i = 0; i < 25; i++) s.review[`m${i}`] = [3, TODAY + 3 + i, 3, 0];
  assert.equal(nextShadows(s, words, { now: T0 }).practice, true);
  const seen = fishOn(s, words, () => true, 25);
  assert.equal(new Set(seen).size, 25);
});

test("a picked folder is fished whatever its size (battles still need 20); too few meanings to ask: the usual words", async () => {
  const { battleWordsFor, setBattlePicks, MIN_SET } = await import("../../web/js/game/rules.js");
  const s = hatched();
  const words = wordList(40, (i) => (i < 7 ? ["f1"] : i < 9 ? ["tiny"] : []));
  s.battleMode = "folder";
  setBattlePicks(s, ["f1"]);
  assert.equal(MIN_SET, 20);
  assert.equal(battleWordsFor(words, s).length, 40, "a battle falls back to the newest words");
  const pond = pondWords(words, s);
  assert.deepEqual(pond.map((v) => v.uid).sort(), ["m0", "m1", "m2", "m3", "m4", "m5", "m6"], "the pond fishes the folder's seven");
  const seen = fishOn(s, pond, () => true, 14);
  assert.equal(new Set(seen).size, 7, "all seven, then round again");
  assert.ok(seen.every((u) => Number(u.slice(1)) < 7));
  // every question can be asked from the folder alone
  assert.ok(questionFor(s, pond, "m2", { rand: rng(4), now: T0 }));
  // two words can't make four choices: the usual words instead
  setBattlePicks(s, ["tiny"]);
  assert.equal(pondWords(words, s).length, 40);
  // and other word choices are the battles' own
  s.battleMode = "last100";
  assert.deepEqual(pondWords(words, s), battleWordsFor(words, s));
});

test("the due count and the luck of due and hard words are as they were", () => {
  const s = hatched();
  const words = wordList(30);
  s.review.m1 = [0, TODAY - 2, 1, 3];
  for (let i = 20; i < 30; i++) s.review[`m${i}`] = [3, TODAY + 5, 3, 0];
  const plain = pondShadows(s, words, { now: T0 });
  const round = nextShadows(s, words, { now: T0 });
  assert.equal(round.due, plain.due);
  assert.equal(round.due, 20);
  assert.deepEqual(round.shadows.map((x) => [x.uid, x.cls, x.luck]), plain.shadows.map((x) => [x.uid, x.cls, x.luck]), "an untouched round is the old order");
  assert.equal(round.shadows[0].uid, "m1");
  assert.equal(round.shadows[0].cls, "l");
});

test("a saved round is checked: only word ids, a missed word is not also done", () => {
  const r = cleanRound({ day: "2026-11-10T00", n: "7", done: ["a", 5, "", "b", "a", "x".repeat(99)], miss: [{ u: "b", c: 2, at: 9 }, { u: 3 }, null, "z"] });
  assert.deepEqual(r, { day: "2026-11-10", n: 7, done: ["a"], miss: [{ u: "b", c: 2, at: 9 }] });
  assert.deepEqual(cleanRound("nope"), { day: "", n: 0, done: [], miss: [] });
  assert.deepEqual(cleanFishing({}).round, { day: "", n: 0, done: [], miss: [] });
});

// ---------- more kinds of fish (2026-11-25): which fish a shadow is ----------

const OLD_FISH = ["guppy", "clownfish", "ray", "minnow", "koi", "pike", "tetra", "puffer", "gar", "danio", "angelfish", "eel", "loach", "trout",
  "coelacanth", "moonfish", "angler", "ghost_koi"];

test("the fish there were before are still there, and are still the usual catch", () => {
  for (const id of OLD_FISH) {
    const f = FISH.find((x) => x.id === id);
    assert.ok(f && !f.rare && !f.guardian, id);
  }
  assert.deepEqual(FISH.filter((f) => !f.rare && !f.guardian).map((f) => f.id).sort(), [...OLD_FISH].sort(), "no new fish is a usual one");
  for (const p of PONDS) {
    for (const cls of Object.keys(SHADOWS)) {
      const odds = kindOdds(p.id, cls);
      assert.equal(Object.keys(odds).length, 9);
      assert.ok(Math.abs(Object.values(odds).reduce((a, b) => a + b, 0) - 1) < 1e-9, `${p.id} ${cls}: the chances add up to 1`);
      const usual = fishOf(p.id).filter((f) => !f.rare && !f.guardian).reduce((a, f) => a + odds[f.id], 0);
      assert.ok(usual >= 0.69, `${p.id} ${cls}: the usual fish are ${usual} of the catches`);
      const seldom = fishOf(p.id).filter((f) => f.rare === 2).reduce((a, f) => a + odds[f.id], 0);
      assert.ok(seldom <= 0.065, `${p.id} ${cls}: the seldom ones are ${seldom}`);
    }
  }
  assert.ok(KIND_WEIGHT[0] > KIND_WEIGHT[1] && KIND_WEIGHT[1] > KIND_WEIGHT[2]);
});

test("a pond's guardian is hardly ever there: 1 in 400 for a due word, never likelier than 1 in 50", () => {
  assert.equal(FISH.filter((f) => f.guardian).length, 6);
  assert.deepEqual(FISH.filter((f) => f.guardian).map((f) => f.pond).sort(), PONDS.map((p) => p.id).sort());
  assert.deepEqual(GUARDIAN_ODDS, { s: 1 / 800, m: 1 / 400, l: 1 / 200, boss: 1 / 50 });
  for (const p of PONDS) {
    const g = fishOf(p.id).find((f) => f.guardian);
    assert.ok(isGuardian(g.id) && !isGuardian(fishOf(p.id)[0].id) && !isGuardian("nothing"));
    for (const cls of Object.keys(SHADOWS)) assert.equal(kindOdds(p.id, cls)[g.id], GUARDIAN_ODDS[cls]);
    // the very start of the roll is the guardian; everything after is an ordinary fish
    assert.equal(pickKind(p.id, "m", () => 0), g.id);
    assert.ok(!isGuardian(pickKind(p.id, "m", () => 0.003)));
    assert.ok(!isGuardian(pickKind(p.id, "boss", () => 0.9999)));
  }
  // over many casts it comes out as often as the table says
  const r = rng(99);
  const n = 200000;
  const seen = {};
  for (let i = 0; i < n; i++) { const id = pickKind("tide", "m", r); seen[id] = (seen[id] || 0) + 1; }
  const odds = kindOdds("tide", "m");
  for (const [id, p] of Object.entries(odds)) assert.ok(Math.abs((seen[id] || 0) / n - p) < 0.004, `${id}: ${(seen[id] || 0) / n} for ${p}`);
});

test("a rare kind or a guardian pays what the usual fish of its tier pays: coins and pearls come from the tier alone", () => {
  for (const tier of [0, 3, 6]) {
    const worth = (sp) => { const s = hatched(); const got = land(s, { pond: "tide", sp, tier }, () => 0.5, T0); return [got.fish.w, got.pearls]; };
    const usual = worth("guppy");
    for (const sp of ["goby", "marlin", "leviathan"]) assert.deepEqual(worth(sp), usual, `${sp} at tier ${tier}`);
  }
  // and a kind changes nothing about luck: the roll's luck never looks at which fish it is
  const src = readFileSync(new URL("../../web/js/game/fishing.js", import.meta.url), "utf8");
  assert.doesNotMatch(src.slice(src.indexOf("export function luckOf")).split("\n}")[0], /guardian|rare/);
});

test("every fish has its picture, 24 x 16, and the guardian's own moment (released in v0.76.0) still goes through its switch", () => {
  for (const f of FISH) {
    const png = new URL(`../../web/game-art/fish/${f.id}.png`, import.meta.url);
    assert.ok(existsSync(png), `${f.id}.png`);
    const b = readFileSync(png);
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], FISH_ART, f.id);
  }
  assert.equal(PROTOTYPES.fish_guardians.released, true, "released for everybody in v0.76.0");
  const ui = readFileSync(new URL("../../web/js/game/fishing-ui.js", import.meta.url), "utf8");
  assert.match(ui, /const guardShow = feature\("fish_guardians"\)/);
  for (const m of ui.matchAll(/isGuardian\(/g)) assert.match(ui.slice(Math.max(0, m.index - 40), m.index), /guardShow && $/, "every guardian effect in the pond asks the prototype first");
  const aq = readFileSync(new URL("../../web/js/game/aquarium.js", import.meta.url), "utf8");
  assert.match(aq, /if \(feature\("fish_guardians"\)\) for \(const s of list\)/);
});

// ---------- the "Legendary feast" badge (prototype legend_feast, 2026-11-25) ----------

/** Run `fn` with prototype mode on (prototype.js reads the device's storage). */
function withPrototype(fn) {
  const had = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k === "tamkeenPrototype" ? "1" : null), setItem() {}, removeItem() {} };
  try { return fn(); } finally { if (had === undefined) delete globalThis.localStorage; else globalThis.localStorage = had; }
}
const DAY = 86400000;
/** A game with fish of these tiers in the basket, fed one a day (three meals a day is the limit). */
const withFish = (tiers) => { const s = hatched(); s.xp = 100; s.badges.push("first_hatch"); for (const tier of tiers) land(s, { pond: "tide", sp: "ray", tier }, () => 0.5, T0); return s; };
const feedOn = (s, day) => feedFish(s, 0, new Date(T0.getTime() + day * DAY));

test("Legendary feast: feeding a fish of Legendary rarity or better earns the badge, once", async () => {
  const { checkBadges } = await import("../../web/js/game/rules.js");
  const { BADGES } = await import("../../web/js/game/data.js");
  const { tick } = await import("../../web/js/game/idle.js");
  const badge = BADGES.find((b) => b.id === "legend_feast");
  assert.ok(badge && badge.proto === "legend_feast" && badge.name && badge.text);
  assert.equal(PROTOTYPES.legend_feast.released, true, "released for everybody in v0.75.0");
  const png = readFileSync(new URL("../../web/game-art/badge/legend_feast.png", import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [24, 24]);
  withPrototype(() => {
    const s = withFish([3, 4, 5, 9]);                    // Epic, Legendary, Mythic, Eternal
    assert.deepEqual(feedOn(s, 0).badges, [], "an Epic fish is not enough");
    assert.ok(!s.stats.legend_fed);
    assert.deepEqual(feedOn(s, 1).badges, ["legend_feast"], "a Legendary one earns it, and the meal says so");
    assert.deepEqual(feedOn(s, 2).badges, [], "a second one doesn't earn it again");
    assert.deepEqual(feedOn(s, 3).badges, []);
    assert.equal(s.stats.legend_fed, 3);
    assert.equal(s.badges.filter((b) => b === "legend_feast").length, 1);
    assert.deepEqual(checkBadges(s), []);
    // it pays what every badge pays: 2 gems, once (idle.tick counts badges against badgesPaid)
    const before = s.badges.length;
    s.badges = s.badges.filter((b) => b !== "legend_feast");
    tick(s, T0);
    const gems = s.gems;
    s.badges.push("legend_feast");
    assert.equal(s.badges.length, before);
    tick(s, T0);
    assert.equal(s.gems - gems, 2);
    tick(s, T0);
    assert.equal(s.gems - gems, 2);
  });
});

test("Legendary feast is released: without prototype mode the meal is counted and earns the badge at once", async () => {
  const { checkBadges } = await import("../../web/js/game/rules.js");
  const s = withFish([4]);
  const fed = feedOn(s, 0);
  assert.ok(fed.bond >= 1 && Array.isArray(fed.badges));
  assert.ok(fed.badges.includes("legend_feast") && s.badges.includes("legend_feast"));
  assert.equal(s.stats.legend_fed, 1);
  assert.ok(!checkBadges(s).includes("legend_feast"), "not earned twice");
  // a fish that isn't eaten (an egg can't eat) counts for nothing
  const egg = newState(9);
  land(egg, { pond: "tide", sp: "ray", tier: 6 }, () => 0.5, T0);
  assert.equal(typeof feedFish(egg, 0, T0), "string");
  assert.ok(!egg.stats.legend_fed);
});

test("Legendary feast syncs like the other badges: two devices' games combine to one badge and the bigger count", async () => {
  const { resolve, stamp } = await import("../../web/js/game/merge.js");
  const a = withFish([4]);
  const b = JSON.parse(JSON.stringify(a));
  withPrototype(() => { feedOn(a, 0); const c = withFish([5, 5]); feedOn(c, 0); feedOn(c, 1); b.stats.legend_fed = c.stats.legend_fed; b.badges = [...c.badges]; });
  assert.ok(a.badges.includes("legend_feast") && b.badges.includes("legend_feast"));
  stamp(a, "desk");
  stamp(b, "phone");
  const { keep, state: both } = resolve(a, b);
  assert.equal(keep, "merged");
  assert.equal(both.badges.filter((x) => x === "legend_feast").length, 1);
  assert.equal(both.stats.legend_fed, 2);
});

// ---------- rods are an upgrade path (2026-11-27) ----------

test("rods are bought one after the other: only the rod after your best one, never a later one", () => {
  const s = hatched();
  const f = fishingOf(s);
  f.pearls = 1000;
  assert.equal(bestRod(s), 0);
  assert.equal(nextRod(s), 1);
  for (const skip of [2, 3]) {
    assert.equal(buyRod(s, skip), `Buy the ${RODS[1].name} first.`);
    assert.deepEqual([f.rods, f.rod, f.pearls], [[0], 0, 1000], "nothing is bought, nothing is paid");
  }
  let pearls = 1000;
  for (let i = 1; i < RODS.length; i++) {
    assert.equal(nextRod(s), i);
    assert.equal(buyRod(s, i), "");
    pearls -= RODS[i].pearls;
    assert.equal(f.pearls, pearls);
    assert.equal(f.rod, i, "the new rod is the one in use");
    assert.equal(bestRod(s), i);
  }
  assert.deepEqual(f.rods, [0, 1, 2, 3]);
  assert.equal(nextRod(s), -1, "the last rod: nothing more to buy");
  // a rod you own can still be picked up again, free
  assert.equal(buyRod(s, 1), "");
  assert.deepEqual([f.rod, f.pearls], [1, pearls]);
  assert.equal(buyRod(s, 9), "There is no such rod.");
  // each rod is luckier than the one before, so the path only goes up
  assert.deepEqual(RODS.map((r) => r.luck), [...RODS.map((r) => r.luck)].sort((a, b) => a - b));
});

test("an older save that skipped a rod keeps every rod it has; its next rod is the one after its best", () => {
  const s = hatched();
  s.fishing = { rods: [0, 2], rod: 2, pearls: 500 };
  const f = fishingOf(s);
  assert.deepEqual([f.rods, f.rod], [[0, 2], 2], "nothing is taken away");
  assert.equal(bestRod(s), 2);
  assert.equal(nextRod(s), 3);
  assert.equal(buyRod(s, 1), "You already have a better rod.");
  assert.deepEqual([f.rods, f.pearls], [[0, 2], 500], "the skipped rod isn't sold to them, and costs nothing");
  assert.equal(buyRod(s, 3), "");
  assert.deepEqual([f.rods, f.rod, f.pearls], [[0, 2, 3], 3, 500 - RODS[3].pearls]);
  assert.equal(nextRod(s), -1);
  assert.equal(buyRod(s, 1), "You already have a better rod.");
  // and it comes through a save and load unchanged
  assert.deepEqual(cleanFishing(JSON.parse(JSON.stringify(f))).rods, [0, 2, 3]);
});

test("two devices' rods combine to every rod either has, with the better one in use", async () => {
  const { resolve, stamp } = await import("../../web/js/game/merge.js");
  const a = hatched();
  a.xp = 100;
  const b = JSON.parse(JSON.stringify(a));
  fishingOf(a).pearls = 10;
  assert.equal(buyRod(a, 1), "");
  b.fishing = { ...JSON.parse(JSON.stringify(fishingOf(a))), rods: [0, 1, 2], rod: 2 };
  stamp(a, "desk");
  stamp(b, "phone");
  for (const [mine, theirs] of [[a, b], [b, a]]) {
    const { keep, state } = resolve(JSON.parse(JSON.stringify(mine)), JSON.parse(JSON.stringify(theirs)));
    assert.equal(keep, "merged");
    assert.deepEqual([state.fishing.rods, state.fishing.rod], [[0, 1, 2], 2]);
    assert.equal(nextRod(state), 3);
  }
});

test("the rod shop shows the path: the next rod can be bought, later ones are locked with their price", () => {
  const src = readFileSync(new URL("../../web/js/game/fishscreen.js", import.meta.url), "utf8");
  assert.match(src, /const locked = !mine && i > next && next >= 0;/);
  assert.match(src, /locked \? `\$\{icon\("lock"\)\}\$\{amount\("pearls", rod\.pearls\)\}`/, "a locked rod still shows its price");
  assert.match(src, /t\("Buy the \{0\} first\.", t\(RODS\[next\]\.name\)\)/);
  assert.match(src, /disabled: short \|\| locked/);
});

// ---------- the pond's basket button: basket and upgrades (2026-11-27) ----------

test("an upgrade is ready when the pearls in hand pay for the next rod or the next aquarium", () => {
  const s = hatched();
  const f = fishingOf(s);
  assert.equal(upgradeReady(s), false, "no pearls: nothing to show");
  f.pearls = RODS[1].pearls - 1;
  assert.equal(upgradeReady(s), false);
  f.pearls = RODS[1].pearls;
  assert.equal(upgradeReady(s), true, "the next rod can be paid for");
  assert.equal(buyRod(s, 1), "");
  assert.equal(upgradeReady(s), false, "the pearls are spent");
  // a later rod's price doesn't count: only the next one can be bought
  f.rods = [0];
  f.rod = 0;
  f.pearls = 0;
  assert.equal(upgradeReady(s), false);
  // the next aquarium counts too (15 pearls, cheaper than the Neon rod)
  f.rods = [0, 1];
  f.pearls = 15;
  assert.equal(upgradeReady(s), true);
  assert.equal(buyTank(s), "");
  assert.equal(upgradeReady(s), false);
  // everything bought: never a dot, however many pearls
  f.rods = [0, 1, 2, 3];
  f.tankLv = 3;
  f.pearls = 99999;
  assert.equal(upgradeReady(s), false);
});

test("the pond's basket button says Upgrades, shows the dot, and the Basket screen opens on the upgrades", () => {
  const ui = readFileSync(new URL("../../web/js/game/fishing-ui.js", import.meta.url), "utf8");
  assert.match(ui, /class="fish-basket">\$\{icon\("basket"\)\}<b translate="no"><\/b><span class="fish-basket-word">Upgrades<\/span><i class="fish-basket-dot" hidden><\/i>/);
  assert.match(ui, /\$\("\.fish-basket-dot"\)\.hidden = !ready;/);
  assert.match(ui, /opts\.sheet\("basket"\)/);
  const screen = readFileSync(new URL("../../web/js/game/fishscreen.js", import.meta.url), "utf8");
  const panel = screen.slice(screen.indexOf("export function basketPanel"));
  const at = (s) => { const i = panel.indexOf(s); assert.ok(i >= 0, s); return i; };
  const tank = panel.search(/tankRow\(game, again\)|tankUpgradeBox\(game, again\)/);
  assert.ok(at('block("Upgrades"') < at("rodBox(game, rodNext, again)") && tank >= 0, "the next rod and the next aquarium are in the Upgrades block");
  assert.ok(at('block("Upgrades"') < at('block("Aquarium"') && at('block("Aquarium"') < at('block("Basket"'), "upgrades, then the aquarium, then the basket");
  assert.ok(tank < at('block("Aquarium"'), "the bigger aquarium is offered among the upgrades, not under the aquarium");
});
