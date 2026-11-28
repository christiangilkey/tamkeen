// Run with: node --test tests/js/
// A card's sentence translated by the learner's AI: "Generate" beside "+ Sentence translation" on the Vocab card
// (web/js/review/sentencetranslate.js, components/wordeditor.js; the owner, 2026-11-27).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readTranslation, sentenceOf, translateCardSentence, translatePrompt, TRANSLATE_SCHEMA } from "../../web/js/review/sentencetranslate.js";
import { ADDS, missingParts } from "../../web/js/review/vocabedit.js";

const card = { text: "superar", meaning: "to surpass, exceed", sentence: "Incluso puedes tú ⟦superar⟧ para alcanzar lo que te propones." };

test("the AI is asked to translate the card's whole sentence into the learner's language, nothing added", () => {
  const p = translatePrompt(sentenceOf(card), { study: "Spanish", speaks: "French", word: "superar", meaning: "to surpass" });
  assert.equal(p.schema, TRANSLATE_SCHEMA);
  assert.deepEqual(TRANSLATE_SCHEMA.required, ["translation"]);
  assert.match(p.system, /from Spanish into French/);
  assert.match(p.system, /never add, finish or explain/, "a sentence cut from speech is translated as it is");
  assert.match(p.user, /Sentence \(Spanish\): Incluso puedes tú superar para alcanzar lo que te propones\./, "without the card's marks");
  assert.match(p.user, /The word being learned in it: superar \(meaning here: to surpass\)/);
  assert.ok(!/word being learned/.test(translatePrompt("Hola.", {}).user), "no word: no line about it");
});

test("the answer is tidied: one line, no quotation marks round it; nothing is nothing", () => {
  assert.equal(readTranslation({ translation: '  "Even you can surpass\n yourself."  ' }), "Even you can surpass yourself.");
  assert.equal(readTranslation({ translation: "«Hasta tú.»" }), "Hasta tú.");
  assert.equal(readTranslation({}), "");
  assert.equal(readTranslation(null), "");
  assert.equal(sentenceOf({ sentence: "  a\n  ⟦b⟧  c " }), "a b c");
});

test("Generate: asks once and gives the translation; no sentence, no answer or no key are errors to show", async () => {
  const asked = [];
  const got = await translateCardSentence(card, { study: "Spanish", speaks: "English",
    ask: async (prompt) => { asked.push(prompt); return { translation: "Even you can surpass to reach what you set out to do." }; } });
  assert.equal(got, "Even you can surpass to reach what you set out to do.");
  assert.equal(asked.length, 1);
  await assert.rejects(translateCardSentence({ text: "x", sentence: "" }, { ask: async () => ({}) }), /no sentence/);
  await assert.rejects(translateCardSentence(card, { ask: async () => ({ translation: "" }) }), /didn't write a translation/);
  // With no key the app's askAi throws NO_KEY: it comes out as it is, for the popup with the way to Settings (fixit.js).
  await assert.rejects(translateCardSentence(card, { ask: async () => { throw new Error("NO_KEY"); } }), /NO_KEY/);
});

test("the card says '+ Sentence translation', with Generate beside it, only once it has a sentence", () => {
  assert.deepEqual(ADDS.find(([f]) => f === "translation"), ["translation", "Sentence translation"]);
  assert.ok(missingParts({ text: "a", meaning: "b", sentence: "c d" }).includes("translation"));
  assert.ok(!missingParts({ text: "a", meaning: "b" }).includes("translation"), "no sentence: nothing to translate");
  const editor = readFileSync(new URL("../../web/js/components/wordeditor.js", import.meta.url), "utf8");
  assert.match(editor, /class="vi-add vi-gen" data-gen="translation"/, "the Generate button");
  assert.match(editor, /translateCardSentence\(v, \{ ask: askAi,/, "the learner's own AI, the way meanings are asked");
  assert.match(editor, /saveChange\(\{ translation \}\)/, "it fills the field (and can still be typed over)");
  assert.match(editor, /!offerFix\(e\)/, "no key or AI off: the app's popup with the way to Settings");
  const phone = readFileSync(new URL("../../mobile/src/js/define-service.js", import.meta.url), "utf8");
  assert.match(phone, /export const askAi = /, "the phones and the web app have the same askAi");
  assert.match(readFileSync(new URL("../../web/js/components/wordbuilder.js", import.meta.url), "utf8"), /Sentence translation/,
    "Add words already calls it that");
});
