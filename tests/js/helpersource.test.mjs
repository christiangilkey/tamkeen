// Example sentences and the Mnemonic maker: free (on the device) or AI, as chosen in Settings → Word
// definitions (web/js/helpersource.js, components/freehelpers.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aiMakes, aiUsableFrom, chosenSource, failureToShow, madeByName } from "../../web/js/helpersource.js";

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

test("who made a set of keywords: Tamkeen, or the AI's short name", () => {
  const providers = { claude: { short: "Claude" }, openai: { short: "OpenAI" } };
  assert.equal(madeByName("free", providers), "Tamkeen");
  assert.equal(madeByName("", providers), "Tamkeen");
  assert.equal(madeByName(undefined, providers), "Tamkeen");
  assert.equal(madeByName("claude", providers), "Claude");
  assert.equal(madeByName("openai", providers), "OpenAI");
  assert.equal(madeByName("grok", providers), "grok", "an unknown provider shows its id rather than nothing");
});

test("the AI and then the free maker failed: which failure is shown", () => {
  const refused = Object.assign(new Error("Claude (Anthropic) rejected the API key."), { provider: "claude" });
  const offline = new Error("NO_KEYWORDS"), noSounds = new Error("NO_SOUNDS"), noPart = new Error("NO_PART_SOUND");
  assert.equal(failureToShow(refused, offline), refused, "the word list couldn't download: the AI's, with Troubleshoot");
  assert.equal(failureToShow(refused, noSounds), noSounds, "nothing to match in the word: the free maker's reason");
  assert.equal(failureToShow(refused, noPart), noPart);
  assert.equal(failureToShow(new Error("NO_KEY"), offline), offline, "no key: nothing to troubleshoot");
  assert.equal(failureToShow(null, offline), offline);
});

test("the Mnemonic maker falls back to Tamkeen's own on any AI failure and shows who made the keywords", () => {
  const src = readFileSync(new URL("web/js/review/cardtools.js", root), "utf8");
  const call = src.slice(src.indexOf("got = await makeMnemonics("), src.indexOf("mnemonics.set(uid, st);"));
  assert.match(call, /catch \(e\) \{[\s\S]*got = await free\(\)/, "any failure of the AI tries the free maker");
  assert.doesNotMatch(call, /if \(!\(e && e\.message === "NO_KEY"\)\) throw e;/, "not only a missing key");
  assert.match(call, /aiFailed = \{ provider, error: e \}/, "the failure is kept for the quiet note");
  assert.match(call, /source = provider;/, "an AI-made set records its provider");
  assert.match(src, /class="rv-mnemo-src"/, "the pill's place in the markup");
  assert.match(src, /madeByName\(st\.source, PROVIDERS\)/, "the pill names who made the set");
  assert.match(src, /troubleshootButton\(st\.aiFailed\.error\)/, "the quiet note keeps Troubleshoot");
});
