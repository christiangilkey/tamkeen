// One card per word (prototype "word_pool", web/js/addwords.js sameWord, cardFor, folderNames): a word the learner has
// already is found in its own language and put in another folder, not made twice. Add words (components/wordbuilder.js),
// DLI decks (dlicontent.js addDeck) and a teacher's study words (lessonstore.js addStudyWords) use it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardFor, folderNames, sameWord } from "../../web/js/addwords.js";
import { PROTOTYPES } from "../../web/js/prototype.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the same word, compared as the app compares words", () => {
  assert.ok(sameWord("Casa", "casa"), "capitals");
  assert.ok(sameWord("¿casa?", "casa"), "punctuation round it");
  assert.ok(sameWord("كتاب", "كِتَاب"), "Arabic with and without its vowels");
  assert.ok(sameWord("كِتاب", "كِتَاب"), "Arabic with some of its vowels");
  assert.ok(!sameWord("كَتَبَ", "كُتُب"), "two Arabic words that differ only in their vowels");
  assert.ok(!sameWord("más", "mas"), "an accent that makes another word");
  assert.ok(!sameWord("", ""), "nothing is no word");
});

test("a word is found in its own language only", () => {
  const cards = [
    { id: "a", text: "pan", language: "tl", folders: [] },
    { id: "b", text: "pan", language: "es", folders: ["f1"] },
    { id: "c", text: "gato", language: "es", deleted: 1, folders: [] },
  ];
  assert.equal(cardFor(cards, "pan", "es").id, "b");
  assert.equal(cardFor(cards, "Pan", "tl").id, "a");
  assert.equal(cardFor(cards, "pan", "fr"), null, "no French card of it");
  assert.equal(cardFor(cards, "gato", "es"), null, "a deleted card is not kept");
  assert.equal(cardFor([{ id: "d", text: "kain" }], "kain", "ceb").id, "d", "a card from before words had a language");
});

test("the folders a card is in, by name", () => {
  const folders = [{ uid: "f1", name: "Food" }, { uid: "f2", name: "Verbs" }, { uid: "f3", name: "DLI · Chapter 1" }];
  assert.deepEqual(folderNames({ folders: ["f3", "f1"] }, folders), ["Food", "DLI · Chapter 1"]);
  assert.deepEqual(folderNames({ folders: [] }, folders), []);
  assert.deepEqual(folderNames(null, folders), []);
});

test("released for everyone (released in v0.63.0, the owner, 2026-11-18); the code still asks feature(\"word_pool\")", () => {
  assert.equal(PROTOTYPES.word_pool.released, true);
  const builder = read("web/js/components/wordbuilder.js");
  assert.match(builder, /rep\.saved && feature\("word_pool"\) \? cardFor\(mine\(\), row\.text, lang\)/);
  assert.match(builder, /\/vocab\/bulk-folders/, "Add words puts the card it has in the folders chosen");
  const deck = read("web/js/dlicontent.js");
  assert.match(deck, /if \(feature\("word_pool"\)\) \{[\s\S]*cardFor\(pool, w\.text, language\)/, "a DLI deck uses the card the learner has");
  const study = read("web/js/lessonstore.js");
  assert.match(study, /feature\("word_pool"\) && folder[\s\S]*cardFor\(pool, w\.word, lang\)[\s\S]*bulk-folders/, "so do a teacher's study words");
});
