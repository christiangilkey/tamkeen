// The phone's logic must match the desktop's Python exactly (ids, search, exports).
// tests/fixtures/parity.json is generated from the Python code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as js from "../../mobile/src/js/shared-logic.js";

const py = JSON.parse(readFileSync(new URL("../fixtures/parity.json", import.meta.url), "utf8"));
const segs = [{ start: 0.0, end: 2.5, text: "مرحبا بكم" }, { start: 2.5, end: 3661.042, text: "في الحلقة" }];
const vocab = [
  { uid: "v1", text: "كتاب", sentence: "هذا كتاب جميل", meaning: 'book, "tome"', notes: "n.", episode_title: "Ep", start: 65.0, end: 65.5 },
  // A looked-up word: vowelled, with the notes the app writes, in a sentence that has no vowel marks,
  // and the sentence's translation with the word's part marked (it becomes the card's front).
  { uid: "v2", text: "مُرْتَبِكَة", sentence: "كانت البنت مرتبكة من <السؤال>.", meaning: "confused", episode_title: "Ep", start: null, end: null,
    notes: "Dictionary form: اِرْتَبَكَ · Root: ر ب ك · adjective · Common in everyday speech.\nheard in ep. 3",
    translation: "The girl [Sara] was ⟦confused⟧ by the <question>." },
  { uid: "v3", text: "قلم", sentence: "", meaning: "", notes: "my own note", episode_title: "", start: null, end: null },
  // Translations without usable marks: the front falls back to the meaning.
  { uid: "v4", text: "هون", sentence: "انتي جديدة هون؟", meaning: "here", notes: "", episode_title: "", start: null, end: null,
    translation: "Are you new here?" },
  { uid: "v5", text: "هون", sentence: "انتي جديدة هون؟", meaning: "here", notes: "", episode_title: "", start: null, end: null,
    translation: "Are you ⟧new⟦ ⟦here?" },
];

test("Arabic normalization matches Python", () => {
  for (const [input, expected] of Object.entries(py.normalize)) assert.equal(js.normalize(input), expected, input);
});
test("search highlight spans match Python", () => {
  for (const [text, q, expected] of py.spans) assert.deepEqual(js.findSpans(text, q), expected);
});
test("feed ids match Python", async () => {
  for (const [url, expected] of Object.entries(py.feedUid)) assert.equal(await js.feedUid(url), expected);
});
test("feed URL cleanup matches Python", () => {
  for (const [url, expected] of Object.entries(py.normalizeUrl)) assert.equal(js.normalizeUrl(url), expected);
});
test("transcript exports match Python", () => {
  assert.equal(js.toSrt(segs), py.srt);
  assert.equal(js.toVtt(segs), py.vtt);
  assert.equal(js.toTxt(segs, "T"), py.txt);
});
test("vocab exports match Python", () => {
  assert.equal(js.vocabAnki(vocab), py.anki);
  assert.equal(js.vocabCsv(vocab), py.csv);
});
test("episode ids match Python (a page imported on phone and desktop is the same item)", async () => {
  // app.ids.episode_uid(app.ids.feed_uid("local:pages"), "https://example.com/a")
  assert.equal(await js.episodeUid(await js.feedUid("local:pages"), "https://example.com/a"), "e2a8f8c3f5937cf862254");
});
