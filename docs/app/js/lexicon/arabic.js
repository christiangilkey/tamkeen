// Arabic: from a word as it is written to its dictionary form (lemma).
//
// وكتبوا، يكتبون and سأكتبها are all the verb كَتَب. To know that, each word goes through:
//   1. normalize   strip vowel marks and tatweel, unify the alef forms (for matching only: what is
//                  shown on screen is never changed);
//   2. segment     try every split into attached pieces + stem + attached pieces
//                  (و، ف، ب، ل، ال، س ... and the pronouns ـها، ـهم ...);
//   3. analyze     keep the splits a dictionary allows, each giving a lemma, part of speech and root;
//   4. choose      settle ambiguity (كتب: "he wrote" or "books"?) from how common each reading is,
//                  how the word was spelled, and the words around it.
//
// Steps 2 and 3 are the table-lookup method of the CAMeL Tools analyzer (MIT licence,
// https://github.com/CAMeL-Lab/camel_tools, camel_tools/morphology/analyzer.py), using that
// project's databases cut down to what this needs (tools/build_lexicon.py writes the files).
// Step 4 is Tamkeen's own and much simpler than CAMeL's trained models.
//
// No screen or network code here: tests/js/lexicon.test.mjs runs it as is.
//
// A dictionary file (docs/lexicon/ar-<name>.json.gz) holds:
//   prefixes, suffixes  {form: [category, affix, category, affix, ...]}
//   stems               {form: [category, lexeme, cost, spelling, ...]}   (four numbers per reading)
//   affix               [[part of speech it forces or "", its clitics "wa_conj+Al_det", how it is spelled]]
//   lex                 [[lemma, part of speech, root]]
//   raw                 stem spellings that differ from their key (hamzas, ة, ى); 0 = same as the key
//   ab, bc, ac          which prefix/stem, stem/suffix and prefix/suffix categories go together
//   cost                tenths of a negative log probability from CAMeL's corpus counts; 990 = never seen

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // vowel marks, Quranic marks, tatweel
const RUN = /[ء-غف-يٱ-ۓ]+/g;              // a run of Arabic letters
const UNSEEN = 990;

/** A word as normally written: no vowel marks or tatweel. Keeps hamzas, ة and ى. */
export const spelled = (word) => String(word || "").normalize("NFC").replace(MARKS, "").replace(/ٱ/g, "ا");

/** The form used for matching: alef forms unified (أ إ آ -> ا), and ى -> ي, ة -> ه as CAMeL's keys are. */
export const matchForm = (word) => spelled(word).replace(/[آأإ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");

/** The Arabic word inside a token ("«الكتاب،" -> "الكتاب"), or "" when it has none (numbers, Latin). */
export function arabicCore(token) {
  const runs = spelled(token).match(RUN);
  if (!runs) return "";
  return runs.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Part of speech, coarsely. The four dictionaries don't tag alike (noun or adjective? particle
 * or preposition?), so a lexeme is identified by one of these broad classes instead. */
export function posClass(pos) {
  if (pos === "verb") return "v";
  if (pos === "noun_prop") return "pn";
  if (/^(noun|adj|adv)/.test(pos || "")) return "n";
  return "fw"; // function words: prepositions, particles, conjunctions, pronouns
}

/** The key a lexeme is stored and looked up by: lemma (normalized) + broad part of speech. */
export const lexemeKey = (lemma, cls) => `ar|${matchForm(lemma)}|${cls}`;

export class Dictionary {
  constructor(data) {
    if (!data || data.format !== 1) throw new Error("This dictionary file is from a different version of the app.");
    this.name = data.name;
    this.data = data;
    this.ab = data.ab.map((a) => new Set(a));
    this.bc = data.bc.map((a) => new Set(a));
    this.ac = data.ac.map((a) => new Set(a));
  }

  /** Every reading this dictionary allows for a word (in matching form):
   * [{lex, pos, cost, pre, suf, spelled}] where pre/suf are the attached pieces' names. */
  readings(form) {
    const { prefixes, suffixes, stems, affix, lex, raw, maxPrefix, maxSuffix } = this.data;
    const out = [];
    const n = form.length;
    for (let p = 0; p <= Math.min(maxPrefix, n - 1); p++) {
      const P = prefixes[form.slice(0, p)];
      if (!P) continue;
      for (let s = Math.max(1, n - p - maxSuffix); s <= n - p; s++) {
        const X = suffixes[form.slice(p + s)];
        if (!X) continue;
        const stem = form.slice(p, p + s);
        const S = stems[stem];
        if (!S) continue;
        for (let a = 0; a < P.length; a += 2) {
          const ab = this.ab[P[a]];
          const ac = this.ac[P[a]];
          const pre = affix[P[a + 1]];
          for (let b = 0; b < S.length; b += 4) {
            if (!ab.has(S[b])) continue;
            const bc = this.bc[S[b]];
            const entry = lex[S[b + 1]];
            for (let c = 0; c < X.length; c += 2) {
              if (!bc.has(X[c]) || !ac.has(X[c])) continue;
              const suf = affix[X[c + 1]];
              out.push({
                lemma: entry[0], pos: pre[0] || suf[0] || entry[1], root: entry[2], cost: S[b + 2],
                pre: pre[1], suf: suf[1], spelled: pre[2] + (S[b + 3] ? raw[S[b + 3]] : stem) + suf[2], dict: this.name,
              });
            }
          }
        }
      }
    }
    return out;
  }
}

// ---------- choosing between readings ----------

const HAMZAS = "آأإ";
/** How badly a reading's spelling disagrees with what was written (0 = the same letters).
 * Leaving a hamza off is normal; writing ة where the reading wants ه is not. */
function spellingCost(written, reading, loose) {
  if (written === reading) return 0;
  if (written.length !== reading.length) return 1.5;
  let cost = 0;
  for (let i = 0; i < written.length; i++) {
    const w = written[i];
    const r = reading[i];
    if (w === r) continue;
    if (w === "ا" && HAMZAS.includes(r)) cost += 0.3;
    else if (HAMZAS.includes(w) && r === "ا") cost += 1.5;
    else if (HAMZAS.includes(w) && HAMZAS.includes(r)) cost += 3;
    else if (w === "ه" && r === "ة") cost += loose ? 1 : 2; // ه for ة: usual in dialect writing, rare in formal
    else if (w === "ة" && r === "ه") cost += 4;
    else if (w === "ي" && r === "ى") cost += 0.4;
    else if (w === "ى" && r === "ي") cost += 1.2;
    else cost += 2;
  }
  return cost;
}

const count = (clitics) => (clitics ? clitics.split("+").length : 0);

// Words that say what kind of word comes next (in matching form).
const BEFORE_VERB = new Set(["قد", "لقد", "لم", "لن", "سوف", "لما", "كي", "لكي"]);
const BEFORE_NOUN = new Set(["هذا", "هذه", "ذلك", "تلك", "هولاء", "اولئك", "هذان", "هاتان", "كل", "بعض", "اي", "غير", "يا"]);
const ENDS_CLAUSE = /[.!?؟؛،,;:…]["'»”’)\]]*$/u;

/** How likely a reading is, as a score (higher is better), before looking at the words around it.
 * Costs are tenths of a negative log probability, so a score is roughly "minus the number of
 * decimal places of rarity": -2 is an everyday word, -9 one the corpus never met. */
function baseScore(r, written, active) {
  const cls = posClass(r.pos);
  const seen = r.cost < UNSEEN;
  let score;
  if (r.dict === "msa") score = seen ? -r.cost / 10 : cls === "v" ? -10 : -9;
  // The Egyptian counts come from a smaller corpus, so the same word costs about 3 more there.
  else if (r.dict === "egy") score = active === "egy" ? (seen ? 3 - r.cost / 10 : -8.5) : (seen ? -r.cost / 10 : -9) - 2.5;
  // Gulf and Levantine come with no counts, but every entry was met in real dialect text. Where
  // the text is in that dialect they are trusted (their everyday function words most of all);
  // elsewhere they are a last resort.
  else if (active === r.dict) score = cls === "fw" ? -2 : -3.5;
  else score = -9.5;
  const pre = count(r.pre) - (/Al_det/.test(r.pre) ? 1 : 0); // a leading ال is hardly ever anything else
  const suf = count(r.suf);
  if (!pre && !suf && cls === "fw") score += 1.2; // أنا is far likelier "I" than أنّ + ـنا
  if (cls === "pn") score -= 1;                   // a name only when nothing commoner fits
  return score - 0.8 * pre - 1.2 * suf - spellingCost(written, r.spelled, !!active);
}

/** What the word before says about this one. `prev` = {form, cls, pos, bare} of the word before. */
function contextScore(cls, prev, r) {
  const verbal = cls === "v";
  const nominal = cls === "n" || cls === "pn";
  // A sentence likes to open with its verb, bare or behind "and"/"so" (وكتب الطالب ...).
  if (!prev) return verbal && r.cost < UNSEEN && (!r.pre || /^(wa|fa)_[a-z]+$/.test(r.pre)) ? 1 : 0;
  if (prev.pos === "prep" && prev.bare) return verbal ? -4 : nominal ? 2 : 0;       // في كتب: books
  if (BEFORE_VERB.has(prev.form)) return verbal ? 3 : nominal ? -4 : 0;              // قد كتب: wrote
  if (BEFORE_NOUN.has(prev.form)) return verbal ? -3 : nominal ? 1.5 : 0;            // هذه كتب: books
  return 0;
}

// Everyday words that give a dialect away (in matching form). Iraqi and Maghrebi have no
// dictionary; Iraqi leans on the Gulf one, its nearest neighbour.
const MARKERS = {
  lev: "هون هلق هلا شو بدي بدك بدو بدها بدنا بدكم بدهم هيك كتير منيح منيحه هاد هاي هدول ليش لسا مو عم اشي هيدا هيدي هلا لهيك شلون كيفك هديك قديش ايمتي وين",
  egy: "مش عايز عاوز عايزه عاوزه ده دي دول ازاي كده اوي قوي دلوقتي النهارده عشان علشان بتاع بتاعه ايه فين ليه برضه خالص بقي لسه اهو كمان مفيش ماشي امبارح",
  glf: "شلون شلونك وايد الحين ابي ابغي يبي تبي زين شنو وش مب موب هالحين كذا شخبارك عقب توني اكو ماكو شكو هوايه هسه يمعود",
};
const MARKER_OF = new Map();
for (const [name, words] of Object.entries(MARKERS)) {
  for (const w of words.split(" ")) MARKER_OF.set(w, [...(MARKER_OF.get(w) || []), name]);
}

/**
 * Which dialect a text is in, if any: the one whose giveaway words turn up most. `forms` are
 * the words in matching form; returns "egy" | "lev" | "glf" | "" (Standard, or too little to tell).
 */
export function dialectOf(forms, dicts) {
  const have = new Set(dicts.map((d) => d.name));
  const hits = {};
  let total = 0;
  for (const form of forms) {
    if (!form) continue;
    total++;
    const names = MARKER_OF.get(form) || MARKER_OF.get(form.replace(/^[وف]/, ""));
    for (const name of names || []) if (have.has(name)) hits[name] = (hits[name] || 0) + 1 / names.length;
  }
  let best = "";
  for (const name of Object.keys(hits)) if (hits[name] > (hits[best] || 0)) best = name;
  // One giveaway is enough in a single sentence; a long text needs them to keep coming.
  return best && hits[best] >= Math.max(1, total * 0.01) ? best : "";
}

function readingsOf(form, dicts, cache) {
  let all = cache.get(form);
  if (!all) {
    all = [];
    for (const d of dicts) for (const r of d.readings(form)) all.push(r);
    cache.set(form, all);
  }
  return all;
}

// The personal pronouns, which the dictionaries' counts get wrong more than anything else
// (أنا read as أنّ + ـنا, هي as a verb): matching form -> lemma.
const PRONOUNS = new Map(Object.entries({
  "انا": "أَنا", "نحن": "نَحْنُ", "احنا": "إِحْنا", "انت": "أَنْتَ", "انتي": "أَنْتِ", "انتم": "أَنْتُم", "انتو": "أَنْتُو",
  "انتوا": "أَنْتُو", "هو": "هُوَ", "هي": "هِيَ", "هم": "هُم", "هما": "هُما", "هن": "هُنَّ", "هوه": "هُوَ", "هيه": "هِيَ",
}));

// Everyday words whose usual reading the counts rank too low: the counts are of lemmas, not of
// spellings, so كل comes out as أَكَل (eat), لكن as لِ, قبل as قَبِل (accepted), أكثر as كَثُر.
// A reading with one of these lemmas, as that kind of word (noun-like "n", function word "fw",
// verb "v"), gets a bonus; a word that clearly wants a verb before it (قد، لم ...) can still turn
// it into one. Some are only in the Egyptian dictionary (قَبْل, كُلّ, لَيْسَ): they are every
// dialect's words, so there its count is taken as it is, for the word without a pronoun on it.
const nfc = (s) => String(s || "").normalize("NFC"); // the files don't all put shadda and fatha in one order
const EVERYDAY = new Map([["كُلّ", "n"], ["لٰكِن", "fw"], ["لٰكِنَّ", "fw"], ["قَبْل", "n"], ["مِثْل", "n"], ["حَوْل", "n"],
  ["نَحْو", "n"], ["ضِمْن", "n"], ["دُون", "n"], ["أَلْف", "n"], ["أَكْثَر", "n"], ["أَكْبَر", "n"], ["أَفْضَل", "n"],
  ["شُكْراً", "n"], ["لَيْسَ", "v"], ["كَلّا", "fw"], ["بِن", "n"]].map(([lemma, cls]) => [nfc(lemma), cls]));
const EVERYDAY_BONUS = 2.5;
const EGY_AS_OWN = 5.5; // the difference baseScore makes between Egyptian text and other text

function everydayBonus(r, cls, active) {
  if (EVERYDAY.get(nfc(r.lemma)) !== cls) return 0;
  return EVERYDAY_BONUS + (r.dict === "egy" && active !== "egy" && r.cost < UNSEEN && !r.suf ? EGY_AS_OWN : 0);
}

const PROCLITICS = /^([وف])?(بال|كال|لل|ال)?/;
const ENCLITICS = /(ها|هم|هن|كم|نا)$/;

/** A word no dictionary knows (a name, a rare or dialect word): take off the pieces that are
 * clearly attached (و، ف، ال، بال، لل ... and the longer pronouns) and use what is left as its
 * dictionary form. A lone ب، ل، ك or ـه، ـك، ـي is left alone: on an unknown word it is as likely
 * to be part of the word itself. */
export function fallbackStem(form) {
  let stem = form;
  const m = stem.match(PROCLITICS);
  if (m && m[0] && stem.length - m[0].length >= 3) stem = stem.slice(m[0].length);
  else if (m && m[1] && stem.length - 1 >= 3) stem = stem.slice(1);
  const e = stem.match(ENCLITICS);
  if (e && stem.length - e[0].length >= 3) stem = stem.slice(0, -e[0].length);
  return stem;
}

/**
 * The lexeme of every word in a text. `tokens` are the words as shown (punctuation attached is
 * fine); `dicts` the loaded dictionaries, Standard Arabic first.
 * Returns one entry per token: {key, lemma, pos, root} or null (not an Arabic word).
 */
export function analyzeArabic(tokens, dicts) {
  const cache = new Map();
  const cores = tokens.map(arabicCore);
  const forms = cores.map((c) => (c ? matchForm(c) : ""));
  const active = dialectOf(forms, dicts);
  const out = [];
  let prev = null;
  for (let i = 0; i < tokens.length; i++) {
    const form = forms[i];
    if (!form) { out.push(null); prev = null; continue; }
    // وأنا: "and I" (not فهم, "understood": the two-letter ones are left to the dictionaries).
    const pronoun = PRONOUNS.has(form) ? form : /^[وف]/.test(form) && form.length > 3 && PRONOUNS.has(form.slice(1)) ? form.slice(1) : "";
    if (pronoun) {
      out.push({ key: `ar|${pronoun}|fw`, lemma: PRONOUNS.get(pronoun), pos: "pron", root: "" });
      prev = { form, cls: "fw", pos: "pron", bare: true };
      if (ENDS_CLAUSE.test(String(tokens[i]))) prev = null;
      continue;
    }
    // Readings that are the same lexeme stand together: the best of them speaks for it.
    const byKey = new Map();
    for (const r of readingsOf(form, dicts, cache)) {
      const cls = posClass(r.pos);
      const key = lexemeKey(r.lemma, cls);
      const score = baseScore(r, cores[i], active) + contextScore(cls, prev, r) + everydayBonus(r, cls, active);
      const have = byKey.get(key);
      if (!have || score > have.score) byKey.set(key, { key, score, cls, r });
    }
    let best = null;
    for (const c of byKey.values()) if (!best || c.score > best.score) best = c;
    if (best) {
      out.push({ key: best.key, lemma: best.r.lemma, pos: best.r.pos, root: best.r.root });
      prev = { form, cls: best.cls, pos: best.r.pos, bare: !best.r.suf };
    } else {
      const stem = fallbackStem(form);
      out.push({ key: `ar|${stem}|x`, lemma: stem, pos: "", root: "" });
      prev = { form, cls: "x", pos: "", bare: true };
    }
    if (ENDS_CLAUSE.test(String(tokens[i]))) prev = null; // nothing carries over a comma or full stop
  }
  return out;
}
