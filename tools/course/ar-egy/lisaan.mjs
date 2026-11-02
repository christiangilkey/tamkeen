// A second published dictionary for the Egyptian words: Lisaan Masry, a free Egyptian Arabic-English
// dictionary (Mike Green, 2007-2020, www.lisaanmasry.org). Its search pages are fetched once, slowly, and kept
// in tools/course/build/dialect/egy-extra/lisaan/ (not published); only the entries marked EG (Egyptian Arabic)
// are used, with their English glosses and a link to the entry, as evidence of what a word means.
//
//   node tools/course/ar-egy/lisaan.mjs عايز يلا      prints what it says for these words
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchForm } from "../../../web/js/lexicon/arabic.js";
import { EXTRA } from "./texts.mjs";

const DIR = join(EXTRA, "lisaan");
const SITE = "https://www.lisaanmasry.org/online/";
export const LISAAN = "Lisaan Masry (Egyptian Arabic dictionary, lisaanmasry.org)";

/** A word as compared here: letters only (no vowel marks, tatweel or spaces), one alef/ya/ta marbuta. */
const key = (s) => matchForm(String(s || "").replace(/[ً-ٰٟـ\s]/g, ""));
const text = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#039;|&apos;/g, "'").replace(/\s+/g, " ").trim();

/** The entries of one search page: [{lang: "EG"|"MS"|…, id, roman, ar, glosses: [english…]}]. */
export function parse(html) {
  const out = [];
  let cur = null;
  for (const chunk of html.split("<span title='").slice(1)) {
    const label = chunk.slice(0, chunk.indexOf("'"));
    const id = (chunk.match(/word\.php\?ui=en&id=(\d+)/) || [])[1];
    const tr = text((chunk.match(/<span class='tr'>([^<]*)<\/span>/) || [])[1]);
    if (label === "English") {
      if (cur && tr && !cur.glosses.includes(tr)) cur.glosses.push(tr);
      continue;
    }
    const ar = text((chunk.match(/class='toprow ar'><div[^>]*><big><b>([\s\S]*?)<\/b><\/big>/) || [])[1]);
    if (!id || !ar) continue;
    const lang = label === "Egyptian Arabic" ? "EG" : label;
    cur = { lang, id, roman: tr, ar, glosses: [] };
    out.push(cur);
  }
  return out;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

/** The search page for a word, from the kept copy or (politely, a second apart) from the site. */
async function page(word) {
  mkdirSync(DIR, { recursive: true });
  const k = key(word);
  const path = join(DIR, `${encodeURIComponent(k)}.html`);
  if (existsSync(path)) return readFileSync(path, "utf8");
  await wait(Math.max(0, last + 1200 - Date.now()));
  last = Date.now();
  const r = await fetch(`${SITE}search.php?ui=en&language=EG&key=${encodeURIComponent(String(word).replace(/[ً-ٰٟ]/g, ""))}`, { headers: { "user-agent": "TamkeenCourseBuilder/1.0" } });
  if (!r.ok) throw new Error(`lisaanmasry ${word}: ${r.status}`);
  const html = await r.text();
  writeFileSync(path, html);
  return html;
}

/** What Lisaan Masry says a word means: its Egyptian entries spelled like it, as dictionary evidence. */
export async function lisaanMasry(word, also = []) {
  const keys = new Set([word, ...also].map(key));
  const out = [];
  for (const w of [word, ...also]) {
    for (const e of parse(await page(w))) {
      if (e.lang !== "EG" || !keys.has(key(e.ar)) || !e.glosses.length) continue;
      if (out.some((x) => x.url.endsWith(`id=${e.id}`))) continue;
      out.push({ src: LISAAN, word: e.ar.replace(/ـ/g, "").replace(/\s+(?=[ً-ٟ])/g, ""), roman: e.roman, gloss: e.glosses.join("; "), url: `${SITE}word.php?ui=en&id=${e.id}` });
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const w of process.argv.slice(2)) console.log(w, JSON.stringify(await lisaanMasry(w), null, 1));
}
