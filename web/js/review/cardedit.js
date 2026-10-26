// Putting a card right while it is being reviewed (web/js/pages/review.js): on the back of a card a
// tap on one of its texts turns that text into a text box, and holding a word of its sentence (or of
// the sentence's translation) lights the word up as part of what is being learned, or puts it out.
// This file is the part without a screen: which texts can be typed into, what the box starts with,
// and what is saved. Shared with the phones; tested in tests/js/cardedit.test.mjs.
//
// Everything is saved the way the back's Meaning box saves (PATCH /vocab/<id> with the changed
// field), so it reaches the other devices like any change to a card.

import { carryMarks, stripMarks, toggleWord } from "../cardtext.js";

/**
 * The texts on a card's back that a tap turns into a text box, in their order on the card.
 *   field     the card's field that is typed over
 *   selector  the element on the back that shows it
 *   study     written in the language being learned (else in the learner's own)
 *   required  can't be left empty (a card needs its word)
 *   marked    keeps ⟦ ⟧ round its lit parts (cardtext.js): the box shows it without them
 *   hold      a word in it can be held to light it up
 */
export const EDITABLE = [
  { field: "text", selector: ".rv-word", study: true, required: true, marked: false, hold: false },
  { field: "meaning", selector: ".rv-ans-meaning", study: false, required: false, marked: false, hold: false },
  { field: "sentence", selector: ".rv-ans-sentence", study: true, required: false, marked: true, hold: true },
  { field: "translation", selector: ".rv-ans-trans", study: false, required: false, marked: true, hold: true },
];

/** The rules for one of a card's fields, or null when it isn't typed into on the card. */
export const editable = (field) => EDITABLE.find((f) => f.field === field) || null;

/** The CSS selector of every text a tap edits. */
export const EDITABLE_SELECTOR = EDITABLE.map((f) => f.selector).join(", ");

/** Which field an element on the back shows (`matches` tells whether it fits a selector), or null. */
export function fieldOf(matches) {
  const f = EDITABLE.find((e) => matches(e.selector));
  return f ? f.field : null;
}

/** What a field's text box starts with: the text as the learner reads it (no ⟦ ⟧ marks). */
export function editValue(v, field) {
  const f = editable(field);
  const value = String((v && v[field]) ?? "");
  return f && f.marked ? stripMarks(value) : value;
}

/**
 * What typing `typed` into `field` of card `v` saves: {[field]: value}, or null when nothing would
 * change (or a required field would be left empty: the word stays as it was). A card's texts are one
 * line, so line breaks become spaces. The sentence and its translation keep their lit parts on the
 * same letters (carryMarks).
 */
export function editPayload(v, field, typed) {
  const f = editable(field);
  if (!f || !v) return null;
  const value = String(typed ?? "").replace(/\s*[\r\n]+\s*/gu, " ").trim();
  if (f.required && !value) return null;
  const before = String(v[field] ?? "");
  const stored = f.marked ? carryMarks(before, value) : value;
  return stored === before ? null : { [field]: stored };
}

/**
 * What holding the word at [from, to) of `field`'s text saves: {[field]: value}, or null when the
 * field has no words to hold. In the sentence the card's own word is lit until the learner chooses;
 * in the translation only what is marked.
 */
export function holdPayload(v, field, range) {
  const f = editable(field);
  if (!f || !f.hold || !v) return null;
  const before = String(v[field] ?? "");
  const stored = toggleWord(before, range, field === "sentence" ? String(v.text ?? "") : null);
  return stored === before ? null : { [field]: stored };
}
