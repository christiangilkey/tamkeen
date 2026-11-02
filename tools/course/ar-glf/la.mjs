// The Living Arabic Project's Gulf dictionary (livingarabic.com), one lookup per word of list.json that names
// an "la" headword: the entries whose headword is that word, with their English meaning and the page they
// came from -> la-gulf.json (kept, so the evidence can be rebuilt without asking the site again).
//
//   node tools/course/ar-glf/la.mjs          looks up only what la-gulf.json doesn't have yet
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const strip = (s) => s.replace(/[ً-ْٰـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/گ/g, "ق").replace(/چ/g, "ك");

export async function laGulf(word) {
  const url = `https://www.livingarabic.com/en/search?q=${encodeURIComponent(word)}&dc%5B%5D=6&st%5B%5D=1`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Tamkeen course builder)" } });
  const html = await res.text();
  const out = [];
  const re = /Word:<\/span>\s*<\/td>\s*<td>([\s\S]*?)<\/td>[\s\S]*?class="meaning">([\s\S]*?)<\/span>/g;
  const target = strip(word);
  let m;
  while ((m = re.exec(html))) {
    const head = m[1].replace(/<br\/?>/g, " ¦ ").replace(/<[^>]*>/g, "").trim();
    const heads = head.split("¦").flatMap((x) => x.replace(/\[[^\]]*\]/g, "").split(/[/،,]/)).map((x) => strip(x.trim()).split(/\s+/)[0]).filter(Boolean);
    if (!heads.includes(target)) continue;
    out.push({ word: head, meaning: m[2].replace(/<br\/?>/g, " ").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(), url });
  }
  return out;
}

async function main() {
  const list = JSON.parse(readFileSync(join(here, "list.json"), "utf8"));
  const file = join(here, "la-gulf.json");
  const have = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  for (const w of list) {
    if (!w.la || have[w.la]) continue;
    have[w.la] = await laGulf(w.la);
    console.log(w.la, have[w.la].length);
    await new Promise((r) => setTimeout(r, 1000));
  }
  writeFileSync(file, `${JSON.stringify(have, null, 1)}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("la.mjs")) await main();
