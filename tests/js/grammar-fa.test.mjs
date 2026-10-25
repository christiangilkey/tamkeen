// The Persian grammar courses' own checks (tools/grammar/en-fa/PLAN.md, tools/grammar/fa-en/PLAN.md), on top
// of the ones every course passes (tests/js/grammar.test.mjs): Persian letters (ی, ک, not the Arabic ي, ك),
// the zero-width non-joiner where the standard writes it (می\u200cروم, not می روم), Persian punctuation, and
// readings that match their Persian sentence (same number of words, the same question marks and commas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { explanationTexts, taughtTexts, targetsOf } from "../../web/js/grammardata.js";

const load = (id) => {
  const path = new URL(`../../tools/grammar/${id}/lessons.json`, import.meta.url);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

const PERSIAN = /[؀-ۿ]/;
const ZWNJ = "\u200c";
// Words that start with می / نمی and are not the present prefix (so they are written joined).
const MI_WORDS = new Set(["میز", "میوه", "میان", "میانه", "میل", "میلیون", "میدان", "میراث", "میخ", "میزان", "میهن",
  "میش", "میگو", "مینا", "میترا", "میلاد", "میهمان", "میکروب", "مینی"]);
/** Is `w` one of MI_WORDS, alone or with a plural or possessive ending (میزها, میزم)? */
const miWord = (w) => {
  const base = w.split(ZWNJ)[0];
  return [...MI_WORDS].some((m) => base === m || new RegExp(`^${m}(ها|ی|م|ت|ش|مان|تان|شان)$`).test(base));
};

/** What is wrong with the Persian spelling of a text ("" when nothing is). */
function persianProblem(text) {
  const s = String(text ?? "");
  if (!PERSIAN.test(s)) return "";
  if (/[يكىة]/.test(s)) return "an Arabic letter (write ی and ک)";
  if (/[٠-٩]/.test(s)) return "Arabic digits (write ۰۱۲۳۴۵۶۷۸۹)";
  if (/(^|[\s«(])ن?می (?=[؀-ۿ])/.test(s)) return "می with a space (write it with the zero-width non-joiner: می\u200cروم)";
  if (/\u200c(?=[\s.,،؛:!?؟»)]|$)|(^|[\s«(])\u200c|\u200c\u200c/.test(s)) return "a zero-width non-joiner beside a space";
  for (const w of s.split(/[\s.,،؛:!?؟«»"“”()\-–—…_]+/)) {
    if (/^ن?می[^\u200c]/.test(w) && !miWord(w) && !miWord(w.replace(/^ن/, ""))) return `“${w}”: the present prefix می needs the zero-width non-joiner (or add the word to MI_WORDS)`;
  }
  return "";
}

/** What is wrong with a reading ("" when nothing is). */
function readingProblem(r, piece = false) {
  if (!/^[a-zâA-ZÂ'\- .,!?;:()…"“”0-9/]+$/.test(r)) return "a letter outside the course's romanisation (a â e o i u, kh gh sh ch zh, ')";
  if (!piece && /--|^-|-$| -|- /.test(r)) return "a stray hyphen";
  return "";
}

/** The hyphens of a reading that aren't the ezafe (-e, -ye at the end of a word): one per zero-width non-joiner. */
const joinHyphens = (r) => count(String(r).replace(/-y?e(?=[\s.,!?;:…)"”]|$)/g, ""), /-/g);

const words = (s) => s.replace(/_{3}/g, " ").split(/\s+/).map((w) => w.replace(/^[«"“(]+|[.,،؛:!?؟»"”)…]+$/g, "")).filter(Boolean);
const count = (s, re) => (String(s).match(re) || []).length;

/** What doesn't match between a Persian sentence and its reading ("" when nothing). */
function pairProblem(t, r) {
  if (words(t).length !== words(r).length) return `${words(t).length} words but its reading has ${words(r).length}`;
  if (count(t, /؟/g) !== count(r, /\?/g)) return "its question marks and its reading's don't match";
  if (count(t, /،/g) !== count(r, /,/g)) return "its commas and its reading's don't match";
  if (count(t, /!/g) !== count(r, /!/g)) return "its ! and its reading's don't match";
  const zw = count(t, /\u200c/g), hy = joinHyphens(r);
  if (hy !== zw) return `${zw} zero-width non-joiners but ${hy} hyphens (not counting the ezafe) in its reading`;
  return "";
}

/** Every Persian sentence of a lesson with its reading: [{where, t, r}]. */
function pairs(lesson) {
  const out = [];
  const add = (where, x) => x && x.t && out.push({ where, t: x.t, r: x.r || "" });
  (lesson.blocks || []).forEach((b, i) => {
    if (b.goal) add(`goal`, b.goal);
    (b.ex || []).forEach((e, k) => add(`block ${i + 1} example ${k + 1}`, e));
    (b.dialog || []).forEach((d, k) => add(`block ${i + 1} line ${k + 1}`, d));
  });
  (lesson.practice || []).forEach((q, i) => {
    (q.lines || []).filter((l) => !l.options).forEach((l, k) => add(`practice ${i + 1} line ${k + 1}`, l));
    (q.answers || []).forEach((a, k) => add(`practice ${i + 1} answer ${k + 1}`, a));
    if (q.type === "say") add(`practice ${i + 1}`, { t: q.answer, r: q.r });
  });
  for (const { text, path } of explanationTexts(lesson)) {
    for (const piece of targetsOf(text)) {
      const [t, r] = piece.split("|");
      if (r !== undefined) out.push({ where: `${path.join(" ")} {{${t}}}`, t, r, piece: true });
    }
  }
  return out;
}

const enfa = load("en-fa");
if (enfa) {
  test("en-fa: the Persian is spelled with Persian letters, the zero-width non-joiner and Persian punctuation", () => {
    const bad = [];
    for (const l of enfa.lessons) {
      for (const t of taughtTexts(l)) {
        const p = persianProblem(t);
        if (p) bad.push(`${l.id}: ${p} in “${t}”`);
        if (PERSIAN.test(t) && /[?,;]/.test(t)) bad.push(`${l.id}: Latin punctuation in “${t}” (use ؟ ، ؛)`);
      }
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });

  test("en-fa: every reading is in the course's romanisation and matches its sentence", () => {
    const bad = [];
    for (const l of enfa.lessons) {
      for (const { where, t, r, piece } of pairs(l)) {
        if (!r.trim()) { if (!piece) bad.push(`${l.id} ${where}: no reading for “${t}”`); continue; }
        const p = readingProblem(r, piece) || (piece ? "" : pairProblem(t, r));
        if (p) bad.push(`${l.id} ${where}: ${p} (“${t}” / “${r}”)`);
      }
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });

  test("en-fa: the explanations are English, with every piece of Persian inside {{ }}", () => {
    const bad = [];
    for (const l of enfa.lessons) {
      for (const { text, kind } of explanationTexts(l)) {
        const outside = text.replace(/\{\{[^{}]*\}\}/g, "");
        if (PERSIAN.test(outside)) bad.push(`${l.id}: Persian outside {{ }} in ${kind} “${text.slice(0, 60)}”`);
      }
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });
}

const faen = load("fa-en");
if (faen) {
  test("fa-en: the explanations are Persian, spelled with Persian letters, with every piece of English inside {{ }}", () => {
    const bad = [];
    const texts = [faen.title, faen.about, ...faen.units.map((u) => u.title)].map((text) => ({ text, kind: "course text", id: "course" }));
    for (const l of faen.lessons) for (const x of explanationTexts(l)) texts.push({ ...x, id: l.id });
    for (const { text, kind, id } of texts) {
      const outside = text.replace(/\{\{[^{}]*\}\}/g, "");
      const p = persianProblem(outside);
      if (p) bad.push(`${id}: ${p} in ${kind} “${text.slice(0, 60)}”`);
      if (/[A-Za-z]/.test(outside)) bad.push(`${id}: English outside {{ }} in ${kind} “${text.slice(0, 60)}”`);
      if (PERSIAN.test(outside) && /[?,;]/.test(outside)) bad.push(`${id}: Latin punctuation in ${kind} “${text.slice(0, 60)}” (use ؟ ، ؛)`);
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });

  test("fa-en: the English taught has no Persian in it", () => {
    const bad = [];
    for (const l of faen.lessons) for (const t of taughtTexts(l)) if (PERSIAN.test(t)) bad.push(`${l.id}: “${t}”`);
    assert.deepEqual(bad, [], bad.join("\n"));
  });
}

test("the Persian checks catch what they should", () => {
  assert.equal(persianProblem("من به مدرسه می\u200cروم."), "");
  assert.match(persianProblem("من به مدرسه می روم."), /space/);
  assert.match(persianProblem("من به مدرسه میروم."), /non-joiner/);
  assert.equal(persianProblem("کتاب روی میز است."), "", "میز is a word, not the prefix");
  assert.match(persianProblem("كتاب"), /Arabic letter/);
  assert.equal(pairProblem("من به مدرسه می\u200cروم.", "man be madrese mi-ravam."), "");
  assert.match(pairProblem("کجا می\u200cروی؟", "kojâ mi-ravi."), /question/);
  assert.match(pairProblem("من خسته\u200cام.", "man khasteam."), /hyphens/);
  assert.equal(pairProblem("کتاب\u200cهای خوب دارم.", "ketâb-hâ-ye khub dâram."), "", "the ezafe's hyphen isn't a joiner's");
  assert.match(pairProblem("کتابهای خوب دارم.", "ketâb-hâ-ye khub dâram."), /hyphens/, "a joiner missing in the Persian");
  assert.match(persianProblem("میزنم"), /non-joiner/);
  assert.equal(persianProblem("میزها و میوه\u200cها"), "");
  assert.match(pairProblem("این کتاب خوب است.", "in ketâb ast."), /words/);
  assert.match(readingProblem("marḥaban"), /romanisation/);
});
