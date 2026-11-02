// The Arabic dialect courses' raw material: the texts their words are counted in, and the dictionaries
// that say what each word means. Nothing here is published; it only feeds candidates.mjs and evidence.mjs.
//
//   node tools/course/dialect/sources.mjs        downloads what is missing into tools/course/build/dialect/
//
// Texts (counted, never copied into the app; a few short sentences are quoted in evidence.json as proof of use):
//   lev  Shami corpus, Syrian/Lebanese/Jordanian/Palestinian (Abu Kwaik et al., LREC 2018; Apache-2.0),
//        github.com/GU-CLASP/shami-corpus; Jordanian readers' comments of AOC (below); film subtitles
//        translated into North Levantine (UFAL) and Levanti's real sentences (both in FILES)
//   egy  Arabic Online Commentary, readers' comments on Youm7 judged dialectal (Zaidan & Callison-Burch,
//        ACL 2011), aclanthology.org/P11-2007
//   glf  the same, comments on Al-Riyadh (Saudi Arabia)
//   mor  Darija Open Dataset sentences (CC BY-NC 4.0), github.com/darija-open-dataset/dataset; subtitles of
//        248 Moroccan YouTube videos (Bouaghad & Bourbouh, CC BY 4.0; in FILES)
// Dictionaries:
//   Wiktionary (CC BY-SA 4.0) as extracted by kaikki.org: its Egyptian, North and South Levantine, Gulf,
//   Hijazi and Moroccan Arabic entries, and the senses of its Arabic entries labelled with a dialect or
//   country; CAMeL Tools' Egyptian lexicon glosses (docs/lexicon/ar-camel-meanings.json.gz, GPL-2.0);
//   the Darija Open Dataset's word lists (CC BY-NC 4.0).
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { arabicCore, Dictionary, matchForm } from "../../../web/js/lexicon/arabic.js";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..", "..", "..");
export const SRC = join(ROOT, "tools", "course", "build", "dialect");
export const DIALECTS = ["lev", "egy", "glf", "mor"];

const KAIKKI = (lang) => `https://kaikki.org/dictionary/${encodeURIComponent(lang)}/kaikki.org-dictionary-${lang.replace(/ /g, "")}.jsonl`;
const FILES = {
  "shami/Lebanees.txt": "https://raw.githubusercontent.com/GU-CLASP/shami-corpus/master/Data/Lebanees.txt",
  "shami/Palestinian.txt": "https://raw.githubusercontent.com/GU-CLASP/shami-corpus/master/Data/Palestinian.txt",
  "shami/jordinian.txt": "https://raw.githubusercontent.com/GU-CLASP/shami-corpus/master/Data/jordinian.txt",
  "shami/syrian.txt": "https://raw.githubusercontent.com/GU-CLASP/shami-corpus/master/Data/syrian.txt",
  "aoc/P11-2007.Datasets.tar.bz2": "https://aclanthology.org/attachments/P11-2007.Datasets.tar.bz2", // unpack into aoc/
  "doda/dataset.zip": "https://codeload.github.com/darija-open-dataset/dataset/zip/refs/heads/main", // unzip into doda/
  "wikt/Arabic.jsonl": KAIKKI("Arabic"), // 870 MB
  "wikt/EgyptianArabic.jsonl": KAIKKI("Egyptian Arabic"),
  "wikt/NorthLevantineArabic.jsonl": KAIKKI("North Levantine Arabic"),
  "wikt/SouthLevantineArabic.jsonl": KAIKKI("South Levantine Arabic"),
  "wikt/GulfArabic.jsonl": KAIKKI("Gulf Arabic"),
  "wikt/HijaziArabic.jsonl": KAIKKI("Hijazi Arabic"),
  "wikt/MoroccanArabic.jsonl": KAIKKI("Moroccan Arabic"),
  // More Levantine (added by the Levantine course): film and TV subtitles that native speakers translated
  // into North Levantine, with the English they came from, line by line (UFAL Parallel Corpus of North
  // Levantine 1.0, Sellat et al. 2023, CC BY-NC-SA 4.0, hdl.handle.net/11234/1-5033; 739,000 words), and
  // Levanti (Mor-Lan 2024, CC BY-NC 4.0, huggingface.co/datasets/guymorlan/levanti), of which only the 42,000
  // sentences "found in the wild" are kept (its other 466,000 were written by an AI model): levantiReal().
  "ufal/apc.txt": "https://huggingface.co/datasets/FrancophonIA/UFAL_Parallel_Corpus_of_North_Levantine_1.0/resolve/main/apc.txt",
  "ufal/eng.txt": "https://huggingface.co/datasets/FrancophonIA/UFAL_Parallel_Corpus_of_North_Levantine_1.0/resolve/main/eng.txt",
  "levanti/levanti_v1.csv": "https://huggingface.co/datasets/guymorlan/levanti/resolve/main/levanti_v1.csv", // 210 MB
  // More Moroccan (added by the Moroccan course): the subtitles of 248 videos of popular Moroccan YouTube
  // channels, in Arabic letters (Bouaghad & Bourbouh, CC BY 4.0; 614,000 words; machine-made captions of
  // real speech), huggingface.co/datasets/bourbouh/moroccan-darija-youtube-subtitles: moroccanSubtitles().
  "ytsubs/moroccan_darija_subtitles.csv": "https://huggingface.co/datasets/bourbouh/moroccan-darija-youtube-subtitles/resolve/main/moroccan_darija_subtitles.csv",
};

export const TEXTS = {
  lev: ["shami/Lebanees.txt", "shami/Palestinian.txt", "shami/jordinian.txt", "shami/syrian.txt", "aoc/dialect_alghad-segs.txt.norm",
    "ufal/apc.txt", "levanti/real-ar.txt"],
  egy: ["aoc/dialect_youm7-segs.txt.norm"],
  glf: ["aoc/dialect_alriyadh-segs.txt.norm"],
  mor: ["doda/dataset-main/sentences/sentences.csv", "ytsubs/mor-youtube.txt"],
};

// Which Wiktionary entries speak for which dialect: whole dictionaries of the dialect, and the senses of
// the Arabic dictionary labelled with one of these words ("(Gulf, Najdi) ...", tags "Egyptian-Arabic").
const DICTS = {
  lev: { files: ["NorthLevantineArabic", "SouthLevantineArabic"], label: /levant|lebanon|lebanese|syria|palestin|jordan/i },
  egy: { files: ["EgyptianArabic"], label: /egypt/i },
  glf: { files: ["GulfArabic", "HijaziArabic"], label: /gulf|saudi|najd|kuwait|bahrain|qatar|emirat|\buae\b|hijaz|hejaz|peninsul/i },
  mor: { files: ["MoroccanArabic"], label: /morocc|maghreb|maghrib|north africa/i },
};

/** The sentences of a dialect's texts, one string each. */
export function sentences(d) {
  const out = [];
  for (const f of TEXTS[d]) {
    const text = readFileSync(join(SRC, f), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (d === "mor" && f.startsWith("doda/")) {
        // darija (Latin letters), eng, darija_ar: the Arabic-letter column is the last.
        const m = line.match(/,"?([^,"]*[؀-ۿ][^"]*)"?\s*$/);
        if (m) out.push(m[1].trim());
      } else if (line.trim()) out.push(line.trim());
    }
  }
  return out;
}

/** A word as counted: its matching form (no vowel marks, one alef/ya/ta marbuta), runs of 3+ letters cut to one. */
export const countForm = (token) => {
  const c = arabicCore(token);
  return c ? matchForm(c).replace(/(.)\1\1+/g, "$1") : "";
};

/** {form: count} and the number of words, for a dialect's texts. */
export function counts(d) {
  const n = new Map();
  let total = 0;
  for (const s of sentences(d)) for (const tok of s.split(/\s+/)) {
    const f = countForm(tok);
    if (!f) continue;
    total++;
    n.set(f, (n.get(f) || 0) + 1);
  }
  return { n, total };
}

export const loadLexicon = (name) => new Dictionary(JSON.parse(gunzipSync(readFileSync(join(ROOT, "docs", "lexicon", `ar-${name}.json.gz`)))));

/** The MSA basics course's words, in matching form. */
export function msaBasics() {
  return JSON.parse(readFileSync(join(ROOT, "tools", "course", "ar", "words.json"), "utf8")).words.map((w) => ({ n: w.n, word: w.word, key: matchForm(w.word) }));
}

/**
 * The dictionaries' word -> meanings for dialect `d`: Map(matching form -> [{src, word, pos, gloss}]).
 * Slow the first time (the Arabic Wiktionary is big); kept in build/dialect/dict-<d>.json after that.
 */
export async function dictionary(d) {
  const cache = join(SRC, `dict-${d}.json`);
  if (existsSync(cache)) return new Map(Object.entries(JSON.parse(readFileSync(cache, "utf8"))));
  const out = new Map();
  const add = (form, e) => {
    const k = matchForm(String(form || "").replace(/[^؀-ۿ ]/g, "").trim());
    if (!k || !/[؀-ۿ]/.test(k)) return;
    const list = out.get(k) || [];
    if (!list.some((x) => x.src === e.src && x.gloss === e.gloss)) list.push(e);
    out.set(k, list);
  };
  const entryForms = (j) => [j.word, ...(j.forms || []).filter((f) => /[؀-ۿ]/.test(f.form || "") && !(f.tags || []).includes("romanization")).map((f) => f.form)];
  const read = async (file, keep) => {
    const rl = createInterface({ input: createReadStream(join(SRC, "wikt", `${file}.jsonl`)) });
    for await (const line of rl) {
      if (file === "Arabic" && !DICTS[d].label.test(line)) continue; // most entries: not this dialect at all
      const j = JSON.parse(line);
      // An Arabic entry's dialect descendants (Gulf ويه from وجه): the dialect word comes from this
      // Standard Arabic word, so it is that word in the dialect's mouth (rule 2 or 3 of the README),
      // unless its meaning moved. Kept as `from` evidence.
      if (file === "Arabic") {
        const first = ((j.senses || []).find((s) => (s.glosses || []).length) || {}).glosses || [];
        for (const x of j.descendants || []) {
          if (!DICTS[d].label.test(x.lang || "") || !/[؀-ۿ]/.test(x.word || "")) continue;
          add(x.word, { src: `Wiktionary (${x.lang}, descended from Arabic ${j.word})`, word: x.word, pos: j.pos, gloss: `from Arabic ${j.word}: ${first.join("; ")}`, from: j.word });
        }
      }
      for (const s of j.senses || []) {
        const raw = (s.raw_glosses || s.glosses || []).join("; ");
        if (!raw || !keep(s, raw)) continue;
        const e = { src: `Wiktionary (${j.lang})`, word: j.word, pos: j.pos, gloss: raw };
        for (const f of entryForms(j)) add(f, e);
      }
    }
  };
  for (const f of DICTS[d].files) await read(f, () => true);
  await read("Arabic", (s, raw) => DICTS[d].label.test(raw) || (s.tags || []).some((t) => DICTS[d].label.test(t)));
  if (d === "egy") {
    const m = JSON.parse(gunzipSync(readFileSync(join(ROOT, "docs", "lexicon", "ar-camel-meanings.json.gz"))));
    for (const [form, entries] of Object.entries(m.words)) {
      for (const [lemma, pos, glosses, tag] of entries) {
        if (!/Egyptian/.test(tag || "")) continue;
        add(form, { src: "CAMeL Egyptian lexicon", word: lemma, pos, gloss: glosses.map((g) => g.replace(/ \[ARAMORPH\]$/, "")).join("; ") });
      }
    }
  }
  if (d === "mor") {
    const dir = join(SRC, "doda", "dataset-main");
    // x-tra: its lists of short phrases and verb forms (shorts.csv), small words (utils.csv), slang (weird.csv).
    for (const sub of ["syntactic categories", "semantic categories", "x-tra"]) {
      for (const f of readdirSync(join(dir, sub)).filter((x) => x.endsWith(".csv"))) {
        const [head, ...rows] = readFileSync(join(dir, sub, f), "utf8").split(/\r?\n/);
        const cols = head.split(",");
        const ar = cols.indexOf("darija_ar"), en = cols.findIndex((c) => /^eng/.test(c));
        if (ar < 0 || en < 0) continue;
        for (const r of rows) {
          const c = r.split(",");
          if (c[ar] && c[en]) add(c[ar], { src: `Darija Open Dataset (${f.replace(/\.csv$/, "")})`, word: c[ar], pos: "", gloss: c[en] });
        }
      }
    }
  }
  writeFileSync(cache, JSON.stringify(Object.fromEntries(out)));
  return out;
}

async function download() {
  for (const [name, url] of Object.entries(FILES)) {
    const path = join(SRC, name);
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    console.log(`downloading ${name}`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    writeFileSync(path, Buffer.from(await r.arrayBuffer()));
  }
  levantiReal();
  moroccanSubtitles();
  console.log("Unpack aoc/P11-2007.Datasets.tar.bz2 into aoc/ and doda/dataset.zip into doda/ if not done yet.");
}

/** One CSV record after another (quoted fields may hold commas, quotes and line breaks). */
function* csvRows(text) {
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      yield row; row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); yield row; }
}

/**
 * Levanti's real sentences ("synthesized" False), Arabic and English line by line:
 * levanti/real-ar.txt, real-en.txt and real-dialect.txt (Syrian, Lebanese, Palestinian, Jordanian, Levantine).
 */
export function levantiReal() {
  const out = join(SRC, "levanti", "real-ar.txt");
  const csv = join(SRC, "levanti", "levanti_v1.csv");
  if (existsSync(out) || !existsSync(csv)) return;
  const rows = csvRows(readFileSync(csv, "utf8").replace(/^﻿/, ""));
  const head = rows.next().value;
  const col = (name) => head.indexOf(name);
  const [ar, en, syn, dia] = [col("arabic"), col("english"), col("synthesized"), col("dialect")];
  const keep = { ar: [], en: [], dialect: [] };
  const one = (s) => String(s || "").replace(/\s+/g, " ").trim();
  for (const r of rows) {
    if (r.length < head.length || !/^(false|0)$/i.test(one(r[syn]))) continue;
    keep.ar.push(one(r[ar])); keep.en.push(one(r[en])); keep.dialect.push(one(r[dia]));
  }
  for (const [k, lines] of Object.entries(keep)) writeFileSync(join(SRC, "levanti", `real-${k}.txt`), `${lines.join("\n")}\n`);
  console.log(`levanti: ${keep.ar.length} real sentences kept`);
}

/** The Moroccan YouTube subtitles, one caption line or sentence per line: ytsubs/mor-youtube.txt. */
export function moroccanSubtitles() {
  const out = join(SRC, "ytsubs", "mor-youtube.txt");
  const csv = join(SRC, "ytsubs", "moroccan_darija_subtitles.csv");
  if (existsSync(out) || !existsSync(csv)) return;
  const rows = csvRows(readFileSync(csv, "utf8").replace(/^﻿/, ""));
  const col = rows.next().value.indexOf("transcript");
  const lines = [];
  for (const r of rows) {
    for (const seg of String(r[col] || "").split(/\n|(?<=[.!?؟])\s+/)) if (/[؀-ۿ]/.test(seg)) lines.push(seg.trim());
  }
  writeFileSync(out, `${lines.join("\n")}\n`);
  console.log(`moroccan subtitles: ${lines.length} lines`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await download();
