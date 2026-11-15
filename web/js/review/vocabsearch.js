// Searching the Vocab list with more than words (the owner asked for the search tools of the Anki add-on
// "BetterSearch"; written for Tamkeen from scratch, none of its code is used). Pure, shared by every
// version, tested in tests/js/vocabsearch.test.mjs; the Vocab page (pages/vocab.js) draws the pickers.
//
// What can be typed in the search box, besides words (each can be put after a "-" to leave those words out):
//   folder:Name   folder:"Two words"   folder:none      the words in a folder (or in none)
//   is:new   is:due   is:learned                         never answered / due today / remembered at least once
//   added:…   edited:…   reviewed:…   learned:…          when a word was saved, last changed, answered, or first
//                                                        remembered; … is a number of days (reviewed:7 = the last
//                                                        7 days, today included), a date (2026-04-15), or two
//                                                        with ".." between them (2026-04-15..2026-04-19; either
//                                                        side may be left out)
// The words left over are searched as before (by the computer or the phone, ignoring vowel marks).
//
// Typing "folder:" or "is:" opens a list to pick from, filtered as letters are typed: "b c o" (pieces with
// spaces between, in any order) finds "vocabulary", and "~word" leaves out names with that in them. Typing a date word
// opens a box with two dates.

import { GOOD, answers, dayNumber } from "./fsrs.js";

export const DATE_OPS = ["added", "edited", "reviewed", "learned"];
export const OPS = ["folder", "is", ...DATE_OPS];
export const IS_VALUES = ["new", "due", "learned"];
const TOKEN = /(-?)(\w+):("([^"]*)"?|\S*)/gu;

/** The search box's text, taken apart: {text: the words left over, filters: [{op, value, not}]}. An "x:"
 * whose x isn't one of OPS stays a word (a word may have a colon in it). */
export function parseQuery(raw) {
  const filters = [];
  const text = String(raw || "").replace(TOKEN, (all, neg, op, rest, quoted) => {
    const name = op.toLowerCase();
    if (!OPS.includes(name)) return all;
    const value = (quoted !== undefined ? quoted : rest).trim();
    if (value) filters.push({ op: name, value, not: neg === "-" });
    return " ";
  }).replace(/\s+/gu, " ").trim();
  return { text, filters };
}

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const isoDay = (s) => {
  const m = ISO.exec(s);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.round(t / 86400000) : null;
};
/** "2026-04-15" for a day number. */
export const dayIso = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

/** The days a date value covers, [from, to] (day numbers, both included; null = open), or null if it can't be read. */
export function dateRange(value, today) {
  const v = String(value || "").trim();
  if (/^\d{1,4}$/.test(v)) { const n = Math.max(1, Number(v)); return [today - n + 1, today]; }
  if (v.includes("..")) {
    const [a, b] = v.split("..");
    const from = a ? isoDay(a.trim()) : null, to = b ? isoDay(b.trim()) : null;
    if ((a && from === null) || (b && to === null) || (!a && !b)) return null;
    return [from, to];
  }
  const d = isoDay(v);
  return d === null ? null : [d, d];
}

const localDay = (seconds) => (Number(seconds) > 0 ? dayNumber(new Date(Number(seconds) * 1000)) : null);
const inRange = (day, [from, to]) => day !== null && (from === null || day >= from) && (to === null || day <= to);

/** What the date filters need from the answer log: Map(uid -> {days: [answer days], learned: day | null}). */
export function answerDays(log) {
  const out = new Map();
  for (const [uid, entries] of Object.entries(log || {})) {
    const list = answers(entries);
    const good = list.find((e) => e[1] === GOOD);
    out.set(uid, { days: list.map((e) => e[2]), learned: good ? good[2] : null });
  }
  return out;
}

/**
 * Does word `v` pass every filter? `ctx`: {folders: [{uid, name}], cards: deck.js states(log), days:
 * answerDays(log), today}. A filter that can't be read (an unknown folder, a date that isn't one) lets
 * nothing through, so a typo shows an empty list rather than everything.
 */
export function matches(v, filters, ctx) {
  const uid = String(v.uid || v.id);
  for (const f of filters || []) {
    let yes;
    if (f.op === "folder") {
      const key = f.value.toLowerCase();
      if (key === "none") yes = !(v.folders || []).length;
      else {
        const hits = (ctx.folders || []).filter((x) => String(x.name).toLowerCase() === key).map((x) => x.uid);
        yes = hits.some((h) => (v.folders || []).includes(h));
      }
    } else if (f.op === "is") {
      const c = ctx.cards && ctx.cards.get(uid);
      const value = f.value.toLowerCase();
      yes = value === "new" ? !c : value === "due" ? Boolean(c && (c.learning || c.due <= ctx.today))
        : value === "learned" ? Boolean(c && c.known) : false;
    } else {
      const range = dateRange(f.value, ctx.today);
      const d = ctx.days && ctx.days.get(uid);
      yes = !!range && (f.op === "added" ? inRange(localDay(v.created_at), range)
        : f.op === "edited" ? inRange(localDay(v.updated_at || v.created_at), range)
        : f.op === "reviewed" ? Boolean(d && d.days.some((day) => inRange(day, range)))
        : Boolean(d && inRange(d.learned, range)));
    }
    if (yes === f.not) return false;
  }
  return true;
}

/** Does `name` match what was typed in a picker? Every piece (pieces have spaces between them) must be in
 * it, in any order ("b c o" finds "vocabulary"); a piece starting with "~" must not be. Case is ignored. */
export function fuzzy(typed, name) {
  const hay = String(name || "").toLocaleLowerCase();
  return String(typed || "").toLocaleLowerCase().split(/\s+/u).filter(Boolean)
    .every((piece) => (piece.startsWith("~") ? piece.length < 2 || !hay.includes(piece.slice(1)) : hay.includes(piece)));
}

/** Was a picker word just typed, with nothing after it yet? `text` and the caret's place in it: {op, start,
 * end, not} (start..end is the "folder:" or "-is:" to replace), or null. */
export function trigger(text, caret = String(text || "").length) {
  const before = String(text || "").slice(0, caret);
  const m = /(^|\s)(-?)(\w+):$/u.exec(before);
  if (!m || !OPS.includes(m[3].toLowerCase())) return null;
  const start = m.index + m[1].length;
  return { op: m[3].toLowerCase(), start, end: caret, not: m[2] === "-" };
}

/** `text` with the trigger replaced by `op:value` (quoted when it has a space) and a space after it:
 * {text, caret}. */
export function insertFilter(text, trig, value) {
  const v = /[\s"]/u.test(value) ? `"${String(value).replace(/"/g, "")}"` : value;
  const piece = `${trig.not ? "-" : ""}${trig.op}:${v} `;
  const after = String(text).slice(trig.end).replace(/^\s+/u, "");
  const out = String(text).slice(0, trig.start) + piece + after;
  return { text: out, caret: trig.start + piece.length };
}

/** A date value for the box with two dates: "2026-04-15..2026-04-19", one date, or "" for neither. */
export function dateValue(from, to) {
  if (from && to) return from === to ? from : `${from}..${to}`;
  if (from) return `${from}..`;
  if (to) return `..${to}`;
  return "";
}

/** When a word was answered (`field` "reviewed": every answer) or first remembered ("learned"), in seconds:
 * for the Sort and filter sheet's "Reviewed" and "First learned", which measure in seconds like "Added". */
export function answerSeconds(entries, field) {
  const list = answers(entries);
  if (field === "learned") { const g = list.find((e) => e[1] === GOOD); return g ? [g[0] / 1000] : []; }
  return list.map((e) => e[0] / 1000);
}
