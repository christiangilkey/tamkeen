// Cloud transcription: letting a speech-to-text provider write the transcripts instead of this
// computer. Shared by the desktop app and the Android app; no platform code in here.

import { problemKind } from "./trouble.js";
//
// The user brings their own key (like the AI word definitions) and pays the provider directly, by
// the hour of audio. Both providers below run Whisper and speak the same request format: an audio
// file goes up, and the words come back with a time for each one, which is what the player needs.
// The computer does its sending from Python (app/transcriber/cloud.py, which mirrors the request
// and the reading of the answer below); the phone does it from here.

// `perHour` is the provider's price in US cents per hour of audio, from their own price lists in
// October 2026. `models` is what Settings offers, with the recommended one first. Only models
// that return a time for every word are listed (OpenAI's newer transcription models don't).
export const STT_PROVIDERS = {
  groq: {
    label: "Groq",
    short: "Groq",
    keyUrl: "https://console.groq.com/keys",
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    starts: "gsk_",
    // Shown in Settings on the phone when this provider is chosen: what happens to an episode the phone can't cut up.
    phoneLimit: "Episodes over 24 MB that aren't MP3 files: the phone can't cut those into pieces, so Groq is handed the "
      + "file's web address and fetches it itself. (MP3s of any length are fine: nearly every podcast is one.)",
    defaultModel: "whisper-large-v3",
    models: [
      { id: "whisper-large-v3", name: "Whisper Large v3", perHour: 11.1, note: "the full large model: best for Arabic and dialects" },
      { id: "whisper-large-v3-turbo", name: "Whisper Large v3 Turbo", perHour: 4, note: "lowest cost; a little less accurate" },
    ],
  },
  openai: {
    label: "OpenAI",
    short: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    url: "https://api.openai.com/v1/audio/transcriptions",
    starts: "sk-",
    phoneLimit: "Episodes over 24 MB that aren't MP3 files can't be transcribed from this phone with OpenAI: it shows an error "
      + "instead. OpenAI takes at most 25 MB at a time, and the phone can only cut MP3s into pieces. Transcribe those on your "
      + "computer, or choose Groq, which fetches such a file itself. (MP3s of any length are fine: nearly every podcast is one.)",
    defaultModel: "whisper-1",
    models: [
      { id: "whisper-1", name: "Whisper", perHour: 36, note: "works with the same key as ChatGPT word definitions" },
    ],
  },
};

// "I'm stuck" in Settings: the steps for getting a key from each provider (the popup itself is
// components/keyhelp.js). Written from general knowledge of those sites.
export const STT_KEY_GUIDES = {
  groq: {
    site: "the Groq Console",
    starts: "gsk_",
    cost: "Groq has a free allowance (a few hours of audio a day) that needs no payment card. With a card added, an hour of audio costs between 4 and 11 cents.",
    steps: [
      ["Open the Groq Console", "Press the button below. It opens console.groq.com in your web browser. (Groq is a different company from Grok.)"],
      ["Sign in, or make an account", "Use your email address, or “Continue with Google”. It is free to join."],
      ["Create the key", "Open <b>API Keys</b> and press <b>Create API Key</b>. Give it a name you'll recognise, such as “Tamkeen”."],
      ["Copy it straight away", "The key is a long line of letters that starts with <code>gsk_</code>. It is shown only once, so press <b>Copy</b> before closing the box."],
      ["Paste it into Tamkeen", "Come back here, paste it into the <b>API key</b> box under Cloud transcription, and press <b>Test the key</b>."],
    ],
  },
  openai: {
    site: "the OpenAI platform",
    starts: "sk-",
    cost: "An hour of audio costs about 36 cents. If you already use an OpenAI key for word definitions, the same key works here: leave this box empty.",
    steps: [
      ["Open the OpenAI platform", "Press the button below. It opens platform.openai.com in your web browser. This is a different site from ChatGPT."],
      ["Sign in, or make an account", "Your ChatGPT login works here too, but a ChatGPT Plus subscription does not cover this: keys are paid for separately."],
      ["Add some credit", "Open <b>Settings</b> (the cog) <b>→ Billing</b>, add a payment card and buy a small amount of credit. Keys don't work until the account has credit."],
      ["Create the key", "Open <b>API keys</b> and press <b>Create new secret key</b>. Give it a name you'll recognise, such as “Tamkeen”."],
      ["Copy it straight away", "The key is a long line of letters that starts with <code>sk-</code>. It is shown only once, so press <b>Copy</b> before closing the box."],
      ["Paste it into Tamkeen", "Come back here, paste it into the <b>API key</b> box under Cloud transcription, and press <b>Test the key</b>."],
    ],
  },
};

/** The most a provider accepts in one upload (both: 25 MB). Kept under it, to leave room for the form around the file. */
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

/** A key as it should be stored: nothing but the key (see definer.cleanKey). */
export const cleanSttKey = (text) => String(text ?? "").replace(/[\s​-‍⁠﻿"'`“”‘’]/g, "");

/** Which transcription provider a key comes from, judged by how it starts; "" when that can't be told. */
export function sttKeyProvider(key) {
  const k = cleanSttKey(key);
  if (k.startsWith("gsk_")) return "groq";
  if (k.startsWith("sk-") && !k.startsWith("sk-ant-")) return "openai";
  return "";
}

/** What the settings say: {on, mode, provider, key, model, borrowed}. `on` is true when
 * transcripts are to be written by the cloud provider (chosen, and a key to use it with).
 * `borrowed`: the OpenAI key comes from the word-definitions card, none was entered here. */
// Languages written only by a speech model of their own (app/models_manager.py LANGUAGE_MODELS), each
// with the language cloud providers write instead: they don't know it, so they fail or write that. Cloud
// transcription is off while one is studied (the choice stays saved for other languages).
export const OWN_MODEL_LANGUAGES = { ceb: "Tagalog" };
/** Whether cloud transcription is off for language `code` (see OWN_MODEL_LANGUAGES). */
export const cloudBlocked = (code) => Object.hasOwn(OWN_MODEL_LANGUAGES, code || "");

export function sttConfig(settings) {
  const s = settings || {};
  const provider = STT_PROVIDERS[s.stt_provider] ? s.stt_provider : "groq";
  const own = s[`stt_key_${provider}`] || "";
  const key = own || (provider === "openai" ? s.llm_key_openai || "" : "");
  const model = s[`stt_model_${provider}`] || STT_PROVIDERS[provider].defaultModel;
  const blocked = cloudBlocked(s.study_language);
  const mode = s.stt_mode === "cloud" && !blocked ? "cloud" : "local";
  return { on: mode === "cloud" && !!key, mode, provider, key, model, borrowed: !own && !!key, blocked };
}

/** The label a transcript carries for how it was made, e.g. "cloud:whisper-large-v3:groq". */
export const sttModelLabel = (cfg) => `cloud:${cfg.model}:${cfg.provider}`;

// ------------------------------------------------------------------------------------ the request

/** The form fields that go with the audio file, as [name, value] pairs (one name repeats).
 * Without `language` the provider works out the language itself and says which it heard. */
export function transcriptionFields({ model, language = "", prompt = "" }) {
  const fields = [["model", model], ["response_format", "verbose_json"],
                  ["timestamp_granularities[]", "word"], ["timestamp_granularities[]", "segment"], ["temperature", "0"]];
  if (language) fields.push(["language", whisperCode(language)]);
  if (prompt) fields.push(["prompt", prompt]);
  return fields;
}

export class SttError extends Error {
  constructor(message, { status = 0, keyRejected = false, retryAfter = 0, tooLarge = false, kind = "", provider = "" } = {}) {
    super(message);
    this.status = status;
    this.kind = kind || (keyRejected ? "key" : ""); // what went wrong, for the Troubleshoot box (see trouble.js)
    this.provider = provider;
    this.keyRejected = keyRejected; // the provider refused the key itself
    this.retryAfter = retryAfter;   // seconds the provider asked the app to wait (its limit was reached)
    this.tooLarge = tooLarge;
  }
}

/** A refused request, said plainly. `body` is the provider's answer (text or already parsed). */
export function sttFailure(provider, status, body, retryAfter = 0) {
  const name = (STT_PROVIDERS[provider] || {}).label || "The provider";
  let detail = "";
  try {
    const data = typeof body === "string" ? JSON.parse(body) : body;
    detail = String((data && data.error && (data.error.message || data.error)) || "").slice(0, 200);
  } catch { detail = String(body || "").slice(0, 200); }
  const wait = Math.max(0, Math.round(Number(retryAfter) || 0));
  const kind = problemKind(status, detail);
  const failed = (message, extra = {}) => new SttError(message, { status, kind, provider, ...extra });
  if (kind === "region") return failed(`${name} isn't available in your country or region.`);
  if (status === 401 || status === 403) {
    return failed(`${name} rejected the API key. It has most likely expired, so you probably need a new one.`, { keyRejected: true, kind: "key" });
  }
  if (status === 429) {
    return new SttError(`${name} says your account has reached its limit for now${wait ? ` (it asks to wait ${waitText(wait)})` : ""}. `
      + "Free accounts may only send so much audio per hour and per day.", { status, retryAfter: wait, kind, provider });
  }
  if (status === 413) return new SttError(`That audio is too large for ${name} to take in one piece.`, { status, tooLarge: true, provider });
  if (status === 404 || /model/i.test(detail) && status === 400) {
    return failed(`${name} doesn't recognise the chosen model. Set it back to the recommended one in Settings.${detail ? ` (${detail})` : ""}`, { kind: "model" });
  }
  if (status === 402 || /billing|quota|credit/i.test(detail)) {
    return failed(`${name} says the account has no credit. Add some on its Billing page.${detail ? ` (${detail})` : ""}`, { kind: "credit" });
  }
  return failed(`${name} couldn't transcribe this (error ${status})${detail ? `: ${detail}` : "."}`);
}

/** Base64 text with its line breaks taken out. Android's downloader hands a file over with a line
 * break every 76 characters, and its uploader refuses base64 that has any (so a reel's video,
 * passed straight from one to the other, never left the phone). */
export const tidyBase64 = (text) => String(text ?? "").replace(/\s+/g, "");

/** A request that got no answer at all, said plainly. `error` is what the phone or browser threw.
 * `retry` is true only when it looks like the connection (worth trying again); otherwise the
 * request itself was at fault and trying again would fail the same way. */
export function sendFailure(provider, error) {
  const name = (STT_PROVIDERS[provider] || {}).label || "The provider";
  const detail = String((error && error.message) || error || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const connection = /resolve host|unknownhost|no address|timed? ?out|timeout|failed to connect|connect(ion)? (was )?(reset|refused|closed|aborted|lost)|unexpected end of stream|network|socket|handshake|ssl|certificate|failed to fetch|load failed|offline|unreachable|econn|enotfound/i.test(detail);
  if (connection) {
    const e = new SttError(`Couldn't reach ${name}. Check your internet connection.${detail ? ` (${detail})` : ""}`, { kind: "network", provider });
    e.retry = true;
    return e;
  }
  if (/out ?of ?memory/i.test(detail)) return new SttError(`This phone ran out of memory getting the audio ready for ${name}. Try a shorter one.`);
  return new SttError(`The audio couldn't be sent to ${name}: ${detail || "the phone gave no reason"}.`);
}

export function waitText(seconds) {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}

// ------------------------------------------------------------------------------------- the answer

// Whisper names the language it heard in English ("arabic"); the app uses the short codes.
const LANGUAGE_CODES = { arabic: "ar", spanish: "es", french: "fr", japanese: "ja", chinese: "zh", mandarin: "zh", russian: "ru",
                         english: "en", turkish: "tr", persian: "fa", urdu: "ur", hindi: "hi", german: "de", italian: "it",
                         portuguese: "pt", korean: "ko", hebrew: "he", indonesian: "id", dutch: "nl",
                         tagalog: "tl", filipino: "tl", catalan: "ca", valencian: "ca", thai: "th", cebuano: "ceb",
                         bisaya: "ceb" };

// Whisper doesn't know Bisaya (Cebuano): it is asked for its closest relative, Tagalog, and the
// opening prompt (PROMPTS in mobile/src/js/transcribe-service.js, INITIAL_PROMPTS in app/languages.py)
// keeps it writing Bisaya. Every other language is asked for by its own code.
const WHISPER_CODES = { ceb: "tl" };
/** The code Whisper is asked to listen for when the app's language is `code`. */
export const whisperCode = (code) => WHISPER_CODES[code] || code;
/** The app's language for what a provider says it heard, while `study` is being learned: Bisaya
 * comes back as Tagalog (Whisper's nearest language), which then means Bisaya. */
export const heardAs = (heard, study) => (heard && heard === whisperCode(study) ? study : heard);

/** "Arabic" / "arabic" / "ar" -> "ar"; "" when the answer doesn't say. */
export function languageCode(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "";
  return LANGUAGE_CODES[n] || (/^[a-z]{2,3}$/.test(n) ? n : "");
}

// Lines Whisper is known to make up over silence or music (subtitle credits it saw in training).
const INVENTED = ["ترجمة نانسي قنقر", "Sous-titres réalisés par la communauté d'Amara.org", "Subtítulos realizados por la comunidad de Amara.org",
                  "Субтитры сделал DimaTorzok", "Субтитры создавал DimaTorzok", "字幕由Amara.org社区提供", "Subtitles by the Amara.org community",
                  // ...and the sign-offs of videos, which it writes over a silent ending:
                  "اشتركوا في القناة", "شكرا للمشاهدة", "شكرا على المشاهدة", "Thanks for watching!", "Thank you for watching.", "Merci d'avoir regardé cette vidéo !", "¡Gracias por ver el vídeo!", "Спасибо за просмотр!", "谢谢观看", "請不吝點贊訂閱轉發打賞支持明鏡與點點欄目"];
const bare = (text) => String(text || "").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
const INVENTED_BARE = new Set(INVENTED.map(bare));

/** True for a stretch the provider itself marks as probably not speech, or a known made-up line. */
function notSpeech(seg) {
  if (Number(seg.no_speech_prob) > 0.6 && Number(seg.avg_logprob) < -1) return true;
  return INVENTED_BARE.has(bare(seg.text));
}

/**
 * Read a provider's answer: {language, duration, segments: [{start, end, text, words: [{start, end, text}]}]}.
 * Times are seconds from the start of the audio that was sent, moved by `toTime` when the audio
 * was a piece of something longer.
 *
 * The answer lists the sentences ("segments", with punctuation) and, separately, every word with
 * its times but without punctuation. Each word is put in its sentence by its time, and takes the
 * sentence's spelling of it (so commas and full stops stay) whenever the two lists agree.
 */
export function parseTranscription(data, toTime = (t) => t) {
  const d = data && typeof data === "object" ? data : {};
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const words = (Array.isArray(d.words) ? d.words : [])
    .map((w) => ({ start: num(w.start), end: Math.max(num(w.start), num(w.end)), text: String(w.word ?? w.text ?? "").trim() }))
    .filter((w) => w.text);
  let segs = (Array.isArray(d.segments) ? d.segments : []).filter((s) => String(s.text || "").trim());
  if (!segs.length && String(d.text || "").trim()) {
    segs = [{ start: words.length ? words[0].start : 0, end: words.length ? words.at(-1).end : num(d.duration), text: d.text }];
  }
  const out = [];
  let w = 0;
  segs.forEach((seg, i) => {
    const start = num(seg.start);
    const end = Math.max(start, num(seg.end));
    const mine = [];
    const last = i === segs.length - 1;
    // A word belongs to the sentence its middle falls in (the last sentence takes what is left).
    while (w < words.length && (last || (words[w].start + words[w].end) / 2 < end)) mine.push(words[w++]);
    if (notSpeech(seg)) return;
    const text = String(seg.text).replace(/\s+/g, " ").trim();
    const tokens = text.split(" ").filter((t) => bare(t));
    const list = mine.map((x, k) => ({
      start: toTime(x.start), end: toTime(x.end),
      text: tokens.length === mine.length ? tokens[k] : x.text,
    }));
    out.push({ start: toTime(start), end: toTime(end), text, words: list });
  });
  return { language: languageCode(d.language), duration: num(d.duration), segments: out };
}

/** Segments as a transcript is stored and synced: {segments: [[start, end, text]], words: {start, end, text, seg}}.
 * A sentence that came without word times has its words spread evenly, so the player still works. */
export function toTranscript(segments) {
  const r = (x) => Math.round(x * 1000) / 1000;
  const segs = [];
  const words = { start: [], end: [], text: [], seg: [] };
  for (const seg of segments) {
    if (!String(seg.text || "").trim()) continue;
    let list = seg.words || [];
    if (!list.length) {
      const toks = seg.text.split(/\s+/).filter(Boolean);
      const step = (seg.end - seg.start) / Math.max(1, toks.length);
      list = toks.map((t, i) => ({ start: seg.start + i * step, end: seg.start + (i + 1) * step, text: t }));
    }
    for (const x of list) { words.start.push(r(x.start)); words.end.push(r(x.end)); words.text.push(x.text); words.seg.push(segs.length); }
    segs.push([r(seg.start), r(seg.end), seg.text]);
  }
  return { segments: segs, words };
}

// ------------------------------------------------------------------- cutting an MP3 into pieces

// A long episode is bigger than a provider takes at once. An MP3 is a chain of small independent
// frames (about 26 ms of sound each), so it can be cut between two frames without decoding it,
// and each frame's header says exactly how long it lasts: the pieces' start times are exact.
const MP3_BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],   // MPEG-1 Layer III
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],       // MPEG-2 and 2.5 Layer III
};
const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** The frame starting at `i`: {bytes, seconds}, or null if no valid Layer III frame starts there. */
export function mp3Frame(buf, i) {
  if (i + 4 > buf.length || buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (buf[i + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layer = (buf[i + 1] >> 1) & 3;   // 1 = Layer III
  const bitrateIdx = buf[i + 2] >> 4;
  const rateIdx = (buf[i + 2] >> 2) & 3;
  if (version === 1 || layer !== 1 || bitrateIdx === 0 || bitrateIdx === 15 || rateIdx === 3) return null;
  const kbps = MP3_BITRATES[version === 3 ? 1 : 2][bitrateIdx];
  const rate = MP3_RATES[version][rateIdx];
  const padding = (buf[i + 2] >> 1) & 1;
  const samples = version === 3 ? 1152 : 576;
  return { bytes: Math.floor((samples / 8) * kbps * 1000 / rate) + padding, seconds: samples / rate };
}

/** Does this beginning of a file look like an MP3? (A tag block, or two frames in a row.) */
export function looksLikeMp3(head) {
  if (head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true; // "ID3"
  for (let i = 0; i + 4 <= Math.min(head.length, 4096); i++) {
    const f = mp3Frame(head, i);
    if (f && mp3Frame(head, i + f.bytes)) return true;
  }
  return false;
}

/** Feed it an MP3 a bit at a time with push(bytes); it hands back finished pieces
 * [{bytes, start, seconds}], each cut between frames and no longer than asked. finish() gives the rest. */
export class Mp3Splitter {
  constructor({ maxSeconds = 480, maxBytes = 10 * 1024 * 1024 } = {}) {
    this.maxSeconds = maxSeconds;
    this.maxBytes = maxBytes;
    this.rest = new Uint8Array(0); // bytes not yet a whole frame
    this.skip = 0;                 // bytes of a tag block still to step over
    this.first = true;
    this.synced = false;
    this.parts = [];
    this.size = 0;
    this.seconds = 0;
    this.start = 0;                // where the piece being built begins, in seconds
    this.total = 0;                // seconds of sound seen so far
  }

  _cut() {
    if (!this.size) return null;
    const bytes = new Uint8Array(this.size);
    let at = 0;
    for (const p of this.parts) { bytes.set(p, at); at += p.length; }
    const piece = { bytes, start: this.start, seconds: this.seconds };
    this.parts = [];
    this.size = 0;
    this.start += this.seconds;
    this.seconds = 0;
    return piece;
  }

  push(chunk) {
    const out = [];
    let buf = chunk;
    if (this.rest.length) {
      buf = new Uint8Array(this.rest.length + chunk.length);
      buf.set(this.rest);
      buf.set(chunk, this.rest.length);
    }
    let i = 0;
    if (this.skip) { const n = Math.min(this.skip, buf.length); i = n; this.skip -= n; }
    if (this.first && i === 0 && buf.length >= 10) {
      this.first = false;
      if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) { // an "ID3" tag block (title, cover picture): step over it
        const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
        const n = Math.min(10 + size, buf.length);
        i = n;
        this.skip = 10 + size - n;
      }
    }
    let run = i; // start of the stretch of whole frames being collected
    const take = (to) => { if (to > run) { const p = buf.subarray(run, to); this.parts.push(p.slice()); this.size += p.length; } };
    while (i + 4 <= buf.length) {
      const f = mp3Frame(buf, i);
      if (!f) { take(i); i++; run = i; this.synced = false; continue; }
      if (i + f.bytes + 4 > buf.length) break; // the frame, or the start of the next, isn't all here yet
      if (!this.synced && !mp3Frame(buf, i + f.bytes)) { take(i); i++; run = i; continue; } // a chance look-alike, not a frame
      this.synced = true;
      i += f.bytes;
      this.seconds += f.seconds;
      this.total += f.seconds;
      if (this.seconds >= this.maxSeconds || this.size + (i - run) >= this.maxBytes) {
        take(i);
        run = i;
        out.push(this._cut());
      }
    }
    take(i);
    this.rest = buf.slice(i);
    return out;
  }

  finish() {
    // The last frame was held back to check what follows it; if it is whole, it counts.
    const f = mp3Frame(this.rest, 0);
    if (f && this.synced && f.bytes <= this.rest.length) {
      this.parts.push(this.rest.slice(0, f.bytes));
      this.size += f.bytes;
      this.seconds += f.seconds;
      this.total += f.seconds;
    }
    this.rest = new Uint8Array(0);
    return this._cut();
  }
}

/** One second of silence as a WAV file: the smallest real audio to try a key with. */
export function silentWav(seconds = 1, rate = 16000) {
  const n = Math.round(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (at, s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  return new Uint8Array(buf);
}

// --------------------------------------------------------------------------------- what it costs

/** A model's price as Settings shows it: "11¢ per hour of audio". */
export function perHourText(model) {
  const c = model.perHour;
  return `${c >= 10 ? Math.round(c) : c}¢ per hour of audio`;
}

/** How many hours of audio a dollar buys with a model (a round number). */
export const hoursPerDollar = (model) => Math.round(100 / model.perHour);

/** What `seconds` of audio cost in US cents with a provider's model; null for a model whose price isn't listed. */
export function audioCents(provider, model, seconds) {
  const m = ((STT_PROVIDERS[provider] || {}).models || []).find((x) => x.id === model);
  return m ? (seconds / 3600) * m.perHour : null;
}

/** The local calendar day, e.g. "2026-10-12". */
export function sttDay(date = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

const blankUse = (day) => ({ day, seconds: 0, requests: 0, by: {} });

/** `saved` ({day, seconds, requests, by: {"provider:model": seconds}}) with one more request added.
 * A total from an earlier day starts again from zero. */
export function addAudioUse(saved, use, day = sttDay()) {
  const t = saved && saved.day === day ? { ...blankUse(day), ...saved, by: { ...(saved.by || {}) } } : blankUse(day);
  const key = `${use.provider}:${use.model}`;
  const seconds = Math.max(0, Number(use.seconds) || 0);
  t.seconds += seconds;
  t.requests += 1;
  t.by[key] = (t.by[key] || 0) + seconds;
  return t;
}

/** Today's part of a saved total (an older day's counts as nothing). */
export const audioUseToday = (saved, day = sttDay()) => (saved && saved.day === day ? { ...blankUse(day), ...saved } : blankUse(day));

export function lengthText(seconds) {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

function centsText(cents) {
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  if (cents >= 10) return `${Math.round(cents)}¢`;
  if (cents >= 0.05) return `${cents.toFixed(1)}¢`;
  return "less than 0.1¢";
}

/** The line Settings shows: {length: "1 h 12 min", detail: "9 pieces sent, about 13¢"}. */
export function describeAudioUse(t) {
  if (!t || !t.requests) return { length: "0 min", detail: "Nothing sent yet today." };
  let cents = 0;
  let unpriced = false;
  for (const [key, seconds] of Object.entries(t.by || {})) {
    const at = key.indexOf(":");
    const c = audioCents(key.slice(0, at), key.slice(at + 1), seconds);
    if (c === null) unpriced = true; else cents += c;
  }
  const cost = unpriced ? "" : cents < 0.05 ? `, ${centsText(cents)}` : `, about ${centsText(cents)}`;
  return { length: lengthText(t.seconds), detail: `${t.requests.toLocaleString()} piece${t.requests === 1 ? "" : "s"} sent${cost}` };
}
