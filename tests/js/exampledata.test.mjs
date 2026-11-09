// Free example sentences for common words (web/js/lexicon/exampledata.js, tools/enrich_examples.mjs): owner,
// 2026-11-09, on مشكلة getting "No example sentence was found": "it needs to be able to get words like this
// without an ai key". Uses the published files in docs/lexicon and the Basics courses in docs/course.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { ExamplePack, plainWord, sourceOf } from "../../web/js/lexicon/exampledata.js";
import { soundCore } from "../../web/js/review/wordcore.js";

const LEX = new URL("../../docs/lexicon/", import.meta.url);
const raw = (name) => readFileSync(new URL(name, LEX));
const packs = {};
const pack = (lang) => (packs[lang] ||= new ExamplePack(JSON.parse(gunzipSync(raw(`${lang}-examples.json.gz`))), lang));
const course = (lang) => JSON.parse(readFileSync(new URL(`../../docs/course/${lang}/course.json`, import.meta.url))).words;
// As examples.js freeExample asks: the word, and its core (what is typed round it left out).
const ask = (lang, word, meaning, count = 1) => pack(lang).find(word, { meaning, count, core: soundCore(word, lang).core });

test("مشكلة gets a real sentence with its translation, however it is written", () => {
  for (const w of ["مشكلة", "مُشْكِلَة", "المشكلة", "مشكلتي", "مشاكل", "‏مشكلة", "ﻣﺸﻜﻠﺔ", "مشكلة، مشاكل"]) {
    const [s] = ask("ar", w, "problem, riddle, enigma, dilemma");
    assert.ok(s, `a sentence for ${JSON.stringify(w)}`);
    assert.match(s.english, /problem/i, `${w}: ${s.text} / ${s.english}`);
    assert.match(s.source, /^t\d/, `${w}: a Tatoeba sentence first (${s.source})`);
  }
});

test("other forms count through the file's table: plurals, broken plurals, pronoun endings", () => {
  const ar = pack("ar");
  assert.equal(ar.lemmasOf("مشاكل")[0][0], "مشكله", "مشاكل is the plural of مشكلة");
  assert.equal(ar.lemmasOf("مشكلتي")[0][0], "مشكله", "مشكلتي is مشكلة with -ī");
  const found = ar.find("مشكلة", { count: 60 }).map((x) => x.text);
  assert.ok(found.some((t) => /مشاكل/.test(t)), "a sentence with مشاكل counts for مشكلة");
  assert.ok(found.some((t) => /مشكلت/.test(t)), "and one with مشكلتي / مشكلته");
  // a word that is also a word of its own counts for less (كتب is "books" and "he wrote")
  assert.ok(ar.lemmasOf("كتب").every(([, cost]) => cost > ar.lemmasOf("مشاكل")[0][1]));
  const de = pack("de").find("Teil", { count: 60 }).map((x) => x.text);
  assert.ok(de.some((t) => /\bTeile\b/.test(t)), "German: Teile counts for Teil");
});

test("a card's word with an article or other forms round it finds sentences with the word itself", () => {
  const real = ask("de", "der Teil", "part (pl. Teile)", 20).filter((s) => s.source.startsWith("t"));
  assert.ok(real.length >= 3 && real.every((s) => /\bteil/i.test(s.text)), "Tatoeba's sentences with Teil, not only ones with der Teil");
  assert.ok(real.some((s) => /\bein Teil\b/.test(s.text)), "ein Teil too");
});

test("Korean words are found with their endings on", () => {
  const real = ask("ko", "정보", "information", 20).filter((s) => s.source.startsWith("t"));
  assert.ok(real.some((s) => /정보[를가는의에]/.test(s.text)), "정보를, 정보가… count for 정보");
});

test("every word of every Basics course gets a sentence with a translation", () => {
  for (const lang of ["ar", "ca", "ceb", "de", "es", "fa", "fr", "hi", "it", "ja", "ko", "pt", "ru", "th", "tl", "zh"]) {
    // (all of Arabic's; every 10th word of the others, to keep the test quick)
    const words = course(lang).filter((_, i) => lang === "ar" || i % 10 === 0);
    const none = words.filter((w) => !ask(lang, w.word, w.meaning).length).map((w) => w.word);
    assert.deepEqual(none, [], `${lang}: words with no sentence`);
    const [s] = ask(lang, words[10].word, words[10].meaning);
    assert.ok(s.english && !/[⟦⟧]/.test(s.english + s.text), `${lang}: plain text and translation`);
  }
});

test("Tatoeba and Wiktionary come first; the course's own sentence is the fallback, and named", () => {
  const ar = pack("ar");
  assert.ok(ar.sentences.filter((s) => s[2] === "b").length > 900, "the Basics course's sentences are in");
  // خصوصا "especially" had no sentence before: now the course's
  const [s] = ask("ar", "خُصُوصًا", "especially");
  assert.equal(s.source, "b");
  assert.deepEqual(sourceOf("b"), { name: "Tamkeen's Basics course", url: "" });
  const top = course("ar").map((w) => ask("ar", w.word, w.meaning)[0].source);
  assert.ok(top.filter((x) => x === "b").length < 200, "most words get a Tatoeba or Wiktionary sentence first");
});

test("invisible characters and Arabic's joined letter shapes are made plain", () => {
  assert.equal(plainWord("‏مشكلة‎ "), "مشكلة");
  assert.equal(plainWord("ﻣﺸﻜﻠﺔ"), "مشكلة");
  assert.equal(plainWord("می‌خواهم"), "می‌خواهم", "Persian's half space stays");
});

test("each examples file's size and sha256 in index.json match the file (devices update by it)", () => {
  const index = JSON.parse(raw("index.json"));
  for (const [name, meta] of Object.entries(index.files)) {
    if (!name.startsWith("ex-") || !existsSync(new URL(meta.file, LEX))) continue;
    const blob = raw(meta.file);
    assert.equal(meta.bytes, blob.length, `${meta.file} bytes`);
    assert.equal(meta.sha256, createHash("sha256").update(blob).digest("hex"), `${meta.file} sha256`);
    assert.ok(blob.length < 5e6, `${meta.file} stays a sensible size`);
  }
});
