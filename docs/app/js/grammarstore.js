// What the grammar courses keep on this device (every version: the computer's window, the phones and
// the web app all have a browser's IndexedDB): the lessons the learner had made in their own language with
// their AI key (paid for once, so never thrown away while still current), the course list made the same
// way, and a copy of each course last read, for when there is no connection. Nothing here is synced: a
// lesson made on the phone is made again on the computer if the learner opens it there.

const DB_NAME = "tamkeen-grammar";
const STORE = "kept";
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

/** The value kept under `key`, or null (also when this device keeps nothing). */
export async function kept(key) {
  try { return (await run("readonly", (s) => s.get(key))) ?? null; } catch { return null; }
}

/** Keep `value` under `key`. False when it couldn't be kept (the lesson still shows, it just isn't kept). */
export async function keep(key, value) {
  try { await run("readwrite", (s) => s.put(value, key)); return true; } catch { return false; }
}

/** Forget `key`. */
export async function forget(key) {
  try { await run("readwrite", (s) => s.delete(key)); } catch { /* nothing kept */ }
}

/** Every key starting with `prefix`. */
export async function keysStarting(prefix) {
  try {
    const all = await run("readonly", (s) => s.getAllKeys());
    return (all || []).filter((k) => typeof k === "string" && k.startsWith(prefix));
  } catch { return []; }
}

// The keys: a lesson made in language `into` from course `course` ("en-ar"); the course list made the same
// way; a course as last downloaded.
export const lessonKey = (course, into, id) => `lesson:${course}:${into}:${id}`;
export const listKey = (course, into) => `list:${course}:${into}`;
export const courseKey = (course) => `course:${course}`;
