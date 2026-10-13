// Desktop glue for the definer: settings, the local answer cache, and the HTTPS relay.
// (The Android app provides its own version of this file with native HTTP and local storage.)

import { api, state } from "./app.js";
import { define, cacheKey, quickCacheKey, PROVIDERS, DefinerError } from "./definer.js";
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

const relay = async (req) => api("/llm/relay", { method: "POST", body: req });

/**
 * Definition for ctx (see definer.define), from the cache when possible.
 * @param {boolean} refresh ignore the cache and ask the model again
 * @param {{quick?: boolean}} [opts] quick = only the meaning is wanted (see components/lookupmode.js):
 *   a full answer already kept is used as it is, otherwise a short, cheaper request is made
 */
export async function getDefinition(ctx, refresh = false, { quick = false } = {}) {
  const cfg = definerConfig();
  const key = await cacheKey(ctx.word, ctx.marked, cfg.language, ctx.lang);
  if (!refresh) {
    const cached = await api(`/definitions/${key}`).catch(() => null);
    if (cached) return cached;
  }
  if (quick) {
    const quickKey = await quickCacheKey(ctx.word, ctx.marked, cfg.language, ctx.lang);
    if (!refresh) {
      const cached = await api(`/definitions/${quickKey}`).catch(() => null);
      if (cached) return cached;
    }
    if (!cfg.key) throw new DefinerError("NO_KEY");
    const data = await define(cfg, ctx, relay, { quick: true });
    api(`/definitions/${quickKey}`, {
      method: "PUT",
      body: { key: quickKey, word: ctx.word, sentence: ctx.marked, data, provider: data.provider, model: data.model },
    }).catch(() => {});
    return data;
  }
  if (!cfg.key) throw new DefinerError("NO_KEY");
  const data = await define(cfg, ctx, relay);
  api(`/definitions/${key}`, {
    method: "PUT",
    body: { key, word: ctx.word, sentence: ctx.marked, data, provider: data.provider, model: data.model },
  }).catch(() => {});
  return data;
}
