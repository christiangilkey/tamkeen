// On-phone storage (IndexedDB): the synced library, transcripts, audio copies and settings.
//
// The library is kept in exactly the format of library.json.gz in Google Drive, so syncing is
// a record-by-record merge with no translation layer.

import { stampKeys } from "./aikeys.js";

const DB_NAME = "aps";
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ["kv", "transcripts", "audio"]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const kv = {
  get: (key) => run("kv", "readonly", (s) => s.get(key)),
  set: (key, value) => run("kv", "readwrite", (s) => s.put(value, key)),
};
export const transcripts = {
  get: (uid) => run("transcripts", "readonly", (s) => s.get(uid)),
  put: (uid, payload) => run("transcripts", "readwrite", (s) => s.put(payload, uid)),
  delete: (uid) => run("transcripts", "readwrite", (s) => s.delete(uid)),
  keys: () => run("transcripts", "readonly", (s) => s.getAllKeys()),
};
export const audio = {
  get: (uid) => run("audio", "readonly", (s) => s.get(uid)),
  put: (uid, blob) => run("audio", "readwrite", (s) => s.put(blob, uid)),
  delete: (uid) => run("audio", "readwrite", (s) => s.delete(uid)),
};

// ---------- library (in memory, persisted after each change) ----------

export const lib = { feeds: [], episodes: [], vocab: [], folders: [], definitions: [], lexemes: [], reviews: {} };
let saveTimer = 0;

export async function loadLibrary() {
  const saved = await kv.get("library");
  if (saved) Object.assign(lib, saved);
}

export function saveLibrary() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => kv.set("library", lib).catch(console.error), 200);
}

export const now = () => Date.now() / 1000; // seconds, matching the desktop's timestamps

// ---------- settings ----------

export const DEFAULTS = {
  theme: "system",
  font_size: 26,
  page_font_size: 17,
  welcome_seen: false,
  study_language: "", // the language being learned (ar, es, fr, ja, zh, ru, it, tl, pt, ca, ceb, th, en, de); chosen on first run
  learning_languages: [], // every language being learned (the top bar's switch); study_language is the one now
  learning_times: {},     // {code: ms} when each was last ticked or unticked; synced (web/js/learnlist.js)
  ui_language: "",    // the language the user speaks: the app's own words are shown in it (i18n.js)
  onboarded: false,   // the first-run questions have been answered (components/onboarding.js)
  study_level: "",    // "beginner" or "started"
  common_words_pending: [], // languages whose common words wait for dictionaries before counting as seen (commonwords.js)
  definer_provider: "claude",
  definer_mode: "dictionary_first", // the default; "ai"; "dictionary": No AI, words explained by the built-in dictionary (meanings.js); "dictionary_first": the dictionary, and the AI for words it lacks
  review_task_target: "google", // the Review tab's button sends the day's review to "google" (Tasks) or "onyx"
  review_task: {}, // {day, id}: today's review task in Google Tasks, updated rather than added again
  definer_language: "English",
  definer_model_claude: "", definer_model_gemini: "", definer_model_openai: "", definer_model_grok: "",
  // The review card's Mnemonic maker: its own model ("" = fastest, "same" = the lookups') and thinking (definer.mnemonicConfig).
  mnemonic_model_claude: "", mnemonic_model_gemini: "", mnemonic_model_openai: "", mnemonic_model_grok: "", mnemonic_effort: "off",
  llm_key_claude: "", llm_key_gemini: "", llm_key_openai: "", llm_key_grok: "",
  // Cloud transcription (transcribe-service.js): "local" = the computer writes transcripts, "cloud" = a provider does, from this phone.
  stt_mode: "local", stt_provider: "groq", stt_model_groq: "", stt_model_openai: "", stt_key_groq: "", stt_key_openai: "",
  google_email: "",
  signed_in: false,
  haptics: true,
  lexicon_declined: false, // "not now" to a dictionaries download (a list of languages; true = Arabic)
  ru_stress: true,         // Russian text shows stress marks (ла́дно) once its word table is here
  show_vowels: false,      // Arabic: words drawn with vowel marks, made on the computer (js/vowels.js)
  vowels_dialect: false,   // ...also on dialect speech, where they are a guess
  lexemes_backfilled: [],  // languages whose earlier lookups and saved words have been counted as seen
  game_state: null, // the creature game's saved state
  youtube_follows: [], // followed YouTube channels (web/js/ytfollow.js); synced with the library
  browser_sites: [],   // sites saved to the in-app browser's start page (web/js/browser-sites.js); synced too
  ig_collections: null, // saved Instagram collections found and the one chosen (web/js/igcollections.js); synced too
  game_sound: true,
  game_enabled: true,
  // The two-way sync with one AnkiDroid deck (anki-droid.js): on or off, the deck's name, and whether
  // the learner has agreed that deleting a word also deletes its card.
  anki_sync: false,
  anki_deck: "Tamkeen",  // the single deck there was before each language had its own
  anki_decks: null,      // language -> deck name (anki-droid.js deckNames); null until first used
  anki_delete_ok: false,
  // Japanese, Chinese and Thai reading aids (web/js/lexicon/readings.js): furigana, pinyin, the characters
  // Chinese is shown in ("" as written, "simplified", "traditional"), and how Thai words are said.
  furigana: true,
  pinyin: true,
  zh_script: "",
  thai_readings: true,
};
export const settings = { ...DEFAULTS };

export async function loadSettings() {
  Object.assign(settings, DEFAULTS, (await kv.get("settings")) || {});
  // A phone set up before the app taught other languages was learning Arabic.
  if (settings.welcome_seen && !settings.study_language) settings.study_language = "ar";
  // "Dictionary first" became the default (2026-10-20). This copy keeps every setting, defaults included,
  // so an older "ai" may never have been chosen: without any AI key it can't work, so it moves on, once.
  if (!settings.definer_default_moved) {
    const anyKey = ["claude", "gemini", "openai", "grok"].some((p) => settings[`llm_key_${p}`]);
    if (settings.definer_mode === "ai" && !anyKey) settings.definer_mode = "dictionary_first";
    settings.definer_default_moved = true;
    await kv.set("settings", { ...settings });
  }
  return settings;
}

export async function saveSettingsPatch(patch) {
  // A changed AI key notes when, so it wins over older copies on the user's other devices.
  Object.assign(settings, stampKeys(settings, patch));
  await kv.set("settings", { ...settings });
  return settings;
}
