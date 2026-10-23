// Saying a card on the Vocab page and in the reviewer: its own recording when it can be played here,
// else its kept voice, else the voice the learner chose (cardvoice.js), made once and kept for Azure
// and "My computer", or the device's own voice, live. Shared by every version; each app shell
// (app.js) supplies saveVoice, makeComputerVoice and speechPlugin.
//
// Pressing Word or Sentence never ends in an error message per press: when nothing at all can say
// the card, one calm message is shown, and the same one is never stacked on top of itself.

import { makeComputerVoice, saveVoice, speechPlugin, state, toast } from "./app.js";
import { AZURE_VOICES, LOCAL_VOICE_LANGUAGES, azureReady, azureVoiceFor, azureVoices, ensureVoice, makeAzureVoice, pickedVoices,
         sayCard, voiceMode, voicesForLanguage, voiceLocale } from "./cardvoice.js";
import { deviceHasVoice, speakDevice, stopDevice } from "./devicevoice.js";
import { detectLanguage } from "./languages.js";

const settings = () => (state.status && state.status.settings) || {};

/** The language a card is in. */
export const cardLanguage = (v) => v.language || detectLanguage(v.sentence || v.text);

/** The country chosen for a language (YouTube's "Popular in", this device), for Arabic's dialect voice. */
async function countryFor(lang) {
  try {
    const { chosenCountry } = await import("./youtube-home.js");
    return chosenCountry(lang);
  } catch { return ""; }
}

const replaced = new Map(); // voice name Azure refused -> the region's own voice used instead (this run)

/** The Azure voice for a card's language, or null when Azure has none for it. */
export async function azureVoiceOf(lang, s = settings()) {
  const voice = azureVoiceFor(lang, { picked: pickedVoices(s), country: await countryFor(lang) });
  return voice && (replaced.get(voice) || voice);
}

/** Make card `v`'s voice with Azure: if the usual voice isn't offered in the learner's region, the
 * region's first voice for the language (same country if it has one) is used instead. Null when
 * Azure has no voice for the card's language (Bisaya). */
async function azureMaker(v, s) {
  const lang = cardLanguage(v);
  const voice = await azureVoiceOf(lang, s);
  if (!voice) return null;
  const opts = { key: s.tts_key_azure, region: s.tts_region_azure, voice };
  try {
    return await makeAzureVoice(v, opts);
  } catch (e) {
    if (!e || !e.badVoice || pickedVoices(s)[lang]) throw e;
    const offered = voicesForLanguage(await azureVoices(opts), lang);
    const other = offered.find((x) => x.locale === voiceLocale(voice)) || offered[0];
    if (!other) throw e;
    replaced.set(voice, other.name);
    return makeAzureVoice(v, { ...opts, voice: other.name });
  }
}

/** What gives a card its kept voice on this device now, or null (the device's voice says it live). */
export function voiceMaker(s = settings()) {
  const mode = voiceMode(s);
  if (mode === "azure" && azureReady(s)) {
    return (v) => ensureVoice(v, (w) => azureMaker(w, s),
      (w, made) => saveVoice(w.id, new Blob([made.bytes], { type: "audio/ogg" }), made.times));
  }
  if (mode === "computer" && makeComputerVoice) {
    return (v) => ensureVoice(v, async (w) => {
      const row = await makeComputerVoice(w);
      let times = row && row.voice;
      try { times = typeof times === "string" ? JSON.parse(times) : times; } catch { times = null; }
      return times ? { times } : null;
    }, () => null);
  }
  return null;
}

// ----- one calm message, never stacked -----
let shown = null; // {text, el} of the message on screen
function calm(text) {
  if (shown && shown.text === text && shown.el && shown.el.isConnected) return;
  const el = toast(text, { timeout: 9000 });
  shown = { text, el };
}

const told = new Set(); // a voice that couldn't be made: said once per run, not on every card of a review

/**
 * A function that says part ("word" or "sentence") of a card: (v, part) => Promise<{ended}>. It never
 * rejects. `playSnippet` is the page's player for cards with audio of their own (and their kept voices).
 */
export function cardSayer(playSnippet) {
  return async (v, part) => {
    try {
      return await sayCard(v, part, {
        playSnippet,
        makeVoice: voiceMaker(settings()),
        speakDevice,
        lang: cardLanguage(v),
        onNote: (message) => {
          if (told.has(message)) return;
          told.add(message);
          calm(`${message} This device's own voice is used meanwhile.`);
        },
      });
    } catch (e) {
      if (e && e.nothing) return { ended: Promise.resolve() };  // no text behind a failed recording: nothing to say about it
      const message = e && e.message ? e.message : "This card can't be said on this device.";
      // A device without a voice for the language: said once, not again on every card of a review.
      if (!(e && e.noVoice && told.has(message))) calm(message);
      if (e && e.noVoice) told.add(message);
      return { ended: Promise.resolve() };
    }
  };
}

// ----- is there a voice for a language here? (the Vocab page's Word and Sentence buttons) -----
const voiceKnown = new Map(); // lang -> true / false, once this device has said

/** Can a text in language `lang` be said on this device: true (a voice is made for the card, or the
 * device has one), false (no voice at all: a card with nothing it can play gets no buttons), or null
 * while that isn't known yet (the buttons are shown). Synchronous; learnVoices finds it out. */
export function voiceHere(lang, s = settings()) {
  const mode = voiceMode(s);
  if (mode === "azure" && azureReady(s) && AZURE_VOICES[lang]) return true;
  if (mode === "computer" && makeComputerVoice && LOCAL_VOICE_LANGUAGES.includes(lang)) return true;
  return voiceKnown.has(lang) ? voiceKnown.get(lang) : null;
}

/** Find out whether the device has a voice for each of `langs`. Resolves true when that changed what
 * voiceHere says. A browser that lists no voices at all (or not yet) is taken as unknown, not as none. */
export async function learnVoices(langs) {
  let changed = false;
  await Promise.all([...new Set(langs)].filter(Boolean).map(async (lang) => {
    let has = await deviceHasVoice(lang);
    if (has === false && !speechPlugin && window.speechSynthesis && !window.speechSynthesis.getVoices().length) has = null;
    if (has === null || voiceKnown.get(lang) === has) return;
    voiceKnown.set(lang, has);
    changed = true;
  }));
  return changed;
}

export { stopDevice };
