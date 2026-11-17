// Settings → Sound volume (web/js/appvolume.js): the app's own sounds follow the slider, the media never does.
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

// The media being played keeps its own volume: these players never pass through appSound.
const MEDIA = new Set(["pages/player.js", "components/transcripteditor.js"]);

test("every <audio> the app makes for its own sounds follows the slider; the media players don't", () => {
  const loose = [];
  for (const p of files(WEB)) {
    const name = rel(p);
    const src = read(p);
    for (const m of src.matchAll(/new Audio\(/g)) {
      const before = src.slice(Math.max(0, m.index - 9), m.index);
      const wrapped = before.endsWith("appSound(");
      if (MEDIA.has(name)) assert.ok(!wrapped, `${name} plays media: it keeps its own volume`);
      else if (!wrapped) loose.push(name);
    }
  }
  assert.deepEqual(loose, [], "wrap these in appSound() (appvolume.js), or add them to MEDIA if they play the media itself");
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
  for (const page of ["web/js/pages/settings.js", "mobile/src/js/pages/settings.js"]) {
    const src = read(join(ROOT, page));
    assert.match(src, /data-find="volume"/, page);
    assert.match(src, /soundVolume\(\$\("#sound-volume"\)\)/, page);
  }
  assert.match(read(join(WEB, "components/settingsui.js")), /id: "volume", label: "Sound volume"/);
  const build = read(join(ROOT, "mobile/scripts/build-www.mjs"));
  assert.match(build, /"js\/appvolume\.js"/);
  assert.match(build, /"js\/components\/soundvolume\.js"/);
});
