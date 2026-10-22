// Build the Korean word table, docs/lexicon/ko-words.json.gz: the dictionary words that web/js/lexicon/korean.js
// takes Korean words back to (먹었어요 -> 먹다, 학교에서 -> 학교), commonest first.
//
//     node tools/build_korean_words.mjs <kaikki Korean .jsonl.gz> <FrequencyWords ko_full.txt> [<counts.tsv to write>]
//
//   1. The words: every Korean entry of the English Wiktionary, as extracted by Wiktextract (kaikki.org,
//      https://kaikki.org/dictionary/Korean/; Wiktionary's text, CC BY-SA 4.0), that is one word of Hangul:
//      nouns, pronouns, numbers and names (n: they take particles), adverbs, determiners, conjunctions and
//      interjections (w: never taken apart, so 그래서 stays "so"), verbs and adjectives (v). Entries that are
//      only an inflected form of another (해요, 가요 "goes", 내가, 건) are left out: the rules find those.
//      For each verb and adjective, the stems its endings go on, from Wiktionary's conjugation table: the
//      -아/-어 form ("infinitive": 먹어, 들어, 더워, 몰라, 해) and the stem before 으-endings (from the
//      "sequential" form: 먹으니 -> 먹으, 사니 -> 사); without a table they are made by the regular rules.
//   2. How common each one is: the words of Korean film and TV subtitles (OpenSubtitles 2018, counted by
//      Hermit Dave's FrequencyWords, https://github.com/hermitdave/FrequencyWords, CC BY-SA 4.0), each read
//      with korean.js and its count given to the word it is a form of. The first round counts only forms
//      that can be read one way; then, three times over, every form goes to its likeliest word given the
//      counts so far. Common nouns Wiktionary lacks are added when the subtitles show them with at least
//      two different case particles (남자친구가, 남자친구를), and verbs made from a noun + 하다/되다 that it
//      lacks (운동하다) when their forms are common.
//   3. The table: {format: 1, kind: "ko", lemmas: [commonest first], pos: one letter (n/w/b/v) per lemma,
//      preds: {verb or adjective: "A,A|U,U"}}. Written with its entry in docs/lexicon/index.json.
//      The counts (lemma <tab> count) can also be written, for tools/make_wordlists.py (ko=...).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "lexicon");
const { KoreanWords, koreanReadings } = await import(pathToFileURL(path.join(ROOT, "web", "js", "lexicon", "korean.js")).href);

const [kaikkiPath, freqPath, countsPath] = process.argv.slice(2);
if (!kaikkiPath || !freqPath) {
  console.error("usage: node tools/build_korean_words.mjs <kaikki Korean .jsonl.gz> <ko_full.txt> [counts.tsv]");
  process.exit(2);
}

const ONE_WORD = /^[가-힣]+$/;
const NOMINAL = new Set(["noun", "pron", "num", "counter", "name", "particle", "postp", "contraction"]);
const WHOLE = new Set(["adv", "det", "intj", "conj", "phrase"]);
const PRED = new Set(["verb", "adj"]);
// "X-marked form of", "accusative of", "determiner of", "allomorph of": an inflected form, not a word of its own.
// ("alternative form of", "contraction of", "short for" are words of their own: 거 for 것, 좀 for 조금.)
const INFLECTED = /\b(?:marked|accusative|nominative|genitive|dative|instrumental|locative|topic|determiner|determinative|infinitive|conjunctive|sequential|polite|plain|formal|informal|past|present|future|indicative|interrogative|imperative|hortative|honorific|allomorph|inflection|plural)\b[^;]*\bof\b/i;
const OWN_WORD = /alternative|contraction|short for|abbreviation|spelling|dialect|synonym|clipping|variant|form of 거기|Gyeongsang|Jeolla/i;

// ---------- Hangul ----------
const S = 0xac00;
const parts = (ch) => { const c = ch.charCodeAt(0) - S; return [Math.floor(c / 588), Math.floor((c % 588) / 28), c % 28]; };
const make = (l, v, t = 0) => String.fromCharCode(S + l * 588 + v * 28 + t);
const V = { a: 0, ae: 1, ya: 2, eo: 4, e: 5, yeo: 6, o: 8, wa: 9, oe: 11, u: 13, wo: 14, wi: 16, eu: 18, ui: 19, i: 20 };

/** The regular stems of a verb or adjective Wiktionary gives no table for: [A forms, U forms]. */
function regularStems(stem) {
  const head = stem.slice(0, -1);
  const [l, v, t] = parts(stem.slice(-1));
  const bright = (vv) => vv === V.a || vv === V.o || vv === V.ya;
  if (t) { // a consonant stem: 먹 -> 먹어, 먹으; 잡 -> 잡아, 잡으; 살 -> 살아, 사
    return [[stem + (bright(v) ? "아" : "어")], [t === 8 ? head + make(l, v) : `${stem}으`]];
  }
  if (stem.endsWith("하")) return [[`${head}해`, `${head}하여`], [stem]];
  const A = [];
  if ([V.a, V.eo, V.ae, V.e, V.yeo].includes(v)) A.push(stem);                       // 가, 서, 내, 세, 켜
  else if (v === V.o) A.push(head + make(l, V.wa), `${stem}아`);                     // 보 -> 봐, 보아
  else if (v === V.u) A.push(head + make(l, V.wo), `${stem}어`);                     // 주 -> 줘, 주어
  else if (v === V.i) A.push(head + make(l, V.yeo), `${stem}어`);                    // 마시 -> 마셔, 마시어
  else if (v === V.oe) A.push(head + make(l, 10), `${stem}어`);                      // 되 -> 돼, 되어
  else if (v === V.eu) {
    const prev = head ? parts(head.slice(-1)) : null;
    if (l === 5 && prev && !prev[2]) {                                               // 르: 모르 -> 몰라, 부르 -> 불러
      A.push(head.slice(0, -1) + make(prev[0], prev[1], 8) + (bright(prev[1]) ? "라" : "러"));
    } else A.push(head + make(l, prev && bright(prev[1]) ? V.a : V.eo));            // 바쁘 -> 바빠, 쓰 -> 써
  } else A.push(`${stem}어`);                                                         // 쉬 -> 쉬어, 띄 -> 띄어
  return [A, [stem]];
}

// The copula's negative takes the copula's endings: 아니에요, 아녜요, 아니야, 아냐.
// Spoken forms the tables lack: 하지 마 "don't" (말다), 바래 "I hope" (바라다, said and written so though the
// dictionary has 바라), 되요 (a very common misspelling of 돼요).
const EXTRA_A = { 아니다: ["아니에", "아녜", "아니야", "아냐"], 되다: ["되"], 말다: ["마"], 바라다: ["바래"] };
// Rare verbs whose forms are nearly always other words: 글다's stems 글/그 made 그니까 and 금 "gold" its forms.
const SKIP_PREDS = new Set(["글다"]);

// ---------- 1. the words ----------
const words = new Map(); // word -> {kind, A: Set, U: Set, order}
let order = 0;
const lines = readline.createInterface({ input: fs.createReadStream(kaikkiPath).pipe(zlib.createGunzip()), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line) continue;
  const e = JSON.parse(line);
  const w = e.word;
  if (!w || !ONE_WORD.test(w) || e.lang_code !== "ko") continue;
  const pos = e.pos;
  if (!NOMINAL.has(pos) && !WHOLE.has(pos) && !PRED.has(pos)) continue;
  const senses = (e.senses || []).filter((s) => (s.glosses || []).length);
  if (!senses.length) continue;
  const formOnly = senses.every((s) => (s.form_of || s.alt_of) && INFLECTED.test(s.glosses[0]) && !OWN_WORD.test(s.glosses[0]));
  const forms = e.forms || [];
  const table = forms.some((f) => f.source === "conjugation");
  if (formOnly && !table) continue;
  const kind = PRED.has(pos) ? "v" : WHOLE.has(pos) ? "w" : "n";
  if (kind === "v" && (!w.endsWith("다") || SKIP_PREDS.has(w))) continue;
  if (pos === "name" && w.length === 1) continue; // surnames (김, 이, 박) are not what a lone syllable means
  const rec = words.get(w) || { A: new Set(), U: new Set(), order: order++, name: pos === "name" };
  if (pos !== "name") rec.name = false;
  if (kind === "v") {
    rec.pred = true;
    const inf = forms.filter((f) => (f.tags || []).includes("infinitive")).map((f) => f.form).filter((f) => ONE_WORD.test(f));
    const seq = forms.filter((f) => (f.tags || []).includes("sequential")).map((f) => f.form).filter((f) => ONE_WORD.test(f) && f.endsWith("니"));
    if (inf.length && seq.length) {
      // (a stem ending in ㅣ: the -이어 form, rarer than the -여 one, is set aside for now; it is kept
      // below unless it is another verb's own form: 지다 is 져, and 지어 is 짓다's)
      const stem = w.slice(0, -1);
      const last = parts(stem.slice(-1));
      const short = last[1] === V.i && !last[2] && inf.includes(stem.slice(0, -1) + make(last[0], V.yeo));
      for (const a of inf) {
        if (short && a === `${stem}어`) (rec.longA ||= new Set()).add(a);
        else rec.A.add(a);
      }
      for (const s of seq) rec.U.add(s.slice(0, -1));
    } else {
      const [A, U] = regularStems(w.slice(0, -1));
      for (const a of A) rec.A.add(a);
      for (const u of U) rec.U.add(u);
    }
    for (const a of EXTRA_A[w] || []) rec.A.add(a);
  } else if (kind === "w") rec.hasW = true;
  else rec.hasN = true;
  words.set(w, rec);
}
// The -이어 forms set aside above (내리어, as in older writing's 내리었다) are kept unless another verb has
// that form as its own (지어: 짓다's, not 지다's).
const ownA = new Set();
for (const r of words.values()) for (const a of r.A) ownA.add(a);
for (const r of words.values()) for (const a of r.longA || []) if (!ownA.has(a)) r.A.add(a);
console.log(`Wiktionary: ${words.size} words (${[...words.values()].filter((r) => r.pred).length} verbs and adjectives)`);

// n: a noun, pronoun, number ...; w: an adverb, determiner, conjunction or interjection; b: both (지금 "now",
// 진짜 "real; really"); v: only a verb or adjective. A word both a verb/adjective and something else (보다
// "to see", "more than") is the other when written whole; its forms are the verb's.
const posOf = (r) => (r.hasW && r.hasN ? "b" : r.hasW ? "w" : r.hasN ? "n" : r.pred ? "v" : "n");

function tableFrom(list) {
  const lemmas = list.map(([w]) => w);
  const pos = list.map(([, r]) => posOf(r)).join("");
  const preds = {};
  for (const [w, r] of list) if (r.pred) preds[w] = `${[...r.A].join(",")}|${[...r.U].join(",")}`;
  return { format: 1, kind: "ko", name: "ko", lang: "ko", title: "Korean word list", lemmas, pos, preds };
}

// ---------- 2. how common ----------
const freq = [];
for (const line of fs.readFileSync(freqPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^(\S+) (\d+)$/);
  if (m && /[가-힣]/.test(m[1])) freq.push([m[1], Number(m[2])]);
}
console.log(`subtitles: ${freq.length} different Korean words, ${freq.reduce((n, [, c]) => n + c, 0)} in all`);

let ranked = [...words.entries()].sort((a, b) => a[1].order - b[1].order);
let counts = new Map();
const made = new Map(); // noun + 하다 verbs the table lacks -> count
for (let round = 0; round < 4; round++) {
  const table = new KoreanWords(tableFrom(ranked));
  table.headStart = 1; // (counted without the head start the app gives a whole word: see korean.js)
  const next = new Map();
  made.clear();
  for (const [form, n] of freq) {
    const readings = koreanReadings(form, table).filter((r) => table.has(r.lemma) || r.made);
    if (!readings.length) continue;
    if (round === 0 && new Set(readings.map((r) => r.lemma)).size > 1) continue; // first round: one reading only
    const best = readings[0];
    if (best.made) { made.set(best.lemma, (made.get(best.lemma) || 0) + n); continue; }
    next.set(best.lemma, (next.get(best.lemma) || 0) + n);
  }
  counts = next;
  ranked = [...words.entries()].sort((a, b) => (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0) || a[1].order - b[1].order);
  const covered = freq.reduce((n, [form, c]) => n + (koreanReadings(form, table).some((r) => table.has(r.lemma)) ? c : 0), 0);
  console.log(`round ${round + 1}: ${counts.size} words counted; ${(100 * covered / freq.reduce((n, [, c]) => n + c, 0)).toFixed(1)}% of the subtitles' words read`);
  if (round === 0) {
    // Common nouns Wiktionary lacks: seen bare, and with two or more different case particles.
    const have = new Map(freq);
    const CASE = ["이", "가", "을", "를", "의", "에", "에서", "에게", "한테", "로", "으로", "와", "과", "랑", "이랑", "처럼", "까지", "부터", "만"];
    let added = 0;
    for (const [form, n] of freq) {
      if (n < 30 || form.length < 2 || !ONE_WORD.test(form) || words.has(form)) continue;
      if (koreanReadings(form, table).some((r) => table.has(r.lemma))) continue;
      const seenWith = CASE.filter((p) => (have.get(form + p) || 0) >= 3);
      if (seenWith.length < 2) continue;
      words.set(form, { A: new Set(), U: new Set(), order: order++, hasN: true, found: true });
      added++;
    }
    console.log(`  added ${added} common nouns from the subtitles`);
    ranked = [...words.entries()].sort((a, b) => (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0) || a[1].order - b[1].order);
  }
}
// Noun + 하다/되다 verbs the table lacks, when their forms are common: added with the light verb's stems.
let light = 0;
const lightStems = (lemma) => {
  for (const base of ["하다", "되다", "시키다", "받다", "드리다", "당하다", "스럽다", "롭다", "답다"]) {
    const r = words.get(base);
    if (lemma.endsWith(base) && r) {
      const noun = lemma.slice(0, -base.length);
      return { A: new Set([...r.A].map((a) => noun + a)), U: new Set([...r.U].map((u) => noun + u)) };
    }
  }
  return null;
};
for (const [lemma, n] of made) {
  if (n < 20 || words.has(lemma)) continue;
  const st = lightStems(lemma);
  if (!st) continue;
  words.set(lemma, { pred: true, ...st, order: order++, found: true });
  counts.set(lemma, n);
  light++;
}
console.log(`  added ${light} noun + 하다/되다 verbs from the subtitles`);

// Names nobody says are left out (Wiktionary has thousands of places and people).
ranked = [...words.entries()]
  .filter(([w, r]) => !r.name || (counts.get(w) || 0) >= 5)
  .sort((a, b) => (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0) || a[1].order - b[1].order);

// ---------- 3. the table ----------
const data = tableFrom(ranked);
const raw = Buffer.from(JSON.stringify(data), "utf8");
const packed = zlib.gzipSync(raw, { level: 9 });
const name = "ko-words.json.gz";
fs.writeFileSync(path.join(OUT, name), packed);
const indexPath = path.join(OUT, "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
index.files.ko = {
  file: name, bytes: packed.length, sha256: crypto.createHash("sha256").update(packed).digest("hex"),
  title: "Korean word list", db: "English Wiktionary (Wiktextract) + OpenSubtitles counts (FrequencyWords)", license: "CC-BY-SA-4.0",
  forms: 0, lexemes: data.lemmas.length,
};
index.files = Object.fromEntries(Object.entries(index.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`);
console.log(`wrote ${name}: ${data.lemmas.length} words, ${Object.keys(data.preds).length} verbs and adjectives, ${(packed.length / 1e3).toFixed(0)} KB`);
console.log(`commonest: ${data.lemmas.slice(0, 60).join(" ")}`);
if (countsPath) {
  fs.writeFileSync(countsPath, ranked.filter(([w]) => counts.get(w)).map(([w, r]) => `${w}\t${counts.get(w)}\t${posOf(r)}`).join("\n") + "\n");
  console.log(`wrote the counts to ${countsPath}`);
}
