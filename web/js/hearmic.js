// Recording one spoken message from the microphone (Library → Conversation). Listening ends by itself
// when the speaker has been quiet for a moment, or at a second press. The recording is handed back as it
// is and never kept: what writes it down is hear-service.js.
// Shared by the desktop app, the phone and the web app.

import { listener, micProblem, canRecord } from "./review/pronounce.js";

export { canRecord };

const QUIET_MS = 1800;   // a pause this long, after speech, ends the message (longer than "Say it": people think mid-sentence)
const NOTHING_MS = 7000; // nothing said at all
const MAX_MS = 90000;

let ctx = null; // one sound context for the page, made at the first press

/**
 * Start listening. Resolves to {stop(), cancel(), done}: `done` resolves to the recording (a Blob), or
 * null when nothing was said or it was cancelled. `onLevel(0..1)` is called with the loudness as it
 * goes. Rejects with a message for the learner when the microphone can't be opened.
 */
export async function listen({ onLevel = () => {} } = {}) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    throw new Error(micProblem(e) || "Tamkeen needs permission to use the microphone to hear you.");
  }
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const mic = ctx.createMediaStreamSource(stream), ear = ctx.createAnalyser();
  ear.fftSize = 1024;
  mic.connect(ear);
  const heard = new Float32Array(ear.fftSize);
  const enough = listener({ quietMs: QUIET_MS, nothingMs: NOTHING_MS, maxMs: MAX_MS });
  const began = Date.now();
  let spoke = false, cancelled = false;
  const stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
  const watch = setInterval(() => {
    ear.getFloatTimeDomainData(heard);
    let sum = 0;
    for (const s of heard) sum += s * s;
    const level = Math.sqrt(sum / heard.length);
    if (level > 0.02) spoke = true;
    onLevel(Math.min(1, level * 9));
    if (enough(level, Date.now() - began)) stop();
  }, 50);
  const done = new Promise((resolve) => {
    recorder.onstop = () => {
      clearInterval(watch);
      try { mic.disconnect(); } catch { /* already gone */ }
      stream.getTracks().forEach((t) => t.stop());
      onLevel(0);
      resolve(cancelled || !spoke || !chunks.length ? null : new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" }));
    };
  });
  recorder.start();
  return { stop, cancel: () => { cancelled = true; stop(); }, done };
}
