// A video that is still loading says so (the owner, 2026-11-20: a YouTube video showed "a black screen for a while
// until it loads"). A spinner while it loads: from when it is opened, after play is pressed, while it jumps or
// buffers. Past SLOW_MS it becomes a short message and Try again instead of spinning for ever.
//
// YouTube allows nothing to be drawn over its player. So its spinner takes the video's place only while YouTube's
// player itself is loading (the player is hidden until then, and the spinner is under it, never in front: media.css);
// once the player is there, the waiting is said on the dark band under the video instead (YouTube's player shows its
// own spinner too). Your own videos (a <video>) get the spinner over the picture.
//
// Shared by the desktop app, the phone and the web app.

import { h } from "../app.js";
import { t } from "../i18n.js";

export const SLOW_MS = 20000; // still loading after this long: the message and Try again

/**
 * `media`: YouTube's (ytmedia.js: its `loading`, `ready`, "loadingchange" and `retry()`) or a <video>. `screen`: the
 * video's box. `band`: for YouTube, the element the waiting line goes after (under the video). Returns a function
 * that stops it.
 */
export function mediaWait(media, { screen, band = null, slowMs = SLOW_MS } = {}) {
  const yt = typeof media.retry === "function";
  const cover = h(`<div class="media-wait" role="status" hidden>
      <span class="spinner" aria-hidden="true"></span><span class="media-wait-text">Loading…</span>
      <p class="media-wait-slow" hidden></p><button type="button" class="media-wait-again" hidden>Try again</button>
    </div>`);
  screen.append(cover);
  const line = yt && band ? h(`<div class="media-wait-line" role="status" hidden>
      <span class="spinner" aria-hidden="true"></span><span class="media-wait-text">Loading…</span>
      <span class="media-wait-slow" hidden></span><button type="button" class="link media-wait-again" hidden>Try again</button>
    </div>`) : null;
  if (line) band.after(line);
  let slowTimer = 0;
  let slow = false;
  let was = false;
  let stopped = false;

  const loadingNow = () => {
    if (yt) return !!media.loading;
    // A <video>: nothing to show yet, or playing (or jumping) without enough to go on.
    if (media.error || !media.currentSrc) return false;
    return media.readyState < 2 || media.seeking || (!media.paused && media.readyState < 3);
  };

  function paint() {
    if (stopped) return;
    const on = loadingNow();
    if (on !== was) {
      was = on;
      clearTimeout(slowTimer);
      slow = false;
      if (on) slowTimer = setTimeout(() => { slow = true; paint(); }, slowMs);
    }
    // YouTube: in the video's place only until its player is there (hidden till then); after that, under it.
    const inScreen = on && (!yt || !media.ready);
    screen.classList.toggle("media-loading", yt && !media.ready && !media.errorMessage);
    for (const [el, shown] of [[cover, inScreen], [line, on && !inScreen]]) {
      if (!el) continue;
      el.hidden = !shown;
      el.classList.toggle("slow", shown && slow);
      el.querySelector(".spinner").hidden = shown && slow;
      el.querySelector(".media-wait-text").hidden = shown && slow;
      const msg = el.querySelector(".media-wait-slow");
      msg.hidden = !(shown && slow);
      msg.textContent = shown && slow ? t("The video is taking a long time to load. Check your connection.") : "";
      el.querySelector(".media-wait-again").hidden = !(shown && slow);
    }
  }

  function again() {
    clearTimeout(slowTimer);
    was = false; // (the wait starts over, with a fresh SLOW_MS)
    if (yt) { media.retry(); paint(); return; }
    // A <video>: load it again, back to where it was, playing if it was.
    const at = media.currentTime || 0;
    const play = !media.paused;
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
      "play", "pause", "error", "emptied", "stalled"];
  for (const e of events) media.addEventListener(e, paint);
  paint();
  return () => {
    stopped = true;
    clearTimeout(slowTimer);
    for (const e of events) media.removeEventListener(e, paint);
    cover.remove();
    if (line) line.remove();
    screen.classList.remove("media-loading");
  };
}
