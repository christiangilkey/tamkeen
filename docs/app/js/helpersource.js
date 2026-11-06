// Example sentences and the Mnemonic maker: who makes them. "free" = Tamkeen itself, on the device, with no
// AI (examples.js freeExample, review/freemnemonic.js); "ai" = the learner's AI. Chosen in Settings → Word
// definitions (components/freehelpers.js) and kept in the synced settings `sentence_source` and
// `mnemonic_source`. Unset means the AI when it can be used, else free (how it worked before the choice).
// Pure: callers say whether the AI can be used (AI not turned off, and a key).

export const HELPER_KINDS = ["sentence", "mnemonic"];

/** What the learner chose for `kind` ("sentence" or "mnemonic"): "free", "ai" or "" (not chosen). */
export function chosenSource(settings, kind) {
  const v = (settings || {})[`${kind}_source`];
  return v === "free" || v === "ai" ? v : "";
}

/** Whether the AI makes `kind`: the AI can be used and the learner hasn't chosen free. */
export function aiMakes(settings, kind, aiUsable) {
  return !!aiUsable && chosenSource(settings, kind) !== "free";
}

/** Whether the AI can be used at all with these settings: AI explanations not turned off, and a key for
 * the chosen provider (the same test as define-service's !noAi() && definerConfig().key). */
export function aiUsableFrom(settings) {
  const s = settings || {};
  const mode = s.definer_mode || "";
  if (mode === "dictionary") return false;
  const provider = s.definer_provider || "claude";
  return !!String(s[`llm_key_${provider}`] || "").trim();
}
