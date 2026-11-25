// Add words from the meaning (prototype meaning_first): a card with no word and a meaning typed gets its word found
// (the AI, or the built-in dictionary turned round), "Which word?" when several fit, then the rest as for any word.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

import { addable, fromMeaning, parseList, readReverse, reversePrompt, typed, filled } from "../../web/js/addwords.js";
import { translationsFor } from "../../web/js/voiceask.js";
import { PROTOTYPES } from "../../web/js/prototype.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("a card with no word and the learner's own meaning starts from the meaning; only in prototype mode", () => {
  const card = { text: "", meaning: typed("library") };
  assert.equal(fromMeaning(card), true);
  assert.equal(fromMeaning({ text: "biblioteca", meaning: typed("library") }), false, "a word typed: as always");
  assert.equal(fromMeaning({ text: "", meaning: filled("library") }), false, "a meaning the app filled in isn't the learner's");
  assert.equal(fromMeaning({ text: "", meaning: typed("  ") }), false);
  assert.equal(addable([card], [{}]).length, 0, "without the prototype, a card with no word isn't added");
  assert.equal(addable([card], [{}], { meaningFirst: true }).length, 1);
  assert.equal(PROTOTYPES.meaning_first.released, true, "released for everybody in v0.74.0");
});

test("a pasted line with only a meaning is a card started from it (\"= library\", a row with no word)", () => {
  const { cards } = parseList("= library\n\tbook\tUn libro.\nperro = dog", { lang: "es", meaningFirst: true });
  assert.deepEqual(cards.map((c) => [c.text, c.meaning]), [["", "library"], ["", "book"], ["perro", "dog"]]);
  assert.equal(cards[1].sentence, "Un libro.");
  // without the prototype, as before: the lone meaning is taken for the word
  assert.deepEqual(parseList("= library", { lang: "es" }).cards.map((c) => c.text), ["library"]);
});

test("the AI is asked for the words of all the meanings in one request, the most common first", () => {
  const items = [{ meaning: "library" }, { meaning: "to run" }];
  const p = reversePrompt(items, { study: "Arabic", speaks: "English", vowels: true });
  assert.match(p.system, /the most common one first, then at most 3 others/);
  assert.match(p.system, /with full vowel marks/);
  assert.equal(p.user, "1. meaning: library\n2. meaning: to run");
  assert.ok(p.schema.properties.cards.items.properties.words);
  const answer = { cards: [
    { meaning: "to run", words: [{ word: "رَكَضَ", reading: "rakaḍa", meaning: "" }] },
    { meaning: "Library", words: [{ word: "مَكْتَبَة", reading: "maktaba", meaning: "a library" }, "مكتبة", { word: "دار الكتب", reading: "", meaning: "a national library" },
      { word: "a", reading: "", meaning: "" }, { word: "b", reading: "", meaning: "" }, { word: "c", reading: "", meaning: "" }] },
  ] };
  const got = readReverse(JSON.stringify(answer), items);
  assert.deepEqual(got[0].map((w) => w.word), ["مَكْتَبَة", "دار الكتب", "a", "b"], "matched by meaning; each word once (vowels or not); four at most");
  assert.deepEqual(got[1].map((w) => w.word), ["رَكَضَ"]);
  assert.deepEqual(readReverse("nonsense", items), [[], []]);
});

test("with no AI, the built-in dictionary turned round finds the word (English meanings)", () => {
  const files = [JSON.parse(zlib.gunzipSync(readFileSync(new URL("../../docs/lexicon/es-meanings.json.gz", import.meta.url))).toString("utf8"))];
  const words = translationsFor(files, "library", "es").map((w) => w.word);
  assert.ok(words.includes("biblioteca"), words.join(", "));
});

test("Add words finds the words first, asks \"Which word?\" when several fit, and keeps the learner's meaning", () => {
  const wb = read("web/js/components/wordbuilder.js");
  assert.match(wb, /const meaningFirst = feature\("meaning_first"\);/);
  assert.match(wb, /if \(meaningFirst\) \{\n\s+if \(!\(await findWords\(list\)\)\) return false;/, "before anything else is filled in");
  assert.match(wb, /readReverse\(await askAi\(reversePrompt\(items/, "the AI: one request");
  assert.match(wb, /translationsFor\(files, r\.meaning\.value\.trim\(\), lang, \{ common \}\)/, "no AI: the dictionary");
  assert.match(wb, /await chooseWords\(several\.map/, "several: Which word?");
  assert.match(wb, /r\.text = w\.word;/);
  assert.doesNotMatch(wb.slice(wb.indexOf("async function findWords"), wb.indexOf("$(\".cb-fill\").onclick")), /r\.meaning = /, "the meaning stays theirs");
  assert.match(wb, /list = list\.filter\(\(r\) => wordKey\(r\.text\) && now\.includes\(r\)\)/, "never a card with no word; never a word they have twice");
  assert.match(read("web/js/components/wordchoice.js"), /export function chooseWords\(items, \{ lang = "" \} = \{\}\)/);
  assert.match(read("mobile/scripts/build-www.mjs"), /"js\/components\/wordchoice\.js"/);
});
