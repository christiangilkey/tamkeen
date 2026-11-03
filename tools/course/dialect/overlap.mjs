// The Arabic dialect courses build on Standard Arabic (MSA), so none of a dialect's basics words may be a
// word the learner already meets in the MSA list: the MSA basics course (docs/course/ar) or the 1000 most
// common Arabic words (web/js/wordlists/ar.js). Words are compared the way the app's search compares them
// (mobile/src/js/shared-logic.js normalize, the twin of app/arabic.py normalize): no vowel marks or
// tatweel, one alef (أ إ آ ٱ -> ا), ة -> ه, ى -> ي, ؤ -> و, ئ -> ي, lower case. So شي is شئ, and إيه is أية.
// A word written as alternatives ("هلّق / هلّأ") has each one checked; a phrase is compared as a whole.
//
//   node tools/course/dialect/overlap.mjs            every Arabic dialect course there is
//   node tools/course/dialect/overlap.mjs ar-lev     one of them (lev, egy, glf, mor, irq also work)
//
// Checks each course's word list (tools/course/ar-<d>/words.json) and, once built, its published course
// (docs/course/ar-<d>/course.json). Prints every word that overlaps and ends with exit code 1, or says
// all is well. tests/js/dialect-course.test.mjs runs the same check on the published courses.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { normalize } from "../../../mobile/src/js/shared-logic.js";
import MSA_COMMON from "../../../web/js/wordlists/ar.js";

const ROOT = new URL("../../../", import.meta.url);
export const DIALECT_COURSES = ["ar-lev", "ar-egy", "ar-glf", "ar-mor", "ar-irq"];

/** A word as the app's search compares it (⟦ ⟧ marks taken out too). */
export const searchKey = (word) => normalize(String(word ?? "").replace(/[⟦⟧]/g, ""));

/** The spellings a course word stands for: "هلّق / هلّأ" -> both; a phrase stays whole. */
export const spellings = (word) => [...new Set(String(word ?? "").split(/\s*[/،,]\s*/).map(searchKey).filter(Boolean))];

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, ROOT), "utf8"));

/** The MSA words, by search key: Map(key -> ["MSA basics word 12 (فِي)", "common word 1 (في)"]). */
export function msaWords({ basics = readJson("docs/course/ar/course.json").words, common = MSA_COMMON } = {}) {
  const out = new Map();
  const add = (word, where) => {
    for (const k of spellings(word)) out.set(k, [...(out.get(k) || []), where]);
  };
  for (const w of basics || []) add(w.word, `MSA basics word ${w.n} (${w.word})`);
  (common || []).forEach((w, i) => add(w, `common word ${i + 1} in web/js/wordlists/ar.js (${w})`));
  return out;
}

/** The words of `words` ([{n, word}]) that are MSA words: [{n, word, msa: [where…]}]. Empty is good. */
export function overlaps(words, msa = msaWords()) {
  const out = [];
  for (const w of words || []) {
    const hits = [...new Set(spellings(w.word).flatMap((k) => msa.get(k) || []))];
    if (hits.length) out.push({ n: w.n, word: w.word, msa: hits });
  }
  return out;
}

/** "lev", "ar-lev" -> "ar-lev" (or "" for something else). */
export function courseId(name) {
  const id = String(name || "").startsWith("ar-") ? String(name) : `ar-${name}`;
  return DIALECT_COURSES.includes(id) ? id : "";
}

/** A dialect course's lists that exist: [{file, words}] (its word list, then its published course). */
export function listsOf(id) {
  return [`tools/course/${id}/words.json`, `docs/course/${id}/course.json`]
    .filter((file) => existsSync(new URL(file, ROOT)))
    .map((file) => ({ file, words: readJson(file).words || [] }));
}

function main(args) {
  const ids = args.length ? args.map(courseId) : DIALECT_COURSES;
  if (ids.includes("")) {
    console.error(`Which course? ${DIALECT_COURSES.join(", ")} (or lev, egy, glf, mor, irq)`);
    process.exitCode = 2;
    return;
  }
  const msa = msaWords();
  let bad = 0, checked = 0;
  for (const id of ids) {
    const lists = listsOf(id);
    if (!lists.length) { if (args.length) console.log(`${id}: no word list yet (tools/course/${id}/words.json)`); continue; }
    for (const { file, words } of lists) {
      checked++;
      const found = overlaps(words, msa);
      bad += found.length;
      if (!found.length) { console.log(`${file}: ${words.length} words, none of them an MSA word`); continue; }
      console.log(`${file}: ${found.length} of ${words.length} words are MSA words (take them out; the grammar lessons can teach them):`);
      for (const f of found) console.log(`  ${f.n}  ${f.word}  = ${f.msa.join("; ")}`);
    }
  }
  if (!checked && !args.length) console.log("No Arabic dialect course has a word list yet.");
  if (bad) process.exitCode = 1;
}

const invoked = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) main(process.argv.slice(2));
