// English: from a word as it is written to its dictionary form, phrasal verbs, and US pronunciation.
//
// ran, running -> run; mice -> mouse; went -> go; better -> good; don't -> do; she's -> she.
// A phrasal verb is one item: in "give up", "gave it up", "looking after" both words are the
// lexeme "give up" / "look after", so tapping either marks the phrasal verb as seen.
//
// The table (docs/lexicon/en-lemmas.json.gz, made by tools/build_lemmas.py) is the usual word
// table, plus `ipa` {word: US pronunciation} from the CMU Pronouncing Dictionary for the words
// people meet most. Without it a word is known by its spelling (contractions still come off).
// No screen or network code here: tests/js/english.test.mjs.

import { EDGE_PUNCT } from "../wordlookup.js";

/** The word as the table knows it: lower case, one kind of apostrophe, punctuation off the ends,
 * contractions undone (don't -> do, can't -> can, won't -> will, she's / John's -> she / john). */
export function englishWord(token) {
  let w = String(token || "").normalize("NFC").replace(/[’ʼ`´]/g, "'").toLowerCase().replace(EDGE_PUNCT, "");
  const special = { "won't": "will", "can't": "can", "cannot": "can", "shan't": "shall", "ain't": "be", "y'all": "you" };
  if (special[w]) return special[w];
  w = w.replace(/n't$/, "").replace(/'(s|ll|re|ve|d|m)$/, "").replace(/s'$/, "s");
  return w;
}

// Common phrasal verbs (verb particle), in dictionary form. Only these join; any other verb
// followed by "up" or "out" stays two words.
const PHRASAL = new Set(`
ask out|back down|back off|back up|beat up|blow up|break down|break in|break into|break off|break out|break up|bring about|
bring back|bring down|bring in|bring out|bring up|brush up|build up|burn down|burn out|call back|call in|call off|call on|
call up|calm down|carry on|carry out|catch on|catch up|check in|check out|cheer up|chill out|clean up|clear up|close down|
come about|come across|come along|come apart|come back|come by|come down|come forward|come in|come off|come on|come out|
come over|come round|come through|come up|count on|cover up|cross out|cut back|cut down|cut off|cut out|deal with|die out|
do over|do up|do without|drag on|draw up|dress up|drop by|drop in|drop off|drop out|eat out|end up|fall apart|fall behind|
fall down|fall for|fall off|fall out|fall through|figure out|fill in|fill out|fill up|find out|fit in|freak out|get across|
get ahead|get along|get around|get away|get back|get by|get down|get in|get into|get off|get on|get out|get over|get through|
get together|get up|give away|give back|give in|give out|give up|go about|go after|go ahead|go along|go away|go back|go by|
go down|go for|go in|go off|go on|go out|go over|go through|go up|go with|go without|grow up|hand in|hand out|hang on|
hang out|hang up|head back|head out|hear from|help out|hold back|hold on|hold up|hurry up|join in|keep away|keep on|keep up|
kick off|knock down|knock out|lay off|lay out|leave out|let down|let in|let out|lie down|light up|line up|live up|lock up|
log in|log out|look after|look around|look back|look down|look for|look forward|look into|look out|look over|look up|
make out|make up|mess up|mix up|move in|move on|move out|open up|pass away|pass by|pass out|pay back|pay off|pick on|
pick out|pick up|play down|plug in|point out|pull off|pull out|pull over|pull through|pull up|put away|put back|put down|
put off|put on|put out|put through|put together|put up|run across|run away|run into|run out|run over|screw up|see off|
sell out|send back|set off|set out|set up|settle down|shop around|show off|show up|shut down|shut up|sign in|sign out|
sign up|sit down|slow down|sort out|speak up|stand by|stand for|stand out|stand up|start over|stay up|step down|stick out|
stick to|switch off|switch on|take after|take apart|take away|take back|take down|take in|take off|take on|take out|
take over|take up|talk over|tear down|tear up|think about|think over|throw away|throw out|throw up|tidy up|try on|
try out|turn around|turn away|turn back|turn down|turn in|turn into|turn off|turn on|turn out|turn over|turn up|use up|
wake up|warm up|wash up|watch out|wear off|wear out|work out|wrap up|write down|write up`.trim().split(/\|\s*/));
// A short object can sit between the verb and its particle: "give it up", "look them up".
const BETWEEN = new Set(["it", "them", "him", "her", "me", "us", "you", "this", "that", "these", "those"]);

// A word the table doesn't know as it is may be a regular form of one it does (texting -> text,
// binged -> binge, selfies -> selfie): the ending comes off only when what is left is in the table.
const ENDINGS = [[/ies$/, "y"], [/ied$/, "y"], [/(\w)\1(ing|ed)$/, "$1"], [/(ing|ed)$/, "e"], [/(ing|ed)$/, ""],
  [/(?<=[sxz]|ch|sh)es$/, ""], [/s$/, ""]];
function regularForm(word, table) {
  for (const [end, put] of ENDINGS) {
    if (!end.test(word)) continue;
    const base = word.replace(end, put);
    if (base.length >= 3 && table.isLemma.has(base)) return base;
  }
  return null;
}
const lemmaOf = (word, table) => (table && (table.lookup(word) || regularForm(word, table))) || word;

/**
 * The lexemes of a run of English text: {key, lemma, pos, root} per token, or null for something
 * that isn't a word. The tokens of a phrasal verb share its lexeme.
 */
export function analyzeEnglish(tokens, table = null) {
  const words = tokens.map(englishWord);
  const out = words.map((w) => (/\p{L}/u.test(w) ? lemmaOf(w, table) : null));
  const lex = out.map((l) => (l ? { key: `en|${l}|x`, lemma: l, pos: "", root: "" } : null));
  // A sentence's punctuation ends a phrasal verb: "give, up" isn't one.
  const ends = tokens.map((t) => /[.!?,;:)\]]["'”’]*$/u.test(String(t || "")));
  for (let i = 0; i < out.length; i++) {
    if (!out[i] || ends[i]) continue;
    for (const gap of [1, 2]) {
      const j = i + gap;
      if (j >= out.length || !out[j]) break;
      if (gap === 2 && (!BETWEEN.has(words[i + 1]) || ends[i + 1])) break;
      const phrase = `${out[i]} ${words[j]}`;
      if (PHRASAL.has(phrase)) {
        const x = { key: `en|${phrase}|x`, lemma: phrase, pos: "phrasal verb", root: "" };
        lex[i] = x;
        lex[j] = x;
        break;
      }
    }
  }
  return lex;
}

/** US pronunciation of a word in IPA (/ˈwɔtɚ/), or "" when the table doesn't have it. */
export function pronunciation(word, table) {
  if (!table || !table.ipa) return "";
  // The word as written first (the dictionary has don't, she's), then without its contraction.
  const written = String(word || "").normalize("NFC").replace(/[’ʼ`´]/g, "'").toLowerCase().replace(EDGE_PUNCT, "");
  const ipa = table.ipa[written] || table.ipa[englishWord(word)];
  return ipa ? `/${ipa}/` : "";
}
