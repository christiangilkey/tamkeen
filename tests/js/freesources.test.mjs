// Free fallbacks for meanings and example sentences with no AI key (the owner, 2026-11-17: "Sometimes words aren't
// found in Wiktionary, or even if they are they don't have example sentences … I want some sources to fall back on").
//   1. More Tatoeba sentences for rarer words (tools/build_examples.py more): every word form Tatoeba has gets some.
//   2. Add words takes a sentence from the learner's own library when the files have none (review/sentencefind.js).
//   3. English entries' translation tables (tools/build_meanings.py --english): words the language's own entries lack,
//      and the `english` list (English word -> the language's words) for "How do I say …?".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const readGz = (p) => JSON.parse(zlib.gunzipSync(readFileSync(new URL(`../../${p}`, import.meta.url))).toString("utf8"));
const index = JSON.parse(read("docs/lexicon/index.json")).files;

test("the examples files keep far more Tatoeba sentences than the old 40,000", () => {
  for (const [lang, least] of [["es", 70000], ["fr", 70000], ["de", 70000], ["it", 70000], ["ru", 70000], ["pt", 60000]]) {
    assert.ok(index[`ex-${lang}`].sentences >= least, `${lang}: ${index[`ex-${lang}`].sentences}`);
  }
  const build = read("tools/build_examples.py");
  assert.match(build, /def more\(tatoeba: Path, lang: str\) -> None:/);
  assert.match(build, /elif args\[0\] == "more":/);
  // (the Basics course sentences stay last: enrich_examples.mjs needs them there)
  const es = readGz("docs/lexicon/es-examples.json.gz");
  const firstCourse = es.sentences.findIndex((s) => String(s[2]).startsWith("b"));
  assert.ok(firstCourse > 0 && es.sentences.slice(firstCourse).every((s) => String(s[2]).startsWith("b")));
  assert.ok(Object.keys(es.forms).length > 20000, "the forms table made again");
});

test("Add words falls back to a sentence from the learner's own library", () => {
  const find = read("web/js/review/sentencefind.js");
  assert.match(find, /export async function librarySentence\(v, lang\)/);
  const builder = read("web/js/components/wordbuilder.js");
  assert.match(builder, /import \{ librarySentence \} from "\.\.\/review\/sentencefind\.js";/);
  const free = builder.indexOf("found = await freeExample("), lib = builder.indexOf("fromLibrary = await librarySentence(");
  assert.ok(free > 0 && lib > free, "the files first (they have a translation), then the library");
  assert.match(builder, /From your own library: \{0\}/);
});

test("Wiktionary's translation tables, turned round, for every language", () => {
  const build = read("tools/build_meanings.py");
  assert.match(build, /def all_translations\(source: str, langs: list\[str\]\)/);
  assert.match(build, /data\["english"\] = english/);
  const es = readGz("docs/lexicon/es-meanings.json.gz");
  assert.equal(es.english.fork[0][0], "tenedor", "the main sense first (eating utensil, not a pitchfork)");
  assert.equal(es.english.dog[0][0], "perro");
  assert.deepEqual(es.english.colorful[0].slice(0, 2), ["lleno de color", "adj"], "a phrase whole, not its pieces");
  assert.ok(!es.english.colorful.some((x) => x[0] === "lleno"));
  const de = readGz("docs/lexicon/de-meanings.json.gz");
  assert.equal(de.english.dog[0][0], "Hund", "not Rüde, the male");
  const zh = readGz("docs/lexicon/zh-meanings.json.gz");
  assert.deepEqual(zh.english.dog[0], ["狗", "noun", "animal", "gǒu"], "Mandarin, simplified, with its pinyin");
  for (const lang of ["fr", "de", "ar", "ja", "zh", "ko", "ru"]) {
    assert.ok(index[`mean-${lang}`], lang);
  }
});
