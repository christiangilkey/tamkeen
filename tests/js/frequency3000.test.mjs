// Frequency words 1001-3000 (the owner, 2026-11-27: "it should include all 3,000 of the most common words … which are
// going to connect to the glyph"): words written before their audio, said by the app's own voice meanwhile; the count
// the Wellspring Glyph and each Arabic dialect's mini glyph read (coursedata.js courseCount).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { courseCount, progress } from "../../web/js/coursedata.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the Glyph's count matches the course's own: a word counts when any card has it, known by the game's rule", () => {
  const course = { lang: "ar", words: [{ n: 1, word: "كِتَاب" }, { n: 2, word: "عَمَل" }, { n: 3, word: "بَيْت" }, { n: 4, word: "قَلَم" }] };
  const cards = [
    { uid: "a", text: "كتاب" },            // (without vowels: matches)
    { uid: "b", text: "عَمِلَ" },          // (vowelled, another word: the verb, not the noun عَمَل)
    { uid: "c", text: "بيت", deleted: 1 }, // (deleted: doesn't count)
    { uid: "d", text: "قَلَم" },
  ];
  const known = new Set(["d"]);
  const n = courseCount(course, cards, (v) => known.has(v.uid));
  assert.deepEqual(n, { total: 4, inCards: 2, known: 1 });
  assert.equal(n.inCards, progress(course, cards).have.size, "the same words as Basics' own progress");
  assert.deepEqual(courseCount(null, cards), { total: 0, inCards: 0, known: 0 });
  assert.deepEqual(courseCount({ lang: "es", words: [{ n: 1, word: "casa" }] }, [{ text: "Casa" }]), { total: 1, inCards: 1, known: 0 });
});

test("a dialect course is counted on its own (its mini glyph), never into the Standard Arabic 3,000", () => {
  const msa = { lang: "ar", words: [{ n: 1, word: "كِتَاب" }] };
  const lev = { id: "ar-lev", lang: "ar", dialect: "lev", words: [{ n: 1, word: "هَلَّق" }, { n: 2, word: "شُو" }] };
  const cards = [{ text: "هلق" }, { text: "كتاب" }];
  assert.deepEqual(courseCount(msa, cards), { total: 1, inCards: 1, known: 0 });
  assert.deepEqual(courseCount(lev, cards), { total: 2, inCards: 1, known: 0 });
});

test("words can be written before their audio: the build keeps them as text, the app's voice says them", () => {
  const build = read("tools/course/build_course.py");
  assert.match(build, /ap\.add_argument\("--no-new-audio", action="store_true"/);
  assert.match(build, /if ogg is None and args\.no_new_audio:\s*\n\s*items\.append\(item\)/);
  const panel = read("web/js/components/coursepanel.js");
  assert.match(panel, /const sayable = \(w, course\) => hasAudio\(w\) \|\| !!\(course && course\.voice\);/, "a voiced course: buttons for every word");
  assert.match(panel, /if \(!hasAudio\(w\)\) \{ \/\/ \(no audio made yet: the app's own voice\)/);
  assert.match(panel, /await sayText\(text, lang, \{ dialect \}\);/);
});
