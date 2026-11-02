// Step 2 of a dialect course's word list: for each chosen word, how often it is used, what published
// dictionaries say it means, and real sentences that use it. The proof behind every word (README.md).
//
//   node tools/course/dialect/evidence.mjs lev            -> tools/course/ar-lev/evidence.json
//   node tools/course/dialect/evidence.mjs lev draft.tsv  -> a table of a draft list, most used first
//
// A word is counted in all the spellings its `forms` list (بدي, بدك, بدو… for "want"), each also with
// و or ف ("and", "so") in front. The texts and dictionaries are sources.mjs's.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { counts, dictionary, DIALECTS, loadLexicon, msaBasics, ROOT, sentences } from "./sources.mjs";
import { bare, basicsClash, shiftClash } from "./msa.mjs";

/** The spellings a word is counted in: its forms, and each with و / ف in front. */
export function countedForms(w) {
  const forms = [...new Set([bare(w.word), ...(w.forms || []).map(bare)])].filter(Boolean);
  return [...new Set(forms.flatMap((f) => [f, `و${f}`, `ف${f}`]))];
}

export async function evidenceFor(d, words) {
  const { n, total } = counts(d);
  const dict = await dictionary(d);
  const lines = sentences(d).filter((s) => s.length >= 12 && s.length <= 140);
  const tokens = lines.map((s) => new Set(s.split(/\s+/).map((t) => bare(t.replace(/[^؀-ۿ]/g, "")))));
  return words.map((w) => {
    const forms = countedForms(w);
    const count = forms.reduce((s, f) => s + (n.get(f) || 0), 0);
    const seen = new Set();
    const meanings = [];
    for (const f of [...new Set([bare(w.word), ...(w.forms || []).map(bare)])]) {
      for (const e of dict.get(f) || []) {
        const k = `${e.src}|${e.gloss}`;
        if (!seen.has(k)) { seen.add(k); meanings.push({ src: e.src, word: e.word, gloss: e.gloss }); }
      }
    }
    const fs = new Set(forms);
    const examples = [];
    for (let i = 0; i < lines.length && examples.length < 3; i++) {
      if ([...tokens[i]].some((t) => fs.has(t))) examples.push(lines[i]);
    }
    return { word: w.word, forms: forms.filter((f) => n.get(f)), count, perMillion: Number(((count / total) * 1e6).toFixed(1)), meanings, examples };
  });
}

async function main() {
  const [d, draft] = process.argv.slice(2);
  if (!DIALECTS.includes(d)) throw new Error(`Which dialect? ${DIALECTS.join(", ")}`);
  if (draft) {
    // word | forms (spaces) | meaning
    const words = readFileSync(draft, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => { const [word, forms, meaning] = l.split("|").map((x) => (x || "").trim()); return { word, forms: forms ? forms.split(/\s+/) : [], meaning }; });
    const ev = await evidenceFor(d, words);
    const msa = loadLexicon("msa"), basics = msaBasics();
    const flag = (w) => [basicsClash(w, basics).length ? "BASICS" : "", shiftClash(w, basics).map((b) => `SHIFT:${b.word}`).join(","),
      msa.readings(bare(w)).filter((r) => r.cost < 990).slice(0, 1).map((r) => `MSA:${r.lemma}`).join("")].filter(Boolean).join(" ");
    const rows = ev.map((e, i) => ({ ...e, meaning: words[i].meaning, flags: flag(words[i].word) })).sort((a, b) => b.count - a.count);
    rows.forEach((r, i) => console.log(`${i + 1}\t${r.perMillion}\t${r.word}\t${r.flags}\t${r.meaning}\t${r.meanings.length ? "DICT " + r.meanings.slice(0, 2).map((m) => `${m.src.replace(/^Wiktionary /, "W")}: ${m.gloss.slice(0, 50)}`).join(" | ") : "NO-DICT"}\t${r.examples.length}ex`));
    return;
  }
  const path = join(ROOT, "tools", "course", `ar-${d}`, "words.json");
  const data = JSON.parse(readFileSync(path, "utf8"));
  const ev = await evidenceFor(d, data.words);
  const out = { dialect: d, note: "Made by tools/course/dialect/evidence.mjs: how often each word is used in the dialect's texts, what published dictionaries say it means, and real sentences using it (sources: tools/course/dialect/sources.mjs).",
    words: ev.map((e, i) => ({ n: data.words[i].n, ...e })) };
  writeFileSync(join(ROOT, "tools", "course", `ar-${d}`, "evidence.json"), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${d}: evidence for ${ev.length} words -> tools/course/ar-${d}/evidence.json`);
}

if (process.argv[1] && process.argv[1].endsWith("evidence.mjs")) await main();
