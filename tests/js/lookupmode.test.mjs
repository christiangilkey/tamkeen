// Run with: node --test tests/js/
// Quick lookup: the short AI request that asks only for a word's meaning, its own place in the
// answer cache, and the remembered quick / detailed choice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { define, cacheKey, quickCacheKey, quickPrompt, QUICK_SCHEMA, schemaFor } from "../../web/js/definer.js";
import { ICON_NAMES, icon } from "../../web/js/icons.js";

const CTX = { word: "هون", marked: "انتي جديدة ⟦هون⟧؟", podcast: "Real Arabic", episode: "Lesson 1",
              before: "مرحبا!", after: "أهلا فيكي." };
const ok = (obj) => ({ status: 200, text: JSON.stringify(obj) });
function fakeTransport(responder) {
  const calls = [];
  const fn = async (req) => { calls.push(req); return responder(req); };
  fn.calls = calls;
  return fn;
}
const ANSWERS = {
  claude: () => ok({ stop_reason: "end_turn", content: [{ type: "text", text: '{"meaning":"here"}' }], usage: { input_tokens: 120, output_tokens: 9 } }),
  gemini: () => ok({ candidates: [{ content: { parts: [{ text: '{"meaning":"here"}' }] } }] }),
  openai: () => ok({ choices: [{ message: { content: '{"meaning":"here"}' } }] }),
  grok: () => ok({ choices: [{ message: { content: '{"meaning":"here"}' } }] }),
};
/** Everything a request says to the model, as one string. */
const said = (req) => JSON.stringify(req.body);

test("a quick lookup asks only for the meaning, with every provider", async () => {
  for (const provider of Object.keys(ANSWERS)) {
    const t = fakeTransport(ANSWERS[provider]);
    const d = await define({ provider, key: "k", model: "", language: "English" }, CTX, t, { quick: true });
    assert.equal(d.meaning, "here", provider);
    assert.equal(d.quick, true, provider);
    assert.equal(d.word, "هون", `${provider}: the tapped word stands in for the one the model no longer returns`);
    assert.deepEqual([d.explanation, d.lemma, d.sentence_translation, d.other_meanings], ["", "", "", []], provider);
    const text = said(t.calls[0]);
    assert.ok(text.includes("انتي جديدة ⟦هون⟧؟"), `${provider}: the sentence is sent`);
    assert.ok(!text.includes("مرحبا!") && !text.includes("أهلا فيكي."), `${provider}: the neighbouring sentences are not`);
    assert.ok(!text.includes("sentence_translation") && !text.includes("morphology"), `${provider}: none of the full answer's fields are asked for`);
    assert.ok(text.includes("meaning"), provider);
  }
});

test("the full lookup is unchanged, and far bigger than the quick one", async () => {
  const full = fakeTransport(() => ok({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ meaning: "here" }) }] }));
  const d = await define({ provider: "claude", key: "k", model: "", language: "English" }, CTX, full);
  assert.equal(d.quick, undefined);
  assert.ok(said(full.calls[0]).includes("مرحبا!"), "the neighbouring sentences still go with a full lookup");
  assert.ok(said(full.calls[0]).includes("sentence_translation"));
  const quick = fakeTransport(ANSWERS.claude);
  await define({ provider: "claude", key: "k", model: "", language: "English" }, CTX, quick, { quick: true });
  assert.ok(said(quick.calls[0]).length < said(full.calls[0]).length / 3, "a quick request is under a third the size");
});

test("the quick instructions name the language studied and the language to answer in", () => {
  const p = quickPrompt("French", "es");
  assert.ok(p.includes("Spanish") && p.includes("in French") && p.includes("⟦like this⟧"));
  assert.deepEqual(QUICK_SCHEMA.required, ["meaning"]);
  assert.ok(Object.keys(schemaFor("ar").properties).length > 10, "the full shape is untouched");
});

test("quick answers are kept apart from full ones", async () => {
  const full = await cacheKey(CTX.word, CTX.marked, "English");
  const quick = await quickCacheKey(CTX.word, CTX.marked, "English");
  assert.notEqual(quick, full);
  assert.equal(quick, await quickCacheKey(CTX.word, CTX.marked, "English"), "stable");
  assert.notEqual(quick, await quickCacheKey(CTX.word, CTX.marked, "French"));
  assert.notEqual(quick, await quickCacheKey(CTX.word, CTX.marked, "English", "es"));
  assert.match(quick, /^[0-9a-f]{40}$/);
});

test("the two switch icons are drawn like the app's other icons", () => {
  for (const name of ["bolt", "target"]) {
    assert.ok(ICON_NAMES.includes(name), name);
    const svg = icon(name, 16);
    assert.ok(svg.includes('viewBox="0 0 24 24"') && svg.includes('stroke-width="1.8"') && svg.includes('stroke="currentColor"'), name);
    assert.ok(!/[\u{1F300}-\u{1FAFF}⚡]/u.test(svg), `${name}: no emoji`);
  }
});

test("the choice is remembered, defaults to detailed, and announces a change", async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const heard = [];
  globalThis.window = new EventTarget();
  globalThis.CustomEvent = globalThis.CustomEvent || class extends Event { constructor(t, o) { super(t); this.detail = o && o.detail; } };
  const { lookupMode, setLookupMode, LOOKUP_EVENT } = await import("../../web/js/components/lookupmode.js");
  window.addEventListener(LOOKUP_EVENT, (e) => heard.push(e.detail));
  assert.equal(lookupMode(), "detailed", "the popup people already know is the default");
  setLookupMode("quick");
  assert.equal(lookupMode(), "quick");
  setLookupMode("quick");
  setLookupMode("nonsense"); // anything else means detailed
  assert.equal(lookupMode(), "detailed");
  assert.deepEqual(heard, ["quick", "detailed"], "one announcement per real change");
  assert.equal(store.get("lookupMode"), "detailed");
});
