// The Iraqi course's texts: downloads them into the git-ignored tools/course/build/dialect/irq/ (README.md here).
//
//   node tools/course/ar-irq/texts.mjs                    the parts the course counts (high, medium; a minute)
//   node tools/course/ar-irq/texts.mjs medium_extended    another part too
//
// Iraqi Arabic Dialect Corpus (factlogic, Hugging Face, CC BY-NC 4.0; 2026): 326,000 comments and messages that
// Iraqis wrote on 401 Iraqi YouTube channels and 34 public Telegram chats (collected with YouTube's own API), picked
// out as Iraqi by four dialect classifiers and checked by blind human labels. The course counts its "high" part
// (112,000 texts, 2.0 million words, 100% Iraqi in the labels) and "medium" (169,000 texts, 1.7 million words,
// 99.4%); "medium_extended" (98.5%) is left out. -> irq/corpus-<part>.tsv: part, source, city guess, text (one
// line each). Counted only, never published; a few short quotes go into evidence.json as proof of use.
// The files are parquet, read by parquet.mjs (written here, so nothing has to be installed).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readColumns } from "./parquet.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const IRQ = join(here, "..", "build", "dialect", "irq");
export const CORPUS = "factlogic/iraqi-arabic-dialect-corpus";
export const COUNTED = ["high", "medium"];
const one = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();

async function fetchPart(part) {
  const out = join(IRQ, `corpus-${part}.tsv`);
  if (existsSync(out)) return;
  const url = `https://huggingface.co/datasets/${CORPUS}/resolve/main/data/${part}/train-00000-of-00001.parquet`;
  const r = await fetch(url, { headers: { "User-Agent": "Tamkeen course builder" } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const c = readColumns(Buffer.from(await r.arrayBuffer()), ["subset", "source_dataset", "subdialect_hint", "text"]);
  mkdirSync(IRQ, { recursive: true });
  writeFileSync(out, `${c.text.map((t, i) => [c.subset[i], c.source_dataset[i], c.subdialect_hint[i] || "", one(t)].join("\t")).join("\n")}\n`);
  console.log(`${out}: ${c.text.length} texts`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const part of [...COUNTED, ...process.argv.slice(2)]) await fetchPart(part);
}
