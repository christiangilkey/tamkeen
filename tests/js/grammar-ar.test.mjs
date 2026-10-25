// Checks of the Arabic-explained English course (tools/grammar/ar-en) beyond the shared ones in
// grammar.test.mjs: the two languages stay apart (English examples, Arabic explanations), Arabic text
// uses Arabic punctuation, the English is American, and every lesson ends with the learner's own sentence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { explanationTexts, parseRich, taughtTexts } from "../../web/js/grammardata.js";

const course = JSON.parse(readFileSync(new URL("../../tools/grammar/ar-en/lessons.json", import.meta.url), "utf8"));
const ARABIC = /[؀-ۿ]/;
const LATIN_WORD = /[A-Za-z]{2,}/;
/** The text outside its {{ }} pieces. */
const own = (s) => parseRich(s).filter((p) => p.kind === "text").map((p) => p.text).join("");

test("ar-en: every English piece (examples, answers, {{ }}) has no Arabic letters in it", () => {
  const bad = [];
  for (const l of course.lessons) for (const t of taughtTexts(l)) if (ARABIC.test(t)) bad.push(`${l.id}: ${t}`);
  assert.deepEqual(bad, []);
});

test("ar-en: every explanation is written in Arabic, with English only inside {{ }}", () => {
  const bad = [];
  for (const l of course.lessons) {
    for (const { kind, text } of explanationTexts(l)) {
      const mine = own(text);
      if (!ARABIC.test(mine)) bad.push(`${l.id} (${kind}): no Arabic in “${text}”`);
      if (LATIN_WORD.test(mine.replace(/\b(s|sh|ch|x|a|e|i|o|u|p|b|v|f|th|ed|ing|es|ies|y)\b/g, ""))) bad.push(`${l.id} (${kind}): English outside {{ }} in “${text}”`);
    }
  }
  assert.deepEqual(bad, []);
});

test("ar-en: Arabic text uses the Arabic question mark and comma", () => {
  const bad = [];
  for (const l of course.lessons) {
    for (const { kind, text } of explanationTexts(l)) {
      const mine = own(text);
      if (/\?/.test(mine) || /[؀-ۿ] ?, ?[؀-ۿ]/.test(mine)) bad.push(`${l.id} (${kind}): “${text}”`);
    }
  }
  assert.deepEqual(bad, []);
});

const BRITISH = /\b(colour|favourite|centre|theatre|travelled|travelling|cancelled|organise|realise|apologise|neighbour|lorry|biscuit|mobile phone|queue|petrol|maths|have got|autumn)\b/i;
test("ar-en: the English is American (no British spellings or words in the examples)", () => {
  const bad = [];
  for (const l of course.lessons) {
    for (const b of l.blocks) for (const e of [...(b.ex || []), ...(b.dialog || []), ...(b.goal ? [b.goal] : [])]) if (BRITISH.test(e.t) && !e.note) bad.push(`${l.id}: ${e.t}`);
    for (const q of l.practice) for (const a of q.answers || []) if (BRITISH.test(a.t)) bad.push(`${l.id}: ${a.t}`);
  }
  assert.deepEqual(bad, []);
});

test("ar-en: every lesson's practice ends with “your turn”, with two or three model answers", () => {
  for (const l of course.lessons) {
    const last = l.practice[l.practice.length - 1];
    assert.equal(last.type, "free", `${l.id}: the last question isn't “your turn”`);
    assert.ok(last.answers.length >= 2 && last.answers.length <= 3, `${l.id}: ${last.answers.length} model answers`);
  }
});

// (PLAN.md: 50 lessons; the shares are checked once the last unit is in.)
test("ar-en: 40 to 55 lessons, about 40% A1, 40% A2, 20% B1, when the course is complete", () => {
  const n = course.lessons.length;
  assert.ok(n <= 55, `${n} lessons`);
  if (n >= 48) {
    const share = (lv) => course.lessons.filter((l) => l.level === lv).length / n;
    assert.ok(share("A1") >= 0.3 && share("A1") <= 0.5, `A1 ${share("A1")}`);
    assert.ok(share("B1") >= 0.1 && share("B1") <= 0.3, `B1 ${share("B1")}`);
  }
});
