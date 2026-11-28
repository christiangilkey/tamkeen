// Frequency words 1001-3000, the shared ranking step (tools/course/FREQUENCY-3000.md): from a language's
// ranked dictionary words, weighted toward spoken language (forms.py --blend: 70% film and TV subtitles, 30%
// wordfreq; then the language's own ranking script, unchanged), the candidates for words 1001-3000: every ranked
// word not already among the course's words 1-1000, in order, with a flag where one needs a look (a name, a word
// the dictionary table doesn't know). The language's session reviews them and writes 1001-3000 in that order.
//
//   node tools/course/candidates.mjs es   ->  tools/course/es/candidates.json
//                                             tools/course/build/es-candidates-report.md
//
// Needs tools/course/build/<lang>-ranked.json (the blend) and <lang>-ranked-wordfreq.json (wordfreq alone, ranked
// the same way: for the report, which compares the two).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const lang = process.argv[2];
if (!lang) throw new Error("usage: node tools/course/candidates.mjs <lang>");
const KEEP = 2600; // candidates kept: 2,000 are needed, the rest is room for the ones left out
const COMPARE = 2000;

// A word as the course compares it (coursedata.js wordKey): Arabic without vowel marks and with one alef, ya and ta
// marbuta; otherwise in small letters.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
export function keyOf(text) {
  let s = String(text ?? "").normalize("NFC").replace(MARKS, "").trim().toLowerCase();
  s = s.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  return s;
}

// The ranked lists come in two shapes: [{rank, lemma, freq, forms, pos?}] and Spanish's [[n, lemma, freq, forms]].
const read = (name) => JSON.parse(readFileSync(join(here, "build", name), "utf8"));
const entries = (list) => list.map((e) => (Array.isArray(e)
  ? { lemma: e[1], freq: e[2], forms: (e[3] || []).map((f) => f[0]) }
  : { lemma: e.lemma, freq: e.freq, forms: (e.forms || []).map((f) => f[0]), pos: e.pos || "" }));

const course = JSON.parse(readFileSync(join(here, lang, "words.json"), "utf8")).words;
const inCourse = new Set(course.map((w) => keyOf(w.word)));
for (const w of course) for (const f of [].concat(w.form || [])) inCourse.add(keyOf(f));
const already = (e) => inCourse.has(keyOf(e.lemma)) || e.forms.some((f) => inCourse.has(keyOf(f)));

// The dictionary table of the language, where there is one (docs/lexicon/<lang>-lemmas.json.gz): a candidate it
// doesn't know is flagged (often a name, or a word from another language in the counts).
let known = null;
const table = join(root, "docs", "lexicon", `${lang}-lemmas.json.gz`);
if (existsSync(table)) {
  const t = JSON.parse(gunzipSync(readFileSync(table)).toString("utf8"));
  known = new Set((t.lemmas || []).map(keyOf));
}
// English that crept into the subtitles (hey, okay, and the English names of film characters: jack, sam): a word
// at least 3 times as common in written English as in this language's own (forms.py --blend writes the list; "gran"
// and "dame" in Spanish, "mach" in German stay). Left out, with numbers, symbols and stray single letters.
const englishFile = join(here, "build", `${lang}-forms-english.json`);
const english = existsSync(englishFile) ? new Set(JSON.parse(readFileSync(englishFile, "utf8")).map(keyOf)) : null;
function junkOf(e) {
  const k = keyOf(e.lemma);
  if (!/\p{L}/u.test(k)) return "a number or symbol";
  if ([...k].length === 1 && !(known && known.has(k))) return "a single letter";
  if (english && english.has(k)) return "English, or an English name";
  return null;
}
function flagOf(e) {
  if (e.pos === "noun_prop") return "name?";
  if (known && !known.has(keyOf(e.lemma))) return "not in the dictionary table: a name, or another language?";
  return undefined;
}

const dropped = [];
const after = (list, keep = false) => entries(list).filter((e) => {
  if (already(e)) return false;
  const why = junkOf(e);
  if (why && keep) dropped.push({ lemma: e.lemma, why });
  return !why;
});
const blend = after(read(`${lang}-ranked.json`), true);
const plain = existsSync(join(here, "build", `${lang}-ranked-wordfreq.json`)) ? after(read(`${lang}-ranked-wordfreq.json`)) : null;

const words = blend.slice(0, KEEP).map((e, i) => {
  const out = { rank: 1000 + i + 1, lemma: e.lemma, freq: e.freq, forms: e.forms.slice(0, 4) };
  const flag = flagOf(e);
  if (flag) out.flag = flag;
  return out;
});
writeFileSync(join(here, lang, "candidates.json"), JSON.stringify({
  lang, made: new Date().toISOString().slice(0, 10),
  method: "70% film and TV subtitles (FrequencyWords, OpenSubtitles 2018, CC BY-SA 4.0) + 30% wordfreq (CC BY-SA 4.0), "
    + "per million words (tools/course/forms.py --blend), grouped by dictionary word with the language's own ranking script; "
    + "the course's words 1-1000 left out (tools/course/candidates.mjs)",
  after: course.length, words,
  left_out: dropped.slice(0, 400),
}, null, 1) + "\n");

// The report: how the blend changes the next 2,000 compared with wordfreq alone.
const lines = [`# ${lang}: candidates for Frequency words 1001-3000`, ""];
const flagged = words.slice(0, COMPARE).filter((w) => w.flag).length;
lines.push(`${words.length} candidates after the course's ${course.length} words; ${flagged} of the first ${COMPARE} flagged for a look; `
  + `${dropped.length} left out as English, numbers or stray letters (e.g. ${dropped.slice(0, 12).map((d) => d.lemma).join(", ")}).`, "");
if (plain) {
  const top = (list) => list.slice(0, COMPARE).map((e) => keyOf(e.lemma));
  const nb = top(blend), np = new Set(top(plain));
  const stay = nb.filter((k) => np.has(k)).length;
  const came = blend.slice(0, COMPARE).filter((e) => !np.has(keyOf(e.lemma)));
  const nbSet = new Set(nb);
  const went = plain.slice(0, COMPARE).filter((e) => !nbSet.has(keyOf(e.lemma)));
  lines.push(`Of the next ${COMPARE} by wordfreq alone (today's method), ${stay} (${Math.round(stay / COMPARE * 100)}%) are also in the next ${COMPARE} of the blend.`, "");
  lines.push(`In with the blend (spoken; most common first): ${came.slice(0, 25).map((e) => e.lemma).join(", ")}`, "");
  lines.push(`Out (written; most common first): ${went.slice(0, 25).map((e) => e.lemma).join(", ")}`, "");
}
lines.push(`First 30 candidates: ${words.slice(0, 30).map((w) => w.lemma + (w.flag ? "*" : "")).join(", ")}`, "", "(* flagged)");
writeFileSync(join(here, "build", `${lang}-candidates-report.md`), lines.join("\n") + "\n");
console.log(lines.join("\n"));
