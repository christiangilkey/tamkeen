// "I've already started": counting a language's 1000 most common words (wordlists/<code>.js) as
// words the learner has already seen, so the app doesn't treat them as new.
//
// The seen-words list itself is lexicon/words.js and the /lexemes calls (one list, synced between
// a person's devices); this file only puts the common words into it. Shared with the phone.
//
// Arabic words are known by their dictionary form, which needs the Arabic dictionaries. Those are
// downloaded later, and only if the learner agrees, so for Arabic the wish is remembered in the
// `common_words_pending` setting until someone calls addCommonWords("ar", dicts) with them loaded.

import { api, esc, h, state, saveSettings } from "./app.js";
import { LANGUAGES, isLanguage } from "./languages.js";
import { lexemeOf, needsDictionaries } from "./lexicon/words.js";

export const COMMON_WORDS = 1000;

/** The language's most common words, most common first ([] for a language without a list). */
export async function commonWords(lang) {
  if (!isLanguage(lang)) return [];
  try { return (await import(`./wordlists/${lang}.js`)).default; } catch { return []; }
}

const pending = () => {
  const list = state.status && state.status.settings && state.status.settings.common_words_pending;
  return Array.isArray(list) ? list : [];
};
export const commonWordsPending = (lang) => pending().includes(lang);

async function setPending(lang, waiting) {
  const now = pending();
  if (now.includes(lang) === waiting) return;
  await saveSettings({ common_words_pending: waiting ? [...now, lang] : now.filter((c) => c !== lang) });
}

/**
 * Count the language's common words as seen. `dicts` = that language's loaded dictionaries, for
 * the languages that need them (see lexicon/words.js). Returns {added, pending}: `pending` is true
 * when it has to wait for dictionaries, or couldn't be saved just now.
 */
export async function addCommonWords(lang, dicts = null) {
  const words = await commonWords(lang);
  if (words.length && needsDictionaries(lang) && !(dicts && dicts.length)) { // they aren't loaded
    await setPending(lang, true);
    return { added: 0, pending: true };
  }
  // One word at a time: a list is not a sentence, and Arabic is read with an eye on its neighbours.
  const found = words.map((w) => lexemeOf(w, lang, dicts));
  const items = [...new Map(found.filter(Boolean).map((x) => [x.key, x])).values()]; // forms of one word share a key
  try {
    const r = items.length ? await api("/lexemes", { method: "POST", body: { items } }) : { added: 0 };
    await setPending(lang, false);
    if (r.added) window.dispatchEvent(new Event("tamkeen:lexemes")); // screens showing new words read the list again
    return { added: r.added || 0, pending: false };
  } catch (e) {
    console.error(e);
    await setPending(lang, true);
    return { added: 0, pending: true, failed: true };
  }
}

/**
 * For Settings: a button that does what "I've already started" does on first run, for someone
 * who answered "beginner" then, changed language since, or used the app before the question existed.
 */
export function commonWordsButton(lang) {
  const name = LANGUAGES[lang].name;
  const el = h(`<div class="row">
    <button type="button">I already know the basics: count the ${COMMON_WORDS} most common ${esc(name)} words as seen</button>
    <span class="small muted"></span></div>`);
  const note = el.querySelector("span");
  if (commonWordsPending(lang)) note.textContent = `Waiting for the ${name} dictionaries: they'll be counted once those are downloaded.`;
  el.querySelector("button").onclick = async (e) => {
    e.target.disabled = true;
    note.textContent = "Adding…";
    // Dictionaries, for the languages that need them (null when they aren't downloaded yet).
    const dicts = await import("./lexicon/seen.js").then((m) => m.dictionaries(lang)).catch(() => null);
    const r = await addCommonWords(lang, dicts);
    note.textContent = r.failed ? "That couldn't be saved just now. Try again."
      : r.pending ? `They'll be counted once the ${name} dictionaries are downloaded.`
      : r.added ? `Done: ${r.added.toLocaleString()} words now count as seen.` : "They already count as seen.";
    e.target.disabled = false;
  };
  return el;
}
