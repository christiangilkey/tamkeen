// Phone side of the word dictionaries (Arabic; Spanish, French, Italian word tables; the desktop's is app/lexicon.py): downloaded once,
// when someone learning that language agrees to it, from the same address the desktop uses, and kept
// in the phone's storage. web/js/lexicon/ explains what they are for.

import { kv } from "./store.js";
import { gunzipJson } from "./drive.js";

const BASE_URL = "https://christiangilkey.github.io/tamkeen/lexicon/";
// Standard Arabic first: it is the one tried first. Spanish, French and Italian have one table each;
// Thai's is how each word is said (web/js/lexicon/thai.js).
const LANGUAGES = { ar: ["msa", "egy", "lev", "glf"], es: ["es"], fr: ["fr"], it: ["it"], ru: ["ru"], en: ["en"], tl: ["tl"], ja: ["ja"], zh: ["zh"],
  pt: ["pt"], ca: ["ca"], ceb: ["ceb"], th: ["th"], fa: ["fa"] };
// Word meanings for "No AI" (web/js/meanings.js): one file a language, only when that is chosen.
// Arabic and Bisaya have a second file, asked when Wiktionary lacks a word (the CAMeL databases' glosses;
// Wolff's Dictionary of Cebuano Visayan).
const MEANINGS = { ...Object.fromEntries(Object.keys(LANGUAGES).map((l) => [l, [`mean-${l}`]])), ar: ["mean-ar", "mean-arc"],
  ceb: ["mean-ceb", "mean-cebw"] };
const KINDS = { words: LANGUAGES, meanings: MEANINGS };
const MEANING_ESTIMATE = { ar: 3000000, es: 7300000, fr: 4500000, it: 6300000, ru: 6000000, en: 20000000, tl: 950000, ja: 3300000, zh: 6000000,
  pt: 4900000, ca: 2000000, ceb: 3600000, th: 650000, fa: 560000 };
// Sizes to show before anything has been fetched (the real ones come with the file list).
const ESTIMATE = { ar: 3300000, es: 1000000, fr: 700000, it: 700000, ru: 2400000, en: 600000, tl: 120000, ja: 11400000, zh: 1900000,
  pt: 1100000, ca: 900000, ceb: 260000, th: 190000, fa: 110000 };

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

export async function lexiconStatus(lang = "ar", kind = "words") {
  const names = (KINDS[kind] || LANGUAGES)[lang] || [];
  const index = (await kv.get("lexicon:index")) || { files: {} };
  const have = new Set((await kv.get("lexicon:installed")) || []);
  const files = {};
  for (const name of names) {
    const meta = index.files[name] || {};
    files[name] = { title: meta.title || name, bytes: meta.bytes || 0, license: meta.license || "", installed: have.has(name) };
  }
  const bytes = names.reduce((n, name) => n + files[name].bytes, 0) || (kind === "meanings" ? MEANING_ESTIMATE : ESTIMATE)[lang] || 0;
  return { lang, kind, needed: names.length > 0, names, installed: names.length > 0 && names.every((n) => have.has(n)), bytes, files };
}

export async function lexiconDownload(lang = "ar", kind = "words") {
  const index = JSON.parse(new TextDecoder().decode(await fetchBytes("index.json")));
  await kv.set("lexicon:index", index);
  const have = new Set((await kv.get("lexicon:installed")) || []);
  for (const name of (KINDS[kind] || LANGUAGES)[lang] || []) {
    if (have.has(name)) continue;
    const meta = index.files[name];
    if (!meta) throw new Error(`The ${name} dictionary isn't published yet.`);
    const blob = await fetchBytes(meta.file);
    if ((await sha256(blob)) !== meta.sha256) throw new Error("A dictionary arrived damaged. Try again.");
    await kv.set(`lexicon:${name}`, blob);
    have.add(name);
    await kv.set("lexicon:installed", [...have]);
  }
  return lexiconStatus(lang, kind);
}

export async function lexiconRemove(lang = "ar", kind = "words") {
  const have = new Set((await kv.get("lexicon:installed")) || []);
  for (const name of (KINDS[kind] || LANGUAGES)[lang] || []) {
    have.delete(name);
    await kv.set(`lexicon:${name}`, null);
  }
  await kv.set("lexicon:installed", [...have]);
  return lexiconStatus(lang, kind);
}

/** A downloaded dictionary, unpacked and ready for web/js/lexicon/ (arabic.js, romance.js, ...).
 * The Japanese one is binary (kuromoji.js): an ArrayBuffer. */
export async function lexiconData(name) {
  const blob = await kv.get(`lexicon:${name}`);
  if (!blob) return null;
  if (name === "ja") return new Response(new Blob([blob]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return gunzipJson(blob);
}
