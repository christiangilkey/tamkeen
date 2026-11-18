// Settings → Sound volume (web/js/appvolume.js): the app's own sounds follow one slider, the media the other.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const vol = await import("../../web/js/appvolume.js");

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const WEB = join(ROOT, "web", "js");
const read = (p) => readFileSync(p, "utf8");
function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "vendor") continue;
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}
const rel = (p) => p.slice(WEB.length + 1).replace(/\\/g, "/");

test("the slider's level: full by default, squared, kept, clamped", () => {
  assert.equal(vol.appVolumePercent(), 100);
  assert.equal(vol.appVolume(), 1);
  assert.equal(vol.levelOf(50), 0.25);
  assert.equal(vol.levelOf(0), 0);
  vol.setAppVolume(140);
  assert.equal(vol.appVolumePercent(), 100);
  vol.setAppVolume(-3);
  assert.equal(vol.appVolume(), 0);
  vol.setAppVolume(60);
  assert.equal(store.get("appSoundVolume"), "60");
  assert.equal(vol.appVolumePercent(), 60);
  assert.ok(Math.abs(vol.speechVolume() - 0.36) < 1e-9);
});

test("an app player and an AudioContext follow the slider, now and while playing", () => {
  vol.setAppVolume(100);
  const heard = {};
  const el = { volume: 1, addEventListener: (type, fn) => { heard[type] = fn; } };
  assert.equal(vol.appSound(el), el);
  vol.setAppVolume(50);
  assert.equal(el.volume, 0.25, "changed while it plays");
  el.volume = 1;
  heard.play();
  assert.equal(el.volume, 0.25, "set again when it starts playing");

  const destination = {};
  const gain = { gain: { value: -1 }, connect(to) { this.to = to; } };
  const ctx = { state: "running", destination, createGain: () => gain };
  const out = vol.appOut(ctx);
  assert.equal(out, gain);
  assert.equal(gain.to, destination);
  assert.equal(gain.gain.value, 0.25);
  assert.equal(vol.appOut(ctx), gain, "one gain per context");
  vol.setAppVolume(0);
  assert.equal(gain.gain.value, 0);
  vol.setAppVolume(100);
});

// The media players follow the media slider instead (YouTube, Netflix and reels have their own players).
const MEDIA = new Set(["pages/player.js", "components/transcripteditor.js"]);

test("every <audio> the app makes follows a slider: the media's the media one, the rest the app one", () => {
  const loose = [];
  for (const p of files(WEB)) {
    const name = rel(p);
    const src = read(p);
    for (const m of src.matchAll(/new Audio\(/g)) {
      const before = src.slice(Math.max(0, m.index - 11), m.index);
      if (MEDIA.has(name)) assert.ok(!before.endsWith("appSound("), `${name} plays media: not an app sound`);
      else if (!before.endsWith("appSound(")) loose.push(name);
    }
  }
  assert.deepEqual(loose, [], "wrap these in appSound() (appvolume.js), or add them to MEDIA if they play the media itself");
  assert.match(read(join(WEB, "pages/player.js")), /if \(!embed\) \{\s+mediaSound\(audio\);/, "the player's own audio and video");
  assert.match(read(join(WEB, "components/transcripteditor.js")), /const audio = mediaSound\(new Audio\(\)\)/);
  const dli = read(join(WEB, "components/dlipanel.js"));
  assert.match(dli, /mediaSound\(h\(`<audio controls/);
  assert.match(dli, /mediaSound\(h\(`<video controls/);
});

test("the two sliders are separate: moving one leaves the other alone", () => {
  vol.setAppVolume(100);
  vol.setMediaVolume(100);
  const a = { volume: 1, addEventListener() {} }, m = { volume: 1, addEventListener() {} };
  vol.appSound(a);
  vol.mediaSound(m);
  vol.setMediaVolume(50);
  assert.equal(m.volume, 0.25);
  assert.equal(a.volume, 1);
  assert.equal(store.get("mediaVolume"), "50");
  assert.equal(vol.mediaVolumePercent(), 50);
  vol.setAppVolume(0);
  assert.equal(a.volume, 0);
  assert.equal(m.volume, 0.25);
  vol.setAppVolume(100);
  vol.setMediaVolume(100);
});

test("the app's synthesised sounds go out through appOut, not straight to the speakers", () => {
  const straight = [];
  for (const p of files(WEB)) {
    const name = rel(p);
    if (name === "appvolume.js") continue;
    if (/\.connect\([A-Za-z]+\.destination\)/.test(read(p))) straight.push(name);
  }
  assert.deepEqual(straight, []);
});

test("the device's voice is given the level; the slider is in both Settings pages, the search and the phone build", () => {
  const dv = read(join(WEB, "devicevoice.js"));
  assert.match(dv, /u\.volume = speechVolume\(\)/);
  assert.match(dv, /volume: speechVolume\(\)/);
  assert.match(read(join(ROOT, "mobile/android/app/src/main/java/io/github/christiangilkey/arabicpodcaststudio/SpeechPlugin.java")), /KEY_PARAM_VOLUME/);
  assert.match(read(join(ROOT, "mobile/native-ios/ios/Sources/TamkeenNative/SpeechPlugin.swift")), /utterance\.volume = volume/);
  // On the Settings home, under the search, for every device (the owner, 2026-11-17), not in Look & feel.
  const ui = read(join(WEB, "components/settingsui.js"));
  assert.ok(ui.indexOf('id="set-find"') < ui.indexOf('id="sound-volume"'), "under the search");
  assert.ok(ui.indexOf('id="sound-volume"') < ui.indexOf('<nav class="card set-list"'), "above the sections");
  assert.ok(ui.includes("soundVolume(volume, { short: true })"));
  assert.ok(ui.includes("none.hidden = hits.length > 0 || forVolume"), "searching for it shows it, not \"Nothing found\"");
  for (const page of ["web/js/pages/settings.js", "mobile/src/js/pages/settings.js"]) {
    assert.doesNotMatch(read(join(ROOT, page)), /sound-volume/, page + ": no second copy in Look & feel");
  }
  const build = read(join(ROOT, "mobile/scripts/build-www.mjs"));
  assert.match(build, /"js\/appvolume\.js"/);
  assert.match(build, /"js\/components\/soundvolume\.js"/);
});
