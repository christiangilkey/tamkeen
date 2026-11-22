// The YouTube list, scrolled like YouTube (prototype `library_feed`; the owner, 2026-11-21: scrolling the YouTube
// videos should "feel and look more like actually scrolling YouTube … thumbnails turns into a playing video").
// The card in the middle of the screen plays a silent preview in YouTube's own embedded player, the way YouTube's
// home feed does; scrolled away, it turns back into its picture.
//
// YouTube's rules for its embedded player (Required Minimum Functionality, read 2026-11-21) are kept:
//   - a player starts by itself only once it is in view: here, all of it (YouTube asks for more than half);
//   - only one player on the screen plays by itself: the last one is taken away before the next one starts;
//   - at least 200 × 200 (the picture's min-height in app.css);
//   - nothing in front of it, ever: the moment anything covers part of it (the bar that stays at the top, the +
//     button, a popup), it stops. That is checked by asking the page what is at points across it (`clear`);
//   - it is YouTube's player as it is: its controls (the learner can turn the sound on there), its ads; nothing is
//     downloaded or kept; a page that isn't on screen (another tab, the app in the background) plays nothing.
// Not on mobile data, or when the device asks to save data (navigator.connection), like YouTube's "Wi-Fi only".
// A video that won't play inside other apps (or a phone that won't start it by itself) keeps its picture.

import { loadApi } from "./ytmedia.js";

export const DWELL_MS = 600;     // held in the middle this long before it starts (a quick fling past plays nothing)
export const GIVE_UP_MS = 7000;  // not playing by then: back to the picture, and that video isn't tried again
const CHECK_MS = 400;            // looked at again this often too (a popup can open without any scrolling)

/** "12:29", "1:08:10": a video's length as YouTube writes it on the picture. */
export function clock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const two = (n) => String(n).padStart(2, "0");
  return hh ? `${hh}:${two(mm)}:${two(ss)}` : `${mm}:${two(ss)}`;
}

/** Where a preview starts: where the learner got to (progress.js), unless that is the very start or nearly the end. */
export function startAt(p) {
  const pos = Number(p && p.pos) || 0, dur = Number(p && p.dur) || 0;
  return pos > 10 && (!dur || pos < dur - 30) ? Math.floor(pos) : 0;
}

/** The one to play: of the pictures wholly clear (`clear[i]`), the one whose middle is nearest the screen's middle.
 *  `rects`: their places on the screen; `height`: the screen's. -1 when none is. */
export function pickCard(rects, clearOnes, height) {
  let best = -1, bestGap = Infinity;
  rects.forEach((r, i) => {
    if (!clearOnes[i]) return;
    const gap = Math.abs((r.top + r.bottom) / 2 - height / 2);
    if (gap < bestGap) { best = i; bestGap = gap; }
  });
  return best;
}

/** Whether previews may play on this connection. */
export function previewsAllowed(nav = globalThis.navigator) {
  const c = nav && nav.connection;
  return !(c && (c.saveData || c.type === "cellular"));
}

/** Whether all of `box` is on the screen with nothing in front of it. */
function clear(box) {
  const r = box.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return false;
  for (const fx of [0.02, 0.35, 0.65, 0.98]) {
    for (const fy of [0.02, 0.5, 0.98]) {
      const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      if (!el || !box.contains(el)) return false;
    }
  }
  return true;
}

/**
 * Previews in `list`, whose cards' pictures are `.yt-pic` elements carrying `data-video` (the YouTube id) and
 * `data-start` (where to begin). Returns the function that stops them all (call it when the page goes).
 */
export function scrollPreviews(list) {
  let active = null;   // {box, live, player, giveUp}
  let pending = null;  // {box, timer}
  let frame = 0;
  const refused = new WeakSet();

  function stop() {
    if (pending) { clearTimeout(pending.timer); pending = null; }
    if (!active) return;
    const { box, live, player, giveUp } = active;
    active = null;
    clearTimeout(giveUp);
    try { player && player.destroy(); } catch { /* already gone */ }
    live.remove();
    box.classList.remove("live");
  }

  function start(box) {
    stop();
    const live = document.createElement("div");
    live.className = "yt-live";
    const mount = document.createElement("div");
    live.append(mount);
    box.append(live);
    const me = { box, live, player: null, giveUp: 0 };
    active = me;
    const fail = () => { refused.add(box); if (active === me) stop(); };
    me.giveUp = setTimeout(() => { if (!box.classList.contains("live")) fail(); }, GIVE_UP_MS);
    loadApi().then((YT) => {
      if (active !== me) return;
      me.player = new YT.Player(mount, {
        videoId: box.dataset.video,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          mute: 1,          // silent, like YouTube's own feed; YouTube's controls turn the sound on
          playsinline: 1,   // on phones, in the card rather than full screen
          rel: 0,
          cc_load_policy: 0,
          start: Number(box.dataset.start) || undefined,
          origin: location.origin,
        },
        events: {
          onReady: (e) => { if (active === me) { try { e.target.mute(); e.target.playVideo(); } catch { fail(); } } },
          onStateChange: (e) => {
            if (active !== me) return;
            if (e.data === 1) box.classList.add("live");   // playing: the picture gives way to it
            if (e.data === 0) stop();                       // the end: back to the picture
          },
          onError: fail,
        },
      });
    }).catch(fail);
  }

  function check() {
    frame = 0;
    if (!list.isConnected || document.hidden || !previewsAllowed()) { stop(); return; }
    if (active && !clear(active.box)) stop();
    const boxes = [...list.querySelectorAll(".yt-pic[data-video]")].filter((b) => !refused.has(b));
    const rects = boxes.map((b) => b.getBoundingClientRect());
    // Only those on the screen are asked what's in front of them.
    const clearOnes = boxes.map((b, i) => rects[i].bottom > 0 && rects[i].top < innerHeight && clear(b));
    const best = boxes[pickCard(rects, clearOnes, innerHeight)] || null;
    if (!best) { if (pending) { clearTimeout(pending.timer); pending = null; } return; }
    if (active && active.box === best) return;
    if (pending && pending.box === best) return;
    if (pending) clearTimeout(pending.timer);
    pending = { box: best, timer: setTimeout(() => { pending = null; if (clear(best)) start(best); }, DWELL_MS) };
  }
  const soon = () => { if (!frame) frame = requestAnimationFrame(check); };

  document.addEventListener("scroll", soon, { capture: true, passive: true });
  addEventListener("resize", soon);
  document.addEventListener("visibilitychange", soon);
  const tick = setInterval(check, CHECK_MS);
  soon();
  return () => {
    stop();
    clearInterval(tick);
    if (frame) cancelAnimationFrame(frame);
    document.removeEventListener("scroll", soon, { capture: true });
    removeEventListener("resize", soon);
    document.removeEventListener("visibilitychange", soon);
  };
}
