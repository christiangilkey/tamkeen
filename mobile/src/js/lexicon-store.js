// Phone side of the Arabic word dictionaries (the desktop's is app/lexicon.py): downloaded once,
// when someone learning Arabic agrees to it, from the same address the desktop uses, and kept
// in the phone's storage. web/js/lexicon/ explains what they are for.

import { kv } from "./store.js";
import { gunzipJson } from "./drive.js";

const BASE_URL = "https://christiangilkey.github.io/tamkeen/lexicon/";
const LANGUAGES = { ar: ["msa", "egy", "lev", "glf"] }; // Standard Arabic first: it is the one tried first

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

export async function lexiconStatus(lang = "ar") {
  const names = LANGUAGES[lang] || [];
  const index = (await kv.get("lexicon:index")) || { files: {} };
  const have = new Set((await kv.get("lexicon:installed")) || []);
  const files = {};
  for (const name of names) {
    const meta = index.files[name] || {};
    files[name] = { title: meta.title || name, bytes: meta.bytes || 0, license: meta.license || "", installed: have.has(name) };
  }
  // Before anything has been fetched the sizes aren't known; the four files total about 3.3 MB.
  const bytes = names.reduce((n, name) => n + files[name].bytes, 0) || (names.length ? 3300000 : 0);
  return { lang, needed: names.length > 0, names, installed: names.length > 0 && names.every((n) => have.has(n)), bytes, files };
}

export async function lexiconDownload(lang = "ar") {
  const index = JSON.parse(new TextDecoder().decode(await fetchBytes("index.json")));
  await kv.set("lexicon:index", index);
  const have = new Set((await kv.get("lexicon:installed")) || []);
  for (const name of LANGUAGES[lang] || []) {
    if (have.has(name)) continue;
    const meta = index.files[name];
    if (!meta) throw new Error(`The ${name} dictionary isn't published yet.`);
    const blob = await fetchBytes(meta.file);
    if ((await sha256(blob)) !== meta.sha256) throw new Error("A dictionary arrived damaged. Try again.");
    await kv.set(`lexicon:${name}`, blob);
    have.add(name);
    await kv.set("lexicon:installed", [...have]);
  }
  return lexiconStatus(lang);
}

export async function lexiconRemove(lang = "ar") {
  const have = new Set((await kv.get("lexicon:installed")) || []);
  for (const name of LANGUAGES[lang] || []) {
    have.delete(name);
    await kv.set(`lexicon:${name}`, null);
  }
  await kv.set("lexicon:installed", [...have]);
  return lexiconStatus(lang);
}

/** A downloaded dictionary, unpacked and ready for web/js/lexicon/arabic.js. */
export async function lexiconData(name) {
  const blob = await kv.get(`lexicon:${name}`);
  return blob ? gunzipJson(blob) : null;
}
