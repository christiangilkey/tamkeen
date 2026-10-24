// Every basics course other than Arabic (which has its own, stricter checks in course.test.mjs):
// tools/course/<lang>/words.json numbered in order with no word twice, each sentence short, ending like a
// sentence and using its word, each translation marking the word's part once. A language can add its own
// checks in tests/js/course-<lang>.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const DIR = new URL("../../tools/course/", import.meta.url);
const langs = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "ar" && existsSync(new URL(`${d.name}/words.json`, DIR)))
  .map((d) => d.name);

// Written without spaces between words: their length is counted in characters instead.
const UNSPACED = new Set(["zh", "ja", "th"]);
// Thai writes no full stop at the end of a sentence.
const NO_STOP = new Set(["th"]);
const fold = (s) => String(s).normalize("NFC").toLocaleLowerCase();

for (const lang of langs) {
  const course = JSON.parse(readFileSync(new URL(`${lang}/words.json`, DIR), "utf8"));

  test(`${lang}: numbered in order, with no word twice and nothing missing`, () => {
    assert.equal(course.lang, lang);
    assert.ok(String(course.title || "").trim(), "the course has a title");
    const seen = new Map();
    course.words.forEach((w, i) => {
      assert.equal(w.n, i + 1, `word ${i + 1} is numbered ${w.n}`);
      for (const k of ["word", "meaning", "sentence", "translation", "pos"]) assert.ok(String(w[k] || "").trim(), `${w.n} has no ${k}`);
      const key = `${fold(w.word)}|${w.pos}`;
      assert.ok(!seen.has(key), `${w.word} (${w.pos}) is both word ${seen.get(key)} and word ${w.n}`);
      seen.set(key, w.n);
      assert.ok(w.rank >= w.n, `${w.n}: its frequency rank (${w.rank}) can't be before its place in the course`);
    });
    for (let i = 1; i < course.words.length; i++) {
      assert.ok(course.words[i].rank > course.words[i - 1].rank, `ranks rise at word ${course.words[i].n}`);
    }
  });

  test(`${lang}: each translation marks the word's part exactly once`, () => {
    for (const w of course.words) assert.match(w.translation, /^[^⟦⟧]*⟦[^⟦⟧]+⟧[^⟦⟧]*$/, `${w.n}: ${w.translation}`);
  });

  test(`${lang}: each sentence is short and ends like a sentence`, () => {
    for (const w of course.words) {
      const s = w.sentence.trim();
      assert.equal(s, w.sentence, `${w.n}: no spaces round the sentence`);
      if (UNSPACED.has(lang)) {
        const chars = [...s.replace(/[\s\p{P}]/gu, "")].length;
        assert.ok(chars >= 2 && chars <= 30, `${w.n}: ${chars} characters`);
      } else {
        const tokens = s.split(/\s+/);
        assert.ok(tokens.length >= 2 && tokens.length <= 12, `${w.n}: ${tokens.length} words`);
      }
      if (!NO_STOP.has(lang)) assert.match(s, /[.!?。！？।؟…]["”»」』)]?$/u, `${w.n} ends like a sentence`);
    }
  });

  // The word as the sentence has it ("went" for "go", "fue" for "ir"): `form`, when it isn't written the same.
  test(`${lang}: each sentence uses its word`, () => {
    for (const w of course.words) {
      const forms = [w.word, ...[].concat(w.form || [])].map(fold);
      const sentence = fold(w.sentence);
      assert.ok(forms.some((f) => sentence.includes(f)), `${w.n}: “${w.sentence}” doesn't contain ${forms.join(" / ")} (add its form)`);
    }
  });
}

test("the course languages are ones the build knows a voice for", () => {
  const build = readFileSync(new URL("build_course.py", DIR), "utf8");
  for (const lang of langs) assert.ok(new RegExp(`"${lang}": \\{"voice"|"${lang}": "`).test(build), `${lang} has no voice in build_course.py`);
});
