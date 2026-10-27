// How alike two pronunciations sound: the Mnemonic maker's check that a keyword really sounds like the
// word being learned (review/mnemonic.js). The owner found the AI's sound-alikes "really bad": models
// confidently offer words that don't sound like the word at all, so each one is measured here, in code.
//
// A pronunciation (IPA, as the AI or the CMU Pronouncing Dictionary writes it) becomes a list of sounds
// in a small alphabet (`phones`). Two lists are compared with a weighted edit distance: changing one
// sound into a close one costs little (p/b, t/d, k/g, s/z/θ, any r for any other r, a long vowel for
// its short one, vowels by how high and how far back they are said), into a far one a lot, and leaving
// a sound out or adding one costs according to how much it is heard (a schwa, an h or a glottal stop
// little; a full consonant a lot). The stressed syllable and the first sound of what is matched count
// more. `match` tries the keyword against every run of the word's syllables (a keyword may sound like
// only part of a long word) and says how much of the word it covers.
//
// No page code: tested on its own (tests/js/phonemes.test.mjs, with an evaluation set of published
// keyword-method examples and of bad pairs).

// ---------- the alphabet ----------
// Vowels: [height 0 (close, i) .. 1 (open, a), backness 0 (front) .. 1 (back), rounded 0/1].
const VOWELS = {
  i: [0, 0, 0], y: [0, 0, 1], ɨ: [0, 0.5, 0], ʉ: [0, 0.5, 1], ɯ: [0, 1, 0], u: [0, 1, 1],
  ɪ: [0.17, 0.15, 0], ʏ: [0.17, 0.15, 1], ʊ: [0.17, 0.85, 1],
  e: [0.33, 0, 0], ø: [0.33, 0, 1], ɘ: [0.4, 0.5, 0], ɵ: [0.4, 0.5, 1], ɤ: [0.33, 1, 0], o: [0.33, 1, 1],
  ə: [0.5, 0.5, 0],
  ɛ: [0.67, 0, 0], œ: [0.67, 0, 1], ɜ: [0.67, 0.5, 0], ɞ: [0.67, 0.5, 1], ʌ: [0.72, 0.6, 0], ɔ: [0.67, 1, 1],
  æ: [0.85, 0.05, 0], ɐ: [0.83, 0.5, 0],
  a: [1, 0.4, 0], ɶ: [1, 0, 1], ɑ: [1, 1, 0], ɒ: [1, 1, 1],
};
const REDUCED = new Set(["ə", "ɐ", "ɪ", "ʊ", "ɨ"]);  // short, unstressed-sounding vowels: little is lost without them

// Consonants: [place, manner, voiced]. Place: 0 lips .. 3 tooth ridge .. 7 soft palate .. 10 glottis.
const C = (place, manner, voiced) => [place, manner, voiced];
const CONSONANTS = {
  p: C(0, "stop", 0), b: C(0, "stop", 1), t: C(3, "stop", 0), d: C(3, "stop", 1), ʈ: C(4.5, "stop", 0), ɖ: C(4.5, "stop", 1),
  c: C(5.5, "stop", 0), ɟ: C(5.5, "stop", 1), k: C(7, "stop", 0), ɡ: C(7, "stop", 1), q: C(8, "stop", 0), ɢ: C(8, "stop", 1),
  ʔ: C(10, "stop", 0),
  m: C(0, "nasal", 1), ɱ: C(1, "nasal", 1), n: C(3, "nasal", 1), ɳ: C(4.5, "nasal", 1), ɲ: C(5.5, "nasal", 1),
  ŋ: C(7, "nasal", 1), ɴ: C(8, "nasal", 1),
  ɸ: C(0, "fric", 0), β: C(0, "fric", 1), f: C(1, "fric", 0), v: C(1, "fric", 1), θ: C(2, "fric", 0), ð: C(2, "fric", 1),
  s: C(3, "fric", 0), z: C(3, "fric", 1), ʃ: C(4, "fric", 0), ʒ: C(4, "fric", 1), ʂ: C(4.5, "fric", 0), ʐ: C(4.5, "fric", 1),
  ɕ: C(4.5, "fric", 0), ʑ: C(4.5, "fric", 1), ç: C(5.5, "fric", 0), ʝ: C(5.5, "fric", 1), x: C(7, "fric", 0), ɣ: C(7, "fric", 1),
  χ: C(8, "fric", 0), ħ: C(9, "fric", 0), ʕ: C(9, "fric", 1), h: C(10, "fric", 0), ɦ: C(10, "fric", 1),
  tʃ: C(4, "affr", 0), dʒ: C(4, "affr", 1), ts: C(3, "affr", 0), dz: C(3, "affr", 1), tɕ: C(4.5, "affr", 0), dʑ: C(4.5, "affr", 1),
  tʂ: C(4.5, "affr", 0), dʐ: C(4.5, "affr", 1), pf: C(1, "affr", 0),
  r: C(3, "rhotic", 1), ɾ: C(3, "rhotic", 1), ɹ: C(3, "rhotic", 1), ɻ: C(4.5, "rhotic", 1), ɽ: C(4.5, "rhotic", 1),
  ʀ: C(8, "rhotic", 1), ʁ: C(8, "rhotic", 1),
  l: C(3, "lateral", 1), ɫ: C(3, "lateral", 1), ɭ: C(4.5, "lateral", 1), ʎ: C(5.5, "lateral", 1), ʟ: C(7, "lateral", 1),
  j: C(5.5, "glide", 1), w: C(0, "glide", 1), ɥ: C(5.5, "glide", 1), ʋ: C(1, "glide", 1), ɰ: C(7, "glide", 1),
};
const BREATHY = new Set(["h", "ɦ", "ʔ", "ʕ", "ħ"]);  // heard faintly by most learners: cheap to leave out, close to each other

// How far apart two manners of making a consonant are (0 the same .. 1 nothing alike).
const MANNER = {
  "stop|affr": 0.3, "stop|fric": 0.45, "affr|fric": 0.3, "nasal|stop": 0.6, "rhotic|lateral": 0.35, "glide|rhotic": 0.5,
  "glide|lateral": 0.45, "fric|glide": 0.55, "fric|rhotic": 0.55, "rhotic|stop": 0.55, "fric|lateral": 0.65,
  "lateral|nasal": 0.65, "glide|stop": 0.7, "affr|glide": 0.7, "lateral|stop": 0.7, "affr|rhotic": 0.7, "affr|lateral": 0.75,
  "nasal|rhotic": 0.7, "glide|nasal": 0.7, "affr|nasal": 0.75, "fric|nasal": 0.75,
};
const mannerGap = (a, b) => (a === b ? 0 : MANNER[[a, b].sort().join("|")] ?? 0.8);

// Marks an IPA string may carry that change nothing here: aspiration, emphasis (ˤ), palatal and
// labial colouring, tones and tone letters, voicing and placement marks, digits (pinyin's tones).
const SKIP = new Set(Array.from("ʰʷʲˠˤ˞ʼ˥˦˧˨˩↗↘0123456789")
  .concat(Array.from({ length: 0x70 }, (_, i) => String.fromCharCode(0x300 + i)).filter((c) => c !== "̃" && c !== "̯" && c !== "͡" && c !== "͜"))
  .concat(Array.from({ length: 0x40 }, (_, i) => String.fromCharCode(0x1DC0 + i))));
const TIE = new Set(["͡", "͜"]);  // t͡ʃ: two letters, one sound
const AFFRICATES = new Set(["tʃ", "dʒ", "tɕ", "dʑ", "tʂ", "dʐ"]);  // written together without a tie bar too
const TIED_ONLY = new Set(["ts", "dz", "pf"]);                      // only with one (cats is k æ t s)

/**
 * The sounds of an IPA string, in order: [{s, long, weak, stress, boundary}] (`s` a letter of the
 * alphabet above; `stress` on the first sound after ˈ; `boundary` where a syllable or word starts).
 * Doubled letters become one long one (nijja: n i jː a), aɪ / oʊ / eɪ become a vowel and a glide,
 * a nasal vowel (ɑ̃) a vowel and a faint n, ɚ / ɝ a vowel and an r.
 */
export function phones(ipa) {
  const s = String(ipa ?? "").normalize("NFD").toLowerCase()
    .replace(/g/g, "ɡ").replace(/ɚ/g, "əɹ").replace(/ɝ/g, "ɜɹ").replace(/ɫ/g, "l")
    .replace(/ʤ/g, "dʒ").replace(/ʧ/g, "tʃ").replace(/ʦ/g, "t͡s").replace(/ʣ/g, "d͡z");
  const chars = Array.from(s);
  const out = [];
  let stress = false, boundary = true;
  const push = (sym) => {
    const prev = out[out.length - 1];
    // aɪ, aʊ, eɪ, oʊ, ɔɪ: the second part is a glide (unless a syllable starts between them). After e
    // and o it is only how English says a plain e or o (say, tow), so it is faint.
    let weak = false;
    if (prev && !boundary && VOWELS[prev.s] && (sym === "ɪ" || sym === "ʊ")) {
      weak = (prev.s === "e" && sym === "ɪ") || (prev.s === "o" && sym === "ʊ");
      sym = sym === "ɪ" ? "j" : "w";
    }
    // A doubled letter is one long sound; so is a consonant that ends one word and starts the next
    // ("eye yo" is said aɪjoʊ).
    if (prev && prev.s === sym && !prev.weak && (!boundary || !VOWELS[sym])) prev.long = true;
    else out.push({ s: sym, long: false, weak, stress, boundary });
    stress = false;
    boundary = false;
  };
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "ˈ" || ch === "'") { stress = true; boundary = true; continue; }
    if ("ˌ.-‿/[]()|".includes(ch) || /\s/.test(ch)) { boundary = true; continue; }
    if (ch === "ː" || ch === "ˑ" || ch === ":") { if (out.length) out[out.length - 1].long = true; continue; }
    const last = out[out.length - 1];
    if (ch === "̃") { // a nasal vowel: the vowel, then a faint n
      if (last && VOWELS[last.s]) out.push({ s: "n", long: false, weak: true, stress: false, boundary: false });
      continue;
    }
    if (ch === "̯") { // i̯ u̯ (not a syllable of its own): a glide
      if (last && "iɪy".includes(last.s)) last.s = "j";
      else if (last && "uʊo".includes(last.s)) last.s = "w";
      continue;
    }
    if (SKIP.has(ch) || TIE.has(ch)) continue;
    // Two letters for one sound: tʃ, dʒ, and with a tie bar t͡s, d͡z, p͡f.
    const tied = TIE.has(chars[i + 1]);
    const next = tied ? chars[i + 2] : chars[i + 1];
    if (next && (AFFRICATES.has(ch + next) || (tied && TIED_ONLY.has(ch + next)))) { push(ch + next); i += tied ? 2 : 1; continue; }
    if (VOWELS[ch] || CONSONANTS[ch]) push(ch);
  }
  return out;
}

/**
 * The sounds of a word written in Latin letters (a romanization: "niyya", "sakana", "shmetter"), worked
 * out roughly from its spelling. For when no IPA came: never as good as IPA.
 */
export function letterPhones(text) {
  let s = String(text ?? "").normalize("NFD").toLowerCase();
  // ʿ ʾ in romanized Arabic; the long-vowel bar (ā) as a doubled vowel.
  s = s.replace(/[ʿʕ‘]/g, "ʕ").replace(/[ʾʔ’']/g, "ʔ").replace(/([aeiou])̄/g, "$1$1").replace(/[̀-ͯ]/g, "");
  const RULES = [["tch", "tʃ"], ["sch", "ʃ"], ["sh", "ʃ"], ["ch", "tʃ"], ["th", "θ"], ["dh", "ð"], ["ph", "f"], ["kh", "x"], ["gh", "ɣ"],
    ["zh", "ʒ"], ["ng", "ŋ"], ["ck", "k"], ["qu", "kw"], ["ee", "iː"], ["oo", "uː"], ["ou", "u"], ["ai", "aj"], ["ay", "aj"],
    ["ei", "ej"], ["ey", "ej"], ["oi", "oj"], ["oy", "oj"], ["au", "aw"], ["aw", "ɔ"], ["c", "k"], ["q", "q"], ["x", "ks"],
    ["j", "dʒ"], ["y", "j"], ["g", "ɡ"]];
  let ipa = "";
  for (let i = 0; i < s.length;) {
    const rule = RULES.find(([from]) => s.startsWith(from, i));
    if (rule) { ipa += rule[1]; i += rule[0].length; continue; }
    const ch = s[i++];
    ipa += /[a-zʕʔ]/.test(ch) ? ch : /[\s.-]/.test(ch) ? "." : "";
  }
  return phones(ipa);
}

// ---------- how far apart two sounds are ----------
const isVowel = (p) => !!VOWELS[p.s];

/** 0 (the same sound) .. 1 (nothing alike). */
export function soundGap(a, b) {
  const va = VOWELS[a.s], vb = VOWELS[b.s];
  if (va && vb) {
    if (a.s === b.s) return a.long === b.long ? 0 : 0.06;
    let d = 0.75 * Math.abs(va[0] - vb[0]) + 0.45 * Math.abs(va[1] - vb[1]) + 0.2 * Math.abs(va[2] - vb[2]);
    if (a.s === "ə" || b.s === "ə") d *= 0.6;  // a schwa is near every vowel
    return Math.min(0.95, d) + (a.long === b.long ? 0 : 0.06);
  }
  const ca = CONSONANTS[a.s], cb = CONSONANTS[b.s];
  if (ca && cb) {
    if (a.s === b.s) return a.long === b.long ? 0 : 0.04;
    if (ca[1] === "rhotic" && cb[1] === "rhotic") return 0.1;  // an r is an r, rolled, tapped or in the throat
    if (BREATHY.has(a.s) && BREATHY.has(b.s)) return 0.18;
    if (ca[1] === "glide" && cb[1] === "glide") return 0.5;  // y and w are not alike
    const d = 0.55 * mannerGap(ca[1], cb[1]) + 0.3 * Math.min(1, Math.abs(ca[0] - cb[0]) / 5) + 0.15 * (ca[2] === cb[2] ? 0 : 1);
    return Math.max(0.12, Math.min(1, d));
  }
  // A glide and its vowel: j ~ i, w ~ u.
  const pair = (va ? b.s : a.s) + (va ? a.s : b.s);
  if (/^j[iɪye]$/.test(pair)) return 0.25;
  if (/^w[uʊo]$/.test(pair)) return 0.3;
  return 1;
}

/** What leaving a sound out (or adding one) costs. */
export function dropCost(p) {
  if (p.weak) return 0.2;
  if (isVowel(p)) return REDUCED.has(p.s) && !p.long ? 0.35 : 0.55;
  if (BREATHY.has(p.s)) return 0.3;
  const c = CONSONANTS[p.s];
  if (c && c[1] === "glide") return 0.35;
  if (c && c[1] === "rhotic") return 0.45;
  return 0.65;
}

/**
 * How alike a keyword's sounds are to some of the word's sounds: 0..1. `weights` gives each of the
 * word's sounds its weight (the stressed syllable and the first sound weigh more), 1 when absent.
 */
export function similarity(keyword, target, weights = null) {
  const n = target.length, m = keyword.length;
  if (!n || !m) return 0;
  const w = (i) => (weights ? weights[i] : 1);
  // Edit distance: the cheapest way to turn the word's sounds into the keyword's.
  let prev = new Array(m + 1).fill(0);
  for (let j = 1; j <= m; j++) prev[j] = prev[j - 1] + dropCost(keyword[j - 1]);
  for (let i = 1; i <= n; i++) {
    const cur = new Array(m + 1);
    cur[0] = prev[0] + w(i - 1) * dropCost(target[i - 1]);
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.min(
        prev[j - 1] + w(i - 1) * soundGap(target[i - 1], keyword[j - 1]),
        prev[j] + w(i - 1) * dropCost(target[i - 1]),
        cur[j - 1] + dropCost(keyword[j - 1]),
      );
    }
    prev = cur;
  }
  // Against the cost of having nothing in common (every sound left out and every other one added).
  let most = 0;
  for (let i = 0; i < n; i++) most += w(i) * dropCost(target[i]);
  for (const p of keyword) most += dropCost(p);
  return Math.max(0, 1 - STRICT * (prev[m] / most));
}
// How hard a difference counts: with 1, sounds that are all different but each "a vowel for a vowel"
// would still look half alike.
const STRICT = 1.6;

// ---------- a keyword against a word ----------
export const STRESS_WEIGHT = 0.5;  // extra weight on each sound of the stressed syllable
export const FIRST_WEIGHT = 0.6;   // and on the first sound of what is matched

/**
 * The word to match against, from the AI's (or the dictionary's) pronunciation: its syllables'
 * sounds and which syllable is stressed. `syllables` is [{text, ipa}] (or just IPA strings); without
 * IPA for a syllable, its text is read as letters. Returns {syllables: [[phone]], stress} or null.
 */
export function wordSounds(syllables, stress = -1) {
  const list = (Array.isArray(syllables) ? syllables : []).map((x) => {
    const ipa = typeof x === "string" ? x : x && x.ipa;
    const text = typeof x === "string" ? "" : x && x.text;
    const ps = ipa ? phones(ipa) : letterPhones(text || "");
    return ps.length ? ps : letterPhones(text || "");
  }).filter((ps) => ps.length);
  if (!list.length) return null;
  // A doubled consonant split between two syllables (nij|ja, ut|tʃɛl|lo) is one long sound, in the
  // second syllable.
  for (let k = 0; k + 1 < list.length; k++) {
    const end = list[k][list[k].length - 1], start = list[k + 1][0];
    if (list[k].length > 1 && !VOWELS[end.s] && (end.s === start.s || (end.s === "t" && start.s === "tʃ") || (end.s === "d" && start.s === "dʒ"))) {
      list[k].pop();
      start.long = true;
    }
  }
  const s = Number.isInteger(stress) && stress >= 0 && stress < list.length ? stress : -1;
  return { syllables: list, stress: s };
}

/**
 * How well a keyword (its sounds, `phones`) sounds like `word` (wordSounds): tried against every run
 * of the word's syllables, best first. {score 0..1, from, to (syllables matched, inclusive), coverage
 * (how much of the word that run is)}. A keyword that sounds like only part of the word scores less.
 */
export function match(keyword, word) {
  const best = { score: 0, from: 0, to: 0, coverage: 0, sound: 0 };
  if (!word || !keyword || !keyword.length) return best;
  const syl = word.syllables;
  // Each sound's weight in the whole word (for how much of it a run covers).
  const whole = [];
  syl.forEach((ps, k) => ps.forEach((p, i) => whole.push(1 + (k === word.stress ? STRESS_WEIGHT : 0) + (k === 0 && i === 0 ? FIRST_WEIGHT : 0))));
  const total = whole.reduce((a, b) => a + b, 0);
  let start = 0;
  const starts = syl.map((ps) => { const at = start; start += ps.length; return at; });
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
      const coverage = covered / total;
      const sound = similarity(keyword, target, weights);
      const score = sound * (0.35 + 0.65 * coverage);
      if (score > best.score) Object.assign(best, { score, from: a, to: b, coverage, sound });
    }
  }
  return best;
}

// What the learner is told about a keyword's sound: "close" (it sounds like the word, most of it),
// "partial" (like a good part of it, or roughly like it), or "" (too far off: not shown). `coverage`
// is match's: how much of the word the keyword sounds like.
export const CLOSE = 0.72;
export const PASS = 0.5;
export const CLOSE_COVERAGE = 0.75;
export const soundLabel = (score, coverage = 1) => (score >= CLOSE && coverage >= CLOSE_COVERAGE ? "close" : score >= PASS ? "partial" : "");
