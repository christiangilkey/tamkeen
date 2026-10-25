// The two Bisaya grammar courses (tools/grammar/en-ceb and tools/grammar/ceb-en): a few checks of their own,
// on top of tests/js/grammar.test.mjs (which runs checkCourse and the published copy for every course).
// The Bisaya is written the way the Basics course writes it (tools/course/ceb/words.json), so a later edit
// shouldn't bring in another spelling; and the right and wrong sentences of a mistake are the language
// taught only, with any explanation in its "why".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { explanationTexts, taughtTexts } from "../../web/js/grammardata.js";

const read = (pair) => JSON.parse(readFileSync(new URL(`../../tools/grammar/${pair}/lessons.json`, import.meta.url), "utf8"));
const enCeb = read("en-ceb");
const cebEn = read("ceb-en");

// Spellings seen in Cebu writing that the Basics course writes another way (the value).
const BASICS_SPELLING = { jud: "gyud", kaau: "kaayo", nimu: "nimo", naku: "nako", kanimu: "kanimo", kanaku: "kanako" };

const words = (text) => String(text).replace(/\{\{[^}]*\}\}/g, " ").toLowerCase().split(/[^a-zñ'-]+/).filter(Boolean);

/** Every piece of Bisaya in a course: what it teaches (en-ceb) or how it explains (ceb-en). */
function bisaya(course) {
  const out = [];
  for (const l of course.lessons) {
    const texts = course.to === "ceb" ? taughtTexts(l) : explanationTexts(l).map((t) => t.text);
    for (const t of texts) out.push({ id: l.id, text: t });
  }
  return out;
}

test("the Bisaya in both grammar courses uses the Basics course's spellings", () => {
  for (const course of [enCeb, cebEn]) {
    for (const { id, text } of bisaya(course)) {
      for (const w of words(text)) {
        assert.ok(!(w in BASICS_SPELLING), `${course.from}-${course.to} ${id}: “${w}” in “${text}” (the Basics course writes “${BASICS_SPELLING[w]}”)`);
      }
    }
  }
});

test("a mistake's right and wrong sentences are only the language taught (no notes in brackets)", () => {
  for (const course of [enCeb, cebEn]) {
    for (const l of course.lessons) {
      for (const m of l.mistakes) {
        for (const s of [m.wrong, m.right]) assert.ok(!/[()]/.test(s), `${course.from}-${course.to} ${l.id}: “${s}”`);
      }
    }
  }
});

test("every lesson has a scene: a dialogue to read, or one to take part in", () => {
  for (const course of [enCeb, cebEn]) {
    for (const l of course.lessons) {
      const scene = l.blocks.some((b) => b.dialog) || l.practice.some((q) => q.type === "dialogue");
      assert.ok(scene, `${course.from}-${course.to} ${l.id}`);
    }
  }
});

test("both courses are the planned size and the levels rise A1, A2, B1 in about 40/40/20", () => {
  for (const course of [enCeb, cebEn]) {
    const n = course.lessons.length;
    assert.ok(n >= 40 && n <= 55, `${course.from}-${course.to}: ${n} lessons`);
    const share = (level) => course.lessons.filter((l) => l.level === level).length / n;
    assert.ok(share("A1") >= 0.35 && share("A1") <= 0.45, `${course.from}-${course.to}: A1 ${share("A1")}`);
    assert.ok(share("A2") >= 0.35 && share("A2") <= 0.45, `${course.from}-${course.to}: A2 ${share("A2")}`);
    assert.ok(share("B1") >= 0.15 && share("B1") <= 0.25, `${course.from}-${course.to}: B1 ${share("B1")}`);
  }
});
