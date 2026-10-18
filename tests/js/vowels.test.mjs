// Arabic vowel marks: which form of each word is drawn (web/js/vowelmarks.js). The words
// themselves never change; only what is shown does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bare, chooseWords } from "../../web/js/vowelmarks.js";
import { replaceInText } from "../../web/js/correction.js";

const texts = ["مرحبا", "بكم،", "شو", "بدك", "OK"];
const vowels = { words: ["مَرْحَبًا", "بِكُمْ،", "شُو", "بِدَك", null], dialect: "", guess: [1] };
const segOf = (i) => (i < 2 ? 0 : 1);

test("off: the words as they are", () => {
  assert.equal(chooseWords(texts, vowels, segOf, { show: false }), texts);
  assert.equal(chooseWords(texts, null, segOf, { show: true }), texts);
});

test("on: vowelled words, dialect lines left plain unless asked for", () => {
  assert.deepEqual(chooseWords(texts, vowels, segOf, { show: true }), ["مَرْحَبًا", "بِكُمْ،", "شو", "بدك", "OK"]);
  assert.deepEqual(chooseWords(texts, vowels, segOf, { show: true, dialect: true }), ["مَرْحَبًا", "بِكُمْ،", "شُو", "بِدَك", "OK"]);
});

test("a dialect transcript shows no vowels unless guesses are wanted", () => {
  const egy = { ...vowels, dialect: "egy", guess: [] };
  assert.equal(chooseWords(texts, egy, segOf, { show: true }), texts);
  assert.equal(chooseWords(texts, egy, segOf, { show: true, dialect: true })[0], "مَرْحَبًا");
});

test("a word changed since keeps its own spelling; a length mismatch shows nothing", () => {
  const changed = ["مرحبا", "بكما،", "شو", "بدك", "OK"];
  assert.deepEqual(chooseWords(changed, vowels, segOf, { show: true }).slice(0, 2), ["مَرْحَبًا", "بكما،"]);
  assert.equal(chooseWords(texts.slice(1), vowels, segOf, { show: true }).length, 4);
  assert.deepEqual(chooseWords(texts.slice(1), vowels, segOf, { show: true }), texts.slice(1));
});

test("bare drops only the vowel marks", () => {
  assert.equal(bare("مَرْحَبًا، OK"), "مرحبا، OK");
  assert.equal(bare("الطَّقْسُ"), "الطقس");
});

test("the phone fills a saved sentence from its transcript's vowelled words", () => {
  // The same call as POST /vowels/sentence in mobile/src/js/backend.js.
  const sentence = "كان الطقس جميلا في الصباح.";
  const words = ["كان", "الطقس", "جميلا", "في", "الصباح."];
  const vowelled = ["كَانَ", "الطَّقْسُ", "جَمِيلًا", "فِي", "الصَّبَاحِ."];
  const out = replaceInText(sentence, words, vowelled);
  assert.equal(out, "كَانَ الطَّقْسُ جَمِيلًا فِي الصَّبَاحِ.");
  assert.equal(bare(out), sentence);
});
