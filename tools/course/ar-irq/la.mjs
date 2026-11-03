// The Living Arabic Project's Iraqi dictionary (livingarabic.com), one lookup per headword the word list names
// (list.tsv "la"): the entries whose headword is that word, with their English meaning and the page they came
// from -> la-iraqi.json (kept, so the evidence can be rebuilt without asking the site again).
//
//   node tools/course/ar-irq/la.mjs             looks up what la-iraqi.json doesn't have yet
//   node tools/course/ar-irq/la.mjs هيچ باوع     these words (printed, and kept too)
//
// The site's search reads چ as ج and گ as ك (its headwords are written with چ and گ), so a word is looked up
// with those letters and its entries are matched the same way.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const LA_FILE = join(here, "la-iraqi.json");
const searchable = (s) => s.replace(/چ/g, "ج").replace(/گ/g, "ك");
const strip = (s) => searchable(s.replace(/[ً-ْٰـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي"));
const text = (html) => html.replace(/<br\/?>/g, " ").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\[keyword\]/g, "").replace(/\s+/g, " ").trim();

/** The Iraqi dictionary's entries for `word`: [{word, meaning, url}] (its headword, one of whose forms is `word`). */
export async function laIraqi(word) {
  const url = `https://www.livingarabic.com/en/search?q=${encodeURIComponent(searchable(word))}&dc%5B%5D=5&st%5B%5D=1`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Tamkeen course builder)" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const html = await res.text();
  const out = [];
  const re = /Word:<\/span>\s*<\/td>\s*<td>([\s\S]*?)<\/td>[\s\S]*?class="meaning">([\s\S]*?)<\/span>/g;
  const target = strip(word);
  let m;
  while ((m = re.exec(html))) {
    const head = text(m[1].replace(/<br\/?>/g, " ¦ "));
    // "جَاْهِل، ج جَهَّاْل / يَهَّاْل": every form named, without plural markers and notes
    const heads = head.split(/[¦/،,]/).map((x) => strip(x.replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/^\s*ج\s+/, "").trim()).split(/\s+/)[0]).filter(Boolean);
    if (!heads.includes(target)) continue;
    out.push({ word: head, meaning: text(m[2]), url });
  }
  return out;
}

async function main() {
  const have = existsSync(LA_FILE) ? JSON.parse(readFileSync(LA_FILE, "utf8")) : {};
  const asked = process.argv.slice(2);
  let words = asked;
  if (!asked.length) { // list.tsv's 6th column: the headwords to look up ("word~pattern": the word)
    const rows = readFileSync(join(here, "list.tsv"), "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
    words = [...new Set(rows.flatMap((l) => (l.split("|")[5] || "").split(",").map((x) => x.split("~")[0].trim()).filter(Boolean)))];
  }
  for (const w of words) {
    if (have[w] && !asked.length) continue;
    have[w] = await laIraqi(w);
    if (asked.length) { console.log(`## ${w}`); for (const e of have[w]) console.log(`   ${e.word} => ${e.meaning.slice(0, 120)}`); }
    else console.log(w, have[w].length);
    await new Promise((r) => setTimeout(r, 1000));
  }
  const sorted = Object.fromEntries(Object.keys(have).sort().map((k) => [k, have[k]]));
  writeFileSync(LA_FILE, `${JSON.stringify(sorted, null, 1)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
