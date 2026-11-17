// The volume of Tamkeen's own sounds (Settings → Look & feel → Sound volume): card voices and word audio,
// the device's voice, course and grammar sentences, the conversation partner, a pronunciation attempt played
// back, voice samples, and the game's chimes. The media being played (podcasts, audiobooks, videos, YouTube,
// Netflix, reels, a lesson's tracks, the transcript editor's audio) keeps its own volume and never passes here.
//
// Kept on this device only (localStorage): a phone and a computer want different levels.
//   appSound(el)  an <audio> element of the app's own: its volume follows the slider, now and later
//   appOut(ctx)   what an AudioContext's sounds connect to instead of ctx.destination
//   speechVolume() for the device's voice (0..1)

const KEY = "appSoundVolume";

/** The slider's position, 0..100 (100 unless set). */
export function appVolumePercent() {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (localStorage.getItem(KEY) !== null && Number.isFinite(v)) return Math.max(0, Math.min(100, Math.round(v)));
  } catch { /* no storage: full volume */ }
  return 100;
}

/** The loudness for a slider position: squared, so the middle of the slider sounds about half as loud. */
export const levelOf = (percent) => (Math.max(0, Math.min(100, percent)) / 100) ** 2;

let level = levelOf(appVolumePercent());
/** The loudness now, 0..1. */
export const appVolume = () => level;
export const speechVolume = () => level;

const players = new Set();   // WeakRefs to the app's <audio> elements, to change while they play
const outs = new Map();      // AudioContext -> its GainNode

/** Move the slider to `percent` (0..100): saved, and every sound playing now follows. */
export function setAppVolume(percent) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  try { localStorage.setItem(KEY, String(p)); } catch { /* not kept; still applies now */ }
  level = levelOf(p);
  for (const ref of players) {
    const el = ref.deref ? ref.deref() : ref;
    if (!el) players.delete(ref);
    else el.volume = level;
  }
  for (const [ctx, gain] of outs) {
    if (ctx.state === "closed") outs.delete(ctx);
    else gain.gain.value = level;
  }
}

/** Make `el` (an <audio> of the app's own) follow the slider. Returns `el`. */
export function appSound(el) {
  if (!el) return el;
  try { el.volume = level; } catch { /* some players have no volume */ }
  if (!el.__appVolume) {
    el.__appVolume = true;
    // (Set again on each play: a player made before the slider moved plays at the new level.)
    el.addEventListener("play", () => { try { el.volume = level; } catch { /* as above */ } });
    players.add(typeof WeakRef === "function" ? new WeakRef(el) : el);
  }
  return el;
}

/** The node an AudioContext's own sounds connect to (in place of ctx.destination). */
export function appOut(ctx) {
  let gain = outs.get(ctx);
  if (!gain) {
    gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(ctx.destination);
    outs.set(ctx, gain);
  }
  return gain;
}

let testCtx = null;
/** A short two-note chime at the current level (the slider's own "try it"). */
export function testChime() {
  try {
    testCtx = testCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (testCtx.state === "suspended") testCtx.resume().catch(() => {});
    [660, 880].forEach((f, i) => {
      const at = testCtx.currentTime + i * 0.11;
      const osc = testCtx.createOscillator(), gain = testCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, at);
      gain.gain.setValueAtTime(0.12, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      osc.connect(gain).connect(appOut(testCtx));
      osc.start(at);
      osc.stop(at + 0.25);
    });
  } catch { /* no sound available */ }
}
