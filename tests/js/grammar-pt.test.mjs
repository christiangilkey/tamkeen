// Checks of the Portuguese grammar courses that the shared checks can't make: Brazilian Portuguese
// spelled with all its accents (2009 spelling), no European Portuguese words, and American (not British)
// English. en-pt: the Portuguese is in the examples, sentences and {{ }} pieces. pt-en: the Portuguese is
// the explanation text, and the English is in the examples and {{ }} pieces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { explanationTexts, parseRich, taughtTexts } from "../../web/js/grammardata.js";
import { readSource } from "../../tools/grammar/build.mjs";

const have = (id) => existsSync(new URL(`../../tools/grammar/${id}/lessons.json`, import.meta.url));

// Whole words only, with accented letters counted as letters (JavaScript's \b doesn't: "peço" isn't "pe").
const words = (list) => new RegExp(`(?<!\\p{L})(${list})(?!\\p{L})`, "iu");
// Common words written without their accent (a word that is also right without one is left out).
const UNACCENTED = words("voce|voces|nao|entao|tambem|irmao|irmaos|mae|maes|pao|paes|ja|ate|ola|onibus|cafe|agua|musica|numero|familia|proximo|proxima|facil|dificil|otimo|otima|rapido|tres|mes|ingles|portugues|ultimo|unico|possivel|sabado|amanha|manha|licenca|cancao|informacao|atencao|sotao|aviao|coracao|ninguem|alguem|porem|historia|ferias|lapis|pe|cha|so");
// European Portuguese words and old (pre-2009) or European accent spellings.
const EUROPEAN = words("autocarro|comboio|telemóvel|pequeno-almoço|casa de banho|equipa|facto|contacto|receção|ecrã|rapariga|miúdo|sumo|frigorífico|económic\\p{L}*|António|género|ténis|fenómeno|académic\\p{L}*|prémio|polémic\\p{L}*|idéia|vôo|enjôo|lingüi\\p{L}*|freqüen\\p{L}*|tranqüil\\p{L}*|cinqüenta|agüent\\p{L}*");
// "estar a + infinitive" is European; Brazilians say "estar + -ndo".
const ESTAR_A = words("(?:estou|estás|está|estamos|estão|estava|estavam) a \\p{L}+[aei]r");
// British spellings and words in the American English course.
const BRITISH = /\b(colour\w*|favour\w*|neighbour\w*|centre|centres|theatre|realis\w*|organis\w*|apologis\w*|travelled|travelling|metre|litre|programme|cheque|mum|petrol|lorry|queue|trousers|biscuits?|motorway|postcode|rubbish|fortnight|whilst|amongst)\b/;

const pieces = (s) => parseRich(s).filter((p) => p.kind === "target").map((p) => p.text);
const own = (s) => parseRich(s).filter((p) => p.kind === "text").map((p) => p.text).join(" ");

// Pieces quoted on purpose, to show what isn't said in Brazil.
const QUOTED = new Set(["estou a falar"]);

function problems(lessons, texts, rules) {
  const bad = [];
  for (const l of lessons) for (const t of texts(l)) for (const [name, re] of rules) {
    if (QUOTED.has(String(t))) continue;
    const m = String(t).match(re);
    if (m) bad.push(`${l.id}: ${name} “${m[0]}” in “${String(t).slice(0, 70)}”`);
  }
  return bad;
}

if (have("en-pt")) test("en-pt: the Portuguese is Brazilian, with every accent", () => {
  const course = readSource("en-pt");
  const bad = problems(course.lessons, taughtTexts, [["missing accent", UNACCENTED], ["European or old spelling", EUROPEAN], ["European “estar a”", ESTAR_A]]);
  assert.deepEqual(bad, []);
});

if (have("pt-en")) test("pt-en: the explanations are Brazilian Portuguese with every accent, the English is American", () => {
  const course = readSource("pt-en");
  const portuguese = (l) => [course.title, course.about, ...course.units.map((u) => u.title), ...explanationTexts(l).map((x) => own(x.text))];
  const english = (l) => [...taughtTexts(l), ...explanationTexts(l).flatMap((x) => pieces(x.text))];
  const bad = [
    ...problems(course.lessons, portuguese, [["missing accent", UNACCENTED], ["European or old spelling", EUROPEAN], ["European “estar a”", ESTAR_A]]),
    ...problems(course.lessons, english, [["British English", BRITISH]]),
  ];
  assert.deepEqual([...new Set(bad)], []);
});
