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

/** A course's id, which names its folder: "ar", or an Arabic dialect's "ar-lev" (whose `lang` is "ar"). */
export const courseIdOf = (course) => String((course && (course.id || course.lang)) || "");

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
    notes: clean(word.note, 2000), // (a dialect word's note on the Standard word that looks the same)
    folders: folder ? [folder] : [],
    source: clean(`${course.title} · word ${word.n}`, 200),
  };
}

/**
 * Cards added from this course before its sentences said where their word is (⟦ ⟧, v0.38): the sentence
 * each should now have. A card counts when it came from this course (its source, "Arabic basics · word 13")
 * and its sentence is still exactly the course's, marks aside; one the learner changed is left alone.
 * [{id, sentence, sentence_if}] for PATCH /vocab/{id}.
 */
export function markUpdates(course, cards) {
  const byN = new Map(((course && course.words) || []).map((w) => [w.n, w]));
  const prefix = `${(course && course.title) || ""} · word `;
  const out = [];
  for (const c of cards || []) {
    const src = String(c.episode_title || c.source || "");
    if (!course || !src.startsWith(prefix) || c.deleted) continue;
    const w = byN.get(Number(src.slice(prefix.length)));
    const have = String(c.sentence || "");
    if (!w || !/[⟦⟧]/u.test(w.sentence) || have === w.sentence || /[⟦⟧]/u.test(have)) continue;
    if (have.trim() === String(w.sentence).replace(/[⟦⟧]/gu, "").trim()) out.push({ id: c.id, sentence: w.sentence, sentence_if: have });
  }
  return out;
}

/** The translation as HTML: the part that translates the word in bold. `esc` escapes text. */
export function markedHtml(translation, esc) {
  return esc(String(translation || "")).replace(/⟦([^⟦⟧]*)⟧/g, "<b>$1</b>");
}

// ---------------------------------------------------------------- Arabic dialects

/**
 * The kinds of Arabic the Library's Courses teach: Standard Arabic (MSA), then the dialects, which build
 * on it (none of a dialect's basics words is an MSA word: tools/course/dialect/overlap.mjs). A dialect's
 * basics course is "ar-<id>" (docs/course/ar-lev), its grammar course "<from>-ar-<id>" ("en-ar-lev").
 */
export const ARABIC_VARIETIES = [
  { id: "", name: "Standard Arabic (MSA)" },
  { id: "lev", name: "Levantine" },
  { id: "egy", name: "Egyptian" },
  { id: "glf", name: "Gulf" },
  { id: "mor", name: "Moroccan" },
  { id: "irq", name: "Iraqi" },
];
export const VARIETY_KEY = "courseVariety:ar"; // (localStorage: the kind of Arabic chosen last on this device)

/** A basics course's id: the language ("ar"), or the language and a dialect ("ar-lev"). */
export const basicsId = (lang, dialect = "") => (dialect ? `${lang}-${dialect}` : lang);

/**
 * The kinds of Arabic the picker offers: MSA, then each dialect that has a basics course (`courses`: the
 * basics index, docs/course/index.json) or a grammar course (`grammar`: docs/grammar/index.json) published.
 * [] when the learner isn't learning Arabic, or no dialect has a course yet: then there is no picker.
 */
export function varietiesOffered(lang, courses, grammar) {
  if (lang !== "ar") return [];
  const basics = (courses && courses.courses) || {};
  const lessons = Object.keys((grammar && grammar.courses) || {});
  const has = (d) => !!basics[basicsId(lang, d)] || lessons.some((id) => id.endsWith(`-${lang}-${d}`));
  const out = ARABIC_VARIETIES.filter((v) => !v.id || has(v.id));
  return out.length > 1 ? out : [];
}

/** The kind of Arabic shown: the one chosen before (`remembered`) while it is still offered, else MSA (""). */
export function varietyChoice(offered, remembered) {
  return (offered || []).some((v) => v.id && v.id === remembered) ? remembered : "";
}

/**
 * Which of the Library's Courses tabs opens ("grammar", "basics" or "dli"; "" when the language has none).
 * `basics` / `grammar`: whether the language has that course; `dli`: whether the learner's DLI material
 * shows (components/dlipanel.js dliShown). A link that asks for one (`asked`, #/library?tab=basics)
 * comes first, then the tab the learner chose earlier in this visit (`chosen`), then Grammar (the
 * owner's choice), or Basics when there is no grammar course, or DLI when there is neither.
 */
export function courseTabChoice({ basics = false, grammar = false, dli = false, asked = "", chosen = "" } = {}) {
  const can = { basics: !!basics, grammar: !!grammar, dli: !!dli };
  for (const tab of [asked, chosen]) if (Object.prototype.hasOwnProperty.call(can, tab) && can[tab]) return tab;
  return can.grammar ? "grammar" : can.basics ? "basics" : can.dli ? "dli" : "";
}
