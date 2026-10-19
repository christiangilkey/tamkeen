// Tagalog: from a word to its root, so every form of a verb or adjective counts as one word.
//
// kumain, kakain, kinain, kumakain, kinakain -> kain; nagluto, magluluto -> luto; sinabi,
// sasabihin -> sabi; umalis, aalis -> alis; basahin, binasa -> basa; nilinis -> linis; walang -> wala.
//
// Tagalog builds words by adding pieces to a root: prefixes (mag-, nag-, pag-, ma-, ka-, i-,
// ipag-, maka-, mang- ...), infixes after the first consonant (-um-, -in-), suffixes (-an, -in,
// -han, -hin), a repeated first syllable for actions not yet finished (kakain, magluluto), and
// the linker -ng (magandang). The rules below take those off in every order and keep the
// shortest result that is a real word in the language's word list (docs/lexicon/tl-roots.json.gz,
// wordfreq's Filipino list, made by tools/build_lemmas.py). Without the list a word is known by
// its spelling. No screen or network code here: tests/js/tagalog.test.mjs.

import { EDGE_PUNCT } from "../wordlookup.js";

const VOWEL = /^[aeiou]$/;
const MIN_ROOT = 4; // shorter "roots" are usually particles or noise (ma + hal is not mahal)

// Longest first, so magpa- is tried before mag- and ma-.
const PREFIXES = ["pakikipag", "makapag", "nakapag", "ipinag", "ipinang", "pinaka", "makiki", "nakiki", "magpa", "nagpa",
  "magka", "nagka", "pagka", "ipag", "ipang", "pinag", "maka", "naka", "paka", "maki", "naki", "paki", "mapa", "napa",
  "taga", "mag", "nag", "pag", "ipa", "pina", "ika", "tag", "ma", "na", "pa", "ka", "i"];
const SUFFIXES = ["han", "hin", "nan", "nin", "an", "in"];
// Little words that look like roots inside longer words but never are their root (kinain is not kina).
const NOT_ROOTS = new Set(["kina", "sina", "nina", "kanila", "sila", "sana", "kaya", "para", "pala", "nila", "kami", "tayo",
  "kayo", "siya", "nito", "niya", "lang", "naman", "pero", "kung", "nang", "ngayon"]);
// Common words that only look built from a smaller one, never taken apart: naman is not nami + -an,
// upang not upa + -ng, noon not noo ("forehead"), lalaki ("man") not laki ("size"), bayan not bayo.
// (The first line are little words: a longer word is never built on one of them, mahabang is mahaba + -ng.)
const LITTLE = new Set(`naman namin natin amin atin akin inyo kanila ninyo sakin parin rin din nalang lamang upang
  hanggang habang noon ngayon minsan kailan kasing malamang`.trim().split(/\s+/));
const KEEP = new Set(`${[...LITTLE].join(" ")} kailangan kahapon kaibigan katawan kapatid pamilya kapamilya tagalog
  manila numero bayan laban hangin tahanan kasalanan karapatan tiyan larangan nakaraan pamahalaan pamamaraan
  mamamayan kamatayan maliban panaginip maging naging magiging nagiging pagiging galing magaling tanong tulong
  tingin maaari mayroon pangalan lalaki lalake panahon pagkakataon ikalawa layunin laman
  paraan ilalim ibabaw paniwala kapangyarihan`.trim().split(/\s+/));
// Forms whose root the rules can't tell from a likelier-looking one (namatay: patay, not batay "basis").
const ROOT_OF = { namatay: "patay", mamatay: "patay", pumatay: "patay", pinatay: "patay", naninirahan: "tira",
  nanirahan: "tira", manirahan: "tira", tingnan: "tingin", tignan: "tingin", palitan: "palit", malaman: "alam",
  nalaman: "alam", malalaki: "laki", bigyan: "bigay", binigyan: "bigay", naniniwala: "paniwala", maniwala: "paniwala",
  naniwala: "paniwala", paniniwala: "paniwala" };
// Tagalog words end in a vowel or in one consonant after a vowel (ng counts as one): mins is no word.
const SHAPE = /(?:[aeiou]|[aeiou'-][^aeiou'-]|ng)$/;

/** Every way of taking one piece off `s`. */
function stripOnce(s) {
  const out = [];
  // (The linker -ng only ends a whole word: findRoot takes it off first. Inside the search it
  // would turn dating into dati and tulong into tulo.)
  for (const suf of SUFFIXES) {
    if (s.length - suf.length < 3 || !s.endsWith(suf)) continue;
    const root = s.slice(0, -suf.length);
    out.push(root);
    // A last o turns to u before a suffix: inumin <- inom, putulin <- putol, turuan <- turo.
    const m = root.match(/^(.*)u([^aeiou]*)$/);
    if (m) out.push(`${m[1]}o${m[2]}`);
    // Some roots lose their last vowel before a suffix: bilhin <- bili, gawin <- gawa, dalhin <- dala.
    if (!/[aeiou]$/.test(root)) for (const v of "aiou") out.push(root + v);
  }
  for (const pre of PREFIXES) {
    if (s.startsWith(pre) && s.length - pre.length >= 3) out.push(s.slice(pre.length));
  }
  // mang-/mam-/man- (and nang-, nam-, nan-) swallow a root's first consonant: mamili <- bili/pili,
  // manalo <- talo, mangisda <- isda.
  let m = s.match(/^([mn])ang(.{3,})$/);
  if (m) out.push(m[2], `k${m[2]}`);
  m = s.match(/^([mn])am([aeiou].{2,})$/);
  if (m) out.push(`p${m[2]}`, `b${m[2]}`);
  m = s.match(/^([mn])an([aeiou].{2,})$/);
  if (m) out.push(`t${m[2]}`, `s${m[2]}`, `d${m[2]}`);
  // -um- and -in- after the first consonant (kumain, kinain); before a vowel they are prefixes
  // (umalis, inalis); before l, y, w -in- is written ni- (nilinis).
  m = s.match(/^([^aeiou])(um|in)(.{2,})$/);
  if (m) out.push(m[1] + m[3]);
  m = s.match(/^(um|in)([aeiou].{2,})$/);
  if (m) out.push(m[2]);
  m = s.match(/^ni([lyw].{3,})$/);
  if (m) out.push(m[1]);
  // A repeated first syllable: kakain -> kain, luluto -> luto, aalis -> alis.
  m = s.match(/^([^aeiou]?[aeiou])(.+)$/);
  if (m && m[2].startsWith(m[1]) && m[2].length >= 3) out.push(m[2]);
  return out;
}

/** The word as the list knows it: lower case, punctuation off the ends, a clipped 't / 'y off. */
export function tagalogWord(token) {
  return String(token || "").normalize("NFC").toLowerCase().replace(/[’ʼ`´]/g, "'").replace(EDGE_PUNCT, "")
    .replace(/'(?:[ty]|ng)$/, ""); // ako't, ano'ng
}

const ranks = new WeakMap();
function rankOf(table) {
  let r = ranks.get(table);
  if (!r) { r = new Map(table.lemmas.map((w, i) => [w, i])); ranks.set(table, r); }
  return r;
}

const roots = new WeakMap(); // table -> word -> root (a text repeats its words)

/** The root of one word, or the word itself when no rule leads to a known shorter word. */
export function tagalogRoot(word, table) {
  if (!table) return word;
  let cache = roots.get(table);
  if (!cache) { cache = new Map(); roots.set(table, cache); }
  if (!cache.has(word)) cache.set(word, findRoot(word, table));
  return cache.get(word);
}

function findRoot(word, table) {
  if (ROOT_OF[word]) return ROOT_OF[word];
  if (KEEP.has(word)) return word;
  const rank = rankOf(table);
  // One piece off and it is a word never taken apart (tumulong: tulong, before tumulo + -ng; tinanong: tanong).
  const kept = stripOnce(word).find((c) => KEEP.has(c) && !LITTLE.has(c));
  if (kept) return kept;
  // A prefix joined with a hyphen (nag-aaral, pinag-usapan, mag-aral): the word is what follows.
  const dash = word.match(/^([a-z]+)-(.{3,})$/);
  if (dash && (PREFIXES.includes(dash[1]) || /^[mnp]a[gn]+$/.test(dash[1]))) return tagalogRoot(dash[2], table);
  // The linker on a word the list knows, taken off before anything else: -ng after a vowel (walang ->
  // wala, isang -> isa), -g after n (noong -> noon, aking -> akin). Of the two, the commoner word; and
  // only a word about as common as the linked one (upang is a word, not upa "rent" + -ng).
  if (/[aeiou]ng$/.test(word) && word.length > 4) {
    const base = [word.slice(0, -2), word.slice(0, -1)].filter((b) => rank.has(b))
      .sort((a, b) => rank.get(a) - rank.get(b))[0];
    if (base && (!rank.has(word) || rank.get(base) < 12 * rank.get(word) + 100)) return tagalogRoot(base, table);
  }
  const valid = new Map(); // a real word reached -> whether it can be taken further to another real word
  const seen = new Set([word]);
  let frontier = [word];
  for (let depth = 0; depth < 5 && frontier.length && seen.size < 400; depth++) {
    const next = [];
    for (const s of frontier) {
      for (const c of stripOnce(s)) {
        const real = c.length >= MIN_ROOT && SHAPE.test(c) && rank.has(c) && !NOT_ROOTS.has(c) && !PREFIXES.includes(c);
        if (real && valid.has(s)) valid.set(s, true); // s leads on to a smaller real word
        if (seen.has(c)) continue;
        seen.add(c);
        if (!(real && KEEP.has(c))) next.push(c); // a word that is never taken apart ends the search here
        if (real) valid.set(c, false);
      }
    }
    frontier = next;
  }
  // Of the real words that can't be taken further (kumakain -> kakain -> kain: kain), the commonest
  // wins (maganda: ganda, not mag + anda).
  // A word never taken apart wins over the others (kinakailangan: kailangan, not ilang).
  let best = null;
  const better = (c) => !best || (KEEP.has(c) !== KEEP.has(best) ? KEEP.has(c) : rank.get(c) < rank.get(best));
  for (const [c, further] of valid) if (!further && better(c)) best = c;
  return best || word;
}

/** The lexeme of one Tagalog word: {key, lemma, pos, root}, or null for something that isn't a word. */
export function tagalogLexeme(token, table = null) {
  const word = tagalogWord(token);
  if (!/\p{L}/u.test(word)) return null;
  const root = tagalogRoot(word, table);
  return { key: `tl|${root}|x`, lemma: root, pos: "", root: root !== word ? root : "" };
}
