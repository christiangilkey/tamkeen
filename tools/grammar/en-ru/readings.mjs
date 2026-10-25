// The readings of the English → Russian grammar course (tools/grammar/en-ru/PLAN.md), made from the
// Cyrillic so they are always the same for the same text, and the stress-mark check.
//   node tools/grammar/en-ru/readings.mjs     fills in every `r` of tools/grammar/en-ru/lessons.json (and `rs`,
//                                             the readings of the choices a learner taps), and
//                                             the reading of every {{…}} piece, then lists words with a
//                                             missing or misplaced stress mark
// A reading is a plain Latin transliteration (ж zh, х kh, ц ts, ч ch, ш sh, щ shch, ы y, й y, ь ', е ye at
// the start of a word and after a vowel) with the stress marked, and the few words that aren't said as
// they are spelled written as they are said: что "shto", г in -ого/-его "v", -тся/-ться "tsa",
// коне́чно "konéshno", сего́дня "sevódnya", здра́вствуйте "zdrástvuyte", счёт "shchot"…

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCourse } from "../format.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ACUTE = "́";
const VOWELS = "аеёиоуыэюя";
const LETTERS = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "'", э: "e", ю: "yu", я: "ya",
};
/** A Russian word, with its stress marks and the parts of a hyphenated word (по-ру́сски, что́-нибудь). */
export const WORD = /[А-Яа-яЁё́]+(?:-[А-Яа-яЁё́]+)*/g;
const plain = (p) => p.replace(/́/g, "").toLowerCase();
/** Words in -ого / -его whose г is said g (every other one is said v: его́ "yevó", но́вого "nóvovo"). */
/** Prepositions of two syllables that lean on the next word and have no stress of their own. */
const UNSTRESSED = new Set(["обо", "ото", "изо", "подо", "передо"]);
const G_WORDS = new Set(["много", "немного", "дорого", "недорого", "строго", "нестрого", "убого", "полого", "отлого", "ого"]);

/** The word as it is said, still in Cyrillic (stress marks kept). */
function respell(p) {
  const s = plain(p);
  const swap = (re, to) => { p = p.replace(re, to); };
  if (/^(н[еи])?что/.test(s)) swap(/^((?:[Нн][еи]́?)?)([Чч])/u, (m, a, c) => a + (c === "Ч" ? "Ш" : "ш"));
  if (/[ое]го$/.test(s) && !G_WORDS.has(s)) swap(/([гГ])(о́?)$/u, (m, g, o) => (g === "Г" ? "В" : "в") + o);
  if (s.startsWith("сегодня")) swap(/^([Сс]е)г/u, "$1в");
  if (s === "конечно" || s === "скучно" || s.startsWith("яичниц")) swap(/ч(н)/u, "ш$1");
  if (s.startsWith("здравств")) swap(/^([Зз]дра́?)в/u, "$1");
  if (s.startsWith("чувств")) swap(/^([Чч]у́?)в/u, "$1");
  if (s.startsWith("солнц")) swap(/^([Сс]о́?)л/u, "$1");
  if (s.startsWith("сердц")) swap(/^([Сс]е́?р)д/u, "$1");
  if (s.startsWith("праздн")) swap(/^([Пп]ра́?з)д/u, "$1");
  if (s.startsWith("поздн")) swap(/^([Пп]о́?з)д/u, "$1");
  if (s.startsWith("лестниц")) swap(/^([Лл]е́?с)т/u, "$1");
  if (s.startsWith("сч")) swap(/^([Сс])ч/u, (m, c) => (c === "С" ? "Щ" : "щ")); // счёт "shchot"
  swap(/жч/gu, "щ"); // мужчи́на "mushchína"
  swap(/ть?ся$/u, "ца");
  return p;
}

const markLastVowel = (s) => s.replace(/([aeiouy])([^aeiouy]*)$/, `$1${ACUTE}$2`);

/** One part of a word in Latin letters. `ending`: it is an ending ("-ешь"), so a consonant comes before it. */
function latin(p, { ending, many }) {
  let out = "", prev = ending ? "к" : "";
  const chars = [...p];
  chars.forEach((ch, i) => {
    if (ch === ACUTE) return;
    const lower = ch.toLowerCase();
    if (!(lower in LETTERS)) { out += ch; prev = ""; return; }
    const afterVowel = !prev || VOWELS.includes(prev) || prev === "ь" || prev === "ъ";
    const hush = !!prev && "жшчщ".includes(prev);
    let s = LETTERS[lower];
    if (lower === "е" && afterVowel) s = "ye";
    if (lower === "и" && prev === "ь") s = "yi";
    if (lower === "ё" && hush) s = "o";
    if (chars[i + 1] === ACUTE || (lower === "ё" && many)) s = markLastVowel(s);
    if (ch !== lower && s) s = s[0].toUpperCase() + s.slice(1);
    out += s;
    prev = lower;
  });
  return out;
}

/** The reading of a Russian text: «Я живу́ в Москве́.» → «Ya zhivú v Moskvé.» */
export function reading(text) {
  return String(text ?? "").replace(WORD, (word, at, all) => {
    const ending = at > 0 && all[at - 1] === "-";
    const many = (plain(word).match(/[аеёиоуыэюя]/g) || []).length > 1;
    let s = word.split("-").map((p, i) => latin(respell(p), { ending: ending && i === 0, many })).join("-");
    if (word.length > 1 && /^[А-ЯЁ́-]+$/.test(word) && /[А-ЯЁ].*[А-ЯЁ]/.test(word)) s = s.toUpperCase();
    return s;
  }).normalize("NFC");
}

/** Words of a Russian text whose stress marks are wrong: [“word: what”]. A word of two or more
 * syllables has one mark (ё counts as one); a word of one syllable has none (не́ before был is the
 * exception); an ending or a prefix on its own (-ами, при-) needs none. Also words mixing Latin and
 * Cyrillic letters. */
export function stressProblems(text) {
  const src = String(text ?? "");
  const bad = [];
  for (const w of src.match(/[\p{L}\p{M}]+/gu) || []) {
    if (/\p{Script=Cyrillic}/u.test(w) && /\p{Script=Latin}/u.test(w)) bad.push(`${w}: Latin and Cyrillic letters mixed`);
  }
  let last = "";
  for (const m of src.matchAll(WORD)) {
    const w = m[0], at = m.index, after = src[at + w.length];
    const afterNe = last === "не́" && /^\s+$/.test(src.slice(at - 1, at)) && ["было", "были"].includes(plain(w));
    last = w.toLowerCase();
    if (afterNe) continue; // не́ было, не́ были: the stress is on не
    if (/(^|[^аеёиоуыэюяАЕЁИОУЫЭЮЯ])́/.test(w)) { bad.push(`${w}: a stress mark not on a vowel`); continue; }
    if ((at > 0 && src[at - 1] === "-") || after === "-") continue; // an ending or a prefix
    const parts = w.split("-");
    const vowels = (plain(w).match(/[аеёиоуыэюя]/g) || []).length;
    const marks = (w.match(/́/g) || []).length;
    const yo = /[ёЁ]/.test(w);
    if (vowels <= 1) { if (marks && plain(w) !== "не") bad.push(`${w}: a stress mark on a word of one syllable`); continue; }
    if (!marks && UNSTRESSED.has(plain(w))) continue; // обо мне́, передо мно́й
    if (yo && marks && parts.length === 1) bad.push(`${w}: ё and a stress mark`);
    else if (!yo && !marks) bad.push(`${w}: no stress mark`);
    else if (marks > parts.length) bad.push(`${w}: too many stress marks`);
  }
  return bad;
}

const PIECE = /\{\{([^{}|]*)(?:\|[^{}]*)?\}\}/g;

/** Every Russian text of a lesson that should carry stress marks (examples, answers, options, {{…}} pieces). */
export function russianTexts(lesson) {
  const out = [];
  const add = (...t) => t.forEach((x) => { if (typeof x === "string" && x.trim()) out.push(x); });
  const pieces = (v) => {
    if (typeof v === "string") for (const m of v.matchAll(PIECE)) add(m[1]);
    else if (Array.isArray(v)) v.forEach(pieces);
    else if (v && typeof v === "object") Object.values(v).forEach(pieces);
  };
  pieces(lesson);
  for (const b of lesson.blocks || []) {
    if (b.goal) add(b.goal.t);
    for (const x of [...(b.ex || []), ...(b.dialog || [])]) add(x.t);
  }
  for (const m of lesson.mistakes || []) add(m.wrong, m.right);
  for (const q of lesson.practice || []) {
    if (q.type === "fill") add(String(q.t || "").replace("___", "…"), ...(q.options || []));
    if (q.type === "say") add(q.answer);
    add(...(q.words || []), ...(q.also || []).flat());
    for (const l of q.lines || []) add(l.t, ...(l.options || []));
    for (const a of q.answers || []) add(a.t);
  }
  return out;
}

const withReading = (x) => {
  if (!x || typeof x.t !== "string") return x;
  const { who, t, r, ...rest } = x;
  return who !== undefined ? { who, t, r: reading(t), ...rest } : { t, r: reading(t), ...rest };
};
const withPieces = (s) => s.replace(PIECE, (m, t) => (/[А-Яа-яЁё]/.test(t) ? `{{${t}|${reading(t)}}}` : m));
const deep = (v) => (typeof v === "string" ? withPieces(v) : Array.isArray(v) ? v.map(deep)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)])) : v);

/** The object with `key` set to `value`, placed right after `prev` (or kept where it was). */
function after(obj, prev, key, value) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) continue;
    out[k] = v;
    if (k === prev) out[key] = value;
  }
  if (!(key in out)) out[key] = value;
  return out;
}

/** The lesson with every reading made afresh. */
export function withReadings(lesson) {
  const l = deep(lesson);
  l.blocks = (l.blocks || []).map((b) => {
    if (b.goal) return { ...b, goal: withReading(b.goal) };
    if (b.ex) return { ...b, ex: b.ex.map(withReading) };
    if (b.dialog) return { ...b, dialog: b.dialog.map(withReading) };
    return b;
  });
  l.practice = (l.practice || []).map((q) => {
    if (q.type === "say") {
      const { type, q: text, answer, r, ...rest } = q;
      return { type, q: text, answer, r: reading(answer), ...rest };
    }
    let out = { ...q };
    // the choices a learner taps get their readings too (README, "Readings of the choices")
    if (q.type === "fill") out = after(after(out, "t", "r", reading(q.t)), "options", "rs", (q.options || []).map(reading));
    if (q.type === "order") out = after(out, "words", "rs", (q.words || []).map(reading));
    if (q.lines) out.lines = q.lines.map((x) => (x.options ? after(x, "options", "rs", x.options.map(reading)) : withReading(x)));
    if (q.answers) out.answers = q.answers.map(withReading);
    return out;
  });
  return l;
}

function main() {
  const path = join(here, "lessons.json");
  const course = JSON.parse(readFileSync(path, "utf8"));
  course.lessons = course.lessons.map(withReadings);
  writeFileSync(path, formatCourse(course));
  let n = 0;
  for (const l of course.lessons) {
    const bad = [...new Set(russianTexts(l).flatMap(stressProblems))];
    if (bad.length) console.log(`${l.id}: ${bad.join("; ")}`);
    n += bad.length;
  }
  console.log(`en-ru: readings made for ${course.lessons.length} lessons; ${n} stress problem${n === 1 ? "" : "s"}`);
  if (n) process.exitCode = 1;
}

const invoked = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) main();
