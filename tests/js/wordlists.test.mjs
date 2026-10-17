// Run with: node --test tests/js/
// The "1000 most common words" lists (web/js/wordlists/), and how they become seen words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGE_CODES, detectLanguage } from "../../web/js/languages.js";
import { lexemesFor, needsDictionaries } from "../../web/js/lexicon/words.js";

// Languages added since the lists were last built (tools/make_wordlists.py). Without a list the
// "I've already started" step simply has no common words to add for them.
const NOT_YET = [];
const WITH_LISTS = LANGUAGE_CODES.filter((c) => !NOT_YET.includes(c));
const lists = Object.fromEntries(await Promise.all(
  WITH_LISTS.map(async (code) => [code, (await import(`../../web/js/wordlists/${code}.js`)).default])));

test("every language the app teaches has a list of 1000 different words", () => {
  for (const code of WITH_LISTS) {
    const words = lists[code];
    assert.equal(words.length, 1000, code);
    assert.equal(new Set(words).size, 1000, `${code}: no repeats`);
    for (const w of words) {
      assert.ok(typeof w === "string" && w === w.trim() && w.length > 0, `${code}: "${w}"`);
      assert.ok(!/\d/.test(w), `${code}: "${w}" has a number in it`);
    }
  }
});

test("the lists are in the right writing: no English in the Arabic list, and so on", () => {
  const expected = { es: "es", fr: "fr", ar: "ar", ru: "ru", zh: "zh", ja: "ja", en: "en", it: "it", tl: "tl" };
  for (const code of WITH_LISTS) {
    assert.equal(detectLanguage(lists[code].join(" "), code), expected[code], code);
  }
  assert.ok(lists.ar.every((w) => /^[ء-ي]+$/.test(w)));
  assert.ok(lists.ru.every((w) => /^[а-яё-]+$/.test(w)));
  assert.ok(lists.zh.every((w) => /^\p{Script=Han}+$/u.test(w)));
});

test("the very common words are there", () => {
  for (const [code, word] of [["es", "que"], ["fr", "est"], ["ar", "في"], ["ru", "что"], ["zh", "我们"], ["ja", "です"], ["en", "the"]]) {
    assert.ok(lists[code].slice(0, 100).includes(word), `${code}: ${word}`);
  }
});

test("languages known by spelling turn nearly every list word into a seen-word key", () => {
  for (const code of WITH_LISTS.filter((c) => !needsDictionaries(c))) {
    const found = lexemesFor(lists[code], code).filter(Boolean);
    assert.ok(found.length >= 990, `${code}: ${found.length}`);
    assert.ok(found.every((x) => x.key.startsWith(`${code}|`) && x.key.split("|").length === 3), code);
  }
});

test("Arabic has to wait for its dictionaries", () => {
  assert.equal(lexemesFor(lists.ar, "ar", null), null);
});
