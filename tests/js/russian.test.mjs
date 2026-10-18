// Run with: node --test tests/js/
// Russian seen words and stress marks, on a small hand-made table and on the real one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { LemmaTable } from "../../web/js/lexicon/romance.js";
import { ruMatch, russianLexeme, stressed } from "../../web/js/lexicon/russian.js";
import { lexemesFor, usesDictionaries } from "../../web/js/lexicon/words.js";

const real = new LemmaTable(JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL("../../docs/lexicon/ru-lemmas.json.gz", import.meta.url))))));
const lemma = (w, t = real) => russianLexeme(w, t).key.split("|")[1];

test("е and ё are one letter, and stress marks are ignored when matching", () => {
  assert.equal(ruMatch("Ещё"), "еще");
  assert.equal(ruMatch("ла́дно"), "ладно");
  assert.equal(russianLexeme("ещё").key, russianLexeme("еще").key);
  assert.equal(russianLexeme("ла́дно,").key, "ru|ладно|x");
  assert.equal(russianLexeme("2024"), null);
});

test("case, number, gender, tense and aspect forms are one word", () => {
  for (const w of ["книга", "книги", "книгой", "книгам"]) assert.equal(lemma(w), "книга", w);
  for (const w of ["новый", "новая", "новых", "новыми"]) assert.equal(lemma(w), "новый", w);
  for (const w of ["говорить", "говорю", "говорила", "сказать", "скажу", "сказала", "скажи"]) assert.equal(lemma(w), "говорить", w);
  for (const w of ["делаю", "сделал", "сделаем"]) assert.equal(lemma(w), "делать", w);
  assert.equal(lemma("Людей"), "человек");
  assert.equal(russianLexeme("ещё", real).lemma, "ещё", "a dictionary form with ё is shown with it");
});

test("stress marks: shown where the dictionary is sure, keeping case and punctuation", () => {
  assert.equal(stressed("ладно", real), "ла́дно");
  assert.equal(stressed("Ладно,", real), "Ла́дно,");
  assert.equal(stressed("сказала", real), "сказа́ла");
  assert.equal(stressed("еще", real), "ещё", "е that is really ё is written ё");
  assert.equal(stressed("Еще!", real), "Ещё!");
  assert.equal(stressed("да", real), "да", "one vowel: nothing to show");
  assert.equal(stressed("ла́дно", real), "ла́дно", "already marked: left alone");
  assert.equal(stressed("замок", real), "замок", "за́мок or замо́к: not marked when the dictionary has both");
  assert.equal(stressed("ладно", null), "ладно");
  assert.equal(stressed("Google", real), "Google");
});

test("plumbing", () => {
  assert.equal(usesDictionaries("ru"), true);
  assert.deepEqual(lexemesFor(["Говорила", "ещё"], "ru", [real]).map((x) => x.key), ["ru|говорить|x", "ru|еще|x"]);
  assert.deepEqual(lexemesFor(["Говорила"], "ru", null).map((x) => x.key), ["ru|говорила|x"], "without the table: by spelling");
});
