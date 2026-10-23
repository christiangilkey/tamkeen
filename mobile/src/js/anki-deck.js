// The Anki deck file (.apkg) the phone builds for "Export for Anki": the same cards, card layout
// and font as the computer's (app/anki_deck.py, which explains the format), with each word's
// audio cut from the episode's audio copy. Keep the two in step: tests compare what they write.

import { ankiFields } from "./shared-logic.js";
import { sqliteFile } from "./sqlite-file.js";
import { clipKind } from "./ogg-clip.js";

export const MODEL_ID = 1791700000001;
export const DECK_ID = 1791700000002;
export const LAYOUT_DATE = 1791700000;
export const FONT_NAME = "_tamkeen-naskh.woff2";
const FIELDS = ["Front", "Back", "image", "TTS Input"];
const TAG = "tamkeen", NOTETYPE = "Tamkeen", DECK = "Tamkeen";

const SCHEMA = [
  ["col", `CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null,
  ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null,
  models text not null, decks text not null, dconf text not null, tags text not null)`],
  ["notes", `CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null,
  usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null,
  flags integer not null, data text not null)`],
  ["cards", `CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null,
  mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null,
  ivl integer not null, factor integer not null, reps integer not null, lapses integer not null,
  left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null)`],
  ["revlog", `CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null,
  ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null)`],
  ["graves", "CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null)"],
];

const CONF = { activeDecks: [1], addToCur: true, collapseTime: 1200, curDeck: 1, curModel: String(MODEL_ID),
  dueCounts: true, estTimes: true, newBury: true, newSpread: 0, nextPos: 1,
  sortBackwards: false, sortType: "noteFld", timeLim: 0, schedVer: 2 };
const DECK_OPTIONS = { 1: {
  id: 1, name: "Default", mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, dyn: false,
  new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
  lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
  rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 100 },
} };

/** What a word's two audio files are called inside Anki (the phone's clips are Ogg Opus; a card's own
 * recording kept as a WAV file gives WAV clips, `ext` "wav"). */
export const clipNames = (uid, ext = { word: "ogg", sentence: "ogg" }) => ({ word: `tk-${uid}-w.${ext.word}`, sentence: `tk-${uid}-s.${ext.sentence}` });
/** The ending for a clip's bytes. */
export const clipExt = (bytes) => clipKind(bytes);

const deck = (id, name, now) => ({ id, name, mod: now, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0],
  timeToday: [0, 0], collapsed: false, browserCollapsed: false, desc: "", dyn: 0, conf: 1, extendNew: 0, extendRev: 0 });

/** The card layout, as Anki stores it. `layout` holds the three files of web/anki-card/. */
export function notetype(layout) {
  return {
    id: MODEL_ID, name: NOTETYPE, type: 0, mod: LAYOUT_DATE, usn: -1, sortf: 0, did: DECK_ID,
    tmpls: [{ name: "Card 1", ord: 0, qfmt: layout.front, afmt: layout.back, did: null, bqfmt: "", bafmt: "" }],
    flds: FIELDS.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: "Arial", size: 20, media: [] })),
    css: layout.css,
    latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n"
      + "\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    latexPost: "\\end{document}", latexsvg: false, req: [[0, "any", [0]]], tags: [], vers: [],
  };
}

/** The settings row of the deck's database: [conf, models, decks, dconf] as Anki's JSON texts. */
export function collectionJson(layout, now, deckIds = { [DECK]: DECK_ID }) {
  const decks = { 1: deck(1, "Default", now) };
  for (const [name, id] of Object.entries(deckIds)) decks[id] = deck(id, name, now);
  return [CONF, { [MODEL_ID]: notetype(layout) }, decks, DECK_OPTIONS];
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'" };
const plain = (markup) => markup.replace(/<[^>]+>/g, "").replace(/&(?:amp|lt|gt|quot|#x27);/g, (e) => ENTITIES[e]).trim();

async function checksum(text) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text)));
  return ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
}

// ----- zip (files stored as they are, not compressed) -----
const CRC = new Uint32Array(256).map((_, i) => {
  let c = i;
  for (let b = 0; b < 8; b++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip archive of [name, bytes] pairs. Names are plain ASCII. */
export function zip(files) {
  const parts = [], directory = [];
  let offset = 0;
  for (const [name, data] of files) {
    const label = new TextEncoder().encode(name), sum = crc32(data);
    const local = new Uint8Array(30 + label.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);              // readable by any zip tool since the 1990s
    lv.setUint16(12, 0x21, true);           // dated 1 Jan 1980 (zip needs some date)
    lv.setUint32(14, sum, true);
    lv.setUint32(18, data.length, true);    // size as stored
    lv.setUint32(22, data.length, true);    // size once unpacked
    lv.setUint16(26, label.length, true);
    local.set(label, 30);
    const entry = new Uint8Array(46 + label.length), ev = new DataView(entry.buffer);
    ev.setUint32(0, 0x02014b50, true);
    ev.setUint16(4, 20, true);
    ev.setUint16(6, 20, true);
    ev.setUint16(14, 0x21, true);
    ev.setUint32(16, sum, true);
    ev.setUint32(20, data.length, true);
    ev.setUint32(24, data.length, true);
    ev.setUint16(28, label.length, true);
    ev.setUint32(42, offset, true);         // where this file's part starts
    entry.set(label, 46);
    parts.push(local, data);
    directory.push(entry);
    offset += local.length + data.length;
  }
  const size = directory.reduce((n, e) => n + e.length, 0), end = new Uint8Array(22), nv = new DataView(end.buffer);
  nv.setUint32(0, 0x06054b50, true);
  nv.setUint16(8, files.length, true);
  nv.setUint16(10, files.length, true);
  nv.setUint32(12, size, true);
  nv.setUint32(16, offset, true);
  const all = [...parts, ...directory, end], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

// ----- learning progress (the same rules as app/anki_deck.py, which explains them) -----
const BOX_DAYS = [0, 1, 2, 4, 8, 16, 32];  // days until a word in box n comes round again
const STARTING_EASE = 2500;

/** Today as a count of local calendar days since 1970, the way the game's `dayNumber` counts. */
export const dayNumber = (d) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);

/** Anki's [type, queue, due, interval, ease, reviews, lapses] for a word. `progress` is the game's
 * record [box, day next due, times right, times wrong], or nothing for a word never reviewed. */
export function cardSchedule(progress, today, position) {
  const [box, dueDay, right, wrong] = Array.isArray(progress) && progress.length === 4 ? progress.map((x) => Math.trunc(Number(x))) : [0];
  if (!(box >= 1) || [dueDay, right, wrong].some(Number.isNaN)) return [0, 0, position, 0, 0, 0, 0];
  const interval = BOX_DAYS[Math.min(box, BOX_DAYS.length - 1)];
  return [2, 2, Math.max(0, dueDay - today), interval, STARTING_EASE, Math.max(0, right) + Math.max(0, wrong), Math.max(0, wrong)];
}

/**
 * The .apkg for these words, as bytes.
 * `clips`: a word's audio by its uid, { word: bytes, sentence: bytes } (either or both, or none).
 * `layout`: { front, back, css } texts of the card layout. `font`: the Arabic font file's bytes.
 * `review`: a word's learning progress by its uid (the game's `review` records); `today` is the
 * day number they are measured from (worked out from `now` unless given).
 * `reviewed(uid, today)`: for a word that has been through the vocab reviewer, what its answers
 * come to: { schedule, data, log } (`ankiCard` in web/js/review/fsrs.js); null for any other word.
 * Such a word takes its schedule, memory state and review log from that instead.
 * `decks`: each language's deck name (anki-droid.js deckNames); a word goes to the deck of its
 * language (`language` for a word that does not say). Without it every word goes to "Tamkeen".
 * Anki files the cards by the deck's name, so they land in the same deck as the sync's.
 */
export async function buildDeck(items, clips, layout, font, now = Date.now() / 1000, review = {}, today = dayNumber(new Date(now * 1000)), reviewed = () => null,
  decks = null, language = "") {
  const stamp = Math.floor(now), media = [[FONT_NAME, font]], notes = [], cards = [], log = [];
  const deckIds = {};  // deck name -> its id in this file
  const deckOf = (v) => {
    const name = (decks || {})[v.language || ""] || (decks || {})[language || ""] || DECK;
    if (!(name in deckIds)) deckIds[name] = DECK_ID + Object.keys(deckIds).length;
    return deckIds[name];
  };
  for (const [n, v] of items.entries()) {
    const mine = clips[v.uid] || {};
    const [front, back] = ankiFields(v), names = clipNames(v.uid, { word: clipExt(mine.word), sentence: clipExt(mine.sentence) });
    let sound = "";
    for (const part of ["word", "sentence"]) {
      if (!mine[part] || !mine[part].length) continue;
      media.push([names[part], mine[part]]);
      sound += `[sound:${names[part]}]`;
    }
    const saved = Math.floor(v.created_at || stamp), id = stamp * 1000 + n, sortText = plain(front);
    notes.push({ id, values: [null, `tk-${v.uid || ""}`, MODEL_ID, saved, -1, ` ${TAG} `,
      [front, back, "", sound].join("\x1f"), sortText, await checksum(sortText), 0, ""] });
    const done = reviewed(v.uid, today);
    if (!done) cards.push({ id, values: [null, id, deckOf(v), 0, saved, -1, ...cardSchedule((review || {})[v.uid], today, n + 1), 0, 0, 0, 0, ""] });
    else {
      cards.push({ id, values: [null, id, deckOf(v), 0, saved, -1, ...done.schedule, 0, 0, 0, 0, done.data] });
      for (const [t, ...rest] of done.log) log.push({ id: t, values: [null, id, -1, ...rest] });
    }
  }
  // Each line of the review log is named by its time in milliseconds, and no two may share one.
  // (The same order as the computer writes: by time, then card, then the rest of the line.)
  log.sort((a, b) => {
    if (a.id !== b.id) return a.id - b.id;
    for (let i = 1; i < a.values.length; i++) if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
    return 0;
  });
  for (let i = 1; i < log.length; i++) if (log[i].id <= log[i - 1].id) log[i].id = log[i - 1].id + 1;
  const [conf, models, deckJson, dconf] = collectionJson(layout, stamp, Object.keys(deckIds).length ? deckIds : undefined)
    .map((o) => JSON.stringify(o));
  const rows = { col: [{ id: 1, values: [null, stamp, stamp * 1000, stamp * 1000, 11, 0, 0, 0, conf, models, deckJson, dconf, "{}"] }],
    notes, cards, revlog: log, graves: [] };
  const db = sqliteFile(SCHEMA.map(([name, sql]) => ({ name, sql, rows: rows[name] })));
  const index = Object.fromEntries(media.map(([name], i) => [i, name]));
  return zip([["collection.anki2", db], ...media.map(([, data], i) => [String(i), data]), ["media", new TextEncoder().encode(JSON.stringify(index))]]);
}
