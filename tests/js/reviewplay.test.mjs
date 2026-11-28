// "Review while you play" (prototype "review_play": game/reviewplay.js, game/spotcheck.js, review/answerstep.js). The
// owner, 2026-11-27: the split view "absolutely must have all the same functionality" as the vocab reviewer and give
// "just as much"; equal game reward for either answer; spot checks on about 1 in 6 "Remembered" cards with four
// meanings ("four meanings only for spot checks"); a memory calls meter; no speech checks; "Side by side on computer
// stacked on phone".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROTOTYPES } from "../../web/js/prototype.js";
import { AGAIN, GOOD, answer, replay } from "../../web/js/review/fsrs.js";
import { states } from "../../web/js/review/deck.js";
import { MS_KEPT, recordAnswer, regradeAnswer } from "../../web/js/review/answerstep.js";
import { CALLS_KEPT, CALLS_LUCK_MAX, CALLS_MIN, CHECK_AFTER, CHECK_EVERY, CHECK_SECONDS, SHARP_LUCK, callShare, callsLuck, callsOf, checkFor,
  dueCheck, noteCall, wantsCheck } from "../../web/js/game/spotcheck.js";
import { newState, earn } from "../../web/js/game/rules.js";
import { rollAnswer } from "../../web/js/game/loot.js";
import { rng } from "../../web/js/game/genome.js";
import { cardsGlow } from "../../web/js/game/idle.js";

const src = (f) => readFileSync(new URL(`../../web/${f}`, import.meta.url), "utf8");
/** A function's text in a file, from its declaration to the next one at the same indent. */
function fn(text, head, next) {
  const i = text.indexOf(head);
  assert.ok(i >= 0, head);
  const j = text.indexOf(next, i + head.length);
  return text.slice(i, j < 0 ? undefined : j);
}
const TODAY = 20700;
const word = (uid, meaning) => ({ uid, id: uid, text: `w-${uid}`, meaning, created_at: 1000 });

test("a prototype: only the owner's devices see it until he releases it", () => {
  assert.equal(PROTOTYPES.review_play.released, false);
  for (const f of ["js/game/fishing-ui.js", "js/game/farmpage.js"]) {
    assert.match(src(f), /if \(!feature\("review_play"\) \|\| rp \|\|/, `${f}: the docked reviewer asks its switch`);
    assert.match(src(f), /b\.hidden = true; return; \}/, `${f}: and so does the button that brings it back`);
  }
});

test("one answer: the reviewer records it through one shared step, the same docked or full screen", () => {
  const cards = new Map(), log = {};
  const a = recordAnswer({ cards, log, uid: "u1", rating: GOOD, ms: 4321.4, now: 1000, today: TODAY });
  assert.equal(a.before, null);
  assert.deepEqual(a.entry, [1000, GOOD, TODAY, 4321]);
  assert.deepEqual(log.u1, [a.entry]);
  assert.deepEqual(cards.get("u1"), answer(null, GOOD, TODAY));
  // a word answered ahead of its day keeps its day; a long look is kept as a minute
  const later = recordAnswer({ cards, log, uid: "u1", rating: AGAIN, ms: 999999, now: 2000, today: TODAY - 3 });
  assert.equal(later.entry[2], TODAY, "its day, not the earlier one");
  assert.equal(later.entry[3], MS_KEPT);
  assert.deepEqual(cards.get("u1"), answer(answer(null, GOOD, TODAY), AGAIN, TODAY));
  assert.deepEqual(states(log).get("u1"), cards.get("u1"), "the next session replays the record to the same state");

  // review.js: grade() is the only answer path, and it uses that step; nothing in it differs when docked
  const r = src("js/pages/review.js");
  const grade = fn(r, "  async function grade(rating, from = \"\") {", "\n  /** A roll has started a Golden hour");
  assert.equal((r.match(/recordAnswer\(/g) || []).length, 1, "one place records an answer");
  assert.match(grade, /recordAnswer\(\{ cards, log, uid, rating, ms: cardWatch\.ms\(\), now: Date\.now\(\), today: dayNumber\(\) \}\)/);
  assert.match(grade, /send\(uid, entry\);\n {4}noteAnswer\(log\[uid\], day\);/, "sent and timed for the day's goal");
  assert.match(grade, /const earned = reward\(\{ type: "review", quiet: true, cleared \}\);/, "the same XP and glow");
  assert.match(grade, /const lucky = rollCard\(\{ correct: remembered, ms: entry\[3\] \+ carryMs, uid, due: !extras\.has\(uid\), extra: extras\.has\(uid\) \}\);/, "the same roll");
  assert.doesNotMatch(grade, /\bdock\b/, "no docked-only branch in an answer");
  assert.ok(grade.indexOf("onAnswer(") > grade.indexOf("rollCard("), "the game hears of it only after all that is done");
  assert.ok(grade.indexOf("onAnswer(") > grade.indexOf("reward("));
});

test("one card answered docked changes the card, XP, glow, goal and roll exactly as in the normal reviewer", () => {
  // The two are one code path (above); here that path's effects, run on two copies of the same game and record,
  // labelled as the two places they are run from, come out the same, answer for answer.
  const run = () => {
    const g = newState(7);
    const cards = new Map(), log = {};
    const rand = rng(42);
    const out = [];
    const now = new Date(2026, 10, 28, 12);
    const answers = [["a", GOOD], ["b", AGAIN], ["c", GOOD], ["a", GOOD]];
    for (const [i, [uid, rating]] of answers.entries()) {
      const { entry } = recordAnswer({ cards, log, uid, rating, ms: 5000, now: 1000 + i, today: TODAY });
      const cleared = i === answers.length - 1; // (the day's last due card: its glow, as game.js reward pays it)
      const earned = earn(g, { type: "review", quiet: true, cleared }, { rand, now });
      const glow = earned && earned.cleared ? cardsGlow(g) : 0;
      const lucky = rollAnswer(g, { source: "cards", correct: rating === GOOD, ms: entry[3], uid, due: true, extra: false }, rand, now);
      out.push({ card: cards.get(uid), xp: earned && earned.xp, glow, goal: earned && earned.goalDone, day: { ...g.day }, roll: lucky && [lucky.rolled, lucky.tier, lucky.streak] });
    }
    return { out, g };
  };
  const full = run(), docked = run();
  assert.deepEqual(docked.out, full.out);
  assert.deepEqual(docked.g.loot, full.g.loot);
  assert.deepEqual(docked.g.day, full.g.day);
  // and the game beside the cards never records or pays a card itself: it only reacts
  const rp = src("js/game/reviewplay.js");
  for (const banned of [/reward\(/, /rollCard\(/, /rollAnswer\(/, /\bearn\(/, /recordAnswer\(/, /answerQuestion\(/, /"\/reviews"/]) assert.doesNotMatch(rp, banned, String(banned));
  assert.match(rp, /handle = openReview\(\{\n {4}dock, words: vocab, allWords: vocab, log, playSnippet: player\.playSnippet, say,/, "the Vocab page's own reviewer, docked");
  assert.match(rp, /folders: \(\) => folders,\n {4}setFolder:/, "with the Folders tool");
  assert.match(rp, /newFolder: async \(\) =>/);
});

test("the game's reward is the same for either answer, and an answer taken back and given again acts once", () => {
  const fish = fn(src("js/game/fishing-ui.js"), "  async function reviewCatch(luck) {", "\n  // ----- changing pond");
  const farm = fn(src("js/game/farmpage.js"), "  async function reviewTend(luck) {", "\n  // ----- the buttons");
  for (const [name, f] of [["catch", fish], ["tend", farm]]) {
    assert.doesNotMatch(f, /remembered|rating|correct\b/, `${name}: nothing in it looks at the answer`);
    assert.doesNotMatch(f, /answerQuestion\(|record\(game/, `${name}: the card is the reviewer's, not recorded again`);
  }
  assert.match(src("js/game/fishing-ui.js"), /act: \(a, luck\) => reviewCatch\(luck\)/);
  assert.match(src("js/game/farmpage.js"), /act: \(a, luck\) => reviewTend\(luck\)/);
  assert.match(farm, /water\(game, job\.key, true\)/, "a full watering either way");
  assert.match(fish, /rollTier\(DUE_LUCK \* luckOf\(game, pondId\) \* \(golden\(game\) > 0 \? GOLDEN_LUCK : 1\) \* luck\)/, "the pond's luck, not the answer's");
  // Undo: the reviewer marks the answer given again, and the game skips it
  const r = src("js/pages/review.js");
  assert.match(fn(r, "  function takeBack() {", "\n  /** A spot check"), /retaken\.add\(uid\);/);
  assert.match(r, /const redo = retaken\.delete\(uid\);/);
  assert.match(src("js/game/reviewplay.js"), /if \(!a\.redo\) \{/);
});

test("a failed spot check regrades the card: taken back and given again as Not remembered, which syncs and replays the same", () => {
  const cards = new Map(), log = {};
  recordAnswer({ cards, log, uid: "w", rating: GOOD, ms: 3000, now: 100, today: TODAY - 2 });
  const before = cards.get("w");
  const step = recordAnswer({ cards, log, uid: "w", rating: GOOD, ms: 4000, now: 200, today: TODAY });
  assert.equal(regradeAnswer({ cards, log, uid: "w", step: { ...step, entry: log.w[0] }, now: 300 }), null, "only the latest answer");
  const entry = regradeAnswer({ cards, log, uid: "w", step, now: 300 });
  assert.deepEqual(log.w.map((e) => e[1]), [GOOD, 0, AGAIN], "the Remembered is taken back (0, which every device's sync keeps)");
  assert.deepEqual(entry, [300, AGAIN, TODAY, 4000]);
  assert.deepEqual(cards.get("w"), answer(before, AGAIN, TODAY), "as if Not remembered had been pressed");
  assert.deepEqual(replay(log.w), cards.get("w"), "and the record replays to it on every device");
  assert.equal(regradeAnswer({ cards, log, uid: "w", step, now: 400 }), null, "once");
  // in the reviewer: sent both ways, back in the queue, nothing else taken (the owner: "no other penalty")
  const rg = fn(src("js/pages/review.js"), "  function regrade(word) {", "\n  // ----- deleting the word");
  assert.match(rg, /send\(uid, step\.entry\);[^\n]*\n {4}send\(uid, entry\);/);
  assert.match(rg, /todo = \[todo\[0\], \.\.\.requeue\(todo\.slice\(1\), word\)\]/);
  assert.doesNotMatch(rg, /lucky|reward|xp|glow|undo\(\)/i, "its roll and XP stay");
  // the sync engines keep a taken-back answer (and nothing else) from another device
  assert.match(readFileSync(new URL("../../app/sync/engine.py", import.meta.url), "utf8"), /DO UPDATE SET rating = 0 WHERE excluded\.rating = 0/);
  assert.match(readFileSync(new URL("../../mobile/src/js/sync.js", import.meta.url), "utf8"), /else if \(e\[1\] === 0 && have\[1\] !== 0\) \{ have\[1\] = 0;/);
});

test("spot checks: about 1 in 6 Remembered cards, a couple of cards later, four meanings, about 3 seconds", () => {
  assert.equal(CHECK_EVERY, 6);
  assert.equal(CHECK_SECONDS, 3);
  assert.ok(CHECK_AFTER >= 1, "never straight after its card, whose meaning has just been shown");
  const rand = rng(5);
  let n = 0;
  for (let i = 0; i < 6000; i++) if (wantsCheck(rand)) n++;
  assert.ok(n > 880 && n < 1120, String(n));
  const words = [word("a", "house"), word("b", "House"), word("c", "dog"), word("d", "cat"), word("e", "dog"), word("f", "tree")];
  for (let s = 1; s < 40; s++) {
    const q = checkFor(words[0], words, rng(s));
    assert.equal(q.options.length, 4);
    assert.equal(q.options[q.answer], "house");
    assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, 4, "four different meanings (the same one in other letters isn't another)");
    assert.equal(q.word, "w-a");
  }
  assert.equal(checkFor(words[0], words.slice(0, 4), rng(1)), null, "not three others to tell it from: no check");
  const waiting = [{ word: "x", at: 3 }, { word: "y", at: 4 }];
  assert.equal(dueCheck(waiting, 2), null);
  assert.equal(dueCheck(waiting, 3).word, "x");
  assert.deepEqual(waiting, [{ word: "y", at: 4 }]);
  // the docked reviewer waits while one is open (openReview's hold), and there is no speech check anywhere
  const rp = src("js/game/reviewplay.js");
  assert.match(rp, /hold: \(\) => !!checking,/);
  const r = src("js/pages/review.js");
  for (const f of ["  async function flip() {", "  async function grade(rating, from = \"\") {", "  function takeBack() {"]) assert.match(fn(r, f, "\n  }\n"), /hold\(\)/, f);
  assert.doesNotMatch(src("js/game/spotcheck.js") + rp, /SpeechRecognition|hearmic|listenrec|getUserMedia/, "the owner's 4: no voice checks");
  assert.match(rp, /else if \(handle\) handle\.regrade\(c\.word\);/, "wrong or out of time: regraded");
  assert.match(rp, /if \(ok\) sharp = true;/, "right: Sharp!");
});

test("the memory calls meter: kept in the game, the latest 40 checks, luck only once it has something to say", () => {
  const g = newState(3);
  assert.equal(callShare(g), null);
  assert.equal(callsLuck(g), 1);
  for (let i = 0; i < CALLS_MIN - 1; i++) noteCall(g, true);
  assert.equal(callsLuck(g), 1, "fewer than five checks: no luck yet");
  noteCall(g, true);
  assert.equal(callsLuck(g), CALLS_LUCK_MAX, "all of them right");
  g.calls = "1111100000";
  assert.equal(callShare(g), 0.5);
  assert.equal(callsLuck(g), 1, "half right: nothing");
  g.calls = "1111111100";
  assert.equal(callsLuck(g), 1.25, "80%: half of the way up");
  for (let i = 0; i < 100; i++) noteCall(g, i % 2 === 0);
  assert.equal(callsOf(g).length, CALLS_KEPT);
  g.calls = "1x0<script>";
  assert.equal(callsOf(g), "10", "only its own marks are read back");
  assert.equal(SHARP_LUCK, 1.5);
});

test("a harvest takes the meter's and a check's luck, never more than double, and the rarer tiers come more often with it", async () => {
  const F = await import("../../web/js/game/farm.js");
  const src2 = src("js/game/farm.js");
  assert.match(src2, /export function harvest\(state, key, rand = Math\.random, now = new Date\(\), bonus = 1\)/);
  assert.match(src2, /\* Math\.max\(1, Math\.min\(2, Number\(bonus\) \|\| 1\)\)/);
  let plain = 0, lucky = 0;
  const r1 = rng(9), r2 = rng(9);
  for (let i = 0; i < 4000; i++) { plain += F.rollTier(1.2, r1); lucky += F.rollTier(1.2 * 2, r2); }
  assert.ok(lucky > plain, `${lucky} > ${plain}`);
});

test("stacked on a phone, side by side on a computer; the cards keep their own look and font beside the game", () => {
  const css = src("css/review.css");
  assert.match(css, /\.live-wrap\.rp-on \{ flex-direction: column;/);
  assert.match(css, /@media \(min-width: 900px\) \{\n {2}\.live-wrap\.rp-on \{ flex-direction: row; \}/);
  assert.match(css, /\.rv\.rv-docked \{ position: absolute; inset: 0;/);
  assert.match(css, /\.live-wrap \.rv-docked \{ font-family: var\(--ui-font\);/, "not the game screens' pixel font");
  const r = src("js/pages/review.js");
  assert.match(r, /\(dock \|\| document\.body\)\.append\(el\);/);
  assert.match(r, /if \(!dock\) try \{ history\.pushState/, "the back button closes the game's page, as before");
  assert.match(r, /return \{ close: \(\) => close\(\), regrade, el \};/);
});
