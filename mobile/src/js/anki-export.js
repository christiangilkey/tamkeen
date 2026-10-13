// "Export for Anki" on the phone: gathers each word's audio and hands everything to anki-deck.js.
//
// A word's audio is cut from the episode's audio copy (the Ogg Opus file the phone downloads to
// play a synced episode), or from the clip that came with a word a friend shared. Words whose
// episode has no such copy (streamed originals, videos, web pages) are exported without audio.

import { buildDeck } from "./anki-deck.js";
import { cutOggOpus } from "./ogg-clip.js";

// The same air around a clip as the computer leaves (app/api/vocab.py).
const WORD_LEAD = 0.05, WORD_TAIL = 0.12, SENTENCE_LEAD = 0.3, SENTENCE_TAIL = 0.45;

/** The [start, end] seconds to cut for a word: { word, sentence }, each present only when known. */
export function clipRanges(v) {
  const out = {};
  if (v.start != null) out.word = [v.start - WORD_LEAD, (v.end != null ? v.end : v.start + 1) + WORD_TAIL];
  if (v.sent_start != null && v.sent_end != null) out.sentence = [v.sent_start - SENTENCE_LEAD, v.sent_end + SENTENCE_TAIL];
  return out;
}

/** Cut the clips for words that share one audio file. Returns { uid: { word, sentence } }. */
export function cutClips(bytes, words) {
  const jobs = words.flatMap((v) => Object.entries(clipRanges(v)).map(([part, range]) => ({ uid: v.uid, part, range })));
  const cut = cutOggOpus(bytes, jobs.map((j) => j.range)), out = {};
  jobs.forEach(({ uid, part }, i) => { if (cut[i]) (out[uid] ||= {})[part] = cut[i]; });
  return out;
}

/**
 * The deck file for these words, as bytes.
 * `source.audioFor(word)` resolves to { key, load } for the audio a word's times refer to, or null:
 * `key` names the file (words with the same key are cut together), `load()` resolves to its Blob.
 * `source.asset(path)` resolves to a fetch Response for a file shipped with the app.
 * `source.review` is each word's learning progress by uid (the game's `review` records), if any.
 * `progress(done, total)` is called as each audio file is finished.
 */
export async function vocabDeck(items, source, progress = () => {}) {
  const groups = new Map();
  for (const v of items) {
    if (!Object.keys(clipRanges(v)).length) continue;
    const audio = await source.audioFor(v);
    if (!audio) continue;
    if (!groups.has(audio.key)) groups.set(audio.key, { load: audio.load, words: [] });
    groups.get(audio.key).words.push(v);
  }
  const clips = {};
  let done = 0;
  for (const { load, words } of groups.values()) {
    try {
      const blob = await load();
      if (blob) Object.assign(clips, cutClips(new Uint8Array(await blob.arrayBuffer()), words));
    } catch (e) {
      console.warn("No audio for some words in the Anki deck:", e);  // those words go without sound
    }
    progress(++done, groups.size);
  }
  const text = async (path) => (await source.asset(path)).text();
  const [front, back, css, font] = await Promise.all([
    text("anki-card/front.html"), text("anki-card/back.html"), text("anki-card/style.css"),
    source.asset("fonts/NotoNaskhArabic.woff2").then((r) => r.arrayBuffer()),
  ]);
  return buildDeck(items, clips, { front, back, css }, new Uint8Array(font), Date.now() / 1000, source.review || {});
}
