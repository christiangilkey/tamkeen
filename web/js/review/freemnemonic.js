// The free Mnemonic maker: English keywords that sound like the word, found on this device with no AI
// (for learners with no AI key; the AI's maker is review/mnemonic.js, and with a key it stays the one used).
//
// 1. The word's sounds: review/soundout.js (Wiktionary's IPA, or the language's spelling rules).
// 2. Every English word of the keyword list (docs/lexicon/en-keywords.json.gz: common English words with
//    their US pronunciation from the CMU dictionary, what kind of thing each is from WordNet, and how
//    common it is) is measured against every run of the word's syllables with the same sound check as
//    the AI's keywords (review/phonemes.js). Long words also get keywords of two or three words, one for
//    each chunk ("cab + eye + yo"), joined from the best words for each chunk.
// 3. Among those that sound right, picturable, common words come first (an animal, a tool, a food: things
//    one can see), then the rest.
// 4. Each keyword gets a short picture line from a template joining it to the meaning ("Picture a CALF
//    dressed up as a dog."): not as clever as an AI's scene, but always about the meaning.
//
// The answer has the AI's shape, so mnemonic.js rankSuggestions checks and orders it and review.js shows it
// the same way. No page code: tests/js/freemnemonic.test.mjs.

import { FIRST_WEIGHT, PASS, STRESS_WEIGHT, phones, similarity, wordSounds } from "./phonemes.js";
import { MNEMONIC_COUNT, SPLIT_COUNT, SPLIT_FROM, cleanKeyword, rankSuggestions } from "./mnemonic.js";

// What kind of picture each kind of thing makes best (WordNet's lexicographer files, tools/build_examples.py).
const PICTURE = { animal: 0.08, artifact: 0.07, food: 0.07, body: 0.06, person: 0.05, plant: 0.06, object: 0.06, place: 0.04,
  nature: 0.05, substance: 0.04 };
const KEEP = 40;  // best words kept per run of syllables
const TWO_WORDS = 0.1; // what a two-word keyword gives up against a one-word one

/** The keyword list, read once: [{word, ipa, pos, kind, rank, phones}], and the words by spelling. */
export class KeywordList {
  constructor(data) {
    const rows = (data && Array.isArray(data.words) ? data.words : []);
    this.words = rows.map(([word, ipa, pos, kind, rank]) => ({ word, ipa, pos, kind, rank, phones: null }));
    this.byWord = new Map(this.words.map((w) => [w.word, w]));
    this.adjectives = new Set((data && data.adjectives) || []);
  }
  sounds(entry) {
    if (!entry.phones) entry.phones = phones(entry.ipa);
    return entry.phones;
  }
  /** The keyword's sounds as IPA (for mnemonic.js englishSounds-like checks): word by word, or null. */
  ipaOf(keyword) {
    const parts = String(keyword || "").toLowerCase().split(/[\s+]+/).filter(Boolean);
    const said = [];
    for (const p of parts) {
      const e = this.byWord.get(p);
      if (!e) return null;
      said.push(e.ipa);
    }
    return said.length ? said.join(" ") : null;
  }
}

// How much a keyword is worth beyond its sound: picturable things, then other nouns; common words a little.
function bonus(e) {
  let b = e.pos === "n" ? PICTURE[e.kind] ?? 0.02 : e.pos === "a" ? 0 : -0.01;
  b += 0.03 * Math.max(0, 1 - Math.log10(Math.max(1, e.rank)) / 4.5);
  return b;
}

/** The word's runs of syllables, each with its sounds and weights as phonemes.js match() weighs them. */
function runsOf(word) {
  const syl = word.syllables;
  const whole = [];
  syl.forEach((ps, k) => ps.forEach((p, i) => whole.push(1 + (k === word.stress ? STRESS_WEIGHT : 0) + (k === 0 && i === 0 ? FIRST_WEIGHT : 0))));
  const total = whole.reduce((a, b) => a + b, 0);
  let start = 0;
  const starts = syl.map((ps) => { const at = start; start += ps.length; return at; });
  const runs = [];
  for (let a = 0; a < syl.length; a++) {
    for (let b = a; b < syl.length; b++) {
      const target = [], weights = [];
      let covered = 0;
      for (let k = a; k <= b; k++) {
        syl[k].forEach((p, i) => {
          target.push(p);
          weights.push(1 + (k === word.stress ? STRESS_WEIGHT : 0) + (!weights.length ? FIRST_WEIGHT : 0));
          covered += whole[starts[k] + i];
        });
      }
      runs.push({ from: a, to: b, target, weights, coverage: covered / total, best: [] });
    }
  }
  return runs;
}

const keepBest = (list, item, n = KEEP) => {
  if (list.length >= n && item.score <= list[list.length - 1].score) return;
  let i = list.length;
  while (i > 0 && list[i - 1].score < item.score) i--;
  list.splice(i, 0, item);
  if (list.length > n) list.pop();
};

/**
 * Keyword candidates for a word (`pron` as soundout.js pronunciationOf gives it), in the AI's answer
 * shape: {keywords: [{keyword, ipa, covers}], parts: [{pieces: [{keyword, ipa, covers}]}]} with the
 * entry each comes from (`entry`, `entries`), best first. `skip` are words never to offer (the word
 * itself, its meaning, those turned down).
 */
export function findKeywords(pron, list, { skip = [], count = 24 } = {}) {
  const word = pron && wordSounds(pron.syllables, pron.stress);
  if (!word || !list || !list.words.length) return { keywords: [], parts: [] };
  const skipped = new Set(skip.map((s) => cleanKeyword(s).toLowerCase()).filter(Boolean));
  const runs = runsOf(word);
  const n = word.syllables.length;
  const longest = word.syllables.reduce((a, s) => a + s.length, 0) + 3;
  for (const e of list.words) {
    if (skipped.has(e.word)) continue;
    const ps = list.sounds(e);
    if (!ps.length || ps.length > longest) continue;
    for (const r of runs) {
      if (ps.length > r.target.length + 3) continue;
      const sound = similarity(ps, r.target, r.weights);
      if (sound < 0.45) continue;
      keepBest(r.best, { entry: e, sound, score: sound + bonus(e) });
    }
  }
  // One word for the whole word, or for most of it.
  const singles = [];
  for (const r of runs) {
    for (const c of r.best) {
      const score = c.sound * (0.35 + 0.65 * r.coverage);
      if (score < PASS) continue;
      singles.push({ keyword: c.entry.word, ipa: c.entry.ipa, covers: range(r.from, r.to), entry: c.entry, score: score + bonus(c.entry) });
    }
  }
  // Two or three words, each sounding like a chunk, together the whole word.
  const runAt = (a, b) => runs.find((r) => r.from === a && r.to === b);
  const combos = [];
  // (each piece a common word, not an adverb: "pie + toe", never "though")
  const top = (r, k = 4) => (r ? r.best.filter((c) => c.sound >= 0.6 && c.entry.pos !== "r" && c.entry.rank <= 15000).slice(0, k) : []);
  for (let cut = 1; cut < n; cut++) {
    for (const x of top(runAt(0, cut - 1))) for (const y of top(runAt(cut, n - 1))) {
      if (x.entry === y.entry) continue;
      if (x.entry.pos !== "n" && y.entry.pos !== "n") continue;  // something to picture
      combos.push({ pieces: [piece(x.entry, 0, cut - 1), piece(y.entry, cut, n - 1)], score: (x.score + y.score) / 2 });
    }
  }
  if (n >= SPLIT_FROM) {
    for (let a = 1; a < n - 1; a++) for (let b = a + 1; b < n; b++) {
      for (const x of top(runAt(0, a - 1), 3)) for (const y of top(runAt(a, b - 1), 3)) for (const z of top(runAt(b, n - 1), 3)) {
        if (x.entry === y.entry || y.entry === z.entry) continue;
        combos.push({ pieces: [piece(x.entry, 0, a - 1), piece(y.entry, a, b - 1), piece(z.entry, b, n - 1)], score: (x.score + y.score + z.score) / 3 - 0.03 });
      }
    }
  }
  const seen = new Set();
  const keywords = singles.sort((a, b) => b.score - a.score).filter((s) => !seen.has(s.keyword) && seen.add(s.keyword)).slice(0, count);
  combos.sort((a, b) => b.score - a.score);
  const parts = [];
  const used = new Set();
  for (const c of combos) {
    const k = c.pieces.map((p) => p.keyword).join(" + ");
    if (used.has(k)) continue;
    used.add(k);
    parts.push(c);
    if (parts.length >= count) break;
  }
  return { keywords, parts };
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const piece = (e, a, b) => ({ keyword: e.word, ipa: e.ipa, covers: range(a, b), entry: e });

// ---------------------------------------------------------------- the picture line

// Things one doesn't count ("water", not "a water").
const MASS = new Set(`water bread cheese milk rice sugar salt meat money coffee tea juice wine beer soup butter oil sand snow
rain ice fire air music news food hair paper wood gold silver honey flour pasta chocolate meat fish soap grass smoke
blood weather furniture luggage advice information homework work love time sleep mud dust steam cream jam`.split(/\s+/));
const article = (w) => (/^(?:[aeiou]|hour|honest|heir)/i.test(w) && !/^(?:uni|use|euro|one|once|u[bcfhjkqrstn][aeiou])/i.test(w) ? "an" : "a");
const withArticle = (w) => (/^(?:a|an|the|some|my|your)\s/i.test(w) || MASS.has(w.toLowerCase()) || /s$/.test(w) && !/ss$/.test(w) && w.length > 4 ? w : `${article(w)} ${w}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The meaning as one short thing to picture: its first sense, without notes in brackets, and whether it
 * is a thing ("noun"), an action ("verb": "to write") or a quality ("adj"), by `pos` when the card has it,
 * else by its words. {text, pos, head} */
export function meaningPicture(meaning, list = null, pos = "") {
  let m = String(meaning || "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ").split(/[;,/\n]|\s[-–—]\s/)[0].replace(/\s+/g, " ").trim();
  m = m.replace(/^(?:a|an|the)\s+/i, "");
  const verb = /^to\s+\S/i.test(m) || /verb/i.test(pos);
  if (verb) m = m.replace(/^to\s+/i, "");
  const head = (m.split(" ")[verb ? 0 : m.split(" ").length - 1] || "").toLowerCase();
  const entry = list && list.byWord.get(head);
  const adj = !verb && (/adj/i.test(pos) || (!pos && m.split(" ").length <= 2 && ((entry && entry.pos === "a") || (list && list.adjectives && list.adjectives.has(head)))));
  return { text: m.slice(0, 60), pos: verb ? "verb" : adj ? "adj" : "noun", head, kind: entry && entry.pos === "n" ? entry.kind : "" };
}

// A few lines for each kind of keyword; one is picked by the word, so each word keeps its own.
const LINES = {
  animal: ["Picture {k} dressed up as {m}.", "Picture {k} proudly carrying {m} in its mouth.", "Picture {k} that turns into {m} when you blink."],
  person: ["Picture {k} holding {m} high above their head.", "Picture {k} who is sure they are {m}.", "Picture {k} hugging {m} tightly."],
  artifact: ["Picture {m} squeezed inside {k}.", "Picture {k} shaped exactly like {m}.", "Picture {m} balanced on top of {k}."],
  object: ["Picture {m} squeezed inside {k}.", "Picture {k} shaped exactly like {m}.", "Picture {m} balanced on top of {k}."],
  food: ["Picture {m} made entirely of {K}.", "Picture someone serving {m} on a plate of {K}.", "Picture {m} covered in {K}."],
  plant: ["Picture {m} growing out of {k}.", "Picture {m} wrapped in {K}.", "Picture {k} with {m} hanging from it."],
  substance: ["Picture {m} made entirely of {K}.", "Picture {m} dripping with {K}.", "Picture {m} covered in {K}."],
  body: ["Picture {m} with a giant {K}.", "Picture {m} sitting on {k}.", "Picture {k} painted to look like {m}."],
  place: ["Picture {m} in the middle of {k}.", "Picture {m} the size of {k}.", "Picture {k} full of {m}."],
  nature: ["Picture {m} caught in {k}.", "Picture {k} raining down {m}.", "Picture {m} glowing in {k}."],
  noun: ["Picture {k} next to a huge {M}.", "Picture {m} stamped with the word {K}.", "Picture {k} and {m} side by side."],
  word: ["Shout “{K}!” as you picture {m}.", "Picture {m} with “{K}” written on it.", "Hear someone say “{K}” and see {m}."],
};
const VERB_LINES = {
  thing: ["Picture {k} trying to {m}.", "Picture {k} that can only {m}.", "Picture yourself as you {m} with {k}."],
  word: ["Shout “{K}!” as you {m}.", "Hear “{K}” each time you {m}.", "Picture someone who says “{K}” whenever they {m}."],
};
const ADJ_LINES = {
  thing: ["Picture {k} that is incredibly {m}.", "Picture a really {m} {K}, the only one in the world.", "Picture {k}: so {m} that everyone stares."],
  word: ["Shout “{K}!” at something very {m}.", "Picture something very {m} with “{K}” written on it.", "Hear “{K}” and think {m}."],
};

const pick = (lines, seed) => lines[Math.abs(hash(seed)) % lines.length];
function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) | 0;
  return h;
}

/** The picture line joining `keyword` (one entry, or several for a split keyword) to the meaning. */
export function sceneFor(entries, meaning, seed = "") {
  const list = Array.isArray(entries) ? entries : [entries];
  const shown = list.map((e) => e.word.toUpperCase()).join(" ");
  // The piece to picture: the most picturable noun of the keyword, else the keyword as a word said aloud.
  const thing = [...list].sort((a, b) => bonus(b) - bonus(a)).find((e) => e.pos === "n");
  const many = list.length > 1;
  const fill = (line, k, K) => line.replace(/\{k\}/g, k).replace(/\{K\}/g, K).replace(/\{M\}/g, meaning.text).replace(/\{m\}/g, meaning.pos === "noun" ? withArticle(meaning.text) : meaning.text);
  if (!meaning.text) {
    return many ? `Say “${shown}” and link it to the word's meaning in your own picture.` : `Picture ${withArticle(shown)} and link it to the word's meaning.`;
  }
  let line;
  if (thing) {
    const K = thing.word.toUpperCase();
    const k = withArticle(K);
    if (meaning.pos === "verb") line = fill(pick(VERB_LINES.thing, seed + thing.word), k, K);
    else if (meaning.pos === "adj") line = fill(pick(ADJ_LINES.thing, seed + thing.word), k, K);
    else line = fill(pick(LINES[thing.kind] || LINES.noun, seed + thing.word), k, K);
    if (many) line = `“${shown}”: ${line}`;
  } else {
    const lines = meaning.pos === "verb" ? VERB_LINES.word : meaning.pos === "adj" ? ADJ_LINES.word : LINES.word;
    line = fill(pick(lines, seed + shown), shown, shown);
  }
  return cap(line);
}

/**
 * Keywords for word `v` ({text, meaning, pos}) with no AI: the same result as mnemonic.js makeMnemonics,
 * {pron, items, parts, checked, asked, free: true}. `pron` from soundout.js pronunciationOf; `list` a
 * KeywordList; `avoid` keywords already shown or turned down for the word.
 */
export function makeFreeMnemonics(v, { pron, list, avoid = [] }) {
  if (!pron) throw new Error("NO_SOUNDS");
  const meaning = meaningPicture(v.meaning, list, v.pos || "");
  const skip = [...avoid, v.text, meaning.head, ...String(v.meaning || "").toLowerCase().split(/[^a-z]+/)];
  const found = findKeywords(pron, list, { skip });
  const link = (entries) => (meaning.kind && entries.some((e) => e.kind === meaning.kind) ? "loose" : "none");
  const keywords = found.keywords.map((k) => ({ ...k, meaning_link: link([k.entry]), link: "", scene: sceneFor(k.entry, meaning, v.text) }));
  const parts = found.parts.map((p) => ({ pieces: p.pieces, meaning_link: link(p.pieces.map((x) => x.entry)), link: "",
    scene: sceneFor(p.pieces.map((x) => x.entry), meaning, v.text) }));
  const own = (keyword) => list.ipaOf(keyword);
  const tidy = (k) => ({ keyword: k.keyword, ipa: k.ipa, covers: k.covers, link: k.meaning_link === "loose" ? 1 : 0, linkNote: "", scene: k.scene });
  // Two-word keywords for a two-syllable word are shown as keywords ("cab eye"); longer words' as split ones.
  const twoWord = pron.syllables.length < SPLIT_FROM
    ? parts.filter((p) => p.pieces.length === 2).map((p) => ({ keyword: p.pieces.map((x) => x.keyword).join(" "), ipa: p.pieces.map((x) => x.ipa).join(" "),
      covers: range(0, pron.syllables.length - 1), link: p.meaning_link === "loose" ? 1 : 0, linkNote: "", scene: p.scene }))
    : [];
  const split = parts.map((p) => ({ keyword: p.pieces.map((x) => x.keyword).join(" + "), pieces: p.pieces.map(({ keyword, ipa, covers }) => ({ keyword, ipa, covers })),
    link: p.meaning_link === "loose" ? 1 : 0, linkNote: "", scene: p.scene }));
  // Checked like the AI's (rankSuggestions), but all of them, so that a picturable word that sounds
  // nearly as close can go before the closest one.
  const ranked = rankSuggestions({ pron, keywords: [...keywords.map(tidy), ...twoWord.slice(0, 6)], parts: split, ownSounds: own, avoid, count: 1000 });
  // (a keyword of two words is harder to keep in mind than one word: it must sound clearly closer)
  const worth = (s) => s.score + (s.link === 1 ? 0.03 : 0) - (s.keyword.includes(" ") && !s.pieces ? TWO_WORDS : 0)
    + (s.pieces ? 0 : Math.max(...s.keyword.split(" ").map((w) => bonus(list.byWord.get(w) || { pos: "", rank: 1e5 }))));
  ranked.items.sort((a, b) => worth(b) - worth(a));
  ranked.parts.sort((a, b) => worth(b) - worth(a));
  return { pron, asked: keywords.length + parts.length, free: true, items: varied(ranked.items, MNEMONIC_COUNT), parts: varied(ranked.parts, SPLIT_COUNT), checked: ranked.checked };
}

/** The first `n` of `list`, but a word of a keyword made of several words only once ("pie toe", then not
 * "pie tow", "pie two" as well: the same picture). */
function varied(list, n) {
  const used = new Set(), out = [];
  for (const s of list) {
    const words = s.keyword.toLowerCase().split(/[\s+]+/).filter(Boolean);
    if (words.length > 1 && words.some((w) => used.has(w))) continue;
    if (words.length > 1) words.forEach((w) => used.add(w));
    out.push(s);
    if (out.length >= n) break;
  }
  return out;
}
