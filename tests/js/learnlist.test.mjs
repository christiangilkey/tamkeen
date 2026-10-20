// Run with: node --test tests/js/
// The languages being learned (Settings tiles = the top bar's switch): ticking, unticking, switching,
// and merging two devices' lists. tests/fixtures/learning_cases.json is also run against the
// computer's copy, app/learning.py (tests/test_learning_list.py), so both answer the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cleanPayload, effectiveList, learningPayload, mergeLearning, takeLearning, toggleLearning, withLearning,
} from "../../web/js/learnlist.js";

const cases = JSON.parse(readFileSync(new URL("../fixtures/learning_cases.json", import.meta.url), "utf8"));

test("two devices' lists merge language by language (shared cases)", () => {
  for (const c of cases.merge) assert.deepEqual(mergeLearning(c.mine, c.theirs), c.out, c.why);
});

test("another device's list taken into this one's settings (shared cases)", () => {
  for (const c of cases.take) assert.deepEqual(takeLearning(c.settings, c.remote), c.out, c.why);
});

test("saving settings fills in the list and when each language changed (shared cases)", () => {
  for (const c of cases.with) assert.deepEqual(withLearning(c.values, c.settings, c.now), c.out, c.why);
});

test("merging is the same whichever device goes first, once both have synced", () => {
  for (const c of cases.merge) {
    const a = mergeLearning(c.mine, c.theirs), b = mergeLearning(c.theirs, c.mine);
    assert.deepEqual([...a.list].sort(), [...b.list].sort(), c.why);
    assert.deepEqual(a.times, b.times, c.why);
    assert.deepEqual(mergeLearning(a, b).list, a.list, `merging again changes nothing: ${c.why}`);
  }
});

test("ticking and unticking: one always stays; unticking the one studied now moves on", () => {
  const s = { study_language: "ar", learning_languages: ["ar", "es", "fr"] };
  assert.deepEqual(toggleLearning(s, "ja", true), { list: ["ar", "es", "fr", "ja"], now: "ar", kept: false });
  assert.deepEqual(toggleLearning(s, "es", true).list, ["ar", "es", "fr"], "already ticked: no change");
  assert.deepEqual(toggleLearning(s, "fr", false), { list: ["ar", "es"], now: "ar", kept: false });
  assert.deepEqual(toggleLearning(s, "ar", false), { list: ["es", "fr"], now: "es", kept: false });
  assert.deepEqual(toggleLearning({ study_language: "es", learning_languages: ["es"] }, "es", false),
    { list: ["es"], now: "es", kept: true }, "the last one stays ticked");
  assert.deepEqual(toggleLearning({ study_language: "es", learning_languages: [] }, "es", false).kept, true,
    "an older install's only language counts too");
  assert.deepEqual(toggleLearning(s, "xx", true).list, ["ar", "es", "fr"], "unknown code: nothing");
});

test("an unticked language comes back with its place in the list when ticked again", () => {
  let s = { study_language: "ar", learning_languages: ["ar", "es"], learning_times: {} };
  s = { ...s, ...withLearning({ learning_languages: toggleLearning(s, "es", false).list }, s, 10) };
  assert.deepEqual([s.learning_languages, s.learning_times], [["ar"], { es: 10 }]);
  s = { ...s, ...withLearning({ learning_languages: toggleLearning(s, "es", true).list }, s, 20) };
  assert.deepEqual([s.learning_languages, s.learning_times], [["ar", "es"], { es: 20 }]);
});

test("the switch's list: the language studied now is always on it", () => {
  assert.deepEqual(effectiveList({ study_language: "es", learning_languages: ["ar"] }), ["es", "ar"]);
  assert.deepEqual(effectiveList({ study_language: "", learning_languages: ["ar", "bogus", "ar"] }), ["ar"]);
  assert.deepEqual(effectiveList({}), []);
});

test("what goes into the library file is sorted, so the order on each device is no change", () => {
  const a = learningPayload({ study_language: "es", learning_languages: ["es", "ar"], learning_times: { ar: 4 } });
  const b = learningPayload({ study_language: "ar", learning_languages: ["ar", "es"], learning_times: { ar: 4 } });
  assert.deepEqual(a, { list: ["ar", "es"], times: { ar: 4 } });
  assert.deepEqual(a, b);
  assert.deepEqual(cleanPayload(undefined), { list: [], times: {} }, "a file from before this has none");
});
