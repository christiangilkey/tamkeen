// YouTube's official embedded player, wrapped so the transcript player can drive it exactly
// like an <audio> or <video> element (currentTime, paused, play(), pause(), playbackRate and
// the usual events). Ads and view counts work as normal because it IS YouTube's player.
//
// YouTube only reports the playing position a few times a second, so between reports the
// position is estimated from the clock; that keeps the word highlight smooth.

const POLL_MS = 150;        // how often YouTube is asked where it is
const MAX_AHEAD = 0.6;      // seconds the estimate may run ahead of YouTube's last report
const SEEK_SETTLE_MS = 2000; // after a jump, trust the target until YouTube catches up (or this passes)

let apiReady = null;
/** Load YouTube's IFrame Player API once. */
function loadApi() {
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) { resolve(window.YT); return; }
    const earlier = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (earlier) earlier(); resolve(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => { apiReady = null; reject(new Error("Couldn't load the YouTube player. Check your connection.")); };
    document.head.append(s);
  });
  return apiReady;
}

/** Why YouTube refused to play, in plain words (its error codes are numbers). */
function errorText(code) {
  if (code === 101 || code === 150 || code === 153) return "This video's owner doesn't allow it to play inside other apps.";
  if (code === 100) return "This video was removed or made private.";
  return "YouTube couldn't play this video.";
}

/**
 * @param {HTMLElement} mount element the player replaces
 * @param {string} videoId
 * @param {{start?: number, duration?: number}} opts where to begin, and the length already known
 */
export function createYouTubeMedia(mount, videoId, { start = 0, duration = 0 } = {}) {
  const media = new EventTarget();
  const fire = (name) => media.dispatchEvent(new Event(name));
  let player = null;
  let ready = false;
  let disposed = false;
  let state = -1;          // YouTube's: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
  let paused = true;
  let started = false;     // has it ever played?
  let rate = 1;
  let base = start;        // last known position ...
  let baseAt = 0;          // ... and when it was known (performance.now())
  let lastGiven = start;   // the last position handed out while playing
  let hold = null;         // {t, at}: a jump in progress
  let pendingStart = start > 0 ? start : null; // where the first play should begin
  let playAsked = 0;       // when play() was last called (to ignore a stale "paused" report)
  let timer = 0;

  const now = () => performance.now();
  const reported = () => { try { return player.getCurrentTime() || 0; } catch { return base; } };

  function position() {
    if (hold) return hold.t;
    if (state !== 1) return base;
    const guess = Math.min(base + ((now() - baseAt) / 1000) * rate, base + MAX_AHEAD);
    // A fresh report slightly behind the estimate must not make the highlight step backwards.
    lastGiven = guess < lastGiven && lastGiven - guess < 0.3 ? lastGiven : guess;
    return lastGiven;
  }

  function poll() {
    if (!ready || disposed) return;
    const t = reported();
    if (hold) {
      if (Math.abs(t - hold.t) < 1.5 || now() - hold.at > SEEK_SETTLE_MS) hold = null;
      else return;
    }
    if (t !== base) { base = t; baseAt = now(); }
    fire("timeupdate");
  }

  function setPaused(value) {
    if (paused === value) return;
    paused = value;
    fire(value ? "pause" : "play");
  }

  function onState(e) {
    if (disposed) return;
    state = e.data;
    if (state === 1) {
      // The first play may need to jump to where the user left off.
      if (!started && pendingStart !== null && Math.abs(reported() - pendingStart) > 2) {
        started = true;
        const t = pendingStart;
        pendingStart = null;
        jump(t);
      }
      started = true;
      pendingStart = null;
      base = hold ? hold.t : reported();
      baseAt = now();
      lastGiven = base;
      playAsked = 0;
      setPaused(false);
      captionsOff();
    } else if (state === 3) {
      playAsked = 0;
      if (started) setPaused(false);
    } else if (state === 2) {
      // Right after play() YouTube may still report the old paused state: ignore that one.
      if (playAsked && now() - playAsked < 1000) return;
      if (!hold) base = reported();
      setPaused(true);
    } else if (state === 0) {
      base = reported();
      setPaused(true);
      fire("ended");
    }
  }

  /** The app shows its own clickable captions; keep YouTube's own off so there aren't two sets. */
  function captionsOff() {
    try { player.unloadModule("captions"); player.unloadModule("cc"); } catch { /* not offered by this player */ }
  }

  function jump(t) {
    hold = { t, at: now() };
    base = lastGiven = t;
    baseAt = now();
    try { player.seekTo(t, true); } catch { /* player gone */ }
    setTimeout(() => { if (!disposed) fire("seeked"); }, 0);
  }

  Object.defineProperties(media, {
    currentTime: {
      get: () => position(),
      set: (t) => {
        t = Math.max(0, Number(t) || 0);
        if (!ready || !started) {
          // Jumping inside a video that hasn't started would start it: remember the place instead.
          pendingStart = t;
          base = lastGiven = t;
          setTimeout(() => { if (!disposed) fire("seeked"); }, 0);
          return;
        }
        jump(t);
      },
    },
    paused: { get: () => paused },
    duration: { get: () => { try { return (ready && player.getDuration()) || duration; } catch { return duration; } } },
    playbackRate: {
      get: () => rate,
      set: (r) => {
        rate = Number(r) || 1;
        base = position();
        baseAt = now();
        try { if (ready) player.setPlaybackRate(rate); } catch { /* player gone */ }
      },
    },
    defaultPlaybackRate: { get: () => rate, set: () => {} },
    preload: { value: "auto", writable: true },
  });

  media.play = () => {
    if (!ready) return Promise.reject(new Error("the YouTube player is still loading"));
    playAsked = now();
    try {
      if (!started && pendingStart !== null) {
        const t = pendingStart;
        pendingStart = null;
        started = true;
        jump(t); // from "not started", a jump also starts playback
      }
      player.playVideo();
    } catch (e) { return Promise.reject(e); }
    setPaused(false);
    return Promise.resolve();
  };
  media.pause = () => {
    playAsked = 0;
    try { if (ready) player.pauseVideo(); } catch { /* player gone */ }
    if (started) { if (!hold) base = position(); setPaused(true); }
  };
  media.dispose = () => {
    disposed = true;
    clearInterval(timer);
    try { if (player) player.destroy(); } catch { /* already gone */ }
  };
  /** Text describing a failure, set before the "error" event fires. */
  media.errorMessage = "";

  loadApi().then((YT) => {
    if (disposed) return;
    player = new YT.Player(mount, {
      videoId,
      width: "100%",
      height: "100%",
      playerVars: {
        cc_load_policy: 0,   // YouTube's own captions off (the app shows its own below the video)
        playsinline: 1,      // on phones, play in the page rather than jumping to full screen
        rel: 0,              // at the end, only suggest videos from the same channel
        start: Math.floor(start) || undefined,
        origin: location.origin,
      },
      events: {
        onReady: () => {
          if (disposed) return;
          ready = true;
          try { rate = player.getPlaybackRate() || 1; } catch { /* keep 1 */ }
          timer = setInterval(poll, POLL_MS);
          fire("loadedmetadata");
        },
        onStateChange: onState,
        onPlaybackRateChange: (e) => { base = position(); baseAt = now(); rate = e.data || rate; },
        onError: (e) => { media.errorMessage = errorText(e.data); fire("error"); },
      },
    });
  }).catch((e) => { media.errorMessage = e.message; fire("error"); });

  return media;
}
