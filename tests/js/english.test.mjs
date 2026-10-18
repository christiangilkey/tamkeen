// Run with: node --test tests/js/
// English seen words: dictionary forms, contractions, phrasal verbs, and US pronunciation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { LemmaTable } from "../../web/js/lexicon/romance.js";
import { analyzeEnglish, englishWord, pronunciation } from "../../web/js/lexicon/english.js";
import { lexemesFor, usesDictionaries } from "../../web/js/lexicon/words.js";

const real = new LemmaTable(JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL("../../docs/lexicon/en-lemmas.json.gz", import.meta.url))))));
const lemmas = (text, t = real) => analyzeEnglish(text.split(" "), t).map((x) => x && x.lemma);

test("irregular and regular forms come to their dictionary form", () => {
  assert.deepEqual(lemmas("ran mice went children gave geese saw was"), ["run", "mouse", "go", "child", "give", "goose", "see", "be"]);
  assert.deepEqual(lemmas("Running, books talked"), ["run", "book", "talk"]);
});

test("contractions and possessives", () => {
  assert.deepEqual(["don't", "Can't", "won't", "she's", "We’ll", "John's", "teachers'"].map(englishWord), ["do", "can", "will", "she", "we", "john", "teachers"]);
  assert.deepEqual(lemmas("doesn't didn't"), ["do", "do"]);
});

test("a phrasal verb is one item, with a short object in between allowed", () => {
  const keys = (text) => analyzeEnglish(text.split(" "), real).map((x) => x && x.key);
  assert.deepEqual(keys("I gave up"), ["en|i|x", "en|give up|x", "en|give up|x"]);
  assert.deepEqual(keys("she is looking after them"), ["en|she|x", "en|be|x", "en|look after|x", "en|look after|x", "en|them|x"]);
  assert.deepEqual(keys("give it up"), ["en|give up|x", "en|it|x", "en|give up|x"]);
  assert.deepEqual(keys("she gave, up"), ["en|she|x", "en|give|x", "en|up|x"], "punctuation in between: not a phrasal verb");
  assert.deepEqual(keys("I ran up"), ["en|i|x", "en|run|x", "en|up|x"], "run up isn't in the list");
  assert.deepEqual(keys("give the book up"), ["en|give|x", "en|the|x", "en|book|x", "en|up|x"], "only a short pronoun may sit between");
});

test("US pronunciation from the CMU dictionary", () => {
  assert.equal(pronunciation("Water,", real), "/ˈwɔtɚ/");
  assert.equal(pronunciation("computer", real), "/kəmˈpjutɚ/");
  assert.equal(pronunciation("street", real), "/ˈstɹit/", "the stress mark goes before the whole syllable");
  assert.equal(pronunciation("don't", real).startsWith("/"), true, "contractions are in the dictionary as written");
  assert.equal(pronunciation("zzzxq", real), "");
  assert.equal(pronunciation("water", null), "");
});

test("without the table: by spelling, contractions still undone", () => {
  assert.deepEqual(lemmas("Ran don't", null), ["ran", "do"]);
  assert.equal(usesDictionaries("en"), true);
  assert.deepEqual(lexemesFor(["mice"], "en", [real]).map((x) => x.key), ["en|mouse|x"]);
  assert.deepEqual(lexemesFor(["mice", "2024"], "en", null).map((x) => x && x.key), ["en|mice|x", null]);
});
