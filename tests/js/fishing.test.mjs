// Run with: node --test tests/js/
// Fishing (game/fishing.js, fishdata.js): which words swim in the pond and how big their shadows are, the card a
// bite asks, answers recorded as reviews and rolled, fights, the one that got away, landing, the basket, the
// aquarium, rods, the Fishdex and what friends see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FISH, FISH_ART, PONDS, RODS, SELL, SHADOWS, fishOf } from "../../web/js/game/fishdata.js";
import { TYPE_IDS } from "../../web/js/game/data.js";
import { newState, dayNumber, normalize } from "../../web/js/game/rules.js";
import { rng } from "../../web/js/game/genome.js";
import { TIERS, rollAnswer } from "../../web/js/game/loot.js";
import { cleanAquarium, cleanFish, cleanProfile } from "../../web/js/game/remote.js";
import { TIER_COUNT, PEARLS } from "../../web/js/game/fishdata.js";
import { existsSync, readFileSync } from "node:fs";
import {
  BAG_SIZE, CATCH_FULL, DEX_TOTAL, TANK_SIZE, buyRod, canFish, catchBoard, classify, cleanFishing, dexCount, dexHas, escape, escapedIn,
  feedFish, fightLength, fishingOf, fromTank, hook, land, lengthOf, luckOf, pondNeed, pondShadows, publicAquarium, questionFor, record, sell,
  sellCommon, tierOfRoll, toTank,
} from "../../web/js/game/fishing.js";

const T0 = new Date("2026-11-10T09:00:00");
const TODAY = dayNumber(T0);
const WORDS = ["كتاب", "قلم", "بيت", "باب", "شمس", "قمر", "ماء", "خبز", "ولد", "بنت"];
const MEANINGS = ["book", "pen", "house", "door", "sun", "moon", "water", "bread", "boy", "girl"];
const vocab = () => WORDS.map((text, i) => ({ uid: `w${i}`, text, meaning: MEANINGS[i], created_at: i }));
const hatched = (seed = 7) => { const s = newState(seed); s.creature.growth = 0.2; return s; };

test("six ponds, one per element, three fish in each, every fish's numbers sane", () => {
  assert.deepEqual(PONDS.map((p) => p.id).sort(), [...TYPE_IDS].sort());
  assert.equal(FISH.length, 18);
  for (const p of PONDS) {
    assert.deepEqual(fishOf(p.id).map((f) => f.size), [1, 2, 3], p.id);
    assert.equal(p.water.length, 4);
  }
  assert.equal(new Set(FISH.map((f) => f.id)).size, FISH.length);
  for (const f of FISH) assert.ok(f.cm[0] > 0 && f.cm[1] > f.cm[0], f.id);
  assert.equal(SELL.length, 10);
  assert.equal(DEX_TOTAL, 180);
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
  assert.match(buyRod(s, 3), /more pearls/);
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
  assert.equal(p.shadows.find((x) => x.uid === "w3").sp, fishOf("tide")[2].id, "a boss word is the pond's big fish");
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
  assert.equal(a.dex, 180);
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

test("the habitat draws the aquarium on its own and answers a tap on it (not from inside the gifts' or the glow's code)", () => {
  // (2df7fda6 had both blocks a few lines off: the tank only showed while a gift waited, and its tap did nothing)
  const src = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.match(src, /drawTinyFish\([^\n]*\n {4}\}\n {4}\/\/ A friend's gift and an egg from the incubator[^\n]*\n {4}for \(const th of things\) \{/,
    "the tank is drawn before the loop over gifts and eggs, not inside it");
  assert.match(src, /TANK_X\) < 16[^\n]*\{ go\("basket"\); return; \}\n {4}\/\/ A building with glow waiting/,
    "a tap on the tank is looked for before the buildings, not inside collecting glow");
  const data = readFileSync(new URL("../../web/js/game/data.js", import.meta.url), "utf8");
  assert.ok(data.indexOf("Fishing (fishdata.js)") < data.indexOf("const listed = new Set(out.map"), "the fishing art is listed before the arenas' leftovers are worked out");
});

test("Home shows the aquarium under the Fishing tile once a fish has been caught, with words for an empty tank", () => {
  const src = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.ok(src.indexOf('id="g-fishing"') < src.indexOf('id="g-aquarium"'), "the aquarium comes after the Fishing tile");
  assert.match(src, /box\.hidden = !\(F\.caught > 0 \|\| F\.tank\.length\)/, "nothing is shown before the first catch");
  assert.match(src, /aquariumView\(F\.tank/, "the fish kept in the tank are the ones drawn");
  assert.match(src, /hud-aq-empty"\)\.hidden = F\.tank\.length > 0/, "an empty tank says what it is for");
  assert.match(src, /#g-aquarium"\)\.onclick = \(\) => go\("basket"\)/, "a tap opens the Basket");
  // (its two lines of words are ones the Basket already has, so they are translated in every language)
  const basket = readFileSync(new URL("../../web/js/game/fishscreen.js", import.meta.url), "utf8");
  assert.ok(basket.includes("Keep your best fish here. Your friends can see your aquarium.") && src.includes("Keep your best fish here. Your friends can see your aquarium."));
});
