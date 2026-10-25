// The two Catalan grammar courses (tools/grammar/en-ca and ca-en): their Catalan is written in the current
// spelling (IEC 2017: only the fifteen diacritic accents bé, déu, és, mà, més, món, pèl, què, sé, sí, sòl,
// són, té, ús, vós are kept, so "soc", "dona", "venen", "adeu"), and without the Spanish loans a careful
// Catalan speaker avoids ("bueno", "tinc que"). Only the Catalan that is meant to be right is checked: a
// mistake's "wrong" sentence and the wrong options of a practice question may break these rules on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { explanationTexts, targetsOf } from "../../web/js/grammardata.js";

const course = (id) => {
  const path = new URL(`../../tools/grammar/${id}/lessons.json`, import.meta.url);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

// Accents the 2017 spelling dropped (whole words, any case).
const OLD_ACCENTS = ["sóc", "dóna", "dónes", "vénen", "véns", "fóra", "féu", "móra", "ós", "nét", "néta", "séc", "bóta", "adéu", "vés", "cóm"];
// Spanish words and turns a careful Catalan speaker avoids.
const LOANS = ["bueno", "vale", "entonces", "pues", "hasta", "aburrit", "aburrida", "enterar", "apretar",
  "tinc que", "tens que", "té que", "tenim que", "teniu que", "tenen que", "tenir que", "tenia que"];

const words = (s) => String(s).toLowerCase().split(/[^\p{L}·']+/u).filter(Boolean);
function problems(text) {
  const w = words(text), joined = ` ${w.join(" ")} `;
  return [...OLD_ACCENTS.filter((x) => w.includes(x)), ...LOANS.filter((x) => joined.includes(` ${x} `))];
}

/** The Catalan of an English → Catalan lesson that is meant to be right. */
function rightCatalan(l) {
  const out = [];
  for (const b of l.blocks || []) {
    if (b.goal) out.push(b.goal.t);
    for (const e of b.ex || []) out.push(e.t);
    for (const d of b.dialog || []) out.push(d.t);
  }
  for (const m of l.mistakes || []) out.push(m.right);
  for (const q of l.practice || []) {
    if (q.type === "fill") out.push(q.t.replace("___", " "), q.options[q.answer]);
    if (q.type === "order") out.push(q.words.join(" "));
    if (q.type === "say") out.push(q.answer);
    for (const x of q.lines || []) out.push(x.options ? x.options[x.answer] : x.t);
    for (const a of q.answers || []) out.push(a.t);
  }
  return out;
}

/** The Catalan explanations of a Catalan → English lesson, without its pieces of English. */
const catalanExplanations = (l) => explanationTexts(l).map((x) => targetsOf(x.text).reduce((s, t) => s.replace(`{{${t}}}`, " "), x.text));

for (const [id, texts] of [["en-ca", rightCatalan], ["ca-en", catalanExplanations]]) {
  const c = course(id);
  if (!c) continue;
  test(`the ${id} course writes Catalan in the current spelling, without Spanish loans`, () => {
    const bad = [];
    for (const l of c.lessons) for (const t of texts(l)) { const p = problems(t); if (p.length) bad.push(`${l.id}: ${p.join(", ")} in “${t}”`); }
    assert.deepEqual(bad, []);
  });
}

test("the spelling check finds old accents and loans", () => {
  assert.deepEqual(problems("Sóc de Vic i tinc que marxar, bueno."), ["sóc", "bueno", "tinc que"]);
  assert.deepEqual(problems("Soc de Vic, és tard i he de marxar."), []);
});
