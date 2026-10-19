// Bisaya (Cebuano): from a word to its root, so every form of a verb or adjective counts as one word.
//
// mokaon, mikaon, nagkaon, gikaon, kaonon -> kaon; moadto, miadto -> adto; gihatagan,
// hatagan, ihatag -> hatag; magtutudlo -> tudlo; imnon -> inom; sudlan -> sulod; motan-aw -> tan-aw;
// adlaw-adlaw -> adlaw; usang -> usa.
//
// Like Tagalog (./tagalog.js), Bisaya builds words by adding pieces to a root: prefixes for who does
// it and when (mo-/mu-, mi-/ni-, mag-/nag-/naga-, ma-/na-, maka-/naka-, gi-, i-, pa-, ka-, pag-,
// paN- and its nasal forms mang-/nang-/pang-, mam-, man- ...), suffixes (-on, -an, -hon, -han, the
// commands -a and -i), -in- after the first consonant (sinulat), a repeated first syllable
// (magtutudlo), a whole word repeated with a hyphen (adlaw-adlaw), and the linker -ng (usang).
// A suffix often drops the root's last vowel and swaps the two consonants it leaves together: inom +
// -on is imnon, sulod + -an is sudlan. The rules take those off in every order and keep the shortest
// result that is a real word in the language's word list (docs/lexicon/ceb-roots.json.gz: the 60,000
// commonest words of a large collection of Bisaya web text, made by tools/build_lemmas.py). Without
// the list a word is known by its spelling. No screen or network code here: tests/js/cebuano.test.mjs.

import { EDGE_PUNCT } from "../wordlookup.js";

const MIN_ROOT = 4; // shorter "roots" are usually particles or noise

// Longest first, so magpa- is tried before mag- and ma-.
const PREFIXES = ["nakig", "makig", "nagpaka", "magpaka", "nagpa", "magpa", "nagka", "magka", "pagka", "nanag", "manag",
  "naka", "maka", "naki", "maki", "paki", "naga", "maga", "gipa", "ipa", "mopa", "mipa", "pina", "pinaka",
  "taga", "tag", "nag", "mag", "pag", "ika", "gika", "mo", "mu", "mi", "ni", "gi", "na", "ma", "ka", "pa", "ig", "i"];
const SUFFIXES = ["anan", "hon", "han", "non", "on", "an", "ay", "ha", "hi", "a", "i"];
const COMMANDS = new Set(["a", "i", "ha", "hi"]); // basaha, hatagi: the root as it is
// Bisaya words end in a vowel or in one consonant after a vowel (ng counts as one): ingn is no word.
const SHAPE = /(?:[aeiou]|[aeiou'-][^aeiou'-]|ng)$/;
// Little words that look like roots inside longer words but are never their root.
// (kita is left out: besides "we" it is the root of makita, "to see".)
const NOT_ROOTS = new Set(["kini", "kana", "niini", "niana", "kanila", "kaniya", "kanimo", "kanato", "kanako", "nako", "nimo",
  "niya", "namo", "ninyo", "nila", "sila", "kami", "kamo", "siya", "unsa", "kinsa", "sama", "bisan", "apan", "pero",
  "unya", "karon", "lamang", "lang", "pang", "nang", "usab", "gyud", "kaayo", "kanang", "kining", "mga", "nga", "imong", "akong",
  "iyang", "ilang", "atong", "inyong", "among", "kung", "ngadto", "ngano", "ngari", "nganha", "kina", "kadto"]);
// Words that only look built from a smaller one (imong is not i + mong, kinahanglan not ka-in-hanglan,
// gihapon not gi + hapon): never taken apart.
const KEEP = new Set(["akong", "imong", "iyang", "ilang", "atong", "inyong", "among", "niini", "niana", "niadto", "kanunay",
  "kinahanglan", "gihapon", "kaayo", "karon", "unsay", "unsang", "kanang", "kining", "kanila", "kaniya", "kanimo",
  "kanato", "kanako", "kaninyo", "kanamo", "ngadto", "dinhi", "didto", "diha", "ania", "anaa", "aduna", "adunay",
  "kinsa", "pinaagi", "samtang", "hangtod", "tungod", "gikan", "ingon", "unya", "dayon", "usahay", "kasagaran",
  // and roots that other rules would cut further: sulti is not sulat + -i, hibalo not hi- + balo
  "sulti", "hibalo", "pangita", "pangutana", "tubag", "balay", "tawo", "bata", "adlaw", "gabii", "buntag", "hapon",
  "pamilya", "matang", "angay", "kasinatian", "sumala", "parehas", "tabang", "kahimtang", "lungsod", "kasingkasing",
  "ganahan", "nawong", "inahan", "amahan", "lalaki", "lalake", "lakang", "nalang", "kaniadto", "kumusta", "salamat",
  // daghan ("many") is not daga ("rat"), panahon not dahon ("leaf"), baybayon ("beach") not baboy ("pig")
  "alang", "daghan", "panahon", "butang", "kaugalingon", "babaye", "dugang", "lamang", "hinungdan", "pulong", "igsoon",
  "lig-on", "ginikanan", "kasaysayan", "sinina", "hinuon", "milyon", "kanus-a", "panapton", "mapuslanon", "tag-iya",
  "bulawan", "baybayon", "naandan", "balaan", "barangay", "tumong", "dughan", "pangulo", "kabalaka", "kabalo",
  "hamtong", "utlanan", "tinapay", "paminaw", "panguna"]);
// Forms whose root the rules can't find (pagbansay: bansay; tinun-an: tuon; pagkat-on: kat-on).
const ROOT_OF = { pagbansay: "bansay", nagbansay: "bansay", "tinun-an": "tuon", "pagkat-on": "kat-on", "makat-on": "kat-on",
  "nakat-on": "kat-on" };
const IS_PREFIX = new Set(PREFIXES);

// Verb prefixes (who does it, when) and the commands -a and -i only go on verbs: a root reached by taking
// one off must show up as a verb in the word list, in at least two of its forms (kaon: mokaon, gikaon).
// That keeps loanwords whole: mobile is not mo + bile, problema not problem + -a.
const VERB_PREFIXES = new Set(["mo", "mu", "mi", "ni", "gi", "nag", "mag", "naga", "maga", "naka", "maka", "gipa", "mopa",
  "mipa", "nagpa", "magpa", "i", "ipa"]);
const VERB_FORMS = ["mo", "mi", "gi", "nag", "mag", "ni", "mu", "naka", "maka"];

/** Every way of taking one piece off `s`: Map candidate -> true when it must be a verb root. `whole`:
 *  s is the word as written (the linker -ng only ends a whole word: tabang is not taba + -ng). */
function stripOnce(s, whole) {
  const out = new Map();
  const add = (c, verb = false) => { if (c && c !== s) out.set(c, out.has(c) ? out.get(c) && verb : verb); };
  if (whole) {
    // the linker: usang -> usa, dakong -> dako; after n it is just -g: laing -> lain
    if (/[aeiou]ng$/.test(s)) add(s.slice(0, -2));
    if (/[aeiou]ng$/.test(s)) add(s.slice(0, -1));
  }
  for (const suf of SUFFIXES) {
    if (s.length - suf.length < 3 || !s.endsWith(suf)) continue;
    const command = COMMANDS.has(suf);
    const root = s.slice(0, -suf.length);
    add(root, command);
    // A last u is written o in the root: tudluan <- tudlo, kaunon <- kaon.
    const m = root.match(/^(.*)u([^aeiou]*)$/);
    if (m) add(`${m[1]}o${m[2]}`, command);
    if (command) continue; // nothing more (sulti is not sulat + -i)
    // The root's last vowel dropped: sugd(an) <- sugod; tawh(an) <- tawo; hibal-(an) <- hibalo.
    const two = root.match(/^(.*[aeiou].*[^aeiou'-])([^aeiou'-])$/);
    if (two) for (const v of "aiou") add(`${two[1]}${v}${two[2]}`);
    if (/[^aeiou'-]$/.test(root) && suf.startsWith("h")) for (const v of "aiou") add(root + v);
    if (/-$/.test(root)) for (const v of "aiou") add(root.slice(0, -1) + v);
    // The root's last vowel dropped and the two consonants left swapped: imn(on) <- inom, sudl(an) <- sulod.
    const cc = root.match(/^(.*[aeiou])([^aeiou'-])([^aeiou'-])$/);
    if (cc) for (const v of "aiou") add(`${cc[1]}${cc[3]}${v}${cc[2]}`);
  }
  for (const pre of PREFIXES) {
    if (s.startsWith(pre) && s.length - pre.length >= 3) add(s.slice(pre.length), VERB_PREFIXES.has(pre));
  }
  // paN- and its forms swallow a root's first consonant: mangaon <- kaon, manghimo <- himo,
  // mamalit <- palit/balit, manulat <- sulat/tulat, nangadto <- adto.
  // The paN- word itself comes first: nangita, mangita -> pangita (to look for); nangutana -> pangutana.
  let m = s.match(/^([mn])(a[mn]g?)([aeiou].{2,})$/);
  if (m) add(`p${m[2]}${m[3]}`);
  m = s.match(/^([mnp])ang(.{3,})$/);
  if (m) { add(m[2]); add(`k${m[2]}`); }
  m = s.match(/^([mnp])am([aeiou].{2,})$/);
  if (m) { add(`p${m[2]}`); add(`b${m[2]}`); }
  m = s.match(/^([mnp])an([aeiou].{2,})$/);
  if (m) { add(`t${m[2]}`); add(`s${m[2]}`); add(`d${m[2]}`); }
  // -in- after the first consonant (sinulat, binuhat); before a vowel it is a prefix (inubanan).
  m = s.match(/^([^aeiou])in(.{3,})$/);
  if (m) add(m[1] + m[2]);
  m = s.match(/^in([aeiou].{2,})$/);
  if (m) add(m[1]);
  // A repeated first syllable: tutudlo -> tudlo, kakaon -> kaon.
  m = s.match(/^([^aeiou]?[aeiou])(.+)$/);
  if (m && m[2].startsWith(m[1]) && m[2].length >= 3) add(m[2]);
  return out;
}

/** The word as the list knows it: lower case, punctuation off the ends, a clipped 'y / 'g / 'ng off. */
export function cebuanoWord(token) {
  return String(token || "").normalize("NFC").toLowerCase().replace(/[’ʼ`´]/g, "'").replace(EDGE_PUNCT, "")
    .replace(/'(?:y|g|ng|t)$/, "");
}

const ranks = new WeakMap();
function rankOf(table) {
  let r = ranks.get(table);
  if (!r) { r = new Map(table.lemmas.map((w, i) => [w, i])); ranks.set(table, r); }
  return r;
}

const roots = new WeakMap(); // table -> word -> root (a text repeats its words)

/** The root of one word, or the word itself when no rule leads to a known shorter word. */
export function cebuanoRoot(word, table) {
  if (!table) return word;
  let cache = roots.get(table);
  if (!cache) { cache = new Map(); roots.set(table, cache); }
  if (!cache.has(word)) cache.set(word, findRoot(word, table));
  return cache.get(word);
}

function findRoot(word, table) {
  if (ROOT_OF[word]) return ROOT_OF[word];
  if (KEEP.has(word) || /^(.{3,})\1$/.test(word)) return word; // (hunahuna, a word said twice, is a word of its own)
  const rank = rankOf(table);
  // One piece off and it is a word never taken apart (naminaw, paminawa: paminaw; nanguna: panguna).
  const kept = [...stripOnce(word, true).keys()].find((c) => KEEP.has(c) && rank.has(c) && !NOT_ROOTS.has(c));
  if (kept) return kept;
  const verb = (c) => VERB_FORMS.filter((p) => rank.has(p + c)).length >= 2;
  const dash = word.match(/^([a-z]+)-(.{3,})$/);
  if (dash) {
    // A whole word said twice (adlaw-adlaw, hinay-hinay): the word once.
    if (dash[1] === dash[2]) return cebuanoRoot(dash[1], table);
    // A prefix joined with a hyphen before a vowel (pag-abot, mag-uban, nag-ingon): the word is what follows.
    if (IS_PREFIX.has(dash[1]) || /^[mnp]a[gn]+$/.test(dash[1])) return cebuanoRoot(dash[2], table);
  }
  // The linker on a word the list knows: taken off before anything else. After n it is just -g
  // (karong -> karon, laing -> lain), after a vowel -ng (usang -> usa, dakong -> dako).
  // Of the two, the commoner word (tawong: tawo, not tawon; unang: una, not unan "pillow").
  if (/[aeiou]ng$/.test(word) && word.length > 4 && !NOT_ROOTS.has(word)) {
    const base = [word.slice(0, -1), word.slice(0, -2)].filter((b) => rank.has(b)).sort((a, b) => rank.get(a) - rank.get(b))[0];
    if (base) return cebuanoRoot(base, table);
  }
  const valid = new Map(); // a real word reached -> whether it can be taken further to another real word
  const seen = new Set([word]);
  let frontier = [word];
  for (let depth = 0; depth < 5 && frontier.length && seen.size < 500; depth++) {
    const next = [];
    for (const s of frontier) {
      for (const [c, mustBeVerb] of stripOnce(s, depth === 0)) {
        const real = c.length >= MIN_ROOT && SHAPE.test(c) && rank.has(c) && !NOT_ROOTS.has(c) && !IS_PREFIX.has(c)
          && (!mustBeVerb || verb(c));
        if (real && valid.has(s)) valid.set(s, true); // s leads on to a smaller real word
        if (seen.has(c)) continue;
        seen.add(c);
        if (real) valid.set(c, false);
        if (!(real && KEEP.has(c))) next.push(c); // a word that is never taken apart ends the search here
      }
    }
    frontier = next;
  }
  // Of the real words that can't be taken further (mokaon -> kaon), one never taken apart wins
  // (nangita: pangita, not kita), else the commonest.
  let best = null;
  const better = (c) => !best || (KEEP.has(c) !== KEEP.has(best) ? KEEP.has(c) : rank.get(c) < rank.get(best));
  for (const [c, further] of valid) if (!further && better(c)) best = c;
  return best || word;
}

/** The lexeme of one Bisaya word: {key, lemma, pos, root}, or null for something that isn't a word. */
export function cebuanoLexeme(token, table = null) {
  const word = cebuanoWord(token);
  if (!/\p{L}/u.test(word)) return null;
  const root = cebuanoRoot(word, table);
  return { key: `ceb|${root}|x`, lemma: root, pos: "", root: root !== word ? root : "" };
}
