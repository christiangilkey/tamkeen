// The courses and the creature game (2026-10-25, the owner): XP for hearing a grammar lesson's examples
// and for putting basics words in the cards (game/rules.js "hear" and "basics"), which Courses tab opens
// (coursedata.js courseTabChoice), the Library's empty kinds pointing at the + button, and the Vocab
// page's review box keeping its colour with no words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BASICS_DAY_CAP, BASICS_XP, HEAR_DAY, HEAR_SHARE, earn, hearKey, hearMultiplier, newState, normalize } from "../../web/js/game/rules.js";
import { courseTabChoice } from "../../web/js/coursedata.js";

const at = (iso) => new Date(iso);
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
// A common roll of 10 (5 + 0.5 × 10): a lookup would pay 10, hearing an example a quarter of it.
const common10 = () => seq(0.1, 0.5);

// ---------- hearing a grammar example ----------

test("hearing a grammar example pays a quarter of a lookup's roll, once a day for each example", () => {
  const s = newState(5);
  const combo = { count: 0, at: 0, session: 0 };
  const now = at("2026-10-25T10:00:00");
  const first = earn(s, { type: "hear", key: "ar:مَرْحَبًا" }, { rand: common10(), now, combo, session: 1 });
  assert.equal(first.type, "hear");
  assert.equal(first.base, Math.round(10 * HEAR_SHARE));
  assert.equal(first.xp, 3);
  assert.equal(first.combo, 1);
  assert.equal(first.item, null);
  assert.equal(s.xp, 3);
  assert.equal(s.stats.heard, 1);
  // Tapping the same example again, a moment or hours later: nothing (and the combo doesn't move).
  for (const t of ["2026-10-25T10:00:01", "2026-10-25T10:00:03", "2026-10-25T18:00:00"]) {
    assert.equal(earn(s, { type: "hear", key: "ar:مَرْحَبًا" }, { rand: common10(), now: at(t), combo, session: 1 }), null, t);
  }
  assert.equal(combo.count, 0);
  assert.equal(s.xp, 3);
  // The same text with other spacing is the same example.
  assert.equal(earn(s, { type: "hear", key: " ar:مَرْحَبًا  " }, { rand: common10(), now, combo, session: 1 }), null);
  // The next day it pays again.
  assert.ok(earn(s, { type: "hear", key: "ar:مَرْحَبًا" }, { rand: common10(), now: at("2026-10-26T09:00:00"), combo, session: 2 }));
  assert.equal(earn(s, { type: "hear", key: "" }, { rand: common10(), now }), null, "nothing to hear: nothing");
});

test("hearing never gives a surprise item: that roll is a little plain XP", () => {
  const s = newState(6);
  const r = earn(s, { type: "hear", key: "es:hola" }, { rand: seq(0.995, 0.5), now: at("2026-10-25T10:00:00") });
  assert.equal(r.item, null);
  assert.equal(r.tier, "common");
  assert.ok(r.xp >= 1);
  assert.deepEqual(s.items, newState(6).items);
});

test("examples heard carry the study session's combo on, the same chain as looking words up", () => {
  const s = newState(7);
  const combo = { count: 0, at: 0, session: 0 };
  const now = at("2026-10-25T10:00:00");
  const a = earn(s, { type: "hear", key: "ar:أَنَا" }, { rand: common10(), now, combo, session: 1 });
  const b = earn(s, { type: "hear", key: "ar:أَنْتَ" }, { rand: common10(), now, combo, session: 1 });
  assert.equal(a.combo, 1);
  assert.equal(b.combo, 1.2);
  assert.equal(b.xp, Math.round(b.base * b.mult));
  assert.equal(b.mult, 1.2);
  // A word looked up next goes on with the same chain.
  const w = earn(s, { type: "word", key: "ar:كتاب" }, { rand: common10(), now, combo, session: 1 });
  assert.equal(w.combo, 1.5);
  // A new session starts it again.
  const c = earn(s, { type: "hear", key: "ar:هُوَ" }, { rand: common10(), now, combo, session: 2 });
  assert.equal(c.combo, 1);
  // Listening has its own count for the day's fading: lookups don't use it up, nor it them.
  assert.equal(s.day.taps, 1);
  assert.equal(s.day.heard.length, 3);
});

test("hearing fades through a day, and stops paying after the day's limit", () => {
  const s = newState(8);
  const now = at("2026-10-25T10:00:00");
  const results = [];
  for (let i = 0; i < HEAR_DAY[1] + 10; i++) {
    // (a new session each time, so the combo stays at ×1 and only the fading shows)
    results.push(earn(s, { type: "hear", key: `ar:example ${i}` }, { rand: common10(), now, combo: { count: 0, at: 0, session: 0 }, session: i + 1 }));
  }
  assert.equal(results[0].mult, 1);
  assert.equal(results[HEAR_DAY[0] - 1].mult, 1);
  assert.equal(results[HEAR_DAY[0]].mult, 0.4, "fading after the first ones");
  assert.equal(results[HEAR_DAY[1] - 1].mult, 0.1);
  assert.ok(results.slice(0, HEAR_DAY[1]).every((r) => r && r.xp >= 1));
  assert.ok(results.slice(HEAR_DAY[1]).every((r) => r === null), "nothing after the day's limit");
  assert.ok(s.day.heard.length <= HEAR_DAY[1], "the day's list stays small");
  assert.equal(hearMultiplier(s, 0, now), 0);
});

test("an example's key is short and steady, whatever its length", () => {
  const long = "ar:" + "هَذَا كِتَابٌ جَدِيدٌ ".repeat(20);
  assert.equal(hearKey(long), hearKey(long));
  assert.equal(hearKey("ar:a  b"), hearKey(" ar:a b "));
  assert.notEqual(hearKey("ar:a"), hearKey("ar:b"));
  assert.ok(hearKey(long).length <= 12);
  assert.equal(hearKey(""), "");
});

// ---------- putting basics words in the cards ----------

test("each basics word put in the cards pays the same, whether added one by one or all at once", () => {
  const now = at("2026-10-25T10:00:00");
  const keys = Array.from({ length: 10 }, (_, i) => `ar:${i + 1}`);
  const all = newState(9);
  const once = earn(all, { type: "basics", keys }, { now });
  assert.equal(once.words, 10);
  assert.equal(once.xp, 10 * BASICS_XP);
  const single = newState(9);
  let total = 0;
  for (const k of keys) total += earn(single, { type: "basics", keys: [k] }, { now }).xp;
  assert.equal(total, once.xp);
  assert.equal(all.xp, single.xp);
  assert.equal(all.coins, newState(9).coins, "no coins: it is one tap from a ready-made list");
  assert.equal(all.stats.basics, 10);
});

test("basics words pay for at most a unit's worth a day, and a word only once a day", () => {
  const s = newState(10);
  const now = at("2026-10-25T10:00:00");
  const sixty = Array.from({ length: 60 }, (_, i) => `ar:${i + 1}`);
  const r = earn(s, { type: "basics", keys: sixty }, { now });
  assert.equal(r.words, BASICS_DAY_CAP);
  assert.equal(r.xp, BASICS_DAY_CAP * BASICS_XP);
  assert.equal(earn(s, { type: "basics", keys: ["ar:61"] }, { now }), null, "the day's cap is reached");
  // Tomorrow: words pay again, but not one already paid for twice in one call.
  const tomorrow = at("2026-10-26T10:00:00");
  const again = earn(s, { type: "basics", keys: ["ar:1", "ar:1", "ar:2"] }, { now: tomorrow });
  assert.equal(again.words, 2);
  assert.equal(again.xp, 2 * BASICS_XP);
  // Deleting a card and adding the word again the same day: nothing.
  assert.equal(earn(s, { type: "basics", keys: ["ar:1"] }, { now: tomorrow }), null);
  assert.equal(earn(s, { type: "basics", keys: [] }, { now: tomorrow }), null);
  assert.equal(earn(s, { type: "basics" }, { now: tomorrow }), null);
});

test("a saved game from before these events still works", () => {
  const old = newState(11);
  old.day = { key: "2026-10-25", seconds: 0, done: false, taps: 0, saves: 0, xp: 0, words: [] };
  delete old.stats.heard;
  delete old.stats.basics;
  const s = normalize(JSON.parse(JSON.stringify(old)));
  const now = at("2026-10-25T12:00:00");
  assert.ok(earn(s, { type: "hear", key: "ar:نَعَمْ" }, { rand: common10(), now }));
  assert.ok(earn(s, { type: "basics", keys: ["ar:3"] }, { now }));
  assert.equal(s.stats.heard, 1);
  assert.equal(s.stats.basics, 1);
});

test("the course screens send these events", () => {
  const grammar = read("web/js/components/grammarpanel.js");
  assert.match(grammar, /earnXp\(\{ type: "hear", key: `\$\{lang\}:\$\{text\}` \}/);
  assert.match(grammar, /heard\(el\.dataset\.say, el\)/);
  assert.match(grammar, /earnXp\(\{ type: "grammar", key, right, of, first \}/, "a finished lesson already counts in the game's XP");
  const basics = read("web/js/components/coursepanel.js");
  assert.match(basics, /earnXp\(\{ type: "basics", keys: words\.slice\(0, n\)\.map\(\(w\) => `\$\{course\.lang\}:\$\{w\.n\}`\) \}/);
  assert.match(basics, /words = words\.filter\(\(w\) => !prog\.have\.has\(w\.n\)\)/, "words already in the cards are never sent");
  const game = read("web/js/game/game.js");
  assert.match(game, /const chained = \(type\) => type === "word" \|\| type === "hear";/);
});

// ---------- which Courses tab opens ----------

test("Courses opens on Grammar, unless a link asks for Basics or the learner chose a tab this visit", () => {
  const both = { basics: true, grammar: true };
  assert.equal(courseTabChoice(both), "grammar");
  assert.equal(courseTabChoice({ ...both, asked: "basics" }), "basics");
  assert.equal(courseTabChoice({ ...both, chosen: "basics" }), "basics");
  assert.equal(courseTabChoice({ ...both, asked: "grammar", chosen: "basics" }), "grammar", "a link comes first");
  assert.equal(courseTabChoice({ ...both, asked: "nonsense", chosen: "constructor" }), "grammar");
  assert.equal(courseTabChoice({ basics: true, grammar: false }), "basics", "no grammar course: Basics");
  assert.equal(courseTabChoice({ basics: true, grammar: false, chosen: "grammar" }), "basics");
  assert.equal(courseTabChoice({ basics: false, grammar: true, asked: "basics" }), "grammar");
  assert.equal(courseTabChoice({}), "");
});

test("the Library puts Grammar first and keeps a chosen tab for this visit only", () => {
  const library = read("web/js/pages/library.js");
  assert.ok(library.indexOf('data-tab="grammar"') < library.indexOf('data-tab="basics"'), "Grammar on the left");
  assert.match(library, /sessionStorage\.setItem\("courseTab", b\.dataset\.tab\)/);
  assert.match(library, /courseTabChoice\(\{ basics, grammar: !!grammar, asked: query\.get\("tab"\) \|\| "", chosen \}\)/);
  assert.doesNotMatch(library, /localStorage\.(get|set)Item\("courseTab"/);
});

// ---------- the Library's empty kinds ----------

test("every Library kind but Courses says how to add things with the + button", () => {
  const library = read("web/js/pages/library.js");
  const kinds = library.slice(library.indexOf("const KINDS = ["), library.indexOf("];", library.indexOf("const KINDS = [")));
  const entries = kinds.split(/\n\s*\{ key: /).slice(1);
  assert.equal(entries.length, 9);
  for (const e of entries) {
    const key = /^"(\w+)"/.exec(e)[1];
    if (key === "courses") { assert.doesNotMatch(e, /empty:/); continue; }
    assert.match(e, /empty: "Add [^"]+ with the \+ button below[^"]*"/, key);
  }
  assert.match(library, /<h2 class="le-title">Nothing here yet<\/h2>/);
  assert.match(library, /<span class="fab-hint">\$\{FAB_ARROW\}<\/span><\/button>/, "the + button carries the arrow");
  assert.match(library, /if \(k\.key === "books"\) el\.append\(bookButtons\(\)\)/, "Books keeps Free classics");
  const css = read("web/css/media.css");
  assert.match(css, /\.library\.lib-is-empty \.fab-hint \{ display: block; \}/);
  assert.match(css, /body:has\(\.modal-back\) \.library \.fab-hint/, "hidden while the + sheet is open");
});

// ---------- the Vocab page with no words ----------

test("the Vocab page's review box keeps its colour when there are no cards", () => {
  const vocab = read("web/js/pages/vocab.js");
  const none = vocab.slice(vocab.indexOf("if (banner.hidden || none) {"), vocab.indexOf("fitReview();", vocab.indexOf("if (banner.hidden || none) {")));
  assert.match(none, /banner\.classList\.remove\("idle"\)/);
  assert.match(none, /"No cards to study"/);
});
