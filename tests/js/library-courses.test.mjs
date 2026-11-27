// Basics (the 1000 words and the grammar lessons) lives in the Library, under "Basics" (key "courses", so old links and
// saved choices still work: renamed from "Courses" on 2026-11-27), the first kind and the one the Library opens on
// (pages/library.js); the Vocab page is the learner's own words only. The pages need a browser, so
// these read their source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const library = read("web/js/pages/library.js");
const vocab = read("web/js/pages/vocab.js");

test("Courses is the Library's first kind", () => {
  const kinds = library.slice(library.indexOf("const KINDS = ["), library.indexOf("];", library.indexOf("const KINDS = [")));
  const keys = [...kinds.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
  assert.equal(keys[0], "courses");
  assert.equal(keys[1], "conversation"); // speaking practice, a panel of its own like Courses (conversepanel.js)
  assert.equal(keys[2], "podcasts");
  // Lesson bundles (a panel of its own too, lessonpanel.js) are "My files", the last kind, after My videos and My audio
  // (the owner, 2026-11-17: "Lessons should be My Files and should be at the far right with my videos and my audios").
  // (After them, for DLI teachers and students only, the Classroom they share: prototype "classroom".)
  assert.deepEqual(keys.filter((k) => k !== "classroom" && k !== "dli").slice(-3), ["videos", "audio", "lessons"]);
  assert.ok(kinds.includes('...(classroomShown() ? [{ key: "classroom"'), "the Classroom shows only to the people it is for");
  assert.match(kinds, /key: "lessons", label: "My files"/);
  assert.match(kinds, /key: "courses"[^}]*href: "#\/library\?show=courses"/);
  assert.match(kinds, /key: "conversation"[^}]*href: "#\/library\?show=conversation"/);
  assert.match(kinds, /key: "lessons"[^}]*href: "#\/library\?show=lessons"/);
  assert.match(kinds, /key: "podcasts"[^}]*href: "#\/library\?show=podcasts"/);
});

test("the Library tab opens on the kind chosen last time (Courses at first); a podcast's own page still counts as Podcasts", () => {
  assert.match(library, /let kind = [^;]*: feedId \? "podcasts"\s*: \[\.\.\.query\.keys\(\)\]\.length \? "courses" : lastKind\(\);/);
  assert.match(library, /return isKind\(k\) \? k : "courses";/);
  // (a kind this learner can't see, the DLI entry without DLI material, doesn't count: `when`)
  assert.match(library, /const isKind = \(key\) => KINDS\.some\(\(x\) => x\.key === key && \(!x\.when \|\| x\.when\(\)\)\);/);
  assert.match(library, /localStorage\.setItem\(LAST_KIND_KEY, kind\)/);
  assert.match(library, /\|\| \{ key: "podcasts" \}\)\.key/);
});

test("links meant for the podcasts say so (plain #/library is now Courses)", () => {
  assert.match(library, /href="#\/library\?show=podcasts"><div class="ph all">\$\{icon\("podcast", 22\)\}<\/div><div><div class="t">All episodes/);
  assert.match(library, /new URLSearchParams\(feedId \? \{\} : \{ show: "podcasts" \}\)/);
  for (const [page, show] of [["books", "books"], ["discover", "podcasts"], ["reels", "reels"], ["websites", "pages"]]) {
    assert.match(read(`web/js/pages/${page}.js`), new RegExp(`href="#/library\\?show=${show}" title="Back to the library"`), page);
  }
});

test("Courses shows the basics and grammar panels, and no episodes", () => {
  assert.match(library, /import \{ courseIndex, coursePanel \} from "\.\.\/components\/coursepanel\.js";/);
  assert.match(library, /import \{ grammarFor, grammarIndex, grammarPanel \} from "\.\.\/components\/grammarpanel\.js";/);
  assert.match(library, /const panelKind = \(k\) => k === "courses" \|\| k === "conversation" \|\| k === "lessons" \|\| k === "classroom" \|\| k === "dli";/);
  assert.match(library, /if \(panelKind\(kind\)\) return; \/\/ no episodes/);
  assert.match(library, /root\.classList\.toggle\("courses-kind", panelKind\(kind\)\)/, "no list and no + button for either");
  assert.match(library, /if \(kind === "conversation"\) \{ showConversation\(\); return; \}/);
  assert.match(library, /if \(kind === "lessons"\) \{ showLessons\(\); return; \}/);
  assert.match(library, /data-tab="basics"/);
  assert.match(library, /data-tab="grammar"/);
});

test("the Vocab page no longer hosts the courses", () => {
  assert.doesNotMatch(vocab, /coursepanel|grammarpanel|id="vtabs"|data-tab="basics"/);
});

test("the kind is called Basics, never Courses (the owner: \"I don't want people thinking this is a 'course' app\")", () => {
  assert.match(library, /{ key: "courses", label: "Basics", icon: "learn"/);
  assert.doesNotMatch(library, /label: "Courses"|"Your courses"|There are no courses/);
  assert.ok(library.includes('t("First {0} words", planned)'), "the word list's tab says how many words it has");
});

test("Basics and its tab names are translated into every language the app speaks", () => {
  const strings = JSON.parse(read("tools/i18n/strings.json"));
  for (const k of ["Basics", "First {0} words", "First 1000 words"]) assert.ok(strings.some((s) => s.k === k), `extracted: ${k}`);
  for (const code of ["ar", "ca", "ceb", "de", "es", "fa", "fr", "hi", "it", "ja", "ko", "pt", "ru", "th", "tl", "zh"]) {
    const dict = JSON.parse(read(`web/i18n/${code}.json`));
    for (const k of ["Basics", "First {0} words"]) assert.ok(dict[k], `${code}: ${k}`);
  }
});
