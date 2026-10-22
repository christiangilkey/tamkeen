// The extension's storage (the twin of the phone's mobile/src/js/store.js, which the shared screens
// import as "./store.js"):
//   - kv: the downloaded dictionaries and the answers already looked up (IndexedDB, in the extension's
//     own space);
//   - settings: the ones the web app handed over (content/webapp.js keeps them in chrome.storage.local),
//     over these defaults until it has.
const DB_NAME = "tamkeen-ext";
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv"); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", mode);
    const req = fn(tx.objectStore("kv"));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const kv = {
  get: (key) => run("readonly", (s) => s.get(key)),
  set: (key, value) => run("readwrite", (s) => s.put(value, key)),
};

export const now = () => Date.now() / 1000;

export const DEFAULTS = {
  study_language: "", ui_language: "", font_size: 26,
  definer_provider: "claude", definer_mode: "dictionary_first", definer_language: "English",
  definer_model_claude: "", definer_model_gemini: "", definer_model_openai: "", definer_model_grok: "",
  llm_key_claude: "", llm_key_gemini: "", llm_key_openai: "", llm_key_grok: "",
};
export const settings = { ...DEFAULTS };
/** This device's own choices, from the web app: {lookup_mode, word_pause}. */
export const device = { lookup_mode: "detailed", word_pause: true };

/** Has the web app told the extension its settings yet? */
export const known = () => !!settings.study_language;

export async function loadSettings() {
  const got = await chrome.storage.local.get(["settings", "device"]);
  Object.assign(settings, DEFAULTS, got.settings || {});
  Object.assign(device, got.device || {});
  return settings;
}

/** A setting changed here (the popup's "explain words with" menu): kept until the web app next hands
 * over its own, which win. */
export async function saveSettingsPatch(patch) {
  Object.assign(settings, patch);
  await chrome.storage.local.set({ settings: { ...settings } });
  return settings;
}
