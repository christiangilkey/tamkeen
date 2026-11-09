// Who makes example sentences and mnemonics (Settings → Word definitions: Free or AI, helpersource.js):
// every place that chooses between the AI and the free helpers asks helpersource.js aiMakes, so choosing
// Free goes straight to the free ones, and an unset choice works as before (the AI when there's a key).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aiMakes } from "../../web/js/helpersource.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("aiMakes: the AI only when it can be used and Free wasn't chosen", () => {
  for (const kind of ["sentence", "mnemonic"]) {
    assert.equal(aiMakes({}, kind, true), true, `${kind}: unset with a key: the AI, as before`);
    assert.equal(aiMakes({}, kind, false), false, `${kind}: unset without a key: free`);
    assert.equal(aiMakes({ [`${kind}_source`]: "free" }, kind, true), false, `${kind}: Free chosen`);
    assert.equal(aiMakes({ [`${kind}_source`]: "ai" }, kind, false), false, `${kind}: AI chosen but no key`);
    assert.equal(aiMakes({ [`${kind}_source`]: "ai" }, kind, true), true);
  }
});

test("the review card's and the Vocab list's Mnemonic maker (review/cardtools.js)", () => {
  const src = read("web/js/review/cardtools.js");
  assert.match(src, /import \{ aiMakes \} from "\.\.\/helpersource\.js"/);
  assert.match(src, /if \(!aiMakes\(settings, "mnemonic", !noAi\(\) && !!definerConfig\(\)\.key\)\) got = await free\(\);/);
  assert.doesNotMatch(src, /if \(noAi\(\) \|\| !definerConfig\(\)\.key\)/, "no decision of its own left");
  assert.match(src, /const settings = \(app\.status && app\.status\.settings\) \|\| \{\};/);
});

test("the Sentence tool of the Vocab list and the review card (review/sentencefind.js, components/wordtools.js)", () => {
  const src = read("web/js/review/sentencefind.js");
  assert.match(src, /export const aiWrites = \(\) => aiMakes\(settings\(\), "sentence", aiUsable\(\)\);/);
  assert.match(src, /way = aiWrites\(\) \? "ai" : "free"/);
  assert.match(src, /SENTENCE_SOURCE = "#\/settings\?s=words&show=sentencesource"/);
  const tools = read("web/js/components/wordtools.js");
  assert.match(tools, /freeChosen\(\) \? `<a class="vi-link vi-sent-source" href="\$\{SENTENCE_SOURCE\}">AI can write them instead<\/a>`/);
});

test("Add words (components/wordbuilder.js): sentences and mnemonics by the choice, meanings as before", () => {
  const src = read("web/js/components/wordbuilder.js");
  assert.match(src, /const makes = \(kind\) => aiMakes\(settings\(\), kind, aiReady\(\)\);/);
  assert.match(src, /if \(!makes\("sentence"\) && choices\.sentence === "auto"\)/, "the sentence's note");
  assert.match(src, /const found = !makes\("sentence"\);/, "Found for you / Written for you");
  assert.match(src, /const aiSentences = makes\("sentence"\);/);
  assert.match(src, /const aiMnemonics = makes\("mnemonic"\);/);
  assert.match(src, /if \(!aiSentences\) \{/, "Free sentences are found, not written");
  assert.match(src, /if \(aiMnemonics\) \{ try \{ got = await aiMemo\(r\); \}/, "Mnemonic → Make one for me");
  assert.match(src, /const usesDictionary = \(\) => lookupMode\(\) !== "ai" \|\| !aiReady\(\);/, "the meaning lookup keeps aiReady");
  assert.match(src, /show=sentencesource/);
  assert.match(src, /show=mnemonicsource/);
});
