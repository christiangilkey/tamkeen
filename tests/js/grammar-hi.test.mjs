// The Hindi grammar courses' own checks (tools/grammar/en-hi, tools/grammar/hi-en): the Hindi is in
// Devanagari as the basics course writes it, every Hindi piece in en-hi has its reading in the basics
// course's romanisation, and the English of hi-en is English.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { explanationTexts, taughtTexts, targetsOf } from "../../web/js/grammardata.js";

const load = (id) => {
  const path = new URL(`../../tools/grammar/${id}/lessons.json`, import.meta.url);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};
const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN = /[A-Za-z]/;

// The basics course's spellings: -ए forms, and the nukta on borrowed sounds.
const OLD = ["गयी", "गये", "नयी", "लिये", "चाहिये", "दीजिये", "कीजिये", "लीजिये", "पीजिये", "हुये", "आइये", "जाइये", "बैठिये"];
const NUKTA = {
  "ज्यादा": "ज़्यादा", "खुश": "ख़ुश", "खुशी": "ख़ुशी", "फोन": "फ़ोन", "कॉफी": "कॉफ़ी", "जरूर": "ज़रूर", "जरूरी": "ज़रूरी",
  "बाजार": "बाज़ार", "मेज": "मेज़", "हफ्ते": "हफ़्ते", "हफ्ता": "हफ़्ता", "खराब": "ख़राब", "खुद": "ख़ुद", "गलत": "ग़लत",
  "गलती": "ग़लती", "तोहफा": "तोहफ़ा", "दरवाजा": "दरवाज़ा", "दरवाजे": "दरवाज़े", "माफ": "माफ़", "साफ": "साफ़",
  "जिंदगी": "ज़िंदगी", "इंतजार": "इंतज़ार", "फिल्म": "फ़िल्म", "फिल्में": "फ़िल्में", "बुखार": "बुख़ार", "खबर": "ख़बर",
};
const words = (s) => String(s).split(/[^ऀ-ॣ०-ॿ]+/).filter(Boolean);

function spellingProblems(texts) {
  const bad = [];
  for (const t of texts) for (const w of words(t)) {
    if (OLD.includes(w)) bad.push(`${w} (write the -ए form) in “${t}”`);
    if (NUKTA[w]) bad.push(`${w} → ${NUKTA[w]} in “${t}”`);
  }
  return bad;
}

const en = load("en-hi");
if (en) {
  test("en-hi: every Hindi text is Devanagari, ends in । ? ! (not .), and spells as the basics course does", () => {
    const bad = [];
    for (const l of en.lessons) {
      for (const t of taughtTexts(l)) {
        if (LATIN.test(t)) bad.push(`${l.id}: Latin letters in “${t}”`);
        if (/\.\s*$|\.\s/.test(t) && DEVANAGARI.test(t)) bad.push(`${l.id}: a . instead of । in “${t}”`);
      }
      bad.push(...spellingProblems(taughtTexts(l)).map((p) => `${l.id}: ${p}`));
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });

  test("en-hi: every Hindi piece in an explanation has its reading, in the basics course's romanisation", () => {
    const bad = [];
    // Latin letters, with a hat (ô), a tilde (ẽ), a line (ā), a dot above (ṅ) or below (ṭ); punctuation
    const marks = String.fromCharCode(0x302, 0x303, 0x304, 0x307, 0x323);
    const ROMAN = new RegExp(`^[a-z${marks} .,?!;:'’“”"()—…→/0-9-]*$`);
    const roman = (r) => ROMAN.test(r.normalize("NFD"));
    for (const l of en.lessons) {
      for (const { text } of explanationTexts(l)) for (const piece of targetsOf(text)) {
        const [t, r] = piece.split("|");
        if (DEVANAGARI.test(t) && !(r || "").trim()) bad.push(`${l.id}: {{${t}}} has no reading`);
        if (r && !roman(r)) bad.push(`${l.id}: odd letters in the reading “${r}”`);
      }
      const walk = (o) => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (o && typeof o === "object") {
          if (typeof o.r === "string" && !roman(o.r)) bad.push(`${l.id}: odd letters in the reading “${o.r}”`);
          Object.values(o).forEach(walk);
        }
      };
      walk(l);
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });
}

const hi = load("hi-en");
if (hi) {
  test("hi-en: the English is English, and the explanations are written in Hindi", () => {
    const bad = [];
    for (const l of hi.lessons) {
      for (const t of taughtTexts(l)) if (DEVANAGARI.test(t)) bad.push(`${l.id}: Devanagari in the English “${t}”`);
      for (const b of l.blocks) if (b.p !== undefined && !DEVANAGARI.test(b.p.replace(/\{\{[^}]*\}\}/g, ""))) bad.push(`${l.id}: a paragraph with no Hindi: “${b.p.slice(0, 50)}”`);
      for (const k of ["title", "summary"]) if (!DEVANAGARI.test(l[k])) bad.push(`${l.id}: its ${k} isn't in Hindi`);
      const hindi = explanationTexts(l).map((x) => x.text.replace(/\{\{[^}]*\}\}/g, ""));
      bad.push(...spellingProblems(hindi).map((p) => `${l.id}: ${p}`));
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });
}
