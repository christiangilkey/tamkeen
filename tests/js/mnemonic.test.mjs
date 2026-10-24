// The review card's Mnemonic maker (web/js/review/mnemonic.js): what the AI is asked, how its
// answer is tidied, and the general "ask for a JSON answer" call it goes through (definer.askJson).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MNEMONIC_COUNT, cleanItems, mnemonicPrompt, soundAlikes, spelledOut } from "../../web/js/review/mnemonic.js";
import { DefinerError, PROVIDERS, askJson, mnemonicConfig, thinkingFor } from "../../web/js/definer.js";

test("the AI is asked for real words of the learner's own language that sound like the word AND point to its meaning", () => {
  const p = mnemonicPrompt({ word: "هزار", meaning: "joking", study: "Arabic", speaks: "Spanish" });
  assert.match(p.system, /SOUND like the Arabic word/);
  assert.match(p.system, /real Spanish words/);
  // The owner: "BOTH sound like the word and also be as closely related to the meaning as possible".
  assert.match(p.system, /BOTH/);
  assert.match(p.system, /as closely linked to the word's meaning as possible/);
  assert.match(p.system, /really exist in Spanish/);
  assert.match(p.system, /Never spell out the Arabic word's sounds/);
  assert.match(p.system, /never translate the word/);
  assert.match(p.user, /Arabic word: هزار/);
  assert.match(p.user, /Its meaning: joking/);
  assert.match(p.user, /Give 5 keywords: real Spanish words or phrases that sound like it and are as close to its meaning as possible/);
  assert.doesNotMatch(p.user, /Already suggested/);
  const again = mnemonicPrompt({ word: "هزار", study: "Arabic", speaks: "English", avoid: ["a czar", "hazard"] });
  assert.match(again.user, /Already suggested, so give different ones: a czar; hazard/);
  assert.doesNotMatch(again.user, /Its meaning/, "no meaning, no line for it");
  assert.doesNotMatch(again.user, /close to its meaning/);
  assert.deepEqual(p.schema.required, ["items"]);
});

test("the word's sounds spelled out, or a note about them, are dropped: they aren't words the learner knows", () => {
  for (const bad of ["now-ee-ah", "nah-wee-yah", "Nawiyah sounds like", "sounds a bit like nawiya"]) assert.equal(spelledOut(bad), true, bad);
  for (const good of ["now yeah", "Noah", "ice-cream", "know-how", "a czar", "hazard"]) assert.equal(spelledOut(good), false, good);
  assert.deepEqual(cleanItems({ items: ["now yeah", "Nawiyah sounds like", "now you ya", "now-ee-ah", "Noah"] }, "ناوية"),
    ["now yeah", "now you ya", "Noah"]);
});

test("the answer is tidied: numbering and quotes off, no repeats, never the word, at most five", () => {
  assert.deepEqual(cleanItems({ items: ['1. "a czar"', "2) hazard", "- has a ", "Hazard", "هزار", "", "who's are", "hah zar", "extra one"] }, "هزار"),
    ["a czar", "hazard", "has a", "who's are", "hah zar"]);
  assert.equal(MNEMONIC_COUNT, 5);
  assert.deepEqual(cleanItems(null), []);
  assert.deepEqual(cleanItems({ items: "not a list" }), []);
});

test("soundAlikes asks once and gives back the tidy list; an empty answer is an error", async () => {
  const asked = [];
  const ask = async (prompt) => { asked.push(prompt); return { items: ["a czar", "hazard", "has are", "his ar", "hah zar"] }; };
  assert.deepEqual(await soundAlikes({ text: "هزار", meaning: "joking" }, { ask, study: "Arabic", speaks: "English", avoid: ["old"] }),
    ["a czar", "hazard", "has are", "his ar", "hah zar"]);
  assert.equal(asked.length, 1);
  assert.match(asked[0].user, /Already suggested, so give different ones: old/);
  await assert.rejects(soundAlikes({ text: "x" }, { ask: async () => ({ items: [] }), study: "Arabic", speaks: "English" }), /No sound-alikes/);
});

test("askJson sends the learner's provider a small JSON question and reads the answer", async () => {
  const sent = [];
  const transport = async (req) => {
    sent.push(req);
    return { status: 200, text: JSON.stringify({ content: [{ type: "text", text: '{"items":["a czar"]}' }], usage: { input_tokens: 10, output_tokens: 5 } }) };
  };
  const cfg = { provider: "claude", key: "k", model: "claude-haiku-5-5" };
  const schema = { type: "object", properties: { items: { type: "array", items: { type: "string" } } }, required: ["items"], additionalProperties: false };
  assert.deepEqual(await askJson(cfg, { system: "S", user: "U", schema }, transport), { items: ["a czar"] });
  assert.equal(sent[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(sent[0].body.system, "S");
  assert.deepEqual(sent[0].body.messages, [{ role: "user", content: "U" }]);
  await assert.rejects(askJson({ ...cfg, key: "" }, { system: "S", user: "U", schema }, transport), (e) => e instanceof DefinerError && e.message === "NO_KEY");
  await assert.rejects(askJson(cfg, { system: "S", user: "U", schema }, async () => ({ status: 401, text: "{}" })),
    (e) => e instanceof DefinerError && e.keyRejected === true);
});

test("the Mnemonic maker's own model and thinking: fastest model and no thinking unless chosen", () => {
  const base = { provider: "claude", key: "k", model: "claude-opus-5-5" };
  assert.deepEqual(mnemonicConfig(base, {}), { ...base, model: PROVIDERS.claude.defaultModel, effort: "off" });
  assert.equal(mnemonicConfig(base, { mnemonic_model_claude: "same" }).model, "claude-opus-5-5");
  assert.equal(mnemonicConfig(base, { mnemonic_model_claude: "claude-sonnet-5-5", mnemonic_effort: "high" }).model, "claude-sonnet-5-5");
  assert.equal(mnemonicConfig(base, { mnemonic_effort: "medium" }).effort, "medium");
  assert.equal(mnemonicConfig(base, { mnemonic_effort: "nonsense" }).effort, "off");
  assert.equal(mnemonicConfig({ ...base, provider: "gemini" }, { mnemonic_model_claude: "x" }).model, PROVIDERS.gemini.defaultModel, "each provider has its own");
  assert.equal(thinkingFor("claude", "claude-haiku-4-5").ok, false);
  assert.equal(thinkingFor("gemini", "gemini-2.5-flash-lite").ok, false);
  assert.match(thinkingFor("claude", "claude-opus-5-5").note, /always thinks a little/);
  assert.deepEqual(thinkingFor("openai", "gpt-6-luna"), { ok: true, note: "" });
});

test("each provider is asked for the chosen thinking level its own way", async () => {
  const schema = { type: "object", properties: { items: { type: "array", items: { type: "string" } } }, required: ["items"], additionalProperties: false };
  const answers = {
    claude: { content: [{ type: "text", text: '{"items":[]}' }] },
    gemini: { candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }] },
    openai: { choices: [{ message: { content: '{"items":[]}' } }] },
  };
  answers.grok = answers.openai;
  const sent = async (provider, model, effort) => {
    let body;
    await askJson({ provider, key: "k", model, effort }, { system: "S", user: "U", schema },
      async (req) => { body = req.body; return { status: 200, text: JSON.stringify(answers[provider]) }; });
    return body;
  };
  let b = await sent("claude", "claude-haiku-5-5", "off");
  assert.deepEqual(b.thinking, { type: "disabled" });
  assert.equal(b.output_config.effort, "low");
  b = await sent("claude", "claude-sonnet-5-5", "off");
  assert.deepEqual(b.thinking, { type: "between_tools" });
  assert.equal(b.fallbacks, undefined, "no fallback alongside between_tools");
  b = await sent("claude", "claude-opus-5-5", "off");
  assert.equal(b.thinking, undefined, "Opus 5.5 can't switch thinking off");
  assert.equal(b.output_config.effort, "low");
  assert.equal(b.fallbacks, "default");
  b = await sent("claude", "claude-sonnet-5-5", "high");
  assert.equal(b.thinking, undefined);
  assert.equal(b.output_config.effort, "high");
  b = await sent("claude", "claude-haiku-5-5", undefined);
  assert.equal(b.thinking, undefined, "no effort given = the word lookups' low");
  assert.equal(b.output_config.effort, "low");
  assert.deepEqual((await sent("gemini", "gemini-3.1-flash-lite", "off")).generationConfig.thinkingConfig, { thinkingLevel: "minimal" });
  assert.deepEqual((await sent("gemini", "gemini-3.1-flash-lite", "medium")).generationConfig.thinkingConfig, { thinkingLevel: "medium" });
  assert.equal((await sent("openai", "gpt-6-luna", "off")).reasoning_effort, "none");
  assert.equal((await sent("openai", "gpt-6-luna", "high")).reasoning_effort, "high");
  assert.equal((await sent("grok", "grok-4.3", "off")).reasoning_effort, "low");
  assert.equal((await sent("grok", "grok-4.3", "medium")).reasoning_effort, "high");
});