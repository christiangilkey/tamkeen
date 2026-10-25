// The Thai basics course (tools/course/th/words.json), beyond what course-content.test.mjs checks for every
// language: each meaning starts with the word's reading in brackets (Paiboon, as the app writes Thai), and
// each word and sentence is written in Thai letters only (Thai uses no full stops or question marks).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const course = JSON.parse(readFileSync(new URL("../../tools/course/th/words.json", import.meta.url), "utf8"));
const THAI = /^[ก-๎]+$/;

test("th: each meaning starts with the word's reading in brackets", () => {
  // Latin letters with tone marks (kǎo, gɔ̀ɔn, tam-hâi), no Thai letters or digits.
  for (const w of course.words) assert.match(w.meaning, /^\((?=[^()]*[a-z])[^()฀-๿0-9]+\) \S/u, `${w.n}: ${w.meaning}`);
});

test("th: words and sentences are in Thai letters", () => {
  for (const w of course.words) {
    assert.match(w.word, THAI, `${w.n}: ${w.word}`);
    for (const part of w.sentence.split(" ")) assert.match(part, THAI, `${w.n}: ${w.sentence}`);
  }
});
