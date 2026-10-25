// Checks a batch of French course rows before it is added (node tools/course/fr/check_batch.mjs <batch>):
// each row's rank is the place in build/fr-ranked.json of the dictionary word it teaches (its `word`, or
// what the ranked list calls it when the course writes it differently: cheveu for cheveux), ranks rise
// from the last word already in words.json, no word is in the course twice, and the sentence has the
// word (or its form). Prints what is wrong; nothing is changed.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ranked = JSON.parse(readFileSync(join(here, "..", "build", "fr-ranked.json"), "utf8"));
const course = JSON.parse(readFileSync(join(here, "words.json"), "utf8"));
const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
const fold = (s) => String(s).normalize("NFC").toLocaleLowerCase();
const strip = (s) => fold(s).replace(/^(?:se |s')/, "").replace(/ que$/, "");

let last = course.words.length ? course.words[course.words.length - 1].rank : 0;
const seen = new Set(course.words.map((w) => `${fold(w.word)}|${w.pos}`));
let bad = 0;
const say = (msg) => { bad++; console.log(msg); };
for (const [rank, word, pos, meaning, sentence, translation, form] of rows) {
  const e = ranked[rank - 1];
  const lemma = e ? e.lemma : "?";
  const forms = e ? e.forms.map(([f]) => f) : [];
  if (lemma !== strip(word) && !forms.includes(strip(word))) console.log(`  note ${rank}: ranked word is "${lemma}" [${forms.join(", ")}], row says "${word}"`);
  if (rank <= last) say(`${rank} ${word}: rank does not rise (last ${last})`);
  last = rank;
  const key = `${fold(word)}|${pos}`;
  if (seen.has(key)) say(`${rank} ${word}: already in the course`);
  seen.add(key);
  const ok = [word, ...[].concat(form || [])].map(fold).some((f) => fold(sentence).includes(f));
  if (!ok) say(`${rank} ${word}: sentence "${sentence}" lacks the word or its form`);
  const n = sentence.trim().split(/\s+/).length;
  if (n > 12) say(`${rank} ${word}: ${n} words`);
  if ((translation.match(/⟦/g) || []).length !== 1 || (translation.match(/⟧/g) || []).length !== 1) say(`${rank} ${word}: ⟦ ⟧ in "${translation}"`);
  if (!/[.!?…]$/.test(sentence)) say(`${rank} ${word}: no full stop`);
  if (/ [?!:;]/.test(sentence)) say(`${rank} ${word}: ordinary space before ? ! : ; (use a no-break space)`);
}
console.log(`${rows.length} rows, ${bad} problems`);
