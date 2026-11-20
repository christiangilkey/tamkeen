// A video still loading says so (the owner, 2026-11-20: a YouTube video showed "a black screen for a while until it
// loads"): ytmedia.js reports when it is loading and keeps a play pressed too early; components/mediawait.js shows
// the spinner, never in front of YouTube's player.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

/** YouTube's IFrame API, pretend: the test says when the player is ready and what state it is in. */
function fakeYouTube() {
  const made = [];
  class Player {
    constructor(where, opts) { this.where = where; this.opts = opts; this.calls = []; made.push(this); }
    playVideo() { this.calls.push("play"); }
    pauseVideo() { this.calls.push("pause"); }
    seekTo(t) { this.calls.push(`seek ${t}`); }
    getCurrentTime() { return 0; }
    getDuration() { return 60; }
    getPlaybackRate() { return 1; }
    setPlaybackRate() {}
    unloadModule() {}
    destroy() { this.calls.push("destroy"); }
    getIframe() { return null; }
    ready() { this.opts.events.onReady(); }
    state(n) { this.opts.events.onStateChange({ data: n }); }
  }
  globalThis.window = { YT: { Player } };
  globalThis.location = { origin: "http://localhost" };
  globalThis.document = { createElement: () => ({ id: "" }), getElementById: () => null };
  return made;
}

test("YouTube: loading until its player is ready, a play pressed before then is kept, buffering is loading (the owner, 2026-11-20)", async () => {
  const made = fakeYouTube();
  const { createYouTubeMedia } = await import("../../web/js/ytmedia.js");
  const parent = { append() {} };
  const media = createYouTubeMedia({ id: "yt-frame", parentNode: parent }, "abc", { start: 0, duration: 60 });
  const changes = [];
  media.addEventListener("loadingchange", () => changes.push(media.loading));
  assert.equal(media.loading, true, "from the start: the player itself is loading");
  assert.equal(media.ready, false);
  await new Promise((r) => setTimeout(r, 0));
  const p = made[0];
  await media.play(); // (it used to fail: "the YouTube player is still loading")
  assert.deepEqual(p.calls, [], "kept until the player can play");
  p.ready();
  assert.equal(media.ready, true);
  assert.deepEqual(p.calls, ["play"], "played as soon as it was ready");
  assert.equal(media.loading, true, "waiting for YouTube to say it is playing");
  p.state(1);
  assert.equal(media.loading, false, "playing");
  p.state(3);
  assert.equal(media.loading, true, "buffering");
  p.state(1);
  media.pause();
  p.state(2);
  assert.equal(media.loading, false);
  p.state(5);
  assert.equal(media.loading, false, "cued: ready to play");
  assert.deepEqual(changes, [false, true, false, true, false]);
  // Try again: a fresh player in the same place.
  media.retry();
  assert.equal(media.loading, true);
  assert.equal(media.ready, false);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(made.length, 2, "a new player");
  assert.ok(p.calls.includes("destroy"), "the old one put away");
  media.dispose();
  delete globalThis.window; delete globalThis.document; delete globalThis.location;
});

test("the spinner: in the video's place while YouTube's player loads (hidden under it), then on the band under the video; Try again after 20 s", () => {
  const wait = src("../../web/js/components/mediawait.js");
  assert.match(wait, /export const SLOW_MS = 20000;/);
  assert.match(wait, /const inScreen = on && \(!yt \|\| !media\.ready\);/, "YouTube: in its place only until its player is there");
  assert.match(wait, /screen\.classList\.toggle\("media-loading", yt && !media\.ready && !media\.errorMessage\);/);
  assert.match(wait, /t\("The video is taking a long time to load\. Check your connection\."\)/);
  assert.match(wait, /if \(yt\) \{ media\.retry\(\); paint\(\); return; \}/);
  assert.match(wait, /media\.load\(\);/, "a video of your own is loaded again, from where it was");
  const css = src("../../web/css/media.css");
  // Nothing in front of YouTube's player: the spinner is under it, and the player is hidden only until it has loaded.
  assert.match(css, /\.player\.yt \.media-wait \{ z-index: 0; background: #000; \}/);
  assert.match(css, /\.player\.yt \.screen iframe \{ position: relative; z-index: 1; \}/);
  assert.match(css, /\.player\.yt \.screen\.media-loading iframe \{ visibility: hidden; \}/);
  assert.match(css, /\.media-wait \{[^}]*pointer-events: none;/, "a tap on the video still plays or pauses it");
  const player = src("../../web/js/pages/player.js");
  assert.match(player, /const stopWait = yt \? mediaWait\(audio, \{ screen: \$\("#screen"\), band: \$\("#captions"\) \}\)\s*: vid && !embed \? mediaWait\(audio, \{ screen: \$\("#screen"\) \}\) : \(\) => \{\};/);
  assert.match(player, /disposed = true;\s*stopWait\(\);/);
  assert.match(player, /if \(text && !action\) frame\.prepend\(h\(`<span class="spinner nf-spin"/, "Netflix: a spinner beside Opening Netflix…");
});
