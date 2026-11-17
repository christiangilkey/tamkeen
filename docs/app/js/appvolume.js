// Settings → Look & feel → Sound volume: two sliders, each kept on this device only (localStorage: a phone and a
// computer want different levels).
//
// App sounds: card voices and word audio, the device's voice, course and grammar sentences, the conversation
// partner, voice notes, a pronunciation attempt played back, voice samples, and the game's chimes.
//   appSound(el)   an <audio> element of the app's own: its volume follows the slider, now and later
//   appOut(ctx)    what an AudioContext's sounds connect to instead of ctx.destination
//   speechVolume() for the device's voice (0..1)
//
// Media: podcasts, audiobooks, your own audio and video files, recordings, a lesson's tracks (they play in the
// player), the transcript editor, a DLI file. YouTube and Netflix play in their own players with their own
// volume, and reels in theirs; they pass through neither slider.
//   mediaSound(el) an <audio> or <video> of the media
//
// (The iPhone ignores an <audio>'s volume, Apple's rule for web pages: there the iPhone's own buttons set it.
// The chimes and the iPhone's voice still follow the app slider.)

/** The loudness for a slider position: squared, so the middle of the slider sounds about half as loud. */
export const levelOf = (percent) => (Math.max(0, Math.min(100, percent)) / 100) ** 2;

function channel(key) {
  const read = () => {
    try {
      const raw = localStorage.getItem(key);
      const v = Number(raw);
      if (raw !== null && Number.isFinite(v)) return Math.max(0, Math.min(100, Math.round(v)));
    } catch { /* no storage: full volume */ }
    return 100;
  };
  let level = levelOf(read());
  const players = new Set();   // WeakRefs to its elements, to change while they play
  const outs = new Map();      // AudioContext -> its GainNode
  return {
    percent: read,
    level: () => level,
    set(percent) {
      const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
      try { localStorage.setItem(key, String(p)); } catch { /* not kept; still applies now */ }
      level = levelOf(p);
      for (const ref of players) {
        const el = ref.deref ? ref.deref() : ref;
        if (!el) players.delete(ref);
        else try { el.volume = level; } catch { /* as below */ }
      }
      for (const [ctx, gain] of outs) {
        if (ctx.state === "closed") outs.delete(ctx);
        else gain.gain.value = level;
      }
    },
    follow(el) {
      if (!el) return el;
      try { el.volume = level; } catch { /* some players have no volume */ }
      if (!el.__volumeFollows) {
        el.__volumeFollows = key;
        // (Set again on each play: a player made before the slider moved plays at the new level.)
        el.addEventListener("play", () => { try { el.volume = level; } catch { /* as above */ } });
        players.add(typeof WeakRef === "function" ? new WeakRef(el) : el);
      }
      return el;
    },
    out(ctx) {
      let gain = outs.get(ctx);
      if (!gain) {
        gain = ctx.createGain();
        gain.gain.value = level;
        gain.connect(ctx.destination);
        outs.set(ctx, gain);
      }
      return gain;
    },
  };
}

const app = channel("appSoundVolume");
const media = channel("mediaVolume");

/** The app slider's position, 0..100 (100 unless set). */
export const appVolumePercent = () => app.percent();
/** The app sounds' loudness now, 0..1. */
export const appVolume = () => app.level();
export const speechVolume = () => app.level();
/** Move the app slider to `percent` (0..100): saved, and every app sound playing now follows. */
export const setAppVolume = (percent) => app.set(percent);
/** Make `el` (an <audio> of the app's own) follow the app slider. Returns `el`. */
export const appSound = (el) => app.follow(el);
/** The node an AudioContext's own sounds connect to (in place of ctx.destination). */
export const appOut = (ctx) => app.out(ctx);

/** The media slider's position, 0..100 (100 unless set). */
export const mediaVolumePercent = () => media.percent();
/** The media's loudness now, 0..1. */
export const mediaVolume = () => media.level();
/** Move the media slider to `percent` (0..100): saved, and the media playing now follows. */
export const setMediaVolume = (percent) => media.set(percent);
/** Make `el` (the media's <audio> or <video>) follow the media slider. Returns `el`. */
export const mediaSound = (el) => media.follow(el);

let testCtx = null;
/** A short two-note chime at the app sounds' level (the app slider's own "try it"). */
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
