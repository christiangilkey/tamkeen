// The Persian basics course (tools/course/fa/words.json), on top of course-content.test.mjs:
// Persian letters (ی and ک, not the Arabic ي and ك), the half space after the verb prefix می / نمی
// (می‌روم, not میروم or می روم), and each meaning starting with the word's romanisation in brackets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const FILE = new URL("../../tools/course/fa/words.json", import.meta.url);
const course = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { words: [] };
const persian = (w) => [w.word, w.sentence, ...[].concat(w.form || [])];
// Words that begin with می but are not the verb prefix.
const NOT_PREFIX = new Set(["میز", "میوه", "میان", "میل", "میلیون", "میدان", "میهمان", "میراث", "میزان", "میانه",
  "میخ", "میمون", "میانگین"]);

test("fa: Persian letters, not Arabic ones", () => {
  for (const w of course.words) {
    for (const s of persian(w)) assert.doesNotMatch(s, /[يكىة]/, `${w.n}: ${s}`);
    assert.doesNotMatch(w.word + w.sentence, /[A-Za-z0-9]/, `${w.n}: Latin letters or digits`);
  }
});

test("fa: the verb prefix می is joined with a half space", () => {
  for (const w of course.words) {
    for (const tok of w.sentence.split(/\s+/)) {
      const t = tok.replace(/[.،!؟:«»]/g, "");
      if (NOT_PREFIX.has(t) || [...NOT_PREFIX].some((n) => t.startsWith(n))) continue;
      assert.doesNotMatch(t, /^ن?می[^‌]/, `${w.n}: ${t} (می‌ needs a half space)`);
    }
    assert.doesNotMatch(w.sentence, /(?:^|\s)ن?می\s/, `${w.n}: می written apart`);
  }
});

test("fa: each meaning starts with the romanisation in brackets", () => {
  for (const w of course.words) assert.match(w.meaning, /^\([a-zâ'\- ]+\) \S/, `${w.n}: ${w.meaning}`);
});
