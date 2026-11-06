// Example sentences and the Mnemonic maker: free (on the device) or AI, as chosen in Settings → Word
// definitions (web/js/helpersource.js, components/freehelpers.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aiMakes, aiUsableFrom, chosenSource } from "../../web/js/helpersource.js";

const root = new URL("../../", import.meta.url);

test("the choice: free, AI, or not chosen", () => {
  assert.equal(chosenSource({ sentence_source: "free" }, "sentence"), "free");
  assert.equal(chosenSource({ mnemonic_source: "ai" }, "mnemonic"), "ai");
  assert.equal(chosenSource({ mnemonic_source: "odd" }, "mnemonic"), "");
  assert.equal(chosenSource(undefined, "sentence"), "");
});

test("the AI makes them only when it can and free wasn't chosen", () => {
  assert.equal(aiMakes({}, "sentence", true), true, "not chosen, with AI: the AI, as before");
  assert.equal(aiMakes({}, "sentence", false), false, "not chosen, no AI: free, as before");
  assert.equal(aiMakes({ sentence_source: "free" }, "sentence", true), false, "free chosen beats a key");
  assert.equal(aiMakes({ mnemonic_source: "ai" }, "mnemonic", false), false, "AI chosen but no key: free for now");
  assert.equal(aiMakes({ sentence_source: "free" }, "mnemonic", true), true, "each kind is its own choice");
});

test("AI can be used: not turned off, and a key for the chosen provider", () => {
  assert.equal(aiUsableFrom({ llm_key_claude: "k" }), true);
  assert.equal(aiUsableFrom({ llm_key_claude: "k", definer_mode: "dictionary" }), false);
  assert.equal(aiUsableFrom({ definer_provider: "gemini", llm_key_claude: "k" }), false);
  assert.equal(aiUsableFrom({ definer_provider: "gemini", llm_key_gemini: " g " }), true);
  assert.equal(aiUsableFrom({}), false);
});

test("the card is in Word definitions on the computer and the phone, and in both builds", () => {
  for (const f of ["web/js/pages/settings.js", "mobile/src/js/pages/settings.js"]) {
    const s = readFileSync(new URL(f, root), "utf8");
    assert.ok(s.includes("freeHelpersCard(body)"), `${f} shows the card`);
  }
  const www = readFileSync(new URL("mobile/scripts/build-www.mjs", root), "utf8");
  assert.ok(www.includes('"js/components/freehelpers.js"') && www.includes('"js/helpersource.js"'));
  const card = readFileSync(new URL("web/js/components/freehelpers.js", root), "utf8");
  for (const k of ["sentence", "mnemonic"]) assert.ok(card.includes(`${k}: {`), `a row for ${k}`);
  assert.ok(card.includes("explainFreeHelper"), "each row has How it works");
});
