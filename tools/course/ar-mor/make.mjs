// The Moroccan Darija basics course's word list: tools/course/ar-mor/list.tsv (written by hand) -> words.json
// (what build_course.py publishes) and EVIDENCE.md (the proof behind every word, for reading).
//
//   node tools/course/ar-mor/make.mjs                       list.tsv -> words.json, EVIDENCE.md here
//   node tools/course/ar-mor/make.mjs draft.tsv some/dir    a draft list, written somewhere else (to try it)
//
// For each word it adds:
//   uses, perMillion  how often it is used in the two Moroccan text collections (tools/course/dialect/sources.mjs
//                     TEXTS.mor: the Darija Open Dataset's sentences and the subtitles of 248 Moroccan YouTube
//                     videos), counted in all its forms: the spellings list.tsv gives, each made into its
//                     paradigm here (verbs: past endings, present prefixes, the ka-/ta- and gha- prefixes, ma…sh,
//                     object endings; nouns: the article, plurals list.tsv gives, possessive endings; each also
//                     with و / ف / ب / ل / د in front). perMillion is the mean of the two collections' rates, so
//                     neither one decides alone. A form that is itself a common MSA word (مني "from me") isn't
//                     counted, and a form two words share is split between them;
//   forms             the forms that were found, most used first (evidence.mjs counts these again);
//   src               what published dictionaries say it means: the senses of its entries in Wiktionary's Moroccan
//                     Arabic dictionary, Wiktionary's Arabic entries labelled Moroccan, and the Darija Open
//                     Dataset's word lists, with the page each is on (the senses that match the meaning taught);
//   msa               what Wiktionary's Standard Arabic entry spelled the same says, when there is one.
// Words are put in order of use, most used first; a word used fewer than MIN_USES times is left out, and the course
// keeps the first MAX_WORDS. Then run tools/course/dialect/evidence.mjs mor (real sentences using each word) and
// tools/course/dialect/overlap.mjs ar-mor (no word is an MSA word).
import { createReadStream, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { counts, dictionary, SRC, TEXTS } from "../dialect/sources.mjs";
import { bare } from "../dialect/msa.mjs";
import { msaWords, searchKey } from "../dialect/overlap.mjs";
import { matchForm } from "../../../web/js/lexicon/arabic.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIELDS = ["word", "pos", "meaning", "note", "form", "sentence", "translation", "spellings", "leaveOut"];
export const MIN_USES = 5;
export const MAX_WORDS = 300;
// Senses a Standard Arabic entry gives only for some region or register: not Standard Arabic.
const LABELLED = /colloquial|dialect|levant|leban|syria|palestin|jordan|egypt|gulf|iraq|maghreb|morocc|tunis|algeri|hijaz|najd|saudi|sudan|yemen|kuwait|bahrain|qatar|emirat|libya|vulgar|slang|informal|regional|north africa/i;

/** list.tsv (tab-separated, FIELDS) -> [{word, pos, meaning, note, form, sentence, translation, spellings[], leaveOut[]}] */
export function readList(path = join(HERE, "list.tsv")) {
  return readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).map((line, i) => {
    const cells = line.split("\t").map((c) => c.trim());
    while (cells.length < FIELDS.length) cells.push("");
    if (cells.length !== FIELDS.length) throw new Error(`list.tsv line ${i + 2}: ${cells.length} cells, not ${FIELDS.length}: ${line}`);
    const w = Object.fromEntries(FIELDS.map((f, j) => [f, cells[j]]));
    return { ...w, spellings: w.spellings.split(/\s+/).filter(Boolean), leaveOut: w.leaveOut.split(/\s+/).filter(Boolean) };
  });
}

// ------------------------------------------------------------------ the forms of a word, as the texts spell them

/** A spelling as counted: no vowel marks, one alef/ya/ta marbuta, runs of 3+ letters cut to one (sources.mjs countForm). */
const mf = (s) => matchForm(String(s || "").replace(/[^؀-ۿ]/g, "")).replace(/(.)\1\1+/g, "$1");
const POSS = ["ي", "ك", "و", "ه", "ها", "نا", "كم", "كوم", "هم", "هوم"];
const OBJ = ["ني", "ك", "و", "ه", "ها", "نا", "كم", "كوم", "هم", "هوم", "ليا", "ليك", "لو", "ليه", "ليها", "لينا", "ليهم"];

/** A noun or adjective: with the article (ال or Darija ل), possessive endings, و ف ب ل د in front. */
function nounForms(word, pos) {
  const base = new Set([word]);
  if (pos === "adj") for (const b of [...base]) for (const e of ["ه", "ين", "ا"]) base.add(b + e);
  const out = new Set();
  for (const b0 of base) {
    const b = mf(b0), bt = b.replace(/ه$/, "ت");
    const xs = [b, `ال${b}`, `ل${b}`, ...POSS.map((s) => bt + s)];
    for (const x of xs) for (const p of ["", "و", "ف", "ب", "ل", "د", "وب", "فل", "بل", "ول", "دل"]) out.add(p + x);
  }
  return out;
}

/**
 * A verb from its past (he) form and present (he) form (np): the past with its endings (بغيت, بغيتي, بغات…),
 * the present with its person prefixes, ka-/ta-/gha- in front, the imperative, each with ما…ش and object endings.
 */
function verbForms(word, nonpast) {
  const h = mf(word), L = [...h];
  const past = new Set([h]);
  if (/[اي]$/.test(h)) { const b = h.slice(0, -1); for (const s of ["يت", "يتي", "ات", "ينا", "يتو", "او"]) past.add(b + s); }
  else if (L.length === 3 && L[1] === "ا") { const b = L[0] + L[2]; for (const s of ["ت", "تي", "نا", "تو"]) past.add(b + s); for (const s of ["ت", "و", "ات"]) past.add(h + s); }
  else if (L.length === 2) { for (const s of ["يت", "يتي", "ات", "ينا", "يتو", "و"]) past.add(h + s); }
  else { for (const s of ["ت", "تي", "ات", "نا", "تو", "و"]) past.add(h + s); }
  const np = new Set(nonpast.map(mf));
  if (!np.size) {
    if (/[اي]$/.test(h)) np.add(`ي${h.slice(0, -1)}ي`);
    else if (L.length === 3 && L[1] === "ا") { np.add(`ي${L[0]}و${L[2]}`); np.add(`ي${L[0]}ي${L[2]}`); }
    else np.add(`ي${h}`);
  }
  const pres = new Set(), imp = new Set();
  for (const p0 of np) {
    const s = p0.replace(/^ي/, "");
    for (const p of ["ن", "ت", "ي"]) { pres.add(p + s); pres.add(`${p + s}و`); }
    pres.add(`ت${s}ي`);
    imp.add(s); imp.add(`${s}ي`); imp.add(`${s}و`);
  }
  const asp = new Set(pres);
  for (const p of pres) for (const a of ["ك", "كا", "ت", "تا", "غا", "غ"]) asp.add(a + p);
  const out = new Set();
  for (const c of [...past, ...asp, ...imp]) {
    const xs = [c, `ما${c}ش`, `${c}ش`, `ما${c}`];
    for (const o of OBJ) xs.push(c + o, `ما${c}${o}ش`, `${c}${o}ش`);
    for (const x of xs) for (const p of ["", "و", "ف"]) out.add(p + x);
  }
  return out;
}

/** A small word (particle, pronoun, adverb…): as it is, with و ف ب ل in front; a preposition or pronoun with endings. */
function smallForms(word, pos) {
  const b = mf(word);
  const xs = [b, ...(pos === "prep" || pos === "pron" ? POSS.map((s) => b + s) : [])];
  const out = new Set();
  for (const x of xs) for (const p of ["", "و", "ف", "ب", "ل"]) out.add(p + x);
  return out;
}

/**
 * The spellings a word is counted in. list.tsv "spellings counted": other spellings (w, or w:pos for a dictionary
 * entry of another part of speech, which is only looked up for its meaning), +w for a form that is counted as it is
 * written, np=w for a verb's present, =fixed for a set phrase (count only the spellings given, make no paradigm).
 */
export function spellingsOf(w) {
  const spellings = new Set([w.word]), entries = new Set([w.word]), nonpast = [];
  let fixed = false;
  for (const item of w.spellings) {
    if (item.startsWith("~")) continue; // which dictionary senses to cite (sensesFor)
    else if (item === "=fixed") fixed = true;
    else if (item.startsWith("np=")) nonpast.push(item.slice(3));
    else if (item.startsWith("+")) spellings.add(item.slice(1));
    else {
      const [s, pos = w.pos] = item.split(":");
      entries.add(s);
      if (pos === w.pos || pos === "*") spellings.add(s);
    }
  }
  return { spellings: [...spellings], entries: [...entries], nonpast, fixed };
}

function formsOf(w) {
  const { spellings, nonpast, fixed } = spellingsOf(w);
  const out = new Set();
  for (const s of spellings) {
    const fs = fixed ? smallForms(s, "x") : w.pos === "verb" ? verbForms(s, nonpast) : ["noun", "adj", "num"].includes(w.pos) ? nounForms(s, w.pos) : smallForms(s, w.pos);
    for (const f of fs) out.add(f);
  }
  const drop = new Set(w.leaveOut.map(mf));
  const own = new Set(spellings.map(mf));
  const msa = msaKeys();
  for (const f of [...out]) {
    if (drop.has(f) || drop.has(f.replace(/^[وف]/, ""))) out.delete(f);
    else if (!own.has(f) && msa.has(searchKey(f))) out.delete(f); // someone else's word (مني "from me")
  }
  return out;
}
let msaCache = null;
const msaKeys = () => (msaCache ||= new Set(msaWords().keys()));

// ------------------------------------------------------------------ dictionaries

const page = (word, section) => `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#${section}`;
const DODA = join(SRC, "doda", "dataset-main");
const dodaFolder = (() => {
  const where = new Map();
  if (existsSync(DODA)) for (const sub of ["syntactic categories", "semantic categories", "x-tra"]) {
    for (const f of readdirSync(join(DODA, sub))) where.set(f.replace(/\.csv$/, ""), sub);
  }
  return where;
})();

/** A sense from sources.mjs dictionary("mor") as a source: {dictionary, entry, gloss, url}. */
function sourceOf(e) {
  const m = e.src.match(/^Darija Open Dataset \((.+)\)$/);
  if (m) {
    const sub = dodaFolder.get(m[1]) || "";
    return { dictionary: `Darija Open Dataset (${m[1]})`, entry: e.word, gloss: e.gloss,
      url: `https://github.com/darija-open-dataset/dataset/blob/main/${encodeURI(sub)}/${encodeURIComponent(m[1])}.csv` };
  }
  const d = e.src.match(/descended from Arabic (.+)\)$/);
  if (d) return { dictionary: "Wiktionary (Arabic, its Moroccan descendant)", entry: d[1], gloss: e.gloss, url: page(d[1], "Arabic") };
  if (/Moroccan Arabic/.test(e.src)) return { dictionary: "Wiktionary (Moroccan Arabic)", entry: e.word, gloss: e.gloss, url: page(e.word, "Moroccan_Arabic") };
  return { dictionary: "Wiktionary (Arabic, labelled Moroccan)", entry: e.word, gloss: e.gloss, url: page(e.word, "Arabic") };
}

const STOP = new Set("to of in on at by as or an the is it be and for with that this from someone something one's not are was its into onto out off very".split(" "));
const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/)
  .filter((t) => t.length > 1 && !STOP.has(t)).map((t) => t.replace(/ies$/, "y").replace(/(ing|ed|es|s)$/, "")));

/**
 * The dictionary senses that give the meaning taught (sharing a word with it); all of them when none does. A
 * list.tsv spelling "~regex" names the senses to cite instead. Senses marked vulgar (another word spelled the
 * same) are never cited.
 */
function sensesFor(w, dict) {
  const only = w.spellings.filter((x) => x.startsWith("~")).map((x) => new RegExp(x.slice(1), "i"));
  const all = [], seen = new Set();
  for (const s of spellingsOf(w).entries) {
    for (const e of dict.get(mf(s)) || []) {
      const k = `${e.src}|${e.word}|${e.gloss}`;
      if (!seen.has(k)) { seen.add(k); all.push(e); }
    }
  }
  const want = words(w.meaning);
  const clean = all.filter((e) => !/vulgar|obscene/i.test(e.gloss));
  const fit = only.length ? clean.filter((e) => only.some((r) => r.test(e.gloss)))
    : clean.filter((e) => [...words(e.gloss)].some((t) => want.has(t)));
  const order = (e) => (/Moroccan Arabic\)$/.test(e.src) ? 0 : /^Wiktionary/.test(e.src) ? 1 : 2);
  return (fit.length || only.length ? fit : clean).sort((a, b) => order(a) - order(b)).slice(0, 4).map(sourceOf);
}

/** Wiktionary's Standard Arabic senses spelled like these words: Map(bare -> ["word (pos): gloss"]). */
async function standardArabic(keys) {
  const msa = new Map();
  for await (const line of createInterface({ input: createReadStream(join(SRC, "wikt", "Arabic.jsonl")) })) {
    const m = line.match(/"word": "([^"]+)"/);
    if (!m || !keys.has(bare(m[1]))) continue;
    const j = JSON.parse(line);
    const k = bare(j.word);
    if (["name", "character", "suffix", "prefix", "symbol"].includes(j.pos)) continue;
    for (const s of j.senses || []) {
      const gloss = (s.raw_glosses || s.glosses || []).join("; ");
      if (!gloss || /inflection of|form of|plural of|feminine of|verbal noun of|participle of|romanization/.test(gloss)) continue;
      if ([gloss, ...(s.tags || [])].some((t) => LABELLED.test(t))) continue;
      msa.set(k, [...(msa.get(k) || []), `${j.word} (${j.pos}): ${gloss}`]);
    }
  }
  return msa;
}

// ------------------------------------------------------------------ the list

async function main() {
  const [listPath, outDir = HERE] = process.argv.slice(2);
  const list = readList(listPath || join(HERE, "list.tsv"));
  const [dodaText, ytText] = TEXTS.mor;
  TEXTS.mor = [dodaText];
  const doda = counts("mor");
  TEXTS.mor = [ytText];
  const yt = counts("mor");
  TEXTS.mor = [dodaText, ytText];
  const dict = await dictionary("mor");
  const msa = await standardArabic(new Set(list.map((w) => bare(w.word))));

  const forms = list.map(formsOf);
  const owners = new Map();
  for (const fs of forms) for (const f of fs) owners.set(f, (owners.get(f) || 0) + 1);
  const counted = list.map((w, i) => {
    let d = 0, y = 0;
    const found = [];
    for (const f of forms[i]) {
      const share = 1 / owners.get(f);
      const c = ((doda.n.get(f) || 0) + (yt.n.get(f) || 0)) * share;
      d += (doda.n.get(f) || 0) * share; y += (yt.n.get(f) || 0) * share;
      if (c) found.push([f, c]);
    }
    const src = sensesFor(w, dict);
    if (!src.length) throw new Error(`${w.word}: no dictionary entry (list.tsv spellings)`);
    const perMillion = ((d / doda.total) * 1e6 + (y / yt.total) * 1e6) / 2;
    return { ...w, uses: Math.round(d + y), perMillion, forms: found.sort((a, b) => b[1] - a[1]).slice(0, 40).map(([f]) => f), src,
      msa: msa.get(bare(w.word)) || [] };
  }).sort((a, b) => b.perMillion - a.perMillion);

  const rare = counted.filter((w) => w.uses < MIN_USES);
  const kept = counted.filter((w) => w.uses >= MIN_USES).slice(0, MAX_WORDS);
  const out = kept.map((w, i) => {
    const word = { n: i + 1, rank: i + 1, word: w.word, pos: w.pos, meaning: w.meaning };
    if (w.note) word.note = w.note;
    Object.assign(word, { sentence: w.sentence, translation: w.translation });
    if (w.form) word.form = w.form;
    return { ...word, uses: w.uses, perMillion: Number(w.perMillion.toFixed(1)), forms: w.forms, src: w.src, msa: w.msa };
  });

  const total = doda.total + yt.total;
  const course = {
    lang: "ar-mor",
    title: "Moroccan basics",
    variety: "Moroccan Arabic (Darija), as spoken in Casablanca and Rabat",
    about: `The most common words of Moroccan Arabic (Darija) that are not Standard Arabic: counted in ${Math.round(total / 1000)},000 words of Darija (the Darija Open Dataset's sentences and the subtitles of Moroccan YouTube videos), most common first, 50 to a unit. It builds on the Arabic basics course: words you already know from Standard Arabic, even said a little differently (جا for جاء, هاد for هذا), are left out, and the grammar course teaches the patterns. Each word has a dictionary entry for its meaning (tools/course/ar-mor/EVIDENCE.md) and one short everyday sentence, written without vowel marks as Darija usually is, with its English translation; ⟦ ⟧ marks the part that translates the word. A note under a word says how it differs from a Standard Arabic word that looks the same. No recorded audio: no voice reads Darija well enough yet.`,
    planned: out.length,
    audio: false,
    words: out,
  };
  writeFileSync(join(outDir, "words.json"), `${JSON.stringify(course, null, 1)}\n`);
  writeFileSync(join(outDir, "EVIDENCE.md"), evidenceMd(course, doda.total, yt.total));
  for (const w of rare) console.log(`left out, used only ${w.uses} times: ${w.word}`);
  if (counted.length - rare.length > MAX_WORDS) console.log(`left out, after the first ${MAX_WORDS}: ${counted.filter((w) => w.uses >= MIN_USES).slice(MAX_WORDS).map((w) => w.word).join(" ")}`);
  console.log(`${out.length} words -> ${join(outDir, "words.json")} and EVIDENCE.md (${total} words of text)`);
}

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ");

function evidenceMd(course, dodaTotal, ytTotal) {
  const lines = [
    "# Moroccan basics: the evidence for every word",
    "",
    "Made by `tools/course/ar-mor/make.mjs` from `list.tsv`; the method is in `README.md`. For each word:",
    "",
    `- **Uses**: how often it is used, per million words, in real Darija: the mean of its rate in the Darija Open Dataset's sentences (${dodaTotal} words) and in the subtitles of 248 Moroccan YouTube videos (${ytTotal} words), with the number of times it is used in both. The forms counted are listed.`,
    "- **Dictionary**: what a published dictionary says it means (Wiktionary's Moroccan Arabic entry, or the Darija Open Dataset's word lists, linked). The meaning taught is one of these senses.",
    "- **Standard Arabic**: what Wiktionary's Standard Arabic entry spelled the same says, if there is one. It never gives the meaning taught (that would make it a Standard Arabic word, which the course leaves out); the note in the app says how they differ.",
    "- Real sentences that use each word are in `evidence.json` (made by `tools/course/dialect/evidence.mjs mor`).",
    "",
  ];
  for (const w of course.words) {
    lines.push(`## ${w.n}. ${w.word} (${w.pos}): ${w.meaning}`, "");
    lines.push(`- Uses: ${w.perMillion} per million (${w.uses} times). Forms counted: ${w.forms.slice(0, 20).join(" ")}`);
    for (const s of w.src) lines.push(`- Dictionary: [${s.dictionary.replace(/^Wiktionary /, "Wiktionary, ")}, ${s.entry}](${s.url}): “${esc(s.gloss)}”`);
    lines.push(`- Standard Arabic: ${w.msa.length ? w.msa.slice(0, 4).map((m) => `“${esc(m)}”`).join("; ") : "Wiktionary has no Standard Arabic entry spelled this way."}`);
    if (w.note) lines.push(`- Note in the app: ${w.note}`);
    lines.push(`- Sentence: ${w.sentence.replace(/[⟦⟧]/g, "")}: ${w.translation.replace(/[⟦⟧]/g, "")}`, "");
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
