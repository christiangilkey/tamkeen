// Run with: node --test tests/js/
// Cloud transcription: the settings, the request, reading the provider's answer, cutting an MP3
// into pieces, and the day's total of audio sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Mp3Splitter, STT_PROVIDERS, addAudioUse, audioCents, cleanSttKey, describeAudioUse, hoursPerDollar, languageCode, looksLikeMp3,
         mp3Frame, parseTranscription, perHourText, silentWav, sttConfig, sttFailure, sttKeyProvider, sttModelLabel, toTranscript,
         transcriptionFields } from "../../web/js/stt.js";
import { STT_KEY_GUIDES } from "../../web/js/stt.js";

const answer = (words, segments, language = "arabic") => ({
  language, duration: segments.length ? segments.at(-1)[1] : 0,
  words: words.map(([start, end, word]) => ({ word, start, end })),
  segments: segments.map(([start, end, text], id) => ({ id, start, end, text: ` ${text}`, avg_logprob: -0.2, no_speech_prob: 0.01 })),
});

test("the cloud is used only when it is chosen and there is a key", () => {
  assert.equal(sttConfig({}).on, false);
  assert.equal(sttConfig({ stt_mode: "cloud" }).on, false, "chosen, but no key yet");
  assert.equal(sttConfig({ stt_key_groq: "gsk_x" }).on, false, "a key, but this device still does the work");
  const cfg = sttConfig({ stt_mode: "cloud", stt_key_groq: "gsk_x" });
  assert.deepEqual([cfg.on, cfg.provider, cfg.model, cfg.borrowed], [true, "groq", "whisper-large-v3", false]);
  assert.equal(sttModelLabel(cfg), "cloud:whisper-large-v3:groq");
  assert.equal(sttConfig({ stt_mode: "cloud", stt_key_groq: "gsk_x", stt_model_groq: "whisper-large-v3-turbo" }).model, "whisper-large-v3-turbo");
  // OpenAI borrows the key entered for word definitions.
  const borrowed = sttConfig({ stt_mode: "cloud", stt_provider: "openai", llm_key_openai: "sk-defs" });
  assert.deepEqual([borrowed.on, borrowed.key, borrowed.model, borrowed.borrowed], [true, "sk-defs", "whisper-1", true]);
});

test("a pasted key is tidied and filed under its provider", () => {
  assert.equal(cleanSttKey(' "gsk_abc def"\n'), "gsk_abcdef");
  assert.equal(sttKeyProvider("gsk_123"), "groq");
  assert.equal(sttKeyProvider("sk-proj-123"), "openai");
  assert.equal(sttKeyProvider("sk-ant-123"), "", "a Claude key is not a transcription key");
  assert.equal(sttKeyProvider("AIza123"), "");
});

test("every provider has a recommended model, a price and a walkthrough", () => {
  for (const [name, p] of Object.entries(STT_PROVIDERS)) {
    assert.ok(p.url.startsWith("https://") && p.keyUrl.startsWith("https://"), name);
    assert.ok(p.models.some((m) => m.id === p.defaultModel), `${name} recommends a listed model`);
    for (const m of p.models) assert.ok(m.perHour > 0 && m.name && m.note, `${name} ${m.id}`);
    assert.ok(STT_KEY_GUIDES[name].steps.length >= 4, `${name} has steps`);
    assert.equal(STT_KEY_GUIDES[name].starts, p.starts);
    assert.match(p.phoneLimit, /over 24 MB that aren't MP3/, `${name} says what the phone does with a big non-MP3 episode`);
  }
});

test("the request asks for a time for every word; the language is left out to have it detected", () => {
  assert.deepEqual(transcriptionFields({ model: "whisper-large-v3", language: "ar" }), [
    ["model", "whisper-large-v3"], ["response_format", "verbose_json"], ["timestamp_granularities[]", "word"],
    ["timestamp_granularities[]", "segment"], ["temperature", "0"], ["language", "ar"]]);
  const auto = transcriptionFields({ model: "m" });
  assert.ok(!auto.some(([k]) => k === "language" || k === "prompt"));
  assert.deepEqual(transcriptionFields({ model: "m", language: "zh", prompt: "以下是普通话的句子。" }).at(-1), ["prompt", "以下是普通话的句子。"]);
});

test("words take their sentence, and its punctuation", () => {
  const out = parseTranscription(answer([[0.0, 0.4, "مرحبا"], [0.5, 0.9, "بكم"], [1.2, 1.6, "كيف"], [1.7, 2.1, "الحال"]],
                                        [[0.0, 1.0, "مرحبا بكم."], [1.2, 2.2, "كيف الحال؟"]]));
  assert.equal(out.language, "ar");
  assert.deepEqual(out.segments.map((s) => s.text), ["مرحبا بكم.", "كيف الحال؟"]);
  assert.deepEqual(out.segments.map((s) => s.words.map((w) => w.text)), [["مرحبا", "بكم."], ["كيف", "الحال؟"]]);
  assert.deepEqual([out.segments[1].words[0].start, out.segments[1].words[1].end], [1.2, 2.1]);
});

test("when the two lists disagree the timed words are kept as they came", () => {
  const out = parseTranscription(answer([[0.0, 0.3, "今日"], [0.3, 0.5, "は"], [0.5, 1.0, "暑い"]], [[0.0, 1.0, "今日は暑い。"]], "japanese"));
  assert.equal(out.language, "ja");
  assert.deepEqual(out.segments[0].words.map((w) => w.text), ["今日", "は", "暑い"]);
});

test("stretches the provider doubts, and known made-up lines, are dropped with their words", () => {
  const data = answer([[0.0, 0.5, "أهلا"], [5.0, 6.0, "ترجمة"], [6.0, 7.0, "نانسي"], [7.0, 8.0, "قنقر"], [9.0, 9.5, "شكرا"]],
                      [[0.0, 0.6, "أهلا"], [5.0, 8.0, "ترجمة نانسي قنقر"], [9.0, 9.6, "شكرا"]]);
  Object.assign(data.segments[2], { no_speech_prob: 0.9, avg_logprob: -1.4 });
  assert.deepEqual(parseTranscription(data).segments.map((s) => s.text), ["أهلا"]);
});

test("a piece's times are moved to where it sits in the episode", () => {
  const seg = parseTranscription(answer([[1.0, 1.5, "hola"]], [[1.0, 1.6, "hola"]], "Spanish"), (t) => t + 480).segments[0];
  assert.deepEqual([seg.start, seg.words[0].start, seg.words[0].end], [481, 481, 481.5]);
});

test("an answer with nothing in it is an empty transcript, not an error", () => {
  assert.deepEqual(parseTranscription({ text: "", language: "english", duration: 1 }).segments, []);
  assert.deepEqual(parseTranscription(null).segments, []);
  assert.equal(languageCode("Klingon thing"), "");
  assert.equal(languageCode("ru"), "ru");
});

test("segments become the stored transcript; a sentence without word times is spread evenly", () => {
  const t = toTranscript([{ start: 0, end: 1, text: "uno dos", words: [{ start: 0, end: 0.4, text: "uno" }, { start: 0.5, end: 1, text: "dos" }] },
                          { start: 2, end: 4, text: "tres cuatro", words: [] }]);
  assert.deepEqual(t.segments, [[0, 1, "uno dos"], [2, 4, "tres cuatro"]]);
  assert.deepEqual(t.words, { start: [0, 0.5, 2, 3], end: [0.4, 1, 3, 4], text: ["uno", "dos", "tres", "cuatro"], seg: [0, 0, 1, 1] });
});

// ----- cutting an MP3 into pieces -----

/** A made-up MP3: `n` frames of MPEG-1 Layer III, 128 kbit/s, 44.1 kHz (417 bytes, 1152 samples each). */
function fakeMp3(n) {
  const out = new Uint8Array(n * 417);
  for (let i = 0; i < n; i++) { out.set([0xff, 0xfb, 0x90, 0x00], i * 417); out[i * 417 + 4] = i % 251; }
  return out;
}
const join = (pieces) => { const all = new Uint8Array(pieces.reduce((n, p) => n + p.bytes.length, 0)); let at = 0; for (const p of pieces) { all.set(p.bytes, at); at += p.bytes.length; } return all; };

test("a frame's header says how long it is, in bytes and in time", () => {
  assert.deepEqual(mp3Frame(fakeMp3(1), 0), { bytes: 417, seconds: 1152 / 44100 });
  assert.equal(mp3Frame(new Uint8Array([0xff, 0xfb, 0xf0, 0x00]), 0), null, "an impossible bitrate");
  assert.equal(mp3Frame(new Uint8Array([0x49, 0x44, 0x33, 0x04]), 0), null, "a tag, not a frame");
});

test("an MP3 fed in arbitrary bits comes out in pieces cut between frames, with exact start times", () => {
  const frames = 1000; // about 26 seconds
  const mp3 = fakeMp3(frames);
  const splitter = new Mp3Splitter({ maxSeconds: 10 });
  const pieces = [];
  for (let at = 0; at < mp3.length; at += 7001) pieces.push(...splitter.push(mp3.subarray(at, at + 7001))); // 7001: never on a frame edge
  pieces.push(splitter.finish());
  assert.equal(pieces.length, 3);
  for (const p of pieces) {
    assert.equal(p.bytes.length % 417, 0, "whole frames only");
    assert.deepEqual([...p.bytes.subarray(0, 2)], [0xff, 0xfb], "starts on a frame");
  }
  assert.deepEqual(join(pieces), mp3, "nothing lost, nothing repeated");
  assert.ok(Math.abs(pieces[1].start - pieces[0].seconds) < 1e-9 && Math.abs(pieces[2].start - pieces[0].seconds - pieces[1].seconds) < 1e-9);
  assert.ok(pieces[0].seconds >= 10 && pieces[0].seconds < 10.03);
  assert.ok(Math.abs(splitter.total - frames * 1152 / 44100) < 1e-6);
});

test("a piece is also closed when it gets too big", () => {
  const splitter = new Mp3Splitter({ maxSeconds: 9999, maxBytes: 417 * 10 });
  const pieces = [...splitter.push(fakeMp3(35)), splitter.finish()];
  assert.deepEqual(pieces.map((p) => p.bytes.length / 417), [10, 10, 10, 5]);
});

test("a real MP3 (as the computer's encoder writes it, tag block first) is cut the same way", () => {
  const mp3 = new Uint8Array(readFileSync(new URL("../fixtures/tone16k.mp3", import.meta.url)));
  assert.ok(looksLikeMp3(mp3.subarray(0, 4096)));
  assert.ok(!looksLikeMp3(new Uint8Array(4096)), "silence in a WAV is not an MP3");
  const splitter = new Mp3Splitter({ maxSeconds: 2 });
  const pieces = [];
  for (let at = 0; at < mp3.length; at += 5000) pieces.push(...splitter.push(mp3.subarray(at, at + 5000)));
  pieces.push(splitter.finish());
  assert.equal(pieces.length, 3, "five seconds in pieces of two");
  assert.ok(Math.abs(splitter.total - 5) < 0.15, `about five seconds, got ${splitter.total}`);
  for (const p of pieces) assert.ok(mp3Frame(p.bytes, 0), "every piece starts on a frame");
  assert.ok(join(pieces).length <= mp3.length && join(pieces).length > mp3.length - 200, "all of the sound, without the tag");
});

test("junk between frames is stepped over", () => {
  const a = fakeMp3(3);
  const mp3 = new Uint8Array(a.length * 2 + 50);
  mp3.set(a, 0);
  mp3.set(new Uint8Array(50).fill(0x55), a.length);
  mp3.set(a, a.length + 50);
  const splitter = new Mp3Splitter();
  const pieces = [...splitter.push(mp3), splitter.finish()];
  assert.equal(join(pieces).length, 6 * 417);
});

test("one second of silence is a valid WAV file", () => {
  const wav = silentWav(1);
  assert.equal(wav.length, 44 + 32000);
  assert.equal(String.fromCharCode(...wav.subarray(0, 4), ...wav.subarray(8, 12)), "RIFFWAVE");
});

// ----- what it costs, and what went wrong -----

test("prices read per hour of audio", () => {
  const [full, turbo] = STT_PROVIDERS.groq.models;
  assert.equal(perHourText(full), "11¢ per hour of audio");
  assert.equal(perHourText(turbo), "4¢ per hour of audio");
  assert.equal(hoursPerDollar(turbo), 25);
  assert.ok(Math.abs(audioCents("groq", "whisper-large-v3", 1800) - 5.55) < 1e-9);
  assert.equal(audioCents("groq", "typed-in-by-hand", 60), null);
});

test("the day's total adds up, and starts again the next day", () => {
  let t = addAudioUse(null, { provider: "groq", model: "whisper-large-v3", seconds: 1800 }, "2026-10-12");
  t = addAudioUse(t, { provider: "groq", model: "whisper-large-v3-turbo", seconds: 1800 }, "2026-10-12");
  assert.deepEqual([t.seconds, t.requests], [3600, 2]);
  assert.deepEqual(describeAudioUse(t), { length: "1 h 0 min", detail: "2 pieces sent, about 7.5¢" });
  const next = addAudioUse(t, { provider: "groq", model: "whisper-large-v3", seconds: 30 }, "2026-10-13");
  assert.deepEqual([next.seconds, next.requests], [30, 1]);
  assert.deepEqual(describeAudioUse(null), { length: "0 min", detail: "Nothing sent yet today." });
  const odd = addAudioUse(null, { provider: "groq", model: "mystery", seconds: 60 }, "d");
  assert.equal(describeAudioUse(odd).detail, "1 piece sent", "no price is guessed for a model typed in by hand");
});

test("refusals are said plainly", () => {
  const key = sttFailure("groq", 401, '{"error":{"message":"Invalid API Key"}}');
  assert.ok(key.keyRejected && /Groq rejected the API key/.test(key.message));
  const limit = sttFailure("groq", 429, { error: { message: "Rate limit reached" } }, 120);
  assert.equal(limit.retryAfter, 120);
  assert.match(limit.message, /reached its limit for now \(it asks to wait 2 minutes\)/);
  assert.ok(sttFailure("openai", 413, "").tooLarge);
  assert.match(sttFailure("openai", 404, '{"error":{"message":"The model `x` does not exist"}}').message, /doesn't recognise the chosen model/);
  assert.match(sttFailure("groq", 400, "{}").message, /couldn't transcribe this \(error 400\)/);
});
