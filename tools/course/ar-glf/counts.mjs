// Count every word form in the Saudi texts once: counts.json {totals, forms: {form: [aoc, sada, fw, msa]}}
import { readFileSync, writeFileSync, existsSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { countForm, SRC } from "../dialect/sources.mjs";
const L = (f) => existsSync(join(SRC, f)) ? readFileSync(join(SRC, f), "utf8").split(/\r?\n/).filter((l) => l.trim()) : [];
const sadaSet = new Set();
for (const l of L("sada/najdi-clean.tsv")) sadaSet.add(l.split("\t")[0].trim());
for (const l of L("sada/sada22-najdi.tsv")) { const c = l.split("\t"); sadaSet.add((c[1] || c[0]).trim()); }
const forms = new Map(); const totals = [0, 0, 0, 0];
const add = (s, k) => { for (const w of s.split(/\s+/)) { const f = countForm(w); if (!f) continue; totals[k]++; let a = forms.get(f); if (!a) { a = [0, 0, 0, 0]; forms.set(f, a); } a[k]++; } };
for (const s of L("aoc/dialect_alriyadh-segs.txt.norm")) add(s, 0);
for (const s of sadaSet) add(s, 1);
for (const s of L("aoc/MSA_alriyadh-segs.txt.norm")) add(s, 3);
const fw = join(SRC, "fineweb2", "najdi-00000.txt");
const seen = new Set(); let docs = 0;
if (existsSync(fw)) for await (const line of createInterface({ input: createReadStream(fw) })) {
  const key = line.slice(0, 200); if (seen.has(key)) continue; seen.add(key); docs++; // drop repeated forum boilerplate
  add(line, 2);
}
const out = {}; for (const [f, a] of forms) if (a[0] + a[1] + a[2] + a[3] >= 3) out[f] = a;
writeFileSync(join(SRC, "glf-work", "counts.json"), JSON.stringify({ totals, fwDocs: docs, sadaSegments: sadaSet.size, forms: out }));
console.log("totals aoc/sada/fw/msa", totals, "fw docs", docs, "forms", Object.keys(out).length);
