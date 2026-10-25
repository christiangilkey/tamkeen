// Saying a short text in the language being learned (a grammar lesson's examples), with the voice the
// learner chose for their cards (Settings → Card voices, cardvoice.js): Azure with the learner's own key
// (each sentence made once and kept while the app is open), the computer's own voice model on the
// computer ("My computer"), or else the device's own voice, live and free. Nothing is published or kept
// for good: grammar examples have no recorded audio of their own (tools/grammar/README.md).

import { platform, state, toast } from "./app.js";
import { AZURE_VOICES, LOCAL_VOICE_LANGUAGES, azureReady, azureSpeak, buildSsml, voiceMode } from "./cardvoice.js";
import { azureVoiceOf } from "./voiceplay.js";
import { speakDevice, stopDevice } from "./devicevoice.js";

const settings = () => (state.status && state.status.settings) || {};
const made = new Map(); // "<voice>\u0000<text>" -> object URL of its sound (this run of the app)
const MAX_KEPT = 200;
let player = null;
let told = "";

/** Stop whatever is being said. */
export function stopSaying() {
  if (player) { player.pause(); player = null; }
  stopDevice();
}

async function playUrl(url) {
  stopSaying();
  const a = new Audio(url);
  player = a;
  await a.play();
  return { ended: new Promise((done) => { a.onended = done; a.onerror = done; a.onpause = done; }) };
}

function keep(key, bytes, type) {
  if (made.size >= MAX_KEPT) {
    const [oldest] = made.keys();
    URL.revokeObjectURL(made.get(oldest));
    made.delete(oldest);
  }
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  made.set(key, url);
  return url;
}

/** Made by Azure with the learner's key, or null when Azure isn't their card voice (or has none for `lang`). */
async function azureUrl(text, lang, s) {
  if (voiceMode(s) !== "azure" || !azureReady(s) || !AZURE_VOICES[lang]) return null;
  const voice = await azureVoiceOf(lang, s);
  if (!voice) return null;
  const key = `${voice}\u0000${text}`;
  if (made.has(key)) return made.get(key);
  const bytes = await azureSpeak({ key: s.tts_key_azure, region: s.tts_region_azure, ssml: buildSsml(text, voice) });
  return keep(key, bytes, "audio/ogg");
}

/** Made by this computer's downloaded voice ("My computer"), or null. */
async function computerUrl(text, lang, s) {
  if (platform !== "desktop" || voiceMode(s) !== "computer" || !LOCAL_VOICE_LANGUAGES.includes(lang)) return null;
  const key = `computer:${lang}\u0000${text}`;
  if (made.has(key)) return made.get(key);
  const r = await fetch(`/api/voices/sample?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text.slice(0, 200))}`);
  if (!r.ok) throw new Error("This computer's voice couldn't say it.");
  return keep(key, await r.arrayBuffer(), "audio/ogg");
}

/**
 * Say `text` (in language `lang`). Resolves to {ended}; never rejects: when the chosen voice fails, the
 * device's own voice says it, and when nothing can, one calm message says so (not on every tap).
 */
export async function sayText(text, lang) {
  const s = settings();
  const clean = String(text || "").replace(/[⟦⟧]/g, "").trim();
  if (!clean) return { ended: Promise.resolve() };
  for (const make of [azureUrl, computerUrl]) {
    try {
      const url = await make(clean, lang, s);
      if (url) return await playUrl(url);
    } catch (e) {
      if (e && e.name === "NotAllowedError") return { ended: Promise.resolve() };
      // (the device's own voice instead)
    }
  }
  try {
    return await speakDevice(clean, lang);
  } catch (e) {
    const message = (e && e.message) || "This device has no voice for this language.";
    if (message !== told) { told = message; toast(message, { timeout: 9000 }); }
    return { ended: Promise.resolve() };
  }
}
