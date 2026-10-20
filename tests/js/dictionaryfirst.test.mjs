// Run with: node --test tests/js/
// "Dictionary first, AI when it has nothing" (Settings → Word definitions) and the word popup's
// tag saying where a meaning came from (definer.js dictionaryFirst / answerSource / definerModeOf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DefinerError, answerSource, definerModeOf, dictionaryFirst } from "../../web/js/definer.js";
import { answerFrom } from "../../web/js/lexicon/meaningdata.js";

// Stand-ins for the two ways of explaining a word, counting how often each was asked.
function sources({ dictionary = "found" } = {}) {
  const asked = { dictionary: 0, ai: 0 };
  return {
    asked,
    dictionary: async () => {
      asked.dictionary++;
      if (dictionary === "found") return { meaning: "book", provider: "dictionary", model: "Wiktionary" };
      throw new DefinerError(dictionary === "missing" ? "NO_MEANINGS" : "This word isn't in the built-in dictionary.");
    },
    ai: async () => { asked.ai++; return { meaning: "the book (in this sentence)", provider: "gemini", model: "gemini-3.1-flash-lite" }; },
  };
}

test("the dictionary's meaning is shown when it has the word, and the AI isn't asked", async () => {
  const s = sources();
  const d = await dictionaryFirst({ ...s, hasKey: true });
  assert.equal(d.provider, "dictionary");
  assert.deepEqual(s.asked, { dictionary: 1, ai: 0 });
});

test("a word the dictionary doesn't have goes to the AI", async () => {
  const s = sources({ dictionary: "notfound" });
  const d = await dictionaryFirst({ ...s, hasKey: true });
  assert.equal(d.provider, "gemini");
  assert.deepEqual(s.asked, { dictionary: 1, ai: 1 });
});

test("the AI also answers while the language's dictionary isn't downloaded", async () => {
  const s = sources({ dictionary: "missing" });
  assert.equal((await dictionaryFirst({ ...s, hasKey: true })).provider, "gemini");
});

test("without a key it is the dictionary alone, its own failure included", async () => {
  const notFound = sources({ dictionary: "notfound" });
  await assert.rejects(dictionaryFirst({ ...notFound, hasKey: false }), /isn't in the built-in dictionary/);
  const missing = sources({ dictionary: "missing" });
  await assert.rejects(dictionaryFirst({ ...missing, hasKey: false }), (e) => e.message === "NO_MEANINGS"); // the popup offers the download
  assert.equal(notFound.asked.ai + missing.asked.ai, 0);
  const found = sources();
  assert.equal((await dictionaryFirst({ ...found, hasKey: false })).provider, "dictionary");
});

test("Ask again on a dictionary meaning asks the AI (with a key); without one, the dictionary again", async () => {
  const s = sources();
  assert.equal((await dictionaryFirst({ ...s, hasKey: true, refresh: true })).provider, "gemini");
  assert.deepEqual(s.asked, { dictionary: 0, ai: 1 });
  const nokey = sources();
  assert.equal((await dictionaryFirst({ ...nokey, hasKey: false, refresh: true })).provider, "dictionary");
});

test("an AI failure after the dictionary had nothing is the AI's (so Troubleshoot can explain it)", async () => {
  const s = sources({ dictionary: "notfound" });
  s.ai = async () => { throw new DefinerError("Gemini refused the key"); };
  await assert.rejects(dictionaryFirst({ ...s, hasKey: true }), /refused the key/);
});

test("the setting: three ways; unset (or anything else) is the default, dictionary first", () => {
  assert.equal(definerModeOf({ definer_mode: "dictionary_first" }), "dictionary_first");
  assert.equal(definerModeOf({ definer_mode: "dictionary" }), "dictionary");
  assert.equal(definerModeOf({ definer_mode: "ai" }), "ai");
  assert.equal(definerModeOf({ definer_mode: "something newer" }), "dictionary_first");
  assert.equal(definerModeOf({}), "dictionary_first");
  assert.equal(definerModeOf(null), "dictionary_first");
});

test("the popup's tag names the dictionary a meaning came from", () => {
  const found = { key: "x", groups: [["kitāb", "noun", ["book"], ""]], formOf: "" };
  const from = (source, lang = "ar") => answerSource(answerFrom(found, "kitāb", lang, { source }));
  assert.equal(from("English Wiktionary via Wiktextract (kaikki.org)"), "Wiktionary");
  assert.equal(from("CAMeL Tools morphology databases (CAMeL Lab, NYU Abu Dhabi)"), "CAMeL Arabic");
  assert.equal(from("John U. Wolff, A Dictionary of Cebuano Visayan (1972), Project Gutenberg ebook 40074", "ceb"), "Wolff's dictionary");
});

test("the popup's tag names the AI and its model", () => {
  assert.equal(answerSource({ provider: "claude", model: "claude-haiku-5-5" }), "AI · Claude Haiku 5.5");
  assert.equal(answerSource({ provider: "gemini", model: "gemini-3.1-flash-lite" }), "AI · Gemini 3.1 Flash-Lite");
  assert.equal(answerSource({ provider: "openai", model: "my-own-model" }), "AI · OpenAI my-own-model"); // a model typed in
  assert.equal(answerSource({ provider: "grok" }), "AI · Grok");
  assert.equal(answerSource({ meaning: "kept from long ago" }), "AI"); // an old kept answer without its provider
  assert.equal(answerSource(null), "");
});
