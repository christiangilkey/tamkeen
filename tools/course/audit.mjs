// Frequency words audit (the owner, 2026-11-27: "really stringent on these being the most frequent words"), step 2:
// how well a language's lists hold up against text that wasn't used to make them.
//
//   node tools/course/audit.mjs es --agree leipzig --speech library,ted
//     -> tools/course/build/audit/es-report.md
//
// Each named text was counted by audit_forms.py (tools/course/build/audit/<lang>-<name>-forms.json) and is grouped
// here into dictionary words with the language's OWN ranking script, the one that made the lists (its input and
// output files are swapped in for the run and put back after), so words are counted exactly as the lists count them.
// The lists: words 1-1000 are the course's (tools/course/<lang>/words.json); 1-3000 adds the first 2,000 candidates
// (candidates.json, before the review that will still drop names and merge forms).
// - --agree NAME: a second, independent frequency source: how many of its top 1,000 / 3,000 dictionary words are in
//   ours, and the words only one of the two ranks high.
// - --speech NAMES: real speech: what share of its running words the top 1,000 and the top 3,000 cover.
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, "build");
const lang = process.argv[2];
const opt = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1].split(",").filter(Boolean) : []; };
const agree = opt("--agree"), speech = opt("--speech");
const PY = process.env.WF_PYTHON || "python";
const RANK = { ar: "node tools/course/rank.mjs ar", es: `${PY} tools/course/es/rank_es.py`, en: `${PY} tools/course/en/rank_en.py`,
  ru: `${PY} tools/course/ru/rank.py tools/course/build/openrussian`,
  it: `${PY} tools/course/it/rank.py`, pt: `${PY} tools/course/pt/rank.py`, zh: `${PY} tools/course/zh/rank_zh.py`,
  ja: "node tools/course/ja/rank_ja.mjs", ko: "node tools/course/ko/rank_ko.mjs" };
const rankCmd = RANK[lang] || `node tools/course/${lang}/rank.mjs`;

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
// (Hindi: ज़रूर and जरूर are one word, written with and without the nukta dot, so it is left out when matching)
const keyOf = (t) => String(t ?? "").normalize("NFD").replace(/़/g, "").normalize("NFC").replace(MARKS, "").trim().toLowerCase()
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
const formsOf = (f) => (Array.isArray(f) ? f.map((x) => (Array.isArray(x) ? x[0] : x)).filter((x) => typeof x === "string") : []);
const entries = (list) => list.map((e) => (Array.isArray(e)
  ? { lemma: e[1], freq: e[2], forms: formsOf(e[3]) }
  : { lemma: e.lemma ?? e.word ?? e.key, freq: e.freq ?? e.count, forms: formsOf(e.forms) }));

/** A counted text grouped into dictionary words by the language's own script: [{lemma, freq (share), forms}]. */
function grouped(name) {
  const src = join(build, "audit", `${lang}-${name}-forms.json`);
  if (!existsSync(src)) throw new Error(`No ${src}: run audit_forms.py ${lang} ${name} first.`);
  const counts = JSON.parse(readFileSync(src, "utf8"));
  const total = counts.reduce((s, [, n]) => s + n, 0);
  // Thai's list is of words as the corpus counts them (no grouping): the counted words are the list's words.
  if (lang === "th") return { total, words: counts.map(([w, n]) => ({ lemma: w, freq: n / total, forms: [] })) };
  // Bisaya's ranking reads its own NLLB list unless RANK_FORMS names another counted file (ceb/rank.mjs).
  if (lang === "ceb") {
    const tmp = join(build, "audit", `ceb-${name}-shares.json`), ranked = join(build, "ceb-ranked.json");
    writeFileSync(tmp, JSON.stringify(counts.map(([w, n]) => [w, n / total])));
    if (existsSync(ranked)) renameSync(ranked, ranked + ".keep");
    try {
      execSync(rankCmd, { cwd: join(here, "..", ".."), env: { ...process.env, RANK_TOP: "200000", RANK_FORMS: tmp }, stdio: "pipe" });
      return { total, words: entries(JSON.parse(readFileSync(ranked, "utf8"))) };
    } finally {
      if (existsSync(ranked + ".keep")) { if (existsSync(ranked)) unlinkSync(ranked); renameSync(ranked + ".keep", ranked); }
    }
  }
  const forms = join(build, `${lang}-forms.json`), ranked = join(build, `${lang}-ranked.json`);
  const keep = (p) => { if (existsSync(p)) renameSync(p, p + ".keep"); };
  const back = (p) => { if (existsSync(p + ".keep")) { if (existsSync(p)) unlinkSync(p); renameSync(p + ".keep", p); } };
  keep(forms); keep(ranked);
  try {
    writeFileSync(forms, JSON.stringify(counts.map(([w, n]) => [w, n / total])));
    execSync(rankCmd, { cwd: join(here, "..", ".."), env: { ...process.env, RANK_TOP: "200000" }, stdio: "pipe" });
    const words = entries(JSON.parse(readFileSync(ranked, "utf8")));
    // (Russian's script writes its freq per million words; the others write shares)
    return { total, words: lang === "ru" ? words.map((e) => ({ ...e, freq: e.freq / 1e6 })) : words };
  } finally {
    back(forms); back(ranked);
  }
}

// Our lists, and how a dictionary word is found in them (its own spelling, or any of its forms).
const course = JSON.parse(readFileSync(join(here, lang, "words.json"), "utf8")).words;
const cand = JSON.parse(readFileSync(join(here, lang, "candidates.json"), "utf8")).words.slice(0, 3000 - course.length);
const keysOf = (words) => { const s = new Set(); for (const w of words) { s.add(keyOf(w.word ?? w.lemma)); for (const f of [].concat(w.form || [], w.forms || [])) s.add(keyOf(f)); } return s; };
const list1000 = keysOf(course), list3000 = keysOf([...course, ...cand]);
// (Korean: the lists teach a noun and 하다 as two words, 생각 and 하다, where a text's grouping can make 생각하다)
const parts = (w) => (lang === "ko" && /.하다$/.test(w) ? [w.slice(0, -2)] : []);
const has = (set, e) => [e.lemma, ...e.forms, ...parts(e.lemma)].some((f) => set.has(keyOf(f)));

const out = [`# ${lang}: audit of the Frequency words`, "",
  `Words 1-1000: the course's ${course.length}. Words 1-3000: those plus the first ${cand.length} candidates (before their review).`, ""];
const pct = (x) => `${(x * 100).toFixed(1)}%`;

for (const name of speech) {
  const { total, words } = grouped(name);
  const cover = (set) => words.filter((e) => has(set, e)).reduce((s, e) => s + e.freq, 0);
  out.push(`## Speech: ${name} (${total.toLocaleString("en")} running words, not used to make the lists)`, "",
    `- The top 1,000 cover ${pct(cover(list1000))} of the running words; the top 3,000 cover ${pct(cover(list3000))}.`);
  const missed = words.filter((e) => !has(list3000, e)).slice(0, 30).map((e) => e.lemma);
  out.push(`- Commonest words in it that are not in the 3,000 (names, other languages, or words we may be missing): ${missed.join(", ")}`, "");
}

for (const name of agree) {
  const { total, words } = grouped(name);
  const top = (n) => words.slice(0, n);
  const ours1000 = top(1000).filter((e) => has(list1000, e)).length, ours3000 = top(3000).filter((e) => has(list3000, e)).length;
  const theirs = new Map(); words.forEach((e, i) => { for (const f of [e.lemma, ...e.forms]) if (!theirs.has(keyOf(f))) theirs.set(keyOf(f), i + 1); }); // (its best place)
  const rankOf = (w) => [w.word, ...[].concat(w.form || [], w.forms || [])].map((x) => theirs.get(keyOf(x))).filter(Boolean).sort((a, b) => a - b)[0] || Infinity;
  const onlyOurs = course.filter((w) => rankOf(w) > 5000).map((w) => `${w.word} (${rankOf(w) === Infinity ? "absent" : rankOf(w)})`);
  const onlyTheirs = top(1000).filter((e) => !has(list3000, e)).map((e) => e.lemma);
  out.push(`## Agreement with ${name} (${total.toLocaleString("en")} running words, an independent source)`, "",
    `- Of its top 1,000 dictionary words, ${ours1000} (${pct(ours1000 / 1000)}) are in our 1,000; of its top 3,000, ${ours3000} (${pct(ours3000 / 3000)}) are in our 3,000.`,
    `- In our 1-1000 but past ${name}'s 5,000th (${onlyOurs.length}): ${onlyOurs.slice(0, 40).join(", ")}`,
    `- In ${name}'s top 1,000 but not in our 3,000 (${onlyTheirs.length}): ${onlyTheirs.slice(0, 40).join(", ")}`, "");
}
const file = join(build, "audit", `${lang}-report.md`);
writeFileSync(file, out.join("\n") + "\n");
console.log(out.join("\n"));
