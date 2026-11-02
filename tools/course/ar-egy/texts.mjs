// The Egyptian course's extra texts: more real Egyptian Arabic to count words in, beside the Youm7 comments
// that tools/course/dialect/sources.mjs already reads (AOC). Nothing here is published; the texts are only
// counted, and a few short sentences from the openly licensed ones are quoted in evidence.json as proof of use.
//
//   node tools/course/ar-egy/texts.mjs     downloads what is missing into tools/course/build/dialect/egy-extra/
//                                          and writes one sentence per line (Arabic .txt, English .en.txt)
//
// Texts:
//   arzen     ArzEn-MultiGenre v3 (Al-Sabbagh 2023, Mendeley Data doi:10.17632/6k97jty9xg.3; CC BY 4.0):
//             25,557 Egyptian Arabic segments from TV subtitles, novels and songs, each with an English
//             translation by a human translator. huggingface.co/datasets/HeshamHaroon/ArzEn-MultiGenre
//   dialogue  Egyptian Arabic Dialogue Dataset (CC BY 4.0): 4,057 lines of TV-series subtitles with English.
//             huggingface.co/datasets/fr3on/egyptian-dialogue
//   efc       Egyptian Forums Corpus-mini (the corpus EgyBERT was trained on; CC BY-NC 4.0): files 0-2 of 52,
//             about 365,000 forum posts. Only counted, never quoted. huggingface.co/datasets/faisalq/EFC-mini
//
// Other scripts call useAllTexts() before sources.mjs counts anything, so the counts and the candidate list
// are over all of them (sources.mjs itself is shared by the four dialects and stays as it is).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SRC, TEXTS } from "../dialect/sources.mjs";

export const EXTRA = join(SRC, "egy-extra");
const HF = "https://huggingface.co/datasets";
const ROWS = "https://datasets-server.huggingface.co/rows?dataset=fr3on/egyptian-dialogue&config=default";

/** Which text a line came from, for quoting: only the openly licensed ones may be quoted. */
export const QUOTABLE = { "aoc/dialect_youm7-segs.txt.norm": "AOC (Youm7 comments)", "egy-extra/arzen.txt": "ArzEn-MultiGenre (CC BY 4.0)", "egy-extra/dialogue.txt": "Egyptian Arabic Dialogue Dataset (CC BY 4.0)" };
export const COUNTED_ONLY = ["egy-extra/efc/0.txt", "egy-extra/efc/1.txt", "egy-extra/efc/2.txt"];

/** Adds the extra texts to the Egyptian list sources.mjs reads (in this process only). */
export function useAllTexts() {
  for (const f of ["egy-extra/arzen.txt", "egy-extra/dialogue.txt", ...COUNTED_ONLY]) {
    if (!TEXTS.egy.includes(f)) TEXTS.egy.push(f);
  }
  return TEXTS.egy;
}

/** The English beside each Arabic line of a translated text: Map(arabic line -> english). */
export function translations() {
  const out = new Map();
  for (const name of ["arzen", "dialogue"]) {
    const ar = readFileSync(join(EXTRA, `${name}.txt`), "utf8").split("\n");
    const en = readFileSync(join(EXTRA, `${name}.en.txt`), "utf8").split("\n");
    ar.forEach((a, i) => { if (a.trim() && en[i] && !out.has(a.trim())) out.set(a.trim(), { en: en[i].trim(), src: QUOTABLE[`egy-extra/${name}.txt`] }); });
  }
  return out;
}

// RTL embedding marks and the like that subtitles carry round each line.
const clean = (s) => String(s || "").replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();

/** The rows of a simple CSV file (quoted fields may hold commas, "" is a quote). */
function csvRows(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function get(url, path) {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  console.log(`downloading ${url}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  writeFileSync(path, Buffer.from(await r.arrayBuffer()));
}

async function main() {
  await get(`${HF}/HeshamHaroon/ArzEn-MultiGenre/resolve/main/dataset.csv`, join(EXTRA, "arzen", "dataset.csv"));
  for (const i of [0, 1, 2]) await get(`${HF}/faisalq/EFC-mini/resolve/main/${i}.txt`, join(EXTRA, "efc", `${i}.txt`));
  for (const split of ["train", "test"]) {
    const path = join(EXTRA, "dialogue", `rows-${split}.jsonl`);
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    const lines = [];
    for (let off = 0; ; off += 100) {
      const j = await (await fetch(`${ROWS}&split=${split}&offset=${off}&length=100`)).json();
      for (const x of j.rows || []) lines.push(JSON.stringify(x.row));
      if (!j.rows || j.rows.length < 100) break;
    }
    writeFileSync(path, `${lines.join("\n")}\n`);
  }
  const [head, ...rows] = csvRows(readFileSync(join(EXTRA, "arzen", "dataset.csv"), "utf8"));
  const egy = head.indexOf("EGY"), eng = head.indexOf("ENG");
  const pairs = rows.map((r) => [clean(r[egy]), clean(r[eng])]).filter(([a, e]) => /[؀-ۿ]/.test(a) && e);
  writeFileSync(join(EXTRA, "arzen.txt"), `${pairs.map((p) => p[0]).join("\n")}\n`);
  writeFileSync(join(EXTRA, "arzen.en.txt"), `${pairs.map((p) => p[1]).join("\n")}\n`);
  const dia = ["train", "test"].flatMap((s) => readFileSync(join(EXTRA, "dialogue", `rows-${s}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)))
    .map((r) => [clean(r.arabic), clean(r.english)]).filter(([a, e]) => /[؀-ۿ]/.test(a) && e);
  writeFileSync(join(EXTRA, "dialogue.txt"), `${dia.map((p) => p[0]).join("\n")}\n`);
  writeFileSync(join(EXTRA, "dialogue.en.txt"), `${dia.map((p) => p[1]).join("\n")}\n`);
  console.log(`arzen ${pairs.length} lines, dialogue ${dia.length} lines -> ${EXTRA}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
