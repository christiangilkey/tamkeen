// A teacher's notes on the words of something in the Classroom (prototype "classroom"): which words are
// important, the teacher's own definition of a word, and a note on it. This is the small part every reading
// screen needs: the notes' shape, how a tapped word is matched to one, and where a student's device keeps the
// notes of the items it has taken (so the word popup can show them without the internet).
// The Classroom itself is components/classroompanel.js; the online side supabase/v17-dli-classroom.sql.
// No page and no other module here: tests/js/classroom.test.mjs runs it without a browser.
//
// A note: { w: the word as the teacher saved it, important: true|false, meaning: "", note: "", s: the sentence }.
// Notes go by the word, not by its place: every time the word comes up in the item, the note shows, and editing
// the transcript moves nothing.

export const NOTES_MAX = 300;      // notes on one item
export const NOTE_WORD_MAX = 80;
export const NOTE_MEANING_MAX = 300;
export const NOTE_TEXT_MAX = 500;
export const NOTE_SENTENCE_MAX = 400;

const MARKS = /[ً-ٰٟـ֑-ׇ̀-ͯ]/g; // Arabic and Hebrew vowel marks, the stretch line, accents written apart
const EDGE = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;
const INVISIBLE = /[​-‏‪-‮⁦-⁩؜﻿­]/g;

/** A word as notes are matched: no marks, no punctuation round it, small letters. */
export function noteKey(word) {
  return String(word ?? "").normalize("NFKC").replace(INVISIBLE, "").normalize("NFD").replace(MARKS, "").normalize("NFC")
    .replace(EDGE, "").replace(/\s+/g, " ").toLowerCase();
}

const line = (v, max) => String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const para = (v, max) => String(v ?? "").replace(/[<>]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** Notes made safe: only words with something to say (important, a meaning or a note), each word once. */
export function cleanNotes(list) {
  const out = [];
  const seen = new Set();
  for (const n of Array.isArray(list) ? list : []) {
    if (!n || typeof n !== "object") continue;
    const w = line(n.w, NOTE_WORD_MAX);
    const key = noteKey(w);
    if (!key || seen.has(key)) continue;
    const note = { w, important: n.important === true, meaning: line(n.meaning, NOTE_MEANING_MAX), note: para(n.note, NOTE_TEXT_MAX), s: line(n.s, NOTE_SENTENCE_MAX) };
    if (!note.important && !note.meaning && !note.note) continue;
    seen.add(key);
    out.push(note);
    if (out.length >= NOTES_MAX) break;
  }
  return out;
}

/** A teacher's notes on an item, from the teacher's own flashcards of it (GET /vocab rows for that episode):
 * a card marked important, its meaning as the teacher wrote it, its grammar notes. Important ones first. */
export function notesFromCards(cards) {
  const rows = (Array.isArray(cards) ? cards : []).filter((c) => c && !c.deleted && String(c.text || "").trim())
    .map((c) => ({ w: c.text, important: !!c.important, meaning: c.meaning, note: c.notes, s: String(c.sentence || "").replace(/[⟦⟧]/g, "") }));
  rows.sort((a, b) => Number(b.important) - Number(a.important));
  return cleanNotes(rows);
}

/** The note on `word` among `notes`, or null. A phrase is matched whole. */
export function noteFor(notes, word) {
  const key = noteKey(word);
  if (!key) return null;
  return (Array.isArray(notes) ? notes : []).find((n) => noteKey(n.w) === key) || null;
}

/** The keys of the important words among `notes` (single words: what a transcript's words are checked against). */
export const importantKeys = (notes) => new Set((Array.isArray(notes) ? notes : []).filter((n) => n.important).map((n) => noteKey(n.w)).filter((k) => k && !k.includes(" ")));

// ---------- where a device keeps the notes of the items it took ----------
const KEY = (episodeId) => `tamkeenRoomNotes:${episodeId}`;
const store = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } };

/** Keep `notes` for the local episode `episodeId` (an empty list forgets them). */
export function keepNotes(episodeId, notes) {
  const s = store();
  if (!s || !episodeId) return;
  const list = cleanNotes(notes);
  try { if (list.length) s.setItem(KEY(episodeId), JSON.stringify(list)); else s.removeItem(KEY(episodeId)); } catch { /* storage full or off: the popup shows no teacher's line */ }
}
/** The teacher's notes kept for a local episode ([] when none). */
export function keptNotes(episodeId) {
  const s = store();
  if (!s || !episodeId) return [];
  try { return cleanNotes(JSON.parse(s.getItem(KEY(episodeId)) || "[]")); } catch { return []; }
}

/** The episode a reading screen is showing, from the address (#/episode/12, #/episode/12?t=30), or 0. */
export function episodeOfHash(hash = typeof location !== "undefined" ? location.hash : "") {
  const m = /^#\/episode\/(\d+)/.exec(String(hash || ""));
  return m ? Number(m[1]) : 0;
}
/** The teacher's note on `word` for the item on screen, or null (the word popup asks this). */
export function teacherNote(word, hash) {
  const id = episodeOfHash(hash);
  return id ? noteFor(keptNotes(id), word) : null;
}
