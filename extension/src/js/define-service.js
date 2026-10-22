// The extension's glue for the shared definer (web/js/definer.js), like the phone's
// mobile/src/js/define-service.js: the settings the web app handed over, the answers already looked
// up (kept here, in the extension), and the AI provider asked straight from the extension's own page
// with the learner's own key.
import { api } from "./app.js";
import { DefinerError, askJson, definerModeOf, dictionaryFirst, lookup, mnemonicConfig, rememberAnswer, PROVIDERS } from "./definer.js";
import { dictionaryDefine } from "./meanings.js";
import { settings } from "./store.js";

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
/** "No AI" chosen in Settings: words are explained by the built-in dictionary only. */
export const noAi = () => definerMode() === "dictionary";
const aiOff = () => { throw new DefinerError("AI is turned off (Settings → Word definitions → No AI), so this isn't available."); };

/** Send a provider request from the extension's page (Anthropic asks pages to say so explicitly). */
export async function transport(req) {
  const headers = /anthropic\.com/.test(req.url) ? { ...req.headers, "anthropic-dangerous-direct-browser-access": "true" } : req.headers;
  const r = await fetch(req.url, { method: "POST", headers, body: JSON.stringify(req.body) });
  return { status: r.status, text: await r.text() };
}

export const askAi = (prompt) => (noAi() ? aiOff() : askJson(definerConfig(), prompt, transport));
export const askMnemonic = (prompt) => (noAi() ? aiOff() : askJson(mnemonicConfig(definerConfig(), settings), prompt, transport));

/** A word's meaning in its sentence (see the phone's define-service.js). */
export async function getDefinition(ctx, refresh = false, { quick = false } = {}) {
  const cfg = definerConfig();
  const dictionary = () => dictionaryDefine(ctx, { quick, language: cfg.language });
  const ai = () => lookup(cfg, ctx, { refresh, quick, transport, load: loadAnswer, save: saveAnswer });
  if (noAi()) return dictionary();
  if (definerMode() === "dictionary_first") return dictionaryFirst({ dictionary, ai, hasKey: !!cfg.key, refresh });
  return ai();
}

export const storeDefinition = (ctx, data) => rememberAnswer(definerConfig(), ctx, data, saveAnswer);

const loadAnswer = (key) => api(`/definitions/${key}`);
const saveAnswer = (key, word, sentence, data) =>
  api(`/definitions/${key}`, { method: "PUT", body: { word, sentence, data, provider: data.provider, model: data.model } });
