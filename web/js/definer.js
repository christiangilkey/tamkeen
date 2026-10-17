// Context-aware word definer for the language being studied. Shared by the desktop app and the Android app.
//
// One request per lookup: the word, its sentence and the neighbouring sentences go to the
// user's chosen AI provider with their own API key, and a schema-constrained JSON answer
// comes back. The HTTP transport is injected (desktop relays through its local server to
// avoid browser CORS limits; Android uses native HTTP), so this file has no platform code.

import { isLanguage, gap } from "./languages.js";
import { EDGE_PUNCT } from "./wordlookup.js";
import { problemKind } from "./trouble.js";

// `defaultModel` is each provider's best value for this job: the cheapest of its current models
// that explains a word well (a lookup is a short question and a short structured answer, so the
// small models do it properly). `models` is what Settings offers, cheapest first, with a note on
// each; a user can also type any other model name. `in` and `out` are the provider's prices in US
// cents per million tokens (word-pieces) read and written, from their own price lists in October 2026.
export const PROVIDERS = {
  claude: {
    label: "Claude (Anthropic)",
    short: "Claude",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-haiku-5-5",
    models: [
      { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", in: 10, out: 50, note: "lowest cost" },
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", in: 200, out: 1000, note: "more thorough" },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5", in: 400, out: 2000, note: "most thorough" },
    ],
  },
  gemini: {
    label: "Gemini (Google)",
    short: "Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-3.1-flash-lite",
    models: [
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", in: 25, out: 150, note: "lowest cost of the current models; free allowance" },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", in: 30, out: 250, note: "newer" },
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", in: 75, out: 375, note: "most thorough" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", in: 10, out: 40, note: "older model, cheapest of all" },
    ],
  },
  openai: {
    label: "ChatGPT (OpenAI)",
    short: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-6-luna",
    models: [
      { id: "gpt-6-luna", name: "GPT-6 Luna", in: 10, out: 50, note: "lowest cost" },
      { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", in: 200, out: 1000, note: "more thorough" },
      { id: "gpt-6-astra", name: "GPT-6 Astra", in: 1000, out: 5000, note: "most thorough" },
    ],
  },
  grok: {
    label: "Grok (xAI)",
    short: "Grok",
    keyUrl: "https://console.x.ai/",
    defaultModel: "grok-4.3",
    models: [
      { id: "grok-4.3", name: "Grok 4.3", in: 125, out: 250, note: "lowest cost of the general models" },
      { id: "grok-4.7", name: "Grok 4.7", in: 200, out: 600, note: "newest" },
    ],
  },
};

// What one word lookup uses, roughly: the instructions, the sentence and the answer's outline go in,
// a short structured answer comes out. An estimate from the size of the request, not a measurement.
export const LOOKUP_TOKENS = { in: 850, out: 400 };
/** About how many lookups a million tokens pays for. */
export const LOOKUPS_PER_MILLION = Math.round(1e6 / (LOOKUP_TOKENS.in + LOOKUP_TOKENS.out));

/** A model's price as one number: US cents per million tokens, in the mix of reading and writing
 * that a lookup uses (providers charge less for text read than for text written). */
export function centsPerMillion(model) {
  const total = LOOKUP_TOKENS.in + LOOKUP_TOKENS.out;
  return Math.round((model.in * LOOKUP_TOKENS.in + model.out * LOOKUP_TOKENS.out) / total);
}

/** A key as it should be stored, however it was pasted: no spaces, line breaks, invisible
 * characters or quote marks around or inside it (a key never contains any of those). */
export const cleanKey = (text) => String(text ?? "").replace(/[\s\u200B-\u200D\u2060\uFEFF"'`“”‘’]/g, "");

/** Which provider a key comes from, judged by how it starts; "" when that can't be told. */
export function keyProvider(key) {
  const k = cleanKey(key);
  if (k.startsWith("sk-ant-")) return "claude";
  if (k.startsWith("xai-")) return "grok";
  if (k.startsWith("AIza")) return "gemini";
  if (k.startsWith("sk-")) return "openai";
  return "";
}

/** The model a provider's key is used with: the one chosen in Settings, else the provider's default. */
export const modelFor = (provider, settings) =>
  (settings && settings[`definer_model_${provider}`]) || PROVIDERS[provider].defaultModel;

// ---------- the Mnemonic maker's own model and thinking (Settings, under Word definitions) ----------
/** How hard the model may think before it answers. "off" = as little as the model allows: the fastest. */
export const THINKING = [
  { id: "off", name: "Off", note: "fastest" },
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High", note: "slowest" },
];
/** The Mnemonic maker's model setting meaning "the model the word lookups use". */
export const SAME_MODEL = "same";

/** What the Mnemonic maker asks with: the lookups' provider and key (`base`, a definerConfig), its
 * own model (setting mnemonic_model_<provider>: "" = the provider's fastest, the recommended one;
 * "same" = the lookups' model) and its own thinking level (mnemonic_effort, "off" unless set). */
export function mnemonicConfig(base, settings) {
  const s = settings || {};
  const pick = s[`mnemonic_model_${base.provider}`] || "";
  const model = pick === SAME_MODEL ? base.model : pick || PROVIDERS[base.provider].defaultModel;
  const effort = THINKING.some((t) => t.id === s.mnemonic_effort) ? s.mnemonic_effort : "off";
  return { ...base, model, effort };
}

/** Can the thinking level be set for this model? {ok, note}: `note` says how "Off" works where it
 * can't be switched off entirely. (Haiku 4.5 and older, and Gemini 2.x, take no thinking level.) */
export function thinkingFor(provider, model) {
  if (provider === "claude" && /^claude-haiku-[34]/.test(model)) return { ok: false, note: "" };
  if (provider === "gemini" && /^gemini-2/.test(model)) return { ok: false, note: "" };
  if (provider === "claude" && /^claude-(opus-5-5|fable)/.test(model)) {
    return { ok: true, note: "This model always thinks a little: Off means as little as it can." };
  }
  return { ok: true, note: "" };
}

// What the AI teacher is told about each language. The answer always has the same fields (so the
// popup and saved answers work for every language); only what goes in them differs:
//   vocalized       how the word is read: vowel marks, stress, kana, pinyin or IPA
//   root            Arabic root letters, or a character-by-character breakdown for Japanese/Chinese
//   dialect         the variety or register the word belongs to
//   msa_equivalent  the standard-language equivalent of a regional or slang word
const TEACH = {
  ar: {
    name: "Arabic",
    variety: "which may be in Modern Standard Arabic or any dialect",
    why: "Arabic words are highly context-dependent (unvocalized spelling, attached clitics, dialect usage)",
    vocalized: "The word with full tashkeel, as pronounced in this sentence.",
    lemma: "Dictionary form, vocalized (past-tense 3ms for verbs, singular for nouns).",
    root: "Root letters separated by spaces, e.g. 'ك ت ب'; empty for particles/loanwords.",
    morphology: "Short analysis: verb form/tense/person, attached prefixes and pronouns, etc.",
    dialect: "MSA, Levantine, Egyptian, Gulf, Iraqi, Maghrebi, or similar.",
    dialect_note: "Dialect-specific usage note; empty if none.",
    msa_equivalent: "MSA equivalent if the word is dialectal; empty otherwise.",
  },
  es: {
    name: "Spanish",
    variety: "which may be from Spain or anywhere in Latin America, formal or colloquial",
    why: "Spanish words change meaning with context (verb endings that hide the subject, attached pronouns, regional vocabulary and slang)",
    vocalized: "Pronunciation in IPA as said in this variety, e.g. '/aoˈɾita/'.",
    lemma: "Dictionary form (infinitive for verbs, masculine singular for nouns and adjectives), with its article for nouns.",
    root: "Empty string.",
    morphology: "Short analysis: tense, mood, person and number; attached pronouns; gender and number.",
    dialect: "Standard, or the region or register if notable: Mexican, Rioplatense, Caribbean, Peninsular, colloquial, slang, etc.",
    dialect_note: "Regional or register usage note (where it is said, how formal it is); empty if none.",
    msa_equivalent: "The neutral, widely understood equivalent if the word is regional or slang; empty otherwise.",
  },
  fr: {
    name: "French",
    variety: "which may be from France, Quebec, Belgium, Switzerland or Africa, formal or colloquial",
    why: "French words change meaning with context (elided articles and pronouns such as l', j', qu', many forms that sound alike, colloquial speech and slang)",
    vocalized: "Pronunciation in IPA, e.g. '/tʁyk/'.",
    lemma: "Dictionary form (infinitive for verbs, masculine singular for nouns and adjectives), with its article for nouns.",
    root: "Empty string.",
    morphology: "Short analysis: tense, mood, person and number; elided or attached parts (l', n', -t-il); gender and number.",
    dialect: "Standard, or the region or register if notable: colloquial, slang, verlan, Quebec, Belgian, literary, etc.",
    dialect_note: "Regional or register usage note (how formal it is, where it is said); empty if none.",
    msa_equivalent: "The neutral standard equivalent if the word is slang, verlan or regional; empty otherwise.",
  },
  ja: {
    name: "Japanese",
    variety: "which may be polite, casual or in a regional dialect",
    why: "Japanese is written without spaces and leans on context (dropped subjects, particles, many readings per kanji, levels of politeness)",
    vocalized: "The reading of the word in hiragana as said in this sentence, followed by romaji in parentheses, e.g. 'たべます (tabemasu)'.",
    lemma: "Dictionary form (plain form for verbs and adjectives), in its usual kanji/kana spelling.",
    root: "For words written with kanji: each kanji with its meaning, e.g. '学 study + 校 school'; empty for kana-only words.",
    morphology: "Short analysis: word type and conjugation (polite, past, negative, te-form, potential, passive…), attached particles or auxiliaries.",
    dialect: "Standard, or the register or dialect if notable: polite, humble, honorific, casual, slang, Kansai, etc.",
    dialect_note: "Politeness, register or dialect usage note; empty if none.",
    msa_equivalent: "The standard (Tokyo, neutral-politeness) equivalent if the word is dialectal or slang; empty otherwise.",
  },
  zh: {
    name: "Chinese",
    variety: "which is Mandarin, possibly with regional or colloquial expressions, in simplified or traditional characters",
    why: "Chinese is written without spaces and words depend heavily on context (the same character in many words, measure words, particles, set phrases)",
    vocalized: "Pinyin with tone marks as pronounced in this sentence, e.g. 'kàopǔ'.",
    lemma: "The word as a dictionary lists it (same script as the sentence).",
    root: "For words of two or more characters: each character with its meaning, e.g. '靠 rely + 谱 score'; empty for single characters.",
    morphology: "Short analysis: word type, and any aspect particle, complement, measure word or set pattern involved.",
    dialect: "Standard Mandarin, or the register or region if notable: colloquial, slang, formal/written, chengyu, Taiwan, Beijing, internet, etc.",
    dialect_note: "Register or regional usage note; empty if none.",
    msa_equivalent: "The neutral standard equivalent if the word is slang or regional; empty otherwise.",
  },
  ru: {
    name: "Russian",
    variety: "which may be formal or colloquial",
    why: "Russian words change form with their role in the sentence (six cases, verb aspect, moving stress, prefixes)",
    vocalized: "The word as it appears, with its stress marked by an acute accent, e.g. 'ла́дно'.",
    lemma: "Dictionary form with stress marked (infinitive for verbs, with its aspect partner if it has one; nominative singular for nouns and adjectives).",
    root: "Empty string.",
    morphology: "Short analysis: case, number and gender; verb aspect, tense and person; prefixes.",
    dialect: "Standard, or the register if notable: colloquial, slang, formal, bookish, vulgar, etc.",
    dialect_note: "Register usage note; empty if none.",
    msa_equivalent: "The neutral standard equivalent if the word is slang or colloquial; empty otherwise.",
  },
  it: {
    name: "Italian",
    variety: "which may be standard or regional (northern, Roman, Neapolitan, Sicilian and so on), formal or colloquial",
    why: "Italian words change meaning with context (verb endings that hide the subject, attached and combined pronouns such as dammelo, elided articles such as l' and un', regional words and slang)",
    vocalized: "Pronunciation in IPA, with the stressed syllable marked, e.g. '/maˈɡari/'.",
    lemma: "Dictionary form (infinitive for verbs, masculine singular for nouns and adjectives), with its article for nouns.",
    root: "Empty string.",
    morphology: "Short analysis: tense, mood, person and number; attached or elided pronouns and articles; gender and number.",
    dialect: "Standard, or the region or register if notable: colloquial, slang, Roman, Neapolitan, northern, literary, etc.",
    dialect_note: "Regional or register usage note (where it is said, how formal it is); empty if none.",
    msa_equivalent: "The neutral standard Italian equivalent if the word is regional, dialect or slang; empty otherwise.",
  },
  tl: {
    name: "Tagalog",
    variety: "which may be formal Filipino or everyday Tagalog, often mixed with English (Taglish)",
    why: "Tagalog words change form with affixes and focus (mag-, um-, -in-, -an, i-, reduplication for aspect), linkers such as na and -ng, and frequent English loanwords",
    vocalized: "The word with its stress and glottal stop marked in the traditional way (acute, grave or circumflex accent), followed by IPA in parentheses, e.g. 'kasí (/kaˈsiʔ/)'.",
    lemma: "The root word (salitang-ugat) the form is built on, e.g. 'kain' for 'kumain'.",
    root: "The root word and the affixes on it, e.g. 'kain + -um- (actor focus, completed)'.",
    morphology: "Short analysis: focus (actor, object, locative, benefactive), aspect (completed, ongoing, contemplated), affixes and reduplication; linker or enclitic if attached.",
    dialect: "Standard, or the register if notable: formal Filipino, colloquial, Taglish, slang (salitang kalye, gay lingo), regional, etc.",
    dialect_note: "Register usage note (how formal it is, whether it is English mixed in); empty if none.",
    msa_equivalent: "The neutral standard Filipino equivalent if the word is slang, English or colloquial; empty otherwise.",
  },
  en: {
    name: "English",
    variety: "which may be American, British, Australian or any other variety, formal or colloquial",
    why: "English words change meaning with context (phrasal verbs such as 'give up', idioms, words that are both noun and verb, contractions, slang)",
    vocalized: "Pronunciation in IPA as said in this variety, with the stressed syllable marked, e.g. '/ˈɡɒnə/'.",
    lemma: "Dictionary form (infinitive for verbs, singular for nouns); for a phrasal verb or idiom, the whole phrase.",
    root: "Empty string.",
    morphology: "Short analysis: tense and form (past, -ing, -ed participle), plural or possessive, contraction spelled out, phrasal verb or idiom if it is one.",
    dialect: "Standard, or the variety or register if notable: American, British, Australian, colloquial, slang, formal, etc.",
    dialect_note: "Regional or register usage note (where it is said, how formal it is); empty if none.",
    msa_equivalent: "The neutral standard English equivalent if the word is slang, regional or very informal; empty otherwise.",
  },
};

const teach = (code) => TEACH[isLanguage(code) ? code : "ar"];

// ----- misheard words -----
// Transcripts come from speech recognition. Every lookup also asks whether the tapped word is what
// was really said; when the model is confident it was misheard or misspelt, "correction" holds the
// word that was said and the rest of the answer is about THAT word (see correction.js).
const CORRECTION_FIELD = {
  type: "string",
  description: "Empty, unless the marked word is very likely a speech-recognition mishearing or a misspelling of a different word: then the word (or words) actually said, written as it should appear in the transcript.",
};
const CORRECTION_RULES = `The text comes from speech recognition or the web and may contain errors. Judge, from the sentence and the sentences around it, whether the marked word is what was actually said. Only if you are confident it is a mishearing or misspelling of a different word, put the word that was said in "correction" and answer every other field about THAT word. Otherwise leave "correction" empty. Never "correct" a word that is plausible as written: rare words, names, foreign words, dialect, slang and colloquial forms, and spelling variants all stay as they are.`;

/** The answer's shape for one language. Every field is required (strict schemas demand it); the
 * model uses "" or [] when a field doesn't apply. */
export function schemaFor(code) {
  const t = teach(code);
  return {
    type: "object",
    properties: {
      word: { type: "string", description: "The target word exactly as it appears in the sentence." },
      vocalized: { type: "string", description: t.vocalized },
      lemma: { type: "string", description: t.lemma },
      root: { type: "string", description: t.root },
      pos: { type: "string", description: "Part of speech, e.g. verb, noun, adjective, preposition, particle." },
      morphology: { type: "string", description: t.morphology },
      meaning: { type: "string", description: "Concise meaning of the word in THIS sentence: a few words, never the word itself and nothing in the language being studied (it is the question side of a flashcard, the word is the answer)." },
      explanation: { type: "string", description: "One or two sentences on why it means this here." },
      other_meanings: { type: "array", items: { type: "string" }, description: "Other common meanings out of context." },
      dialect: { type: "string", description: t.dialect },
      dialect_note: { type: "string", description: t.dialect_note },
      msa_equivalent: { type: "string", description: t.msa_equivalent },
      sentence_translation: { type: "string", description: "Natural translation of the whole sentence, with ⟦ ⟧ around the part that translates the target word, e.g. 'Are you new ⟦here⟧?'." },
      correction: CORRECTION_FIELD,
    },
    required: ["word", "vocalized", "lemma", "root", "pos", "morphology", "meaning", "explanation",
      "other_meanings", "dialect", "dialect_note", "msa_equivalent", "sentence_translation", "correction"],
    additionalProperties: false,
  };
}

export const SCHEMA = schemaFor("ar");

/** Instructions for the AI teacher. `lang` is the language explanations are written in; `code`
 * is the language being studied. */
export function systemPrompt(lang, code) {
  const t = teach(code);
  return `You are an expert ${t.name} teacher helping a learner understand words in real ${t.name} material (podcast and video transcripts, web pages), ${t.variety}.

The learner tapped one word (or selected a short phrase). It is marked ⟦like this⟧ in the sentence. Analyze that specific occurrence (for a phrase, treat it as one expression), using the sentence, the surrounding sentences and the source details to resolve its meaning: ${t.why}, so the in-context meaning matters most.

${CORRECTION_RULES}

In "sentence_translation", put the same ⟦ ⟧ marks around the part of your translation that stands for the marked word, so the learner sees which words match. Leave the marks out only if nothing in the translation corresponds to it.

Write all explanations, meanings and translations in ${lang}. Keep "meaning" short (a few words) and entirely in ${lang}: never repeat the word in it or quote any ${t.name} there, because "meaning" becomes the question side of a flashcard whose answer is the word. Notes about dialect or usage belong in "explanation" and "dialect_note". Return only the JSON object.`;
}

// ----- quick lookup: only the meaning (a much shorter question and answer) -----
/** The shape of a quick answer. */
export const QUICK_SCHEMA = {
  type: "object",
  properties: {
    meaning: { type: "string", description: "The meaning of the marked word in THIS sentence, in a few words: never the word itself and nothing in the language being studied." },
    correction: CORRECTION_FIELD,
  },
  required: ["meaning", "correction"],
  additionalProperties: false,
};

/** Instructions for a quick lookup. `lang` is the language the meaning is written in; `code` the
 * language being studied. */
export function quickPrompt(lang, code) {
  const t = teach(code);
  return `You are an expert ${t.name} teacher. A learner tapped one word (or a short phrase) in real ${t.name} material, ${t.variety}. It is marked ⟦like this⟧ in the sentence. Give what it means in THIS sentence, in ${lang}, in a few words: no explanation, no grammar, and never the word itself or any ${t.name} (the answer becomes the question side of a flashcard). ${CORRECTION_RULES} Return only the JSON object.`;
}

/** Cache key of a quick answer (kept apart from the full answer for the same word and sentence). */
export const quickCacheKey = (word, marked, lang, code = "ar") => cacheKey(word, marked, `${lang}\u0000quick`, code);

/** Cache key of an answer given after the learner undid a correction of this word in this sentence
 * ("keep it as written"). Its own key, so it reaches the other devices (an answer cache entry
 * is never replaced there) and tells them not to correct the word again. */
const keepKey = (word, marked, lang, code, quick) => cacheKey(word, marked, `${lang}${quick ? "\u0000quick" : ""}\u0000keep`, code);

/**
 * One lookup through the answer cache, the same on the computer and the phone.
 * `load(key)` resolves to a kept answer or null; `save(key, word, sentence, data)` keeps one.
 * Quick lookups use a full answer when one is kept. Once the learner has undone a correction of
 * the word in this sentence (here or on another device), no answer that corrects it is used and
 * new answers are asked for with ctx.noCorrect.
 */
export async function lookup(cfg, ctx, { refresh = false, quick = false, transport, load, save }) {
  const lang = cfg.language || "English";
  const [full, short, keptFullKey, keptShortKey] = await Promise.all([
    cacheKey(ctx.word, ctx.marked, lang, ctx.lang), quickCacheKey(ctx.word, ctx.marked, lang, ctx.lang),
    keepKey(ctx.word, ctx.marked, lang, ctx.lang, false), keepKey(ctx.word, ctx.marked, lang, ctx.lang, true)]);
  const keptFull = await load(keptFullKey);
  const keptShort = await load(keptShortKey);
  const confirmed = !!ctx.noCorrect || !!keptFull || !!keptShort;
  if (!refresh) {
    if (keptFull) return keptFull;
    if (quick && keptShort) return keptShort;
    for (const key of quick ? [full, short] : [full]) {
      const cached = await load(key);
      if (cached && !(confirmed && cached.correction)) return cached;
    }
  }
  if (!cfg.key) throw new DefinerError("NO_KEY");
  const data = await define(cfg, confirmed ? { ...ctx, noCorrect: true } : ctx, transport, { quick });
  await save(confirmed ? (quick ? keptShortKey : keptFullKey) : (quick ? short : full), ctx.word, ctx.marked, data);
  return data;
}

/** Keep an answer for a word in a sentence without asking (after a correction, the answer goes
 * with the corrected sentence too). Resolves to the key. */
export async function rememberAnswer(cfg, ctx, data, save) {
  const lang = cfg.language || "English";
  const key = await (data.quick ? quickCacheKey : cacheKey)(ctx.word, ctx.marked, lang, ctx.lang);
  await save(key, ctx.word, ctx.marked, data);
  return key;
}

function userPrompt(ctx) {
  const lines = [];
  if (ctx.podcast) lines.push(`Source: ${ctx.podcast}`);
  if (ctx.episode) lines.push(`Title: ${ctx.episode}`);
  if (ctx.before) lines.push(`Previous sentence: ${ctx.before}`);
  lines.push(`Sentence: ${ctx.marked}`);
  if (ctx.after) lines.push(`Next sentence: ${ctx.after}`);
  lines.push(`Target word: ${ctx.word}`);
  // The learner undid a correction of this word: it stays as written.
  if (ctx.noCorrect) lines.push(`The learner has confirmed the target word is right as written: leave "correction" empty.`);
  return lines.join("\n");
}

/** The sentence with the target word (or phrase, words first..last) wrapped in ⟦⟧.
 * `code` is the language of the sentence (Japanese and Chinese are joined without spaces). */
export function markWord(words, first, last = first, code = "ar") {
  let out = "";
  for (let i = 0; i < words.length; i++) {
    out += (i ? gap(words[i - 1], words[i], code) : "") + (i === first ? "⟦" : "") + words[i] + (i === last ? "⟧" : "");
  }
  return out;
}

/** Stable cache key for one lookup (same word in the same sentence → same answer).
 * `lang` is the explanation language, `code` the language studied. Arabic keys are unchanged
 * from before other languages existed, so answers already saved are still found. */
export async function cacheKey(word, marked, lang, code = "ar") {
  const data = new TextEncoder().encode(`${word}\u0000${marked}\u0000${lang}${code && code !== "ar" ? `\u0000${code}` : ""}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

// ---------- provider requests ----------

function geminiSchema(s) {
  // Gemini's responseSchema uses an OpenAPI subset: uppercase types, no additionalProperties.
  const out = { type: s.type.toUpperCase() };
  if (s.description) out.description = s.description;
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, geminiSchema(v)]));
    out.required = s.required;
    out.propertyOrdering = Object.keys(s.properties);
  }
  if (s.items) out.items = geminiSchema(s.items);
  return out;
}

// `effort` is how hard the model may think: "off", "low" (word lookups), "medium" or "high" (see THINKING).
function buildRequest(provider, model, key, system, user, schema, lite = false, effort = "low") {
  switch (provider) {
    case "claude": {
      const body = {
        model,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema } },
      };
      const headers = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
      if (!lite && !/^claude-haiku-[34]/.test(model)) { // (Haiku 4.5 and older have no effort setting)
        body.output_config.effort = effort === "off" ? "low" : effort; // "low" = fast lookups; thinking stays adaptive
        if (effort === "off") {
          // Thinking switched off: Sonnet 5.5 says so its own way; Opus 5.5 and Fable can't, so they stay at "low".
          if (/^claude-sonnet-5-5/.test(model)) body.thinking = { type: "between_tools" };
          else if (!/^claude-(opus-5-5|fable)/.test(model)) body.thinking = { type: "disabled" };
        }
        if (/^claude-(opus|sonnet)-5-5/.test(model) && !body.thinking) {
          // Re-run on a fallback model if a safety classifier declines (rare for vocabulary).
          body.fallbacks = "default";
          headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
        }
      }
      return { url: "https://api.anthropic.com/v1/messages", headers, body };
    }
    case "gemini": {
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: geminiSchema(schema) },
      };
      // (Gemini 2.x has no thinking levels, and its lite model doesn't think unless asked to.)
      if (!lite && !/^gemini-2/.test(model)) {
        body.generationConfig.thinkingConfig = { thinkingLevel: effort === "off" ? "minimal" : effort };
      }
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body,
      };
    }
    case "openai":
    case "grok": {
      const body = {
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: lite
          ? { type: "json_object" }
          : { type: "json_schema", json_schema: { name: "word_definition", strict: true, schema } },
      };
      // (OpenAI: "none" switches reasoning off. Grok has only "low" and "high".)
      if (!lite) {
        body.reasoning_effort = provider === "grok" ? (effort === "medium" || effort === "high" ? "high" : "low")
          : effort === "off" ? "none" : effort;
      }
      const base = provider === "openai" ? "https://api.openai.com/v1" : "https://api.x.ai/v1";
      return { url: `${base}/chat/completions`, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body };
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

function extractText(provider, data) {
  if (provider === "claude") {
    if (data.stop_reason === "refusal") throw new DefinerError("The model declined to define this word.");
    const block = (data.content || []).find((b) => b.type === "text");
    if (!block) throw new DefinerError(data.stop_reason === "max_tokens" ? "The answer was cut off." : "Empty answer.");
    return block.text;
  }
  if (provider === "gemini") {
    const cand = (data.candidates || [])[0];
    const parts = cand && cand.content && cand.content.parts;
    const text = parts ? parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("") : "";
    if (!text) throw new DefinerError(cand && cand.finishReason ? `No answer (${cand.finishReason}).` : "Empty answer.");
    return text;
  }
  const choice = (data.choices || [])[0];
  const msg = choice && choice.message;
  if (msg && msg.refusal) throw new DefinerError("The model declined to define this word.");
  if (!msg || !msg.content) throw new DefinerError("Empty answer.");
  return msg.content;
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned);
}

// A translation whose ⟦ ⟧ marks pair up around some text (one marked part, or several).
const MARKED = /^[^⟦⟧]*(?:⟦[^⟦⟧]+⟧[^⟦⟧]*)+$/u;

/** The model's "correction", tidied: "" when there is none, when it only repeats the word (or
 * differs in punctuation, spaces or letter case), or when it is not a short run of words. */
export function cleanCorrection(value, word) {
  const fix = String(value ?? "").replace(/[⟦⟧"“”«»]/g, "").replace(EDGE_PUNCT, "").replace(/\s+/g, " ").trim();
  if (!fix || fix.length > 60 || fix.split(" ").length > 4) return "";
  const bare = (x) => String(x || "").replace(EDGE_PUNCT, "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return bare(fix) === bare(word) ? "" : fix;
}

function normalize(obj, fallbackWord, noCorrect = false) {
  const s = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
  // The translation arrives with ⟦ ⟧ around the part that renders the tapped word. It is shown
  // without the marks; `translation_marked` keeps them for the word's Anki card, and is "" when
  // the model left them out or tangled them (answers saved before the marks existed lack it too).
  const translation = s(obj.sentence_translation);
  return {
    word: s(obj.word) || fallbackWord,
    vocalized: s(obj.vocalized),
    lemma: s(obj.lemma),
    root: s(obj.root),
    pos: s(obj.pos),
    morphology: s(obj.morphology),
    meaning: s(obj.meaning),
    explanation: s(obj.explanation),
    other_meanings: Array.isArray(obj.other_meanings) ? obj.other_meanings.map(s).filter(Boolean) : [],
    dialect: s(obj.dialect),
    dialect_note: s(obj.dialect_note),
    msa_equivalent: s(obj.msa_equivalent),
    sentence_translation: translation.replace(/[⟦⟧]/g, ""),
    translation_marked: MARKED.test(translation) ? translation : "",
    correction: noCorrect ? "" : cleanCorrection(obj.correction, fallbackWord),
  };
}

// ---------- what a request used ----------
/** The tokens a provider's answer says the request used: {in, out} (0 where it doesn't say).
 * `out` includes the model's thinking, which providers charge as writing. */
export function usageOf(provider, data) {
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  if (provider === "gemini") {
    const u = (data && data.usageMetadata) || {};
    return { in: n(u.promptTokenCount), out: n(u.candidatesTokenCount) + n(u.thoughtsTokenCount) };
  }
  const u = (data && data.usage) || {};
  if (provider === "claude") {
    return { in: n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens), out: n(u.output_tokens) };
  }
  return { in: n(u.prompt_tokens), out: n(u.completion_tokens) }; // OpenAI and xAI
}

const usageListeners = new Set();
/** Be told what each answered request used: fn({provider, model, in, out}). Returns a function
 * that stops it. (tokenuse.js keeps the day's total with this.) */
export function onUsage(fn) {
  usageListeners.add(fn);
  return () => usageListeners.delete(fn);
}
function reportUsage(use) {
  for (const fn of usageListeners) { try { fn(use); } catch (e) { console.error(e); } }
}

/** A failed lookup. One the provider refused also carries `provider`, `status` (0 = no answer at
 * all), `kind` (what went wrong, see trouble.js, for the Troubleshoot box) and `keyRejected`
 * (the provider refused the key itself). */
export class DefinerError extends Error {}

/** Send one request. A transport that throws (no connection on the phone) answers status 0, as the
 * computer's relay does, so both are reported the same way. */
async function send(transport, req) {
  try {
    return await transport(req);
  } catch (e) {
    return { status: 0, text: String((e && e.message) || e || "") };
  }
}

/** The error for a request the provider refused, or that got no answer. */
function httpFailure(provider, res) {
  const err = new DefinerError(friendlyHttpError(provider, res.status, res.text));
  err.provider = provider;
  err.status = res.status;
  err.kind = problemKind(res.status, res.text);
  err.keyRejected = err.kind === "key";
  return err;
}

function friendlyHttpError(provider, status, bodyText) {
  let detail = "";
  try {
    const j = JSON.parse(bodyText);
    // OpenAI/Anthropic/Gemini: {error: {message}}; xAI: {error: "..."}; others: {message}.
    detail = (typeof j.error === "string" ? j.error : j.error && (j.error.message || j.error.type)) || j.message || "";
  } catch { detail = (bodyText || "").slice(0, 200); }
  const name = PROVIDERS[provider].label;
  const kind = problemKind(status, bodyText);
  if (kind === "region") return `${name} isn't available in your country or region.`;
  if (kind === "network") return `Couldn't reach ${name}. Check your internet connection.`;
  if (kind === "key") {
    // A key that was copied whole and filed under the right provider (Settings sees to both) and is
    // still refused has nearly always been switched off or run out: say so, not just "check it".
    return `${name} rejected the API key. It has most likely expired, so you probably need a new one.`;
  }
  if (status === 404) return `${name} doesn't recognize that model name. Check it in Settings.${detail ? ` (${detail})` : ""}`;
  if (status === 429) return `${name} rate limit or quota reached. Try again shortly, or check your billing.`;
  if (kind === "credit") return `${name} says the account has no credit. Add some on its Billing page.`;
  if (status >= 500) return `${name} is having problems right now (HTTP ${status}). Try again.`;
  return `${name} error (HTTP ${status})${detail ? `: ${detail}` : ""}`;
}

/**
 * Ask the learner's AI for any small JSON answer: the same provider, key, model and transport as a
 * word lookup (the review card's Mnemonic maker uses it). `prompt` is {system, user, schema}.
 * `cfg.effort` is how hard the model may think (see THINKING; "low", as for a lookup, when absent).
 * Resolves to the parsed object; failures are DefinerErrors with the same plain messages as a
 * lookup's ("NO_KEY" when no key is set).
 */
export async function askJson(cfg, { system, user, schema }, transport) {
  if (!cfg.key) throw new DefinerError("NO_KEY");
  const model = cfg.model || PROVIDERS[cfg.provider].defaultModel;
  let res = await send(transport, buildRequest(cfg.provider, model, cfg.key, system, user, schema, false, cfg.effort || "low"));
  if (res.status === 400) res = await send(transport, buildRequest(cfg.provider, model, cfg.key, system, user, schema, true));
  if (res.status < 200 || res.status >= 300) throw httpFailure(cfg.provider, res);
  let data;
  try { data = JSON.parse(res.text); } catch { throw new DefinerError("The provider returned an unreadable response."); }
  reportUsage({ provider: cfg.provider, model, ...usageOf(cfg.provider, data) });
  try { return parseJson(extractText(cfg.provider, data)); } catch (e) {
    if (e instanceof DefinerError) throw e;
    throw new DefinerError("The answer wasn't valid JSON. Try again, or pick a different model.");
  }
}

/**
 * Define one word in context.
 * @param {{provider:string, model:string, key:string, language:string}} cfg
 * @param {{word:string, marked:string, lang?:string, before?:string, after?:string, podcast?:string, episode?:string}} ctx
 *   (`lang` is the code of the language being studied; Arabic when absent)
 * @param {(req:{url:string, headers:object, body:object}) => Promise<{status:number, text:string}>} transport
 * @param {{quick?: boolean}} [opts] quick = ask only for the meaning; the answer has `quick: true`
 *   and every other field empty
 */
export async function define(cfg, ctx, transport, { quick = false } = {}) {
  if (!cfg.key) throw new DefinerError("No API key set. Add one in Settings → Word definitions.");
  const model = cfg.model || PROVIDERS[cfg.provider].defaultModel;
  const system = quick ? quickPrompt(cfg.language || "English", ctx.lang) : systemPrompt(cfg.language || "English", ctx.lang);
  // (A quick lookup sends the sentence itself but not its neighbours: less to read, less to pay for.)
  const user = userPrompt(quick ? { ...ctx, before: "", after: "" } : ctx);
  const schema = quick ? QUICK_SCHEMA : schemaFor(ctx.lang);

  let req = buildRequest(cfg.provider, model, cfg.key, system, user, schema);
  let res = await send(transport, req);
  // Older/other models may reject the optional speed knobs (effort, thinking level, strict
  // schema). Retry once with a minimal request before giving up.
  if (res.status === 400) {
    req = buildRequest(cfg.provider, model, cfg.key, system, user, schema, true);
    res = await send(transport, req);
  }
  if (res.status < 200 || res.status >= 300) throw httpFailure(cfg.provider, res);
  let data;
  try { data = JSON.parse(res.text); } catch { throw new DefinerError("The provider returned an unreadable response."); }
  reportUsage({ provider: cfg.provider, model, ...usageOf(cfg.provider, data) }); // (paid for, whatever the answer turns out to be)
  const text = extractText(cfg.provider, data);
  try {
    const answer = { ...normalize(parseJson(text), ctx.word, !!ctx.noCorrect), provider: cfg.provider, model };
    if (quick) answer.quick = true;
    return answer;
  } catch {
    throw new DefinerError("The answer wasn't valid JSON. Try again, or pick a different model.");
  }
}
