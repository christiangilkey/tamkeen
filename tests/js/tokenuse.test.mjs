// Run with: node --test tests/js/
// "Tokens used today" in Settings: reading each provider's own count, and adding the day up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { define, onUsage, usageOf } from "../../web/js/definer.js";
import { addUsage, costCents, dayKey, describeUsage, formatCents } from "../../web/js/tokenuse.js";

const ANSWER = JSON.stringify({ word: "hola", meaning: "hello" });
const CTX = { word: "hola", marked: "⟦hola⟧ amigo", lang: "es" };

test("each provider's answer is read for what it used", () => {
  assert.deepEqual(usageOf("claude", { usage: { input_tokens: 900, cache_read_input_tokens: 50, output_tokens: 300 } }), { in: 950, out: 300 });
  assert.deepEqual(usageOf("gemini", { usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 250, thoughtsTokenCount: 40 } }), { in: 800, out: 290 });
  assert.deepEqual(usageOf("openai", { usage: { prompt_tokens: 700, completion_tokens: 200 } }), { in: 700, out: 200 });
  assert.deepEqual(usageOf("grok", { usage: { prompt_tokens: 600, completion_tokens: 100 } }), { in: 600, out: 100 });
  assert.deepEqual(usageOf("claude", {}), { in: 0, out: 0 }, "an answer that doesn't say counts as nothing");
});

test("every answered request is reported once; a refused key reports nothing", async () => {
  const seen = [];
  const off = onUsage((u) => seen.push(u));
  const ok = async () => ({ status: 200, text: JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: ANSWER }],
                                                               usage: { input_tokens: 850, output_tokens: 400 } }) });
  await define({ provider: "claude", key: "k" }, CTX, ok);
  assert.deepEqual(seen, [{ provider: "claude", model: "claude-haiku-5-5", in: 850, out: 400 }]);
  await assert.rejects(define({ provider: "claude", key: "bad" }, CTX, async () => ({ status: 401, text: "{}" })));
  assert.equal(seen.length, 1);
  off();
  await define({ provider: "claude", key: "k" }, CTX, ok);
  assert.equal(seen.length, 1, "nothing more after unsubscribing");
});

test("the day's total adds up, and starts again the next day", () => {
  const use = { provider: "claude", model: "claude-haiku-5-5", in: 850, out: 400 };
  let t = addUsage(null, use, "2026-10-12");
  t = addUsage(t, use, "2026-10-12");
  assert.equal(t.in + t.out, 2500);
  assert.equal(t.requests, 2);
  // Haiku 5.5: 10¢ per million read, 50¢ per million written.
  assert.ok(Math.abs(t.cents - 2 * (850 * 10 + 400 * 50) / 1e6) < 1e-9);
  assert.deepEqual(describeUsage(t), { tokens: 2500, detail: "2 lookups, about 0.1¢" });
  assert.equal(describeUsage(addUsage(null, { ...use, in: 10, out: 5 }, "2026-10-12")).detail, "1 lookup, less than 0.1¢");
  const next = addUsage(t, use, "2026-10-13");
  assert.equal(next.requests, 1, "yesterday's total is not carried over");
  assert.equal(next.in + next.out, 1250);
});

test("a model typed in by hand has no known price, so no cost is claimed", () => {
  assert.equal(costCents({ provider: "claude", model: "my-own-model", in: 1000, out: 1000 }), null);
  const t = addUsage(null, { provider: "claude", model: "my-own-model", in: 1000, out: 1000 }, "2026-10-12");
  assert.equal(t.unpriced, 1);
  assert.equal(describeUsage(t).detail, "1 lookup");
});

test("what Settings shows", () => {
  assert.deepEqual(describeUsage({ day: "d", in: 0, out: 0, requests: 0, cents: 0, unpriced: 0 }), { tokens: 0, detail: "No lookups yet today." });
  assert.deepEqual(describeUsage({ day: "d", in: 8500, out: 4000, requests: 10, cents: 0.285, unpriced: 0 }), { tokens: 12500, detail: "10 lookups, about 0.3¢" });
  assert.equal(formatCents(0.01), "less than 0.1¢");
  assert.equal(formatCents(12.4), "12¢");
  assert.equal(formatCents(125), "$1.25");
  assert.equal(dayKey(new Date(2026, 9, 3)), "2026-10-03");
});
