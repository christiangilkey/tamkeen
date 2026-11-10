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

import { api, on, saveSettings, saveVoice, state, toast } from "./app.js";
import { platform } from "./app.js";
import { voiceTimes } from "./cardvoice.js";
import { courseUrl } from "./coursedata.js";
import { t } from "./i18n.js";
import { studyLanguage } from "./languages.js";
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

// ---------- vocabulary decks: one folder per chapter in the Vocab tab ----------
// (dli.js explains the folders, the cards' sources and the synced setting dli_decks.) A chapter is added
// once: its folder, then its words as cards (POST /vocab/batch, in the deck's language), each with its
// audio when the chapter has been voiced (the chapter's bundle, fetched from the website once, its files
// kept as the cards' voices: saveVoice, the road a basics course word takes). Chapters go in last first:
// the reviewer shows the newest new cards first, so Chapter 1 comes up first. A chapter added before its
// audio existed gets it when a later version brings it. Only while the learner studies the DLI language:
// the Vocab tab shows one language at a time.

const place = (ch) => Number(String(ch.id).slice(1));

async function fetchAudio(id) {
  const host = typeof location !== "undefined" ? location.host : "";
  const res = await fetch(courseUrl(`dli/${id}.bin`, { platform, host }), { cache: "no-cache" });
  if (!res.ok) throw new Error(`The DLI audio couldn't be fetched (HTTP ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Give these cards ({n → card}) their audio from the chapter's bundle. Returns how many got it. */
async function voiceChapter(ch, key, cardsByN) {
  const want = [...cardsByN].filter(([, c]) => c && !c.clip && !voiceTimes(c));
  if (!ch.audio || !want.length) return 0;
  const files = dli.readBundle(await dli.openBytes(key, await fetchAudio(ch.audio), { name: ch.audio }));
  let done = 0;
  const todo = want.filter(([n]) => files.has(n));
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async ([n, card]) => {
      const f = files.get(n);
      try {
        const kept = await saveVoice(card.id, new Blob([f.bytes], { type: "audio/ogg" }), f.times);
        if (kept) Object.assign(card, kept);
        done++;
      } catch (e) { console.warn("DLI audio", n, e); }
    }));
  }
  return done;
}

const progressFns = new Set();
/** Hear how far the adding has got: fn({ deck, chapter, of, words }) each chapter, fn(null) at the end. */
export function onDeckProgress(fn) { progressFns.add(fn); return () => progressFns.delete(fn); }
const tell = (p) => { for (const fn of progressFns) { try { fn(p); } catch { /* a closed panel */ } } };

/** Put one deck's chapters in the Vocab tab (those not added once yet) and give the cards already there the
 *  audio that has come since. `s` is kept current through `settings` ({ get, set }). `others`: the language's other
 *  decks: a word linked to one of theirs (an ICPT deck's word the basic deck has, tools/dli/ICPT.md) files the
 *  learner's card of it in this deck's folder instead of making a second card. Returns { added, voiced }. */
export async function addDeck(deck, language, key, settings, others = []) {
  const marks = dli.deckMarks(settings.get(), deck.id);
  const todo = deck.chapters.filter((ch) => !marks.has(place(ch)));
  // The folders of the new chapters, in course order (the Vocab page lists a deck's folders in the order made).
  const folders = await api("/vocab/folders");
  const uidOf = new Map(folders.map((f) => [f.name, f.uid]));
  for (const ch of todo) {
    const name = dli.deckFolderName(deck, ch);
    if (!uidOf.has(name)) uidOf.set(name, (await api("/vocab/folders", { method: "POST", body: { name } })).uid);
  }
  const folderOf = (id) => { const ch = deck.chapters.find((c) => c.id === id); return ch ? uidOf.get(dli.deckFolderName(deck, ch)) : undefined; };
  // The deck's words already in the learner's cards, by number, and the cards of the language's other decks.
  const have = new Map();
  const theirs = new Map(); // "deck id:n" -> card
  for (const c of await api("/vocab")) {
    const n = dli.deckWordOf(deck, c);
    if (n && !have.has(n)) have.set(n, c);
    for (const o of others) { const m = dli.deckWordOf(o, c); if (m && !theirs.has(`${o.id}:${m}`)) theirs.set(`${o.id}:${m}`, c); }
  }
  let added = 0, voiced = 0, step = 0;
  for (const ch of [...todo].reverse()) {
    tell({ deck: deck.title, chapter: ch.title, step: ++step, of: todo.length, words: added });
    const sealed = await fetchSealed(ch.file);
    if (!sealed) continue;  // (not in this version of the app)
    const data = dli.chapterWords(await dli.openJson(key, sealed, { name: ch.file }));
    const here = folderOf(ch.id);
    // A word the learner has from another deck of the language: that card, not a new one.
    for (const w of data.words) {
      const c = !have.has(w.n) && w.link ? theirs.get(`${w.link.deck}:${w.link.n}`) : null;
      if (c) have.set(w.n, c);
    }
    // A word written in an earlier chapter (or another deck) that is also in this one: into this folder too.
    const also = [...new Set(data.words.filter((w) => have.has(w.n)).map((w) => have.get(w.n)))]
      .filter((c) => here && !(c.folders || []).includes(here));
    if (also.length) await api("/vocab/bulk-folders", { method: "POST", body: { ids: also.map((c) => c.id), add: [here] } });
    for (const c of also) c.folders = [...(c.folders || []), here];
    const fresh = data.words.filter((w) => !w.also && !have.has(w.n));
    const mine = new Map();
    // (a batch's first card is its newest: the chapter's last hundred go in first, so its first word is newest)
    for (let i = Math.floor((fresh.length - 1) / 100) * 100; i >= 0; i -= 100) {
      const part = fresh.slice(i, i + 100);
      const answer = await api("/vocab/batch", { method: "POST", body: { cards: part.map((w) => ({
        text: w.text, meaning: w.meaning, notes: w.notes, sentence: w.sentence, translation: w.translation,
        folders: w.in.map(folderOf).filter(Boolean), source: dli.deckSource(deck, ch, w.n), language })) } });
      (answer.cards || []).forEach((c, k) => { have.set(part[k].n, c); mine.set(part[k].n, c); });
    }
    added += mine.size;
    try { voiced += await voiceChapter(ch, key, mine); } catch (e) { console.warn("DLI audio", ch.id, e); }
    settings.set(await saveSettings({ dli_decks: dli.withDeckMarks(settings.get(), deck.id, [place(ch)]) }));
  }
  // Audio that came after its words: chapters added before, whose cards still have none.
  for (const ch of deck.chapters.filter((c) => c.audio && marks.has(place(c)))) {
    const prefix = `${dli.deckFolderName(deck, ch)} · word `;
    const cards = new Map([...have].filter(([, c]) => String(c.episode_title || c.source || "").startsWith(prefix)));
    try { voiced += await voiceChapter(ch, key, cards); } catch (e) { console.warn("DLI audio", ch.id, e); }
  }
  tell(null);
  return { added, voiced, first: marks.size === 0 };
}

/** The decks of the learner's DLI language, while it is the language being learned. */
export async function addDliDecks({ quiet = false } = {}) {
  let s = await settingsNow();
  const st = dli.dliState(s);
  if (!st.ready || studyLanguage() !== st.language) return { added: 0, voiced: 0 };
  const index = await loadIndex(st.key);
  let added = 0, voiced = 0;
  const decks = dli.contentFor(index, st.language).filter((x) => x.kind === "deck");
  for (const deck of decks) {
    const r = await addDeck(deck, st.language, st.key, { get: () => s, set: (next) => { if (next) s = next; } },
      decks.filter((d) => d !== deck));
    added += r.added;
    voiced += r.voiced;
    if (r.added && !quiet) {
      toast(r.first ? t("{0} is in your Vocab: {1} words, a folder for each chapter.", deck.title, r.added.toLocaleString())
        : t("{0} more words from {1} are in your Vocab.", r.added.toLocaleString(), deck.title));
    }
  }
  return { added, voiced };
}

/** Everything of the learner's DLI language: podcasts, then vocabulary decks. */
export async function addDliContent(opts) {
  const pods = await addDliPodcasts(opts);
  const decks = await addDliDecks(opts);
  return { ...pods, ...decks, added: pods.added + decks.added };
}

let running = null;
let again = false;
/** addDliContent, one run at a time (a second request while one runs makes one more run after it). */
export function runDli(opts) {
  if (running) { again = true; return running; }
  running = addDliContent(opts).catch((e) => { console.warn("DLI content:", e); return { added: 0, stored: 0, error: e }; })
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
