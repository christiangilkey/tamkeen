// JavaScript ports of desktop logic that must give identical results on both platforms:
// global ids (app/ids.py), Arabic search normalization (app/arabic.py), feed URL cleanup
// (app/feeds.py) and transcript/vocab exports (app/exporters.py).

// ---------- ids ----------
async function sha1Hex(text) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function feedUid(url) {
  return "f" + (await sha1Hex(url.trim().toLowerCase())).slice(0, 20);
}
/** Same id the desktop gives an episode (app/ids.py): two devices importing the same page agree. */
export async function episodeUid(feedUidValue, guid) {
  return "e" + (await sha1Hex(`${feedUidValue}\0${guid}`)).slice(0, 20);
}
export function newUid() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return "v" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeUrl(url) {
  url = url.trim();
  if (url.startsWith("feed://")) return "https://" + url.slice(7);
  if (/^(itpc|pcast):\/\//i.test(url)) return "https://" + url.split("://")[1];
  if (!/^https?:\/\//i.test(url)) return "https://" + url;
  return url;
}

// ---------- Arabic normalization ----------
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ࣓-ࣿ]/g;
const MAP = {
  "آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", "ٲ": "ا", "ٳ": "ا",
  "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي", "ـ": "",
  // Persian (as app/arabic.py): ی ک match ي ك, ۀ matches ه, and the half space inside a word (ZWNJ) is ignored.
  "ی": "ي", "ک": "ك", "ۀ": "ه", "‌": "",
};
const mapChars = (s) => s.replace(/[آأإٱٲٳةىؤئـیکۀ‌]/g, (c) => MAP[c]).replace(/\u{901}/gu, "\u{902}"); // (Hindi हूँ / हूं)
// Hindi: the nukta (ज़ / ज) is left off too, as people often write without it (app/arabic.py does the same).
const SEARCH_MARKS = new RegExp(`${DIACRITICS.source.slice(0, -1)}\u{93C}]`, "g");

export function normalize(text) {
  return mapChars(String(text || "").replace(SEARCH_MARKS, "")).replace(/\s+/g, " ").trim().toLowerCase();
}

/** [start, end] offsets of `query` in the original (diacritized) text, using normalized matching. */
export function findSpans(original, query) {
  const q = normalize(query);
  if (!q) return [];
  const chars = [];
  const index = [];
  let prevSpace = true;
  for (let i = 0; i < original.length; i++) {
    const ch = original[i];
    if (/\s/.test(ch)) {
      if (!prevSpace) { chars.push(" "); index.push(i); }
      prevSpace = true;
      continue;
    }
    const mapped = mapChars(ch.replace(SEARCH_MARKS, "")).toLowerCase();
    for (const m of mapped) { chars.push(m); index.push(i); }
    if (mapped) prevSpace = false;
  }
  const norm = chars.join("");
  const spans = [];
  let pos = norm.indexOf(q);
  while (pos !== -1) {
    const start = index[pos];
    let end = index[pos + q.length - 1] + 1;
    while (end < original.length && !original[end].replace(SEARCH_MARKS, "") && !/\s/.test(original[end])) end++;
    spans.push([start, end]);
    pos = norm.indexOf(q, pos + q.length);
  }
  return spans;
}

// ---------- exports ----------
const RLM = "‏";
function ts(sec, sep) {
  let ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000); ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000); ms -= m * 60_000;
  const s = Math.floor(ms / 1000); ms -= s * 1000;
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms, 3)}`;
}
export const toTxt = (segs, title) => [...(title ? [title, ""] : []), ...segs.map((s) => s.text)].join("\n") + "\n";
export const toSrt = (segs) =>
  segs.map((s, i) => `${i + 1}\n${ts(s.start, ",")} --> ${ts(s.end, ",")}\n${RLM}${s.text}\n`).join("\n");
export const toVtt = (segs) =>
  ["WEBVTT", "", ...segs.map((s) => `${ts(s.start, ".")} --> ${ts(s.end, ".")}\n${RLM}${s.text}\n`)].join("\n");

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function vocabCsv(items) {
  const rows = [["Word/Phrase", "Meaning", "Notes", "Sentence", "Episode", "Start (s)", "End (s)"]];
  for (const v of items) {
    rows.push([v.text, v.meaning, v.notes, String(v.sentence ?? "").replace(/[⟦⟧]/g, ""), v.episode_title,
      v.start != null ? v.start.toFixed(2) : "", v.end != null ? v.end.toFixed(2) : ""]);
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c]));
// ----- Anki (the same cards as app/exporters.py makes; the format is explained there) -----
const LABELLED = /^[^:]{1,30}:\s*\S/;
const MARKED = /^[^⟦⟧]*(?:⟦[^⟦⟧]+⟧[^⟦⟧]*)+$/u;
const ankiField = (t) => t.replace(/\t/g, " ").replace(/\r/g, "").replace(/\n/g, "<br>");

/** Split a word's notes into the grammar line and the free notes: [grammar, [note, ...]]. */
export function ankiGrammar(notes) {
  const pieces = String(notes || "").replace(/\r/g, "").split("\n").flatMap((line) => line.split(" · "))
    .map((p) => p.trim()).filter(Boolean);
  const rows = pieces.filter((p) => LABELLED.test(p));
  let kind = "";
  if (rows.length) {
    kind = pieces.find((p) => !rows.includes(p) && p.length <= 30 && p.split(/\s+/).length <= 3 && !/[.!?]/.test(p)) || "";
  }
  const free = pieces.filter((p) => !rows.includes(p) && p !== kind);
  return [[...(kind ? [kind] : []), ...rows].join(" • "), free];
}

/** The prompt side of a word's card: its translated sentence with the word's part in [brackets],
 * or the meaning (or the word itself) when no translation with usable ⟦ ⟧ marks was saved. */
export function ankiFront(v) {
  const translation = v.translation || "";
  if (MARKED.test(translation)) {
    return escHtml(translation.replace(/\[/g, "(").replace(/\]/g, ")")).replace(/⟦/g, "[").replace(/⟧/g, "]");
  }
  const text = v.text || "";
  const meaning = hideAnswer(v.meaning || "", text);
  if (meaning) return escHtml(meaning);
  const said = translation.replace(/[⟦⟧]/g, "").trim();
  if (said && !givesAway(said, text)) return escHtml(said);
  const sentence = String(v.sentence || "").replace(/[⟦⟧]/g, "");
  const spans = text ? findSpans(sentence, text) : [];
  if (spans.length) {
    const [a, b] = spans[0];
    return escHtml(`${sentence.slice(0, a)}…${sentence.slice(b)}`.trim());
  }
  return "…";
}

// ----- keeping the word off the front (hide_answer in app/exporters.py: the same letter ranges) -----
const SCRIPT_LETTERS = {
  Arabic: "؀-؋؍-ؚ؜-؞ؠ-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿",
  Han: "々㐀-䶿一-鿿豈-﫿",
  Hiragana: "぀-ゟ",
  Katakana: "゠-ヿㇰ-ㇿ",
  Cyrillic: "Ѐ-ԯ",
  Hebrew: "֐-׿",
  Greek: "Ͱ-Ͽἀ-῿",
  Hangul: "ᄀ-ᇿ㄰-㆏가-힯",
  Thai: "฀-๿",
  Devanagari: "ऀ-ॿ",
};
const JAPANESE = ["Han", "Hiragana", "Katakana"];
const MARKS = "̀-ͯ҃-҉֑-ׇؐ-ًؚ-ٰٟۖ-ۜ۟-ۤۧۨ"
  + "۪-ۭ࣓-ࣿऀ-ःऺ-ॏ॑-ॗॢॣัิ-ฺ็-๎゙゚";
const QUOTES = `"'‘’“”«»「」『』`;

function answerPattern(word) {
  let used = Object.keys(SCRIPT_LETTERS).filter((name) => new RegExp(`[${SCRIPT_LETTERS[name]}]`, "u").test(word));
  if (used.some((name) => JAPANESE.includes(name))) used = Object.keys(SCRIPT_LETTERS).filter((name) => used.includes(name) || JAPANESE.includes(name));
  if (used.length) {
    const letter = `[${used.map((name) => SCRIPT_LETTERS[name]).join("")}]`;
    return { script: true, re: new RegExp(`${letter}(?:[${MARKS}ـ‌-‏\\s'’-]*${letter})*[${MARKS}]*`, "gu") };
  }
  const exact = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return exact ? { script: false, re: new RegExp(`(?<![\\p{L}\\p{N}_])${exact}(?![\\p{L}\\p{N}_])`, "giu") } : null;
}

/** `text` (a meaning) without anything that gives `word` away: the same as hide_answer in app/exporters.py. */
export function hideAnswer(text, word) {
  const original = String(text || "").trim();
  const found = answerPattern(String(word || ""));
  const has = (s) => { found.re.lastIndex = 0; return found.re.test(s); };
  if (!found || !has(original)) return original;
  let out = original;
  for (let i = 0; i < 2; i++) out = out.replace(/\s*[(\[（][^()\[\]（）]*[)\]）]/gu, (aside) => (has(aside) ? "" : aside));
  const quoted = new RegExp(`\\s*[${QUOTES}]([^${QUOTES}]{1,60})[${QUOTES}]`, "gu");
  out = out.replace(quoted, (all, inner) => (has(inner) && !/[\p{L}\p{N}]/u.test(inner.replace(found.re, "")) ? "" : all));
  if (found.script) out = out.replace(found.re, "");
  out = out.replace(/[(\[（]\s*[)\]）]/gu, "")             // brackets left empty
    .replace(/([,;/(（]|^)\s*[=:→]\s*/gu, "$1 ")            // "= ..." with nothing before the sign
    .replace(/\s*[=:→]\s*(?=[,;/)）]|$)/gu, "")              // "... =" with nothing after it
    .replace(/\s*([,;/])(?:\s*[,;/])+/gu, "$1")              // separators left side by side
    .replace(/\s+([,;.)）])/gu, "$1").replace(/\s{2,}/gu, " ");
  return out.replace(/^[\s,;/=:–-]+|[\s,;/=:–-]+$/gu, "");
}

/** Whether `text` shows `word` (as hideAnswer would find it). */
export function givesAway(text, word) {
  const found = answerPattern(String(word || ""));
  if (!found) return false;
  found.re.lastIndex = 0;
  return found.re.test(String(text || ""));
}

/** [Front, Back] for one saved word. */
/** A sentence's ⟦ ⟧ marks (the parts the learner lit up on the review card): [plain, [[from, to], ...],
 * none]. The same as sentence_marks in app/exporters.py and readMarks in web/js/cardtext.js. */
export function sentenceMarks(text) {
  text = String(text || "");
  const plain = text.replace(/[⟦⟧]/g, "");
  if (plain.length === text.length) return [plain, [], false];
  const marks = [];
  let start = -1, at = 0, none = false;
  for (const ch of text) {
    if (ch === "⟦") {
      if (start >= 0) return [plain, [], false];
      start = at;
    } else if (ch === "⟧") {
      if (start < 0) return [plain, [], false];
      if (at > start) marks.push([start, at]); else none = true;
      start = -1;
    } else at += ch.length;
  }
  if (start >= 0) return [plain, [], false];
  const lit = [];
  for (let [a, b] of marks.sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    while (a < b && /\s/u.test(plain[a])) a++;
    while (b > a && /\s/u.test(plain[b - 1])) b--;
    if (a >= b) continue;
    const last = lit[lit.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else if (last && !/\S/u.test(plain.slice(last[1], a))) last[1] = b;
    else lit.push([a, b]);
  }
  return [plain, lit, none && !lit.length];
}

export function ankiFields(v) {
  const word = escHtml(v.text);
  const [plain, marks, none] = sentenceMarks(v.sentence);
  const spans = none ? [] : marks.length ? marks : (v.text ? findSpans(plain, v.text).slice(0, 1) : []);
  let sentence;
  if (spans.length) {
    // The parts the learner lit up on the card, else the word found whatever its vowel marks: in brackets,
    // as the card layout lights them (the sentence's own brackets become parentheses then; see app/exporters.py).
    const own = marks.length ? plain.replace(/\[/g, "(").replace(/\]/g, ")") : plain;
    let at = 0;
    sentence = "";
    for (const [a, b] of spans) { sentence += `${escHtml(own.slice(at, a))}[${escHtml(own.slice(a, b))}]`; at = b; }
    sentence += escHtml(own.slice(at));
  } else sentence = escHtml(plain);
  const [grammar, free] = ankiGrammar(v.notes || "");
  const lines = [`<b>${word}</b>`];
  if (sentence) lines.push(sentence);
  if (grammar) lines.push(`<i>(${escHtml(grammar)})</i>`);
  free.forEach((note, n) => lines.push((n === 0 ? "Note: " : "") + escHtml(note)));
  // The learner's own notes (a mnemonic, say) follow as a note of their own, line for line.
  String(v.memo || "").replace(/\r/g, "").split("\n").map((m) => m.trim()).filter(Boolean)
    .forEach((m, n) => lines.push((n === 0 ? "Note: " : "") + escHtml(m)));
  return [ankiField(ankiFront(v)), ankiField(lines.join("<br>"))];
}

export function vocabAnki(items) {
  const lines = ["#separator:tab", "#html:true", "#if matches:keep current", "#notetype:Tamkeen", "#deck:Tamkeen",
    "#guid column:1", "#tags column:4", "#columns:GUID\tFront\tBack\tTags"];
  for (const v of items) {
    const [front, back] = ankiFields(v);
    lines.push([`tk-${v.uid || ""}`, front, back, "tamkeen"].join("\t"));
  }
  return lines.join("\n") + "\n";
}
