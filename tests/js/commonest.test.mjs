// The commonest meaning first (web/js/lexicon/meaningdata.js commonestFirst, used by web/js/meanings.js dictionaryDefine on
// every device). The owner, 2026-11-18: "I'm having complaints from students where word definitions are often not the most
// common definition for the word." Wiktionary lists entries by etymology, so a rare one could come first (guapo
// "arrowroot"); the meanings files' `english` lists (Wiktionary's translation tables turned round) now say which meaning
// is the everyday one. These pin down the first meaning of common words in several languages, read from the real files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { answerFrom, commonestFirst, glossHeads, lookUp, matchKey, wordKeys } from "../../web/js/lexicon/meaningdata.js";

const cache = new Map();
const file = (name) => {
  if (!cache.has(name)) cache.set(name, JSON.parse(zlib.gunzipSync(readFileSync(new URL(`../../docs/lexicon/${name}`, import.meta.url))).toString("utf8")));
  return cache.get(name);
};
// The files each language asks, in the order meanings.js asks them (Bisaya: Wolff's dictionary first).
const FILES = { ar: ["ar-meanings.json.gz", "ar-camel-meanings.json.gz"], ja: ["ja-meanings.json.gz", "ja-jmdict-meanings.json.gz"],
  ceb: ["ceb-wolff-meanings.json.gz", "ceb-meanings.json.gz"] };
const filesOf = (lang) => (FILES[lang] || [`${lang}-meanings.json.gz`]).map(file);

/** The popup's first meaning for `word`, as dictionaryDefine gives it (`lemma`: the dictionary form the word table finds). */
function firstMeaning(word, lang, lemma = "") {
  const files = filesOf(lang);
  const keys = lemma ? [matchKey(word, lang), matchKey(lemma, lang)] : wordKeys(word, lang, null);
  const found = lookUp(files, keys, word, lang, { rank: () => Infinity });
  assert.ok(found, `${lang} ${word}: found`);
  return answerFrom(commonestFirst(found, files, lang, word), word, lang, { source: found.source }).meaning;
}

test("a rare entry Wiktionary lists first gives way to the everyday one", () => {
  assert.match(firstMeaning("guapo", "es"), /handsome/, "guapo: not “arrowroot”");
  assert.match(firstMeaning("东西", "zh"), /^thing/, "东西 dōngxi: not “east and west”");
  assert.match(firstMeaning("日", "ja"), /sun|day/, "日: not “ordinal day of a month”");
  assert.match(firstMeaning("قلم", "ar"), /^pen/, "قلم: not قَلَمَ “to cut”");
});

test("a letter's name gives way to the word itself", () => {
  assert.match(firstMeaning("de", "es"), /^of/);
  assert.match(firstMeaning("te", "es"), /yourself|you/);
  assert.match(firstMeaning("mi", "es"), /mine|my/);
  assert.match(firstMeaning("и", "ru"), /^and/);
  assert.match(firstMeaning("я", "ru"), /^I\b/);
});

test("a word's own everyday entry isn't hidden behind a noun's form, but a verb's form still comes first", () => {
  assert.match(firstMeaning("مدرسة", "ar"), /school/, "مدرسة: “school”, not “teacher” (feminine of مدرس)");
  assert.match(firstMeaning("faig", "ca", "fer"), /make|do/, "faig is fer's “I do”, not “beech”");
  assert.match(firstMeaning("digo", "es", "decir"), /say/, "digo is decir's “I say”");
  assert.match(firstMeaning("es", "es"), /to be/, "es is ser's “to be”, not its noun “a being”");
});

test("Bisaya: where the tables say nothing, Wiktionary's first meaning picks among Wolff's", () => {
  assert.equal(firstMeaning("asa", "ceb"), "where", "asa: not “pay attention to”");
  assert.match(firstMeaning("maayo", "ceb"), /good/, "maayo: not “do something well”, nor its note “short forms”");
  assert.equal(firstMeaning("balay", "ceb"), "house");
});

test("Japanese: a kana spelling Wiktionary has only as a name finds the word in JMdict", () => {
  assert.match(firstMeaning("かける", "ja"), /hang/, "かける: not “a male given name”");
});

test("Wiktionary's order stays where it is already right, or where the tables can't tell", () => {
  for (const [lang, word, want] of [["es", "tiempo", /^time/], ["es", "casa", /^house/], ["fr", "voler", /fly/], ["fr", "pièce", /room/],
    ["fr", "livre", /^book/], ["fr", "ce", /this/], ["de", "somit", /therefore/], ["de", "ist", /to be/], ["ru", "лук", /onion/],
    ["ar", "عين", /^eye/], ["ar", "بيت", /house/], ["zh", "好", /good/], ["ko", "싸다", /cheap/], ["ko", "차", /vehicle|car/],
    ["it", "a", /\bto\b/], ["tl", "bahay", /house/], ["ja", "方", /direction/]]) {
    assert.match(firstMeaning(word, lang), want, `${lang} ${word}`);
  }
});

test("a meaning's English words, as the translation tables key them", () => {
  assert.deepEqual(glossHeads("to take, catch (a ball); the house"), ["take", "catch", "house"]);
  assert.ok(glossHeads("to fly through the air").includes("fly"), "a longer one by its first word too");
});
