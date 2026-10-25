// The French grammar courses (tools/grammar/en-fr, tools/grammar/fr-en): French typography as the French
// basics course writes it (a no-break space before ? ! : ; and inside « », straight apostrophes), no
// common word left without its accent, and English examples in English punctuation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { explanationTexts, taughtTexts } from "../../web/js/grammardata.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NB = String.fromCharCode(0xa0); // the no-break space
const read = (id) => {
  const path = join(root, "tools", "grammar", id, "lessons.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};
/** A text with each {{ }} piece of the language taught replaced by a word-like placeholder. */
const outside = (s) => String(s).replace(/\{\{[^{}]*\}\}/g, "X");
/** The pieces of the language taught in a lesson, with a fill question's gap filled by a placeholder word
 * (taughtTexts drops the gap, which would leave “homework ?” out of “homework ___?”). */
const taught = (lesson) => {
  const gaps = new Set((lesson.practice || []).filter((q) => q.type === "fill").map((q) => String(q.t || "").replace("___", "")));
  const fills = (lesson.practice || []).filter((q) => q.type === "fill").map((q) => String(q.t || "").replace("___", "X"));
  return [...taughtTexts(lesson).filter((t) => !gaps.has(t)), ...fills];
};

// Words that are never right without their accent (whole words, any case).
const UNACCENTED = ["tres", "deja", "apres", "etre", "francais", "francaise", "voila", "garcon", "lecon",
  "ca", "ete", "eleve", "fenetre", "bientot", "cafe", "theatre", "premiere", "derniere", "frere", "pere",
  "mere", "probleme", "interessant", "telephone", "eglise", "ecole", "etudiant", "etudiante", "deuxieme",
  "troisieme", "preferer", "prefere", "desole", "desolee", "enchante", "enchantee", "peut-etre", "aout",
  "noel", "foret", "hotel", "hopital", "entree", "annee", "journee", "soiree", "idee", "evenement"];
const unaccented = (text) => {
  const words = String(text).toLowerCase().split(/[^\p{L}'-]+/u);
  return UNACCENTED.filter((w) => words.includes(w));
};

/** What is wrong with the typography of one piece of French ("" when nothing is). */
function frenchProblem(s) {
  if (/ [?!:;»]/.test(s)) return "an ordinary space before ? ! : ; or »: use a no-break space";
  if (/« /.test(s)) return "an ordinary space after «: use a no-break space";
  if (/[^\s?!.…(«"“*]([?!;])/u.test(s)) return "no space before ? ! or ;";
  if (/[^\s\d*]:(?!\d)/u.test(s)) return "no space before :";
  if (/’/.test(s)) return "a curly apostrophe: the courses use straight ones";
  return "";
}
function englishProblem(s) {
  if (s.includes(NB) || s.includes(String.fromCharCode(0x202f))) return "a no-break space in English";
  if (/\s[?!:;]/.test(s)) return "a space before ? ! : ; in English";
  if (/[«»]/.test(s)) return "« » in English";
  return "";
}

test("en-fr: the French in it is typed as in France, with its accents", { skip: !read("en-fr") }, () => {
  const course = read("en-fr");
  const bad = [];
  for (const lesson of course.lessons) {
    for (const t of taught(lesson)) {
      const p = frenchProblem(t);
      if (p) bad.push(`${lesson.id}: ${p} (“${t}”)`);
      const u = unaccented(t);
      if (u.length) bad.push(`${lesson.id}: without its accent: ${u.join(", ")} (“${t}”)`);
    }
    for (const { text } of explanationTexts(lesson)) {
      const p = englishProblem(outside(text));
      if (p) bad.push(`${lesson.id}: ${p} (“${text}”)`);
    }
  }
  assert.deepEqual(bad, []);
});

test("fr-en: the explanations are typed as in France, the English as in English", { skip: !read("fr-en") }, () => {
  const course = read("fr-en");
  const bad = [];
  for (const k of ["title", "about"]) { const p = frenchProblem(course[k]); if (p) bad.push(`course ${k}: ${p}`); }
  for (const u of course.units) { const p = frenchProblem(u.title); if (p) bad.push(`unit ${u.n}: ${p}`); }
  for (const lesson of course.lessons) {
    for (const { text } of explanationTexts(lesson)) {
      const p = frenchProblem(outside(text));
      if (p) bad.push(`${lesson.id}: ${p} (“${text}”)`);
      const u = unaccented(outside(text));
      if (u.length) bad.push(`${lesson.id}: without its accent: ${u.join(", ")} (“${text}”)`);
    }
    for (const t of taught(lesson)) {
      const p = englishProblem(t);
      if (p) bad.push(`${lesson.id}: ${p} (“${t}”)`);
    }
  }
  assert.deepEqual(bad, []);
});

test("the French checks catch what they should", () => {
  assert.equal(frenchProblem(`Ça va${NB}?`), "");
  assert.match(frenchProblem("Ça va ?"), /ordinary space/);
  assert.match(frenchProblem("Ça va?"), /no space/);
  assert.match(frenchProblem("J’ai faim."), /curly/);
  assert.equal(frenchProblem(`Quoi${NB}?!`), "");
  assert.match(frenchProblem("Attention: ici"), /before :/);
  assert.equal(frenchProblem(`**Attention${NB}:** ici, à 8:30`), "");
  assert.deepEqual(unaccented("Je suis tres content, ça va."), ["tres"]);
  assert.deepEqual(unaccented("Très bien, c'est déjà ça."), []);
  assert.match(englishProblem("How are you ?"), /space/);
  assert.match(englishProblem(`How are you${NB}?`), /no-break/);
  assert.equal(englishProblem("How are you? I'm fine: thanks."), "");
  assert.equal(outside("Say {{Ça va ?}}: fine"), "Say X: fine");
});
