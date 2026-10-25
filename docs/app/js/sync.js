// Phone side of Google Drive sync: same files and merge rules as app/sync/engine.py.
//   library.json.gz       merged record by record (newest updated_at wins; tombstones kept)
//   t_<episode>.json.gz   transcripts, downloaded for offline reading and search
//   a_<episode>.ogg       audio copies, fetched when an episode is first played
//   v_<episode>.<ext>     the user's own videos, streamed from Drive (DriveMediaWebViewClient.java)
// The phone asks the desktop to transcribe (episode.transcribe_requested_at), unless cloud
// transcription is on: then it writes transcripts itself (transcribe-service.js) and uploads them here.

import { drive, gunzipJson, gzipJson } from "./drive.js";
import { audio, kv, lib, saveLibrary, settings, transcripts } from "./store.js";
import { parked } from "./reset.js";
import { cleanFollows, mergeFollows } from "./ytfollow.js";
import { cleanSites, mergeSites } from "./browser-sites.js";
import { cleanCollections, mergeCollections } from "./igcollections.js";
import { cleanProgress, mergeProgress } from "./grammardata.js";
import { cleanKeys, keysFromSettings, takeKeys } from "./aikeys.js";
import { keepVoice } from "./cardvoice.js";
import { cleanPayload, learningPayload, takeLearning } from "./learnlist.js";
import { setStudyLanguage } from "./languages.js";
import { SyncTimer, canSkip, hashText, libraryFingerprint, nudgeKey } from "./syncpace.js";

const LIBRARY = "library.json.gz";
const listeners = new Set();
// received: changes that came from the other devices in the last sync; uploaded: it sent something
// (the other open devices get a nudge, syncnudge.js); nudge_key: that nudge's channel key.
export const syncState = { state: "idle", last_sync: null, error: null, downloaded: 0, received: 0, uploaded: false, nudge_key: "" };

export function onSync(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function publish(patch) {
  Object.assign(syncState, patch);
  for (const fn of listeners) { try { fn({ ...syncState }); } catch (e) { console.error(e); } }
}

// ---------- merge ----------
const newer = (r, l) => (r.updated_at || 0) > (l.updated_at || 0);

/** Should another device's saved game replace this one? The newer save wins, except that a game
 * nobody has played yet (a fresh install's egg) never replaces one with progress. */
export function gameWins(theirs, mine) {
  const a = (theirs.xp || 0) > 0;
  const b = (mine.xp || 0) > 0;
  if (a !== b) return a;
  return (theirs.updated_at || 0) > (mine.updated_at || 0);
}

export function merge(remote) {
  let changed = 0;
  const feeds = new Map(lib.feeds.map((f) => [f.uid, f]));
  for (const r of remote.feeds || []) {
    const l = feeds.get(r.uid);
    // An older device doesn't send a podcast's language; keep the one already known.
    if (!l || newer(r, l)) { feeds.set(r.uid, l ? { ...r, language: r.language || l.language || null } : r); changed++; }
  }
  lib.feeds = [...feeds.values()];
  const deadFeeds = new Set(lib.feeds.filter((f) => f.deleted).map((f) => f.uid));

  const eps = new Map(lib.episodes.map((e) => [e.uid, e]));
  for (const r of remote.episodes || []) {
    const l = eps.get(r.uid);
    if (!l) { eps.set(r.uid, r); changed++; continue; }
    if (newer(r, l)) {
      // A pending request from this phone survives a newer remote record (desktop does the same).
      const req = Math.max(l.transcribe_requested_at || 0, r.transcribe_requested_at || 0) || null;
      // An older desktop doesn't send a language; keep the one already known.
      eps.set(r.uid, { ...r, transcribe_requested_at: req, language: r.language || l.language || null });
      changed++;
    }
  }
  lib.episodes = [...eps.values()].filter((e) => !deadFeeds.has(e.feed_uid));

  const vocab = new Map(lib.vocab.map((v) => [v.uid, v]));
  for (const r of remote.vocab || []) {
    const l = vocab.get(r.uid);
    if (!l) { vocab.set(r.uid, r); changed++; continue; }
    if (newer(r, l)) {
      // A device with an older version sends no translation or memo; keep the ones already known.
      // A card's voice is never taken away by a copy without one (keepVoice).
      vocab.set(r.uid, { ...keepVoice(r, l), translation: r.translation ?? l.translation ?? "", memo: r.memo ?? l.memo ?? "",
                         language: r.language || l.language || null });
      changed++;
    }
  }
  lib.vocab = [...vocab.values()];

  const folders = new Map((lib.folders || []).map((f) => [f.uid, f]));
  for (const r of remote.folders || []) {
    const l = folders.get(r.uid);
    if (!l || newer(r, l)) { folders.set(r.uid, r); changed++; }
  }
  lib.folders = [...folders.values()];

  const defs = new Map(lib.definitions.map((d) => [d.key, d]));
  for (const r of remote.definitions || []) if (!defs.has(r.key)) { defs.set(r.key, r); changed++; }
  lib.definitions = [...defs.values()];

  // Seen words: the newest change to a lexeme wins (seen, or made new again).
  const lexemes = new Map((lib.lexemes || []).map((x) => [x.key, x]));
  for (const r of remote.lexemes || []) {
    if (!r || String(r.key || "").split("|").length < 3) continue;
    const l = lexemes.get(r.key);
    if (!l || newer(r, l)) { lexemes.set(r.key, r); changed++; }
  }
  lib.lexemes = [...lexemes.values()];

  // The reviewer's answers: both devices' lists add up; an answer taken back (0) stays taken back.
  const reviews = (lib.reviews = lib.reviews || {});
  for (const [uid, entries] of Object.entries(remote.reviews && typeof remote.reviews === "object" ? remote.reviews : {})) {
    const mine = (reviews[uid] = reviews[uid] || []);
    const at = new Map(mine.map((e) => [e[0], e]));
    let grew = false;
    for (const e of Array.isArray(entries) ? entries : []) {
      if (!Array.isArray(e) || e.length < 3 || !e.slice(0, 4).every(Number.isInteger) || ![0, 1, 3].includes(e[1])) continue;
      const have = at.get(e[0]);
      if (!have) { const row = [e[0], e[1], e[2], e[3] || 0]; mine.push(row); at.set(row[0], row); grew = true; changed++; }
      else if (e[1] === 0 && have[1] !== 0) { have[1] = 0; changed++; }
    }
    if (grew) mine.sort((a, b) => a[0] - b[0]);
  }

  // The creature game: one saved state for the whole account; the most recently saved wins.
  const game = remote.game;
  const mine = settings.game_state;
  if (game && (game.roster || game.creature) && (!mine || gameWins(game, mine))) {
    settings.game_state = game;
    kv.set("settings", { ...settings }).catch(console.error);
    window.dispatchEvent(new CustomEvent("tamkeen:game", { detail: game }));
    changed++;
  }

  // Followed YouTube channels: for each channel, the copy that changed last wins.
  if (Array.isArray(remote.channels) && remote.channels.length) {
    const before = cleanFollows(settings.youtube_follows);
    const merged = mergeFollows(before, remote.channels);
    if (JSON.stringify(merged) !== JSON.stringify(before)) {
      settings.youtube_follows = merged;
      kv.set("settings", { ...settings }).catch(console.error);
      changed++;
    }
  }

  // Sites saved to the browser's start page: for each address, the copy that changed last wins.
  if (Array.isArray(remote.sites) && remote.sites.length) {
    const before = cleanSites(settings.browser_sites);
    const merged = mergeSites(before, remote.sites);
    if (JSON.stringify(merged) !== JSON.stringify(before)) {
      settings.browser_sites = merged;
      kv.set("settings", { ...settings }).catch(console.error);
      changed++;
    }
  }

  // Grammar lessons finished (grammardata.js): for each lesson, the finish made last wins.
  if (remote.grammar && typeof remote.grammar === "object" && Object.keys(remote.grammar).length) {
    const before = cleanProgress(settings.grammar_progress);
    const merged = mergeProgress(before, remote.grammar);
    if (JSON.stringify(merged) !== JSON.stringify(before)) {
      settings.grammar_progress = merged;
      kv.set("settings", { ...settings }).catch(console.error);
      window.dispatchEvent(new CustomEvent("tamkeen:grammar")); // an open Grammar tab redraws its ticks
      changed++;
    }
  }

  // Saved Instagram collections: the list found last, and the collection chosen last.
  if (remote.ig_collections && typeof remote.ig_collections === "object") {
    const before = cleanCollections(settings.ig_collections);
    const merged = mergeCollections(before, remote.ig_collections);
    if (JSON.stringify(merged) !== JSON.stringify(before)) {
      settings.ig_collections = merged;
      kv.set("settings", { ...settings }).catch(console.error);
      window.dispatchEvent(new CustomEvent("tamkeen:ig-collections")); // an open Reels page redraws its list
      changed++;
    }
  }

  // The user's own AI keys: for each key, the copy changed last wins (see aikeys.js).
  if (remote.keys && typeof remote.keys === "object") {
    const take = takeKeys(settings, remote.keys);
    if (Object.keys(take).length) {
      Object.assign(settings, take);
      kv.set("settings", { ...settings }).catch(console.error);
      changed++;
    }
  }

  // The languages being learned: for each language, the device that ticked or unticked it last wins
  // (learnlist.js). If the one studied here was unticked there, the first one left takes over.
  const learning = takeLearning(settings, remote.learning);
  if (Object.keys(learning).length) {
    const before = { ...settings };
    Object.assign(settings, learning);
    kv.set("settings", { ...settings }).catch(console.error);
    if (learning.study_language) setStudyLanguage(learning.study_language);
    // The top bar's switch and Settings repaint, and say so if the language studied here changed.
    window.dispatchEvent(new CustomEvent("tamkeen:learning", { detail: { before, after: { ...settings } } }));
    changed++;
  }
  return changed;
}

export function snapshot() {
  const live = new Set(lib.feeds.filter((f) => !f.deleted).map((f) => f.uid));
  const byUid = (a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
  return {
    format: 1,
    device: "android",
    feeds: [...lib.feeds].sort(byUid),
    episodes: lib.episodes.filter((e) => live.has(e.feed_uid)).sort(byUid),
    // Words saved before translations (or memos, or card voices) were kept have none; the desktop writes those as "".
    vocab: lib.vocab.map((v) => ({ ...v, translation: v.translation || "", memo: v.memo || "", voice: v.voice || "" })).sort(byUid),
    folders: [...(lib.folders || [])].sort(byUid),
    definitions: [...lib.definitions].sort((a, b) => (a.key < b.key ? -1 : 1)),
    lexemes: [...(lib.lexemes || [])].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    reviews: lib.reviews || {},
    game: settings.game_state || null,
    channels: cleanFollows(settings.youtube_follows),
    sites: cleanSites(settings.browser_sites),
    grammar: cleanProgress(settings.grammar_progress),
    ig_collections: cleanCollections(settings.ig_collections),
    keys: keysFromSettings(settings),
    learning: learningPayload(settings),
  };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
const content = (l) => canonical({ feeds: l.feeds, episodes: l.episodes, vocab: l.vocab, folders: l.folders || [],
                                   definitions: l.definitions, lexemes: l.lexemes || [], reviews: l.reviews || {}, game: l.game || null,
                                   channels: l.channels || [], sites: l.sites || [], grammar: cleanProgress(l.grammar),
                                   ig_collections: cleanCollections(l.ig_collections),
                                   keys: cleanKeys(l.keys), learning: cleanPayload(l.learning) });

// ---------- run ----------
let running = null;
let again = false; // a change came in while a sync was running: run once more after it
// What the last sync ended with, so a check that finds nothing new costs one small Drive request
// (syncpace.js canSkip): {fp, hash, complete, fullAt}. Kept for this run of the app only.
let memo = null;
// The pending sync (syncpace.js): a later, longer request never pushes back a sooner one.
const pending = new SyncTimer(() => { syncNow({ changed: true }).catch(() => {}); });
let flushing = false; // the app is being put away: a small library upload uses fetch's keepalive

/** Schedule a sync shortly, e.g. after a local edit (a sooner one already asked for stays sooner). */
export function requestSync(delayMs = 3000) {
  if (!settings.signed_in || parked()) return;
  pending.request(delayMs);
}

/** The app is being put away, or the reviewer closed: send a waiting change now. True if there was one. */
export function flushSync() {
  if (!pending.pending) return false;
  flushing = true;
  pending.flush();
  return true;
}

/** Sync now. `changed`: there is a change here to send, so if a sync is already running it runs
 *  once more afterwards (that one may have read the library before the change). */
export function syncNow({ changed = false } = {}) {
  // After Reset Tamkeen the library is set aside: never compare an empty one with Drive.
  if (!settings.signed_in || parked()) return Promise.resolve(syncState);
  if (running) {
    if (changed) again = true;
    return running;
  }
  pending.cancel(); // this sync takes any waiting change with it
  running = doSync().finally(() => {
    running = null;
    flushing = false;
    if (again) { again = false; syncNow().catch(() => {}); }
  });
  return running;
}

/** The refresh button: a whole sync that starts now (after one already running, if any), so it
 *  sends what is waiting here and then gets what is new. */
export async function syncFresh() {
  if (running) await running.catch(() => {});
  return syncNow({ changed: true });
}

async function doSync() {
  const was = syncState.state;
  // A check that finds nothing new tells nobody (no page redraws every minute): "syncing" is only
  // announced once there is something to do.
  Object.assign(syncState, { state: "syncing", error: null });
  try {
    let files = Object.fromEntries((await drive.list()).map((f) => [f.name, f]));
    const waiting = ((await kv.get("pending_transcripts")) || []).length + ((await kv.get("pending_clips")) || []).length;
    const fp = libraryFingerprint(files[LIBRARY]);
    if (!waiting && memo && memo.fp === fp && canSkip(memo, fp, hashText(content(snapshot())), Date.now())) {
      // Nothing new in Drive and nothing new here: that was the whole check, one request.
      await kv.set("drive_files", files);
      const done = { state: "idle", last_sync: Date.now() / 1000, downloaded: 0, received: 0, uploaded: false };
      if (was === "error") publish(done); else Object.assign(syncState, done);
      return syncState;
    }
    publish({ state: "syncing", error: null });
    let uploaded = (await uploadPendingTranscripts(files)) > 0;
    await uploadPendingClips(files);
    let received = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const meta = files[LIBRARY];
      const remote = meta ? await gunzipJson(await drive.download(meta.id)) : null;
      if (remote) received += merge(remote);
      const local = snapshot();
      if (remote && content(remote) === content(local)) break;
      if (meta) {
        const current = await drive.get(meta.id);
        if (current.modifiedTime !== meta.modifiedTime) { files[LIBRARY] = current; continue; }
      }
      files[LIBRARY] = await drive.upload(LIBRARY, await gzipJson(local), "application/gzip", meta ? meta.id : null,
                                          { keepalive: flushing });
      uploaded = true;
      break;
    }
    saveLibrary();
    await kv.set("drive_files", files);
    await forgetDeleted();
    const { n: downloaded, failed } = await prefetchTranscripts(files);
    const left = ((await kv.get("pending_transcripts")) || []).length;
    memo = { fp: libraryFingerprint(files[LIBRARY]), hash: hashText(content(snapshot())), complete: !failed && !left, fullAt: Date.now() };
    const key = files[LIBRARY] ? await nudgeKey(files[LIBRARY].id).catch(() => "") : "";
    publish({ state: "idle", last_sync: Date.now() / 1000, downloaded, received: received + downloaded, uploaded, nudge_key: key });
  } catch (e) {
    publish({ state: "error", error: e.message || String(e), uploaded: false, received: 0 });
  }
  return syncState;
}

/** Upload what this phone made itself (the text of imported web pages, captions, transcripts
 * written through a cloud provider), before the library mentions them. */
async function uploadPendingTranscripts(files) {
  const waiting = (await kv.get("pending_transcripts")) || [];
  if (!waiting.length) return 0;
  const left = [];
  let sent = 0;
  for (const uid of waiting) {
    const payload = await transcripts.get(uid);
    const ep = lib.episodes.find((e) => e.uid === uid);
    if (!payload || !ep || ep.deleted) continue;
    const name = `t_${uid}.json.gz`;
    try {
      files[name] = await drive.upload(name, await gzipJson(payload), "application/gzip", files[name] ? files[name].id : null);
      sent++;
    } catch (e) {
      console.warn("Page upload failed", uid, e);
      left.push(uid);
    }
  }
  await kv.set("pending_transcripts", left);
  return sent;
}

/** Upload audio clips of words friends shared with this phone, so the computer gets them too. */
async function uploadPendingClips(files) {
  const pending = (await kv.get("pending_clips")) || [];
  if (!pending.length) return;
  const left = [];
  for (const uid of pending) {
    const blob = await audio.get(`clip:${uid}`);
    const word = lib.vocab.find((v) => v.uid === uid);
    if (!blob || !word || word.deleted) continue;
    const name = `c_${uid}.ogg`;
    try {
      if (!files[name]) files[name] = await drive.upload(name, blob, "audio/ogg");
    } catch (e) {
      console.warn("Clip upload failed", uid, e);
      left.push(uid);
    }
  }
  await kv.set("pending_clips", left);
}

/** Free phone storage held by videos deleted on any device. */
async function forgetDeleted() {
  for (const ep of lib.episodes) {
    if (!ep.deleted) continue;
    await transcripts.delete(ep.uid).catch(() => {});
    await audio.delete(ep.uid).catch(() => {});
  }
}

async function prefetchTranscripts(files) {
  let n = 0;
  let failed = 0;
  for (const ep of lib.episodes) {
    if (ep.deleted) continue;
    const rev = ep.transcript_rev;
    const meta = files[`t_${ep.uid}.json.gz`];
    if (!rev || !meta) continue;
    const have = await transcripts.get(ep.uid);
    if (have && have.rev >= rev - 1e-3) continue;
    try {
      await transcripts.put(ep.uid, await gunzipJson(await drive.download(meta.id)));
      n++;
    } catch (e) {
      console.warn("Transcript download failed", ep.uid, e);
      failed++;
    }
  }
  return { n, failed };
}

/** Download a transcript now (e.g. when opening an episode before a sync finished). */
export async function fetchTranscript(uid) {
  const files = (await kv.get("drive_files")) || {};
  let meta = files[`t_${uid}.json.gz`];
  if (!meta) meta = (await drive.list()).find((f) => f.name === `t_${uid}.json.gz`);
  if (!meta) return null;
  const payload = await gunzipJson(await drive.download(meta.id));
  await transcripts.put(uid, payload);
  return payload;
}

/** Drive file id for a file in the app folder (cached; refreshed if missing). */
export async function driveFileId(name) {
  let files = (await kv.get("drive_files")) || {};
  if (!files[name]) {
    files = Object.fromEntries((await drive.list()).map((f) => [f.name, f]));
    await kv.set("drive_files", files);
  }
  return files[name] ? files[name].id : null;
}

/** Local audio copy for an episode, downloading it from Drive the first time. */
export async function audioCopy(uid) {
  const cached = await audio.get(uid);
  if (cached) return cached;
  const name = `a_${uid}.ogg`;
  let files = (await kv.get("drive_files")) || {};
  if (!files[name]) {
    files = Object.fromEntries((await drive.list()).map((f) => [f.name, f]));
    await kv.set("drive_files", files);
  }
  if (!files[name]) return null;
  const blob = await drive.downloadBlob(files[name].id);
  await audio.put(uid, blob);
  return blob;
}
