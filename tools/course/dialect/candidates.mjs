// Step 1 of a dialect course's word list: the dialect's words, most frequent first, with what is known
// about each, for the hand pass that chooses the 300 (README.md in this folder).
//
//   node tools/course/dialect/candidates.mjs lev     -> tools/course/build/dialect/lev-candidates.tsv (+ .json)
//
// Each line: rank, count per million words, the forms counted together (Levantine, Egyptian and Gulf
// grouped by dictionary word with CAMeL's dialect dictionary; Moroccan by spelling), flags, what the
// dictionaries say, and a real sentence from the texts.
//   BASICS:n      spelled like MSA basics word n (rule 1: can't be in the list)
//   SHIFT:word    an MSA basics word once a regular sound change is undone (rule 2)
//   MSA:lemma     the Standard Arabic dictionary can read it (rule 4: needs a note on how it differs)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { counts, dictionary, DIALECTS, loadLexicon, msaBasics, sentences, SRC } from "./sources.mjs";
import { basicsClash, shiftClash } from "./msa.mjs";
import { matchForm } from "../../../web/js/lexicon/arabic.js";

const d = process.argv[2];
if (!DIALECTS.includes(d)) throw new Error(`Which dialect? ${DIALECTS.join(", ")}`);
const TOP = Number(process.argv[3] || 900);

const { n, total } = counts(d);
const msa = loadLexicon("msa");
const own = d === "mor" ? null : loadLexicon(d);
const basics = msaBasics();
const dict = await dictionary(d);
const lines = sentences(d);

// Group the forms by the dialect dictionary's likeliest dictionary word.
const groups = new Map();
for (const [form, c] of [...n].sort((a, b) => b[1] - a[1]).slice(0, 6000)) {
  let key = form, lemma = form;
  if (own) {
    const rs = own.readings(form).sort((a, b) => a.cost - b.cost);
    if (rs.length) { lemma = rs[0].lemma; key = `${matchForm(lemma)}|${rs[0].pos}`; }
  }
  const g = groups.get(key) || { lemma, count: 0, forms: [] };
  g.count += c;
  g.forms.push([form, c]);
  groups.set(key, g);
}

const example = (form) => {
  const re = new RegExp(`(^|[^\\u0600-\\u06ff])${form.replace(/[ه]$/, "[هة]")}($|[^\\u0600-\\u06ff])`);
  return lines.filter((s) => s.length < 120 && re.test(matchForm(s))).slice(0, 2);
};

const out = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, TOP).map((g, i) => {
  const main = g.forms[0][0];
  const flags = [];
  for (const b of [...basicsClash(main, basics), ...basicsClash(g.lemma, basics)]) flags.push(`BASICS:${b.n}`);
  for (const b of shiftClash(main, basics)) flags.push(`SHIFT:${b.word}`);
  const rs = msa.readings(main).filter((r) => r.cost < 990).sort((a, b) => a.cost - b.cost);
  if (rs.length) flags.push(`MSA:${rs[0].lemma}`);
  const seen = new Set();
  const meanings = [];
  for (const f of [matchForm(g.lemma), ...g.forms.map((x) => x[0])]) {
    for (const e of dict.get(f) || []) {
      const k = `${e.src}|${e.gloss}`;
      if (!seen.has(k)) { seen.add(k); meanings.push(e); }
    }
  }
  return { rank: i + 1, perMillion: Math.round((g.count / total) * 1e6), lemma: g.lemma, forms: g.forms.slice(0, 8),
    flags: [...new Set(flags)], meanings: meanings.slice(0, 6), examples: example(main) };
});

writeFileSync(join(SRC, `${d}-candidates.json`), JSON.stringify(out, null, 1));
writeFileSync(join(SRC, `${d}-candidates.tsv`), out.map((c) => [c.rank, c.perMillion, c.lemma,
  c.forms.map((f) => f[0]).join(" "), c.flags.join(" "),
  c.meanings.slice(0, 3).map((m) => `${m.src.replace(/^Wiktionary /, "W")}: ${m.gloss.slice(0, 60)}`).join(" | "),
  (c.examples[0] || "")].join("\t")).join("\n"));
console.log(`${d}: ${total} words counted, ${groups.size} dictionary words; top ${out.length} -> build/dialect/${d}-candidates.tsv`);
