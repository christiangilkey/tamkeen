// The grammar courses (tools/grammar/README.md): the pure part the app uses (web/js/grammardata.js), and
// every course written so far (tools/grammar/<from>-<to>/lessons.json): it passes the checks, and the
// published copy in docs/grammar is up to date with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GRAMMAR_BASE, checkCourse, cleanProgress, costCents, courseFor, explanationTexts, finished, grammarUrl, groups,
  checkPrompt, keepsMarks, lessonVersion, listTexts, makeLesson, markProblem, reviewQuestions, mergeProgress, orderIsRight, parseRich, plainText, progressOf,
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

test("making a lesson: a text that broke its Arabic is asked for again once, then kept in the original", async () => {
  const asked = [];
  let round = 0;
  const ask = async (prompt) => {
    const items = JSON.parse(prompt.user.slice(prompt.user.indexOf("[")));
    asked.push(items.length);
    round++;
    // The first answer breaks every text with a {{ }} piece; the retry fixes all but the summary-free title.
    return { texts: items.map((it) => (round === 1 && /\{\{/.test(it.text) ? it.text.replace(/\{\{[^}]*\}\}/g, "{{X}}")
      : round === 2 && it.text.startsWith("Nouns") ? "ZH broken {{Y}}" : `ZH ${it.text}`)) };
  };
  const { lesson, kept } = await makeLesson(LESSON, { names: { from: "English", into: "Chinese", taught: "Arabic" }, ask });
  assert.equal(asked[0], explanationTexts(LESSON).length, "one request for a short lesson");
  assert.equal(asked[1], explanationTexts(LESSON).filter((t) => /\{\{/.test(t.text)).length, "then only the broken ones");
  assert.equal(lesson.blocks[0].p, "ZH The word {{الْبَيْتُ|al-baytu}} is **the house**.", "fixed by the retry");
  assert.equal(lesson.title, LESSON.title, "still broken after the retry: kept in English");
  assert.deepEqual(kept, [0]);
  assert.equal(lesson.summary, "ZH Say “the house”.");
  await assert.rejects(makeLesson(LESSON, { names: {}, ask: async () => { throw new Error("NO_KEY"); } }), /NO_KEY/);
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

test("the new kinds of practice keep their languages apart: fill and dialogue options are the language taught", () => {
  const lesson = {
    title: "Say what you want", summary: "S", topic: "{{أُرِيدُ}} and {{أَنْ}}",
    blocks: [{ goal: { t: "أُرِيدُ قَهْوَةً.", r: "urīdu qahwatan.", tr: "I want a coffee." } },
      { dialog: [{ who: "Waiter", t: "مَاذَا تُرِيدُ؟", r: "x", tr: "What would you like?" }] }],
    practice: [
      { type: "fill", q: "Choose the missing word.", t: "أُرِيدُ ___ أَذْهَبَ.", tr: "I want to go.", options: ["أَنْ", "أَنَا"], answer: 0, why: "Why." },
      { type: "dialogue", q: "Reply.", lines: [{ who: "Waiter", t: "بِسُكَّرٍ؟", tr: "With sugar?" }, { options: ["لَا، شُكْرًا."], answer: 0, why: "No thanks." }] },
      { type: "free", q: "Your turn.", answers: [{ t: "أُرِيدُ شَايًا.", r: "x", tr: "I want tea." }] },
    ],
  };
  const texts = explanationTexts(lesson).map((t) => t.text);
  for (const t of ["I want a coffee.", "Waiter", "What would you like?", "I want to go.", "With sugar?", "No thanks.", "I want tea.", "Your turn."]) assert.ok(texts.includes(t), t);
  for (const t of ["أَنْ", "أَنَا", "لَا، شُكْرًا."]) assert.ok(!texts.includes(t), `${t} is never sent to be translated`);
  const taught = taughtTexts(lesson);
  for (const t of ["أُرِيدُ قَهْوَةً.", "مَاذَا تُرِيدُ؟", "أَنْ", "أُرِيدُ  أَذْهَبَ.", "لَا، شُكْرًا.", "بِسُكَّرٍ؟", "أُرِيدُ شَايًا."]) assert.ok(taught.includes(t), t);
});

test("the choices a learner taps can carry readings: one for each, never sent to be translated", () => {
  const course = JSON.parse(readFileSync(new URL("../../tools/grammar/en-ar/lessons.json", import.meta.url), "utf8"));
  const lesson = course.lessons.find((l) => l.practice.some((q) => q.type === "fill") && l.practice.some((q) => q.type === "order") && l.practice.some((q) => q.type === "dialogue"));
  const fill = lesson.practice.find((q) => q.type === "fill");
  const order = lesson.practice.find((q) => q.type === "order");
  const reply = lesson.practice.find((q) => q.type === "dialogue").lines.find((x) => x.options);
  fill.r = "reading ___ here"; fill.rs = fill.options.map((_, k) => `opt${k}`);
  order.rs = order.words.map((_, k) => `word${k}`);
  reply.rs = reply.options.map((_, k) => `reply${k}`);
  assert.deepEqual(checkCourse(course), []);
  const texts = explanationTexts(lesson).map((t) => t.text).join("\n");
  assert.doesNotMatch(texts, /opt0|word0|reply0|reading ___/);

  fill.r = "no gap"; fill.rs = ["one"]; order.rs = [...order.rs, "extra"]; reply.rs = reply.options.map(() => "");
  const problems = checkCourse(course).join("\n");
  assert.match(problems, /the sentence's reading \(r\) must have exactly one gap/);
  assert.match(problems, /the options: rs must give one reading for each/);
  assert.match(problems, /the words: rs must give one reading for each/);
  assert.match(problems, /a reply's options: rs must give one reading for each/);
});

test("the mixed review brings back done lessons, the oldest and weakest most, never one lesson twice in a row", () => {
  const q = (n) => ({ type: "choice", q: `q${n}`, options: ["a", "b"], answer: 0, why: "w" });
  const course = { lessons: ["one", "two", "three"].map((id) => ({ id, practice: [q(1), q(2), q(3), { type: "free", q: "mine", answers: [] }] })) };
  const now = 100 * 86400000;
  const progress = { "en-ar/one": { at: now / 1000 - 20 * 86400, right: 1, of: 4 }, "en-ar/two": { at: now / 1000 - 3600, right: 4, of: 4 } };
  const picks = reviewQuestions(course, "en-ar", progress, { now, count: 6 });
  assert.equal(picks.length, 6);
  assert.ok(picks.every((p) => p.lesson !== "three"), "only lessons done");
  assert.ok(picks.every((p) => p.q.type !== "free"), "no “your turn” questions");
  assert.ok(picks.filter((p) => p.lesson === "one").length >= picks.filter((p) => p.lesson === "two").length, "the old, weak one more");
  for (let i = 1; i < picks.length; i++) if (picks[i].lesson === picks[i - 1].lesson) assert.ok(picks.slice(i).every((p) => p.lesson === picks[i].lesson), "repeats only when one lesson is left");
  assert.deepEqual(reviewQuestions(course, "en-ar", progress, { now, count: 6 }), picks, "the same all day");
  assert.deepEqual(reviewQuestions(course, "en-ar", {}, { now }), []);
});

test("the AI's look at a “your turn” sentence names the grammar, the models and the learner's answer", () => {
  const p = checkPrompt({ explain: "Spanish", taught: "Arabic" }, { topic: "{{أَنْ}} + -a", question: "Your turn: {{أُرِيدُ أَنْ…}}", models: ["أُرِيدُ أَنْ أَنَامَ."], answer: "أريد أن أنام" });
  assert.match(p.system, /Arabic teacher/);
  assert.match(p.system, /explain in Spanish/);
  assert.match(p.user, /أريد أن أنام/);
  assert.deepEqual(p.schema.required, ["ok", "corrected", "note"]);
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
