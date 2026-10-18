// Desktop glue for the definer: settings, the local answer cache, and the HTTPS relay.
// (The Android app provides its own version of this file with native HTTP and local storage.)

import { api, state } from "./app.js";
import { DefinerError, askJson, lookup, mnemonicConfig, rememberAnswer, PROVIDERS } from "./definer.js";
import { dictionaryDefine } from "./meanings.js";
import "./tokenuse.js"; // keeps the day's count of tokens used (shown in Settings)

export function definerConfig() {
  const s = (state.status && state.status.settings) || {};
  const provider = PROVIDERS[s.definer_provider] ? s.definer_provider : "claude";
  return {
    provider,
    key: s[`llm_key_${provider}`] || "",
    model: s[`definer_model_${provider}`] || PROVIDERS[provider].defaultModel,
    language: s.definer_language || "English",
  };
}

export function hasKey() {
  return !!definerConfig().key;
}

const definerMode = () => ((state.status && state.status.settings) || {}).definer_mode || "ai";
/** "No AI" chosen in Settings: words are explained by the built-in dictionary (meanings.js), and
 *  nothing is sent to an AI provider (the Mnemonic maker says it is off). */
export const noAi = () => definerMode() === "dictionary";
const aiOff = () => { throw new DefinerError("AI is turned off (Settings → Word definitions → No AI), so this isn't available."); };

const relay = async (req) => api("/llm/relay", { method: "POST", body: req });

/** A small JSON answer from the learner's AI (see definer.askJson), through the same relay. */
export const askAi = (prompt) => (noAi() ? aiOff() : askJson(definerConfig(), prompt, relay));
/** The same for the review card's Mnemonic maker, with its own model and thinking (Settings). */
export const askMnemonic = (prompt) => (noAi() ? aiOff() : askJson(mnemonicConfig(definerConfig(), state.status && state.status.settings), prompt, relay));

/**
 * Definition for ctx (see definer.define), from the cache when possible.
 * @param {boolean} refresh ignore the cache and ask the model again
 * @param {{quick?: boolean}} [opts] quick = only the meaning is wanted (see components/lookupmode.js):
 *   a full answer already kept is used as it is, otherwise a short, cheaper request is made
 */
export async function getDefinition(ctx, refresh = false, { quick = false } = {}) {
  if (noAi()) return dictionaryDefine(ctx, { quick, language: definerConfig().language });
  return lookup(definerConfig(), ctx, { refresh, quick, transport: relay, load: loadAnswer, save: saveAnswer });
}

/** Keep an answer for this word and sentence without asking (see definer.rememberAnswer). */
export const storeDefinition = (ctx, data) => rememberAnswer(definerConfig(), ctx, data, saveAnswer);

const loadAnswer = (key) => api(`/definitions/${key}`).catch(() => null);
// (Not waited for: the answer is shown at once; keeping it is a background job here.)
const saveAnswer = async (key, word, sentence, data) => {
  api(`/definitions/${key}`, { method: "PUT", body: { key, word, sentence, data, provider: data.provider, model: data.model } })
    .catch(() => {});
};
