// The learner's own audio for a card ("Add words" → Audio → "I'll add my own", components/wordbuilder.js):
// a recording made with the microphone, or a sound file chosen on the device, for the word and, if
// wanted, its sentence. Every version has it.
//
// Whatever comes in (the browser's own recording format, an MP3, an M4A…) is decoded here, the silence
// before and after the speech is cut off, a quiet one is turned up, and the word and the sentence are
// put into ONE file with a short gap between them, exactly like a card voice made by Azure
// (cardvoice.js): the card's `voice` says where each part is ({start, end, sent_start, sent_end}). So it
// is kept, synced, played, sent to a friend and put in the Anki deck by the same road as a card voice.
//
// The file is Ogg Opus where the device can make it (WebCodecs: Chrome, Edge, Android), else a plain
// WAV file (16-bit, mono), which every device plays. The computer turns a WAV into Ogg Opus when it
// keeps it (app/api/vocab.py save_recording); a phone keeps it as it is. Nothing leaves the device until
// the card is added.
//
// The pure part (WAV files, joining, trimming) is tested in tests/js/cardaudio.test.mjs.

import { boost, listener, micProblem, speechBounds } from "./review/pronounce.js";
import { oggOpusFile, opusHead } from "./oggjoin.js";

/** The longest part kept, in seconds (a longer recording or file is cut there). */
export const MAX_SECONDS = { word: 10, sentence: 25 };
/** The rate the parts are kept at: plenty for a voice. */
export const RATE = 24000;
/** Silence round the parts in the joined file (seconds): before the word, between word and
 * sentence (playing the word stops in it), after the end. */
export const LEAD = 0.05, GAP = 0.7, TAIL = 0.3;

// ---------------------------------------------------------------- WAV files

/** A mono WAV file (16-bit) of `samples` (floats from -1 to 1) at `rate`. */
export function encodeWav(samples, rate = RATE) {
  const n = samples.length;
  const out = new Uint8Array(44 + n * 2);
  const view = new DataView(out.buffer);
  header(view, out, n * 2, rate, 1, 16);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return out;
}

/** The 44 bytes in front of the sound: RIFF, a 16-byte fmt part, data. */
function header(view, out, size, rate, channels, bits) {
  const frame = channels * (bits / 8);
  out.set([0x52, 0x49, 0x46, 0x46], 0); view.setUint32(4, 36 + size, true); out.set([0x57, 0x41, 0x56, 0x45], 8);  // RIFF … WAVE
  out.set([0x66, 0x6d, 0x74, 0x20], 12); view.setUint32(16, 16, true); view.setUint16(20, 1, true);              // fmt, PCM
  view.setUint16(22, channels, true); view.setUint32(24, rate, true); view.setUint32(28, rate * frame, true);
  view.setUint16(32, frame, true); view.setUint16(34, bits, true);
  out.set([0x64, 0x61, 0x74, 0x61], 36); view.setUint32(40, size, true);                                           // data
}

// ---------------------------------------------------------------- the parts of a card's audio

/** The speech in a recording, with a little air round it: the samples from just before it starts to
 * just after it ends, or null when nothing in it is loud enough to be someone speaking. At most
 * `max` seconds are kept. */
export function trimToSpeech(samples, rate, { max = 30 } = {}) {
  const where = speechBounds(samples, rate);
  if (!where) return null;
  const from = Math.floor(where.start * rate), to = Math.min(samples.length, Math.ceil(where.end * rate), from + Math.round(max * rate));
  return { samples: samples.slice(from, to), peak: where.peak, cut: Math.ceil(where.end * rate) - from > Math.round(max * rate) };
}

/** `samples` turned up (never down) so the loudest moment is about as loud as a card voice's. */
export function louder(samples, peak) {
  const gain = boost(peak);
  if (gain === 1) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = Math.max(-1, Math.min(1, samples[i] * gain));
  return out;
}

/**
 * The word and (if there is one) the sentence as one stretch of sound, with silence round and between
 * them: {samples, times}, `times` as a card's voice keeps them ({start, end, sent_start, sent_end},
 * seconds, rounded to milliseconds; the sentence's are null without one). Both parts at `rate`.
 */
export function joinParts(word, sentence = null, rate = RATE, { lead = LEAD, gap = GAP, tail = TAIL } = {}) {
  const pad = (s) => Math.round(s * rate);
  const parts = [pad(lead), word.length, ...(sentence ? [pad(gap), sentence.length] : []), pad(tail)];
  const out = new Float32Array(parts.reduce((a, b) => a + b, 0));
  out.set(word, pad(lead));
  const r = (x) => Math.round(x * 1000) / 1000;
  const times = { start: r(lead), end: r(lead + word.length / rate), sent_start: null, sent_end: null };
  if (sentence) {
    const at = pad(lead) + word.length + pad(gap);
    out.set(sentence, at);
    times.sent_start = r(at / rate);
    times.sent_end = r((at + sentence.length) / rate);
  }
  return { samples: out, times };
}

/** Seconds of sound in a part. */
export const seconds = (part) => (part && part.samples ? part.samples.length / (part.rate || RATE) : 0);

// ---------------------------------------------------------------- on the device (a browser is needed from here on)

/** Can this device record from its microphone? (Without it only "Choose a file" is offered.) */
export function canRecord() {
  return typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    && typeof window !== "undefined" && !!window.MediaRecorder && !!(window.AudioContext || window.webkitAudioContext);
}

/** Plain words for what went wrong (never the browser's own). */
export const AUDIO_ERRORS = {
  unreadable: "That file couldn't be read as sound. Try an MP3, M4A, WAV or OGG file.",
  silent: "I couldn't hear anyone speaking in it. Try again, a little closer to the microphone.",
  mic: "Tamkeen needs permission to use the microphone. Allow it, then try again.",
  busy: "The microphone couldn't be used just now. Close other apps that may be using it, then try again.",
  none: "No microphone was found. Connect one, then try again.",
};
// (A refused microphone is put right in the system's settings: it says so, for the fix popup, components/fixit.js.)
const problem = (kind) => Object.assign(new Error(AUDIO_ERRORS[kind]), { kind }, kind === "mic" ? { fixCause: "mic" } : {});

/** Decode a recording or a sound file to one channel at RATE: Float32Array. */
export async function decodeToMono(blob) {
  const buf = await blob.arrayBuffer();
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let sound;
  try {
    // An offline context at RATE decodes straight to that rate (the browser resamples it properly).
    const ctx = new Offline(1, 1, RATE);
    sound = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(buf.slice(0), resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  } catch { throw problem("unreadable"); }
  if (!sound || !sound.length) throw problem("unreadable");
  const out = new Float32Array(sound.length);
  for (let c = 0; c < sound.numberOfChannels; c++) {
    const ch = sound.getChannelData(c);
    for (let i = 0; i < ch.length; i++) out[i] += ch[i] / sound.numberOfChannels;
  }
  if (sound.sampleRate === RATE) return out;
  // (A browser that decoded at another rate: simple resampling.)
  const ratio = sound.sampleRate / RATE, n = Math.floor(out.length / ratio), res = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio, a = Math.floor(x), f = x - a;
    res[i] = out[a] * (1 - f) + (out[Math.min(out.length - 1, a + 1)] || 0) * f;
  }
  return res;
}

/** A part ready for a card from a recording or a file: {samples, rate, cut} (cut: it was longer than
 * the most that is kept). `which` is "word" or "sentence". Throws with plain words. */
export async function partFrom(blob, which = "word") {
  const samples = await decodeToMono(blob);
  const speech = trimToSpeech(samples, RATE, { max: MAX_SECONDS[which] || 10 });
  if (!speech) throw problem("silent");
  return { samples: louder(speech.samples, speech.peak), rate: RATE, cut: speech.cut };
}

/** A part as a WAV file to listen to before the card is added. */
export const previewBlob = (part) => new Blob([encodeWav(part.samples, part.rate || RATE)], { type: "audio/wav" });

/** Ogg Opus bytes of `samples` (mono, at `rate`) made with the browser's own encoder (WebCodecs), or
 * null where the device has none. */
export async function encodeOpus(samples, rate = RATE) {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return null;
  const config = { codec: "opus", sampleRate: rate, numberOfChannels: 1, bitrate: 32000 };
  try {
    const support = await AudioEncoder.isConfigSupported(config);
    if (!support || !support.supported) return null;
  } catch { return null; }
  const packets = [];
  let described = null, failed = null;
  try {
    const encoder = new AudioEncoder({
      output: (chunk, meta) => {
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        packets.push(bytes);
        const d = meta && meta.decoderConfig && meta.decoderConfig.description;
        if (d && !described) described = d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
      },
      error: (e) => { failed = e; },
    });
    encoder.configure(config);
    for (let at = 0; at < samples.length; at += rate) {
      const part = new Float32Array(samples.subarray(at, Math.min(samples.length, at + rate)));
      const data = new AudioData({ format: "f32", sampleRate: rate, numberOfFrames: part.length, numberOfChannels: 1,
        timestamp: Math.round((at / rate) * 1e6), data: part });
      encoder.encode(data);
      data.close();
    }
    await encoder.flush();
    encoder.close();
  } catch { return null; }
  if (failed || !packets.length) return null;
  // The encoder's own OpusHead when it gives one (it knows its start-up delay), else the usual one.
  const own = described && described.length >= 19 && String.fromCharCode(...described.subarray(0, 8)) === "OpusHead";
  const head = own ? described.slice(0, 19) : opusHead({ skip: 312, rate });
  if (!own) head[9] = 1;
  return oggOpusFile(head, packets, { samples: Math.round((samples.length * 48000) / rate) });
}

/**
 * The card's audio file from its parts ({word, sentence}: parts from partFrom; the sentence may be
 * missing): {blob, times}. Ogg Opus where the device can make it, else WAV.
 */
export async function cardAudio({ word, sentence = null }) {
  const { samples, times } = joinParts(word.samples, sentence ? sentence.samples : null, RATE);
  const ogg = await encodeOpus(samples, RATE).catch(() => null);
  const blob = ogg ? new Blob([ogg], { type: "audio/ogg" }) : new Blob([encodeWav(samples, RATE)], { type: "audio/wav" });
  return { blob, times };
}

/**
 * Start recording from the microphone. Resolves to {stop(), done}: `done` resolves to the recording
 * (a Blob) once it has stopped: at stop(), a moment after the speaking ends, or at the longest kept.
 * `onLevel(0..1)` hears how loud it is now. Rejects with plain words when the microphone can't be used.
 */
export async function startRecording({ which = "word", onLevel = () => {} } = {}) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    throw problem(e && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "mic" : micProblem(e) === AUDIO_ERRORS.none ? "none" : "busy");
  }
  const release = () => stream.getTracks().forEach((t) => t.stop());
  let recorder, ctx;
  try {
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  } catch {
    release();
    throw problem("busy");
  }
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const mic = ctx.createMediaStreamSource(stream), ear = ctx.createAnalyser();
  ear.fftSize = 1024;
  mic.connect(ear);
  const heard = new Float32Array(ear.fftSize);
  const maxMs = (MAX_SECONDS[which] || 10) * 1000;
  const enough = listener({ quietMs: which === "word" ? 1100 : 1500, nothingMs: 7000, maxMs });
  const began = Date.now();
  const stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
  const done = new Promise((resolve) => {
    recorder.onstop = () => {
      clearInterval(watch);
      try { mic.disconnect(); } catch { /* gone */ }
      release();
      ctx.close().catch(() => {});
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };
  });
  const watch = setInterval(() => {
    ear.getFloatTimeDomainData(heard);
    let sum = 0;
    for (const s of heard) sum += s * s;
    const level = Math.sqrt(sum / heard.length);
    onLevel(Math.min(1, level * 9), Date.now() - began);
    if (enough(level, Date.now() - began)) stop();
  }, 50);
  recorder.start();
  return { stop, done };
}
