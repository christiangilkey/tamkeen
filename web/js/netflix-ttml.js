// Netflix's subtitle files (TTML), read in JavaScript: the browser extension (extension/) catches
// them as Netflix's own player downloads them, and keeps the one in the language being learned as
// the title's transcript. The same rules as the computer's Python (app/netflix.py parse_ttml,
// caption_lines, SubtitleCatcher, display_title).
//
// Pure: no page, no DOM (the extension reads files in its service worker, which has no DOMParser),
// so it is unit-tested on its own (tests/js/netflix-ttml.test.mjs).
import "./netflix-common.js"; // track languages ("ar-LB" -> "ar"): globalThis.__tamkeenNetflixLib
import { spread } from "./ytcaptions.js";
import { isLanguage } from "./languages.js";

export const MAX_TTML_BYTES = 10 * 1024 * 1024;
const lib = () => globalThis.__tamkeenNetflixLib;
/** "ar-LB" -> "ar", "zh-Hans" -> "zh", "fil" (Netflix's Filipino) -> "tl" (netflix-common.js). */
export const baseLanguage = (code) => lib().base(code);

export class TtmlError extends Error {}

// ---------- a small XML reader (just enough for subtitle files) ----------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? all;
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""; } catch { return ""; }
  });
}
const local = (name) => String(name).split(":").pop();
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/y;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** XML text -> its root element: {name, attrs: {localName: value}, xmlLang, kids: [element|string]}. */
function parseXml(text) {
  const doc = { name: "#doc", attrs: {}, kids: [] };
  const stack = [doc];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(text);
    if (!m || m.index !== at) throw new TtmlError("That subtitle file can't be read.");
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.kids.push(m[1]);
    else if (m[2] !== undefined) {
      if (stack.length < 2 || top.raw !== m[2]) throw new TtmlError("That subtitle file can't be read.");
      stack.pop();
    } else if (m[3] !== undefined) {
      const el = { name: local(m[3]), raw: m[3], attrs: {}, xmlLang: null, kids: [] };
      for (const a of (m[4] || "").matchAll(ATTR)) {
        const value = decode(a[2] ?? a[3] ?? "");
        if (a[1] === "xml:lang") el.xmlLang = value;
        el.attrs[local(a[1])] = value;
      }
      top.kids.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.kids.push(decode(m[6]));
  }
  if (stack.length !== 1) throw new TtmlError("That subtitle file can't be read.");
  const root = doc.kids.find((k) => typeof k === "object");
  if (!root) throw new TtmlError("That subtitle file can't be read.");
  return root;
}

// ---------- times ----------

const CLOCK = /^(\d+):(\d{1,2}):(\d{1,2}(?:[.,]\d+)?)$/;
const FRAMES = /^(\d+):(\d{1,2}):(\d{1,2}):(\d+)(?:\.(\d+))?$/;
const OFFSET = /^(\d+(?:\.\d+)?)(h|ms|m|s|f|t)$/;

const number = (text, fallback) => {
  const v = Number(String(text ?? "").trim());
  return text != null && String(text).trim() !== "" && v > 0 ? v : fallback;
};
function rates(root) {
  let frame = number(root.attrs.frameRate, 30);
  const mult = String(root.attrs.frameRateMultiplier || "").split(/\s+/).filter(Boolean);
  if (mult.length === 2) frame *= number(mult[0], 1) / number(mult[1], 1);
  const sub = number(root.attrs.subFrameRate, 1);
  const tick = root.attrs.tickRate ? number(root.attrs.tickRate, 1) : root.attrs.frameRate ? frame * sub : 1;
  return { tick, frame, sub };
}

/** A TTML time ("240000000t", "00:00:24.000", "00:00:24:12", "24.5s", "1500ms") in seconds, or null. */
export function ttmlSeconds(expr, r = { tick: 1, frame: 30, sub: 1 }) {
  const s = String(expr ?? "").trim();
  if (!s) return null;
  let m = CLOCK.exec(s);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3].replace(",", "."));
  m = FRAMES.exec(s);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / r.frame + Number(m[5] || 0) / (r.frame * r.sub);
  m = OFFSET.exec(s);
  if (m) {
    const v = Number(m[1]);
    return { h: v * 3600, m: v * 60, s: v, ms: v / 1000, f: v / r.frame, t: v / r.tick }[m[2]];
  }
  return null;
}

// ---------- cues ----------

// Marks that are invisible but split words wrongly (bidi controls Arabic subtitles are full of).
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g;
const SOUND = /\[[^\]]*\]|[♪♫]+/g;
const DASH = /^\s*[-–—]+\s*/;

/** A cue's words: its text and spans, a line break as a space, without sound labels, the dash that
 * opens a speaker's line, or invisible marks. */
function cueText(p) {
  const parts = [];
  const walk = (el) => {
    for (const k of el.kids) {
      if (typeof k === "string") parts.push(k);
      else if (k.name === "br") parts.push("\n");
      else if (k.name !== "metadata") walk(k);
    }
  };
  walk(p);
  return parts.join("").replace(INVISIBLE, "").split("\n")
    .map((line) => line.replace(DASH, "").replace(SOUND, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean).join(" ");
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * A TTML / DFXP subtitle file (as Netflix serves them) -> {lang, cues: [[start, end|null, text]]}, times
 * in seconds, in order. Throws TtmlError for anything that isn't a readable subtitle file.
 */
export function parseTtml(text) {
  text = String(text ?? "").replace(/^﻿/, "");
  if (text.length > MAX_TTML_BYTES) throw new TtmlError("That subtitle file is too big.");
  if (/<!ENTITY/i.test(text)) throw new TtmlError("That subtitle file can't be read.");
  const start = text.indexOf("<");
  const root = parseXml(start >= 0 ? text.slice(start) : text);
  if (root.name !== "tt") throw new TtmlError("That isn't a subtitle file.");
  const r = rates(root);
  let lang = root.xmlLang || "";
  const cues = [];
  const walk = (el, offset) => {
    if (!lang && el.xmlLang) lang = el.xmlLang;
    if (["head", "metadata", "styling", "layout"].includes(el.name)) return;
    const began = ttmlSeconds(el.attrs.begin, r);
    const here = offset + (began || 0);
    if (el.name === "p") {
      if (began === null) return;
      const end = ttmlSeconds(el.attrs.end, r);
      const dur = ttmlSeconds(el.attrs.dur, r);
      const stop = end !== null ? offset + end : dur !== null ? here + dur : null;
      const words = cueText(el);
      if (words) cues.push([r3(here), stop === null ? null : r3(stop), words]);
      return;
    }
    for (const k of el.kids) if (typeof k === "object") walk(k, here);
  };
  for (const k of root.kids) if (typeof k === "object") walk(k, 0);
  cues.sort((a, b) => a[0] - b[0]);
  return { lang: lang.trim(), cues };
}

/** Cues -> lines as the app keeps captions: [{start, end, text, words: [[start, end, word]]}]. A cue
 * still on screen when the next begins ends there, as for YouTube's captions. */
export function captionLines(cues) {
  const lines = [];
  (cues || []).forEach(([start, end, text], i) => {
    const next = i + 1 < cues.length ? cues[i + 1][0] : null;
    if (end === null || end === undefined) end = next !== null && next > start ? next : start + 2;
    else if (next !== null && start < next && next < end) end = next;
    if (end <= start) end = start + 0.5;
    const words = spread(text, start, end);
    let floor = lines.length ? lines[lines.length - 1].words.at(-1)[0] : 0;
    for (const w of words) { // times never run backwards
      w[0] = Math.max(w[0], floor);
      w[1] = Math.max(w[1], w[0]);
      floor = w[0];
    }
    if (words.length) lines.push({ start: words[0][0], end: r3(Math.max(end, words.at(-1)[1])), text, words });
  });
  return lines;
}

// ---------- which downloads are subtitle files, and which one to keep ----------

/** Netflix's video servers, which serve the subtitle files too. */
export const SUBTITLE_HOSTS = /(^|\.)nflxvideo\.net$/;

/** Is this download (seen as Netflix's player makes it) possibly a subtitle file? Served as XML from
 * Netflix's video servers at "/"; video pieces (under /range/) and pictures (svg) are not. */
export function isSubtitleDownload(url, contentType, hosts = SUBTITLE_HOSTS) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol) || !hosts.test(u.hostname.toLowerCase()) || /^\/range\//.test(u.pathname)) return false;
  const type = String(contentType || "").toLowerCase();
  return !type.includes("svg") && ["xml", "ttml", "vtt", "text/plain"].some((x) => type.includes(x));
}

/**
 * The subtitle file to keep as a title's transcript, of those seen while it played: in the language
 * being learned (`wanted`), the variant the player chose first (`chosen`, "ar-LB"), then the one with
 * the most lines (Netflix also fetches its "forced" lines, a few signs, and other languages' files).
 * `files`: [{lang, cues, at}]. Returns one of them, or null.
 */
export function bestSubtitles(files, wanted, chosen = "") {
  const want = baseLanguage(wanted);
  const pick = String(chosen || "").toLowerCase();
  const ok = (files || []).filter((f) => f && want && baseLanguage(f.lang) === want && f.cues && f.cues.length);
  const key = (f) => [pick && String(f.lang).toLowerCase() === pick ? 1 : 0, f.cues.length, f.at || 0];
  return ok.reduce((best, f) => {
    if (!best) return f;
    const a = key(f), b = key(best);
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k] ? f : best;
    return best;
  }, null);
}

// ---------- the subtitles chosen in Netflix's player ----------

/** The Tamkeen language a Netflix track's language is ("ar-LB" -> "ar", "fil" -> "tl"), or "" when
 * Tamkeen doesn't teach it (its words can still be shown, not looked up). */
export function tamkeenLanguage(code) {
  const b = baseLanguage(code);
  return b && isLanguage(b) ? b : "";
}

/**
 * The subtitles the viewer has on in Netflix's player, from its page's state (js/netflix-player.js):
 * {off: true} when they are turned off, else {off: false, id, bcp47, base, lang, name, cc, image}
 * (`lang`: the Tamkeen language to look their words up in, "" if Tamkeen doesn't teach it); null
 * while that isn't known (no player yet, or Tamkeen is about to choose the language being learned).
 * The subtitle bar, the transcript and the word lookups follow these.
 */
export function selectedSubtitles(s) {
  if (!s || typeof s !== "object") return null;
  const subs = s.subs && typeof s.subs === "object" ? s.subs : {};
  const describe = (t) => ({ off: false, id: String(t.id || ""), bcp47: String(t.bcp47 || ""), base: baseLanguage(t.bcp47),
    lang: tamkeenLanguage(t.bcp47), name: String(t.name || t.bcp47 || ""), cc: !!t.cc, image: !!t.image });
  const tracks = s.tracks && typeof s.tracks === "object" ? s.tracks : null;
  if (!tracks) return subs.status === "chosen" && subs.bcp47 ? describe({ bcp47: subs.bcp47, name: subs.name }) : null; // (no lists)
  if (subs.status === "waiting" && s.learning) return null; // being chosen for the language being learned
  if (tracks.textNow === "off") return { off: true };
  const hit = (Array.isArray(tracks.text) ? tracks.text : []).find((t) => t && t.id === tracks.textNow);
  return hit && baseLanguage(hit.bcp47) ? describe(hit) : null;
}

// ---------- a title's name ----------

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const whole = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/** What a page said about a title, kept to plain short values (app/netflix.py clean_info). */
export function cleanInfo(info) {
  const raw = info && typeof info === "object" ? info : {};
  const image = String(raw.image || "");
  return { title: clip(raw.title, 200), show: clip(raw.show, 200), season: whole(raw.season), episode: whole(raw.episode),
    episode_title: clip(raw.episode_title, 200), image: image.startsWith("https://") ? image.slice(0, 500) : "", duration: whole(raw.duration) };
}

/** "Show · S1:E3 · Episode title" for an episode, the film's title for a film (app/netflix.py display_title). */
export function displayTitle(info) {
  const { show, title, episode_title: ep, season, episode } = cleanInfo(info);
  if (show) {
    const number = season && episode ? `S${season}:E${episode}` : "";
    return [show, number, ep && ep !== show ? ep : ""].filter(Boolean).join(" · ").slice(0, 300);
  }
  return (title || ep || "Netflix title").slice(0, 300);
}

/** A Netflix title number, or "" ("81234567"). */
export const cleanTitleId = (v) => (/^\d{3,12}$/.test(String(v ?? "").trim()) ? String(v).trim() : "");
