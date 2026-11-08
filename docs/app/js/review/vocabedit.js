// The part of the Vocab list's open word (components/wordeditor.js), of its "Sentence" tool
// (review/sentencefind.js) and of the list's header (pages/vocab.js) that needs no screen, so it can be
// tested on its own (tests/js/vocabedit.test.mjs). Shared by the desktop app, the phone and the web app.

import { stripMarks } from "../cardtext.js";
import { hasOwnAudio, voiceTimes } from "../cardvoice.js";
import { readBatch } from "../addwords.js";

// ---------------------------------------------------------------- the open word

/** What a card may not have yet, in the order of the "+" links under it: [field, label]. */
export const ADDS = [["meaning", "Meaning"], ["sentence", "Sentence"], ["translation", "Translation"],
  ["notes", "Grammar notes"], ["memo", "Memorization notes"]];

/** The row of tools under an open word: [id, icon, label, what it says on hover]. (Its less used things,
 * copy, send to a friend and delete, are in the ⋯ at the end of its last line.) */
export const TOOLS = [
  ["mnemonic", "bulb", "Mnemonic", "Mnemonic maker: words that sound like it, each with a picture"],
  ["sentence", "example", "Sentence", "An example sentence: a real one found, or one written for you"],
  ["record", "mic", "Record", "Record the word, or choose a sound file"],
  ["folders", "folder", "Folders", "Put it in folders"],
];

const has = (v, field) => !!stripMarks((v && v[field]) || "").trim();

/** Which "+" links card `v` gets: the parts it hasn't got (a translation only once it has a sentence). */
export function missingParts(v) {
  return ADDS.map(([f]) => f).filter((f) => !has(v, f) && (f !== "translation" || has(v, "sentence")));
}

/** Can card `v` be given a recording of its own here? Not when it has sound of its own or a kept voice:
 * a card keeps its first, as the servers do (app/api/vocab.py save_recording, the phone's saveVoice). */
export const canKeepRecording = (v) => !!v && !v.clip && !hasOwnAudio(v) && !voiceTimes(v);

/** Which tools card `v` gets, in order. */
export const toolsFor = (v) => TOOLS.filter(([id]) => id !== "record" || canKeepRecording(v)).map(([id]) => id);

// ---------------------------------------------------------------- an example sentence asked of the AI

/** The one item asked of the AI for card `v` (addwords.js batchPrompt): a sentence and its translation,
 * in the sense of its meaning. */
export function sentenceItem(v) {
  return {
    word: String((v && v.text) || "").trim(),
    meaning: stripMarks((v && v.meaning) || "").trim(),
    sentence: "",
    want: { meaning: false, sentence: true, translation: true },
  };
}

/** What the AI answered for that item: {sentence, translation}, or null when it wrote none (or the one it
 * wrote is among `skip`, the sentences already shown). */
export function readSentence(answer, item, skip = []) {
  const [got] = readBatch(answer, [item]);
  if (!got || !got.sentence || skip.includes(got.sentence)) return null;
  return { sentence: got.sentence, translation: got.translation || "" };
}

// ---------------------------------------------------------------- the list's header

/** The list's sort and filter as they start, and what "Reset" goes back to. */
export const VIEW_DEFAULTS = { sort: "added_desc", dateField: "added", range: "any", from: "", to: "" };

/** Does the sort-and-filter sheet narrow the list (its icon then shows a dot)? A sort alone doesn't. */
export const narrowed = (st) => !!st && st.range !== "any" && !(st.range === "custom" && !st.from && !st.to);

/** Is anything in the sort-and-filter sheet other than it starts (so "Reset" has something to do)? */
export const changedView = (st) => !!st && Object.keys(VIEW_DEFAULTS).some((k) => (st[k] || "") !== VIEW_DEFAULTS[k]);

/** How many of `words` a folder choice shows: "" every word, "none" those in no folder, else a folder's uid. */
export function folderCount(words, key) {
  if (!key) return words.length;
  return words.filter((v) => (key === "none" ? !(v.folders || []).length : (v.folders || []).includes(key))).length;
}

const DECK_GROUP = /^(DLI [^·]{1,30}) · /u;  // a DLI deck's chapter folders (dli.js deckFolderName)
/** Folders in the order the Vocab page lists them: by name, numbers as numbers ("Chapter 2" before "Chapter 10"),
 * except that a DLI deck's folders ("DLI Arabic · …") stay together in the order they were made, which is the
 * course's order (Sound and Script before Chapter 1, Chapter 50 before Semester 3). */
export function sortFolders(list) {
  const group = (f) => { const m = DECK_GROUP.exec(String((f && f.name) || "")); return m ? m[1] : ""; };
  const byName = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return [...(list || [])].sort((a, b) => {
    const ga = group(a), gb = group(b);
    if (ga && ga === gb) return (Number(a.created_at) || 0) - (Number(b.created_at) || 0) || byName(a.name, b.name);
    return byName(ga || a.name, gb || b.name) || byName(a.name, b.name);
  });
}

/** The folder choice `step` places along from `key` (the controller's shoulder buttons): every word, those
 * in no folder, then each folder in its order, round and round. */
export function stepFolder(key, folders, step) {
  const keys = ["", "none", ...folders.map((f) => f.uid)];
  const at = Math.max(0, keys.indexOf(key));
  return keys[(at + step + keys.length * 4) % keys.length];
}
