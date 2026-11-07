// DLI students' material on this device: reading the encrypted files in web/dli/ (made by
// tools/dli/encrypt.mjs) with the key the password made (dli.js), and putting the podcasts of the
// learner's DLI language in their library, each episode with its ready-made transcript.
//
// The podcasts are added with the app's own ways of doing it, the same on every version: POST
// /api/premade (app/api/premade.py on the computer, its twin in the phone's backend.js) follows the
// podcast like any other and stores each transcript in the sync's own format, matching episodes by
// guid, else by audio address. Running it again changes nothing: a transcript the learner already has
// is kept, and a podcast added once (the synced setting dli_added) isn't followed again if the
// learner removed it afterwards. Locking DLI again leaves the library as it is.
//
// When: on starting (startDli), after each sync (another device may have unlocked it, or new
// episodes may have come), and from Settings right after unlocking or choosing the language.

import { api, on, saveSettings, state, toast } from "./app.js";
import { platform } from "./app.js";
import { t } from "./i18n.js";
import * as dli from "./dli.js";

const BASE = new URL("../dli/", import.meta.url);
let cached = null; // { key, index }

/** The current settings: the computer's server may have newer ones than the page (a sync brought them). */
async function settingsNow() {
  if (platform === "desktop") {
    try { return await api("/settings"); } catch { /* the page's copy then */ }
  }
  return (state.status && state.status.settings) || {};
}

async function fetchSealed(name) {
  const res = await fetch(new URL(`${name}.bin`, BASE), { cache: "no-cache" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The DLI file couldn't be read (HTTP ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

/** What there is (dli.cleanIndex), opened with `key`. No index shipped = nothing yet. Throws when the
 *  key doesn't open it (a key from another password). */
export async function loadIndex(key) {
  if (cached && cached.key === key) return cached.index;
  const sealed = await fetchSealed(dli.INDEX_NAME);
  const index = sealed ? dli.cleanIndex(await dli.openJson(key, sealed, { name: dli.INDEX_NAME })) : dli.emptyIndex();
  cached = { key, index };
  return index;
}

/** One file of the material, opened: a Blob of its type. */
export async function openFile(key, item) {
  const sealed = await fetchSealed(item.id);
  if (!sealed) throw new Error("This file isn't in this version of the app.");
  return new Blob([await dli.openBytes(key, sealed, { name: item.id })], { type: item.type });
}

async function openTranscript(key, id) {
  const sealed = await fetchSealed(id);
  return sealed ? dli.openJson(key, sealed, { name: id }) : null;
}

const CHUNK = 5; // transcripts sent at once (each is up to a few hundred kB)

/**
 * Put one podcast in the library (unless it was added once already and `follow` is false) and give each
 * episode that has no transcript yet its ready-made one. Returns { feedId, added, stored }.
 */
export async function addPodcast(pod, language, key, { follow = true } = {}) {
  const base = { feed_url: pod.feed, language, title: pod.title };
  const first = await api("/premade", { method: "POST", body: { ...base, follow,
    items: pod.episodes.map((e) => ({ guid: e.guid, audio_url: e.audio })) } });
  if (!first || !first.feed_id) return { feedId: null, added: false, stored: 0 };
  let stored = 0;
  const need = (first.need || []).map((i) => pod.episodes[i]).filter(Boolean);
  for (let i = 0; i < need.length; i += CHUNK) {
    const items = [];
    for (const e of need.slice(i, i + CHUNK)) {
      const payload = await openTranscript(key, e.file).catch(() => null);
      if (payload) items.push({ guid: e.guid, audio_url: e.audio, payload });
    }
    if (!items.length) continue;
    const r = await api("/premade", { method: "POST", body: { ...base, follow: false, items } });
    stored += (r && r.stored) || 0;
  }
  return { feedId: first.feed_id, added: !!first.added_feed, stored };
}

/** The podcasts of the learner's DLI language, each added once, with their transcripts. */
export async function addDliPodcasts({ quiet = false } = {}) {
  let s = await settingsNow();
  const st = dli.dliState(s);
  if (!st.ready) return { added: 0, stored: 0 };
  const index = await loadIndex(st.key);
  let added = 0, stored = 0;
  for (const pod of dli.contentFor(index, st.language).filter((x) => x.kind === "podcast")) {
    const once = dli.addedList(s).includes(dli.addedName(st.language, pod.id));
    const r = await addPodcast(pod, st.language, st.key, { follow: !once });
    if (r.feedId && !once) {
      // (remembered on every device, so removing it later is respected everywhere)
      s = await saveSettings({ dli_added: dli.withAdded(s, st.language, pod.id) });
    }
    if (r.added) {
      added++;
      if (!quiet) toast(t("{0} is in your podcasts, every episode already transcribed.", pod.title));
    }
    stored += r.stored;
  }
  return { added, stored };
}

let running = null;
let again = false;
/** addDliPodcasts, one run at a time (a second request while one runs makes one more run after it). */
export function runDli(opts) {
  if (running) { again = true; return running; }
  running = addDliPodcasts(opts).catch((e) => { console.warn("DLI content:", e); return { added: 0, stored: 0, error: e }; })
    .finally(() => {
      running = null;
      if (again) { again = false; runDli(); }
    });
  return running;
}

/** On starting the app: a first look a little after the page is up, then after each sync. */
export function startDli() {
  setTimeout(() => runDli(), 4000);
  let timer = 0;
  on("sync", (st) => {
    if (st && st.state && st.state !== "idle") return;
    clearTimeout(timer);
    timer = setTimeout(() => runDli(), 3000);
  });
}
