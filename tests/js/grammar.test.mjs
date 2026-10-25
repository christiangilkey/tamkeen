// The grammar courses (tools/grammar/README.md): the pure part the app uses (web/js/grammardata.js), and
// every course written so far (tools/grammar/<from>-<to>/lessons.json): it passes the checks, and the
// published copy in docs/grammar is up to date with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GRAMMAR_BASE, checkCourse, cleanProgress, costCents, courseFor, explanationTexts, finished, grammarUrl, groups,
  keepsMarks, lessonVersion, listTexts, markProblem, mergeProgress, orderIsRight, parseRich, plainText, progressOf,
  richHtml, shuffled, taughtTexts, targetsOf, translationPrompt, unvowelled, withListTexts, withTexts,
} from "../../web/js/grammardata.js";
import { LANGUAGE_CODES } from "../../web/js/languages.js";
import { PUBLISHED, buildCourse, readIndex, sources } from "../../tools/grammar/build.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

test("grammar files come from the computer's own server, the web app's site, or the published website", () => {
  assert.equal(grammarUrl("en-ar/course.json", { platform: "desktop" }), "/api/grammar/en-ar/course.json");
  assert.equal(grammarUrl("index.json", { platform: "web", host: "christiangilkey.github.io" }), "/tamkeen/grammar/index.json");
  assert.equal(grammarUrl("index.json", { platform: "android", host: "localhost" }), `${GRAMMAR_BASE}index.json`);
});

test("the learner gets the ready-made course for their pair, else the English one made in their language", () => {
  const index = { courses: { "en-ar": {}, "ar-en": {}, "zh-en": {}, "en-ja": {} } };
  assert.deepEqual(courseFor("en", "ar", index), { course: "en-ar", made: null }, "an English speaker learning Arabic");
  assert.deepEqual(courseFor("ar", "en", index), { course: "ar-en", made: null }, "an Arabic speaker learning English");
  assert.deepEqual(courseFor("zh", "ar", index), { course: "en-ar", made: "zh" }, "a Chinese speaker learning Arabic: made in Chinese");
  assert.deepEqual(courseFor("ar", "ar", index), { course: "en-ar", made: null }, "studying the app's own language: the English course as it is");
  assert.equal(courseFor("fr", "en", index), null, "no French-explained English course yet");
  assert.equal(courseFor("en", "en", index), null);
  assert.equal(courseFor("zh", "ko", index), null, "nothing to make it from");
  assert.equal(courseFor("en", "ar", null), null);
});

test("explanation text: **bold** and {{pieces of the language taught|with a reading}}", () => {
  assert.deepEqual(parseRich("A **big** {{بَيْتٌ|baytun}}."), [
    { kind: "text", text: "A ", bold: false }, { kind: "text", text: "big", bold: true }, { kind: "text", text: " ", bold: false },
    { kind: "target", text: "بَيْتٌ", reading: "baytun", bold: false }, { kind: "text", text: ".", bold: false }]);
  assert.deepEqual(targetsOf("{{a}} and {{b|x}}"), ["a", "b|x"]);
  assert.equal(plainText("say {{هُوَ|huwa}} **now**"), "say هُوَ now");
  assert.equal(richHtml("**<b>** {{هُوَ|huwa}}", esc, (t, r) => `[${t}/${r}]`), "<b>&lt;b&gt;</b> [هُوَ/huwa]");
  assert.equal(parseRich("one ** alone").map((p) => p.text).join(""), "one ** alone", "an unpaired ** stays as it is");
  assert.equal(markProblem("fine **text** {{هُوَ}}"), "");
  assert.match(markProblem("bad **text"), /\*\*/);
  assert.match(markProblem("bad {{هُوَ"), /\{\{/);
  assert.match(markProblem("bad <b>html</b>"), /HTML/);
});

const LESSON = {
  id: "demo", unit: 1, level: "A1", title: "Nouns and {{الْـ}}", summary: "Say “the house”.",
  blocks: [
    { p: "The word {{الْبَيْتُ|al-baytu}} is **the house**." },
    { term: "noun", means: "a word for a thing" },
    { ex: [{ t: "الْبَيْتُ كَبِيرٌ.", r: "al-baytu kabīrun.", tr: "The house is big." }] },
    { table: [["", "the"], ["house", "{{الْبَيْتُ}}"]] },
  ],
  mistakes: [{ wrong: "الْبَيْتٌ", right: "الْبَيْتُ", why: "No -un with {{الْـ}}." }],
  practice: [
    { type: "choice", q: "Which is “the house”?", options: ["{{الْبَيْتُ}}", "{{بَيْتٌ}}"], answer: 0, why: "It has {{الْـ}}." },
    { type: "order", q: "Put the words in order.", tr: "The house is big.", words: ["الْبَيْتُ", "كَبِيرٌ."] },
  ],
};

test("a lesson's texts are split by language: only the explanation language is ever sent to be translated", () => {
  const texts = explanationTexts(LESSON);
  assert.deepEqual(texts.map((t) => t.text), ["Nouns and {{الْـ}}", "Say “the house”.", "The word {{الْبَيْتُ|al-baytu}} is **the house**.",
    "noun", "a word for a thing", "The house is big.", "the", "house", "No -un with {{الْـ}}.", "Which is “the house”?", "It has {{الْـ}}.",
    "Put the words in order.", "The house is big."],
    "the {{ }}-only cells and options, the examples and the right and wrong sentences are left out");
  assert.ok(taughtTexts(LESSON).includes("الْبَيْتُ كَبِيرٌ.") && taughtTexts(LESSON).includes("بَيْتٌ"));
});

test("a translation keeps every {{ }} piece unchanged, or that text stays in the original", () => {
  assert.ok(keepsMarks("The word {{الْبَيْتُ|al-baytu}} is **here**.", "La palabra {{الْبَيْتُ|al-baytu}} está **aquí**."));
  assert.ok(!keepsMarks("The word {{الْبَيْتُ|al-baytu}}.", "La palabra {{البيت|al-baytu}}."), "the Arabic was changed");
  assert.ok(!keepsMarks("The word {{الْبَيْتُ}}.", "La palabra."), "a piece was lost");
  assert.ok(!keepsMarks("**Bold** word", "**Negrita palabra"), "an unpaired **");
  const texts = explanationTexts(LESSON).map((t) => `ES ${t.text}`);
  texts[2] = "ES The word {{البيت}} is the house."; // broke its Arabic: kept in English
  const { lesson, kept } = withTexts(LESSON, texts);
  assert.deepEqual(kept, [2]);
  assert.equal(lesson.title, "ES Nouns and {{الْـ}}");
  assert.equal(lesson.blocks[0].p, LESSON.blocks[0].p);
  assert.equal(lesson.blocks[2].ex[0].t, "الْبَيْتُ كَبِيرٌ.", "the example itself never changes");
  assert.equal(lesson.blocks[2].ex[0].tr, "ES The house is big.");
  assert.equal(lesson.blocks[3].table[1][1], "{{الْبَيْتُ}}");
  assert.equal(lesson.practice[1].tr, "ES The house is big.");
  assert.deepEqual(lesson.practice[1].words, LESSON.practice[1].words);
  assert.equal(LESSON.title, "Nouns and {{الْـ}}", "the original lesson is untouched");
});

test("the translation request names the languages, says to copy {{ }} exactly, and asks for one text per text", () => {
  const items = explanationTexts(LESSON);
  const p = translationPrompt({ from: "English", into: "Chinese", taught: "Arabic" }, items, { lesson: LESSON.title });
  assert.match(p.system, /from English into Chinese/);
  assert.match(p.system, /\{\{ \}\} exactly/);
  assert.match(p.system, /compare with Chinese instead/);
  assert.equal(JSON.parse(p.user.slice(p.user.indexOf("["))).length, items.length);
  assert.deepEqual(p.schema.required, ["texts"]);
  assert.ok(p.maxTokens >= 8000);
  const parts = groups(items.map((t) => ({ ...t, text: t.text.repeat(30) })), 1500);
  assert.ok(parts.length > 1 && parts.flat().length === items.length, "long lessons go in several requests, nothing lost");
});

test("the course list can be translated on its own, for one cheap request", () => {
  const course = { title: "Arabic grammar", about: "About it.", units: [{ n: 1, title: "First steps" }], lessons: [LESSON] };
  const texts = listTexts(course);
  assert.deepEqual(texts.map((t) => t.kind), ["course title", "course description", "unit name", "lesson title", "lesson summary"]);
  const out = withListTexts(course, texts.map((t) => `FR ${t.text}`));
  assert.equal(out.units[0].title, "FR First steps");
  assert.equal(out.lessons[0].title, "FR Nouns and {{الْـ}}");
  assert.equal(out.lessons[0].blocks, undefined, "only the list, not the lessons");
});

test("the cost of making a course is a few cents with a cheap model", () => {
  const course = { lessons: Array.from({ length: 50 }, () => LESSON) };
  const cents = costCents(course, { in: 10, out: 50 }, "zh");
  assert.ok(cents > 0 && cents < 5, `${cents}`);
  assert.equal(costCents(course, null), null);
});

test("progress: one record per lesson, the latest finish winning on every device", () => {
  assert.deepEqual(cleanProgress('{"en-ar/nouns-the":{"at":100,"right":9,"of":4},"bad key":{"at":1},"en-ar/x":{"at":0}}'),
    { "en-ar/nouns-the": { at: 100, right: 4, of: 4 } }, "right can't be more than of; junk is dropped");
  assert.deepEqual(cleanProgress("not json"), {});
  const a = { "en-ar/one": { at: 100, right: 3, of: 4 }, "en-ar/two": { at: 50, right: 1, of: 4 } };
  const b = { "en-ar/two": { at: 60, right: 4, of: 4 }, "en-ar/three": { at: 10, right: 2, of: 3 } };
  assert.deepEqual(mergeProgress(a, b), { "en-ar/one": a["en-ar/one"], "en-ar/three": b["en-ar/three"], "en-ar/two": b["en-ar/two"] });
  assert.deepEqual(mergeProgress(a, b), mergeProgress(b, a), "both devices end up the same");
  assert.deepEqual(finished({}, "en-ar/one", 2, 4, 5000_000), { "en-ar/one": { at: 5000, right: 2, of: 4 } });
  const course = { units: [{ n: 1, title: "U1" }], lessons: [{ id: "one", unit: 1 }, { id: "two", unit: 1 }] };
  const p = progressOf(course, "en-ar", a);
  assert.deepEqual([...p.done], ["one", "two"]);
  assert.equal(p.next, null);
  assert.equal(progressOf(course, "en-ar", {}).next.id, "one");
  assert.equal(progressOf(course, "en-ar", {}).units[0].done, 0);
});

test("order questions: shuffled the same way every time, never already right, with other right orders accepted", () => {
  const q = { words: ["يَذْهَبُ", "الطُّلَّابُ", "إِلَى", "الْمَدْرَسَةِ"], also: [["الطُّلَّابُ", "يَذْهَبُونَ", "إِلَى", "الْمَدْرَسَةِ"]] };
  const s = shuffled(q);
  assert.deepEqual(s, shuffled(q));
  assert.ok(!orderIsRight(q, s.map((x) => x.word)));
  assert.ok(orderIsRight(q, q.words));
  assert.ok(orderIsRight({ words: ["a", "b"], also: [["b", "a"]] }, ["b", "a"]));
});

test("a lesson's version changes with its content, and only with it", () => {
  assert.equal(lessonVersion(LESSON), lessonVersion(JSON.parse(JSON.stringify(LESSON))));
  assert.equal(lessonVersion({ ...LESSON, v: "old" }), lessonVersion(LESSON));
  assert.notEqual(lessonVersion({ ...LESSON, title: "Other" }), lessonVersion(LESSON));
});

test("the checks find Arabic without vowel marks", () => {
  assert.deepEqual(unvowelled("الْبَيْتُ كبير."), ["كبير"]);
  assert.deepEqual(unvowelled("هَلْ أَنْتَ مَشْغُولٌ؟ لا، و ك ت ب"), []);
  const course = { from: "en", to: "ar", title: "T", about: "A", reading: "x", units: [{ n: 1, title: "U" }],
    lessons: [{ ...LESSON, blocks: [...LESSON.blocks, { ex: [{ t: "البيت كبير.", r: "x", tr: "y" }, { t: "هُوَ هُنَا.", r: "x", tr: "y" }] }] }] };
  const problems = checkCourse(course);
  assert.ok(problems.some((p) => /without vowel marks: البيت كبير/.test(p)), problems.join("\n"));
});

test("the checks find a broken lesson", () => {
  const course = { from: "en", to: "ar", title: "T", about: "A", units: [{ n: 1, title: "U" }],
    lessons: [{ ...LESSON, practice: [{ type: "choice", q: "?", options: ["{{a}}"], answer: 3 }] }, { ...LESSON }] };
  const problems = checkCourse(course).join("\n");
  assert.match(problems, /1 options/);
  assert.match(problems, /the answer isn't one of the options/);
  assert.match(problems, /no why/);
  assert.match(problems, /1 practice questions/);
  assert.match(problems, /the same id as another lesson/);
  assert.match(problems, /the term “noun” was already explained in demo/);
  assert.match(problems, /only 1 examples/);
});

// ----- every course written so far -----

for (const id of sources()) {
  test(`the ${id} course passes every check and its published copy is up to date`, () => {
    const { problems, text, entry } = buildCourse(id);
    assert.deepEqual(problems, [], problems.join("\n"));
    // (git may have checked it out with Windows line endings)
    const published = readFileSync(`${PUBLISHED}/${id}/course.json`, "utf8").replace(/\r\n/g, "\n");
    assert.equal(published, text, `run node tools/grammar/build.mjs ${id}`);
    assert.deepEqual(readIndex().courses[id], entry, `docs/grammar/index.json is out of date: run node tools/grammar/build.mjs ${id}`);
    const course = JSON.parse(text);
    assert.ok(LANGUAGE_CODES.includes(course.from) && LANGUAGE_CODES.includes(course.to));
  });
}
