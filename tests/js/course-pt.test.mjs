// The Portuguese basics course's own checks, on top of course-content.test.mjs: each sentence has its word
// (or the form given) as a whole word, not inside another one ("ir" inside "dormir" doesn't count), and the
// meanings of verbs read "to ...", as a learner expects.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const course = JSON.parse(readFileSync(new URL("../../tools/course/pt/words.json", import.meta.url), "utf8"));
const fold = (s) => String(s).normalize("NFC").toLocaleLowerCase("pt");
const words = (s) => fold(s).split(/[^\p{L}\p{M}-]+/u).filter(Boolean).flatMap((w) => [w, ...w.split("-")]);

test("pt: each sentence has its word as a whole word", () => {
  for (const w of course.words) {
    const forms = [w.word, ...[].concat(w.form || [])].map(fold);
    const have = new Set(words(w.sentence));
    const ok = forms.some((f) => (f.includes(" ") ? fold(w.sentence).includes(f) : have.has(f)));
    assert.ok(ok, `${w.n} ${w.word}: “${w.sentence}” doesn't have ${forms.join(" / ")} as a word`);
  }
});

test("pt: verbs are given as infinitives with a 'to ...' meaning", () => {
  for (const w of course.words.filter((x) => x.pos === "verb")) {
    assert.match(w.word, /(ar|er|ir|or|ôr)$/u, `${w.n}: ${w.word} isn't an infinitive`);
    assert.match(w.meaning, /(^|; )(to |can|should|must|there is)/u, `${w.n}: ${w.word} means “${w.meaning}”`);
  }
});
