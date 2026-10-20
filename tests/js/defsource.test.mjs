// Run with: node --test tests/js/
// The word popup's source tag and its menu (web/js/defsource.js): which sources are offered for a
// word's language, what choosing one saves (the Word definitions setting itself), and the
// "Use the dictionary instead" offer after an AI failure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { definerModeOf } from "../../web/js/definer.js";
import { FALLBACK, askAfresh, dictionaryNames, keyedProviders, offerDictionary, settingsFor, sourceChoices, switchSource, tagLabel }
  from "../../web/js/defsource.js";

const ids = (list) => list.map((c) => c.id);
const on = (list) => list.filter((c) => c.on).map((c) => c.id);
const here = (lang, names, extra = {}) => ({ lang, needed: names.length > 0, installed: true, bytes: 7e6, names, ...extra });

test("one AI choice for each provider with a key, the dictionary, and Dictionary first", () => {
  const s = { definer_mode: "ai", definer_provider: "gemini", llm_key_claude: "sk-ant-x", llm_key_gemini: "AIza-y" };
  const list = sourceChoices(s, here("es", ["mean-es"]));
  assert.deepEqual(ids(list), ["ai:claude", "ai:gemini", "dictionary", "dictionary_first"]);
  assert.deepEqual(on(list), ["ai:gemini"]);
  assert.equal(list[0].label, "Claude (Anthropic)");
  assert.equal(list[0].detail, "Claude Haiku 5.5"); // the model Settings would use
  assert.equal(list[2].detail, "Wiktionary");
  assert.equal(list[2].download, null); // on this device already
  assert.match(list[3].detail, /Gemini for the rest/);
});

test("a typed-in model and a key with spaces only", () => {
  const s = { llm_key_openai: "sk-x", definer_provider: "openai", definer_model_openai: "my-model", llm_key_grok: "   " };
  assert.deepEqual(keyedProviders(s), ["openai"]);
  const [ai] = sourceChoices({ ...s, definer_mode: "ai" }, null);
  assert.equal(ai.detail, "my-model");
  assert.equal(ai.on, true);
});

test("an unset setting is the default, Dictionary first, which is marked Recommended as in Settings", () => {
  const list = sourceChoices({ llm_key_claude: "k" }, here("es", ["mean-es"]));
  assert.deepEqual(on(list), ["dictionary_first"]);
  assert.deepEqual(list.filter((c) => c.recommended).map((c) => c.id), ["dictionary_first"]);
  // A new user with no key: the default is the dictionary alone in effect, and still shows as chosen.
  assert.deepEqual(on(sourceChoices({}, here("es", ["mean-es"]))), ["dictionary_first"]);
  assert.equal(tagLabel({}), "Dictionary first");
});

test("no key at all: one AI choice that leads to Settings, and no Dictionary first", () => {
  const list = sourceChoices({ definer_mode: "ai" }, here("fr", ["mean-fr"]));
  assert.deepEqual(ids(list), ["setup", "dictionary"]);
  assert.equal(list[0].kind, "setup");
  assert.equal(list[0].on, true);
  assert.deepEqual(settingsFor(list[0], {}), {}); // nothing is saved: it opens Settings
});

test("Dictionary first stays in the list while it is the setting, even after the key is removed", () => {
  const list = sourceChoices({ definer_mode: "dictionary_first" }, here("it", ["mean-it"]));
  assert.deepEqual(ids(list), ["setup", "dictionary", "dictionary_first"]);
  assert.deepEqual(on(list), ["dictionary_first"]);
  assert.match(list[2].detail, /Add an API key/);
});

test("a dictionary not on this device shows its download size, for both dictionary choices", () => {
  const list = sourceChoices({ llm_key_claude: "k" }, here("ru", ["mean-ru"], { installed: false, bytes: 6e6 }));
  assert.equal(list.find((c) => c.id === "dictionary").download, 6e6);
  assert.equal(list.find((c) => c.id === "dictionary_first").download, 6e6);
  // While the status isn't known yet, nothing is promised either way.
  assert.equal(sourceChoices({ llm_key_claude: "k" }, null).find((c) => c.id === "dictionary").download, null);
});

test("each language names its own dictionaries, in the order they are asked", () => {
  assert.equal(dictionaryNames("ar", ["mean-ar", "mean-arc"]), "Wiktionary + CAMeL Arabic");
  assert.equal(dictionaryNames("ceb", ["mean-ceb", "mean-cebw"]), "Wolff's dictionary + Wiktionary"); // Wolff's is asked first
  assert.equal(dictionaryNames("ja", ["mean-ja"]), "Wiktionary");
  assert.equal(sourceChoices({}, here("ceb", ["mean-ceb", "mean-cebw"])).find((c) => c.id === "dictionary").detail,
    "Wolff's dictionary + Wiktionary");
});

test("a language without a dictionary offers only AI, unless a dictionary setting must still show", () => {
  const none = { lang: "xx", needed: false, installed: false, bytes: 0, names: [] };
  assert.deepEqual(ids(sourceChoices({ definer_mode: "ai", llm_key_claude: "k" }, none)), ["ai:claude"]);
  // The default (Dictionary first) still shows as chosen there: the AI explains every word.
  const first = sourceChoices({ llm_key_claude: "k" }, none);
  assert.deepEqual(ids(first), ["ai:claude", "dictionary_first"]);
  assert.match(first[1].detail, /Claude explains every word/);
  const list = sourceChoices({ definer_mode: "dictionary", llm_key_claude: "k" }, none);
  assert.deepEqual(ids(list), ["ai:claude", "dictionary"]);
  assert.equal(list[1].unavailable, true);
  assert.equal(list[1].on, true);
  assert.equal(offerDictionary({ definer_mode: "ai" }, none), false);
});

test("what a choice saves is the Word definitions setting Settings uses", () => {
  const s = { definer_mode: "dictionary", definer_provider: "claude", llm_key_claude: "k", llm_key_grok: "g" };
  const list = sourceChoices(s, here("es", ["mean-es"]));
  const pick = (id) => settingsFor(list.find((c) => c.id === id), s);
  assert.deepEqual(pick("ai:grok"), { definer_mode: "ai", definer_provider: "grok" });
  assert.deepEqual(pick("dictionary"), { definer_mode: "dictionary" });
  assert.deepEqual(pick("dictionary_first"), { definer_mode: "dictionary_first" });
  for (const id of ["ai:grok", "dictionary", "dictionary_first"]) assert.equal(definerModeOf({ ...s, ...pick(id) }), pick(id).definer_mode);
  // Dictionary first with the chosen provider keyless takes one that has a key.
  assert.deepEqual(settingsFor(FALLBACK, { definer_provider: "openai", llm_key_gemini: "k" }),
    { definer_mode: "dictionary_first", definer_provider: "gemini" });
});

test("switching downloads a missing dictionary first, then saves; a failed download saves nothing", async () => {
  const run = async (choice, st, { fail = false } = {}) => {
    const done = [];
    const out = await switchSource(choice, {
      settings: { llm_key_claude: "k" }, shown: null,
      status: async () => st,
      downloading: () => done.push("downloading"),
      download: async () => { done.push("download"); if (fail) throw new Error("Couldn't download the dictionaries."); },
      save: async (patch) => done.push(patch),
    }).catch((e) => e.message);
    return { out, done };
  };
  const missing = here("es", ["mean-es"], { installed: false });
  const dictChoice = { id: "dictionary", kind: "dictionary" };
  assert.deepEqual((await run(dictChoice, missing)).done, ["downloading", "download", { definer_mode: "dictionary" }]);
  assert.deepEqual((await run(FALLBACK, missing)).done, ["downloading", "download", { definer_mode: "dictionary_first" }]);
  assert.deepEqual((await run(dictChoice, here("es", ["mean-es"]))).done, [{ definer_mode: "dictionary" }]);
  assert.deepEqual((await run({ id: "ai:claude", kind: "ai", provider: "claude" }, missing)).done,
    [{ definer_mode: "ai", definer_provider: "claude" }]); // an AI choice never downloads
  const failed = await run(dictChoice, missing, { fail: true });
  assert.equal(failed.out, "Couldn't download the dictionaries.");
  assert.deepEqual(failed.done, ["downloading", "download"]);
});

test("the word is asked afresh only when switching to another AI than the one on screen", () => {
  const gemini = { id: "ai:gemini", kind: "ai", provider: "gemini" };
  assert.equal(askAfresh(gemini, { provider: "claude", model: "claude-haiku-5-5" }), true);
  assert.equal(askAfresh(gemini, { provider: "gemini" }), false);
  assert.equal(askAfresh(gemini, { provider: "dictionary", model: "Wiktionary" }), false); // a kept AI answer is fine
  assert.equal(askAfresh(gemini, null), false); // after an error nothing was kept
  assert.equal(askAfresh({ kind: "dictionary" }, { provider: "claude" }), false);
});

test("the tag: the shown answer's source, or before one, the source the setting uses", () => {
  assert.equal(tagLabel({}, { provider: "dictionary", model: "Wiktionary" }), "Wiktionary");
  assert.equal(tagLabel({ definer_mode: "ai" }), "AI · Claude Haiku 5.5"); // e.g. after "Couldn't reach Claude"
  assert.equal(tagLabel({ definer_mode: "ai", definer_provider: "gemini" }), "AI · Gemini 3.1 Flash-Lite");
  assert.equal(tagLabel({ definer_mode: "dictionary" }), "Built-in dictionary");
  assert.equal(tagLabel({ definer_mode: "dictionary_first" }), "Dictionary first");
});

test("'Use the dictionary instead' is offered when AI alone is the setting", () => {
  assert.equal(offerDictionary({ definer_mode: "ai" }), true);
  assert.equal(offerDictionary({}), false); // unset = Dictionary first (the default)
  assert.equal(offerDictionary({ definer_mode: "dictionary_first" }), false); // the dictionary was asked already
  assert.equal(offerDictionary({ definer_mode: "dictionary" }), false);
  assert.equal(FALLBACK.kind, "dictionary_first"); // a key that works again still covers the words it lacks
});
