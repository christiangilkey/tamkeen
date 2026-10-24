// How the web app and the Tamkeen browser extension (extension/: Netflix's subtitles and Spotify's
// lyrics as words to click) talk.
//
// The extension can't simply read the web app's library: its own pages inside Netflix are another
// website, and browsers keep each website's storage apart. So it has a small part on the web app's
// own pages (extension/src/content/webapp.js) and the two pass messages with window.postMessage on
// that page:
//   extension -> web app  "hello" {nonce}            I'm here (once, when the page opens)
//   web app -> extension  "hello" {nonce}            the same nonce back: from now on every message carries it
//   web app -> extension  "settings" {settings, device}   what the extension needs to look words up
//   extension -> web app  "pending" {words, titles}  words saved (in Netflix or on Spotify) and titles
//                                                    watched in Netflix
//   web app -> extension  "ack" {words, titles}      those are in the library now: forget them
//   extension -> web app  "gone" {}                  the extension was updated or turned off since this
//                                                    page opened: its part here can't pass anything on
//                                                    until the page is loaded again
// Both sides accept a message only from their own window (event.source) and the web app's own address
// (event.origin), with the nonce; anything else is ignored. Everything that arrives is treated as data,
// cleaned to plain short values (cleanSettings, cleanWord, cleanTitle) before it is used.
//
// Pure (no page), shared by the web app (mobile/src/js/web-extension.js) and the extension, and tested
// on its own (tests/js/extbridge.test.mjs).
import { cleanInfo, cleanTitleId } from "./netflix-ttml.js";
import { vocabFromDefinition } from "./languages.js";

export const EXT = "tamkeenExtension"; // the tag on the extension's messages
export const APP = "tamkeenApp";       // the tag on the web app's messages
export const PROTOCOL = 1;
export const TYPES = { [EXT]: ["hello", "pending", "gone"], [APP]: ["hello", "settings", "ack"] };

const PROVIDERS = ["claude", "gemini", "openai", "grok"];
const MODES = ["ai", "dictionary", "dictionary_first"];
const MAX_WORDS = 60000;   // words in one title's subtitles (as the library keeps YouTube captions)
const MAX_LINES = 8000;
const MAX_PENDING = 500;   // saved words in one message

const text = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const code = (v) => (/^[a-z]{2,3}$/.test(String(v ?? "")) ? String(v) : "");
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 1000) / 1000 : null; };
const stamp = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 && n < 1e14 ? n : 0; }; // a time in ms
const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** A random token for one page's conversation. */
export function newNonce(cryptoObj = globalThis.crypto) {
  const b = new Uint8Array(16);
  cryptoObj.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * The message in `event`, if it is one the other side may send: from this very window and the web
 * app's own address, tagged `tag` (EXT or APP) with a known type, and (after "hello") carrying
 * `nonce`. Else null.
 */
export function checkMessage(event, { win, tag, nonce = "" }) {
  if (!event || !win || event.source !== win) return null;
  if (!win.location || event.origin !== win.location.origin) return null;
  const d = event.data;
  if (!plain(d) || d[tag] !== PROTOCOL || !(TYPES[tag] || []).includes(d.type)) return null;
  if (typeof d.nonce !== "string" || !/^[0-9a-f]{32}$/.test(d.nonce)) return null;
  if (d.type !== "hello" && d.nonce !== nonce) return null;
  return d;
}

/** A message to post: {[tag]: PROTOCOL, type, nonce, ...fields}. */
export const message = (tag, type, nonce, fields = {}) => ({ ...fields, [tag]: PROTOCOL, type, nonce });

/** The settings the extension needs (no others ever leave the web app): the languages, how words are
 * explained (provider, key, model, mode, the language of the explanations) and the text size. */
export function cleanSettings(s) {
  if (!plain(s)) return {};
  const out = {
    study_language: code(s.study_language), ui_language: code(s.ui_language),
    // The languages ticked in Settings (a song in one of them is looked up in it without asking).
    learning_languages: (Array.isArray(s.learning_languages) ? s.learning_languages : []).map(code).filter(Boolean).slice(0, 20),
    definer_provider: PROVIDERS.includes(s.definer_provider) ? s.definer_provider : "claude",
    definer_mode: MODES.includes(s.definer_mode) ? s.definer_mode : "dictionary_first",
    definer_language: text(s.definer_language, 40) || "English",
    font_size: Math.min(60, Math.max(12, Number(s.font_size) || 26)),
    // Do saved words get their voice by themselves (cardvoice.js voicesOnSave)? Only that: without it the
    // popup offers "Add audio". The voice settings themselves never leave the web app.
    card_voices: s.card_voices === true,
  };
  for (const p of PROVIDERS) {
    out[`llm_key_${p}`] = String(s[`llm_key_${p}`] ?? "").replace(/\s+/g, "").slice(0, 400);
    out[`definer_model_${p}`] = text(s[`definer_model_${p}`], 80);
  }
  return out;
}

/** This device's own choices that the popup follows: quick or detailed lookups, pause on a tapped word. */
export function cleanDevice(d) {
  const x = plain(d) ? d : {};
  return { lookup_mode: x.lookup_mode === "quick" ? "quick" : "detailed", word_pause: x.word_pause !== false };
}

/** A song on Spotify, as a saved word names it: {id (Spotify's 22-character id, or ""), title,
 * artist}, or null. */
export function cleanTrack(x) {
  if (!plain(x)) return null;
  const title = text(x.title, 300);
  if (!title) return null;
  return { id: /^[A-Za-z0-9]{22}$/.test(String(x.id ?? "")) ? String(x.id) : "", title, artist: text(x.artist, 300) };
}

/** Where a card saved on Spotify came from, as the Vocab page shows it: "Spotify – Artist – Title". */
export const spotifySource = (track) => {
  const t = cleanTrack(track);
  return t ? ["Spotify", t.artist, t.title].filter(Boolean).join(" – ") : "Spotify";
};

/** A word saved in Netflix (netflix_id: the title it is in) or on Spotify (spotify: the song), as it
 * waits for the web app (the extension's panels make them: savedWord, savedSpotifyWord). */
export function cleanWord(w) {
  if (!plain(w)) return null;
  const uid = /^[\w-]{8,64}$/.test(String(w.uid ?? "")) ? String(w.uid) : "";
  const netflix_id = cleanTitleId(w.netflix_id);
  const spotify = netflix_id ? null : cleanTrack(w.spotify);
  const word = text(w.text, 200);
  if (!uid || !(netflix_id || spotify) || !word) return null;
  return {
    uid, netflix_id, text: word, sentence: text(w.sentence, 2000),
    start: num(w.start), end: num(w.end), sent_start: num(w.sent_start), sent_end: num(w.sent_end),
    meaning: text(w.meaning, 1000), notes: text(w.notes, 2000), translation: text(w.translation, 2000),
    language: code(w.language), title: text(w.title, 300), created_at: stamp(w.created_at),
    ...(spotify ? { spotify } : {}),
  };
}

/** Subtitle lines [{start, end, text, words: [[start, end, word]]}], cleaned and limited, or []. */
export function cleanLines(lines) {
  const out = [];
  let total = 0;
  for (const l of Array.isArray(lines) ? lines.slice(0, MAX_LINES) : []) {
    if (!plain(l) || !Array.isArray(l.words)) continue;
    const words = [];
    for (const w of l.words) {
      if (!Array.isArray(w) || w.length < 3) continue;
      const s = num(w[0]);
      const e = num(w[1]);
      const t = String(w[2] ?? "").replace(/\s+/g, "").slice(0, 120);
      if (s === null || e === null || !t) continue;
      words.push([s, Math.max(s, e), t]);
    }
    if (!words.length || total + words.length > MAX_WORDS) continue;
    total += words.length;
    out.push({ start: num(l.start) ?? words[0][0], end: Math.max(num(l.end) ?? 0, words.at(-1)[1]), text: text(l.text, 2000) || words.map((w) => w[2]).join(" "), words });
  }
  return out;
}

/** A title watched in Netflix, as it waits for the web app: {id, info, language, lines, at}, or null. */
export function cleanTitle(t) {
  if (!plain(t)) return null;
  const id = cleanTitleId(t.id);
  if (!id) return null;
  return { id, info: cleanInfo(t.info), language: code(t.language), lines: cleanLines(t.lines), at: stamp(t.at) };
}

/** What the extension sends: at most MAX_PENDING words and the titles, all cleaned; bad ones dropped. */
export function cleanPending(d) {
  const x = plain(d) ? d : {};
  return {
    words: (Array.isArray(x.words) ? x.words.slice(0, MAX_PENDING) : []).map(cleanWord).filter(Boolean),
    titles: (Array.isArray(x.titles) ? x.titles.slice(0, 50) : []).map(cleanTitle).filter(Boolean),
  };
}

/** The web app's answer: which words (by uid) and titles (by id and the time they were sent) it kept. */
export function cleanAck(d) {
  const x = plain(d) ? d : {};
  return {
    words: (Array.isArray(x.words) ? x.words : []).map(String).filter((u) => /^[\w-]{8,64}$/.test(u)),
    titles: (Array.isArray(x.titles) ? x.titles : []).filter(plain).map((t) => ({ id: cleanTitleId(t.id), at: stamp(t.at) })).filter((t) => t.id),
  };
}

// ---------- what waits in the extension until the web app takes it ----------
// Kept in the extension's own storage (chrome.storage.local), one entry each, so the subtitle bar
// adding a word and the web app's page taking words never overwrite each other:
//   "w:<uid>"  a saved word (cleanWord)        "t:<netflix id>"  a watched title (cleanTitle)
export const WORD_KEY = "w:";
export const TITLE_KEY = "t:";

/** A new word's own id. */
export const wordUid = (now = Date.now(), rand = Math.random, prefix = "nfw") =>
  `${prefix}${now.toString(36)}${Math.floor(rand() * 2 ** 40).toString(36).padStart(8, "0")}`;

/** A word saved from a song's lyrics on Spotify: its card's sentence is the lyric line (the song's
 * whole lyrics are never kept), its source the song. `lang`: the language it was looked up in. */
export function savedSpotifyWord({ track, def = null, word, lang, sentence }, now = Date.now(), uid = wordUid(now, Math.random, "spw")) {
  const song = cleanTrack(track);
  if (!song) return null;
  return cleanWord({ uid, spotify: song, ...vocabFromDefinition(def, word, lang), sentence, language: lang,
    title: [song.artist, song.title].filter(Boolean).join(" – "), created_at: now });
}

/** A word saved from a Netflix title's subtitles (def: the popup's answer, or null). */
export function savedWord({ netflixId, def = null, word, lang, sentence, start, end, sentStart, sentEnd, title }, now = Date.now(), uid = wordUid(now)) {
  return cleanWord({ uid, netflix_id: netflixId, ...vocabFromDefinition(def, word, lang), sentence, start, end,
    sent_start: sentStart, sent_end: sentEnd, language: lang, title, created_at: now });
}

/** A title watched, with its subtitles as lines, for the web app's library. */
export const watchedTitle = ({ id, info, language, lines }, now = Date.now()) => cleanTitle({ id, info, language, lines, at: now });

/** What waits, from everything the extension keeps (chrome.storage.local.get(null)): {words, titles},
 * oldest word first. */
export function pendingFrom(items) {
  const words = [];
  const titles = [];
  for (const [key, value] of Object.entries(plain(items) ? items : {})) {
    if (key.startsWith(WORD_KEY)) { const w = cleanWord(value); if (w) words.push(w); }
    else if (key.startsWith(TITLE_KEY)) { const t = cleanTitle(value); if (t) titles.push(t); }
  }
  words.sort((a, b) => a.created_at - b.created_at);
  return { words: words.slice(0, MAX_PENDING), titles };
}

/** The entries to forget once the web app has said what it kept: those words, and those titles unless
 * they changed after they were sent (watched again, better subtitles). */
export function keysToForget(items, ack) {
  const { words, titles } = cleanAck(ack);
  const keys = words.map((u) => WORD_KEY + u).filter((k) => plain(items) && k in items);
  for (const t of titles) {
    const kept = plain(items) ? cleanTitle(items[TITLE_KEY + t.id]) : null;
    if (kept && kept.at <= t.at) keys.push(TITLE_KEY + t.id);
  }
  return keys;
}
