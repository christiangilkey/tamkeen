// The phone's own transcribing, through a cloud provider (Settings → Cloud transcription).
//
// Without it the phone only asks the computer for a transcript and waits for the next sync. With a
// provider chosen and a key entered, "Transcribe" starts here at once: the phone fetches the
// episode's audio a few megabytes at a time, sends it to the provider in pieces, and puts the
// words it gets back together into a transcript (stored here and uploaded to Drive like a web
// page's text, so the computer and other devices receive it).
//
// A provider takes at most 25 MB per upload, and a phone can't re-encode audio the way the
// computer does. An MP3 can be cut between its frames without decoding it (see Mp3Splitter in
// stt.js), which covers nearly every podcast. Other formats are sent whole when they are small
// enough; when they aren't, Groq is given the file's address to fetch for itself.
//
// Requests go through the phone's native code, which isn't held back by the cross-site rules for
// web pages. In a browser (the development preview) plain fetch is used.

import { MAX_UPLOAD_BYTES, Mp3Splitter, STT_PROVIDERS, SttError, addAudioUse, audioUseToday, looksLikeMp3, parseTranscription,
         sendFailure, silentWav, sttConfig, sttFailure, sttModelLabel, tidyBase64, toTranscript, transcriptionFields, waitText } from "./stt.js";
import { drive } from "./drive.js";
import { NativeHttp, finalUrl, isNative, webFetch } from "./native.js";
import { kv, lib, now, saveLibrary, settings, transcripts } from "./store.js";
import { driveFileId, requestSync } from "./sync.js";

const HEAD_BYTES = 256 * 1024;      // the first request: enough to tell what kind of file it is
const STEP_BYTES = 3 * 1024 * 1024; // how much audio is fetched per request
const ATTEMPTS = 4;
const LONGEST_WAIT = 20 * 60;       // seconds a "slow down" from the provider is waited out before giving up
const USE_KEY = "sttUse";
export const STT_EVENT = "tamkeen:stt"; // fired on `window` when the day's total of audio sent changes
// As on the computer (app/languages.py): simplified characters for Chinese, and Bisaya spelling for
// Bisaya (which Whisper is asked to hear as its nearest language, Tagalog: stt.js whisperCode).
const PROMPTS = {
  zh: "以下是普通话的句子。",
  ceb: "Maayong buntag kaninyong tanan. Karon, atong hisgotan ang atong kinabuhi diri sa Sugbo ug sa Mindanao.",
};

export const cloudOn = () => sttConfig(settings).on;

// ---------------------------------------------------------------------------------- small tools

export class Cancelled extends Error {}

const headerOf = (res, name) => {
  const headers = (res && res.headers) || {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : null;
};

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error || new Error("Couldn't read the audio."));
    reader.readAsDataURL(bytes instanceof Blob ? bytes : new Blob([bytes]));
  });
}

async function pause(seconds, job) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if (job && job.cancelled) throw new Cancelled();
    await new Promise((r) => setTimeout(r, Math.min(500, Math.max(0, end - Date.now()))));
  }
}

// ------------------------------------------------------------------------------ audio sent today

export function usageToday() {
  try { return audioUseToday(JSON.parse(localStorage.getItem(USE_KEY))); } catch { return audioUseToday(null); }
}

function countUse(cfg, seconds) {
  try { localStorage.setItem(USE_KEY, JSON.stringify(addAudioUse(usageToday(), { provider: cfg.provider, model: cfg.model, seconds }))); }
  catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(STT_EVENT));
}

// ------------------------------------------------------------------------------------- fetching

/** Bytes `from`..`to` of a file on the web: {status, bytes, total, type, url}. `total` is the whole
 * file's size (0 if the server doesn't say); `url` is where it really was, after any forwarding
 * (podcast addresses usually pass through a counter or two), so later requests go straight there. */
export async function fetchRange(url, from, to) {
  const range = `bytes=${from}-${to}`;
  if (!isNative) {
    const res = await webFetch(url, { headers: { Range: range } });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const m = /\/(\d+)\s*$/.exec(res.headers.get("content-range") || "");
    return { status: res.status, bytes, total: m ? Number(m[1]) : res.status === 200 ? bytes.length : 0,
             type: res.headers.get("content-type") || "", url: finalUrl(res, url) };
  }
  let at = url;
  for (let hop = 0; hop < 8; hop++) {
    const res = await NativeHttp.request({ url: at, method: "GET", responseType: "arraybuffer", disableRedirects: true,
      connectTimeout: 20000, readTimeout: 120000,
      headers: { Range: range, "User-Agent": "Tamkeen/Android (+podcast player)", Accept: "*/*" } });
    const next = headerOf(res, "location");
    if (res.status >= 300 && res.status < 400 && next) { at = new URL(next, at).href; continue; }
    const ok = res.status === 200 || res.status === 206;
    const bytes = ok && typeof res.data === "string" ? b64ToBytes(res.data) : new Uint8Array(0);
    const m = /\/(\d+)\s*$/.exec(headerOf(res, "content-range") || "");
    return { status: res.status, bytes, total: m ? Number(m[1]) : res.status === 200 ? bytes.length : 0,
             type: headerOf(res, "content-type") || "", url: at };
  }
  throw new Error("The audio's address kept sending the app somewhere else.");
}

/** A whole (small) file as base64 text, e.g. a reel's video. */
export async function fetchWholeB64(url) {
  if (!isNative) {
    const res = await webFetch(url);
    if (!res.ok) throw new Error(`The download was refused (error ${res.status}).`);
    return bytesToB64(await res.blob());
  }
  const res = await NativeHttp.request({ url, method: "GET", responseType: "arraybuffer", connectTimeout: 20000, readTimeout: 120000,
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36" } });
  if (res.status >= 400 || typeof res.data !== "string") throw new Error(`The download was refused (error ${res.status}).`);
  return tidyBase64(res.data); // Android hands it over with line breaks in it, which its own uploader then refuses
}

// -------------------------------------------------------------------------------------- sending

/**
 * Send one piece of audio to the provider and return its answer. What is sent is one of:
 *   bytes / b64   the audio itself, with its `name` (the ending tells the provider the format) and `type`
 *   url           an address the provider fetches for itself (Groq only)
 * Without `language` the provider works out the language and says which it heard.
 * A "slow down" answer is waited out; a dropped connection is tried again.
 */
export async function postAudio(cfg, { bytes = null, b64 = "", url = "", name = "audio.mp3", type = "audio/mpeg", language = "" }, job = null) {
  const info = STT_PROVIDERS[cfg.provider];
  const fields = transcriptionFields({ model: cfg.model, language, prompt: PROMPTS[language] || "" });
  if (url) fields.push(["url", url]);
  let waited = 0;
  let problem = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (job && job.cancelled) throw new Cancelled();
    let status = 0;
    let body = null;
    let retryAfter = 0;
    try {
      if (isNative) {
        const data = fields.map(([key, value]) => ({ key, value, type: "string" }));
        if (!url) data.push({ key: "file", value: b64 ? tidyBase64(b64) : await bytesToB64(bytes), type: "base64File", contentType: type, fileName: name });
        const res = await NativeHttp.request({ url: info.url, method: "POST", data, dataType: "formData", responseType: "text",
          headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "multipart/form-data" }, connectTimeout: 20000, readTimeout: 300000 });
        status = res.status;
        body = res.data;
        retryAfter = Number(headerOf(res, "retry-after")) || 0;
      } else {
        const form = new FormData();
        for (const [key, value] of fields) form.append(key, value);
        if (!url) form.append("file", new Blob([bytes || b64ToBytes(b64)], { type }), name);
        const res = await fetch(info.url, { method: "POST", headers: { Authorization: `Bearer ${cfg.key}` }, body: form });
        status = res.status;
        body = await res.text();
        retryAfter = Number(res.headers.get("retry-after")) || 0;
      }
    } catch (e) {
      if (e instanceof Cancelled) throw e;
      // Not every failure here is the connection: the phone can refuse to build the request at all.
      problem = sendFailure(cfg.provider, e);
      console.warn(`Sending audio to ${info.label} failed`, e);
      if (!problem.retry) throw problem;
      await pause(3 * (attempt + 1), job);
      continue;
    }
    if (status === 200) {
      try { return typeof body === "string" ? JSON.parse(body) : body || {}; }
      catch { throw new SttError(`${info.label} sent back something that isn't a transcript.`); }
    }
    if (status === 429) { // the account's limit (free accounts: so much audio an hour); the answer says how long to wait
      const wait = retryAfter || 20;
      // A job may set a shorter limit (`longestWait`, seconds): picking reels doesn't sit for 20 minutes.
      if (waited + wait > ((job && job.longestWait) || LONGEST_WAIT)) throw sttFailure(cfg.provider, 429, body, wait);
      waited += wait;
      if (job && job.say) job.say(`${info.label} asks to wait ${waitText(wait)}…`);
      await pause(wait + 1, job);
      problem = sttFailure(cfg.provider, 429, body, 0);
      continue;
    }
    if (status >= 500) {
      problem = new SttError(`${info.label} is having trouble (error ${status}). Try again in a little while.`, { status });
      await pause(4 * (attempt + 1), job);
      continue;
    }
    throw sttFailure(cfg.provider, status, body, retryAfter);
  }
  throw problem || new SttError(`${info.label} didn't answer.`);
}

/** Try a key: send one second of silence. Resolves to how long the provider took, in seconds. */
export async function testKey({ provider, key, model }) {
  if (!STT_PROVIDERS[provider]) throw new SttError("Unknown provider.");
  if (!key) throw new SttError("Paste an API key first.");
  const t0 = performance.now();
  await postAudio({ provider, key, model: model || STT_PROVIDERS[provider].defaultModel }, { bytes: silentWav(1), name: "test.wav", type: "audio/wav" });
  return (performance.now() - t0) / 1000;
}

// ------------------------------------------------------------------------------- one episode

const KINDS = [[/mp4|m4a|aac/i, "m4a", "audio/mp4"], [/ogg|opus/i, "ogg", "audio/ogg"], [/wav/i, "wav", "audio/wav"],
               [/webm/i, "webm", "audio/webm"], [/flac/i, "flac", "audio/flac"], [/mpeg|mp3/i, "mp3", "audio/mpeg"]];
/** The file name and type to send a whole file under, from what the server called it and its address. */
export function fileKind(type, url) {
  const ending = (/\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(String(url || "").split("?")[0]) || [])[1] || "";
  for (const [re, ext, mime] of KINDS) if (re.test(type || "") || re.test(ending)) return { name: `audio.${ext}`, type: mime };
  return { name: "audio.m4a", type: "audio/mp4" };
}

const megabytes = (n) => `${Math.round(n / 1048576)} MB`;

/** An episode that lives on the web: fetch it bit by bit and send it. Resolves to {segments, seconds}. */
async function hearFromWeb(cfg, address, language, job) {
  const info = STT_PROVIDERS[cfg.provider];
  job.set("downloading", 0);
  const first = await fetchRange(address, 0, HEAD_BYTES - 1);
  if (first.status >= 400 || !first.bytes.length) throw new Error(`The audio couldn't be downloaded (the server answered ${first.status}).`);
  const whole = first.status === 200; // a server that ignores "just this part" and sends everything
  const total = first.total;
  const src = first.url;
  const segments = [];
  const hear = async (piece, kind, start) => {
    const data = await postAudio(cfg, { bytes: piece, ...kind, language }, job);
    const parsed = parseTranscription(data, (t) => t + start);
    segments.push(...parsed.segments);
    return parsed;
  };

  if (looksLikeMp3(first.bytes)) {
    const splitter = new Mp3Splitter();
    const send = async (pieces) => {
      for (const p of pieces) {
        if (!p) continue;
        await hear(p.bytes, { name: "piece.mp3", type: "audio/mpeg" }, p.start);
        countUse(cfg, p.seconds);
      }
    };
    job.set("transcribing", 0);
    let got = first.bytes.length;
    await send(splitter.push(first.bytes));
    while (!whole && (!total || got < total)) {
      if (job.cancelled) throw new Cancelled();
      const r = await fetchRange(src, got, (total ? Math.min(total, got + STEP_BYTES) : got + STEP_BYTES) - 1);
      if (r.status === 416 || (r.status === 206 && !r.bytes.length)) break; // past the end
      if (r.status !== 206) throw new Error(`The download stopped part-way (the server answered ${r.status}).`);
      got += r.bytes.length;
      job.set("transcribing", total ? Math.min(99, (100 * got) / total) : 0);
      await send(splitter.push(r.bytes));
    }
    await send([splitter.finish()]);
    if (!splitter.total) throw new Error("This audio couldn't be read as an MP3.");
    return { segments, seconds: splitter.total };
  }

  // Not an MP3: it can only go whole.
  if (total && total > MAX_UPLOAD_BYTES && !whole) {
    if (cfg.provider !== "groq") {
      throw new Error(`This episode's audio isn't an MP3 and is ${megabytes(total)}: more than ${info.label} takes in one piece (25 MB). `
        + "Transcribe it on your computer, or use Groq as the provider.");
    }
    job.set("transcribing", 0); // Groq fetches the file itself from its address
    const data = await postAudio(cfg, { url: address, language }, job);
    const parsed = parseTranscription(data);
    countUse(cfg, parsed.duration);
    return { segments: parsed.segments, seconds: parsed.duration };
  }
  const parts = [first.bytes];
  let got = first.bytes.length;
  while (!whole && (!total || got < total)) {
    if (job.cancelled) throw new Cancelled();
    const r = await fetchRange(src, got, (total ? Math.min(total, got + STEP_BYTES) : got + STEP_BYTES) - 1);
    if (r.status === 416 || (r.status === 206 && !r.bytes.length)) break;
    if (r.status !== 206) throw new Error(`The download stopped part-way (the server answered ${r.status}).`);
    parts.push(r.bytes);
    got += r.bytes.length;
    if (got > MAX_UPLOAD_BYTES) throw new Error(`This episode's audio isn't an MP3 and is too large to send in one piece. Transcribe it on your computer.`);
    job.set("downloading", total ? Math.min(99, (100 * got) / total) : 0);
  }
  job.set("transcribing", 50);
  const parsed = await hear(new Blob(parts), fileKind(first.type, src), 0);
  countUse(cfg, parsed.duration);
  return { segments, seconds: parsed.duration };
}

class LeaveToComputer extends Error {}

/** One of the user's own files (a video or a recording), from the file itself or from their Drive. */
async function hearOwnFile(cfg, ep, language, job) {
  let file = job.file || null;
  if (!file) {
    job.set("downloading", 0);
    const id = await driveFileId(ep.audio_url.slice("drive:".length));
    if (!id) throw new Error("The file isn't in your Google Drive any more.");
    const meta = await drive.get(id);
    if (Number(meta.size) > MAX_UPLOAD_BYTES) throw new LeaveToComputer();
    file = await drive.downloadBlob(id);
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new LeaveToComputer();
  job.set("transcribing", 50);
  const ending = (/\.([a-z0-9]{2,5})$/i.exec(ep.audio_url) || [])[1] || "mp4";
  const data = await postAudio(cfg, { bytes: file, name: `file.${ending.toLowerCase()}`, type: ep.audio_type || file.type || "video/mp4", language }, job);
  const parsed = parseTranscription(data);
  countUse(cfg, parsed.duration);
  return { segments: parsed.segments, seconds: parsed.duration };
}

/** Keep a finished transcript: on the phone, and (at the next sync) in Drive for the other devices. */
export async function storeTranscript(uid, segments, model, fields = {}) {
  const t = now();
  const body = toTranscript(segments);
  await transcripts.put(uid, { format: 1, rev: t, model, ...body });
  // Looked up afresh: a sync that ran meanwhile may have replaced the episode's record.
  const ep = lib.episodes.find((e) => e.uid === uid);
  if (ep) Object.assign(ep, { transcript_rev: t, model, transcribe_requested_at: null, updated_at: t, ...fields });
  const pending = new Set((await kv.get("pending_transcripts")) || []);
  pending.add(uid);
  await kv.set("pending_transcripts", [...pending]);
  saveLibrary();
  requestSync();
  return body.words.text.length;
}

// ----------------------------------------------------------------------------------- the queue

const jobs = new Map(); // episode uid -> {status, progress, error, cancelled, file}
const queue = [];
const hearers = new Set();
let working = false;

/** Hear how episodes are getting on: fn({id, status, progress, error, title?, words?}). */
export function onJob(fn) { hearers.add(fn); return () => hearers.delete(fn); }
function tell(uid, more = {}) {
  const j = jobs.get(uid) || {};
  const event = { id: uid, status: j.status || "new", progress: j.progress || 0, error: j.error || null, ...more };
  for (const fn of hearers) { try { fn(event); } catch (e) { console.error(e); } }
}

/** Where an episode's transcription has got to on this phone, or null. */
export const jobOf = (uid) => { const j = jobs.get(uid); return j ? { status: j.status, progress: j.progress, error: j.error } : null; };

/** Start transcribing these episodes here, one after another. `files`: a just-added file per episode, if in hand. */
export function enqueue(uids, files = {}) {
  const queued = [];
  for (const uid of uids) {
    const now_ = jobs.get(uid);
    if (now_ && now_.status !== "failed") continue;
    jobs.set(uid, { status: "queued", progress: 0, error: null, cancelled: false, file: files[uid] || null });
    queue.push(uid);
    queued.push(uid);
    tell(uid);
  }
  run();
  return queued;
}

export function cancel(uid) {
  const j = jobs.get(uid);
  if (!j) return;
  j.cancelled = true;
  if (j.status === "queued" || j.status === "failed") { jobs.delete(uid); tell(uid, { status: "new" }); }
}

async function run() {
  if (working) return;
  working = true;
  try {
    for (let uid = queue.shift(); uid; uid = queue.shift()) {
      const job = jobs.get(uid);
      if (!job || job.cancelled || job.status !== "queued") continue;
      job.set = (status, progress) => { job.status = status; job.progress = Math.round(progress * 10) / 10; tell(uid); };
      const ep = lib.episodes.find((e) => e.uid === uid && !e.deleted);
      try {
        if (!ep) throw new Cancelled();
        const cfg = sttConfig(settings);
        if (!cfg.on) throw new Error("Cloud transcription is switched off. Turn it on in Settings.");
        const language = settings.study_language || "ar";
        const heard = String(ep.audio_url || "").startsWith("drive:") || job.file
          ? await hearOwnFile(cfg, ep, language, job)
          : await hearFromWeb(cfg, ep.audio_url, language, job);
        if (job.cancelled) throw new Cancelled();
        const words = await storeTranscript(uid, heard.segments, sttModelLabel(cfg),
          { language, duration: ep.duration || Math.round(heard.seconds) || null });
        jobs.delete(uid);
        tell(uid, { status: "done", progress: 100, title: ep.title, words });
      } catch (e) {
        if (e instanceof Cancelled) {
          jobs.delete(uid);
          tell(uid, { status: "new" });
        } else if (e instanceof LeaveToComputer) {
          // Too big to send from here: ask the computer, as before.
          Object.assign(ep, { transcribe_requested_at: now(), updated_at: now() });
          saveLibrary();
          requestSync();
          jobs.delete(uid);
          tell(uid, { status: "queued", note: "That file is too large to send from the phone, so your computer will transcribe it." });
        } else {
          console.warn("Transcribing on the phone failed", uid, e);
          Object.assign(job, { status: "failed", error: e.message || String(e), file: null });
          tell(uid, { title: ep ? ep.title : "" });
        }
      }
    }
  } finally {
    working = false;
  }
}
