// Turn a DLI language's ICPT topic files into a deck (tools/dli/ICPT.md).
//
//   node tools/dli/icpt_deck.mjs <lang>            reads dli-content/<lang>/<lang>-icpt/src/<topic>.json,
//                                                  writes deck.json and sentences/ beside src/
//   (--content <folder>: another content folder; default ../dli-content beside the repository)
//
// The output is in the basic decks' format (tools/dli/DECKS.md), so check_sentences.mjs --deck <lang>-icpt,
// voice_deck.py --deck <lang>-icpt and encrypt.mjs read it like any deck. Run it again after editing a topic file:
// a word keeps its number, a chapter keeps its id.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { candidates, checkEntry, letters } from "./check_sentences.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The topics, in folder order (ICPT.md). Their order and ids never change: a chapter's id comes from its place. */
export const TOPICS = [
  ["politics", "Politics & government"], ["military", "Military & security"], ["economy", "Economy & business"],
  ["crime", "Crime & law"], ["health", "Health & medicine"], ["disasters", "Disasters, accidents & weather"],
  ["science", "Science, technology & environment"], ["society", "Society & education"],
  ["culture", "Culture, religion & media"], ["sports", "Sports"], ["geography", "Geography & travel"],
  ["notices", "Signs, ads & notices"], ["numbers", "Numbers, time & dates"], ["news", "News language"],
];
export const LEVELS = [["1", "Level 1–1+"], ["2", "Level 2"], ["3", "Level 2+/3"]];
const NAMES = { ar: "Arabic", zh: "Chinese", fa: "Farsi", ko: "Korean", es: "Spanish", fr: "French", ru: "Russian" };

/** A chapter's fixed id: level first, then topic (c001 = Politics at Level 1-1+, c015 = Politics at Level 2...). */
export const chapterId = (level, topic) =>
  `c${String(LEVELS.findIndex((l) => l[0] === level) * TOPICS.length + TOPICS.findIndex((t) => t[0] === topic) + 1).padStart(3, "0")}`;

const STOP = new Set(["the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "be", "is", "by", "with", "at", "as",
  "from", "something", "someone", "one", "s", "o", "his", "her", "its", "their", "up", "out", "off"]);
/** The content words of a meaning ("to sign (a treaty); signing" → sign, treaty, signing). */
export function meaningWords(meaning) {
  return new Set(String(meaning || "").toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    // British or American spelling alike: localisation = localization, labour = labor, defence = defense
    .map((w) => w.replace(/is(ation|e|ed|ing)$/, "iz$1").replace(/our$/, "or").replace(/ence$/, "ense").replace(/tre$/, "ter"))
    .map((w) => w.replace(/(ies)$/, "y").replace(/(?<=[a-z]{3})s$/, "")));
}
const SHADDA = "\u0651";
const HARAKA = /[\u064B-\u0652\u0670]/u;
/** The letters a word can be matched by (vowel marks aside). Arabic and Persian also without the article on each
 *  word (الْبِنْيَةُ التَّحْتِيَّةُ = بنية تحتية), and a word ending in tanween kasra with its ي (نَادٍ = نادي, قَاضٍ =
 *  قاضي): the meaning decides the rest. `shadda`: keep the shadda as a letter of its own (صَوْت ≠ صَوَّتَ). */
export function letterKeys(word, lang, { shadda = false } = {}) {
  const out = new Set();
  const lettersOf = (t) => letters(shadda ? String(t).replaceAll(SHADDA, "9") : t, lang);
  for (const c of candidates(word)) {
    out.add(lettersOf(c));
    if (lang !== "ar" && lang !== "fa") continue;
    const parts = c.split(/\s+/u).map((w) => {
      const l = lettersOf(w);
      // (the article doubles a sun letter: التَّحْتِيَّة has a shadda that تَحْتِيَّة hasn't)
      const bare = l.length > 3 ? l.replace(/^ال(.)9?/u, "$1") : l;
      return /\u064D$/u.test(w.trim()) ? [bare, bare + "ي"] : [bare];
    });
    out.add(parts.map((p) => p[0]).join(""));
    out.add(parts.map((p) => p[p.length - 1]).join(""));
  }
  out.delete("");
  return [...out];
}
/** Same word: the same letters (letterKeys) and a meaning in common. When both are vowelled, the same shadda too
 *  (a word written without vowel marks, as some of the basic deck's are, can't say). */
export function sameWord(a, b, lang) {
  const la = letterKeys(a.word, lang);
  const lb = letterKeys(b.word, lang);
  if (!la.some((x) => lb.includes(x))) return false;
  if (HARAKA.test(a.word) && HARAKA.test(b.word)) {
    const sa = letterKeys(a.word, lang, { shadda: true });
    const sb = letterKeys(b.word, lang, { shadda: true });
    if (!sa.some((x) => sb.includes(x))) return false;
    // A verb in the past ends in a fatha, a noun's dictionary form doesn't: طَلَبَ (to ask) ≠ طَلَب (a request).
    const verb = (w) => /^\S+$/u.test(String(w).trim()) && /َ$/u.test(String(w).trim());
    if (lang === "ar" && verb(a.word) !== verb(b.word)) return false;
  }
  const ma = meaningWords(a.meaning);
  return [...meaningWords(b.meaning)].some((w) => ma.has(w));
}
/** May the ICPT word `w` be the basic deck's card `b`? Only when that card says what the news means by it: the
 *  first sense of w is in b's meaning (قَضَى "to sentence" isn't the basic card's "to spend time"), and both are verbs
 *  ("to ...") or neither (دَعْم "subsidies" isn't دعم "to support"). Otherwise the learner gets the ICPT card. */
export function linkable(w, b) {
  const first = String(w.meaning || "").split(/\s*;\s*/u)[0];
  const isVerb = (m) => /^\s*to\s/iu.test(String(m || ""));
  if (isVerb(first) !== isVerb(b.meaning)) return false;
  const mb = meaningWords(b.meaning);
  return [...meaningWords(first)].some((x) => mb.has(x));
}

/** `meaning` with the senses of `more` it doesn't have yet ("website; site" + "position (military); site"). */
export function joinMeanings(meaning, more) {
  const senses = (m) => String(m || "").split(/\s*;\s*/u).map((x) => x.trim()).filter(Boolean);
  const have = senses(meaning);
  const seen = new Set(have.map((x) => [...meaningWords(x)].sort().join(" ")));
  for (const x of senses(more)) {
    const k = [...meaningWords(x)].sort().join(" ");
    if (k && [...meaningWords(x)].every((w) => have.some((h) => meaningWords(h).has(w)))) continue;
    if (!seen.has(k)) { have.push(x); seen.add(k); }
  }
  return have.join("; ");
}

/** Words looked up by their letters: add(w), find(e) -> the same word or undefined. */
function wordIndex(lang) {
  const by = new Map();
  const keys = (w) => letterKeys(w.word, lang);
  return {
    add(w) { for (const k of keys(w)) { if (!by.has(k)) by.set(k, []); by.get(k).push(w); } },
    find(e) { for (const k of keys(e)) { const hit = (by.get(k) || []).find((w) => sameWord(w, e, lang)); if (hit) return hit; } return undefined; },
  };
}

/** Build the deck: { deck, sentences: {chapter id: entries}, report }. `old`: the deck.json written before, if any. */
export function buildDeck(lang, topicFiles, { old = null, basic = null } = {}) {
  const errors = [];
  const report = { merged: [], linked: 0, missing: [] };
  const words = old ? old.words.map((w) => ({ ...w, chapters: [] })) : [];
  const entryOf = new Map(); // n -> the written entry its sentence comes from
  const chapterWords = new Map(); // chapter id -> [n]
  const index = wordIndex(lang);
  words.forEach((w) => index.add(w));
  const find = (e) => index.find(e);
  // Level first, then topic: a word written twice gets its sentence from the first place.
  for (const [level] of LEVELS) {
    for (const [topic] of TOPICS) {
      const file = topicFiles[topic];
      if (!file) continue;
      for (const [i, e] of (file.words || []).entries()) {
        if (String(e.level) !== level) continue;
        const where = `${topic} #${i + 1} (${e.word})`;
        const { level: _l, word, meaning, notes, ...rest } = e;
        if (!String(word || "").trim() || !String(meaning || "").trim()) { errors.push(`${where}: needs word and meaning`); continue; }
        const r = checkEntry(rest, { word }, lang);
        for (const m of r.errors) errors.push(`${where}: ${m}`);
        const id = chapterId(level, topic);
        let w = find(e);
        if (w && w.chapters.length && entryOf.has(w.n)) report.merged.push(`${word} (${topic}) = n${w.n}`);
        if (!w) { w = { n: words.length + 1, word, meaning, notes: notes || "", chapters: [] }; words.push(w); index.add(w); }
        if (!w.chapters.length) { Object.assign(w, { word, meaning, notes: notes || "" }); entryOf.set(w.n, rest); }
        else w.meaning = joinMeanings(w.meaning, meaning); // (a word met in two topics: its senses from both)
        if (!w.chapters.includes(id)) {
          w.chapters.push(id);
          if (!chapterWords.has(id)) chapterWords.set(id, []);
          chapterWords.get(id).push(w.n);
        }
      }
    }
  }
  for (const [topic, file] of Object.entries(topicFiles)) {
    (file.words || []).forEach((e, i) => {
      if (!LEVELS.some((l) => l[0] === String(e.level))) errors.push(`${topic} #${i + 1} (${e.word}): level must be "1", "2" or "3"`);
    });
  }
  for (const [level] of LEVELS) for (const [topic] of TOPICS) if (!topicFiles[topic]) report.missing.push(`${topic}`);
  report.missing = [...new Set(report.missing)];
  // A word the learner may have from the basic deck: the app files that card in the ICPT folder instead.
  const basicIndex = wordIndex(lang);
  for (const b of (basic && basic.words) || []) basicIndex.add(b);
  for (const w of words) {
    delete w.link;
    if (!basic || !w.chapters.length) continue;
    const b = basicIndex.find(w);
    if (b && linkable(w, b)) { w.link = b.n; report.linked++; }
  }
  const chapters = [];
  for (const [level, lname] of LEVELS) {
    for (const [topic, tname] of TOPICS) {
      const id = chapterId(level, topic);
      if (chapterWords.has(id)) chapters.push({ id, title: `${tname} · ${lname}`, words: chapterWords.get(id) });
    }
  }
  const sentences = {};
  for (const ch of chapters) {
    sentences[ch.id] = ch.words.filter((n) => words[n - 1].chapters[0] === ch.id).map((n) => ({ n, ...entryOf.get(n) }));
  }
  const name = NAMES[lang] || lang;
  const deck = {
    deck: 1, id: `${lang}-icpt`, language: lang, title: `DLI ${name} ICPT prep`, short: `DLI ${name} ICPT`,
    made_from: "written for Tamkeen (tools/dli/icpt_deck.mjs, topic files in src/)",
    ...(basic ? { link_deck: basic.id } : {}), chapters, words,
  };
  return { deck, sentences, errors, report };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const content = resolve(opt("--content") || join(root, "..", "dli-content"));
  const [lang] = args;
  if (!lang) { console.error("Usage: node tools/dli/icpt_deck.mjs <lang>"); process.exit(2); }
  const folder = join(content, lang, `${lang}-icpt`);
  const src = join(folder, "src");
  if (!existsSync(src)) { console.error(`No topic files in ${src}.`); process.exit(1); }
  const topicFiles = {};
  for (const f of readdirSync(src).filter((x) => x.endsWith(".json"))) {
    const id = f.replace(/\.json$/, "");
    if (!TOPICS.some((t) => t[0] === id)) { console.error(`Unknown topic file ${f}`); process.exit(1); }
    topicFiles[id] = JSON.parse(readFileSync(join(src, f), "utf8"));
  }
  const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
  const old = read(join(folder, "deck.json"));
  const basic = read(join(content, lang, `${lang}-basic`, "deck.json"));
  const { deck, sentences, errors, report } = buildDeck(lang, topicFiles, { old, basic });
  writeFileSync(join(folder, "deck.json"), JSON.stringify(deck, null, 1) + "\n");
  const out = join(folder, "sentences");
  if (existsSync(out)) rmSync(out, { recursive: true });
  mkdirSync(out);
  for (const [id, list] of Object.entries(sentences)) {
    writeFileSync(join(out, `${id}.json`), `{ "chapter": "${id}", "words": [\n${list.map((e) => JSON.stringify(e)).join(",\n")}\n] }\n`);
  }
  const used = deck.words.filter((w) => w.chapters.length);
  console.log(`${deck.title}: ${deck.chapters.length} chapters, ${used.length} words (${report.linked} linked to ${basic ? basic.id : "no basic deck"}), `
    + `${report.merged.length} written in two topics.`);
  for (const ch of deck.chapters) console.log(`  ${ch.id}  ${String(ch.words.length).padStart(4)}  ${ch.title}`);
  if (report.missing.length) console.log(`Topics not written yet: ${report.missing.join(", ")}`);
  if (errors.length) { console.log(`${errors.length} problem(s):`); errors.slice(0, 60).forEach((e) => console.log(`  ${e}`)); process.exit(1); }
}
