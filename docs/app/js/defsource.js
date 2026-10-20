// Where tapped words get their meaning: the word popup's source tag and the little menu it opens
// (components/wordbubble.js). The menu's choices are the Word definitions setting itself
// (definer_mode, and definer_provider for which AI), so a choice made in the popup is the one
// Settings → Word definitions shows, and the other way round. It is one setting for every study
// language, as in Settings; only whether the language's dictionary is on this device is per language.
//
// Shared by the desktop app, the phone and the web app. No screen code here (tested in
// tests/js/defsource.test.mjs).

import { DEFAULT_DEFINER_MODE, PROVIDERS, answerSource, definerModeOf, modelFor } from "./definer.js";

/** The AI provider chosen in Settings (Claude when none is). */
export const chosenProvider = (settings) => (PROVIDERS[settings && settings.definer_provider] ? settings.definer_provider : "claude");
const hasKey = (settings, p) => !!String((settings && settings[`llm_key_${p}`]) || "").trim();
/** The providers that have a key here, in Settings' order. */
export const keyedProviders = (settings) => Object.keys(PROVIDERS).filter((p) => hasKey(settings, p));

const modelName = (p, settings) => {
  const id = modelFor(p, settings);
  const m = PROVIDERS[p].models.find((x) => x.id === id);
  return m ? m.name : id;
};

/** The dictionaries a language's built-in dictionary is made of, in the order they are asked
 * (meanings.js: Bisaya asks Wolff's first). `names` are its files (lexicon status `names`). */
export function dictionaryNames(lang, names) {
  const list = (names || []).map((n) => (n === "mean-arc" ? "CAMeL Arabic" : n === "mean-cebw" ? "Wolff's dictionary" : "Wiktionary"));
  if (lang === "ceb") list.reverse();
  return [...new Set(list)].join(" + ");
}

/**
 * The menu's choices for a word in a language, best known first.
 * `dict` is that language's dictionary status here (meanings.js meaningsStatus: {needed, installed,
 * bytes, names}), or null while it isn't known yet.
 * Each choice: {id, kind ("ai" | "setup" | "dictionary" | "dictionary_first"), label, detail, on (the
 * current setting; an unset setting is the default, see definerModeOf), provider (AI), download (bytes
 * to fetch first, or null), unavailable (no dictionary for this language), recommended (the default)}.
 *  - one AI choice for each provider with a key; with no key at all, one "AI explanations" that
 *    opens Settings to add one;
 *  - the built-in dictionary (with its size when it isn't on this device yet);
 *  - "Dictionary first, AI when it has nothing", when there is a key (without one it is just the
 *    dictionary), or when it is the current setting.
 */
export function sourceChoices(settings, dict = null) {
  const mode = definerModeOf(settings);
  const current = chosenProvider(settings);
  const keyed = keyedProviders(settings);
  const out = [];
  if (keyed.length) {
    for (const p of keyed) {
      out.push({ id: `ai:${p}`, kind: "ai", provider: p, label: PROVIDERS[p].label, detail: modelName(p, settings),
        on: mode === "ai" && p === current, download: null });
    }
  } else {
    out.push({ id: "setup", kind: "setup", label: "AI explanations", detail: "Add an API key in Settings", on: mode === "ai", download: null });
  }
  const none = !!dict && dict.needed === false; // this language has no dictionary (yet)
  const download = dict && !none && !dict.installed ? dict.bytes || 0 : null;
  const names = dict ? dictionaryNames(dict.lang, dict.names) : "";
  if (!none || mode === "dictionary") {
    out.push({ id: "dictionary", kind: "dictionary", label: "Built-in dictionary", unavailable: none,
      detail: none ? "None for this language yet" : names || "Free, works offline", on: mode === "dictionary", download });
  }
  if ((keyed.length && !none) || mode === "dictionary_first") {
    const ai = PROVIDERS[keyed.includes(current) ? current : keyed[0] || current].short;
    out.push({ id: "dictionary_first", kind: "dictionary_first", label: "Dictionary first, AI when it has nothing", unavailable: none,
      recommended: DEFAULT_DEFINER_MODE === "dictionary_first", // as in Settings → Word definitions
      detail: none ? (keyed.length ? `No dictionary for this language yet, so ${ai} explains every word` : "None for this language yet")
        : keyed.length ? `The dictionary's meaning when it has the word, ${ai} for the rest` : "Add an API key in Settings for the words it doesn't have",
      on: mode === "dictionary_first", download });
  }
  return out;
}

/** The settings to save for a choice (see sourceChoices). Dictionary first keeps the AI chosen in
 * Settings, or takes one that has a key when that one has none. */
export function settingsFor(choice, settings) {
  if (!choice) return {};
  if (choice.kind === "ai") return { definer_mode: "ai", definer_provider: choice.provider };
  if (choice.kind === "dictionary") return { definer_mode: "dictionary" };
  if (choice.kind === "dictionary_first") {
    const keyed = keyedProviders(settings);
    const current = chosenProvider(settings);
    return keyed.length && !keyed.includes(current)
      ? { definer_mode: "dictionary_first", definer_provider: keyed[0] }
      : { definer_mode: "dictionary_first" };
  }
  return {};
}

/**
 * Switch to a source: a dictionary choice first downloads the language's dictionary when it isn't on
 * this device (as choosing it in Settings does), then the setting is saved, with no Save button.
 * Resolves to {again}: look the word up afresh (see askAfresh). A failed download saves nothing.
 * @param {{settings: object, shown?: object|null, status: () => Promise<object|null>,
 *   download: () => Promise<any>, save: (patch: object) => Promise<any>, downloading?: () => void}} io
 */
export async function switchSource(choice, { settings, shown = null, status, download, save, downloading = () => {} }) {
  if (choice.kind === "dictionary" || choice.kind === "dictionary_first") {
    const st = await status();
    if (st && st.needed && !st.installed) {
      downloading();
      await download();
    }
  }
  await save(settingsFor(choice, settings));
  return { again: askAfresh(choice, shown) };
}

/** Should the word be asked again rather than taken from the answers kept? Only when switching to
 * another AI than the one whose answer is on screen (kept answers aren't kept per AI). */
export const askAfresh = (choice, shown) =>
  !!(choice && choice.kind === "ai" && shown && PROVIDERS[shown.provider] && shown.provider !== choice.provider);

/** The tag's words: where the shown meaning came from, or, before there is one (looking up, an
 * error, no key), the source the setting will use. */
export function tagLabel(settings, shown = null) {
  if (shown) return answerSource(shown);
  const mode = definerModeOf(settings);
  if (mode === "dictionary") return "Built-in dictionary";
  if (mode === "dictionary_first") return "Dictionary first";
  const p = chosenProvider(settings);
  return answerSource({ provider: p, model: modelFor(p, settings) });
}

/** "Use the dictionary instead", offered when the AI failed (or there is no key): the dictionary
 * first, so a key that works again is still used for the words the dictionary doesn't have. Only
 * when AI alone is the setting (with Dictionary first the dictionary was already asked) and the
 * language has a dictionary. */
export const offerDictionary = (settings, dict = null) => definerModeOf(settings) === "ai" && !(dict && dict.needed === false);
export const FALLBACK = { id: "dictionary_first", kind: "dictionary_first" };
