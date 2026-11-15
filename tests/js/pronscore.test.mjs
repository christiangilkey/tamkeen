// The pronunciation score (web/js/pronscore.js): which accent an attempt is checked in, the WAV file and the
// header sent to Azure, and reading Azure's answer in both the shapes its own pages show.
import test from "node:test";
import assert from "node:assert/strict";

import { assess, assessHeader, assessUrl, azureKeyReady, band, base64Utf8, parseAssessment, pronLocale, referenceText, to16k,
  wav16k } from "../../web/js/pronscore.js";

test("the accent an attempt is checked in", () => {
  assert.equal(pronLocale("es"), "es-MX");
  assert.equal(pronLocale("es", { voice: "es-ES-ElviraNeural" }), "es-ES", "the accent of the voice the learner hears");
  assert.equal(pronLocale("es", { voice: "es-AR-ElenaNeural" }), "es-MX", "a voice Azure can't check against: the usual one");
  assert.equal(pronLocale("pt", { voice: "pt-PT-RaquelNeural" }), "pt-PT");
  assert.equal(pronLocale("zh", { voice: "zh-TW-HsiaoChenNeural" }), "zh-TW");
  assert.equal(pronLocale("ar"), "ar-SA");
  assert.equal(pronLocale("ar", { dialect: "egy" }), "ar-EG");
  for (const d of ["lev", "glf", "irq", "mor"]) assert.equal(pronLocale("ar", { dialect: d }), "", `${d}: not checked as Standard Arabic`);
  for (const lang of ["fa", "tl", "ceb", "la", "xx"]) assert.equal(pronLocale(lang), "", `${lang}: Azure doesn't check it`);
  for (const lang of ["ca", "de", "en", "fr", "hi", "it", "ja", "ko", "ru", "th"]) assert.ok(pronLocale(lang), lang);
});

test("a key and a region are enough, whatever voice cards are read in", () => {
  assert.equal(azureKeyReady({ tts_key_azure: "0123456789abcdef0123", tts_region_azure: "West Europe", tts_mode: "device" }), true);
  assert.equal(azureKeyReady({ tts_key_azure: "short", tts_region_azure: "westeurope" }), false);
  assert.equal(azureKeyReady({ tts_key_azure: "0123456789abcdef0123" }), false);
  assert.equal(azureKeyReady(null), false);
});

test("the line Azure is given, and the header that carries it", () => {
  assert.equal(referenceText("  أُرِيدُ ⟦قَهْوَةً⟧   مِنْ فَضْلِكَ "), "أريد قهوة من فضلك");
  assert.equal(referenceText("¿Dónde ⟦está⟧ el tren?"), "¿Dónde está el tren?");
  const decoded = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  assert.equal(decoded(base64Utf8("مرحبا – ¿qué?")), "مرحبا – ¿qué?");
  const json = JSON.parse(decoded(assessHeader("أُرِيدُ ⟦قَهْوَةً⟧")));
  assert.deepEqual(json, { ReferenceText: "أريد قهوة", GradingSystem: "HundredMark", Granularity: "Phoneme", Dimension: "Comprehensive", EnableMiscue: "True" });
  assert.equal(assessUrl("West Europe", "ar-SA"),
    "https://westeurope.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ar-SA&format=detailed");
});

test("the attempt as a 16 kHz mono WAV file, at most 30 seconds", () => {
  const rate = 48000, samples = new Float32Array(rate).map((_, i) => Math.sin(i / 10) * 0.5);
  const wav = wav16k(samples, rate);
  const view = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(wav.slice(8, 12)), "WAVE");
  assert.equal(view.getUint16(22, true), 1, "mono");
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 16000 * 2, "one second of 16-bit samples");
  assert.equal(wav.length, 44 + 32000);
  assert.equal(to16k(new Float32Array(16000 * 40), 16000).length, 16000 * 30);
  assert.equal(to16k(new Float32Array(24000 * 40), 24000).length, 16000 * 30);
  const flat = to16k(new Float32Array(24).fill(0.25), 24000);
  assert.equal(flat.length, 16);
  assert.ok(flat.every((x) => Math.abs(x - 0.25) < 1e-6));
});

// Azure's own pages show the scores in two places: both must read the same.
const FLAT = {
  RecognitionStatus: "Success", DisplayText: "Quiero un café.",
  NBest: [{ Display: "Quiero un café.", AccuracyScore: 82.4, FluencyScore: 91, CompletenessScore: 100, PronScore: 86.2,
    Words: [
      { Word: "quiero", AccuracyScore: 95, ErrorType: "None" },
      { Word: "un", AccuracyScore: 72, ErrorType: "None" },
      { Word: "café", AccuracyScore: 41, ErrorType: "Mispronunciation", Phonemes: [{ Phoneme: "k", AccuracyScore: 90 }, { Phoneme: "e", AccuracyScore: 30 }] },
      { Word: "leche", AccuracyScore: 0, ErrorType: "Omission" },
    ] }],
};
const NESTED = {
  RecognitionStatus: 0, DisplayText: "Quiero un café.",
  NBest: [{ Display: "Quiero un café.", PronunciationAssessment: { AccuracyScore: 82.4, FluencyScore: 91, CompletenessScore: 100, PronScore: 86.2 },
    Words: [
      { Word: "quiero", PronunciationAssessment: { AccuracyScore: 95, ErrorType: "None" } },
      { Word: "un", PronunciationAssessment: { AccuracyScore: 72, ErrorType: "None" } },
      { Word: "café", PronunciationAssessment: { AccuracyScore: 41, ErrorType: "Mispronunciation" },
        Phonemes: [{ Phoneme: "k", PronunciationAssessment: { AccuracyScore: 90 } }, { Phoneme: "e", PronunciationAssessment: { AccuracyScore: 30 } }] },
      { Word: "leche", PronunciationAssessment: { AccuracyScore: 0, ErrorType: "Omission" } },
    ] }],
};

test("Azure's answer is read the same in both its shapes", () => {
  const a = parseAssessment(FLAT), b = parseAssessment(NESTED);
  assert.deepEqual(a, b);
  assert.equal(a.heard, true);
  assert.deepEqual([a.overall, a.accuracy, a.fluency, a.completeness], [86, 82, 91, 100]);
  assert.deepEqual(a.words.map((w) => `${w.word}:${w.score}:${w.error}`), ["quiero:95:none", "un:72:none", "café:41:mispronunciation", "leche:0:omission"]);
  assert.deepEqual(a.words[2].phonemes, [{ phoneme: "k", score: 90 }, { phoneme: "e", score: 30 }]);
  assert.deepEqual(a.words.map((w) => band(w.score, w.error)), ["good", "fair", "poor", "poor"]);
  assert.equal(a.text, "Quiero un café.");
});

test("nothing heard, odd values and unknown kinds of note", () => {
  for (const d of [{ RecognitionStatus: "NoMatch" }, { RecognitionStatus: "InitialSilenceTimeout" }, {}, null, { RecognitionStatus: "Success", NBest: [] }]) {
    const r = parseAssessment(d);
    assert.equal(r.heard, false);
    assert.deepEqual(r.words, []);
  }
  const r = parseAssessment({ RecognitionStatus: "Success", NBest: [{ PronScore: "120", AccuracyScore: -4, FluencyScore: "x",
    Words: [{ Word: "hola", AccuracyScore: 88, ErrorType: "UnexpectedBreak" }, { Word: "", AccuracyScore: 50 }] }] });
  assert.deepEqual([r.overall, r.accuracy, r.fluency, r.completeness], [100, 0, null, null]);
  assert.deepEqual(r.words.map((w) => `${w.word}:${w.error}`), ["hola:none"], "a pause note is no mistake; a nameless word is dropped");
  assert.equal(band(null), "fair");
});

test("the request sent, and the errors said in plain words", async () => {
  let seen = null;
  const ok = async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => FLAT }; };
  const wav = wav16k(new Float32Array(160), 16000);
  const r = await assess({ key: " Key 1: abcdef0123456789abcd ", region: "West Europe", locale: "es-MX", text: "Quiero un ⟦café⟧ con leche.", wav, fetchFn: ok });
  assert.equal(r.overall, 86);
  assert.match(seen.url, /^https:\/\/westeurope\.stt\.speech\.microsoft\.com\/.*language=es-MX&format=detailed$/);
  assert.equal(seen.opts.method, "POST");
  assert.equal(seen.opts.headers["Ocp-Apim-Subscription-Key"], "abcdef0123456789abcd");
  assert.equal(seen.opts.headers["Content-Type"], "audio/wav; codecs=audio/pcm; samplerate=16000");
  assert.equal(seen.opts.headers["Pronunciation-Assessment"], assessHeader("Quiero un café con leche."));
  assert.equal(seen.opts.body, wav);

  const failing = (status) => async () => ({ ok: false, status, json: async () => ({}) });
  await assert.rejects(assess({ key: "k".repeat(20), region: "eastus", locale: "es-MX", text: "x", wav, fetchFn: failing(401) }), (e) => e.keyRejected === true);
  await assert.rejects(assess({ key: "k".repeat(20), region: "eastus", locale: "es-MX", text: "x", wav, fetchFn: failing(429) }), /too many requests|free allowance/);
  await assert.rejects(assess({ key: "k".repeat(20), region: "eastus", locale: "es-MX", text: "x", wav, fetchFn: failing(400) }), /couldn't check this recording/);
  await assert.rejects(assess({ key: "k".repeat(20), region: "nowhere", locale: "es-MX", text: "x", wav, fetchFn: async () => { throw new TypeError("Failed to fetch"); } }),
    /Couldn't reach Azure in the region “nowhere”/);
  await assert.rejects(assess({ key: "k".repeat(20), region: "eastus", locale: "es-MX", text: "x", wav,
    fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }) }), /isn't a score/);
});
