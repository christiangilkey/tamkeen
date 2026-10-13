// The vocab reviewer's logic: the memory model (web/js/review/fsrs.js), which must agree with
// the computer's copy (app/fsrs.py, through tests/fixtures/fsrs_parity.json), and what is asked
// in which order (web/js/review/deck.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGAIN, GOOD, ankiCard, ankiData, ankiLog, ankiSchedule, answer, dayNumber, history, nextWait, recall, replay, waitFor } from "../../web/js/review/fsrs.js";
import { forecast, hideAnswer, plan, prompt, queue, requeue, reviewable, states, strength, waitText } from "../../web/js/review/deck.js";
import { earn, newState, REVIEW_CLEAR_CARDS, REVIEW_SHARE } from "../../web/js/game/rules.js";

const py = JSON.parse(readFileSync(new URL("../fixtures/fsrs_parity.json", import.meta.url), "utf8"));
const TODAY = py.today;
const close = (a, b, what) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);

test("the memory model gives the same answers as the computer's", () => {
  assert.ok(py.cases.length >= 10);
  for (const c of py.cases) {
    const state = replay(c.entries);
    if (!c.state) { assert.equal(state, null, c.name); assert.equal(ankiCard(c.entries, TODAY), null); continue; }
    close(state.s, c.state.s, `${c.name}: stability`);
    close(state.d, c.state.d, `${c.name}: difficulty`);
    for (const k of ["day", "due", "ivl", "reps", "lapses", "learning", "known", "first"]) assert.equal(state[k], c.state[k], `${c.name}: ${k}`);
    assert.deepEqual(ankiSchedule(state, TODAY), c.schedule, c.name);
    assert.equal(ankiData(state), c.data, c.name);
    assert.deepEqual(ankiLog(c.entries), c.log, c.name);
    assert.deepEqual(ankiCard(c.entries, TODAY), { schedule: c.schedule, data: c.data, log: c.log });
  }
  for (const [s, days] of py.waits) assert.equal(waitFor(s), days, `wait for stability ${s}`);
});

test("a remembered word waits longer each time; a missed one comes back the same day", () => {
  let card = null, day = TODAY;
  const waits = [];
  for (let i = 0; i < 5; i++) { card = answer(card, GOOD, day); waits.push(card.ivl); day = card.due; }
  assert.equal(waits[0], 2);
  assert.ok(waits.every((w, i) => i === 0 || w > waits[i - 1]), String(waits));
  close(recall(card.s, card.s), 0.9, "recall when the wait is over");
  const missed = answer(card, AGAIN, day);
  assert.deepEqual([missed.learning, missed.due, missed.ivl, missed.lapses], [true, day, 0, 1]);
  assert.equal(answer(missed, AGAIN, day).lapses, 1);
  assert.equal(answer(null, AGAIN, day).lapses, 0, "missing a word never learned is not forgetting it");
  assert.ok(nextWait(missed, day) < card.ivl / 4);
  assert.equal(nextWait(null, day), 2);
  assert.equal(history([[5, GOOD, TODAY, 1], [1, AGAIN, TODAY, 1]]).map((h) => h.rating).join(), "1,3", "oldest first");
  assert.equal(dayNumber(new Date(2026, 9, 13, 0, 1)) - dayNumber(new Date(2026, 9, 12, 23, 59)), 1, "a day is a local calendar day");
});

// ----- what is asked -----
const word = (uid, extra = {}) => ({ uid, text: `w-${uid}`, meaning: `m-${uid}`, created_at: 1000, ...extra });

test("the front of a card is the meaning with the translated sentence under it", () => {
  assert.deepEqual(prompt(word("a", { translation: "The girl was ⟦confused⟧ by it." })),
    { meaning: "m-a", sentence: [["The girl was ", false], ["confused", true], [" by it.", false]] });
  assert.deepEqual(prompt(word("a", { translation: "Are you new here?" })).sentence, [["Are you new here?", false]], "saved without marks: shown plain");
  assert.deepEqual(prompt(word("a", { translation: "Are you ⟧new⟦ ⟦here?" })).sentence, [["Are you new here?", false]], "broken marks are dropped");
  assert.deepEqual(prompt(word("a")).sentence, []);
  assert.equal(prompt(word("a", { meaning: " ", translation: "She ⟦gave⟧ it ⟦up⟧." })).meaning, "gave … up", "no meaning: the marked part stands in");
  assert.equal(prompt(word("a", { meaning: "" })), null, "nothing to ask with");
  assert.equal(prompt({ uid: "a", text: " ", meaning: "book" }), null);
  assert.equal(reviewable(word("a")), true);
  assert.equal(reviewable(word("a", { deleted: 1 })), false);
});

test("the front of a card never gives the word away, whatever its saved meaning says", () => {
  // The card the owner found: the AI had written the word itself into the meaning.
  const leaky = "to raise your voice / to tease loudly (Egyptian dialect: 'تعلّي' = to make a fuss, to overdo it, to mock loudly)";
  assert.equal(hideAnswer(leaky, "تعلّي"), "to raise your voice / to tease loudly");
  const front = prompt({ uid: "a", text: "تعلّي", meaning: leaky, translation: "Don't ⟦raise your voice⟧ (تعلّي) at me." });
  assert.equal(front.meaning, "to raise your voice / to tease loudly");
  assert.deepEqual(front.sentence, [["Don't ", false], ["raise your voice", true], [" (…) at me.", false]]);
  assert.ok(!/\p{Script=Arabic}/u.test(JSON.stringify(front)), "no Arabic anywhere on the front");
  // An aside in brackets that mentions the word goes whole; so does the word in quote marks, or bare.
  assert.equal(hideAnswer("book (كتاب)", "كِتَاب"), "book", "with or without its vowel marks");
  assert.equal(hideAnswer("'مدرسة': school", "مدرسة"), "school");
  assert.equal(hideAnswer("raise your voice, تعلّي = make a fuss", "تعلي"), "raise your voice, make a fuss");
  assert.equal(hideAnswer("学校 (がっこう): school", "学校"), "school", "a kanji word's reading in kana goes too");
  assert.equal(hideAnswer("привет: hello", "привет"), "hello");
  // A word in Latin letters is only removed inside brackets or quotes: a cognate keeps its meaning.
  assert.equal(hideAnswer("house (casa de campo = country house)", "casa"), "house");
  assert.equal(hideAnswer('"casa" means house', "casa"), "means house");
  assert.equal(hideAnswer("animal", "animal"), "animal");
  // Meanings that give nothing away are left exactly as they are.
  for (const fine of ["confused", "time (3:15), o'clock", "to give up; to quit (informal)", 'the "big" one']) assert.equal(hideAnswer(fine, "ساعة"), fine);
  // A "meaning" that is only the word itself is nothing to ask with.
  assert.equal(prompt({ uid: "b", text: "كتاب", meaning: "كتاب" }), null);
  assert.equal(prompt({ uid: "b", text: "كتاب", meaning: "كتاب", translation: "This is a ⟦book⟧." }).meaning, "book", "the marked part stands in");
});

test("today's plan: what is due, most overdue first, then new words up to the day's allowance", () => {
  const words = [word("new-old", { created_at: 10 }), word("new-recent", { created_at: 30 }), word("new-mid", { created_at: 20 }),
    word("due"), word("overdue"), word("later"), word("missed"), word("blank", { meaning: "" })];
  const log = {
    due: [[1, GOOD, TODAY - 2, 0]],               // waits 2 days: due today
    overdue: [[1, GOOD, TODAY - 9, 0]],
    later: [[1, GOOD, TODAY - 1, 0]],             // due tomorrow
    missed: [[1, AGAIN, TODAY, 0]],               // started today, still to be remembered
    gone: [[1, GOOD, TODAY, 0]],                  // a word since deleted: also started today
    untaken: [[1, 0, TODAY, 0]],                  // its only answer was taken back: not started
  };
  const cards = states(log);
  assert.deepEqual([...cards.keys()].sort(), ["due", "gone", "later", "missed", "overdue"]);
  const p = plan(words, cards, TODAY, 3);
  assert.deepEqual(p.due.map((v) => v.uid), ["missed", "overdue", "due"]);
  assert.deepEqual(p.fresh.map((v) => v.uid), ["new-recent"], "two new words were started today already, so one is left of three");
  assert.equal(p.waiting, 3);
  assert.deepEqual(plan(words, cards, TODAY, 20).fresh.map((v) => v.uid), ["new-recent", "new-mid", "new-old"], "newest saved first");
  assert.deepEqual(plan(words, cards, TODAY, 0).fresh, []);
  assert.deepEqual(plan(words, cards, TODAY + 1, 20).due.map((v) => v.uid).sort(), ["due", "later", "missed", "overdue"]);
  assert.deepEqual(forecast(words, cards, TODAY, 3), [1, 0, 0], "tomorrow: the one word due then");
  assert.deepEqual(strength(words, cards, TODAY).learned, 3);
});

test("a session spreads new words among the due ones, and a missed word returns a few cards on", () => {
  const due = ["d1", "d2", "d3", "d4", "d5", "d6"], fresh = ["n1", "n2"];
  assert.deepEqual(queue(due, fresh), ["d1", "d2", "d3", "n1", "d4", "n2", "d5", "d6"]);
  assert.deepEqual(queue([], fresh), fresh);
  assert.deepEqual(queue(due, []), due);
  assert.equal(queue(due, ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9"]).length, 15);
  assert.deepEqual(requeue(["b", "c", "d", "e", "f", "g"], "a"), ["b", "c", "d", "e", "a", "f", "g"]);
  assert.deepEqual(requeue(["b"], "a"), ["b", "a"]);
  assert.deepEqual(requeue([], "a"), ["a"], "the last card left comes straight back");
});

test("waits are said in plain words", () => {
  assert.deepEqual([0, 1, 2, 20, 21, 69, 70, 364, 365, 3650].map(waitText),
    ["today", "tomorrow", "2 days", "20 days", "3 weeks", "10 weeks", "2 months", "12 months", "1 year", "10 years"]);
});

const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test("a reviewed card pays a quarter of a word lookup's roll, and leaves the battles' counts alone", () => {
  const state = newState(7);
  const now = new Date(2026, 9, 12, 12, 0);
  assert.equal(REVIEW_SHARE, 0.25);
  const common = earn(state, { type: "review" }, { now, rand: seq(0.1, 0.5) });   // a lookup would roll 10
  assert.deepEqual([common.xp, common.tier, common.item], [3, "common", null]);
  assert.equal(earn(state, { type: "review" }, { now, rand: seq(0.75, 0.5) }).xp, 10, "a lucky roll of 40");
  assert.equal(earn(state, { type: "review" }, { now, rand: seq(0.95, 0.5) }).xp, 38, "a jackpot roll of 150");
  const surprise = earn(state, { type: "review" }, { now, rand: seq(0.99, 0.1) });
  assert.deepEqual([surprise.xp, surprise.tier, surprise.item], [1, "common", null], "no items from cards: it pays the least instead");
  assert.deepEqual([state.day.cards, state.stats.cards, state.day.reviews, state.stats.reviews, state.stats.right, state.coins,
    state.items.freeze, state.items.hint], [4, 4, 0, 0, 0, 0, newState(7).items.freeze, newState(7).items.hint]);
  let total = 0;
  for (let i = 0; i < 400; i++) { const r = earn(state, { type: "review" }, { now, rand: seq(0.1, 0.5) }); total += r ? r.xp : 0; }
  assert.ok(total < 3 * 120, `the trickle dries up through the day (${total})`);
  assert.equal(earn(state, { type: "review" }, { now, rand: seq(0.1, 0.5) }), null);
});

test("answering cards until none is due clears the day's cards, once", () => {
  const state = newState(7);
  const now = new Date(2026, 9, 12, 12, 0);
  const card = (cleared) => earn(state, { type: "review", cleared }, { now, rand: seq(0.1, 0.5) });
  for (let i = 1; i < REVIEW_CLEAR_CARDS; i++) assert.equal(card(true).cleared, false, "an almost empty deck is not a day's work");
  assert.equal(state.day.cardsCleared, false);
  assert.equal(card(false).cleared, false, "cards are still due");
  assert.equal(card(true).cleared, true);
  assert.equal(state.day.cardsCleared, true);
  assert.equal(card(true).cleared, false, "once a day");
  const tomorrow = new Date(2026, 9, 13, 9, 0);
  earn(state, { type: "review" }, { now: tomorrow, rand: seq(0.1, 0.5) });
  assert.equal(state.day.cardsCleared, false, "a new day starts uncleared");
});
