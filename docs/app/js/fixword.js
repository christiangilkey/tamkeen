// Misheard words on screen: when a word lookup says the tapped word was misheard (the answer's
// `correction`, see definer.js), the transcript is changed on this device (and so, through sync,
// on the others) and the words on screen are redrawn. Undo puts back what it said before.
// Shared by the player, the web-page reader and the reel player, on the computer and the phone.

import { api } from "./app.js";
import { storeDefinition } from "./define-service.js";
import { planCorrection } from "./correction.js";

/**
 * @param {{episodeId: string|number, texts: string[], offset?: number, editable?: boolean,
 *          redraw: (first: number, last: number) => void,
 *          contextFor: (i: number, j: number) => {word: string, ctx: object}}} o
 *   `texts`: the words on screen (changed in place); `offset`: how many of them come before the
 *   stored ones (a web page's title); `editable`: false where the words on screen are not the
 *   stored ones (Japanese and Chinese, regrouped for display), so nothing is changed there.
 */
export function wordFixer({ episodeId, texts, offset = 0, editable = true, redraw, contextFor }) {
  async function change(i, j, next) {
    const old = texts.slice(i, j + 1);
    await api(`/episodes/${episodeId}/correct`, { method: "POST", body: {
      first: i - offset, last: j - offset, expect: old, words: next } });
    for (let k = 0; k < next.length; k++) texts[i + k] = next[k];
    redraw(i, j);
  }
  return {
    /** Words t.i..t.j were misheard (def.correction is what was said): change them. Resolves to
     *  the corrected words' {word, ctx}, or null when the transcript can't be changed here. */
    async apply(t, def) {
      if (!editable || t.i < offset) return null;
      const before = contextFor(t.i, t.j);
      const next = planCorrection(texts.slice(t.i, t.j + 1), def.correction);
      if (!next) return null;
      await change(t.i, t.j, next);
      const after = contextFor(t.i, t.j);
      // The same answer belongs to the corrected sentence, noting what the transcript had (so
      // tapping the word again shows the correction, with Undo, without asking the AI again).
      storeDefinition(after.ctx, { ...def, correction: "", corrected_from: before.word }).catch(() => {});
      return after;
    },
    /** Put back `from`, what the transcript said before. Resolves to the restored {word, ctx}. */
    async undo(t, from) {
      const next = planCorrection(texts.slice(t.i, t.j + 1), from);
      if (next) await change(t.i, t.j, next);
      return contextFor(t.i, t.j);
    },
  };
}
