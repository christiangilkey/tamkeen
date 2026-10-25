// The German basics course's own checks (tools/course/de/words.json), beside course-content.test.mjs:
// every noun is shown with its article (der, die, das) and its plural in the meaning ("pl. Tage",
// "plural only", "no pl."), and no sentence is used twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const course = JSON.parse(readFileSync(new URL("../../tools/course/de/words.json", import.meta.url), "utf8"));

test("de: nouns come with their article and their plural", () => {
  for (const w of course.words.filter((w) => w.pos === "noun")) {
    assert.match(w.word, /^(der|die|das) \p{Lu}/u, `${w.n}: ${w.word} needs der, die or das and a capital`);
    assert.match(w.meaning, /\b(pl\.|plural)/, `${w.n}: ${w.word}'s meaning gives no plural`);
  }
});

test("de: no sentence twice", () => {
  const seen = new Map();
  for (const w of course.words) {
    assert.ok(!seen.has(w.sentence), `${w.n} repeats the sentence of ${seen.get(w.sentence)}: ${w.sentence}`);
    seen.set(w.sentence, w.n);
  }
});
