// Phone side of the word dictionaries (Arabic; Spanish, French, Italian word tables; the desktop's is app/lexicon.py): downloaded once,
// when someone learning that language agrees to it, from the same address the desktop uses, and kept
// in the phone's storage. web/js/lexicon/ explains what they are for.

import { kv } from "./store.js";
import { gunzipJson } from "./drive.js";
import { OCR_BYTES, OCR_CORES, ocrNames } from "./scanwords.js";

const BASE_URL = "https://christiangilkey.github.io/tamkeen/lexicon/";
// Standard Arabic first: it is the one tried first. Spanish, French and Italian have one table each;
// Thai's is how each word is said (web/js/lexicon/thai.js).
const LANGUAGES = { ar: ["msa", "egy", "lev", "glf"], es: ["es"], fr: ["fr"], it: ["it"], ru: ["ru"], en: ["en"], tl: ["tl"], ja: ["ja"], zh: ["zh"],
  pt: ["pt"], ca: ["ca"], ceb: ["ceb"], th: ["th"], de: ["de"], fa: ["fa"], hi: ["hi"], ko: ["ko"], la: ["la"] };
// Word meanings for "No AI" (web/js/meanings.js): one file a language, only when that is chosen.
// Arabic and Bisaya have a second file, asked when Wiktionary lacks a word (the CAMeL databases' glosses;
// Wolff's Dictionary of Cebuano Visayan).
const MEANINGS = { ...Object.fromEntries(Object.keys(LANGUAGES).map((l) => [l, [`mean-${l}`]])), ar: ["mean-ar", "mean-arc"],
  ceb: ["mean-ceb", "mean-cebw"] };
// Card helpers with no AI (tools/build_examples.py, as app/lexicon.py EXAMPLES): example sentences with
// pronunciations, one file a language, and the free Mnemonic maker's English keywords.
const EXAMPLES = Object.fromEntries(Object.keys(LANGUAGES).filter((l) => l !== "en").map((l) => [l, [`ex-${l}`]]));
// (and the free Mnemonic maker's keywords in the app languages that have them, as app/lexicon.py OWN_KEYWORDS)
const KEYWORDS = { en: ["kw-en"], ...Object.fromEntries(["es", "fr", "de", "it", "pt", "ru", "ca"].map((l) => [l, [`kw-${l}`]])) };
const KINDS = { words: LANGUAGES, meanings: MEANINGS, examples: EXAMPLES, keywords: KEYWORDS };
const EXAMPLE_ESTIMATE = 2500000;
// Reading the text in a photo ("Add words" → Scan, web/js/ocr.js): Tesseract and each language's trained
// data, for the study language and the learner's own ("es+en"), as app/lexicon.py names_for.
const namesFor = (lang, kind) => (OCR_CORES[kind] ? ocrNames(lang, kind) : (KINDS[kind] || LANGUAGES)[lang] || []);
const MEANING_ESTIMATE = { ar: 3000000, es: 7300000, fr: 4500000, it: 6300000, ru: 6000000, en: 20000000, tl: 2600000, ja: 3300000, zh: 6000000,
  pt: 4900000, ca: 2000000, ceb: 3800000, th: 650000, fa: 560000, hi: 1400000, ko: 1400000, la: 8200000 };
// Sizes to show before anything has been fetched (the real ones come with the file list).
const ESTIMATE = { ar: 3300000, es: 1000000, fr: 700000, it: 700000, ru: 2400000, en: 600000, tl: 180000, ja: 11400000, zh: 1900000,
  pt: 1100000, ca: 900000, ceb: 260000, th: 190000, fa: 110000, hi: 400000, ko: 230000, la: 3100000 };

// (A different address can be set for testing a build before the files are published.)
function base() {
  try { return localStorage.getItem("lexicon_base") || BASE_URL; } catch { return BASE_URL; }
}

async function fetchBytes(name) {
  let res;
  try { res = await fetch(base() + name, { cache: "no-cache" }); } catch { res = null; }
  if (!res || !res.ok) throw new Error("Couldn't download the dictionaries. Check your connection and try again.");
  return res.arrayBuffer();
}

async function sha256(buf) {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ----- newer files (as app/lexicon.py): a file downloaded before is replaced when a newer one is published -----
// Each stored file's checksum is kept (kv "lexicon:shas"); the published list (index.json, looked at again after
// a day) gives each file's. When they differ the file is fetched again in the background, checked, and swapped in;
// until then, and with no connection, the stored copy keeps working.
const INDEX_MAX_AGE = 24 * 3600 * 1000;

async function shas() { return (await kv.get("lexicon:shas")) || {}; }
async function remember(name, sha) {
  const all = await shas();
  if (sha) all[name] = sha; else delete all[name];
  await kv.set("lexicon:shas", all);
}
/** The checksum of the stored copy of `name` (worked out once for a file stored before it was kept). */
async function localSha(name) {
  const known = (await shas())[name];
  if (known) return known;
  const blob = await kv.get(`lexicon:${name}`);
  if (!blob) return null;
  const sha = await sha256(blob);
  await remember(name, sha);
  return sha;
}
/** Of `names`, those stored here whose published file is newer (another checksum). */
async function staleNames(names, index, have) {
  const out = [];
  for (const name of names) {
    const meta = index.files[name];
    if (meta && have.has(name) && (await localSha(name)) !== meta.sha256) out.push(name);
  }
  return out;
}
const updating = new Set();
/** Look at the published list (after a day) and fetch newer copies of this language's files, in the background. */
function updateInBackground(lang, kind) {
  const key = `${kind}|${lang}`;
  if (updating.has(key)) return;
  updating.add(key);
  (async () => {
    let index = await kv.get("lexicon:index");
    if (!index || Date.now() - ((await kv.get("lexicon:indexAt")) || 0) > INDEX_MAX_AGE) {
      index = JSON.parse(new TextDecoder().decode(await fetchBytes("index.json")));
      await kv.set("lexicon:index", index);
      await kv.set("lexicon:indexAt", Date.now());
    }
    const have = new Set((await kv.get("lexicon:installed")) || []);
    if ((await staleNames(namesFor(lang, kind), index, have)).length) await lexiconDownload(lang, kind);
  })().catch(() => { /* no connection: the stored copy keeps working */ }).finally(() => updating.delete(key));
}

export async function lexiconStatus(lang = "ar", kind = "words") {
  const names = namesFor(lang, kind);
  const index = (await kv.get("lexicon:index")) || { files: {} };
  const have = new Set((await kv.get("lexicon:installed")) || []);
  const files = {};
  for (const name of names) {
    const meta = index.files[name] || {};
    files[name] = { title: meta.title || name, bytes: meta.bytes || OCR_BYTES[name] || 0, license: meta.license || "", installed: have.has(name) };
  }
  const bytes = names.reduce((n, name) => n + files[name].bytes, 0)
    || (kind === "examples" ? EXAMPLE_ESTIMATE : kind === "keywords" ? 150000 : (kind === "meanings" ? MEANING_ESTIMATE : ESTIMATE)[lang]) || 0;
  if (names.some((n) => have.has(n))) updateInBackground(lang, kind);
  const stale = await staleNames(names, index, have);
  return { lang, kind, needed: names.length > 0, names, installed: names.length > 0 && names.every((n) => have.has(n)), bytes, files, stale };
}

export async function lexiconDownload(lang = "ar", kind = "words") {
  const index = JSON.parse(new TextDecoder().decode(await fetchBytes("index.json")));
  await kv.set("lexicon:index", index);
  await kv.set("lexicon:indexAt", Date.now());
  const have = new Set((await kv.get("lexicon:installed")) || []);
  const newer = new Set(await staleNames(namesFor(lang, kind), index, have));
  for (const name of namesFor(lang, kind)) {
    if (have.has(name) && !newer.has(name)) continue;
    const meta = index.files[name];
    if (!meta) throw new Error(`The ${name} dictionary isn't published yet.`);
    const blob = await fetchBytes(meta.file);
    if ((await sha256(blob)) !== meta.sha256) throw new Error("A dictionary arrived damaged. Try again.");
    await kv.set(`lexicon:${name}`, blob);
    await remember(name, meta.sha256);
    have.add(name);
    await kv.set("lexicon:installed", [...have]);
  }
  return lexiconStatus(lang, kind);
}

export async function lexiconRemove(lang = "ar", kind = "words") {
  const have = new Set((await kv.get("lexicon:installed")) || []);
  for (const name of namesFor(lang, kind)) {
    have.delete(name);
    await kv.set(`lexicon:${name}`, null);
    await remember(name, null);
  }
  await kv.set("lexicon:installed", [...have]);
  return lexiconStatus(lang, kind);
}

/** A downloaded dictionary, unpacked and ready for web/js/lexicon/ (arabic.js, romance.js, ...).
 * The Japanese one is binary (kuromoji.js): an ArrayBuffer; so are text reading's files (web/js/ocr.js). */
export async function lexiconData(name) {
  const blob = await kv.get(`lexicon:${name}`);
  if (!blob) return null;
  if (name === "ja" || name.startsWith("ocr-")) return new Response(new Blob([blob]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return gunzipJson(blob);
}
