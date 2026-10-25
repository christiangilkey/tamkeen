// The Japanese grammar courses' own checks (tools/grammar/en-ja and tools/grammar/ja-en), beside the
// shared ones in grammar.test.mjs: scripts in the right places, a rōmaji reading for every piece of
// Japanese in en-ja (practice questions included), and Japanese explanations in ja-en.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { explanationTexts, targetsOf } from "../../web/js/grammardata.js";

const load = (id) => {
  const path = new URL(`../../tools/grammar/${id}/lessons.json`, import.meta.url);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};
const JAPANESE = /[ぁ-んァ-ヶ一-鿿々]/;
const ROMAJI = /^[\x20-\x7EāīūēōĀĪŪĒŌ…]+$/;

/** Every sentence of a lesson with a reading: [{where, t, r}]. */
function sentences(l) {
  const out = [];
  const add = (where, x) => out.push({ where: `${l.id} ${where}`, t: x.t, r: x.r });
  for (const b of l.blocks) {
    if (b.goal) add("goal", b.goal);
    (b.ex || []).forEach((e) => add("example", e));
    (b.dialog || []).forEach((d) => add("dialog", d));
  }
  for (const q of l.practice) {
    (q.lines || []).filter((x) => x.t).forEach((x) => add(`${q.type} line`, x));
    (q.answers || []).forEach((a) => add("model answer", a));
    if (q.type === "say") add("say", { t: q.answer, r: q.r });
  }
  return out;
}

const enja = load("en-ja");
test("en-ja: every piece of Japanese has a rōmaji reading, in Latin letters", { skip: !enja }, () => {
  assert.equal(enja.reading, "rōmaji");
  const bad = [];
  for (const l of enja.lessons) {
    for (const s of sentences(l)) {
      if (!JAPANESE.test(s.t)) bad.push(`${s.where}: no Japanese in “${s.t}”`);
      if (!ROMAJI.test(s.r || "") || JAPANESE.test(s.r)) bad.push(`${s.where}: the reading “${s.r}” isn't rōmaji`);
      if (/(です|ます)か？/.test(s.t)) bad.push(`${s.where}: a polite question ends with か。 (“${s.t}”)`);
    }
    for (const { text } of explanationTexts(l)) {
      for (const piece of targetsOf(text)) {
        const [t, r] = piece.split("|");
        if (JAPANESE.test(t) && !(r && ROMAJI.test(r))) bad.push(`${l.id}: {{${piece}}} needs a rōmaji reading`);
      }
    }
    for (const m of l.mistakes) {
      if (!ROMAJI.test(m.rw || "") || !ROMAJI.test(m.rr || "")) bad.push(`${l.id}: a mistake without its readings (rw, rr): ${m.right}`);
    }
    for (const q of l.practice) {
      const at = `${l.id} ${q.type} “${q.q.slice(0, 30)}”`;
      if (q.type === "fill") {
        if (!ROMAJI.test(q.r || "") || (q.r.match(/___/g) || []).length !== 1) bad.push(`${at}: the fill sentence needs its reading r, with one ___`);
        if (!Array.isArray(q.rs) || q.rs.length !== q.options.length || !q.rs.every((x) => ROMAJI.test(x))) bad.push(`${at}: rs must give each option's reading`);
      }
      if (q.type === "order" && (!Array.isArray(q.rs) || q.rs.length !== q.words.length || !q.rs.every((x) => ROMAJI.test(x)))) bad.push(`${at}: rs must give each word's reading`);
      for (const line of q.lines || []) {
        if (line.options && (!Array.isArray(line.rs) || line.rs.length !== line.options.length || !line.rs.every((x) => ROMAJI.test(x)))) bad.push(`${at}: a reply's rs must give each option's reading`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

const jaen = load("ja-en");
test("ja-en: the explanations are in Japanese, the examples in English", { skip: !jaen }, () => {
  assert.equal(jaen.reading, "");
  const bad = [];
  for (const k of ["title", "about"]) if (!JAPANESE.test(jaen[k])) bad.push(`course ${k} isn't in Japanese`);
  for (const u of jaen.units) if (!JAPANESE.test(u.title)) bad.push(`unit ${u.n}'s title isn't in Japanese`);
  for (const l of jaen.lessons) {
    for (const s of sentences(l)) if (JAPANESE.test(s.t)) bad.push(`${s.where}: Japanese in the English “${s.t}”`);
    for (const m of l.mistakes) if (JAPANESE.test(m.wrong + m.right)) bad.push(`${l.id}: Japanese in a mistake's sentences`);
    for (const q of l.practice) {
      const english = [...(q.type === "choice" ? [] : q.options || []), ...(q.words || []), ...(q.also || []).flat(), q.type === "fill" ? q.t : "",
        ...(q.lines || []).flatMap((x) => x.options || [])];
      for (const w of english) if (JAPANESE.test(w)) bad.push(`${l.id} ${q.type}: Japanese in “${w}”`);
    }
    for (const { kind, text } of explanationTexts(l)) {
      const own = text.replace(/\{\{[^{}]*\}\}/g, "");
      if (!JAPANESE.test(own)) bad.push(`${l.id}: ${kind} not in Japanese: “${text.slice(0, 50)}”`);
      for (const piece of targetsOf(text)) if (JAPANESE.test(piece)) bad.push(`${l.id}: Japanese inside {{${piece}}}`);
    }
  }
  assert.deepEqual(bad, []);
});
