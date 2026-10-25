// The Spanish grammar courses' own checks (tools/grammar/en-es and es-en), beyond grammardata.js
// checkCourse: the Spanish is written as Mexicans write it (accents, ¿ ¡, ñ, no vosotros, no words
// Mexico doesn't use) and the English is American. Only sentences meant to be right are checked: a
// mistake's "wrong", a question's wrong options, and pieces after "not"/"never"/"no"/"nunca" are left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { explanationTexts, parseRich } from "../../web/js/grammardata.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const load = (id) => {
  const path = join(root, "tools", "grammar", id, "lessons.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

// ---------------------------------------------------------------- which texts

/** The {{ }} pieces of an explanation text that are meant to be right (not after "not", "never"…). */
const NEGATED = /(?:\bnot|\bnever|\binstead of|\brather than|\bnor|\bno|\bnunca|\ben vez de|\ben lugar de|\bni|\bwrong|\bmal)[\s:,“"(]*$/i;
function rightPieces(text) {
  const out = [];
  let before = "";
  for (const p of parseRich(text)) {
    if (p.kind === "target") { if (!NEGATED.test(before.slice(-30))) out.push(p.text); before += p.text; } else before += p.text;
  }
  return out;
}
/** The explanation text without its {{ }} pieces. */
const ownText = (text) => parseRich(text).filter((p) => p.kind === "text").map((p) => p.text).join(" ");

/** The sentences of a lesson in the language taught that are meant to be right: [{where, t, sentence}]
 * (`sentence`: a whole sentence, which must start with a capital and end with a mark). */
function taughtRight(lesson) {
  const out = [];
  const add = (where, t, sentence = false) => { if (typeof t === "string" && t.trim()) out.push({ where, t, sentence }); };
  for (const x of explanationTexts(lesson)) {
    if (/practice question|explanation|answer option|why it is/.test(x.kind)) continue; // may show wrong forms
    for (const piece of rightPieces(x.text)) add(x.kind, piece);
  }
  (lesson.blocks || []).forEach((b) => {
    if (b.goal) add("goal", b.goal.t, true);
    for (const e of b.ex || []) add("example", e.t, true);
    for (const d of b.dialog || []) add("dialogue", d.t, true);
  });
  for (const m of lesson.mistakes || []) add("mistake (right)", m.right, true);
  for (const q of lesson.practice || []) {
    if (q.type === "fill") add("fill", String(q.t || "").replace("___", (q.options || [])[q.answer] ?? ""), true);
    if (q.type === "order") { add("order", (q.words || []).join(" "), true); for (const a of q.also || []) add("order (also)", a.join(" "), true); }
    if (q.type === "choice") { const o = (q.options || [])[q.answer]; if (o) for (const piece of rightPieces(o)) add("choice (right)", piece); }
    if (q.type === "dialogue") for (const l of q.lines || []) { if (l.options) add("dialogue (right reply)", l.options[l.answer], true); else add("dialogue", l.t, true); }
    if (q.type === "say") add("say", q.answer, true);
    if (q.type === "free") for (const a of q.answers || []) add("model answer", a.t, true);
  }
  return out;
}

// ---------------------------------------------------------------- what is wrong in a text

const words = (t) => String(t).toLowerCase().match(/\p{L}+/gu) || [];

const NO_ACCENT = new Set(("tambien despues adios aqui alli ahi cafe telefono musica numero rapido rapida dificil " +
  "dificiles facil faciles ingles frances japones aleman miercoles sabado sabados lapiz lapices arbol arboles pelicula peliculas " +
  "medico medica camion avion cancion leccion habitacion estacion informacion todavia pais dias jamas ademas quizas asi " +
  "detras atras util ultimo ultima proximo proxima pagina examenes jovenes azucar mexico canada peru panama japon mama " +
  "tenia tenias teniamos tenian vivia vivias viviamos vivian comia comias podia podias podian queria querias querian " +
  "habia habian decia decias salia estaria podria podrias podrian gustaria gustarian tendria tendrias haria " +
  "harias diria querria viviria comeria iria irias sueter boligrafo telefonos numeros dolar dolares " +
  "ano anos manana mananas senor senora senores nino nina ninos ninas espanol espanola pequeno pequena pequenos pequenas " +
  "bano banos companero companera sueno suenos montana espanoles cumpleanos otono munoz nunez " +
  "fué fuí dió vió tí sólo éste ésta éstos éstas ése ésa ésos ésas aquél aquélla").split(/\s+/).filter(Boolean));
// (not here because they are words too: seria “serious”, sabia “wise”, hacia “towards”, papa “potato”, esta “this”)
const VOSOTROS = new Set(["vosotros", "vosotras", "vuestro", "vuestra", "vuestros", "vuestras", "os", "sois", "habéis"]);
const NOT_MEXICAN = new Set(["coger", "cogí", "coge", "cogió", "cojo", "coges", "ordenador", "ordenadores", "zumo", "zumos",
  "patata", "patatas", "gafas", "guay", "móvil", "coche", "coches", "conducir", "conduzco", "conduces", "conduce",
  "aparcar", "nevera", "melocotón", "judías", "chaval", "mola", "ostras"]);
const VALE = /(^|[¡¿.,;:]\s*)vale\s*[,.!?]/i; // Spain's “OK!” (but “Más vale que…” is Mexican too)
const QUESTION_WORD = /¿\s*(?:(?:y|e|a|de|en|con|para|por|desde|hasta|o)\s+)*(que|quien|quienes|donde|adonde|cuando|como|cuanto|cuanta|cuantos|cuantas|cual|cuales)(?![\p{L}])/iu;

function spanishProblems(t) {
  const bad = [];
  const s = String(t);
  if ((s.match(/¿/g) || []).length !== (s.match(/\?/g) || []).length) bad.push("¿ and ? don't pair up");
  if ((s.match(/¡/g) || []).length !== (s.match(/!/g) || []).length) bad.push("¡ and ! don't pair up");
  const qw = s.match(QUESTION_WORD);
  if (qw) bad.push(`“${qw[1]}” in a question needs its accent`);
  if (/¿\s*porque\b/i.test(s)) bad.push("“¿por qué?” is two words in a question");
  if (VALE.test(s)) bad.push("“¡Vale!” isn't what Mexicans say (“Va”, “Sale”, “Órale”)");
  for (const w of words(s)) {
    if (NO_ACCENT.has(w)) bad.push(`“${w}”: a missing or old accent (or ñ)`);
    if (/(áis|éis)$/.test(w) || VOSOTROS.has(w)) bad.push(`“${w}” is vosotros: Mexico says ustedes`);
    if (NOT_MEXICAN.has(w)) bad.push(`“${w}” isn't what Mexicans say`);
    if (/[a-z](cion|sion)$/.test(w) && w.length > 5) bad.push(`“${w}” needs its accent (-ción, -sión)`);
  }
  if (/\ba mi (también|tampoco|me|sí|no)\b/i.test(s) || /\b(a|para|de|por|con|sin) mi\s*(?=[,.!?;:)]|$)/i.test(s)) bad.push("“mí” (me) needs its accent");
  if (/\by tu\s*[?,.!]/i.test(s) || /\btu (eres|estás|tienes|quieres|puedes|vas|haces|sabes|vives|trabajas|hablas)\b/i.test(s)) bad.push("“tú” (you) needs its accent");
  if (/\bel (es|está|tiene|quiere|vive|trabaja|habla|va|dice|sabe|puede|fue|era|estaba)\b/.test(s)) bad.push("“él” (he) needs its accent");
  return bad;
}

const BRITISH = new Set(("colour colours favourite favourites centre centres realise realised organise organised apologise " +
  "recognise travelled travelling theatre neighbour neighbours flavour programme licence cheque behaviour honour labour metre " +
  "metres litre litres mum mums rubbish queue petrol lorry biscuit biscuits trousers pavement postcode fortnight maths learnt " +
  "spelt grey practise jewellery tyre tyres defence catalogue analyse cosy pyjamas").split(/\s+/));
function englishProblems(t, { taught = false } = {}) {
  const bad = [];
  for (const w of words(t)) if (BRITISH.has(w)) bad.push(`“${w}” is British: write American English`);
  if (taught) {
    if (/[¿¡]/.test(t)) bad.push("¿ or ¡ in English");
    if (/(^|[\s“"(])i(?=['’\s.,!?]|$)/.test(t)) bad.push("“I” is always a capital");
  }
  return bad;
}

function sentenceProblems(t) {
  const bad = [];
  const s = String(t).trim();
  if (!/[.!?…”)]$/.test(s)) bad.push("a sentence without its final mark");
  const first = s.replace(/^[¿¡“"(—\s]+/, "")[0] || "";
  if (first && first !== first.toUpperCase()) bad.push("a sentence that doesn't start with a capital");
  if (/\s[.,!?;:]/.test(s.replace(/\s—\s/g, " ")) || /\s{2,}/.test(s)) bad.push("a space before a mark, or two spaces");
  return bad;
}

// ---------------------------------------------------------------- the tests

function report(course, check) {
  const bad = [];
  for (const l of course.lessons || []) for (const x of check(l)) bad.push(`${l.id}: ${x}`);
  return bad;
}

const enEs = load("en-es");
if (enEs) {
  test("en-es: the Spanish is right (accents, ¿ ¡, ñ, ustedes, Mexican words)", () => {
    const bad = report(enEs, (l) => taughtRight(l).flatMap((x) => [
      ...spanishProblems(x.t), ...(x.sentence ? sentenceProblems(x.t) : [])].map((p) => `${p} in ${x.where} “${x.t}”`)));
    assert.deepEqual(bad, [], bad.join("\n"));
  });
  test("en-es: the English explanations are American English", () => {
    const bad = report(enEs, (l) => explanationTexts(l).flatMap((x) => englishProblems(ownText(x.text)).map((p) => `${p} in ${x.kind} “${x.text.slice(0, 50)}”`)));
    assert.deepEqual(bad, [], bad.join("\n"));
  });
}

const esEn = load("es-en");
if (esEn) {
  test("es-en: the Spanish explanations are right (accents, ¿ ¡, ñ, ustedes, Mexican words)", () => {
    const texts = [esEn.title, esEn.about, ...(esEn.units || []).map((u) => u.title)];
    const bad = texts.flatMap((t) => spanishProblems(t).map((p) => `course: ${p} in “${t}”`));
    bad.push(...report(esEn, (l) => explanationTexts(l).flatMap((x) => spanishProblems(ownText(x.text)).map((p) => `${p} in ${x.kind} “${x.text.slice(0, 50)}”`))));
    assert.deepEqual(bad, [], bad.join("\n"));
  });
  test("es-en: the English is American English, with its capitals and marks", () => {
    const bad = report(esEn, (l) => taughtRight(l).flatMap((x) => [
      ...englishProblems(x.t, { taught: true }), ...(x.sentence ? sentenceProblems(x.t) : [])].map((p) => `${p} in ${x.where} “${x.t}”`)));
    assert.deepEqual(bad, [], bad.join("\n"));
  });
}

test("the Spanish checks catch what they should", () => {
  assert.ok(spanishProblems("¿Donde vives?").length, "a question word without its accent");
  assert.ok(spanishProblems("Donde vives?").length, "a ? without its ¿");
  assert.ok(spanishProblems("¿Vosotros sois de aquí?").length, "vosotros");
  assert.ok(spanishProblems("Tambien quiero un cafe.").length, "missing accents");
  assert.ok(spanishProblems("Es una cancion.").length, "-ción");
  assert.ok(spanishProblems("Tengo un coche.").length, "not Mexican");
  assert.ok(spanishProblems("A mi también.").length, "mí");
  assert.deepEqual(spanishProblems("¿De dónde eres? Soy de aquí, ¿y tú?"), []);
  assert.deepEqual(spanishProblems("¡Que te vaya bien!"), [], "a wish has no accent on que");
  assert.deepEqual(rightPieces("Say {{estoy}}, never {{soy bien}}."), ["estoy"]);
  assert.ok(englishProblems("My favourite colour", {}).length);
  assert.ok(englishProblems("¿Do you work here?", { taught: true }).length);
  assert.ok(sentenceProblems("hola, soy Ana").length);
});
