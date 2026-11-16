// Where the translations under each line (dualsubs.js) are kept on this device: the browser's IndexedDB,
// which every version has (the computer's window, the phones, the web app). localStorage would be too
// small for a long podcast's lines. One record per item and language: {v, at, lines: {line: translation}}.
// Nothing here is synced: lines translated on the phone are asked again on the computer if shown there.
// Older records are thrown away once there are more than KEEP, the least recently written first.

const DB_NAME = "tamkeen-dualsubs";
const STORE = "lines";
const KEEP = 400;
let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((ok, bad) => {
    if (typeof indexedDB === "undefined") { bad(new Error("no IndexedDB")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => bad(req.error);
  }).catch((e) => { opening = null; throw e; });
  return opening;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((ok, bad) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => ok(req && req.result);
    tx.onerror = () => bad(tx.error);
    tx.onabort = () => bad(tx.error);
  });
}

let pruned = false;
/** Once a session: when more than KEEP items are kept, forget the ones written longest ago. */
async function prune() {
  if (pruned) return;
  pruned = true;
  try {
    const keys = await run("readonly", (s) => s.getAllKeys());
    if (!keys || keys.length <= KEEP) return;
    const all = await run("readonly", (s) => s.getAll());
    const order = keys.map((k, i) => [k, Number(all[i] && all[i].at) || 0]).sort((a, b) => a[1] - b[1]);
    const drop = order.slice(0, order.length - KEEP).map(([k]) => k);
    await run("readwrite", (s) => { for (const k of drop) s.delete(k); return null; });
  } catch { /* nothing kept here */ }
}

/** The store dualsubs.js createTranslator takes: {get(key), put(key, value)}. Failing quietly: without
 * IndexedDB the translations are simply asked for again next time. */
export const dualStore = {
  async get(key) {
    try { return (await run("readonly", (s) => s.get(key))) ?? null; } catch { return null; }
  },
  async put(key, value) {
    try { await run("readwrite", (s) => s.put(value, key)); prune(); return true; } catch { return false; }
  },
};
