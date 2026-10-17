// The review card's Mnemonic maker (web/js/review/mnemonic.js): what the AI is asked, how its
// answer is tidied, and the general "ask for a JSON answer" call it goes through (definer.askJson).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MNEMONIC_COUNT, cleanItems, mnemonicPrompt, soundAlikes } from "../../web/js/review/mnemonic.js";
import { DefinerError, askJson } from "../../web/js/definer.js";

test("the AI is asked for sound-alikes in the learner's own language", () => {
  const p = mnemonicPrompt({ word: "هزار", meaning: "joking", study: "Arabic", speaks: "Spanish" });
  assert.match(p.system, /SOUND like it/);
  assert.match(p.system, /natural Spanish/);
  assert.match(p.system, /Never translate the word/);
  assert.match(p.user, /Arabic word: هزار/);
  assert.match(p.user, /Its meaning: joking/);
  assert.match(p.user, /Give 5 sound-alikes in Spanish/);
  assert.doesNotMatch(p.user, /Already suggested/);
  const again = mnemonicPrompt({ word: "هزار", study: "Arabic", speaks: "English", avoid: ["a czar", "hazard"] });
  assert.match(again.user, /Already suggested, so give different ones: a czar; hazard/);
  assert.doesNotMatch(again.user, /Its meaning/, "no meaning, no line for it");
  assert.deepEqual(p.schema.required, ["items"]);
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
