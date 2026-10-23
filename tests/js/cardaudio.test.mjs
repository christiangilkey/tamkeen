// A card's own audio from "Add words" (web/js/cardaudio.js): the speech found in a recording, the word
// and sentence joined into one file with their times, WAV files written and cut (the phone's Anki clips,
// mobile/src/js/ogg-clip.js), and Ogg Opus files written from an encoder's packets (web/js/oggjoin.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { GAP, LEAD, RATE, TAIL, encodeWav, joinParts, louder, seconds, trimToSpeech } from "../../web/js/cardaudio.js";
import { oggOpusFile, opusHead, opusPackets } from "../../web/js/oggjoin.js";
import { clipKind, cutWav, oggOpusInfo, wavInfo } from "../../mobile/src/js/ogg-clip.js";
import { cutClips } from "../../mobile/src/js/anki-export.js";
import { clipExt, clipNames } from "../../mobile/src/js/anki-deck.js";

const tone = (secs, rate = RATE, level = 0.5) => Float32Array.from({ length: Math.round(secs * rate) }, (_, i) => level * Math.sin(i / 8));
const quiet = (secs, rate = RATE) => new Float32Array(Math.round(secs * rate));
const glue = (...parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

test("a WAV file is written, read and cut byte for byte", () => {
  const samples = glue(tone(0.5), quiet(0.5), tone(1));
  const wav = encodeWav(samples, RATE);
  assert.equal(clipKind(wav), "wav");
  assert.equal(clipKind(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0])), "ogg");
  const info = wavInfo(wav);
  assert.deepEqual({ rate: info.rate, channels: info.channels, bits: info.bits, offset: info.offset }, { rate: RATE, channels: 1, bits: 16, offset: 44 });
  assert.ok(Math.abs(info.seconds - 2) < 1e-9);
  const view = new DataView(wav.buffer);
  assert.equal(view.getInt16(44 + 2 * 100, true), Math.round(samples[100] * 0x7fff) || Math.round(samples[100] * 0x8000));
  const [first, last, outside] = cutWav(wav, [[0, 0.5], [1, 2], [5, 6]]);
  assert.ok(Math.abs(wavInfo(first).seconds - 0.5) < 1e-4);
  assert.ok(Math.abs(wavInfo(last).seconds - 1) < 1e-4);
  assert.deepEqual(first.subarray(44), wav.subarray(44, 44 + 0.5 * RATE * 2), "the same sound, not made again");
  assert.equal(outside, null);
  assert.deepEqual(cutWav(new Uint8Array(50), [[0, 1]]), [null], "not a WAV file");
});

test("the speech in a recording: the silence round it cut off, a quiet one turned up", () => {
  const rec = glue(quiet(1), tone(0.8, RATE, 0.1), quiet(1.2));
  const speech = trimToSpeech(rec, RATE);
  assert.ok(speech);
  const secs = speech.samples.length / RATE;
  assert.ok(secs > 0.8 && secs < 1.2, `about the speech and a little air (${secs} s)`);
  assert.equal(speech.cut, false);
  assert.equal(trimToSpeech(quiet(2), RATE), null, "nobody speaking");
  const long = trimToSpeech(tone(14), RATE, { max: 10 });
  assert.equal(long.cut, true);
  assert.ok(long.samples.length <= 10 * RATE);
  const up = louder(speech.samples, speech.peak);
  const peak = Math.max(...up.map(Math.abs));
  assert.ok(peak > 0.5 && peak <= 1, `turned up (${peak})`);
  assert.equal(louder(tone(0.2, RATE, 0.95), 0.95).length, Math.round(0.2 * RATE));
});

test("the word and the sentence in one file, with where each one is", () => {
  const word = tone(1.2), sentence = tone(3);
  const { samples, times } = joinParts(word, sentence, RATE);
  assert.equal(samples.length, Math.round(LEAD * RATE) + word.length + Math.round(GAP * RATE) + sentence.length + Math.round(TAIL * RATE));
  assert.deepEqual(times, { start: LEAD, end: LEAD + 1.2, sent_start: Math.round((LEAD + 1.2 + GAP) * 1000) / 1000,
    sent_end: Math.round((LEAD + 1.2 + GAP + 3) * 1000) / 1000 });
  assert.equal(samples[Math.round((times.start + 0.5) * RATE)], word[Math.round(0.5 * RATE)], "the word is where its times say");
  assert.equal(samples[Math.round((times.sent_start + 1) * RATE)], sentence[RATE], "and the sentence too");
  const alone = joinParts(word, null, RATE);
  assert.deepEqual(alone.times, { start: LEAD, end: LEAD + 1.2, sent_start: null, sent_end: null });
  assert.equal(seconds({ samples: word, rate: RATE }), 1.2);
});

test("an Ogg Opus file from an encoder's packets plays for exactly the sound put in", () => {
  // 20 ms packets (a mono CELT frame: TOC config 31, one frame), as WebCodecs' encoder gives them.
  const packets = Array.from({ length: 120 }, (_, i) => new Uint8Array([31 << 3, i & 0xff, 7, 7]));
  const head = opusHead({ skip: 312, rate: RATE });
  const sound = 2.35 * 48000;  // 2.35 s put in: the last packet's padding is not played
  const file = oggOpusFile(head, packets, { samples: sound });
  const info = oggOpusInfo(file);
  assert.equal(info.intact, true, "every page's checksum is right");
  assert.equal(info.ended, true);
  assert.equal(info.skip, 312);
  assert.ok(Math.abs(info.seconds - 2.35) < 1e-9, `${info.seconds}`);
  const back = opusPackets(file);
  assert.equal(back.audio.length, 120);
  assert.deepEqual(back.audio[7], packets[7]);
  assert.equal(new DataView(back.head.buffer, back.head.byteOffset).getUint32(12, true), RATE, "the rate it was made from");
  assert.equal(oggOpusFile(new Uint8Array(19), packets), null, "not an OpusHead");
  assert.equal(oggOpusFile(head, []), null);
});

test("the phone's Anki deck cuts a recording kept as WAV into WAV clips, named so", () => {
  const { samples, times } = joinParts(tone(1), tone(2), RATE);
  const wav = encodeWav(samples, RATE);
  const clips = cutClips(wav, [{ uid: "v1", ...times }]);
  assert.equal(clipKind(clips.v1.word), "wav");
  assert.equal(clipKind(clips.v1.sentence), "wav");
  assert.ok(wavInfo(clips.v1.sentence).seconds > 2);
  assert.equal(clipExt(clips.v1.word), "wav");
  assert.deepEqual(clipNames("v1", { word: clipExt(clips.v1.word), sentence: "ogg" }), { word: "tk-v1-w.wav", sentence: "tk-v1-s.ogg" });
  assert.deepEqual(clipNames("v2"), { word: "tk-v2-w.ogg", sentence: "tk-v2-s.ogg" }, "the usual Ogg Opus clips keep their names");
});
