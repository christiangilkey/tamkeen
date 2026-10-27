// Run with: node --test tests/js/
// Looking up several words together by dragging across them (web/js/phrase.js; the dragging itself
// is web/js/components/phrasepick.js), and what the AI is asked about a phrase (web/js/definer.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHRASE_MAX, isPhrase, phraseRange, phraseText } from "../../web/js/phrase.js";
import { dictionaryFirst, userPrompt } from "../../web/js/definer.js";

// Three lines (blocks) of words: 0-4, 5-19, 20-22.
const blocks = [0, 0, 0, 0, 0, ...Array(15).fill(1), 2, 2, 2];
const blockOf = (i) => blocks[i];

test("a phrase runs from the first word to the word under the finger, either way", () => {
  assert.deepEqual(phraseRange(6, 9, { blockOf }), [6, 9]);
  assert.deepEqual(phraseRange(9, 6, { blockOf }), [6, 9], "dragged back towards the start of the text");
  assert.deepEqual(phraseRange(7, 7, { blockOf }), [7, 7], "back on the first word: just that word");
  assert.deepEqual(phraseRange(2, 3), [2, 3], "no blocks given: any words");
});

test("the text's order decides, not the screen's (right-to-left text is the same)", () => {
  // In Arabic the next word is to the LEFT on screen, but its index is still one more.
  const arabic = ["في", "بيت", "كبير", "جدا"];
  assert.deepEqual(phraseRange(1, 3), [1, 3]);
  assert.equal(phraseText(arabic, 1, 3, "ar"), "بيت كبير جدا");
  assert.equal(phraseText(["خانه", "ما", "بزرگ", "است."], 2, 3, "fa"), "بزرگ است");
});

test("a phrase stays inside the line or paragraph it began in", () => {
  assert.deepEqual(phraseRange(3, 8, { blockOf }), [3, 4], "stops at the end of its line");
  assert.deepEqual(phraseRange(6, 1, { blockOf }), [5, 6], "and at its start when dragged backwards");
  assert.deepEqual(phraseRange(21, 30, { blockOf }), [21, 22], "a block at the end of the text");
});

test("a phrase is at most PHRASE_MAX words, counted from where the drag began", () => {
  assert.equal(PHRASE_MAX, 30);
  assert.deepEqual(phraseRange(0, 40), [0, 29]);
  assert.deepEqual(phraseRange(40, 0), [11, 40]);
  assert.deepEqual(phraseRange(0, 100, { max: 3 }), [0, 2]);
  assert.deepEqual(phraseRange(0, 100, { max: 1 }), [0, 0]);
});

test("nonsense in, a safe answer out", () => {
  assert.deepEqual(phraseRange(-1, 4), [-1, -1]);
  assert.deepEqual(phraseRange(3, NaN), [3, 3]);
  assert.deepEqual(phraseRange("2", "4"), [2, 4], "indices read from data-i");
});

test("isPhrase is more than one word", () => {
  assert.equal(isPhrase(3, 3), false);
  assert.equal(isPhrase(3, 4), true);
});

test("a phrase's text: spaces where the language has them, none in Japanese, Chinese and Thai", () => {
  assert.equal(phraseText(["Me", "di", "cuenta,", "ayer"], 0, 2, "es"), "Me di cuenta");
  assert.equal(phraseText(["«Give", "up»"], 0, 1, "en"), "Give up", "punctuation at the ends is left off");
  assert.equal(phraseText(["猫", "が", "好き", "です"], 0, 2, "ja"), "猫が好き");
  assert.equal(phraseText(["我", "很", "喜欢", "你"], 1, 2, "zh"), "很喜欢");
  assert.equal(phraseText(["ผม", "ชอบ", "กิน", "ข้าว"], 1, 3, "th"), "ชอบกินข้าว");
  assert.equal(phraseText(["iPhone", "が", "好き"], 0, 2, "ja"), "iPhoneが好き");
  assert.equal(phraseText(["Tokyo", "Tower"], 0, 1, "ja"), "Tokyo Tower", "two Latin words keep their space");
  assert.equal(phraseText(["?!"], 0, 0, "en"), "?!", "only punctuation: kept as it is");
});

test("the AI is asked about a phrase as one expression, with its literal sense", () => {
  const ctx = { word: "dar la lata", marked: "No me ⟦dar la lata⟧ más.", lang: "es", phrase: true };
  const full = userPrompt(ctx);
  assert.match(full, /Target phrase: dar la lata/);
  assert.doesNotMatch(full, /Target word:/);
  assert.match(full, /ONE unit/);
  assert.match(full, /idiom/);
  assert.match(full, /literal word-by-word sense/);
  assert.match(full, /Leave "correction" empty/);
  const quick = userPrompt(ctx, { quick: true });
  assert.match(quick, /as a whole means in this sentence/);
  assert.doesNotMatch(quick, /literal word-by-word/, "a quick lookup asks for the meaning only");
  const word = userPrompt({ word: "lata", marked: "la ⟦lata⟧", lang: "es" });
  assert.match(word, /Target word: lata/);
  assert.doesNotMatch(word, /phrase/i);
});

test("dictionary first: a phrase the dictionary lacks goes to the AI without fetching the dictionary", async () => {
  const missing = Object.assign(new Error("NO_MEANINGS"), {});
  const ai = async () => ({ provider: "gemini", meaning: "to annoy" });
  // (getDictionary null: what define-service passes for a phrase)
  const d = await dictionaryFirst({ dictionary: async () => { throw missing; }, ai, hasKey: true, lang: "es", getDictionary: null });
  assert.equal(d.meaning, "to annoy");
  assert.equal(d.dictionary_downloading, undefined, "the popup doesn't say a download is on its way");
});

test("dragging across words is not stopped at the end of a line or sentence", async () => {
  const { readFileSync } = await import("node:fs");
  const picker = readFileSync(new URL("../../web/js/components/phrasepick.js", import.meta.url), "utf8");
  assert.match(picker, /const range = phraseRange\(g\.start, to, \{ max \}\);/);
  assert.deepEqual(phraseRange(3, 8), [3, 8], "from one line into the next");
});
