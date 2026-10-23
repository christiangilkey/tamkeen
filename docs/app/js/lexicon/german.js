// German: from a word as it is written to its dictionary form (lemma), with separable verbs and compound words.
//
// Häuser -> Haus; fängt -> fangen; musste, mußte -> müssen; im -> in; gibt's -> geben; mir -> ich.
//
//   1. capitals  are kept: they tell a noun from another word (das Essen "food", essen "to eat"). At the
//                start of a sentence, where every word has one, the other word is tried first.
//   2. spelling  today's (musste, Fluss), the one from before 1996 (mußte, Fluß) and Switzerland's ss for
//                ß (Strasse, gross) all find the word; so do ae, oe, ue written for ä, ö, ü (fuer, Muenchen).
//   3. separable verbs: in "Der Film fängt um acht an" the verb's prefix stands at the end of the clause;
//                fängt and an are both anfangen (separablePairs). A prefix joined on in a form the table
//                doesn't know (rumhängt) is taken off and put back on the verb's dictionary form.
//   4. compounds: a long word the table doesn't have is taken apart into the words it is made of, with the
//                joining letters German puts between them (Arbeit-s-amt, Kinder-garten, Schul-buch):
//                Handschuhfabriken is Hand + Schuh + Fabrik, and its dictionary form Handschuhfabrik.
//
// The table (docs/lexicon/de-lemmas.json.gz, made by tools/build_lemmas.py) keys forms as they are written,
// capitals and all; its dictionary forms come commonest first (`ranked`), which compound splitting uses to
// prefer everyday words. Without the table a word is known by its spelling. No screen or network code here:
// tests/js/german.test.mjs.

import { EDGE_PUNCT } from "../wordlookup.js";

const APOSTROPHES = /[’ʼ`´]/g;

// Words the table gets wrong or leaves out. Its list folds every personal pronoun into "ich" (ihm, wir,
// sie -> ich): each person is its own word here. A preposition joined with the article (im, zum, beim)
// is the preposition. And some everyday short forms (hab, nich, nix).
const OWN = {
  ich: "ich", mich: "ich", mir: "ich", du: "du", dich: "du", dir: "du", er: "er", ihn: "er", ihm: "er",
  sie: "sie", ihnen: "sie", es: "es", wir: "wir", uns: "wir", ihr: "ihr", euch: "ihr", man: "man",
  im: "in", ins: "in", am: "an", ans: "an", zum: "zu", zur: "zu", vom: "von", beim: "bei", aufs: "auf",
  durchs: "durch", fürs: "für", ums: "um", übers: "über", unters: "unter", vors: "vor", hinters: "hinter",
  hab: "haben", nich: "nicht", nix: "nichts", daß: "dass", gern: "gern", gerne: "gern",
};
// Possessives: each person's is its own word (the list reads ihre, unsere as ich).
for (const [stem, lemma] of [["mein", "mein"], ["dein", "dein"], ["sein", "sein"], ["ihr", "ihr"], ["unser", "unser"],
  ["eur", "euer"], ["euer", "euer"], ["unsr", "unser"]]) {
  for (const end of ["e", "en", "em", "er", "es"]) OWN[stem + end] ??= lemma;
}
Object.assign(OWN, { mein: "mein", dein: "dein", euer: "euer", unser: "unser" });

/** The word as the table knows it: NFC, one kind of apostrophe, punctuation off the ends, capitals kept;
 * a joined "es" off (gibt's -> gibt, wie's -> wie), and the short forms 's, 'n, 'ne as es and ein. */
export function germanWord(token) {
  const raw = String(token || "").normalize("NFC").replace(APOSTROPHES, "'");
  const lead = /^\P{L}*'(?=\p{L})/u.test(raw); // 's, 'n, 'ne: a word with its start left off
  let w = raw.replace(EDGE_PUNCT, "");
  if (lead && /^s$/i.test(w)) return "es";
  if (lead && /^n(e|en|em|er)?$/i.test(w)) return "ein";
  if (/^\p{L}{2,}'s$/u.test(w)) w = w.slice(0, -2); // gibt's, geht's, hab's
  return w;
}

const lowerFirst = (w) => w.charAt(0).toLowerCase() + w.slice(1);
const upperFirst = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const isCapital = (w) => /^\p{Lu}/u.test(w);

/** The ways of writing a word to try, best first (1 and 2 above). At the start of a sentence the word in
 * small letters comes first (Aber, Ich, Haben: aber, ich, haben), unless the table says the capitalised one
 * is the commoner (`capsFirst`: Zeit, not the preposition zeit). */
function casings(w, initial, table = null) {
  const low = w.toLowerCase();
  if (w.length > 1 && w === w.toUpperCase() && w !== low) return [low, upperFirst(low)]; // ALL CAPITALS (a heading)
  const nounFirst = !initial || (isCapital(w) && table && table.capsFirst && table.capsFirst.has(lowerFirst(w)));
  return [...new Set(nounFirst ? [w, lowerFirst(w), upperFirst(w), low] : [lowerFirst(w), w, upperFirst(w), low])];
}
function spellings(w) {
  const out = [w];
  if (w.includes("ß")) out.push(w.replace(/ß/g, "ss"));
  if (w.includes("ss")) out.push(w.replace(/ss/g, "ß"));
  if (!/[äöüÄÖÜ]/.test(w) && /[aouAOU]e/.test(w)) {
    out.push(w.replace(/([aouAOU])e/g, (m, v) => ({ a: "ä", o: "ö", u: "ü", A: "Ä", O: "Ö", U: "Ü" }[v])));
  }
  return out;
}

/** The dictionary form of a word as written, if the table knows it in one of its casings: null if not. */
function lookupCased(w, table, initial) {
  for (const v of casings(w, initial, table)) {
    const l = table.lookup(v);
    if (l) return l;
  }
  return null;
}
/** ... or in another spelling (2). */
export function lookupGerman(w, table, initial = true) {
  for (const s of spellings(w)) {
    const l = lookupCased(s, table, initial);
    if (l) return l;
  }
  return null;
}

// ---------- 3: separable verbs ----------

// The prefixes that come off a verb and go to the end of the clause (anfangen: fängt … an).
export const PARTICLES = new Set(("ab an auf aus bei dar durch ein empor entgegen entlang fern fest fort frei heim her " +
  "heran herauf heraus herbei herein herüber herum herunter hervor hin hinab hinauf hinaus hinein hinüber hinunter " +
  "hinzu hoch kennen los mit nach nieder statt teil um voran voraus vorbei vorüber vor weg weiter wieder zu zurecht " +
  "zurück zusammen zuvor rein raus rauf runter rüber rum dran drauf drin fertig kaputt bereit").split(" "));
const PARTICLES_LONGEST = [...PARTICLES].sort((a, b) => b.length - a.length);
// Words that start a new clause: a prefix before one of them ends its clause (… rufe dich an und …).
const CLAUSE_START = new Set(["und", "oder", "aber", "sondern", "denn", "doch", "dass", "daß", "weil", "wenn", "ob", "als",
  "obwohl", "damit", "bevor", "nachdem", "während", "sodass", "falls", "sobald", "solange", "indem", "bis"]);
const CLAUSE_END = /[.!?,;:…)\]"»«“”–—]['"”’»«)]*$/u;
const VERB_SHAPE = /^\p{Ll}.*(?:en|ern|eln|n)$/u; // a verb's dictionary form: lower case, -en / -ern / -eln / -n
const BACK = 12; // words a prefix may stand after its verb

/** Separable verbs whose prefix stands apart: [[verb index, prefix index, the verb's dictionary form]].
 * `words` are the clean words (germanWord), `lemmas` each one's dictionary form (null for no word), and
 * `isVerb(lemma)` says whether a prefix + verb is a verb (anfangen yes, anden no). */
export function separablePairs(words, lemmas, isVerb, tokens = words) {
  const out = [];
  const low = words.map((w) => String(w || "").toLowerCase());
  const word = (i) => /\p{L}/u.test(words[i] || "");
  // (punctuation standing on its own, as in "fängt um acht an ." or a sentence split for the popup, ends it too)
  const ends = (i) => i === words.length - 1 || CLAUSE_END.test(String(tokens[i] || "")) || CLAUSE_START.has(low[i + 1])
    || (!word(i + 1) && CLAUSE_END.test(String(tokens[i + 1] || "")));
  for (let p = 1; p < words.length; p++) {
    // (a prefix is written in lower case; "An" in the middle of a sentence is something else)
    if (!PARTICLES.has(low[p]) || !ends(p) || isCapital(words[p])) continue;
    for (let v = p - 1; v >= Math.max(0, p - BACK); v--) {
      if (!word(v)) { if (CLAUSE_END.test(String(tokens[v] || ""))) break; continue; }
      if (ends(v)) break; // (another clause)
      const lemma = lemmas[v];
      if (!lemma || !VERB_SHAPE.test(lemma) || PARTICLES.has(low[v])) continue;
      const verb = low[p] + lemma;
      if (isVerb(verb)) { out.push([v, p, verb]); break; }
    }
  }
  return out;
}

/** `isVerb` for separablePairs from the word table: a verb it has, and not a rare one (wir essen zusammen is
 * "we eat together", not the rare zusammenessen; the table's place says how common a verb is). */
export const tableVerb = (table) => {
  const rank = rankOf(table);
  return (verb) => table.isLemma.has(verb) && (!table.ranked || rank(verb) < 40000);
};

/** A form with a separable prefix joined on that the table doesn't know as a whole (rumhängt, rumgehangen):
 * the prefix + the dictionary form of the rest, when that rest is a verb's form. */
function joinedPrefix(w, table) {
  if (isCapital(w)) return null;
  for (const p of PARTICLES_LONGEST) {
    if (!w.startsWith(p) || w.length - p.length < 3) continue;
    const rest = w.slice(p.length);
    // (rumzuhängen: the zu of the infinitive sits between the prefix and the verb)
    for (const part of rest.startsWith("zu") && rest.length > 5 ? [rest.slice(2), rest] : [rest]) {
      const verb = lookupGerman(part, table, false);
      if (verb && VERB_SHAPE.test(verb)) return p + verb;
    }
  }
  return null;
}

// ---------- 4: compound words ----------

// What German puts between the parts of a compound (Arbeit-s-amt, Sonne-n-schein, Kind-er-garten, Hund-e-hütte).
const LINKS = ["s", "es", "n", "en", "er", "e", "ns"];
const MAX_PARTS = 4;

/**
 * A compound word's parts, or null: [{text, lemma}], `text` as written in the word, `lemma` its dictionary
 * form. `known(piece, capital)` gives the dictionary form of a piece of the word written with a capital
 * (Garten) or without (garten, which is a form of garen "to cook slowly"), or null; `rank(lemma)` how common
 * it is (0 the commonest). The split with the fewest parts wins, everyday words before rare ones; the last
 * part (the one the word is) must be a real word as it is written there (Fabriken: Fabrik), the others may
 * lose a joining letter (Arbeits: Arbeit) or a final -e (Schul: Schule), or be a verb's stem (Wasch: waschen).
 * The parts of a noun are read as nouns first; a word in small letters (hellblauen) ends in what it is
 * (blau), unless that would be a verb (kindergarten in captions written in small letters: Garten, not garen).
 */
export function compoundParts(word, known, rank = () => 0) {
  const w = String(word || "");
  const noun = isCapital(w);
  const front = (piece) => known(piece, true) || known(piece, false); // a part before the last
  const head = (piece) => {
    const cap = known(piece, true);
    const low = known(piece, false);
    if (noun) return cap || low;
    return low && !VERB_SHAPE.test(low) ? low : cap || low;
  };
  if (w.includes("-")) { // E-Mail-Adresse, Corona-Krise: the hyphens show the parts
    const pieces = w.split("-").filter(Boolean);
    if (pieces.length < 2) return null;
    const parts = pieces.map((piece, i) => {
      const lemma = i === pieces.length - 1 ? head(piece) : front(piece) || front(`${piece}e`);
      return { text: piece, lemma: lemma || piece, known: !!lemma };
    });
    if (!parts[parts.length - 1].known) return null;
    return parts.map(({ text, lemma }) => ({ text, lemma }));
  }
  const n = w.length;
  if (n < 6 || !/^\p{L}+$/u.test(w)) return null;
  const common = (lemma) => (rank(lemma) < 60000 ? 0 : 0.5);
  const short = (piece, lemma) => piece.length > 3 || rank(lemma) < 20000; // (3-letter parts: everyday words only)
  // How w.slice(i, j) can be a part (its best reading), and what it costs.
  const reading = (i, j) => {
    const piece = w.slice(i, j);
    const last = j === n;
    if (piece.length < 3) return null;
    const whole = last ? head(piece) : front(piece);
    if (whole && short(piece, whole)) return { text: piece, lemma: whole, cost: 1 + common(whole) };
    if (last) return null;
    for (const link of LINKS) {
      if (piece.length - link.length < 3 || !piece.toLowerCase().endsWith(link)) continue;
      const bare = piece.slice(0, -link.length);
      const stem = front(bare);
      if (stem && short(bare, stem)) return { text: piece, lemma: stem, cost: 1.1 + common(stem) };
    }
    const dropped = front(`${piece}e`); // Schul-buch, Erdbeer-kuchen
    if (dropped && rank(dropped) < 60000) return { text: piece, lemma: dropped, cost: 1.2 };
    for (const end of ["en", "n"]) { // Wasch-maschine, Lese-buch: a verb's stem
      const verb = known(`${piece.toLowerCase()}${end}`, false);
      if (verb && VERB_SHAPE.test(verb) && rank(verb) < 60000) return { text: piece, lemma: verb, cost: 1.3 };
    }
    return null;
  };
  const best = new Array(n + 1).fill(null);
  best[0] = { parts: [], cost: 0 };
  for (let j = 3; j <= n; j++) {
    for (let i = 0; i <= j - 3; i++) {
      if (!best[i] || best[i].parts.length >= MAX_PARTS || (i === 0 && j === n)) continue;
      const r = reading(i, j);
      if (!r) continue;
      const cost = best[i].cost + r.cost;
      if (!best[j] || cost < best[j].cost - 1e-9) best[j] = { parts: [...best[i].parts, { text: r.text, lemma: r.lemma }], cost };
    }
  }
  const found = best[n];
  return found && found.parts.length >= 2 ? found.parts : null;
}

/** The dictionary form of a compound from its parts: the word with its last part in dictionary form, a
 * noun's with a capital (Handschuhfabriken -> Handschuhfabrik; hellblauen -> hellblau; E-Mail-Adressen ->
 * E-Mail-Adresse: written with hyphens, it keeps them). */
export function compoundLemma(parts, word = "") {
  const head = parts[parts.length - 1].lemma;
  if (String(word).includes("-")) return [...parts.slice(0, -1).map((p) => p.text), head].join("-");
  const front = parts.slice(0, -1).map((p) => p.text).join("").toLowerCase();
  return isCapital(head) ? upperFirst(front + head.toLowerCase()) : front + head;
}

/** How common a dictionary form is, from the table's order (0 the commonest; Infinity: not in it). */
export const rankOf = (table) => (lemma) => {
  if (!table || !table.ranked) return 0;
  if (!table.rank) table.rank = new Map(table.lemmas.map((l, i) => [l, i]));
  return table.rank.has(lemma) ? table.rank.get(lemma) : Infinity;
};
/** `known` for compoundParts from the word table. */
export const tableKnows = (table) => (piece, capital) => {
  const low = piece.toLowerCase();
  return table.lookup(capital ? upperFirst(low) : low);
};

// ---------- the lexemes ----------

/** The dictionary form of one word, or null for something that isn't a word. `initial`: the word starts a
 * sentence (or nothing says it doesn't), so its capital may be only the sentence's. */
const memo = new WeakMap(); // table -> Map(word + initial -> dictionary form): a text repeats its words
export function germanLemma(token, table = null, initial = true) {
  const w = germanWord(token);
  if (!/\p{L}/u.test(w)) return null;
  const own = OWN[w.toLowerCase()];
  // (Sie, Ihr, Ihre in the middle of a sentence are "you", "your" said politely: still sie, ihr)
  if (own && (initial || !isCapital(w) || /^(sie|ihr\p{L}*)$/iu.test(w))) return own;
  if (!table) return w.toLowerCase();
  if (!memo.has(table)) memo.set(table, new Map());
  const seen = memo.get(table);
  const id = `${initial ? 1 : 0}${w}`;
  if (seen.has(id)) return seen.get(id);
  let found = lookupGerman(w, table, initial) || joinedPrefix(w, table);
  if (!found) {
    const parts = compoundParts(w, tableKnows(table), rankOf(table));
    found = parts ? compoundLemma(parts, w) : w.toLowerCase();
  }
  if (seen.size > 50000) seen.clear();
  seen.set(id, found);
  return found;
}

const lexeme = (lemma, root = "") => (lemma ? { key: `de|${lemma}|x`, lemma, pos: "", root } : null);

/** The lexeme of one word on its own: {key, lemma, pos, root}, or null. */
export function germanLexeme(token, table = null, initial = true) {
  return lexeme(germanLemma(token, table, initial));
}

const SENTENCE_END = /[.!?…]['"”’»«)\]]*$/u;
/** Does token i start a sentence (the first word, after . ! ? or with an opening quote)? */
export const startsSentence = (tokens, i) => i === 0 || SENTENCE_END.test(String(tokens[i - 1] || "")) || /^["„“«»(\[]/u.test(String(tokens[i] || ""));

/**
 * The lexemes of a run of German text: {key, lemma, pos, root} per token, or null for something that isn't
 * a word. Both parts of a separable verb share its lexeme (fängt … an: anfangen).
 */
export function germanLexemes(tokens, table = null) {
  const words = tokens.map(germanWord);
  const lemmas = tokens.map((t, i) => germanLemma(t, table, startsSentence(tokens, i)));
  const lex = lemmas.map((l) => lexeme(l));
  if (table) {
    for (const [v, p, verb] of separablePairs(words, lemmas, tableVerb(table), tokens)) {
      const x = { key: `de|${verb}|x`, lemma: verb, pos: "verb", root: `${words[p].toLowerCase()} + ${lemmas[v]}` };
      lex[v] = x;
      lex[p] = x;
    }
  }
  return lex;
}

/** For the word popup: the separable verb word `index` of a sentence is part of, or null:
 * {lemma: "anfangen", verb: "fängt", particle: "an"}. `lemmaOf(word, initial)` and `isVerb(lemma)` come from
 * whatever dictionaries are here (the word table, the meanings file). */
export function separableAt(tokens, index, lemmaOf, isVerb) {
  const words = tokens.map(germanWord);
  const lemmas = tokens.map((t, i) => (/\p{L}/u.test(words[i]) ? lemmaOf(words[i], startsSentence(tokens, i)) : null));
  for (const [v, p, verb] of separablePairs(words, lemmas, isVerb, tokens)) {
    if (v === index || p === index) return { lemma: verb, verb: words[v], particle: words[p].toLowerCase() };
  }
  return null;
}
