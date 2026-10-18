// The phone's Anki sync (anki-droid.js) wired to the app's real storage and the AnkiDroid plugin.

import { createAnkiSync } from "./anki-droid.js";
import { LANGUAGES, isLanguage, studyLanguage } from "./languages.js";
import { AnkiDroid } from "./native.js";
import { kv, lib, now, saveLibrary, saveSettingsPatch, settings } from "./store.js";
import { requestSync } from "./sync.js";

const listeners = new Set();
/** Hear about the sync starting, finishing or being set up differently. Returns a function that stops listening. */
export function onAnki(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const anki = createAnkiSync({
  droid: AnkiDroid,
  vocab: () => lib.vocab,
  settings,
  saveSettings: saveSettingsPatch,
  load: () => kv.get("anki_droid"),
  save: (record) => kv.set("anki_droid", record),
  changed: () => { saveLibrary(); requestSync(); },
  emit: (name, data) => { for (const fn of listeners) fn(data); },
  now,
  languages: {
    names: Object.fromEntries(Object.entries(LANGUAGES).map(([code, info]) => [code, info.name])),
    valid: isLanguage,
    study: studyLanguage,
  },
  source: null,  // set by app.js once it has started (anki.setSource)
});

let timer = 0;
/** Sync with AnkiDroid soon; several requests in a row make one sync. Does nothing while the sync is switched off. */
export function requestAnkiSync(delay = 15000) {
  if (!settings.anki_sync) return;
  clearTimeout(timer);
  timer = setTimeout(() => anki.run().catch((e) => console.warn(e)), delay);
}
