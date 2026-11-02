// Step 3 of the Egyptian word list: put tools/course/ar-egy/words.json in frequency order.
//
//   node tools/course/ar-egy/order.mjs [words.json]
//
// Each word is counted in all its spellings (`forms`, with و/ف in front too: proof.mjs) in the four kinds of
// Egyptian text (texts.mjs), and its rate is the average per million words over comments, subtitles and forums,
// so the 7 million forum words don't outweigh speech. The words go most used first; `n` is the place in the
// course and `rank` the place among all the Egyptian dictionary's words counted the same way (spellings grouped
// by CAMeL's Egyptian dictionary, as rank.mjs does), so the gaps in `rank` are the words the rules left out.
// `perMillion` is kept beside each word (not published), and `planned` is set to the number of words.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadLexicon } from "../dialect/sources.mjs";
import { matchForm } from "../../../web/js/lexicon/arabic.js";
import { loadCounts } from "./rank.mjs";
import { countedForms, usage } from "./proof.mjs";

const path = process.argv[2] || join(ROOT, "tools", "course", "ar-egy", "words.json");
const data = JSON.parse(readFileSync(path, "utf8"));
const counts = loadCounts();
const rate = (c) => ((c[0] / counts.by.comments + c[1] / counts.by.subtitles + c[2] / counts.by.forums) / 3) * 1e6;

// Every dictionary word of the texts: the commonest 12,000 spellings grouped by their likeliest reading.
const own = loadLexicon("egy");
const groups = new Map();
for (const [form, c] of [...counts.of].sort((a, b) => rate(b[1]) - rate(a[1])).slice(0, 12000)) {
  const rs = own.readings(form).sort((a, b) => a.cost - b.cost);
  const key = rs.length ? `${matchForm(rs[0].lemma)}|${rs[0].pos}` : form;
  const g = groups.get(key) || { score: 0, forms: [] };
  g.score += rate(c);
  g.forms.push(form);
  groups.set(key, g);
}

const words = data.words.map((w) => ({ w, score: usage(w, counts).perMillion, forms: new Set(countedForms(w)) }));
const others = [...groups.values()].filter((g) => !g.forms.some((f) => words.some((x) => x.forms.has(f)))).map((g) => g.score);
words.sort((a, b) => b.score - a.score || a.w.word.localeCompare(b.w.word));
// Ties: the course's words in their own order, before any other word with the same rate.
const all = [...others.map((s) => ({ s })), ...words.map((x, i) => ({ s: x.score, x, i }))]
  .sort((a, b) => b.s - a.s || (a.x && b.x ? a.i - b.i : a.x ? -1 : b.x ? 1 : 0));
all.forEach((e, i) => { if (e.x) e.x.rank = i + 1; });

data.planned = words.length;
data.words = words.map((x, i) => {
  const { n, rank, perMillion, ...rest } = x.w;
  return { n: i + 1, rank: x.rank, ...rest, perMillion: x.score };
});
writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`);
console.log(`${words.length} words in order -> ${path} (ranks ${data.words[0].rank}-${data.words.at(-1).rank})`);
