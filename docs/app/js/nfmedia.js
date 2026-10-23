// Netflix's player, wrapped so the transcript player (pages/player.js) can drive it exactly like an
// <audio> or <video> element (currentTime, paused, play(), pause(), playbackRate, duration and the
// usual events), as ytmedia.js does for YouTube's.
//
// Netflix's video is copy-protected, so it never plays in Tamkeen's own page: it plays in Netflix's
// web player in a window of its own laid exactly over the stage (`mount`). The `bridge` reaches that
// window: on the computer, app/netflix_overlay.py through the main window's js_api (netflixBridge()
// in web/js/app.js). Another device could hand in its own bridge (a phone's native video window,
// like the reels' ReelSurface) with the same five calls:
//   open(id, lang, reload) -> {ok, reused, t}  show the title (or carry on with it; `reload`: afresh)
//   place({x, y, w, h, vw, vh, visible})   where the stage is (CSS pixels) and whether it may show
//   do(command, value)                     "play" | "pause" | "seek" (seconds) | "rate" | "continue"
//   state() -> {t, d, paused, ended, rate, id, page, video, error, prompt, subs, audio, info}
//   release()                              the player page is gone
// Netflix is asked where it is a few times a second; in between, the position is estimated from the
// clock, which keeps the word highlight smooth.

const POLL_MS = 250;        // how often Netflix is asked, while playing
const POLL_PAUSED_MS = 700; // and while paused
const MAX_AHEAD = 0.6;      // seconds the estimate may run ahead of Netflix's last answer
const SEEK_SETTLE_MS = 2500; // after a jump, trust the target until Netflix catches up (or this passes)
const REUSE_NEAR = 3;       // reopened mid-title: a first jump this close to where it is, is left out

/** Is anything (a box, a menu, a guided tour) shown over `rect`? Then the video must hide: it is a
 * window of its own and would be drawn over it. */
export function coveredBy(doc, rect) {
  const list = doc.querySelectorAll(".modal-back, [role='dialog'], #ctxmenu, .tour, .game-sheet-wrap, .lex-offer-back, #update-notice");
  for (const el of list) {
    if (el.hidden || el.closest("[hidden]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.left < rect.x + rect.w && r.right > rect.x && r.top < rect.y + rect.h && r.bottom > rect.y) return true;
  }
  return false;
}

/**
 * Report where `el` is on the page whenever that changes (its size, the window's size, scrolling,
 * a box opening over it), calling report({x, y, w, h, vw, vh, visible}). Returns a function that
 * stops watching. `win` is the window (a stand-in in tests).
 */
export function watchPlacement(el, report, win = window) {
  const doc = win.document;
  let last = "";
  let frame = 0;
  let stopped = false;
  const measure = () => {
    frame = 0;
    if (stopped) return;
    const r = el.getBoundingClientRect();
    const rect = { x: r.left, y: r.top, w: r.width, h: r.height, vw: win.innerWidth, vh: win.innerHeight };
    rect.visible = el.isConnected && r.width >= 2 && r.height >= 2 && !doc.hidden && !coveredBy(doc, rect);
    const key = JSON.stringify(rect);
    if (key === last) return;
    last = key;
    report(rect);
  };
  const soon = () => { if (!frame) frame = win.requestAnimationFrame(measure); };
  const resize = new win.ResizeObserver(soon);
  resize.observe(el);
  const changes = new win.MutationObserver(soon);
  changes.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
  win.addEventListener("resize", soon);
  win.addEventListener("scroll", soon, true);
  doc.addEventListener("visibilitychange", soon);
  const timer = win.setInterval(measure, 1000); // a safety net: anything the watchers above missed
  measure();
  /** Stop watching; `hide` false leaves the video where it is (the page is only being drawn afresh). */
  return ({ hide = true } = {}) => {
    stopped = true;
    resize.disconnect();
    changes.disconnect();
    win.removeEventListener("resize", soon);
    win.removeEventListener("scroll", soon, true);
    doc.removeEventListener("visibilitychange", soon);
    win.clearInterval(timer);
    if (frame) win.cancelAnimationFrame(frame);
    if (hide) report({ x: 0, y: 0, w: 0, h: 0, vw: win.innerWidth, vh: win.innerHeight, visible: false });
  };
}

/**
 * @param {HTMLElement} mount the stage box the video sits over
 * @param {string} id Netflix's number for the title
 * @param {object} opts `bridge` (see the top of this file), `lang` the language being learned,
 *   `duration` the length already known, `onState(state)` called with each answer from Netflix,
 *   `place` false to leave placement out (tests), `clock` / `timers` stand-ins for tests
 */
export function createNetflixMedia(mount, id, { bridge, lang = "", duration = 0, onState = null, place = true,
  clock = () => performance.now(), timers = globalThis } = {}) {
  const media = new EventTarget();
  const fire = (name) => media.dispatchEvent(new Event(name));
  let ready = false;
  let disposed = false;
  let paused = true;
  let ended = false;
  let rate = 1;
  let length = duration;
  let base = 0;            // last known position ...
  let baseAt = 0;          // ... and when it was known
  let lastGiven = 0;       // the last position handed out while playing
  let hold = null;         // {t, at}: a jump in progress
  let reusedAt = null;     // reopened mid-title: where it was
  let playAsked = 0;       // when play() / pause() was last asked (to ignore a stale answer)
  let pending = false;     // a question to Netflix is on its way
  let timer = 0;
  let stopPlacing = null;
  let lastError = "";

  const position = () => {
    if (hold) return hold.t;
    if (paused) return base;
    const guess = Math.min(base + ((clock() - baseAt) / 1000) * rate, base + MAX_AHEAD);
    // A fresh answer slightly behind the estimate must not make the highlight step backwards.
    lastGiven = guess < lastGiven && lastGiven - guess < 0.3 ? lastGiven : guess;
    return lastGiven;
  };

  const setPaused = (value) => {
    if (paused === value) return;
    paused = value;
    fire(value ? "pause" : "play");
  };

  function schedule() {
    if (disposed) return;
    timers.clearTimeout(timer);
    timer = timers.setTimeout(poll, paused ? POLL_PAUSED_MS : POLL_MS);
  }

  /** One answer from Netflix's player. */
  function take(s) {
    if (disposed || !s) return;
    if (onState) { try { onState(s); } catch (e) { console.error(e); } }
    if (s.error && s.error !== lastError) {
      lastError = s.error;
      media.errorMessage = s.error;
      fire("error");
    }
    if (!s.ready || s.loading) return;
    if (Number(s.d) > 0) length = Number(s.d);
    if (!ready) {
      ready = true;
      fire("loadedmetadata");
    }
    const t = Number(s.t) || 0;
    if (hold) {
      if (Math.abs(t - hold.t) < 1.5 || clock() - hold.at > SEEK_SETTLE_MS) hold = null;
    }
    if (!hold) {
      if (t !== base) { base = t; baseAt = clock(); }
    }
    rate = Number(s.rate) || rate;
    // Right after play() / pause() Netflix may still answer with the old state: wait for it.
    if (!(playAsked && clock() - playAsked < 1200)) {
      playAsked = 0;
      setPaused(!!s.paused);
    }
    if (s.ended && !ended) { ended = true; setPaused(true); fire("ended"); }
    else if (!s.ended) ended = false;
    fire("timeupdate");
  }

  function poll() {
    if (disposed) return;
    if (pending) { schedule(); return; }
    pending = true;
    Promise.resolve().then(() => bridge.state()).then(take, () => {}).then(() => { pending = false; schedule(); });
  }

  function send(command, value) {
    return Promise.resolve().then(() => bridge.do(command, value)).then((r) => {
      if (r && r.state && !disposed) take(r.state);
      return r;
    }, () => null);
  }

  function jump(t) {
    hold = { t, at: clock() };
    base = lastGiven = t;
    baseAt = clock();
    ended = false;
    send("seek", t);
    timers.setTimeout(() => { if (!disposed) fire("seeked"); }, 0);
  }

  Object.defineProperties(media, {
    currentTime: {
      get: () => position(),
      set: (value) => {
        const t = Math.max(0, Number(value) || 0);
        if (reusedAt !== null) {
          const was = reusedAt;
          reusedAt = null;
          if (Math.abs(t - was) < REUSE_NEAR) { timers.setTimeout(() => { if (!disposed) fire("seeked"); }, 0); return; }
        }
        jump(t);
      },
    },
    paused: { get: () => paused },
    ended: { get: () => ended },
    duration: { get: () => length },
    playbackRate: {
      get: () => rate,
      set: (r) => {
        const next = Number(r) || 1;
        base = position();
        baseAt = clock();
        rate = next;
        if (ready) send("rate", next);
      },
    },
    defaultPlaybackRate: { get: () => rate, set: () => {} },
    preload: { value: "auto", writable: true },
  });

  media.play = () => {
    if (!ready) return Promise.reject(new Error("Netflix is still loading"));
    playAsked = clock();
    base = position();
    baseAt = clock();
    setPaused(false);
    schedule();
    return send("play").then(() => undefined);
  };
  media.pause = () => {
    playAsked = ready ? clock() : 0;
    if (!hold) base = position();
    setPaused(true);
    if (ready) send("pause");
  };
  /** Netflix's "Are you still watching?": answer yes. */
  media.carryOn = () => send("continue");
  /** Load the title afresh in Netflix's player (after signing in to Netflix, or an error). */
  media.reload = () => {
    if (disposed) return Promise.resolve();
    ready = false;
    lastError = "";
    hold = null;
    reusedAt = null;
    return Promise.resolve().then(() => bridge.open(id, lang, true)).then(() => { if (!disposed) poll(); }, () => {});
  };
  /** Set before the player page is drawn afresh for the same title (its subtitles arrived): the
   * video stays on screen and carries on, instead of hiding for a moment. */
  media.keepShowing = false;
  media.dispose = () => {
    if (disposed) return;
    disposed = true;
    timers.clearTimeout(timer);
    if (stopPlacing) stopPlacing({ hide: !media.keepShowing });
    Promise.resolve().then(() => bridge.release()).catch(() => {});
  };
  /** Text describing a failure, set before the "error" event fires. */
  media.errorMessage = "";

  Promise.resolve().then(() => bridge.open(id, lang)).then((r) => {
    if (disposed) return;
    if (!r || !r.ok) {
      media.errorMessage = (r && r.error) || "Couldn't open Netflix's player.";
      fire("error");
      return;
    }
    if (r.reused && typeof r.t === "number") {
      reusedAt = r.t;
      base = lastGiven = r.t;
      baseAt = clock();
    }
    if (place && mount) stopPlacing = watchPlacement(mount, (rect) => { Promise.resolve().then(() => bridge.place(rect)).catch(() => {}); });
    poll();
  }).catch((e) => {
    if (disposed) return;
    media.errorMessage = (e && e.message) || "Couldn't open Netflix's player.";
    fire("error");
  });

  return media;
}
