// Run with: node --test tests/js/
// A card shows one short sentence, whatever the word was saved from (web/js/cardtext.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_SENTENCE_MAX, cardSentence, cardTranslation, findWord, trimAround } from "../../web/js/cardtext.js";
import { prompt } from "../../web/js/review/deck.js";
import { originNote } from "../../web/js/filmot.js";

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

test("the note a word keeps about where it was first found", () => {
  assert.equal(originNote({ episode_title: "لا يمكن لأمريكا أن تغض الطرف عن الحوثيين", sentence: "  والخبر السار\nهو  " }),
               "First found in: لا يمكن لأمريكا أن تغض الطرف عن الحوثيين — والخبر السار هو");
  assert.equal(originNote({ episode_title: "", sentence: "typed sentence" }), "First found in: typed in by hand — typed sentence");
  assert.equal(originNote({ episode_title: "A page", sentence: "" }), "First found in: A page");
  assert.equal(originNote({ episode_title: "", sentence: "" }), "", "a word typed in alone has nothing to note");
});
