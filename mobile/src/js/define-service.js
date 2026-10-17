// Phone glue for the shared definer: settings, the synced answer cache, and native HTTPS.

import { api } from "./app.js";
import { askJson, lookup, mnemonicConfig, rememberAnswer, PROVIDERS } from "./definer.js";
import "./tokenuse.js"; // keeps the day's count of tokens used (shown in Settings)
import { settings } from "./store.js";
import { isNative } from "./native.js";
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

/** Send a provider request. Native HTTP on the phone avoids browser cross-site (CORS) limits. */
export async function transport(req) {
  if (CapacitorHttp) {
    const r = await CapacitorHttp.request({ url: req.url, method: "POST", headers: req.headers, data: req.body,
                                            responseType: "text" });
    return { status: r.status, text: typeof r.data === "string" ? r.data : JSON.stringify(r.data) };
  }
  const r = await fetch(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body) });
  return { status: r.status, text: await r.text() };
}

/** A small JSON answer from the learner's AI (see definer.askJson), sent the same way as a lookup. */
export const askAi = (prompt) => askJson(definerConfig(), prompt, transport);
/** The same for the review card's Mnemonic maker, with its own model and thinking (Settings). */
export const askMnemonic = (prompt) => askJson(mnemonicConfig(definerConfig(), settings), prompt, transport);

/** `opts.quick` = only the meaning is wanted (see components/lookupmode.js): a full answer already
 * kept is used as it is, otherwise a short, cheaper request is made. */
export async function getDefinition(ctx, refresh = false, { quick = false } = {}) {
  return lookup(definerConfig(), ctx, { refresh, quick, transport, load: loadAnswer, save: saveAnswer });
}

/** Keep an answer for this word and sentence without asking (see definer.rememberAnswer). */
export const storeDefinition = (ctx, data) => rememberAnswer(definerConfig(), ctx, data, saveAnswer);

const loadAnswer = (key) => api(`/definitions/${key}`);
const saveAnswer = (key, word, sentence, data) =>
  api(`/definitions/${key}`, { method: "PUT", body: { word, sentence, data, provider: data.provider, model: data.model } });
