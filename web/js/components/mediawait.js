// A video or audio that is still loading says so (the owner, 2026-11-20: a YouTube video showed "a black screen for a
// while until it loads"; a podcast said "Playback failed" while its audio was still on its way). A spinner while it
// loads: from when it is opened, after play is pressed, while it jumps or buffers. Past SLOW_MS it becomes a short
// message and Try again instead of spinning for ever. A load that really fails says so, with Try again; one that
// was only interrupted on its way (MediaError ABORTED) is not a failure and isn't shown.
//
// YouTube allows nothing to be drawn over its player. So its spinner takes the video's place only while YouTube's
// player itself is loading (the player is hidden until then, and the spinner is under it, never in front: media.css);
// once the player is there, the waiting is said on the dark band under the video instead (YouTube's player shows its
// own spinner too). Your own videos (a <video>) get the spinner over the picture; audio (podcasts, audiobooks, your
// own audio), which has no picture, gets the line beside the time bar.
//
// Shared by the desktop app, the phone and the web app.

import { h } from "../app.js";
import { t } from "../i18n.js";

export const SLOW_MS = 20000; // still loading after this long: the message and Try again

const ABORTED = 1; // MediaError.MEDIA_ERR_ABORTED: the load was interrupted (a new one started, or it was stopped)

/**
 * `media`: YouTube's (ytmedia.js: its `loading`, `ready`, "loadingchange" and `retry()`), a <video> or an <audio>.
 * `screen`: the video's box (the spinner goes over it). `band`: where the line goes after (YouTube: under the video;
 * audio: the time bar). `wanted()`: play was pressed and is still wanted (a <video> or <audio> whose play() was turned
 * down while loading: player.js plays it once it can). `errorText`: what a load that really failed says. Returns a
 * function that stops it.
 */
export function mediaWait(media, { screen = null, band = null, wanted = () => false, errorText = "", slowMs = SLOW_MS } = {}) {
  const yt = typeof media.retry === "function";
  const cover = screen ? h(`<div class="media-wait" role="status" hidden>
      <span class="spinner" aria-hidden="true"></span><span class="media-wait-text">Loading…</span>
      <p class="media-wait-slow" hidden></p><button type="button" class="media-wait-again" hidden>Try again</button>
    </div>`) : null;
  if (cover) screen.append(cover);
  const line = band && (yt || !screen) ? h(`<div class="media-wait-line" role="status" hidden>
      <span class="spinner" aria-hidden="true"></span><span class="media-wait-text">Loading…</span>
      <span class="media-wait-slow" hidden></span><button type="button" class="link media-wait-again" hidden>Try again</button>
    </div>`) : null;
  if (line) band.after(line);
  let slowTimer = 0;
  let slow = false;
  let was = false;
  let stopped = false;

  /** A load that really failed (not one that was only interrupted). */
  const failed = () => !yt && !!media.error && media.error.code !== ABORTED;
  const loadingNow = () => {
    if (yt) return !!media.loading;
    if (failed() || !media.currentSrc) return false;
    // Jumping; wanting to play without enough to go on; or nothing known about it yet while it is being fetched.
    // (A paused one that has its length and stops there is not "loading": a phone may load no more until play.)
    return media.seeking || ((!media.paused || wanted()) && media.readyState < 3)
      || (media.readyState < 1 && media.networkState === 2);
  };

  function paint() {
    if (stopped) return;
    const bad = failed();
    const on = !bad && loadingNow();
    if (on !== was) {
      was = on;
      clearTimeout(slowTimer);
      slow = false;
      if (on) slowTimer = setTimeout(() => { slow = true; paint(); }, slowMs);
    }
    // YouTube: in the video's place only until its player is there (hidden till then); after that, under it.
    const inScreen = (on || bad) && !!cover && (!yt || !media.ready);
    if (screen) screen.classList.toggle("media-loading", yt && !media.ready && !media.errorMessage);
    const say = bad ? errorText
      : !slow ? "" : yt || screen ? t("The video is taking a long time to load. Check your connection.")
      : t("The audio is taking a long time to load. Check your connection.");
    const sayIt = bad || slow;
    for (const [el, shown] of [[cover, inScreen], [line, (on || bad) && !inScreen]]) {
      if (!el) continue;
      el.hidden = !shown;
      el.classList.toggle("slow", shown && sayIt);
      el.classList.toggle("failed", shown && bad);
      el.querySelector(".spinner").hidden = shown && sayIt;
      el.querySelector(".media-wait-text").hidden = shown && sayIt;
      const msg = el.querySelector(".media-wait-slow");
      msg.hidden = !(shown && sayIt);
      msg.textContent = shown && sayIt ? say : "";
      el.querySelector(".media-wait-again").hidden = !(shown && sayIt);
    }
  }

  function again() {
    clearTimeout(slowTimer);
    was = false; // (the wait starts over, with a fresh SLOW_MS)
    if (yt) { media.retry(); paint(); return; }
    // A <video> or <audio>: load it again, back to where it was, playing if it was (or play was pressed).
    const at = media.currentTime || 0;
    const play = !media.paused || wanted();
    media.addEventListener("loadedmetadata", () => {
      try { media.currentTime = at; } catch { /* not seekable yet */ }
      if (play) media.play().catch(() => {});
    }, { once: true });
    media.load();
    paint();
  }
  for (const b of [cover, line]) if (b) b.querySelector(".media-wait-again").onclick = again;

  const events = yt ? ["loadingchange", "loadedmetadata", "error", "play", "pause"]
    : ["loadstart", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "playing", "waiting", "seeking", "seeked",
      "play", "pause", "error", "emptied", "stalled", "suspend", "abort"];
  for (const e of events) media.addEventListener(e, paint);
  paint();
  return Object.assign(() => {
    stopped = true;
    clearTimeout(slowTimer);
    for (const e of events) media.removeEventListener(e, paint);
    if (cover) cover.remove();
    if (line) line.remove();
    if (screen) screen.classList.remove("media-loading");
  }, { paint });
}
