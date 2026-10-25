// The German grammar courses' own checks (tools/grammar/en-de and tools/grammar/de-en): German spelled
// the modern way (ß where it belongs, no old “daß”), English spelled the American way, and no straight
// quotes (the courses use “ ” so the JSON stays easy to read).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { explanationTexts, parseRich, taughtTexts } from "../../web/js/grammardata.js";

const read = (id) => {
  const path = `tools/grammar/${id}/lessons.json`;
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

/** The explanation text without its {{ }} pieces (so a German word inside English text isn't checked as English). */
const ownText = (s) => parseRich(s).filter((p) => p.kind === "text").map((p) => p.text).join(" ");
/** The {{ }} pieces of an explanation text. */
const pieces = (s) => parseRich(s).filter((p) => p.kind === "target").map((p) => p.text);

// Old or Swiss spellings, and common words that need ß in Germany.
const BAD_GERMAN = /\b(daß|muß|mußt|Schluß|ißt|läßt|heiss\w*|Strasse\w*|gross\w*|grösser\w*|weiss|weisst|Fuss|Spass|draussen|Grüsse|grüssen|schliessen|fliessen|Füsse)\b/i;
// British spellings and words, where American English says something else.
const BAD_ENGLISH = /\b(colour\w*|favourite\w*|centre\w*|theatre\w*|travell\w*|realis\w*|organis\w*|apologis\w*|neighbour\w*|programme\w*|mum|whilst|learnt|cheque|grey|tyre|aeroplane|lorry|petrol)\b/i;

function germanAndEnglish(course, germanIsTaught) {
  const german = [], english = [];
  for (const l of course.lessons) {
    const ex = explanationTexts(l).map((t) => t.text);
    const taught = taughtTexts(l);
    if (germanIsTaught) {
      german.push(...taught, ...ex.flatMap(pieces));
      english.push(...ex.map(ownText));
    } else {
      english.push(...taught, ...ex.flatMap(pieces));
      german.push(...ex.map(ownText));
    }
  }
  return { german, english };
}

function allStrings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}

for (const [id, germanIsTaught] of [["en-de", true], ["de-en", false]]) {
  const course = read(id);
  if (!course) continue;
  test(`${id}: German uses ß where it belongs and no old spellings`, () => {
    const bad = germanAndEnglish(course, germanIsTaught).german.filter((t) => BAD_GERMAN.test(t));
    assert.deepEqual(bad, []);
  });
  test(`${id}: English is American English`, () => {
    const bad = germanAndEnglish(course, germanIsTaught).english.filter((t) => BAD_ENGLISH.test(t));
    assert.deepEqual(bad, []);
  });
  test(`${id}: no straight double quotes`, () => {
    assert.deepEqual(allStrings(course).filter((s) => s.includes('"')), []);
  });
}
