// Run with: node --test tests/js/
// Exercises each provider's request shape and response parsing with a fake transport.
import { test } from "node:test";
import assert from "node:assert/strict";
import { define, markWord, cacheKey, SCHEMA, DefinerError } from "../../web/js/definer.js";

const ANSWER = {
  word: "هون", vocalized: "هَوْن", lemma: "هون", root: "", pos: "adverb", morphology: "demonstrative adverb",
  meaning: "here", explanation: "Levantine for هنا.", other_meanings: [], dialect: "Levantine",
  dialect_note: "Common in Syria and Lebanon.", msa_equivalent: "هنا", sentence_translation: "Are you new here?",
};
const CTX = { word: "هون", marked: "انتي جديدة ⟦هون⟧؟", podcast: "Real Arabic" };

function fakeTransport(responder) {
  const calls = [];
  const fn = async (req) => { calls.push(req); return responder(req, calls.length); };
  fn.calls = calls;
  return fn;
}
const ok = (obj) => ({ status: 200, text: JSON.stringify(obj) });

test("markWord wraps a word or a phrase", () => {
  assert.equal(markWord(["a", "b", "c"], 1), "a ⟦b⟧ c");
  assert.equal(markWord(["a", "b", "c"], 0, 1), "⟦a b⟧ c");
});

test("cacheKey is stable and language-sensitive", async () => {
  const k1 = await cacheKey("هون", CTX.marked, "English");
  assert.equal(k1, await cacheKey("هون", CTX.marked, "English"));
  assert.notEqual(k1, await cacheKey("هون", CTX.marked, "French"));
  assert.equal(k1.length, 40);
});

test("Claude: request shape and text-block parsing", async () => {
  const t = fakeTransport(() => ok({
    stop_reason: "end_turn",
    content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(ANSWER) }],
  }));
  const d = await define({ provider: "claude", key: "sk-ant", model: "claude-opus-5-5", language: "English" }, CTX, t);
  assert.equal(d.meaning, "here");
  const req = t.calls[0];
  assert.equal(req.url, "https://api.anthropic.com/v1/messages");
  assert.equal(req.headers["x-api-key"], "sk-ant");
  assert.equal(req.headers["anthropic-version"], "2023-06-01");
  assert.equal(req.body.output_config.format.type, "json_schema");
  assert.deepEqual(req.body.output_config.format.schema, SCHEMA);
  assert.equal(req.body.output_config.effort, "low");
  assert.equal(req.body.fallbacks, "default");
  assert.equal(req.headers["anthropic-beta"], "server-side-fallback-2026-07-01");
  assert.match(req.body.messages[0].content, /⟦هون⟧/);
});

test("Claude Haiku: no effort or fallbacks", async () => {
  const t = fakeTransport(() => ok({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(ANSWER) }] }));
  await define({ provider: "claude", key: "k", model: "claude-haiku-4-5" }, CTX, t);
  assert.equal(t.calls[0].body.output_config.effort, undefined);
  assert.equal(t.calls[0].body.fallbacks, undefined);
});

test("Claude refusal surfaces a readable error", async () => {
  const t = fakeTransport(() => ok({ stop_reason: "refusal", content: [] }));
  await assert.rejects(define({ provider: "claude", key: "k", model: "claude-opus-5-5" }, CTX, t), /declined/);
});

test("Gemini: schema conversion, thought parts skipped", async () => {
  const t = fakeTransport(() => ok({
    candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: JSON.stringify(ANSWER) }] } }],
  }));
  const d = await define({ provider: "gemini", key: "g", model: "gemini-flash-latest" }, CTX, t);
  assert.equal(d.msa_equivalent, "هنا");
  const req = t.calls[0];
  assert.match(req.url, /models\/gemini-flash-latest:generateContent$/);
  assert.equal(req.headers["x-goog-api-key"], "g");
  assert.equal(req.body.generationConfig.responseSchema.type, "OBJECT");
  assert.equal(req.body.generationConfig.responseSchema.properties.other_meanings.type, "ARRAY");
  assert.equal(req.body.generationConfig.responseSchema.additionalProperties, undefined);
});

for (const [provider, base] of [["openai", "https://api.openai.com/v1"], ["grok", "https://api.x.ai/v1"]]) {
  test(`${provider}: chat completions with strict json_schema`, async () => {
    const t = fakeTransport(() => ok({ choices: [{ message: { content: JSON.stringify(ANSWER) } }] }));
    const d = await define({ provider, key: "k", model: "m" }, CTX, t);
    assert.equal(d.dialect, "Levantine");
    const req = t.calls[0];
    assert.equal(req.url, `${base}/chat/completions`);
    assert.equal(req.headers.authorization, "Bearer k");
    assert.equal(req.body.response_format.type, "json_schema");
    assert.equal(req.body.response_format.json_schema.strict, true);
  });
}

test("400 retries once with a minimal request", async () => {
  const t = fakeTransport((req, n) => (n === 1
    ? { status: 400, text: '{"error":{"message":"reasoning_effort not supported"}}' }
    : ok({ choices: [{ message: { content: "```json\n" + JSON.stringify(ANSWER) + "\n```" } }] })));
  const d = await define({ provider: "openai", key: "k", model: "old-model" }, CTX, t);
  assert.equal(d.meaning, "here");
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[1].body.reasoning_effort, undefined);
  assert.equal(t.calls[1].body.response_format.type, "json_object");
});

test("HTTP errors become friendly messages", async () => {
  const t401 = fakeTransport(() => ({ status: 401, text: "{}" }));
  await assert.rejects(define({ provider: "grok", key: "bad", model: "m" }, CTX, t401), /rejected the API key/);
  const t404 = fakeTransport(() => ({ status: 404, text: '{"error":{"message":"model not found"}}' }));
  await assert.rejects(define({ provider: "gemini", key: "k", model: "nope" }, CTX, t404), /model name/);
});

test("missing key fails fast without a request", async () => {
  const t = fakeTransport(() => ok({}));
  await assert.rejects(define({ provider: "claude", key: "" }, CTX, t), DefinerError);
  assert.equal(t.calls.length, 0);
});

test("the translation marks the tapped word's part; the popup's copy has no marks", async () => {
  const answer = (sentence_translation) => fakeTransport(() => ok({ choices: [{ message: { content: JSON.stringify({ ...ANSWER, sentence_translation }) } }] }));
  const cfg = { provider: "openai", key: "k", model: "m" };
  const t = answer("Are you new ⟦here⟧?");
  const d = await define(cfg, CTX, t);
  assert.equal(d.sentence_translation, "Are you new here?");
  assert.equal(d.translation_marked, "Are you new ⟦here⟧?");
  assert.match(t.calls[0].body.messages[0].content, /"sentence_translation".*⟦ ⟧/);
  assert.match(SCHEMA.properties.sentence_translation.description, /⟦ ⟧/);
  // A model that leaves the marks out, or tangles them, still gives a clean translation.
  assert.equal((await define(cfg, CTX, answer("Are you new here?"))).translation_marked, "");
  const tangled = await define(cfg, CTX, answer("Are you ⟧new⟦ ⟦here?"));
  assert.deepEqual([tangled.sentence_translation, tangled.translation_marked], ["Are you new here?", ""]);
});

test("missing fields are normalized", async () => {
  const t = fakeTransport(() => ok({ choices: [{ message: { content: '{"meaning":"here"}' } }] }));
  const d = await define({ provider: "openai", key: "k", model: "m" }, CTX, t);
  assert.equal(d.word, "هون");
  assert.deepEqual(d.other_meanings, []);
  assert.equal(d.root, "");
});

test("each provider has a recommended low-cost model, and Settings lists it first", async () => {
  const { PROVIDERS, modelFor } = await import("../../web/js/definer.js");
  for (const [name, p] of Object.entries(PROVIDERS)) {
    assert.equal(p.models[0].id, p.defaultModel, `${name}: the recommended model heads the list`);
    assert.ok(p.models.every((m) => m.id && m.name && m.note), `${name}: every model has a name and a note`);
    assert.match(p.keyUrl, /^https:\/\//);
    assert.equal(modelFor(name, {}), p.defaultModel);
    assert.equal(modelFor(name, { [`definer_model_${name}`]: "my-own-model" }), "my-own-model");
  }
  assert.equal(PROVIDERS.claude.defaultModel, "claude-haiku-5-5");
});

test("Claude Haiku 5.5 (the default): low effort, and no fallback, which it doesn't have", async () => {
  const t = fakeTransport(() => ok({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(ANSWER) }] }));
  await define({ provider: "claude", key: "k" }, CTX, t);
  assert.equal(t.calls[0].body.model, "claude-haiku-5-5");
  assert.equal(t.calls[0].body.output_config.effort, "low");
  assert.equal(t.calls[0].body.fallbacks, undefined);
  assert.equal(t.calls[0].headers["anthropic-beta"], undefined);
});

test("Gemini: thinking level only for the models that have one", async () => {
  const answer = () => ok({ candidates: [{ content: { parts: [{ text: JSON.stringify(ANSWER) }] } }] });
  const t = fakeTransport(answer);
  await define({ provider: "gemini", key: "g" }, CTX, t);
  assert.match(t.calls[0].url, /models\/gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(t.calls[0].body.generationConfig.thinkingConfig.thinkingLevel, "low");
  await define({ provider: "gemini", key: "g", model: "gemini-2.5-flash-lite" }, CTX, t);
  assert.equal(t.calls[1].body.generationConfig.thinkingConfig, undefined);
});

test("a model's price is one figure, cents per million tokens, and a million tokens is about 800 lookups", async () => {
  const { PROVIDERS, LOOKUP_TOKENS, LOOKUPS_PER_MILLION, centsPerMillion } = await import("../../web/js/definer.js");
  assert.equal(LOOKUPS_PER_MILLION, 800);
  for (const p of Object.values(PROVIDERS)) {
    for (const m of p.models) {
      assert.ok(m.in > 0 && m.out >= m.in, `${m.id}: has both prices`);
      const c = centsPerMillion(m);
      assert.ok(c >= m.in && c <= m.out, `${m.id}: between the reading and the writing price`);
    }
  }
  // Haiku 5.5: 10¢ read, 50¢ written; a lookup reads about twice what it writes.
  assert.equal(centsPerMillion(PROVIDERS.claude.models[0]), Math.round((10 * LOOKUP_TOKENS.in + 50 * LOOKUP_TOKENS.out) / (LOOKUP_TOKENS.in + LOOKUP_TOKENS.out)));
  assert.equal(centsPerMillion(PROVIDERS.claude.models[0]), 23);
});

test("a pasted key is tidied and recognised by how it starts", async () => {
  const { cleanKey, keyProvider } = await import("../../web/js/definer.js");
  assert.equal(cleanKey("  sk-ant-abc123\n"), "sk-ant-abc123");
  assert.equal(cleanKey("“AIzaSy 12​34”"), "AIzaSy1234");
  assert.equal(cleanKey(null), "");
  assert.equal(keyProvider("sk-ant-api03-xyz"), "claude");
  assert.equal(keyProvider("sk-proj-xyz"), "openai");
  assert.equal(keyProvider(" AIzaSyXYZ "), "gemini");
  assert.equal(keyProvider("xai-xyz"), "grok");
  assert.equal(keyProvider("something-else"), "");
});
