// Scoring the learner's pronunciation with Azure's pronunciation check (Azure Speech "Pronunciation
// Assessment"), with the learner's own Azure key: the same key and region as the card voices (Settings →
// Card voices), whichever voice they hear cards in. Shared by every version; no screen code here (the
// result is drawn by components/pronresult.js).
//
// One request per attempt: the attempt (16 kHz mono WAV, at most 30 seconds) and the line it should be go to
// Azure's short-audio speech-to-text address with a "Pronunciation-Assessment" header; the answer scores the
// whole attempt (accuracy, fluency, completeness, and an overall score out of 100) and each word (its score,
// and whether it was left out, added or said wrongly). Azure allows the page to call it directly (it answers
// the browser's cross-site check with "any page"), as the card voices already do. Nothing is kept: neither
// here nor, by Microsoft's account, at Azure. It is billed like speech-to-text: the free tier's 5 hours of
// audio a month (whether those cover this check isn't said on Azure's pricing page).
//
// Azure checks only some languages (its "language support" page, 2026-11): Standard Arabic (ar-SA) and
// Egyptian (ar-EG), Catalan, Chinese, German, English, French, Hindi, Italian, Japanese, Korean,
// Portuguese, Russian, Spanish, Thai. Not Persian, Tagalog, Bisaya or Latin, and not the other Arabic
// dialects: checked as Standard Arabic, a Levantine or Iraqi word said properly would be marked wrong, so
// those get no score.
//
// The pure part is tested in tests/js/pronscore.test.mjs.

import { cleanAzureKey, cleanRegion, azureError, unreachable, voiceLocale } from "./cardvoice.js";

/** The locales Azure checks, for each language Tamkeen teaches: the first is used unless the voice the
 * learner hears is from another of them (pronLocale). */
export const PRON_LOCALES = {
  ar: ["ar-SA", "ar-EG"], ca: ["ca-ES"], de: ["de-DE"], en: ["en-US", "en-GB", "en-AU", "en-CA", "en-IN"],
  es: ["es-MX", "es-ES"], fr: ["fr-FR", "fr-CA"], hi: ["hi-IN"], it: ["it-IT"], ja: ["ja-JP"], ko: ["ko-KR"],
  pt: ["pt-BR", "pt-PT"], ru: ["ru-RU"], th: ["th-TH"], zh: ["zh-CN", "zh-TW", "zh-HK"],
};

/**
 * The locale an attempt in `lang` is checked in, or "" when Azure can't check it. `dialect`: the kind of
 * Arabic ("" Standard, "egy" Egyptian; any other dialect gets ""). `voice`: the Azure voice the learner hears
 * the language in ("es-ES-ElviraNeural"): its own locale when Azure checks it, so the attempt is judged
 * against the accent the learner is copying.
 */
export function pronLocale(lang, { dialect = "", voice = "" } = {}) {
  const list = PRON_LOCALES[lang];
  if (!list) return "";
  if (lang === "ar") {
    if (dialect === "egy") return "ar-EG";
    if (dialect) return "";
    return "ar-SA";
  }
  const own = voiceLocale(voice);
  return list.find((l) => l.toLowerCase() === own.toLowerCase()) || list[0];
}

/** Can attempts be scored with these settings: an Azure key and a region (the voice mode doesn't matter). */
export const azureKeyReady = (s) => cleanAzureKey(s && s.tts_key_azure).length >= 16 && !!cleanRegion(s && s.tts_region_azure);

/** The line as Azure is given it: no ⟦ ⟧ marks, no Arabic vowel marks (it reads plain spelling best), no
 * run of spaces. */
export function referenceText(text) {
  return String(text || "").replace(/[⟦⟧]/g, "").replace(/[ً-ٰٟۖ-ۭ]/g, "").replace(/ـ/g, "")
    .replace(/\s+/g, " ").trim();
}

/** Base64 of a string's UTF-8 bytes (btoa alone only takes Latin letters). */
export function base64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The "Pronunciation-Assessment" header for checking an attempt at `text`. */
export function assessHeader(text) {
  return base64Utf8(JSON.stringify({ ReferenceText: referenceText(text), GradingSystem: "HundredMark",
    Granularity: "Phoneme", Dimension: "Comprehensive", EnableMiscue: "True" }));
}

export const assessUrl = (region, locale) =>
  `https://${cleanRegion(region)}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(locale)}&format=detailed`;

/** The longest attempt Azure checks this way (seconds). */
export const MAX_SECONDS = 30;
export const RATE = 16000;

/** `samples` (mono floats at `rate`) as 16 kHz samples: averaged down when the rate is higher (the
 * simple way, which is all speech needs), at most MAX_SECONDS. */
export function to16k(samples, rate) {
  const max = MAX_SECONDS * RATE;
  if (rate === RATE) return samples.length > max ? samples.slice(0, max) : samples;
  const ratio = rate / RATE, n = Math.min(max, Math.floor(samples.length / ratio)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = i * ratio, b = Math.min(samples.length, (i + 1) * ratio);
    let sum = 0, count = 0;
    for (let j = Math.floor(a); j < b; j++) { sum += samples[j]; count++; }
    out[i] = count ? sum / count : 0;
  }
  return out;
}

/** A 16 kHz mono 16-bit WAV file of `samples` (floats at `rate`). */
export function wav16k(samples, rate) {
  const s = to16k(samples, rate), n = s.length;
  const out = new Uint8Array(44 + n * 2), view = new DataView(out.buffer);
  const text = (at, str) => { for (let i = 0; i < str.length; i++) out[at + i] = str.charCodeAt(i); };
  text(0, "RIFF"); view.setUint32(4, 36 + n * 2, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, s[i] || 0));
    view.setInt16(44 + i * 2, v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff), true);
  }
  return out;
}

const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : null);
const ERRORS = ["None", "Omission", "Insertion", "Mispronunciation"];

/**
 * Azure's answer, tidied: {heard, text, overall, accuracy, fluency, completeness, words: [{word, score,
 * error, phonemes: [{phoneme, score}]}]}. `heard` is false when Azure heard no speech. Azure's own pages
 * put the scores in two places (on the best result itself, or under its "PronunciationAssessment"): both
 * are read. A word's error is "none", "omission" (left out), "insertion" (said but not in the line) or
 * "mispronunciation"; any other kind of note Azure adds (pauses, flat tone) counts as none.
 */
export function parseAssessment(data) {
  const d = data && typeof data === "object" ? data : {};
  const best = Array.isArray(d.NBest) ? d.NBest[0] : null;
  const ok = d.RecognitionStatus === "Success" || d.RecognitionStatus === 0;
  if (!ok || !best) return { heard: false, text: "", overall: null, accuracy: null, fluency: null, completeness: null, words: [] };
  const pa = best.PronunciationAssessment || best;
  const words = (Array.isArray(best.Words) ? best.Words : []).map((w) => {
    const wa = (w && w.PronunciationAssessment) || w || {};
    const kind = ERRORS.includes(wa.ErrorType) ? wa.ErrorType.toLowerCase() : "none";
    return {
      word: String((w && w.Word) || ""),
      score: kind === "omission" ? 0 : num(wa.AccuracyScore),
      error: kind,
      phonemes: (Array.isArray(w && w.Phonemes) ? w.Phonemes : []).map((p) => ({
        phoneme: String((p && p.Phoneme) || ""), score: num(((p && p.PronunciationAssessment) || p || {}).AccuracyScore),
      })),
    };
  }).filter((w) => w.word);
  return { heard: true, text: String(best.Display || d.DisplayText || ""), overall: num(pa.PronScore ?? pa.AccuracyScore),
    accuracy: num(pa.AccuracyScore), fluency: num(pa.FluencyScore), completeness: num(pa.CompletenessScore), words };
}

/** A word's colour band: "good" (80 and up), "fair" (60 to 79) or "poor" (under 60, or left out). */
export function band(score, error = "none") {
  if (error === "omission" || error === "mispronunciation") return "poor";
  if (score == null) return "fair";
  return score >= 80 ? "good" : score >= 60 ? "fair" : "poor";
}

/**
 * Check an attempt: `wav` (from wav16k) against `text` in `locale`, with the learner's key and region.
 * Resolves to parseAssessment's answer. Errors say what went wrong in plain words (cardvoice.js azureError).
 */
export async function assess({ key, region, locale, text, wav, fetchFn = fetch }) {
  const r = cleanRegion(region);
  let res;
  try {
    res = await fetchFn(assessUrl(r, locale), {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": cleanAzureKey(key), "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        Accept: "application/json", "Pronunciation-Assessment": assessHeader(text) },
      body: wav,
    });
  } catch { throw unreachable(r); }
  if (!res.ok) {
    if (res.status === 400) throw Object.assign(new Error("Azure couldn't check this recording. Try again, a little closer to the microphone."), { status: 400 });
    throw azureError(res.status, r);
  }
  let data;
  try { data = await res.json(); } catch { throw new Error("Azure sent back something that isn't a score. Try again in a moment."); }
  return parseAssessment(data);
}
