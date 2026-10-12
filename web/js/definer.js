// Context-aware word definer for the language being studied. Shared by the desktop app and the Android app.
//
// One request per lookup: the word, its sentence and the neighbouring sentences go to the
// user's chosen AI provider with their own API key, and a schema-constrained JSON answer
// comes back. The HTTP transport is injected (desktop relays through its local server to
// avoid browser CORS limits; Android uses native HTTP), so this file has no platform code.

import { isLanguage, gap } from "./languages.js";

// `defaultModel` is each provider's best value for this job: the cheapest of its current models
// that explains a word well (a lookup is a short question and a short structured answer, so the
// small models do it properly). `models` is what Settings offers, cheapest first, with a note on
// each; a user can also type any other model name. Prices are US dollars per million words-worth
// of text ("tokens") in / out, from the providers' own price lists in October 2026.
export const PROVIDERS = {
  claude: {
    label: "Claude (Anthropic)",
    short: "Claude",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-haiku-5-5",
    models: [
      { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", note: "lowest cost ($0.10 / $0.50)" },
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", note: "more thorough, about 20× the cost" },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5", note: "most thorough, about 40× the cost" },
    ],
  },
  gemini: {
    label: "Gemini (Google)",
    short: "Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-3.1-flash-lite",
    models: [
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", note: "lowest cost of the current models ($0.25 / $1.50); free allowance" },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", note: "newer, a little dearer ($0.30 / $2.50)" },
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", note: "most thorough, about 3× the cost" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", note: "older model, cheapest of all ($0.10 / $0.40)" },
    ],
  },
  openai: {
    label: "ChatGPT (OpenAI)",
    short: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-6-luna",
    models: [
      { id: "gpt-6-luna", name: "GPT-6 Luna", note: "lowest cost ($0.10 / $0.50)" },
      { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", note: "more thorough, about 20× the cost" },
      { id: "gpt-6-astra", name: "GPT-6 Astra", note: "most thorough, about 100× the cost" },
    ],
  },
  grok: {
    label: "Grok (xAI)",
    short: "Grok",
    keyUrl: "https://console.x.ai/",
    defaultModel: "grok-4.3",
    models: [
      { id: "grok-4.3", name: "Grok 4.3", note: "lowest cost of the general models ($1.25 / $2.50)" },
      { id: "grok-4.7", name: "Grok 4.7", note: "newest, about twice the cost" },
    ],
  },
};

/** The model a provider's key is used with: the one chosen in Settings, else the provider's default. */
export const modelFor = (provider, settings) =>
  (settings && settings[`definer_model_${provider}`]) || PROVIDERS[provider].defaultModel;

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
};

const teach = (code) => TEACH[isLanguage(code) ? code : "ar"];

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
      meaning: { type: "string", description: "Concise meaning of the word in THIS sentence." },
      explanation: { type: "string", description: "One or two sentences on why it means this here." },
      other_meanings: { type: "array", items: { type: "string" }, description: "Other common meanings out of context." },
      dialect: { type: "string", description: t.dialect },
      dialect_note: { type: "string", description: t.dialect_note },
      msa_equivalent: { type: "string", description: t.msa_equivalent },
      sentence_translation: { type: "string", description: "Natural translation of the whole sentence, with ⟦ ⟧ around the part that translates the target word, e.g. 'Are you new ⟦here⟧?'." },
    },
    required: ["word", "vocalized", "lemma", "root", "pos", "morphology", "meaning", "explanation",
      "other_meanings", "dialect", "dialect_note", "msa_equivalent", "sentence_translation"],
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

Transcripts come from speech recognition and may contain small errors; if the word looks misrecognized, say what was probably said in the explanation.

In "sentence_translation", put the same ⟦ ⟧ marks around the part of your translation that stands for the marked word, so the learner sees which words match. Leave the marks out only if nothing in the translation corresponds to it.

Write all explanations, meanings and translations in ${lang}. Keep "meaning" short (a few words). Return only the JSON object.`;
}

function userPrompt(ctx) {
  const lines = [];
  if (ctx.podcast) lines.push(`Source: ${ctx.podcast}`);
  if (ctx.episode) lines.push(`Title: ${ctx.episode}`);
  if (ctx.before) lines.push(`Previous sentence: ${ctx.before}`);
  lines.push(`Sentence: ${ctx.marked}`);
  if (ctx.after) lines.push(`Next sentence: ${ctx.after}`);
  lines.push(`Target word: ${ctx.word}`);
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

function buildRequest(provider, model, key, system, user, schema, lite = false) {
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
        body.output_config.effort = "low"; // fast lookups; thinking stays adaptive
        if (/^claude-(opus|sonnet)-5-5/.test(model)) {
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
      if (!lite && !/^gemini-2/.test(model)) body.generationConfig.thinkingConfig = { thinkingLevel: "low" };
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
      if (!lite) body.reasoning_effort = "low";
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

function normalize(obj, fallbackWord) {
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
  };
}

export class DefinerError extends Error {}

function friendlyHttpError(provider, status, bodyText) {
  let detail = "";
  try {
    const j = JSON.parse(bodyText);
    // OpenAI/Anthropic/Gemini: {error: {message}}; xAI: {error: "..."}; others: {message}.
    detail = (typeof j.error === "string" ? j.error : j.error && (j.error.message || j.error.type)) || j.message || "";
  } catch { detail = (bodyText || "").slice(0, 200); }
  const name = PROVIDERS[provider].label;
  if (status === 401 || status === 403 || /api[ _-]?key/i.test(detail)) {
    return `${name} rejected the API key. Check it in Settings.`;
  }
  if (status === 404) return `${name} doesn't recognize that model name. Check it in Settings.${detail ? ` (${detail})` : ""}`;
  if (status === 429) return `${name} rate limit or quota reached. Try again shortly, or check your billing.`;
  if (status >= 500) return `${name} is having problems right now (HTTP ${status}). Try again.`;
  return `${name} error (HTTP ${status})${detail ? `: ${detail}` : ""}`;
}

/**
 * Define one word in context.
 * @param {{provider:string, model:string, key:string, language:string}} cfg
 * @param {{word:string, marked:string, lang?:string, before?:string, after?:string, podcast?:string, episode?:string}} ctx
 *   (`lang` is the code of the language being studied; Arabic when absent)
 * @param {(req:{url:string, headers:object, body:object}) => Promise<{status:number, text:string}>} transport
 */
export async function define(cfg, ctx, transport) {
  if (!cfg.key) throw new DefinerError("No API key set. Add one in Settings → Word definitions.");
  const model = cfg.model || PROVIDERS[cfg.provider].defaultModel;
  const system = systemPrompt(cfg.language || "English", ctx.lang);
  const user = userPrompt(ctx);
  const schema = schemaFor(ctx.lang);

  let req = buildRequest(cfg.provider, model, cfg.key, system, user, schema);
  let res = await transport(req);
  // Older/other models may reject the optional speed knobs (effort, thinking level, strict
  // schema). Retry once with a minimal request before giving up.
  if (res.status === 400) {
    req = buildRequest(cfg.provider, model, cfg.key, system, user, schema, true);
    res = await transport(req);
  }
  if (res.status < 200 || res.status >= 300) throw new DefinerError(friendlyHttpError(cfg.provider, res.status, res.text));
  let data;
  try { data = JSON.parse(res.text); } catch { throw new DefinerError("The provider returned an unreadable response."); }
  const text = extractText(cfg.provider, data);
  try {
    return { ...normalize(parseJson(text), ctx.word), provider: cfg.provider, model };
  } catch {
    throw new DefinerError("The answer wasn't valid JSON. Try again, or pick a different model.");
  }
}
