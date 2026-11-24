// Pictures for many cards at once (prototype "card_pictures_openverse": nothing here runs without it): Settings → Flashcards' switch "Add a picture to new
// cards" (cards saved from then on get one, on any screen: the app's api() tells cardsSaved), and "Add pictures to
// my cards" there and in the Vocab page's ⋯ menu (the cards shown: a folder, or all of them).
//
// One worker for both, going gently on Openverse (cardpicture.js has its rules): one card every BATCH_GAP_MS, at
// most BATCH_DAY_CAP searches a day on this device, and a "slow down" (429) stops it at once. A card searched for
// with nothing found is not searched for again on this device (TRIED_KEY). Each card gets Openverse's first picture
// for its short meaning; the learner can change it on the card at any time (components/cardpic.js).

import { feature } from "./prototype.js";
import { BATCH_GAP_MS, batchRoom, cardsWanting, countSearch, firstPicture, pictureOf, searchPictures, searchQuery } from "./cardpicture.js";

const AUTO_KEY = "tk_pic_auto";     // "1": cards saved from now on get a picture (this device)
const TRIED_KEY = "tk_pic_tried";   // uids searched for with nothing found
const TRIED_MAX = 3000;

const store = () => { try { return localStorage; } catch { return null; } };
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const openverseOn = () => feature("card_pictures") && feature("card_pictures_openverse");
export const autoOn = () => openverseOn() && (store() || { getItem: () => null }).getItem(AUTO_KEY) === "1";
export function setAuto(on) {
  try { on ? localStorage.setItem(AUTO_KEY, "1") : localStorage.removeItem(AUTO_KEY); } catch { /* no storage: stays off */ }
}

function tried() {
  try { return new Set(JSON.parse(localStorage.getItem(TRIED_KEY) || "[]")); } catch { return new Set(); }
}
function noteTried(uid) {
  const set = tried();
  set.add(uid);
  try { localStorage.setItem(TRIED_KEY, JSON.stringify([...set].slice(-TRIED_MAX))); } catch { /* full: forget */ }
}

// ---------------------------------------------------------------- the worker

const queue = [];          // cards waiting for a picture
const seen = new Set();    // their uids (a card is queued once)
const listeners = new Set();
export const progress = { running: false, done: 0, added: 0, none: 0, total: 0, stopped: "" };

const tell = () => { for (const fn of listeners) { try { fn({ ...progress, left: queue.length }); } catch { /* a closed screen */ } } };
/** Be told how "Add pictures" is going: fn({running, done, added, none, total, left, stopped}). Returns a stop. */
export function onProgress(fn) {
  listeners.add(fn);
  fn({ ...progress, left: queue.length });
  return () => listeners.delete(fn);
}

/** Queue these cards for a picture (the ones without one, with a meaning). Returns how many were queued. */
export function addPictures(cards) {
  if (!openverseOn()) return 0;
  const want = cardsWanting(cards, tried()).filter((v) => !seen.has(v.uid || v.id));
  for (const v of want) { seen.add(v.uid || v.id); queue.push(v); }
  if (want.length) {
    if (!progress.running) Object.assign(progress, { done: 0, added: 0, none: 0, total: 0, stopped: "" });
    progress.total += want.length;
    run();
  }
  tell();
  return want.length;
}

/** Stop: the cards still waiting are let go of. */
export function stopPictures() {
  for (const v of queue.splice(0)) seen.delete(v.uid || v.id);
  progress.stopped = "stopped";
  tell();
}

/** Cards just saved (the answer of POST /vocab or /vocab/batch). */
export function cardsSaved(data) {
  if (!autoOn()) return;
  const cards = data && Array.isArray(data.cards) ? data.cards : data && typeof data === "object" ? [data] : [];
  addPictures(cards);
}

let worker = null;
let testDeps = {};
/** `deps` lets the tests give their own search, saving and waiting (or _useDeps, for the runs addPictures starts). */
export function run(deps = testDeps) {
  if (worker) return worker;
  const { search = searchPictures, use = null, wait = sleep, room = () => batchRoom(store() || mem, today()), count = () => countSearch(store() || mem, today()),
          changed = () => {} } = deps;
  progress.running = true;
  progress.stopped = "";
  tell();
  worker = (async () => {
    const put = use || (await import("./components/cardpic.js")).useResult;
    let first = true;
    while (queue.length) {
      if (!room()) { progress.stopped = "day"; break; }
      const v = queue.shift();
      if (!v) continue;
      seen.delete(v.uid || v.id);
      if (pictureOf(v)) { progress.done++; tell(); continue; }
      if (!first) await wait(BATCH_GAP_MS);  // (between two searches)
      first = false;
      if (progress.stopped === "stopped") break;  // (Stop pressed while waiting)
      try {
        count();
        const { results } = await search(searchQuery(v.meaning), { pageSize: 5 });
        const pick = firstPicture(results);
        if (pick) {
          const card = await put(v, pick);
          Object.assign(v, { picture: card.picture || "" });
          progress.added++;
          changed(v, card);
          announce(v, card);
        } else {
          noteTried(v.uid || v.id);
          progress.none++;
        }
      } catch (e) {
        if (e && e.rate) { queue.unshift(v); seen.add(v.uid || v.id); progress.stopped = "rate"; break; }
        if (e && (e.offline || e.down)) { queue.unshift(v); seen.add(v.uid || v.id); progress.stopped = "offline"; break; }  // (Openverse down: stop)
        progress.none++;
      }
      progress.done++;
      tell();
    }
    progress.running = false;
    tell();
  })().finally(() => { worker = null; });
  return worker;
}

const mem = { data: new Map(), getItem(k) { return this.data.get(k) ?? null; }, setItem(k, v) { this.data.set(k, String(v)); } };

/** A card got its picture: the screens showing it draw it (pages/vocab.js, pages/review.js listen). */
function announce(v, card) {
  try { window.dispatchEvent(new CustomEvent("tk-card-picture", { detail: { id: v.id, uid: v.uid, picture: card.picture || "" } })); } catch { /* tests */ }
}

/** For the tests: the stand-ins every run uses. */
export function _useDeps(deps) { testDeps = deps || {}; }

/** For the tests: start again. */
export function _reset() {
  queue.splice(0);
  seen.clear();
  Object.assign(progress, { running: false, done: 0, added: 0, none: 0, total: 0, stopped: "" });
}
