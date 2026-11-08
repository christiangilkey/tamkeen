// The free Mnemonic maker: English keywords that sound like the word, found on this device with no AI
// (for learners with no AI key; the AI's maker is review/mnemonic.js, and with a key it stays the one used).
//
// 1. The word's sounds: review/soundout.js (Wiktionary's IPA, or the language's spelling rules).
// 2. Every English word of the keyword list (docs/lexicon/en-keywords.json.gz: common English words with
//    their US pronunciation from the CMU dictionary, what kind of thing each is from WordNet, and how
//    common it is) is measured against every run of the word's syllables with the same sound check as
//    the AI's keywords (review/phonemes.js). Long words also get keywords of two or three words, one for
//    each chunk ("cab + eye + yo"), joined from the best words for each chunk.
// 3. Among those that sound right, a keyword tied to the word's meaning comes first (the owner: "prefer words
//    that are related to actual meaning of the foreign language word"): German Hund, "dog", gives HOUND. The ties
//    come with the list: for each common English meaning word, the keywords that are the same thing or a kind
//    of it, a part of it, a broader word, named in its definition (WordNet), or near it in GloVe's word vectors
//    (tools/build_examples.py). Sound stays the gate: a tied word that doesn't sound like the word is never shown.
//    Then picturable, common words (an animal, a tool, a food: things one can see), then the rest.
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
// How much a tie to the meaning counts, in sound score, at full strength (a weight of 1: hound for dog). A tied
// keyword that sounds a little less close still goes first; one that doesn't sound like the word never shows.
export const MEANING_WEIGHT = 0.3;
const TRUST = { g: 0.85, v: 0.75 };  // how much a looser tie is believed (tools/build_examples.py TIES)
export const PIECE_TIE = 0.6;  // a keyword of several words tied through one piece only
// A sound-alike the learner wrote in CAPITALS in a note of their own (review/ownmnemonic.js) gets this much more
// when it sounds like another word too: only a little, as one keyword for many words can mix them up.
export const OWN_BONUS = 0.04;
export const FITS = 0.7;     // a tie this strong is shown "Fits the meaning"
export const RELATED = 0.4;  // and this strong "Related in meaning"

/** The keyword list, read once: [{word, ipa, pos, kind, rank, heads, phones}], and the words by spelling (lower
 * case). English's (en-keywords) or an app language's (<lang>-keywords: Spanish, French, German, Italian,
 * Portuguese, Russian, Catalan), whose words carry `heads`, the English words their meaning comes down to; such a
 * list takes its ties to a meaning through the English list (`english`, attached by examples.js). */
export class KeywordList {
  constructor(data, english = null) {
    const rows = (data && Array.isArray(data.words) ? data.words : []);
    this.lang = (data && data.lang) || "en";
    this.words = rows.map(([word, ipa, pos, kind, rank, heads]) => ({ word, ipa, pos, kind, rank, heads: heads ? heads.split("|") : null, phones: null }));
    this.byWord = new Map();
    for (const w of this.words) if (!this.byWord.has(w.word.toLowerCase())) this.byWord.set(w.word.toLowerCase(), w);
    this.adjectives = new Set((data && data.adjectives) || []);
    this.related = (data && data.related) || {};
    this.english = english;
  }
  /** The keywords tied to a meaning (meaningPicture's), as a Map word -> {weight 0..1, tie}: each head word of
   * the meaning's senses ("big, large": both), a verb's as "to <verb>". */
  tiesOf(meaning) {
    const out = new Map();
    meaning.heads = meaning.heads || [meaning.head].filter(Boolean);
    if (this.lang !== "en") return this.tiesThroughEnglish(meaning);
    meaning.heads.forEach((head, n) => {
      const list = this.related[meaning.pos === "verb" ? `to ${head}` : head] || this.related[head] || [];
      for (const [k, w, tie] of list) {
        const e = this.words[k];
        if (!e) continue;
        // Looser ties count less: a word named in the definition, a word-vector neighbour, a verb's narrower
        // verbs (WordNet's "ways to speak" include blubber and drone), and the meaning's later senses.
        const weight = (w / 100) * (TRUST[tie] ?? 1) * (meaning.pos === "verb" && tie === "s" ? 0.8 : 1) * (n ? 0.85 : 1);
        const had = out.get(e.word.toLowerCase());
        if (!had || had.weight < weight) out.set(e.word.toLowerCase(), { weight, tie });
      }
    });
    return out;
  }
  /** An app language's list: the meaning's words (in that language) to English through their `heads`, then
   * English's ties; a keyword whose own English heads are the meaning's is the same thing (tie "s", weight 1). */
  tiesThroughEnglish(meaning) {
    const out = new Map();
    const englishHeads = [...new Set(meaning.heads.flatMap((h) => (this.byWord.get(h) || {}).heads || []))];
    if (!englishHeads.length) return out;
    const same = new Set(englishHeads);
    const english = this.english ? this.english.tiesOf({ ...meaning, heads: englishHeads.slice(0, 3) }) : new Map();
    for (const e of this.words) {
      if (!e.heads) continue;
      let best = null;
      for (const h of e.heads.slice(0, 2)) {  // (its main English meanings)
        // (through English only the firm ties: a word with two meanings in its English glosses makes looser
        // ones wander off: "cascata" is a waterfall, and English "fall" ties it to many things)
        const via = english.get(h);
        const t = same.has(h) ? { weight: 1, tie: "s" } : via && "spdk".includes(via.tie) ? via : null;
        if (t && (!best || t.weight > best.weight)) best = t;
      }
      if (best) out.set(e.word.toLowerCase(), best);
    }
    return out;
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
export function findKeywords(pron, list, { skip = [], count = 24, tieOf = () => 0 } = {}) {
  const word = pron && wordSounds(pron.syllables, pron.stress);
  if (!word || !list || !list.words.length) return { keywords: [], parts: [] };
  const skipped = new Set(skip.map((s) => cleanKeyword(s).toLowerCase()).filter(Boolean));
  const runs = runsOf(word);
  const n = word.syllables.length;
  const longest = word.syllables.reduce((a, s) => a + s.length, 0) + 3;
  for (const e of list.words) {
    if (skipped.has(e.word.toLowerCase())) continue;
    const ps = list.sounds(e);
    if (!ps.length || ps.length > longest) continue;
    for (const r of runs) {
      if (ps.length > r.target.length + 3) continue;
      const sound = similarity(ps, r.target, r.weights);
      if (sound < 0.45) continue;
      keepBest(r.best, { entry: e, sound, score: sound + bonus(e) + tieOf(e) });
    }
  }
  // One word for the whole word, or for most of it.
  const singles = [];
  for (const r of runs) {
    for (const c of r.best) {
      const score = c.sound * (0.35 + 0.65 * r.coverage);
      if (score < PASS) continue;
      singles.push({ keyword: c.entry.word, ipa: c.entry.ipa, covers: range(r.from, r.to), entry: c.entry, score: score + bonus(c.entry) + tieOf(c.entry) });
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
  const plainHead = (m.split(" ").pop() || "").toLowerCase();
  const verb = /^to\s+\S/i.test(m) || /verb/i.test(pos) || !!(list && list.lang !== "en" && (list.byWord.get(plainHead) || {}).pos === "v" && m.split(" ").length === 1);
  if (verb) m = m.replace(/^to\s+/i, "");
  const head = (m.split(" ")[verb ? 0 : m.split(" ").length - 1] || "").toLowerCase();
  const entry = list && list.byWord.get(head);
  const adj = !verb && (/adj/i.test(pos) || (!pos && m.split(" ").length <= 2 && ((entry && entry.pos === "a") || (list && list.adjectives && list.adjectives.has(head)))));
  // Something said rather than a thing (a phrase's meaning: "please", "how are you?", "God willing", "however"):
  // pictured being said, not as an object ("a PILLOW saying “please”", never "a please on top of a PILLOW").
  if (!verb && !adj && /phrase|intj|interj|adv|particle/i.test(pos)) {
    return { text: m.slice(0, 60), pos: "said", head, heads: [head].filter((x) => /^\p{L}+$/u.test(x)), kind: "" };
  }
  // Every sense's head word, for the ties ("big, large": big and large; "to run, to flee": run and flee).
  const heads = [head, ...String(meaning || "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ").split(/[;,/\n]/).slice(1, 4)
    .map((x) => x.trim().toLowerCase().replace(/^(?:to|a|an|the)\s+/, "").split(/\s+/))
    .map((ws) => (verb ? ws[0] : ws[ws.length - 1]) || "")].filter((x, i, all) => /^\p{L}+$/u.test(x) && all.indexOf(x) === i);
  return { text: m.slice(0, 60), pos: verb ? "verb" : adj ? "adj" : "noun", head, heads, kind: entry && entry.pos === "n" ? entry.kind : "" };
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
// A phrase's meaning that is said ("please", "how are you?"): the keyword says it.
const SAID_LINES = {
  thing: ["Picture {k} turning to you and saying “{M}”.", "Picture {k} that can only say one thing: “{M}”.", "Picture {k} with a speech bubble: “{M}”."],
  word: ["Hear someone say “{K}” when they mean “{M}”.", "Picture a speech bubble with “{K}” in it, meaning “{M}”.", "Shout “{K}!” whenever you mean “{M}”."],
};

const pick = (lines, seed) => lines[Math.abs(hash(seed)) % lines.length];
function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) | 0;
  return h;
}

// A keyword tied to the meaning gets a line that says how (tie codes as tools/build_examples.py TIES).
const TIED_LINES = {
  noun: { s: "{K} is a kind of {M}: picture {k} and you see {m}.", p: "Picture {m} and {k}: one is part of the other.",
    d: "{K} and {M} are close in meaning: picture {k} that is {m}.", k: "Picture {k}: {m} is one.",
    g: "Picture {m} with {k}: the two go together.", v: "Picture {m} with {k}: the two go together." },
  verb: { s: "To {K} is a way to {m}: picture yourself as you {m}, then {K}.", other: "Picture yourself as you {m} with {k}: the two go together." },
  adj: { s: "{K} means much the same as {m}: picture something {m}, shouting “{K}!”", other: "Picture something {m} with {k}: the two go together." },
  said: { other: "Picture {k} saying “{M}”: the two go together." },
};

// Picture lines in the app languages: no article or case ending to get right, so one plain line each (and one
// for a keyword tied to the meaning, and one for no meaning). Not interface text: they go in the learner's notes.
const OWN_LINES = {
  es: ["Une {K} con «{m}» en una imagen que no olvides.", "{K} y «{m}» ya van juntos: imagina los dos a la vez.", "Imagina {K} y únelo al significado de la palabra."],
  fr: ["Associe {K} à « {m} » dans une image que tu n'oublieras pas.", "{K} et « {m} » vont déjà ensemble : imagine les deux à la fois.", "Imagine {K} et relie-le au sens du mot."],
  de: ["Verbinde {K} mit „{m}“ zu einem Bild, das du nicht vergisst.", "{K} und „{m}“ gehören schon zusammen: Stell dir beides zugleich vor.", "Stell dir {K} vor und verbinde es mit der Bedeutung des Wortes."],
  it: ["Unisci {K} a «{m}» in un'immagine che non dimentichi.", "{K} e «{m}» vanno già insieme: immagina le due cose insieme.", "Immagina {K} e collegalo al significato della parola."],
  pt: ["Junte {K} a “{m}” numa imagem que você não vai esquecer.", "{K} e “{m}” já combinam: imagine os dois ao mesmo tempo.", "Imagine {K} e ligue-o ao significado da palavra."],
  ru: ["Представьте: {K} и «{m}» — вместе, в одной яркой картинке.", "{K} и «{m}» и так связаны: представьте их вместе.", "Представьте {K} и свяжите это со значением слова."],
  ca: ["Uneix {K} amb «{m}» en una imatge que no oblidis.", "{K} i «{m}» ja van junts: imagina'ls tots dos alhora.", "Imagina {K} i uneix-ho al significat de la paraula."],
};

/** The picture line joining `keyword` (one entry, or several for a split keyword) to the meaning. `tie` (a
 * tie code, when the keyword is tied to the meaning) picks a line that says how; `lang` is the keywords'
 * language (an app language's lines for its own keywords). */
export function sceneFor(entries, meaning, seed = "", tie = "", lang = "en") {
  const list = Array.isArray(entries) ? entries : [entries];
  const shown = list.map((e) => e.word.toUpperCase()).join(" ");
  if (lang !== "en" && OWN_LINES[lang]) {
    const [plain, tied, none] = OWN_LINES[lang];
    const line = !meaning.text ? none : tie ? tied : plain;
    return line.replace(/\{K\}/g, shown).replace(/\{m\}/g, meaning.text);
  }
  // The piece to picture: the most picturable noun of the keyword, else the keyword as a word said aloud.
  const thing = [...list].sort((a, b) => bonus(b) - bonus(a)).find((e) => e.pos === "n");
  const many = list.length > 1;
  const fill = (line, k, K) => line.replace(/\{k\}/g, k).replace(/\{K\}/g, K).replace(/\{M\}/g, meaning.text).replace(/\{m\}/g, meaning.pos === "noun" ? withArticle(meaning.text) : meaning.text);
  if (!meaning.text) {
    return many ? `Say “${shown}” and link it to the word's meaning in your own picture.` : `Picture ${withArticle(shown)} and link it to the word's meaning.`;
  }
  let line;
  if (tie && !many) {
    const e = list[0];
    const K = e.word.toUpperCase();
    const lines = TIED_LINES[meaning.pos];
    const template = (meaning.pos === "noun" ? lines[tie] : tie === "s" ? lines.s : lines.other) || lines.other || lines.g;
    return cap(fill(template, e.pos === "n" ? withArticle(K) : K, K));
  }
  if (thing) {
    const K = thing.word.toUpperCase();
    const k = withArticle(K);
    if (meaning.pos === "verb") line = fill(pick(VERB_LINES.thing, seed + thing.word), k, K);
    else if (meaning.pos === "adj") line = fill(pick(ADJ_LINES.thing, seed + thing.word), k, K);
    else if (meaning.pos === "said") line = fill(pick(SAID_LINES.thing, seed + thing.word), k, K);
    else line = fill(pick(LINES[thing.kind] || LINES.noun, seed + thing.word), k, K);
    if (many) line = `“${shown}”: ${line}`;
  } else {
    const lines = meaning.pos === "verb" ? VERB_LINES.word : meaning.pos === "adj" ? ADJ_LINES.word : meaning.pos === "said" ? SAID_LINES.word : LINES.word;
    line = fill(pick(lines, seed + shown), shown, shown);
  }
  return cap(line);
}

/**
 * Keywords for word `v` ({text, meaning, pos, memo}) with no AI: the same result as mnemonic.js makeMnemonics,
 * {pron, items, parts, checked, asked, free: true}. `pron` from soundout.js pronunciationOf; `list` a
 * KeywordList; `avoid` keywords already shown or turned down for the word; `prefs` what the learner's choices
 * taught (readPrefs), and with `own` the sound-alikes they wrote themselves are offered again (marked `own`).
 */
export function makeFreeMnemonics(v, { pron, list, avoid = [], meaningWeight = MEANING_WEIGHT, prefs = null, own = true }) {
  if (!pron) throw new Error("NO_SOUNDS");
  // (a card of several words whose core is too, "por favor", is a phrase: its meaning is pictured being said)
  const several = !v.pos && pron.core && /\S\s+\S/u.test(String(pron.core.core || ""));
  const meaning = meaningPicture(v.meaning, list, v.pos || (several ? "phrase" : ""));
  const skip =[...avoid, v.text, meaning.head, ...String(v.meaning || "").toLowerCase().split(/[^\p{L}]+/u)];
  const taste = readPrefs(prefs);
  // Ties to the meaning: their strength (0..1) and kind, per keyword word; a keyword of several words takes its
  // strongest piece's. (meaningWeight 0: sound and picture only, as before the ties: for measuring them.)
  const ties = meaningWeight ? list.tiesOf(meaning) : new Map();
  const tieOf = (entries) => entries.reduce((best, e) => {
    const t = ties.get(e.word.toLowerCase());
    const weight = t ? t.weight * (entries.length > 1 ? PIECE_TIE : 1) : 0;
    return weight > best.weight ? { weight, tie: t.tie } : best;
  }, { weight: 0, tie: "" });
  const found = findKeywords(pron, list, { skip, tieOf: (e) => meaningWeight * ((ties.get(e.word.toLowerCase()) || { weight: 0 }).weight) });
  const linkOf = (t) => (t.weight >= FITS ? 2 : t.weight >= RELATED ? 1 : 0);
  const keywords = found.keywords.map((k) => {
    const t = tieOf([k.entry]);
    return { ...k, tie: t, scene: sceneFor(k.entry, meaning, v.text, linkOf(t) ? t.tie : "", list.lang) };
  });
  const parts = found.parts.map((p) => {
    const t = tieOf(p.pieces.map((x) => x.entry));
    return { pieces: p.pieces, tie: t, scene: sceneFor(p.pieces.map((x) => x.entry), meaning, v.text, list.lang !== "en" && linkOf(t) ? t.tie : "", list.lang) };
  });
  // The sound-alikes the learner wrote in CAPITALS in their own notes (review/ownmnemonic.js), in this list's
  // language: offered again here when they pass the same sound check as the rest, marked "You've used this
  // before". Never the word's own words or meaning, nor one its notes already have.
  const skipped = new Set(skip.map((s) => cleanKeyword(s).toLowerCase()).filter(Boolean));
  const inNotes = (k) => new RegExp(`(?<![\\p{L}\\p{M}])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{M}])`, "iu").test(String(v.memo || ""));
  const mine = own ? taste.o.filter(([k, , lang]) => (lang || "en") === list.lang && !skipped.has(k) && !k.split(" ").some((w) => skipped.has(w)) && !inNotes(k)) : [];
  const ownIpa = new Map(mine.map(([k, ipa]) => [k, ipa]));
  for (const [k, ipa] of mine) {
    if (keywords.some((x) => x.keyword.toLowerCase() === k)) continue;  // (found anyway: marked below)
    const entries = k.split(" ").map((w) => list.byWord.get(w) || { word: w, pos: "", kind: "", rank: 1e5 });
    const t = tieOf(entries);
    keywords.push({ keyword: k, ipa, covers: [], entry: entries[0], tie: t, scene: sceneFor(entries, meaning, v.text, linkOf(t) && entries.length === 1 ? t.tie : "", list.lang) });
  }
  const heardAs = (keyword) => list.ipaOf(keyword) || ownIpa.get(String(keyword).toLowerCase()) || null;
  const marks = (t) => ({ link: linkOf(t), linkNote: "", tie: linkOf(t) ? t.tie : "", tieWeight: t.weight });
  const tidy = (k) => ({ keyword: k.keyword, ipa: k.ipa, covers: k.covers, scene: k.scene, ...marks(k.tie) });
  // Two-word keywords for a two-syllable word are shown as keywords ("cab eye"); longer words' as split ones.
  const twoWord = pron.syllables.length < SPLIT_FROM
    ? parts.filter((p) => p.pieces.length === 2).map((p) => ({ keyword: p.pieces.map((x) => x.keyword).join(" "), ipa: p.pieces.map((x) => x.ipa).join(" "),
      covers: range(0, pron.syllables.length - 1), scene: p.scene, ...marks(p.tie) }))
    : [];
  const split = parts.map((p) => ({ keyword: p.pieces.map((x) => x.keyword).join(" + "), pieces: p.pieces.map(({ keyword, ipa, covers }) => ({ keyword, ipa, covers })),
    scene: p.scene, ...marks(p.tie) }));
  // Checked like the AI's (rankSuggestions), but all of them, so that a picturable word that sounds
  // nearly as close can go before the closest one.
  const ranked = rankSuggestions({ pron, keywords: [...keywords.map(tidy), ...twoWord.slice(0, 6)], parts: split, ownSounds: heardAs, avoid, count: 1000 });
  // (rankSuggestions keeps only its own fields: the tie goes back on, and the mark of the learner's own words)
  const byKeyword = new Map([...keywords.map(tidy), ...twoWord, ...split].map((s) => [s.keyword, s]));
  for (const s of [...ranked.items, ...ranked.parts]) {
    const from = byKeyword.get(s.keyword);
    if (from) Object.assign(s, { tie: from.tie, tieWeight: from.tieWeight });
    if (!s.pieces && ownIpa.has(s.keyword.toLowerCase())) s.own = true;
  }
  // (a keyword of two words is harder to keep in mind than one word: it must sound clearly closer)
  // (and what the learner's own choices taught: prefs, readPrefs)
  for (const s of [...ranked.items, ...ranked.parts]) s.traits = traitsOf(s, list);
  const worth = (s) => s.score + prefBonus(taste, s.traits) + meaningWeight * (s.tieWeight || 0) - (s.keyword.includes(" ") && !s.pieces ? TWO_WORDS : 0)
    + (s.own ? OWN_BONUS : 0)
    + (s.pieces ? 0 : Math.max(...s.keyword.split(" ").map((w) => bonus(list.byWord.get(w.toLowerCase()) || { pos: "", rank: 1e5 }))));
  ranked.items.sort((a, b) => worth(b) - worth(a));
  ranked.parts.sort((a, b) => worth(b) - worth(a));
  return { pron, asked: keywords.length + parts.length, free: true, keywordLang: list.lang, items: varied(ranked.items, MNEMONIC_COUNT), parts: varied(ranked.parts, SPLIT_COUNT), checked: ranked.checked };
}

// ---------------------------------------------------------------- learning the learner's taste

// What a suggestion is like, for learning which kinds the learner picks (Use) and turns down (thumbs down):
// a keyword of two words or a split one, a loose ("partial") sound match, tied to the meaning or not, a word for
// no picturable thing, a verb or adjective, and the kind of thing it names.
export const PREF_STEP = 0.02;   // how far one Use or thumbs down moves a trait's weight
export const PREF_LIMIT = 0.15;  // and never further than this either way (sound always matters more)

/** The traits of a suggestion: ["two", "partial", "kind:animal", …]. */
export function traitsOf(s, list) {
  const out = [];
  if (s.pieces) out.push("split");
  else if (/\s/.test(s.keyword)) out.push("two");
  if (s.sound === "partial") out.push("partial");
  out.push(s.link ? "tied" : "untied");
  if (!s.pieces && !/\s/.test(s.keyword)) {
    const e = list && list.byWord.get(s.keyword.toLowerCase());
    if (e) {
      if (e.pos === "v") out.push("verb");
      else if (e.pos === "a" || e.pos === "r") out.push("adj");
      else if (e.kind) out.push(`kind:${e.kind}`);
      else out.push("abstract");
    }
  }
  return out;
}

// The learner's own mnemonics (review/ownmnemonic.js) are kept in the same setting: the sound-alikes they wrote
// in CAPITALS that passed the sound check, with their sounds (newest first), and a few whole notes, sent to
// their AI as examples of their style. It is synced with the keys (aikeys.js), whose copies are cut at 2,000
// characters, so writePrefs keeps it under PREFS_MAX by letting the oldest go.
export const OWN_MAX = 60;       // own sound-alikes kept
export const EXAMPLES_MAX = 3;   // own notes kept as examples
export const NOTE_MAX = 240;     // characters of each
export const PREFS_MAX = 1900;   // the whole setting, in characters
const OWN_WORD = /^[\p{Ll}\p{Lo}\p{M}']{2,}(?: [\p{Ll}\p{Lo}\p{M}']{2,}){0,2}$/u;
// (control characters and the ones that turn text round: never kept)
const CONTROL = "\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069";
const HAS_CONTROL = new RegExp(`[${CONTROL}]`);
const plainText = (s) => (typeof s === "string" ? s.replace(new RegExp(`[${CONTROL}]`, "g"), " ").replace(/\s+/g, " ").trim() : null);

/** What the free Mnemonic maker has learned, from the synced setting `mnemonic_prefs` (JSON, from any device, so
 * read strictly; anything odd is left out): {w: {trait: weight}, n: choices learned from, o: [[sound-alike,
 * its IPA, its language when not English]], x: [[word, meaning, note]]}. */
export function readPrefs(raw) {
  try {
    const p = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
    if (!p || typeof p !== "object" || Array.isArray(p)) return { w: {}, n: 0, o: [], x: [] };
    const w = {};
    if (p.w && typeof p.w === "object" && !Array.isArray(p.w)) {
      for (const [k, v] of Object.entries(p.w).slice(0, 60)) {
        if (/^[a-z:]{2,24}$/.test(k) && typeof v === "number" && Number.isFinite(v)) w[k] = Math.max(-PREF_LIMIT, Math.min(PREF_LIMIT, v));
      }
    }
    const o = [];
    for (const e of Array.isArray(p.o) ? p.o.slice(0, OWN_MAX * 2) : []) {
      if (!Array.isArray(e) || e.length < 2 || e.length > 3) continue;
      const [k, ipa, lang] = e;
      if (typeof k !== "string" || k.length > 40 || !OWN_WORD.test(k) || o.some(([x]) => x === k)) continue;
      if (typeof ipa !== "string" || !ipa.trim() || ipa.length > 80 || /[<>&"\\]/.test(ipa) || HAS_CONTROL.test(ipa)) continue;
      if (e.length === 3 && !(typeof lang === "string" && /^[a-z]{2,3}$/.test(lang))) continue;
      o.push(e.length === 3 && lang !== "en" ? [k, ipa, lang] : [k, ipa]);
      if (o.length >= OWN_MAX) break;
    }
    const x = [];
    for (const e of Array.isArray(p.x) ? p.x.slice(0, EXAMPLES_MAX * 4) : []) {
      if (!Array.isArray(e) || e.length !== 3) continue;
      const [word, meaning, note] = e.map((s) => plainText(s));
      if (!word || meaning === null || !note || word.length > 60 || meaning.length > 120 || note.length > NOTE_MAX) continue;
      if (x.some(([y]) => y === word)) continue;
      x.push([word, meaning, note]);
      if (x.length >= EXAMPLES_MAX) break;
    }
    const n = Number.isInteger(p.n) && p.n >= 0 ? Math.min(p.n, 1e6) : 0;
    return { w, n, o, x };
  } catch { return { w: {}, n: 0, o: [], x: [] }; }
}

/** The setting's text for `prefs` (readPrefs' shape), at most PREFS_MAX characters: the oldest own sound-alikes
 * go first when it is too long, then the oldest examples. "" when nothing has been learned. */
export function writePrefs(prefs) {
  const p = readPrefs(prefs);
  if (!p.n && !Object.keys(p.w).length && !p.o.length && !p.x.length) return "";
  const text = () => JSON.stringify({ w: p.w, n: p.n, ...(p.o.length ? { o: p.o } : {}), ...(p.x.length ? { x: p.x } : {}) });
  let out = text();
  while (out.length > PREFS_MAX && (p.o.length || p.x.length)) {
    if (p.o.length > 10 || !p.x.length) p.o.pop(); else p.x.pop();
    out = text();
  }
  return out;
}

/** The weights after the learner picked (`sign` +1: Use) or turned down (−1: thumbs down) a suggestion with
 * these traits, among the others shown with it (`others`: their traits). Only what sets it apart counts: a trait
 * every one shown has says nothing about the choice. Picked: its own traits move up `step` (PREF_STEP; a
 * sound-alike of the learner's own a little more), and traits only the others have move down half that; turned
 * down: its own move down. Always within ±PREF_LIMIT. New prefs (own words and examples kept). */
export function learn(prefs, traits, sign, others = [], step = PREF_STEP) {
  const p = readPrefs(prefs);
  const everywhere = new Set((traits || []).filter((t) => others.length && others.every((o) => (o || []).includes(t))));
  const move = (t, by) => {
    p.w[t] = Math.max(-PREF_LIMIT, Math.min(PREF_LIMIT, Math.round(((p.w[t] || 0) + by) * 1000) / 1000));
    if (!p.w[t]) delete p.w[t];
  };
  for (const t of new Set(traits || [])) if (!everywhere.has(t)) move(t, sign * step);
  if (sign > 0) {
    const theirs = new Set(others.flat().filter((t) => !(traits || []).includes(t)));
    for (const t of theirs) move(t, -step / 2);
  }
  p.n++;
  return p;
}

/** What the learner's taste adds to a suggestion's place (in sound score). */
export const PREF_TOTAL = 0.2;  // the most the taste adds or takes away in all
export const prefBonus = (prefs, traits) => Math.max(-PREF_TOTAL, Math.min(PREF_TOTAL, (traits || []).reduce((n, t) => n + ((prefs && prefs.w && prefs.w[t]) || 0), 0)));

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
