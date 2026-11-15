// Vocab folders show only in the language they were made in (web/js/folderlang.js, used by the phone and web app).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { folderLanguageOf, folderShows } from "../../web/js/folderlang.js";

test("a folder shows only while its own language is being learned; one with none shows everywhere", () => {
  assert.equal(folderShows({ language: "es" }, "es"), true);
  assert.equal(folderShows({ language: "es" }, "ar"), false);
  assert.equal(folderShows({ language: "" }, "ar"), true);
  assert.equal(folderShows({}, "ko"), true);
});

test("a folder from before folders had a language takes the one most of its words are in", () => {
  const vocab = [
    { folders: ["d1"], language: "es" }, { folders: ["d1"], language: "es" }, { folders: ["d1", "d2"], language: "fr" },
    { folders: ["d2"] },                          // no language: Arabic, as everything was then
    { folders: ["d1"], language: "fr", deleted: 1 }, { folders: ["d1"], language: "fr", deleted: 1 },
  ];
  assert.equal(folderLanguageOf("d1", vocab), "es", "deleted words don't count");
  assert.equal(folderLanguageOf("d2", vocab), "ar", "a tie goes to the first code alphabetically, as on the computer");
  assert.equal(folderLanguageOf("d3", vocab), "", "no words: no language");
});

test("the phone's library uses these rules, and the phone build carries the file", () => {
  const backend = readFileSync(new URL("../../mobile/src/js/backend.js", import.meta.url), "utf8");
  assert.match(backend, /from "\.\/folderlang\.js"/);
  assert.match(backend, /folderList\(q\.get\("language"\)\)/);
  assert.match(backend, /language: isLanguage\(body\.language\) \? body\.language : studyLanguage\(\)|const language = isLanguage\(body\.language\)/);
  assert.match(readFileSync(new URL("../../mobile/scripts/build-www.mjs", import.meta.url), "utf8"), /"js\/folderlang\.js"/);
});
