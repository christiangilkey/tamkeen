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
};
const mapChars = (s) => s.replace(/[آأإٱٲٳةىؤئـ]/g, (c) => MAP[c]);

export function normalize(text) {
  return mapChars(String(text || "").replace(DIACRITICS, "")).replace(/\s+/g, " ").trim().toLowerCase();
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
    const mapped = mapChars(ch.replace(DIACRITICS, "")).toLowerCase();
    for (const m of mapped) { chars.push(m); index.push(i); }
    if (mapped) prevSpace = false;
  }
  const norm = chars.join("");
  const spans = [];
  let pos = norm.indexOf(q);
  while (pos !== -1) {
    const start = index[pos];
    let end = index[pos + q.length - 1] + 1;
    while (end < original.length && !original[end].replace(DIACRITICS, "") && !/\s/.test(original[end])) end++;
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
    rows.push([v.text, v.meaning, v.notes, v.sentence, v.episode_title,
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
  return escHtml(v.meaning || "") || escHtml(v.text);
}

/** [Front, Back] for one saved word. */
export function ankiFields(v) {
  const word = escHtml(v.text);
  let sentence = v.sentence || "";
  const spans = v.text ? findSpans(sentence, v.text) : [];
  if (spans.length) {  // found whatever its vowel marks: put the sentence's own spelling in brackets
    const [a, b] = spans[0];
    sentence = `${escHtml(sentence.slice(0, a))}[${escHtml(sentence.slice(a, b))}]${escHtml(sentence.slice(b))}`;
  } else sentence = escHtml(sentence);
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
