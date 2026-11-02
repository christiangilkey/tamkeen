// Step 2 of the Egyptian word list: the proof behind each word (the owner: "I need real solid evidence that
// each word means what you thought it meant").
//
//   node tools/course/ar-egy/proof.mjs             -> tools/course/ar-egy/evidence.json, for words.json
//   node tools/course/ar-egy/proof.mjs list.tsv    -> a review table of a draft list (word | forms | pos | meaning | note)
//
// For each word: how often it is used in each kind of Egyptian text (rank.mjs), what published dictionaries
// say it means (Wiktionary's Egyptian Arabic entries and Egyptian senses of its Arabic entries, CC BY-SA;
// CAMeL Tools' Egyptian lexicon, from the CALIMA-Egyptian morphological analyzer), and real sentences that
// use it: from the subtitles, novels and songs with their English translation by a human translator, and
// from the Youm7 comments. The forum posts are counted but never quoted (their licence is non-commercial).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { countForm, dictionary, ROOT, SRC } from "../dialect/sources.mjs";
import { bare } from "../dialect/msa.mjs";
import { flagger, loadCounts } from "./rank.mjs";
import { EXTRA, QUOTABLE } from "./texts.mjs";
import { lisaanMasry } from "./lisaan.mjs";

const HERE = join(ROOT, "tools", "course", "ar-egy");

/**
 * Dictionary entries checked by hand on Wiktionary's own site, for words its Egyptian Arabic section doesn't
 * have yet: the sense the word has (Arabic "colloquial", or the same word in a neighbouring dialect), with a link.
 */
const CITES = JSON.parse(readFileSync(join(HERE, "cites.json"), "utf8"));

/**
 * The spellings a word is counted in: its own and its forms, each also with و or ف in front. A word spelled
 * like another course word ("formsOnly": true, e.g. the verb وِحِش "be missed" beside the adjective وِحِش "bad")
 * is counted in its listed forms only.
 */
export function countedForms(w) {
  const forms = [...new Set([...(w.formsOnly ? [] : [bare(w.word)]), ...(w.forms || []).map(bare)])].filter(Boolean);
  return [...new Set(forms.flatMap((f) => [f, `و${f}`, `ف${f}`]))];
}

/** How often a word is used: counts in each kind of text, and the average rate per million words over the three. */
export function usage(w, { of, by }) {
  const t = [0, 0, 0];
  const seen = [];
  for (const f of countedForms(w)) {
    const c = of.get(f);
    if (!c) continue;
    c.forEach((x, i) => (t[i] += x));
    seen.push(f);
  }
  const rate = ((t[0] / by.comments + t[1] / by.subtitles + t[2] / by.forums) / 3) * 1e6;
  return { comments: t[0], subtitles: t[1], forums: t[2], perMillion: Number(rate.toFixed(1)), forms: seen };
}

/** Real sentences that quote freely: [{ar, en?, src}], tokenised once. */
function quotable() {
  const out = [];
  const add = (file, src, en) => {
    const lines = readFileSync(join(SRC, file), "utf8").split(/\r?\n/);
    const ens = en ? readFileSync(join(SRC, en), "utf8").split(/\r?\n/) : [];
    lines.forEach((ar, i) => {
      const s = ar.trim();
      if (s.length < 8 || s.length > 110) return;
      out.push({ ar: s, en: ens[i] ? ens[i].trim() : undefined, src, toks: new Set(s.split(/\s+/).map(countForm).filter(Boolean)) });
    });
  };
  add("egy-extra/arzen.txt", QUOTABLE["egy-extra/arzen.txt"], "egy-extra/arzen.en.txt");
  add("egy-extra/dialogue.txt", QUOTABLE["egy-extra/dialogue.txt"], "egy-extra/dialogue.en.txt");
  add("aoc/dialect_youm7-segs.txt.norm", QUOTABLE["aoc/dialect_youm7-segs.txt.norm"]);
  return out;
}

/** Everything known about each word: usage, dictionary meanings, examples, MSA flags. */
export async function evidenceFor(words) {
  const counts = loadCounts();
  const dict = await dictionary("egy");
  const flags = flagger();
  const lines = quotable();
  const out = [];
  for (const w of words) out.push(await one(w));
  return out;
  async function one(w) {
    const u = usage(w, counts);
    const seen = new Set();
    const meanings = [];
    for (const f of [...new Set([bare(w.word), ...(w.forms || []).map(bare), ...(w.see || []).map(bare)])]) {
      for (const e of dict.get(f) || []) {
        if (/given name|surname|letter of the/.test(e.gloss)) continue;
        const k = `${e.src}|${e.word}|${e.gloss}`;
        if (seen.has(k)) continue;
        seen.add(k);
        meanings.push({ src: e.src, word: e.word, gloss: e.gloss.replace(/\s+/g, " ").trim(), ...(e.from ? { from: e.from } : {}) });
      }
    }
    for (const e of CITES[bare(w.word)] || []) meanings.push(e);
    for (const e of await lisaanMasry(w.word, [...(w.see || []), ...(w.forms || []).slice(0, 2)])) meanings.push(e);
    const fs = new Set(countedForms(w));
    const examples = [];
    const per = {};
    for (const l of lines) {
      if (examples.length >= 4) break;
      if ((per[l.src] || 0) >= (l.en ? 3 : 1)) continue;
      if (![...l.toks].some((t) => fs.has(t))) continue;
      per[l.src] = (per[l.src] || 0) + 1;
      examples.push({ ar: l.ar, ...(l.en ? { en: l.en } : {}), src: l.src });
    }
    return { word: w.word, ...u, meanings, examples, flags: flags(bare(w.word)) };
  }
}

const SOURCES = [
  "Counts: AOC, readers' comments on Youm7 judged Egyptian (Zaidan & Callison-Burch 2011, aclanthology.org/P11-2007); ArzEn-MultiGenre v3 (Al-Sabbagh 2023, doi:10.17632/6k97jty9xg.3, CC BY 4.0) and the Egyptian Arabic Dialogue Dataset (huggingface.co/datasets/fr3on/egyptian-dialogue, CC BY 4.0): TV subtitles, novels and songs with English translations; Egyptian Forums Corpus-mini files 0-2 (huggingface.co/datasets/faisalq/EFC-mini, CC BY-NC 4.0, counted only). perMillion is the average of the three kinds of text (comments, subtitles, forums), so the forums' size doesn't outweigh speech.",
  "Meanings: Wiktionary (CC BY-SA 4.0, as extracted by kaikki.org): its Egyptian Arabic entries, and the senses of its Arabic entries labelled Egyptian; CAMeL Tools' Egyptian lexicon glosses (docs/lexicon/ar-camel-meanings.json.gz); Lisaan Masry, Egyptian Arabic dictionary (Mike Green, lisaanmasry.org), its entries marked Egyptian; and a few Wiktionary entries checked by hand on its site (cites.json).",
];

async function main() {
  const draft = process.argv[2];
  if (draft) {
    const words = readFileSync(draft, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).map((l) => {
      const [word, forms, pos, meaning, note, see] = l.split("|").map((x) => (x || "").trim());
      return { word, forms: forms ? forms.split(/\s+/) : [], pos, meaning, note, see: see ? see.split(",").map((x) => x.trim()) : [] };
    });
    const ev = await evidenceFor(words);
    const rows = ev.map((e, i) => ({ ...e, w: words[i] })).sort((a, b) => b.perMillion - a.perMillion);
    const kind = (m) => (/^Lisaan/.test(m.src) ? "L" : /Egyptian Arabic\)$/.test(m.src) ? "W" : /^CAMeL/.test(m.src) ? "C" : /checked on its site/.test(m.src) ? "X" : "WA");
    for (const [i, r] of rows.entries()) {
      const direct = r.meanings.filter((m) => !m.from);
      const by = {};
      for (const m of direct) (by[kind(m)] ||= []).push(m);
      const show = Object.entries(by).map(([k, ms]) => `${k}${ms.length}:${ms[0].word}=${ms.map((m) => m.gloss).join("; ").slice(0, 60)}`).join(" | ");
      console.log([i + 1, r.perMillion, `${r.comments}/${r.subtitles}/${r.forums}`, r.word, r.flags.join(" "), r.w.meaning,
        direct.length ? show : "NO-DICT", `${r.examples.filter((x) => x.en).length}en`].join("\t"));
    }
    return;
  }
  const data = JSON.parse(readFileSync(join(HERE, "words.json"), "utf8"));
  const ev = await evidenceFor(data.words);
  const out = { dialect: "egy", note: "Made by tools/course/ar-egy/proof.mjs: how often each word is used in Egyptian texts, what published dictionaries say it means, and real sentences using it.", sources: SOURCES,
    words: ev.map((e, i) => ({ n: data.words[i].n, ...e })) };
  writeFileSync(join(HERE, "evidence.json"), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`evidence for ${ev.length} words -> tools/course/ar-egy/evidence.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
export { EXTRA };
