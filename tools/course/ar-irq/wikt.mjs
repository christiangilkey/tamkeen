// Wiktionary's Iraqi Arabic entries (CC BY-SA 4.0), which kaikki.org's extracts (the other dialects' source) don't
// have: every page in the category "Iraqi Arabic lemmas", plus any other word asked for, read through Wiktionary's
// definition service -> tools/course/build/dialect/irq/wikt-iraqi.json {word: [{pos, gloss, url}]}, kept so the
// evidence can be rebuilt offline.
//
//   node tools/course/ar-irq/wikt.mjs              the category's pages not fetched yet
//   node tools/course/ar-irq/wikt.mjs كلش هواية    these words too (their Iraqi Arabic section, if they have one)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const WIKT = join(here, "..", "build", "dialect", "irq", "wikt-iraqi.json");
const UA = { "User-Agent": "Tamkeen course builder (https://christiangilkey.github.io/tamkeen/)" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (html) => String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export const pageUrl = (word) => `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#Iraqi_Arabic`;

/** The Iraqi Arabic senses of a Wiktionary page: [{pos, gloss, url}] ([] when it has no Iraqi Arabic section). */
export async function iraqiSenses(word) {
  for (let attempt = 1; attempt < 6; attempt++) {
    const r = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`, { headers: UA });
    if (r.status === 404) return [];
    if (!r.ok) { await wait(3000 * attempt); continue; }
    const j = await r.json();
    const out = [];
    for (const list of Object.values(j)) {
      for (const e of list) {
        if (e.language !== "Iraqi Arabic") continue;
        for (const d of e.definitions || []) {
          const gloss = text(d.definition);
          if (gloss) out.push({ pos: String(e.partOfSpeech || "").toLowerCase(), gloss, url: pageUrl(word) });
        }
      }
    }
    return out;
  }
  throw new Error(`Wiktionary kept failing for ${word}`);
}

async function category() {
  const out = [];
  let cont = "";
  do {
    const r = await fetch(`https://en.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Iraqi_Arabic_lemmas&cmlimit=500&cmtype=page&format=json${cont}`, { headers: UA });
    const j = await r.json();
    out.push(...j.query.categorymembers.map((m) => m.title));
    cont = j.continue ? `&cmcontinue=${encodeURIComponent(j.continue.cmcontinue)}` : "";
  } while (cont);
  return out;
}

async function main() {
  mkdirSync(dirname(WIKT), { recursive: true });
  const have = existsSync(WIKT) ? JSON.parse(readFileSync(WIKT, "utf8")) : {};
  const asked = process.argv.slice(2);
  const words = asked.length ? asked : (await category()).filter((w) => /[؀-ۿ]/.test(w));
  for (const w of words) {
    if (have[w]) continue;
    have[w] = await iraqiSenses(w);
    console.log(w, have[w].length);
    await wait(400);
  }
  writeFileSync(WIKT, `${JSON.stringify(have, null, 1)}\n`);
  console.log(`${Object.keys(have).length} pages, ${Object.values(have).filter((x) => x.length).length} with Iraqi Arabic senses -> ${WIKT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
