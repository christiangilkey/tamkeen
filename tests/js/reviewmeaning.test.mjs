// Run with: node --test tests/js/
// The flashcard's back shows the meaning once (the owner, 2026-11-27, said yes to dropping the repeated Meaning box
// under the notes, on two conditions: "ensure we don't erase any of my students current meaning or notes and ensure
// that it doesn't mess up the card bundles we made for DLI students"). A display change only: these check that
// every part of a card (an own card and a DLI deck's card) is still on the flipped card, that showing it changes
// nothing in the card, and that the DLI decks still bring their meanings and notes in as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EDITABLE_SELECTOR, editValue, editable, meaningLine } from "../../web/js/review/cardedit.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const review = read("web/js/pages/review.js");
/** The markup of the back (review.js back()). */
const backMarkup = review.slice(review.indexOf("function back(v) {"), review.indexOf("face.querySelector(\".rv-trash\").onclick"));

// An own card with everything filled in, and a card as a DLI deck puts it in (dlicontent.js addDeck: text, meaning,
// notes, sentence, translation, folders, source "<deck> · word n", language).
const own = {
  id: 7, uid: "c-own", text: "كتاب", meaning: "book", notes: "Plural: كُتُب (kutub). Root k-t-b.",
  memo: "KITTEN with a BOOK: a kitten reading a book", sentence: "ذهبت إلى ⟦كتاب⟧ في الصباح", translation: "I went to the book in the morning",
  language: "ar", folders: ["f1"], created_at: "2026-11-01T10:00:00Z",
};
const dli = {
  id: 8, uid: "c-dli", text: "مكتب", meaning: "office; desk", notes: "m. pl. مكاتب. Unit 3 vocabulary.",
  memo: "", sentence: "المكتب في الطابق الثاني", translation: "The office is on the second floor", language: "ar",
  folders: ["dli-ch3"], source: "DLI Arabic · Unit 3 · word 12", episode_title: "DLI Arabic · Unit 3 · word 12",
};

test("the meaning shows once, under the word, exactly as the card has it (own and DLI cards)", () => {
  for (const card of [own, dli]) {
    const before = JSON.stringify(card);
    assert.deepEqual(meaningLine(card, "What it means"), { text: card.meaning, empty: false });
    assert.equal(JSON.stringify(card), before, "showing the meaning changes nothing in the card");
  }
});

test("a card with no meaning still shows the line, faint, so a tap can type one (and nothing is written)", () => {
  for (const meaning of [undefined, null, "", "   "]) {
    const card = { ...dli, meaning };
    const before = JSON.stringify(card);
    assert.deepEqual(meaningLine(card, "What it means"), { text: "What it means", empty: true });
    assert.equal(JSON.stringify(card), before);
  }
  // (the text box a tap opens starts from the card, never from the hint)
  assert.equal(editValue({ ...dli, meaning: "" }, "meaning"), "");
  assert.ok(editable("meaning") && EDITABLE_SELECTOR.includes(".rv-ans-meaning"), "the meaning line is still typed over by a tap");
});

test("the flipped card still has every part: the meaning line, grammar notes, memorization notes and Paste", () => {
  assert.match(backMarkup, /<div class="rv-ans-meaning" translate="no" hidden><\/div>/);
  assert.match(backMarkup, /<span>Grammar notes<\/span><textarea class="notes"/);
  assert.match(backMarkup, /<span>Memorization notes<\/span><button type="button" class="rv-paste"/);
  assert.match(backMarkup, /<textarea class="memo"/);
  assert.doesNotMatch(backMarkup, /class="meaning"/, "no second Meaning box");
  // the boxes are filled from the card, and written to it only when typed in
  assert.match(review, /for \(const field of \["notes", "memo"\]\) \{\s+const box = face\.querySelector\(`\.rv-details \.\$\{field\}`\);\s+box\.value = v\[field\] \|\| "";\s+box\.oninput = \(\) => \{ fit\(box\); edit\(v, field, box\.value\); more\(\); \};/);
  // the meaning line: drawn from the card, never hidden, and never written by drawing it
  const draw = review.slice(review.indexOf("function drawMeaning(v) {"), review.indexOf("function drawLit("));
  assert.match(draw, /const shown = meaningLine\(v, t\("What it means"\)\);/);
  assert.match(draw, /line\.hidden = false;/);
  assert.doesNotMatch(draw, /edit\(|saveCard\(|api\(/);
  // a mnemonic chosen in the Mnemonic maker still goes into Memorization notes
  assert.match(review, /useMnemonic: \(text\) => useMnemonic\(v, text\),/);
});

test("the DLI decks bring their words in as before: meaning and notes go to the card's own fields", () => {
  const deck = read("web/js/dlicontent.js");
  assert.match(deck, /text: w\.text, meaning: w\.meaning, notes: w\.notes, sentence: w\.sentence, translation: w\.translation,/);
});
