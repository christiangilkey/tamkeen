// The device's own voice, spoken live (Settings → Card voices → "This device's voice", and meanwhile
// for every other choice until a card's kept voice exists). Nothing is stored.
//   computer and web app: the browser's speech (speechSynthesis), with the voices the system has
//   Android and iPhone:   the phone's own text-to-speech (TamkeenSpeech: SpeechPlugin.java /
//                         SpeechPlugin.swift), since Android's web view has no speechSynthesis
// See cardvoice.js for the choice and the voices that are kept.

import { platform, speechPlugin } from "./app.js";
import { addVoiceHelp, deviceTag, pickDeviceVoice } from "./cardvoice.js";
import { langInfo } from "./languages.js";

/** Which device this is, for the words on adding a voice. */
export function deviceKind() {
  const cap = window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform();
  if (cap === "android" || cap === "ios") return cap;
  if (window.TAMKEEN_WEB === true || platform !== "desktop") return "web";
  return /Mac/i.test(navigator.platform || navigator.userAgent) ? "mac" : "windows";
}

/** The browser's voices; they may arrive a moment after the page asks. */
function browserVoices() {
  const synth = window.speechSynthesis;
  if (!synth) return Promise.resolve([]);
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((done) => {
    const finish = () => { synth.removeEventListener("voiceschanged", finish); clearTimeout(timer); done(synth.getVoices()); };
    const timer = setTimeout(finish, 1500);
    synth.addEventListener("voiceschanged", finish);
  });
}

const known = new Map(); // lang -> Promise<boolean>: has the device a voice for it?

/** Whether the device can say language `lang`: true, false, or null when it can't tell. */
export function deviceHasVoice(lang) {
  if (!known.has(lang)) {
    const ask = (async () => {
      if (speechPlugin) {
        const r = await speechPlugin.hasVoice({ lang: deviceTag(lang) });
        return r && r.engine === false ? false : !!(r && r.available);
      }
      if (!window.speechSynthesis) return false;
      return !!pickDeviceVoice(await browserVoices(), lang);
    })().catch(() => null);
    known.set(lang, ask);
    ask.then((r) => { if (r === null) known.delete(lang); });
  }
  return known.get(lang);
}

/** Forget what is known about the device's voices (after the learner may have added one). */
export function recheckDeviceVoices() { known.clear(); }

/** The words for a device without a voice for `lang`. */
export const noVoiceText = (lang) => addVoiceHelp(langInfo(lang).name, deviceKind());

let current = null; // the browser utterance being spoken

/** Stop whatever the device's voice is saying. */
export function stopDevice() {
  try { if (speechPlugin) speechPlugin.stop(); else if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch { /* nothing to stop */ }
  current = null;
}

/** Say `text` in language `lang` with the device's own voice. Resolves to {ended} once it has started
 * (ended settles when it has finished); throws, with the way to add a voice, when there is none. */
export async function speakDevice(text, lang) {
  if ((await deviceHasVoice(lang)) === false) {
    throw Object.assign(new Error(noVoiceText(lang)), { noVoice: true });
  }
  stopDevice();
  if (speechPlugin) {
    const ended = speechPlugin.speak({ text, lang: deviceTag(lang), rate: 0.95 }).then(() => {}, (e) => {
      if (e && /NO_VOICE/.test(String(e.code || e.message))) known.set(lang, Promise.resolve(false));
    });
    return { ended };
  }
  const synth = window.speechSynthesis;
  if (!synth) throw new Error(noVoiceText(lang));
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickDeviceVoice(await browserVoices(), lang);
  u.lang = voice ? voice.lang : deviceTag(lang);
  if (voice) u.voice = voice;
  u.rate = 0.95;
  current = u;
  const ended = new Promise((done) => {
    u.onend = done;
    u.onerror = done;
    // Some browsers drop the end of a long utterance silently: a timer makes sure nothing waits forever.
    setTimeout(done, 1500 + String(text).length * 180);
  });
  synth.speak(u);
  return { ended };
}

/** On Android: open the phone's text-to-speech settings (where a voice is added). False elsewhere. */
export async function openVoiceSettings() {
  if (!speechPlugin || deviceKind() !== "android") return false;
  try { return !!(await speechPlugin.openSettings()).opened; } catch { return false; }
}
