// The Arabic dialect courses (Levantine, Egyptian, Gulf, Moroccan): they build on Standard Arabic, so
//   - no basics word of a dialect (docs/course/ar-<d>/course.json) is a word of the MSA list (the MSA basics
//     course and web/js/wordlists/ar.js), compared as the app's search compares words (tools/course/dialect/overlap.mjs);
//   - each published dialect course says what it is ("id": "ar-lev", "lang": "ar", "dialect": "lev"), as does
//     its grammar course ("to": "ar", "dialect": "lev", id "en-ar-lev");
//   - the Library's picker offers MSA and only the dialects with a course (web/js/coursedata.js), each
//     opening its own Grammar and Basics courses (grammardata.js courseFor).
// A dialect not made yet is simply skipped. Each dialect may add its own checks in tests/js/course-ar-<d>.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DIALECT_COURSES, msaWords, overlaps, searchKey, spellings, courseId } from "../../tools/course/dialect/overlap.mjs";
import { ARABIC_VARIETIES, basicsId, cardOf, courseIdOf, varietiesOffered, varietyChoice } from "../../web/js/coursedata.js";
import { checkCourse, cleanProgress, courseFor, courseIdOf as grammarIdOf, DIALECTS } from "../../web/js/grammardata.js";

const at = (p) => new URL(`../../${p}`, import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(at(p), "utf8"));

// ---------------------------------------------------------------- the no-overlap rule

test("words are compared as the app's search compares them", () => {
  assert.equal(searchKey("مِشْ"), searchKey("مش"));
  assert.equal(searchKey("شي"), searchKey("شئ"));
  assert.equal(searchKey("إيه"), searchKey("أية"));
  assert.equal(searchKey("⟦هَلَّق⟧"), "هلق");
  assert.deepEqual(spellings("هلّق / هلّأ"), ["هلق", "هلا"]);
  assert.deepEqual(spellings("ما في"), ["ما في"], "a phrase stays whole");
});

test("the check finds a dialect word that is an MSA word, from either list", () => {
  const msa = msaWords({ basics: [{ n: 1, word: "فِي" }, { n: 2, word: "شَيْء" }], common: ["مش", "اللي"] });
  const found = overlaps([{ n: 1, word: "فِيه" }, { n: 2, word: "مِش" }, { n: 3, word: "هون" }, { n: 4, word: "اللّي" }, { n: 5, word: "شو / في" }], msa);
  assert.deepEqual(found.map((f) => f.n), [2, 4, 5]);
  assert.match(found[0].msa[0], /common word 1/);
  assert.match(found[2].msa[0], /MSA basics word 1/);
});

test("the real MSA list holds both the basics course and the common words", () => {
  const msa = msaWords();
  assert.ok(msa.size > 1500, `${msa.size} MSA words`);
  for (const w of ["في", "كتاب", "اللي", "مش"]) assert.ok(msa.has(searchKey(w)), w);
  assert.ok(!msa.has(searchKey("هلق")), "a Levantine word isn't MSA");
});

test("the check knows the four dialect courses", () => {
  assert.deepEqual(DIALECT_COURSES, DIALECTS.map((d) => `ar-${d}`));
  assert.equal(courseId("lev"), "ar-lev");
  assert.equal(courseId("ar-mor"), "ar-mor");
  assert.equal(courseId("ar"), "");
});

for (const id of DIALECT_COURSES) {
  const file = `docs/course/${id}/course.json`;
  const made = existsSync(at(file));

  test(`${id}: no basics word is an MSA word`, { skip: !made && "not made yet" }, () => {
    const found = overlaps(readJson(file).words);
    assert.deepEqual(found.map((f) => `${f.n} ${f.word} = ${f.msa.join("; ")}`), [],
      `take these out of tools/course/${id}/words.json (node tools/course/dialect/overlap.mjs ${id})`);
  });

  test(`${id}: the published course says what it is`, { skip: !made && "not made yet" }, () => {
    const course = readJson(file);
    const entry = readJson("docs/course/index.json").courses[id];
    assert.deepEqual([course.id, course.lang, course.dialect], [id, "ar", id.slice(3)]);
    assert.ok(entry, `${id} is in docs/course/index.json`);
    assert.deepEqual([entry.file, entry.lang, entry.dialect], [`${id}/course.json`, "ar", id.slice(3)]);
    assert.ok(course.planned >= course.words.length && course.planned <= 1000);
    for (const w of course.words) if ("note" in w) assert.ok(typeof w.note === "string" && w.note.trim() && w.note.length <= 300, `${w.n}: its note`);
    // Every word has its audio, or (a course no voice says well enough: build_course.py --voice none) none has.
    const voiced = course.words.filter((w) => w.audio && w.times);
    if (course.voice) {
      assert.equal(voiced.length, course.words.length, "every word has its audio");
      for (const w of course.words) assert.ok(existsSync(at(`docs/course/${id}/${w.audio}`)), `${w.n}: ${w.audio} is there`);
    } else {
      assert.equal(voiced.length, 0, "a course without a voice has no audio");
      assert.equal(entry.voice, null);
    }
  });

  const grammarFile = `docs/grammar/en-${id}/course.json`;
  test(`en-${id}: the published grammar course teaches Arabic and names its dialect`, { skip: !existsSync(at(grammarFile)) && "not made yet" }, () => {
    const course = readJson(grammarFile);
    assert.deepEqual([course.id, course.from, course.to, course.dialect], [`en-${id}`, "en", "ar", id.slice(3)]);
    assert.equal(readJson("docs/grammar/index.json").courses[`en-${id}`].dialect, id.slice(3));
  });
}

// ---------------------------------------------------------------- the formats

test("a dialect basics course is named by its id, and its words keep their notes on the card", () => {
  assert.equal(courseIdOf({ lang: "ar" }), "ar");
  assert.equal(courseIdOf({ id: "ar-lev", lang: "ar", dialect: "lev" }), "ar-lev");
  assert.equal(basicsId("ar", ""), "ar");
  assert.equal(basicsId("ar", "egy"), "ar-egy");
  const course = { id: "ar-lev", lang: "ar", title: "Levantine basics" };
  const card = cardOf({ n: 2, word: "هون", meaning: "here", sentence: "أنا ⟦هون⟧.", translation: "I am ⟦here⟧.", note: "Not MSA هَوْن (ease)." }, course, "f1");
  assert.equal(card.notes, "Not MSA هَوْن (ease).");
  assert.equal(card.source, "Levantine basics · word 2");
  assert.equal(cardOf({ n: 1, word: "شو", meaning: "what", sentence: "⟦شو⟧؟", translation: "⟦What⟧?" }, course).notes, "");
});

test("a dialect grammar course teaches Arabic, names a known dialect, and its id says so", () => {
  assert.equal(grammarIdOf({ from: "en", to: "ar" }), "en-ar");
  assert.equal(grammarIdOf({ from: "en", to: "ar", dialect: "lev" }), "en-ar-lev");
  const problems = (c) => checkCourse(c).filter((p) => p.startsWith("course: dialect"));
  assert.deepEqual(problems({ from: "en", to: "ar", dialect: "lev" }), []);
  assert.equal(problems({ from: "en", to: "ar", dialect: "levantine" }).length, 1);
  assert.equal(problems({ from: "en", to: "fr", dialect: "lev" }).length, 1, "only Arabic has these dialects");
});

test("progress in a dialect's grammar lessons is kept like any other", () => {
  assert.deepEqual(cleanProgress({ "en-ar-lev/future-rah": { at: 5, right: 3, of: 4 }, "en-ar-levant/x": { at: 5 } }),
    { "en-ar-lev/future-rah": { at: 5, right: 3, of: 4 } });
});

// ---------------------------------------------------------------- the picker

const courses = (...ids) => ({ courses: Object.fromEntries(ids.map((id) => [id, { file: `${id}/course.json` }])) });

test("the picker shows only when learning Arabic and a dialect has a course; MSA always first", () => {
  assert.deepEqual(ARABIC_VARIETIES.map((v) => v.id), ["", ...DIALECTS]);
  assert.deepEqual(varietiesOffered("ar", courses("ar"), courses("en-ar")), [], "no dialect yet: no picker");
  assert.deepEqual(varietiesOffered("es", courses("es", "ar-lev"), null), [], "not learning Arabic");
  assert.deepEqual(varietiesOffered("ar", courses("ar", "ar-egy"), courses("en-ar", "en-ar-mor")).map((v) => v.id), ["", "egy", "mor"],
    "a dialect with basics or grammar is offered; the others are hidden");
  assert.deepEqual(varietiesOffered("ar", null, null), []);
  assert.equal(varietiesOffered("ar", courses("ar-lev"), null)[0].name, "Standard Arabic (MSA)");
});

test("the kind chosen before is kept while it is offered; otherwise Standard Arabic", () => {
  const offered = varietiesOffered("ar", courses("ar", "ar-lev"), null);
  assert.equal(varietyChoice(offered, "lev"), "lev");
  assert.equal(varietyChoice(offered, "egy"), "", "Egyptian has no course here");
  assert.equal(varietyChoice(offered, null), "");
  assert.equal(varietyChoice([], "lev"), "");
});

test("each dialect opens its own grammar course, in the learner's language when there is one", () => {
  const index = courses("en-ar", "en-ar-lev", "fr-ar-egy");
  assert.deepEqual(courseFor("en", "ar", index, "lev"), { course: "en-ar-lev", made: null });
  assert.deepEqual(courseFor("es", "ar", index, "lev"), { course: "en-ar-lev", made: "es" });
  assert.deepEqual(courseFor("fr", "ar", index, "egy"), { course: "fr-ar-egy", made: null });
  assert.equal(courseFor("en", "ar", index, "glf"), null, "no Gulf grammar course yet");
  assert.deepEqual(courseFor("en", "ar", index), { course: "en-ar", made: null }, "Standard Arabic as before");
});

test("a basics course without audio shows no Word / Sentence buttons and saves no voice", () => {
  const panel = readFileSync(at("web/js/components/coursepanel.js"), "utf8");
  assert.match(panel, /const hasAudio = \(w\) => !!\(w && w\.audio && w\.times\);/);
  assert.match(panel, /\$\{hasAudio\(w\) \? `<button type="button" class="ghost cw-play" data-part="word">/);
  assert.match(panel, /const voiced = made\.filter\(\(\[, w\]\) => hasAudio\(w\)\);/);
  assert.match(panel, /This course has no audio/);
});

test("the Library's Courses has the picker, and opens the chosen kind's courses in the usual panels", () => {
  const library = readFileSync(at("web/js/pages/library.js"), "utf8");
  assert.match(library, /<select id="variety-pick"/);
  assert.match(library, /varietiesOffered\(courseLang, courses, grammar\)/);
  assert.match(library, /coursePanel\(\$\("#course"\), courseLang, \{ course: basicsCourse \}\)/);
  assert.match(library, /grammarFor\(courseLang, variety, grammar\)/);
  assert.match(library, /localStorage\.setItem\(VARIETY_KEY, variety\)/);
});
