// Run with: node --test tests/js/
// Misheard words: the lookup's "correction", how the transcript's words and line change, and the
// answer cache (an undone correction stays undone, on every device).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planCorrection, replaceInText } from "../../web/js/correction.js";
import { cacheKey, cleanCorrection, define, lookup, quickCacheKey, rememberAnswer, schemaFor, QUICK_SCHEMA } from "../../web/js/definer.js";

// The same cases as tests/test_corrections.py (app/corrections.py must agree with correction.js).
export const LINE_CASES = [
  ["I red the book.", ["I", "red", "the", "book."], ["I", "read", "the", "book."], "I read the book."],
  ["He said: red, red!", ["He", "said:", "red,", "red!"], ["He", "said:", "red,", "read!"], "He said: red, read!"],
  ["انتي جديدة هون؟", ["انتي", "جديدة", "هون؟"], ["انتي", "جديدة", "هنا؟"], "انتي جديدة هنا؟"],
  ["a  lot   of", ["a", "lot", "of"], ["a", "lot", "off"], "a  lot   off"],
  ["text that changed elsewhere", ["missing", "words"], ["new", "words"], "new words"],
];

test("a correction keeps each word's own punctuation", () => {
  assert.deepEqual(planCorrection(["red,"], "read"), ["read,"]);
  assert.deepEqual(planCorrection(["«هون؟»"], "هنا"), ["«هنا؟»"]);
  assert.deepEqual(planCorrection(["for", "ever."], "forever now"), ["forever", "now."], "word for word when the counts match");
  assert.deepEqual(planCorrection(["alot,"], "a lot"), ["a lot,"], "one word may become a short phrase");
  assert.equal(planCorrection(["a", "lot"], "allot it now"), null, "several words to a different number: left alone");
  assert.equal(planCorrection(["read"], "read"), null, "nothing to change");
  assert.equal(planCorrection(["read"], "  "), null);
  assert.equal(planCorrection([], "read"), null);
  assert.deepEqual(planCorrection(["read,"], "red."), ["red,"], "the model's own punctuation is dropped");
});

test("the line changes only where its words changed", () => {
  for (const [text, old, next, want] of LINE_CASES) assert.equal(replaceInText(text, old, next), want, text);
});

test("the model's correction is tidied and never just repeats the word", () => {
  assert.equal(cleanCorrection("read", "red"), "read");
  assert.equal(cleanCorrection(" «Read.» ", "red"), "Read");
  assert.equal(cleanCorrection("Red", "red"), "", "letter case alone isn't a correction");
  assert.equal(cleanCorrection("red!", "red"), "", "nor punctuation");
  assert.equal(cleanCorrection("", "red"), "");
  assert.equal(cleanCorrection("this is far too many words to be one", "red"), "");
  assert.equal(cleanCorrection(null, "red"), "");
});

test("both kinds of lookup ask for a correction", () => {
  assert.ok(schemaFor("ar").required.includes("correction"));
  assert.ok(schemaFor("es").properties.correction);
  assert.ok(QUICK_SCHEMA.required.includes("correction"));
});

const CFG = { provider: "claude", key: "k", model: "", language: "English" };
const CTX = { word: "red", marked: "I ⟦red⟧ the book yesterday.", lang: "en" };
function claude(answer) {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    return { status: 200, text: JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(answer) }] }) };
  };
  transport.calls = calls;
  return transport;
}

test("the answer carries the correction, or none when the learner kept the word", async () => {
  const misheard = await define(CFG, CTX, claude({ meaning: "read (past)", correction: "read" }), { quick: true });
  assert.equal(misheard.correction, "read");
  const t = claude({ meaning: "the colour", correction: "read" });
  const kept = await define(CFG, { ...CTX, noCorrect: true }, t, { quick: true });
  assert.equal(kept.correction, "", "the learner said it is right as written");
  assert.ok(JSON.stringify(t.calls[0].body).includes("confirmed the target word is right as written"));
  const fine = await define(CFG, CTX, claude({ meaning: "the colour", correction: "" }));
  assert.equal(fine.correction, "");
});

function memoryCache() {
  const kept = new Map();
  return {
    kept,
    load: async (key) => kept.get(key) || null,
    save: async (key, word, sentence, data) => { kept.set(key, data); },
  };
}

test("a correction is asked for once, then served from the cache", async () => {
  const cache = memoryCache();
  const t = claude({ meaning: "read (past)", correction: "read" });
  const first = await lookup(CFG, CTX, { quick: true, transport: t, ...cache });
  const again = await lookup(CFG, CTX, { quick: true, transport: t, ...cache });
  assert.equal(first.correction, "read");
  assert.deepEqual(again, first);
  assert.equal(t.calls.length, 1);
  assert.ok(cache.kept.has(await quickCacheKey(CTX.word, CTX.marked, "English", "en")));
});

test("after Undo the word is kept as written, and that wins over any correcting answer", async () => {
  const cache = memoryCache();
  await lookup(CFG, CTX, { transport: claude({ meaning: "read (past)", correction: "read" }), ...cache });
  // Undo: asked again as written (refresh, noCorrect); the answer is kept under its own key.
  const t = claude({ meaning: "the colour", correction: "read" });
  const kept = await lookup(CFG, { ...CTX, noCorrect: true }, { refresh: true, transport: t, ...cache });
  assert.equal(kept.correction, "");
  // Later, without the flag (another tap, or another device after sync): never corrected again.
  const later = await lookup(CFG, CTX, { transport: claude({ meaning: "x", correction: "read" }), ...cache });
  assert.equal(later.correction, "");
  assert.equal(later.meaning, "the colour");
  // A quick lookup of the same word gets the kept answer (a full answer serves quick lookups).
  const q = claude({ meaning: "colour", correction: "read" });
  const quick = await lookup(CFG, CTX, { quick: true, transport: q, ...cache });
  assert.equal(quick.correction, "");
  assert.equal(q.calls.length, 0);
});

test("an Undo made in quick mode also stops detailed lookups correcting the word", async () => {
  const cache = memoryCache();
  await lookup(CFG, CTX, { transport: claude({ meaning: "read (past)", correction: "read" }), ...cache }); // a correcting full answer
  await lookup(CFG, { ...CTX, noCorrect: true }, { quick: true, refresh: true, transport: claude({ meaning: "colour", correction: "" }), ...cache });
  const t = claude({ meaning: "the colour", correction: "read" });
  const detailed = await lookup(CFG, CTX, { transport: t, ...cache });
  assert.equal(detailed.correction, "", "the kept quick answer says the word is right as written");
  assert.equal(t.calls.length, 1, "the correcting full answer isn't used; the word is asked about again as written");
  assert.ok(JSON.stringify(t.calls[0].body).includes("confirmed the target word is right as written"));
});

test("the corrected sentence gets the answer too, noting what the transcript had", async () => {
  const cache = memoryCache();
  const corrected = { ...CTX, word: "read", marked: "I ⟦read⟧ the book yesterday." };
  const key = await rememberAnswer(CFG, corrected, { meaning: "read (past)", correction: "", corrected_from: "red" }, cache.save);
  assert.equal(key, await cacheKey("read", corrected.marked, "English", "en"));
  const t = claude({});
  const shown = await lookup(CFG, corrected, { transport: t, ...cache });
  assert.equal(shown.corrected_from, "red");
  assert.equal(t.calls.length, 0, "no new question");
  assert.notEqual(key, await cacheKey(CTX.word, CTX.marked, "English", "en"), "the old sentence's answer is a different entry");
});
