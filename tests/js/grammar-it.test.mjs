// The Italian grammar courses (tools/grammar/en-it, tools/grammar/it-en): spelling checks the shared
// checks can't make. Italian accents are part of the spelling (perché, più, città, po'); the English
// course is American English. The deliberately wrong sentences (a mistake's "wrong", the wrong options of
// a question) are left out: they may be wrong on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { explanationTexts, parseRich, targetsOf } from "../../web/js/grammardata.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (id) => {
  const path = join(root, "tools", "grammar", id, "lessons.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

/** The sentences of a lesson in the language taught that are meant to be right. */
function rightTexts(l) {
  const out = [];
  const add = (where, t) => { if (typeof t === "string" && t.trim()) out.push({ where, t }); };
  for (const b of l.blocks || []) {
    if (b.goal) add("goal", b.goal.t);
    for (const e of b.ex || []) add("example", e.t);
    for (const d of b.dialog || []) add("dialogue", d.t);
  }
  for (const m of l.mistakes || []) add("mistake (right)", m.right);
  for (const q of l.practice || []) {
    if (q.type === "fill") add("fill", String(q.t || "").replace("___", (q.options || [])[q.answer] || ""));
    if (q.type === "order") add("order", (q.words || []).join(" "));
    if (q.type === "say") add("say", q.answer);
    for (const x of q.lines || []) { if (x.options) add("reply", x.options[x.answer]); else add("dialogue", x.t); }
    for (const a of q.answers || []) add("model answer", a.t);
  }
  return out;
}

/** Explanation text without its {{ }} pieces (the explanation language only). */
const ownText = (s) => parseRich(s).filter((p) => p.kind === "text").map((p) => p.text).join("");

/** A whole word (or one of several), however it is accented: JavaScript's \b doesn't know accents. */
const word = (alternatives, flags = "iu") => new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, flags);

// Italian words that are often misspelt: the wrong accent, a missing accent, an apostrophe for an accent.
const ITALIAN_SLIPS = [
  [word("perchè|poichè|benchè|affinchè|purchè|finchè|sicchè|giacchè|nè"), "é (acute) in perché, poiché, benché, né…"],
  [word("pò"), "po' (an apostrophe, not an accent)"],
  [/qual'è/iu, "qual è (no apostrophe)"],
  [/(?<!\p{L})[Ee]' /u, "è / È (an accent, not an apostrophe)"],
  [word("perche|piu|puo|citta|cosi|gia|caffe|ventitre|trentatre|lunedi|martedi|mercoledi|giovedi|venerdi|universita|felicita|liberta|virtu|pero|percio|cioe"), "a missing accent"],
  [/(?<!\p{L})un' /iu, "un' joins the next word: un'amica"],
  [word("un'(?:amico|altro|albero|ufficio|ospedale|aereo|uomo|esempio|anno|orologio|autobus)"), "no apostrophe before a masculine noun: un amico"],
];
const AMERICAN_SLIPS = [
  [word("colour|colours|favourite|centre|theatre|travelled|travelling|cancelled|realise|organise|apologise|neighbour|neighbours|flavour|honour|labour|metre|litre|programme|jewellery|cheque|mum"), "British spelling or word"],
  [word("on holiday"), "American: on vacation"],
  [word("queue|flat|lift|motorway|petrol|chemist|trousers|biscuit|biscuits|rubbish|mobile phone|underground|football"), "British word (American: line, apartment, elevator, highway, gas, pharmacy, pants, cookie, trash, cell phone, subway, soccer)"],
];

const slips = (text, rules) => rules.filter(([re]) => re.test(text)).map(([, what]) => what);

const enit = read("en-it");
const iten = read("it-en");

test("English → Italian: the Italian is spelt right, accents and apostrophes included", { skip: !enit }, () => {
  const bad = [];
  for (const l of enit.lessons) {
    for (const { where, t } of rightTexts(l)) for (const s of slips(t, ITALIAN_SLIPS)) bad.push(`${l.id} ${where} “${t}”: ${s}`);
    for (const { text } of explanationTexts(l)) {
      for (const piece of targetsOf(text).map((x) => x.split("|")[0])) {
        for (const s of slips(piece, ITALIAN_SLIPS)) bad.push(`${l.id} {{${piece}}}: ${s}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("English → Italian: the English explanations are American", { skip: !enit }, () => {
  const bad = [];
  for (const l of enit.lessons) {
    for (const { kind, text } of explanationTexts(l)) for (const s of slips(ownText(text), AMERICAN_SLIPS.slice(0, 2))) bad.push(`${l.id} ${kind} “${ownText(text).slice(0, 50)}”: ${s}`);
  }
  assert.deepEqual(bad, []);
});

test("Italian → English: the Italian explanations are spelt right", { skip: !iten }, () => {
  const bad = [];
  for (const l of iten.lessons) {
    for (const { kind, text } of explanationTexts(l)) {
      for (const s of slips(ownText(text), ITALIAN_SLIPS.slice(0, 5))) bad.push(`${l.id} ${kind} “${ownText(text).slice(0, 50)}”: ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("Italian → English: the English is American", { skip: !iten }, () => {
  const bad = [];
  for (const l of iten.lessons) {
    for (const { where, t } of rightTexts(l)) for (const s of slips(t, AMERICAN_SLIPS)) bad.push(`${l.id} ${where} “${t}”: ${s}`);
  }
  assert.deepEqual(bad, []);
});

test("the slip finder finds slips", () => {
  assert.ok(slips("Perchè no?", ITALIAN_SLIPS).length);
  assert.ok(slips("un pò di pane", ITALIAN_SLIPS).length);
  assert.ok(slips("Qual'è il tuo nome?", ITALIAN_SLIPS).length);
  assert.ok(slips("E' tardi.", ITALIAN_SLIPS).length);
  assert.ok(slips("Abito in citta.", ITALIAN_SLIPS).length);
  assert.ok(slips("un'amico", ITALIAN_SLIPS).length);
  assert.deepEqual(slips("Perché? Un po' di più, è già così: un'amica, un amico, qual è?", ITALIAN_SLIPS), []);
  assert.ok(slips("My favourite colour", AMERICAN_SLIPS).length);
  assert.deepEqual(slips("My favorite color is red.", AMERICAN_SLIPS), []);
});
