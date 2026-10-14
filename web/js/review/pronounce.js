// "Say it": pronunciation practice on the back of a review card (web/js/pages/review.js).
//
// One press listens to the learner saying the word, then plays the word's own audio (the native
// speaker) and, straight after it, the learner's attempt, so the two can be compared by ear.
//
// The attempt is never kept: it lives in this page's memory for the few seconds it takes to play
// and is dropped. Nothing is written to storage and nothing leaves the device.
//
// Listening ends by itself a moment after the learner stops speaking (or at a press of the same
// button). The silence before and after the attempt is cut off, and a quiet attempt is turned up,
// so it follows the word at once and at about the same loudness.

import { icon } from "../icons.js";

const QUIET_MS = 650;     // this long without speech, after some, ends the listening
const NOTHING_MS = 4000;  // nothing said at all: give up
const GAP_MS = 280;       // between the word and the attempt
const FRAME = 0.02;       // seconds of sound judged at a time when trimming

/** How long to listen at most, for a word whose own audio is `wordSeconds` long. */
export const listenLimit = (wordSeconds) => Math.round(Math.min(15, Math.max(5, wordSeconds * 2.5 + 2.5)) * 1000);

/**
 * Decides when to stop listening. Returns a function fed the loudness now (0..1) and the
 * milliseconds listened so far; it answers true once the listening should end.
 */
export function listener({ quietMs = QUIET_MS, nothingMs = NOTHING_MS, maxMs = 6000 } = {}) {
  let floor = Infinity;  // the quietest the room has been: its background noise
  let spoke = false, quietSince = null;
  return (level, ms) => {
    floor = Math.min(floor, Math.max(level, 0.002));
    const loud = level > Math.max(0.015, Math.min(floor * 4, 0.06));
    if (loud) { spoke = true; quietSince = null; } else if (spoke && quietSince == null) quietSince = ms;
    if (ms >= maxMs) return true;
    if (!spoke) return ms >= nothingMs;
    return quietSince != null && ms - quietSince >= quietMs;
  };
}

/**
 * Where the speech is in a recording: {start, end} in seconds and `peak`, its loudest sample.
 * Null when nothing in it is loud enough to be someone speaking.
 */
export function speechBounds(samples, rate) {
  const size = Math.max(1, Math.round(rate * FRAME));
  const levels = [];
  for (let i = 0; i + size <= samples.length; i += size) {
    let sum = 0;
    for (let j = i; j < i + size; j++) sum += samples[j] * samples[j];
    levels.push(Math.sqrt(sum / size));
  }
  const top = Math.max(0, ...levels);
  if (top < 0.01) return null;
  const bar = Math.max(0.008, top * 0.12);
  const first = levels.findIndex((l) => l >= bar), last = levels.findLastIndex((l) => l >= bar);
  if (last - first < 4) return null;  // under a tenth of a second: a click, not a word
  const start = Math.max(0, first * FRAME - 0.12), end = Math.min(samples.length / rate, (last + 1) * FRAME + 0.2);
  let peak = 0;
  for (let i = Math.floor(start * rate); i < Math.min(samples.length, Math.ceil(end * rate)); i++) peak = Math.max(peak, Math.abs(samples[i]));
  return { start, end, peak };
}

/** How much to turn an attempt up so its loudest moment is about as loud as a prepared clip's. */
export const boost = (peak) => (peak > 0 ? Math.min(8, Math.max(1, 0.85 / peak)) : 1);

/** Can this device listen at all? (The button is left out where it can't.) */
export function canRecord() {
  return typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    && typeof window !== "undefined" && !!window.MediaRecorder && !!(window.AudioContext || window.webkitAudioContext);
}

const LABEL = { idle: "Say it", ready: "Say it", rec: "Listening", word: "Native", you: "You" };

/** The button's markup, for the row of listen buttons under the word ("" where the device can't listen). */
export function practiseButton() {
  if (!canRecord()) return "";
  return `<button type="button" class="say-it" data-state="idle" title="Practise saying it (P): hear the word, then yourself. Your attempt isn't saved.">`
    + `<i class="say-dot" aria-hidden="true"></i>${icon("speak", 17)}<span>${LABEL.idle}</span></button>`;
}

let ctx = null;  // one sound context for the page, made at the first press
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Make `button` (from practiseButton) work.
 *   sayWord      () => Promise that settles once the word's own audio has started
 *   wordSeconds  how long that audio lasts
 *   wordBusy     () => milliseconds until audio that is already playing ends (it must not be recorded)
 *   onError      (message) => void, for something the learner should be told
 */
export function practise(button, { sayWord, wordSeconds, wordBusy = () => 0, onError = () => {} }) {
  const label = button.querySelector("span");
  let run = null;  // the attempt in progress: {stop(), cancelled}

  const set = (state) => {
    button.dataset.state = state;
    label.textContent = LABEL[state];
    button.setAttribute("aria-pressed", String(state !== "idle"));
  };
  // The card has gone (answered, deleted, the reviewer closed): whatever is going on ends quietly.
  const gone = (me) => me.cancelled || !button.isConnected;

  async function attempt(me) {
    set("ready");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      onError("Tamkeen needs permission to use the microphone to hear you say the word.");
      return;
    }
    const release = () => stream.getTracks().forEach((t) => t.stop());
    try {
      const wait = wordBusy();
      if (wait > 0) await sleep(wait);  // the word is still being said: it must not end up in the attempt
      if (gone(me)) return;

      // ----- listen -----
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise((done) => { recorder.onstop = done; });
      const mic = ctx.createMediaStreamSource(stream), ear = ctx.createAnalyser();
      ear.fftSize = 1024;
      mic.connect(ear);
      const heard = new Float32Array(ear.fftSize);
      const enough = listener({ maxMs: listenLimit(wordSeconds) });
      const began = Date.now();
      recorder.start();
      set("rec");
      me.stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
      const watch = setInterval(() => {
        ear.getFloatTimeDomainData(heard);
        let sum = 0;
        for (const s of heard) sum += s * s;
        const level = Math.sqrt(sum / heard.length);
        button.style.setProperty("--level", String(Math.min(1, level * 9)));
        if (gone(me) || enough(level, Date.now() - began)) me.stop();
      }, 50);
      await stopped;
      clearInterval(watch);
      mic.disconnect();
      me.stop = null;
      release();
      button.style.removeProperty("--level");
      if (gone(me)) return;

      // ----- find the speech in it -----
      let sound = null, where = null;
      try {
        sound = await ctx.decodeAudioData(await new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" }).arrayBuffer());
        where = speechBounds(sound.getChannelData(0), sound.sampleRate);
      } catch { /* nothing usable was recorded */ }
      if (gone(me)) return;
      if (!where) { onError("I couldn't hear you. Try again, a little closer to the microphone."); return; }

      // ----- the word, then the attempt -----
      set("word");
      await sayWord();
      await sleep(wordSeconds * 1000 + GAP_MS);
      if (gone(me)) return;
      set("you");
      const source = ctx.createBufferSource(), volume = ctx.createGain();
      source.buffer = sound;
      volume.gain.value = boost(where.peak);
      source.connect(volume).connect(ctx.destination);
      const played = new Promise((done) => { source.onended = done; });
      me.stop = () => { try { source.stop(); } catch { /* already over */ } };
      source.start(0, where.start, where.end - where.start);
      const check = setInterval(() => { if (gone(me)) me.stop(); }, 100);
      await played;
      clearInterval(check);
    } finally {
      release();
    }
  }

  button.onclick = async () => {
    if (run) {  // a second press: stop listening now (the comparison follows), or cut the comparison short
      if (run.stop) { if (button.dataset.state !== "rec") run.cancelled = true; run.stop(); } else run.cancelled = true;
      return;
    }
    const me = run = { stop: null, cancelled: false };
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
      await attempt(me);
    } catch {
      if (!gone(me)) onError("The microphone couldn't be used just now.");
    } finally {
      run = null;
      if (button.isConnected) set("idle");
    }
  };
}
