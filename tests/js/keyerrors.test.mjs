// Run with: node --test tests/js/
// What a learner is told when a provider refuses their key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { define } from "../../web/js/definer.js";

const CTX = { word: "hola", marked: "⟦hola⟧ amigo", lang: "es" };
const answering = (status, body) => async () => ({ status, text: typeof body === "string" ? body : JSON.stringify(body) });
const failure = async (provider, status, body) => {
  try { await define({ provider, key: "k" }, CTX, answering(status, body)); } catch (e) { return e; }
  throw new Error("expected the lookup to fail");
};

test("a refused key says it has probably expired and a new one is needed", async () => {
  for (const [provider, status, body] of [
    ["claude", 401, { error: { type: "authentication_error", message: "invalid x-api-key" } }],
    ["openai", 401, { error: { message: "Incorrect API key provided." } }],
    ["grok", 403, { error: "Forbidden" }],
    ["gemini", 400, { error: { message: "API key expired. Please renew the API key." } }],
  ]) {
    const e = await failure(provider, status, body);
    assert.match(e.message, /rejected the API key/, provider);
    assert.match(e.message, /most likely expired/, provider);
    assert.match(e.message, /need a new one/, provider);
    assert.equal(e.keyRejected, true, provider);
  }
});

test("other failures are not blamed on the key", async () => {
  const quota = await failure("openai", 429, { error: { message: "You exceeded your current quota." } });
  assert.match(quota.message, /quota/);
  assert.doesNotMatch(quota.message, /expired/);
  assert.equal(quota.keyRejected, false);
  const model = await failure("gemini", 404, { error: { message: "model not found" } });
  assert.match(model.message, /model name/);
  assert.equal(model.keyRejected, false);
  const down = await failure("claude", 529, "overloaded");
  assert.doesNotMatch(down.message, /expired/);
});
