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

import { MAX_UPLOAD_BYTES, STT_PROVIDERS, SttError, addAudioUse, audioUseToday, looksLikeMp3, parseTranscription,
         silentWav, sttConfig, sttModelLabel, tidyBase64, toTranscript, transcriptionFields } from "./stt.js";
import { Cancelled, HEAD_BYTES, PATIENT_PAUSES, PIECE_SECONDS, QUICK_PAUSES, askProvider, canResume, fetchWhole, pause, stopMessage, streamMp3,
         throughDrops } from "./sttjob.js";
import { drive } from "./drive.js";
import { NativeHttp, finalUrl, isNative, webFetch } from "./native.js";
import { kv, lib, now, saveLibrary, settings, transcripts } from "./store.js";
import { driveFileId, requestSync } from "./sync.js";

const USE_KEY = "sttUse";
const PARTIAL = (uid) => `stt_partial:${uid}`; // kv: what a long episode's last try finished (sttjob.js canResume)
// kv: a smaller piece size this phone needed lately ({seconds, at}): its uploads kept dying at 8 minutes
// (sttjob.js streamMp3), so the next episodes start at the size that went through. Forgotten after 3 days.
const PIECE_KEY = "stt_piece_seconds";
const PIECE_DAYS = 3;
export const STT_EVENT = "tamkeen:stt"; // fired on `window` when the day's total of audio sent changes
// As on the computer (app/languages.py): simplified characters for Chinese, and Bisaya spelling for
// Bisaya (which Whisper is asked to hear as its nearest language, Tagalog: stt.js whisperCode).
const PROMPTS = {
  zh: "以下是普通话的句子。",
  ceb: "Maayong buntag kaninyong tanan! Unsa man ang atong istorya karon? Dili gyud ko kasabot, pero nindot kaayo. " +
       "Kumusta na ka? Ayaw kabalaka, okay ra ta. Unsay imong gibuhat ganina? Wala koy kwarta, mao nga nagtrabaho ko. " +
       "Ingon niya nga mouli siya ugma sa among balay. Nindot kaayo ang panahon diri sa Sugbo ug sa Davao.",
};

export const cloudOn = () => sttConfig(settings).on;

// ---------------------------------------------------------------------------------- small tools

export { Cancelled };

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

// ------------------------------------------------------------------- is the app on screen and online?
// Phones cut the internet to a browser or app that is in the background or asleep (more so in battery
// saver), so a request that fails then says nothing about the connection itself: it is waited out until
// the app is back on screen and online (sttjob.js throughDrops), not counted as a failed try.

let outOfSight = 0; // counts each time the app went out of sight or the phone said it went offline
const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (hidden()) outOfSight++; });
if (typeof window !== "undefined") window.addEventListener("offline", () => { outOfSight++; });

export const net = {
  mark: () => outOfSight,
  troubleSince: (mark) => outOfSight !== mark || hidden() || offline(),
  async waitUntilBack(job) {
    let was = "";
    while (hidden() || offline()) {
      const now_ = offline() ? "Waiting for the internet to come back…"
        : "Paused while Tamkeen is in the background. It carries on when you come back.";
      if (now_ !== was && job && job.say) job.say(now_);
      was = now_;
      await pause(1, job);
    }
    await pause(2, job); // a moment for the connection to settle once the app is back
  },
};

/** How a request for `job` deals with a dropped connection: an episode's job is patient (it says what
 * it is doing and waits for the app to be back on screen); Test the key and reels try quickly, as before. */
const tryingFor = (job) => (job && job.patient
  ? { job, net, sleep: pause, pauses: PATIENT_PAUSES, longestWait: job.longestWait }
  : { job, sleep: pause, pauses: QUICK_PAUSES, longestWait: job && job.longestWait });

// Keeping the screen on while an episode is being transcribed, where the browser allows it (the web app
// in Chrome, Firefox, Safari): a phone that goes to sleep cuts the app's internet.
let screenLock = null;
async function holdScreen() {
  try {
    if (screenLock || hidden() || typeof navigator === "undefined" || !navigator.wakeLock) return;
    screenLock = await navigator.wakeLock.request("screen");
    screenLock.addEventListener("release", () => { screenLock = null; });
  } catch { screenLock = null; /* refused (battery saver) or not offered: fine */ }
}
function letScreenSleep() {
  try { if (screenLock) screenLock.release(); } catch { /* already gone */ }
  screenLock = null;
}
// (A screen lock ends when the app goes out of sight; take it again on coming back while still working.)
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (working && !hidden()) holdScreen(); });

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
export async function postAudio(cfg, { bytes = null, b64 = "", url = "", name = "audio.mp3", type = "audio/mpeg", language = "" }, job = null, extra = {}) {
  const info = STT_PROVIDERS[cfg.provider];
  const fields = transcriptionFields({ model: cfg.model, language, prompt: PROMPTS[language] || "" });
  if (url) fields.push(["url", url]);
  const request = async () => {
    if (isNative) {
      const data = fields.map(([key, value]) => ({ key, value, type: "string" }));
      if (!url) data.push({ key: "file", value: b64 ? tidyBase64(b64) : await bytesToB64(bytes), type: "base64File", contentType: type, fileName: name });
      const res = await NativeHttp.request({ url: info.url, method: "POST", data, dataType: "formData", responseType: "text",
        headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "multipart/form-data" }, connectTimeout: 20000, readTimeout: 300000 });
      return { status: res.status, body: res.data, retryAfter: Number(headerOf(res, "retry-after")) || 0 };
    }
    const form = new FormData();
    for (const [key, value] of fields) form.append(key, value);
    if (!url) form.append("file", new Blob([bytes || b64ToBytes(b64)], { type }), name);
    const res = await fetch(info.url, { method: "POST", headers: { Authorization: `Bearer ${cfg.key}` }, body: form });
    return { status: res.status, body: await res.text(), retryAfter: Number(res.headers.get("retry-after")) || 0 };
  };
  return askProvider(cfg.provider, request, { ...tryingFor(job), ...extra });
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

/** An episode that lives on the web: fetch it bit by bit and send it. Resolves to {segments, seconds}.
 * An MP3 is sent in pieces, each kept as it is done (kv `stt_partial:<uid>`), so a later try of the
 * same file carries on after the last piece kept instead of starting again (and paying again). */
async function hearFromWeb(cfg, uid, address, language, job) {
  const info = STT_PROVIDERS[cfg.provider];
  const ctx = tryingFor(job);
  job.set("downloading", 0);
  const head = await throughDrops(async () => {
    try { return await fetchRange(address, 0, HEAD_BYTES - 1); }
    catch (e) { e.where = "the episode's server"; throw e; }
  }, ctx);
  if (head.status >= 400 || !head.bytes.length) throw new Error(`The audio couldn't be downloaded (the server answered ${head.status}).`);
  const whole = head.status === 200; // a server that ignores "just this part" and sends everything
  const total = head.total;
  const src = head.url;
  const first = { ...head, src };

  if (looksLikeMp3(head.bytes)) {
    const model = sttModelLabel(cfg);
    let saved = null;
    try { saved = await kv.get(PARTIAL(uid)); } catch { saved = null; }
    if (whole || !canResume(saved, { address, model, language, total, src })) saved = null;
    const hear = async (p, extra) => {
      const data = await postAudio(cfg, { bytes: p.bytes, name: "piece.mp3", type: "audio/mpeg", language }, job, extra);
      countUse(cfg, p.seconds);
      return parseTranscription(data, (t) => t + p.start);
    };
    const keep = (state) => kv.set(PARTIAL(uid), { address, model, language, total, src, at: Date.now(), ...state })
      .catch((e) => console.warn("Couldn't keep the transcript so far", e));
    let pieceSeconds = PIECE_SECONDS;
    try {
      const learnt = await kv.get(PIECE_KEY);
      if (learnt && learnt.seconds && Date.now() - learnt.at < PIECE_DAYS * 86400e3) pieceSeconds = learnt.seconds;
    } catch { /* storage unavailable: the usual size */ }
    const smaller = (seconds) => kv.set(PIECE_KEY, { seconds, at: Date.now() }).catch(() => {});
    const heard = await streamMp3({ first, fetchRange, hear, keep, saved, job, ctx, pieceSeconds, smaller, label: info.label });
    await kv.set(PARTIAL(uid), null).catch(() => {});
    return heard;
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
  const parts = await fetchWhole({ first, fetchRange, job, ctx });
  job.set("transcribing", 50);
  const data = await postAudio(cfg, { bytes: new Blob(parts), ...fileKind(head.type, src), language }, job);
  const parsed = parseTranscription(data);
  countUse(cfg, parsed.duration);
  return { segments: parsed.segments, seconds: parsed.duration };
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
  const event = { id: uid, status: j.status || "new", progress: j.progress || 0, error: j.error || null, waiting: j.waiting || null, ...more };
  for (const fn of hearers) { try { fn(event); } catch (e) { console.error(e); } }
}

/** Where an episode's transcription has got to on this phone, or null. */
export const jobOf = (uid) => { const j = jobs.get(uid); return j ? { status: j.status, progress: j.progress, error: j.error, waiting: j.waiting || null } : null; };

/** Start transcribing these episodes here, one after another. `files`: a just-added file per episode, if in hand. */
export function enqueue(uids, files = {}) {
  const queued = [];
  for (const uid of uids) {
    const now_ = jobs.get(uid);
    if (now_ && now_.status !== "failed") continue;
    jobs.set(uid, { status: "queued", progress: 0, error: null, waiting: null, cancelled: false, file: files[uid] || null });
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
      job.say = (text) => { job.waiting = text || null; tell(uid); }; // a wait worth knowing about, under the progress bar
      job.patient = true;
      holdScreen();
      const ep = lib.episodes.find((e) => e.uid === uid && !e.deleted);
      try {
        if (!ep) throw new Cancelled();
        const cfg = sttConfig(settings);
        if (!cfg.on) throw new Error("Cloud transcription is switched off. Turn it on in Settings.");
        const language = settings.study_language || "ar";
        const heard = String(ep.audio_url || "").startsWith("drive:") || job.file
          ? await hearOwnFile(cfg, ep, language, job)
          : await hearFromWeb(cfg, uid, ep.audio_url, language, job);
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
          Object.assign(job, { status: "failed", error: stopMessage(e, { duration: ep && ep.duration }), waiting: null, file: null });
          tell(uid, { title: ep ? ep.title : "" });
        }
      }
    }
  } finally {
    working = false;
    letScreenSleep();
  }
}
