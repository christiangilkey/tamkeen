// Old cards whose meaning is a grammar line of the built-in dictionary ("active participle of اِبْتَلَّ (ibtalla)"), saved
// before the dictionary gave the translation (lexicon/meaningdata.js translatedForms; the owner, 2026-11-20). When such a
// card is shown in the reviewer or opened in the word editor, its meaning becomes the translation ("wet") and what form it
// is goes in its Grammar notes, saved as any edit is (so it syncs). Only a meaning that is, letter for letter, the
// dictionary's own line for the card's word is changed: never one the learner wrote or changed (meanings.js
// formMeaningRepair). Shared by every device.

import { formMeaningRepair } from "../meanings.js";

const tried = new Set(); // (a card asked about once a session: no lookup each time it comes round)

/** Look at card `v` (its study language `lang`), and call `apply({meaning, notes?})` if its meaning is to be put right. */
export function repairFormMeaning(v, lang, apply) {
  if (!v || !v.meaning) return;
  const key = `${v.id ?? v.uid ?? v.text}\u0000${v.meaning}`;
  if (tried.has(key)) return;
  tried.add(key);
  formMeaningRepair(v, lang).then((change) => {
    if (!change) return;
    try { apply(change); } catch (e) { console.warn("Putting the card's meaning right failed", e); }
  }, () => {});
}
