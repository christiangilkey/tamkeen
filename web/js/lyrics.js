// Song lyrics for Tamkeen's karaoke view (the browser extension, on Spotify's web player): reading
// LRC files, the line being sung at a moment, choosing LRCLIB's record for the song playing, the
// lines and words the view shows, and which language a song is in. Pure: tested on its own
// (tests/js/lyrics.test.mjs); the extension's background part (extension/src/background.js) and its
// Spotify panel (extension/src/js/ext/spotify-panel.js) use it.
//
// LRCLIB (https://lrclib.net) is a free, open collection of song lyrics with line timings, asked by
// a song's title, artist and length. It needs no key; its terms ask a client to name itself, to ask
// one thing at a time with a short pause between, to keep answers for a while, and to wait as long
// as it says when it is busy (lrclibRequests, retryDelay). The lyrics themselves may be protected by
// copyright: Tamkeen shows them while the song plays and keeps only the line of a word the learner
// saves (as that card's sentence), never a song's whole lyrics.

import { spread } from "./ytcaptions.js";
import { isLanguage, looksPersian, regroupWords } from "./languages.js";

export const LRCLIB = "https://lrclib.net";

const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------- LRC files ----------
// "[01:02.50] a line" (minutes, seconds, hundredths: also "[1:02]", "[01:02.5]", "[01:02.500]",
// "[01:02:50]"); several stamps before one line when it comes back ("[00:12.00][00:45.10] chorus");
// "[offset:+250]" moves every line 0.25 s earlier; "[ar:…]", "[ti:…]" and the like say who and what;
// a stamp with no words is a pause in the singing. "<00:12.34>" before single words (word timings,
// "enhanced LRC") are left out: the view spreads a line's words over it.

const LEAD_STAMP = /^\s*\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const TAG = /^\[([a-z#][\w#]{0,15}):([^\]]*)\]$/i;
const WORD_STAMP = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

const stampSeconds = (m) => Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 10 ** m[3].length : 0);

/**
 * LRC text -> {lines: [{start, text}], synced, offset}: the lines in time order, a pause being a line
 * with no text (never first, never two in a row). `synced` is false when no line has a time (then
 * see plainLines).
 */
export function parseLrc(text) {
  let offset = 0;
  const found = [];
  for (const raw of String(text ?? "").replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const tag = TAG.exec(line);
    if (tag) {
      if (tag[1].toLowerCase() === "offset") {
        const ms = parseInt(String(tag[2]).replace(/\s+/g, ""), 10);
        if (Number.isFinite(ms) && Math.abs(ms) < 600000) offset = ms / 1000;
      }
      continue;
    }
    const times = [];
    let rest = line;
    for (let m = LEAD_STAMP.exec(rest); m; m = LEAD_STAMP.exec(rest)) {
      times.push(stampSeconds(m));
      rest = rest.slice(m[0].length);
    }
    if (!times.length) continue; // (a line without a time: not part of a timed file)
    const words = rest.replace(WORD_STAMP, "").replace(/\s+/g, " ").trim();
    for (const t of times) found.push({ start: t, text: words });
  }
  found.sort((a, b) => a.start - b.start); // (stable: lines at the same moment keep their order)
  const lines = [];
  for (const l of found) {
    const start = r3(Math.max(0, l.start - offset));
    if (!l.text && (!lines.length || !lines[lines.length - 1].text)) continue; // a pause before anything, or after a pause
    lines.push({ start, text: l.text });
  }
  while (lines.length && !lines[lines.length - 1].text) lines.pop();
  return { lines, synced: lines.length > 0, offset };
}

/** Lyrics with no timings -> their lines, [{start: null, text}], a blank line kept (once) between
 * verses as a line with no text. Any LRC stamps in them are taken off. */
export function plainLines(text) {
  const out = [];
  for (const raw of String(text ?? "").replace(/^﻿/, "").split(/\r?\n/)) {
    let line = raw.trim();
    if (TAG.test(line)) continue;
    for (let m = LEAD_STAMP.exec(line); m; m = LEAD_STAMP.exec(line)) line = line.slice(m[0].length);
    line = line.replace(WORD_STAMP, "").replace(/\s+/g, " ").trim();
    if (!line && (!out.length || !out[out.length - 1].text)) continue;
    out.push({ start: null, text: line });
  }
  while (out.length && !out[out.length - 1].text) out.pop();
  return out;
}

// ---------- the lines the view shows ----------

// About how long it takes to sing a line: a moment per letter, longer for a character that is a
// whole syllable (Chinese, Japanese, Korean). A line's words are spread over that time, or until the
// next line starts if that is sooner.
const SYLLABLE_CHARS = /[぀-ヿ㐀-䶿一-鿿가-힯]/gu;
function singingTime(text) {
  const letters = (String(text).match(/[\p{L}\p{N}]/gu) || []).length;
  const syllables = (String(text).match(SYLLABLE_CHARS) || []).length;
  return clamp((letters - syllables) * 0.13 + syllables * 0.32, 1.5, 8);
}

/**
 * Timed lines ([{start, text}], parseLrc) -> the lines the view shows, shaped like subtitle lines
 * (netflix-ttml.js captionLines): [{start, end, text, words: [[start, end, word], ...]}]. A line ends
 * when the next begins, or once it has had time to be sung; its words are spread over it (good
 * enough to follow along). Pauses (lines with no text) are left out. Lines with no time (plainLines)
 * get start = end = -1 and words with no time.
 */
export function lyricLines(timed, { duration = 0 } = {}) {
  const out = [];
  const list = Array.isArray(timed) ? timed : [];
  for (let i = 0; i < list.length; i++) {
    const text = String(list[i].text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const start = list[i].start;
    if (start === null || start === undefined || !Number.isFinite(start)) {
      out.push({ start: -1, end: -1, text, words: text.split(" ").filter(Boolean).map((w) => [-1, -1, w]) });
      continue;
    }
    const next = i + 1 < list.length && Number.isFinite(list[i + 1].start) ? list[i + 1].start : (duration > start ? duration : Infinity);
    let end = Math.min(next, start + singingTime(text));
    if (!(end > start)) end = start + 0.5; // (two lines at the same moment)
    const words = spread(text, start, end);
    if (words.length) out.push({ start: r3(start), end: r3(end), text, words });
  }
  return out;
}

/** Are these view lines timed (lyricLines of an LRC file)? */
export const timedLines = (lines) => Array.isArray(lines) && lines.length > 0 && lines.every((l) => Number.isFinite(l.start) && l.start >= 0);

/**
 * The line being sung at `t` seconds: the last line that has begun (a moment early, as karaoke
 * shows it), while it lasts and for `hold` seconds after (a short pause keeps it); -1 before the
 * first line and in a long pause.
 */
export function lineAt(lines, t, hold = 4) {
  const n = Array.isArray(lines) ? lines.length : 0;
  if (!n || !Number.isFinite(t)) return -1;
  let lo = 0, hi = n - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start <= t + 0.15) { hit = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (hit < 0 || lines[hit].start < 0) return -1;
  return t <= lines[hit].end + hold ? hit : -1;
}

/** The last line that has begun at `t` (where the view stays during a pause), or -1. */
export function lineBefore(lines, t) {
  const n = Array.isArray(lines) ? lines.length : 0;
  let lo = 0, hi = n - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start <= t + 0.15) { hit = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return hit >= 0 && lines[hit].start >= 0 ? hit : -1;
}

/**
 * The words of `lines` in `lang`, as the view and the word lookups use them: parallel lists
 * {start, end, seg, text} (seg: the line a word is in). Languages written without spaces (Japanese,
 * Chinese, Thai) are split into words here by the same word splitters as everywhere in Tamkeen
 * (languages.js regroupWords: the dictionary's once loaded, else the device's); Persian words keep
 * their half spaces.
 */
export function lineWords(lines, lang) {
  const W = { start: [], end: [], seg: [], text: [] };
  (Array.isArray(lines) ? lines : []).forEach((l, si) => {
    for (const [s, e, w] of l.words || []) { W.start.push(s); W.end.push(e); W.text.push(w); W.seg.push(si); }
  });
  if (!isLanguage(lang)) return W;
  return regroupWords(W, lang, true, (si) => (lines[si] ? lines[si].text : ""));
}

// ---------- matching LRCLIB's records to the song playing ----------
// A song as Spotify names it: {title, artist ("Luis Fonsi, Daddy Yankee"), album, duration (s)}.

// Parts of a title that name a version rather than the song: "(feat. …)", "[Remastered 2011]",
// " - Live at …", " - Radio Edit".
const VERSION = "feat|ft\\.|featuring|with|remaster|live|version|edit|mix|remix|mono|stereo|acoustic|from|deluxe|bonus|instrumental|explicit|clean|radio|single|original|demo|en vivo|ao vivo|dal vivo|unplugged|sped up|slowed|session|soundtrack|ost";
const BRACKETED = new RegExp(`\\s*[(\\[{](?:[^)\\]}]*?(?:${VERSION})[^)\\]}]*)[)\\]}]`, "gi");
const DASHED = new RegExp(`\\s+[-–—]\\s+[^-–—]*?(?:${VERSION}).*$`, "i");
const FEAT = /\s+(?:feat\.?|ft\.|featuring)\s+.*$/i;

/** A name made comparable: no accents or marks, small letters, letters and numbers only. `strip`:
 * without the parts that name a version (see above). */
export function normName(s, strip = true) {
  let x = String(s ?? "");
  if (strip) x = x.replace(BRACKETED, "").replace(DASHED, "").replace(FEAT, "");
  x = x.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/&/g, " and ");
  return x.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The artists in Spotify's or LRCLIB's artist text, each made comparable. */
export function artistNames(s) {
  return String(s ?? "")
    .split(/\s*(?:,|;|\/|&|\+|\s(?:feat\.?|ft\.|featuring|with|x|and|y|e|et|und|i)\s)\s*/i)
    .map((a) => normName(a, false)).filter(Boolean);
}

/** The first artist, as written (for asking LRCLIB). */
export const firstArtist = (s) => String(s ?? "").split(/\s*(?:,|;|&|\s(?:feat\.?|ft\.|featuring)\s)\s*/i)[0].trim();

const wordsOf = (s) => new Set(String(s).split(" ").filter(Boolean));
function overlap(a, b) {
  const A = wordsOf(a), B = wordsOf(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.max(A.size, B.size);
}

/**
 * How well an LRCLIB record fits the song (higher is better), or -Infinity when it is another song or
 * another recording: the length must be within a few seconds (LRCLIB's own rule is ±2 s); the title
 * must be the same (or one contain the other); the artist counts for it or against it. Timed lyrics
 * count for it. `trusted`: the record came from LRCLIB's own matching (/api/get), so only the length
 * is checked (a title may be written in another script there: "Tamally Maak" for تملي معاك).
 */
export function lyricsScore(rec, track, { trusted = false } = {}) {
  if (!rec || typeof rec !== "object" || !track) return -Infinity;
  const synced = typeof rec.syncedLyrics === "string" && rec.syncedLyrics.trim() !== "";
  const plain = typeof rec.plainLyrics === "string" && rec.plainLyrics.trim() !== "";
  if (!synced && !plain && !rec.instrumental) return -Infinity;
  let score = 0;
  const d1 = Number(track.duration), d2 = Number(rec.duration);
  if (d1 > 0 && d2 > 0) {
    const d = Math.abs(d1 - d2);
    if (d > 8) return -Infinity;
    score -= d <= 2 ? d * 0.5 : 1 + (d - 2);
  }
  if (!trusted) {
    const a = normName(track.title), b = normName(rec.trackName ?? rec.name);
    if (!a || !b) return -Infinity;
    if (normName(track.title, false) === normName(rec.trackName ?? rec.name, false)) score += 6;
    else if (a === b) score += 5;
    else if (b.includes(a) || a.includes(b)) score += 3;
    else if (overlap(a, b) >= 0.6) score += 1;
    else return -Infinity;
    const A = artistNames(track.artist), B = artistNames(rec.artistName);
    if (A.length && B.length) {
      if (A.some((x) => B.includes(x))) score += 4;
      else if (A.some((x) => B.some((y) => x.includes(y) || y.includes(x)))) score += 2;
      else score -= 3; // someone else's song of that name (or the name written in another script)
    }
  } else score += 6;
  if (synced) score += 3;
  if (rec.instrumental && !synced && !plain) score -= 1;
  return score;
}

/** The record that fits the song best, or null (records: [{rec, trusted}] or plain records). */
export function pickLyrics(records, track, min = 2) {
  let best = null, top = -Infinity;
  for (const item of Array.isArray(records) ? records : []) {
    const rec = item && item.rec ? item.rec : item;
    const s = lyricsScore(rec, track, { trusted: !!(item && item.trusted) });
    if (s > top) { top = s; best = rec; }
  }
  return top >= min ? best : null;
}

/** What to ask LRCLIB, in order, for a song: its exact signature (title, artist, album, length),
 * then a search by title and artist, then by words. [{kind: "get"|"search", url}]. */
export function lrclibRequests(track, base = LRCLIB) {
  const title = String((track && track.title) || "").trim();
  const artist = String((track && track.artist) || "").trim();
  const duration = Math.round(Number(track && track.duration) || 0);
  const out = [];
  if (!title) return out;
  if (artist && duration >= 1 && duration <= 3600) {
    const q = new URLSearchParams({ track_name: title, artist_name: artist });
    if (track.album) q.set("album_name", String(track.album));
    q.set("duration", String(duration));
    out.push({ kind: "get", url: `${base}/api/get?${q}` });
  }
  const short = title.replace(BRACKETED, "").replace(DASHED, "").replace(FEAT, "").trim() || title;
  const first = firstArtist(artist);
  out.push({ kind: "search", url: `${base}/api/search?${new URLSearchParams(first ? { track_name: short, artist_name: first } : { track_name: short })}` });
  if (first) out.push({ kind: "search", url: `${base}/api/search?${new URLSearchParams({ q: `${short} ${first}` })}` });
  return out;
}

/** How long to wait before asking LRCLIB again after `status` (429: too many requests, 503: busy),
 * in ms: what its Retry-After header says (in seconds), with up to 30% more at random so that clients
 * held back together don't all come back together; -1 when not to try again (another status, or
 * after `attempt` tries already). */
export function retryDelay(status, retryAfter, attempt = 0, rand = Math.random) {
  if (status !== 429 && status !== 503) return -1;
  if (attempt >= 2) return -1;
  let s = retryAfter === null || retryAfter === undefined || String(retryAfter).trim() === "" ? NaN : Number(retryAfter);
  if (!Number.isFinite(s) || s < 0) s = status === 503 ? 1 : 5;
  if (s > 60) return -1; // (much later: give up on this song for now)
  return Math.round(s * 1000 * (1 + 0.3 * rand()));
}

/** The key a song's lyrics are kept under (for a while, in the extension). */
export const lyricsKey = (track) =>
  [normName(track && track.title), normName(firstArtist(track && track.artist), false), Math.round(Number(track && track.duration) || 0)].join("|");

// ---------- which language a song is in ----------
// By the writing first (each script's letters counted; a character that is a whole syllable counts
// for more), then, for songs in Latin letters, by their words: each taught language's 1000 commonest
// words (web/js/wordlists, passed in as `lists`) say how likely each word is in it (Zipf: the n-th
// commonest about 1/n). A song whose words are mostly not common in any of them is in some other
// language ("").

const SCRIPT_RULES = [
  ["hangul", /[가-힯ᄀ-ᇿ㄰-㆏]/gu, 3],
  ["kana", /[぀-ヿ]/gu, 2],
  ["han", /[㐀-䶿一-鿿]/gu, 3],
  ["thai", /[฀-๿]/gu, 1],
  ["devanagari", /[ऀ-ॿ]/gu, 1],
  ["arabic", /[؀-ۿݐ-ݿࢠ-ࣿ]/gu, 1],
  ["cyrillic", /[Ѐ-ӿ]/gu, 1],
  ["hebrew", /[֐-׿]/gu, 1],
  ["greek", /[Ͱ-Ͽ]/gu, 1],
  ["latin", /[a-zÀ-ɏ]/giu, 1],
];
const LATIN_TAUGHT = ["en", "es", "fr", "it", "pt", "ca", "de", "tl", "ceb"];
const ranks = new WeakMap();
function rankOf(list) {
  if (!ranks.has(list)) {
    const m = new Map();
    list.forEach((w, i) => { const k = String(w).toLowerCase(); if (!m.has(k)) m.set(k, i); });
    ranks.set(list, m);
  }
  return ranks.get(list);
}

/**
 * The language a song's words are in: {lang, script, sure}. `lang` is a language code ("es", or one
 * Tamkeen doesn't teach such as "uk", "he"), or "" when it can't be told; `sure` is a rough 0..1.
 * `lists`: {code: [the 1000 commonest words]} for the languages written in Latin letters (missing
 * ones are not considered).
 */
export function detectLyricsLanguage(text, lists = {}) {
  const s = String(text ?? "").slice(0, 20000);
  let script = "", top = 0, total = 0;
  const weight = {};
  for (const [name, re, w] of SCRIPT_RULES) {
    const n = (s.match(re) || []).length * w;
    weight[name] = n;
    total += n;
    if (n > top) { top = n; script = name; }
  }
  if (!top) return { lang: "", script: "", sure: 0 };
  const share = top / total;
  const pick = (lang, sure = share) => ({ lang, script, sure: Math.round(sure * 100) / 100 });
  if (script === "han" || script === "kana") {
    // Japanese writes Chinese characters with kana between them; Chinese has no kana.
    return pick(weight.kana >= 0.05 * (weight.han + weight.kana) ? "ja" : "zh", (weight.han + weight.kana) / total);
  }
  if (script === "hangul") return pick("ko");
  if (script === "thai") return pick("th");
  if (script === "devanagari") return pick("hi");
  if (script === "arabic") return pick(looksPersian(s, "") ? "fa" : "ar");
  if (script === "hebrew") return pick("he");
  if (script === "greek") return pick("el");
  if (script === "cyrillic") {
    const cyr = (s.match(/[Ѐ-ӿ]/gu) || []).length || 1;
    if ((s.match(/[іїєґІЇЄҐ]/gu) || []).length / cyr > 0.01) return pick("uk");
    if ((s.match(/[ђјљњћџЂЈЉЊЋЏ]/gu) || []).length / cyr > 0.01) return pick("sr");
    return pick("ru");
  }
  // Latin letters: by the words.
  const tokens = (s.toLowerCase().normalize("NFC").match(/[a-zÀ-ɏ]+/giu) || []).slice(0, 3000);
  if (!tokens.length) return pick("", 0);
  let best = "", bestScore = -Infinity, bestHits = 0;
  for (const code of LATIN_TAUGHT) {
    if (!Array.isArray(lists[code]) || !lists[code].length) continue;
    const rank = rankOf(lists[code]);
    let score = 0, hits = 0;
    for (const tok of tokens) {
      const r = rank.get(tok);
      if (r === undefined) score -= Math.log(20000);
      else { score -= Math.log(r + 10); hits++; }
    }
    if (score > bestScore) { bestScore = score; best = code; bestHits = hits; }
  }
  const covered = bestHits / tokens.length;
  if (!best || covered < 0.35) return pick("", covered);
  return pick(best, Math.min(share, covered));
}
