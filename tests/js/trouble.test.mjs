// Run with: node --test tests/js/
// "Troubleshoot": sorting a failed key into what probably went wrong, and what the box lists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_PAGES, kindFromMessage, kindOf, problemKind, troubleshooting } from "../../web/js/trouble.js";
import { PROVIDERS, define } from "../../web/js/definer.js";
import { STT_PROVIDERS, sendFailure, sttFailure } from "../../web/js/stt.js";

const CTX = { word: "hola", marked: "⟦hola⟧ amigo", lang: "es" };
const failing = async (provider, transport) => {
  try { await define({ provider, key: "k" }, CTX, transport); } catch (e) { return e; }
  throw new Error("expected the lookup to fail");
};
const answer = (status, body) => async () => ({ status, text: JSON.stringify(body) });

test("a failed request is sorted by its status and the provider's answer", () => {
  assert.equal(problemKind(401, ""), "key");
  assert.equal(problemKind(403, '{"error":"Forbidden"}'), "key");
  assert.equal(problemKind(400, '{"error":{"message":"API key expired. Please renew the API key."}}'), "key");
  assert.equal(problemKind(402, ""), "credit");
  assert.equal(problemKind(429, '{"error":{"message":"You exceeded your current quota"}}'), "credit");
  assert.equal(problemKind(429, '{"error":{"message":"Rate limit reached"}}'), "rate");
  assert.equal(problemKind(0, "Network error: ConnectError"), "network");
  assert.equal(problemKind(404, "model not found"), "model");
  assert.equal(problemKind(529, "overloaded"), "server");
  assert.equal(problemKind(400, '{"error":{"message":"User location is not supported for the API use."}}'), "region");
  // OpenAI answers an unsupported country with 403: that is not the key's fault.
  assert.equal(problemKind(403, '{"error":{"code":"unsupported_country_region_territory"}}'), "region");
  assert.equal(problemKind(418, "teapot"), "other");
});

test("lookups carry the kind, and say plainly when the provider couldn't be reached", async () => {
  const offline = await failing("claude", async () => { throw new Error("Failed to connect to api.anthropic.com"); });
  assert.equal(offline.kind, "network");
  assert.equal(offline.provider, "claude");
  assert.match(offline.message, /Couldn't reach Claude \(Anthropic\)\. Check your internet connection\./);
  const relay = await failing("openai", async () => ({ status: 0, text: "Network error: ConnectTimeout: timed out" }));
  assert.equal(relay.kind, "network");
  const region = await failing("gemini", answer(400, { error: { message: "User location is not supported for the API use." } }));
  assert.equal(region.kind, "region");
  assert.equal(region.keyRejected, false);
  assert.match(region.message, /isn't available in your country or region/);
  const key = await failing("grok", answer(401, { error: "bad key" }));
  assert.equal(key.kind, "key");
  assert.equal(key.keyRejected, true);
  const credit = await failing("claude", answer(402, { error: { message: "Your credit balance is too low" } }));
  assert.equal(credit.kind, "credit");
  assert.match(credit.message, /no credit/);
});

test("transcription errors carry the kind too", () => {
  assert.equal(sttFailure("groq", 401, "{}").kind, "key");
  assert.equal(sttFailure("groq", 429, "{}").kind, "rate");
  assert.equal(sttFailure("openai", 402, "{}").kind, "credit");
  assert.equal(sttFailure("openai", 403, '{"error":{"message":"unsupported_country_region_territory"}}').kind, "region");
  assert.equal(sendFailure("groq", new Error("Unable to resolve host api.groq.com")).kind, "network");
  assert.equal(sttFailure("groq", 401, "{}").provider, "groq");
});

test("a message kept as text (a transcription the computer tried) is still sorted", () => {
  assert.equal(kindFromMessage("Groq rejected the API key. It has most likely expired, so you probably need a new one."), "key");
  assert.equal(kindFromMessage("Groq says your account has reached its limit for now (it asks to wait about 12 minutes)."), "rate");
  assert.equal(kindFromMessage("OpenAI says the account has no credit. Add some on its Billing page."), "credit");
  assert.equal(kindFromMessage("Couldn't reach Groq (ConnectTimeout). Check your internet connection."), "network");
  assert.equal(kindFromMessage("Groq is having trouble (error 503). Try again in a little while."), "server");
  assert.equal(kindFromMessage("ffmpeg isn't installed"), "", "not a provider problem: no button");
  assert.equal(kindOf({ message: "NO_KEY" }), "", "no key yet: Settings, not troubleshooting");
  assert.equal(kindOf({ keyRejected: true, message: "x" }), "key");
});

test("the box lists likely causes with what to do, and the common ones besides", () => {
  for (const kind of ["key", "credit", "rate", "network", "region", "model", "server", "other"]) {
    const t = troubleshooting(kind);
    assert.ok(t.heading, kind);
    assert.ok(t.likely.length >= 2, kind);
    for (const c of [...t.likely, ...t.other]) assert.ok(c.title && c.fix, `${kind}: ${c.id}`);
    const likely = new Set(t.likely.map((c) => c.id));
    assert.ok(t.other.every((c) => !likely.has(c.id)), `${kind}: nothing listed twice`);
  }
  const net = troubleshooting("network").likely.map((c) => c.id);
  assert.ok(net.includes("vpn") && net.includes("offline") && net.includes("down"));
  assert.ok(troubleshooting("key").likely.some((c) => c.id === "expired"));
  assert.ok(troubleshooting("nonsense").likely.length, "an unknown kind falls back to the general list");
  const stt = troubleshooting("key", { stt: true }).likely.find((c) => c.id === "wrongProvider");
  assert.match(stt.fix, /gsk_/);
});

test("every provider has a status page", () => {
  for (const id of [...Object.keys(PROVIDERS), ...Object.keys(STT_PROVIDERS)]) {
    assert.match(STATUS_PAGES[id] || "", /^https:\/\//, id);
  }
});
