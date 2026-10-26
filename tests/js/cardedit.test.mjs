// Run with: node --test tests/js/
// Putting a card right while reviewing it: tap a text to type over it, hold a word of the sentence
// to light it up or put it out (web/js/review/cardedit.js, the marks in web/js/cardtext.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_MARKS, cardSentence, carryMarks, litParts, litPieces, litTextHtml, markedSentenceHtml, sentenceMarks, stripMarks, toggleWord, vowelPlaces, writeMarks } from "../../web/js/cardtext.js";
import { EDITABLE, EDITABLE_SELECTOR, editPayload, editValue, editable, fieldOf, holdPayload } from "../../web/js/review/cardedit.js";
import { wordRanges } from "../../web/js/languages.js";
import { ankiFields, sentenceSpans, vocabCsv } from "../../mobile/src/js/shared-logic.js";
import { prompt } from "../../web/js/review/deck.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** The words of `text` in `lang`, as the card cuts them: [[from, to], ...]. */
const words = (text, lang) => wordRanges(sentenceMarks(text).text, lang);
/** Hold the word `word` (its first occurrence as a whole word) of `text`. */
function hold(text, word, cardWord, lang) {
  const plain = sentenceMarks(text).text;
  const range = words(text, lang).find(([a, b]) => plain.slice(a, b) === word);
  assert.ok(range, `"${word}" is a word of "${plain}"`);
  return toggleWord(text, range, cardWord);
}
const lit = (text, word = null) => { const { text: plain, marks } = litParts(text, word); return marks.map(([a, b]) => plain.slice(a, b)); };

test("marks are read and written back the same (the basics courses' marks), and broken ones count for nothing", () => {
  assert.deepEqual(sentenceMarks("Perdí mi ⟦cartera⟧ ayer."), { text: "Perdí mi cartera ayer.", spans: [[9, 16]] });
  assert.equal(writeMarks("Perdí mi cartera ayer.", [[9, 16]]), "Perdí mi ⟦cartera⟧ ayer.");
  assert.deepEqual(sentenceMarks("No marks here."), { text: "No marks here.", spans: null });
  for (const broken of ["a ⟦b c", "a b⟧ c", "⟦a ⟦b⟧ c⟧", "a ⟧b⟦ c", "a ⟦⟧b", "⟦⟧a ⟦b c"]) {
    assert.equal(sentenceMarks(broken).spans, null, broken);
    assert.equal(sentenceMarks(broken).text, stripMarks(broken));
  }
  assert.deepEqual(sentenceMarks(`${NO_MARKS}Perdí mi cartera.`), { text: "Perdí mi cartera.", spans: [] }, "the empty pair in front: nothing lit");
  assert.equal(writeMarks("a b c", [], true), "⟦⟧a b c");
  // Spaces at a lit part's ends are left out, and parts with only spaces between them are one.
  assert.equal(writeMarks("No me des la lata", [[6, 10], [10, 13], [13, 17]]), "No me ⟦des la lata⟧");
  assert.equal(writeMarks("a  b", [[0, 2], [3, 4]]), "⟦a  b⟧");
});

test("hold a word: the card's own word is lit until the learner chooses, then the chosen parts", () => {
  const s = "Perdí mi cartera en el metro.";
  assert.deepEqual(lit(s, "cartera"), ["cartera"], "by itself the card lights its word");
  const two = hold(s, "Perdí", "cartera", "es");
  assert.equal(two, "⟦Perdí⟧ mi ⟦cartera⟧ en el metro.", "a second word lit: the card's word stays lit too");
  const one = hold(two, "cartera", "cartera", "es");
  assert.equal(one, "⟦Perdí⟧ mi cartera en el metro.", "the card's own word put out");
  assert.equal(hold(one, "Perdí", "cartera", "es"), `${NO_MARKS}${s}`, "everything put out: the empty pair says so");
  assert.deepEqual(lit(`${NO_MARKS}${s}`, "cartera"), [], "and nothing is lit, not even the word");
  assert.equal(hold(`${NO_MARKS}${s}`, "cartera", "cartera", "es"), s, "lit again as the card would light it: no marks kept at all");
  assert.equal(hold(s, "cartera", "cartera", "es"), `${NO_MARKS}${s}`, "putting out the word itself");
});

test("several words lit next to each other become one lit stretch, and one in the middle can go", () => {
  const s = "No me des la lata, por favor.";
  let t = hold(s, "des", "lata", "es");
  t = hold(t, "la", "lata", "es");
  assert.equal(t, "No me ⟦des la lata⟧, por favor.", "a phrase lit word by word is one part");
  assert.deepEqual(lit(t, "lata"), ["des la lata"]);
  assert.equal(hold(t, "la", "lata", "es"), "No me ⟦des⟧ la ⟦lata⟧, por favor.", "the middle word put out splits it");
  // German: a verb in two parts, far apart.
  assert.equal(hold("Der Film fängt um acht an.", "an", "fängt", "de"), "Der Film ⟦fängt⟧ um acht ⟦an⟧.");
});

test("right-to-left sentences: Arabic and Persian", () => {
  // The card's word is found inside a longer written word (with its article): holding that word puts it out,
  // holding it again lights the whole written word.
  const ar = "ذهبت إلى المكتبة لأقرأ كتابا جديدا.";
  assert.deepEqual(lit(ar, "مكتبة"), ["مكتبة"]);
  const out = hold(ar, "المكتبة", "مكتبة", "ar");
  assert.equal(out, `${NO_MARKS}${ar}`);
  assert.equal(hold(out, "المكتبة", "مكتبة", "ar"), "ذهبت إلى ⟦المكتبة⟧ لأقرأ كتابا جديدا.");
  assert.equal(hold(ar, "لأقرأ", "مكتبة", "ar"), "ذهبت إلى ال⟦مكتبة لأقرأ⟧ كتابا جديدا.", "the found part and the next word: one stretch");
  // Vowel marks stay inside the word that carries them.
  const vowelled = "ذَهَبْتُ إِلَى المَكْتَبَةِ.";
  assert.equal(hold(vowelled, "إِلَى", "مكتبة", "ar"), "ذَهَبْتُ ⟦إِلَى⟧ ال⟦مَكْتَبَةِ⟧.", "Arabic with its vowels");
  // Persian: a word written with a half space is one word.
  const fa = "می‌خواهم به خانه بروم.";
  assert.equal(hold(fa, "می‌خواهم", "خانه", "fa"), "⟦می‌خواهم⟧ به ⟦خانه⟧ بروم.");
});

test("languages written without spaces: words come from the word splitter", () => {
  const ja = "私は学校に行きます。";
  assert.deepEqual(words(ja, "ja").map(([a, b]) => ja.slice(a, b)), ["私", "は", "学校", "に", "行き", "ます"]);
  assert.equal(hold(ja, "行き", "学校", "ja"), "私は⟦学校⟧に⟦行き⟧ます。");
  assert.equal(hold(hold(ja, "に", "学校", "ja"), "行き", "学校", "ja"), "私は⟦学校に行き⟧ます。", "touching words are one stretch");
  const zh = "我今天很忙。";
  assert.equal(hold(zh, "很", "忙", "zh"), "我今天⟦很忙⟧。");
  const th = "ผมไปโรงพยาบาลเมื่อวาน";
  assert.ok(words(th, "th").some(([a, b]) => th.slice(a, b) === "โรงพยาบาล"), "Thai's cut common words joined back");
  assert.equal(hold(th, "ไป", "โรงพยาบาล", "th"), "ผม⟦ไปโรงพยาบาล⟧เมื่อวาน");
  // Punctuation stays out of a word, in every language.
  assert.deepEqual(words("¿Dónde está, amigo?", "es").map(([a, b]) => "¿Dónde está, amigo?".slice(a, b)), ["Dónde", "está", "amigo"]);
});

test("the translation lights only what is marked in it", () => {
  const tr = "I lost my wallet on the subway.";
  assert.deepEqual(lit(tr), []);
  const t = hold(tr, "wallet", null, "en");
  assert.equal(t, "I lost my ⟦wallet⟧ on the subway.");
  assert.equal(hold(t, "wallet", null, "en"), tr, "put out again: no marks, never the empty pair");
  assert.deepEqual(prompt({ uid: "a", text: "cartera", meaning: "wallet", translation: hold(t, "lost", null, "en") }).sentence,
    [["I ", false], ["lost", true], [" my ", false], ["wallet", true], [" on the subway.", false]], "the front lights what was chosen");
});

test("typing over a text keeps its lit parts on the same letters", () => {
  assert.equal(carryMarks("Perdí mi ⟦carterra⟧ ayer.", "Perdí mi cartera ayer."), "Perdí mi ⟦cartera⟧ ayer.", "a typo put right inside the lit word");
  assert.equal(carryMarks("Perdí mi ⟦cartera⟧ ayer.", "Ayer perdí mi cartera ayer."), "Ayer perdí mi ⟦cartera⟧ ayer.", "text added before it");
  assert.equal(carryMarks("Perdí mi ⟦cartera⟧ ayer.", "Perdí mi cartera ayer por la tarde."), "Perdí mi ⟦cartera⟧ ayer por la tarde.", "text added after it");
  assert.equal(carryMarks("Perdí mi ⟦cartera⟧.", "Perdí mi carteras."), "Perdí mi ⟦carteras⟧.", "letters typed onto the word join it");
  assert.equal(carryMarks("Perdí mi ⟦cartera⟧.", "Perdí mi cartera nueva."), "Perdí mi ⟦cartera⟧ nueva.", "a new word after it doesn't");
  assert.equal(carryMarks("Perdí mi ⟦cartera⟧.", "Tengo hambre."), "Tengo hambre.", "a sentence typed anew: back to the card's own choice");
  assert.equal(carryMarks("ذهبت إلى ⟦المكتبة⟧.", "ذهبتُ إلى المكتبة."), "ذهبتُ إلى ⟦المكتبة⟧.", "Arabic: a vowel mark added before the lit word");
  assert.equal(carryMarks(`${NO_MARKS}Perdí mi cartera.`, "Perdí mi cartera nueva."), `${NO_MARKS}Perdí mi cartera nueva.`, "nothing lit stays nothing lit");
  assert.equal(carryMarks("Perdí mi cartera.", "Perdí mi cartera nueva."), "Perdí mi cartera nueva.", "nothing chosen: nothing added");
});

test("a long sentence shows the part round its lit word, marks and all", () => {
  const long = `${"palabra ".repeat(20)}y al final ⟦llegó⟧ el tren.`;
  const shown = cardSentence(long, "tren");
  assert.ok(shown.startsWith("…") && shown.includes("⟦llegó⟧"), shown);
  assert.equal(markedSentenceHtml(shown, "tren", esc).match(/<b>(.*?)<\/b>/)[1], "llegó", "the chosen word lit, not the card's own");
  assert.equal(cardSentence(`${NO_MARKS}Perdí mi cartera.`, "cartera"), `${NO_MARKS}Perdí mi cartera.`);
  const cut = cardSentence(`${NO_MARKS}${"palabra ".repeat(20)}y al final llegó el tren.`, "tren");
  assert.ok(cut.startsWith(`${NO_MARKS}…`), "a long sentence with nothing lit: still nothing lit once cut");
  assert.equal(markedSentenceHtml(cut, "tren", esc).includes("<b>"), false);
  assert.equal(markedSentenceHtml(`${NO_MARKS}Perdí mi <cartera>.`, "cartera", esc), "Perdí mi &lt;cartera&gt;.");
  assert.equal(markedSentenceHtml("Perdí mi cartera.", "cartera", esc), "Perdí mi <b>cartera</b>.", "the Vocab list as before");
  // The card draws a lit text in pieces: words in boxes of their own, lit stretches over several of them.
  const plain = "No me des la lata";
  const parts = litPieces(0, plain.length, wordRanges(plain, "es"), [[6, 17]]);
  assert.deepEqual(parts.map((p) => [plain.slice(p.from, p.to), p.word, p.lit]),
    [["No", 0, false], [" ", -1, false], ["me", 1, false], [" ", -1, false], ["des", 2, true], [" ", -1, true], ["la", 3, true], [" ", -1, true], ["lata", 4, true]]);
  assert.equal(litTextHtml(plain, [[6, 17]], esc, { words: wordRanges(plain, "es") }),
    '<span class="rv-tok" data-a="0" data-b="2">No</span> <span class="rv-tok" data-a="3" data-b="5">me</span> '
    + '<span class="rv-tok" data-a="6" data-b="9"><b class="s">des</b></span><b class="m"> </b><span class="rv-tok" data-a="10" data-b="12"><b class="m">la</b></span>'
    + '<b class="m"> </b><span class="rv-tok" data-a="13" data-b="17"><b class="e">lata</b></span>', "the review card: the same renderer, each word in its own box");
  assert.equal(litTextHtml(plain, [[6, 17]], esc), "No me <b>des la lata</b>", "the Vocab list: one <b>");
  // Arabic: a lit part inside a written word keeps its letters joined (zero-width joiners), in the review card too.
  const ar = "السيارة الجديدة";
  const html = litTextHtml(ar, [[2, 7]], esc, { words: wordRanges(ar, "ar") });
  assert.equal(html, '<span class="rv-tok" data-a="0" data-b="7">ال‍<b>‍سيارة</b></span> <span class="rv-tok" data-a="8" data-b="15">الجديدة</span>',
    "the ل stays joined to the lit س; no joiner at the space between words");
  assert.equal(litTextHtml(ar, [[0, 15]], esc, { words: wordRanges(ar, "ar") }),
    '<span class="rv-tok" data-a="0" data-b="7"><b class="s">السيارة</b></span><b class="m"> </b><span class="rv-tok" data-a="8" data-b="15"><b class="e">الجديدة</b></span>');
});

test("vowel marks shown over a lit sentence: each letter is found again", () => {
  const plain = "ذهبت إلى المكتبة";
  const shown = "ذَهَبْتُ إِلَى المَكْتَبَةِ";
  const at = vowelPlaces(plain, shown);
  const part = (a, b) => shown.slice(at[a], at[b]);
  assert.equal(part(9, 16), "المَكْتَبَةِ");
  assert.equal(part(0, 4), "ذَهَبْتُ");
  assert.equal(vowelPlaces(plain, "شيء آخر"), null, "other letters: drawn without vowels");
});

test("which texts a tap opens: the word, its meaning, the sentence and its translation", () => {
  assert.deepEqual(EDITABLE.map((f) => f.field), ["text", "meaning", "sentence", "translation"]);
  assert.deepEqual(EDITABLE.filter((f) => f.study).map((f) => f.field), ["text", "sentence"], "in the language being learned: its language and direction");
  assert.deepEqual(EDITABLE.filter((f) => f.hold).map((f) => f.field), ["sentence", "translation"], "words can be held only in sentences");
  assert.equal(EDITABLE_SELECTOR, ".rv-word, .rv-ans-meaning, .rv-ans-sentence, .rv-ans-trans");
  assert.equal(fieldOf((s) => s === ".rv-ans-sentence"), "sentence");
  assert.equal(fieldOf(() => false), null);
  for (const other of ["notes", "memo", "folders", "uid", "voice"]) assert.equal(editable(other), null, `${other} is not edited by a tap`);
  const v = { text: "cartera", meaning: "wallet", sentence: "Perdí mi ⟦cartera⟧.", translation: "I lost my ⟦wallet⟧." };
  assert.equal(editValue(v, "sentence"), "Perdí mi cartera.", "the box shows no marks");
  assert.equal(editValue(v, "translation"), "I lost my wallet.");
  assert.equal(editValue(v, "text"), "cartera");
  assert.equal(editValue({ text: "x" }, "meaning"), "");
});

test("what a text box saves", () => {
  const v = { id: 4, text: "cartera", meaning: "wallet", sentence: "Perdí mi ⟦carterra⟧ ayer.", translation: "I lost my ⟦wallet⟧ yesterday." };
  assert.equal(editPayload(v, "text", "cartera"), null, "unchanged: nothing is sent");
  assert.equal(editPayload(v, "text", "   "), null, "a card keeps its word");
  assert.deepEqual(editPayload(v, "text", " la cartera "), { text: "la cartera" });
  assert.deepEqual(editPayload(v, "meaning", "wallet,\npurse"), { meaning: "wallet, purse" }, "one line");
  assert.deepEqual(editPayload(v, "meaning", ""), { meaning: "" }, "a meaning may be emptied");
  assert.deepEqual(editPayload(v, "sentence", "Perdí mi cartera ayer."), { sentence: "Perdí mi ⟦cartera⟧ ayer." }, "the lit word stays lit");
  assert.deepEqual(editPayload(v, "translation", "I lost my wallet last night."), { translation: "I lost my ⟦wallet⟧ last night." });
  assert.equal(editPayload(v, "sentence", "Perdí mi carterra ayer."), null, "the same text as before");
  assert.equal(editPayload(v, "notes", "x"), null, "only the four texts");
  assert.deepEqual(holdPayload(v, "sentence", [0, 5]), { sentence: "⟦Perdí⟧ mi ⟦carterra⟧ ayer." });
  assert.deepEqual(holdPayload({ text: "cartera", sentence: "Perdí mi cartera." }, "sentence", [9, 16]), { sentence: `${NO_MARKS}Perdí mi cartera.` });
  assert.deepEqual(holdPayload(v, "translation", [10, 16]), { translation: "I lost my wallet yesterday." });
  assert.equal(holdPayload(v, "meaning", [0, 3]), null, "no words to hold in a meaning");
});

test("the Anki export and the list file show what the learner lit", () => {
  const card = { uid: "v1", text: "cartera", meaning: "wallet", notes: "", sentence: "⟦Perdí⟧ mi ⟦cartera⟧ nueva.", translation: "" };
  assert.deepEqual(sentenceSpans(card.sentence, card.text), { text: "Perdí mi cartera nueva.", spans: [[0, 5], [9, 16]] });
  assert.equal(ankiFields(card)[1], "<b>cartera</b><br>[Perdí] mi [cartera] nueva.");
  assert.equal(ankiFields({ ...card, sentence: `${NO_MARKS}Perdí mi cartera.` })[1], "<b>cartera</b><br>Perdí mi cartera.", "nothing lit");
  assert.deepEqual(sentenceSpans(`${NO_MARKS}Perdí mi cartera.`, "cartera"), { text: "Perdí mi cartera.", spans: [] });
  assert.equal(ankiFields({ ...card, sentence: "Perdí mi cartera nueva." })[1], "<b>cartera</b><br>Perdí mi [cartera] nueva.", "nothing chosen: as it always was");
  assert.ok(vocabCsv([{ ...card, episode_title: "", start: null, end: null }]).includes("Perdí mi cartera nueva."), "the list file has the sentence without marks");
});
