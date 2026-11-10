// Run with: node --test tests/js/
// A YouTube video's dubbed soundtrack in the language being learned, chosen inside YouTube's embedded player
// (web/js/yt-audio-frame.js), and the places that put that script there and show what it did.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const SOURCE = read("web/js/yt-audio-frame.js");

// A track as YouTube's player hands it out: what it is sits under a name that changes with each release.
const track = (id, name, { isDefault = false, isAutoDubbed = false, key = "Rb" } = {}) =>
  ({ id: `251;${id}`, captionTracks: [], [key]: { id, name, isDefault, isAutoDubbed } });

/** Run the script in a stand-in for YouTube's embed page. `player` is #movie_player's stand-in. */
function frame(address, player) {
  const told = [];
  let tick = null;
  const url = new URL(address);
  const win = {
    location: { hostname: url.hostname, pathname: url.pathname, search: url.search },
    document: { getElementById: (id) => (id === "movie_player" ? player : null) },
    parent: { postMessage: (msg, target) => { assert.equal(target, "*"); told.push(JSON.parse(JSON.stringify(msg.tamkeenYtAudio))); } },
    setInterval: (fn) => { tick = fn; return 1; },
    URLSearchParams,
  };
  win.window = win;
  vm.runInNewContext(SOURCE, win);
  return { told, run: (n = 1) => { for (let i = 0; i < n; i++) tick && tick(); }, installed: () => !!tick };
}

/** A player playing `video` with these tracks; setAudioTrack moves to the track asked for. */
function player({ tracks, current, state = 1, video = "vid00000001", refuse = false }) {
  const p = {
    state, now: current, asked: [],
    getPlayerState: () => p.state,
    getVideoData: () => ({ video_id: video }),
    getAvailableAudioTracks: () => tracks,
    getAudioTrack: () => p.now,
    setAudioTrack: (t) => { p.asked.push(t); if (refuse) throw new TypeError("not now"); p.now = t; },
  };
  return p;
}

const EMBED = "https://www.youtube.com/embed/vid00000001?enablejsapi=1&tamkeen_audio=";
const english = track("en-US.4", "English (US) original", { isDefault: true });

test("an English video with an Arabic dub switches to it, once it plays, and says so", () => {
  const ar = track("ar.3", "Arabic");
  const p = player({ tracks: [ar, english, track("es.3", "Spanish")], current: english, state: -1 });
  const f = frame(EMBED + "ar", p);
  f.run(3);
  assert.equal(p.asked.length, 0); // not before the video runs (YouTube's player throws then)
  p.state = 1;
  f.run();
  assert.deepEqual(p.asked, [ar]);
  assert.deepEqual(f.told, []); // said once the player is on it
  f.run();
  assert.deepEqual(f.told, [{ video: "vid00000001", outcome: "switched", name: "Arabic" }]);
  p.now = english; // the user picks the original in YouTube's ⚙ menu: left alone
  f.run(5);
  assert.equal(p.asked.length, 1);
  assert.equal(f.told.length, 1);
});

test("a dub made by people is chosen before YouTube's machine dub, whatever the inner name", () => {
  const auto = track("ar", "Arabic (auto-dubbed)", { isAutoDubbed: true, key: "Ib" });
  const people = track("ar.3", "Arabic", { key: "Ib" });
  const p = player({ tracks: [english, auto, people], current: english });
  frame(EMBED + "ar", p).run();
  assert.deepEqual(p.asked, [people]);
});

test("YouTube's own codes are matched to Tamkeen's (zh-Hans, fil)", () => {
  for (const [lang, id] of [["zh", "zh-Hans.3"], ["tl", "fil.3"], ["pt", "pt-BR.3"]]) {
    const dub = track(id, "dub");
    const p = player({ tracks: [english, dub], current: english });
    frame(EMBED + lang, p).run();
    assert.deepEqual(p.asked, [dub], lang);
  }
});

test("nothing to switch: already in the language, no dub in it, or one soundtrack", () => {
  const arabicVideo = track("ar.4", "Arabic original", { isDefault: true });
  let f = frame(EMBED + "ar", player({ tracks: [arabicVideo, track("en.3", "English")], current: arabicVideo }));
  f.run();
  assert.deepEqual(f.told, [{ video: "vid00000001", outcome: "already", name: "Arabic original" }]);

  const p = player({ tracks: [english, track("fr.3", "French")], current: english });
  f = frame(EMBED + "ar", p);
  f.run(3);
  assert.deepEqual(f.told, [{ video: "vid00000001", outcome: "none", name: "" }]);
  assert.equal(p.asked.length, 0);

  f = frame(EMBED + "ar", player({ tracks: [], current: null }));
  f.run(7);
  assert.equal(f.told.length, 0); // gives YouTube a few seconds to list them
  f.run();
  assert.deepEqual(f.told, [{ video: "vid00000001", outcome: "none", name: "" }]);
});

test("a switch YouTube keeps refusing is given up and reported", () => {
  const p = player({ tracks: [english, track("ar.3", "Arabic")], current: english, refuse: true });
  const f = frame(EMBED + "ar", p);
  f.run(10);
  assert.ok(p.asked.length >= 2 && p.asked.length <= 4);
  assert.deepEqual(f.told, [{ video: "vid00000001", outcome: "failed", name: "" }]);
});

test("it stays out of every other page and frame", () => {
  const p = player({ tracks: [english, track("ar.3", "Arabic")], current: english });
  for (const address of [
    "https://www.youtube.com/watch?v=vid00000001&tamkeen_audio=ar", // YouTube's own page
    "https://www.youtube.com/embed/vid00000001?enablejsapi=1",       // another site's player
    "https://www.youtube.com/embed/vid00000001?tamkeen_audio=<b>",   // not a language
    "https://evil.example/embed/x?tamkeen_audio=ar",
    "https://youtube.com.evil.example/embed/x?tamkeen_audio=ar",
  ]) {
    const f = frame(address, p);
    assert.equal(f.installed(), false, address);
  }
  assert.equal(frame("https://www.youtube-nocookie.com/embed/x?tamkeen_audio=ar", p).installed(), true);
});

test("the player asks for it, listens only to YouTube's frame, and shows what happened", () => {
  const media = read("web/js/ytmedia.js");
  assert.match(media, /tamkeen_audio: audio \|\| undefined/);
  assert.match(media, /e\.source !== frame\.contentWindow/);
  assert.match(media, /said\.video !== videoId/);
  const page = read("web/js/pages/player.js");
  assert.match(page, /audio: study \}\)/);
  assert.match(page, /addEventListener\("audiotrack"/);
  assert.match(page, /Now playing this video's \$\{studyName\} audio track/);
  assert.match(page, /window\.TAMKEEN_WEB === true\) \{ showWay\(\)/); // the web app can't switch: the way to it
});

test("each app puts the script in YouTube's frame", () => {
  const desktop = read("app/desktop.py");
  assert.match(desktop, /AddScriptToExecuteOnDocumentCreatedAsync\(source\)/);    // Windows (WebView2)
  assert.match(desktop, /initWithSource_injectionTime_forMainFrameOnly_/);       // Mac
  assert.match(desktop, /UserContentInjectedFrames\.ALL_FRAMES/);                // Linux
  assert.match(desktop, /add_youtube_audio_script\(window\)/);
  const android = read("mobile/android/app/src/main/java/io/github/christiangilkey/arabicpodcaststudio/YouTubeAudio.java");
  assert.match(android, /addDocumentStartJavaScript\(view, .*ORIGINS\)/);
  assert.match(android, /"public\/js\/yt-audio-frame\.js"/);
  assert.match(read("mobile/android/app/src/main/java/io/github/christiangilkey/arabicpodcaststudio/MainActivity.java"),
    /YouTubeAudio\.install\(/);
  assert.match(read("mobile/android/app/build.gradle"), /androidx\.webkit:webkit/);
  const ios = read("mobile/native-ios/ios/Sources/TamkeenNative/YouTubeAudioPlugin.swift");
  assert.match(ios, /forMainFrameOnly: false/);
  assert.match(ios, /forResource: "yt-audio-frame", withExtension: "js", subdirectory: "public\/js"/);
  assert.match(read("mobile/scripts/build-www.mjs"), /"js\/yt-audio-frame\.js"/); // the phones get the file
});
