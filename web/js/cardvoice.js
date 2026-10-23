// Voices for flashcards that came without a recording (Settings → Card voices; every version).
//
// A card saved from a podcast, a video or a reel plays its own recording. A card typed in by hand or
// saved from a web page or a book has nothing to listen to; its word and sentence are then read out by
// the voice the learner chose:
//   "device"   this phone's or computer's own voice, spoken live; nothing is kept (the default, free)
//   "azure"    Microsoft Azure's neural voices with the learner's own key (each user's own account and
//              free monthly allowance); the voice is made ONCE per card and kept with it
//   "computer" the learner's computer makes it with a voice model downloaded there (free, app/voices.py);
//              phones show "Waiting for your computer" and use their own voice meanwhile
// A made voice is kept like the clip of a word a friend shared: the same file (clips/<uid>.ogg on the
// computer, "clip:<uid>" on a phone, c_<uid>.ogg in Google Drive), and the card's `voice` holds where
// its word and sentence are in it ({start, end, sent_start, sent_end} as JSON; its own times, which
// point into its episode, are left alone). So it is made, and paid for, only once, plays on every
// device, goes into the Anki export and along with a word sent to a friend.
//
// Which cards play a recording of their own (hasOwnAudio): a friend's clip, or a moment in an
// episode with a real sound file. Words saved from a YouTube video, a Netflix title, an Instagram reel,
// a web page or a book have none the Vocab page or the review card can load, so they get the voice too.
//
// The choice, the Azure key and region and any voice picked travel between the learner's devices with
// the other keys (aikeys.js / app/aikeys.py: tts_mode, tts_key_azure, tts_region_azure, tts_voices).
// The key is only ever sent to Azure (https://<region>.tts.speech.microsoft.com), straight from the
// device: Azure answers web pages itself (it allows every origin), so nothing goes through Tamkeen.

import { cardSentence } from "./cardtext.js";
import { joinOggOpus } from "./oggjoin.js";

export const VOICE_MODES = ["device", "azure", "computer"];

/** The learner's choice ("device" until another is made). */
export function voiceMode(s) {
  return VOICE_MODES.includes(s && s.tts_mode) ? s.tts_mode : "device";
}

/** Kinds of episode whose sound the Vocab page and the review card can't load on any device: they
 * play inside YouTube's, Netflix's or Instagram's own player, or have no sound at all. ("missing":
 * the episode isn't on this device any more.) app/voices.py NO_AUDIO_KINDS is the twin. */
export const NO_AUDIO_KINDS = ["video/youtube", "video/netflix", "video/instagram", "text/html", "text/book", "missing"];

/** True when a card has a recording of its own that can be played here: a friend's clip, or a moment
 * in an episode with a real sound file (a podcast, the learner's own audio or video). `audio_type` is
 * the episode's kind as the vocab list gives it. */
export function hasOwnAudio(v) {
  if (!v || v.start == null) return false;
  if (v.clip) return true;
  return !!v.episode_id && !NO_AUDIO_KINDS.includes(v.audio_type || "");
}

/** Where a card's kept voice has its word and sentence ({start, end, sent_start, sent_end}), or null. */
export function voiceTimes(v) {
  let t = v && v.voice;
  if (typeof t === "string") { try { t = JSON.parse(t || "null"); } catch { t = null; } }
  if (!t || typeof t !== "object" || !Number.isFinite(t.start) || !Number.isFinite(t.end)) return null;
  const n = (x) => (Number.isFinite(x) ? x : null);
  return { start: t.start, end: t.end, sent_start: n(t.sent_start), sent_end: n(t.sent_end) };
}

/** True when a card needs a voice made: nothing of its own it can play, no voice yet, and a word to say. */
export function needsVoice(v) {
  return !!v && !hasOwnAudio(v) && !voiceTimes(v) && !!clean(v.text);
}

const clean = (s) => String(s ?? "").replace(/[⟦⟧]/g, "").replace(/\s+/g, " ").trim();

/** What a voice says for a card: the word, and the part of its sentence the card shows (cardtext.js:
 * at most about 110 characters around the word, so a web page's long sentence costs no more than a short one). */
export function voiceText(v) {
  const word = clean(v && v.text);
  const sentence = clean(String(cardSentence((v && v.sentence) || "", word) || "").replace(/…/g, " "));
  return { word, sentence: sentence && sentence !== word ? sentence : "" };
}

/** How many characters making a card's voice sends (what Azure counts). */
export function voiceChars(v) {
  const { word, sentence } = voiceText(v);
  return word.length + sentence.length;
}

// ---------------------------------------------------------------- Azure

/** The neural voice used for each language being learned, unless the learner picks another. */
export const AZURE_VOICES = {
  ar: "ar-SA-ZariyahNeural", es: "es-MX-DaliaNeural", fr: "fr-FR-DeniseNeural", ja: "ja-JP-NanamiNeural",
  zh: "zh-CN-XiaoxiaoNeural", ru: "ru-RU-SvetlanaNeural", it: "it-IT-ElsaNeural", tl: "fil-PH-BlessicaNeural",
  pt: "pt-BR-FranciscaNeural", ca: "ca-ES-JoanaNeural", th: "th-TH-PremwadeeNeural", de: "de-DE-KatjaNeural",
  fa: "fa-IR-DilaraNeural", hi: "hi-IN-SwaraNeural", ko: "ko-KR-SunHiNeural", en: "en-US-JennyNeural",
  // ceb (Bisaya): Azure has no Bisaya voice, and a Tagalog one would say it wrongly.
};

/** A country's own voice, for the country the learner chose for the language (the same choice as
 * YouTube's "Popular in"): Arabic by dialect (Egyptian, Moroccan, Levantine, Gulf…), and the others' main variants. */
export const AZURE_BY_COUNTRY = {
  ar: { AE: "ar-AE-FatimaNeural", BH: "ar-BH-LailaNeural", DZ: "ar-DZ-AminaNeural", EG: "ar-EG-SalmaNeural",
        IQ: "ar-IQ-RanaNeural", JO: "ar-JO-SanaNeural", KW: "ar-KW-NouraNeural", LB: "ar-LB-LaylaNeural",
        LY: "ar-LY-ImanNeural", MA: "ar-MA-MounaNeural", OM: "ar-OM-AyshaNeural", QA: "ar-QA-AmalNeural",
        SA: "ar-SA-ZariyahNeural", SY: "ar-SY-AmanyNeural", TN: "ar-TN-ReemNeural", YE: "ar-YE-MaryamNeural" },
  es: { MX: "es-MX-DaliaNeural", ES: "es-ES-ElviraNeural", AR: "es-AR-ElenaNeural", CO: "es-CO-SalomeNeural",
        CL: "es-CL-CatalinaNeural", PE: "es-PE-CamilaNeural", US: "es-US-PalomaNeural", VE: "es-VE-PaolaNeural" },
  fr: { FR: "fr-FR-DeniseNeural", BE: "fr-BE-CharlineNeural", CA: "fr-CA-SylvieNeural", CH: "fr-CH-ArianeNeural" },
  pt: { BR: "pt-BR-FranciscaNeural", PT: "pt-PT-RaquelNeural" },
  en: { US: "en-US-JennyNeural", GB: "en-GB-SoniaNeural", AU: "en-AU-NatashaNeural", CA: "en-CA-ClaraNeural",
        IE: "en-IE-EmilyNeural", NZ: "en-NZ-MollyNeural", IN: "en-IN-NeerjaNeural" },
  de: { DE: "de-DE-KatjaNeural", AT: "de-AT-IngridNeural", CH: "de-CH-LeniNeural" },
  zh: { TW: "zh-TW-HsiaoChenNeural" },
};

/** Azure's locale prefix for a language's voices ("fil" for Tagalog). */
export const azurePrefix = (lang) => (lang === "tl" ? "fil" : lang);

/** The voices the learner picked, by language: the setting tts_voices ({lang: voice name}, as JSON). */
export function pickedVoices(s) {
  try {
    const raw = JSON.parse((s && s.tts_voices) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}

/** tts_voices with `voice` picked for `lang` ("" = back to the usual voice). */
export function withPickedVoice(s, lang, voice) {
  const picked = { ...pickedVoices(s) };
  if (voice) picked[lang] = voice; else delete picked[lang];
  return Object.keys(picked).length ? JSON.stringify(picked) : "";
}

const VOICE_NAME = /^[a-z]{2,3}-[A-Za-z0-9]{2,8}-[\w:.-]{2,80}$/;

/** The Azure voice for language `lang`: the one the learner picked, else the chosen country's, else
 * the language's usual one. Null for a language Azure has no voice for. */
export function azureVoiceFor(lang, { picked = {}, country = "" } = {}) {
  const own = picked && picked[lang];
  if (own && VOICE_NAME.test(own) && own.toLowerCase().startsWith(`${azurePrefix(lang)}-`)) return own;
  const byCountry = AZURE_BY_COUNTRY[lang] && AZURE_BY_COUNTRY[lang][String(country || "").toUpperCase()];
  return byCountry || AZURE_VOICES[lang] || null;
}

/** "ar-EG" from "ar-EG-SalmaNeural". */
export const voiceLocale = (voice) => String(voice || "").split("-").slice(0, 2).join("-");

/** A region as Azure writes it: "West Europe" or "westeurope " → "westeurope". */
export function cleanRegion(region) {
  return String(region || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** An Azure key tidied of what came along with a paste (spaces, quotes, a "Key 1:" label). */
export function cleanAzureKey(key) {
  return String(key || "").replace(/^\s*key\s*[12]?\s*[:=]\s*/i, "").replace(/["'\s]/g, "");
}

/** Azure is ready to make voices: chosen, with a key and a region. */
export function azureReady(s) {
  return voiceMode(s) === "azure" && cleanAzureKey(s.tts_key_azure).length >= 16 && !!cleanRegion(s.tts_region_azure);
}

export const AZURE_FORMAT = "ogg-48khz-16bit-mono-opus";
export const azureSpeakUrl = (region) => `https://${cleanRegion(region)}.tts.speech.microsoft.com/cognitiveservices/v1`;
export const azureVoicesUrl = (region) => `https://${cleanRegion(region)}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
export const AZURE_PRICING = "https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/";
export const AZURE_PORTAL = "https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices";
export const AZURE_FREE = "https://azure.microsoft.com/free/";

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Silence the voice leaves before and after each part (ms). The gap after the word keeps the word
 * and the sentence apart in the one file: playing the word stops in it. */
export const LEAD_MS = 60, WORD_GAP_MS = 900, TAIL_MS = 350;

/** The SSML for one part: `text` in `voice`, with exactly `lead` and `tail` ms of silence round it. */
export function buildSsml(text, voice, { lead = LEAD_MS, tail = TAIL_MS } = {}) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${xml(voiceLocale(voice))}">`
    + `<voice name="${xml(voice)}"><mstts:silence type="Leading-exact" value="${Math.round(lead)}ms"/>`
    + `<mstts:silence type="Tailing-exact" value="${Math.round(tail)}ms"/>${xml(text)}</voice></speak>`;
}

/** An error from Azure, worded for the learner. `keyRejected` when the key (or its region) was refused. */
export function azureError(status, region = "") {
  if (status === 401 || status === 403) {
    return Object.assign(new Error(`Azure didn't accept this key in the region “${region}”. Copy Key 1 again, and check that the region is the one shown next to it (for example westeurope).`),
                         { keyRejected: true, status });
  }
  if (status === 429) return Object.assign(new Error("Azure says too many requests, or this month's free allowance is used up. Try again later, or check your usage in the Azure portal."), { status });
  if (status === 400) return Object.assign(new Error("Azure didn't accept the request: the chosen voice may not exist in this region. Pick another voice."), { status, badVoice: true });
  return Object.assign(new Error(`Azure answered with an error (${status}). Try again in a moment.`), { status });
}

/** The words for "Azure couldn't be reached" (a region misspelled, or no connection). */
export const unreachable = (region) => new Error(`Couldn't reach Azure in the region “${region}”. Check your connection and how the region is spelled (for example westeurope, eastus).`);

/** One part said by Azure: the Ogg Opus bytes. `fetchFn` is the device's fetch. */
export async function azureSpeak({ key, region, ssml, fetchFn = fetch }) {
  const r = cleanRegion(region);
  let res;
  try {
    res = await fetchFn(azureSpeakUrl(r), {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": cleanAzureKey(key), "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": AZURE_FORMAT },
      body: ssml,
    });
  } catch { throw unreachable(r); }
  if (!res.ok) throw azureError(res.status, r);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 40) throw new Error("Azure sent back no sound. Try again in a moment.");
  return bytes;
}

/** Azure's voices in this region: [{name, locale, label, gender}]. No characters are used. Also the key test. */
export async function azureVoices({ key, region, fetchFn = fetch }) {
  const r = cleanRegion(region);
  let res;
  try {
    res = await fetchFn(azureVoicesUrl(r), { headers: { "Ocp-Apim-Subscription-Key": cleanAzureKey(key) } });
  } catch { throw unreachable(r); }
  if (!res.ok) throw azureError(res.status, r);
  const list = await res.json();
  return (Array.isArray(list) ? list : []).map((x) => ({
    name: String(x.ShortName || ""), locale: String(x.Locale || ""), gender: String(x.Gender || ""),
    label: `${x.LocalName || x.DisplayName || x.ShortName}${x.LocaleName ? ` · ${x.LocaleName}` : ""}`,
    type: String(x.VoiceType || ""),
  })).filter((x) => x.name);
}

/** The voices offered for a language: plain neural voices (not the dearer HD ones), the country's own first. */
export function voicesForLanguage(list, lang) {
  const prefix = `${azurePrefix(lang)}-`.toLowerCase();
  return (list || []).filter((x) => x.locale.toLowerCase().startsWith(prefix) && !x.name.includes(":")
    && (!x.type || x.type === "Neural")).sort((a, b) => a.locale.localeCompare(b.locale) || a.name.localeCompare(b.name));
}

/**
 * Where the word and the sentence are inside a card's voice, from the parts of the joined file
 * (joinOggOpus): the word is said after `lead` and stops `gap` before the end of its part; the sentence
 * likewise in the next part. Rounded to milliseconds. No sentence: its times stay empty.
 */
export function clipTimes(parts, { lead = LEAD_MS / 1000, gap = WORD_GAP_MS / 1000, tail = TAIL_MS / 1000 } = {}) {
  const r = (x) => Math.round(x * 1000) / 1000;
  const [w, s] = parts;
  const start = r(w.start + lead);
  const end = r(Math.max(start + 0.15, w.start + w.seconds - gap));
  if (!s) return { start, end, sent_start: null, sent_end: null };
  const sentStart = r(s.start + lead);
  return { start, end, sent_start: sentStart, sent_end: r(Math.max(sentStart + 0.2, s.start + s.seconds - tail)) };
}

/** A card's voice made by Azure: {bytes, times}, the word and the sentence in one Ogg Opus file. */
export async function makeAzureVoice(v, { key, region, voice, fetchFn = fetch }) {
  const { word, sentence } = voiceText(v);
  if (!word) throw new Error("This card has no word to say.");
  const parts = [await azureSpeak({ key, region, fetchFn, ssml: buildSsml(word, voice, { tail: sentence ? WORD_GAP_MS : TAIL_MS }) })];
  if (sentence) parts.push(await azureSpeak({ key, region, fetchFn, ssml: buildSsml(sentence, voice) }));
  const joined = joinOggOpus(parts);
  if (!joined) throw new Error("Azure's sound couldn't be read.");
  return { bytes: joined.bytes, times: clipTimes(joined.parts, { gap: sentence ? WORD_GAP_MS / 1000 : TAIL_MS / 1000 }) };
}

// ---------------------------------------------------------------- made once per card

const making = new Map(); // card key -> the promise of its voice, while it is being made

/**
 * Give card `v` its voice, once: `make(v)` resolves to {bytes, times} (null: no voice for this card's
 * language) and `keep(v, made)` stores it. A card that has its own audio, or a voice already, is left
 * alone; a second press while the first is still being made waits for that one instead of paying
 * again. Resolves to true when the card has a voice now; `v` itself gets it (`voice`), so the next
 * play just plays it.
 */
export async function ensureVoice(v, make, keep) {
  if (hasOwnAudio(v) || voiceTimes(v)) return true;
  const key = v.uid || v.id;
  if (!making.has(key)) {
    const job = (async () => {
      const made = await make(v);
      if (!made) return false;
      await keep(v, made);
      v.voice = JSON.stringify(made.times);
      return true;
    })();
    making.set(key, job);
    job.then(() => making.delete(key), () => making.delete(key));
  }
  return making.get(key);
}

/** A card's voice, once made, is never taken away by another device's copy without one: a voice made
 * on the computer (or with Azure) must survive the phone editing the card before it heard of the
 * voice. The other copy's other changes still win. A millisecond is added to its time so that this
 * copy, voice and all, goes back to the other device. Used by the phone's sync (mobile/src/js/sync.js);
 * app/sync/engine.py keep_voice is the computer's twin. */
export function keepVoice(remote, local) {
  if (!local || !local.voice || remote.voice) return remote;
  return { ...remote, voice: local.voice, updated_at: Math.round(((remote.updated_at || 0) + 0.001) * 1e6) / 1e6 };
}

/** For tests: forget the voices being made. */
export function forgetMaking() { making.clear(); }

// ---------------------------------------------------------------- saying a card

/**
 * Say part ("word" or "sentence") of card `v`. Resolves to { ended } (settles when the speaking has
 * stopped), as the Vocab page's playSnippet does. In order: the card's own recording; its kept voice;
 * a voice made now (Azure, or this computer); the device's own voice, live. Whatever fails, the next
 * one is tried, so a card never ends in an error while there is any voice for it. `deps`:
 *   playSnippet    (v, start, end, {voice}) => Promise<{ended}>  plays a card's own audio (or, with
 *                                                      `voice`, its kept voice)
 *   makeVoice      (v) => Promise<boolean> | null       gives the card its kept voice now, or null when
 *                                                      this device doesn't
 *   speakDevice    (text, lang) => Promise<{ended}>     the device's own voice, live
 *   lang           the card's language
 *   onNote         (message) => void                    something to tell the learner (a voice that
 *                                                      couldn't be made: the device's voice is used)
 */
export async function sayCard(v, part, deps) {
  const { playSnippet, makeVoice, speakDevice, lang, onNote = () => {} } = deps;
  const text = voiceText(v);
  const word = part === "word";
  const stretch = (t) => (word ? [t.start, t.end ?? t.start + 1] : t.sent_start != null ? [t.sent_start, t.sent_end ?? t.sent_start + 3] : null);
  if (hasOwnAudio(v)) {
    const at = stretch(v);
    if (at) { try { return await playSnippet(v, at[0], at[1], { voice: false }); } catch { /* the voice instead */ } }
  }
  if (!voiceTimes(v) && makeVoice) {
    try { await makeVoice(v); } catch (e) { onNote(e && e.message ? e.message : String(e)); }
  }
  const kept = voiceTimes(v);
  const at = kept && stretch(kept);
  if (at) { try { return await playSnippet(v, at[0], at[1], { voice: true }); } catch { /* the device's voice */ } }
  const say = word ? text.word : text.sentence;
  if (!say) throw new Error("This card has nothing to say.");
  return speakDevice(say, lang);
}

/** Roughly how long saying `text` takes, in seconds (a voice spoken live gives no length beforehand). */
export function speakingSeconds(text) {
  return Math.min(20, 0.6 + String(text || "").length * 0.075);
}

// ---------------------------------------------------------------- the computer's voices

/** Can the card's word (or sentence) be heard at all: its own recording, a kept voice, or a text to say. */
export function canSay(v, part = "word") {
  const t = voiceTimes(v);
  if (part === "word") return hasOwnAudio(v) || !!t || !!voiceText(v).word;
  return (hasOwnAudio(v) && v.sent_start != null) || !!(t && t.sent_start != null) || !!voiceText(v).sentence;
}

/** Languages the computer has a voice model for (app/voices.py VOICES: tests check the two agree). */
export const LOCAL_VOICE_LANGUAGES = ["ar", "es", "fr", "it", "pt", "ca", "ru", "de", "fa", "en"];

/** Cards waiting for the computer's voice, among `words`: {count, langs: {lang: n}, without: n} —
 * `without` = cards in languages the computer has no voice for (they keep the device's voice). */
export function waitingForComputer(words, langOf = (v) => v.language) {
  const out = { count: 0, langs: {}, without: 0 };
  for (const v of words || []) {
    if (v.deleted || !needsVoice(v)) continue;
    const lang = langOf(v);
    if (LOCAL_VOICE_LANGUAGES.includes(lang)) {
      out.count++;
      out.langs[lang] = (out.langs[lang] || 0) + 1;
    } else out.without++;
  }
  return out;
}

// ---------------------------------------------------------------- the device's own voice

/** The language tag a device voice is asked for, by the app's language code. */
export const DEVICE_TAGS = {
  ar: "ar-SA", es: "es-ES", fr: "fr-FR", ja: "ja-JP", zh: "zh-CN", ru: "ru-RU", it: "it-IT", tl: "fil-PH",
  pt: "pt-BR", ca: "ca-ES", ceb: "ceb-PH", th: "th-TH", de: "de-DE", fa: "fa-IR", hi: "hi-IN", ko: "ko-KR", en: "en-US",
};
export const deviceTag = (lang) => DEVICE_TAGS[lang] || lang || "en-US";

/** The best of the device's voices (each {lang, name}) for language `lang`: one whose language
 * matches exactly, else one of the same language anywhere (Tagalog's may be "fil" or "tl"). Null when none. */
export function pickDeviceVoice(voices, lang) {
  const tag = deviceTag(lang).toLowerCase().replace(/_/g, "-");
  const bases = new Set([tag.split("-")[0], lang === "tl" ? "tl" : "", lang === "tl" ? "fil" : ""].filter(Boolean));
  const norm = (x) => String(x.lang || "").toLowerCase().replace(/_/g, "-");
  const list = (voices || []).filter((x) => x && x.lang);
  return list.find((x) => norm(x) === tag) || list.find((x) => bases.has(norm(x).split("-")[0])) || null;
}

/** How to add a voice for a language to the device, for "No <language> voice on this …". `where`:
 * "windows", "mac", "android", "ios", "web". */
export function addVoiceHelp(name, where) {
  switch (where) {
    case "android": return `This phone has no ${name} voice. To add one: open the phone's Settings → search for “Text-to-speech” → Preferred engine (Speech Services by Google) → Settings → Install voice data → ${name}.`;
    case "ios": return `This iPhone has no ${name} voice. To add one: Settings → Accessibility → Spoken Content → Voices → ${name}.`;
    case "mac": return `This Mac has no ${name} voice. To add one: System Settings → Accessibility → Spoken Content → System voice → Manage Voices → ${name}.`;
    case "windows": return `This computer has no ${name} voice. To add one: Windows Settings → Time & language → Speech → Add voices → ${name}. Then restart Tamkeen.`;
    default: return `This browser has no ${name} voice. Some browsers have more voices than others (Chrome and Edge have many), or add a voice to the device in its own settings.`;
  }
}
