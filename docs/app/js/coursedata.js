// The basics courses' pure part: where their files are, how far the learner has got, and the cards a
// course's words become. No screen code: tests/js/course.test.mjs runs it as it is.
//
// A course (made by tools/course/build_course.py, published in docs/course; app/course.py explains
// it) is a language's 1000 most common words, most common first, 50 to a unit. Each word has an
// everyday sentence, its translation (⟦ ⟧ round the part that translates the word) and one audio
// file: the word, a pause, then the sentence, with `times` saying where each is
// ({start, end, sent_start, sent_end}, the shape of a card voice: cardvoice.js). A word "in the
// learner's cards" is any card with the same word, however it got there (a course, a podcast, typed),
// compared as the app compares words: Arabic without vowel marks and with one alef, ya and ta marbuta.
// But a card written WITH vowel marks (the course's own cards are) is compared with them, so the noun
// عَمَل "work" and the verb عَمِلَ "to work", spelled alike without vowels, stay two words.

export const COURSE_BASE = "https://christiangilkey.github.io/tamkeen/course/";
const SITE_HOST = "christiangilkey.github.io";

/** Where course file `name` ("index.json", "ar/course.json", "ar/audio/0001.ogg") is fetched from: the
 * computer asks its own server (app/api/course.py: the repository's copy when running from source,
 * else the published one, kept); the web app, published on the same website, by its own path; the
 * phones from the website. */
export function courseUrl(name, { platform = "", host = "" } = {}) {
  if (platform === "desktop") return `/api/course/${name}`;
  if (host === SITE_HOST) return `/tamkeen/course/${name}`;
  return COURSE_BASE + name;
}

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** A word as compared with the learner's cards. */
export function wordKey(text, lang = "") {
  let s = String(text ?? "").normalize("NFC").replace(/[⟦⟧]/g, "").trim();
  if (lang === "ar" || /[؀-ۿ]/.test(s)) {
    s = s.replace(MARKS, "").replace(/[آأإٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  }
  return s.toLowerCase().replace(/\s+/g, " ");
}

/** A word as compared when it is written with vowel marks: the same, but the marks kept. */
export function vowelledKey(text) {
  return String(text ?? "").normalize("NFC").replace(/[⟦⟧ـ]/g, "").trim().replace(/\s+/g, " ");
}
const hasMarks = (text) => /[ً-ْ]/.test(String(text ?? ""));

/** The course's units: [{n, from, to, ready, words: [...]}] (a unit not made yet has no words). */
export function unitsOf(course) {
  const words = (course && course.words) || [];
  return ((course && course.units) || []).map((u) => ({ ...u, words: words.filter((w) => w.n >= u.from && w.n <= u.to) }));
}

/**
 * How far the learner has got: which of the course's words are among their cards (`cards`: the vocab
 * list), per unit and in all. {have: Set of word numbers, total: words made so far, planned, units:
 * [{n, from, to, ready, count, have}], next: the first unit made and not finished (or null)}.
 */
export function progress(course, cards) {
  const lang = (course && course.lang) || "";
  const plain = new Set(), vowelled = new Set();
  for (const v of cards || []) {
    if (v.deleted) continue;
    if (lang === "ar" && hasMarks(v.text)) vowelled.add(vowelledKey(v.text));
    else plain.add(wordKey(v.text, lang));
  }
  const have = new Set();
  for (const w of (course && course.words) || []) {
    if (vowelled.has(vowelledKey(w.word)) || plain.has(wordKey(w.word, lang))) have.add(w.n);
  }
  const units = unitsOf(course).map((u) => ({ n: u.n, from: u.from, to: u.to, ready: !!u.ready && u.words.length > 0,
    count: u.words.length, have: u.words.filter((w) => have.has(w.n)).length }));
  const next = units.find((u) => u.ready && u.have < u.count) || null;
  return { have, total: ((course && course.words) || []).length, planned: (course && course.planned) || 1000, units, next };
}

/** The card a course word becomes (POST /vocab/batch). Its audio is added after it (saveVoice). */
export function cardOf(word, course, folder = "") {
  const clean = (s, n) => String(s ?? "").trim().slice(0, n);
  return {
    text: clean(word.word, 200),
    meaning: clean(word.meaning, 500),
    sentence: clean(word.sentence, 1000),
    translation: clean(word.translation, 1000),
    notes: "",
    folders: folder ? [folder] : [],
    source: clean(`${course.title} · word ${word.n}`, 200),
  };
}

/** The translation as HTML: the part that translates the word in bold. `esc` escapes text. */
export function markedHtml(translation, esc) {
  return esc(String(translation || "")).replace(/⟦([^⟦⟧]*)⟧/g, "<b>$1</b>");
}
