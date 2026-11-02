// Step 1 of the Egyptian word list, over all the Egyptian texts (texts.mjs): how often each word is used.
//
//   node tools/course/ar-egy/rank.mjs     -> tools/course/build/dialect/egy-extra/
//        counts.json      every spelling's count in each group of texts (kept: the other steps read it)
//        egy-groups.tsv   the commonest dictionary words (spellings grouped with CAMeL's Egyptian dictionary)
//        egy-pool.tsv     the commonest spellings that aren't MSA list words and that an Egyptian dictionary defines
//
// Flags in both lists: LIST = an MSA list word (tools/course/dialect/overlap.mjs: can't be in the course),
// SHIFT = an MSA basics word once a regular sound change is undone (rule 2), MSA = the Standard Arabic
// dictionary can read it (rule 4: kept only with a note on how it differs).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { countForm, dictionary, loadLexicon, msaBasics, SRC, TEXTS } from "../dialect/sources.mjs";
import { shiftClash } from "../dialect/msa.mjs";
import { msaWords, searchKey } from "../dialect/overlap.mjs";
import { matchForm } from "../../../web/js/lexicon/arabic.js";
import { EXTRA, useAllTexts } from "./texts.mjs";

/** The three groups the counts are kept in: the Youm7 comments, the subtitles/novels/songs, the forum posts. */
export const GROUPS = { aoc: "comments", "egy-extra/arzen": "subtitles", "egy-extra/dialogue": "subtitles", "egy-extra/efc": "forums" };
const groupOf = (file) => GROUPS[Object.keys(GROUPS).find((k) => file.startsWith(k))];
const CACHE = join(EXTRA, "counts.json");

/**
 * {n: Map(spelling -> count), total, by: {comments, subtitles, forums} words in each, of: Map(spelling ->
 * [comments, subtitles, forums])}: every Egyptian text counted, the way sources.mjs counts (countForm).
 */
export function loadCounts() {
  const files = useAllTexts();
  let cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : null;
  if (!cache || cache.files.join("|") !== files.join("|")) {
    const names = ["comments", "subtitles", "forums"];
    const of = new Map(), by = { comments: 0, subtitles: 0, forums: 0 };
    for (const f of files) {
      const g = names.indexOf(groupOf(f));
      for (const line of readFileSync(join(SRC, f), "utf8").split(/\r?\n/)) {
        for (const tok of line.split(/\s+/)) {
          const w = countForm(tok);
          if (!w) continue;
          by[names[g]]++;
          const c = of.get(w) || [0, 0, 0];
          c[g]++;
          of.set(w, c);
        }
      }
    }
    cache = { files, by, of: Object.fromEntries(of) };
    writeFileSync(CACHE, JSON.stringify(cache));
  }
  const of = new Map(Object.entries(cache.of));
  const n = new Map([...of].map(([w, c]) => [w, c[0] + c[1] + c[2]]));
  return { n, of, by: cache.by, total: cache.by.comments + cache.by.subtitles + cache.by.forums };
}

/** What can't be in the list, and what needs a note: flags for one spelling. */
export function flagger() {
  const msaList = msaWords(), basics = msaBasics(), msa = loadLexicon("msa");
  return (w) => {
    const f = [];
    const hit = msaList.get(searchKey(w));
    if (hit) f.push(`LIST:${hit[0].replace(/ in web\/js\/wordlists\/ar\.js/, "")}`);
    for (const b of shiftClash(w, basics)) f.push(`SHIFT:${b.word}`);
    const rs = msa.readings(matchForm(w)).filter((r) => r.cost < 990).sort((a, b) => a.cost - b.cost);
    if (rs.length) f.push(`MSA:${rs[0].lemma}`);
    return f;
  };
}

async function main() {
  const { n, of, total, by } = loadCounts();
  console.log(`${total} words counted (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ")}), ${n.size} spellings`);
  const flags = flagger();
  const own = loadLexicon("egy");
  const dict = await dictionary("egy");
  const pm = (c) => ((c / total) * 1e6).toFixed(1);
  const gloss = (forms) => {
    const seen = new Set(), out = [];
    for (const f of forms) for (const e of dict.get(f) || []) {
      if (e.from || /given name|surname|letter of the/.test(e.gloss)) continue;
      const k = `${e.src}|${e.gloss}`;
      if (!seen.has(k)) { seen.add(k); out.push(`${e.src.replace(/^Wiktionary \(Egyptian Arabic\)/, "W").replace(/^CAMeL Egyptian lexicon/, "C").replace(/^Wiktionary \(Arabic\)/, "WA")}: ${e.gloss.replace(/\s+/g, " ").slice(0, 70)}`); }
    }
    return out;
  };
  const sorted = [...n].sort((a, b) => b[1] - a[1]);

  // Dictionary words: spellings grouped by the Egyptian dictionary's likeliest reading.
  const groups = new Map();
  for (const [form, c] of sorted.slice(0, 12000)) {
    const rs = own.readings(form).sort((a, b) => a.cost - b.cost);
    const lemma = rs.length ? rs[0].lemma : form;
    const key = rs.length ? `${matchForm(lemma)}|${rs[0].pos}` : form;
    const g = groups.get(key) || { lemma, count: 0, forms: [] };
    g.count += c;
    g.forms.push(form);
    groups.set(key, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 4000).map((g, i) => [i + 1, pm(g.count), g.lemma,
    g.forms.slice(0, 8).join(" "), [...new Set([...flags(g.forms[0]), ...flags(g.lemma).map((x) => `lemma-${x}`)])].join(" "), gloss([matchForm(g.lemma), ...g.forms]).slice(0, 3).join(" | ")].join("\t"));
  writeFileSync(join(EXTRA, "egy-groups.tsv"), `${rows.join("\n")}\n`);

  // Spellings an Egyptian dictionary defines, MSA list words left out.
  const pool = [];
  sorted.forEach(([form, c], i) => {
    if (c < 5) return;
    const f = flags(form);
    if (f.some((x) => x.startsWith("LIST"))) return;
    const g = gloss([form]);
    if (!g.length) return;
    const [a, s, e] = of.get(form);
    pool.push([i + 1, pm(c), form, `${a}/${s}/${e}`, f.join(" "), g.slice(0, 3).join(" | ")].join("\t"));
  });
  writeFileSync(join(EXTRA, "egy-pool.tsv"), `${pool.join("\n")}\n`);
  console.log(`-> egy-groups.tsv (${rows.length}), egy-pool.tsv (${pool.length}) in ${EXTRA}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
