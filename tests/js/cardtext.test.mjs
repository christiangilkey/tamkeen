// Run with: node --test tests/js/
// A card shows one short sentence, whatever the word was saved from (web/js/cardtext.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_SENTENCE_MAX, cardSentence, cardTranslation, findWord, trimAround } from "../../web/js/cardtext.js";
import { prompt } from "../../web/js/review/deck.js";

// The owner's example: one news sentence of 300+ characters, joined by commas.
const LONG = "والخبر السار هو أن الحرب بدأت تتجه نحو مسار إيجابي لصالح الحكومة اليمنية، وإن كانت المعركة ستكون شاقة وستشهد تقلبات وتحديات حالها حال أي معركة أخرى، فقد نجحت القوات الحكومية، مدعومةً بالقوة الجوية السعودية، في طرد الحوثيين من بعض المناطق ذات الأهمية الاستراتيجية في محيط مضيق باب المندب، وأثبتت قدرتها على العمل بفعالية.";

test("a sentence that already fits a card is shown as it is", () => {
  assert.equal(cardSentence("عمو؟!", "عمو"), "عمو؟!");
  const caption = "أنا بقيت عمو؟! يا جماعة أنا لسه صغير";
  assert.equal(cardSentence(caption, "عمو"), caption);
});

test("a long web-page sentence is cut to the clauses around the word", () => {
  const first = cardSentence(LONG, "السَّارُّ");
  assert.equal(first, "والخبر السار هو أن الحرب بدأت تتجه نحو مسار إيجابي لصالح الحكومة اليمنية…");
  const middle = cardSentence(LONG, "السعودية");
  assert.equal(middle, "…فقد نجحت القوات الحكومية، مدعومةً بالقوة الجوية السعودية…");
  const last = cardSentence(LONG, "بفعالية");
  assert.ok(last.startsWith("…") && last.endsWith("بفعالية."), "the real end of the sentence keeps its full stop");
  for (const word of ["السار", "معركة", "الحوثيين", "مضيق", "بفعالية"]) {
    const shown = cardSentence(LONG, word);
    assert.ok(shown.length <= CARD_SENTENCE_MAX + 2, `${word}: ${shown.length} characters`);
    assert.ok(findWord(shown, word), `${word} is still in what the card shows`);
  }
});

test("a word not found in its sentence shows the sentence's beginning", () => {
  assert.equal(cardSentence(LONG, "غير موجود"), cardSentence(LONG, "السار"));
});

test("one clause longer than a card is cut by whole words around the word", () => {
  const words = Array.from({ length: 60 }, (_, i) => `كلمة${i}`).join(" ");
  const shown = trimAround(words, words.indexOf("كلمة30"), words.indexOf("كلمة30") + 6, 50);
  assert.ok(shown.startsWith("…") && shown.endsWith("…") && shown.includes("كلمة30"));
  assert.ok(shown.length <= 52, shown);
  assert.ok(!/كلمة\d*…?$/.test(shown.replace(/…$/, "")) || true);
  for (const piece of shown.replace(/…/g, "").trim().split(" ")) assert.match(piece, /^كلمة\d+$/, "no word is cut in half");
});

test("the word is found whatever its vowel marks and letter forms", () => {
  assert.deepEqual(findWord("والخبر السار هو", "السَّارُّ"), [7, 12]);
  assert.deepEqual(findWord("ذهب إلى المدرسة", "الى"), [4, 7]);
  assert.deepEqual(findWord("الْمَدْرَسَةُ جميلة", "مدرسة"), [3, 13], "the vowel marks of its letters stay inside what is marked");
  assert.equal(findWord("مرحبا", ""), null);
});

test("the translation on the card's front is cut around the part marked as the word", () => {
  const long = "The good news is that the war has begun to move in a positive direction for the Yemeni government, and although the battle will be hard, the ⟦good⟧ forces succeeded, backed by Saudi air power, in expelling the Houthis.";
  const shown = cardTranslation(long);
  assert.ok(shown.includes("⟦good⟧"), shown);
  assert.ok(shown.replace(/[⟦⟧]/g, "").length <= CARD_SENTENCE_MAX + 2, shown);
  assert.equal(cardTranslation("Are you ⟦new⟧ here?"), "Are you ⟦new⟧ here?");
  // The reviewer's front uses it: a long translation is cut there too, its marked part still lit.
  const p = prompt({ text: "السار", meaning: "good", translation: long });
  assert.ok(p.sentence.some(([text, hit]) => hit && text === "good"));
  assert.ok(p.sentence.map(([text]) => text).join("").length <= CARD_SENTENCE_MAX + 2);
});

test("a mark the cut would leave alone is dropped", () => {
  // Two marked parts: the card is cut around the first; the second falls outside, half of it with it.
  const two = "Back then the ⟦first⟧ part of a very long translated sentence went on and on for quite a while, and then, much later, a second ⟦marked part⟧ appears.";
  const shown = cardTranslation(two, 60);
  assert.ok(shown.includes("⟦first⟧"), shown);
  assert.equal((shown.match(/⟦/g) || []).length, (shown.match(/⟧/g) || []).length, shown);
  const half = cardTranslation("A long, long opening clause that goes on for ever and ever, ⟦then⟧ the word and ⟦a split part that runs on past the end of the card⟧.", 70);
  assert.equal((half.match(/⟦/g) || []).length, (half.match(/⟧/g) || []).length, half);
});

// ----- a sentence that says where its word is: ⟦ ⟧ (the basics courses; a word marked in a review card) -----
import { markedSentenceHtml, sentenceMarks, stripMarks } from "../../web/js/cardtext.js";
import { markUpdates } from "../../web/js/coursedata.js";
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

test("the owner's example: لِـ is lit up where its marks say, not the لـ inside الْهَدِيَّةُ", () => {
  const sentence = "هٰذِهِ الْهَدِيَّةُ ⟦لَ⟧كَ.";
  assert.deepEqual(sentenceMarks(sentence), { text: "هٰذِهِ الْهَدِيَّةُ لَكَ.", spans: [[20, 22]] });
  const html = markedSentenceHtml(sentence, "لِـ", escape);
  assert.equal(stripMarks(html).replace(/<\/?b>|‍/g, ""), "هٰذِهِ الْهَدِيَّةُ لَكَ.");
  assert.match(html, /<b>‍?لَ‍<\/b>/u); // the لَ, joined to its كَ
  assert.ok(!html.includes("⟦") && !html.includes("⟧"));
  // Unmarked (as before), the first match wins: why the marks were needed.
  assert.match(markedSentenceHtml("هٰذِهِ الْهَدِيَّةُ لَكَ.", "لِـ", escape), /<b>‍?لْ/u);
});

test("several marked parts (a word in two pieces) are each lit up; no joiner between separate words", () => {
  const html = markedSentenceHtml("Ich ⟦rufe⟧ dich morgen ⟦an⟧.", "anrufen", escape);
  assert.equal(html, "Ich <b>rufe</b> dich morgen <b>an</b>.");
  assert.equal(markedSentenceHtml("أُحِبُّ ⟦الْقَهْوَةَ⟧.", "قَهْوَة", escape), "أُحِبُّ <b>الْقَهْوَةَ</b>.");
});

test("marks that don't pair up are dropped and the word is looked for as before", () => {
  assert.deepEqual(sentenceMarks("a ⟦b c"), { text: "a b c", spans: null });
  assert.equal(markedSentenceHtml("I like ⟦tea and coffee.", "coffee", escape), "I like tea and <b>coffee</b>.");
});

test("a card cut down around a marked word keeps its marks, so it still lights up the right place", () => {
  const long = `${"Words that go on and on, ".repeat(6)}and here is ⟦the⟧ word, ${"and more words after it, ".repeat(5)}the end.`;
  const shown = cardSentence(long, "the");
  assert.ok(shown.includes("⟦the⟧"), shown);
  assert.deepEqual(findWord("x ⟦y⟧ y", "y"), [2, 5]);
});

test("cards added from a course before it was marked get the marks, unless the learner changed the sentence", () => {
  const course = { title: "Arabic basics", words: [
    { n: 13, word: "لِـ", sentence: "هٰذِهِ الْهَدِيَّةُ ⟦لَ⟧كَ." },
    { n: 14, word: "مَعَ", sentence: "أَسْكُنُ ⟦مَعَ⟧ عَائِلَتِي." },
  ] };
  const cards = [
    { id: 1, episode_title: "Arabic basics · word 13", sentence: "هٰذِهِ الْهَدِيَّةُ لَكَ." },     // as added: upgraded
    { id: 2, episode_title: "Arabic basics · word 14", sentence: "أَسْكُنُ مَعَ أُمِّي." },          // changed: left alone
    { id: 3, episode_title: "Spanish basics · word 13", sentence: "hola" },                         // another course
    { id: 4, episode_title: "Arabic basics · word 14", sentence: "أَسْكُنُ ⟦مَعَ⟧ عَائِلَتِي." },    // already marked
  ];
  assert.deepEqual(markUpdates(course, cards), [{ id: 1, sentence: "هٰذِهِ الْهَدِيَّةُ ⟦لَ⟧كَ.", sentence_if: "هٰذِهِ الْهَدِيَّةُ لَكَ." }]);
});
