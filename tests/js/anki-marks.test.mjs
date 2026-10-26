// The phone's Anki export and spreadsheet (mobile/src/js/shared-logic.js) with a sentence that says where its
// word is (⟦ ⟧): the same as the computer's (tests/test_course_marks.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ankiFields, ankiFront, sentenceSpans, vocabCsv } from "../../mobile/src/js/shared-logic.js";

const v = { text: "لِـ", meaning: "", notes: "", translation: "", memo: "", sentence: "هٰذِهِ الْهَدِيَّةُ ⟦لَ⟧كَ." };

test("the marked word is the one in brackets, and the marks never show", () => {
  const { text, spans } = sentenceSpans(v.sentence, v.text);
  assert.equal(text, "هٰذِهِ الْهَدِيَّةُ لَكَ.");
  assert.deepEqual(spans.map(([a, b]) => text.slice(a, b)), ["لَ"]);
  const [, back] = ankiFields(v);
  assert.ok(back.includes("هٰذِهِ الْهَدِيَّةُ [لَ]كَ.") && !back.includes("⟦"), back);
  assert.equal(ankiFront(v), "هٰذِهِ الْهَدِيَّةُ …كَ.");
  assert.ok(!vocabCsv([{ ...v, episode_title: "", start: null, end: null }]).includes("⟦"));
});

test("each part of a word in two pieces is bracketed", () => {
  const [, back] = ankiFields({ ...v, text: "anrufen", sentence: "Ich ⟦rufe⟧ dich morgen ⟦an⟧." });
  assert.ok(back.includes("Ich [rufe] dich morgen [an]."), back);
});
