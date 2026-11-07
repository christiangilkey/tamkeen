// "Learn from my own mnemonics": the free Mnemonic maker also learns from the mnemonics the learner types in
// Memorization notes, not only from Use and thumbs down on its own suggestions (owner, 2026-11-06).
//
// Only the words written in CAPITALS count: in "pot — Picture a duck sitting on a POT" it is POT, and the rest
// of the note, the story, is ignored. Capitals are already Tamkeen's own way of writing a keyword (Use puts
// "… a duck balanced on top of a POT" in the notes: freemnemonic.js sceneFor). A word in capitals counts only
// when it is new in the note (editing another part of it doesn't learn again), isn't one the maker suggested for
// the card itself (Use learned those already), and really sounds like the card's word: the same sound check as
// the makers' own keywords (mnemonic.js rankSuggestions), with the keyword's sounds from the free maker's word
// lists or the English pronunciation dictionary. A word whose sounds aren't known is left alone.
//
// One that passes counts like a Use, a little more (OWN_STEP), is kept with its sounds so the free maker can
// offer it for other words that sound like it ("You've used this before"), and the whole note is kept as one of
// a few examples of the learner's style for their AI (mnemonic.js mnemonicPrompt). All in the synced setting
// `mnemonic_prefs` (freemnemonic.js readPrefs / writePrefs); the switch is `mnemonic_learn_own` ("off" = off),
// in Settings → Word definitions (components/freehelpers.js). No page code: tests/js/ownmnemonic.test.mjs.
// The page side (when a note is saved, the line that says what was learned) is review/cardtools.js learnFromNote.

import { rankSuggestions, cleanKeyword } from "./mnemonic.js";
import { EXAMPLES_MAX, FITS, NOTE_MAX, OWN_MAX, PIECE_TIE, PREF_STEP, RELATED, learn, meaningPicture, readPrefs, traitsOf } from "./freemnemonic.js";

/** How far one sound-alike of the learner's own moves a trait's weight: a Use, and a half. */
export const OWN_STEP = PREF_STEP * 1.5;
/** Words in capitals one after the other make one keyword ("PIE TOE"), up to this many; a longer run (a whole
 * sentence in capitals) is taken word by word. */
export const RUN_MAX = 3;

/** Is it on? The synced setting `mnemonic_learn_own`: on unless "off". */
export const learnsOwn = (settings) => (settings || {}).mnemonic_learn_own !== "off";

// A word in capitals: two or more capital letters (any script that has them: É, Ж), an apostrophe inside
// allowed (DON'T); a plural "s" or "'s" written small after it is dropped (POTs). Not inside a longer word.
const CAPS = /(?<![\p{L}\p{M}\p{N}])(\p{Lu}[\p{Lu}\p{Lt}\p{M}]*(?:['’]\p{Lu}[\p{Lu}\p{Lt}\p{M}]*)*)(?:['’]?s)?(?![\p{L}\p{M}\p{N}])/gu;
const letters = (w) => (w.match(/\p{L}/gu) || []).length;

/**
 * The keywords written in capitals in `text`, in order, each once: [{key: "pie toe" (small letters, as kept),
 * shown: "PIE TOE" (as written)}]. Single capital letters ("I", "A") don't count, and break a run.
 */
export function capitalKeywords(text) {
  const s = String(text || "").normalize("NFC");
  const words = [];
  for (const m of s.matchAll(CAPS)) {
    if (letters(m[1]) < 2) continue;
    words.push({ word: m[1].replace(/’/g, "'"), at: m.index, end: m.index + m[1].length });
  }
  // Runs: words with only spaces (or a hyphen) between them, on one line.
  const runs = [];
  for (const w of words) {
    const last = runs[runs.length - 1];
    const prev = last && last[last.length - 1];
    if (prev && /^[ \t -]+$/.test(s.slice(prev.end, w.at).replace(/^(?:['’]?s)/, ""))) last.push(w);
    else runs.push([w]);
  }
  const out = [], seen = new Set();
  const add = (ws) => {
    const shown = ws.map((w) => w.word).join(" ");
    const key = shown.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, shown });
  };
  for (const run of runs) {
    if (run.length <= RUN_MAX) add(run);
    else for (const w of run) add([w]);
  }
  return out;
}

/** A keyword as compared: small letters, no "+", one space between words ("pie + toe" = "pie toe"). */
const plain = (k) => cleanKeyword(k).toLowerCase().replace(/\s*\+\s*/g, " ").replace(/\s+/g, " ").trim();

/**
 * The capitalised keywords that are new in a note: in `after` and not in `before` (what it said when it was last
 * saved). `skip`: keywords the maker suggested for this card (Use learned those already); `word` and `meaning`,
 * the card's own: the word itself and a word of its meaning in capitals are not sound-alikes.
 */
export function newCapitals(before, after, { skip = [], word = "", meaning = "" } = {}) {
  const had = new Set(capitalKeywords(before).map((k) => k.key));
  const skipped = new Set([...skip, word].map(plain).filter(Boolean));
  const meant = new Set(String(meaning || "").toLowerCase().split(/[^\p{L}\p{M}']+/u).filter(Boolean));
  return capitalKeywords(after).filter((k) => !had.has(k.key) && !skipped.has(k.key) && !k.key.split(" ").every((w) => meant.has(w)));
}

/**
 * The sound check: which of `keywords` (newCapitals') really sound like the card's word, whose sounds are `pron`
 * (soundout.js pronunciationOf). A keyword's own sounds come from `lists` (KeywordLists: the learner's language's,
 * English's), else `english` (mnemonic.js englishSounds over the English word table: IPA, or null). One whose
 * sounds aren't known is left out of both answers. {passed: [{key, shown, ipa, lang, sound, score, traits}],
 * failed: [{key, shown}]}, or null when the word's own sounds aren't known.
 */
export function judgeOwn(v, pron, keywords, { lists = [], english = null } = {}) {
  if (!pron) return null;
  const passed = [], failed = [];
  for (const k of keywords) {
    let ipa = null, list = null;
    for (const l of lists) {
      const x = l && l.ipaOf(k.key);
      if (x) { ipa = x; list = l; break; }
    }
    if (!ipa && english) ipa = english(k.key) || null;
    if (!ipa) continue;  // (its sounds aren't known: ignored)
    const r = rankSuggestions({ pron, keywords: [{ keyword: k.key, ipa, covers: [], link: 0, linkNote: "", scene: "" }], ownSounds: () => ipa, count: 1 });
    if (!r.checked) return null;
    const s = r.items[0];
    if (!s) { failed.push(k); continue; }
    const lang = list ? list.lang : "en";
    const tieList = list || lists.find((l) => l && l.lang === "en") || null;
    passed.push({ ...k, ipa, lang, sound: s.sound, score: s.score, traits: traitsOf({ keyword: k.key, sound: s.sound, link: linkOf(v, k.key, tieList) }, tieList) });
  }
  return { passed, failed };
}

/** How the learner's keyword is tied to the card's meaning, as the free maker marks its own (0, 1 or 2). */
function linkOf(v, key, list) {
  if (!list || !v.meaning) return 0;
  const ties = list.tiesOf(meaningPicture(v.meaning, list, v.pos || ""));
  const words = key.split(" ");
  const weight = Math.max(0, ...words.map((w) => (ties.get(w) || { weight: 0 }).weight)) * (words.length > 1 ? PIECE_TIE : 1);
  return weight >= FITS ? 2 : weight >= RELATED ? 1 : 0;
}

/** A note as kept for the AI: one line, at most NOTE_MAX characters (cut at a word, with "…"). */
export function shortNote(note) {
  const s = String(note || "").replace(/\s+/g, " ").trim();
  if (s.length <= NOTE_MAX) return s;
  const cut = s.slice(0, NOTE_MAX - 1);
  return `${cut.replace(/\s+\S*$/, "") || cut}…`;
}

/**
 * The prefs after the learner's own sound-alikes `passed` (judgeOwn's) for card `v` with note `note`: each
 * counts like a Use, OWN_STEP for its traits (and one more choice learned from); each is kept with its sounds,
 * newest first (at most OWN_MAX), and the note as an example of the learner's style (newest first, at most
 * EXAMPLES_MAX, one per word). New prefs (freemnemonic.js writePrefs turns them into the setting).
 */
export function learnOwn(prefs, passed, { v = {}, note = "" } = {}) {
  let p = readPrefs(prefs);
  for (const f of passed || []) {
    p = learn(p, f.traits || [], +1, [], OWN_STEP);
    const kept = f.lang && f.lang !== "en" ? [f.key, f.ipa, f.lang] : [f.key, f.ipa];
    p.o = [kept, ...p.o.filter(([k]) => k !== f.key)].slice(0, OWN_MAX);
  }
  const word = String(v.text || "").trim().slice(0, 60);
  if ((passed || []).length && word && String(note || "").trim()) {
    const meaning = String(v.meaning || "").replace(/\s+/g, " ").trim().slice(0, 120);
    p.x = [[word, meaning, shortNote(note)], ...p.x.filter(([w]) => w !== word)].slice(0, EXAMPLES_MAX);
  }
  return readPrefs(p);
}

/** The learner's own notes to show their AI (mnemonic.js mnemonicPrompt): [{word, meaning, note}], newest first. */
export const ownExamples = (prefs) => readPrefs(prefs).x.map(([word, meaning, note]) => ({ word, meaning, note }));
