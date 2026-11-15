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

// ---------------------------------------------------------------- who made a set of mnemonics
// The Mnemonic maker shows who made each set of keywords in a small pill: "Tamkeen" for the free maker on the
// device (source "free"), else the AI provider's short name ("Claude", "Gemini", "OpenAI", "Grok").

/** The pill's name for `source` ("free", or a provider id such as "claude"); `providers` is definer.js PROVIDERS. */
export function madeByName(source, providers = {}) {
  if (!source || source === "free") return "Tamkeen";
  const p = providers[source];
  return (p && p.short) || String(source);
}

// The free maker's own reasons about the word itself: shown even when the AI failed first, since the AI's
// failure isn't what the learner can fix there.
const WORD_REASONS = new Set(["NO_SOUNDS", "NO_PART_SOUND"]);

/** The AI failed with `aiError` and the free maker, tried next, failed with `freeError`: the one to show.
 * A reason about the word (no sounds to match) is the free maker's; anything else (its word list couldn't be
 * downloaded, say: often the same lost connection) shows the AI's, so its Troubleshoot button is offered,
 * unless the AI only had no key. */
export function failureToShow(aiError, freeError) {
  if (!aiError || (aiError.message === "NO_KEY" && freeError)) return freeError;  // (no key: nothing to troubleshoot)
  return freeError && WORD_REASONS.has(freeError.message) ? freeError : aiError;
}
