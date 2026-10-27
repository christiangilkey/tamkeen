// The review card's Mnemonic maker (web/js/review/mnemonic.js): what the AI is asked, how its answer is
// read, checked for sound and ranked (sound first, then the meaning), the English speakers' check against
// the CMU Pronouncing Dictionary, the keywords turned down, and the model it asks with (definer.js).
// No AI key here: the AI is a stand-in that returns a fixed answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  KEYWORD_ASK, MNEMONIC_COUNT, MNEMONIC_SCHEMA, SPLIT_COUNT, cleanKeyword, englishSounds, makeMnemonics, mnemonicPrompt, noteText,
  rankSuggestions, readKeywords, readParts, readPronunciation, spelledOut, syllableLine, syllablePieces, turnDown, turnedDown, varietyOf,
} from "../../web/js/review/mnemonic.js";
import { LemmaTable } from "../../web/js/lexicon/romance.js";
import { DefinerError, PROVIDERS, askJson, askMnemonicJson, mnemonicCents, mnemonicConfig, thinkingFor } from "../../web/js/definer.js";

const table = new LemmaTable(JSON.parse(gunzipSync(readFileSync(new URL("../../docs/lexicon/en-lemmas.json.gz", import.meta.url)))));
const english = englishSounds(table);

// What a model might answer for نية (intention): two good keywords, and the kinds of bad ones the owner saw.
const NIYYA = {
  pronunciation: { romanization: "niyya", ipa: "nij.ja", syllables: [{ text: "niy", ipa: "nij" }, { text: "ya", ipa: "ja" }], stress: 0 },
  keywords: [
    { keyword: "knee yeah", ipa: "ni jæ", covers: [0, 1], meaning_link: "loose", link: "saying yes to a plan", scene: "Your knee shouts YEAH as you sign a promise." },
    { keyword: "now yeah", ipa: "naʊ jæ", covers: [0, 1], meaning_link: "none", link: "", scene: "Now, yeah." },
    { keyword: "need ya", ipa: "nid jə", covers: [0, 1], meaning_link: "strong", link: "needing is intending", scene: "\"I need ya,\" your heart says, and means it." },
    { keyword: "nah-wee-yah", ipa: "nɑwija", covers: [0, 1], meaning_link: "none", link: "", scene: "" },
    { keyword: "intention", ipa: "ɪnˈtɛnʃən", covers: [], meaning_link: "strong", link: "the meaning itself", scene: "" },
    { keyword: "neeya", ipa: "nija", covers: [0, 1], meaning_link: "none", link: "", scene: "" },
    { keyword: "Knee yeah", ipa: "ni jæ", covers: [0, 1], meaning_link: "loose", link: "", scene: "a repeat" },
  ],
  parts: [],
};

test("the AI is asked for the word's pronunciation first, then many keywords, each with its sounds, meaning link and a picture", () => {
  const p = mnemonicPrompt({ word: "نية", meaning: "intention", study: "Arabic", speaks: "Spanish", reading: "نِيَّة", variety: "Egyptian Arabic", avoid: ["a czar", "hazard"] });
  assert.match(p.system, /First work out exactly how the Arabic word is said in Egyptian Arabic/);
  assert.match(p.system, /its IPA, its syllables/);
  assert.match(p.system, /which syllable is stressed/);
  assert.match(p.system, new RegExp(`find ${KEYWORD_ASK} keywords`));
  assert.match(p.system, /real Spanish words/);
  assert.match(p.system, /the first sound and the stressed syllable matter most/);
  assert.match(p.system, /Never spell out the word's sounds/);
  assert.match(p.system, /never translate the word/);
  assert.match(p.system, /"strong" when the keyword itself already points to the word's meaning/);
  assert.match(p.system, /"scene", one sentence in Spanish/);
  assert.match(p.system, /Sound comes first/);
  assert.match(p.system, /3 or more syllables, also give up to 3 split keywords/);
  assert.match(p.user, /Arabic word: نية/);
  assert.match(p.user, /Its meaning: intention/);
  assert.match(p.user, /How it is said, from the app's dictionary: نِيَّة/);
  assert.match(p.user, /Already suggested or turned down, so give different ones: a czar; hazard/);
  const plain = mnemonicPrompt({ word: "pato", study: "Spanish", speaks: "English" });
  assert.doesNotMatch(plain.user, /Its meaning|app's dictionary|Already suggested/);
  assert.doesNotMatch(plain.system, / said in /, "no variety chosen: none named");
  assert.deepEqual(p.schema.required, ["pronunciation", "keywords", "parts"]);
  assert.deepEqual(MNEMONIC_SCHEMA.properties.keywords.items.required, ["keyword", "ipa", "covers", "meaning_link", "link", "scene"]);
  assert.deepEqual(MNEMONIC_SCHEMA.properties.keywords.items.properties.meaning_link.enum, ["strong", "loose", "none"]);
});

test("the dialect or country the learner chose is the variety the word is matched in", () => {
  assert.equal(varietyOf("ar", "EG", "Arabic"), "Egyptian Arabic");
  assert.equal(varietyOf("ar", "LB", "Arabic"), "Levantine Arabic");
  assert.equal(varietyOf("ar", "AE", "Arabic"), "Gulf Arabic");
  assert.equal(varietyOf("es", "ES", "Spanish"), "Spanish as spoken in Spain");
  assert.equal(varietyOf("pt", "PT", "Portuguese"), "Portuguese as spoken in Portugal");
  assert.equal(varietyOf("ar", "", "Arabic"), "", "never picked: nothing said");
  assert.equal(varietyOf("ja", "JP", "Japanese"), "", "one country only: nothing to choose");
});

test("the word's pronunciation is read, and shown as syllables with the stressed one in capitals", () => {
  const pron = readPronunciation(NIYYA);
  assert.equal(syllableLine(pron), "NIY-ya");
  assert.deepEqual(syllablePieces(pron).map((x) => x.stressed), [true, false]);
  assert.equal(syllableLine(readPronunciation({ pronunciation: { romanization: "mao", ipa: "mau", syllables: [{ text: "māo", ipa: "mau" }], stress: 0 } })), "māo",
    "one syllable: nothing in capitals");
  assert.equal(readPronunciation({ pronunciation: { romanization: "x", ipa: "", syllables: [{ text: "pa" }], stress: 5 } }).stress, -1);
  assert.equal(readPronunciation({}), null);
  assert.equal(syllableLine(null), "");
});

test("keywords are tidied: numbering and quotes off, never the word, nothing spelled out, no repeats", () => {
  const ks = readKeywords(NIYYA, "نية");
  assert.deepEqual(ks.map((k) => k.keyword), ["knee yeah", "now yeah", "need ya", "intention", "neeya"]);
  assert.deepEqual(ks.map((k) => k.link), [1, 0, 2, 2, 0]);
  assert.deepEqual(readKeywords({ keywords: [{ keyword: '1. "pot"' }, { keyword: "pato" }, { keyword: "Pot" }] }, "pato").map((k) => k.keyword), ["pot"]);
  assert.deepEqual(readKeywords({ items: ["a czar", "Nawiyah sounds like"] }).map((k) => k.keyword), ["a czar"], "an older answer's plain list still reads");
  assert.equal(cleanKeyword("  - «hairy   son» "), "hairy son");
  for (const bad of ["now-ee-ah", "nah-wee-yah", "Nawiyah sounds like", "sounds a bit like nawiya"]) assert.equal(spelledOut(bad), true, bad);
  for (const good of ["now yeah", "Noah", "ice-cream", "know-how"]) assert.equal(spelledOut(good), false, good);
  assert.deepEqual(readKeywords(null), []);
});

test("checked and ranked: what doesn't sound like the word (or isn't English) is dropped; the meaning decides among the rest", () => {
  const pron = readPronunciation(NIYYA);
  const { items, checked } = rankSuggestions({ pron, keywords: readKeywords(NIYYA, "نية"), ownSounds: english });
  assert.equal(checked, true);
  // "now yeah" sounds wrong (its first vowel), "intention" is a translation, "neeya" isn't an English word.
  assert.deepEqual(items.map((s) => s.keyword), ["need ya", "knee yeah"], "the one that points to the meaning first");
  assert.deepEqual(items.map((s) => s.sound), ["close", "close"]);
  assert.equal(items[0].heard, "dictionary", "English sounds from the CMU dictionary");
  assert.deepEqual([items[1].from, items[1].to], [0, 1], "it sounds like both syllables");
  // Among keywords with the same link, the closer sound comes first; never more than five.
  const many = { keywords: ["ant", "enter", "an tea", "aunt", "ants", "end", "ante"].map((keyword) => ({ keyword, ipa: "", covers: [], meaning_link: "none" })) };
  const ente = { romanization: "ente", ipa: "ɛntə", syllables: [{ text: "en", ipa: "ɛn" }, { text: "te", ipa: "tə" }], stress: 0 };
  const ranked = rankSuggestions({ pron: ente, keywords: readKeywords(many, "Ente"), ownSounds: english }).items;
  assert.equal(ranked.length, MNEMONIC_COUNT);
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].score >= ranked[i].score);
  // Only a keyword that points to the meaning ("strong") jumps the queue; a loose link counts a little.
  const arabiyya = { romanization: "ʕarabiyya", ipa: "ʕarabijja", syllables: ["ʕa", "ra", "bij", "ja"].map((s) => ({ text: s, ipa: s })), stress: 2 };
  const mixed = readKeywords({ keywords: [
    { keyword: "Arabia", ipa: "", meaning_link: "loose" },        // only a partial match
    { keyword: "are a bee ya", ipa: "", meaning_link: "none" },   // a close one
  ] });
  assert.deepEqual(rankSuggestions({ pron: arabiyya, keywords: mixed, ownSounds: english }).items.map((s) => [s.keyword, s.sound]),
    [["are a bee ya", "close"], ["Arabia", "partial"]]);
  // Turned down: never shown again (whatever its case).
  const kept = rankSuggestions({ pron, keywords: readKeywords(NIYYA, "نية"), ownSounds: english, avoid: ["Need Ya"] }).items;
  assert.deepEqual(kept.map((s) => s.keyword), ["knee yeah"]);
});

test("for English speakers the CMU dictionary's sounds are used, not the AI's guess", () => {
  assert.equal(english("ant"), "ˈænt");
  assert.equal(english("cab eye-yo"), "ˈkæb ˈaɪ ˈjoʊ");
  assert.equal(english("shmetter"), null, "not an English word");
  assert.equal(englishSounds(null)("ant"), undefined, "no table: the AI's IPA is used");
  const ente = { romanization: "ente", ipa: "ɛntə", syllables: [{ text: "en", ipa: "ɛn" }, { text: "te", ipa: "tə" }], stress: 0 };
  // The AI claims "dog" sounds like Ente; the dictionary knows better.
  const lie = { keywords: [{ keyword: "dog", ipa: "ɛntə", covers: [0, 1], meaning_link: "none" }] };
  assert.equal(rankSuggestions({ pron: ente, keywords: readKeywords(lie), ownSounds: english }).items.length, 0);
  assert.equal(rankSuggestions({ pron: ente, keywords: readKeywords(lie), ownSounds: null }).items.length, 1, "for other languages the AI's IPA is all there is");
});

test("a long word also gets split keywords, each piece shown with the syllables it covers", () => {
  const answer = {
    pronunciation: { romanization: "shmetterling", ipa: "ʃmɛtɐlɪŋ", syllables: [{ text: "schmet", ipa: "ʃmɛ" }, { text: "ter", ipa: "tɐ" }, { text: "ling", ipa: "lɪŋ" }], stress: 0 },
    keywords: [{ keyword: "shimmer", ipa: "ˈʃɪmɚ", covers: [0], meaning_link: "loose", link: "wings shimmer", scene: "A butterfly's wings shimmer." }],
    parts: [
      { pieces: [{ keyword: "shatter", ipa: "ˈʃætɚ", covers: [0, 1] }, { keyword: "ling", ipa: "lɪŋ", covers: [2] }], meaning_link: "loose", link: "", scene: "A butterfly shatters a ling fish." },
      { pieces: [{ keyword: "shmetter", ipa: "ʃmɛtɚ", covers: [0, 1] }, { keyword: "ling", ipa: "lɪŋ", covers: [2] }], meaning_link: "none", link: "", scene: "" },
      { pieces: [{ keyword: "only one", ipa: "", covers: [] }], meaning_link: "none", link: "", scene: "" },
    ],
  };
  const parts = readParts(answer);
  assert.deepEqual(parts.map((p) => p.keyword), ["shatter + ling", "shmetter + ling"], "a split keyword has 2 or 3 pieces");
  const { items, parts: shown } = rankSuggestions({ pron: readPronunciation(answer), keywords: readKeywords(answer), parts, ownSounds: english });
  assert.deepEqual(shown.map((p) => p.keyword), ["shatter + ling"], "\"shmetter\" isn't English");
  assert.deepEqual(shown[0].pieces.map((p) => [p.keyword, p.from, p.to]), [["shatter", 0, 1], ["ling", 2, 2]]);
  assert.ok(shown.length <= SPLIT_COUNT);
  assert.deepEqual(items.map((s) => s.keyword), ["shimmer"]);
  // A short word never shows split keywords.
  assert.equal(rankSuggestions({ pron: readPronunciation(NIYYA), parts }).parts.length, 0);
});

test("makeMnemonics asks once, waits for the dictionary, and is honest when nothing sounds right", async () => {
  const asked = [];
  const ask = async (prompt) => { asked.push(prompt); return NIYYA; };
  const got = await makeMnemonics({ text: "نية", meaning: "intention" }, { ask, study: "Arabic", speaks: "English", avoid: ["old"], reading: "نِيَّة",
    ownSounds: new Promise((resolve) => setTimeout(() => resolve(english), 5)) });
  assert.equal(asked.length, 1);
  assert.match(asked[0].user, /Already suggested or turned down, so give different ones: old/);
  assert.equal(syllableLine(got.pron), "NIY-ya");
  assert.deepEqual(got.items.map((s) => s.keyword), ["need ya", "knee yeah"]);
  assert.equal(got.asked, 5);
  // Nothing passes: no error, an empty list (the card says so).
  const none = await makeMnemonics({ text: "نية" }, { ask: async () => ({ ...NIYYA, keywords: [{ keyword: "banana", ipa: "bəˈnænə", meaning_link: "none" }] }), study: "Arabic", speaks: "English", ownSounds: english });
  assert.deepEqual(none.items, []);
  // The dictionary failing to load: the AI's IPA is used.
  const noDict = await makeMnemonics({ text: "نية" }, { ask, study: "Arabic", speaks: "English", ownSounds: Promise.reject(new Error("offline")) });
  assert.ok(noDict.items.some((s) => s.keyword === "neeya"), "without the dictionary, the AI's word is taken on trust");
  // The word's sounds missing: shown unchecked, by meaning.
  const unchecked = await makeMnemonics({ text: "نية" }, { ask: async () => ({ ...NIYYA, pronunciation: null }), study: "Arabic", speaks: "English" });
  assert.equal(unchecked.checked, false);
  assert.equal(unchecked.items[0].sound, "");
  await assert.rejects(makeMnemonics({ text: "x" }, { ask: async () => ({ keywords: [] }), study: "Arabic", speaks: "English" }), /No sound-alikes/);
  assert.equal(noteText({ keyword: "knee yeah", scene: "A knee says yeah." }), "knee yeah — A knee says yeah.");
  assert.equal(noteText({ keyword: "pot", scene: "" }), "pot");
});

test("a keyword turned down is kept on this device for that word, and never asked for again", () => {
  const data = new Map();
  const store = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
  turnDown(store, "w1", "now yeah");
  turnDown(store, "w1", "Now Yeah");
  turnDown(store, "w1", "neeya");
  turnDown(store, "w2", "dog");
  assert.deepEqual(turnedDown(store, "w1"), ["Now Yeah", "neeya"], "once each, the latest spelling");
  assert.deepEqual(turnedDown(store, "w2"), ["dog"]);
  assert.deepEqual(turnedDown(store, "w3"), []);
  for (let i = 0; i < 60; i++) turnDown(store, "w1", `k${i}`);
  assert.equal(turnedDown(store, "w1").length, 40, "at most 40 a word");
  data.set("mnemonicAvoid", "not json");
  assert.deepEqual(turnedDown(store, "w1"), [], "a broken store is an empty one");
  turnDown(null, "w1", "x");  // no storage: nothing happens
});

test("the Mnemonic maker's model: a step up from the cheapest, unless the lookups' model is stronger; its own choice wins", () => {
  const base = { provider: "claude", key: "k", model: "claude-haiku-5-5" };
  assert.deepEqual(mnemonicConfig(base, {}), { ...base, model: "claude-sonnet-5-5", effort: "off", fallback: "claude-haiku-5-5" });
  assert.deepEqual(mnemonicConfig({ ...base, model: "claude-opus-5-5" }, {}), { ...base, model: "claude-opus-5-5", effort: "off" }, "a stronger lookups' model is used");
  assert.equal(mnemonicConfig({ ...base, model: "claude-sonnet-5-5" }, {}).fallback, undefined);
  assert.equal(mnemonicConfig({ ...base, model: "my-own-model" }, {}).fallback, "my-own-model", "a typed-in model: the recommended one, falling back to it");
  assert.equal(mnemonicConfig(base, { mnemonic_model_claude: "same" }).model, "claude-haiku-5-5");
  assert.equal(mnemonicConfig(base, { mnemonic_model_claude: "same" }).fallback, undefined);
  assert.equal(mnemonicConfig(base, { mnemonic_model_claude: "claude-opus-5-5", mnemonic_effort: "high" }).model, "claude-opus-5-5");
  assert.equal(mnemonicConfig(base, { mnemonic_effort: "medium" }).effort, "medium");
  assert.equal(mnemonicConfig(base, { mnemonic_effort: "nonsense" }).effort, "off");
  for (const [p, info] of Object.entries(PROVIDERS)) {
    const strong = info.models.find((m) => m.id === info.mnemonicModel);
    assert.ok(strong, `${p}: its Mnemonic maker model is one of its list`);
    assert.ok(mnemonicCents(strong) <= 2.5, `${p}: a press costs about ${mnemonicCents(strong).toFixed(2)} US cents`);
    assert.equal(mnemonicConfig({ provider: p, key: "k", model: info.defaultModel }, {}).model, info.mnemonicModel);
  }
  assert.equal(thinkingFor("claude", "claude-haiku-4-5").ok, false);
  assert.equal(thinkingFor("gemini", "gemini-2.5-flash-lite").ok, false);
  assert.match(thinkingFor("claude", "claude-opus-5-5").note, /always thinks a little/);
  assert.deepEqual(thinkingFor("openai", "gpt-6-luna"), { ok: true, note: "" });
});

test("when the key can't use the recommended model, the lookups' model answers, from then on straight away", async () => {
  const ok = { choices: [{ message: { content: '{"keywords":[]}' } }] };
  const sent = [];
  const transport = async (req) => {
    sent.push(req.body.model);
    if (req.body.model === "gpt-6.1-sol") return { status: 404, text: JSON.stringify({ error: { message: "The model `gpt-6.1-sol` does not exist or you do not have access to it." } }) };
    return { status: 200, text: JSON.stringify(ok) };
  };
  const base = { provider: "openai", key: "k", model: "gpt-6-luna" };
  let used = "";
  assert.deepEqual(await askMnemonicJson(base, {}, { system: "S", user: "U", schema: MNEMONIC_SCHEMA }, transport, (m) => { used = m; }), { keywords: [] });
  assert.equal(used, "gpt-6-luna");
  assert.deepEqual(sent, ["gpt-6.1-sol", "gpt-6-luna"]);
  await askMnemonicJson(base, {}, { system: "S", user: "U", schema: MNEMONIC_SCHEMA }, transport);
  assert.deepEqual(sent.slice(2), ["gpt-6-luna"], "the refused model isn't tried again in this run");
  // A model the learner chose themselves: its failure is shown, nothing else is tried.
  await assert.rejects(askMnemonicJson(base, { mnemonic_model_openai: "gpt-6.1-sol" }, { system: "S", user: "U", schema: MNEMONIC_SCHEMA }, transport),
    (e) => e instanceof DefinerError && e.kind === "model");
  // A failure the other model would share (the network) isn't retried.
  const down = async () => ({ status: 0, text: "" });
  await assert.rejects(askMnemonicJson({ provider: "grok", key: "k", model: "grok-4.3" }, {}, { system: "S", user: "U", schema: MNEMONIC_SCHEMA }, down),
    (e) => e instanceof DefinerError && e.kind === "network");
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

test("the new answer's outline reaches every provider in the form it takes", async () => {
  const answers = {
    claude: { content: [{ type: "text", text: '{"keywords":[]}' }] },
    gemini: { candidates: [{ content: { parts: [{ text: '{"keywords":[]}' }] } }] },
    openai: { choices: [{ message: { content: '{"keywords":[]}' } }] },
  };
  answers.grok = answers.openai;
  const bodies = {};
  for (const provider of Object.keys(PROVIDERS)) {
    await askJson({ provider, key: "k", model: PROVIDERS[provider].mnemonicModel, effort: "off" }, mnemonicPrompt({ word: "pato", study: "Spanish", speaks: "English" }),
      async (req) => { bodies[provider] = req.body; return { status: 200, text: JSON.stringify(answers[provider]) }; });
  }
  assert.deepEqual(bodies.claude.output_config.format.schema, MNEMONIC_SCHEMA);
  const g = bodies.gemini.generationConfig.responseSchema;
  assert.equal(g.type, "OBJECT");
  assert.equal(g.properties.keywords.items.properties.covers.items.type, "INTEGER");
  assert.equal(JSON.stringify(g).includes("additionalProperties"), false, "Gemini takes no additionalProperties");
  assert.equal(bodies.openai.response_format.json_schema.strict, true);
  // OpenAI's strict outlines need every property listed as required, all the way down.
  const strict = (s) => !s.properties || (Object.keys(s.properties).every((k) => s.required.includes(k) && strict(s.properties[k])) && s.additionalProperties === false)
    && (!s.items || strict(s.items));
  assert.ok(strict(MNEMONIC_SCHEMA));
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
