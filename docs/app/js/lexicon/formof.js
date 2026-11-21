// "Form-of" meanings: Wiktionary often says what form a word is instead of what it means ("active participle of
// اِبْتَلَّ (ibtalla)", "plural of كِتَاب", "verbal noun of صَامَ", "post-1990 spelling of flûte", "gerund of ir"). The
// owner, 2026-11-20: "Some words give a description of the word instead of an actual definition, such as this one telling
// me it's an active participle of another word. I just [want the] translation."
//
// This file reads such a line (which word it points to, what form, any meaning it gives in brackets) and makes the
// English for that form from the other word's meaning ("to write" -> "writing", "written"; "book" -> "books"; "big" ->
// "bigger"). meaningdata.js translatedForms puts it together. Pure: no files, no screen. Shared by every device.

// Words that only say what form a word is ("third-person plural preterite indicative", "active participle").
const GRAMMAR_WORDS = new Set(("active passive present past perfect perfective imperfective participle participles verbal "
  + "noun adjective adjectival adverbial plural singular dual paucal feminine masculine neuter common definite indefinite "
  + "construct state nominative accusative genitive dative ablative vocative instrumental locative prepositional oblique "
  + "direct case first second third first-person second-person third-person person tense aspect mood indicative subjunctive "
  + "imperative conditional jussive optative preterite pluperfect imperfect future aorist gerund gerundive infinitive "
  + "inflection inflected form forms spelling spellings alternative variant obsolete archaic dated rare nonstandard "
  + "misspelling informal colloquial elative comparative superlative degree diminutive augmentative synonym abbreviation "
  + "contraction clipping short long full romanization transliteration simplified traditional standard prescribed "
  + "pre-reform post-1990 pre-1990 reformed broken sound polite plain negative positive past-tense non-past "
  + "masculine/feminine and or").split(" "));
// A line that ends in one of these before "of" says what form a word is, whoever's spelling it is ("Brazilian
// Portuguese standard spelling of", "Marche, Milan, Rome, and Venice form of di") when the word it points to is in the
// dictionary.
const FORM_HEAD = new Set(["form", "forms", "spelling", "spellings", "variant", "synonym", "romanization", "transliteration",
  "abbreviation", "contraction", "clipping"]);
// The grammar words that really name a form (not "state", "first", "full", "standard": "state of emergency").
const STRONG = /^(?:participles?|verbal|plural|singular|dual|paucal|feminine|masculine|neuter|nominative|accusative|genitive|dative|ablative|vocative|instrumental|locative|prepositional|oblique|(?:first|second|third)-person|preterite|pluperfect|imperfect|aorist|subjunctive|indicative|imperative|jussive|optative|conditional|gerund|gerundive|infinitive|inflection|inflected|forms?|spellings?|variant|misspelling|elative|comparative|superlative|diminutive|augmentative|synonym|abbreviation|contraction|clipping|romanization|transliteration|construct|definite|indefinite|tense|aspect)$/;
// (never "a form of", "any form of", "the plural of" a thing: that is a meaning: "a Korean form of underfloor heating")
const STARTS_A_MEANING = /^(?:a|an|the|any|one|some|each|every|kind|type|sort|piece|part)\b/i;

/**
 * What a "form-of" line says: {head, kind, target, said, own} or null when it is a meaning.
 *   head    the line without the meaning it gives in brackets ("active participle of اِبْتَلَّ (ibtalla)")
 *   kind    "ing" (verbal noun, gerund, active or present participle), "ed" (passive or past participle), "plural",
 *           "comparative", "superlative", "elative" (both), or "same" (another spelling, a feminine, a case, a verb's
 *           person and tense, a diminutive: the other word's meaning as it is)
 *   target  the word it points to, as written ("اِبْتَلَّ")
 *   said    the meaning the line gives itself, if any ("king" in "Judeo-Arabic spelling of مَلِك (malik, “king”)",
 *           "having fallen in love" after a colon, "36th" before "; abbreviation of trigésimo sexto")
 *   own     `said` is this word's meaning (before the note or after a colon), not the other word's (in curly quotes)
 * `known(target)` says whether the dictionary has the word (needed for lines that are not all grammar words).
 */
export function readFormOf(gloss, known = () => false) {
  const text = String(gloss ?? "").trim();
  if (!text || text.length > 200) return null;
  // (the prefix is read with its notes in brackets off: "pre-reform spelling (used until 1943 in Brazil) of grátis")
  const flat = text.replace(/\s*\([^()]*\)/g, "").replace(/\s+/g, " ");
  const m = /^(.{1,90}?) (?:of|for) (\S[^(,;:]*?)\s*(?=[(,;:]|$)/u.exec(flat);
  if (!m) return null;
  let prefix = m[1].trim();
  let target = m[2].trim().replace(/[.。]+$/, "");
  // (a word the dictionary has, of what follows "of": "peru under the Orthographic Agreement of 1931" is peru;
  // "compiere and compire" is compiere; 頭髮 of "頭髮 /头发"; never a contraction's first word, "ta and ikaw", nor the
  // first word of a name, "National Power Corporation")
  if (target && !known(target)) {
    const spelled = target.split(/\s*\/\s*/).find((t) => t && known(t));
    const words = target.split(/\s+/);
    if (spelled) target = spelled;
    else if (!/contraction/i.test(prefix) && words.length > 1 && /^(?:and|or|under|in|with|as|when|which|used|meaning|from)$/.test(words[1])
      && known(words[0])) target = words[0];
  }
  // (an affix's line: "short form for nakig-", "variant of -ский": grammar, kept as it is)
  if (!target || /^-|-$/.test(target)) return null;
  const wordsOf = (p) => p.toLowerCase().split(/[\s,/]+/).filter(Boolean);
  const isGrammar = (ws) => ws.length > 0 && ws.every((w) => GRAMMAR_WORDS.has(w) || /^(?:\d+|[\d-]+)$/.test(w));
  // (all grammar words, one of them saying what form: "state of matter", "first of all", "standard of living" are
  // meanings; "short for X" is a form only of a word the dictionary has)
  const formWords = (ws) => isGrammar(ws) && (ws.some((w) => STRONG.test(w)) || (/^short(?: form)?$/.test(ws.join(" ")) && known(target)))
    && !ws.every((w) => w === "and" || w === "or" || w === "noun" || w === "form" || w === "forms");
  const anyones = (ws) => ws.length > 0 && FORM_HEAD.has(ws[ws.length - 1]) && known(target);
  // A meaning before the note ("me; post preposition form of jo", "36th; abbreviation of trigésimo sexto", "DNA,
  // synonym of Desoxyribonukleinsäure", "turf, lawn, rare spelling of كازون", "Laozi. alternative spelling of …"): that is
  // the word's meaning, and the rest is what form it is.
  let lead = "";
  const cut = /^(.*[;:.])\s*([^;:.]+)$/u.exec(prefix);
  const comma = /^(.*),\s*([^,]+)$/u.exec(prefix);
  if (cut && (formWords(wordsOf(cut[2])) || anyones(wordsOf(cut[2])))) [lead, prefix] = [cut[1], cut[2].trim()];
  else if (comma && formWords(wordsOf(comma[2]))) [lead, prefix] = [comma[1], comma[2].trim()];
  lead = lead.replace(/[;:.,\s]+$/u, "").trim();
  if (/^(?:only )?used\b|^see\b/i.test(lead) || lead.length > 60 || !/\p{L}/u.test(lead)) lead = "";
  if (STARTS_A_MEANING.test(prefix)) return null;
  const words = wordsOf(prefix);
  if (!words.length || words.length > 9) return null;
  if (!formWords(words) && !(!isGrammar(words) && anyones(words))) return null;
  // The meaning the line gives: in curly quotes inside its brackets, before the note, or after it (a colon or a semicolon
  // after the other word: "verbal noun of тести́ровать: testing", "comparative degree of petit; lower; less").
  const quoted = /“([^”]{1,80})”/u.exec(text);
  const tail = /^\s*[;:]\s*(.{2,120})$/u.exec(flat.slice(m.index + m[0].length));
  const after = !quoted && !lead && tail && /\p{Script=Latin}/u.test(tail[1]) ? tail[1].trim().replace(/[.;:]+$/, "") : "";
  // (or which of the other word's senses, in brackets after it: "synonym of pie (the Spanish foot, a traditional unit of
  // length)", not pie's first, "foot, a part of the body"; never a reading, "(ibtalla)", "(yoguso minebari)", "(form I)")
  const sense = /^\(([a-z][^()]{8,100})\)/.exec(text.slice(text.indexOf(target) + target.length).trim());
  const hint = sense && sense[1].split(/\s+/).length >= 3 && !/\bform\b|“/.test(sense[1]) ? sense[1].trim() : "";
  const said = quoted ? quoted[1].trim() : lead || after || "";
  const p = words.join(" ");
  const kind = /elative/.test(p) ? "elative" : /superlative/.test(p) ? "superlative" : /comparative/.test(p) ? "comparative"
    : /passive participle|past participle|perfect participle/.test(p) ? "ed"
    : /verbal noun|gerund\b|active participle|present participle/.test(p) ? "ing"
    : /\b(?:plural|dual|paucal)\b/.test(p) && !/person|singular|tense|present|past|preterite|imperative|subjunctive|indicative|future/.test(p) ? "plural"
    : "same"; // (a diminutive too: the other word's meaning, as "little" + it is as often wrong as right, бачок)
  // What form it is, as the line says it (the meaning before it, or after its colon, off).
  let head = text;
  if (lead) { const at = text.indexOf(prefix); if (at > 0) head = text.slice(at); }
  if (after) { const at = text.lastIndexOf(after.slice(0, 20)); if (at > 0) head = head.slice(0, at); }
  head = head.replace(/[:\s]+$/u, "").trim();
  // (a meaning before the note or after its colon is the word's own, "worse" for peor: as it is, never made into the form
  // again; one in curly quotes is the other word's, "big" for كبير, and is)
  // (in curly quotes, but already this form's meaning: Italian "superlative degree of ultimo (“very latest”)")
  const formed = quoted && kind !== "same" && /^(?:very|most|more|less|least)\s|\w(?:est|ing|ed)\b/i.test(said);
  if (!said && hint && kind === "same") return { head, kind, target, said: hint, own: false };
  return { head, kind, target, said, own: !!said && (!quoted || formed) };
}

// ---------- English for a form, from the meaning of the word it is a form of ----------
const IRREGULAR = Object.fromEntries(("arise arisen|awake awoken|be been|bear borne|beat beaten|become become|begin begun|bend bent|"
  + "bet bet|bind bound|bite bitten|bleed bled|blow blown|break broken|breed bred|bring brought|build built|buy bought|"
  + "catch caught|choose chosen|cling clung|come come|cost cost|creep crept|cut cut|deal dealt|dig dug|do done|draw drawn|"
  + "drink drunk|drive driven|dwell dwelt|eat eaten|fall fallen|feed fed|feel felt|fight fought|find found|flee fled|fling flung|"
  + "fly flown|forbid forbidden|forget forgotten|forgive forgiven|forsake forsaken|freeze frozen|get got|give given|go gone|"
  + "grind ground|grow grown|hang hung|have had|hear heard|hide hidden|hit hit|hold held|hurt hurt|keep kept|kneel knelt|"
  + "know known|lay laid|lead led|leave left|lend lent|let let|light lit|lose lost|make made|mean meant|meet met|"
  + "overcome overcome|pay paid|put put|quit quit|read read|ride ridden|ring rung|rise risen|run run|say said|see seen|"
  + "seek sought|sell sold|send sent|set set|shake shaken|shine shone|shoot shot|show shown|shrink shrunk|shut shut|sing sung|"
  + "sink sunk|sit sat|sleep slept|slide slid|speak spoken|spend spent|spin spun|split split|spread spread|spring sprung|"
  + "stand stood|steal stolen|stick stuck|sting stung|strike struck|swear sworn|sweep swept|swim swum|swing swung|"
  + "take taken|teach taught|tear torn|tell told|think thought|throw thrown|understand understood|undergo undergone|"
  + "undertake undertaken|wake woken|wear worn|weave woven|weep wept|win won|wind wound|withdraw withdrawn|write written").split("|")
  .map((p) => p.split(" ")));
// (two syllables, the last stressed: its last letter doubles, "beginning", "forgotten")
const DOUBLES = new Set(["begin", "forget", "occur", "prefer", "refer", "admit", "commit", "permit", "regret", "control",
  "compel", "upset", "submit", "omit", "transfer", "deter", "equip", "expel", "patrol", "propel", "rebel", "repel"]);
// (a silent e at the end is no syllable: wide, large)
const syllables = (w) => (w.replace(/([^aeiouyl])e$/, "$1").match(/[aeiouy]+/g) || []).length || 1;
// (one syllable ending in one vowel and one consonant: stop, sit, run; not w, x or y: show, fix, play)
const doubles = (w) => DOUBLES.has(w) || (syllables(w) === 1 && /(?:^|[^aeiou])[aeiou][bdgklmnprtvz]$/.test(w) && !/^qu/.test(w) && !/k$/.test(w));

/** The -ing form of an English verb: "write" -> "writing", "run" -> "running", "lie" -> "lying", "see" -> "seeing". */
export function ingOf(verb) {
  const w = String(verb || "").toLowerCase();
  if (!/^[a-z]+$/.test(w)) return "";
  if (w === "be") return "being";
  if (/ie$/.test(w)) return w.slice(0, -2) + "ying";
  if (/(?:ee|ye|oe)$/.test(w)) return w + "ing";
  if (/[^aeiou]e$/.test(w) || /[uo]e$/.test(w) && w.length > 3) return w.slice(0, -1) + "ing";
  if (doubles(w)) return w + w.slice(-1) + "ing";
  return w + "ing";
}

/** The past participle of an English verb: "write" -> "written", "love" -> "loved", "stop" -> "stopped", "cry" -> "cried". */
export function edOf(verb) {
  const w = String(verb || "").toLowerCase();
  if (!/^[a-z]+$/.test(w)) return "";
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (/e$/.test(w)) return w + "d";
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ied";
  if (doubles(w)) return w + w.slice(-1) + "ed";
  return w + "ed";
}

const PLURALS = { man: "men", woman: "women", child: "children", person: "people", foot: "feet", tooth: "teeth",
  mouse: "mice", goose: "geese", ox: "oxen", sheep: "sheep", fish: "fish", deer: "deer", knife: "knives", wife: "wives",
  life: "lives", leaf: "leaves", wolf: "wolves", half: "halves", loaf: "loaves", thief: "thieves", shelf: "shelves" };
/** The plural of an English noun: "book" -> "books", "city" -> "cities", "box" -> "boxes", "man" -> "men". */
export function pluralOf(noun) {
  const w = String(noun || "");
  if (!/^[a-z]+$/.test(w)) return "";
  if (PLURALS[w]) return PLURALS[w];
  if (/(?:s|x|z|ch|sh)$/.test(w)) return w + "es";
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
  return w + "s";
}

const COMPARE = { good: ["better", "best"], bad: ["worse", "worst"], far: ["farther", "farthest"], little: ["less", "least"],
  much: ["more", "most"], many: ["more", "most"], well: ["better", "best"] };
// (words with no degrees: no "firstest")
const NOT_GRADED = new Set(["first", "last", "next", "only", "own", "same", "main", "whole", "entire", "dead", "former", "latter", "prime", "chief", "sole", "very"]);
/** An English adjective's comparative and superlative: "big" -> ["bigger", "biggest"], "beautiful" -> ["more beautiful", …]. */
export function comparedOf(adj) {
  const w = String(adj || "");
  if (COMPARE[w]) return COMPARE[w];
  if (NOT_GRADED.has(w)) return null;
  if (/ly$/.test(w) && w.length > 4) return [`more ${w}`, `most ${w}`]; // (an adverb: "more cheaply")
  if (!/^[a-z]+$/.test(w)) return [`more ${w}`, `most ${w}`];
  const n = syllables(w);
  if (n === 1 || (n === 2 && /[^aeiou]y$/.test(w))) {
    if (/e$/.test(w)) return [w + "r", w + "st"];
    if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + "ier", w.slice(0, -1) + "iest"];
    if (n === 1 && /(?:^|[^aeiou])[aeiou][bdglmnprt]$/.test(w)) return [w + w.slice(-1) + "er", w + w.slice(-1) + "est"];
    return [w + "er", w + "est"];
  }
  return [`more ${w}`, `most ${w}`];
}

/** A meaning's parts, split at "," and ";" outside brackets. */
function topParts(text) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of String(text)) {
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && depth) depth--;
    if (!depth && (ch === "," || ch === ";")) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

/**
 * The English for `kind` of a word whose meaning is `gloss` (the other word's), or "" when it can't be made safely:
 * "ing" of "to become wet, to become moist" is "becoming wet, becoming moist"; "ed" of "to write" is "written"; "plural"
 * of "book, volume" is "books, volumes"; "elative" of "big" is "bigger, biggest"; "very" of "free" is "very free"; "same"
 * is the meaning as it is.
 */
export function formMeaning(kind, gloss) {
  const g = String(gloss ?? "").trim().replace(/[.;:]+$/, "");
  if (!g) return "";
  if (kind === "same") return g;
  // A verb's: its meanings that are verbs ("to eat away, corrode": "eating away"; "to become wet, moist": "becoming wet"),
  // split where no bracket is open ("to inform, to notify (construed with …, or through بِ)"). An adjective's first two
  // meanings at most, its first only for both degrees: "wider, widest".
  const verbal = kind === "ing" || kind === "ed";
  const parts = verbal ? topParts(g).filter((p) => /^to [a-z]/i.test(p)).slice(0, 3)
    : g.split(/\s*[;,]\s*/).filter(Boolean).slice(0, kind === "elative" ? 1 : kind === "comparative" || kind === "superlative" ? 2 : 3);
  if (!parts.length) return "";
  const verbs = parts.every((p) => /^to [a-z]/i.test(p));
  const out = [];
  for (const part of parts) {
    // (its notes in brackets off, for a noun or an adjective: "school (Islamic primary school)" -> "schools")
    const bare = kind === "ing" || kind === "ed" ? part : part.replace(/\s*\([^)]*\)/g, "").trim();
    if (!bare) return "";
    const words = bare.split(/\s+/);
    if (kind === "plural" && /^(?:a|an)$/i.test(words[0]) && words.length > 1) words.shift(); // ("a look" -> "looks")
    if (kind === "ing" || kind === "ed") {
      if (!verbs) return "";
      const [, verb, ...rest] = words;
      if (kind === "ed" && verb.toLowerCase() === "be") { if (rest.length) out.push(rest.join(" ")); continue; }
      const made = kind === "ing" ? ingOf(verb) : edOf(verb);
      if (!made) return "";
      out.push([made, ...rest].join(" "));
    } else if (kind === "plural") {
      // (a noun's meaning only, of one to three plain words: "school bag" -> "school bags")
      if (verbs || /^to\s/i.test(bare) || words.length > 3 || /[()]/.test(bare)) return "";
      const last = pluralOf(words[words.length - 1].toLowerCase() === words[words.length - 1] ? words[words.length - 1] : "");
      if (!last) return "";
      out.push([...words.slice(0, -1), last].join(" "));
    } else {
      if (verbs || words.length > 2 || /[()]/.test(bare) || /^(?:of|in|on|at|from|by|with|very|most|more|less|least)\s/i.test(bare)) return "";
      if (kind === "very") { out.push(`very ${bare}`); continue; }
      const compared = comparedOf(bare.toLowerCase());
      if (!compared) return "";
      const [more, most] = compared;
      out.push(kind === "comparative" ? more : kind === "superlative" ? most : `${more}, ${most}`);
    }
  }
  return [...new Set(out)].join(", ");
}
