// Phone glue for the shared definer: settings, the synced answer cache, and native HTTPS.

import { api } from "./app.js";
import { DefinerError, askJson, definerModeOf, dictionaryFirst, lookup, mnemonicConfig, rememberAnswer, PROVIDERS } from "./definer.js";
import { dictionaryDefine, downloadMeanings } from "./meanings.js";
import "./tokenuse.js"; // keeps the day's count of tokens used (shown in Settings)
import { settings } from "./store.js";
import { isNative, isWeb } from "./native.js";
import { registerPlugin } from "./vendor/capacitor-core.js";

const CapacitorHttp = isNative ? registerPlugin("CapacitorHttp") : null;

export function definerConfig() {
  const provider = PROVIDERS[settings.definer_provider] ? settings.definer_provider : "claude";
  return {
    provider,
    key: settings[`llm_key_${provider}`] || "",
    model: settings[`definer_model_${provider}`] || PROVIDERS[provider].defaultModel,
    language: settings.definer_language || "English",
  };
}

const definerMode = () => definerModeOf(settings);
/** "No AI" chosen in Settings: words are explained by the built-in dictionary (meanings.js), and
 *  nothing is sent to an AI provider (the Mnemonic maker says it is off). */
export const noAi = () => definerMode() === "dictionary";
const aiOff = () => { throw new DefinerError("AI is turned off (Settings → Word definitions → No AI), so this isn't available."); };

/** Send a provider request. Native HTTP on the phone avoids browser cross-site (CORS) limits. */
export async function transport(req) {
  if (CapacitorHttp) {
    const r = await CapacitorHttp.request({ url: req.url, method: "POST", headers: req.headers, data: req.body,
                                            responseType: "text" });
    return { status: r.status, text: typeof r.data === "string" ? r.data : JSON.stringify(r.data) };
  }
  // In the web app the provider is called straight from the page with the learner's own key;
  // Anthropic asks pages to say so explicitly.
  const headers = isWeb && /anthropic\.com/.test(req.url) ? { ...req.headers, "anthropic-dangerous-direct-browser-access": "true" } : req.headers;
  const r = await fetch(req.url, { method: "POST", headers, body: JSON.stringify(req.body) });
  return { status: r.status, text: await r.text() };
}

/** A small JSON answer from the learner's AI (see definer.askJson), sent the same way as a lookup. */
export const askAi = (prompt) => (noAi() ? aiOff() : askJson(definerConfig(), prompt, transport));
/** The same for the review card's Mnemonic maker, with its own model and thinking (Settings). */
export const askMnemonic = (prompt) => (noAi() ? aiOff() : askJson(mnemonicConfig(definerConfig(), settings), prompt, transport));

/** `opts.quick` = only the meaning is wanted (see components/lookupmode.js): a full answer already
 * kept is used as it is, otherwise a short, cheaper request is made. */
export async function getDefinition(ctx, refresh = false, { quick = false } = {}) {
  const cfg = definerConfig();
  const dictionary = () => dictionaryDefine(ctx, { quick, language: cfg.language });
  const ai = () => lookup(cfg, ctx, { refresh, quick, transport, load: loadAnswer, save: saveAnswer });
  if (noAi()) return dictionary();
  // Dictionary first: the AI only for the words the dictionary doesn't have (see definer.dictionaryFirst).
  if (definerMode() === "dictionary_first") {
    const lang = ctx.lang || "ar";
    return dictionaryFirst({ dictionary, ai, hasKey: !!cfg.key, refresh, lang, getDictionary: () => downloadMeanings(lang) });
  }
  return ai();
}

/** Keep an answer for this word and sentence without asking (see definer.rememberAnswer). */
export const storeDefinition = (ctx, data) => rememberAnswer(definerConfig(), ctx, data, saveAnswer);

const loadAnswer = (key) => api(`/definitions/${key}`);
const saveAnswer = (key, word, sentence, data) =>
  api(`/definitions/${key}`, { method: "PUT", body: { word, sentence, data, provider: data.provider, model: data.model } });
